import {
  parseTokenSubunits,
  serializeTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
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
import {
  assertBalancedTransaction,
  assertEconomicJournalTransaction,
  type ActivityType,
  type EconomicJournalTransactionV1,
  type LedgerTransactionV1,
} from "./ledger.js";
import {
  assertWalletBalanceSummary,
  assertWalletLifetimeTotals,
  type WalletBalanceSummaryV1,
  type WalletLifetimeTotalsV1,
} from "./wallets.js";

export type BalanceProjection = Readonly<Record<AccountId, TokenSubunitString>>;

export interface BalanceProjectionSnapshotV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly balances: BalanceProjection;
  readonly lastTransactionId?: TransactionId;
  readonly rebuiltAt: IsoTimestamp;
}

export type WalletProjectionBucket = "spendable" | "reserved" | "held";

/** Exclusive stored buckets for one wallet; reward progress is derived. */
export interface WalletBalanceProjectionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly walletId: WalletId;
  readonly spendable: TokenSubunitString;
  readonly reserved: TokenSubunitString;
  readonly held: TokenSubunitString;
  readonly version: number;
  readonly lastTransactionId?: TransactionId;
  readonly asOf: IsoTimestamp;
}

/** One atomic add operation against all exclusive buckets of a wallet. */
export interface WalletBalanceDeltaV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly walletId: WalletId;
  readonly spendableDelta: TokenSubunitString;
  readonly reservedDelta: TokenSubunitString;
  readonly heldDelta: TokenSubunitString;
}

/** Authoritative mapping from a ledger account to one wallet bucket. */
export interface WalletPostingAccountBindingV1 {
  readonly accountId: AccountId;
  readonly walletId: WalletId;
  readonly bucket: WalletProjectionBucket;
}

export type WalletLifetimeBucket =
  | "bought"
  | "earned"
  | "allocated"
  | "reclaimed"
  | "spent"
  | "reversed";

/** Positive monotonic contribution to one wallet lifetime counter. */
export interface WalletLifetimeDeltaV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly walletId: WalletId;
  readonly bucket: WalletLifetimeBucket;
  readonly amount: TokenSubunitString;
}

/** Validates one exclusive-bucket projection. */
export function assertWalletBalanceProjection(
  projection: WalletBalanceProjectionV1,
): void {
  economyAssert(
    projection.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet-balance-projection contract version",
  );
  assertEconomyIdentifier(projection.walletId, "walletId");
  for (const amount of [
    projection.spendable,
    projection.reserved,
    projection.held,
  ]) {
    economyAssert(
      parseTokenSubunits(amount) >= 0n,
      "NEGATIVE_PROJECTION",
      "Wallet projection buckets cannot be negative",
    );
  }
  economyAssert(
    Number.isSafeInteger(projection.version) && projection.version >= 1,
    "INVALID_CONTRACT",
    "Wallet projection version must be a positive safe integer",
  );
  if (projection.lastTransactionId !== undefined) {
    assertEconomyIdentifier(
      projection.lastTransactionId,
      "lastTransactionId",
    );
  }
  parseIsoTimestamp(projection.asOf);
}

/** Validates one non-zero atomic wallet delta. */
export function assertWalletBalanceDelta(delta: WalletBalanceDeltaV1): void {
  economyAssert(
    delta.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet-balance-delta contract version",
  );
  assertEconomyIdentifier(delta.walletId, "walletId");
  const values = [
    parseTokenSubunits(delta.spendableDelta),
    parseTokenSubunits(delta.reservedDelta),
    parseTokenSubunits(delta.heldDelta),
  ];
  economyAssert(
    values.some((value) => value !== 0n),
    "INVALID_AMOUNT",
    "Wallet balance delta must change at least one bucket",
  );
}

/** Rejects duplicate wallet updates before one atomic persistence call. */
export function assertWalletBalanceDeltaBatch(
  transactionId: TransactionId,
  deltas: readonly WalletBalanceDeltaV1[],
): void {
  assertEconomyIdentifier(transactionId, "transactionId");
  economyAssert(
    deltas.length > 0,
    "INVALID_CONTRACT",
    "An economic transaction must update at least one wallet projection",
  );
  const walletIds = new Set<string>();
  for (const delta of deltas) {
    assertWalletBalanceDelta(delta);
    economyAssert(
      !walletIds.has(delta.walletId),
      "DUPLICATE_IDENTIFIER",
      "A balance-delta batch must update each wallet once",
    );
    walletIds.add(delta.walletId);
  }
}

/** Applies an atomic add locally for deterministic tests and rebuilds. */
export function applyWalletBalanceDelta(
  projection: WalletBalanceProjectionV1,
  delta: WalletBalanceDeltaV1,
  transactionId: TransactionId,
  asOf: IsoTimestamp,
): WalletBalanceProjectionV1 {
  assertWalletBalanceProjection(projection);
  assertWalletBalanceDelta(delta);
  assertEconomyIdentifier(transactionId, "transactionId");
  economyAssert(
    projection.walletId === delta.walletId,
    "INVALID_CONTRACT",
    "Wallet balance delta must target its projection wallet",
  );
  economyAssert(
    parseIsoTimestamp(asOf) >= parseIsoTimestamp(projection.asOf),
    "INVALID_TIME_WINDOW",
    "Wallet balance update cannot precede its projection",
  );
  const next: WalletBalanceProjectionV1 = {
    ...projection,
    spendable: serializeTokenSubunits(
      parseTokenSubunits(projection.spendable) +
        parseTokenSubunits(delta.spendableDelta),
    ),
    reserved: serializeTokenSubunits(
      parseTokenSubunits(projection.reserved) +
        parseTokenSubunits(delta.reservedDelta),
    ),
    held: serializeTokenSubunits(
      parseTokenSubunits(projection.held) +
        parseTokenSubunits(delta.heldDelta),
    ),
    version: projection.version + 1,
    lastTransactionId: transactionId,
    asOf,
  };
  assertWalletBalanceProjection(next);
  return next;
}

/**
 * Converts exclusive storage buckets to the legacy display DTO. Available is
 * independently usable whole Tokens in this wallet; rewardProgress is this
 * wallet's sub-Token remainder and is never netted with another wallet.
 */
export function createWalletBalanceSummary(
  projection: WalletBalanceProjectionV1,
): WalletBalanceSummaryV1 {
  assertWalletBalanceProjection(projection);
  const spendable = parseTokenSubunits(projection.spendable);
  const rewardProgress = spendable % 1_000n;
  const summary: WalletBalanceSummaryV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    walletId: projection.walletId,
    available: serializeTokenSubunits(spendable - rewardProgress),
    reserved: projection.reserved,
    held: projection.held,
    rewardProgress: serializeTokenSubunits(rewardProgress),
    version: projection.version,
    asOf: projection.asOf,
  };
  assertDeterministicWalletBalanceSummary(summary);
  return summary;
}

/** Enforces the stronger per-wallet semantics required by V1 query adapters. */
export function assertDeterministicWalletBalanceSummary(
  summary: WalletBalanceSummaryV1,
): void {
  assertWalletBalanceSummary(summary);
  economyAssert(
    parseTokenSubunits(summary.available) % 1_000n === 0n &&
      parseTokenSubunits(summary.rewardProgress) < 1_000n,
    "INVALID_CONTRACT",
    "Per-wallet availability must be whole Tokens with sub-Token progress below one Token",
  );
}

/**
 * Derives a single delta per wallet from wallet-linked postings and an
 * authoritative account-to-bucket mapping. Unlinked system postings are not
 * wallet projections.
 */
export function deriveWalletBalanceDeltas(
  transaction: EconomicJournalTransactionV1,
  bindings: readonly WalletPostingAccountBindingV1[],
): readonly WalletBalanceDeltaV1[] {
  assertEconomicJournalTransaction(transaction);
  const byAccount = new Map<AccountId, WalletPostingAccountBindingV1>();
  for (const binding of bindings) {
    assertEconomyIdentifier(binding.accountId, "accountId");
    assertEconomyIdentifier(binding.walletId, "walletId");
    economyAssert(
      ["spendable", "reserved", "held"].includes(binding.bucket),
      "INVALID_CONTRACT",
      "Wallet account binding has an unsupported bucket",
    );
    economyAssert(
      !byAccount.has(binding.accountId),
      "DUPLICATE_IDENTIFIER",
      "A ledger account may bind to only one wallet bucket",
    );
    byAccount.set(binding.accountId, binding);
  }

  const byWallet = new Map<WalletId, [bigint, bigint, bigint]>();
  for (const posting of transaction.postings) {
    if (posting.walletId === undefined) {
      continue;
    }
    const binding = byAccount.get(posting.accountId);
    economyAssert(
      binding !== undefined && binding.walletId === posting.walletId,
      "INVALID_CONTRACT",
      "Every wallet-linked posting must match an authoritative account binding",
    );
    const values = byWallet.get(binding.walletId) ?? [0n, 0n, 0n];
    const amount = parseTokenSubunits(posting.amount);
    if (binding.bucket === "spendable") {
      values[0] += amount;
    } else if (binding.bucket === "reserved") {
      values[1] += amount;
    } else {
      values[2] += amount;
    }
    byWallet.set(binding.walletId, values);
  }

  const deltas = [...byWallet.entries()]
    .map(([walletId, values]) => ({
      schemaVersion: ECONOMY_CONTRACT_VERSION,
      walletId,
      spendableDelta: serializeTokenSubunits(values[0]),
      reservedDelta: serializeTokenSubunits(values[1]),
      heldDelta: serializeTokenSubunits(values[2]),
    }))
    .filter(
      (delta) =>
        delta.spendableDelta !== "0" ||
        delta.reservedDelta !== "0" ||
        delta.heldDelta !== "0",
    )
    .sort((left, right) => left.walletId.localeCompare(right.walletId));
  assertWalletBalanceDeltaBatch(transaction.transactionId, deltas);
  return deltas;
}

const EARNED_ACTIVITY_TYPES = new Set<ActivityType>([
  "rewarded-ad",
  "offerwall",
  "event",
  "competition",
]);

/**
 * Rebuilds monotonic gross lifetime contributions from a settled transaction.
 * Earlier bought/earned counters are never reduced by a later compensating
 * transaction; removals accrue separately in `reversed`.
 */
export function deriveWalletLifetimeDeltas(
  transaction: EconomicJournalTransactionV1,
): readonly WalletLifetimeDeltaV1[] {
  assertEconomicJournalTransaction(transaction);
  if (transaction.status !== "settled") {
    return [];
  }
  const netByWallet = new Map<WalletId, bigint>();
  for (const posting of transaction.postings) {
    if (posting.walletId !== undefined) {
      netByWallet.set(
        posting.walletId,
        (netByWallet.get(posting.walletId) ?? 0n) +
          parseTokenSubunits(posting.amount),
      );
    }
  }

  const deltas: WalletLifetimeDeltaV1[] = [];
  for (const [walletId, net] of [...netByWallet.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    let bucket: WalletLifetimeBucket | undefined;
    let amount = 0n;
    if (
      net > 0n &&
      (transaction.activityType === "purchase" ||
        transaction.activityType === "subscription")
    ) {
      bucket = "bought";
      amount = net;
    } else if (net > 0n && EARNED_ACTIVITY_TYPES.has(transaction.activityType)) {
      bucket = "earned";
      amount = net;
    } else if (
      net < 0n &&
      (transaction.activityType === "allocation" ||
        transaction.activityType === "boost")
    ) {
      bucket = "allocated";
      amount = -net;
    } else if (net > 0n && transaction.activityType === "reclaim") {
      bucket = "reclaimed";
      amount = net;
    } else if (net < 0n && transaction.activityType === "spend") {
      bucket = "spent";
      amount = -net;
    } else if (
      net < 0n &&
      (transaction.activityType === "refund" ||
        transaction.activityType === "chargeback" ||
        transaction.activityType === "reversal")
    ) {
      bucket = "reversed";
      amount = -net;
    }
    if (bucket !== undefined) {
      deltas.push({
        schemaVersion: ECONOMY_CONTRACT_VERSION,
        walletId,
        bucket,
        amount: serializeTokenSubunits(amount),
      });
    }
  }
  return deltas;
}

/** Applies positive lifetime deltas for one wallet without rewriting history. */
export function applyWalletLifetimeDeltas(
  current: WalletLifetimeTotalsV1,
  walletId: WalletId,
  deltas: readonly WalletLifetimeDeltaV1[],
): WalletLifetimeTotalsV1 {
  assertWalletLifetimeTotals(current);
  assertEconomyIdentifier(walletId, "walletId");
  const next: Record<WalletLifetimeBucket, bigint> = {
    bought: parseTokenSubunits(current.bought),
    earned: parseTokenSubunits(current.earned),
    allocated: parseTokenSubunits(current.allocated),
    reclaimed: parseTokenSubunits(current.reclaimed),
    spent: parseTokenSubunits(current.spent),
    reversed: parseTokenSubunits(current.reversed),
  };
  for (const delta of deltas) {
    economyAssert(
      delta.schemaVersion === ECONOMY_CONTRACT_VERSION &&
        delta.walletId === walletId &&
        [
          "bought",
          "earned",
          "allocated",
          "reclaimed",
          "spent",
          "reversed",
        ].includes(delta.bucket),
      "INVALID_CONTRACT",
      "Lifetime delta must target the requested wallet and a known bucket",
    );
    const amount = parseTokenSubunits(delta.amount);
    economyAssert(
      amount > 0n,
      "INVALID_AMOUNT",
      "Lifetime deltas must be positive",
    );
    next[delta.bucket] += amount;
  }
  const totals: WalletLifetimeTotalsV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    bought: serializeTokenSubunits(next.bought),
    earned: serializeTokenSubunits(next.earned),
    allocated: serializeTokenSubunits(next.allocated),
    reclaimed: serializeTokenSubunits(next.reclaimed),
    spent: serializeTokenSubunits(next.spent),
    reversed: serializeTokenSubunits(next.reversed),
  };
  assertWalletLifetimeTotals(totals);
  return totals;
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
