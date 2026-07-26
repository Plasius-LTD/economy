import { describe, expect, it } from "vitest";
import {
  createModuleAllowance,
  createModulePurchaseReceipt,
  createModuleSpendHold,
  createModuleSpendQuote,
  fundModuleAllowance,
  reconcileModulePurchase,
  reclaimModuleAllowance,
  releaseModuleSpendHold,
  serializeTokenSubunits,
  settleModuleSpendHold,
} from "../src/index.js";

const firstFunding = [
  { lotId: "lot:module:1", amount: serializeTokenSubunits(20_000n) },
] as const;

function allowance() {
  return createModuleAllowance({
    allowanceId: "module-allowance:child-1",
    householdId: "household:1",
    hostWalletId: "wallet:guardian",
    allowanceWalletId: "wallet:module-child-1",
    childAccountId: "account:child-1",
    amount: serializeTokenSubunits(20_000n),
    fundingSlices: firstFunding,
    occurredAt: "2026-07-21T10:00:00.000Z",
  });
}

function quote() {
  return createModuleSpendQuote({
    quoteId: "module-quote:1",
    allowanceId: "module-allowance:child-1",
    householdId: "household:1",
    guardianAccountId: "account:guardian-1",
    childAccountId: "account:child-1",
    moduleVersionId: "road-hopper-rally:1.0.0",
    catalogVersion: "junior-coder-pilot-v1",
    amount: serializeTokenSubunits(8_000n),
    requirementsManifestVersion: "road-hopper-requirements-v1",
    requirementsManifestHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requirementsAcknowledgedAt: "2026-07-21T10:05:00.000Z",
    issuedAt: "2026-07-21T10:05:01.000Z",
    expiresAt: "2026-07-21T10:20:01.000Z",
  });
}

describe("ModuleAllowanceV1", () => {
  it("funds and reclaims a reusable purpose-bound allowance", () => {
    const created = allowance();
    const funded = fundModuleAllowance(created, {
      amount: serializeTokenSubunits(5_000n),
      fundingSlices: [
        { lotId: "lot:module:2", amount: serializeTokenSubunits(5_000n) },
      ],
      expectedVersion: 1,
      occurredAt: "2026-07-21T10:02:00.000Z",
    });
    const reclaimed = reclaimModuleAllowance(funded, {
      amount: serializeTokenSubunits(3_000n),
      sourceSlices: [
        { lotId: "lot:module:2", amount: serializeTokenSubunits(3_000n) },
      ],
      expectedVersion: 2,
      occurredAt: "2026-07-21T10:03:00.000Z",
    });

    expect(created.purpose).toBe("junior-coder-module-entitlement");
    expect(funded.allocatedAmount).toBe("25000");
    expect(reclaimed.availableAmount).toBe("22000");
    expect(reclaimed.reclaimedAmount).toBe("3000");
    expect(reclaimed.version).toBe(3);
  });

  it("holds, settles, and receipts one immutable module quote", () => {
    const created = allowance();
    const priced = quote();
    const held = createModuleSpendHold(created, priced, {
      holdId: "module-hold:1",
      idempotencyKey: "module-purchase:1:hold",
      sourceSlices: [
        { lotId: "lot:module:1", amount: serializeTokenSubunits(8_000n) },
      ],
      expectedAllowanceVersion: 1,
      occurredAt: "2026-07-21T10:06:00.000Z",
    });

    expect(held.allowance.availableAmount).toBe("12000");
    expect(held.allowance.heldAmount).toBe("8000");
    expect(held.hold.status).toBe("held");

    const settled = settleModuleSpendHold(held.allowance, held.hold, {
      entitlementId: "learning-entitlement:1",
      settlementTransactionId: "transaction:module-purchase:1",
      idempotencyKey: "module-purchase:1:settle",
      expectedAllowanceVersion: 2,
      expectedHoldVersion: 1,
      occurredAt: "2026-07-21T10:07:00.000Z",
    });
    expect(settled.allowance.heldAmount).toBe("0");
    expect(settled.allowance.spentAmount).toBe("8000");
    expect(settled.hold.status).toBe("settled");
    expect(settled.hold.entitlementId).toBe("learning-entitlement:1");

    const receipt = createModulePurchaseReceipt(priced, settled.hold, {
      receiptId: "module-receipt:1",
      issuedAt: "2026-07-21T10:08:00.000Z",
    });
    expect(receipt.requirementsManifestVersion).toBe(
      "road-hopper-requirements-v1",
    );
    expect(receipt.settlementTransactionId).toBe(
      "transaction:module-purchase:1",
    );
  });

  it("releases a failed purchase hold without spending value", () => {
    const created = allowance();
    const held = createModuleSpendHold(created, quote(), {
      holdId: "module-hold:release",
      idempotencyKey: "module-purchase:release:hold",
      sourceSlices: [
        { lotId: "lot:module:1", amount: serializeTokenSubunits(8_000n) },
      ],
      expectedAllowanceVersion: 1,
      occurredAt: "2026-07-21T10:06:00.000Z",
    });
    const released = releaseModuleSpendHold(held.allowance, held.hold, {
      releaseTransactionId: "transaction:module-release:1",
      idempotencyKey: "module-purchase:release:release",
      expectedAllowanceVersion: 2,
      expectedHoldVersion: 1,
      occurredAt: "2026-07-21T10:21:00.000Z",
    });

    expect(released.allowance.availableAmount).toBe("20000");
    expect(released.allowance.heldAmount).toBe("0");
    expect(released.allowance.spentAmount).toBe("0");
    expect(released.hold.status).toBe("released");
  });

  it("rejects expired, mismatched, stale, fractional, and oversize requests", () => {
    const created = allowance();
    const priced = quote();
    const holdInput = {
      holdId: "module-hold:invalid",
      idempotencyKey: "module-purchase:invalid:hold",
      sourceSlices: [
        { lotId: "lot:module:1", amount: serializeTokenSubunits(8_000n) },
      ],
      expectedAllowanceVersion: 1,
      occurredAt: "2026-07-21T10:21:00.000Z",
    } as const;

    expect(() => createModuleSpendHold(created, priced, holdInput)).toThrowError(
      expect.objectContaining({ code: "INVALID_TIME_WINDOW" }),
    );
    expect(() =>
      createModuleSpendHold(
        created,
        { ...priced, childAccountId: "account:another-child" },
        { ...holdInput, occurredAt: "2026-07-21T10:06:00.000Z" },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      fundModuleAllowance(created, {
        amount: serializeTokenSubunits(1_001n),
        fundingSlices: [
          { lotId: "lot:fraction", amount: serializeTokenSubunits(1_001n) },
        ],
        expectedVersion: 1,
        occurredAt: "2026-07-21T10:02:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "AMOUNT_NOT_WHOLE_TOKEN" }));
    expect(() =>
      reclaimModuleAllowance(created, {
        amount: serializeTokenSubunits(21_000n),
        sourceSlices: [
          { lotId: "lot:module:1", amount: serializeTokenSubunits(21_000n) },
        ],
        expectedVersion: 1,
        occurredAt: "2026-07-21T10:02:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_BALANCE" }));
    expect(() =>
      fundModuleAllowance(created, {
        amount: serializeTokenSubunits(1_000n),
        fundingSlices: [
          { lotId: "lot:module:2", amount: serializeTokenSubunits(1_000n) },
        ],
        expectedVersion: 99,
        occurredAt: "2026-07-21T10:02:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("module-purchase reconciliation", () => {
  const observation = {
    schemaVersion: "1" as const,
    quoteId: "module-quote:1",
    holdId: "module-hold:1",
    childAccountId: "account:child-1",
    moduleVersionId: "road-hopper-rally:1.0.0",
    financialState: "settled" as const,
    entitlementState: "active" as const,
    receiptPresent: true,
    observedAt: "2026-07-21T10:30:00.000Z",
  };

  it("returns deterministic forward-safe repair actions", () => {
    expect(reconcileModulePurchase(observation).action).toBe("none");
    expect(
      reconcileModulePurchase({
        ...observation,
        financialState: "held",
        entitlementState: "pending",
        receiptPresent: false,
      }).action,
    ).toBe("resume-settlement");
    expect(
      reconcileModulePurchase({
        ...observation,
        entitlementState: "pending",
        receiptPresent: false,
      }).action,
    ).toBe("activate-entitlement");
    expect(
      reconcileModulePurchase({ ...observation, receiptPresent: false }).action,
    ).toBe("issue-receipt");
    expect(
      reconcileModulePurchase({
        ...observation,
        financialState: "held",
        entitlementState: "missing",
        receiptPresent: false,
      }).action,
    ).toBe("release-hold");
    expect(
      reconcileModulePurchase({
        ...observation,
        financialState: "released",
        entitlementState: "pending",
        receiptPresent: false,
      }).action,
    ).toBe("cancel-pending-entitlement");
  });

  it("fails closed for economically inconsistent active or settled states", () => {
    expect(
      reconcileModulePurchase({
        ...observation,
        entitlementState: "missing",
        receiptPresent: false,
      }),
    ).toEqual(expect.objectContaining({ action: "manual-review", blocking: true }));
    expect(
      reconcileModulePurchase({
        ...observation,
        financialState: "missing",
        receiptPresent: false,
      }),
    ).toEqual(expect.objectContaining({ action: "manual-review", blocking: true }));
  });
});
