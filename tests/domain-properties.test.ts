import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertBalancedTransaction,
  assertGameplayAllocation,
  assertNonNegativeAccounts,
  assertReversalAvailable,
  createGameplayAllocation,
  createReversalTransaction,
  createWalletBalanceSummary,
  parseTokenSubunits,
  rebuildBalanceProjection,
  reclaimGameplayAllocation,
  selectSourceLots,
  serializeTokenSubunits,
  type LedgerTransactionV1,
  type SourceLotV1,
  type WalletBalanceProjectionV1,
} from "../src/index.js";

function transfer(id: number, amount: bigint): LedgerTransactionV1 {
  return {
    schemaVersion: "1",
    transactionId: `txn:property:${id}`,
    activityType: "allocation",
    status: "settled",
    idempotencyKey: `idempotency:property:${id}`,
    effectiveAt: "2026-07-15T10:00:00.000Z",
    recordedAt: "2026-07-15T10:00:01.000Z",
    metadata: {},
    postings: [
      {
        schemaVersion: "1",
        postingId: `posting:property:${id}:debit`,
        transactionId: `txn:property:${id}`,
        accountId: "account:source",
        amount: serializeTokenSubunits(-amount),
      },
      {
        schemaVersion: "1",
        postingId: `posting:property:${id}:credit`,
        transactionId: `txn:property:${id}`,
        accountId: "account:target",
        amount: serializeTokenSubunits(amount),
      },
    ],
  };
}

describe("economy domain properties", () => {
  it("round-trips every generated signed subunit amount exactly", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(2n ** 62n), max: 2n ** 62n }),
        (amount) => {
          expect(parseTokenSubunits(serializeTokenSubunits(amount))).toBe(amount);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("splits arbitrary spendable balances without losing subunits", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000_000n }), (spendable) => {
        const projection: WalletBalanceProjectionV1 = {
          schemaVersion: "1",
          walletId: "wallet:property",
          spendable: serializeTokenSubunits(spendable),
          reserved: serializeTokenSubunits(0n),
          held: serializeTokenSubunits(0n),
          version: 1,
          asOf: "2026-07-15T10:00:00.000Z",
        };
        const summary = createWalletBalanceSummary(projection);
        const available = parseTokenSubunits(summary.available);
        const progress = parseTokenSubunits(summary.rewardProgress);
        expect(available + progress).toBe(spendable);
        expect(available % 1_000n).toBe(0n);
        expect(progress).toBeGreaterThanOrEqual(0n);
        expect(progress).toBeLessThan(1_000n);
      }),
      { numRuns: 300 },
    );
  });

  it("keeps arbitrary transfer sequences balanced and rebuild-order independent", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 1_000_000n }), {
          minLength: 1,
          maxLength: 50,
        }),
        (amounts) => {
          const transactions = amounts.map((amount, index) =>
            transfer(index, amount),
          );
          transactions.forEach(assertBalancedTransaction);
          const total = amounts.reduce((sum, amount) => sum + amount, 0n);
          const projection = rebuildBalanceProjection(transactions);
          expect(projection).toEqual({
            "account:source": serializeTokenSubunits(-total),
            "account:target": serializeTokenSubunits(total),
          });
          expect(rebuildBalanceProjection([...transactions].reverse())).toEqual(
            projection,
          );
          expect(() =>
            assertNonNegativeAccounts(projection, ["account:target"]),
          ).not.toThrow();
          expect(() =>
            rebuildBalanceProjection([transactions[0]!, transactions[0]!]),
          ).toThrowError(expect.objectContaining({ code: "DUPLICATE_TRANSACTION" }));
        },
      ),
      { numRuns: 150 },
    );
  });

  it("preserves one-time reversal and source-lot isolation for generated amounts", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 1_000_000n }), (amount) => {
        const original = transfer(1, amount);
        const reversal = createReversalTransaction(original, {
          transactionId: "txn:property:reversal",
          postingIds: ["posting:property:r:1", "posting:property:r:2"],
          idempotencyKey: "idempotency:property:reversal",
          effectiveAt: "2026-07-15T10:01:00.000Z",
          recordedAt: "2026-07-15T10:01:01.000Z",
        });
        expect(rebuildBalanceProjection([original, reversal])).toEqual({
          "account:source": "0",
          "account:target": "0",
        });
        expect(() =>
          assertReversalAvailable(original.transactionId, [reversal]),
        ).toThrowError(expect.objectContaining({ code: "REVERSAL_ALREADY_EXISTS" }));

        const earnedLot: SourceLotV1 = {
          schemaVersion: "1",
          lotId: "lot:property:earned",
          walletId: "wallet:adult",
          beneficiaryAccountId: "account:adult",
          source: "ayet",
          providerEventId: "ayet:property:event",
          rateVersion: "reward:property:v1",
          settlementEvidenceHash: `sha256:${"d".repeat(64)}`,
          transferPolicy: "same-user-only",
          refundState: "none",
          originalAmount: serializeTokenSubunits(amount),
          remainingAmount: serializeTokenSubunits(amount),
          heldAmount: serializeTokenSubunits(0n),
          reversedAmount: serializeTokenSubunits(0n),
          settledAt: "2026-07-15T10:00:00.000Z",
          creditedAt: "2026-07-15T10:00:01.000Z",
        };
        expect(() =>
          selectSourceLots([earnedLot], serializeTokenSubunits(amount), {
            operation: "allocate",
            beneficiaryAccountId: "account:child",
            householdId: "household:1",
          }),
        ).toThrowError(expect.objectContaining({ code: "SOURCE_LOT_RESTRICTED" }));
      }),
      { numRuns: 150 },
    );
  });

  it("never creates a negative allocation through generated valid reclaims", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.nat({ max: 1_000_000 }),
        (wholeTokens, selector) => {
          const reserved = BigInt(wholeTokens) * 1_000n;
          const reclaimedTokens = BigInt((selector % wholeTokens) + 1);
          const reclaimed = reclaimedTokens * 1_000n;
          const allocation = createGameplayAllocation({
            allocationId: "allocation:property",
            householdId: "household:property",
            hostWalletId: "wallet:host",
            childWalletId: "wallet:child",
            childAccountId: "account:child",
            amount: serializeTokenSubunits(reserved),
            fundingSlices: [
              {
                lotId: "lot:property:paid",
                amount: serializeTokenSubunits(reserved),
              },
            ],
            limits: {
              perTransaction: serializeTokenSubunits(0n),
              periodic: serializeTokenSubunits(0n),
              periodicWindow: "daily",
            },
            occurredAt: "2026-07-15T10:00:00.000Z",
          });
          const next = reclaimGameplayAllocation(allocation, {
            amount: serializeTokenSubunits(reclaimed),
            sourceSlices: [
              {
                lotId: "lot:property:paid",
                amount: serializeTokenSubunits(reclaimed),
              },
            ],
            expectedVersion: 1,
            occurredAt: "2026-07-15T10:01:00.000Z",
          });
          expect(parseTokenSubunits(next.remainingAmount)).toBeGreaterThanOrEqual(
            0n,
          );
          expect(() => assertGameplayAllocation(next)).not.toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});
