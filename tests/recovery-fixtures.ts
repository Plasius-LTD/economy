import { createHash } from "node:crypto";
import {
  canonicalEconomyIntegrityAnchorManifestPayload,
  canonicalEconomyRecoveryAcceptanceEnvelopePayload,
  canonicalEconomyRecoveryCommittedResultPayload,
  canonicalEconomyRegionalEvidenceReceiptPayload,
  createEconomyPortableCustomerReceipt,
  createEconomyRecoveryAcceptanceEnvelope,
  createEconomyRecoveryCommittedResult,
  createEconomyRegionalEvidenceReceipt,
  prepareEconomyPortableCustomerReceiptSignature,
  prepareEconomyRegionalEvidenceReceiptSignature,
  serializeTokenSubunits,
  type EconomyEvidenceSignatureMetadataV1,
  type EconomyIntegrityAnchorManifestV1,
  type EconomyMerkleInclusionProofV1,
  type EconomyPortableCustomerReceiptBodyV1,
  type EconomyPortableCustomerReceiptV1,
  type EconomyRecoveryAcceptanceBodyV1,
  type EconomyRecoveryAcceptanceEnvelopeV1,
  type EconomyRecoveryCommittedResultBodyV1,
  type EconomyRecoveryCommittedResultV1,
  type EconomyRegionalEvidenceReceiptBodyV1,
  type EconomyRegionalEvidenceReceiptV1,
  type EconomySealedRecoveryPayloadV1,
} from "../src/index.js";
import { fingerprint } from "./audit-fixtures.js";

export const RECOVERY_HASH_A = `sha256:${"1".repeat(64)}`;
export const RECOVERY_HASH_B = `sha256:${"2".repeat(64)}`;
export const RECOVERY_HASH_C = `sha256:${"3".repeat(64)}`;
export const RECOVERY_HASH_D = `sha256:${"4".repeat(64)}`;
export const RECOVERY_HASH_E = `sha256:${"5".repeat(64)}`;

export function recoveryHash(payload: string): string {
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

function fakeSignatureValue(
  canonicalPayload: string,
  keyId: string,
): string {
  return createHash("sha512")
    .update(`${keyId}\n${canonicalPayload}`, "utf8")
    .digest("base64url");
}

export function verifyFakeSignature(input: {
  readonly keyId: string;
  readonly signature: string;
  readonly canonicalPayload: string;
}): boolean {
  return (
    input.signature ===
    fakeSignatureValue(input.canonicalPayload, input.keyId)
  );
}

function signatureMetadata(
  keyId: string,
  signedAt: string,
): EconomyEvidenceSignatureMetadataV1 {
  return {
    schemaVersion: "1",
    signatureVersion: "1",
    algorithm: "ed25519",
    keyId,
    signedAt,
  };
}

export function sealedRecoveryPayload(
  overrides: Partial<EconomySealedRecoveryPayloadV1> = {},
): EconomySealedRecoveryPayloadV1 {
  return {
    schemaVersion: "1",
    payloadVersion: "1",
    cipherSuite: "AES-256-GCM",
    encoding: "base64url",
    keyVersion: "recovery-key:7",
    nonce: "A".repeat(16),
    ciphertext: "B".repeat(96),
    authenticationTag: "C".repeat(22),
    plaintextContentHash: RECOVERY_HASH_A,
    encryptionContextHash: RECOVERY_HASH_B,
    ...overrides,
  };
}

export function recoveryAcceptanceBody(
  overrides: Partial<EconomyRecoveryAcceptanceBodyV1> = {},
): EconomyRecoveryAcceptanceBodyV1 {
  return {
    schemaVersion: "1",
    recoveryVersion: "1",
    recordType: "economy-recovery-acceptance",
    authorityId: "economy:authority:global",
    commandId: "command:purchase:1",
    correlationId: "correlation:checkout:1",
    idempotencyFingerprint: fingerprint(
      "economy.idempotency-key.v1",
      "6",
    ),
    commandEnvelopeHash: RECOVERY_HASH_C,
    acceptedReceiptId: "receipt:accepted:1",
    acceptedReceiptHash: RECOVERY_HASH_D,
    sealedPayload: sealedRecoveryPayload(),
    preparedAt: "2026-07-26T10:00:00.000Z",
    acceptedAt: "2026-07-26T10:00:01.000Z",
    ...overrides,
  };
}

export function recoveryAcceptance(
  overrides: Partial<EconomyRecoveryAcceptanceBodyV1> = {},
): EconomyRecoveryAcceptanceEnvelopeV1 {
  return createEconomyRecoveryAcceptanceEnvelope(
    recoveryAcceptanceBody(overrides),
    recoveryHash,
  );
}

export function recoveryCommittedResultBody(
  acceptance: EconomyRecoveryAcceptanceEnvelopeV1,
  overrides: Partial<EconomyRecoveryCommittedResultBodyV1> = {},
): EconomyRecoveryCommittedResultBodyV1 {
  return {
    schemaVersion: "1",
    recoveryVersion: "1",
    recordType: "economy-recovery-committed-result",
    authorityId: acceptance.authorityId,
    commandId: acceptance.commandId,
    correlationId: acceptance.correlationId,
    acceptanceEnvelopeId: acceptance.acceptanceEnvelopeId,
    acceptanceEnvelopeHash: recoveryHash(
      canonicalEconomyRecoveryAcceptanceEnvelopePayload(
        acceptance,
        recoveryHash,
      ),
    ),
    resultReceiptId: "receipt:completed:1",
    resultReceiptHash: RECOVERY_HASH_E,
    outcome: "completed",
    authorityCommitId: "authority-commit:10",
    authorityCommitHash: RECOVERY_HASH_A,
    authoritySequence: "10",
    authorityHeadHashAfter: RECOVERY_HASH_B,
    transactionId: "transaction:purchase:1",
    transactionCanonicalHash: RECOVERY_HASH_C,
    sealedPayload: sealedRecoveryPayload({
      plaintextContentHash: RECOVERY_HASH_D,
    }),
    committedAt: "2026-07-26T10:00:02.000Z",
    ...overrides,
  };
}

export function recoveryCommittedResult(
  acceptance: EconomyRecoveryAcceptanceEnvelopeV1,
  overrides: Partial<EconomyRecoveryCommittedResultBodyV1> = {},
): EconomyRecoveryCommittedResultV1 {
  return createEconomyRecoveryCommittedResult(
    recoveryCommittedResultBody(acceptance, overrides),
    recoveryHash,
  );
}

export function signedRegionalReceipt(
  body: EconomyRegionalEvidenceReceiptBodyV1,
  keyId = `evidence-signer:${body.region}`,
): EconomyRegionalEvidenceReceiptV1 {
  const metadata = signatureMetadata(keyId, body.storedAt);
  const prepared = prepareEconomyRegionalEvidenceReceiptSignature(
    body,
    metadata,
    recoveryHash,
  );
  return createEconomyRegionalEvidenceReceipt(
    body,
    {
      ...metadata,
      value: fakeSignatureValue(prepared.canonicalPayload, keyId),
    },
    recoveryHash,
  );
}

export function regionalReceiptBody(
  region: string,
  result: EconomyRecoveryCommittedResultV1,
  overrides: Partial<EconomyRegionalEvidenceReceiptBodyV1> = {},
): EconomyRegionalEvidenceReceiptBodyV1 {
  return {
    schemaVersion: "1",
    recoveryVersion: "1",
    recordType: "economy-regional-evidence-receipt",
    journalId: `recovery-journal:${region}`,
    region,
    sequence: "1",
    authorityId: result.authorityId,
    commandId: result.commandId,
    recoveryRecordKind: "committed-result",
    recoveryRecordId: result.committedResultId,
    recoveryRecordContentHash: recoveryHash(
      canonicalEconomyRecoveryCommittedResultPayload(result, recoveryHash),
    ),
    storedAt: "2026-07-26T10:00:03.000Z",
    retentionUntil: "2033-07-26T10:00:03.000Z",
    ...overrides,
  };
}

export function regionalResultReceipts(
  result: EconomyRecoveryCommittedResultV1,
): readonly [
  EconomyRegionalEvidenceReceiptV1,
  EconomyRegionalEvidenceReceiptV1,
] {
  return [
    signedRegionalReceipt(regionalReceiptBody("uk-south", result)),
    signedRegionalReceipt(regionalReceiptBody("uk-west", result)),
  ];
}

function merkleNode(leftHash: string, rightHash: string): string {
  return recoveryHash(
    JSON.stringify({
      domain: "economy.merkle-node.v1",
      leftHash,
      rightHash,
    }),
  );
}

export function integrityAnchorAndProof(
  authorityCommitHash = RECOVERY_HASH_A,
): {
  readonly anchor: EconomyIntegrityAnchorManifestV1;
  readonly proof: EconomyMerkleInclusionProofV1;
} {
  const siblingHash = RECOVERY_HASH_E;
  const base = {
    schemaVersion: "1",
    anchorId: "integrity-anchor:10",
    authorityId: "economy:authority:global",
    firstCommitSequence: "10",
    lastCommitSequence: "11",
    leafCount: "2",
    merkleRootHash: merkleNode(authorityCommitHash, siblingHash),
    authorityHeadHash: RECOVERY_HASH_B,
    producedAt: "2026-07-26T11:00:00.000Z",
  } as const;
  return {
    anchor: base,
    proof: {
      schemaVersion: "1",
      proofVersion: "1",
      algorithm: "duplicate-last-sha256-v1",
      anchorId: base.anchorId,
      anchorManifestHash: recoveryHash(
        canonicalEconomyIntegrityAnchorManifestPayload(base),
      ),
      leafHash: authorityCommitHash,
      leafIndex: "0",
      leafCount: "2",
      siblings: [
        {
          schemaVersion: "1",
          side: "right",
          hash: siblingHash,
        },
      ],
    },
  };
}

export function portableReceiptBody(
  result: EconomyRecoveryCommittedResultV1,
  regionalReceipts: readonly EconomyRegionalEvidenceReceiptV1[],
  proof?: EconomyMerkleInclusionProofV1,
  overrides: Partial<EconomyPortableCustomerReceiptBodyV1> = {},
): EconomyPortableCustomerReceiptBodyV1 {
  if (
    result.transactionId === undefined ||
    result.transactionCanonicalHash === undefined
  ) {
    throw new Error("Fixture requires a completed result");
  }
  return {
    schemaVersion: "1",
    recoveryVersion: "1",
    recordType: "economy-portable-customer-receipt",
    authorityId: result.authorityId,
    commandId: result.commandId,
    activityType: "purchase",
    direction: "credit",
    tokenAmount: serializeTokenSubunits(50_000n),
    transactionId: result.transactionId,
    transactionCanonicalHash: result.transactionCanonicalHash,
    resultReceiptId: result.resultReceiptId,
    resultReceiptHash: result.resultReceiptHash,
    committedResultId: result.committedResultId,
    committedResultContentHash: recoveryHash(
      canonicalEconomyRecoveryCommittedResultPayload(result, recoveryHash),
    ),
    authorityCommitId: result.authorityCommitId,
    authorityCommitHash: result.authorityCommitHash,
    authoritySequence: result.authoritySequence,
    regionalEvidence: regionalReceipts.map((receipt) => ({
      schemaVersion: "1",
      region: receipt.region,
      evidenceReceiptId: receipt.evidenceReceiptId,
      evidenceReceiptHash: recoveryHash(
        canonicalEconomyRegionalEvidenceReceiptPayload(
          receipt,
          recoveryHash,
        ),
      ),
    })),
    ...(proof === undefined ? {} : { merkleInclusionProof: proof }),
    tokenTermsVersion: "token-terms:2026-07",
    cashRedemptionAllowed: false,
    committedAt: result.committedAt,
    issuedAt: "2026-07-26T11:00:01.000Z",
    ...overrides,
  };
}

export function signedPortableReceipt(
  body: EconomyPortableCustomerReceiptBodyV1,
  keyId = "customer-receipt-signer:1",
): EconomyPortableCustomerReceiptV1 {
  const metadata = signatureMetadata(keyId, body.issuedAt);
  const prepared = prepareEconomyPortableCustomerReceiptSignature(
    body,
    metadata,
    recoveryHash,
  );
  return createEconomyPortableCustomerReceipt(
    body,
    {
      ...metadata,
      value: fakeSignatureValue(prepared.canonicalPayload, keyId),
    },
    recoveryHash,
  );
}
