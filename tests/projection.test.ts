import { describe, expect, it } from "vitest";
import {
  applyTransactionToProjection,
  assertNonNegativeAccounts,
  createProjectionSnapshot,
  rebuildBalanceProjection,
  serializeTokenSubunits,
  type LedgerTransactionV1,
} from "../src/index.js";

function transfer(
  id: number,
  amount: bigint,
  providerEventId?: string,
): LedgerTransactionV1 {
  return {
    schemaVersion: "1",
    transactionId: `txn:${id}`,
    activityType: "allocation",
    status: "settled",
    idempotencyKey: `idem:${id}`,
    ...(providerEventId === undefined ? {} : { providerEventId }),
    effectiveAt: "2026-07-15T10:00:00.000Z",
    recordedAt: "2026-07-15T10:00:01.000Z",
    metadata: {},
    postings: [
      {
        schemaVersion: "1",
        postingId: `post:${id}:debit`,
        transactionId: `txn:${id}`,
        accountId: "account:source",
        amount: serializeTokenSubunits(-amount),
      },
      {
        schemaVersion: "1",
        postingId: `post:${id}:credit`,
        transactionId: `txn:${id}`,
        accountId: "account:target",
        amount: serializeTokenSubunits(amount),
      },
    ],
  };
}

describe("deterministic balance projections", () => {
  it("rebuilds exact balances over many integer transfers", () => {
    let seed = 73;
    const transactions: LedgerTransactionV1[] = [];
    let expected = 0n;
    for (let index = 0; index < 250; index += 1) {
      seed = (seed * 48_271) % 2_147_483_647;
      const amount = BigInt((seed % 10_000) + 1);
      transactions.push(transfer(index, amount));
      expected += amount;
    }
    const projection = rebuildBalanceProjection(transactions);
    expect(projection).toEqual({
      "account:source": serializeTokenSubunits(-expected),
      "account:target": serializeTokenSubunits(expected),
    });
    expect(rebuildBalanceProjection([...transactions].reverse())).toEqual(
      projection,
    );
  });

  it("applies immutably and builds a versioned snapshot", () => {
    const first = transfer(1, 1_000n);
    const current = { "account:target": serializeTokenSubunits(2_000n) };
    const next = applyTransactionToProjection(current, first);
    expect(current["account:target"]).toBe("2000");
    expect(next["account:target"]).toBe("3000");
    expect(
      createProjectionSnapshot(
        [first],
        "2026-07-15T10:01:00.000Z",
      ),
    ).toMatchObject({
      schemaVersion: "1",
      lastTransactionId: "txn:1",
      rebuiltAt: "2026-07-15T10:01:00.000Z",
    });
    expect(
      createProjectionSnapshot([], "2026-07-15T10:01:00.000Z"),
    ).not.toHaveProperty("lastTransactionId");
    expect(() => createProjectionSnapshot([], "not-a-time")).toThrowError(
      expect.objectContaining({ code: "INVALID_CONTRACT" }),
    );
    expect(() =>
      createProjectionSnapshot([], "2026-02-30T10:01:00.000Z"),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("rejects duplicate transaction, idempotency, and provider-event keys", () => {
    const first = transfer(1, 1_000n, "provider:event:1");
    expect(() => rebuildBalanceProjection([first, first])).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_TRANSACTION" }),
    );
    expect(() =>
      rebuildBalanceProjection([
        first,
        { ...transfer(2, 2_000n), idempotencyKey: first.idempotencyKey },
      ]),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_TRANSACTION" }));
    expect(() =>
      rebuildBalanceProjection([
        first,
        transfer(2, 2_000n, "provider:event:1"),
      ]),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_TRANSACTION" }));
  });

  it("enforces non-negative policy only for protected accounts", () => {
    const projection = rebuildBalanceProjection([transfer(1, 1_000n)]);
    expect(() =>
      assertNonNegativeAccounts(projection, ["account:target"]),
    ).not.toThrow();
    expect(() =>
      assertNonNegativeAccounts(projection, ["account:source"]),
    ).toThrowError(expect.objectContaining({ code: "NEGATIVE_PROJECTION" }));
    expect(() =>
      assertNonNegativeAccounts(projection, ["account:missing"]),
    ).not.toThrow();
  });
});
