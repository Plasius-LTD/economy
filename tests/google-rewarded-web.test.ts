import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertGoogleRewardedWebGrantClaim,
  assertGoogleRewardedWebQuote,
  assertGoogleRewardedWebReconciliation,
  assertGoogleRewardedWebStateTransition,
  createGoogleRewardedWebQuote,
  serializeTokenSubunits,
  type GoogleRewardedWebGrantClaimV1,
  type GoogleRewardedWebQuoteV1,
  type GoogleRewardedWebReconciliationV1,
  type TokenSubunitString,
} from "../src/index.js";

const REPORTING_KEY_FINGERPRINT = {
  schemaVersion: "1",
  fingerprintVersion: "1",
  algorithm: "hmac-sha256",
  domain: "economy.google-reporting-key.v1",
  keyVersion: "google-report-key-v1",
  digest: `hmac-sha256:${"a".repeat(64)}`,
} as const;

const REPORT_FINGERPRINT = {
  schemaVersion: "1",
  fingerprintVersion: "1",
  algorithm: "hmac-sha256",
  domain: "economy.provider-reconciliation.v1",
  keyVersion: "google-report-v1",
  digest: `hmac-sha256:${"b".repeat(64)}`,
} as const;

function quote(
  overrides: Partial<GoogleRewardedWebQuoteV1> = {},
): GoogleRewardedWebQuoteV1 {
  return {
    schemaVersion: "1",
    quoteVersion: "google-rewarded-web-gbp-v1",
    provider: "google-ad-manager",
    currency: "GBP",
    bundleCompletions: 10,
    rewardPayload: { type: "plasius-token-progress", amount: 1 },
    grossRevenueFloorMicros: "200000",
    providerFeeMicros: "20000",
    invalidTrafficHaircutMicros: "20000",
    otherCostMicros: "10000",
    eligibleNetRevenueMicros: "150000",
    tokenAmount: serializeTokenSubunits(1_000n),
    nominalLiabilityMicros: "100000",
    retainedMarginMicros: "50000",
    effectiveFrom: "2026-08-11T10:00:00.000Z",
    effectiveUntil: "2026-09-11T10:00:00.000Z",
    ...overrides,
  };
}

function claim(
  overrides: Partial<GoogleRewardedWebGrantClaimV1> = {},
): GoogleRewardedWebGrantClaimV1 {
  return {
    schemaVersion: "1",
    provider: "google-ad-manager",
    evidenceTrust: "client-claimed",
    claimId: "claim:google:1",
    sessionId: "session:google:1",
    beneficiaryAccountId: "account:adult:1",
    quoteVersion: "google-rewarded-web-gbp-v1",
    reportingKeyFingerprint: REPORTING_KEY_FINGERPRINT,
    rewardPayload: { type: "plasius-token-progress", amount: 1 },
    claimedAt: "2026-08-11T10:02:00.000Z",
    ...overrides,
  };
}

function reconciliation(
  overrides: Partial<GoogleRewardedWebReconciliationV1> = {},
): GoogleRewardedWebReconciliationV1 {
  return {
    schemaVersion: "1",
    provider: "google-ad-manager",
    batchId: "reconciliation:google:2026-08-11",
    quoteVersion: "google-rewarded-web-gbp-v1",
    state: "financially-reconciled",
    reportFinality: "final",
    reportFingerprint: REPORT_FINGERPRINT,
    adUnitFingerprint: `sha256:${"c".repeat(64)}`,
    periodStartedAt: "2026-08-11T00:00:00.000Z",
    periodEndedAt: "2026-08-12T00:00:00.000Z",
    acceptedClaimCount: 20,
    matchedPaidImpressionCount: 20,
    creditedBundleCount: 2,
    grossRevenueMicros: "400000",
    eligibleNetRevenueMicros: "300000",
    nominalLiabilityMicros: "200000",
    reserveHeldMicros: "200000",
    reconciledAt: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("Google rewarded web contracts", () => {
  it("creates an exact whole-Token quote with at least a 20% contribution margin", () => {
    const result = createGoogleRewardedWebQuote({
      quoteVersion: "google-rewarded-web-gbp-v1",
      bundleCompletions: 10,
      rewardPayload: { type: "plasius-token-progress", amount: 1 },
      grossRevenueFloorMicros: "200000",
      providerFeeMicros: "20000",
      invalidTrafficHaircutMicros: "20000",
      otherCostMicros: "10000",
      effectiveFrom: "2026-08-11T10:00:00.000Z",
      effectiveUntil: "2026-09-11T10:00:00.000Z",
    });

    expect(result).toEqual(quote());
    expect(() => assertGoogleRewardedWebQuote(result)).not.toThrow();
  });

  it("rejects unsafe bundle, money, payload, time, and margin values", () => {
    const cases: GoogleRewardedWebQuoteV1[] = [
      quote({ bundleCompletions: 0 }),
      quote({ grossRevenueFloorMicros: "0200000" }),
      quote({ providerFeeMicros: "200001" }),
      quote({ eligibleNetRevenueMicros: "124999", retainedMarginMicros: "24999" }),
      quote({ tokenAmount: "999" as TokenSubunitString }),
      quote({
        rewardPayload: {
          type: "cash",
          amount: 1,
        } as unknown as GoogleRewardedWebQuoteV1["rewardPayload"],
      }),
      quote({ effectiveUntil: "2026-08-11T10:00:00.000Z" }),
    ];
    for (const value of cases) {
      expect(() => assertGoogleRewardedWebQuote(value)).toThrow();
    }
  });

  it("keeps a browser grant explicitly client-claimed and privacy-minimised", () => {
    expect(() => assertGoogleRewardedWebGrantClaim(claim())).not.toThrow();
    expect(() =>
      assertGoogleRewardedWebGrantClaim(
        claim({ evidenceTrust: "provider-verified" as "client-claimed" }),
      ),
    ).toThrow();
    expect(() =>
      assertGoogleRewardedWebGrantClaim(
        claim({
          reportingKeyFingerprint: {
            ...REPORTING_KEY_FINGERPRINT,
            domain: "economy.provider-event-key.v1",
          } as unknown as typeof REPORTING_KEY_FINGERPRINT,
        }),
      ),
    ).toThrow();
    expect(JSON.stringify(claim())).not.toMatch(
      /email|phone|child|dob|gender|cookie|ipAddress|advertisingId/iu,
    );
  });

  it("requires final matched impressions, revenue, and reserve for financial reconciliation", () => {
    expect(() =>
      assertGoogleRewardedWebReconciliation(reconciliation(), quote()),
    ).not.toThrow();

    for (const value of [
      reconciliation({ reportFinality: "estimated" }),
      reconciliation({ matchedPaidImpressionCount: 19 }),
      reconciliation({ eligibleNetRevenueMicros: "249999" }),
      reconciliation({ nominalLiabilityMicros: "199999" }),
      reconciliation({ reserveHeldMicros: "199999" }),
      reconciliation({ quoteVersion: "another-quote" }),
    ]) {
      expect(() =>
        assertGoogleRewardedWebReconciliation(value, quote()),
      ).toThrow();
    }
  });

  it("permits report mismatch evidence without pretending it is reconciled", () => {
    expect(() =>
      assertGoogleRewardedWebReconciliation(
        reconciliation({
          state: "mismatch",
          reportFinality: "estimated",
          matchedPaidImpressionCount: 3,
          eligibleNetRevenueMicros: "1000",
          nominalLiabilityMicros: "200000",
          reserveHeldMicros: "200000",
        }),
        quote(),
      ),
    ).not.toThrow();
  });

  it("allows only forward-safe session evidence transitions", () => {
    const allowed = [
      ["created", "bootstrapped"],
      ["bootstrapped", "client-claimed"],
      ["client-claimed", "report-matched"],
      ["report-matched", "financially-reconciled"],
      ["created", "expired"],
      ["client-claimed", "suspended"],
    ] as const;
    for (const [from, to] of allowed) {
      expect(() =>
        assertGoogleRewardedWebStateTransition(from, to),
      ).not.toThrow();
    }
    for (const [from, to] of [
      ["created", "client-claimed"],
      ["client-claimed", "bootstrapped"],
      ["financially-reconciled", "suspended"],
      ["expired", "created"],
    ] as const) {
      expect(() =>
        assertGoogleRewardedWebStateTransition(from, to),
      ).toThrow();
    }
  });

  it("preserves the margin identity for generated exact input values", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 125_000n, max: 10_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        (eligibleNet, fee, haircut, otherCost) => {
          const gross = eligibleNet + fee + haircut + otherCost;
          const value = createGoogleRewardedWebQuote({
            quoteVersion: "google-rewarded-web-property-v1",
            bundleCompletions: 25,
            rewardPayload: { type: "plasius-token-progress", amount: 1 },
            grossRevenueFloorMicros: gross.toString(10),
            providerFeeMicros: fee.toString(10),
            invalidTrafficHaircutMicros: haircut.toString(10),
            otherCostMicros: otherCost.toString(10),
            effectiveFrom: "2026-08-11T10:00:00.000Z",
          });
          expect(BigInt(value.eligibleNetRevenueMicros)).toBe(eligibleNet);
          expect(
            BigInt(value.nominalLiabilityMicros)
              + BigInt(value.retainedMarginMicros),
          ).toBe(eligibleNet);
          expect(BigInt(value.retainedMarginMicros)).toBeGreaterThanOrEqual(
            25_000n,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
