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
  type HouseholdId,
  type IsoTimestamp,
  type LotId,
  type ProviderEventId,
  type WalletId,
} from "./contracts.js";
import { EconomyError, economyAssert } from "./errors.js";

export type TokenSource =
  | "shopify"
  | "ayet"
  | "bitlabs"
  | "subscription"
  | "event"
  | "competition"
  | "adjustment";

export type LotTransferPolicy =
  | "household-allocatable"
  | "same-user-only"
  | "non-transferable";

export type LotRefundState =
  | "none"
  | "partial"
  | "refunded"
  | "disputed"
  | "chargeback-lost";

export interface SourceLotV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly lotId: LotId;
  readonly walletId: WalletId;
  readonly beneficiaryAccountId: AccountId;
  readonly householdId?: HouseholdId;
  readonly payerAccountId?: AccountId;
  readonly source: TokenSource;
  readonly providerEventId?: ProviderEventId;
  readonly rateVersion: string;
  readonly settlementEvidenceHash: string;
  readonly transferPolicy: LotTransferPolicy;
  readonly refundState: LotRefundState;
  readonly originalAmount: TokenSubunitString;
  readonly remainingAmount: TokenSubunitString;
  readonly heldAmount: TokenSubunitString;
  readonly reversedAmount: TokenSubunitString;
  readonly settledAt: IsoTimestamp;
  readonly creditedAt: IsoTimestamp;
  readonly cohortKey?: string;
}

export type LotUseOperation = "allocate" | "spend" | "reclaim" | "refund";

export interface LotUseContextV1 {
  readonly operation: LotUseOperation;
  readonly beneficiaryAccountId: AccountId;
  readonly householdId?: HouseholdId;
}

export interface SourceLotSliceV1 {
  readonly lotId: LotId;
  readonly amount: TokenSubunitString;
}

/** Validates source-lot arithmetic, evidence, and immutable provenance fields. */
export function assertSourceLot(lot: SourceLotV1): void {
  economyAssert(
    lot.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported source-lot contract version",
  );
  assertEconomyIdentifier(lot.lotId, "lotId");
  assertEconomyIdentifier(lot.walletId, "walletId");
  assertEconomyIdentifier(lot.beneficiaryAccountId, "beneficiaryAccountId");
  if (lot.householdId !== undefined) {
    assertEconomyIdentifier(lot.householdId, "householdId");
  }
  if (lot.payerAccountId !== undefined) {
    assertEconomyIdentifier(lot.payerAccountId, "payerAccountId");
  }
  if (lot.providerEventId !== undefined) {
    assertEconomyIdentifier(lot.providerEventId, "providerEventId");
  }
  assertEconomyIdentifier(lot.rateVersion, "rateVersion");
  economyAssert(
    [
      "shopify",
      "ayet",
      "bitlabs",
      "subscription",
      "event",
      "competition",
      "adjustment",
    ].includes(lot.source),
    "INVALID_CONTRACT",
    "Source lot has an unsupported source",
  );
  economyAssert(
    ["household-allocatable", "same-user-only", "non-transferable"].includes(
      lot.transferPolicy,
    ),
    "INVALID_CONTRACT",
    "Source lot has an unsupported transfer policy",
  );
  economyAssert(
    ["none", "partial", "refunded", "disputed", "chargeback-lost"].includes(
      lot.refundState,
    ),
    "INVALID_CONTRACT",
    "Source lot has an unsupported refund state",
  );
  if (lot.source === "ayet" || lot.source === "bitlabs") {
    economyAssert(
      lot.transferPolicy === "same-user-only" &&
        lot.providerEventId !== undefined,
      "SOURCE_LOT_RESTRICTED",
      "Reward-provider lots must remain with the earning account",
    );
  }
  if (lot.source === "shopify") {
    economyAssert(
      lot.transferPolicy === "household-allocatable" &&
        lot.householdId !== undefined &&
        lot.payerAccountId !== undefined,
      "INVALID_CONTRACT",
      "Shopify lots must retain payer and receiving-household provenance",
    );
  }
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(lot.settlementEvidenceHash),
    "INVALID_CONTRACT",
    "Settlement evidence must be a sanitized SHA-256 reference",
  );
  const settledAt = parseIsoTimestamp(lot.settledAt);
  const creditedAt = parseIsoTimestamp(lot.creditedAt);
  economyAssert(
    creditedAt >= settledAt,
    "INVALID_TIME_WINDOW",
    "Source-lot credit time cannot precede settlement",
  );
  if (lot.cohortKey !== undefined) {
    assertEconomyIdentifier(lot.cohortKey, "cohortKey");
  }

  const original = parseTokenSubunits(lot.originalAmount);
  const remaining = parseTokenSubunits(lot.remainingAmount);
  const held = parseTokenSubunits(lot.heldAmount);
  const reversed = parseTokenSubunits(lot.reversedAmount);
  economyAssert(
    original > 0n && remaining >= 0n && held >= 0n && reversed >= 0n,
    "INVALID_AMOUNT",
    "Source-lot amounts must be non-negative and original must be positive",
  );
  economyAssert(
    remaining <= original && held <= remaining && reversed <= original,
    "INVALID_CONTRACT",
    "Source-lot amount components exceed the original or remaining amount",
  );
  economyAssert(
    remaining + reversed <= original,
    "INVALID_CONTRACT",
    "Remaining and reversed source-lot amounts exceed the original",
  );
}

/** Returns unheld, unconsumed TokenSubunits in a source lot. */
export function availableSourceLotAmount(lot: SourceLotV1): bigint {
  assertSourceLot(lot);
  return (
    parseTokenSubunits(lot.remainingAmount) - parseTokenSubunits(lot.heldAmount)
  );
}

/** Evaluates provider/source restrictions without trusting a browser claim. */
export function canUseSourceLot(
  lot: SourceLotV1,
  context: LotUseContextV1,
): boolean {
  if (context.operation === "refund") {
    return true;
  }

  if (context.operation === "allocate" || context.operation === "reclaim") {
    return (
      lot.transferPolicy === "household-allocatable" &&
      lot.householdId !== undefined &&
      lot.householdId === context.householdId
    );
  }

  if (lot.transferPolicy === "household-allocatable") {
    return (
      lot.householdId !== undefined && lot.householdId === context.householdId
    );
  }

  return lot.beneficiaryAccountId === context.beneficiaryAccountId;
}

/**
 * Selects eligible lots deterministically in credited-time/lot-id order.
 * The returned slices are a proposal; persistence must consume them atomically.
 */
export function selectSourceLots(
  lots: readonly SourceLotV1[],
  requestedAmount: TokenSubunitString,
  context: LotUseContextV1,
): readonly SourceLotSliceV1[] {
  const requested = parseTokenSubunits(requestedAmount);
  economyAssert(
    requested > 0n,
    "INVALID_AMOUNT",
    "Requested source-lot amount must be positive",
  );
  assertEconomyIdentifier(context.beneficiaryAccountId, "beneficiaryAccountId");

  const ordered = [...lots].sort((left, right) => {
    const timeDifference =
      parseIsoTimestamp(left.creditedAt) - parseIsoTimestamp(right.creditedAt);
    return timeDifference === 0
      ? left.lotId.localeCompare(right.lotId)
      : timeDifference;
  });

  let allAvailable = 0n;
  let remaining = requested;
  const slices: SourceLotSliceV1[] = [];

  for (const lot of ordered) {
    const available = availableSourceLotAmount(lot);
    allAvailable += available;
    if (available === 0n || !canUseSourceLot(lot, context)) {
      continue;
    }
    const selected = available < remaining ? available : remaining;
    slices.push({ lotId: lot.lotId, amount: serializeTokenSubunits(selected) });
    remaining -= selected;
    if (remaining === 0n) {
      return slices;
    }
  }

  if (allAvailable >= requested) {
    throw new EconomyError(
      "SOURCE_LOT_RESTRICTED",
      "Available source lots do not permit this operation",
    );
  }
  throw new EconomyError(
    "INSUFFICIENT_ELIGIBLE_LOTS",
    "Insufficient eligible source-lot balance",
  );
}
