import {
  assertPurchaseLimitPolicy,
  type PurchaseLimitPolicyV1,
} from "./acquisition.js";
import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type HouseholdId,
  type IsoTimestamp,
} from "./contracts.js";
import { EconomyError, economyAssert } from "./errors.js";

declare const gbpMinorUnitStringBrand: unique symbol;

/** Canonical non-negative GBP minor-unit string used by cap contracts. */
export type GbpMinorUnitString = string & {
  readonly [gbpMinorUnitStringBrand]: "GbpMinorUnitString";
};

const MAX_SIGNED_BIGINT = 2n ** 63n - 1n;
const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/u;

/** Parses exact GBP minor units without floating point or coercion. */
export function parseGbpMinorUnits(value: string): bigint {
  economyAssert(
    typeof value === "string" && CANONICAL_NON_NEGATIVE_INTEGER.test(value),
    "INVALID_AMOUNT",
    "GBP minor units must be a canonical non-negative integer string",
  );
  try {
    const amount = BigInt(value);
    economyAssert(
      amount <= MAX_SIGNED_BIGINT,
      "AMOUNT_OUT_OF_RANGE",
      "GBP minor units are outside the signed 64-bit range",
    );
    return amount;
  } catch (error) {
    if (error instanceof EconomyError) {
      throw error;
    }
    throw new EconomyError("INVALID_AMOUNT", "GBP minor units are invalid");
  }
}

/** Serializes exact GBP minor units using the canonical wire representation. */
export function serializeGbpMinorUnits(amount: bigint): GbpMinorUnitString {
  economyAssert(
    amount >= 0n && amount <= MAX_SIGNED_BIGINT,
    "AMOUNT_OUT_OF_RANGE",
    "GBP minor units are outside the signed 64-bit range",
  );
  return amount.toString(10) as GbpMinorUnitString;
}

export type PurchaseCapScopeTypeV1 = "payer" | "household";
export type PurchaseCapReservationStatusV1 =
  | "reserved"
  | "settled"
  | "released"
  | "expired";
export type PurchaseCapReservationTransitionTypeV1 =
  | "settle"
  | "release"
  | "expire";

/** One purchase amount mirrored into payer and household cap aggregates. */
export interface PurchaseCapReservationV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly reservationId: string;
  readonly payerAccountId: AccountId;
  readonly householdId: HouseholdId;
  readonly priceMinorUnits: GbpMinorUnitString;
  readonly status: PurchaseCapReservationStatusV1;
  readonly reservedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly finalTransitionId?: string;
  readonly finalizedAt?: IsoTimestamp;
}

/** Optimistic aggregate for exactly one payer or household rolling ceiling. */
export interface RollingPurchaseCapStateV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly scopeType: PurchaseCapScopeTypeV1;
  readonly scopeId: string;
  readonly version: number;
  readonly reservations: readonly PurchaseCapReservationV1[];
}

export interface ReservePurchaseCapsCommandV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly reservationId: string;
  readonly payerAccountId: AccountId;
  readonly householdId: HouseholdId;
  readonly priceMinorUnits: GbpMinorUnitString;
  readonly reservedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly expectedPayerVersion: number;
  readonly expectedHouseholdVersion: number;
}

export interface PurchaseCapReservationTransitionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transitionId: string;
  readonly reservationId: string;
  readonly transitionType: PurchaseCapReservationTransitionTypeV1;
  readonly occurredAt: IsoTimestamp;
}

export interface PurchaseCapMutationResultV1 {
  readonly payerState: RollingPurchaseCapStateV1;
  readonly householdState: RollingPurchaseCapStateV1;
  readonly reservation: PurchaseCapReservationV1;
  readonly applied: boolean;
  readonly payerUsageMinorUnits: GbpMinorUnitString;
  readonly householdUsageMinorUnits: GbpMinorUnitString;
}

const RESERVATION_STATUSES: readonly PurchaseCapReservationStatusV1[] = [
  "reserved",
  "settled",
  "released",
  "expired",
];

/** Validates one mirrored rolling-cap reservation. */
export function assertPurchaseCapReservation(
  reservation: PurchaseCapReservationV1,
): void {
  economyAssert(
    reservation.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-cap reservation contract version",
  );
  assertEconomyIdentifier(reservation.reservationId, "reservationId");
  assertEconomyIdentifier(reservation.payerAccountId, "payerAccountId");
  assertEconomyIdentifier(reservation.householdId, "householdId");
  economyAssert(
    parseGbpMinorUnits(reservation.priceMinorUnits) > 0n,
    "INVALID_AMOUNT",
    "Purchase-cap reservation amount must be positive",
  );
  economyAssert(
    RESERVATION_STATUSES.includes(reservation.status),
    "INVALID_CONTRACT",
    "Purchase-cap reservation status is unsupported",
  );
  const reservedAt = parseIsoTimestamp(reservation.reservedAt);
  const expiresAt = parseIsoTimestamp(reservation.expiresAt);
  economyAssert(
    expiresAt > reservedAt,
    "INVALID_TIME_WINDOW",
    "Purchase-cap reservation expiry must follow its creation",
  );
  const terminal = reservation.status !== "reserved";
  economyAssert(
    terminal ===
      (reservation.finalTransitionId !== undefined &&
        reservation.finalizedAt !== undefined),
    "INVALID_CONTRACT",
    "Purchase-cap terminal evidence must be present exactly for final states",
  );
  if (
    reservation.finalTransitionId !== undefined &&
    reservation.finalizedAt !== undefined
  ) {
    assertEconomyIdentifier(
      reservation.finalTransitionId,
      "finalTransitionId",
    );
    const finalizedAt = parseIsoTimestamp(reservation.finalizedAt);
    economyAssert(
      finalizedAt >= reservedAt,
      "INVALID_TIME_WINDOW",
      "Purchase-cap finalization cannot precede reservation",
    );
    if (reservation.status === "settled") {
      economyAssert(
        finalizedAt < expiresAt,
        "INVALID_TIME_WINDOW",
        "Purchase-cap settlement must use authoritative payment time before expiry",
      );
    }
    if (reservation.status === "expired") {
      economyAssert(
        finalizedAt >= expiresAt,
        "INVALID_TIME_WINDOW",
        "Purchase-cap expiry cannot finalize before its deadline",
      );
    }
  }
}

/** Validates one payer or household rolling-cap aggregate. */
export function assertRollingPurchaseCapState(
  state: RollingPurchaseCapStateV1,
): void {
  economyAssert(
    state.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported rolling purchase-cap contract version",
  );
  economyAssert(
    state.scopeType === "payer" || state.scopeType === "household",
    "INVALID_CONTRACT",
    "Purchase-cap scope type is unsupported",
  );
  assertEconomyIdentifier(state.scopeId, "scopeId");
  economyAssert(
    Number.isSafeInteger(state.version) && state.version >= 1,
    "INVALID_CONTRACT",
    "Purchase-cap state version must be a positive safe integer",
  );
  const ids = new Set<string>();
  const finalTransitionIds = new Set<string>();
  for (const reservation of state.reservations) {
    assertPurchaseCapReservation(reservation);
    economyAssert(
      !ids.has(reservation.reservationId),
      "DUPLICATE_IDENTIFIER",
      "Purchase-cap state cannot repeat a reservation",
    );
    ids.add(reservation.reservationId);
    if (reservation.finalTransitionId !== undefined) {
      economyAssert(
        !finalTransitionIds.has(reservation.finalTransitionId),
        "DUPLICATE_IDENTIFIER",
        "Purchase-cap state cannot repeat a final transition ID",
      );
      finalTransitionIds.add(reservation.finalTransitionId);
    }
    economyAssert(
      state.scopeType === "payer"
        ? reservation.payerAccountId === state.scopeId
        : reservation.householdId === state.scopeId,
      "INVALID_CONTRACT",
      "Purchase-cap reservation belongs to another aggregate scope",
    );
  }
  const finalReservationCount = state.reservations.filter(
    (reservation) => reservation.status !== "reserved",
  ).length;
  economyAssert(
    state.version ===
      1 + state.reservations.length + finalReservationCount,
    "INVALID_CONTRACT",
    "Purchase-cap state version must match reservation transitions",
  );
}

function assertAggregatePair(
  payerState: RollingPurchaseCapStateV1,
  householdState: RollingPurchaseCapStateV1,
  payerAccountId: AccountId,
  householdId: HouseholdId,
): void {
  assertRollingPurchaseCapState(payerState);
  assertRollingPurchaseCapState(householdState);
  economyAssert(
    payerState.scopeType === "payer" &&
      payerState.scopeId === payerAccountId &&
      householdState.scopeType === "household" &&
      householdState.scopeId === householdId,
    "INVALID_CONTRACT",
    "Purchase-cap aggregate pair does not match payer and household",
  );
}

function sameReservationFacts(
  left: PurchaseCapReservationV1,
  right: PurchaseCapReservationV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.reservationId === right.reservationId &&
    left.payerAccountId === right.payerAccountId &&
    left.householdId === right.householdId &&
    left.priceMinorUnits === right.priceMinorUnits &&
    left.status === right.status &&
    left.reservedAt === right.reservedAt &&
    left.expiresAt === right.expiresAt &&
    left.finalTransitionId === right.finalTransitionId &&
    left.finalizedAt === right.finalizedAt
  );
}

function sameReservationBinding(
  reservation: PurchaseCapReservationV1,
  proposed: PurchaseCapReservationV1,
): boolean {
  return (
    reservation.schemaVersion === proposed.schemaVersion &&
    reservation.reservationId === proposed.reservationId &&
    reservation.payerAccountId === proposed.payerAccountId &&
    reservation.householdId === proposed.householdId &&
    reservation.priceMinorUnits === proposed.priceMinorUnits &&
    reservation.reservedAt === proposed.reservedAt &&
    reservation.expiresAt === proposed.expiresAt
  );
}

function findMirroredReservation(
  payerState: RollingPurchaseCapStateV1,
  householdState: RollingPurchaseCapStateV1,
  reservationId: string,
): PurchaseCapReservationV1 | undefined {
  const payerReservation = payerState.reservations.find(
    (reservation) => reservation.reservationId === reservationId,
  );
  const householdReservation = householdState.reservations.find(
    (reservation) => reservation.reservationId === reservationId,
  );
  economyAssert(
    (payerReservation === undefined) === (householdReservation === undefined),
    "INVALID_CONTRACT",
    "Purchase-cap reservation must exist in both aggregate scopes atomically",
  );
  if (payerReservation === undefined || householdReservation === undefined) {
    return undefined;
  }
  economyAssert(
    sameReservationFacts(payerReservation, householdReservation),
    "INVALID_CONTRACT",
    "Payer and household purchase-cap reservations have diverged",
  );
  return payerReservation;
}

function windowStart(checkedAt: number, rollingDays: number): number {
  return checkedAt - rollingDays * 24 * 60 * 60 * 1_000;
}

/** Returns the exact cap usage at one point in time. */
export function calculateRollingPurchaseCapUsage(
  state: RollingPurchaseCapStateV1,
  checkedAt: IsoTimestamp,
  policy: PurchaseLimitPolicyV1,
): GbpMinorUnitString {
  assertRollingPurchaseCapState(state);
  assertPurchaseLimitPolicy(policy);
  const checkedAtValue = parseIsoTimestamp(checkedAt);
  const start = windowStart(checkedAtValue, policy.rollingDays);
  let total = 0n;
  for (const reservation of state.reservations) {
    if (
      reservation.status === "reserved" &&
      parseIsoTimestamp(reservation.reservedAt) <= checkedAtValue &&
      checkedAtValue < parseIsoTimestamp(reservation.expiresAt)
    ) {
      total += parseGbpMinorUnits(reservation.priceMinorUnits);
    } else if (
      reservation.status === "settled" &&
      reservation.finalizedAt !== undefined
    ) {
      const settledAt = parseIsoTimestamp(reservation.finalizedAt);
      if (settledAt >= start && settledAt <= checkedAtValue) {
        total += parseGbpMinorUnits(reservation.priceMinorUnits);
      }
    }
    economyAssert(
      total <= MAX_SIGNED_BIGINT,
      "AMOUNT_OUT_OF_RANGE",
      "Rolling purchase-cap usage exceeds signed 64-bit range",
    );
  }
  return serializeGbpMinorUnits(total);
}

/** Creates an empty compare-and-swap aggregate for one cap scope. */
export function createRollingPurchaseCapState(
  scopeType: PurchaseCapScopeTypeV1,
  scopeId: string,
): RollingPurchaseCapStateV1 {
  economyAssert(
    scopeType === "payer" || scopeType === "household",
    "INVALID_CONTRACT",
    "Purchase-cap scope type is unsupported",
  );
  assertEconomyIdentifier(scopeId, "scopeId");
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    scopeType,
    scopeId,
    version: 1,
    reservations: [],
  };
}

function sortedWithReservation(
  state: RollingPurchaseCapStateV1,
  reservation: PurchaseCapReservationV1,
): readonly PurchaseCapReservationV1[] {
  return [...state.reservations, reservation].sort((left, right) =>
    compareUnicodeCodeUnits(left.reservationId, right.reservationId),
  );
}

function resultWithUsage(
  payerState: RollingPurchaseCapStateV1,
  householdState: RollingPurchaseCapStateV1,
  reservation: PurchaseCapReservationV1,
  applied: boolean,
  checkedAt: IsoTimestamp,
  policy: PurchaseLimitPolicyV1,
): PurchaseCapMutationResultV1 {
  return {
    payerState,
    householdState,
    reservation,
    applied,
    payerUsageMinorUnits: calculateRollingPurchaseCapUsage(
      payerState,
      checkedAt,
      policy,
    ),
    householdUsageMinorUnits: calculateRollingPurchaseCapUsage(
      householdState,
      checkedAt,
      policy,
    ),
  };
}

/**
 * Atomically reserves the same amount in payer and household aggregates.
 * Adapters must compare-and-swap both returned versions in one transaction.
 */
export function reserveRollingPurchaseCaps(
  payerState: RollingPurchaseCapStateV1,
  householdState: RollingPurchaseCapStateV1,
  command: ReservePurchaseCapsCommandV1,
  policy: PurchaseLimitPolicyV1,
): PurchaseCapMutationResultV1 {
  economyAssert(
    command.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-cap reservation command version",
  );
  assertEconomyIdentifier(command.reservationId, "reservationId");
  assertEconomyIdentifier(command.payerAccountId, "payerAccountId");
  assertEconomyIdentifier(command.householdId, "householdId");
  assertAggregatePair(
    payerState,
    householdState,
    command.payerAccountId,
    command.householdId,
  );
  assertPurchaseLimitPolicy(policy);
  const amount = parseGbpMinorUnits(command.priceMinorUnits);
  const reservedAt = parseIsoTimestamp(command.reservedAt);
  const expiresAt = parseIsoTimestamp(command.expiresAt);
  economyAssert(
    amount > 0n && expiresAt > reservedAt,
    "INVALID_TIME_WINDOW",
    "Purchase-cap reservation must have positive amount and future expiry",
  );

  const proposed: PurchaseCapReservationV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    reservationId: command.reservationId,
    payerAccountId: command.payerAccountId,
    householdId: command.householdId,
    priceMinorUnits: command.priceMinorUnits,
    status: "reserved",
    reservedAt: command.reservedAt,
    expiresAt: command.expiresAt,
  };
  assertPurchaseCapReservation(proposed);
  const replay = findMirroredReservation(
    payerState,
    householdState,
    command.reservationId,
  );
  if (replay !== undefined) {
    economyAssert(
      sameReservationBinding(replay, proposed),
      "DUPLICATE_IDENTIFIER",
      "Purchase-cap reservation ID was reused with different facts",
    );
    return resultWithUsage(
      payerState,
      householdState,
      replay,
      false,
      replay.finalizedAt ?? command.reservedAt,
      policy,
    );
  }

  economyAssert(
    command.expectedPayerVersion === payerState.version &&
      command.expectedHouseholdVersion === householdState.version,
    "INVALID_CONTRACT",
    "Purchase-cap reservation has a stale aggregate version",
  );
  economyAssert(
    amount <= parseGbpMinorUnits(policy.maxOrderPriceMinorUnits),
    "INSUFFICIENT_BALANCE",
    "Purchase amount exceeds the per-order ceiling",
  );
  const payerUsage = parseGbpMinorUnits(
    calculateRollingPurchaseCapUsage(payerState, command.reservedAt, policy),
  );
  const householdUsage = parseGbpMinorUnits(
    calculateRollingPurchaseCapUsage(
      householdState,
      command.reservedAt,
      policy,
    ),
  );
  economyAssert(
    payerUsage + amount <=
      parseGbpMinorUnits(policy.rollingPayerPriceMinorUnits),
    "INSUFFICIENT_BALANCE",
    "Purchase amount exceeds the rolling payer ceiling",
  );
  economyAssert(
    householdUsage + amount <=
      parseGbpMinorUnits(policy.rollingHouseholdPriceMinorUnits),
    "INSUFFICIENT_BALANCE",
    "Purchase amount exceeds the rolling household ceiling",
  );

  const nextPayer: RollingPurchaseCapStateV1 = {
    ...payerState,
    version: payerState.version + 1,
    reservations: sortedWithReservation(payerState, proposed),
  };
  const nextHousehold: RollingPurchaseCapStateV1 = {
    ...householdState,
    version: householdState.version + 1,
    reservations: sortedWithReservation(householdState, proposed),
  };
  return resultWithUsage(
    nextPayer,
    nextHousehold,
    proposed,
    true,
    command.reservedAt,
    policy,
  );
}

function replaceReservation(
  state: RollingPurchaseCapStateV1,
  replacement: PurchaseCapReservationV1,
): RollingPurchaseCapStateV1 {
  return {
    ...state,
    version: state.version + 1,
    reservations: state.reservations.map((reservation) =>
      reservation.reservationId === replacement.reservationId
        ? replacement
        : reservation,
    ),
  };
}

/** Settles, releases, or expires one mirrored reservation exactly once. */
export function transitionRollingPurchaseCapReservation(
  payerState: RollingPurchaseCapStateV1,
  householdState: RollingPurchaseCapStateV1,
  transition: PurchaseCapReservationTransitionV1,
  expectedPayerVersion: number,
  expectedHouseholdVersion: number,
  policy: PurchaseLimitPolicyV1,
): PurchaseCapMutationResultV1 {
  economyAssert(
    transition.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-cap transition contract version",
  );
  assertEconomyIdentifier(transition.transitionId, "transitionId");
  assertEconomyIdentifier(transition.reservationId, "reservationId");
  economyAssert(
    ["settle", "release", "expire"].includes(transition.transitionType),
    "INVALID_CONTRACT",
    "Purchase-cap transition type is unsupported",
  );
  const occurredAt = parseIsoTimestamp(transition.occurredAt);
  assertRollingPurchaseCapState(payerState);
  assertRollingPurchaseCapState(householdState);
  const current = findMirroredReservation(
    payerState,
    householdState,
    transition.reservationId,
  );
  economyAssert(
    current !== undefined,
    "INVALID_CONTRACT",
    "Purchase-cap reservation does not exist in both aggregate scopes",
  );
  assertAggregatePair(
    payerState,
    householdState,
    current.payerAccountId,
    current.householdId,
  );
  assertPurchaseLimitPolicy(policy);

  const targetStatus: PurchaseCapReservationStatusV1 =
    transition.transitionType === "settle"
      ? "settled"
      : transition.transitionType === "release"
        ? "released"
        : "expired";
  const transitionOwner = payerState.reservations.find(
    (reservation) =>
      reservation.finalTransitionId === transition.transitionId,
  );
  economyAssert(
    transitionOwner === undefined ||
      transitionOwner.reservationId === current.reservationId,
    "DUPLICATE_IDENTIFIER",
    "Purchase-cap transition ID already finalized another reservation",
  );
  if (current.finalTransitionId === transition.transitionId) {
    economyAssert(
      current.status === targetStatus &&
        current.finalizedAt === transition.occurredAt,
      "DUPLICATE_IDENTIFIER",
      "Purchase-cap transition ID was reused with different facts",
    );
    return resultWithUsage(
      payerState,
      householdState,
      current,
      false,
      transition.occurredAt,
      policy,
    );
  }
  if (current.status !== "reserved") {
    economyAssert(
      current.status === targetStatus,
      "INVALID_CONTRACT",
      "Purchase-cap reservation already has a conflicting final state",
    );
    return resultWithUsage(
      payerState,
      householdState,
      current,
      false,
      transition.occurredAt,
      policy,
    );
  }
  economyAssert(
    expectedPayerVersion === payerState.version &&
      expectedHouseholdVersion === householdState.version,
    "INVALID_CONTRACT",
    "Purchase-cap transition has a stale aggregate version",
  );
  const reservedAt = parseIsoTimestamp(current.reservedAt);
  const expiresAt = parseIsoTimestamp(current.expiresAt);
  economyAssert(
    occurredAt >= reservedAt,
    "INVALID_TIME_WINDOW",
    "Purchase-cap transition cannot precede reservation",
  );
  if (transition.transitionType === "settle") {
    economyAssert(
      occurredAt < expiresAt,
      "INVALID_TIME_WINDOW",
      "Purchase-cap settlement must use payment time before expiry",
    );
  } else if (transition.transitionType === "expire") {
    economyAssert(
      occurredAt >= expiresAt,
      "INVALID_TIME_WINDOW",
      "Purchase-cap reservation cannot expire before its deadline",
    );
  }

  const replacement: PurchaseCapReservationV1 = {
    ...current,
    status: targetStatus,
    finalTransitionId: transition.transitionId,
    finalizedAt: transition.occurredAt,
  };
  assertPurchaseCapReservation(replacement);
  const nextPayer = replaceReservation(payerState, replacement);
  const nextHousehold = replaceReservation(householdState, replacement);
  return resultWithUsage(
    nextPayer,
    nextHousehold,
    replacement,
    true,
    transition.occurredAt,
    policy,
  );
}
