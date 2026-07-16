import { describe, expect, it } from "vitest";
import {
  applyWalletBalanceDelta,
  applyWalletLifetimeDeltas,
  assertWalletActivityEntry,
  assertWalletActivityPage,
  assertWalletActivityPageForPortfolio,
  assertWalletActivityPageRequest,
  assertWalletBalanceDeltaBatch,
  assertWalletOwnerReference,
  assertWalletPortfolioReadScope,
  assertWalletPortfolioLifetime,
  assertWalletPortfolioSummary,
  createWalletBalanceSummary,
  createWalletPortfolioLifetime,
  createWalletPortfolioSummary,
  deriveWalletBalanceDeltas,
  deriveWalletLifetimeDeltas,
  serializeTokenSubunits,
  type EconomicJournalTransactionV1,
  type WalletActivityEntryV1,
  type WalletBalanceProjectionV1,
  type WalletBalanceSummaryV1,
  type WalletLifetimeSnapshotV1,
  type WalletLifetimeTotalsV1,
  type WalletPortfolioReadScopeV1,
} from "../src/index.js";

const subunits = (value: bigint) => serializeTokenSubunits(value);

function transfer(
  activityType: EconomicJournalTransactionV1["activityType"],
  status: EconomicJournalTransactionV1["status"],
  sourceWalletId: string | undefined,
  targetWalletId: string | undefined,
  amount: bigint,
): EconomicJournalTransactionV1 {
  const id = `${activityType}:${sourceWalletId ?? "system"}:${targetWalletId ?? "system"}`;
  return {
    schemaVersion: "1",
    transactionId: `txn:${id}`,
    activityType,
    status,
    idempotencyKey: `idem:${id}`,
    effectiveAt: "2026-07-15T10:00:00.000Z",
    recordedAt: "2026-07-15T10:00:01.000Z",
    metadata: {},
    postings: [
      {
        schemaVersion: "1",
        postingId: `posting:${id}:debit`,
        transactionId: `txn:${id}`,
        accountId:
          sourceWalletId === undefined
            ? "account:system"
            : `account:${sourceWalletId}`,
        ...(sourceWalletId === undefined ? {} : { walletId: sourceWalletId }),
        amount: serializeTokenSubunits(-amount),
      },
      {
        schemaVersion: "1",
        postingId: `posting:${id}:credit`,
        transactionId: `txn:${id}`,
        accountId:
          targetWalletId === undefined
            ? "account:system"
            : `account:${targetWalletId}`,
        ...(targetWalletId === undefined ? {} : { walletId: targetWalletId }),
        amount: serializeTokenSubunits(amount),
      },
    ],
  };
}

const initialProjection: WalletBalanceProjectionV1 = {
  schemaVersion: "1",
  walletId: "wallet:personal",
  spendable: subunits(1_275n),
  reserved: subunits(0n),
  held: subunits(0n),
  version: 1,
  asOf: "2026-07-15T10:00:00.000Z",
};

const emptyLifetime: WalletLifetimeTotalsV1 = {
  schemaVersion: "1",
  bought: subunits(0n),
  earned: subunits(0n),
  allocated: subunits(0n),
  reclaimed: subunits(0n),
  spent: subunits(0n),
  reversed: subunits(0n),
};

describe("atomic wallet projections", () => {
  it("splits whole availability from progress within one wallet", () => {
    expect(createWalletBalanceSummary(initialProjection)).toEqual({
      schemaVersion: "1",
      walletId: "wallet:personal",
      available: "1000",
      reserved: "0",
      held: "0",
      rewardProgress: "275",
      version: 1,
      asOf: "2026-07-15T10:00:00.000Z",
    });
  });

  it("adds deltas atomically and rejects a negative resulting bucket", () => {
    const next = applyWalletBalanceDelta(
      initialProjection,
      {
        schemaVersion: "1",
        walletId: "wallet:personal",
        spendableDelta: subunits(725n),
        reservedDelta: subunits(0n),
        heldDelta: subunits(0n),
      },
      "txn:reward",
      "2026-07-15T10:01:00.000Z",
    );
    expect(createWalletBalanceSummary(next)).toMatchObject({
      available: "2000",
      rewardProgress: "0",
      version: 2,
    });
    expect(() =>
      applyWalletBalanceDelta(
        initialProjection,
        {
          schemaVersion: "1",
          walletId: "wallet:personal",
          spendableDelta: subunits(-1_276n),
          reservedDelta: subunits(0n),
          heldDelta: subunits(0n),
        },
        "txn:overspend",
        "2026-07-15T10:01:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "NEGATIVE_PROJECTION" }));
    expect(() =>
      assertWalletBalanceDeltaBatch("txn:duplicate", [
        {
          schemaVersion: "1",
          walletId: "wallet:personal",
          spendableDelta: subunits(1n),
          reservedDelta: subunits(0n),
          heldDelta: subunits(0n),
        },
        {
          schemaVersion: "1",
          walletId: "wallet:personal",
          spendableDelta: subunits(0n),
          reservedDelta: subunits(1n),
          heldDelta: subunits(0n),
        },
      ]),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
  });

  it("derives exclusive balance buckets from authoritative account bindings", () => {
    const allocation = transfer(
      "allocation",
      "settled",
      "wallet:treasury",
      "wallet:child",
      2_000n,
    );
    expect(
      deriveWalletBalanceDeltas(allocation, [
        {
          accountId: "account:wallet:treasury",
          walletId: "wallet:treasury",
          bucket: "spendable",
        },
        {
          accountId: "account:wallet:child",
          walletId: "wallet:child",
          bucket: "reserved",
        },
      ]),
    ).toEqual([
      {
        schemaVersion: "1",
        walletId: "wallet:child",
        spendableDelta: "0",
        reservedDelta: "2000",
        heldDelta: "0",
      },
      {
        schemaVersion: "1",
        walletId: "wallet:treasury",
        spendableDelta: "-2000",
        reservedDelta: "0",
        heldDelta: "0",
      },
    ]);
    expect(() => deriveWalletBalanceDeltas(allocation, [])).toThrowError(
      expect.objectContaining({ code: "INVALID_CONTRACT" }),
    );
  });
});

describe("deterministic lifetime semantics", () => {
  it("keeps gross acquisition and later reversal in separate monotonic buckets", () => {
    const purchase = transfer(
      "purchase",
      "settled",
      undefined,
      "wallet:treasury",
      5_000n,
    );
    const refund = transfer(
      "refund",
      "settled",
      "wallet:treasury",
      undefined,
      2_000n,
    );
    const bought = deriveWalletLifetimeDeltas(purchase);
    const reversed = deriveWalletLifetimeDeltas(refund);
    const totals = applyWalletLifetimeDeltas(
      applyWalletLifetimeDeltas(emptyLifetime, "wallet:treasury", bought),
      "wallet:treasury",
      reversed,
    );
    expect(totals).toMatchObject({ bought: "5000", reversed: "2000" });
  });

  it("counts source-wallet allocation/reclaim and excludes held workflows", () => {
    const allocation = transfer(
      "boost",
      "settled",
      "wallet:treasury",
      "wallet:child",
      3_000n,
    );
    const reclaim = transfer(
      "reclaim",
      "settled",
      "wallet:child",
      "wallet:treasury",
      1_000n,
    );
    expect(deriveWalletLifetimeDeltas(allocation)).toEqual([
      {
        schemaVersion: "1",
        walletId: "wallet:treasury",
        bucket: "allocated",
        amount: "3000",
      },
    ]);
    expect(deriveWalletLifetimeDeltas(reclaim)).toEqual([
      {
        schemaVersion: "1",
        walletId: "wallet:treasury",
        bucket: "reclaimed",
        amount: "1000",
      },
    ]);
    expect(
      deriveWalletLifetimeDeltas(
        transfer("offerwall", "held", undefined, "wallet:hold", 250n),
      ),
    ).toEqual([]);
    expect(
      deriveWalletLifetimeDeltas(
        transfer("offerwall", "settled", undefined, "wallet:personal", 250n),
      ),
    ).toMatchObject([{ bucket: "earned", amount: "250" }]);
  });
});

describe("explicit portfolio reads", () => {
  const asOf = "2026-07-15T11:00:00.000Z";
  const scope: WalletPortfolioReadScopeV1 = {
    schemaVersion: "1",
    portfolioId: "portfolio:guardian",
    subjectAccountId: "account:guardian",
    components: [
      { walletId: "wallet:treasury", role: "household-treasury" },
      {
        walletId: "wallet:personal",
        role: "personal",
        beneficiaryAccountId: "account:guardian",
      },
    ],
  };

  const treasurySummary: WalletBalanceSummaryV1 = {
    schemaVersion: "1",
    walletId: "wallet:treasury",
    available: subunits(0n),
    reserved: subunits(2_000n),
    held: subunits(0n),
    rewardProgress: subunits(600n),
    version: 2,
    asOf,
  };
  const personalSummary: WalletBalanceSummaryV1 = {
    schemaVersion: "1",
    walletId: "wallet:personal",
    available: subunits(0n),
    reserved: subunits(0n),
    held: subunits(500n),
    rewardProgress: subunits(600n),
    version: 3,
    asOf,
  };

  it("retains treasury/personal IDs and never promotes progress across them", () => {
    const result = createWalletPortfolioSummary(
      scope,
      [
        { ...scope.components[1]!, summary: personalSummary },
        { ...scope.components[0]!, summary: treasurySummary },
      ],
      asOf,
    );
    expect(result.components.map((item) => item.walletId)).toEqual([
      "wallet:treasury",
      "wallet:personal",
    ]);
    expect(result.totals).toEqual({
      available: "0",
      reserved: "2000",
      held: "500",
      rewardProgress: "1200",
    });
    expect(() => assertWalletPortfolioSummary(result)).not.toThrow();
    expect(() =>
      assertWalletPortfolioSummary({
        ...result,
        totals: { ...result.totals, available: subunits(1_000n) },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("aggregates lifetime columns while retaining each component snapshot", () => {
    const snapshot = (
      walletId: string,
      totals: Partial<WalletLifetimeTotalsV1>,
      version: number,
    ): WalletLifetimeSnapshotV1 => ({
      schemaVersion: "1",
      walletId,
      totals: { ...emptyLifetime, ...totals },
      version,
      asOf,
    });
    const result = createWalletPortfolioLifetime(
      scope,
      [
        {
          ...scope.components[0]!,
          snapshot: snapshot(
            "wallet:treasury",
            { bought: subunits(5_000n) },
            2,
          ),
        },
        {
          ...scope.components[1]!,
          snapshot: snapshot(
            "wallet:personal",
            { earned: subunits(275n) },
            3,
          ),
        },
      ],
      asOf,
    );
    expect(result.totals).toMatchObject({ bought: "5000", earned: "275" });
    expect(result.components).toHaveLength(2);
    expect(() => assertWalletPortfolioLifetime(result)).not.toThrow();
    expect(() =>
      assertWalletPortfolioLifetime({
        ...result,
        totals: { ...result.totals, earned: subunits(276n) },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("rejects duplicate, omitted, and beneficiary-free allocation scopes", () => {
    expect(() =>
      assertWalletPortfolioReadScope({
        ...scope,
        components: [scope.components[0]!, scope.components[0]!],
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
    expect(() =>
      assertWalletPortfolioReadScope({
        ...scope,
        components: [
          { walletId: "wallet:child", role: "gameplay-allocation" },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      createWalletPortfolioSummary(
        scope,
        [{ ...scope.components[0]!, summary: treasurySummary }],
        asOf,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      createWalletPortfolioSummary(
        scope,
        [
          {
            ...scope.components[0]!,
            summary: {
              ...treasurySummary,
              rewardProgress: subunits(1_000n),
            },
          },
          { ...scope.components[1]!, summary: personalSummary },
        ],
        asOf,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("cursor-paginated economic and workflow activity", () => {
  const economic = {
    schemaVersion: "1",
    entryKind: "economic",
    activityId: "activity:z",
    walletId: "wallet:treasury",
    transactionId: "txn:1",
    activityType: "purchase",
    status: "settled",
    occurredAt: "2026-07-15T10:00:00.000Z",
    amount: subunits(5_000n),
    source: "shopify",
    sourceLabel: "Token pack",
  } satisfies WalletActivityEntryV1;
  const workflow = {
    schemaVersion: "1",
    entryKind: "workflow",
    activityId: "activity:a",
    walletId: "wallet:personal",
    commandId: "command:2",
    activityType: "offerwall",
    status: "pending",
    occurredAt: "2026-07-15T10:00:00.000Z",
    amount: subunits(250n),
    source: "bitlabs",
    sourceLabel: "Offerwall reward",
  } satisfies WalletActivityEntryV1;

  it("keeps pending/failed command activity outside the economic discriminant", () => {
    expect(() => assertWalletActivityEntry(economic)).not.toThrow();
    expect(() => assertWalletActivityEntry(workflow)).not.toThrow();
    expect(() =>
      assertWalletActivityEntry({ ...economic, status: "pending" } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertWalletActivityEntry({ ...workflow, status: "settled" } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertWalletActivityEntry({
        ...workflow,
        entryKind: "browser-claimed-kind",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("validates bounded filters, stable order, and opaque next cursors", () => {
    expect(() =>
      assertWalletActivityPageRequest({
        limit: 50,
        cursor: "cursor:opaque:1",
        filter: {
          statuses: ["pending", "settled"],
          sources: ["shopify", "bitlabs"],
          fromInclusive: "2026-07-01T00:00:00.000Z",
          toExclusive: "2026-08-01T00:00:00.000Z",
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertWalletActivityPage({
        schemaVersion: "1",
        entries: [economic, workflow],
        hasMore: true,
        nextCursor: "cursor:opaque:2",
      }),
    ).not.toThrow();
    expect(() =>
      assertWalletActivityPageForPortfolio(
        {
          schemaVersion: "1",
          entries: [economic, workflow],
          hasMore: false,
        },
        {
          schemaVersion: "1",
          portfolioId: "portfolio:activity",
          subjectAccountId: "account:guardian",
          components: [
            { walletId: "wallet:treasury", role: "household-treasury" },
            { walletId: "wallet:personal", role: "personal" },
          ],
        },
      ),
    ).not.toThrow();
    expect(() =>
      assertWalletActivityPageForPortfolio(
        {
          schemaVersion: "1",
          entries: [{ ...economic, walletId: "wallet:other" }],
          hasMore: false,
        },
        {
          schemaVersion: "1",
          portfolioId: "portfolio:activity",
          subjectAccountId: "account:guardian",
          components: [
            { walletId: "wallet:treasury", role: "household-treasury" },
          ],
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertWalletActivityPage({
        schemaVersion: "1",
        entries: [workflow, economic],
        hasMore: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertWalletActivityPageRequest({
        limit: 101,
        filter: { sources: ["shopify", "shopify"] },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("owner-constrained wallet lookup facts", () => {
  it("distinguishes account, household, and system owner references", () => {
    expect(() =>
      assertWalletOwnerReference({
        ownerType: "account",
        ownerId: "account:guardian",
      }),
    ).not.toThrow();
    expect(() =>
      assertWalletOwnerReference({
        ownerType: "household",
        ownerId: "household:1",
      }),
    ).not.toThrow();
    expect(() =>
      assertWalletOwnerReference({ ownerType: "system", ownerId: "system" }),
    ).not.toThrow();
    expect(() =>
      assertWalletOwnerReference({ ownerType: "account", ownerId: "system" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});
