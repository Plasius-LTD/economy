import { parseTokenSubunits, type TokenSubunitString } from "./amount.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type LotId,
  type TransactionId,
  type WalletId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { LotTransferPolicy } from "./lots.js";

export type OperatorAdjustmentOperationV1 = "credit" | "reverse-credit";

export type OperatorAdjustmentTargetComponentV1 =
  | "personal"
  | "household-treasury";

export type OperatorAdjustmentRefundPolicyV1 = "not-refundable";

export type OperatorAdjustmentDecisionKindV1 = "approve" | "reject";

export type OperatorAdjustmentProposalStatusV1 = "pending-approval";

export type OperatorAdjustmentFailureCodeV1 =
  | "ADJUSTMENT_DISABLED"
  | "ADJUSTMENT_OWNER_REQUIRED"
  | "ADJUSTMENT_CAPABILITY_DENIED"
  | "ADJUSTMENT_STEP_UP_REQUIRED"
  | "ADJUSTMENT_TARGET_UNAVAILABLE"
  | "ADJUSTMENT_SELF_APPROVAL"
  | "ADJUSTMENT_EXPIRED"
  | "ADJUSTMENT_PREVIEW_MISMATCH"
  | "ADJUSTMENT_ALREADY_DECIDED"
  | "ADJUSTMENT_ALREADY_EXECUTED"
  | "ADJUSTMENT_NOT_APPROVED"
  | "ADJUSTMENT_REVERSAL_UNAVAILABLE";

/**
 * Immutable server-prepared value plan shown to both adjustment operators.
 *
 * Callers may request an account and component, but only a trusted adapter may
 * resolve the wallet, ledger accounts and deterministic source lot recorded
 * here. Browser or MCP supplied wallet and ledger identifiers are never input
 * authority.
 */
export interface OperatorAdjustmentPreviewV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly previewId: string;
  readonly adjustmentId: string;
  readonly operation: OperatorAdjustmentOperationV1;
  readonly targetAccountId: AccountId;
  readonly targetComponent: OperatorAdjustmentTargetComponentV1;
  readonly targetWalletId: WalletId;
  readonly targetLedgerAccountId: AccountId;
  readonly offsetLedgerAccountId: AccountId;
  readonly sourceLotId: LotId;
  /** Positive magnitude. Reversals carry direction in `operation`. */
  readonly amount: TokenSubunitString;
  readonly reasonCode: string;
  /** SHA-256 of an adapter-owned, bounded ticket reference. */
  readonly ticketReferenceHash: string;
  readonly transferPolicy: LotTransferPolicy;
  readonly refundPolicy: OperatorAdjustmentRefundPolicyV1;
  readonly originalSourceLotId?: LotId;
  readonly originalTransactionId?: TransactionId;
  readonly preparedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

/** Immutable first-operator proposal bound to the exact prepared preview. */
export interface OperatorAdjustmentProposalV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly proposalId: string;
  readonly adjustmentId: string;
  readonly previewHash: string;
  readonly status: OperatorAdjustmentProposalStatusV1;
  readonly proposedByAccountId: AccountId;
  readonly proposedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

/** Immutable second-operator decision bound to the exact preview hash. */
export interface OperatorAdjustmentDecisionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly decisionId: string;
  readonly adjustmentId: string;
  readonly proposalId: string;
  readonly proposalHash: string;
  readonly previewHash: string;
  readonly decision: OperatorAdjustmentDecisionKindV1;
  readonly proposedByAccountId: AccountId;
  readonly decidedByAccountId: AccountId;
  readonly proposedAt: IsoTimestamp;
  readonly decidedAt: IsoTimestamp;
}

/** Immutable result edge linking an approved plan to its ledger transaction. */
export interface OperatorAdjustmentExecutionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly executionId: string;
  readonly adjustmentId: string;
  readonly previewHash: string;
  readonly proposalHash: string;
  readonly decisionHash: string;
  readonly sourceLotId: LotId;
  readonly transactionId: TransactionId;
  readonly resultReceiptId: string;
  readonly executedAt: IsoTimestamp;
}

const PREVIEW_KEYS = new Set([
  "schemaVersion",
  "previewId",
  "adjustmentId",
  "operation",
  "targetAccountId",
  "targetComponent",
  "targetWalletId",
  "targetLedgerAccountId",
  "offsetLedgerAccountId",
  "sourceLotId",
  "amount",
  "reasonCode",
  "ticketReferenceHash",
  "transferPolicy",
  "refundPolicy",
  "originalSourceLotId",
  "originalTransactionId",
  "preparedAt",
  "expiresAt",
]);
const DECISION_KEYS = new Set([
  "schemaVersion",
  "decisionId",
  "adjustmentId",
  "proposalId",
  "proposalHash",
  "previewHash",
  "decision",
  "proposedByAccountId",
  "decidedByAccountId",
  "proposedAt",
  "decidedAt",
]);
const PROPOSAL_KEYS = new Set([
  "schemaVersion",
  "proposalId",
  "adjustmentId",
  "previewHash",
  "status",
  "proposedByAccountId",
  "proposedAt",
  "expiresAt",
]);
const EXECUTION_KEYS = new Set([
  "schemaVersion",
  "executionId",
  "adjustmentId",
  "previewHash",
  "proposalHash",
  "decisionHash",
  "sourceLotId",
  "transactionId",
  "resultReceiptId",
  "executedAt",
]);
const OPERATIONS = new Set<OperatorAdjustmentOperationV1>([
  "credit",
  "reverse-credit",
]);
const TARGET_COMPONENTS = new Set<OperatorAdjustmentTargetComponentV1>([
  "personal",
  "household-treasury",
]);
const TRANSFER_POLICIES = new Set<LotTransferPolicy>([
  "household-allocatable",
  "same-user-only",
  "non-transferable",
]);
const DECISIONS = new Set<OperatorAdjustmentDecisionKindV1>([
  "approve",
  "reject",
]);

function assertExactKeys(
  value: object,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  economyAssert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INVALID_CONTRACT",
    `${label} must be an object`,
  );
  economyAssert(
    Object.keys(value).every((key) => allowed.has(key)),
    "INVALID_CONTRACT",
    `${label} contains an unsupported field`,
  );
}

function assertCanonicalHash(value: string, label: string): void {
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function assertReasonCode(reasonCode: string): void {
  economyAssert(
    /^[A-Z][A-Z0-9_]{2,95}$/u.test(reasonCode),
    "INVALID_CONTRACT",
    "Adjustment reasonCode must be a bounded uppercase identifier",
  );
}

/** Validates one exact, positive and privacy-minimized operator value plan. */
export function assertOperatorAdjustmentPreview(
  preview: OperatorAdjustmentPreviewV1,
): void {
  assertExactKeys(preview, PREVIEW_KEYS, "Operator adjustment preview");
  economyAssert(
    preview.schemaVersion === ECONOMY_CONTRACT_VERSION
      && OPERATIONS.has(preview.operation)
      && TARGET_COMPONENTS.has(preview.targetComponent)
      && TRANSFER_POLICIES.has(preview.transferPolicy)
      && preview.refundPolicy === "not-refundable",
    "INVALID_CONTRACT",
    "Unsupported operator adjustment preview",
  );
  assertEconomyIdentifier(preview.previewId, "previewId");
  assertEconomyIdentifier(preview.adjustmentId, "adjustmentId");
  assertEconomyIdentifier(preview.targetAccountId, "targetAccountId");
  assertEconomyIdentifier(preview.targetWalletId, "targetWalletId");
  assertEconomyIdentifier(
    preview.targetLedgerAccountId,
    "targetLedgerAccountId",
  );
  assertEconomyIdentifier(
    preview.offsetLedgerAccountId,
    "offsetLedgerAccountId",
  );
  assertEconomyIdentifier(preview.sourceLotId, "sourceLotId");
  economyAssert(
    parseTokenSubunits(preview.amount) > 0n,
    "INVALID_AMOUNT",
    "Operator adjustment amount must be positive",
  );
  assertReasonCode(preview.reasonCode);
  assertCanonicalHash(preview.ticketReferenceHash, "ticketReferenceHash");
  const preparedAt = parseIsoTimestamp(preview.preparedAt);
  const expiresAt = parseIsoTimestamp(preview.expiresAt);
  economyAssert(
    expiresAt > preparedAt,
    "INVALID_TIME_WINDOW",
    "Operator adjustment preview must expire after preparation",
  );

  if (preview.operation === "credit") {
    economyAssert(
      preview.originalSourceLotId === undefined
        && preview.originalTransactionId === undefined,
      "INVALID_CONTRACT",
      "A credit preview cannot bind an original transaction",
    );
    return;
  }

  economyAssert(
    preview.originalSourceLotId !== undefined
      && preview.originalTransactionId !== undefined,
    "INVALID_CONTRACT",
    "A reversal preview must bind the original lot and transaction",
  );
  assertEconomyIdentifier(preview.originalSourceLotId, "originalSourceLotId");
  assertEconomyIdentifier(
    preview.originalTransactionId,
    "originalTransactionId",
  );
}

/** Canonical preview bytes for an approved SHA-256 adapter. */
export function canonicalOperatorAdjustmentPreviewPayload(
  preview: OperatorAdjustmentPreviewV1,
): string {
  assertOperatorAdjustmentPreview(preview);
  return JSON.stringify({
    schemaVersion: preview.schemaVersion,
    previewId: preview.previewId,
    adjustmentId: preview.adjustmentId,
    operation: preview.operation,
    targetAccountId: preview.targetAccountId,
    targetComponent: preview.targetComponent,
    targetWalletId: preview.targetWalletId,
    targetLedgerAccountId: preview.targetLedgerAccountId,
    offsetLedgerAccountId: preview.offsetLedgerAccountId,
    sourceLotId: preview.sourceLotId,
    amount: preview.amount,
    reasonCode: preview.reasonCode,
    ticketReferenceHash: preview.ticketReferenceHash,
    transferPolicy: preview.transferPolicy,
    refundPolicy: preview.refundPolicy,
    ...(preview.originalSourceLotId === undefined
      ? {}
      : { originalSourceLotId: preview.originalSourceLotId }),
    ...(preview.originalTransactionId === undefined
      ? {}
      : { originalTransactionId: preview.originalTransactionId }),
    preparedAt: preview.preparedAt,
    expiresAt: preview.expiresAt,
  });
}

/** Validates a pending proposal against the exact server-prepared preview. */
export function assertOperatorAdjustmentProposal(
  proposal: OperatorAdjustmentProposalV1,
  preview: OperatorAdjustmentPreviewV1,
  expectedPreviewHash: string,
): void {
  assertOperatorAdjustmentPreview(preview);
  assertCanonicalHash(expectedPreviewHash, "expectedPreviewHash");
  assertExactKeys(proposal, PROPOSAL_KEYS, "Operator adjustment proposal");
  economyAssert(
    proposal.schemaVersion === ECONOMY_CONTRACT_VERSION
      && proposal.status === "pending-approval",
    "INVALID_CONTRACT",
    "Unsupported operator adjustment proposal",
  );
  assertEconomyIdentifier(proposal.proposalId, "proposalId");
  assertEconomyIdentifier(proposal.adjustmentId, "adjustmentId");
  assertCanonicalHash(proposal.previewHash, "previewHash");
  assertEconomyIdentifier(
    proposal.proposedByAccountId,
    "proposedByAccountId",
  );
  economyAssert(
    proposal.adjustmentId === preview.adjustmentId
      && proposal.previewHash === expectedPreviewHash,
    "ADJUSTMENT_PREVIEW_MISMATCH",
    "Operator adjustment proposal does not match its preview",
  );
  const proposedAt = parseIsoTimestamp(proposal.proposedAt);
  const expiresAt = parseIsoTimestamp(proposal.expiresAt);
  economyAssert(
    proposedAt >= parseIsoTimestamp(preview.preparedAt)
      && expiresAt === parseIsoTimestamp(preview.expiresAt)
      && expiresAt > proposedAt,
    "INVALID_TIME_WINDOW",
    "Operator adjustment proposal times are inconsistent",
  );
}

/** Canonical proposal bytes for the immutable pending-approval fact. */
export function canonicalOperatorAdjustmentProposalPayload(
  proposal: OperatorAdjustmentProposalV1,
): string {
  assertExactKeys(proposal, PROPOSAL_KEYS, "Operator adjustment proposal");
  return JSON.stringify({
    schemaVersion: proposal.schemaVersion,
    proposalId: proposal.proposalId,
    adjustmentId: proposal.adjustmentId,
    previewHash: proposal.previewHash,
    status: proposal.status,
    proposedByAccountId: proposal.proposedByAccountId,
    proposedAt: proposal.proposedAt,
    expiresAt: proposal.expiresAt,
  });
}

/** Validates a distinct-operator decision against its immutable preview. */
export function assertOperatorAdjustmentDecision(
  decision: OperatorAdjustmentDecisionV1,
  proposal: OperatorAdjustmentProposalV1,
  preview: OperatorAdjustmentPreviewV1,
  expectedPreviewHash: string,
  expectedProposalHash: string,
): void {
  assertOperatorAdjustmentProposal(proposal, preview, expectedPreviewHash);
  assertCanonicalHash(expectedProposalHash, "expectedProposalHash");
  assertExactKeys(decision, DECISION_KEYS, "Operator adjustment decision");
  economyAssert(
    decision.schemaVersion === ECONOMY_CONTRACT_VERSION
      && DECISIONS.has(decision.decision),
    "INVALID_CONTRACT",
    "Unsupported operator adjustment decision",
  );
  assertEconomyIdentifier(decision.decisionId, "decisionId");
  assertEconomyIdentifier(decision.adjustmentId, "adjustmentId");
  assertEconomyIdentifier(decision.proposalId, "proposalId");
  assertCanonicalHash(decision.proposalHash, "proposalHash");
  assertCanonicalHash(decision.previewHash, "previewHash");
  assertEconomyIdentifier(
    decision.proposedByAccountId,
    "proposedByAccountId",
  );
  assertEconomyIdentifier(
    decision.decidedByAccountId,
    "decidedByAccountId",
  );
  economyAssert(
    decision.proposedByAccountId !== decision.decidedByAccountId,
    "ADJUSTMENT_SELF_APPROVAL",
    "Operator adjustment approval requires a distinct operator",
  );
  economyAssert(
    decision.adjustmentId === preview.adjustmentId
      && decision.proposalId === proposal.proposalId
      && decision.proposalHash === expectedProposalHash
      && decision.previewHash === expectedPreviewHash,
    "ADJUSTMENT_PREVIEW_MISMATCH",
    "Operator adjustment decision does not match its preview",
  );
  const proposedAt = parseIsoTimestamp(decision.proposedAt);
  const decidedAt = parseIsoTimestamp(decision.decidedAt);
  economyAssert(
    decision.proposedByAccountId === proposal.proposedByAccountId
      && proposedAt === parseIsoTimestamp(proposal.proposedAt)
      && decidedAt >= proposedAt,
    "INVALID_TIME_WINDOW",
    "Operator adjustment decision times are inconsistent",
  );
  economyAssert(
    decidedAt <= parseIsoTimestamp(preview.expiresAt),
    "ADJUSTMENT_EXPIRED",
    "Operator adjustment preview has expired",
  );
}

/** Canonical decision bytes for approval evidence and execution binding. */
export function canonicalOperatorAdjustmentDecisionPayload(
  decision: OperatorAdjustmentDecisionV1,
): string {
  assertExactKeys(decision, DECISION_KEYS, "Operator adjustment decision");
  return JSON.stringify({
    schemaVersion: decision.schemaVersion,
    decisionId: decision.decisionId,
    adjustmentId: decision.adjustmentId,
    proposalId: decision.proposalId,
    proposalHash: decision.proposalHash,
    previewHash: decision.previewHash,
    decision: decision.decision,
    proposedByAccountId: decision.proposedByAccountId,
    decidedByAccountId: decision.decidedByAccountId,
    proposedAt: decision.proposedAt,
    decidedAt: decision.decidedAt,
  });
}

/** Validates the immutable ledger-result edge for one approved adjustment. */
export function assertOperatorAdjustmentExecution(
  execution: OperatorAdjustmentExecutionV1,
  preview: OperatorAdjustmentPreviewV1,
  proposal: OperatorAdjustmentProposalV1,
  decision: OperatorAdjustmentDecisionV1,
  expectedPreviewHash: string,
  expectedProposalHash: string,
  expectedDecisionHash: string,
): void {
  assertOperatorAdjustmentDecision(
    decision,
    proposal,
    preview,
    expectedPreviewHash,
    expectedProposalHash,
  );
  assertCanonicalHash(expectedDecisionHash, "expectedDecisionHash");
  assertExactKeys(execution, EXECUTION_KEYS, "Operator adjustment execution");
  economyAssert(
    execution.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported operator adjustment execution",
  );
  assertEconomyIdentifier(execution.executionId, "executionId");
  assertEconomyIdentifier(execution.adjustmentId, "adjustmentId");
  assertCanonicalHash(execution.previewHash, "previewHash");
  assertCanonicalHash(execution.proposalHash, "proposalHash");
  assertCanonicalHash(execution.decisionHash, "decisionHash");
  assertEconomyIdentifier(execution.sourceLotId, "sourceLotId");
  assertEconomyIdentifier(execution.transactionId, "transactionId");
  assertEconomyIdentifier(execution.resultReceiptId, "resultReceiptId");
  economyAssert(
    decision.decision === "approve",
    "ADJUSTMENT_NOT_APPROVED",
    "Only an approved adjustment may execute",
  );
  economyAssert(
    execution.adjustmentId === preview.adjustmentId
      && execution.previewHash === expectedPreviewHash
      && execution.proposalHash === expectedProposalHash
      && execution.decisionHash === expectedDecisionHash
      && execution.sourceLotId === preview.sourceLotId,
    "ADJUSTMENT_PREVIEW_MISMATCH",
    "Operator adjustment execution does not match its approval plan",
  );
  economyAssert(
    parseIsoTimestamp(execution.executedAt)
      >= parseIsoTimestamp(decision.decidedAt),
    "INVALID_TIME_WINDOW",
    "Operator adjustment execution predates its decision",
  );
}

/** Canonical execution bytes for authority and audit-graph records. */
export function canonicalOperatorAdjustmentExecutionPayload(
  execution: OperatorAdjustmentExecutionV1,
): string {
  assertExactKeys(execution, EXECUTION_KEYS, "Operator adjustment execution");
  return JSON.stringify({
    schemaVersion: execution.schemaVersion,
    executionId: execution.executionId,
    adjustmentId: execution.adjustmentId,
    previewHash: execution.previewHash,
    proposalHash: execution.proposalHash,
    decisionHash: execution.decisionHash,
    sourceLotId: execution.sourceLotId,
    transactionId: execution.transactionId,
    resultReceiptId: execution.resultReceiptId,
    executedAt: execution.executedAt,
  });
}
