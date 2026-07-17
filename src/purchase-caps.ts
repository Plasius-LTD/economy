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

export interface PurchaseCapReservationTransitionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transitionId: string;
  readonly reservationId: string;
  readonly transitionType: PurchaseCapReservationTransitionTypeV1;
  readonly occurredAt: IsoTimestamp;
}

/** Append-only cap evidence; effectiveness is rebuilt from occurrence order. */
export interface PurchaseCapReservationTransitionReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transition: PurchaseCapReservationTransitionV1;
}

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
  /** Derived winning transition; every delivery remains in `transitionReceipts`. */
  readonly finalTransitionId?: string;
  readonly finalizedAt?: IsoTimestamp;
  readonly transitionReceipts: readonly PurchaseCapReservationTransitionReceiptV1[];
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

export interface PurchaseCapMutationResultV1 {
  readonly payerState: RollingPurchaseCapStateV1;
  readonly householdState: RollingPurchaseCapStateV1;
  readonly reservation: PurchaseCapReservationV1;
  /** True when a reservation or transition receipt was newly recorded. */
  readonly applied: boolean;
  readonly stateChanged: boolean;
  readonly payerUsageMinorUnits: GbpMinorUnitString;
  readonly householdUsageMinorUnits: GbpMinorUnitString;
}

interface ReservationBinding {
  readonly schemaVersion: EconomyContractVersion;
  readonly reservationId: string;
  readonly payerAccountId: AccountId;
  readonly householdId: HouseholdId;
  readonly priceMinorUnits: GbpMinorUnitString;
  readonly reservedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

const RESERVATION_STATUSES: readonly PurchaseCapReservationStatusV1[] = [
  "reserved",
  "settled",
  "released",
  "expired",
];

const TRANSITION_PRECEDENCE: Readonly<
  Record<PurchaseCapReservationTransitionTypeV1, number>
> = {
  settle: 0,
  release: 1,
  expire: 2,
};

/** Validates one rolling-cap transition envelope. */
export function assertPurchaseCapReservationTransition(
  transition: PurchaseCapReservationTransitionV1,
): void {
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
  parseIsoTimestamp(transition.occurredAt);
}

function sameTransition(
  left: PurchaseCapReservationTransitionV1,
  right: PurchaseCapReservationTransitionV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.transitionId === right.transitionId &&
    left.reservationId === right.reservationId &&
    left.transitionType === right.transitionType &&
    left.occurredAt === right.occurredAt
  );
}

function compareTransitions(
  left: PurchaseCapReservationTransitionV1,
  right: PurchaseCapReservationTransitionV1,
): number {
  const timeDifference =
    parseIsoTimestamp(left.occurredAt) - parseIsoTimestamp(right.occurredAt);
  if (timeDifference !== 0) {
    return timeDifference;
  }
  const precedenceDifference =
    TRANSITION_PRECEDENCE[left.transitionType] -
    TRANSITION_PRECEDENCE[right.transitionType];
  return precedenceDifference === 0
    ? compareUnicodeCodeUnits(left.transitionId, right.transitionId)
    : precedenceDifference;
}

function assertBinding(binding: ReservationBinding): void {
  economyAssert(
    binding.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-cap reservation contract version",
  );
  assertEconomyIdentifier(binding.reservationId, "reservationId");
  assertEconomyIdentifier(binding.payerAccountId, "payerAccountId");
  assertEconomyIdentifier(binding.householdId, "householdId");
  economyAssert(
    parseGbpMinorUnits(binding.priceMinorUnits) > 0n,
    "INVALID_AMOUNT",
    "Purchase-cap reservation amount must be positive",
  );
  economyAssert(
    parseIsoTimestamp(binding.expiresAt) >
      parseIsoTimestamp(binding.reservedAt),
    "INVALID_TIME_WINDOW",
    "Purchase-cap reservation expiry must follow its creation",
  );
}

function bindingFromReservation(
  reservation: PurchaseCapReservationV1,
): ReservationBinding {
  return {
    schemaVersion: reservation.schemaVersion,
    reservationId: reservation.reservationId,
    payerAccountId: reservation.payerAccountId,
    householdId: reservation.householdId,
    priceMinorUnits: reservation.priceMinorUnits,
    reservedAt: reservation.reservedAt,
    expiresAt: reservation.expiresAt,
  };
}

function projectReservation(
  binding: ReservationBinding,
  receipts: readonly PurchaseCapReservationTransitionReceiptV1[],
): PurchaseCapReservationV1 {
  assertBinding(binding);
  const reservedAt = parseIsoTimestamp(binding.reservedAt);
  const expiresAt = parseIsoTimestamp(binding.expiresAt);
  const transitionIds = new Set<string>();
  for (const receipt of receipts) {
    economyAssert(
      receipt.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported purchase-cap transition receipt version",
    );
    assertPurchaseCapReservationTransition(receipt.transition);
    economyAssert(
      receipt.transition.reservationId === binding.reservationId &&
        !transitionIds.has(receipt.transition.transitionId),
      "DUPLICATE_IDENTIFIER",
      "Purchase-cap receipts must be unique and belong to the reservation",
    );
    transitionIds.add(receipt.transition.transitionId);
  }

  let status: PurchaseCapReservationStatusV1 = "reserved";
  let finalTransitionId: string | undefined;
  let finalizedAt: IsoTimestamp | undefined;
  for (const receipt of [...receipts].sort((left, right) =>
    compareTransitions(left.transition, right.transition),
  )) {
    const transition = receipt.transition;
    const occurredAt = parseIsoTimestamp(transition.occurredAt);
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
    } else if (transition.transitionType === "release") {
      economyAssert(
        occurredAt < expiresAt,
        "INVALID_TIME_WINDOW",
        "Purchase-cap release must precede reservation expiry",
      );
    } else {
      economyAssert(
        occurredAt >= expiresAt,
        "INVALID_TIME_WINDOW",
        "Purchase-cap reservation cannot expire before its deadline",
      );
    }
    if (status === "reserved") {
      status =
        transition.transitionType === "settle"
          ? "settled"
          : transition.transitionType === "release"
            ? "released"
            : "expired";
      finalTransitionId = transition.transitionId;
      finalizedAt = transition.occurredAt;
    }
  }

  return {
    ...binding,
    status,
    ...(finalTransitionId === undefined
      ? {}
      : { finalTransitionId, finalizedAt: finalizedAt! }),
    transitionReceipts: receipts,
  };
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
    left.finalizedAt === right.finalizedAt &&
    left.transitionReceipts.length === right.transitionReceipts.length &&
    left.transitionReceipts.every((receipt, index) => {
      const other = right.transitionReceipts[index];
      return (
        other !== undefined &&
        receipt.schemaVersion === other.schemaVersion &&
        sameTransition(receipt.transition, other.transition)
      );
    })
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

/** Validates one mirrored rolling-cap reservation and its complete rebuild. */
export function assertPurchaseCapReservation(
  reservation: PurchaseCapReservationV1,
): void {
  economyAssert(
    RESERVATION_STATUSES.includes(reservation.status),
    "INVALID_CONTRACT",
    "Purchase-cap reservation status is unsupported",
  );
  const projected = projectReservation(
    bindingFromReservation(reservation),
    reservation.transitionReceipts,
  );
  economyAssert(
    sameReservationFacts(projected, reservation),
    "INVALID_CONTRACT",
    "Purchase-cap reservation does not match its immutable event rebuild",
  );
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
  const reservationIds = new Set<string>();
  const transitionIds = new Set<string>();
  let receiptCount = 0;
  for (const reservation of state.reservations) {
    assertPurchaseCapReservation(reservation);
    economyAssert(
      !reservationIds.has(reservation.reservationId),
      "DUPLICATE_IDENTIFIER",
      "Purchase-cap state cannot repeat a reservation",
    );
    reservationIds.add(reservation.reservationId);
    economyAssert(
      state.scopeType === "payer"
        ? reservation.payerAccountId === state.scopeId
        : reservation.householdId === state.scopeId,
      "INVALID_CONTRACT",
      "Purchase-cap reservation belongs to another aggregate scope",
    );
    for (const receipt of reservation.transitionReceipts) {
      economyAssert(
        !transitionIds.has(receipt.transition.transitionId),
        "DUPLICATE_IDENTIFIER",
        "Purchase-cap state cannot repeat a transition ID",
      );
      transitionIds.add(receipt.transition.transitionId);
      receiptCount += 1;
    }
  }
  economyAssert(
    Number.isSafeInteger(state.version) &&
      state.version === 1 + state.reservations.length + receiptCount,
    "INVALID_CONTRACT",
    "Purchase-cap state version must match reservation and receipt counts",
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
  stateChanged: boolean,
  checkedAt: IsoTimestamp,
  policy: PurchaseLimitPolicyV1,
): PurchaseCapMutationResultV1 {
  return {
    payerState,
    householdState,
    reservation,
    applied,
    stateChanged,
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
  const binding: ReservationBinding = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    reservationId: command.reservationId,
    payerAccountId: command.payerAccountId,
    householdId: command.householdId,
    priceMinorUnits: command.priceMinorUnits,
    reservedAt: command.reservedAt,
    expiresAt: command.expiresAt,
  };
  assertBinding(binding);
  assertAggregatePair(
    payerState,
    householdState,
    command.payerAccountId,
    command.householdId,
  );
  assertPurchaseLimitPolicy(policy);
  const proposed = projectReservation(binding, []);
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
  const amount = parseGbpMinorUnits(command.priceMinorUnits);
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

function findTransitionById(
  state: RollingPurchaseCapStateV1,
  transitionId: string,
): {
  readonly reservationId: string;
  readonly transition: PurchaseCapReservationTransitionV1;
} | undefined {
  for (const reservation of state.reservations) {
    const receipt = reservation.transitionReceipts.find(
      (candidate) => candidate.transition.transitionId === transitionId,
    );
    if (receipt !== undefined) {
      return { reservationId: reservation.reservationId, transition: receipt.transition };
    }
  }
  return undefined;
}

/**
 * Appends a settle/release/expiry receipt and rebuilds authoritative order. A
 * late-delivered pre-expiry settlement corrects a stored expiry while retaining
 * both receipts. Payer and household versions still advance atomically.
 */
export function transitionRollingPurchaseCapReservation(
  payerState: RollingPurchaseCapStateV1,
  householdState: RollingPurchaseCapStateV1,
  transition: PurchaseCapReservationTransitionV1,
  expectedPayerVersion: number,
  expectedHouseholdVersion: number,
  policy: PurchaseLimitPolicyV1,
): PurchaseCapMutationResultV1 {
  assertPurchaseCapReservationTransition(transition);
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

  const payerExisting = findTransitionById(
    payerState,
    transition.transitionId,
  );
  const householdExisting = findTransitionById(
    householdState,
    transition.transitionId,
  );
  economyAssert(
    (payerExisting === undefined) === (householdExisting === undefined),
    "INVALID_CONTRACT",
    "Purchase-cap transition must exist in both scopes atomically",
  );
  if (payerExisting !== undefined && householdExisting !== undefined) {
    economyAssert(
      payerExisting.reservationId === transition.reservationId &&
        householdExisting.reservationId === transition.reservationId &&
        sameTransition(payerExisting.transition, transition) &&
        sameTransition(householdExisting.transition, transition),
      "DUPLICATE_IDENTIFIER",
      "Purchase-cap transition ID was reused with different facts",
    );
    return resultWithUsage(
      payerState,
      householdState,
      current,
      false,
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

  const replacement = projectReservation(bindingFromReservation(current), [
    ...current.transitionReceipts,
    { schemaVersion: ECONOMY_CONTRACT_VERSION, transition },
  ]);
  const stateChanged =
    replacement.status !== current.status ||
    replacement.finalTransitionId !== current.finalTransitionId ||
    replacement.finalizedAt !== current.finalizedAt;
  const nextPayer = replaceReservation(payerState, replacement);
  const nextHousehold = replaceReservation(householdState, replacement);
  return resultWithUsage(
    nextPayer,
    nextHousehold,
    replacement,
    true,
    stateChanged,
    transition.occurredAt,
    policy,
  );
}
