import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { ActivityType } from "./ledger.js";
import { parseTokenSubunits, type TokenSubunitString } from "./amount.js";
import {
  assertEconomyHmacFingerprint,
  type EconomyCommandResultOutcomeV1,
  type EconomyHmacFingerprintV1,
} from "./audit.js";
import {
  assertEconomyIntegrityAnchorManifest,
  canonicalEconomyIntegrityAnchorManifestPayload,
  type EconomyIntegrityAnchorManifestV1,
} from "./authority.js";
import type { CanonicalPayloadHashFunctionV1 } from "./integrity.js";

export const ECONOMY_RECOVERY_PROTOCOL_VERSION = "1" as const;
export type EconomyRecoveryProtocolVersion =
  typeof ECONOMY_RECOVERY_PROTOCOL_VERSION;

export type EconomyRecoveryRecordKindV1 =
  | "acceptance"
  | "committed-result";

export type EconomyRecoveryDirectionV1 = "credit" | "debit";

export type EconomyEvidenceSignatureAlgorithmV1 =
  | "ed25519"
  | "ecdsa-p256-sha256"
  | "rsa-pss-sha256";

/** Public, non-secret metadata selected before detached signing. */
export interface EconomyEvidenceSignatureMetadataV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly signatureVersion: "1";
  readonly algorithm: EconomyEvidenceSignatureAlgorithmV1;
  readonly keyId: string;
  readonly signedAt: IsoTimestamp;
}

/** Public metadata plus the final detached signature value. */
export interface EconomyEvidenceSignatureV1
  extends EconomyEvidenceSignatureMetadataV1 {
  readonly value: string;
}

/** Deterministic signing request safe to pass to an external key adapter. */
export interface EconomyPreparedEvidenceSignatureV1 {
  readonly contentAddressedId: string;
  readonly canonicalPayload: string;
}

/**
 * Encrypted reconstruction bytes stored outside the live authority.
 *
 * The plaintext must contain only the already-approved, privacy-minimized
 * authority records. Raw provider callbacks, signatures, payment data,
 * idempotency keys, email addresses, and exact birth data are forbidden.
 */
export interface EconomySealedRecoveryPayloadV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly payloadVersion: "1";
  readonly cipherSuite: "AES-256-GCM";
  readonly encoding: "base64url";
  readonly keyVersion: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authenticationTag: string;
  readonly plaintextContentHash: string;
  readonly encryptionContextHash: string;
}

/** Content-addressed body written identically to every evidence region. */
export interface EconomyRecoveryAcceptanceBodyV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recoveryVersion: EconomyRecoveryProtocolVersion;
  readonly recordType: "economy-recovery-acceptance";
  readonly authorityId: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly idempotencyFingerprint: EconomyHmacFingerprintV1;
  readonly commandEnvelopeHash: string;
  readonly acceptedReceiptId: string;
  readonly acceptedReceiptHash: string;
  readonly sealedPayload: EconomySealedRecoveryPayloadV1;
  readonly preparedAt: IsoTimestamp;
  readonly acceptedAt: IsoTimestamp;
}

/**
 * Provider-neutral durable acceptance. The ID is SHA-256-addressed from the
 * canonical body and therefore remains identical in all evidence regions.
 */
export interface EconomyRecoveryAcceptanceEnvelopeV1
  extends EconomyRecoveryAcceptanceBodyV1 {
  readonly acceptanceEnvelopeId: string;
}

/** Content-addressed result body written after the authority commit. */
export interface EconomyRecoveryCommittedResultBodyV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recoveryVersion: EconomyRecoveryProtocolVersion;
  readonly recordType: "economy-recovery-committed-result";
  readonly authorityId: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly acceptanceEnvelopeId: string;
  readonly acceptanceEnvelopeHash: string;
  readonly resultReceiptId: string;
  readonly resultReceiptHash: string;
  readonly outcome: EconomyCommandResultOutcomeV1;
  readonly authorityCommitId: string;
  readonly authorityCommitHash: string;
  readonly authoritySequence: string;
  readonly authorityHeadHashAfter: string;
  readonly transactionId?: TransactionId;
  readonly transactionCanonicalHash?: string;
  readonly sealedPayload: EconomySealedRecoveryPayloadV1;
  readonly committedAt: IsoTimestamp;
}

/**
 * Immutable reconstruction result for one command. Failed and no-op commands
 * are retained as facts but cannot carry transaction identity or value.
 */
export interface EconomyRecoveryCommittedResultV1
  extends EconomyRecoveryCommittedResultBodyV1 {
  readonly committedResultId: string;
}

/** Region-specific body proving one recovery record was durably retained. */
export interface EconomyRegionalEvidenceReceiptBodyV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recoveryVersion: EconomyRecoveryProtocolVersion;
  readonly recordType: "economy-regional-evidence-receipt";
  readonly journalId: string;
  readonly region: string;
  readonly sequence: string;
  readonly previousReceiptHash?: string;
  readonly authorityId: string;
  readonly commandId: string;
  readonly recoveryRecordKind: EconomyRecoveryRecordKindV1;
  readonly recoveryRecordId: string;
  readonly recoveryRecordContentHash: string;
  readonly storedAt: IsoTimestamp;
  readonly retentionUntil: IsoTimestamp;
}

/**
 * Signed, content-addressed evidence-region acknowledgement.
 *
 * Its ID addresses the unsigned storage fact. Its detached signature covers
 * that ID, the exact canonical body, and the public signature metadata.
 */
export interface EconomyRegionalEvidenceReceiptV1
  extends EconomyRegionalEvidenceReceiptBodyV1 {
  readonly evidenceReceiptId: string;
  readonly signature: EconomyEvidenceSignatureV1;
}

/** One sibling in a duplicate-last, binary SHA-256 Merkle proof. */
export interface EconomyMerkleProofStepV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly side: "left" | "right";
  readonly hash: string;
}

/** Portable proof that an authority commit is covered by an hourly anchor. */
export interface EconomyMerkleInclusionProofV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly proofVersion: "1";
  readonly algorithm: "duplicate-last-sha256-v1";
  readonly anchorId: string;
  readonly anchorManifestHash: string;
  readonly leafHash: string;
  readonly leafIndex: string;
  readonly leafCount: string;
  readonly siblings: readonly EconomyMerkleProofStepV1[];
}

/** Privacy-safe link from a customer receipt to one regional evidence fact. */
export interface EconomyPortableEvidenceReferenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly region: string;
  readonly evidenceReceiptId: string;
  readonly evidenceReceiptHash: string;
}

/** Content-addressed customer-facing receipt body. */
export interface EconomyPortableCustomerReceiptBodyV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recoveryVersion: EconomyRecoveryProtocolVersion;
  readonly recordType: "economy-portable-customer-receipt";
  readonly authorityId: string;
  readonly commandId: string;
  readonly activityType: ActivityType;
  readonly direction: EconomyRecoveryDirectionV1;
  readonly tokenAmount: TokenSubunitString;
  readonly transactionId: TransactionId;
  readonly transactionCanonicalHash: string;
  readonly resultReceiptId: string;
  readonly resultReceiptHash: string;
  readonly committedResultId: string;
  readonly committedResultContentHash: string;
  readonly authorityCommitId: string;
  readonly authorityCommitHash: string;
  readonly authoritySequence: string;
  readonly regionalEvidence: readonly EconomyPortableEvidenceReferenceV1[];
  readonly merkleInclusionProof?: EconomyMerkleInclusionProofV1;
  readonly tokenTermsVersion: string;
  readonly cashRedemptionAllowed: false;
  readonly committedAt: IsoTimestamp;
  readonly issuedAt: IsoTimestamp;
}

/**
 * Downloadable signed receipt containing no payer, household, provider,
 * payment, email, session, or exact-age data.
 */
export interface EconomyPortableCustomerReceiptV1
  extends EconomyPortableCustomerReceiptBodyV1 {
  readonly portableReceiptId: string;
  readonly signature: EconomyEvidenceSignatureV1;
}

/** Infrastructure-supplied signature verifier; this package owns no keys. */
export interface EconomyEvidenceSignatureVerificationInputV1 {
  readonly algorithm: EconomyEvidenceSignatureAlgorithmV1;
  readonly keyId: string;
  readonly signedAt: IsoTimestamp;
  readonly signature: string;
  readonly canonicalPayload: string;
}

export type EconomyEvidenceSignatureVerifierV1 = (
  input: EconomyEvidenceSignatureVerificationInputV1,
) => boolean;

const CANONICAL_HASH = /^sha256:[a-f0-9]{64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const UNSIGNED_INTEGER = /^(?:0|[1-9][0-9]{0,38})$/u;
const SIGNATURE_ALGORITHMS =
  new Set<EconomyEvidenceSignatureAlgorithmV1>([
    "ed25519",
    "ecdsa-p256-sha256",
    "rsa-pss-sha256",
  ]);
const RESULT_OUTCOMES = new Set<EconomyCommandResultOutcomeV1>([
  "completed",
  "failed",
  "no-op",
]);
const ACTIVITY_TYPES = new Set<ActivityType>([
  "purchase",
  "subscription",
  "rewarded-ad",
  "offerwall",
  "allocation",
  "boost",
  "reclaim",
  "spend",
  "hold",
  "refund",
  "chargeback",
  "adjustment",
  "reversal",
  "event",
  "competition",
]);

const ACCEPTANCE_BODY_KEYS = new Set([
  "schemaVersion",
  "recoveryVersion",
  "recordType",
  "authorityId",
  "commandId",
  "correlationId",
  "idempotencyFingerprint",
  "commandEnvelopeHash",
  "acceptedReceiptId",
  "acceptedReceiptHash",
  "sealedPayload",
  "preparedAt",
  "acceptedAt",
]);
const ACCEPTANCE_KEYS = new Set([
  "acceptanceEnvelopeId",
  ...ACCEPTANCE_BODY_KEYS,
]);
const COMMITTED_RESULT_BODY_KEYS = new Set([
  "schemaVersion",
  "recoveryVersion",
  "recordType",
  "authorityId",
  "commandId",
  "correlationId",
  "acceptanceEnvelopeId",
  "acceptanceEnvelopeHash",
  "resultReceiptId",
  "resultReceiptHash",
  "outcome",
  "authorityCommitId",
  "authorityCommitHash",
  "authoritySequence",
  "authorityHeadHashAfter",
  "transactionId",
  "transactionCanonicalHash",
  "sealedPayload",
  "committedAt",
]);
const COMMITTED_RESULT_KEYS = new Set([
  "committedResultId",
  ...COMMITTED_RESULT_BODY_KEYS,
]);
const REGIONAL_BODY_KEYS = new Set([
  "schemaVersion",
  "recoveryVersion",
  "recordType",
  "journalId",
  "region",
  "sequence",
  "previousReceiptHash",
  "authorityId",
  "commandId",
  "recoveryRecordKind",
  "recoveryRecordId",
  "recoveryRecordContentHash",
  "storedAt",
  "retentionUntil",
]);
const REGIONAL_KEYS = new Set([
  "evidenceReceiptId",
  "signature",
  ...REGIONAL_BODY_KEYS,
]);
const PORTABLE_BODY_KEYS = new Set([
  "schemaVersion",
  "recoveryVersion",
  "recordType",
  "authorityId",
  "commandId",
  "activityType",
  "direction",
  "tokenAmount",
  "transactionId",
  "transactionCanonicalHash",
  "resultReceiptId",
  "resultReceiptHash",
  "committedResultId",
  "committedResultContentHash",
  "authorityCommitId",
  "authorityCommitHash",
  "authoritySequence",
  "regionalEvidence",
  "merkleInclusionProof",
  "tokenTermsVersion",
  "cashRedemptionAllowed",
  "committedAt",
  "issuedAt",
]);
const PORTABLE_KEYS = new Set([
  "portableReceiptId",
  "signature",
  ...PORTABLE_BODY_KEYS,
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
    `${label} contains an unsupported field`,
  );
}

function assertCanonicalHash(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && CANONICAL_HASH.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function canonicalHash(
  payload: string,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
  label: string,
): string {
  const value = hashCanonicalPayload(payload);
  assertCanonicalHash(value, label);
  return value;
}

function assertUnsignedInteger(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && UNSIGNED_INTEGER.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical unsigned integer`,
  );
}

function assertRecoveryVersion(
  schemaVersion: EconomyContractVersion,
  recoveryVersion: EconomyRecoveryProtocolVersion,
  recordType: string,
  expectedRecordType: string,
  label: string,
): void {
  economyAssert(
    schemaVersion === ECONOMY_CONTRACT_VERSION &&
      recoveryVersion === ECONOMY_RECOVERY_PROTOCOL_VERSION &&
      recordType === expectedRecordType,
    "INVALID_CONTRACT",
    `Unsupported ${label} contract version`,
  );
}

function assertBase64url(
  value: string,
  label: string,
  minimumLength: number,
  maximumLength: number,
): void {
  economyAssert(
    typeof value === "string" &&
      value.length >= minimumLength &&
      value.length <= maximumLength &&
      BASE64URL.test(value),
    "INVALID_CONTRACT",
    `${label} must be bounded unpadded base64url`,
  );
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

function canonicalSealedPayload(
  payload: EconomySealedRecoveryPayloadV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: payload.schemaVersion,
    payloadVersion: payload.payloadVersion,
    cipherSuite: payload.cipherSuite,
    encoding: payload.encoding,
    keyVersion: payload.keyVersion,
    nonce: payload.nonce,
    ciphertext: payload.ciphertext,
    authenticationTag: payload.authenticationTag,
    plaintextContentHash: payload.plaintextContentHash,
    encryptionContextHash: payload.encryptionContextHash,
  };
}

function canonicalSignature(
  signature: EconomyEvidenceSignatureV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: signature.schemaVersion,
    signatureVersion: signature.signatureVersion,
    algorithm: signature.algorithm,
    keyId: signature.keyId,
    signedAt: signature.signedAt,
    value: signature.value,
  };
}

function canonicalSignatureMetadata(
  signature: EconomyEvidenceSignatureMetadataV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: signature.schemaVersion,
    signatureVersion: signature.signatureVersion,
    algorithm: signature.algorithm,
    keyId: signature.keyId,
    signedAt: signature.signedAt,
  };
}

/** Validates a bounded AES-GCM envelope without implementing cryptography. */
export function assertEconomySealedRecoveryPayload(
  payload: EconomySealedRecoveryPayloadV1,
): void {
  assertExactKeys(
    payload,
    new Set([
      "schemaVersion",
      "payloadVersion",
      "cipherSuite",
      "encoding",
      "keyVersion",
      "nonce",
      "ciphertext",
      "authenticationTag",
      "plaintextContentHash",
      "encryptionContextHash",
    ]),
    "Sealed recovery payload",
  );
  economyAssert(
    payload.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      payload.payloadVersion === "1" &&
      payload.cipherSuite === "AES-256-GCM" &&
      payload.encoding === "base64url",
    "INVALID_CONTRACT",
    "Unsupported sealed recovery-payload contract",
  );
  assertEconomyIdentifier(payload.keyVersion, "recovery keyVersion");
  assertBase64url(payload.nonce, "Recovery nonce", 16, 16);
  assertBase64url(payload.ciphertext, "Recovery ciphertext", 1, 1_500_000);
  assertBase64url(
    payload.authenticationTag,
    "Recovery authentication tag",
    22,
    22,
  );
  assertCanonicalHash(
    payload.plaintextContentHash,
    "Recovery plaintext-content hash",
  );
  assertCanonicalHash(
    payload.encryptionContextHash,
    "Recovery encryption-context hash",
  );
}

function assertAcceptanceBody(
  body: EconomyRecoveryAcceptanceBodyV1,
): void {
  assertExactKeys(
    body,
    "acceptanceEnvelopeId" in body
      ? ACCEPTANCE_KEYS
      : ACCEPTANCE_BODY_KEYS,
    "Recovery acceptance body",
  );
  assertRecoveryVersion(
    body.schemaVersion,
    body.recoveryVersion,
    body.recordType,
    "economy-recovery-acceptance",
    "recovery acceptance",
  );
  assertEconomyIdentifier(body.authorityId, "authorityId");
  assertEconomyIdentifier(body.commandId, "commandId");
  assertEconomyIdentifier(body.correlationId, "correlationId");
  assertEconomyHmacFingerprint(
    body.idempotencyFingerprint,
    "economy.idempotency-key.v1",
  );
  assertCanonicalHash(body.commandEnvelopeHash, "Command-envelope hash");
  assertEconomyIdentifier(body.acceptedReceiptId, "acceptedReceiptId");
  assertCanonicalHash(body.acceptedReceiptHash, "Accepted-receipt hash");
  assertEconomySealedRecoveryPayload(body.sealedPayload);
  const preparedAt = parseIsoTimestamp(body.preparedAt);
  const acceptedAt = parseIsoTimestamp(body.acceptedAt);
  economyAssert(
    preparedAt <= acceptedAt,
    "INVALID_TIME_WINDOW",
    "Recovery acceptance cannot precede preparation",
  );
}

/** Canonical body bytes used to derive an acceptance-envelope ID. */
export function canonicalEconomyRecoveryAcceptanceBodyPayload(
  body: EconomyRecoveryAcceptanceBodyV1,
): string {
  assertAcceptanceBody(body);
  return JSON.stringify({
    schemaVersion: body.schemaVersion,
    recoveryVersion: body.recoveryVersion,
    recordType: body.recordType,
    authorityId: body.authorityId,
    commandId: body.commandId,
    correlationId: body.correlationId,
    idempotencyFingerprint: canonicalFingerprint(
      body.idempotencyFingerprint,
    ),
    commandEnvelopeHash: body.commandEnvelopeHash,
    acceptedReceiptId: body.acceptedReceiptId,
    acceptedReceiptHash: body.acceptedReceiptHash,
    sealedPayload: canonicalSealedPayload(body.sealedPayload),
    preparedAt: body.preparedAt,
    acceptedAt: body.acceptedAt,
  });
}

function deriveContentAddressedId(
  prefix: string,
  canonicalBodyPayload: string,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  return `${prefix}:${canonicalHash(
    canonicalBodyPayload,
    hashCanonicalPayload,
    "Content-address hash",
  )}`;
}

/** Creates an acceptance record whose ID addresses its exact canonical body. */
export function createEconomyRecoveryAcceptanceEnvelope(
  body: EconomyRecoveryAcceptanceBodyV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): EconomyRecoveryAcceptanceEnvelopeV1 {
  return {
    ...body,
    acceptanceEnvelopeId: deriveContentAddressedId(
      "recovery-acceptance",
      canonicalEconomyRecoveryAcceptanceBodyPayload(body),
      hashCanonicalPayload,
    ),
  };
}

/** Validates schema, privacy shape, and the acceptance content address. */
export function assertEconomyRecoveryAcceptanceEnvelope(
  envelope: EconomyRecoveryAcceptanceEnvelopeV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  assertExactKeys(envelope, ACCEPTANCE_KEYS, "Recovery acceptance envelope");
  assertAcceptanceBody(envelope);
  assertEconomyIdentifier(
    envelope.acceptanceEnvelopeId,
    "acceptanceEnvelopeId",
  );
  economyAssert(
    envelope.acceptanceEnvelopeId ===
      deriveContentAddressedId(
        "recovery-acceptance",
        canonicalEconomyRecoveryAcceptanceBodyPayload(envelope),
        hashCanonicalPayload,
      ),
    "INVALID_CONTRACT",
    "Recovery acceptance content address does not match canonical bytes",
  );
}

/** Canonical complete acceptance bytes written create-only in each region. */
export function canonicalEconomyRecoveryAcceptanceEnvelopePayload(
  envelope: EconomyRecoveryAcceptanceEnvelopeV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyRecoveryAcceptanceEnvelope(
    envelope,
    hashCanonicalPayload,
  );
  return JSON.stringify({
    schemaVersion: envelope.schemaVersion,
    recoveryVersion: envelope.recoveryVersion,
    recordType: envelope.recordType,
    acceptanceEnvelopeId: envelope.acceptanceEnvelopeId,
    authorityId: envelope.authorityId,
    commandId: envelope.commandId,
    correlationId: envelope.correlationId,
    idempotencyFingerprint: canonicalFingerprint(
      envelope.idempotencyFingerprint,
    ),
    commandEnvelopeHash: envelope.commandEnvelopeHash,
    acceptedReceiptId: envelope.acceptedReceiptId,
    acceptedReceiptHash: envelope.acceptedReceiptHash,
    sealedPayload: canonicalSealedPayload(envelope.sealedPayload),
    preparedAt: envelope.preparedAt,
    acceptedAt: envelope.acceptedAt,
  });
}

function assertCommittedResultBody(
  body: EconomyRecoveryCommittedResultBodyV1,
): void {
  assertExactKeys(
    body,
    "committedResultId" in body
      ? COMMITTED_RESULT_KEYS
      : COMMITTED_RESULT_BODY_KEYS,
    "Recovery committed-result body",
  );
  assertRecoveryVersion(
    body.schemaVersion,
    body.recoveryVersion,
    body.recordType,
    "economy-recovery-committed-result",
    "recovery committed result",
  );
  for (const [value, label] of [
    [body.authorityId, "authorityId"],
    [body.commandId, "commandId"],
    [body.correlationId, "correlationId"],
    [body.acceptanceEnvelopeId, "acceptanceEnvelopeId"],
    [body.resultReceiptId, "resultReceiptId"],
    [body.authorityCommitId, "authorityCommitId"],
  ] as const) {
    assertEconomyIdentifier(value, label);
  }
  for (const [value, label] of [
    [body.acceptanceEnvelopeHash, "Acceptance-envelope hash"],
    [body.resultReceiptHash, "Result-receipt hash"],
    [body.authorityCommitHash, "Authority-commit hash"],
    [body.authorityHeadHashAfter, "Authority-head hash"],
  ] as const) {
    assertCanonicalHash(value, label);
  }
  economyAssert(
    RESULT_OUTCOMES.has(body.outcome),
    "INVALID_CONTRACT",
    "Recovery committed result has an unsupported outcome",
  );
  assertUnsignedInteger(body.authoritySequence, "Authority sequence");
  economyAssert(
    BigInt(body.authoritySequence) > 0n,
    "INVALID_CONTRACT",
    "Authority sequence must be positive",
  );
  const completed = body.outcome === "completed";
  economyAssert(
    completed ===
      (body.transactionId !== undefined &&
        body.transactionCanonicalHash !== undefined),
    "INVALID_CONTRACT",
    "Only completed recovery results require transaction identity and hash",
  );
  if (body.transactionId !== undefined) {
    assertEconomyIdentifier(body.transactionId, "transactionId");
  }
  if (body.transactionCanonicalHash !== undefined) {
    assertCanonicalHash(
      body.transactionCanonicalHash,
      "Transaction canonical hash",
    );
  }
  assertEconomySealedRecoveryPayload(body.sealedPayload);
  parseIsoTimestamp(body.committedAt);
}

/** Canonical body bytes used to derive a committed-result ID. */
export function canonicalEconomyRecoveryCommittedResultBodyPayload(
  body: EconomyRecoveryCommittedResultBodyV1,
): string {
  assertCommittedResultBody(body);
  return JSON.stringify({
    schemaVersion: body.schemaVersion,
    recoveryVersion: body.recoveryVersion,
    recordType: body.recordType,
    authorityId: body.authorityId,
    commandId: body.commandId,
    correlationId: body.correlationId,
    acceptanceEnvelopeId: body.acceptanceEnvelopeId,
    acceptanceEnvelopeHash: body.acceptanceEnvelopeHash,
    resultReceiptId: body.resultReceiptId,
    resultReceiptHash: body.resultReceiptHash,
    outcome: body.outcome,
    authorityCommitId: body.authorityCommitId,
    authorityCommitHash: body.authorityCommitHash,
    authoritySequence: body.authoritySequence,
    authorityHeadHashAfter: body.authorityHeadHashAfter,
    ...(body.transactionId === undefined
      ? {}
      : { transactionId: body.transactionId }),
    ...(body.transactionCanonicalHash === undefined
      ? {}
      : { transactionCanonicalHash: body.transactionCanonicalHash }),
    sealedPayload: canonicalSealedPayload(body.sealedPayload),
    committedAt: body.committedAt,
  });
}

/** Creates a result record whose ID addresses its exact canonical body. */
export function createEconomyRecoveryCommittedResult(
  body: EconomyRecoveryCommittedResultBodyV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): EconomyRecoveryCommittedResultV1 {
  return {
    ...body,
    committedResultId: deriveContentAddressedId(
      "recovery-result",
      canonicalEconomyRecoveryCommittedResultBodyPayload(body),
      hashCanonicalPayload,
    ),
  };
}

/** Validates schema, privacy shape, and the committed-result content address. */
export function assertEconomyRecoveryCommittedResult(
  result: EconomyRecoveryCommittedResultV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  assertExactKeys(
    result,
    COMMITTED_RESULT_KEYS,
    "Recovery committed result",
  );
  assertCommittedResultBody(result);
  assertEconomyIdentifier(result.committedResultId, "committedResultId");
  economyAssert(
    result.committedResultId ===
      deriveContentAddressedId(
        "recovery-result",
        canonicalEconomyRecoveryCommittedResultBodyPayload(result),
        hashCanonicalPayload,
      ),
    "INVALID_CONTRACT",
    "Recovery result content address does not match canonical bytes",
  );
}

/** Canonical complete result bytes written create-only in each region. */
export function canonicalEconomyRecoveryCommittedResultPayload(
  result: EconomyRecoveryCommittedResultV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyRecoveryCommittedResult(result, hashCanonicalPayload);
  return JSON.stringify({
    schemaVersion: result.schemaVersion,
    recoveryVersion: result.recoveryVersion,
    recordType: result.recordType,
    committedResultId: result.committedResultId,
    authorityId: result.authorityId,
    commandId: result.commandId,
    correlationId: result.correlationId,
    acceptanceEnvelopeId: result.acceptanceEnvelopeId,
    acceptanceEnvelopeHash: result.acceptanceEnvelopeHash,
    resultReceiptId: result.resultReceiptId,
    resultReceiptHash: result.resultReceiptHash,
    outcome: result.outcome,
    authorityCommitId: result.authorityCommitId,
    authorityCommitHash: result.authorityCommitHash,
    authoritySequence: result.authoritySequence,
    authorityHeadHashAfter: result.authorityHeadHashAfter,
    ...(result.transactionId === undefined
      ? {}
      : { transactionId: result.transactionId }),
    ...(result.transactionCanonicalHash === undefined
      ? {}
      : { transactionCanonicalHash: result.transactionCanonicalHash }),
    sealedPayload: canonicalSealedPayload(result.sealedPayload),
    committedAt: result.committedAt,
  });
}

/**
 * Proves that a committed result is the terminal recovery record for the exact
 * accepted command. It also recomputes the acceptance record hash.
 */
export function assertEconomyRecoveryResultLink(
  acceptance: EconomyRecoveryAcceptanceEnvelopeV1,
  result: EconomyRecoveryCommittedResultV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  const acceptancePayload =
    canonicalEconomyRecoveryAcceptanceEnvelopePayload(
      acceptance,
      hashCanonicalPayload,
    );
  assertEconomyRecoveryCommittedResult(result, hashCanonicalPayload);
  economyAssert(
    result.authorityId === acceptance.authorityId &&
      result.commandId === acceptance.commandId &&
      result.correlationId === acceptance.correlationId &&
      result.acceptanceEnvelopeId === acceptance.acceptanceEnvelopeId &&
      result.acceptanceEnvelopeHash ===
        canonicalHash(
          acceptancePayload,
          hashCanonicalPayload,
          "Acceptance-envelope hash",
        ) &&
      parseIsoTimestamp(result.committedAt) >=
        parseIsoTimestamp(acceptance.acceptedAt),
    "INVALID_CONTRACT",
    "Recovery committed result does not match its acceptance envelope",
  );
}

/** Validates a detached evidence signature without owning signing keys. */
export function assertEconomyEvidenceSignatureMetadata(
  signature: EconomyEvidenceSignatureMetadataV1,
): void {
  assertExactKeys(
    signature,
    new Set([
      "schemaVersion",
      "signatureVersion",
      "algorithm",
      "keyId",
      "signedAt",
    ]),
    "Evidence signature metadata",
  );
  economyAssert(
    signature.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      signature.signatureVersion === "1" &&
      SIGNATURE_ALGORITHMS.has(signature.algorithm),
    "INVALID_CONTRACT",
    "Unsupported evidence signature",
  );
  assertEconomyIdentifier(signature.keyId, "signature keyId");
  parseIsoTimestamp(signature.signedAt);
}

/** Validates a detached evidence signature without owning signing keys. */
export function assertEconomyEvidenceSignature(
  signature: EconomyEvidenceSignatureV1,
): void {
  assertExactKeys(
    signature,
    new Set([
      "schemaVersion",
      "signatureVersion",
      "algorithm",
      "keyId",
      "signedAt",
      "value",
    ]),
    "Evidence signature",
  );
  assertEconomyEvidenceSignatureMetadata({
    schemaVersion: signature.schemaVersion,
    signatureVersion: signature.signatureVersion,
    algorithm: signature.algorithm,
    keyId: signature.keyId,
    signedAt: signature.signedAt,
  });
  assertBase64url(signature.value, "Evidence signature value", 32, 2_048);
}

function assertRegionalEvidenceBody(
  body: EconomyRegionalEvidenceReceiptBodyV1,
): void {
  assertExactKeys(
    body,
    "evidenceReceiptId" in body ? REGIONAL_KEYS : REGIONAL_BODY_KEYS,
    "Regional evidence-receipt body",
  );
  assertRecoveryVersion(
    body.schemaVersion,
    body.recoveryVersion,
    body.recordType,
    "economy-regional-evidence-receipt",
    "regional evidence receipt",
  );
  for (const [value, label] of [
    [body.journalId, "journalId"],
    [body.region, "region"],
    [body.authorityId, "authorityId"],
    [body.commandId, "commandId"],
    [body.recoveryRecordId, "recoveryRecordId"],
  ] as const) {
    assertEconomyIdentifier(value, label);
  }
  assertUnsignedInteger(body.sequence, "Regional evidence sequence");
  economyAssert(
    BigInt(body.sequence) > 0n,
    "INVALID_CONTRACT",
    "Regional evidence sequence must be positive",
  );
  economyAssert(
    body.recoveryRecordKind === "acceptance" ||
      body.recoveryRecordKind === "committed-result",
    "INVALID_CONTRACT",
    "Unsupported recovery record kind",
  );
  assertCanonicalHash(
    body.recoveryRecordContentHash,
    "Recovery-record content hash",
  );
  if (BigInt(body.sequence) === 1n) {
    economyAssert(
      body.previousReceiptHash === undefined,
      "INVALID_CONTRACT",
      "First regional evidence receipt cannot have a previous hash",
    );
  } else {
    economyAssert(
      body.previousReceiptHash !== undefined,
      "INVALID_CONTRACT",
      "Non-genesis regional evidence receipt requires a previous hash",
    );
    assertCanonicalHash(
      body.previousReceiptHash,
      "Previous evidence-receipt hash",
    );
  }
  const storedAt = parseIsoTimestamp(body.storedAt);
  const retentionUntil = parseIsoTimestamp(body.retentionUntil);
  economyAssert(
    storedAt < retentionUntil,
    "INVALID_TIME_WINDOW",
    "Regional evidence retention must end after storage",
  );
}

/** Canonical body bytes used to derive a regional evidence-receipt ID. */
export function canonicalEconomyRegionalEvidenceReceiptBodyPayload(
  body: EconomyRegionalEvidenceReceiptBodyV1,
): string {
  assertRegionalEvidenceBody(body);
  return JSON.stringify({
    schemaVersion: body.schemaVersion,
    recoveryVersion: body.recoveryVersion,
    recordType: body.recordType,
    journalId: body.journalId,
    region: body.region,
    sequence: body.sequence,
    ...(body.previousReceiptHash === undefined
      ? {}
      : { previousReceiptHash: body.previousReceiptHash }),
    authorityId: body.authorityId,
    commandId: body.commandId,
    recoveryRecordKind: body.recoveryRecordKind,
    recoveryRecordId: body.recoveryRecordId,
    recoveryRecordContentHash: body.recoveryRecordContentHash,
    storedAt: body.storedAt,
    retentionUntil: body.retentionUntil,
  });
}

/** Creates a signed region receipt after the adapter has produced a signature. */
export function createEconomyRegionalEvidenceReceipt(
  body: EconomyRegionalEvidenceReceiptBodyV1,
  signature: EconomyEvidenceSignatureV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): EconomyRegionalEvidenceReceiptV1 {
  return {
    ...body,
    evidenceReceiptId: deriveContentAddressedId(
      "regional-evidence",
      canonicalEconomyRegionalEvidenceReceiptBodyPayload(body),
      hashCanonicalPayload,
    ),
    signature,
  };
}

/** Validates a region receipt and its content-addressed unsigned body. */
export function assertEconomyRegionalEvidenceReceipt(
  receipt: EconomyRegionalEvidenceReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  assertExactKeys(receipt, REGIONAL_KEYS, "Regional evidence receipt");
  assertRegionalEvidenceBody(receipt);
  assertEconomyIdentifier(receipt.evidenceReceiptId, "evidenceReceiptId");
  assertEconomyEvidenceSignature(receipt.signature);
  economyAssert(
    receipt.evidenceReceiptId ===
      deriveContentAddressedId(
        "regional-evidence",
        canonicalEconomyRegionalEvidenceReceiptBodyPayload(receipt),
        hashCanonicalPayload,
      ),
    "INVALID_CONTRACT",
    "Regional evidence-receipt ID does not match canonical bytes",
  );
  economyAssert(
    parseIsoTimestamp(receipt.signature.signedAt) >=
      parseIsoTimestamp(receipt.storedAt) &&
      parseIsoTimestamp(receipt.signature.signedAt) <
        parseIsoTimestamp(receipt.retentionUntil),
    "INVALID_TIME_WINDOW",
    "Regional evidence signature time must fall within retention",
  );
}

/**
 * Prepares the regional content address and exact bytes for an external signer.
 * No placeholder signature value is required or returned.
 */
export function prepareEconomyRegionalEvidenceReceiptSignature(
  body: EconomyRegionalEvidenceReceiptBodyV1,
  signature: EconomyEvidenceSignatureMetadataV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): EconomyPreparedEvidenceSignatureV1 {
  assertRegionalEvidenceBody(body);
  assertEconomyEvidenceSignatureMetadata(signature);
  economyAssert(
    parseIsoTimestamp(signature.signedAt) >=
      parseIsoTimestamp(body.storedAt) &&
      parseIsoTimestamp(signature.signedAt) <
        parseIsoTimestamp(body.retentionUntil),
    "INVALID_TIME_WINDOW",
    "Regional evidence signature time must fall within retention",
  );
  const contentAddressedId = deriveContentAddressedId(
    "regional-evidence",
    canonicalEconomyRegionalEvidenceReceiptBodyPayload(body),
    hashCanonicalPayload,
  );
  const canonicalPayload = JSON.stringify({
    domain: "economy.regional-evidence-receipt.signature.v1",
    evidenceReceiptId: contentAddressedId,
    body: JSON.parse(
      canonicalEconomyRegionalEvidenceReceiptBodyPayload(body),
    ) as unknown,
    signature: canonicalSignatureMetadata(signature),
  });
  return { contentAddressedId, canonicalPayload };
}

/** Exact bytes covered by a regional receipt's detached signature. */
export function canonicalEconomyRegionalEvidenceReceiptSigningPayload(
  receipt: EconomyRegionalEvidenceReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyRegionalEvidenceReceipt(receipt, hashCanonicalPayload);
  const prepared = prepareEconomyRegionalEvidenceReceiptSignature(
    receipt,
    {
      schemaVersion: receipt.signature.schemaVersion,
      signatureVersion: receipt.signature.signatureVersion,
      algorithm: receipt.signature.algorithm,
      keyId: receipt.signature.keyId,
      signedAt: receipt.signature.signedAt,
    },
    hashCanonicalPayload,
  );
  economyAssert(
    prepared.contentAddressedId === receipt.evidenceReceiptId,
    "INVALID_CONTRACT",
    "Regional evidence signing ID does not match its receipt",
  );
  return prepared.canonicalPayload;
}

/** Canonical complete region-receipt bytes, including its signature. */
export function canonicalEconomyRegionalEvidenceReceiptPayload(
  receipt: EconomyRegionalEvidenceReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyRegionalEvidenceReceipt(receipt, hashCanonicalPayload);
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    recoveryVersion: receipt.recoveryVersion,
    recordType: receipt.recordType,
    evidenceReceiptId: receipt.evidenceReceiptId,
    journalId: receipt.journalId,
    region: receipt.region,
    sequence: receipt.sequence,
    ...(receipt.previousReceiptHash === undefined
      ? {}
      : { previousReceiptHash: receipt.previousReceiptHash }),
    authorityId: receipt.authorityId,
    commandId: receipt.commandId,
    recoveryRecordKind: receipt.recoveryRecordKind,
    recoveryRecordId: receipt.recoveryRecordId,
    recoveryRecordContentHash: receipt.recoveryRecordContentHash,
    storedAt: receipt.storedAt,
    retentionUntil: receipt.retentionUntil,
    signature: canonicalSignature(receipt.signature),
  });
}

function assertSignatureVerification(
  signature: EconomyEvidenceSignatureV1,
  canonicalPayload: string,
  verifySignature: EconomyEvidenceSignatureVerifierV1,
  label: string,
): void {
  economyAssert(
    verifySignature({
      algorithm: signature.algorithm,
      keyId: signature.keyId,
      signedAt: signature.signedAt,
      signature: signature.value,
      canonicalPayload,
    }),
    "INVALID_CONTRACT",
    `${label} signature could not be verified`,
  );
}

/** Verifies one region receipt through an infrastructure-supplied key adapter. */
export function assertEconomyRegionalEvidenceReceiptSignature(
  receipt: EconomyRegionalEvidenceReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
  verifySignature: EconomyEvidenceSignatureVerifierV1,
): void {
  assertSignatureVerification(
    receipt.signature,
    canonicalEconomyRegionalEvidenceReceiptSigningPayload(
      receipt,
      hashCanonicalPayload,
    ),
    verifySignature,
    "Regional evidence receipt",
  );
}

/**
 * Verifies an ordered regional hash-chain segment. Segments beginning after
 * sequence one must supply the trusted preceding receipt hash.
 */
export function assertEconomyRegionalEvidenceChain(
  receipts: readonly EconomyRegionalEvidenceReceiptV1[],
  expectedPreviousReceiptHash: string | undefined,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
  verifySignature: EconomyEvidenceSignatureVerifierV1,
): void {
  economyAssert(
    receipts.length > 0,
    "INVALID_CONTRACT",
    "Regional evidence chain cannot be empty",
  );
  const first = receipts[0]!;
  assertEconomyRegionalEvidenceReceiptSignature(
    first,
    hashCanonicalPayload,
    verifySignature,
  );
  if (BigInt(first.sequence) === 1n) {
    economyAssert(
      expectedPreviousReceiptHash === undefined,
      "INVALID_CONTRACT",
      "Genesis evidence chain cannot have a trusted preceding hash",
    );
  } else {
    economyAssert(
      expectedPreviousReceiptHash !== undefined,
      "INVALID_CONTRACT",
      "Partial evidence chain requires its trusted preceding hash",
    );
    assertCanonicalHash(
      expectedPreviousReceiptHash,
      "Expected preceding evidence-receipt hash",
    );
    economyAssert(
      first.previousReceiptHash === expectedPreviousReceiptHash,
      "INVALID_CONTRACT",
      "Regional evidence chain does not start from the trusted hash",
    );
  }

  let previous = first;
  for (const receipt of receipts.slice(1)) {
    assertEconomyRegionalEvidenceReceiptSignature(
      receipt,
      hashCanonicalPayload,
      verifySignature,
    );
    const previousHash = canonicalHash(
      canonicalEconomyRegionalEvidenceReceiptPayload(
        previous,
        hashCanonicalPayload,
      ),
      hashCanonicalPayload,
      "Regional evidence-receipt chain hash",
    );
    economyAssert(
      receipt.journalId === previous.journalId &&
        receipt.region === previous.region &&
        BigInt(receipt.sequence) === BigInt(previous.sequence) + 1n &&
        receipt.previousReceiptHash === previousHash &&
        parseIsoTimestamp(receipt.storedAt) >=
          parseIsoTimestamp(previous.storedAt),
      "INVALID_CONTRACT",
      "Regional evidence receipts do not form one contiguous hash chain",
    );
    previous = receipt;
  }
}

/**
 * Proves that at least two distinct regions retained byte-identical recovery
 * content. Region-specific receipt metadata and signatures may differ.
 */
export function assertEconomyRegionalEvidenceEquality(
  receipts: readonly EconomyRegionalEvidenceReceiptV1[],
  expectedRegions: readonly string[],
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  economyAssert(
    receipts.length >= 2 && expectedRegions.length >= 2,
    "INVALID_CONTRACT",
    "Regional equality requires at least two evidence regions",
  );
  const expected = new Set(expectedRegions);
  economyAssert(
    expected.size === expectedRegions.length,
    "INVALID_CONTRACT",
    "Expected evidence regions must be unique",
  );
  expectedRegions.forEach((region) =>
    assertEconomyIdentifier(region, "expected region"),
  );
  const observed = new Set<string>();
  const first = receipts[0]!;
  for (const receipt of receipts) {
    assertEconomyRegionalEvidenceReceipt(receipt, hashCanonicalPayload);
    economyAssert(
      expected.has(receipt.region) && !observed.has(receipt.region),
      "INVALID_CONTRACT",
      "Regional evidence contains an unexpected or duplicate region",
    );
    observed.add(receipt.region);
    economyAssert(
      receipt.authorityId === first.authorityId &&
        receipt.commandId === first.commandId &&
        receipt.recoveryRecordKind === first.recoveryRecordKind &&
        receipt.recoveryRecordId === first.recoveryRecordId &&
        receipt.recoveryRecordContentHash ===
          first.recoveryRecordContentHash,
      "INVALID_CONTRACT",
      "Evidence regions do not bind byte-identical recovery content",
    );
  }
  economyAssert(
    observed.size === expected.size,
    "INVALID_CONTRACT",
    "Regional evidence does not cover the complete expected region set",
  );
}

/** Validates the exact portable Merkle-proof shape. */
export function assertEconomyMerkleInclusionProof(
  proof: EconomyMerkleInclusionProofV1,
): void {
  assertExactKeys(
    proof,
    new Set([
      "schemaVersion",
      "proofVersion",
      "algorithm",
      "anchorId",
      "anchorManifestHash",
      "leafHash",
      "leafIndex",
      "leafCount",
      "siblings",
    ]),
    "Merkle inclusion proof",
  );
  economyAssert(
    proof.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      proof.proofVersion === "1" &&
      proof.algorithm === "duplicate-last-sha256-v1",
    "INVALID_CONTRACT",
    "Unsupported Merkle inclusion proof",
  );
  assertEconomyIdentifier(proof.anchorId, "anchorId");
  assertCanonicalHash(proof.anchorManifestHash, "Anchor-manifest hash");
  assertCanonicalHash(proof.leafHash, "Merkle leaf hash");
  assertUnsignedInteger(proof.leafIndex, "Merkle leaf index");
  assertUnsignedInteger(proof.leafCount, "Merkle leaf count");
  economyAssert(
    BigInt(proof.leafCount) > 0n &&
      BigInt(proof.leafIndex) < BigInt(proof.leafCount) &&
      proof.siblings.length <= 128,
    "INVALID_CONTRACT",
    "Merkle leaf position is outside its bounded tree",
  );
  for (const step of proof.siblings) {
    assertExactKeys(
      step,
      new Set(["schemaVersion", "side", "hash"]),
      "Merkle proof step",
    );
    economyAssert(
      step.schemaVersion === ECONOMY_CONTRACT_VERSION &&
        (step.side === "left" || step.side === "right"),
      "INVALID_CONTRACT",
      "Unsupported Merkle proof step",
    );
    assertCanonicalHash(step.hash, "Merkle sibling hash");
  }
}

function canonicalMerkleProof(
  proof: EconomyMerkleInclusionProofV1,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: proof.schemaVersion,
    proofVersion: proof.proofVersion,
    algorithm: proof.algorithm,
    anchorId: proof.anchorId,
    anchorManifestHash: proof.anchorManifestHash,
    leafHash: proof.leafHash,
    leafIndex: proof.leafIndex,
    leafCount: proof.leafCount,
    siblings: proof.siblings.map((step) => ({
      schemaVersion: step.schemaVersion,
      side: step.side,
      hash: step.hash,
    })),
  };
}

/**
 * Recomputes duplicate-last Merkle inclusion against a canonical hourly anchor.
 * The hash adapter receives only domain-separated canonical node bytes.
 */
export function assertEconomyMerkleInclusion(
  proof: EconomyMerkleInclusionProofV1,
  anchor: EconomyIntegrityAnchorManifestV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  assertEconomyMerkleInclusionProof(proof);
  assertEconomyIntegrityAnchorManifest(anchor);
  const anchorHash = canonicalHash(
    canonicalEconomyIntegrityAnchorManifestPayload(anchor),
    hashCanonicalPayload,
    "Anchor-manifest hash",
  );
  economyAssert(
    proof.anchorId === anchor.anchorId &&
      proof.anchorManifestHash === anchorHash &&
      proof.leafCount === anchor.leafCount,
    "INVALID_CONTRACT",
    "Merkle proof does not match its authority anchor",
  );

  let currentHash = proof.leafHash;
  let index = BigInt(proof.leafIndex);
  let width = BigInt(proof.leafCount);
  let consumed = 0;
  while (width > 1n) {
    const step = proof.siblings[consumed];
    economyAssert(
      step !== undefined,
      "INVALID_CONTRACT",
      "Merkle proof is missing a tree level",
    );
    const expectsLeft = index % 2n === 1n;
    economyAssert(
      step.side === (expectsLeft ? "left" : "right"),
      "INVALID_CONTRACT",
      "Merkle proof sibling is on the wrong side",
    );
    if (!expectsLeft && index + 1n === width) {
      economyAssert(
        step.hash === currentHash,
        "INVALID_CONTRACT",
        "Odd Merkle levels must duplicate their final leaf",
      );
    }
    const leftHash = expectsLeft ? step.hash : currentHash;
    const rightHash = expectsLeft ? currentHash : step.hash;
    currentHash = canonicalHash(
      JSON.stringify({
        domain: "economy.merkle-node.v1",
        leftHash,
        rightHash,
      }),
      hashCanonicalPayload,
      "Merkle parent hash",
    );
    consumed += 1;
    index /= 2n;
    width = (width + 1n) / 2n;
  }
  economyAssert(
    consumed === proof.siblings.length &&
      currentHash === anchor.merkleRootHash,
    "INVALID_CONTRACT",
    "Merkle proof does not resolve to the anchor root",
  );
}

function assertPortableEvidenceReference(
  reference: EconomyPortableEvidenceReferenceV1,
): void {
  assertExactKeys(
    reference,
    new Set([
      "schemaVersion",
      "region",
      "evidenceReceiptId",
      "evidenceReceiptHash",
    ]),
    "Portable evidence reference",
  );
  economyAssert(
    reference.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported portable evidence-reference version",
  );
  assertEconomyIdentifier(reference.region, "evidence region");
  assertEconomyIdentifier(
    reference.evidenceReceiptId,
    "evidenceReceiptId",
  );
  assertCanonicalHash(
    reference.evidenceReceiptHash,
    "Evidence-receipt hash",
  );
}

function evidenceReferenceOrder(
  left: EconomyPortableEvidenceReferenceV1,
  right: EconomyPortableEvidenceReferenceV1,
): number {
  return compareUnicodeCodeUnits(left.region, right.region);
}

function canonicalPortableEvidenceReference(
  reference: EconomyPortableEvidenceReferenceV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: reference.schemaVersion,
    region: reference.region,
    evidenceReceiptId: reference.evidenceReceiptId,
    evidenceReceiptHash: reference.evidenceReceiptHash,
  };
}

function assertPortableBody(
  body: EconomyPortableCustomerReceiptBodyV1,
): void {
  assertExactKeys(
    body,
    "portableReceiptId" in body ? PORTABLE_KEYS : PORTABLE_BODY_KEYS,
    "Portable customer-receipt body",
  );
  assertRecoveryVersion(
    body.schemaVersion,
    body.recoveryVersion,
    body.recordType,
    "economy-portable-customer-receipt",
    "portable customer receipt",
  );
  for (const [value, label] of [
    [body.authorityId, "authorityId"],
    [body.commandId, "commandId"],
    [body.transactionId, "transactionId"],
    [body.resultReceiptId, "resultReceiptId"],
    [body.committedResultId, "committedResultId"],
    [body.authorityCommitId, "authorityCommitId"],
    [body.tokenTermsVersion, "tokenTermsVersion"],
  ] as const) {
    assertEconomyIdentifier(value, label);
  }
  economyAssert(
    ACTIVITY_TYPES.has(body.activityType) &&
      (body.direction === "credit" || body.direction === "debit"),
    "INVALID_CONTRACT",
    "Portable customer receipt has an unsupported activity or direction",
  );
  economyAssert(
    parseTokenSubunits(body.tokenAmount) > 0n,
    "INVALID_AMOUNT",
    "Portable customer receipt amount must be positive",
  );
  for (const [value, label] of [
    [body.transactionCanonicalHash, "Transaction canonical hash"],
    [body.resultReceiptHash, "Result-receipt hash"],
    [body.committedResultContentHash, "Committed-result content hash"],
    [body.authorityCommitHash, "Authority-commit hash"],
  ] as const) {
    assertCanonicalHash(value, label);
  }
  assertUnsignedInteger(body.authoritySequence, "Authority sequence");
  economyAssert(
    BigInt(body.authoritySequence) > 0n &&
      body.cashRedemptionAllowed === false,
    "INVALID_CONTRACT",
    "Portable receipt requires a positive sequence and no cash redemption",
  );
  economyAssert(
    body.regionalEvidence.length >= 2,
    "INVALID_CONTRACT",
    "Portable customer receipt requires at least two evidence regions",
  );
  let previous: EconomyPortableEvidenceReferenceV1 | undefined;
  for (const reference of body.regionalEvidence) {
    assertPortableEvidenceReference(reference);
    economyAssert(
      previous === undefined ||
        evidenceReferenceOrder(previous, reference) < 0,
      "INVALID_CONTRACT",
      "Portable evidence references must be unique and canonically ordered",
    );
    previous = reference;
  }
  if (body.merkleInclusionProof !== undefined) {
    assertEconomyMerkleInclusionProof(body.merkleInclusionProof);
    economyAssert(
      body.merkleInclusionProof.leafHash === body.authorityCommitHash,
      "INVALID_CONTRACT",
      "Portable receipt Merkle proof must cover its authority commit",
    );
  }
  const committedAt = parseIsoTimestamp(body.committedAt);
  const issuedAt = parseIsoTimestamp(body.issuedAt);
  economyAssert(
    committedAt <= issuedAt,
    "INVALID_TIME_WINDOW",
    "Portable receipt cannot be issued before its authority commit",
  );
}

/** Canonical body bytes used to derive a portable receipt ID. */
export function canonicalEconomyPortableCustomerReceiptBodyPayload(
  body: EconomyPortableCustomerReceiptBodyV1,
): string {
  assertPortableBody(body);
  return JSON.stringify({
    schemaVersion: body.schemaVersion,
    recoveryVersion: body.recoveryVersion,
    recordType: body.recordType,
    authorityId: body.authorityId,
    commandId: body.commandId,
    activityType: body.activityType,
    direction: body.direction,
    tokenAmount: body.tokenAmount,
    transactionId: body.transactionId,
    transactionCanonicalHash: body.transactionCanonicalHash,
    resultReceiptId: body.resultReceiptId,
    resultReceiptHash: body.resultReceiptHash,
    committedResultId: body.committedResultId,
    committedResultContentHash: body.committedResultContentHash,
    authorityCommitId: body.authorityCommitId,
    authorityCommitHash: body.authorityCommitHash,
    authoritySequence: body.authoritySequence,
    regionalEvidence: body.regionalEvidence.map(
      canonicalPortableEvidenceReference,
    ),
    ...(body.merkleInclusionProof === undefined
      ? {}
      : {
          merkleInclusionProof: canonicalMerkleProof(
            body.merkleInclusionProof,
          ),
        }),
    tokenTermsVersion: body.tokenTermsVersion,
    cashRedemptionAllowed: body.cashRedemptionAllowed,
    committedAt: body.committedAt,
    issuedAt: body.issuedAt,
  });
}

/** Creates a signed portable receipt from a canonical content-addressed body. */
export function createEconomyPortableCustomerReceipt(
  body: EconomyPortableCustomerReceiptBodyV1,
  signature: EconomyEvidenceSignatureV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): EconomyPortableCustomerReceiptV1 {
  return {
    ...body,
    portableReceiptId: deriveContentAddressedId(
      "portable-token-receipt",
      canonicalEconomyPortableCustomerReceiptBodyPayload(body),
      hashCanonicalPayload,
    ),
    signature,
  };
}

/** Validates schema, privacy shape, signature shape, and content address. */
export function assertEconomyPortableCustomerReceipt(
  receipt: EconomyPortableCustomerReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  assertExactKeys(receipt, PORTABLE_KEYS, "Portable customer receipt");
  assertPortableBody(receipt);
  assertEconomyIdentifier(receipt.portableReceiptId, "portableReceiptId");
  assertEconomyEvidenceSignature(receipt.signature);
  economyAssert(
    receipt.portableReceiptId ===
      deriveContentAddressedId(
        "portable-token-receipt",
        canonicalEconomyPortableCustomerReceiptBodyPayload(receipt),
        hashCanonicalPayload,
      ),
    "INVALID_CONTRACT",
    "Portable customer-receipt ID does not match canonical bytes",
  );
  economyAssert(
    parseIsoTimestamp(receipt.signature.signedAt) >=
      parseIsoTimestamp(receipt.issuedAt),
    "INVALID_TIME_WINDOW",
    "Portable customer receipt cannot be signed before it is issued",
  );
}

/**
 * Prepares the portable content address and exact bytes for an external signer.
 * No placeholder signature value is required or returned.
 */
export function prepareEconomyPortableCustomerReceiptSignature(
  body: EconomyPortableCustomerReceiptBodyV1,
  signature: EconomyEvidenceSignatureMetadataV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): EconomyPreparedEvidenceSignatureV1 {
  assertPortableBody(body);
  assertEconomyEvidenceSignatureMetadata(signature);
  economyAssert(
    parseIsoTimestamp(signature.signedAt) >=
      parseIsoTimestamp(body.issuedAt),
    "INVALID_TIME_WINDOW",
    "Portable customer receipt cannot be signed before it is issued",
  );
  const contentAddressedId = deriveContentAddressedId(
    "portable-token-receipt",
    canonicalEconomyPortableCustomerReceiptBodyPayload(body),
    hashCanonicalPayload,
  );
  const canonicalPayload = JSON.stringify({
    domain: "economy.portable-customer-receipt.signature.v1",
    portableReceiptId: contentAddressedId,
    body: JSON.parse(
      canonicalEconomyPortableCustomerReceiptBodyPayload(body),
    ) as unknown,
    signature: canonicalSignatureMetadata(signature),
  });
  return { contentAddressedId, canonicalPayload };
}

/** Exact bytes covered by a portable receipt's detached signature. */
export function canonicalEconomyPortableCustomerReceiptSigningPayload(
  receipt: EconomyPortableCustomerReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyPortableCustomerReceipt(receipt, hashCanonicalPayload);
  const prepared = prepareEconomyPortableCustomerReceiptSignature(
    receipt,
    {
      schemaVersion: receipt.signature.schemaVersion,
      signatureVersion: receipt.signature.signatureVersion,
      algorithm: receipt.signature.algorithm,
      keyId: receipt.signature.keyId,
      signedAt: receipt.signature.signedAt,
    },
    hashCanonicalPayload,
  );
  economyAssert(
    prepared.contentAddressedId === receipt.portableReceiptId,
    "INVALID_CONTRACT",
    "Portable receipt signing ID does not match its receipt",
  );
  return prepared.canonicalPayload;
}

/** Canonical complete portable-receipt bytes, including its signature. */
export function canonicalEconomyPortableCustomerReceiptPayload(
  receipt: EconomyPortableCustomerReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyPortableCustomerReceipt(receipt, hashCanonicalPayload);
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    recoveryVersion: receipt.recoveryVersion,
    recordType: receipt.recordType,
    portableReceiptId: receipt.portableReceiptId,
    authorityId: receipt.authorityId,
    commandId: receipt.commandId,
    activityType: receipt.activityType,
    direction: receipt.direction,
    tokenAmount: receipt.tokenAmount,
    transactionId: receipt.transactionId,
    transactionCanonicalHash: receipt.transactionCanonicalHash,
    resultReceiptId: receipt.resultReceiptId,
    resultReceiptHash: receipt.resultReceiptHash,
    committedResultId: receipt.committedResultId,
    committedResultContentHash: receipt.committedResultContentHash,
    authorityCommitId: receipt.authorityCommitId,
    authorityCommitHash: receipt.authorityCommitHash,
    authoritySequence: receipt.authoritySequence,
    regionalEvidence: receipt.regionalEvidence.map(
      canonicalPortableEvidenceReference,
    ),
    ...(receipt.merkleInclusionProof === undefined
      ? {}
      : {
          merkleInclusionProof: canonicalMerkleProof(
            receipt.merkleInclusionProof,
          ),
        }),
    tokenTermsVersion: receipt.tokenTermsVersion,
    cashRedemptionAllowed: receipt.cashRedemptionAllowed,
    committedAt: receipt.committedAt,
    issuedAt: receipt.issuedAt,
    signature: canonicalSignature(receipt.signature),
  });
}

/** Verifies a portable receipt through an infrastructure-supplied key adapter. */
export function assertEconomyPortableCustomerReceiptSignature(
  receipt: EconomyPortableCustomerReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
  verifySignature: EconomyEvidenceSignatureVerifierV1,
): void {
  assertSignatureVerification(
    receipt.signature,
    canonicalEconomyPortableCustomerReceiptSigningPayload(
      receipt,
      hashCanonicalPayload,
    ),
    verifySignature,
    "Portable customer receipt",
  );
}

/**
 * Cross-validates the complete portable proof graph without storage, identity,
 * key-vault, or cloud-SDK dependencies.
 */
export function assertEconomyPortableCustomerReceiptEvidence(
  receipt: EconomyPortableCustomerReceiptV1,
  regionalReceipts: readonly EconomyRegionalEvidenceReceiptV1[],
  expectedRegions: readonly string[],
  anchor: EconomyIntegrityAnchorManifestV1 | undefined,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
  verifySignature: EconomyEvidenceSignatureVerifierV1,
): void {
  assertEconomyPortableCustomerReceiptSignature(
    receipt,
    hashCanonicalPayload,
    verifySignature,
  );
  assertEconomyRegionalEvidenceEquality(
    regionalReceipts,
    expectedRegions,
    hashCanonicalPayload,
  );
  economyAssert(
    regionalReceipts[0]?.recoveryRecordKind === "committed-result" &&
      regionalReceipts[0].recoveryRecordId === receipt.committedResultId &&
      regionalReceipts[0].recoveryRecordContentHash ===
        receipt.committedResultContentHash,
    "INVALID_CONTRACT",
    "Portable receipt does not reference the retained committed result",
  );

  const receiptByRegion = new Map(
    regionalReceipts.map((regionalReceipt) => [
      regionalReceipt.region,
      regionalReceipt,
    ]),
  );
  economyAssert(
    receipt.regionalEvidence.length === regionalReceipts.length,
    "INVALID_CONTRACT",
    "Portable receipt does not cover the complete regional evidence set",
  );
  for (const reference of receipt.regionalEvidence) {
    const regionalReceipt = receiptByRegion.get(reference.region);
    economyAssert(
      regionalReceipt !== undefined &&
        regionalReceipt.evidenceReceiptId === reference.evidenceReceiptId &&
        canonicalHash(
          canonicalEconomyRegionalEvidenceReceiptPayload(
            regionalReceipt,
            hashCanonicalPayload,
          ),
          hashCanonicalPayload,
          "Regional evidence-receipt hash",
        ) === reference.evidenceReceiptHash,
      "INVALID_CONTRACT",
      "Portable receipt regional evidence reference does not match",
    );
    assertEconomyRegionalEvidenceReceiptSignature(
      regionalReceipt,
      hashCanonicalPayload,
      verifySignature,
    );
  }

  if (receipt.merkleInclusionProof === undefined) {
    economyAssert(
      anchor === undefined,
      "INVALID_CONTRACT",
      "An anchor cannot be supplied without a portable inclusion proof",
    );
  } else {
    economyAssert(
      anchor !== undefined,
      "INVALID_CONTRACT",
      "Portable inclusion proof requires its anchor manifest",
    );
    assertEconomyMerkleInclusion(
      receipt.merkleInclusionProof,
      anchor,
      hashCanonicalPayload,
    );
  }
}
