import type { TokenPackV1, PurchaseIntentV1 } from "./acquisition.js";
import { assertPurchaseIntentBinding } from "./acquisition.js";
import { compareUnicodeCodeUnits } from "./canonical-order.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type EconomyContractVersion,
  type IsoTimestamp,
} from "./contracts.js";
import { economyAssert } from "./errors.js";

export type PurchaseIntentTransitionTypeV1 =
  | "checkout-bound"
  | "payment-observed"
  | "credit-recorded"
  | "expire"
  | "cancel"
  | "dispute-opened"
  | "dispute-won"
  | "dispute-lost";

export type PurchaseIntentDisputeDispositionV1 =
  | "none"
  | "open"
  | "won"
  | "lost";

/** Provider-neutral evidence for one requested purchase-intent transition. */
export interface PurchaseIntentTransitionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transitionId: string;
  readonly intentId: string;
  readonly transitionType: PurchaseIntentTransitionTypeV1;
  readonly occurredAt: IsoTimestamp;
  /** Sanitized binding; raw provider checkout references are adapter concerns. */
  readonly providerCheckoutReferenceHash?: string;
}

export interface PurchaseIntentTransitionReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly transition: PurchaseIntentTransitionV1;
  readonly effect: "state-changed" | "ignored";
}

/**
 * Versioned lifecycle projection. Receipts make retries deterministic while the
 * stable `creditRecorded` bit prevents a second credit from a different event.
 */
export interface PurchaseIntentLifecycleV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly intent: PurchaseIntentV1;
  readonly version: number;
  readonly creditRecorded: boolean;
  readonly disputeDisposition: PurchaseIntentDisputeDispositionV1;
  readonly receipts: readonly PurchaseIntentTransitionReceiptV1[];
}

/** Stable instruction identity for the one permitted purchase credit. */
export interface PurchaseCreditInstructionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly intentId: string;
  readonly transitionId: string;
  readonly idempotencyKey: string;
}

export interface PurchaseIntentTransitionResultV1 {
  readonly lifecycle: PurchaseIntentLifecycleV1;
  /** False only for an exact transition-ID replay already in `receipts`. */
  readonly recorded: boolean;
  readonly stateChanged: boolean;
  readonly creditInstruction?: PurchaseCreditInstructionV1;
}

export interface PurchaseIntentReductionV1 {
  readonly lifecycle: PurchaseIntentLifecycleV1;
  readonly creditInstructions: readonly PurchaseCreditInstructionV1[];
}

const TRANSITION_TYPES: readonly PurchaseIntentTransitionTypeV1[] = [
  "checkout-bound",
  "payment-observed",
  "credit-recorded",
  "expire",
  "cancel",
  "dispute-opened",
  "dispute-won",
  "dispute-lost",
];

const TRANSITION_PRECEDENCE: Readonly<
  Record<PurchaseIntentTransitionTypeV1, number>
> = {
  "checkout-bound": 0,
  "payment-observed": 1,
  "credit-recorded": 2,
  "dispute-opened": 3,
  "dispute-won": 4,
  "dispute-lost": 4,
  cancel: 5,
  expire: 6,
};

function assertCheckoutHash(value: string): void {
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    "Checkout references must be stored as sanitized SHA-256 hashes",
  );
}

/** Validates one provider-neutral purchase-intent transition envelope. */
export function assertPurchaseIntentTransition(
  transition: PurchaseIntentTransitionV1,
): void {
  economyAssert(
    transition.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-intent transition contract version",
  );
  assertEconomyIdentifier(transition.transitionId, "transitionId");
  assertEconomyIdentifier(transition.intentId, "intentId");
  economyAssert(
    TRANSITION_TYPES.includes(transition.transitionType),
    "INVALID_CONTRACT",
    "Purchase-intent transition type is unsupported",
  );
  parseIsoTimestamp(transition.occurredAt);
  if (transition.providerCheckoutReferenceHash !== undefined) {
    assertCheckoutHash(transition.providerCheckoutReferenceHash);
  }
  const requiresCheckoutHash =
    transition.transitionType === "checkout-bound" ||
    transition.transitionType === "payment-observed";
  economyAssert(
    requiresCheckoutHash ===
      (transition.providerCheckoutReferenceHash !== undefined),
    "INVALID_CONTRACT",
    "Only checkout and payment transitions must carry a checkout binding",
  );
}

function sameTransition(
  left: PurchaseIntentTransitionV1,
  right: PurchaseIntentTransitionV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.transitionId === right.transitionId &&
    left.intentId === right.intentId &&
    left.transitionType === right.transitionType &&
    left.occurredAt === right.occurredAt &&
    left.providerCheckoutReferenceHash ===
      right.providerCheckoutReferenceHash
  );
}

/** Validates a complete purchase-intent lifecycle projection. */
export function assertPurchaseIntentLifecycle(
  lifecycle: PurchaseIntentLifecycleV1,
  pack: TokenPackV1,
): void {
  economyAssert(
    lifecycle.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-intent lifecycle contract version",
  );
  assertPurchaseIntentBinding(lifecycle.intent, pack);
  economyAssert(
    Number.isSafeInteger(lifecycle.version) &&
      lifecycle.version === lifecycle.receipts.length + 1,
    "INVALID_CONTRACT",
    "Purchase-intent lifecycle version must match its receipt count",
  );
  economyAssert(
    ["none", "open", "won", "lost"].includes(
      lifecycle.disputeDisposition,
    ),
    "INVALID_CONTRACT",
    "Purchase-intent dispute disposition is unsupported",
  );
  economyAssert(
    lifecycle.creditRecorded ===
      (lifecycle.intent.status === "credited" ||
        lifecycle.intent.status === "disputed"),
    "INVALID_CONTRACT",
    "Purchase-intent credit projection is inconsistent with its status",
  );
  economyAssert(
    lifecycle.intent.status === "disputed"
      ? lifecycle.disputeDisposition === "open" ||
          lifecycle.disputeDisposition === "lost"
      : lifecycle.disputeDisposition !== "open" &&
          lifecycle.disputeDisposition !== "lost",
    "INVALID_CONTRACT",
    "Purchase-intent dispute projection is inconsistent with its status",
  );
  const transitionIds = new Set<string>();
  for (const receipt of lifecycle.receipts) {
    economyAssert(
      receipt.schemaVersion === ECONOMY_CONTRACT_VERSION &&
        (receipt.effect === "state-changed" || receipt.effect === "ignored"),
      "INVALID_CONTRACT",
      "Purchase-intent receipt is invalid",
    );
    assertPurchaseIntentTransition(receipt.transition);
    economyAssert(
      receipt.transition.intentId === lifecycle.intent.intentId &&
        !transitionIds.has(receipt.transition.transitionId),
      "DUPLICATE_IDENTIFIER",
      "Purchase-intent receipts must be unique and belong to the intent",
    );
    transitionIds.add(receipt.transition.transitionId);
  }
}

/** Creates a versioned lifecycle around an existing valid V1 purchase intent. */
export function createPurchaseIntentLifecycle(
  intent: PurchaseIntentV1,
  pack: TokenPackV1,
): PurchaseIntentLifecycleV1 {
  assertPurchaseIntentBinding(intent, pack);
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    intent,
    version: 1,
    creditRecorded:
      intent.status === "credited" || intent.status === "disputed",
    disputeDisposition: intent.status === "disputed" ? "open" : "none",
    receipts: [],
  };
}

function withRecordedReceipt(
  lifecycle: PurchaseIntentLifecycleV1,
  transition: PurchaseIntentTransitionV1,
  intent: PurchaseIntentV1,
  disputeDisposition: PurchaseIntentDisputeDispositionV1,
  stateChanged: boolean,
): PurchaseIntentLifecycleV1 {
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    intent,
    version: lifecycle.version + 1,
    creditRecorded:
      intent.status === "credited" || intent.status === "disputed",
    disputeDisposition,
    receipts: [
      ...lifecycle.receipts,
      {
        schemaVersion: ECONOMY_CONTRACT_VERSION,
        transition,
        effect: stateChanged ? "state-changed" : "ignored",
      },
    ],
  };
}

function assertMatchingCheckoutBinding(
  intent: PurchaseIntentV1,
  checkoutHash: string,
): void {
  economyAssert(
    intent.providerCheckoutReferenceHash === undefined ||
      intent.providerCheckoutReferenceHash === checkoutHash,
    "INVALID_CONTRACT",
    "Purchase-intent transition conflicts with its checkout binding",
  );
}

/**
 * Applies and records one event using compare-and-swap semantics. Exact event
 * retries succeed even with a stale expected version; conflicting reuse fails.
 */
export function applyPurchaseIntentTransition(
  lifecycle: PurchaseIntentLifecycleV1,
  transition: PurchaseIntentTransitionV1,
  expectedVersion: number,
  pack: TokenPackV1,
): PurchaseIntentTransitionResultV1 {
  assertPurchaseIntentLifecycle(lifecycle, pack);
  assertPurchaseIntentTransition(transition);
  economyAssert(
    transition.intentId === lifecycle.intent.intentId,
    "INVALID_CONTRACT",
    "Purchase-intent transition belongs to another intent",
  );
  const replay = lifecycle.receipts.find(
    (receipt) =>
      receipt.transition.transitionId === transition.transitionId,
  );
  if (replay !== undefined) {
    economyAssert(
      sameTransition(replay.transition, transition),
      "DUPLICATE_IDENTIFIER",
      "Purchase-intent transition ID was reused with different facts",
    );
    return { lifecycle, recorded: false, stateChanged: false };
  }
  economyAssert(
    expectedVersion === lifecycle.version,
    "INVALID_CONTRACT",
    "Purchase-intent transition has a stale expected version",
  );

  const eventTime = parseIsoTimestamp(transition.occurredAt);
  const createdAt = parseIsoTimestamp(lifecycle.intent.createdAt);
  const expiresAt = parseIsoTimestamp(lifecycle.intent.expiresAt);
  economyAssert(
    eventTime >= createdAt,
    "INVALID_TIME_WINDOW",
    "Purchase-intent transition cannot precede intent creation",
  );

  let intent = lifecycle.intent;
  let disputeDisposition = lifecycle.disputeDisposition;
  let stateChanged = false;
  let creditInstruction: PurchaseCreditInstructionV1 | undefined;

  if (transition.transitionType === "checkout-bound") {
    const checkoutHash = transition.providerCheckoutReferenceHash!;
    assertMatchingCheckoutBinding(intent, checkoutHash);
    if (intent.status === "created") {
      economyAssert(
        eventTime < expiresAt,
        "INVALID_TIME_WINDOW",
        "Checkout cannot be bound after purchase-intent expiry",
      );
      intent = {
        ...intent,
        status: "checkout-created",
        providerCheckoutReferenceHash: checkoutHash,
      };
      stateChanged = true;
    } else {
      economyAssert(
        !["expired", "cancelled"].includes(intent.status),
        "INVALID_CONTRACT",
        "A terminal purchase intent cannot bind a checkout",
      );
    }
  } else if (transition.transitionType === "payment-observed") {
    const checkoutHash = transition.providerCheckoutReferenceHash!;
    assertMatchingCheckoutBinding(intent, checkoutHash);
    if (intent.status === "created") {
      economyAssert(
        eventTime < expiresAt,
        "INVALID_TIME_WINDOW",
        "An unbound payment cannot occur after purchase-intent expiry",
      );
      intent = {
        ...intent,
        status: "paid-unreconciled",
        providerCheckoutReferenceHash: checkoutHash,
      };
      stateChanged = true;
    } else if (intent.status === "checkout-created") {
      intent = { ...intent, status: "paid-unreconciled" };
      stateChanged = true;
    } else {
      economyAssert(
        !["expired", "cancelled"].includes(intent.status),
        "INVALID_CONTRACT",
        "A terminal purchase intent cannot observe payment",
      );
    }
  } else if (transition.transitionType === "credit-recorded") {
    if (intent.status === "paid-unreconciled") {
      economyAssert(
        !lifecycle.creditRecorded,
        "INVALID_CONTRACT",
        "Purchase intent has an inconsistent prior credit",
      );
      intent = { ...intent, status: "credited" };
      disputeDisposition = "none";
      stateChanged = true;
      creditInstruction = {
        schemaVersion: ECONOMY_CONTRACT_VERSION,
        intentId: intent.intentId,
        transitionId: transition.transitionId,
        idempotencyKey: intent.intentId,
      };
    } else {
      economyAssert(
        lifecycle.creditRecorded,
        "INVALID_CONTRACT",
        "Purchase intent cannot be credited before authoritative payment",
      );
    }
  } else if (transition.transitionType === "dispute-opened") {
    if (
      intent.status === "credited" &&
      disputeDisposition === "none"
    ) {
      intent = { ...intent, status: "disputed" };
      disputeDisposition = "open";
      stateChanged = true;
    } else {
      economyAssert(
        intent.status === "disputed" && disputeDisposition === "open",
        "INVALID_CONTRACT",
        "Dispute can open only once after purchase credit",
      );
    }
  } else if (transition.transitionType === "dispute-won") {
    if (
      intent.status === "disputed" &&
      disputeDisposition === "open"
    ) {
      intent = { ...intent, status: "credited" };
      disputeDisposition = "won";
      stateChanged = true;
    } else {
      economyAssert(
        intent.status === "credited" && disputeDisposition === "won",
        "INVALID_CONTRACT",
        "Dispute-win transition requires one open dispute",
      );
    }
  } else if (transition.transitionType === "dispute-lost") {
    if (
      intent.status === "disputed" &&
      disputeDisposition === "open"
    ) {
      disputeDisposition = "lost";
      stateChanged = true;
    } else {
      economyAssert(
        intent.status === "disputed" && disputeDisposition === "lost",
        "INVALID_CONTRACT",
        "Dispute-loss transition requires one open dispute",
      );
    }
  } else if (transition.transitionType === "cancel") {
    if (intent.status === "created" || intent.status === "checkout-created") {
      intent = { ...intent, status: "cancelled" };
      stateChanged = true;
    }
  } else {
    economyAssert(
      eventTime >= expiresAt,
      "INVALID_TIME_WINDOW",
      "Expiry transition cannot precede purchase-intent expiry",
    );
    if (intent.status === "created" || intent.status === "checkout-created") {
      intent = { ...intent, status: "expired" };
      stateChanged = true;
    }
  }

  const nextLifecycle = withRecordedReceipt(
    lifecycle,
    transition,
    intent,
    disputeDisposition,
    stateChanged,
  );
  assertPurchaseIntentLifecycle(nextLifecycle, pack);
  return {
    lifecycle: nextLifecycle,
    recorded: true,
    stateChanged,
    ...(creditInstruction === undefined ? {} : { creditInstruction }),
  };
}

function compareTransitions(
  left: PurchaseIntentTransitionV1,
  right: PurchaseIntentTransitionV1,
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

/**
 * Reduces an unordered delivery batch in canonical event-time/type/ID order.
 * Exact duplicate IDs collapse; conflicting duplicate facts are rejected.
 */
export function reducePurchaseIntentTransitions(
  intent: PurchaseIntentV1,
  transitions: readonly PurchaseIntentTransitionV1[],
  pack: TokenPackV1,
): PurchaseIntentReductionV1 {
  const unique = new Map<string, PurchaseIntentTransitionV1>();
  for (const transition of transitions) {
    assertPurchaseIntentTransition(transition);
    const existing = unique.get(transition.transitionId);
    if (existing !== undefined) {
      economyAssert(
        sameTransition(existing, transition),
        "DUPLICATE_IDENTIFIER",
        "Purchase-intent transition ID was reused with different facts",
      );
    } else {
      unique.set(transition.transitionId, transition);
    }
  }

  let lifecycle = createPurchaseIntentLifecycle(intent, pack);
  const creditInstructions: PurchaseCreditInstructionV1[] = [];
  for (const transition of [...unique.values()].sort(compareTransitions)) {
    const result = applyPurchaseIntentTransition(
      lifecycle,
      transition,
      lifecycle.version,
      pack,
    );
    lifecycle = result.lifecycle;
    if (result.creditInstruction !== undefined) {
      creditInstructions.push(result.creditInstruction);
    }
  }
  economyAssert(
    creditInstructions.length <= 1,
    "DUPLICATE_TRANSACTION",
    "Purchase-intent reduction produced more than one credit",
  );
  return { lifecycle, creditInstructions };
}
