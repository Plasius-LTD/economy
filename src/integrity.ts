import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
} from "./contracts.js";
import { EconomyError, economyAssert } from "./errors.js";
import {
  assertEconomicJournalTransaction,
  canonicalTransactionPayload,
  type EconomicJournalTransactionV1,
} from "./ledger.js";

export type JournalChainId = string;

/** Locked head of one canonical transaction hash chain. */
export interface JournalChainHeadV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly chainId: JournalChainId;
  readonly version: number;
  readonly lastTransactionId?: TransactionId;
  readonly canonicalHash?: string;
  readonly updatedAt: IsoTimestamp;
}

/** An effective economic transaction carrying its approved canonical hash. */
export type ChainedEconomicJournalTransactionV1 =
  EconomicJournalTransactionV1 & {
    readonly canonicalHash: string;
  };

export type JournalChainVerificationFailureCodeV1 =
  | "duplicate-transaction"
  | "invalid-transaction"
  | "previous-hash-mismatch"
  | "canonical-hash-mismatch"
  | "end-head-mismatch";

/** Deterministic result of verifying one ordered canonical-chain segment. */
export interface JournalChainVerificationResultV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly valid: boolean;
  readonly checkedTransactions: number;
  readonly observedHead: JournalChainHeadV1;
  readonly failureCode?: JournalChainVerificationFailureCodeV1;
  readonly firstInvalidTransactionId?: TransactionId;
}

/** Approved infrastructure adapter that hashes exact canonical UTF-8 bytes. */
export type CanonicalPayloadHashFunctionV1 = (payload: string) => string;

function assertCanonicalHash(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

/** Validates an empty or populated journal-chain head. */
export function assertJournalChainHead(head: JournalChainHeadV1): void {
  economyAssert(
    head.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported journal-chain-head contract version",
  );
  assertEconomyIdentifier(head.chainId, "chainId");
  economyAssert(
    Number.isSafeInteger(head.version) && head.version >= 0,
    "INVALID_CONTRACT",
    "Journal-chain-head version must be a non-negative safe integer",
  );
  parseIsoTimestamp(head.updatedAt);
  const hasTransaction = head.lastTransactionId !== undefined;
  const hasHash = head.canonicalHash !== undefined;
  economyAssert(
    hasTransaction === hasHash && (head.version > 0) === hasTransaction,
    "INVALID_CONTRACT",
    "Journal-chain head identity, hash, and version must describe the same state",
  );
  if (head.lastTransactionId !== undefined) {
    assertEconomyIdentifier(head.lastTransactionId, "lastTransactionId");
  }
  if (head.canonicalHash !== undefined) {
    assertCanonicalHash(head.canonicalHash, "Journal-chain-head hash");
  }
}

/**
 * Proves that a hashed transaction extends the locked head and returns the
 * exact next head. The persistence adapter must compare-and-swap the old
 * version inside the same serializable transaction that appends the journal.
 */
export function advanceJournalChainHead(
  head: JournalChainHeadV1,
  transaction: ChainedEconomicJournalTransactionV1,
): JournalChainHeadV1 {
  assertJournalChainHead(head);
  assertEconomicJournalTransaction(transaction);
  assertCanonicalHash(transaction.canonicalHash, "Transaction hash");
  economyAssert(
    transaction.previousCanonicalHash === head.canonicalHash,
    "INVALID_CONTRACT",
    "Transaction previous hash must match the locked journal-chain head",
  );
  economyAssert(
    transaction.canonicalHash !== head.canonicalHash,
    "DUPLICATE_TRANSACTION",
    "Transaction hash must advance the journal chain",
  );
  const recordedAt = parseIsoTimestamp(transaction.recordedAt);
  economyAssert(
    recordedAt >= parseIsoTimestamp(head.updatedAt),
    "INVALID_TIME_WINDOW",
    "Journal-chain update cannot precede its locked head",
  );

  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    chainId: head.chainId,
    version: head.version + 1,
    lastTransactionId: transaction.transactionId,
    canonicalHash: transaction.canonicalHash,
    updatedAt: transaction.recordedAt,
  };
}

function invalidVerification(
  checkedTransactions: number,
  observedHead: JournalChainHeadV1,
  failureCode: JournalChainVerificationFailureCodeV1,
  firstInvalidTransactionId?: TransactionId,
): JournalChainVerificationResultV1 {
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    valid: false,
    checkedTransactions,
    observedHead,
    failureCode,
    ...(firstInvalidTransactionId === undefined
      ? {}
      : { firstInvalidTransactionId }),
  };
}

function safeTransactionId(value: string): TransactionId | undefined {
  try {
    assertEconomyIdentifier(value, "transactionId");
    return value;
  } catch (error) {
    if (error instanceof EconomyError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Recomputes an ordered journal segment without implementing cryptography.
 *
 * The caller supplies an approved SHA-256 adapter. Malformed transactions are
 * reported as integrity failures, while an invalid hash-adapter result is a
 * contract error and fails closed.
 */
export function verifyJournalChainSegment(
  startHead: JournalChainHeadV1,
  transactions: readonly ChainedEconomicJournalTransactionV1[],
  expectedEndHead: JournalChainHeadV1,
  hashCanonicalPayload: CanonicalPayloadHashFunctionV1,
): JournalChainVerificationResultV1 {
  assertJournalChainHead(startHead);
  assertJournalChainHead(expectedEndHead);
  economyAssert(
    startHead.chainId === expectedEndHead.chainId,
    "INVALID_CONTRACT",
    "Journal verification heads must belong to the same chain",
  );

  let observedHead = startHead;
  let checkedTransactions = 0;
  const transactionIds = new Set<string>();

  for (const transaction of transactions) {
    let canonicalPayload: string;
    try {
      assertEconomicJournalTransaction(transaction);
      canonicalPayload = canonicalTransactionPayload(transaction);
    } catch (error) {
      if (error instanceof EconomyError) {
        return invalidVerification(
          checkedTransactions,
          observedHead,
          "invalid-transaction",
          safeTransactionId(transaction.transactionId),
        );
      }
      throw error;
    }

    if (transactionIds.has(transaction.transactionId)) {
      return invalidVerification(
        checkedTransactions,
        observedHead,
        "duplicate-transaction",
        transaction.transactionId,
      );
    }
    transactionIds.add(transaction.transactionId);

    if (transaction.previousCanonicalHash !== observedHead.canonicalHash) {
      return invalidVerification(
        checkedTransactions,
        observedHead,
        "previous-hash-mismatch",
        transaction.transactionId,
      );
    }

    const calculatedHash = hashCanonicalPayload(canonicalPayload);
    assertCanonicalHash(calculatedHash, "Calculated transaction hash");
    if (calculatedHash !== transaction.canonicalHash) {
      return invalidVerification(
        checkedTransactions,
        observedHead,
        "canonical-hash-mismatch",
        transaction.transactionId,
      );
    }

    try {
      observedHead = advanceJournalChainHead(observedHead, transaction);
    } catch (error) {
      if (error instanceof EconomyError) {
        return invalidVerification(
          checkedTransactions,
          observedHead,
          "invalid-transaction",
          safeTransactionId(transaction.transactionId),
        );
      }
      throw error;
    }
    checkedTransactions += 1;
  }

  if (
    observedHead.chainId !== expectedEndHead.chainId ||
    observedHead.version !== expectedEndHead.version ||
    observedHead.lastTransactionId !== expectedEndHead.lastTransactionId ||
    observedHead.canonicalHash !== expectedEndHead.canonicalHash ||
    observedHead.updatedAt !== expectedEndHead.updatedAt
  ) {
    return invalidVerification(
      checkedTransactions,
      observedHead,
      "end-head-mismatch",
    );
  }

  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    valid: true,
    checkedTransactions,
    observedHead,
  };
}
