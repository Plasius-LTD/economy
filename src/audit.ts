import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type ProviderEventId,
  type TransactionId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { EconomyCommandType } from "./ports/persistence.js";

/** Additive authoritative command types; legacy V1/V2 command unions stay unchanged. */
export type EconomyAuditedCommandTypeV1 =
  | EconomyCommandType
  | "initialize-wallet";

export type EconomyCommandSourceV1 =
  | "browser"
  | "shopify"
  | "ayet"
  | "bitlabs"
  | "operator"
  | "system";

export type EconomyCommandProcessingModeV1 = "initial" | "replay";

export type EconomyPrincipalTypeV1 =
  | "account"
  | "delegated-child"
  | "service"
  | "operator";

export type EconomyCausationKindV1 =
  | "provider-event"
  | "economy-command"
  | "ledger-transaction"
  | "workflow-event"
  | "authority-commit";

/** One privacy-safe edge in an economy audit correlation graph. */
export interface EconomyCausationReferenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly kind: EconomyCausationKindV1;
  readonly causationId: string;
}

export type EconomyHmacFingerprintDomainV1 =
  | "economy.idempotency-key.v1"
  | "economy.provider-event-key.v1"
  | "economy.provider-object-key.v1"
  | "economy.provider-payload.v1"
  | "economy.provider-reconciliation.v1";

export type EconomyHmacSha256DigestV1 = `hmac-sha256:${string}`;

/**
 * A versioned, domain-separated HMAC fingerprint produced by an approved
 * infrastructure adapter. It is a correlation token, not reversible evidence.
 */
export interface EconomyHmacFingerprintV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly fingerprintVersion: "1";
  readonly algorithm: "hmac-sha256";
  readonly domain: EconomyHmacFingerprintDomainV1;
  readonly keyVersion: string;
  readonly digest: EconomyHmacSha256DigestV1;
}

/**
 * Hashes of sanitized authorization-decision manifests. The manifests must
 * contain no raw tokens, capability payloads, session IDs, or personal data.
 */
export interface EconomyAuthorizationEvidenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly capabilityEvidenceHash: string;
  readonly featureFlagEvidenceHash: string;
  readonly assuranceEvidenceHash: string;
  readonly authenticatedAt: IsoTimestamp;
  readonly authorizedAt: IsoTimestamp;
}

/**
 * Privacy-minimized command facts for the authoritative V3 boundary.
 *
 * This is deliberately standalone rather than extending
 * `EconomyCommandEnvelopeV1`: the published legacy envelope contains a raw
 * caller idempotency key, which must never enter new audit storage.
 */
export interface AuditedEconomyCommandEnvelopeV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commandId: string;
  readonly commandType: EconomyAuditedCommandTypeV1;
  readonly commandSource: EconomyCommandSourceV1;
  readonly idempotencyFingerprint: EconomyHmacFingerprintV1;
  readonly actorAccountId: AccountId;
  readonly subjectAccountId: AccountId;
  readonly principalType: EconomyPrincipalTypeV1;
  readonly relationshipId?: string;
  readonly authorizationVersion?: number;
  readonly authorizationEvidence: EconomyAuthorizationEvidenceV1;
  readonly routeId: string;
  readonly buildId: string;
  readonly correlationId: string;
  readonly causation?: EconomyCausationReferenceV1;
  /**
   * SHA-256 of the canonical, already-sanitized semantic command payload.
   * Provider callback bytes use an HMAC fingerprint instead.
   */
  readonly payloadHash: string;
  readonly providerEvidenceManifestHash?: string;
  readonly acceptedAt: IsoTimestamp;
  readonly acceptedRegion: string;
  readonly writerFencingToken: string;
}

export type EconomyAcquisitionProviderV1 = "shopify" | "ayet" | "bitlabs";

/**
 * Privacy-minimized verified provider evidence. Every value derived from a raw
 * provider identifier or callback body is represented by a domain-separated
 * HMAC fingerprint. Signatures and payment data have no storage field.
 */
export interface EconomyProviderEvidenceHashV1 {
  readonly schemaVersion: EconomyContractVersion;
  /** Opaque internal identifier; never the provider's event identifier. */
  readonly providerEventId: ProviderEventId;
  readonly commandId: string;
  readonly provider: EconomyAcquisitionProviderV1;
  readonly providerObjectKeyFingerprint?: EconomyHmacFingerprintV1;
  readonly providerEventKeyFingerprint: EconomyHmacFingerprintV1;
  readonly eventType: string;
  readonly payloadFingerprint: EconomyHmacFingerprintV1;
  readonly reconciliationEvidenceFingerprint?: EconomyHmacFingerprintV1;
  readonly signatureScheme: string;
  readonly signatureVerifiedAt: IsoTimestamp;
  readonly providerOccurredAt?: IsoTimestamp;
  readonly receivedAt: IsoTimestamp;
  readonly operationalHandleBindingId?: string;
}

export type EconomyOperationalHandlePurposeV1 =
  | "reconciliation"
  | "refund"
  | "dispute";

/**
 * Ledger-side binding for a provider handle encrypted and retained by the
 * consuming site. The ciphertext, nonce, authentication tag, and key URI are
 * not package fields; only hashes and non-secret cryptographic metadata bind
 * the external sealed record.
 */
export interface EconomyEncryptedOperationalHandleBindingV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly handleBindingId: string;
  readonly commandId: string;
  readonly provider: EconomyAcquisitionProviderV1;
  readonly purpose: EconomyOperationalHandlePurposeV1;
  readonly cipherSuite: "AES-256-GCM";
  readonly keyVersion: string;
  readonly ciphertextContentHash: string;
  readonly encryptionContextHash: string;
  readonly createdAt: IsoTimestamp;
}

/** One canonical content reference inside a sanitized evidence manifest. */
export interface EconomyEvidenceRecordReferenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recordId: string;
  readonly contentHash: string;
}

/**
 * Sanitized manifest bound by an audited provider command. Its referenced
 * records contain HMAC fingerprints, never raw provider material.
 */
export interface EconomyProviderEvidenceManifestV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly evidenceManifestId: string;
  readonly commandId: string;
  readonly provider: EconomyAcquisitionProviderV1;
  readonly evidenceReferences: readonly EconomyEvidenceRecordReferenceV1[];
  readonly operationalHandleReferences: readonly EconomyEvidenceRecordReferenceV1[];
  readonly createdAt: IsoTimestamp;
}

/** Privacy-safe acknowledgement returned after durable command acceptance. */
export interface EconomyAcceptedCommandReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly receiptId: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly commandEnvelopeHash: string;
  readonly acceptedAt: IsoTimestamp;
}

export type EconomyCommandResultOutcomeV1 =
  | "completed"
  | "failed"
  | "no-op";

/**
 * Immutable terminal receipt. A completed result binds one journal
 * transaction, a failed result binds one safe failure code, and a no-op binds
 * one safe reason proving that no economic transaction was required.
 */
export interface EconomyCommandResultReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly receiptId: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly acceptedReceiptId: string;
  readonly commandEnvelopeHash: string;
  readonly outcome: EconomyCommandResultOutcomeV1;
  readonly resultHash: string;
  readonly transactionId?: TransactionId;
  readonly transactionCanonicalHash?: string;
  readonly failureCode?: string;
  readonly noOpCode?: string;
  readonly recordedAt: IsoTimestamp;
}

/** Raw-key-free actor/subject namespace used by authoritative V3 replay. */
export interface EconomyAuditedIdempotencyScopeV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly idempotencyFingerprint: EconomyHmacFingerprintV1;
  readonly commandType: EconomyAuditedCommandTypeV1;
  readonly actorAccountId: AccountId;
  readonly subjectAccountId: AccountId;
  readonly principalType: EconomyPrincipalTypeV1;
  readonly relationshipId?: string;
  readonly authorizationVersion?: number;
}

export type EconomyAuditedIdempotencyStateV1 =
  | "accepted"
  | EconomyCommandResultOutcomeV1;

/**
 * Persisted V3 replay result. The adapter returns this record for an exact
 * canonical scope match; a fingerprint collision with different canonical
 * command bytes is a security conflict, never a replay.
 */
export interface EconomyAuditedIdempotencyResultV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commandId: string;
  readonly commandEnvelopeHash: string;
  readonly acceptedReceiptId: string;
  readonly resultReceiptId?: string;
  readonly state: EconomyAuditedIdempotencyStateV1;
  readonly responseHash: string;
  readonly recordedAt: IsoTimestamp;
}

export type EconomyCommandProcessingDispositionV1 =
  | {
      readonly mode: "initial";
    }
  | {
      readonly mode: "replay";
      readonly result: EconomyAuditedIdempotencyResultV1;
    };

const COMMAND_TYPES = new Set<EconomyAuditedCommandTypeV1>([
  "credit-purchase",
  "credit-subscription",
  "credit-reward",
  "credit-event",
  "credit-competition",
  "allocate",
  "boost",
  "reclaim",
  "spend",
  "hold",
  "release-hold",
  "refund",
  "chargeback",
  "reverse",
  "adjust",
  "initialize-wallet",
]);

const COMMAND_SOURCES = new Set<EconomyCommandSourceV1>([
  "browser",
  "shopify",
  "ayet",
  "bitlabs",
  "operator",
  "system",
]);

const PRINCIPAL_TYPES = new Set<EconomyPrincipalTypeV1>([
  "account",
  "delegated-child",
  "service",
  "operator",
]);

const PROVIDER_SOURCES = new Set<EconomyCommandSourceV1>([
  "shopify",
  "ayet",
  "bitlabs",
]);

const CAUSATION_KINDS = new Set<EconomyCausationKindV1>([
  "provider-event",
  "economy-command",
  "ledger-transaction",
  "workflow-event",
  "authority-commit",
]);

const PROVIDERS = new Set<EconomyAcquisitionProviderV1>([
  "shopify",
  "ayet",
  "bitlabs",
]);

const FINGERPRINT_DOMAINS = new Set<EconomyHmacFingerprintDomainV1>([
  "economy.idempotency-key.v1",
  "economy.provider-event-key.v1",
  "economy.provider-object-key.v1",
  "economy.provider-payload.v1",
  "economy.provider-reconciliation.v1",
]);

const SOURCE_COMMAND_TYPES: Readonly<
  Record<EconomyCommandSourceV1, ReadonlySet<EconomyAuditedCommandTypeV1>>
> = {
  browser: new Set([
    "allocate",
    "boost",
    "reclaim",
    "spend",
    "hold",
    "release-hold",
    "initialize-wallet",
  ]),
  shopify: new Set([
    "credit-purchase",
    "hold",
    "release-hold",
    "refund",
    "chargeback",
    "reverse",
  ]),
  ayet: new Set(["credit-reward", "hold", "release-hold", "reverse"]),
  bitlabs: new Set(["credit-reward", "hold", "release-hold", "reverse"]),
  operator: new Set(["adjust", "reverse", "hold", "release-hold"]),
  system: new Set([
    "credit-event",
    "credit-competition",
    "hold",
    "release-hold",
    "reverse",
  ]),
};

const COMMAND_ENVELOPE_KEYS = new Set([
  "schemaVersion",
  "commandId",
  "commandType",
  "commandSource",
  "idempotencyFingerprint",
  "actorAccountId",
  "subjectAccountId",
  "principalType",
  "relationshipId",
  "authorizationVersion",
  "authorizationEvidence",
  "routeId",
  "buildId",
  "correlationId",
  "causation",
  "payloadHash",
  "providerEvidenceManifestHash",
  "acceptedAt",
  "acceptedRegion",
  "writerFencingToken",
]);

function assertExactKeys(
  value: object,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  economyAssert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INVALID_CONTRACT",
    `${label} must be an object`,
  );
  economyAssert(
    Object.keys(value).every((key) => allowedKeys.has(key)),
    "INVALID_CONTRACT",
    `${label} contains an unsupported or raw field`,
  );
}

function assertCanonicalHash(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function assertSafeClassifier(value: string, label: string): void {
  economyAssert(
    typeof value === "string" &&
      /^[A-Za-z][A-Za-z0-9._:-]{0,95}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a bounded safe classifier`,
  );
}

function assertRelationshipContext(
  relationshipId: string | undefined,
  authorizationVersion: number | undefined,
): void {
  if (relationshipId !== undefined) {
    assertEconomyIdentifier(relationshipId, "relationshipId");
  }
  if (authorizationVersion !== undefined) {
    economyAssert(
      Number.isSafeInteger(authorizationVersion) &&
        authorizationVersion >= 1,
      "INVALID_CONTRACT",
      "Authorization version must be a positive safe integer",
    );
  }
  economyAssert(
    (relationshipId === undefined) ===
      (authorizationVersion === undefined),
    "INVALID_CONTRACT",
    "Relationship identity and authorization version must be supplied together",
  );
}

/** Validates a domain-separated HMAC fingerprint and its expected domain. */
export function assertEconomyHmacFingerprint(
  fingerprint: EconomyHmacFingerprintV1,
  expectedDomain?: EconomyHmacFingerprintDomainV1,
): void {
  assertExactKeys(
    fingerprint,
    new Set([
      "schemaVersion",
      "fingerprintVersion",
      "algorithm",
      "domain",
      "keyVersion",
      "digest",
    ]),
    "Economy HMAC fingerprint",
  );
  economyAssert(
    fingerprint.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      fingerprint.fingerprintVersion === "1" &&
      fingerprint.algorithm === "hmac-sha256" &&
      FINGERPRINT_DOMAINS.has(fingerprint.domain) &&
      (expectedDomain === undefined ||
        fingerprint.domain === expectedDomain),
    "INVALID_CONTRACT",
    "Unsupported economy HMAC fingerprint contract or domain",
  );
  assertEconomyIdentifier(fingerprint.keyVersion, "fingerprint keyVersion");
  economyAssert(
    /^hmac-sha256:[a-f0-9]{64}$/u.test(fingerprint.digest),
    "INVALID_CONTRACT",
    "Economy HMAC fingerprint digest must be canonical",
  );
}

/** Validates hashes of a sanitized, server-derived authorization decision. */
export function assertEconomyAuthorizationEvidence(
  evidence: EconomyAuthorizationEvidenceV1,
): void {
  assertExactKeys(
    evidence,
    new Set([
      "schemaVersion",
      "capabilityEvidenceHash",
      "featureFlagEvidenceHash",
      "assuranceEvidenceHash",
      "authenticatedAt",
      "authorizedAt",
    ]),
    "Economy authorization evidence",
  );
  economyAssert(
    evidence.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported economy authorization-evidence version",
  );
  assertCanonicalHash(
    evidence.capabilityEvidenceHash,
    "Capability evidence hash",
  );
  assertCanonicalHash(
    evidence.featureFlagEvidenceHash,
    "Feature-flag evidence hash",
  );
  assertCanonicalHash(
    evidence.assuranceEvidenceHash,
    "Assurance evidence hash",
  );
  const authenticatedAt = parseIsoTimestamp(evidence.authenticatedAt);
  economyAssert(
    parseIsoTimestamp(evidence.authorizedAt) >= authenticatedAt,
    "INVALID_TIME_WINDOW",
    "Authorization cannot precede authentication",
  );
}

function assertCausationReference(
  causation: EconomyCausationReferenceV1,
): void {
  assertExactKeys(
    causation,
    new Set(["schemaVersion", "kind", "causationId"]),
    "Economy causation reference",
  );
  economyAssert(
    causation.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      CAUSATION_KINDS.has(causation.kind),
    "INVALID_CONTRACT",
    "Economy causation reference is unsupported",
  );
  assertEconomyIdentifier(causation.causationId, "causationId");
}

function assertCommandSourcePrincipal(
  envelope: AuditedEconomyCommandEnvelopeV1,
): void {
  if (envelope.commandSource === "browser") {
    economyAssert(
      envelope.principalType === "account" ||
        envelope.principalType === "delegated-child",
      "INVALID_CONTRACT",
      "Browser economy commands require an account principal",
    );
  } else if (envelope.commandSource === "operator") {
    economyAssert(
      envelope.principalType === "operator",
      "INVALID_CONTRACT",
      "Operator commands require an operator principal",
    );
  } else {
    economyAssert(
      envelope.principalType === "service",
      "INVALID_CONTRACT",
      "Provider and system commands require a service principal",
    );
  }

  if (envelope.principalType === "account") {
    economyAssert(
      envelope.actorAccountId === envelope.subjectAccountId,
      "INVALID_CONTRACT",
      "Direct account commands require the actor to be the subject",
    );
  }
  if (envelope.principalType === "delegated-child") {
    economyAssert(
      envelope.actorAccountId !== envelope.subjectAccountId &&
        envelope.relationshipId !== undefined,
      "INVALID_CONTRACT",
      "Delegated-child commands require a distinct actor and relationship",
    );
  }
  if (envelope.commandType === "initialize-wallet") {
    economyAssert(
      envelope.commandSource === "browser" &&
        envelope.principalType === "account" &&
        envelope.actorAccountId === envelope.subjectAccountId &&
        envelope.relationshipId === undefined &&
        envelope.authorizationVersion === undefined,
      "INVALID_CONTRACT",
      "Wallet initialization requires a direct self-account browser command",
    );
  }
}

/** Validates a fingerprint-only, server-derived authoritative command. */
export function assertAuditedEconomyCommandEnvelope(
  envelope: AuditedEconomyCommandEnvelopeV1,
): void {
  assertExactKeys(
    envelope,
    COMMAND_ENVELOPE_KEYS,
    "Audited economy command envelope",
  );
  economyAssert(
    envelope.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      COMMAND_TYPES.has(envelope.commandType) &&
      COMMAND_SOURCES.has(envelope.commandSource) &&
      PRINCIPAL_TYPES.has(envelope.principalType),
    "INVALID_CONTRACT",
    "Unsupported audited economy command contract",
  );
  economyAssert(
    SOURCE_COMMAND_TYPES[envelope.commandSource].has(envelope.commandType),
    "INVALID_CONTRACT",
    "Economy command type is incompatible with its original source",
  );
  assertEconomyIdentifier(envelope.commandId, "commandId");
  assertEconomyHmacFingerprint(
    envelope.idempotencyFingerprint,
    "economy.idempotency-key.v1",
  );
  assertEconomyIdentifier(envelope.actorAccountId, "actorAccountId");
  assertEconomyIdentifier(envelope.subjectAccountId, "subjectAccountId");
  assertRelationshipContext(
    envelope.relationshipId,
    envelope.authorizationVersion,
  );
  assertCommandSourcePrincipal(envelope);
  assertEconomyAuthorizationEvidence(envelope.authorizationEvidence);
  assertEconomyIdentifier(envelope.routeId, "routeId");
  assertEconomyIdentifier(envelope.buildId, "buildId");
  assertEconomyIdentifier(envelope.correlationId, "correlationId");
  if (envelope.causation !== undefined) {
    assertCausationReference(envelope.causation);
    economyAssert(
      envelope.causation.kind !== "economy-command" ||
        envelope.causation.causationId !== envelope.commandId,
      "INVALID_CONTRACT",
      "An economy command cannot cause itself",
    );
  }
  assertCanonicalHash(envelope.payloadHash, "Command payload hash");
  if (envelope.providerEvidenceManifestHash !== undefined) {
    assertCanonicalHash(
      envelope.providerEvidenceManifestHash,
      "Provider evidence manifest hash",
    );
  }
  economyAssert(
    PROVIDER_SOURCES.has(envelope.commandSource)
      ? envelope.providerEvidenceManifestHash !== undefined &&
          envelope.causation?.kind === "provider-event"
      : envelope.providerEvidenceManifestHash === undefined,
    "INVALID_CONTRACT",
    "Provider evidence and provider-event causation must match the command source",
  );
  const authorizedAt = parseIsoTimestamp(
    envelope.authorizationEvidence.authorizedAt,
  );
  economyAssert(
    parseIsoTimestamp(envelope.acceptedAt) >= authorizedAt,
    "INVALID_TIME_WINDOW",
    "Command acceptance cannot precede authorization",
  );
  assertEconomyIdentifier(envelope.acceptedRegion, "acceptedRegion");
  assertEconomyIdentifier(
    envelope.writerFencingToken,
    "writerFencingToken",
  );
}

/** Validates privacy-minimized provider evidence before immutable append. */
export function assertEconomyProviderEvidenceHash(
  evidence: EconomyProviderEvidenceHashV1,
): void {
  assertExactKeys(
    evidence,
    new Set([
      "schemaVersion",
      "providerEventId",
      "commandId",
      "provider",
      "providerObjectKeyFingerprint",
      "providerEventKeyFingerprint",
      "eventType",
      "payloadFingerprint",
      "reconciliationEvidenceFingerprint",
      "signatureScheme",
      "signatureVerifiedAt",
      "providerOccurredAt",
      "receivedAt",
      "operationalHandleBindingId",
    ]),
    "Economy provider evidence",
  );
  economyAssert(
    evidence.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      PROVIDERS.has(evidence.provider),
    "INVALID_CONTRACT",
    "Provider evidence contract or provider is unsupported",
  );
  assertEconomyIdentifier(evidence.providerEventId, "providerEventId");
  assertEconomyIdentifier(evidence.commandId, "commandId");
  if (evidence.providerObjectKeyFingerprint !== undefined) {
    assertEconomyHmacFingerprint(
      evidence.providerObjectKeyFingerprint,
      "economy.provider-object-key.v1",
    );
  }
  assertEconomyHmacFingerprint(
    evidence.providerEventKeyFingerprint,
    "economy.provider-event-key.v1",
  );
  assertEconomyHmacFingerprint(
    evidence.payloadFingerprint,
    "economy.provider-payload.v1",
  );
  if (evidence.reconciliationEvidenceFingerprint !== undefined) {
    assertEconomyHmacFingerprint(
      evidence.reconciliationEvidenceFingerprint,
      "economy.provider-reconciliation.v1",
    );
  }
  assertSafeClassifier(evidence.eventType, "Provider event type");
  assertSafeClassifier(evidence.signatureScheme, "Provider signature scheme");
  const signatureVerifiedAt = parseIsoTimestamp(evidence.signatureVerifiedAt);
  const receivedAt = parseIsoTimestamp(evidence.receivedAt);
  if (evidence.providerOccurredAt !== undefined) {
    economyAssert(
      parseIsoTimestamp(evidence.providerOccurredAt) <= receivedAt,
      "INVALID_TIME_WINDOW",
      "Provider occurrence cannot be after evidence receipt",
    );
  }
  economyAssert(
    receivedAt >= signatureVerifiedAt,
    "INVALID_TIME_WINDOW",
    "Provider evidence cannot be received before signature verification",
  );
  if (evidence.operationalHandleBindingId !== undefined) {
    assertEconomyIdentifier(
      evidence.operationalHandleBindingId,
      "operationalHandleBindingId",
    );
  }
}

/** Validates a ledger binding for site-owned encrypted provider state. */
export function assertEconomyEncryptedOperationalHandleBinding(
  binding: EconomyEncryptedOperationalHandleBindingV1,
): void {
  assertExactKeys(
    binding,
    new Set([
      "schemaVersion",
      "handleBindingId",
      "commandId",
      "provider",
      "purpose",
      "cipherSuite",
      "keyVersion",
      "ciphertextContentHash",
      "encryptionContextHash",
      "createdAt",
    ]),
    "Encrypted operational-handle binding",
  );
  economyAssert(
    binding.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      PROVIDERS.has(binding.provider) &&
      ["reconciliation", "refund", "dispute"].includes(binding.purpose) &&
      binding.cipherSuite === "AES-256-GCM",
    "INVALID_CONTRACT",
    "Unsupported encrypted operational-handle binding",
  );
  assertEconomyIdentifier(binding.handleBindingId, "handleBindingId");
  assertEconomyIdentifier(binding.commandId, "commandId");
  assertEconomyIdentifier(binding.keyVersion, "keyVersion");
  assertCanonicalHash(
    binding.ciphertextContentHash,
    "Ciphertext content hash",
  );
  assertCanonicalHash(
    binding.encryptionContextHash,
    "Encryption-context hash",
  );
  parseIsoTimestamp(binding.createdAt);
}

function assertEvidenceRecordReference(
  reference: EconomyEvidenceRecordReferenceV1,
): void {
  assertExactKeys(
    reference,
    new Set(["schemaVersion", "recordId", "contentHash"]),
    "Evidence record reference",
  );
  economyAssert(
    reference.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported evidence-record reference",
  );
  assertEconomyIdentifier(reference.recordId, "evidence recordId");
  assertCanonicalHash(reference.contentHash, "Evidence content hash");
}

function assertUniqueSortedReferences(
  references: readonly EconomyEvidenceRecordReferenceV1[],
  label: string,
): void {
  economyAssert(
    references.length > 0,
    "INVALID_CONTRACT",
    `${label} must not be empty`,
  );
  let previousId: string | undefined;
  for (const reference of references) {
    assertEvidenceRecordReference(reference);
    economyAssert(
      previousId === undefined ||
        compareUnicodeCodeUnits(previousId, reference.recordId) < 0,
      "INVALID_CONTRACT",
      `${label} must have unique record IDs in canonical order`,
    );
    previousId = reference.recordId;
  }
}

/** Validates a canonical sanitized provider-evidence manifest. */
export function assertEconomyProviderEvidenceManifest(
  manifest: EconomyProviderEvidenceManifestV1,
): void {
  assertExactKeys(
    manifest,
    new Set([
      "schemaVersion",
      "evidenceManifestId",
      "commandId",
      "provider",
      "evidenceReferences",
      "operationalHandleReferences",
      "createdAt",
    ]),
    "Provider evidence manifest",
  );
  economyAssert(
    manifest.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      PROVIDERS.has(manifest.provider),
    "INVALID_CONTRACT",
    "Unsupported provider-evidence manifest",
  );
  assertEconomyIdentifier(manifest.evidenceManifestId, "evidenceManifestId");
  assertEconomyIdentifier(manifest.commandId, "commandId");
  economyAssert(
    Array.isArray(manifest.evidenceReferences) &&
      Array.isArray(manifest.operationalHandleReferences),
    "INVALID_CONTRACT",
    "Provider evidence manifest references must be arrays",
  );
  assertUniqueSortedReferences(
    manifest.evidenceReferences,
    "Provider evidence references",
  );
  let previousHandleId: string | undefined;
  for (const reference of manifest.operationalHandleReferences) {
    assertEvidenceRecordReference(reference);
    economyAssert(
      previousHandleId === undefined ||
        compareUnicodeCodeUnits(previousHandleId, reference.recordId) < 0,
      "INVALID_CONTRACT",
      "Operational-handle references must have unique IDs in canonical order",
    );
    previousHandleId = reference.recordId;
  }
  parseIsoTimestamp(manifest.createdAt);
}

/** Validates a client-safe durable-acceptance receipt. */
export function assertEconomyAcceptedCommandReceipt(
  receipt: EconomyAcceptedCommandReceiptV1,
): void {
  assertExactKeys(
    receipt,
    new Set([
      "schemaVersion",
      "receiptId",
      "commandId",
      "correlationId",
      "commandEnvelopeHash",
      "acceptedAt",
    ]),
    "Accepted-command receipt",
  );
  economyAssert(
    receipt.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported accepted-command receipt contract version",
  );
  assertEconomyIdentifier(receipt.receiptId, "receiptId");
  assertEconomyIdentifier(receipt.commandId, "commandId");
  assertEconomyIdentifier(receipt.correlationId, "correlationId");
  assertCanonicalHash(receipt.commandEnvelopeHash, "Command envelope hash");
  parseIsoTimestamp(receipt.acceptedAt);
}

/** Validates the exclusive completed, failed, and no-op result shapes. */
export function assertEconomyCommandResultReceipt(
  receipt: EconomyCommandResultReceiptV1,
): void {
  assertExactKeys(
    receipt,
    new Set([
      "schemaVersion",
      "receiptId",
      "commandId",
      "correlationId",
      "acceptedReceiptId",
      "commandEnvelopeHash",
      "outcome",
      "resultHash",
      "transactionId",
      "transactionCanonicalHash",
      "failureCode",
      "noOpCode",
      "recordedAt",
    ]),
    "Command-result receipt",
  );
  economyAssert(
    receipt.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      ["completed", "failed", "no-op"].includes(receipt.outcome),
    "INVALID_CONTRACT",
    "Unsupported command-result receipt contract or outcome",
  );
  assertEconomyIdentifier(receipt.receiptId, "receiptId");
  assertEconomyIdentifier(receipt.commandId, "commandId");
  assertEconomyIdentifier(receipt.correlationId, "correlationId");
  assertEconomyIdentifier(receipt.acceptedReceiptId, "acceptedReceiptId");
  assertCanonicalHash(receipt.commandEnvelopeHash, "Command envelope hash");
  assertCanonicalHash(receipt.resultHash, "Command result hash");
  parseIsoTimestamp(receipt.recordedAt);

  if (receipt.outcome === "completed") {
    economyAssert(
      receipt.transactionId !== undefined &&
        receipt.transactionCanonicalHash !== undefined &&
        receipt.failureCode === undefined &&
        receipt.noOpCode === undefined,
      "INVALID_CONTRACT",
      "Completed receipts require one transaction and no outcome code",
    );
    assertEconomyIdentifier(receipt.transactionId, "transactionId");
    assertCanonicalHash(
      receipt.transactionCanonicalHash,
      "Transaction canonical hash",
    );
  } else if (receipt.outcome === "failed") {
    economyAssert(
      receipt.transactionId === undefined &&
        receipt.transactionCanonicalHash === undefined &&
        receipt.noOpCode === undefined &&
        typeof receipt.failureCode === "string" &&
        /^[A-Z][A-Z0-9_]{2,95}$/u.test(receipt.failureCode),
      "INVALID_CONTRACT",
      "Failed receipts require only a bounded failure code",
    );
  } else {
    economyAssert(
      receipt.transactionId === undefined &&
        receipt.transactionCanonicalHash === undefined &&
        receipt.failureCode === undefined &&
        typeof receipt.noOpCode === "string" &&
        /^[A-Z][A-Z0-9_]{2,95}$/u.test(receipt.noOpCode),
      "INVALID_CONTRACT",
      "No-op receipts require only a bounded no-op code",
    );
  }
}

/** Validates the raw-key-free idempotency namespace used by V3. */
export function assertEconomyAuditedIdempotencyScope(
  scope: EconomyAuditedIdempotencyScopeV1,
): void {
  assertExactKeys(
    scope,
    new Set([
      "schemaVersion",
      "idempotencyFingerprint",
      "commandType",
      "actorAccountId",
      "subjectAccountId",
      "principalType",
      "relationshipId",
      "authorizationVersion",
    ]),
    "Audited idempotency scope",
  );
  economyAssert(
    scope.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      COMMAND_TYPES.has(scope.commandType) &&
      PRINCIPAL_TYPES.has(scope.principalType),
    "INVALID_CONTRACT",
    "Unsupported audited idempotency scope",
  );
  assertEconomyHmacFingerprint(
    scope.idempotencyFingerprint,
    "economy.idempotency-key.v1",
  );
  assertEconomyIdentifier(scope.actorAccountId, "actorAccountId");
  assertEconomyIdentifier(scope.subjectAccountId, "subjectAccountId");
  assertRelationshipContext(
    scope.relationshipId,
    scope.authorizationVersion,
  );
}

/** Validates an exact accepted or terminal V3 replay result. */
export function assertEconomyAuditedIdempotencyResult(
  result: EconomyAuditedIdempotencyResultV1,
): void {
  assertExactKeys(
    result,
    new Set([
      "schemaVersion",
      "commandId",
      "commandEnvelopeHash",
      "acceptedReceiptId",
      "resultReceiptId",
      "state",
      "responseHash",
      "recordedAt",
    ]),
    "Audited idempotency result",
  );
  economyAssert(
    result.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      ["accepted", "completed", "failed", "no-op"].includes(result.state),
    "INVALID_CONTRACT",
    "Unsupported audited idempotency result",
  );
  assertEconomyIdentifier(result.commandId, "commandId");
  assertCanonicalHash(result.commandEnvelopeHash, "Command envelope hash");
  assertEconomyIdentifier(result.acceptedReceiptId, "acceptedReceiptId");
  economyAssert(
    (result.state === "accepted") ===
      (result.resultReceiptId === undefined),
    "INVALID_CONTRACT",
    "Only terminal idempotency results require a result receipt",
  );
  if (result.resultReceiptId !== undefined) {
    assertEconomyIdentifier(result.resultReceiptId, "resultReceiptId");
  }
  assertCanonicalHash(result.responseHash, "Idempotency response hash");
  parseIsoTimestamp(result.recordedAt);
}

function canonicalFingerprint(
  fingerprint: EconomyHmacFingerprintV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: fingerprint.schemaVersion,
    fingerprintVersion: fingerprint.fingerprintVersion,
    algorithm: fingerprint.algorithm,
    domain: fingerprint.domain,
    keyVersion: fingerprint.keyVersion,
    digest: fingerprint.digest,
  };
}

function canonicalAuthorizationEvidence(
  evidence: EconomyAuthorizationEvidenceV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: evidence.schemaVersion,
    capabilityEvidenceHash: evidence.capabilityEvidenceHash,
    featureFlagEvidenceHash: evidence.featureFlagEvidenceHash,
    assuranceEvidenceHash: evidence.assuranceEvidenceHash,
    authenticatedAt: evidence.authenticatedAt,
    authorizedAt: evidence.authorizedAt,
  };
}

function canonicalCausation(
  causation: EconomyCausationReferenceV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: causation.schemaVersion,
    kind: causation.kind,
    causationId: causation.causationId,
  };
}

function canonicalEvidenceReference(
  reference: EconomyEvidenceRecordReferenceV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: reference.schemaVersion,
    recordId: reference.recordId,
    contentHash: reference.contentHash,
  };
}

/**
 * Produces deterministic UTF-8 JSON for an audited-command hash adapter.
 * The legacy transaction canonical payload remains a separate stable format.
 */
export function canonicalAuditedEconomyCommandEnvelopePayload(
  envelope: AuditedEconomyCommandEnvelopeV1,
): string {
  assertAuditedEconomyCommandEnvelope(envelope);
  return JSON.stringify({
    schemaVersion: envelope.schemaVersion,
    commandId: envelope.commandId,
    commandType: envelope.commandType,
    commandSource: envelope.commandSource,
    idempotencyFingerprint: canonicalFingerprint(
      envelope.idempotencyFingerprint,
    ),
    actorAccountId: envelope.actorAccountId,
    subjectAccountId: envelope.subjectAccountId,
    principalType: envelope.principalType,
    ...(envelope.relationshipId === undefined
      ? {}
      : { relationshipId: envelope.relationshipId }),
    ...(envelope.authorizationVersion === undefined
      ? {}
      : { authorizationVersion: envelope.authorizationVersion }),
    authorizationEvidence: canonicalAuthorizationEvidence(
      envelope.authorizationEvidence,
    ),
    routeId: envelope.routeId,
    buildId: envelope.buildId,
    correlationId: envelope.correlationId,
    ...(envelope.causation === undefined
      ? {}
      : { causation: canonicalCausation(envelope.causation) }),
    payloadHash: envelope.payloadHash,
    ...(envelope.providerEvidenceManifestHash === undefined
      ? {}
      : {
          providerEvidenceManifestHash:
            envelope.providerEvidenceManifestHash,
        }),
    acceptedAt: envelope.acceptedAt,
    acceptedRegion: envelope.acceptedRegion,
    writerFencingToken: envelope.writerFencingToken,
  });
}

/** Produces deterministic UTF-8 JSON for privacy-minimized provider evidence. */
export function canonicalEconomyProviderEvidenceHashPayload(
  evidence: EconomyProviderEvidenceHashV1,
): string {
  assertEconomyProviderEvidenceHash(evidence);
  return JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    providerEventId: evidence.providerEventId,
    commandId: evidence.commandId,
    provider: evidence.provider,
    ...(evidence.providerObjectKeyFingerprint === undefined
      ? {}
      : {
          providerObjectKeyFingerprint: canonicalFingerprint(
            evidence.providerObjectKeyFingerprint,
          ),
        }),
    providerEventKeyFingerprint: canonicalFingerprint(
      evidence.providerEventKeyFingerprint,
    ),
    eventType: evidence.eventType,
    payloadFingerprint: canonicalFingerprint(evidence.payloadFingerprint),
    ...(evidence.reconciliationEvidenceFingerprint === undefined
      ? {}
      : {
          reconciliationEvidenceFingerprint: canonicalFingerprint(
            evidence.reconciliationEvidenceFingerprint,
          ),
        }),
    signatureScheme: evidence.signatureScheme,
    signatureVerifiedAt: evidence.signatureVerifiedAt,
    ...(evidence.providerOccurredAt === undefined
      ? {}
      : { providerOccurredAt: evidence.providerOccurredAt }),
    receivedAt: evidence.receivedAt,
    ...(evidence.operationalHandleBindingId === undefined
      ? {}
      : {
          operationalHandleBindingId:
            evidence.operationalHandleBindingId,
        }),
  });
}

/** Produces deterministic UTF-8 JSON for an encrypted-handle binding. */
export function canonicalEconomyEncryptedOperationalHandleBindingPayload(
  binding: EconomyEncryptedOperationalHandleBindingV1,
): string {
  assertEconomyEncryptedOperationalHandleBinding(binding);
  return JSON.stringify({
    schemaVersion: binding.schemaVersion,
    handleBindingId: binding.handleBindingId,
    commandId: binding.commandId,
    provider: binding.provider,
    purpose: binding.purpose,
    cipherSuite: binding.cipherSuite,
    keyVersion: binding.keyVersion,
    ciphertextContentHash: binding.ciphertextContentHash,
    encryptionContextHash: binding.encryptionContextHash,
    createdAt: binding.createdAt,
  });
}

/** Produces deterministic UTF-8 JSON for a sanitized evidence manifest. */
export function canonicalEconomyProviderEvidenceManifestPayload(
  manifest: EconomyProviderEvidenceManifestV1,
): string {
  assertEconomyProviderEvidenceManifest(manifest);
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    evidenceManifestId: manifest.evidenceManifestId,
    commandId: manifest.commandId,
    provider: manifest.provider,
    evidenceReferences: manifest.evidenceReferences.map(
      canonicalEvidenceReference,
    ),
    operationalHandleReferences: manifest.operationalHandleReferences.map(
      canonicalEvidenceReference,
    ),
    createdAt: manifest.createdAt,
  });
}

/** Produces deterministic UTF-8 JSON for a privacy-safe accepted receipt. */
export function canonicalEconomyAcceptedCommandReceiptPayload(
  receipt: EconomyAcceptedCommandReceiptV1,
): string {
  assertEconomyAcceptedCommandReceipt(receipt);
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    commandId: receipt.commandId,
    correlationId: receipt.correlationId,
    commandEnvelopeHash: receipt.commandEnvelopeHash,
    acceptedAt: receipt.acceptedAt,
  });
}

/** Produces deterministic UTF-8 JSON for a terminal command receipt. */
export function canonicalEconomyCommandResultReceiptPayload(
  receipt: EconomyCommandResultReceiptV1,
): string {
  assertEconomyCommandResultReceipt(receipt);
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    commandId: receipt.commandId,
    correlationId: receipt.correlationId,
    acceptedReceiptId: receipt.acceptedReceiptId,
    commandEnvelopeHash: receipt.commandEnvelopeHash,
    outcome: receipt.outcome,
    resultHash: receipt.resultHash,
    ...(receipt.transactionId === undefined
      ? {}
      : { transactionId: receipt.transactionId }),
    ...(receipt.transactionCanonicalHash === undefined
      ? {}
      : { transactionCanonicalHash: receipt.transactionCanonicalHash }),
    ...(receipt.failureCode === undefined
      ? {}
      : { failureCode: receipt.failureCode }),
    ...(receipt.noOpCode === undefined
      ? {}
      : { noOpCode: receipt.noOpCode }),
    recordedAt: receipt.recordedAt,
  });
}

/**
 * Rejects a replay candidate unless every canonical accepted-command byte
 * matches. Processing mode is intentionally external to the envelope, so the
 * original command source remains unchanged on replay.
 */
export function assertExactAuditedEconomyCommandReplay(
  existing: AuditedEconomyCommandEnvelopeV1,
  candidate: AuditedEconomyCommandEnvelopeV1,
): void {
  economyAssert(
    canonicalAuditedEconomyCommandEnvelopePayload(existing) ===
      canonicalAuditedEconomyCommandEnvelopePayload(candidate),
    "DUPLICATE_IDENTIFIER",
    "Idempotency fingerprint collision does not match the canonical command",
  );
}
