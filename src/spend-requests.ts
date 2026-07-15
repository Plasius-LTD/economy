import { parseTokenSubunits, type TokenSubunitString } from "./amount.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type AllocationId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";

export type SpendRequestPurpose = "gameplay-conversion" | "non-gameplay";
export type SpendRequestStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "cancelled";

/** Future child request; baseline adapters must reject creation while disabled. */
export interface SpendRequestV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly requestId: string;
  readonly childAccountId: AccountId;
  readonly allocationId: AllocationId;
  readonly purpose: SpendRequestPurpose;
  readonly amount: TokenSubunitString;
  readonly status: SpendRequestStatus;
  readonly requestedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly decidedByAccountId?: AccountId;
  readonly decidedAt?: IsoTimestamp;
  readonly approvalNonceHash?: string;
  readonly resultingTransactionId?: TransactionId;
}

/** Validates future child requests while creation remains policy-disabled. */
export function assertSpendRequest(request: SpendRequestV1): void {
  economyAssert(
    request.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported spend-request contract version",
  );
  assertEconomyIdentifier(request.requestId, "requestId");
  assertEconomyIdentifier(request.childAccountId, "childAccountId");
  assertEconomyIdentifier(request.allocationId, "allocationId");
  economyAssert(
    request.purpose === "gameplay-conversion" ||
      request.purpose === "non-gameplay",
    "INVALID_CONTRACT",
    "Spend request has an unsupported purpose",
  );
  economyAssert(
    [
      "requested",
      "approved",
      "rejected",
      "expired",
      "executed",
      "cancelled",
    ].includes(request.status),
    "INVALID_CONTRACT",
    "Spend request has an unsupported status",
  );
  economyAssert(
    parseTokenSubunits(request.amount) > 0n,
    "INVALID_AMOUNT",
    "Spend-request amount must be positive",
  );
  const requestedAt = parseIsoTimestamp(request.requestedAt);
  const expiresAt = parseIsoTimestamp(request.expiresAt);
  economyAssert(
    expiresAt > requestedAt,
    "INVALID_TIME_WINDOW",
    "Spend-request expiry must follow creation",
  );

  const decisionRequired = ["approved", "rejected", "executed"].includes(
    request.status,
  );
  economyAssert(
    !decisionRequired ||
      (request.decidedByAccountId !== undefined &&
        request.decidedAt !== undefined),
    "INVALID_CONTRACT",
    "Decided spend requests require a guardian actor and timestamp",
  );
  if (request.decidedByAccountId !== undefined) {
    assertEconomyIdentifier(request.decidedByAccountId, "decidedByAccountId");
  }
  if (request.decidedAt !== undefined) {
    const decidedAt = parseIsoTimestamp(request.decidedAt);
    economyAssert(
      decidedAt >= requestedAt && decidedAt <= expiresAt,
      "INVALID_TIME_WINDOW",
      "Spend-request decision must occur before expiry",
    );
  }
  if (request.approvalNonceHash !== undefined) {
    economyAssert(
      /^sha256:[a-f0-9]{64}$/u.test(request.approvalNonceHash),
      "INVALID_CONTRACT",
      "Approval nonces must be stored as SHA-256 hashes",
    );
  }
  if (request.status === "approved" || request.status === "executed") {
    economyAssert(
      request.approvalNonceHash !== undefined,
      "INVALID_CONTRACT",
      "Approved spend requests require a one-time approval nonce hash",
    );
  }
  if (request.resultingTransactionId !== undefined) {
    assertEconomyIdentifier(
      request.resultingTransactionId,
      "resultingTransactionId",
    );
    economyAssert(
      request.status === "executed",
      "INVALID_CONTRACT",
      "Only executed spend requests may reference a ledger transaction",
    );
  }
}
