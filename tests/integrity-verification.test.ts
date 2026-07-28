import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalTransactionPayload,
  serializeTokenSubunits,
  verifyJournalChainSegment,
  type ChainedEconomicJournalTransactionV1,
  type EconomicJournalTransactionV1,
  type JournalChainHeadV1,
} from "../src/index.js";

function hash(payload: string): string {
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

function transaction(
  transactionId: string,
  recordedAt: string,
  previousCanonicalHash?: string,
): ChainedEconomicJournalTransactionV1 {
  const base: EconomicJournalTransactionV1 = {
    schemaVersion: "1",
    transactionId,
    activityType: "purchase",
    status: "settled",
    idempotencyKey: `idem:${transactionId}`,
    effectiveAt: recordedAt,
    recordedAt,
    ...(previousCanonicalHash === undefined
      ? {}
      : { previousCanonicalHash }),
    metadata: {},
    postings: [
      {
        schemaVersion: "1",
        postingId: `posting:${transactionId}:debit`,
        transactionId,
        accountId: "account:clearing",
        amount: serializeTokenSubunits(-1_000n),
      },
      {
        schemaVersion: "1",
        postingId: `posting:${transactionId}:credit`,
        transactionId,
        accountId: "account:wallet",
        walletId: "wallet:1",
        amount: serializeTokenSubunits(1_000n),
      },
    ],
  };
  return {
    ...base,
    canonicalHash: hash(canonicalTransactionPayload(base)),
  };
}

const GENESIS: JournalChainHeadV1 = {
  schemaVersion: "1",
  chainId: "journal:global",
  version: 0,
  updatedAt: "2026-07-26T09:59:59.000Z",
};

describe("journal chain segment verification", () => {
  it("recomputes every hash/link and matches the expected end head", () => {
    const first = transaction("txn:1", "2026-07-26T10:00:00.000Z");
    const second = transaction(
      "txn:2",
      "2026-07-26T10:00:01.000Z",
      first.canonicalHash,
    );
    const expectedEnd: JournalChainHeadV1 = {
      schemaVersion: "1",
      chainId: "journal:global",
      version: 2,
      lastTransactionId: second.transactionId,
      canonicalHash: second.canonicalHash,
      updatedAt: second.recordedAt,
    };

    expect(
      verifyJournalChainSegment(GENESIS, [first, second], expectedEnd, hash),
    ).toEqual({
      schemaVersion: "1",
      valid: true,
      checkedTransactions: 2,
      observedHead: expectedEnd,
    });
  });

  it("reports canonical tampering without accepting a stale head", () => {
    const first = transaction("txn:1", "2026-07-26T10:00:00.000Z");
    const tampered = {
      ...first,
      metadata: { reason: "changed-after-hash" },
    };
    const expectedEnd: JournalChainHeadV1 = {
      schemaVersion: "1",
      chainId: "journal:global",
      version: 1,
      lastTransactionId: first.transactionId,
      canonicalHash: first.canonicalHash,
      updatedAt: first.recordedAt,
    };

    expect(
      verifyJournalChainSegment(GENESIS, [tampered], expectedEnd, hash),
    ).toEqual({
      schemaVersion: "1",
      valid: false,
      checkedTransactions: 0,
      observedHead: GENESIS,
      failureCode: "canonical-hash-mismatch",
      firstInvalidTransactionId: "txn:1",
    });
  });

  it("reports duplicate IDs, broken links, and end-head mismatches", () => {
    const first = transaction("txn:1", "2026-07-26T10:00:00.000Z");
    const duplicate = {
      ...first,
      previousCanonicalHash: first.canonicalHash,
      canonicalHash: hash(
        canonicalTransactionPayload({
          ...first,
          previousCanonicalHash: first.canonicalHash,
        }),
      ),
    };
    const oneHead: JournalChainHeadV1 = {
      schemaVersion: "1",
      chainId: "journal:global",
      version: 1,
      lastTransactionId: first.transactionId,
      canonicalHash: first.canonicalHash,
      updatedAt: first.recordedAt,
    };
    expect(
      verifyJournalChainSegment(GENESIS, [first, duplicate], oneHead, hash),
    ).toMatchObject({
      valid: false,
      checkedTransactions: 1,
      failureCode: "duplicate-transaction",
      firstInvalidTransactionId: "txn:1",
    });

    const broken = transaction(
      "txn:2",
      "2026-07-26T10:00:01.000Z",
      `sha256:${"f".repeat(64)}`,
    );
    expect(
      verifyJournalChainSegment(GENESIS, [first, broken], oneHead, hash),
    ).toMatchObject({
      valid: false,
      checkedTransactions: 1,
      failureCode: "previous-hash-mismatch",
      firstInvalidTransactionId: "txn:2",
    });

    expect(
      verifyJournalChainSegment(GENESIS, [first], GENESIS, hash),
    ).toMatchObject({
      valid: false,
      checkedTransactions: 1,
      failureCode: "end-head-mismatch",
    });
  });

  it("omits unsafe transaction identities and rejects malformed hash adapters", () => {
    const first = transaction("txn:1", "2026-07-26T10:00:00.000Z");
    const invalidIdentity = {
      ...first,
      transactionId: "raw user data with spaces",
    };
    const invalidResult = verifyJournalChainSegment(
      GENESIS,
      [invalidIdentity],
      GENESIS,
      hash,
    );
    expect(invalidResult).toMatchObject({
      valid: false,
      checkedTransactions: 0,
      failureCode: "invalid-transaction",
    });
    expect(invalidResult).not.toHaveProperty("firstInvalidTransactionId");

    expect(() =>
      verifyJournalChainSegment(
        GENESIS,
        [first],
        {
          schemaVersion: "1",
          chainId: "journal:global",
          version: 1,
          lastTransactionId: first.transactionId,
          canonicalHash: first.canonicalHash,
          updatedAt: first.recordedAt,
        },
        () => "not-a-canonical-hash",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});
