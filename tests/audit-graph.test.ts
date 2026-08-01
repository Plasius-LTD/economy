import { describe, expect, it } from "vitest";
import {
  advanceEconomyAuthorityHead,
  assertEconomyAuditGraph,
  canonicalAuditedEconomyCommandEnvelopePayload,
  canonicalEconomyAcceptedCommandReceiptPayload,
  canonicalEconomyAuthorityCommitManifestPayload,
  canonicalEconomyCommandResultReceiptPayload,
  canonicalTransactionPayload,
  serializeTokenSubunits,
  type AuditedEconomyCommandEnvelopeV1,
  type EconomyAuditGraphV1,
  type EconomyCommandResultReceiptV1,
} from "../src/index.js";
import {
  HASH_A,
  HASH_B,
  HASH_C,
  acceptedReceipt,
  authorityHead,
  authorityManifest,
  authorizationEvidence,
  createdReference,
  fingerprint,
  hash,
  providerAuditGraph,
} from "./audit-fixtures.js";

function firstPartyAuditGraph(): EconomyAuditGraphV1 {
  const command: AuditedEconomyCommandEnvelopeV1 = {
    schemaVersion: "1",
    commandId: "command:allocate:1",
    commandType: "allocate",
    commandSource: "browser",
    idempotencyFingerprint: fingerprint(
      "economy.idempotency-key.v1",
      "6",
    ),
    actorAccountId: "account:guardian",
    subjectAccountId: "account:guardian",
    principalType: "account",
    relationshipId: "relationship:household",
    authorizationVersion: 8,
    authorizationEvidence: authorizationEvidence(),
    routeId: "api:economy:allocations",
    buildId: "build:2026-07-26.1",
    correlationId: "correlation:allocation:1",
    payloadHash: HASH_A,
    acceptedAt: "2026-07-26T10:00:00.000Z",
    acceptedRegion: "uk-south",
    writerFencingToken: "fence:production:41",
  };
  const commandHash = hash(
    canonicalAuditedEconomyCommandEnvelopePayload(command),
  );
  const accepted = acceptedReceipt(command, {
    receiptId: "receipt:accepted:allocate:1",
  });
  const acceptedHash = hash(
    canonicalEconomyAcceptedCommandReceiptPayload(accepted),
  );
  const transactionBase = {
    schemaVersion: "1",
    transactionId: "transaction:allocate:1",
    activityType: "allocation",
    status: "settled",
    idempotencyKey: command.idempotencyFingerprint.digest,
    effectiveAt: "2026-07-26T10:00:00.000Z",
    recordedAt: "2026-07-26T10:00:00.000Z",
    metadata: {},
    postings: [
      {
        schemaVersion: "1",
        postingId: "posting:allocate:debit",
        transactionId: "transaction:allocate:1",
        accountId: "account:household-treasury",
        walletId: "wallet:household:1",
        amount: serializeTokenSubunits(-10_000n),
      },
      {
        schemaVersion: "1",
        postingId: "posting:allocate:credit",
        transactionId: "transaction:allocate:1",
        accountId: "account:child-allocation",
        walletId: "wallet:child:1",
        amount: serializeTokenSubunits(10_000n),
      },
    ],
  } as const;
  const transaction = {
    ...transactionBase,
    canonicalHash: hash(canonicalTransactionPayload(transactionBase)),
  };
  const result: EconomyCommandResultReceiptV1 = {
    schemaVersion: "1",
    receiptId: "receipt:completed:allocate:1",
    commandId: command.commandId,
    correlationId: command.correlationId,
    acceptedReceiptId: accepted.receiptId,
    commandEnvelopeHash: commandHash,
    outcome: "completed",
    resultHash: HASH_B,
    transactionId: transaction.transactionId,
    transactionCanonicalHash: transaction.canonicalHash,
    recordedAt: "2026-07-26T10:00:00.000Z",
  };
  const resultHash = hash(
    canonicalEconomyCommandResultReceiptPayload(result),
  );
  const manifest = authorityManifest(
    [
      createdReference("command-envelope", command.commandId, commandHash),
      createdReference(
        "accepted-receipt",
        accepted.receiptId,
        acceptedHash,
      ),
      createdReference("result-receipt", result.receiptId, resultHash),
      createdReference(
        "journal-transaction",
        transaction.transactionId,
        transaction.canonicalHash,
      ),
      createdReference(
        "balance-projection",
        "balance-projection:wallet:child:1",
        HASH_C,
      ),
      createdReference(
        "idempotency-result",
        "idempotency-result:allocate:1",
        HASH_A,
      ),
      createdReference("outbox-event", "outbox:allocate:1", HASH_B),
    ],
    {
      commitId: "authority-commit:allocate:1",
      commitKind: "first-party-command",
      commandId: command.commandId,
      correlationId: command.correlationId,
    },
  );
  const manifestHash = hash(
    canonicalEconomyAuthorityCommitManifestPayload(manifest),
  );
  const start = authorityHead();
  return {
    schemaVersion: "1",
    commandEnvelope: command,
    commandEnvelopeHash: commandHash,
    providerEvidence: [],
    operationalHandleBindings: [],
    acceptedReceipt: accepted,
    resultReceipt: result,
    transaction,
    startAuthorityHead: start,
    commits: [
      {
        schemaVersion: "1",
        manifest,
        canonicalHash: manifestHash,
      },
    ],
    expectedAuthorityHead: advanceEconomyAuthorityHead(
      start,
      manifest,
      manifestHash,
    ),
  };
}

function walletInitializationAuditGraph(
  noOpCode = "WALLET_INITIALIZED",
): EconomyAuditGraphV1 {
  const base = firstPartyAuditGraph();
  const {
    relationshipId: _relationshipId,
    authorizationVersion: _authorizationVersion,
    ...baseCommand
  } = base.commandEnvelope;
  const command: AuditedEconomyCommandEnvelopeV1 = {
    ...baseCommand,
    commandId: "command:wallet-initialization:1",
    commandType: "initialize-wallet",
    routeId: "api:economy:wallet-initialization",
    correlationId: "correlation:wallet-initialization:1",
  };
  const commandHash = hash(
    canonicalAuditedEconomyCommandEnvelopePayload(command),
  );
  const accepted = acceptedReceipt(command, {
    receiptId: "receipt:accepted:wallet-initialization:1",
  });
  const acceptedHash = hash(
    canonicalEconomyAcceptedCommandReceiptPayload(accepted),
  );
  const result: EconomyCommandResultReceiptV1 = {
    schemaVersion: "1",
    receiptId: "receipt:result:wallet-initialization:1",
    commandId: command.commandId,
    correlationId: command.correlationId,
    acceptedReceiptId: accepted.receiptId,
    commandEnvelopeHash: commandHash,
    outcome: "no-op",
    resultHash: HASH_B,
    noOpCode,
    recordedAt: command.acceptedAt,
  };
  const resultHash = hash(
    canonicalEconomyCommandResultReceiptPayload(result),
  );
  const manifest = authorityManifest(
    [
      createdReference("command-envelope", command.commandId, commandHash),
      createdReference("accepted-receipt", accepted.receiptId, acceptedHash),
      createdReference("result-receipt", result.receiptId, resultHash),
      createdReference("wallet", "wallet-descriptor:personal:1", HASH_A),
      createdReference("balance-projection", "wallet-balance:personal:1", HASH_B),
      createdReference("lifetime-projection", "wallet-lifetime:personal:1", HASH_C),
      createdReference("idempotency-result", "idempotency:wallet:1", HASH_A),
      createdReference("outbox-event", "outbox:wallet-initialized:1", HASH_B),
    ],
    {
      commitId: "authority-commit:wallet-initialization:1",
      commitKind: "first-party-command",
      commandId: command.commandId,
      correlationId: command.correlationId,
    },
  );
  const manifestHash = hash(
    canonicalEconomyAuthorityCommitManifestPayload(manifest),
  );
  return {
    schemaVersion: "1",
    commandEnvelope: command,
    commandEnvelopeHash: commandHash,
    providerEvidence: [],
    operationalHandleBindings: [],
    acceptedReceipt: accepted,
    resultReceipt: result,
    startAuthorityHead: base.startAuthorityHead,
    commits: [{ schemaVersion: "1", manifest, canonicalHash: manifestHash }],
    expectedAuthorityHead: advanceEconomyAuthorityHead(
      base.startAuthorityHead,
      manifest,
      manifestHash,
    ),
  };
}

describe("cross-record economy audit graph", () => {
  it("validates a provider acceptance and reconciled result across two ACID boundaries", () => {
    expect(() =>
      assertEconomyAuditGraph(providerAuditGraph(), hash),
    ).not.toThrow();
  });

  it("validates a first-party command only when acceptance and result share one boundary", () => {
    expect(() =>
      assertEconomyAuditGraph(firstPartyAuditGraph(), hash),
    ).not.toThrow();
    const graph = firstPartyAuditGraph();
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          resultReceipt: undefined,
          transaction: undefined,
        } as never,
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          transaction: {
            ...graph.transaction!,
            activityType: "adjustment",
          },
        },
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("binds wallet initialization records without inventing an economic transaction", () => {
    expect(() =>
      assertEconomyAuditGraph(walletInitializationAuditGraph(), hash),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuditGraph(
        walletInitializationAuditGraph("UNRELATED_NO_OP"),
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("accepts a durably staged provider workflow before external reconciliation", () => {
    const graph = providerAuditGraph();
    const acceptanceCommit = graph.commits[0]!;
    const expectedAuthorityHead = advanceEconomyAuthorityHead(
      graph.startAuthorityHead,
      acceptanceCommit.manifest,
      acceptanceCommit.canonicalHash,
    );
    const staged: EconomyAuditGraphV1 = {
      schemaVersion: "1",
      commandEnvelope: graph.commandEnvelope,
      commandEnvelopeHash: graph.commandEnvelopeHash,
      providerEvidenceManifest: graph.providerEvidenceManifest!,
      providerEvidence: graph.providerEvidence,
      operationalHandleBindings: graph.operationalHandleBindings,
      acceptedReceipt: graph.acceptedReceipt,
      startAuthorityHead: graph.startAuthorityHead,
      commits: [acceptanceCommit],
      expectedAuthorityHead,
    };
    expect(() => assertEconomyAuditGraph(staged, hash)).not.toThrow();
  });

  it("rejects mismatched provider, causation, manifest, and handle edges", () => {
    const graph = providerAuditGraph();
    for (const invalid of [
      {
        ...graph,
        commandEnvelope: {
          ...graph.commandEnvelope,
          providerEvidenceManifestHash: HASH_A,
        },
      },
      {
        ...graph,
        providerEvidence: [
          { ...graph.providerEvidence[0]!, provider: "ayet" as const },
        ],
      },
      {
        ...graph,
        operationalHandleBindings: [],
      },
      {
        ...graph,
        commandEnvelope: {
          ...graph.commandEnvelope,
          causation: {
            schemaVersion: "1" as const,
            kind: "provider-event" as const,
            causationId: "provider-event:absent",
          },
        },
      },
    ]) {
      expect(() =>
        assertEconomyAuditGraph(invalid, hash),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("rejects receipt, transaction, and raw-idempotency mismatches", () => {
    const graph = providerAuditGraph();
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          acceptedReceipt: {
            ...graph.acceptedReceipt,
            correlationId: "correlation:other",
          },
        },
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          transaction: {
            ...graph.transaction!,
            idempotencyKey: "raw-idempotency-key",
          },
        },
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          resultReceipt: {
            ...graph.resultReceipt!,
            transactionCanonicalHash: HASH_A,
          },
        },
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("rejects commit tampering, broken links, and stale expected heads", () => {
    const graph = providerAuditGraph();
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          commits: [
            {
              ...graph.commits[0]!,
              canonicalHash: HASH_A,
            },
            graph.commits[1]!,
          ],
        },
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuditGraph(
        {
          ...graph,
          expectedAuthorityHead: graph.startAuthorityHead,
        },
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("rejects malformed hash adapters instead of treating them as graph mismatches", () => {
    expect(() =>
      assertEconomyAuditGraph(providerAuditGraph(), () => "not-a-hash"),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});
