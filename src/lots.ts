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
  type TransactionId,
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

/** Versioned mutable projection around immutable V1 source-lot provenance. */
export interface VersionedSourceLotV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly lot: SourceLotV1;
  readonly version: number;
  readonly updatedAt: IsoTimestamp;
}

export type SourceLotMovementType =
  | "allocate"
  | "boost"
  | "reclaim"
  | "spend"
  | "hold"
  | "release-hold"
  | "refund"
  | "chargeback"
  | "reversal";

/**
 * Immutable movement applied to one source-lot projection by compare-and-swap.
 * Signed deltas are authoritative; `resultingRefundState` is part of the same
 * atomic version transition.
 */
export interface SourceLotMovementV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly movementId: string;
  readonly transactionId: TransactionId;
  readonly lotId: LotId;
  readonly movementType: SourceLotMovementType;
  readonly remainingDelta: TokenSubunitString;
  readonly heldDelta: TokenSubunitString;
  readonly reversedDelta: TokenSubunitString;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly expectedRefundState: LotRefundState;
  readonly resultingRefundState: LotRefundState;
  readonly occurredAt: IsoTimestamp;
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

/** Validates the optimistic projection wrapper used by V2 persistence. */
export function assertVersionedSourceLot(
  snapshot: VersionedSourceLotV1,
): void {
  economyAssert(
    snapshot.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported versioned source-lot contract version",
  );
  assertSourceLot(snapshot.lot);
  economyAssert(
    Number.isSafeInteger(snapshot.version) && snapshot.version >= 1,
    "INVALID_CONTRACT",
    "Source-lot version must be a positive safe integer",
  );
  economyAssert(
    parseIsoTimestamp(snapshot.updatedAt) >=
      parseIsoTimestamp(snapshot.lot.creditedAt),
    "INVALID_TIME_WINDOW",
    "Source-lot update time cannot precede its credit",
  );
}

/** Creates the only state accepted by the V2 append-source-lot operation. */
export function createInitialSourceLotSnapshot(
  lot: SourceLotV1,
): VersionedSourceLotV1 {
  assertSourceLot(lot);
  economyAssert(
    lot.refundState === "none" &&
      lot.originalAmount === lot.remainingAmount &&
      parseTokenSubunits(lot.heldAmount) === 0n &&
      parseTokenSubunits(lot.reversedAmount) === 0n,
    "INVALID_CONTRACT",
    "A new source lot must start fully remaining, clear, and unreversed",
  );
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    lot,
    version: 1,
    updatedAt: lot.creditedAt,
  };
}

function assertRefundState(value: LotRefundState): void {
  economyAssert(
    [
      "none",
      "partial",
      "refunded",
      "disputed",
      "chargeback-lost",
    ].includes(value),
    "INVALID_CONTRACT",
    "Source-lot movement has an unsupported refund state",
  );
}

/** Validates movement shape and operation-specific delta direction. */
export function assertSourceLotMovement(
  movement: SourceLotMovementV1,
): void {
  economyAssert(
    movement.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported source-lot-movement contract version",
  );
  assertEconomyIdentifier(movement.movementId, "movementId");
  assertEconomyIdentifier(movement.transactionId, "transactionId");
  assertEconomyIdentifier(movement.lotId, "lotId");
  economyAssert(
    [
      "allocate",
      "boost",
      "reclaim",
      "spend",
      "hold",
      "release-hold",
      "refund",
      "chargeback",
      "reversal",
    ].includes(movement.movementType),
    "INVALID_CONTRACT",
    "Source-lot movement has an unsupported type",
  );
  const remaining = parseTokenSubunits(movement.remainingDelta);
  const held = parseTokenSubunits(movement.heldDelta);
  const reversed = parseTokenSubunits(movement.reversedDelta);
  economyAssert(
    remaining !== 0n || held !== 0n || reversed !== 0n,
    "INVALID_AMOUNT",
    "Source-lot movement must change at least one amount",
  );
  economyAssert(
    Number.isSafeInteger(movement.expectedVersion) &&
      movement.expectedVersion >= 1 &&
      movement.resultingVersion === movement.expectedVersion + 1,
    "INVALID_CONTRACT",
    "Source-lot movement must advance its optimistic version exactly once",
  );
  assertRefundState(movement.expectedRefundState);
  assertRefundState(movement.resultingRefundState);
  parseIsoTimestamp(movement.occurredAt);

  if (
    movement.movementType === "allocate" ||
    movement.movementType === "boost" ||
    movement.movementType === "spend"
  ) {
    economyAssert(
      remaining < 0n &&
        held === 0n &&
        reversed === 0n &&
        movement.resultingRefundState === movement.expectedRefundState,
      "INVALID_CONTRACT",
      "Allocation, boost, and spend movements only consume remaining lot value",
    );
  } else if (movement.movementType === "reclaim") {
    economyAssert(
      remaining > 0n &&
        held === 0n &&
        reversed === 0n &&
        movement.resultingRefundState === movement.expectedRefundState,
      "INVALID_CONTRACT",
      "Reclaim movements only restore remaining lot value",
    );
  } else if (movement.movementType === "hold") {
    economyAssert(
      remaining === 0n &&
        held > 0n &&
        reversed === 0n &&
        movement.resultingRefundState === "disputed",
      "INVALID_CONTRACT",
      "Hold movements must enter disputed state and increase held value",
    );
  } else if (movement.movementType === "release-hold") {
    economyAssert(
      remaining === 0n &&
        held < 0n &&
        reversed === 0n &&
        movement.expectedRefundState === "disputed" &&
        movement.resultingRefundState !== "disputed" &&
        movement.resultingRefundState !== "refunded" &&
        movement.resultingRefundState !== "chargeback-lost",
      "INVALID_CONTRACT",
      "Released holds must leave disputed state without reversing value",
    );
  } else {
    economyAssert(
      remaining < 0n &&
        reversed === -remaining &&
        held <= 0n &&
        (movement.resultingRefundState === "partial" ||
          movement.resultingRefundState === "refunded" ||
          movement.resultingRefundState === "chargeback-lost"),
      "INVALID_CONTRACT",
      "Refund, chargeback, and reversal movements must compensate remaining value exactly",
    );
    if (movement.movementType === "chargeback") {
      economyAssert(
        movement.resultingRefundState === "chargeback-lost",
        "INVALID_CONTRACT",
        "Chargeback movements must enter chargeback-lost state",
      );
    } else {
      economyAssert(
        movement.resultingRefundState !== "chargeback-lost",
        "INVALID_CONTRACT",
        "Only a chargeback movement may enter chargeback-lost state",
      );
    }
  }
}

/**
 * Applies one immutable movement to a locked source-lot snapshot. Persistence
 * must append the movement and compare-and-swap this result atomically.
 */
export function applySourceLotMovement(
  snapshot: VersionedSourceLotV1,
  movement: SourceLotMovementV1,
): VersionedSourceLotV1 {
  assertVersionedSourceLot(snapshot);
  assertSourceLotMovement(movement);
  economyAssert(
    movement.lotId === snapshot.lot.lotId &&
      movement.expectedVersion === snapshot.version &&
      movement.expectedRefundState === snapshot.lot.refundState,
    "INVALID_CONTRACT",
    "Source-lot movement does not match the locked lot version and refund state",
  );
  economyAssert(
    parseIsoTimestamp(movement.occurredAt) >=
      parseIsoTimestamp(snapshot.updatedAt),
    "INVALID_TIME_WINDOW",
    "Source-lot movement cannot precede its current projection",
  );

  const lot: SourceLotV1 = {
    ...snapshot.lot,
    remainingAmount: serializeTokenSubunits(
      parseTokenSubunits(snapshot.lot.remainingAmount) +
        parseTokenSubunits(movement.remainingDelta),
    ),
    heldAmount: serializeTokenSubunits(
      parseTokenSubunits(snapshot.lot.heldAmount) +
        parseTokenSubunits(movement.heldDelta),
    ),
    reversedAmount: serializeTokenSubunits(
      parseTokenSubunits(snapshot.lot.reversedAmount) +
        parseTokenSubunits(movement.reversedDelta),
    ),
    refundState: movement.resultingRefundState,
  };
  assertSourceLot(lot);

  const remaining = parseTokenSubunits(lot.remainingAmount);
  const held = parseTokenSubunits(lot.heldAmount);
  const reversed = parseTokenSubunits(lot.reversedAmount);
  const original = parseTokenSubunits(lot.originalAmount);
  if (lot.refundState === "none") {
    economyAssert(
      reversed === 0n && held === 0n,
      "INVALID_CONTRACT",
      "A clear lot cannot retain held or reversed value",
    );
  } else if (lot.refundState === "partial") {
    economyAssert(
      reversed > 0n && remaining > 0n && held === 0n,
      "INVALID_CONTRACT",
      "A partial refund requires retained/reversed value and no active hold",
    );
  } else if (lot.refundState === "disputed") {
    economyAssert(
      held > 0n,
      "INVALID_CONTRACT",
      "A disputed lot must hold affected value",
    );
  } else {
    economyAssert(
      remaining === 0n && held === 0n && reversed === original,
      "INVALID_CONTRACT",
      "Final refund and lost-chargeback states must reverse the full lot",
    );
  }

  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    lot,
    version: movement.resultingVersion,
    updatedAt: movement.occurredAt,
  };
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
