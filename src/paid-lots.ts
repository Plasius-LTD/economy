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
 * Retained paid-lot projection. Holds do not reduce retained backer basis;
 * refunds, lost disputes, chargebacks, and the one-time reversal do.
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
}

/** Exact signed deltas produced by one lifecycle event. */
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
  readonly arithmetic: PaidLotLifecycleArithmeticV1;
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

/** Validates the complete retained paid-lot arithmetic projection. */
export function assertPaidLotLifecycle(
  lifecycle: PaidLotLifecycleV1,
): void {
  economyAssert(
    lifecycle.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported paid-lot lifecycle contract version",
  );
  assertEconomyIdentifier(lifecycle.lotId, "lotId");
  assertEconomyIdentifier(lifecycle.payerAccountId, "payerAccountId");
  assertEconomyIdentifier(
    lifecycle.receivingHouseholdId,
    "receivingHouseholdId",
  );
  assertEconomyIdentifier(lifecycle.purchaseId, "purchaseId");
  assertEconomyIdentifier(lifecycle.catalogVersion, "catalogVersion");
  const purchasedAt = parseIsoTimestamp(lifecycle.purchasedAt);
  const settledAt = parseIsoTimestamp(lifecycle.settledAt);
  const creditedAt = parseIsoTimestamp(lifecycle.creditedAt);
  economyAssert(
    purchasedAt <= settledAt && settledAt <= creditedAt,
    "INVALID_TIME_WINDOW",
    "Paid-lot timestamps must follow purchase, settlement, then credit order",
  );
  economyAssert(
    Number.isSafeInteger(lifecycle.version) &&
      lifecycle.version === lifecycle.receipts.length + 1,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle version must match its receipt count",
  );

  const original = parseTokenSubunits(lifecycle.originalAmount);
  const retained = parseTokenSubunits(lifecycle.retainedAmount);
  const held = parseTokenSubunits(lifecycle.heldAmount);
  const reversed = parseTokenSubunits(lifecycle.reversedAmount);
  const refunded = parseTokenSubunits(lifecycle.refundedAmount);
  const chargeback = parseTokenSubunits(lifecycle.chargebackAmount);
  const oneTimeReversal = parseTokenSubunits(
    lifecycle.oneTimeReversalAmount,
  );
  economyAssert(
    original > 0n &&
      retained >= 0n &&
      held >= 0n &&
      reversed >= 0n &&
      refunded >= 0n &&
      chargeback >= 0n &&
      oneTimeReversal >= 0n,
    "INVALID_AMOUNT",
    "Paid-lot lifecycle amounts must be non-negative",
  );
  economyAssert(
    retained + reversed === original &&
      held <= retained &&
      refunded + chargeback + oneTimeReversal === reversed,
    "INVALID_CONTRACT",
    "Paid-lot retained, held, and reversal components are inconsistent",
  );
  economyAssert(
    lifecycle.status ===
      deriveStatus(retained, held, reversed, chargeback),
    "INVALID_CONTRACT",
    "Paid-lot lifecycle status is inconsistent with its arithmetic",
  );

  const eventIds = new Set<string>();
  let reversalReceipts = 0;
  let projectedHeld = 0n;
  let projectedRefunded = 0n;
  let projectedChargeback = 0n;
  let projectedOneTimeReversal = 0n;
  for (const receipt of lifecycle.receipts) {
    economyAssert(
      receipt.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported paid-lot receipt contract version",
    );
    assertPaidLotLifecycleEvent(receipt.event);
    economyAssert(
      receipt.event.lotId === lifecycle.lotId &&
        !eventIds.has(receipt.event.eventId),
      "DUPLICATE_IDENTIFIER",
      "Paid-lot receipts must be unique and belong to the lifecycle lot",
    );
    eventIds.add(receipt.event.eventId);
    const eventAmount = parseTokenSubunits(receipt.event.amount);
    if (receipt.event.eventType === "reversal") {
      reversalReceipts += 1;
      projectedOneTimeReversal += eventAmount;
    } else if (receipt.event.eventType === "refund") {
      projectedRefunded += eventAmount;
    } else if (receipt.event.eventType === "chargeback") {
      projectedChargeback += eventAmount;
    } else if (receipt.event.eventType === "dispute-hold") {
      projectedHeld += eventAmount;
    } else if (receipt.event.eventType === "dispute-won") {
      projectedHeld -= eventAmount;
    } else {
      projectedHeld -= eventAmount;
      projectedChargeback += eventAmount;
    }
    economyAssert(
      projectedHeld >= 0n,
      "INVALID_CONTRACT",
      "Paid-lot receipt history cannot release more than it held",
    );
  }
  economyAssert(
    reversalReceipts <= 1 &&
      (oneTimeReversal > 0n) === (reversalReceipts === 1),
    "REVERSAL_ALREADY_EXISTS",
    "Paid-lot lifecycle permits exactly one recorded one-time reversal",
  );
  economyAssert(
    projectedHeld === held &&
      projectedRefunded === refunded &&
      projectedChargeback === chargeback &&
      projectedOneTimeReversal === oneTimeReversal,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle amounts must rebuild exactly from receipts",
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
  const lifecycle: PaidLotLifecycleV1 = {
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
    retainedAmount: lot.originalAmount,
    heldAmount: serializeTokenSubunits(0n),
    reversedAmount: serializeTokenSubunits(0n),
    refundedAmount: serializeTokenSubunits(0n),
    chargebackAmount: serializeTokenSubunits(0n),
    oneTimeReversalAmount: serializeTokenSubunits(0n),
    status: "clear",
    version: 1,
    receipts: [],
  };
  assertPaidLotLifecycle(lifecycle);
  return lifecycle;
}

/** Applies one compare-and-swap lifecycle event or returns an exact replay. */
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
    return { lifecycle, applied: false, arithmetic: ZERO_ARITHMETIC };
  }
  economyAssert(
    expectedVersion === lifecycle.version,
    "INVALID_CONTRACT",
    "Paid-lot lifecycle event has a stale expected version",
  );
  economyAssert(
    parseIsoTimestamp(event.occurredAt) >=
      parseIsoTimestamp(lifecycle.creditedAt),
    "INVALID_TIME_WINDOW",
    "Paid-lot lifecycle event cannot precede credit",
  );

  const amount = parseTokenSubunits(event.amount);
  let retained = parseTokenSubunits(lifecycle.retainedAmount);
  let held = parseTokenSubunits(lifecycle.heldAmount);
  let reversed = parseTokenSubunits(lifecycle.reversedAmount);
  let refunded = parseTokenSubunits(lifecycle.refundedAmount);
  let chargeback = parseTokenSubunits(lifecycle.chargebackAmount);
  let oneTimeReversal = parseTokenSubunits(
    lifecycle.oneTimeReversalAmount,
  );
  const before = {
    retained,
    held,
    reversed,
    refunded,
    chargeback,
    oneTimeReversal,
  };

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
      economyAssert(
        oneTimeReversal === 0n,
        "REVERSAL_ALREADY_EXISTS",
        "Paid source lot already has its one-time reversal",
      );
      oneTimeReversal += amount;
    } else if (event.eventType === "refund") {
      refunded += amount;
    } else {
      chargeback += amount;
    }
    retained -= amount;
    reversed += amount;
  }

  const next: PaidLotLifecycleV1 = {
    ...lifecycle,
    retainedAmount: serializeTokenSubunits(retained),
    heldAmount: serializeTokenSubunits(held),
    reversedAmount: serializeTokenSubunits(reversed),
    refundedAmount: serializeTokenSubunits(refunded),
    chargebackAmount: serializeTokenSubunits(chargeback),
    oneTimeReversalAmount: serializeTokenSubunits(oneTimeReversal),
    status: deriveStatus(retained, held, reversed, chargeback),
    version: lifecycle.version + 1,
    receipts: [
      ...lifecycle.receipts,
      { schemaVersion: ECONOMY_CONTRACT_VERSION, event },
    ],
  };
  assertPaidLotLifecycle(next);
  return {
    lifecycle: next,
    applied: true,
    arithmetic: {
      retainedDelta: serializeTokenSubunits(retained - before.retained),
      heldDelta: serializeTokenSubunits(held - before.held),
      reversedDelta: serializeTokenSubunits(reversed - before.reversed),
      refundedDelta: serializeTokenSubunits(refunded - before.refunded),
      chargebackDelta: serializeTokenSubunits(
        chargeback - before.chargeback,
      ),
      oneTimeReversalDelta: serializeTokenSubunits(
        oneTimeReversal - before.oneTimeReversal,
      ),
    },
  };
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
