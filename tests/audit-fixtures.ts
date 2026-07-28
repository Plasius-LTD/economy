import { createHash } from "node:crypto";
import {
  advanceEconomyAuthorityHead,
  canonicalAuditedEconomyCommandEnvelopePayload,
  canonicalEconomyAcceptedCommandReceiptPayload,
  canonicalEconomyAuthorityCommitManifestPayload,
  canonicalEconomyCommandResultReceiptPayload,
  canonicalEconomyEncryptedOperationalHandleBindingPayload,
  canonicalEconomyProviderEvidenceHashPayload,
  canonicalEconomyProviderEvidenceManifestPayload,
  canonicalTransactionPayload,
  serializeTokenSubunits,
  sortEconomyAuthorityRecordReferences,
  type AuditedEconomyCommandEnvelopeV1,
  type EconomyAcceptedCommandReceiptV1,
  type EconomyAuditGraphV1,
  type EconomyAuthorityCommitManifestV1,
  type EconomyAuthorityHeadV1,
  type EconomyAuthorityRecordKindV1,
  type EconomyAuthorityRecordReferenceV1,
  type EconomyCommandResultReceiptV1,
  type EconomyEncryptedOperationalHandleBindingV1,
  type EconomyHmacFingerprintDomainV1,
  type EconomyHmacFingerprintV1,
  type EconomyProviderEvidenceHashV1,
  type EconomyProviderEvidenceManifestV1,
} from "../src/index.js";

export const HASH_A = `sha256:${"a".repeat(64)}`;
export const HASH_B = `sha256:${"b".repeat(64)}`;
export const HASH_C = `sha256:${"c".repeat(64)}`;
export const HASH_D = `sha256:${"d".repeat(64)}`;

export function hash(payload: string): string {
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

export function fingerprint(
  domain: EconomyHmacFingerprintDomainV1,
  character = "1",
): EconomyHmacFingerprintV1 {
  return {
    schemaVersion: "1",
    fingerprintVersion: "1",
    algorithm: "hmac-sha256",
    domain,
    keyVersion: "key:2026-07",
    digest: `hmac-sha256:${character.repeat(64)}`,
  };
}

export function authorizationEvidence() {
  return {
    schemaVersion: "1",
    capabilityEvidenceHash: HASH_A,
    featureFlagEvidenceHash: HASH_B,
    assuranceEvidenceHash: HASH_C,
    authenticatedAt: "2026-07-26T09:59:00.000Z",
    authorizedAt: "2026-07-26T09:59:59.000Z",
  } as const;
}

export function providerEvidence(
  overrides: Partial<EconomyProviderEvidenceHashV1> = {},
): EconomyProviderEvidenceHashV1 {
  return {
    schemaVersion: "1",
    providerEventId: "provider-event:paid:1",
    commandId: "command:purchase:1",
    provider: "shopify",
    providerObjectKeyFingerprint: fingerprint(
      "economy.provider-object-key.v1",
      "2",
    ),
    providerEventKeyFingerprint: fingerprint(
      "economy.provider-event-key.v1",
      "3",
    ),
    eventType: "orders.paid",
    payloadFingerprint: fingerprint(
      "economy.provider-payload.v1",
      "4",
    ),
    reconciliationEvidenceFingerprint: fingerprint(
      "economy.provider-reconciliation.v1",
      "5",
    ),
    signatureScheme: "shopify.hmac-sha256",
    signatureVerifiedAt: "2026-07-26T09:59:58.000Z",
    providerOccurredAt: "2026-07-26T09:59:55.000Z",
    receivedAt: "2026-07-26T10:00:00.000Z",
    operationalHandleBindingId: "handle-binding:shopify:1",
    ...overrides,
  };
}

export function encryptedHandle(
  overrides: Partial<EconomyEncryptedOperationalHandleBindingV1> = {},
): EconomyEncryptedOperationalHandleBindingV1 {
  return {
    schemaVersion: "1",
    handleBindingId: "handle-binding:shopify:1",
    commandId: "command:purchase:1",
    provider: "shopify",
    purpose: "reconciliation",
    cipherSuite: "AES-256-GCM",
    keyVersion: "key:provider-handles:7",
    ciphertextContentHash: HASH_A,
    encryptionContextHash: HASH_B,
    createdAt: "2026-07-26T10:00:00.000Z",
    ...overrides,
  };
}

export function providerManifest(
  evidence: EconomyProviderEvidenceHashV1,
  handle: EconomyEncryptedOperationalHandleBindingV1,
  overrides: Partial<EconomyProviderEvidenceManifestV1> = {},
): EconomyProviderEvidenceManifestV1 {
  return {
    schemaVersion: "1",
    evidenceManifestId: "evidence-manifest:shopify:1",
    commandId: "command:purchase:1",
    provider: "shopify",
    evidenceReferences: [
      {
        schemaVersion: "1",
        recordId: evidence.providerEventId,
        contentHash: hash(
          canonicalEconomyProviderEvidenceHashPayload(evidence),
        ),
      },
    ],
    operationalHandleReferences: [
      {
        schemaVersion: "1",
        recordId: handle.handleBindingId,
        contentHash: hash(
          canonicalEconomyEncryptedOperationalHandleBindingPayload(handle),
        ),
      },
    ],
    createdAt: "2026-07-26T10:00:00.000Z",
    ...overrides,
  };
}

export function auditedProviderCommand(
  manifest: EconomyProviderEvidenceManifestV1,
  overrides: Partial<AuditedEconomyCommandEnvelopeV1> = {},
): AuditedEconomyCommandEnvelopeV1 {
  return {
    schemaVersion: "1",
    commandId: "command:purchase:1",
    commandType: "credit-purchase",
    commandSource: "shopify",
    idempotencyFingerprint: fingerprint(
      "economy.idempotency-key.v1",
      "1",
    ),
    actorAccountId: "account:economy-service",
    subjectAccountId: "account:guardian",
    principalType: "service",
    relationshipId: "relationship:household",
    authorizationVersion: 7,
    authorizationEvidence: authorizationEvidence(),
    routeId: "webhook:shopify:orders-paid",
    buildId: "build:2026-07-26.1",
    correlationId: "correlation:checkout:1",
    causation: {
      schemaVersion: "1",
      kind: "provider-event",
      causationId: "provider-event:paid:1",
    },
    payloadHash: HASH_D,
    providerEvidenceManifestHash: hash(
      canonicalEconomyProviderEvidenceManifestPayload(manifest),
    ),
    acceptedAt: "2026-07-26T10:00:00.000Z",
    acceptedRegion: "uk-south",
    writerFencingToken: "fence:production:41",
    ...overrides,
  };
}

export function acceptedReceipt(
  command: AuditedEconomyCommandEnvelopeV1,
  overrides: Partial<EconomyAcceptedCommandReceiptV1> = {},
): EconomyAcceptedCommandReceiptV1 {
  return {
    schemaVersion: "1",
    receiptId: "receipt:accepted:1",
    commandId: command.commandId,
    correlationId: command.correlationId,
    commandEnvelopeHash: hash(
      canonicalAuditedEconomyCommandEnvelopePayload(command),
    ),
    acceptedAt: command.acceptedAt,
    ...overrides,
  };
}

export function completedReceipt(
  command: AuditedEconomyCommandEnvelopeV1,
  accepted: EconomyAcceptedCommandReceiptV1,
  overrides: Partial<EconomyCommandResultReceiptV1> = {},
): EconomyCommandResultReceiptV1 {
  return {
    schemaVersion: "1",
    receiptId: "receipt:completed:1",
    commandId: command.commandId,
    correlationId: command.correlationId,
    acceptedReceiptId: accepted.receiptId,
    commandEnvelopeHash: accepted.commandEnvelopeHash,
    outcome: "completed",
    resultHash: HASH_D,
    transactionId: "transaction:purchase:1",
    transactionCanonicalHash: HASH_A,
    recordedAt: "2026-07-26T10:00:02.000Z",
    ...overrides,
  };
}

export function authorityHead(
  overrides: Partial<EconomyAuthorityHeadV1> = {},
): EconomyAuthorityHeadV1 {
  return {
    schemaVersion: "1",
    authorityId: "economy:authority:global",
    version: "1",
    state: "open",
    lastCommitId: "authority-commit:genesis",
    lastCommitHash: HASH_C,
    writerRegion: "uk-south",
    writerFencingToken: "fence:production:41",
    updatedAt: "2026-07-26T09:59:59.000Z",
    ...overrides,
  };
}

export function createdReference(
  recordKind: EconomyAuthorityRecordKindV1,
  recordId: string,
  contentHash: string,
): EconomyAuthorityRecordReferenceV1 {
  return {
    schemaVersion: "1",
    recordKind,
    recordId,
    writeKind: "create",
    contentHash,
  };
}

export function authorityManifest(
  references: readonly EconomyAuthorityRecordReferenceV1[],
  overrides: Partial<EconomyAuthorityCommitManifestV1> = {},
): EconomyAuthorityCommitManifestV1 {
  return {
    schemaVersion: "1",
    commitId: "authority-commit:2",
    authorityId: "economy:authority:global",
    sequence: "2",
    commitKind: "provider-acceptance",
    previousCommitHash: HASH_C,
    commandId: "command:purchase:1",
    correlationId: "correlation:checkout:1",
    authorityStateBefore: "open",
    authorityStateAfter: "open",
    writerRegion: "uk-south",
    writerFencingToken: "fence:production:41",
    recordReferences: sortEconomyAuthorityRecordReferences(references),
    committedAt: "2026-07-26T10:00:00.000Z",
    ...overrides,
  };
}

export function providerAuditGraph(): EconomyAuditGraphV1 {
  const evidence = providerEvidence();
  const handle = encryptedHandle();
  const evidenceManifest = providerManifest(evidence, handle);
  const command = auditedProviderCommand(evidenceManifest);
  const accepted = acceptedReceipt(command);
  const commandHash = accepted.commandEnvelopeHash;
  const acceptedHash = hash(
    canonicalEconomyAcceptedCommandReceiptPayload(accepted),
  );
  const acceptanceManifest = authorityManifest([
    createdReference("command-envelope", command.commandId, commandHash),
    createdReference(
      "provider-evidence-manifest",
      evidenceManifest.evidenceManifestId,
      command.providerEvidenceManifestHash!,
    ),
    createdReference(
      "provider-evidence",
      evidence.providerEventId,
      evidenceManifest.evidenceReferences[0]!.contentHash,
    ),
    createdReference(
      "operational-handle-binding",
      handle.handleBindingId,
      evidenceManifest.operationalHandleReferences[0]!.contentHash,
    ),
    createdReference(
      "accepted-receipt",
      accepted.receiptId,
      acceptedHash,
    ),
    createdReference("work-item", "work-item:shopify:1", HASH_B),
  ]);
  const acceptanceHash = hash(
    canonicalEconomyAuthorityCommitManifestPayload(acceptanceManifest),
  );
  const afterAcceptance = advanceEconomyAuthorityHead(
    authorityHead(),
    acceptanceManifest,
    acceptanceHash,
  );

  const transactionBase = {
    schemaVersion: "1",
    transactionId: "transaction:purchase:1",
    activityType: "purchase",
    status: "settled",
    idempotencyKey: command.idempotencyFingerprint.digest,
    providerEventId: evidence.providerEventId,
    effectiveAt: "2026-07-26T10:00:01.000Z",
    recordedAt: "2026-07-26T10:00:02.000Z",
    metadata: { catalogVersion: "gbp-v1" },
    postings: [
      {
        schemaVersion: "1",
        postingId: "posting:purchase:debit",
        transactionId: "transaction:purchase:1",
        accountId: "account:purchase-clearing",
        amount: serializeTokenSubunits(-50_000n),
      },
      {
        schemaVersion: "1",
        postingId: "posting:purchase:credit",
        transactionId: "transaction:purchase:1",
        accountId: "account:household-treasury",
        walletId: "wallet:household:1",
        amount: serializeTokenSubunits(50_000n),
      },
    ],
  } as const;
  const transaction = {
    ...transactionBase,
    canonicalHash: hash(canonicalTransactionPayload(transactionBase)),
  };
  const result = completedReceipt(command, accepted, {
    transactionId: transaction.transactionId,
    transactionCanonicalHash: transaction.canonicalHash,
  });
  const resultHash = hash(
    canonicalEconomyCommandResultReceiptPayload(result),
  );
  const resultManifest = authorityManifest(
    [
      createdReference("result-receipt", result.receiptId, resultHash),
      createdReference(
        "journal-transaction",
        transaction.transactionId,
        transaction.canonicalHash,
      ),
      createdReference(
        "balance-projection",
        "balance-projection:wallet:household:1",
        HASH_B,
      ),
      createdReference(
        "lifetime-projection",
        "lifetime-projection:wallet:household:1",
        HASH_C,
      ),
      createdReference(
        "idempotency-result",
        "idempotency-result:purchase:1",
        HASH_D,
      ),
      createdReference("outbox-event", "outbox:purchase:1", HASH_A),
    ],
    {
      commitId: "authority-commit:3",
      sequence: "3",
      commitKind: "provider-result",
      previousCommitHash: acceptanceHash,
      committedAt: "2026-07-26T10:00:02.000Z",
    },
  );
  const resultManifestHash = hash(
    canonicalEconomyAuthorityCommitManifestPayload(resultManifest),
  );
  const expectedAuthorityHead = advanceEconomyAuthorityHead(
    afterAcceptance,
    resultManifest,
    resultManifestHash,
  );

  return {
    schemaVersion: "1",
    commandEnvelope: command,
    commandEnvelopeHash: commandHash,
    providerEvidenceManifest: evidenceManifest,
    providerEvidence: [evidence],
    operationalHandleBindings: [handle],
    acceptedReceipt: accepted,
    resultReceipt: result,
    transaction,
    startAuthorityHead: authorityHead(),
    commits: [
      {
        schemaVersion: "1",
        manifest: acceptanceManifest,
        canonicalHash: acceptanceHash,
      },
      {
        schemaVersion: "1",
        manifest: resultManifest,
        canonicalHash: resultManifestHash,
      },
    ],
    expectedAuthorityHead,
  };
}
