import {
  parseTokenSubunits,
  serializeTokenSubunits,
  sumTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  sortStringRecord,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type LotId,
  type PostingId,
  type ProviderEventId,
  type TransactionId,
  type WalletId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { TokenSource } from "./lots.js";

export type ActivityType =
  | "purchase"
  | "subscription"
  | "rewarded-ad"
  | "offerwall"
  | "allocation"
  | "boost"
  | "reclaim"
  | "spend"
  | "hold"
  | "refund"
  | "chargeback"
  | "adjustment"
  | "reversal"
  | "event"
  | "competition";

export type ActivityStatus =
  | "pending"
  | "held"
  | "settled"
  | "reversed"
  | "failed";

/**
 * States permitted on an immutable transaction accepted by the V2
 * persistence boundary. Pending and failed work belongs to the command
 * workflow, while a reversed presentation state is derived from an immutable
 * compensating transaction rather than written back to the original journal
 * row.
 */
export type EconomicJournalStatus = "held" | "settled";

/** A journal transaction that has an immediate economic effect. */
export type EconomicJournalTransactionV1 = Omit<
  LedgerTransactionV1,
  "status"
> & {
  readonly status: EconomicJournalStatus;
};

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

const ACTIVITY_STATUSES = new Set<ActivityStatus>([
  "pending",
  "held",
  "settled",
  "reversed",
  "failed",
]);

const ACTIVITY_SOURCES = new Set<TokenSource>([
  "shopify",
  "ayet",
  "bitlabs",
  "subscription",
  "event",
  "competition",
  "adjustment",
]);

function assertCanonicalHash(value: string, label: string): void {
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

/** One signed side of an immutable double-entry transaction. */
export interface LedgerPostingV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly postingId: PostingId;
  readonly transactionId: TransactionId;
  readonly accountId: AccountId;
  readonly walletId?: WalletId;
  readonly lotId?: LotId;
  readonly amount: TokenSubunitString;
}

/** Immutable transaction envelope. Posting amounts must sum to exactly zero. */
export interface LedgerTransactionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transactionId: TransactionId;
  readonly activityType: ActivityType;
  readonly status: ActivityStatus;
  readonly idempotencyKey: string;
  readonly providerEventId?: ProviderEventId;
  readonly reversesTransactionId?: TransactionId;
  readonly effectiveAt: IsoTimestamp;
  readonly recordedAt: IsoTimestamp;
  readonly previousCanonicalHash?: string;
  readonly canonicalHash?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly postings: readonly LedgerPostingV1[];
}

/** Privacy-safe, display-oriented journal entry returned by an API adapter. */
export interface ActivityEntryV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transactionId: TransactionId;
  readonly activityType: ActivityType;
  readonly status: ActivityStatus;
  readonly occurredAt: IsoTimestamp;
  readonly amount: TokenSubunitString;
  /** Stable source identity used for filtering and provenance presentation. */
  readonly source: TokenSource;
  readonly beneficiaryAccountId?: AccountId;
  readonly maskedReference?: string;
  readonly sourceLabel: string;
}

/** Validates one privacy-safe activity row returned by an HTTP adapter. */
export function assertActivityEntry(entry: ActivityEntryV1): void {
  economyAssert(
    entry.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported activity-entry contract version",
  );
  assertEconomyIdentifier(entry.transactionId, "transactionId");
  economyAssert(
    ACTIVITY_TYPES.has(entry.activityType) &&
      ACTIVITY_STATUSES.has(entry.status) &&
      ACTIVITY_SOURCES.has(entry.source),
    "INVALID_CONTRACT",
    "Activity type, status, or source is unsupported",
  );
  parseIsoTimestamp(entry.occurredAt);
  economyAssert(
    parseTokenSubunits(entry.amount) !== 0n,
    "INVALID_AMOUNT",
    "Activity entries cannot contain a zero amount",
  );
  if (entry.beneficiaryAccountId !== undefined) {
    assertEconomyIdentifier(
      entry.beneficiaryAccountId,
      "beneficiaryAccountId",
    );
  }
  if (entry.maskedReference !== undefined) {
    economyAssert(
      typeof entry.maskedReference === "string" &&
        entry.maskedReference.length > 0 &&
        entry.maskedReference.length <= 128 &&
        !hasControlCharacters(entry.maskedReference),
      "INVALID_CONTRACT",
      "Masked activity references must be bounded and safe for display",
    );
  }
  economyAssert(
    typeof entry.sourceLabel === "string" &&
      entry.sourceLabel.trim().length > 0 &&
      entry.sourceLabel.length <= 128 &&
      !hasControlCharacters(entry.sourceLabel),
    "INVALID_CONTRACT",
    "Activity source labels must be bounded and safe for display",
  );
}

/** Proves the structural and arithmetic invariants of one transaction. */
export function assertBalancedTransaction(
  transaction: LedgerTransactionV1,
): void {
  economyAssert(
    transaction.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported ledger contract version",
  );
  assertEconomyIdentifier(transaction.transactionId, "transactionId");
  assertEconomyIdentifier(transaction.idempotencyKey, "idempotencyKey");
  economyAssert(
    ACTIVITY_TYPES.has(transaction.activityType) &&
      ACTIVITY_STATUSES.has(transaction.status),
    "INVALID_CONTRACT",
    "Transaction activity type or status is unsupported",
  );
  if (transaction.providerEventId !== undefined) {
    assertEconomyIdentifier(transaction.providerEventId, "providerEventId");
  }
  if (transaction.reversesTransactionId !== undefined) {
    assertEconomyIdentifier(
      transaction.reversesTransactionId,
      "reversesTransactionId",
    );
  }
  economyAssert(
    (transaction.activityType === "reversal") ===
      (transaction.reversesTransactionId !== undefined),
    "INVALID_CONTRACT",
    "Reversal transactions must identify exactly one original transaction",
  );
  const effectiveAt = parseIsoTimestamp(transaction.effectiveAt);
  const recordedAt = parseIsoTimestamp(transaction.recordedAt);
  economyAssert(
    recordedAt >= effectiveAt,
    "INVALID_TIME_WINDOW",
    "Transaction recording time cannot precede its effective time",
  );
  if (transaction.previousCanonicalHash !== undefined) {
    assertCanonicalHash(
      transaction.previousCanonicalHash,
      "Previous canonical hash",
    );
  }
  if (transaction.canonicalHash !== undefined) {
    assertCanonicalHash(transaction.canonicalHash, "Canonical hash");
  }
  const metadataEntries = Object.entries(transaction.metadata);
  economyAssert(
    metadataEntries.length <= 32 &&
      metadataEntries.every(
        ([key, value]) =>
          /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(key) &&
          value.length <= 512 &&
          !hasControlCharacters(value),
      ),
    "INVALID_CONTRACT",
    "Transaction metadata must be bounded and free of control characters",
  );
  economyAssert(
    transaction.postings.length >= 2,
    "UNBALANCED_TRANSACTION",
    "A ledger transaction needs at least two postings",
  );

  const postingIds = new Set<string>();
  for (const posting of transaction.postings) {
    economyAssert(
      posting.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported posting contract version",
    );
    assertEconomyIdentifier(posting.postingId, "postingId");
    assertEconomyIdentifier(posting.accountId, "accountId");
    if (posting.walletId !== undefined) {
      assertEconomyIdentifier(posting.walletId, "walletId");
    }
    if (posting.lotId !== undefined) {
      assertEconomyIdentifier(posting.lotId, "lotId");
    }
    economyAssert(
      posting.transactionId === transaction.transactionId,
      "INVALID_CONTRACT",
      "Posting transactionId must match its transaction",
    );
    economyAssert(
      !postingIds.has(posting.postingId),
      "DUPLICATE_IDENTIFIER",
      "Posting identifiers must be unique within a transaction",
    );
    postingIds.add(posting.postingId);
    economyAssert(
      parseTokenSubunits(posting.amount) !== 0n,
      "INVALID_AMOUNT",
      "Zero-value postings are not permitted",
    );
  }

  economyAssert(
    sumTokenSubunits(transaction.postings.map((posting) => posting.amount)) ===
      0n,
    "UNBALANCED_TRANSACTION",
    "Ledger postings must sum to zero TokenSubunits",
  );
}

/**
 * Narrows a balanced V1 transaction to the states accepted by the V2 journal.
 * This is additive: legacy V1 validators retain their existing status union.
 */
export function assertEconomicJournalTransaction(
  transaction: LedgerTransactionV1,
): asserts transaction is EconomicJournalTransactionV1 {
  assertBalancedTransaction(transaction);
  economyAssert(
    transaction.status === "held" || transaction.status === "settled",
    "INVALID_CONTRACT",
    "Pending, failed, and derived reversed activity cannot be journal transactions",
  );
}

/**
 * Produces deterministic UTF-8 JSON for an approved SHA-256/HSM adapter.
 * Hashing itself deliberately remains outside this provider-neutral package.
 */
export function canonicalTransactionPayload(
  transaction: LedgerTransactionV1,
): string {
  assertBalancedTransaction(transaction);
  const postings = [...transaction.postings]
    .sort((left, right) =>
      compareUnicodeCodeUnits(left.postingId, right.postingId),
    )
    .map((posting) => ({
      schemaVersion: posting.schemaVersion,
      postingId: posting.postingId,
      transactionId: posting.transactionId,
      accountId: posting.accountId,
      ...(posting.walletId === undefined ? {} : { walletId: posting.walletId }),
      ...(posting.lotId === undefined ? {} : { lotId: posting.lotId }),
      amount: posting.amount,
    }));

  return JSON.stringify({
    schemaVersion: transaction.schemaVersion,
    transactionId: transaction.transactionId,
    activityType: transaction.activityType,
    status: transaction.status,
    idempotencyKey: transaction.idempotencyKey,
    ...(transaction.providerEventId === undefined
      ? {}
      : { providerEventId: transaction.providerEventId }),
    ...(transaction.reversesTransactionId === undefined
      ? {}
      : { reversesTransactionId: transaction.reversesTransactionId }),
    effectiveAt: transaction.effectiveAt,
    recordedAt: transaction.recordedAt,
    ...(transaction.previousCanonicalHash === undefined
      ? {}
      : { previousCanonicalHash: transaction.previousCanonicalHash }),
    metadata: sortStringRecord(transaction.metadata),
    postings,
  });
}

export interface ReversalInputV1 {
  readonly transactionId: TransactionId;
  readonly postingIds: readonly PostingId[];
  readonly idempotencyKey: string;
  readonly effectiveAt: IsoTimestamp;
  readonly recordedAt: IsoTimestamp;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly previousCanonicalHash?: string;
}

/** Creates an immutable compensating transaction; it never edits the original. */
export function createReversalTransaction(
  original: LedgerTransactionV1,
  input: ReversalInputV1,
): LedgerTransactionV1 {
  assertBalancedTransaction(original);
  economyAssert(
    original.reversesTransactionId === undefined,
    "INVALID_CONTRACT",
    "A reversal cannot itself be reversed by this helper",
  );
  economyAssert(
    input.postingIds.length === original.postings.length,
    "INVALID_CONTRACT",
    "A reversal needs one new posting identifier per original posting",
  );

  const postings = original.postings.map((posting, index) => {
    const postingId = input.postingIds[index];
    economyAssert(
      postingId !== undefined,
      "INVALID_CONTRACT",
      "Missing reversal posting identifier",
    );
    return {
      ...posting,
      postingId,
      transactionId: input.transactionId,
      amount: serializeTokenSubunits(-parseTokenSubunits(posting.amount)),
    } satisfies LedgerPostingV1;
  });

  const transaction: LedgerTransactionV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    transactionId: input.transactionId,
    activityType: "reversal",
    status: "settled",
    idempotencyKey: input.idempotencyKey,
    reversesTransactionId: original.transactionId,
    effectiveAt: input.effectiveAt,
    recordedAt: input.recordedAt,
    ...(input.previousCanonicalHash === undefined
      ? {}
      : { previousCanonicalHash: input.previousCanonicalHash }),
    metadata: input.metadata ?? {},
    postings,
  };
  assertBalancedTransaction(transaction);
  return transaction;
}

/** Rejects a second effective reversal for the same original transaction. */
export function assertReversalAvailable(
  originalTransactionId: TransactionId,
  existingTransactions: readonly LedgerTransactionV1[],
): void {
  assertEconomyIdentifier(originalTransactionId, "originalTransactionId");
  economyAssert(
    !existingTransactions.some(
      (transaction) =>
        transaction.reversesTransactionId === originalTransactionId &&
        transaction.status !== "failed",
    ),
    "REVERSAL_ALREADY_EXISTS",
    "The transaction already has an effective reversal",
  );
}
