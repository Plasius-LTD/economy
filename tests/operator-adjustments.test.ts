import { describe, expect, it } from "vitest";
import {
  assertOperatorAdjustmentDecision,
  assertOperatorAdjustmentExecution,
  assertOperatorAdjustmentPreview,
  assertOperatorAdjustmentProposal,
  canonicalOperatorAdjustmentDecisionPayload,
  canonicalOperatorAdjustmentExecutionPayload,
  canonicalOperatorAdjustmentPreviewPayload,
  canonicalOperatorAdjustmentProposalPayload,
  serializeTokenSubunits,
  type OperatorAdjustmentDecisionV1,
  type OperatorAdjustmentExecutionV1,
  type OperatorAdjustmentPreviewV1,
  type OperatorAdjustmentProposalV1,
} from "../src/index.js";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;

function creditPreview(): OperatorAdjustmentPreviewV1 {
  return {
    schemaVersion: "1",
    previewId: "adjustment-preview:credit:1",
    adjustmentId: "adjustment:credit:1",
    operation: "credit",
    targetAccountId: "account:recipient:1",
    targetComponent: "personal",
    targetWalletId: "wallet:personal:recipient:1",
    targetLedgerAccountId: "ledger-account:recipient:available",
    offsetLedgerAccountId: "ledger-account:operator-adjustment-issuance",
    sourceLotId: "lot:adjustment:credit:1",
    amount: serializeTokenSubunits(5_000n),
    reasonCode: "CUSTOMER_SUPPORT_CREDIT",
    ticketReferenceHash: HASH_A,
    transferPolicy: "non-transferable",
    refundPolicy: "not-refundable",
    preparedAt: "2026-08-01T10:00:00.000Z",
    expiresAt: "2026-08-01T10:15:00.000Z",
  };
}

function approvedDecision(): OperatorAdjustmentDecisionV1 {
  return {
    schemaVersion: "1",
    decisionId: "adjustment-decision:credit:1",
    adjustmentId: "adjustment:credit:1",
    proposalId: "adjustment-proposal:credit:1",
    proposalHash: HASH_C,
    previewHash: HASH_B,
    decision: "approve",
    proposedByAccountId: "account:operator:1",
    decidedByAccountId: "account:operator:2",
    proposedAt: "2026-08-01T10:01:00.000Z",
    decidedAt: "2026-08-01T10:05:00.000Z",
  };
}

function proposal(): OperatorAdjustmentProposalV1 {
  return {
    schemaVersion: "1",
    proposalId: "adjustment-proposal:credit:1",
    adjustmentId: "adjustment:credit:1",
    previewHash: HASH_B,
    status: "pending-approval",
    proposedByAccountId: "account:operator:1",
    proposedAt: "2026-08-01T10:01:00.000Z",
    expiresAt: "2026-08-01T10:15:00.000Z",
  };
}

function execution(): OperatorAdjustmentExecutionV1 {
  return {
    schemaVersion: "1",
    executionId: "adjustment-execution:credit:1",
    adjustmentId: "adjustment:credit:1",
    previewHash: HASH_B,
    proposalHash: HASH_C,
    decisionHash: HASH_A,
    sourceLotId: "lot:adjustment:credit:1",
    transactionId: "transaction:adjustment:credit:1",
    resultReceiptId: "receipt:adjustment:credit:1:result",
    executedAt: "2026-08-01T10:05:01.000Z",
  };
}

describe("operator adjustment contracts", () => {
  it("validates and canonicalizes a positive credit preview", () => {
    const preview = creditPreview();

    expect(() => assertOperatorAdjustmentPreview(preview)).not.toThrow();
    expect(canonicalOperatorAdjustmentPreviewPayload(preview)).toBe(
      JSON.stringify(preview),
    );
  });

  it("rejects zero, negative and unknown-field credit previews", () => {
    const preview = creditPreview();

    for (const amount of [0n, -1n]) {
      expect(() =>
        assertOperatorAdjustmentPreview({
          ...preview,
          amount: serializeTokenSubunits(amount),
        }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    }

    expect(() =>
      assertOperatorAdjustmentPreview({
        ...preview,
        walletId: "wallet:browser-supplied",
      } as OperatorAdjustmentPreviewV1),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("requires reversal previews to bind the original lot and transaction", () => {
    const preview: OperatorAdjustmentPreviewV1 = {
      ...creditPreview(),
      previewId: "adjustment-preview:reversal:1",
      adjustmentId: "adjustment:reversal:1",
      operation: "reverse-credit",
      sourceLotId: "lot:adjustment:reversal:1",
      originalSourceLotId: "lot:adjustment:credit:1",
      originalTransactionId: "transaction:adjustment:credit:1",
    };

    expect(() => assertOperatorAdjustmentPreview(preview)).not.toThrow();
    const { originalSourceLotId: _lot, ...missingLot } = preview;
    expect(() =>
      assertOperatorAdjustmentPreview(
        missingLot as OperatorAdjustmentPreviewV1,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("requires a distinct approver and an unexpired matching preview", () => {
    const preview = creditPreview();
    const pendingProposal = proposal();
    const decision = approvedDecision();

    expect(() =>
      assertOperatorAdjustmentProposal(pendingProposal, preview, HASH_B),
    ).not.toThrow();
    expect(canonicalOperatorAdjustmentProposalPayload(pendingProposal)).toBe(
      JSON.stringify(pendingProposal),
    );

    expect(() =>
      assertOperatorAdjustmentDecision(
        decision,
        pendingProposal,
        preview,
        HASH_B,
        HASH_C,
      ),
    ).not.toThrow();
    expect(canonicalOperatorAdjustmentDecisionPayload(decision)).toBe(
      JSON.stringify(decision),
    );

    expect(() =>
      assertOperatorAdjustmentDecision(
        { ...decision, decidedByAccountId: decision.proposedByAccountId },
        pendingProposal,
        preview,
        HASH_B,
        HASH_C,
      ),
    ).toThrowError(expect.objectContaining({ code: "ADJUSTMENT_SELF_APPROVAL" }));
    expect(() =>
      assertOperatorAdjustmentDecision(
        decision,
        pendingProposal,
        preview,
        HASH_A,
        HASH_C,
      ),
    ).toThrowError(expect.objectContaining({ code: "ADJUSTMENT_PREVIEW_MISMATCH" }));
    expect(() =>
      assertOperatorAdjustmentDecision(
        { ...decision, decidedAt: "2026-08-01T10:16:00.000Z" },
        pendingProposal,
        preview,
        HASH_B,
        HASH_C,
      ),
    ).toThrowError(expect.objectContaining({ code: "ADJUSTMENT_EXPIRED" }));
  });

  it("binds execution to an approved decision and the preview source lot", () => {
    const preview = creditPreview();
    const pendingProposal = proposal();
    const decision = approvedDecision();
    const result = execution();

    expect(() =>
      assertOperatorAdjustmentExecution(
        result,
        preview,
        pendingProposal,
        decision,
        HASH_B,
        HASH_C,
        HASH_A,
      ),
    ).not.toThrow();
    expect(canonicalOperatorAdjustmentExecutionPayload(result)).toBe(
      JSON.stringify(result),
    );

    expect(() =>
      assertOperatorAdjustmentExecution(
        { ...result, sourceLotId: "lot:adjustment:other" },
        preview,
        pendingProposal,
        decision,
        HASH_B,
        HASH_C,
        HASH_A,
      ),
    ).toThrowError(expect.objectContaining({ code: "ADJUSTMENT_PREVIEW_MISMATCH" }));
    expect(() =>
      assertOperatorAdjustmentExecution(
        result,
        preview,
        pendingProposal,
        { ...decision, decision: "reject" },
        HASH_B,
        HASH_C,
        HASH_A,
      ),
    ).toThrowError(expect.objectContaining({ code: "ADJUSTMENT_NOT_APPROVED" }));
  });
});
