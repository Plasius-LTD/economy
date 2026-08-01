import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type EconomyContractVersion,
  type IsoTimestamp,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { CanonicalPayloadHashFunctionV1 } from "./integrity.js";

/** Application ceiling below Cosmos DB's 100-operation transactional limit. */
export const ECONOMY_AUTHORITY_MAX_BATCH_OPERATIONS = 80;

/** Commit-manifest create plus authority-head conditional replacement. */
export const ECONOMY_AUTHORITY_COMMIT_OVERHEAD_OPERATIONS = 2;

/** Maximum referenced record writes within one 80-operation authority batch. */
export const ECONOMY_AUTHORITY_MAX_RECORD_REFERENCES =
  ECONOMY_AUTHORITY_MAX_BATCH_OPERATIONS -
  ECONOMY_AUTHORITY_COMMIT_OVERHEAD_OPERATIONS;

/** Application ceiling below Cosmos DB's 2 MiB transactional-batch limit. */
export const ECONOMY_AUTHORITY_MAX_BATCH_BYTES = 1_572_864;

/** Validates adapter-measured transactional operation and byte counts. */
export function assertEconomyAuthorityBatchLimits(
  operationCount: number,
  serializedBytes: number,
): void {
  economyAssert(
    Number.isSafeInteger(operationCount) &&
      operationCount >=
        ECONOMY_AUTHORITY_COMMIT_OVERHEAD_OPERATIONS + 1 &&
      operationCount <= ECONOMY_AUTHORITY_MAX_BATCH_OPERATIONS,
    "INVALID_CONTRACT",
    "Authority batch operation count exceeds the application boundary",
  );
  economyAssert(
    Number.isSafeInteger(serializedBytes) &&
      serializedBytes > 0 &&
      serializedBytes <= ECONOMY_AUTHORITY_MAX_BATCH_BYTES,
    "INVALID_CONTRACT",
    "Authority batch serialized size exceeds the application boundary",
  );
}

export type EconomyAuthorityStateV1 =
  | "open"
  | "acquisition-closed"
  | "closed"
  | "rebuilding";

export type EconomyAuthorityCommitKindV1 =
  | "genesis"
  | "first-party-command"
  | "provider-acceptance"
  | "provider-result"
  | "integrity-verification"
  | "state-transition"
  | "writer-fence-transition"
  | "reconstruction";

export type EconomyAuthorityRecordKindV1 =
  | "command-envelope"
  | "provider-evidence-manifest"
  | "provider-evidence"
  | "operational-handle-binding"
  | "workflow-event"
  | "accepted-receipt"
  | "result-receipt"
  | "journal-transaction"
  | "source-lot"
  | "source-lot-movement"
  | "gameplay-allocation"
  | "wallet"
  | "balance-projection"
  | "lifetime-projection"
  | "idempotency-result"
  | "outbox-event"
  | "work-item"
  | "dead-letter"
  | "integrity-receipt"
  | "integrity-anchor";

export type EconomyAuthorityWriteKindV1 =
  | "create"
  | "conditional-replace";

/**
 * Canonical reference to one record created or conditionally replaced by an
 * authority commit. Conditional replacements bind the previous content and a
 * hash of the adapter's optimistic-concurrency token; unconditional replacement
 * has no representation.
 */
export interface EconomyAuthorityRecordReferenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recordKind: EconomyAuthorityRecordKindV1;
  readonly recordId: string;
  readonly writeKind: EconomyAuthorityWriteKindV1;
  readonly contentHash: string;
  readonly previousContentHash?: string;
  readonly expectedConcurrencyTokenHash?: string;
}

/**
 * Immutable, hash-linked record of one authoritative atomic boundary.
 *
 * First-party commands carry acceptance and terminal effects in one manifest.
 * Provider commands use a provider-acceptance manifest followed by a
 * provider-result manifest after external reconciliation.
 */
export interface EconomyAuthorityCommitManifestV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commitId: string;
  readonly authorityId: string;
  readonly sequence: string;
  readonly commitKind: EconomyAuthorityCommitKindV1;
  readonly previousCommitHash?: string;
  readonly commandId?: string;
  readonly correlationId?: string;
  readonly authorityStateBefore: EconomyAuthorityStateV1;
  readonly authorityStateAfter: EconomyAuthorityStateV1;
  readonly stateReasonCode?: string;
  readonly recoveryVerificationReceiptId?: string;
  readonly recoveryVerificationReceiptHash?: string;
  readonly dualApprovalEvidenceHash?: string;
  readonly writerRegion: string;
  readonly writerFencingToken: string;
  readonly recordReferences: readonly EconomyAuthorityRecordReferenceV1[];
  readonly committedAt: IsoTimestamp;
}

/** Compare-and-swap projection for the singleton authority head. */
export interface EconomyAuthorityHeadV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly authorityId: string;
  readonly version: string;
  readonly state: EconomyAuthorityStateV1;
  readonly lastCommitId?: string;
  readonly lastCommitHash?: string;
  readonly writerRegion: string;
  readonly writerFencingToken: string;
  readonly updatedAt: IsoTimestamp;
}

/** Manifest plus the canonical hash calculated by an approved adapter. */
export interface HashedEconomyAuthorityCommitManifestV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly manifest: EconomyAuthorityCommitManifestV1;
  readonly canonicalHash: string;
}

export type EconomyIntegrityVerificationStatusV1 = "valid" | "invalid";

export type EconomyIntegrityFailureCodeV1 =
  | "authority-head-mismatch"
  | "commit-hash-mismatch"
  | "commit-link-mismatch"
  | "record-hash-mismatch"
  | "journal-head-mismatch"
  | "projection-mismatch";

/** Immutable, privacy-safe evidence of one bounded integrity verification. */
export interface EconomyIntegrityVerificationReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly verificationId: string;
  readonly authorityId: string;
  readonly status: EconomyIntegrityVerificationStatusV1;
  readonly checkedThroughSequence: string;
  readonly checkedCommits: string;
  readonly checkedRecords: string;
  readonly expectedAuthorityHeadHash: string;
  readonly observedAuthorityHeadHash: string;
  readonly expectedJournalHeadHash?: string;
  readonly observedJournalHeadHash?: string;
  readonly expectedProjectionSetHash?: string;
  readonly observedProjectionSetHash?: string;
  readonly anchorManifestHash?: string;
  readonly failureCode?: EconomyIntegrityFailureCodeV1;
  readonly firstInvalidCommitId?: string;
  readonly firstInvalidRecordId?: string;
  readonly verifiedAt: IsoTimestamp;
}

/**
 * Canonical hourly Merkle-root manifest. Signing and storage are deliberately
 * infrastructure responsibilities; this contract contains no private key,
 * signature, storage URI, or administrator-proof claim.
 */
export interface EconomyIntegrityAnchorManifestV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly anchorId: string;
  readonly authorityId: string;
  readonly firstCommitSequence: string;
  readonly lastCommitSequence: string;
  readonly leafCount: string;
  readonly merkleRootHash: string;
  readonly authorityHeadHash: string;
  readonly producedAt: IsoTimestamp;
}

const AUTHORITY_STATES = new Set<EconomyAuthorityStateV1>([
  "open",
  "acquisition-closed",
  "closed",
  "rebuilding",
]);

const COMMIT_KINDS = new Set<EconomyAuthorityCommitKindV1>([
  "genesis",
  "first-party-command",
  "provider-acceptance",
  "provider-result",
  "integrity-verification",
  "state-transition",
  "writer-fence-transition",
  "reconstruction",
]);

const RECORD_KINDS = new Set<EconomyAuthorityRecordKindV1>([
  "command-envelope",
  "provider-evidence-manifest",
  "provider-evidence",
  "operational-handle-binding",
  "workflow-event",
  "accepted-receipt",
  "result-receipt",
  "journal-transaction",
  "source-lot",
  "source-lot-movement",
  "gameplay-allocation",
  "wallet",
  "balance-projection",
  "lifetime-projection",
  "idempotency-result",
  "outbox-event",
  "work-item",
  "dead-letter",
  "integrity-receipt",
  "integrity-anchor",
]);

const INTEGRITY_FAILURE_CODES = new Set<EconomyIntegrityFailureCodeV1>([
  "authority-head-mismatch",
  "commit-hash-mismatch",
  "commit-link-mismatch",
  "record-hash-mismatch",
  "journal-head-mismatch",
  "projection-mismatch",
]);

const HEAD_KEYS = new Set([
  "schemaVersion",
  "authorityId",
  "version",
  "state",
  "lastCommitId",
  "lastCommitHash",
  "writerRegion",
  "writerFencingToken",
  "updatedAt",
]);

const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "commitId",
  "authorityId",
  "sequence",
  "commitKind",
  "previousCommitHash",
  "commandId",
  "correlationId",
  "authorityStateBefore",
  "authorityStateAfter",
  "stateReasonCode",
  "recoveryVerificationReceiptId",
  "recoveryVerificationReceiptHash",
  "dualApprovalEvidenceHash",
  "writerRegion",
  "writerFencingToken",
  "recordReferences",
  "committedAt",
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
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function assertCanonicalUnsignedInteger(
  value: string,
  label: string,
): void {
  economyAssert(
    typeof value === "string" && /^(?:0|[1-9][0-9]{0,38})$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical unsigned integer`,
  );
}

function assertSafeReasonCode(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && /^[A-Z][A-Z0-9_]{2,95}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a bounded uppercase reason code`,
  );
}

function referenceOrder(
  left: EconomyAuthorityRecordReferenceV1,
  right: EconomyAuthorityRecordReferenceV1,
): number {
  const byKind = compareUnicodeCodeUnits(left.recordKind, right.recordKind);
  return byKind === 0
    ? compareUnicodeCodeUnits(left.recordId, right.recordId)
    : byKind;
}

/** Validates one create-only or optimistic conditional-replace reference. */
export function assertEconomyAuthorityRecordReference(
  reference: EconomyAuthorityRecordReferenceV1,
): void {
  assertExactKeys(
    reference,
    new Set([
      "schemaVersion",
      "recordKind",
      "recordId",
      "writeKind",
      "contentHash",
      "previousContentHash",
      "expectedConcurrencyTokenHash",
    ]),
    "Authority record reference",
  );
  economyAssert(
    reference.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      RECORD_KINDS.has(reference.recordKind) &&
      ["create", "conditional-replace"].includes(reference.writeKind),
    "INVALID_CONTRACT",
    "Unsupported authority record reference",
  );
  assertEconomyIdentifier(reference.recordId, "authority recordId");
  assertCanonicalHash(reference.contentHash, "Authority record content hash");
  if (reference.writeKind === "create") {
    economyAssert(
      reference.previousContentHash === undefined &&
        reference.expectedConcurrencyTokenHash === undefined,
      "INVALID_CONTRACT",
      "Create references cannot carry replacement concurrency evidence",
    );
  } else {
    economyAssert(
      reference.previousContentHash !== undefined &&
        reference.expectedConcurrencyTokenHash !== undefined,
      "INVALID_CONTRACT",
      "Conditional replacements require prior content and concurrency hashes",
    );
    assertCanonicalHash(
      reference.previousContentHash,
      "Previous record content hash",
    );
    assertCanonicalHash(
      reference.expectedConcurrencyTokenHash,
      "Expected concurrency-token hash",
    );
  }
}

function assertCanonicalRecordReferences(
  references: readonly EconomyAuthorityRecordReferenceV1[],
): void {
  economyAssert(
    references.length > 0 &&
      references.length <= ECONOMY_AUTHORITY_MAX_RECORD_REFERENCES,
    "INVALID_CONTRACT",
    `Authority commits require between 1 and ${ECONOMY_AUTHORITY_MAX_RECORD_REFERENCES} record references`,
  );
  let previous: EconomyAuthorityRecordReferenceV1 | undefined;
  for (const reference of references) {
    assertEconomyAuthorityRecordReference(reference);
    economyAssert(
      previous === undefined || referenceOrder(previous, reference) < 0,
      "INVALID_CONTRACT",
      "Authority record references must be unique and canonically ordered",
    );
    previous = reference;
  }
}

function assertCommitCommandBinding(
  manifest: EconomyAuthorityCommitManifestV1,
): void {
  const commandCommit = [
    "first-party-command",
    "provider-acceptance",
    "provider-result",
  ].includes(manifest.commitKind);
  economyAssert(
    commandCommit
      ? manifest.commandId !== undefined &&
          manifest.correlationId !== undefined
      : manifest.commandId === undefined &&
          manifest.correlationId === undefined,
    "INVALID_CONTRACT",
    "Only command commits require command and correlation identifiers",
  );
  if (manifest.commandId !== undefined) {
    assertEconomyIdentifier(manifest.commandId, "commandId");
    assertEconomyIdentifier(manifest.correlationId!, "correlationId");
  }
}

function assertStateTransitionEvidence(
  manifest: EconomyAuthorityCommitManifestV1,
): void {
  const changesState =
    manifest.authorityStateBefore !== manifest.authorityStateAfter;
  economyAssert(
    (manifest.commitKind === "state-transition") === changesState,
    "INVALID_CONTRACT",
    "Only state-transition commits may change authority state",
  );
  if (manifest.commitKind === "state-transition") {
    economyAssert(
      manifest.stateReasonCode !== undefined,
      "INVALID_CONTRACT",
      "Authority state transitions require a reason code",
    );
    assertSafeReasonCode(
      manifest.stateReasonCode,
      "Authority state-transition reason",
    );
    const allowedTransition =
      (manifest.authorityStateBefore === "open" &&
        (manifest.authorityStateAfter === "acquisition-closed" ||
          manifest.authorityStateAfter === "closed")) ||
      (manifest.authorityStateBefore === "acquisition-closed" &&
        (manifest.authorityStateAfter === "closed" ||
          manifest.authorityStateAfter === "open")) ||
      (manifest.authorityStateBefore === "closed" &&
        manifest.authorityStateAfter === "rebuilding") ||
      (manifest.authorityStateBefore === "rebuilding" &&
        (manifest.authorityStateAfter === "closed" ||
          manifest.authorityStateAfter === "open"));
    economyAssert(
      allowedTransition,
      "INVALID_CONTRACT",
      "Authority state transition is not permitted",
    );
    if (
      manifest.authorityStateAfter === "open" &&
      manifest.authorityStateBefore !== "open"
    ) {
      economyAssert(
        (manifest.authorityStateBefore === "rebuilding" ||
          manifest.authorityStateBefore === "acquisition-closed") &&
          manifest.recoveryVerificationReceiptId !== undefined &&
          manifest.recoveryVerificationReceiptHash !== undefined &&
          manifest.dualApprovalEvidenceHash !== undefined,
        "INVALID_CONTRACT",
        "Reopening requires a recoverable state, fresh verification, and dual approval",
      );
      assertEconomyIdentifier(
        manifest.recoveryVerificationReceiptId,
        "recoveryVerificationReceiptId",
      );
      assertCanonicalHash(
        manifest.recoveryVerificationReceiptHash,
        "Recovery verification-receipt hash",
      );
      assertCanonicalHash(
        manifest.dualApprovalEvidenceHash,
        "Dual-approval evidence hash",
      );
    } else {
      economyAssert(
        manifest.recoveryVerificationReceiptId === undefined &&
          manifest.recoveryVerificationReceiptHash === undefined &&
          manifest.dualApprovalEvidenceHash === undefined,
        "INVALID_CONTRACT",
        "Recovery evidence is only valid when reopening from rebuilding",
      );
    }
  } else if (manifest.commitKind === "writer-fence-transition") {
    economyAssert(
      manifest.stateReasonCode !== undefined &&
        manifest.recoveryVerificationReceiptId === undefined &&
        manifest.recoveryVerificationReceiptHash === undefined &&
        manifest.dualApprovalEvidenceHash === undefined,
      "INVALID_CONTRACT",
      "Writer-fence transitions require only a reason code",
    );
    assertSafeReasonCode(
      manifest.stateReasonCode,
      "Writer-fence transition reason",
    );
  } else {
    economyAssert(
      manifest.stateReasonCode === undefined &&
        manifest.recoveryVerificationReceiptId === undefined &&
        manifest.recoveryVerificationReceiptHash === undefined &&
        manifest.dualApprovalEvidenceHash === undefined,
      "INVALID_CONTRACT",
      "Non-transition commits cannot carry transition evidence",
    );
  }
}

function assertCommitAllowedInState(
  manifest: EconomyAuthorityCommitManifestV1,
): void {
  const state = manifest.authorityStateBefore;
  if (
    manifest.commitKind === "first-party-command" ||
    manifest.commitKind === "provider-acceptance"
  ) {
    economyAssert(
      state === "open",
      "INVALID_CONTRACT",
      "New commands and provider acceptance require an open authority",
    );
  } else if (manifest.commitKind === "provider-result") {
    economyAssert(
      state === "open" || state === "acquisition-closed",
      "INVALID_CONTRACT",
      "Provider results require an open or acquisition-closed authority",
    );
  } else if (manifest.commitKind === "reconstruction") {
    economyAssert(
      state === "rebuilding",
      "INVALID_CONTRACT",
      "Reconstruction commits require rebuilding state",
    );
  }
}

/** Validates one immutable authority commit manifest. */
export function assertEconomyAuthorityCommitManifest(
  manifest: EconomyAuthorityCommitManifestV1,
): void {
  assertExactKeys(manifest, MANIFEST_KEYS, "Authority commit manifest");
  economyAssert(
    manifest.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      COMMIT_KINDS.has(manifest.commitKind) &&
      AUTHORITY_STATES.has(manifest.authorityStateBefore) &&
      AUTHORITY_STATES.has(manifest.authorityStateAfter),
    "INVALID_CONTRACT",
    "Unsupported authority commit manifest",
  );
  assertEconomyIdentifier(manifest.commitId, "commitId");
  assertEconomyIdentifier(manifest.authorityId, "authorityId");
  assertCanonicalUnsignedInteger(manifest.sequence, "Commit sequence");
  economyAssert(
    manifest.sequence !== "0",
    "INVALID_CONTRACT",
    "Authority commit sequence must be positive",
  );
  if (manifest.previousCommitHash !== undefined) {
    assertCanonicalHash(
      manifest.previousCommitHash,
      "Previous authority commit hash",
    );
  }
  economyAssert(
    (manifest.sequence === "1") ===
      (manifest.previousCommitHash === undefined),
    "INVALID_CONTRACT",
    "Only the first authority commit omits its previous hash",
  );
  economyAssert(
    (manifest.commitKind === "genesis") === (manifest.sequence === "1"),
    "INVALID_CONTRACT",
    "The first authority commit must be the unique genesis commit",
  );
  economyAssert(
    Array.isArray(manifest.recordReferences),
    "INVALID_CONTRACT",
    "Authority record references must be an array",
  );
  assertCommitCommandBinding(manifest);
  assertStateTransitionEvidence(manifest);
  assertCommitAllowedInState(manifest);
  assertEconomyIdentifier(manifest.writerRegion, "writerRegion");
  assertEconomyIdentifier(
    manifest.writerFencingToken,
    "writerFencingToken",
  );
  assertCanonicalRecordReferences(manifest.recordReferences);
  parseIsoTimestamp(manifest.committedAt);
}

/** Validates an empty or populated singleton authority head. */
export function assertEconomyAuthorityHead(
  head: EconomyAuthorityHeadV1,
): void {
  assertExactKeys(head, HEAD_KEYS, "Economy authority head");
  economyAssert(
    head.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      AUTHORITY_STATES.has(head.state),
    "INVALID_CONTRACT",
    "Unsupported economy authority head",
  );
  assertEconomyIdentifier(head.authorityId, "authorityId");
  assertCanonicalUnsignedInteger(head.version, "Authority-head version");
  const hasCommitId = head.lastCommitId !== undefined;
  const hasCommitHash = head.lastCommitHash !== undefined;
  economyAssert(
    hasCommitId === hasCommitHash &&
      (head.version !== "0") === hasCommitId,
    "INVALID_CONTRACT",
    "Authority-head version and last-commit fields are inconsistent",
  );
  if (head.lastCommitId !== undefined) {
    assertEconomyIdentifier(head.lastCommitId, "lastCommitId");
    assertCanonicalHash(head.lastCommitHash!, "Last commit hash");
  }
  assertEconomyIdentifier(head.writerRegion, "writerRegion");
  assertEconomyIdentifier(
    head.writerFencingToken,
    "writerFencingToken",
  );
  parseIsoTimestamp(head.updatedAt);
}

/**
 * Proves that a canonical manifest advances the locked singleton authority
 * head by exactly one sequence and returns the compare-and-swap replacement.
 */
export function advanceEconomyAuthorityHead(
  head: EconomyAuthorityHeadV1,
  manifest: EconomyAuthorityCommitManifestV1,
  manifestCanonicalHash: string,
): EconomyAuthorityHeadV1 {
  assertEconomyAuthorityHead(head);
  assertEconomyAuthorityCommitManifest(manifest);
  assertCanonicalHash(manifestCanonicalHash, "Authority manifest hash");
  economyAssert(
    manifest.authorityId === head.authorityId &&
      BigInt(manifest.sequence) === BigInt(head.version) + 1n &&
      manifest.previousCommitHash === head.lastCommitHash &&
      manifest.authorityStateBefore === head.state,
    "INVALID_CONTRACT",
    "Authority manifest does not extend the locked head",
  );
  const fenceTransition = manifest.commitKind === "writer-fence-transition";
  economyAssert(
    fenceTransition
      ? manifest.writerRegion !== head.writerRegion ||
          manifest.writerFencingToken !== head.writerFencingToken
      : manifest.writerRegion === head.writerRegion &&
          manifest.writerFencingToken === head.writerFencingToken,
    "INVALID_CONTRACT",
    "Authority writer identity may change only through a fence transition",
  );
  economyAssert(
    parseIsoTimestamp(manifest.committedAt) >=
      parseIsoTimestamp(head.updatedAt),
    "INVALID_TIME_WINDOW",
    "Authority commit cannot precede the locked head",
  );
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    authorityId: head.authorityId,
    version: manifest.sequence,
    state: manifest.authorityStateAfter,
    lastCommitId: manifest.commitId,
    lastCommitHash: manifestCanonicalHash,
    writerRegion: manifest.writerRegion,
    writerFencingToken: manifest.writerFencingToken,
    updatedAt: manifest.committedAt,
  };
}

/** Validates one append-only result from a bounded integrity check. */
export function assertEconomyIntegrityVerificationReceipt(
  receipt: EconomyIntegrityVerificationReceiptV1,
): void {
  assertExactKeys(
    receipt,
    new Set([
      "schemaVersion",
      "verificationId",
      "authorityId",
      "status",
      "checkedThroughSequence",
      "checkedCommits",
      "checkedRecords",
      "expectedAuthorityHeadHash",
      "observedAuthorityHeadHash",
      "expectedJournalHeadHash",
      "observedJournalHeadHash",
      "expectedProjectionSetHash",
      "observedProjectionSetHash",
      "anchorManifestHash",
      "failureCode",
      "firstInvalidCommitId",
      "firstInvalidRecordId",
      "verifiedAt",
    ]),
    "Integrity-verification receipt",
  );
  economyAssert(
    receipt.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      ["valid", "invalid"].includes(receipt.status),
    "INVALID_CONTRACT",
    "Unsupported integrity-verification receipt",
  );
  assertEconomyIdentifier(receipt.verificationId, "verificationId");
  assertEconomyIdentifier(receipt.authorityId, "authorityId");
  assertCanonicalUnsignedInteger(
    receipt.checkedThroughSequence,
    "Checked-through sequence",
  );
  assertCanonicalUnsignedInteger(receipt.checkedCommits, "Checked commits");
  assertCanonicalUnsignedInteger(receipt.checkedRecords, "Checked records");
  assertCanonicalHash(
    receipt.expectedAuthorityHeadHash,
    "Expected authority-head hash",
  );
  assertCanonicalHash(
    receipt.observedAuthorityHeadHash,
    "Observed authority-head hash",
  );
  const journalPair =
    receipt.expectedJournalHeadHash !== undefined ||
    receipt.observedJournalHeadHash !== undefined;
  economyAssert(
    !journalPair ||
      (receipt.expectedJournalHeadHash !== undefined &&
        receipt.observedJournalHeadHash !== undefined),
    "INVALID_CONTRACT",
    "Journal integrity hashes must be supplied together",
  );
  if (receipt.expectedJournalHeadHash !== undefined) {
    assertCanonicalHash(
      receipt.expectedJournalHeadHash,
      "Expected journal-head hash",
    );
    assertCanonicalHash(
      receipt.observedJournalHeadHash!,
      "Observed journal-head hash",
    );
  }
  const projectionPair =
    receipt.expectedProjectionSetHash !== undefined ||
    receipt.observedProjectionSetHash !== undefined;
  economyAssert(
    !projectionPair ||
      (receipt.expectedProjectionSetHash !== undefined &&
        receipt.observedProjectionSetHash !== undefined),
    "INVALID_CONTRACT",
    "Projection integrity hashes must be supplied together",
  );
  if (receipt.expectedProjectionSetHash !== undefined) {
    assertCanonicalHash(
      receipt.expectedProjectionSetHash,
      "Expected projection-set hash",
    );
    assertCanonicalHash(
      receipt.observedProjectionSetHash!,
      "Observed projection-set hash",
    );
  }
  if (receipt.anchorManifestHash !== undefined) {
    assertCanonicalHash(
      receipt.anchorManifestHash,
      "Integrity anchor manifest hash",
    );
  }
  if (receipt.firstInvalidCommitId !== undefined) {
    assertEconomyIdentifier(
      receipt.firstInvalidCommitId,
      "firstInvalidCommitId",
    );
  }
  if (receipt.firstInvalidRecordId !== undefined) {
    assertEconomyIdentifier(
      receipt.firstInvalidRecordId,
      "firstInvalidRecordId",
    );
  }
  if (receipt.status === "valid") {
    economyAssert(
      receipt.failureCode === undefined &&
        receipt.firstInvalidCommitId === undefined &&
        receipt.firstInvalidRecordId === undefined &&
        receipt.expectedAuthorityHeadHash ===
          receipt.observedAuthorityHeadHash &&
        (receipt.expectedJournalHeadHash === undefined ||
          receipt.expectedJournalHeadHash ===
            receipt.observedJournalHeadHash) &&
        (receipt.expectedProjectionSetHash === undefined ||
          receipt.expectedProjectionSetHash ===
            receipt.observedProjectionSetHash),
      "INVALID_CONTRACT",
      "Valid integrity receipts cannot contain mismatches",
    );
  } else {
    economyAssert(
      receipt.failureCode !== undefined &&
        INTEGRITY_FAILURE_CODES.has(receipt.failureCode),
      "INVALID_CONTRACT",
      "Invalid integrity receipts require a safe failure code",
    );
    if (receipt.failureCode === "authority-head-mismatch") {
      economyAssert(
        receipt.expectedAuthorityHeadHash !==
          receipt.observedAuthorityHeadHash,
        "INVALID_CONTRACT",
        "Authority-head mismatch requires different head hashes",
      );
    }
    if (receipt.failureCode === "journal-head-mismatch") {
      economyAssert(
        receipt.expectedJournalHeadHash !== undefined &&
          receipt.expectedJournalHeadHash !==
            receipt.observedJournalHeadHash,
        "INVALID_CONTRACT",
        "Journal-head mismatch requires different journal hashes",
      );
    }
    if (receipt.failureCode === "projection-mismatch") {
      economyAssert(
        receipt.expectedProjectionSetHash !== undefined &&
          receipt.expectedProjectionSetHash !==
            receipt.observedProjectionSetHash,
        "INVALID_CONTRACT",
        "Projection mismatch requires different projection hashes",
      );
    }
    if (
      receipt.failureCode === "commit-hash-mismatch" ||
      receipt.failureCode === "commit-link-mismatch"
    ) {
      economyAssert(
        receipt.firstInvalidCommitId !== undefined,
        "INVALID_CONTRACT",
        "Commit integrity failures require the first invalid commit",
      );
    }
    if (receipt.failureCode === "record-hash-mismatch") {
      economyAssert(
        receipt.firstInvalidRecordId !== undefined,
        "INVALID_CONTRACT",
        "Record integrity failures require the first invalid record",
      );
    }
  }
  parseIsoTimestamp(receipt.verifiedAt);
}

/** Validates one canonical hourly Merkle-root manifest. */
export function assertEconomyIntegrityAnchorManifest(
  manifest: EconomyIntegrityAnchorManifestV1,
): void {
  assertExactKeys(
    manifest,
    new Set([
      "schemaVersion",
      "anchorId",
      "authorityId",
      "firstCommitSequence",
      "lastCommitSequence",
      "leafCount",
      "merkleRootHash",
      "authorityHeadHash",
      "producedAt",
    ]),
    "Integrity anchor manifest",
  );
  economyAssert(
    manifest.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported integrity anchor manifest",
  );
  assertEconomyIdentifier(manifest.anchorId, "anchorId");
  assertEconomyIdentifier(manifest.authorityId, "authorityId");
  assertCanonicalUnsignedInteger(
    manifest.firstCommitSequence,
    "First commit sequence",
  );
  assertCanonicalUnsignedInteger(
    manifest.lastCommitSequence,
    "Last commit sequence",
  );
  assertCanonicalUnsignedInteger(manifest.leafCount, "Merkle leaf count");
  economyAssert(
    BigInt(manifest.firstCommitSequence) <=
      BigInt(manifest.lastCommitSequence) &&
      BigInt(manifest.leafCount) ===
        BigInt(manifest.lastCommitSequence) -
          BigInt(manifest.firstCommitSequence) +
          1n,
    "INVALID_CONTRACT",
    "Integrity anchor sequence range and leaf count are inconsistent",
  );
  assertCanonicalHash(manifest.merkleRootHash, "Merkle root hash");
  assertCanonicalHash(manifest.authorityHeadHash, "Authority-head hash");
  parseIsoTimestamp(manifest.producedAt);
}

function canonicalAuthorityRecordReference(
  reference: EconomyAuthorityRecordReferenceV1,
): Readonly<Record<string, string>> {
  return {
    schemaVersion: reference.schemaVersion,
    recordKind: reference.recordKind,
    recordId: reference.recordId,
    writeKind: reference.writeKind,
    contentHash: reference.contentHash,
    ...(reference.previousContentHash === undefined
      ? {}
      : { previousContentHash: reference.previousContentHash }),
    ...(reference.expectedConcurrencyTokenHash === undefined
      ? {}
      : {
          expectedConcurrencyTokenHash:
            reference.expectedConcurrencyTokenHash,
        }),
  };
}

/** Produces deterministic UTF-8 JSON for a singleton authority head. */
export function canonicalEconomyAuthorityHeadPayload(
  head: EconomyAuthorityHeadV1,
): string {
  assertEconomyAuthorityHead(head);
  return JSON.stringify({
    schemaVersion: head.schemaVersion,
    authorityId: head.authorityId,
    version: head.version,
    state: head.state,
    ...(head.lastCommitId === undefined
      ? {}
      : { lastCommitId: head.lastCommitId }),
    ...(head.lastCommitHash === undefined
      ? {}
      : { lastCommitHash: head.lastCommitHash }),
    writerRegion: head.writerRegion,
    writerFencingToken: head.writerFencingToken,
    updatedAt: head.updatedAt,
  });
}

/** Produces deterministic UTF-8 JSON for an authority commit manifest. */
export function canonicalEconomyAuthorityCommitManifestPayload(
  manifest: EconomyAuthorityCommitManifestV1,
): string {
  assertEconomyAuthorityCommitManifest(manifest);
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    commitId: manifest.commitId,
    authorityId: manifest.authorityId,
    sequence: manifest.sequence,
    commitKind: manifest.commitKind,
    ...(manifest.previousCommitHash === undefined
      ? {}
      : { previousCommitHash: manifest.previousCommitHash }),
    ...(manifest.commandId === undefined
      ? {}
      : { commandId: manifest.commandId }),
    ...(manifest.correlationId === undefined
      ? {}
      : { correlationId: manifest.correlationId }),
    authorityStateBefore: manifest.authorityStateBefore,
    authorityStateAfter: manifest.authorityStateAfter,
    ...(manifest.stateReasonCode === undefined
      ? {}
      : { stateReasonCode: manifest.stateReasonCode }),
    ...(manifest.recoveryVerificationReceiptId === undefined
      ? {}
      : {
          recoveryVerificationReceiptId:
            manifest.recoveryVerificationReceiptId,
        }),
    ...(manifest.recoveryVerificationReceiptHash === undefined
      ? {}
      : {
          recoveryVerificationReceiptHash:
            manifest.recoveryVerificationReceiptHash,
        }),
    ...(manifest.dualApprovalEvidenceHash === undefined
      ? {}
      : {
          dualApprovalEvidenceHash:
            manifest.dualApprovalEvidenceHash,
        }),
    writerRegion: manifest.writerRegion,
    writerFencingToken: manifest.writerFencingToken,
    recordReferences: manifest.recordReferences.map(
      canonicalAuthorityRecordReference,
    ),
    committedAt: manifest.committedAt,
  });
}

/** Produces deterministic UTF-8 JSON for an integrity-verification receipt. */
export function canonicalEconomyIntegrityVerificationReceiptPayload(
  receipt: EconomyIntegrityVerificationReceiptV1,
): string {
  assertEconomyIntegrityVerificationReceipt(receipt);
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    verificationId: receipt.verificationId,
    authorityId: receipt.authorityId,
    status: receipt.status,
    checkedThroughSequence: receipt.checkedThroughSequence,
    checkedCommits: receipt.checkedCommits,
    checkedRecords: receipt.checkedRecords,
    expectedAuthorityHeadHash: receipt.expectedAuthorityHeadHash,
    observedAuthorityHeadHash: receipt.observedAuthorityHeadHash,
    ...(receipt.expectedJournalHeadHash === undefined
      ? {}
      : { expectedJournalHeadHash: receipt.expectedJournalHeadHash }),
    ...(receipt.observedJournalHeadHash === undefined
      ? {}
      : { observedJournalHeadHash: receipt.observedJournalHeadHash }),
    ...(receipt.expectedProjectionSetHash === undefined
      ? {}
      : {
          expectedProjectionSetHash:
            receipt.expectedProjectionSetHash,
        }),
    ...(receipt.observedProjectionSetHash === undefined
      ? {}
      : {
          observedProjectionSetHash:
            receipt.observedProjectionSetHash,
        }),
    ...(receipt.anchorManifestHash === undefined
      ? {}
      : { anchorManifestHash: receipt.anchorManifestHash }),
    ...(receipt.failureCode === undefined
      ? {}
      : { failureCode: receipt.failureCode }),
    ...(receipt.firstInvalidCommitId === undefined
      ? {}
      : { firstInvalidCommitId: receipt.firstInvalidCommitId }),
    ...(receipt.firstInvalidRecordId === undefined
      ? {}
      : { firstInvalidRecordId: receipt.firstInvalidRecordId }),
    verifiedAt: receipt.verifiedAt,
  });
}

/** Produces deterministic UTF-8 JSON for an hourly integrity anchor. */
export function canonicalEconomyIntegrityAnchorManifestPayload(
  manifest: EconomyIntegrityAnchorManifestV1,
): string {
  assertEconomyIntegrityAnchorManifest(manifest);
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    anchorId: manifest.anchorId,
    authorityId: manifest.authorityId,
    firstCommitSequence: manifest.firstCommitSequence,
    lastCommitSequence: manifest.lastCommitSequence,
    leafCount: manifest.leafCount,
    merkleRootHash: manifest.merkleRootHash,
    authorityHeadHash: manifest.authorityHeadHash,
    producedAt: manifest.producedAt,
  });
}

/**
 * Proves that a reopening manifest binds a successful verification receipt.
 * The consuming service remains responsible for its maximum allowed age.
 */
export function assertEconomyAuthorityRecoveryEvidence(
  manifest: EconomyAuthorityCommitManifestV1,
  receipt: EconomyIntegrityVerificationReceiptV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): void {
  assertEconomyAuthorityCommitManifest(manifest);
  assertEconomyIntegrityVerificationReceipt(receipt);
  economyAssert(
    manifest.commitKind === "state-transition" &&
      manifest.authorityStateAfter === "open" &&
      receipt.status === "valid" &&
      receipt.authorityId === manifest.authorityId &&
      receipt.verificationId ===
        manifest.recoveryVerificationReceiptId &&
      BigInt(receipt.checkedThroughSequence) <
        BigInt(manifest.sequence) &&
      parseIsoTimestamp(receipt.verifiedAt) <=
        parseIsoTimestamp(manifest.committedAt),
    "INVALID_CONTRACT",
    "Authority reopening is not bound to a prior successful verification",
  );
  const receiptHash = hashCanonicalPayload(
    canonicalEconomyIntegrityVerificationReceiptPayload(receipt),
  );
  assertCanonicalHash(receiptHash, "Recovery verification-receipt hash");
  economyAssert(
    receiptHash === manifest.recoveryVerificationReceiptHash,
    "INVALID_CONTRACT",
    "Recovery verification receipt does not match its manifest hash",
  );
}

/**
 * Returns a copy in the canonical record-reference order expected by manifests.
 * Construction helpers may use this before validation; canonicalization itself
 * never silently reorders a malformed manifest.
 */
export function sortEconomyAuthorityRecordReferences(
  references: readonly EconomyAuthorityRecordReferenceV1[],
): readonly EconomyAuthorityRecordReferenceV1[] {
  return [...references].sort(referenceOrder);
}
