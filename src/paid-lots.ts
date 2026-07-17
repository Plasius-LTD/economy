import {
  parseTokenSubunits,
  serializeTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type HouseholdId,
  type IsoTimestamp,
  type LotId,
} from "./contracts.js";
import type { PaidLotRetentionV1 } from "./early-backers.js";
import { economyAssert } from "./errors.js";
import { assertSourceLot, type SourceLotV1 } from "./lots.js";

export type PaidLotLifecycleStatusV1 =
  | "clear"
  | "partially-reversed"
  | "disputed"
  | "fully-reversed"
  | "chargeback-lost";

export type PaidLotLifecycleEventTypeV1 =
  | "refund"
  | "dispute-hold"
  | "dispute-won"
  | "dispute-lost"
  | "chargeback"
  | "reversal";

/** Paid-purchase facts not already carried by the source lot. */
export interface PaidLotPurchaseProvenanceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly purchaseId: string;
  readonly catalogVersion: string;
  readonly purchasedAt: IsoTimestamp;
}

/** Provider-neutral refund/dispute evidence for a paid source lot. */
export interface PaidLotLifecycleEventV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly eventId: string;
  readonly lotId: LotId;
  readonly eventType: PaidLotLifecycleEventTypeV1;
  readonly amount: TokenSubunitString;
  readonly occurredAt: IsoTimestamp;
}

export interface PaidLotLifecycleReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly event: PaidLotLifecycleEventV1;
}

/**
 * Retained paid-lot projection. Immutable purchase/original facts plus every
 * receipt are sufficient to rebuild all derived amounts in occurrence order.
 */
export interface PaidLotLifecycleV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly lotId: LotId;
  readonly payerAccountId: AccountId;
  readonly receivingHouseholdId: HouseholdId;
  readonly purchaseId: string;
  readonly catalogVersion: string;
  readonly purchasedAt: IsoTimestamp;
  readonly settledAt: IsoTimestamp;
  readonly creditedAt: IsoTimestamp;
  readonly originalAmount: TokenSubunitString;
  readonly retainedAmount: TokenSubunitString;
  readonly heldAmount: TokenSubunitString;
  readonly reversedAmount: TokenSubunitString;
  readonly refundedAmount: TokenSubunitString;
  readonly chargebackAmount: TokenSubunitString;
  readonly oneTimeReversalAmount: TokenSubunitString;
  readonly status: PaidLotLifecycleStatusV1;
  readonly version: number;
  readonly receipts: readonly PaidLotLifecycleReceiptV1[];
  readonly effectiveEventIds: readonly string[];
}

/** Exact signed projection deltas produced when one receipt is appended. */
export interface PaidLotLifecycleArithmeticV1 {
  readonly retainedDelta: TokenSubunitString;
  readonly heldDelta: TokenSubunitString;
  readonly reversedDelta: TokenSubunitString;
  readonly refundedDelta: TokenSubunitString;
  readonly chargebackDelta: TokenSubunitString;
  readonly oneTimeReversalDelta: TokenSubunitString;
}

export interface PaidLotLifecycleMutationResultV1 {
  readonly lifecycle: PaidLotLifecycleV1;
  /** False only for an exact event-ID replay already recorded. */
  readonly applied: boolean;
  readonly stateChanged: boolean;
  readonly arithmetic: PaidLotLifecycleArithmeticV1;
}

interface PaidLotImmutableFacts {
  readonly schemaVersion: EconomyContractVersion;
  readonly lotId: LotId;
  readonly payerAccountId: AccountId;
  readonly receivingHouseholdId: HouseholdId;
  readonly purchaseId: string;
  readonly catalogVersion: string;
  readonly purchasedAt: IsoTimestamp;
  readonly settledAt: IsoTimestamp;
  readonly creditedAt: IsoTimestamp;
  readonly originalAmount: TokenSubunitString;
}

interface PaidLotProjection {
  readonly retained: bigint;
  readonly held: bigint;
  readonly reversed: bigint;
  readonly refunded: bigint;
  readonly chargeback: bigint;
  readonly oneTimeReversal: bigint;
  readonly status: PaidLotLifecycleStatusV1;
  readonly effectiveEventIds: readonly string[];
}

const ZERO_ARITHMETIC: PaidLotLifecycleArithmeticV1 = Object.freeze({
  retainedDelta: serializeTokenSubunits(0n),
  heldDelta: serializeTokenSubunits(0n),
  reversedDelta: serializeTokenSubunits(0n),
  refundedDelta: serializeTokenSubunits(0n),
  chargebackDelta: serializeTokenSubunits(0n),
  oneTimeReversalDelta: serializeTokenSubunits(0n),
});

const EVENT_TYPES: readonly PaidLotLifecycleEventTypeV1[] = [
  "refund",
  "dispute-hold",
  "dispute-won",
  "dispute-lost",
  "chargeback",
  "reversal",
];

const EVENT_PRECEDENCE: Readonly<Record<PaidLotLifecycleEventTypeV1, number>> = {
  "dispute-hold": 0,
  "dispute-won": 1,
  "dispute-lost": 1,
  refund: 2,
  chargeback: 3,
  reversal: 4,
};

/** Validates the paid purchase facts paired with a source lot. */
export function assertPaidLotPurchaseProvenance(
  provenance: PaidLotPurchaseProvenanceV1,
): void {
  economyAssert(
    provenance.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported paid-lot provenance contract version",
  );
  assertEconomyIdentifier(provenance.purchaseId, "purchaseId");
  assertEconomyIdentifier(provenance.catalogVersion, "catalogVersion");
  parseIsoTimestamp(provenance.purchasedAt);
}

/** Validates one provider-neutral paid-lot lifecycle event. */
export function assertPaidLotLifecycleEvent(
  event: PaidLotLifecycleEventV1,
): void {
  economyAssert(
    event.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported paid-lot lifecycle event contract version",
  );
  assertEconomyIdentifier(event.eventId, "eventId");
  assertEconomyIdentifier(event.lotId, "lotId");
  economyAssert(
    EVENT_TYPES.includes(event.eventType),
    "INVALID_CONTRACT",
    "Paid-lot lifecycle event type is unsupported",
  );
  economyAssert(
    parseTokenSubunits(event.amount) > 0n,
    "INVALID_AMOUNT",
    "Paid-lot lifecycle event amount must be positive",
  );
  parseIsoTimestamp(event.occurredAt);
}

function sameEvent(
  left: PaidLotLifecycleEventV1,
  right: PaidLotLifecycleEventV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.eventId === right.eventId &&
    left.lotId === right.lotId &&
    left.eventType === right.eventType &&
    left.amount === right.amount &&
    left.occurredAt === right.occurredAt
  );
}

function compareEvents(
  left: PaidLotLifecycleEventV1,
  right: PaidLotLifecycleEventV1,
): number {
  const timeDifference =
    parseIsoTimestamp(left.occurredAt) - parseIsoTimestamp(right.occurredAt);
  if (timeDifference !== 0) {
    return timeDifference;
  }
  const precedenceDifference =
    EVENT_PRECEDENCE[left.eventType] - EVENT_PRECEDENCE[right.eventType];
  return precedenceDifference === 0
    ? compareUnicodeCodeUnits(left.eventId, right.eventId)
    : precedenceDifference;
}

function deriveStatus(
  retained: bigint,
  held: bigint,
  reversed: bigint,
  chargeback: bigint,
): PaidLotLifecycleStatusV1 {
  if (held > 0n) {
    return "disputed";
  }
  if (chargeback > 0n) {
    return "chargeback-lost";
  }
  if (retained === 0n) {
    return "fully-reversed";
  }
  return reversed > 0n ? "partially-reversed" : "clear";
}

function immutableFactsFromLifecycle(
  lifecycle: PaidLotLifecycleV1,
): PaidLotImmutableFacts {
  return {
    schemaVersion: lifecycle.schemaVersion,
    lotId: lifecycle.lotId,
    payerAccountId: lifecycle.payerAccountId,
    receivingHouseholdId: lifecycle.receivingHouseholdId,
    purchaseId: lifecycle.purchaseId,
    catalogVersion: lifecycle.catalogVersion,
    purchasedAt: lifecycle.purchasedAt,
    settledAt: lifecycle.settledAt,
    creditedAt: lifecycle.creditedAt,
    originalAmount: lifecycle.originalAmount,
  };
}

function assertImmutableFacts(facts: PaidLotImmutableFacts): void {
  economyAssert(
    facts.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported paid-lot lifecycle contract version",
  );
  assertEconomyIdentifier(facts.lotId, "lotId");
  assertEconomyIdentifier(facts.payerAccountId, "payerAccountId");
  assertEconomyIdentifier(
    facts.receivingHouseholdId,
    "receivingHouseholdId",
  );
  assertEconomyIdentifier(facts.purchaseId, "purchaseId");
  assertEconomyIdentifier(facts.catalogVersion, "catalogVersion");
  const purchasedAt = parseIsoTimestamp(facts.purchasedAt);
  const settledAt = parseIsoTimestamp(facts.settledAt);
  const creditedAt = parseIsoTimestamp(facts.creditedAt);
  economyAssert(
    purchasedAt <= settledAt && settledAt <= creditedAt,
    "INVALID_TIME_WINDOW",
    "Paid-lot timestamps must follow purchase, settlement, then credit order",
  );
  economyAssert(
    parseTokenSubunits(facts.originalAmount) > 0n,
    "INVALID_AMOUNT",
    "Paid-lot original amount must be positive",
  );
}

function projectPaidLot(
  facts: PaidLotImmutableFacts,
  receipts: readonly PaidLotLifecycleReceiptV1[],
): PaidLotProjection {
  assertImmutableFacts(facts);
  const eventIds = new Set<string>();
  let reversalReceipts = 0;
  for (const receipt of receipts) {
    economyAssert(
      receipt.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported paid-lot receipt contract version",
    );
    assertPaidLotLifecycleEvent(receipt.event);
    economyAssert(
      receipt.event.lotId === facts.lotId &&
        !eventIds.has(receipt.event.eventId),
      "DUPLICATE_IDENTIFIER",
      "Paid-lot receipts must be unique and belong to the lifecycle lot",
    );
    eventIds.add(receipt.event.eventId);
    if (receipt.event.eventType === "reversal") {
      reversalReceipts += 1;
    }
  }
  economyAssert(
    reversalReceipts <= 1,
    "REVERSAL_ALREADY_EXISTS",
    "Paid-lot lifecycle permits only one distinct reversal event",
  );

  let retained = parseTokenSubunits(facts.originalAmount);
  let held = 0n;
  let reversed = 0n;
  let refunded = 0n;
  let chargeback = 0n;
  let oneTimeReversal = 0n;
  const effectiveEventIds: string[] = [];
  for (const receipt of [...receipts].sort((left, right) =>
    compareEvents(left.event, right.event),
  )) {
    const event = receipt.event;
    economyAssert(
      parseIsoTimestamp(event.occurredAt) >=
        parseIsoTimestamp(facts.creditedAt),
      "INVALID_TIME_WINDOW",
      "Paid-lot lifecycle event cannot precede credit",
    );
    const amount = parseTokenSubunits(event.amount);
    if (event.eventType === "dispute-hold") {
      economyAssert(
        amount <= retained - held,
        "INSUFFICIENT_ELIGIBLE_LOTS",
        "Dispute hold exceeds unheld retained paid-lot basis",
      );
      held += amount;
    } else if (event.eventType === "dispute-won") {
      economyAssert(
        amount <= held,
        "INVALID_AMOUNT",
        "Dispute-win release exceeds held paid-lot basis",
      );
      held -= amount;
    } else if (event.eventType === "dispute-lost") {
      economyAssert(
        amount <= held,
        "INVALID_AMOUNT",
        "Dispute-loss amount exceeds held paid-lot basis",
      );
      held -= amount;
      retained -= amount;
      reversed += amount;
      chargeback += amount;
    } else {
      economyAssert(
        amount <= retained - held,
        "INSUFFICIENT_ELIGIBLE_LOTS",
        "Paid-lot reversal exceeds unheld retained basis",
      );
      if (event.eventType === "reversal") {
        oneTimeReversal += amount;
      } else if (event.eventType === "refund") {
        refunded += amount;
      } else {
        chargeback += amount;
      }
      retained -= amount;
      reversed += amount;
    }
    effectiveEventIds.push(event.eventId);
  }

  return {
    retained,
    held,
    reversed,
    refunded,
    chargeback,
    oneTimeReversal,
    status: deriveStatus(retained, held, reversed, chargeback),
    effectiveEventIds,
  };
}

function projectionMatchesLifecycle(
  projection: PaidLotProjection,
  lifecycle: PaidLotLifecycleV1,
): boolean {
  return (
    serializeTokenSubunits(projection.retained) === lifecycle.retainedAmount &&
    serializeTokenSubunits(projection.held) === lifecycle.heldAmount &&
    serializeTokenSubunits(projection.reversed) === lifecycle.reversedAmount &&
    serializeTokenSubunits(projection.refunded) === lifecycle.refundedAmount &&
    serializeTokenSubunits(projection.chargeback) ===
      lifecycle.chargebackAmount &&
    serializeTokenSubunits(projection.oneTimeReversal) ===
      lifecycle.oneTimeReversalAmount &&
    projection.status === lifecycle.status &&
    projection.effectiveEventIds.length ===
      lifecycle.effectiveEventIds.length &&
    projection.effectiveEventIds.every(
      (eventId, index) => eventId === lifecycle.effectiveEventIds[index],
    )
  );
}

/** Validates and deterministically rebuilds retained paid-lot arithmetic. */
export function assertPaidLotLifecycle(
  lifecycle: PaidLotLifecycleV1,
): void {
  economyAssert(
    Number.isSafeInteger(lifecycle.version) &&
      lifecycle.version === lifecycle.receipts.length + 1,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle version must match its receipt count",
  );
  const projection = projectPaidLot(
    immutableFactsFromLifecycle(lifecycle),
    lifecycle.receipts,
  );
  economyAssert(
    projectionMatchesLifecycle(projection, lifecycle),
    "INVALID_CONTRACT",
    "Paid-lot lifecycle does not match its immutable event rebuild",
  );
}

/** Creates the retained projection for one newly credited paid source lot. */
export function createPaidLotLifecycle(
  lot: SourceLotV1,
  provenance: PaidLotPurchaseProvenanceV1,
): PaidLotLifecycleV1 {
  assertSourceLot(lot);
  assertPaidLotPurchaseProvenance(provenance);
  economyAssert(
    lot.payerAccountId !== undefined && lot.householdId !== undefined,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle requires payer and receiving-household provenance",
  );
  economyAssert(
    lot.refundState === "none" &&
      parseTokenSubunits(lot.heldAmount) === 0n &&
      parseTokenSubunits(lot.reversedAmount) === 0n,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle must be created before any refund or dispute movement",
  );
  economyAssert(
    parseIsoTimestamp(provenance.purchasedAt) <=
      parseIsoTimestamp(lot.settledAt),
    "INVALID_TIME_WINDOW",
    "Paid purchase time cannot follow settlement",
  );
  const facts: PaidLotImmutableFacts = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    lotId: lot.lotId,
    payerAccountId: lot.payerAccountId,
    receivingHouseholdId: lot.householdId,
    purchaseId: provenance.purchaseId,
    catalogVersion: provenance.catalogVersion,
    purchasedAt: provenance.purchasedAt,
    settledAt: lot.settledAt,
    creditedAt: lot.creditedAt,
    originalAmount: lot.originalAmount,
  };
  const projection = projectPaidLot(facts, []);
  const lifecycle: PaidLotLifecycleV1 = {
    ...facts,
    retainedAmount: serializeTokenSubunits(projection.retained),
    heldAmount: serializeTokenSubunits(projection.held),
    reversedAmount: serializeTokenSubunits(projection.reversed),
    refundedAmount: serializeTokenSubunits(projection.refunded),
    chargebackAmount: serializeTokenSubunits(projection.chargeback),
    oneTimeReversalAmount: serializeTokenSubunits(
      projection.oneTimeReversal,
    ),
    status: projection.status,
    version: 1,
    receipts: [],
    effectiveEventIds: [],
  };
  assertPaidLotLifecycle(lifecycle);
  return lifecycle;
}

/**
 * Appends one event then rebuilds every receipt in authoritative occurrence
 * order. Exact retries succeed before stale-version validation.
 */
export function applyPaidLotLifecycleEvent(
  lifecycle: PaidLotLifecycleV1,
  event: PaidLotLifecycleEventV1,
  expectedVersion: number,
): PaidLotLifecycleMutationResultV1 {
  assertPaidLotLifecycle(lifecycle);
  assertPaidLotLifecycleEvent(event);
  economyAssert(
    event.lotId === lifecycle.lotId,
    "INVALID_CONTRACT",
    "Paid-lot event belongs to another source lot",
  );
  const replay = lifecycle.receipts.find(
    (receipt) => receipt.event.eventId === event.eventId,
  );
  if (replay !== undefined) {
    economyAssert(
      sameEvent(replay.event, event),
      "DUPLICATE_IDENTIFIER",
      "Paid-lot event ID was reused with different facts",
    );
    return {
      lifecycle,
      applied: false,
      stateChanged: false,
      arithmetic: ZERO_ARITHMETIC,
    };
  }
  economyAssert(
    expectedVersion === lifecycle.version,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle event has a stale expected version",
  );

  const receipts: readonly PaidLotLifecycleReceiptV1[] = [
    ...lifecycle.receipts,
    { schemaVersion: ECONOMY_CONTRACT_VERSION, event },
  ];
  const projection = projectPaidLot(
    immutableFactsFromLifecycle(lifecycle),
    receipts,
  );
  const before = {
    retained: parseTokenSubunits(lifecycle.retainedAmount),
    held: parseTokenSubunits(lifecycle.heldAmount),
    reversed: parseTokenSubunits(lifecycle.reversedAmount),
    refunded: parseTokenSubunits(lifecycle.refundedAmount),
    chargeback: parseTokenSubunits(lifecycle.chargebackAmount),
    oneTimeReversal: parseTokenSubunits(lifecycle.oneTimeReversalAmount),
  };
  const next: PaidLotLifecycleV1 = {
    ...lifecycle,
    retainedAmount: serializeTokenSubunits(projection.retained),
    heldAmount: serializeTokenSubunits(projection.held),
    reversedAmount: serializeTokenSubunits(projection.reversed),
    refundedAmount: serializeTokenSubunits(projection.refunded),
    chargebackAmount: serializeTokenSubunits(projection.chargeback),
    oneTimeReversalAmount: serializeTokenSubunits(
      projection.oneTimeReversal,
    ),
    status: projection.status,
    version: lifecycle.version + 1,
    receipts,
    effectiveEventIds: projection.effectiveEventIds,
  };
  assertPaidLotLifecycle(next);
  const arithmetic: PaidLotLifecycleArithmeticV1 = {
    retainedDelta: serializeTokenSubunits(
      projection.retained - before.retained,
    ),
    heldDelta: serializeTokenSubunits(projection.held - before.held),
    reversedDelta: serializeTokenSubunits(
      projection.reversed - before.reversed,
    ),
    refundedDelta: serializeTokenSubunits(
      projection.refunded - before.refunded,
    ),
    chargebackDelta: serializeTokenSubunits(
      projection.chargeback - before.chargeback,
    ),
    oneTimeReversalDelta: serializeTokenSubunits(
      projection.oneTimeReversal - before.oneTimeReversal,
    ),
  };
  return {
    lifecycle: next,
    applied: true,
    stateChanged: Object.values(arithmetic).some((delta) => delta !== "0"),
    arithmetic,
  };
}

/** Reduces unordered/retried lifecycle evidence in canonical event order. */
export function reducePaidLotLifecycleEvents(
  initial: PaidLotLifecycleV1,
  events: readonly PaidLotLifecycleEventV1[],
): PaidLotLifecycleV1 {
  assertPaidLotLifecycle(initial);
  const unique = new Map<string, PaidLotLifecycleEventV1>();
  for (const event of events) {
    assertPaidLotLifecycleEvent(event);
    const existing = unique.get(event.eventId);
    if (existing !== undefined) {
      economyAssert(
        sameEvent(existing, event),
        "DUPLICATE_IDENTIFIER",
        "Paid-lot event ID was reused with different facts",
      );
    } else {
      unique.set(event.eventId, event);
    }
  }
  let lifecycle = initial;
  for (const event of [...unique.values()].sort(compareEvents)) {
    lifecycle = applyPaidLotLifecycleEvent(
      lifecycle,
      event,
      lifecycle.version,
    ).lifecycle;
  }
  return lifecycle;
}

/** Creates the exact retained-basis input used by early-backer evaluators. */
export function createEarlyBackerRetentionFromPaidLot(
  lifecycle: PaidLotLifecycleV1,
): PaidLotRetentionV1 {
  assertPaidLotLifecycle(lifecycle);
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    lotId: lifecycle.lotId,
    payerAccountId: lifecycle.payerAccountId,
    receivingHouseholdId: lifecycle.receivingHouseholdId,
    purchaseId: lifecycle.purchaseId,
    catalogVersion: lifecycle.catalogVersion,
    purchasedAt: lifecycle.purchasedAt,
    settledAt: lifecycle.settledAt,
    creditedAt: lifecycle.creditedAt,
    retainedAmount: lifecycle.retainedAmount,
  };
}
