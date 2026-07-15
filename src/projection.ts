import {
  parseTokenSubunits,
  serializeTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import {
  ECONOMY_CONTRACT_VERSION,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import {
  assertBalancedTransaction,
  type LedgerTransactionV1,
} from "./ledger.js";

export type BalanceProjection = Readonly<Record<AccountId, TokenSubunitString>>;

export interface BalanceProjectionSnapshotV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly balances: BalanceProjection;
  readonly lastTransactionId?: TransactionId;
  readonly rebuiltAt: IsoTimestamp;
}

/** Applies one balanced transaction without mutating the existing projection. */
export function applyTransactionToProjection(
  current: BalanceProjection,
  transaction: LedgerTransactionV1,
): BalanceProjection {
  assertBalancedTransaction(transaction);
  const next: Record<AccountId, TokenSubunitString> = { ...current };
  for (const posting of transaction.postings) {
    const prior = parseTokenSubunits(next[posting.accountId] ?? "0");
    next[posting.accountId] = serializeTokenSubunits(
      prior + parseTokenSubunits(posting.amount),
    );
  }
  return next;
}

/**
 * Rebuilds balances deterministically and rejects duplicate economic envelopes.
 */
export function rebuildBalanceProjection(
  transactions: readonly LedgerTransactionV1[],
): BalanceProjection {
  let projection: BalanceProjection = {};
  const transactionIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const providerEvents = new Set<string>();

  for (const transaction of transactions) {
    economyAssert(
      !transactionIds.has(transaction.transactionId),
      "DUPLICATE_TRANSACTION",
      "Transaction identifiers must be unique",
    );
    economyAssert(
      !idempotencyKeys.has(transaction.idempotencyKey),
      "DUPLICATE_TRANSACTION",
      "Idempotency keys must be unique",
    );
    if (transaction.providerEventId !== undefined) {
      economyAssert(
        !providerEvents.has(transaction.providerEventId),
        "DUPLICATE_TRANSACTION",
        "Provider event identifiers must be unique",
      );
      providerEvents.add(transaction.providerEventId);
    }
    transactionIds.add(transaction.transactionId);
    idempotencyKeys.add(transaction.idempotencyKey);
    projection = applyTransactionToProjection(projection, transaction);
  }

  return projection;
}

/** Enforces non-negative balances only for spendable/reservable accounts. */
export function assertNonNegativeAccounts(
  projection: BalanceProjection,
  protectedAccountIds: readonly AccountId[],
): void {
  for (const accountId of protectedAccountIds) {
    economyAssert(
      parseTokenSubunits(projection[accountId] ?? "0") >= 0n,
      "NEGATIVE_PROJECTION",
      "A protected economy account would become negative",
    );
  }
}

/** Creates a versioned snapshot after a deterministic rebuild. */
export function createProjectionSnapshot(
  transactions: readonly LedgerTransactionV1[],
  rebuiltAt: IsoTimestamp,
): BalanceProjectionSnapshotV1 {
  parseIsoTimestamp(rebuiltAt);
  const last = transactions.at(-1);
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    balances: rebuildBalanceProjection(transactions),
    ...(last === undefined ? {} : { lastTransactionId: last.transactionId }),
    rebuiltAt,
  };
}
