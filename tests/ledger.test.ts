import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertActivityEntry,
  assertBalancedTransaction,
  assertReversalAvailable,
  canonicalTransactionPayload,
  createReversalTransaction,
  serializeTokenSubunits,
  type LedgerTransactionV1,
  type ActivityEntryV1,
} from "../src/index.js";

function purchaseTransaction(): LedgerTransactionV1 {
  return {
    schemaVersion: "1",
    transactionId: "txn:purchase:1",
    activityType: "purchase",
    status: "settled",
    idempotencyKey: "intent:1:paid",
    providerEventId: "shopify:event:1",
    effectiveAt: "2026-07-15T10:00:00.000Z",
    recordedAt: "2026-07-15T10:00:01.000Z",
    metadata: { z: "last", a: "first" },
    postings: [
      {
        schemaVersion: "1",
        postingId: "posting:2",
        transactionId: "txn:purchase:1",
        accountId: "account:treasury",
        walletId: "wallet:treasury",
        lotId: "lot:1",
        amount: serializeTokenSubunits(50_000n),
      },
      {
        schemaVersion: "1",
        postingId: "posting:1",
        transactionId: "txn:purchase:1",
        accountId: "account:clearing",
        amount: serializeTokenSubunits(-50_000n),
      },
    ],
  };
}

describe("immutable double-entry transactions", () => {
  it("validates privacy-safe display activity contracts", () => {
    const activity: ActivityEntryV1 = {
      schemaVersion: "1",
      transactionId: "txn:purchase:1",
      activityType: "purchase",
      status: "settled",
      occurredAt: "2026-07-15T10:00:00.000Z",
      amount: serializeTokenSubunits(50_000n),
      source: "shopify",
      beneficiaryAccountId: "account:adult",
      maskedReference: "Order ending 1234",
      sourceLabel: "Shopify purchase",
    };
    expect(() => assertActivityEntry(activity)).not.toThrow();
    expect(() =>
      assertActivityEntry({ ...activity, sourceLabel: "bad\nlabel" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertActivityEntry({ ...activity, source: "unknown" as never }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertActivityEntry({ ...activity, sourceLabel: 42 as never }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertActivityEntry({
        ...activity,
        amount: serializeTokenSubunits(0n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });

  it("accepts exact balanced postings and canonicalizes ordering", () => {
    const transaction = purchaseTransaction();
    expect(() => assertBalancedTransaction(transaction)).not.toThrow();
    const canonical = canonicalTransactionPayload(transaction);
    expect(canonical.indexOf('"a":"first"')).toBeLessThan(
      canonical.indexOf('"z":"last"'),
    );
    expect(canonical.indexOf("posting:1")).toBeLessThan(
      canonical.indexOf("posting:2"),
    );
    expect(canonical).not.toContain("canonicalHash");
  });

  it("matches the cross-language canonical transaction golden vector", () => {
    const transaction: LedgerTransactionV1 = {
      schemaVersion: "1",
      transactionId: "txn:golden:1",
      activityType: "purchase",
      status: "settled",
      idempotencyKey: "intent:golden:paid",
      providerEventId: "provider:event:golden",
      effectiveAt: "2026-07-15T10:00:00.000Z",
      recordedAt: "2026-07-15T10:00:01.000Z",
      previousCanonicalHash: `sha256:${"a".repeat(64)}`,
      canonicalHash: `sha256:${"b".repeat(64)}`,
      metadata: {
        z: "last",
        a: "lower",
        Z: "upper-last",
        A: "upper-first",
      },
      postings: [
        {
          schemaVersion: "1",
          postingId: "posting:a",
          transactionId: "txn:golden:1",
          accountId: "account:treasury",
          walletId: "wallet:treasury",
          lotId: "lot:golden",
          amount: serializeTokenSubunits(50_000n),
        },
        {
          schemaVersion: "1",
          postingId: "posting:A",
          transactionId: "txn:golden:1",
          accountId: "account:clearing",
          amount: serializeTokenSubunits(-50_000n),
        },
      ],
    };
    const expectedCanonical =
      '{"schemaVersion":"1","transactionId":"txn:golden:1","activityType":"purchase","status":"settled","idempotencyKey":"intent:golden:paid","providerEventId":"provider:event:golden","effectiveAt":"2026-07-15T10:00:00.000Z","recordedAt":"2026-07-15T10:00:01.000Z","previousCanonicalHash":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","metadata":{"A":"upper-first","Z":"upper-last","a":"lower","z":"last"},"postings":[{"schemaVersion":"1","postingId":"posting:A","transactionId":"txn:golden:1","accountId":"account:clearing","amount":"-50000"},{"schemaVersion":"1","postingId":"posting:a","transactionId":"txn:golden:1","accountId":"account:treasury","walletId":"wallet:treasury","lotId":"lot:golden","amount":"50000"}]}';

    const canonical = canonicalTransactionPayload(transaction);
    const canonicalHash = `sha256:${createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex")}`;

    expect(canonical).toBe(expectedCanonical);
    expect(canonicalHash).toBe(
      "sha256:36623f8b026e422f9bf4a418494510b1283cde511ff1ca3b6b614d90f026b45e",
    );
  });

  it("rejects unbalanced, zero, duplicate, mismatched, and unsupported postings", () => {
    const original = purchaseTransaction();
    const cases: LedgerTransactionV1[] = [
      { ...original, postings: original.postings.slice(0, 1) },
      {
        ...original,
        postings: [
          original.postings[0]!,
          { ...original.postings[1]!, amount: serializeTokenSubunits(-49_999n) },
        ],
      },
      {
        ...original,
        postings: [
          { ...original.postings[0]!, amount: serializeTokenSubunits(0n) },
          original.postings[1]!,
        ],
      },
      {
        ...original,
        postings: [
          original.postings[0]!,
          { ...original.postings[1]!, postingId: original.postings[0]!.postingId },
        ],
      },
      {
        ...original,
        postings: [
          original.postings[0]!,
          { ...original.postings[1]!, transactionId: "txn:other" },
        ],
      },
      { ...original, schemaVersion: "2" as "1" },
      {
        ...original,
        postings: [
          original.postings[0]!,
          { ...original.postings[1]!, schemaVersion: "2" as "1" },
        ],
      },
      {
        ...original,
        activityType: "unknown" as "purchase",
      },
      {
        ...original,
        recordedAt: "2026-07-15T09:59:59.000Z",
      },
      {
        ...original,
        previousCanonicalHash: "not-a-hash",
      },
      {
        ...original,
        metadata: { reason: "contains\na-control" },
      },
      {
        ...original,
        postings: [
          { ...original.postings[0]!, walletId: "contains spaces" },
          original.postings[1]!,
        ],
      },
      {
        ...original,
        reversesTransactionId: "txn:other",
      },
    ];
    for (const transaction of cases) {
      expect(() => assertBalancedTransaction(transaction)).toThrow();
    }
  });

  it("creates a balanced compensating reversal and prevents a second one", () => {
    const original = purchaseTransaction();
    const reversal = createReversalTransaction(original, {
      transactionId: "txn:reversal:1",
      postingIds: ["posting:r1", "posting:r2"],
      idempotencyKey: "reversal:1",
      effectiveAt: "2026-07-16T10:00:00.000Z",
      recordedAt: "2026-07-16T10:00:01.000Z",
      previousCanonicalHash: `sha256:${"b".repeat(64)}`,
      metadata: { reason: "refund" },
    });
    expect(reversal.reversesTransactionId).toBe(original.transactionId);
    expect(reversal.postings.map((posting) => posting.amount)).toEqual([
      "-50000",
      "50000",
    ]);
    expect(() => assertBalancedTransaction(reversal)).not.toThrow();
    expect(() => assertReversalAvailable(original.transactionId, [])).not.toThrow();
    expect(() =>
      assertReversalAvailable(original.transactionId, [reversal]),
    ).toThrowError(expect.objectContaining({ code: "REVERSAL_ALREADY_EXISTS" }));
    expect(() =>
      assertReversalAvailable(original.transactionId, [
        { ...reversal, status: "failed" },
      ]),
    ).not.toThrow();
  });

  it("rejects malformed reversal inputs", () => {
    const original = purchaseTransaction();
    expect(() =>
      createReversalTransaction(original, {
        transactionId: "txn:r",
        postingIds: ["only-one"],
        idempotencyKey: "r:1",
        effectiveAt: "2026-07-16T10:00:00.000Z",
        recordedAt: "2026-07-16T10:00:00.000Z",
      }),
    ).toThrow();
    const reversal = createReversalTransaction(original, {
      transactionId: "txn:r:valid",
      postingIds: ["r:1", "r:2"],
      idempotencyKey: "r:valid",
      effectiveAt: "2026-07-16T10:00:00.000Z",
      recordedAt: "2026-07-16T10:00:00.000Z",
    });
    expect(() =>
      createReversalTransaction(reversal, {
        transactionId: "txn:r:again",
        postingIds: ["rr:1", "rr:2"],
        idempotencyKey: "rr:valid",
        effectiveAt: "2026-07-17T10:00:00.000Z",
        recordedAt: "2026-07-17T10:00:00.000Z",
      }),
    ).toThrow();
  });
});
