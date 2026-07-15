import { describe, expect, it } from "vitest";
import {
  BASELINE_GBP_REFERENCE_RATE,
  BASELINE_GBP_TOKEN_PACKS,
  BASELINE_PURCHASE_LIMIT_POLICY,
  PRE_UTILITY_BACKER_COHORT,
  assertDistinctAdjustmentApproval,
  assertFlatTokenCatalog,
  assertOpenPurchaseIntent,
  assertPurchaseIntentBinding,
  assertPurchaseLimitPolicy,
  assertRewardConversion,
  assertTokenPack,
  assertTokenReferenceRate,
  convertRewardPayout,
  evaluateEarlyBacker,
  mapBitLabsConversionState,
  serializeTokenSubunits,
  type AdjustmentRequestV1,
  type PaidLotRetentionV1,
  type PurchaseIntentV1,
  type RewardConversionV1,
  type TokenPackV1,
} from "../src/index.js";

function paidLot(
  overrides: Partial<PaidLotRetentionV1> = {},
): PaidLotRetentionV1 {
  return {
    schemaVersion: "1",
    lotId: "lot:paid:1",
    payerAccountId: "account:payer",
    receivingHouseholdId: "household:1",
    purchaseId: "purchase:1",
    catalogVersion: "gbp:v1",
    purchasedAt: "2026-07-15T10:00:00.000Z",
    settledAt: "2026-07-15T10:01:00.000Z",
    creditedAt: "2026-07-15T10:02:00.000Z",
    retainedAmount: serializeTokenSubunits(50_000n),
    ...overrides,
  };
}

const tokenPack: TokenPackV1 = {
  schemaVersion: "1",
  packId: "gbp_5_50_v1",
  catalogVersion: "gbp-v1",
  currency: "GBP",
  priceMinorUnits: "500",
  grantAmount: serializeTokenSubunits(50_000n),
  active: true,
};

function purchaseIntent(
  overrides: Partial<PurchaseIntentV1> = {},
): PurchaseIntentV1 {
  return {
    schemaVersion: "1",
    intentId: "intent:1",
    payerAccountId: "account:payer",
    receivingHouseholdId: "household:1",
    receivingWalletId: "wallet:treasury",
    packId: tokenPack.packId,
    catalogVersion: tokenPack.catalogVersion,
    expectedCurrency: "GBP",
    expectedPriceMinorUnits: tokenPack.priceMinorUnits,
    grantAmount: tokenPack.grantAmount,
    status: "created",
    createdAt: "2026-07-15T10:00:00.000Z",
    expiresAt: "2026-07-15T10:15:00.000Z",
    ...overrides,
  };
}

describe("early backer provenance", () => {
  const window = {
    publicTokensLaunchAt: "2026-07-15T10:00:00.000Z",
    firstPublicSpendLiveAt: "2026-08-15T10:00:00.000Z",
  } as const;

  it("uses an inclusive launch, exclusive spend cutoff, and net retained basis", () => {
    const result = evaluateEarlyBacker(
      "account:payer",
      "household:1",
      [
        paidLot(),
        paidLot({
          lotId: "lot:refunded",
          retainedAmount: serializeTokenSubunits(0n),
        }),
        paidLot({
          lotId: "lot:cutoff",
          purchasedAt: window.firstPublicSpendLiveAt,
          settledAt: window.firstPublicSpendLiveAt,
          creditedAt: window.firstPublicSpendLiveAt,
        }),
        paidLot({
          lotId: "lot:other-household",
          receivingHouseholdId: "household:2",
        }),
      ],
      window,
      "2026-08-16T10:00:00.000Z",
    );
    expect(result).toMatchObject({
      cohortKey: PRE_UTILITY_BACKER_COHORT,
      status: "provisional",
      netRetainedAmount: "50000",
      contributingLotIds: ["lot:paid:1"],
    });
  });

  it("remains provisional while the public-spend cutoff is not set", () => {
    const result = evaluateEarlyBacker(
      "account:payer",
      "household:1",
      [paidLot()],
      { publicTokensLaunchAt: window.publicTokensLaunchAt },
      "2026-07-16T10:00:00.000Z",
    );
    expect(result.status).toBe("provisional");
  });

  it("rejects invalid windows and negative retained basis", () => {
    expect(() =>
      evaluateEarlyBacker(
        "account:payer",
        "household:1",
        [paidLot()],
        {
          publicTokensLaunchAt: "2026-08-15T10:00:00.000Z",
          firstPublicSpendLiveAt: "2026-07-15T10:00:00.000Z",
        },
        "2026-08-16T10:00:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      evaluateEarlyBacker(
        "account:payer",
        "household:1",
        [paidLot({ retainedAmount: serializeTokenSubunits(-1n) })],
        window,
        "2026-08-16T10:00:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });

  it("rejects duplicate lots and impossible paid-lot timestamp order", () => {
    expect(() =>
      evaluateEarlyBacker(
        "account:payer",
        "household:1",
        [paidLot(), paidLot()],
        window,
        "2026-08-16T10:00:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
    expect(() =>
      evaluateEarlyBacker(
        "account:payer",
        "household:1",
        [
          paidLot({
            settledAt: "2026-07-15T09:59:00.000Z",
          }),
        ],
        window,
        "2026-08-16T10:00:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
  });
});

describe("acquisition and operations contracts", () => {
  it("validates whole-Token paid packs", () => {
    expect(() => assertTokenPack(tokenPack)).not.toThrow();
    expect(() =>
      assertTokenPack({
        schemaVersion: "1",
        packId: "bad",
        catalogVersion: "gbp-v1",
        currency: "GBP",
        priceMinorUnits: "500",
        grantAmount: serializeTokenSubunits(50_001n),
        active: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "AMOUNT_NOT_WHOLE_TOKEN" }));
  });

  it("publishes the approved flat GBP catalog and baseline payer ceilings", () => {
    expect(BASELINE_GBP_TOKEN_PACKS.map((pack) => pack.packId)).toEqual([
      "gbp_5_50_v1",
      "gbp_10_100_v1",
      "gbp_25_250_v1",
      "gbp_50_500_v1",
    ]);
    expect(
      BASELINE_GBP_TOKEN_PACKS.map((pack) => [
        pack.priceMinorUnits,
        pack.grantAmount,
      ]),
    ).toEqual([
      ["500", "50000"],
      ["1000", "100000"],
      ["2500", "250000"],
      ["5000", "500000"],
    ]);
    expect(() =>
      assertPurchaseLimitPolicy(BASELINE_PURCHASE_LIMIT_POLICY),
    ).not.toThrow();
    expect(() =>
      assertTokenReferenceRate(BASELINE_GBP_REFERENCE_RATE),
    ).not.toThrow();
    expect(() =>
      assertFlatTokenCatalog(
        BASELINE_GBP_TOKEN_PACKS,
        BASELINE_GBP_REFERENCE_RATE,
      ),
    ).not.toThrow();
    expect(() =>
      assertPurchaseLimitPolicy({
        ...BASELINE_PURCHASE_LIMIT_POLICY,
        rollingPayerPriceMinorUnits: "4999",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertFlatTokenCatalog(
        [
          ...BASELINE_GBP_TOKEN_PACKS.slice(0, 1),
          {
            ...BASELINE_GBP_TOKEN_PACKS[1]!,
            priceMinorUnits: "999",
          },
        ],
        BASELINE_GBP_REFERENCE_RATE,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("binds checkout to authoritative catalog facts and a short-lived open intent", () => {
    const intent = purchaseIntent({
      providerCheckoutReferenceHash: `sha256:${"b".repeat(64)}`,
    });
    expect(() => assertPurchaseIntentBinding(intent, tokenPack)).not.toThrow();
    expect(() =>
      assertOpenPurchaseIntent(
        intent,
        tokenPack,
        "2026-07-15T10:05:00.000Z",
      ),
    ).not.toThrow();
    expect(() =>
      assertPurchaseIntentBinding(
        purchaseIntent({ expectedPriceMinorUnits: "499" }),
        tokenPack,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertOpenPurchaseIntent(
        intent,
        tokenPack,
        "2026-07-15T10:15:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      assertPurchaseIntentBinding(
        purchaseIntent({ providerCheckoutReferenceHash: "raw-checkout-id" }),
        tokenPack,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("converts provider payout with exact rational FX and rate snapshots", () => {
    const result = convertRewardPayout(
      "250",
      {
        schemaVersion: "1",
        rateVersion: "reward:v1",
        provider: "ayet",
        tokenSubunitsNumerator: "10",
        gbpMinorUnitsDenominator: "1",
        effectiveFrom: "2026-07-15T00:00:00.000Z",
      },
      {
        schemaVersion: "1",
        snapshotId: "fx:1",
        sourceCurrency: "USD",
        quoteCurrency: "GBP",
        gbpMinorUnitsNumerator: "4",
        sourceMinorUnitsDenominator: "5",
        capturedAt: "2026-07-15T00:00:00.000Z",
      },
    );
    expect(result).toEqual({ gbpMinorUnits: "200", tokenSubunits: "2000" });
    expect(() =>
      convertRewardPayout(
        "1",
        {
          schemaVersion: "1",
          rateVersion: "bad",
          provider: "bitlabs",
          tokenSubunitsNumerator: "1",
          gbpMinorUnitsDenominator: "0",
          effectiveFrom: "2026-07-15T00:00:00.000Z",
        },
        {
          schemaVersion: "1",
          snapshotId: "fx:bad",
          sourceCurrency: "USD",
          quoteCurrency: "GBP",
          gbpMinorUnitsNumerator: "1",
          sourceMinorUnitsDenominator: "1",
          capturedAt: "2026-07-15T00:00:00.000Z",
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      convertRewardPayout(
        "1",
        {
          schemaVersion: "2" as "1",
          rateVersion: "bad-version",
          provider: "ayet",
          tokenSubunitsNumerator: "1",
          gbpMinorUnitsDenominator: "1",
          effectiveFrom: "2026-07-15T00:00:00.000Z",
        },
        {
          schemaVersion: "1",
          snapshotId: "fx:2",
          sourceCurrency: "USD",
          quoteCurrency: "GBP",
          gbpMinorUnitsNumerator: "1",
          sourceMinorUnitsDenominator: "1",
          capturedAt: "2026-07-15T00:00:00.000Z",
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("maps BitLabs callback states without trusting provider currency labels", () => {
    expect(mapBitLabsConversionState("PENDING")).toEqual({
      conversionStatus: "pending",
      activityType: "hold",
      activityStatus: "held",
    });
    expect(mapBitLabsConversionState("COMPLETED")).toEqual({
      conversionStatus: "completed",
      activityType: "offerwall",
      activityStatus: "settled",
    });
    expect(mapBitLabsConversionState("RECONCILED")).toEqual({
      conversionStatus: "reconciled",
      activityType: "reversal",
      activityStatus: "reversed",
    });
    expect(() => mapBitLabsConversionState("completed")).toThrowError(
      expect.objectContaining({ code: "INVALID_CONTRACT" }),
    );
  });

  it("validates minimized provider conversion evidence before journaling", () => {
    const conversion: RewardConversionV1 = {
      schemaVersion: "1",
      provider: "ayet",
      providerEventId: "ayet:event:1",
      beneficiaryAccountId: "account:adult",
      walletId: "wallet:personal",
      status: "completed",
      providerPayoutMinorUnits: "20",
      providerCurrency: "GBP",
      gbpMinorUnits: "20",
      tokenSubunits: serializeTokenSubunits(200n),
      rateVersion: "reward:v1",
      fxSnapshotId: "fx:gbp:1",
      occurredAt: "2026-07-15T10:00:00.000Z",
    };
    expect(() => assertRewardConversion(conversion)).not.toThrow();
    expect(() =>
      assertRewardConversion({ ...conversion, providerCurrency: "gbp" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertRewardConversion({
        ...conversion,
        tokenSubunits: serializeTokenSubunits(0n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });

  it("requires a distinct adjustment approver", () => {
    const request: AdjustmentRequestV1 = {
      schemaVersion: "1",
      adjustmentId: "adjustment:1",
      walletId: "wallet:1",
      amount: serializeTokenSubunits(1_000n),
      reason: "Support correction",
      ticketReference: "ticket:1",
      status: "approved",
      initiatedByAccountId: "operator:1",
      initiatedAt: "2026-07-15T10:00:00.000Z",
      approvedByAccountId: "operator:2",
      approvedAt: "2026-07-15T10:05:00.000Z",
    };
    expect(() => assertDistinctAdjustmentApproval(request)).not.toThrow();
    expect(() =>
      assertDistinctAdjustmentApproval({
        ...request,
        approvedByAccountId: request.initiatedByAccountId,
      }),
    ).toThrow();
    expect(() =>
      assertDistinctAdjustmentApproval({ ...request, schemaVersion: "2" as "1" }),
    ).toThrow();
    expect(() =>
      assertDistinctAdjustmentApproval({
        ...request,
        amount: serializeTokenSubunits(0n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertDistinctAdjustmentApproval({
        ...request,
        approvedAt: "2026-07-15T09:59:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
  });
});
