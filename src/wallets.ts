import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type HouseholdId,
  type IsoTimestamp,
  type WalletId,
} from "./contracts.js";
import {
  parseTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import { economyAssert } from "./errors.js";

export type WalletKind =
  | "household-treasury"
  | "personal"
  | "gameplay-allocation"
  | "hold"
  | "purchase-clearing"
  | "provider-clearing"
  | "system";

export type WalletStatus = "active" | "restricted" | "closed";
export type WalletOwnerType = "account" | "household" | "system";

/** Versioned authoritative wallet descriptor. */
export interface WalletV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly walletId: WalletId;
  readonly accountId: AccountId;
  readonly kind: WalletKind;
  readonly ownerType: WalletOwnerType;
  readonly ownerId: AccountId | HouseholdId | "system";
  readonly householdId?: HouseholdId;
  readonly status: WalletStatus;
  readonly version: number;
  readonly createdAt: IsoTimestamp;
  readonly closedAt?: IsoTimestamp;
}

/** Server-computed wallet totals. Clients must never derive authority from it. */
export interface WalletBalanceSummaryV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly walletId: WalletId;
  readonly available: TokenSubunitString;
  readonly reserved: TokenSubunitString;
  readonly held: TokenSubunitString;
  readonly rewardProgress: TokenSubunitString;
  readonly version: number;
  readonly asOf: IsoTimestamp;
}

/** Lifetime aggregates used by the Token profile. */
export interface WalletLifetimeTotalsV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly bought: TokenSubunitString;
  readonly earned: TokenSubunitString;
  readonly allocated: TokenSubunitString;
  readonly reclaimed: TokenSubunitString;
  readonly spent: TokenSubunitString;
  readonly reversed: TokenSubunitString;
}

/** Validates wallet ownership, lifecycle, and optimistic-version facts. */
export function assertWallet(wallet: WalletV1): void {
  economyAssert(
    wallet.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet contract version",
  );
  assertEconomyIdentifier(wallet.walletId, "walletId");
  assertEconomyIdentifier(wallet.accountId, "accountId");
  economyAssert(
    [
      "household-treasury",
      "personal",
      "gameplay-allocation",
      "hold",
      "purchase-clearing",
      "provider-clearing",
      "system",
    ].includes(wallet.kind),
    "INVALID_CONTRACT",
    "Wallet has an unsupported kind",
  );
  economyAssert(
    ["account", "household", "system"].includes(wallet.ownerType),
    "INVALID_CONTRACT",
    "Wallet has an unsupported owner type",
  );
  economyAssert(
    ["active", "restricted", "closed"].includes(wallet.status),
    "INVALID_CONTRACT",
    "Wallet has an unsupported status",
  );
  if (wallet.ownerType === "system") {
    economyAssert(
      wallet.ownerId === "system",
      "INVALID_CONTRACT",
      "System wallets must be owned by the system",
    );
  } else {
    assertEconomyIdentifier(wallet.ownerId, "ownerId");
  }
  if (wallet.householdId !== undefined) {
    assertEconomyIdentifier(wallet.householdId, "householdId");
  }
  if (wallet.ownerType === "household") {
    economyAssert(
      wallet.householdId === wallet.ownerId,
      "INVALID_CONTRACT",
      "Household wallets must identify the same household owner",
    );
  }
  if (wallet.kind === "household-treasury") {
    economyAssert(
      wallet.ownerType === "household" && wallet.householdId !== undefined,
      "INVALID_CONTRACT",
      "Household treasuries must be owned by their household",
    );
  }
  if (wallet.kind === "personal" || wallet.kind === "gameplay-allocation") {
    economyAssert(
      wallet.ownerType === "account",
      "INVALID_CONTRACT",
      "Personal and gameplay-allocation wallets must be account-owned",
    );
  }
  if (wallet.kind === "gameplay-allocation") {
    economyAssert(
      wallet.householdId !== undefined,
      "INVALID_CONTRACT",
      "Gameplay-allocation wallets must retain household provenance",
    );
  }
  if (
    wallet.kind === "purchase-clearing" ||
    wallet.kind === "provider-clearing" ||
    wallet.kind === "system"
  ) {
    economyAssert(
      wallet.ownerType === "system" && wallet.householdId === undefined,
      "INVALID_CONTRACT",
      "Clearing and system wallets must be system-owned",
    );
  }
  economyAssert(
    Number.isSafeInteger(wallet.version) && wallet.version >= 1,
    "INVALID_CONTRACT",
    "Wallet version must be a positive safe integer",
  );
  const createdAt = parseIsoTimestamp(wallet.createdAt);
  if (wallet.closedAt !== undefined) {
    economyAssert(
      parseIsoTimestamp(wallet.closedAt) >= createdAt &&
        wallet.status === "closed",
      "INVALID_TIME_WINDOW",
      "Only closed wallets may have a valid closure time",
    );
  } else {
    economyAssert(
      wallet.status !== "closed",
      "INVALID_CONTRACT",
      "Closed wallets require a closure time",
    );
  }
}

/** Validates non-negative server-computed wallet balance categories. */
export function assertWalletBalanceSummary(
  summary: WalletBalanceSummaryV1,
): void {
  economyAssert(
    summary.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet summary contract version",
  );
  assertEconomyIdentifier(summary.walletId, "walletId");
  for (const amount of [
    summary.available,
    summary.reserved,
    summary.held,
    summary.rewardProgress,
  ]) {
    economyAssert(
      parseTokenSubunits(amount) >= 0n,
      "INVALID_AMOUNT",
      "Wallet summary categories cannot be negative",
    );
  }
  economyAssert(
    Number.isSafeInteger(summary.version) && summary.version >= 1,
    "INVALID_CONTRACT",
    "Wallet summary version must be a positive safe integer",
  );
  parseIsoTimestamp(summary.asOf);
}

/** Validates non-negative lifetime aggregates exposed by the profile API. */
export function assertWalletLifetimeTotals(
  totals: WalletLifetimeTotalsV1,
): void {
  economyAssert(
    totals.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet lifetime-total contract version",
  );
  for (const amount of [
    totals.bought,
    totals.earned,
    totals.allocated,
    totals.reclaimed,
    totals.spent,
    totals.reversed,
  ]) {
    economyAssert(
      parseTokenSubunits(amount) >= 0n,
      "INVALID_AMOUNT",
      "Wallet lifetime totals cannot be negative",
    );
  }
}
