import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assessProviderConversion,
  assertOfferVersion,
  assertProviderReversalEvidence,
  assertRewardQuoteV2,
  createRewardQuoteV2,
  planProviderReversal,
  serializeTokenSubunits,
  type FxSnapshotV1,
  type OfferVersionV1,
  type ProviderConversionEvidenceV1,
  type ProviderReversalEvidenceV1,
} from "../src/index.js";

const fx: FxSnapshotV1 = {
  schemaVersion: "1",
  snapshotId: "fx:usd-gbp:2026-08",
  sourceCurrency: "USD",
  quoteCurrency: "GBP",
  gbpMinorUnitsNumerator: "80",
  sourceMinorUnitsDenominator: "100",
  capturedAt: "2026-08-09T09:00:00.000Z",
};

function quote(payout = "100") {
  return createRewardQuoteV2({
    quoteId: "quote:offer:1",
    provider: "adgem",
    offerVersionId: "offer:version:1",
    goalId: "goal:level:5",
    providerPayoutMinorUnits: payout,
    expectedFeeGbpMinorUnits: "0",
    chargebackHaircutBasisPoints: "0",
    fxSnapshot: fx,
    lockedAt: "2026-08-09T10:00:00.000Z",
    expiresAt: "2026-08-09T10:15:00.000Z",
  });
}

function conversion(
  payout = "100",
): ProviderConversionEvidenceV1 {
  return {
    schemaVersion: "1",
    provider: "adgem",
    providerEventId: "provider:event:conversion:1",
    offerVersionId: "offer:version:1",
    goalId: "goal:level:5",
    providerPayoutMinorUnits: payout,
    providerCurrency: "USD",
    signatureScheme: "hmac-sha256",
    payloadFingerprint: `hmac-sha256:${"a".repeat(64)}`,
    providerOccurredAt: "2026-08-09T10:05:00.000Z",
    receivedAt: "2026-08-09T10:05:01.000Z",
    signatureVerifiedAt: "2026-08-09T10:05:01.000Z",
  };
}

describe("secure offerwall contracts", () => {
  it("locks a whole-Token reward while retaining at least twenty percent", () => {
    const result = quote();
    expect(result).toMatchObject({
      provider: "adgem",
      grossGbpMinorUnits: "80",
      eligibleNetGbpMinorUnits: "80",
      tokenSubunits: "6000",
      nominalTokenValueGbpMinorUnits: "60",
      retainedMarginGbpMinorUnits: "20",
      retainedMarginBasisPoints: "2500",
    });
    expect(() => assertRewardQuoteV2(result)).not.toThrow();
  });

  it("excludes a goal that cannot fund one Token at the retained margin", () => {
    expect(() => quote("15")).toThrowError(
      expect.objectContaining({ code: "INVALID_AMOUNT" }),
    );
  });

  it("preserves the promised reward and disables a payout-mismatched offer", () => {
    expect(assessProviderConversion(quote(), conversion("90"))).toEqual({
      schemaVersion: "1",
      creditTokenSubunits: "6000",
      reserveLiabilityTokenSubunits: "6000",
      disableOffer: true,
      incidentCode: "PROVIDER_PAYOUT_BELOW_LOCKED_QUOTE",
    });
  });

  it("never creates child debt or revokes an entitlement on reversal", () => {
    expect(
      planProviderReversal(
        serializeTokenSubunits(6_000n),
        serializeTokenSubunits(2_000n),
      ),
    ).toEqual({
      schemaVersion: "1",
      recoverableTokenSubunits: "2000",
      reserveAbsorptionTokenSubunits: "4000",
      suspendAdultEarning: true,
      revokeChildEntitlement: false,
      createChildDebt: false,
    });
  });

  it("requires a UK two-person accessibility-approved CPE offer", () => {
    const offer: OfferVersionV1 = {
      schemaVersion: "1",
      provider: "ayet",
      offerId: "offer:game:1",
      offerVersionId: "offer:game:1:version:1",
      title: "Accessible puzzle adventure",
      summary: "Complete the listed game milestones without a purchase.",
      category: "game",
      interactionType: "cpe",
      country: "GB",
      destinationUrl: "https://offers.example.test/start",
      supportUrl: "https://offers.example.test/support",
      expiresAt: "2026-08-30T00:00:00.000Z",
      accessibilityStatus: "approved",
      approvalState: "approved",
      reviewerAccountIds: ["account:reviewer:1", "account:reviewer:2"],
      reviewedAt: "2026-08-09T09:00:00.000Z",
      goals: [
        {
          schemaVersion: "1",
          goalId: "goal:level:5",
          requirement: "Reach level 5.",
          providerPayoutMinorUnits: "100",
          providerCurrency: "USD",
          completionWindowDays: 14,
          purchaseRequired: false,
          personalDataSubmissionRequired: false,
        },
      ],
    };
    expect(() => assertOfferVersion(offer)).not.toThrow();
    expect(() =>
      assertOfferVersion({
        ...offer,
        reviewerAccountIds: ["account:reviewer:1", "account:reviewer:1"],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("accepts only distinct, signed reversal evidence", () => {
    const evidence: ProviderReversalEvidenceV1 = {
      schemaVersion: "1",
      provider: "ayet",
      providerEventId: "provider:event:reversal:1",
      originalProviderEventId: "provider:event:conversion:1",
      offerVersionId: "offer:version:1",
      goalId: "goal:level:5",
      signatureScheme: "hmac-sha256",
      payloadFingerprint: `hmac-sha256:${"b".repeat(64)}`,
      reasonCode: "provider:chargeback",
      providerOccurredAt: "2026-08-10T10:00:00.000Z",
      receivedAt: "2026-08-10T10:00:01.000Z",
      signatureVerifiedAt: "2026-08-10T10:00:01.000Z",
    };
    expect(() => assertProviderReversalEvidence(evidence)).not.toThrow();
    expect(() =>
      assertProviderReversalEvidence({
        ...evidence,
        originalProviderEventId: evidence.providerEventId,
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
  });

  it("keeps the retained-margin invariant under bounded payout and fee inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 13, max: 1_000_000 }),
        fc.integer({ min: 0, max: 4_000 }),
        (payout, haircut) => {
          try {
            const result = createRewardQuoteV2({
              quoteId: "quote:property:1",
              provider: "ayet",
              offerVersionId: "offer:property:1",
              goalId: "goal:property:1",
              providerPayoutMinorUnits: payout.toString(10),
              expectedFeeGbpMinorUnits: "0",
              chargebackHaircutBasisPoints: haircut.toString(10),
              fxSnapshot: {
                ...fx,
                gbpMinorUnitsNumerator: "100",
              },
              lockedAt: "2026-08-09T10:00:00.000Z",
              expiresAt: "2026-08-09T10:15:00.000Z",
            });
            expect(
              BigInt(result.nominalTokenValueGbpMinorUnits) * 10_000n,
            ).toBeLessThanOrEqual(
              BigInt(result.eligibleNetGbpMinorUnits) * 8_000n,
            );
          } catch (error) {
            expect(error).toEqual(
              expect.objectContaining({ code: "INVALID_AMOUNT" }),
            );
          }
        },
      ),
    );
  });
});
