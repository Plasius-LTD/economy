import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import {
  assertEconomicJournalTransaction,
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
