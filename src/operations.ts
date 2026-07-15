import { parseTokenSubunits, type TokenSubunitString } from "./amount.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
  type WalletId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";

export type AdjustmentStatus =
  | "draft"
  | "pending-approval"
  | "approved"
  | "rejected"
  | "executed"
  | "expired";

/** Dual-control request; the resulting change is always a ledger transaction. */
export interface AdjustmentRequestV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly adjustmentId: string;
  readonly walletId: WalletId;
  readonly amount: TokenSubunitString;
  readonly reason: string;
  readonly ticketReference: string;
  readonly status: AdjustmentStatus;
  readonly initiatedByAccountId: AccountId;
  readonly initiatedAt: IsoTimestamp;
  readonly approvedByAccountId?: AccountId;
  readonly approvedAt?: IsoTimestamp;
  readonly resultingTransactionId?: TransactionId;
}

/** Proves that production adjustment approval was performed by another actor. */
export function assertDistinctAdjustmentApproval(
  request: AdjustmentRequestV1,
): void {
  economyAssert(
    request.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported adjustment contract version",
  );
  assertEconomyIdentifier(request.adjustmentId, "adjustmentId");
  assertEconomyIdentifier(request.walletId, "walletId");
  assertEconomyIdentifier(request.initiatedByAccountId, "initiatedByAccountId");
  economyAssert(
    parseTokenSubunits(request.amount) !== 0n,
    "INVALID_AMOUNT",
    "Adjustment amount cannot be zero",
  );
  economyAssert(
    request.reason.trim().length > 0 && request.reason.length <= 512,
    "INVALID_CONTRACT",
    "Adjustment reason is required and must be bounded",
  );
  assertEconomyIdentifier(request.ticketReference, "ticketReference");
  const initiatedAt = parseIsoTimestamp(request.initiatedAt);
  economyAssert(
    request.approvedByAccountId !== undefined &&
      request.approvedByAccountId !== request.initiatedByAccountId,
    "INVALID_CONTRACT",
    "Adjustment approval requires a distinct authorized operator",
  );
  assertEconomyIdentifier(request.approvedByAccountId, "approvedByAccountId");
  economyAssert(
    request.approvedAt !== undefined &&
      parseIsoTimestamp(request.approvedAt) >= initiatedAt,
    "INVALID_TIME_WINDOW",
    "Adjustment approval time must follow initiation",
  );
  economyAssert(
    request.status === "approved" || request.status === "executed",
    "INVALID_CONTRACT",
    "Only approved adjustments satisfy dual-control approval",
  );
  if (request.resultingTransactionId !== undefined) {
    assertEconomyIdentifier(
      request.resultingTransactionId,
      "resultingTransactionId",
    );
  }
}
