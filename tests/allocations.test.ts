import { describe, expect, it } from "vitest";
import {
  assertGameplayAllocation,
  boostGameplayAllocation,
  createGameplayAllocation,
  reclaimGameplayAllocation,
  serializeTokenSubunits,
} from "../src/index.js";

const occurredAt = "2026-07-15T10:00:00.000Z";

function createAllocation() {
  return createGameplayAllocation({
    allocationId: "allocation:1",
    householdId: "household:1",
    hostWalletId: "wallet:host",
    childWalletId: "wallet:child",
    childAccountId: "account:child",
    amount: serializeTokenSubunits(10_000n),
    fundingSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(10_000n) }],
    limits: {
      perTransaction: serializeTokenSubunits(2_000n),
      periodic: serializeTokenSubunits(5_000n),
      periodicWindow: "weekly",
    },
    occurredAt,
  });
}

describe("guardian gameplay reservations", () => {
  it("creates, boosts, and reclaims immutable whole-Token allocations", () => {
    const created = createAllocation();
    const boosted = boostGameplayAllocation(created, {
      amount: serializeTokenSubunits(5_000n),
      fundingSlices: [{ lotId: "lot:2", amount: serializeTokenSubunits(5_000n) }],
      expectedVersion: 1,
      occurredAt: "2026-07-15T11:00:00.000Z",
    });
    const reclaimed = reclaimGameplayAllocation(boosted, {
      amount: serializeTokenSubunits(3_000n),
      sourceSlices: [{ lotId: "lot:2", amount: serializeTokenSubunits(3_000n) }],
      expectedVersion: 2,
      occurredAt: "2026-07-15T12:00:00.000Z",
    });

    expect(created.reservedAmount).toBe("10000");
    expect(boosted.reservedAmount).toBe("15000");
    expect(reclaimed.remainingAmount).toBe("12000");
    expect(reclaimed.reclaimedAmount).toBe("3000");
    expect(reclaimed.version).toBe(3);
    expect(created).not.toBe(boosted);
    expect(() => assertGameplayAllocation(reclaimed)).not.toThrow();
  });

  it("closes an allocation when all unused Tokens are reclaimed", () => {
    const created = createAllocation();
    const closed = reclaimGameplayAllocation(created, {
      amount: serializeTokenSubunits(10_000n),
      sourceSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(10_000n) }],
      expectedVersion: 1,
      occurredAt: "2026-07-15T12:00:00.000Z",
    });
    expect(closed.status).toBe("closed");
    expect(() =>
      boostGameplayAllocation(closed, {
        amount: serializeTokenSubunits(1_000n),
        fundingSlices: [{ lotId: "lot:3", amount: serializeTokenSubunits(1_000n) }],
        expectedVersion: 2,
        occurredAt: "2026-07-15T13:00:00.000Z",
      }),
    ).toThrow();
  });

  it("preserves repeated lot provenance across separate boosts and reclaims", () => {
    const created = createAllocation();
    const boosted = boostGameplayAllocation(created, {
      amount: serializeTokenSubunits(2_000n),
      fundingSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(2_000n) }],
      expectedVersion: 1,
      occurredAt: "2026-07-15T11:00:00.000Z",
    });
    const firstReclaim = reclaimGameplayAllocation(boosted, {
      amount: serializeTokenSubunits(2_000n),
      sourceSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(2_000n) }],
      expectedVersion: 2,
      occurredAt: "2026-07-15T12:00:00.000Z",
    });
    const secondReclaim = reclaimGameplayAllocation(firstReclaim, {
      amount: serializeTokenSubunits(1_000n),
      sourceSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(1_000n) }],
      expectedVersion: 3,
      occurredAt: "2026-07-15T13:00:00.000Z",
    });
    expect(secondReclaim.reclaimedAmount).toBe("3000");
    expect(() => assertGameplayAllocation(secondReclaim)).not.toThrow();
  });

  it("rejects fractional, stale, oversize, duplicate, and foreign-lot commands", () => {
    expect(() =>
      createGameplayAllocation({
        allocationId: "allocation:fractional",
        householdId: "household:1",
        hostWalletId: "wallet:host",
        childWalletId: "wallet:child",
        childAccountId: "account:child",
        amount: serializeTokenSubunits(1_001n),
        fundingSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(1_001n) }],
        limits: {
          perTransaction: serializeTokenSubunits(0n),
          periodic: serializeTokenSubunits(0n),
          periodicWindow: "daily",
        },
        occurredAt,
      }),
    ).toThrowError(expect.objectContaining({ code: "AMOUNT_NOT_WHOLE_TOKEN" }));

    const created = createAllocation();
    expect(() =>
      boostGameplayAllocation(created, {
        amount: serializeTokenSubunits(2_000n),
        fundingSlices: [
          { lotId: "lot:x", amount: serializeTokenSubunits(1_000n) },
          { lotId: "lot:x", amount: serializeTokenSubunits(1_000n) },
        ],
        expectedVersion: 1,
        occurredAt,
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
    expect(() =>
      boostGameplayAllocation(created, {
        amount: serializeTokenSubunits(1_000n),
        fundingSlices: [{ lotId: "lot:2", amount: serializeTokenSubunits(1_000n) }],
        expectedVersion: 99,
        occurredAt,
      }),
    ).toThrow();
    expect(() =>
      reclaimGameplayAllocation(created, {
        amount: serializeTokenSubunits(11_000n),
        sourceSlices: [{ lotId: "lot:1", amount: serializeTokenSubunits(11_000n) }],
        expectedVersion: 1,
        occurredAt,
      }),
    ).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_BALANCE" }));
    expect(() =>
      reclaimGameplayAllocation(created, {
        amount: serializeTokenSubunits(1_000n),
        sourceSlices: [{ lotId: "lot:foreign", amount: serializeTokenSubunits(1_000n) }],
        expectedVersion: 1,
        occurredAt,
      }),
    ).toThrowError(expect.objectContaining({ code: "SOURCE_LOT_RESTRICTED" }));
  });

  it("validates allocation versions and limit relationships", () => {
    const created = createAllocation();
    expect(() => assertGameplayAllocation({ ...created, version: 0 })).toThrow();
    expect(() =>
      assertGameplayAllocation({
        ...created,
        limits: {
          ...created.limits,
          perTransaction: serializeTokenSubunits(6_000n),
        },
      }),
    ).toThrow();
    expect(() =>
      assertGameplayAllocation({
        ...created,
        fundingSlices: [
          { lotId: "lot:1", amount: serializeTokenSubunits(9_000n) },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertGameplayAllocation({
        ...created,
        reclaimedAmount: serializeTokenSubunits(1_000n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertGameplayAllocation({
        ...created,
        updatedAt: "2026-07-15T09:59:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
  });
});
