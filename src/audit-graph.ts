import {
  assertAuditedEconomyCommandEnvelope,
  assertEconomyAcceptedCommandReceipt,
  assertEconomyCommandResultReceipt,
  assertEconomyEncryptedOperationalHandleBinding,
  assertEconomyProviderEvidenceHash,
  assertEconomyProviderEvidenceManifest,
  canonicalAuditedEconomyCommandEnvelopePayload,
  canonicalEconomyAcceptedCommandReceiptPayload,
  canonicalEconomyCommandResultReceiptPayload,
  canonicalEconomyEncryptedOperationalHandleBindingPayload,
  canonicalEconomyProviderEvidenceHashPayload,
  canonicalEconomyProviderEvidenceManifestPayload,
  type AuditedEconomyCommandEnvelopeV1,
  type EconomyAcceptedCommandReceiptV1,
  type EconomyEncryptedOperationalHandleBindingV1,
  type EconomyProviderEvidenceHashV1,
  type EconomyProviderEvidenceManifestV1,
  type EconomyCommandResultReceiptV1,
} from "./audit.js";
import {
  advanceEconomyAuthorityHead,
  assertEconomyAuthorityCommitManifest,
  assertEconomyAuthorityHead,
  canonicalEconomyAuthorityCommitManifestPayload,
  type EconomyAuthorityCommitManifestV1,
  type EconomyAuthorityHeadV1,
  type EconomyAuthorityRecordKindV1,
  type EconomyAuthorityRecordReferenceV1,
  type HashedEconomyAuthorityCommitManifestV1,
} from "./authority.js";
import {
  ECONOMY_CONTRACT_VERSION,
  type EconomyContractVersion,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { CanonicalPayloadHashFunctionV1 } from "./integrity.js";
import {
  assertEconomicJournalTransaction,
  canonicalTransactionPayload,
  type ActivityType,
  type EconomicJournalTransactionV1,
} from "./ledger.js";

/** Complete bounded record graph for one accepted authoritative command. */
export interface EconomyAuditGraphV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commandEnvelope: AuditedEconomyCommandEnvelopeV1;
  readonly commandEnvelopeHash: string;
  readonly providerEvidenceManifest?: EconomyProviderEvidenceManifestV1;
  readonly providerEvidence: readonly EconomyProviderEvidenceHashV1[];
  readonly operationalHandleBindings: readonly EconomyEncryptedOperationalHandleBindingV1[];
  readonly acceptedReceipt: EconomyAcceptedCommandReceiptV1;
  readonly resultReceipt?: EconomyCommandResultReceiptV1;
  readonly transaction?: EconomicJournalTransactionV1 & {
    readonly canonicalHash: string;
  };
  readonly startAuthorityHead: EconomyAuthorityHeadV1;
  readonly commits: readonly HashedEconomyAuthorityCommitManifestV1[];
  readonly expectedAuthorityHead: EconomyAuthorityHeadV1;
}

function assertCanonicalHash(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function hashCanonicalPayload(
  payload: string,
  hash: CanonicalPayloadHashFunctionV1,
  label: string,
): string {
  const canonicalHash = hash(payload);
  assertCanonicalHash(canonicalHash, label);
  return canonicalHash;
}

function findReference(
  manifest: EconomyAuthorityCommitManifestV1,
  kind: EconomyAuthorityRecordKindV1,
  id: string,
): EconomyAuthorityRecordReferenceV1 | undefined {
  return manifest.recordReferences.find(
    (reference) =>
      reference.recordKind === kind && reference.recordId === id,
  );
}

function assertCreatedReference(
  manifest: EconomyAuthorityCommitManifestV1,
  kind: EconomyAuthorityRecordKindV1,
  id: string,
  contentHash: string,
): void {
  const reference = findReference(manifest, kind, id);
  economyAssert(
    reference !== undefined &&
      reference.writeKind === "create" &&
      reference.contentHash === contentHash,
    "INVALID_CONTRACT",
    `Authority commit does not bind the expected ${kind} record`,
  );
}

function assertProviderGraph(
  graph: EconomyAuditGraphV1,
  hash: CanonicalPayloadHashFunctionV1,
  acceptanceCommit: EconomyAuthorityCommitManifestV1,
): void {
  const envelope = graph.commandEnvelope;
  const providerSource =
    envelope.commandSource === "shopify" ||
    envelope.commandSource === "ayet" ||
    envelope.commandSource === "bitlabs";

  if (!providerSource) {
    economyAssert(
      graph.providerEvidenceManifest === undefined &&
        graph.providerEvidence.length === 0 &&
        graph.operationalHandleBindings.length === 0,
      "INVALID_CONTRACT",
      "First-party command graphs cannot carry provider evidence",
    );
    return;
  }

  const manifest = graph.providerEvidenceManifest;
  economyAssert(
    manifest !== undefined &&
      manifest.commandId === envelope.commandId &&
      manifest.provider === envelope.commandSource &&
      graph.providerEvidence.length > 0,
    "INVALID_CONTRACT",
    "Provider command graph is missing its matching evidence manifest",
  );
  assertEconomyProviderEvidenceManifest(manifest);
  economyAssert(
    Date.parse(manifest.createdAt) <= Date.parse(envelope.acceptedAt),
    "INVALID_TIME_WINDOW",
    "Provider evidence manifest cannot be created after command acceptance",
  );
  const manifestHash = hashCanonicalPayload(
    canonicalEconomyProviderEvidenceManifestPayload(manifest),
    hash,
    "Provider evidence manifest hash",
  );
  economyAssert(
    envelope.providerEvidenceManifestHash === manifestHash,
    "INVALID_CONTRACT",
    "Provider evidence manifest does not match the command envelope",
  );
  assertCreatedReference(
    acceptanceCommit,
    "provider-evidence-manifest",
    manifest.evidenceManifestId,
    manifestHash,
  );

  const evidenceById = new Map<string, EconomyProviderEvidenceHashV1>();
  for (const evidence of graph.providerEvidence) {
    assertEconomyProviderEvidenceHash(evidence);
    economyAssert(
      evidence.commandId === envelope.commandId &&
        evidence.provider === envelope.commandSource &&
        !evidenceById.has(evidence.providerEventId),
      "INVALID_CONTRACT",
      "Provider evidence has a mismatched or duplicate graph identity",
    );
    evidenceById.set(evidence.providerEventId, evidence);
    economyAssert(
      Date.parse(evidence.receivedAt) <= Date.parse(manifest.createdAt),
      "INVALID_TIME_WINDOW",
      "Provider evidence must be received before its manifest is created",
    );
  }
  economyAssert(
    envelope.causation?.kind === "provider-event" &&
      evidenceById.has(envelope.causation.causationId),
    "INVALID_CONTRACT",
    "Provider command causation must reference included provider evidence",
  );
  economyAssert(
    manifest.evidenceReferences.length === evidenceById.size,
    "INVALID_CONTRACT",
    "Provider evidence manifest does not cover the exact evidence set",
  );
  for (const reference of manifest.evidenceReferences) {
    const evidence = evidenceById.get(reference.recordId);
    economyAssert(
      evidence !== undefined,
      "INVALID_CONTRACT",
      "Provider evidence manifest references an absent record",
    );
    const contentHash = hashCanonicalPayload(
      canonicalEconomyProviderEvidenceHashPayload(evidence),
      hash,
      "Provider evidence content hash",
    );
    economyAssert(
      reference.contentHash === contentHash,
      "INVALID_CONTRACT",
      "Provider evidence content hash does not match its manifest",
    );
    assertCreatedReference(
      acceptanceCommit,
      "provider-evidence",
      evidence.providerEventId,
      contentHash,
    );
  }

  const handlesById = new Map<
    string,
    EconomyEncryptedOperationalHandleBindingV1
  >();
  for (const binding of graph.operationalHandleBindings) {
    assertEconomyEncryptedOperationalHandleBinding(binding);
    economyAssert(
      binding.commandId === envelope.commandId &&
        binding.provider === envelope.commandSource &&
        !handlesById.has(binding.handleBindingId),
      "INVALID_CONTRACT",
      "Operational handle has a mismatched or duplicate graph identity",
    );
    handlesById.set(binding.handleBindingId, binding);
    economyAssert(
      Date.parse(binding.createdAt) <= Date.parse(manifest.createdAt),
      "INVALID_TIME_WINDOW",
      "Encrypted handle binding cannot postdate its evidence manifest",
    );
  }
  economyAssert(
    manifest.operationalHandleReferences.length === handlesById.size,
    "INVALID_CONTRACT",
    "Provider evidence manifest does not cover the exact handle set",
  );
  for (const reference of manifest.operationalHandleReferences) {
    const binding = handlesById.get(reference.recordId);
    economyAssert(
      binding !== undefined,
      "INVALID_CONTRACT",
      "Provider evidence manifest references an absent handle binding",
    );
    const contentHash = hashCanonicalPayload(
      canonicalEconomyEncryptedOperationalHandleBindingPayload(binding),
      hash,
      "Operational-handle binding hash",
    );
    economyAssert(
      reference.contentHash === contentHash,
      "INVALID_CONTRACT",
      "Operational-handle binding does not match its evidence manifest",
    );
    assertCreatedReference(
      acceptanceCommit,
      "operational-handle-binding",
      binding.handleBindingId,
      contentHash,
    );
  }
  for (const evidence of graph.providerEvidence) {
    economyAssert(
      evidence.operationalHandleBindingId === undefined ||
        handlesById.has(evidence.operationalHandleBindingId),
      "INVALID_CONTRACT",
      "Provider evidence references an absent encrypted handle binding",
    );
  }
}

function expectedTransactionActivityTypes(
  envelope: AuditedEconomyCommandEnvelopeV1,
): ReadonlySet<ActivityType> {
  if (envelope.commandType === "credit-purchase") {
    return new Set(["purchase"]);
  }
  if (envelope.commandType === "credit-subscription") {
    return new Set(["subscription"]);
  }
  if (envelope.commandType === "credit-reward") {
    return new Set([
      envelope.commandSource === "ayet" ? "rewarded-ad" : "offerwall",
    ]);
  }
  if (envelope.commandType === "credit-event") {
    return new Set(["event"]);
  }
  if (envelope.commandType === "credit-competition") {
    return new Set(["competition"]);
  }
  if (envelope.commandType === "allocate") {
    return new Set(["allocation"]);
  }
  if (envelope.commandType === "boost") {
    return new Set(["boost"]);
  }
  if (envelope.commandType === "reclaim") {
    return new Set(["reclaim"]);
  }
  if (envelope.commandType === "spend") {
    return new Set(["spend"]);
  }
  if (envelope.commandType === "hold") {
    return new Set(["hold"]);
  }
  if (
    envelope.commandType === "release-hold" ||
    envelope.commandType === "reverse"
  ) {
    return new Set(["reversal"]);
  }
  if (envelope.commandType === "refund") {
    return new Set(["refund"]);
  }
  if (envelope.commandType === "chargeback") {
    return new Set(["chargeback"]);
  }
  return new Set(["adjustment"]);
}

function assertReceiptGraph(
  graph: EconomyAuditGraphV1,
  commandEnvelopeHash: string,
  hash: CanonicalPayloadHashFunctionV1,
  acceptanceCommit: EconomyAuthorityCommitManifestV1,
  resultCommit: EconomyAuthorityCommitManifestV1 | undefined,
): void {
  const envelope = graph.commandEnvelope;
  const accepted = graph.acceptedReceipt;
  assertEconomyAcceptedCommandReceipt(accepted);
  economyAssert(
    accepted.commandId === envelope.commandId &&
      accepted.correlationId === envelope.correlationId &&
      accepted.commandEnvelopeHash === commandEnvelopeHash &&
      accepted.acceptedAt === envelope.acceptedAt,
    "INVALID_CONTRACT",
    "Accepted receipt is not bound to the canonical command envelope",
  );
  const acceptedHash = hashCanonicalPayload(
    canonicalEconomyAcceptedCommandReceiptPayload(accepted),
    hash,
    "Accepted receipt hash",
  );
  assertCreatedReference(
    acceptanceCommit,
    "accepted-receipt",
    accepted.receiptId,
    acceptedHash,
  );

  const providerSource =
    envelope.commandSource === "shopify" ||
    envelope.commandSource === "ayet" ||
    envelope.commandSource === "bitlabs";
  if (graph.resultReceipt === undefined) {
    economyAssert(
      providerSource &&
        graph.transaction === undefined &&
        resultCommit === undefined,
      "INVALID_CONTRACT",
      "Only a provider workflow may be durably accepted without a result",
    );
    return;
  }

  const result = graph.resultReceipt;
  assertEconomyCommandResultReceipt(result);
  economyAssert(
    result.commandId === envelope.commandId &&
      result.correlationId === envelope.correlationId &&
      result.acceptedReceiptId === accepted.receiptId &&
      result.commandEnvelopeHash === commandEnvelopeHash &&
      Date.parse(result.recordedAt) >= Date.parse(accepted.acceptedAt) &&
      resultCommit !== undefined,
    "INVALID_CONTRACT",
    "Result receipt is not bound to its accepted command",
  );
  const resultHash = hashCanonicalPayload(
    canonicalEconomyCommandResultReceiptPayload(result),
    hash,
    "Command-result receipt hash",
  );
  assertCreatedReference(
    resultCommit,
    "result-receipt",
    result.receiptId,
    resultHash,
  );

  if (envelope.commandType === "initialize-wallet") {
    economyAssert(
      result.outcome === "no-op" &&
        (result.noOpCode === "WALLET_INITIALIZED" ||
          result.noOpCode === "WALLET_ALREADY_INITIALIZED"),
      "INVALID_CONTRACT",
      "Wallet initialization must terminate without an economic transaction",
    );
  }

  if (result.outcome !== "completed") {
    economyAssert(
      graph.transaction === undefined,
      "INVALID_CONTRACT",
      "Failed and no-op results cannot carry a journal transaction",
    );
    return;
  }

  const transaction = graph.transaction;
  economyAssert(
    transaction !== undefined,
    "INVALID_CONTRACT",
    "Completed command graph is missing its journal transaction",
  );
  assertEconomicJournalTransaction(transaction);
  const calculatedTransactionHash = hashCanonicalPayload(
    canonicalTransactionPayload(transaction),
    hash,
    "Journal transaction hash",
  );
  economyAssert(
    transaction.canonicalHash === calculatedTransactionHash &&
      result.transactionId === transaction.transactionId &&
      result.transactionCanonicalHash === transaction.canonicalHash &&
      transaction.idempotencyKey ===
        envelope.idempotencyFingerprint.digest &&
      expectedTransactionActivityTypes(envelope).has(
        transaction.activityType,
      ),
    "INVALID_CONTRACT",
    "Completed result, transaction semantics, and idempotency fingerprint do not match",
  );
  if (providerSource) {
    economyAssert(
      transaction.providerEventId === envelope.causation?.causationId &&
        graph.providerEvidence.some(
          (evidence) =>
            evidence.providerEventId === transaction.providerEventId,
        ),
      "INVALID_CONTRACT",
      "Transaction provider event must be an internal included evidence ID",
    );
  } else {
    economyAssert(
      transaction.providerEventId === undefined,
      "INVALID_CONTRACT",
      "First-party transactions cannot carry provider event identities",
    );
  }
  assertCreatedReference(
    resultCommit,
    "journal-transaction",
    transaction.transactionId,
    transaction.canonicalHash,
  );
}

function assertAuthorityCommits(
  graph: EconomyAuditGraphV1,
  hash: CanonicalPayloadHashFunctionV1,
): {
  readonly acceptanceCommit: EconomyAuthorityCommitManifestV1;
  readonly resultCommit?: EconomyAuthorityCommitManifestV1;
} {
  assertEconomyAuthorityHead(graph.startAuthorityHead);
  assertEconomyAuthorityHead(graph.expectedAuthorityHead);
  economyAssert(
    Array.isArray(graph.commits) &&
      graph.commits.length >= 1 &&
      graph.commits.length <= 2,
    "INVALID_CONTRACT",
    "A command audit graph requires one or two authority commits",
  );

  let observedHead = graph.startAuthorityHead;
  for (const commit of graph.commits) {
    economyAssert(
      commit.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported hashed authority commit",
    );
    assertEconomyAuthorityCommitManifest(commit.manifest);
    assertCanonicalHash(commit.canonicalHash, "Authority commit hash");
    economyAssert(
      commit.manifest.commandId === graph.commandEnvelope.commandId &&
        commit.manifest.correlationId ===
          graph.commandEnvelope.correlationId &&
        hashCanonicalPayload(
          canonicalEconomyAuthorityCommitManifestPayload(commit.manifest),
          hash,
          "Calculated authority commit hash",
        ) === commit.canonicalHash,
      "INVALID_CONTRACT",
      "Authority commit hash or command binding is invalid",
    );
    observedHead = advanceEconomyAuthorityHead(
      observedHead,
      commit.manifest,
      commit.canonicalHash,
    );
  }
  economyAssert(
    observedHead.schemaVersion ===
      graph.expectedAuthorityHead.schemaVersion &&
      observedHead.authorityId ===
        graph.expectedAuthorityHead.authorityId &&
      observedHead.version === graph.expectedAuthorityHead.version &&
      observedHead.state === graph.expectedAuthorityHead.state &&
      observedHead.lastCommitId ===
        graph.expectedAuthorityHead.lastCommitId &&
      observedHead.lastCommitHash ===
        graph.expectedAuthorityHead.lastCommitHash &&
      observedHead.writerRegion ===
        graph.expectedAuthorityHead.writerRegion &&
      observedHead.writerFencingToken ===
        graph.expectedAuthorityHead.writerFencingToken &&
      observedHead.updatedAt === graph.expectedAuthorityHead.updatedAt,
    "INVALID_CONTRACT",
    "Authority commits do not reconstruct the expected authority head",
  );

  const providerSource =
    graph.commandEnvelope.commandSource === "shopify" ||
    graph.commandEnvelope.commandSource === "ayet" ||
    graph.commandEnvelope.commandSource === "bitlabs";
  const acceptanceKind = providerSource
    ? "provider-acceptance"
    : "first-party-command";
  const acceptanceCommit = graph.commits.find(
    (commit) => commit.manifest.commitKind === acceptanceKind,
  )?.manifest;
  economyAssert(
    acceptanceCommit !== undefined,
    "INVALID_CONTRACT",
    "Command graph is missing its authority acceptance boundary",
  );
  const resultCommit = providerSource
    ? graph.commits.find(
        (commit) => commit.manifest.commitKind === "provider-result",
      )?.manifest
    : acceptanceCommit;
  economyAssert(
    providerSource ||
      (graph.commits.length === 1 &&
        graph.resultReceipt !== undefined),
    "INVALID_CONTRACT",
    "First-party acceptance and result must share one authority commit",
  );
  economyAssert(
    !providerSource ||
      (graph.resultReceipt === undefined) === (resultCommit === undefined),
    "INVALID_CONTRACT",
    "Provider result receipt and second authority boundary must agree",
  );
  return {
    acceptanceCommit,
    ...(resultCommit === undefined ? {} : { resultCommit }),
  };
}

/**
 * Validates every actor/subject, evidence, receipt, transaction, record, and
 * authority-chain edge for one bounded command graph.
 *
 * The callback must hash exact canonical UTF-8 bytes using approved SHA-256.
 * Raw provider data and idempotency keys are neither accepted nor reconstructed.
 */
export function assertEconomyAuditGraph(
  graph: EconomyAuditGraphV1,
  hash: CanonicalPayloadHashFunctionV1,
): void {
  economyAssert(
    graph.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported economy audit graph",
  );
  assertAuditedEconomyCommandEnvelope(graph.commandEnvelope);
  const commandEnvelopeHash = hashCanonicalPayload(
    canonicalAuditedEconomyCommandEnvelopePayload(graph.commandEnvelope),
    hash,
    "Command envelope hash",
  );
  economyAssert(
    graph.commandEnvelopeHash === commandEnvelopeHash,
    "INVALID_CONTRACT",
    "Command envelope hash does not match canonical bytes",
  );
  const { acceptanceCommit, resultCommit } = assertAuthorityCommits(
    graph,
    hash,
  );
  assertCreatedReference(
    acceptanceCommit,
    "command-envelope",
    graph.commandEnvelope.commandId,
    commandEnvelopeHash,
  );
  assertProviderGraph(graph, hash, acceptanceCommit);
  assertReceiptGraph(
    graph,
    commandEnvelopeHash,
    hash,
    acceptanceCommit,
    resultCommit,
  );
}
