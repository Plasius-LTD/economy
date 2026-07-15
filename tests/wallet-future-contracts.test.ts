import { describe, expect, it } from "vitest";
import {
  BASELINE_MONTHLY_SUBSCRIPTION_PLAN,
  EconomyError,
  assertSpendRequest,
  assertTokenSubscriptionPlan,
  assertWallet,
  assertWalletBalanceSummary,
  assertWalletLifetimeTotals,
  serializeTokenSubunits,
  toEconomyErrorEnvelope,
  type SpendRequestV1,
  type TokenSubscriptionPlanV1,
  type WalletBalanceSummaryV1,
  type WalletLifetimeTotalsV1,
  type WalletV1,
} from "../src/index.js";

const wallet: WalletV1 = {
  schemaVersion: "1",
  walletId: "wallet:household:1",
  accountId: "ledger-account:household:1",
  kind: "household-treasury",
  ownerType: "household",
  ownerId: "household:1",
  householdId: "household:1",
  status: "active",
  version: 1,
  createdAt: "2026-07-15T10:00:00.000Z",
};

const summary: WalletBalanceSummaryV1 = {
  schemaVersion: "1",
  walletId: wallet.walletId,
  available: serializeTokenSubunits(50_000n),
  reserved: serializeTokenSubunits(10_000n),
  held: serializeTokenSubunits(0n),
  rewardProgress: serializeTokenSubunits(275n),
  version: 1,
  asOf: "2026-07-15T10:01:00.000Z",
};

const totals: WalletLifetimeTotalsV1 = {
  schemaVersion: "1",
  bought: serializeTokenSubunits(50_000n),
  earned: serializeTokenSubunits(275n),
  allocated: serializeTokenSubunits(10_000n),
  reclaimed: serializeTokenSubunits(0n),
  spent: serializeTokenSubunits(0n),
  reversed: serializeTokenSubunits(0n),
};

const subscription: TokenSubscriptionPlanV1 = {
  schemaVersion: "1",
  planId: "monthly-10-100-v1",
  catalogVersion: "gbp-subscriptions-v1",
  interval: "monthly",
  priceMinorUnits: "1000",
  currency: "GBP",
  grantAmount: serializeTokenSubunits(100_000n),
  enabled: false,
  effectiveFrom: "2026-07-15T10:00:00.000Z",
};

function spendRequest(overrides: Partial<SpendRequestV1> = {}): SpendRequestV1 {
  return {
    schemaVersion: "1",
    requestId: "spend-request:1",
    childAccountId: "account:child",
    allocationId: "allocation:1",
    purpose: "gameplay-conversion",
    amount: serializeTokenSubunits(1_000n),
    status: "requested",
    requestedAt: "2026-07-15T10:00:00.000Z",
    expiresAt: "2026-07-15T10:15:00.000Z",
    ...overrides,
  };
}

describe("wallet contracts", () => {
  it("validates ownership, summary categories, and lifetime totals", () => {
    expect(() => assertWallet(wallet)).not.toThrow();
    expect(() => assertWalletBalanceSummary(summary)).not.toThrow();
    expect(() => assertWalletLifetimeTotals(totals)).not.toThrow();
  });

  it("rejects mismatched household ownership and invalid closure state", () => {
    const { householdId: _householdId, ...walletWithoutHousehold } = wallet;
    expect(() =>
      assertWallet({ ...wallet, householdId: "household:2" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertWallet({
        ...wallet,
        status: "closed",
        closedAt: "2026-07-15T09:59:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      assertWalletBalanceSummary({
        ...summary,
        available: serializeTokenSubunits(-1n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertWalletLifetimeTotals({
        ...totals,
        reversed: serializeTokenSubunits(-1n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertWallet({
        ...walletWithoutHousehold,
        ownerType: "account",
        ownerId: "account:child",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertWallet({
        ...wallet,
        kind: "purchase-clearing",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("disabled future contracts", () => {
  it("retains a valid provider-neutral monthly subscription shape", () => {
    expect(() => assertTokenSubscriptionPlan(subscription)).not.toThrow();
    expect(subscription.enabled).toBe(false);
    expect(BASELINE_MONTHLY_SUBSCRIPTION_PLAN).toMatchObject({
      interval: "monthly",
      priceMinorUnits: "1000",
      grantAmount: "100000",
      enabled: false,
    });
    expect(() =>
      assertTokenSubscriptionPlan({
        ...subscription,
        grantAmount: serializeTokenSubunits(100_001n),
      }),
    ).toThrowError(expect.objectContaining({ code: "AMOUNT_NOT_WHOLE_TOKEN" }));
  });

  it("validates requested and guardian-approved spend request states", () => {
    expect(() => assertSpendRequest(spendRequest())).not.toThrow();
    expect(() =>
      assertSpendRequest(
        spendRequest({
          status: "approved",
          decidedByAccountId: "account:guardian",
          decidedAt: "2026-07-15T10:05:00.000Z",
          approvalNonceHash: `sha256:${"c".repeat(64)}`,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSpendRequest(spendRequest({ status: "approved" })),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertSpendRequest(
        spendRequest({
          resultingTransactionId: "txn:1",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("public error envelopes", () => {
  it("preserves a stable code while bounding its public message", () => {
    const error = new EconomyError("INVALID_CONTRACT", "x".repeat(300));
    const envelope = toEconomyErrorEnvelope(error, "request:1");
    expect(envelope).toMatchObject({
      schemaVersion: "1",
      error: { code: "INVALID_CONTRACT", requestId: "request:1" },
    });
    expect(envelope.error.message).toHaveLength(256);
  });
});
