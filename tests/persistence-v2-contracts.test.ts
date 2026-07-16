import { describe, expect, it } from "vitest";
import {
  advanceJournalChainHead,
  assertEconomicJournalTransaction,
  assertEconomyCommandEnvelope,
  assertEconomyIdempotencyScope,
  assertEconomyCommandWorkflowEvent,
  assertJournalChainHead,
  assertScopedPersistedIdempotencyResult,
  serializeTokenSubunits,
  type ChainedEconomicJournalTransactionV1,
  type EconomyCommandEnvelopeV1,
  type EconomyPersistencePortV2,
  type JournalChainHeadV1,
  type LedgerTransactionV1,
} from "../src/index.js";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function transaction(
  overrides: Partial<LedgerTransactionV1> = {},
): LedgerTransactionV1 {
  return {
    schemaVersion: "1",
    transactionId: "txn:1",
    activityType: "purchase",
    status: "settled",
    idempotencyKey: "idem:1",
    effectiveAt: "2026-07-15T10:00:00.000Z",
    recordedAt: "2026-07-15T10:00:01.000Z",
    metadata: {},
    postings: [
      {
        schemaVersion: "1",
        postingId: "posting:debit",
        transactionId: "txn:1",
        accountId: "account:clearing",
        amount: serializeTokenSubunits(-1_000n),
      },
      {
        schemaVersion: "1",
        postingId: "posting:credit",
        transactionId: "txn:1",
        accountId: "account:wallet",
        walletId: "wallet:1",
        amount: serializeTokenSubunits(1_000n),
      },
    ],
    ...overrides,
  };
}

function command(
  overrides: Partial<EconomyCommandEnvelopeV1> = {},
): EconomyCommandEnvelopeV1 {
  return {
    schemaVersion: "1",
    commandId: "command:1",
    commandType: "credit-purchase",
    idempotencyKey: "idem:1",
    actorAccountId: "account:guardian",
    subjectAccountId: "account:guardian",
    payloadHash: HASH_A,
    acceptedAt: "2026-07-15T10:00:00.000Z",
    acceptedRegion: "uk-south",
    writerFencingToken: "fence:41",
    ...overrides,
  };
}

describe("V2 journal and command separation", () => {
  it("accepts only economically effective statuses at the V2 journal boundary", () => {
    expect(() => assertEconomicJournalTransaction(transaction())).not.toThrow();
    expect(() =>
      assertEconomicJournalTransaction(transaction({ status: "held" })),
    ).not.toThrow();
    for (const status of ["pending", "failed", "reversed"] as const) {
      expect(() =>
        assertEconomicJournalTransaction(transaction({ status })),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("validates accepted commands and immutable workflow outcomes separately", () => {
    expect(() => assertEconomyCommandEnvelope(command())).not.toThrow();
    expect(() =>
      assertEconomyCommandEnvelope(
        command({
          relationshipId: "relationship:1",
          authorizationVersion: 2,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyCommandEnvelope(
        command({ relationshipId: "relationship:1" }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyCommandEnvelope(command({ payloadHash: "browser-value" })),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    expect(() =>
      assertEconomyIdempotencyScope({
        schemaVersion: "1",
        idempotencyKey: "idem:1",
        commandType: "credit-purchase",
        actorAccountId: "account:guardian",
        subjectAccountId: "account:guardian",
      }),
    ).not.toThrow();
    expect(() =>
      assertEconomyIdempotencyScope({
        schemaVersion: "1",
        idempotencyKey: "idem:1",
        commandType: "browser-command" as never,
        actorAccountId: "account:guardian",
        subjectAccountId: "account:guardian",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertScopedPersistedIdempotencyResult({
        schemaVersion: "1",
        commandId: "command:1",
        transactionId: "txn:1",
        responseHash: HASH_B,
        recordedAt: "2026-07-15T10:01:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      assertScopedPersistedIdempotencyResult({
        schemaVersion: "1",
        commandId: "command:1",
        transactionId: "txn:1",
        responseHash: "browser-response",
        recordedAt: "2026-07-15T10:01:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    expect(() =>
      assertEconomyCommandWorkflowEvent({
        schemaVersion: "1",
        workflowEventId: "workflow:1",
        commandId: "command:1",
        state: "failed",
        failureCode: "provider-timeout",
        occurredAt: "2026-07-15T10:01:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      assertEconomyCommandWorkflowEvent({
        schemaVersion: "1",
        workflowEventId: "workflow:2",
        commandId: "command:1",
        state: "completed",
        failureCode: "not-applicable",
        occurredAt: "2026-07-15T10:01:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("locked canonical chain head", () => {
  const genesis: JournalChainHeadV1 = {
    schemaVersion: "1",
    chainId: "journal:global",
    version: 0,
    updatedAt: "2026-07-15T09:59:00.000Z",
  };

  it("advances a genesis and populated head exactly once", () => {
    const first = {
      ...transaction({ canonicalHash: HASH_A }),
      canonicalHash: HASH_A,
    } as ChainedEconomicJournalTransactionV1;
    const firstHead = advanceJournalChainHead(genesis, first);
    expect(firstHead).toEqual({
      schemaVersion: "1",
      chainId: "journal:global",
      version: 1,
      lastTransactionId: "txn:1",
      canonicalHash: HASH_A,
      updatedAt: "2026-07-15T10:00:01.000Z",
    });

    const second = {
      ...transaction({
        transactionId: "txn:2",
        idempotencyKey: "idem:2",
        previousCanonicalHash: HASH_A,
        canonicalHash: HASH_B,
        postings: [
          {
            schemaVersion: "1",
            postingId: "posting:2:debit",
            transactionId: "txn:2",
            accountId: "account:clearing",
            amount: serializeTokenSubunits(-1_000n),
          },
          {
            schemaVersion: "1",
            postingId: "posting:2:credit",
            transactionId: "txn:2",
            accountId: "account:wallet",
            walletId: "wallet:1",
            amount: serializeTokenSubunits(1_000n),
          },
        ],
      }),
      canonicalHash: HASH_B,
    } as ChainedEconomicJournalTransactionV1;
    expect(advanceJournalChainHead(firstHead, second).version).toBe(2);
  });

  it("rejects malformed or stale chain extensions", () => {
    expect(() =>
      assertJournalChainHead({
        ...genesis,
        version: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    const stale = {
      ...transaction({
        previousCanonicalHash: HASH_B,
        canonicalHash: HASH_A,
      }),
      canonicalHash: HASH_A,
    } as ChainedEconomicJournalTransactionV1;
    expect(() => advanceJournalChainHead(genesis, stale)).toThrowError(
      expect.objectContaining({ code: "INVALID_CONTRACT" }),
    );
    const tooEarly = {
      ...transaction({
        recordedAt: "2026-07-15T09:58:00.000Z",
        effectiveAt: "2026-07-15T09:57:00.000Z",
        canonicalHash: HASH_A,
      }),
      canonicalHash: HASH_A,
    } as ChainedEconomicJournalTransactionV1;
    expect(() => advanceJournalChainHead(genesis, tooEarly)).toThrowError(
      expect.objectContaining({ code: "INVALID_TIME_WINDOW" }),
    );
  });
});

describe("V2 persistence type surface", () => {
  it("keeps query reads out of the serializable mutation boundary", () => {
    const acceptsPort = (port: EconomyPersistencePortV2): EconomyPersistencePortV2 =>
      port;
    expect(typeof acceptsPort).toBe("function");
  });
});
