import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BASELINE_GBP_TOKEN_PACKS,
  BASELINE_PURCHASE_LIMIT_POLICY,
  applyPaidLotLifecycleEvent,
  applyPurchaseIntentTransition,
  calculateRollingPurchaseCapUsage,
  createEarlyBackerRetentionFromPaidLot,
  createPaidLotLifecycle,
  createPurchaseIntentLifecycle,
  createRollingPurchaseCapState,
  parseGbpMinorUnits,
  reducePaidLotLifecycleEvents,
  reducePurchaseIntentTransitions,
  reserveRollingPurchaseCaps,
  serializeGbpMinorUnits,
  serializeTokenSubunits,
  transitionRollingPurchaseCapReservation,
  type PaidLotLifecycleEventV1,
  type PaidLotPurchaseProvenanceV1,
  type PurchaseCapReservationTransitionV1,
  type PurchaseIntentTransitionV1,
  type PurchaseIntentV1,
  type ReservePurchaseCapsCommandV1,
  type RollingPurchaseCapStateV1,
  type SourceLotV1,
  type TokenPackV1,
} from "../src/index.js";

const pack = BASELINE_GBP_TOKEN_PACKS[0] as TokenPackV1;
const checkoutHash = `sha256:${"b".repeat(64)}`;

function purchaseIntent(
  overrides: Partial<PurchaseIntentV1> = {},
): PurchaseIntentV1 {
  return {
    schemaVersion: "1",
    intentId: "intent:paid:1",
    payerAccountId: "account:payer:1",
    receivingHouseholdId: "household:1",
    receivingWalletId: "wallet:treasury:1",
    packId: pack.packId,
    catalogVersion: pack.catalogVersion,
    expectedCurrency: "GBP",
    expectedPriceMinorUnits: pack.priceMinorUnits,
    grantAmount: pack.grantAmount,
    status: "created",
    createdAt: "2026-07-16T10:00:00.000Z",
    expiresAt: "2026-07-16T10:15:00.000Z",
    ...overrides,
  };
}

function intentTransition(
  transitionType: PurchaseIntentTransitionV1["transitionType"],
  transitionId: string,
  occurredAt: string,
): PurchaseIntentTransitionV1 {
  const bound =
    transitionType === "checkout-bound" ||
    transitionType === "payment-observed";
  return {
    schemaVersion: "1",
    transitionId,
    intentId: "intent:paid:1",
    transitionType,
    occurredAt,
    ...(bound ? { providerCheckoutReferenceHash: checkoutHash } : {}),
  };
}

describe("purchase-intent lifecycle invariants", () => {
  const checkout = intentTransition(
    "checkout-bound",
    "event:checkout",
    "2026-07-16T10:01:00.000Z",
  );
  const paid = intentTransition(
    "payment-observed",
    "event:paid",
    "2026-07-16T10:02:00.000Z",
  );
  const credited = intentTransition(
    "credit-recorded",
    "event:credit",
    "2026-07-16T10:03:00.000Z",
  );

  it("reduces out-of-order retries to one stable credit instruction", () => {
    const result = reducePurchaseIntentTransitions(
      purchaseIntent(),
      [credited, paid, checkout, paid, credited, checkout],
      pack,
    );
    expect(result.lifecycle.intent).toMatchObject({
      status: "credited",
      providerCheckoutReferenceHash: checkoutHash,
    });
    expect(result.lifecycle.receipts.map((receipt) => receipt.transition.transitionId)).toEqual([
      "event:checkout",
      "event:paid",
      "event:credit",
    ]);
    expect(result.creditInstructions).toEqual([
      {
        schemaVersion: "1",
        intentId: "intent:paid:1",
        transitionId: "event:credit",
        idempotencyKey: "intent:paid:1",
      },
    ]);
  });

  it("records a distinct duplicate credit as ignored and never instructs twice", () => {
    const reduced = reducePurchaseIntentTransitions(
      purchaseIntent(),
      [checkout, paid, credited],
      pack,
    );
    const duplicateCredit = intentTransition(
      "credit-recorded",
      "event:credit:retry-with-new-id",
      "2026-07-16T10:04:00.000Z",
    );
    const result = applyPurchaseIntentTransition(
      reduced.lifecycle,
      duplicateCredit,
      reduced.lifecycle.version,
      pack,
    );
    expect(result).toMatchObject({
      recorded: true,
      stateChanged: false,
    });
    expect(result.creditInstruction).toBeUndefined();
    expect(result.lifecycle.intent.status).toBe("credited");
    expect(result.lifecycle.receipts.at(-1)?.effect).toBe("ignored");

    const exactReplay = applyPurchaseIntentTransition(
      result.lifecycle,
      duplicateCredit,
      1,
      pack,
    );
    expect(exactReplay).toMatchObject({
      lifecycle: result.lifecycle,
      recorded: false,
      stateChanged: false,
    });
  });

  it("rejects stale writers and conflicting duplicate transition IDs", () => {
    const lifecycle = createPurchaseIntentLifecycle(purchaseIntent(), pack);
    const afterCheckout = applyPurchaseIntentTransition(
      lifecycle,
      checkout,
      lifecycle.version,
      pack,
    ).lifecycle;
    expect(() =>
      applyPurchaseIntentTransition(afterCheckout, paid, 1, pack),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      reducePurchaseIntentTransitions(
        purchaseIntent(),
        [checkout, { ...checkout, occurredAt: "2026-07-16T10:02:00.000Z" }],
        pack,
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
  });

  it("expires an unpaid intent, ignores cancellation after payment, and rejects late unbound payment", () => {
    const expired = reducePurchaseIntentTransitions(
      purchaseIntent(),
      [
        intentTransition(
          "expire",
          "event:expire",
          "2026-07-16T10:15:00.000Z",
        ),
      ],
      pack,
    );
    expect(expired.lifecycle.intent.status).toBe("expired");

    const paidThenCancelled = reducePurchaseIntentTransitions(
      purchaseIntent(),
      [
        checkout,
        paid,
        intentTransition(
          "cancel",
          "event:cancel",
          "2026-07-16T10:03:00.000Z",
        ),
      ],
      pack,
    );
    expect(paidThenCancelled.lifecycle.intent.status).toBe(
      "paid-unreconciled",
    );
    expect(paidThenCancelled.lifecycle.receipts.at(-1)?.effect).toBe(
      "ignored",
    );

    expect(() =>
      reducePurchaseIntentTransitions(
        purchaseIntent(),
        [
          intentTransition(
            "payment-observed",
            "event:late-payment",
            "2026-07-16T10:16:00.000Z",
          ),
        ],
        pack,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
  });

  it("moves one credited intent through dispute open and win or loss", () => {
    const base = [checkout, paid, credited];
    const won = reducePurchaseIntentTransitions(
      purchaseIntent(),
      [
        ...base,
        intentTransition(
          "dispute-opened",
          "event:dispute",
          "2026-07-16T10:04:00.000Z",
        ),
        intentTransition(
          "dispute-won",
          "event:won",
          "2026-07-16T10:05:00.000Z",
        ),
      ],
      pack,
    );
    expect(won.lifecycle).toMatchObject({
      intent: { status: "credited" },
      creditRecorded: true,
      disputeDisposition: "won",
    });

    const lost = reducePurchaseIntentTransitions(
      purchaseIntent(),
      [
        ...base,
        intentTransition(
          "dispute-opened",
          "event:dispute",
          "2026-07-16T10:04:00.000Z",
        ),
        intentTransition(
          "dispute-lost",
          "event:lost",
          "2026-07-16T10:05:00.000Z",
        ),
      ],
      pack,
    );
    expect(lost.lifecycle).toMatchObject({
      intent: { status: "disputed" },
      creditRecorded: true,
      disputeDisposition: "lost",
    });
  });

  it("property: arbitrary retry multiplicity never produces another credit", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2 }), {
          minLength: 0,
          maxLength: 40,
        }),
        (retryIndexes) => {
          const base = [credited, paid, checkout];
          const events = [
            ...base,
            ...retryIndexes.map((index) => base[index]!),
          ];
          const result = reducePurchaseIntentTransitions(
            purchaseIntent(),
            events,
            pack,
          );
          expect(result.lifecycle.intent.status).toBe("credited");
          expect(result.creditInstructions).toHaveLength(1);
          expect(
            result.lifecycle.receipts.filter(
              (receipt) =>
                receipt.transition.transitionType === "credit-recorded" &&
                receipt.effect === "state-changed",
            ),
          ).toHaveLength(1);
        },
      ),
    );
  });
});

function capStates(): {
  payer: RollingPurchaseCapStateV1;
  household: RollingPurchaseCapStateV1;
} {
  return {
    payer: createRollingPurchaseCapState("payer", "account:payer:1"),
    household: createRollingPurchaseCapState("household", "household:1"),
  };
}

function reserveCommand(
  overrides: Partial<ReservePurchaseCapsCommandV1> = {},
): ReservePurchaseCapsCommandV1 {
  return {
    schemaVersion: "1",
    reservationId: "reservation:1",
    payerAccountId: "account:payer:1",
    householdId: "household:1",
    priceMinorUnits: serializeGbpMinorUnits(5_000n),
    reservedAt: "2026-07-16T10:00:00.000Z",
    expiresAt: "2026-07-16T10:15:00.000Z",
    expectedPayerVersion: 1,
    expectedHouseholdVersion: 1,
    ...overrides,
  };
}

function capTransition(
  transitionType: PurchaseCapReservationTransitionV1["transitionType"],
  occurredAt: string,
  overrides: Partial<PurchaseCapReservationTransitionV1> = {},
): PurchaseCapReservationTransitionV1 {
  return {
    schemaVersion: "1",
    transitionId: `transition:${transitionType}`,
    reservationId: "reservation:1",
    transitionType,
    occurredAt,
    ...overrides,
  };
}

describe("atomic rolling purchase caps", () => {
  it("reserves and replays the same amount in both aggregate scopes", () => {
    const { payer, household } = capStates();
    const command = reserveCommand();
    const reserved = reserveRollingPurchaseCaps(
      payer,
      household,
      command,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(reserved).toMatchObject({
      applied: true,
      payerState: { version: 2 },
      householdState: { version: 2 },
      payerUsageMinorUnits: "5000",
      householdUsageMinorUnits: "5000",
    });
    const replay = reserveRollingPurchaseCaps(
      reserved.payerState,
      reserved.householdState,
      command,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(replay.applied).toBe(false);
    expect(replay.payerState).toBe(reserved.payerState);
    expect(replay.householdState).toBe(reserved.householdState);
  });

  it("rejects stale concurrent reservations before transient overspend", () => {
    const { payer, household } = capStates();
    const first = reserveRollingPurchaseCaps(
      payer,
      household,
      reserveCommand(),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(() =>
      reserveRollingPurchaseCaps(
        first.payerState,
        first.householdState,
        reserveCommand({
          reservationId: "reservation:concurrent",
          expectedPayerVersion: 1,
          expectedHouseholdVersion: 1,
        }),
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    const second = reserveRollingPurchaseCaps(
      first.payerState,
      first.householdState,
      reserveCommand({
        reservationId: "reservation:2",
        expectedPayerVersion: 2,
        expectedHouseholdVersion: 2,
      }),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(second.payerUsageMinorUnits).toBe("10000");
    expect(() =>
      reserveRollingPurchaseCaps(
        second.payerState,
        second.householdState,
        reserveCommand({
          reservationId: "reservation:overspend",
          priceMinorUnits: serializeGbpMinorUnits(1n),
          expectedPayerVersion: 3,
          expectedHouseholdVersion: 3,
        }),
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_BALANCE" }));
  });

  it("releases and expires reservations atomically, then permits capacity reuse", () => {
    const { payer, household } = capStates();
    const reserved = reserveRollingPurchaseCaps(
      payer,
      household,
      reserveCommand(),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    const released = transitionRollingPurchaseCapReservation(
      reserved.payerState,
      reserved.householdState,
      capTransition("release", "2026-07-16T10:05:00.000Z"),
      2,
      2,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(released).toMatchObject({
      applied: true,
      reservation: { status: "released" },
      payerUsageMinorUnits: "0",
      householdUsageMinorUnits: "0",
    });
    const releaseReplay = transitionRollingPurchaseCapReservation(
      released.payerState,
      released.householdState,
      capTransition("release", "2026-07-16T10:05:00.000Z"),
      1,
      1,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(releaseReplay.applied).toBe(false);

    const newReservation = reserveRollingPurchaseCaps(
      released.payerState,
      released.householdState,
      reserveCommand({
        reservationId: "reservation:replacement",
        reservedAt: "2026-07-16T10:06:00.000Z",
        expiresAt: "2026-07-16T10:20:00.000Z",
        expectedPayerVersion: 3,
        expectedHouseholdVersion: 3,
      }),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(newReservation.payerUsageMinorUnits).toBe("5000");

    const expired = transitionRollingPurchaseCapReservation(
      newReservation.payerState,
      newReservation.householdState,
      capTransition("expire", "2026-07-16T10:20:00.000Z", {
        reservationId: "reservation:replacement",
      }),
      4,
      4,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(expired.reservation.status).toBe("expired");
    expect(expired.payerUsageMinorUnits).toBe("0");
  });

  it("settles within expiry, counts the rolling window, and replays original reserve", () => {
    const { payer, household } = capStates();
    const command = reserveCommand();
    const reserved = reserveRollingPurchaseCaps(
      payer,
      household,
      command,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    const settled = transitionRollingPurchaseCapReservation(
      reserved.payerState,
      reserved.householdState,
      capTransition("settle", "2026-07-16T10:02:00.000Z"),
      2,
      2,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(settled.reservation.status).toBe("settled");
    expect(
      calculateRollingPurchaseCapUsage(
        settled.payerState,
        "2026-08-14T10:02:00.000Z",
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toBe("5000");
    expect(
      calculateRollingPurchaseCapUsage(
        settled.payerState,
        "2026-08-16T10:02:00.000Z",
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toBe("0");
    const reserveReplay = reserveRollingPurchaseCaps(
      settled.payerState,
      settled.householdState,
      command,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(reserveReplay.applied).toBe(false);
    expect(reserveReplay.payerUsageMinorUnits).toBe("5000");
  });

  it("rejects over-order, early expiry, divergent mirrors, and conflicting reservation replays", () => {
    const { payer, household } = capStates();
    expect(() =>
      reserveRollingPurchaseCaps(
        payer,
        household,
        reserveCommand({ priceMinorUnits: serializeGbpMinorUnits(5_001n) }),
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_BALANCE" }));

    const reserved = reserveRollingPurchaseCaps(
      payer,
      household,
      reserveCommand(),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(() =>
      transitionRollingPurchaseCapReservation(
        reserved.payerState,
        reserved.householdState,
        capTransition("expire", "2026-07-16T10:14:59.999Z"),
        2,
        2,
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      reserveRollingPurchaseCaps(
        reserved.payerState,
        reserved.householdState,
        reserveCommand({ priceMinorUnits: serializeGbpMinorUnits(1_000n) }),
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
    expect(() =>
      reserveRollingPurchaseCaps(
        reserved.payerState,
        { ...reserved.householdState, reservations: [] },
        reserveCommand(),
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("property: exact minor-unit serialization round-trips within signed range", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 2n ** 63n - 1n }),
        (amount) => {
          expect(parseGbpMinorUnits(serializeGbpMinorUnits(amount))).toBe(
            amount,
          );
        },
      ),
    );
    for (const invalid of ["-1", "01", "1.0", "1e3", "", " 1"]) {
      expect(() => parseGbpMinorUnits(invalid)).toThrowError(
        expect.objectContaining({ code: "INVALID_AMOUNT" }),
      );
    }
    expect(() => serializeGbpMinorUnits(2n ** 63n)).toThrowError(
      expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }),
    );
  });

  it("does not permit a final transition ID to be reused for another reservation", () => {
    const { payer, household } = capStates();
    const first = reserveRollingPurchaseCaps(
      payer,
      household,
      reserveCommand(),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    const firstReleased = transitionRollingPurchaseCapReservation(
      first.payerState,
      first.householdState,
      capTransition("release", "2026-07-16T10:05:00.000Z"),
      2,
      2,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    const second = reserveRollingPurchaseCaps(
      firstReleased.payerState,
      firstReleased.householdState,
      reserveCommand({
        reservationId: "reservation:2",
        expectedPayerVersion: 3,
        expectedHouseholdVersion: 3,
      }),
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    const secondReleased = transitionRollingPurchaseCapReservation(
      second.payerState,
      second.householdState,
      capTransition("release", "2026-07-16T10:06:00.000Z", {
        reservationId: "reservation:2",
        transitionId: "transition:release:2",
      }),
      4,
      4,
      BASELINE_PURCHASE_LIMIT_POLICY,
    );
    expect(() =>
      transitionRollingPurchaseCapReservation(
        secondReleased.payerState,
        secondReleased.householdState,
        capTransition("release", "2026-07-16T10:05:00.000Z", {
          reservationId: "reservation:2",
        }),
        5,
        5,
        BASELINE_PURCHASE_LIMIT_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
  });
});

const sourceLot: SourceLotV1 = {
  schemaVersion: "1",
  lotId: "lot:paid:1",
  walletId: "wallet:treasury:1",
  beneficiaryAccountId: "account:payer:1",
  householdId: "household:1",
  payerAccountId: "account:payer:1",
  source: "shopify",
  rateVersion: "gbp-v1",
  settlementEvidenceHash: `sha256:${"a".repeat(64)}`,
  transferPolicy: "household-allocatable",
  refundState: "none",
  originalAmount: serializeTokenSubunits(10_000n),
  remainingAmount: serializeTokenSubunits(10_000n),
  heldAmount: serializeTokenSubunits(0n),
  reversedAmount: serializeTokenSubunits(0n),
  settledAt: "2026-07-16T10:01:00.000Z",
  creditedAt: "2026-07-16T10:02:00.000Z",
};

const provenance: PaidLotPurchaseProvenanceV1 = {
  schemaVersion: "1",
  purchaseId: "purchase:1",
  catalogVersion: "gbp-v1",
  purchasedAt: "2026-07-16T10:00:00.000Z",
};

function paidLotEvent(
  eventType: PaidLotLifecycleEventV1["eventType"],
  amount: bigint,
  eventId: string,
  occurredAt = "2026-07-16T10:03:00.000Z",
): PaidLotLifecycleEventV1 {
  return {
    schemaVersion: "1",
    eventId,
    lotId: sourceLot.lotId,
    eventType,
    amount: serializeTokenSubunits(amount),
    occurredAt,
  };
}

describe("retained paid-lot lifecycle", () => {
  it("calculates partial/full refunds and fresh early-backer retained inputs", () => {
    const initial = createPaidLotLifecycle(sourceLot, provenance);
    const partial = applyPaidLotLifecycleEvent(
      initial,
      paidLotEvent("refund", 2_000n, "refund:1"),
      1,
    );
    expect(partial).toMatchObject({
      applied: true,
      lifecycle: {
        retainedAmount: "8000",
        reversedAmount: "2000",
        refundedAmount: "2000",
        status: "partially-reversed",
        version: 2,
      },
      arithmetic: {
        retainedDelta: "-2000",
        reversedDelta: "2000",
        refundedDelta: "2000",
      },
    });
    expect(
      createEarlyBackerRetentionFromPaidLot(partial.lifecycle),
    ).toMatchObject({
      lotId: sourceLot.lotId,
      payerAccountId: "account:payer:1",
      receivingHouseholdId: "household:1",
      retainedAmount: "8000",
    });

    const full = applyPaidLotLifecycleEvent(
      partial.lifecycle,
      paidLotEvent(
        "refund",
        8_000n,
        "refund:2",
        "2026-07-16T10:04:00.000Z",
      ),
      2,
    );
    expect(full.lifecycle).toMatchObject({
      retainedAmount: "0",
      reversedAmount: "10000",
      refundedAmount: "10000",
      status: "fully-reversed",
    });
  });

  it("holds disputes without reducing retained basis, then releases a win", () => {
    const initial = createPaidLotLifecycle(sourceLot, provenance);
    const held = applyPaidLotLifecycleEvent(
      initial,
      paidLotEvent("dispute-hold", 4_000n, "dispute:hold"),
      1,
    );
    expect(held.lifecycle).toMatchObject({
      retainedAmount: "10000",
      heldAmount: "4000",
      reversedAmount: "0",
      status: "disputed",
    });
    expect(
      createEarlyBackerRetentionFromPaidLot(held.lifecycle).retainedAmount,
    ).toBe("10000");

    const partlyWon = applyPaidLotLifecycleEvent(
      held.lifecycle,
      paidLotEvent(
        "dispute-won",
        1_000n,
        "dispute:won:partial",
        "2026-07-16T10:04:00.000Z",
      ),
      2,
    );
    expect(partlyWon.lifecycle.status).toBe("disputed");
    const won = applyPaidLotLifecycleEvent(
      partlyWon.lifecycle,
      paidLotEvent(
        "dispute-won",
        3_000n,
        "dispute:won:final",
        "2026-07-16T10:05:00.000Z",
      ),
      3,
    );
    expect(won.lifecycle).toMatchObject({
      retainedAmount: "10000",
      heldAmount: "0",
      reversedAmount: "0",
      status: "clear",
    });
  });

  it("reduces out-of-order dispute evidence and lost value exactly once", () => {
    const initial = createPaidLotLifecycle(sourceLot, provenance);
    const hold = paidLotEvent(
      "dispute-hold",
      4_000n,
      "dispute:hold",
      "2026-07-16T10:03:00.000Z",
    );
    const lost = paidLotEvent(
      "dispute-lost",
      4_000n,
      "dispute:lost",
      "2026-07-16T10:04:00.000Z",
    );
    const reduced = reducePaidLotLifecycleEvents(initial, [
      lost,
      hold,
      lost,
      hold,
    ]);
    expect(reduced).toMatchObject({
      retainedAmount: "6000",
      heldAmount: "0",
      reversedAmount: "4000",
      chargebackAmount: "4000",
      status: "chargeback-lost",
      version: 3,
    });
    expect(createEarlyBackerRetentionFromPaidLot(reduced).retainedAmount).toBe(
      "6000",
    );
  });

  it("supports direct chargeback and only one one-time reversal", () => {
    const initial = createPaidLotLifecycle(sourceLot, provenance);
    const chargeback = applyPaidLotLifecycleEvent(
      initial,
      paidLotEvent("chargeback", 1_000n, "chargeback:1"),
      1,
    );
    expect(chargeback.lifecycle).toMatchObject({
      retainedAmount: "9000",
      chargebackAmount: "1000",
      status: "chargeback-lost",
    });

    const reversalEvent = paidLotEvent(
      "reversal",
      2_000n,
      "reversal:1",
      "2026-07-16T10:04:00.000Z",
    );
    const reversed = applyPaidLotLifecycleEvent(
      chargeback.lifecycle,
      reversalEvent,
      2,
    );
    expect(reversed.lifecycle).toMatchObject({
      retainedAmount: "7000",
      reversedAmount: "3000",
      oneTimeReversalAmount: "2000",
    });
    const replay = applyPaidLotLifecycleEvent(
      reversed.lifecycle,
      reversalEvent,
      1,
    );
    expect(replay.applied).toBe(false);
    expect(replay.lifecycle).toBe(reversed.lifecycle);
    expect(() =>
      applyPaidLotLifecycleEvent(
        reversed.lifecycle,
        paidLotEvent(
          "reversal",
          1n,
          "reversal:2",
          "2026-07-16T10:05:00.000Z",
        ),
        3,
      ),
    ).toThrowError(expect.objectContaining({ code: "REVERSAL_ALREADY_EXISTS" }));
  });

  it("rejects stale concurrent reversals, over-holds, over-releases, and conflicting event IDs", () => {
    const initial = createPaidLotLifecycle(sourceLot, provenance);
    const partial = applyPaidLotLifecycleEvent(
      initial,
      paidLotEvent("refund", 2_000n, "refund:1"),
      1,
    ).lifecycle;
    expect(() =>
      applyPaidLotLifecycleEvent(
        partial,
        paidLotEvent(
          "refund",
          1_000n,
          "refund:concurrent",
          "2026-07-16T10:04:00.000Z",
        ),
        1,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      applyPaidLotLifecycleEvent(
        initial,
        paidLotEvent("dispute-hold", 10_001n, "hold:too-much"),
        1,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INSUFFICIENT_ELIGIBLE_LOTS" }),
    );
    expect(() =>
      applyPaidLotLifecycleEvent(
        initial,
        paidLotEvent("dispute-won", 1n, "won:without-hold"),
        1,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      reducePaidLotLifecycleEvents(initial, [
        paidLotEvent("refund", 1n, "same:event"),
        paidLotEvent("refund", 2n, "same:event"),
      ]),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
  });

  it("property: arbitrary partial refunds preserve exact retained/reversed conservation", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 100n }), {
          minLength: 1,
          maxLength: 30,
        }),
        (amounts) => {
          const total = amounts.reduce((sum, amount) => sum + amount, 0n);
          const lot = {
            ...sourceLot,
            originalAmount: serializeTokenSubunits(total),
            remainingAmount: serializeTokenSubunits(total),
          };
          const initial = createPaidLotLifecycle(lot, provenance);
          const events = amounts.map((amount, index) =>
            paidLotEvent(
              "refund",
              amount,
              `property:refund:${index}`,
              new Date(Date.parse(sourceLot.creditedAt) + index + 1).toISOString(),
            ),
          );
          const reduced = reducePaidLotLifecycleEvents(initial, events.reverse());
          expect(parseTokenSubunitsSafe(reduced.retainedAmount)).toBe(0n);
          expect(parseTokenSubunitsSafe(reduced.reversedAmount)).toBe(total);
          expect(parseTokenSubunitsSafe(reduced.refundedAmount)).toBe(total);
          expect(reduced.status).toBe("fully-reversed");
        },
      ),
    );
  });
});

function parseTokenSubunitsSafe(value: string): bigint {
  return BigInt(value);
}
