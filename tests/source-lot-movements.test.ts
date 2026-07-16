import { describe, expect, it } from "vitest";
import {
  applySourceLotMovement,
  assertSourceLotMovement,
  assertVersionedSourceLot,
  createInitialSourceLotSnapshot,
  serializeTokenSubunits,
  type SourceLotMovementV1,
  type SourceLotV1,
  type VersionedSourceLotV1,
} from "../src/index.js";

const lot: SourceLotV1 = {
  schemaVersion: "1",
  lotId: "lot:shopify:1",
  walletId: "wallet:treasury",
  beneficiaryAccountId: "account:guardian",
  householdId: "household:1",
  payerAccountId: "account:guardian",
  source: "shopify",
  rateVersion: "gbp-v1",
  settlementEvidenceHash: `sha256:${"a".repeat(64)}`,
  transferPolicy: "household-allocatable",
  refundState: "none",
  originalAmount: serializeTokenSubunits(10_000n),
  remainingAmount: serializeTokenSubunits(10_000n),
  heldAmount: serializeTokenSubunits(0n),
  reversedAmount: serializeTokenSubunits(0n),
  settledAt: "2026-07-15T10:00:00.000Z",
  creditedAt: "2026-07-15T10:00:01.000Z",
};

const snapshot: VersionedSourceLotV1 = {
  schemaVersion: "1",
  lot,
  version: 1,
  updatedAt: "2026-07-15T10:00:01.000Z",
};

function movement(
  overrides: Partial<SourceLotMovementV1> = {},
): SourceLotMovementV1 {
  return {
    schemaVersion: "1",
    movementId: "movement:1",
    transactionId: "txn:1",
    lotId: lot.lotId,
    movementType: "allocate",
    remainingDelta: serializeTokenSubunits(-2_000n),
    heldDelta: serializeTokenSubunits(0n),
    reversedDelta: serializeTokenSubunits(0n),
    expectedVersion: 1,
    resultingVersion: 2,
    expectedRefundState: "none",
    resultingRefundState: "none",
    occurredAt: "2026-07-15T10:01:00.000Z",
    ...overrides,
  };
}

describe("versioned source-lot movements", () => {
  it("atomically consumes and reclaims source-lot value by version", () => {
    expect(createInitialSourceLotSnapshot(lot)).toEqual(snapshot);
    expect(() => assertVersionedSourceLot(snapshot)).not.toThrow();
    const allocated = applySourceLotMovement(snapshot, movement());
    expect(allocated).toMatchObject({
      version: 2,
      lot: { remainingAmount: "8000", refundState: "none" },
    });
    const reclaimed = applySourceLotMovement(
      allocated,
      movement({
        movementId: "movement:2",
        transactionId: "txn:2",
        movementType: "reclaim",
        remainingDelta: serializeTokenSubunits(1_000n),
        expectedVersion: 2,
        resultingVersion: 3,
        occurredAt: "2026-07-15T10:02:00.000Z",
      }),
    );
    expect(reclaimed.lot.remainingAmount).toBe("9000");
  });

  it("records dispute holds and releases without economic reversal", () => {
    const held = applySourceLotMovement(
      snapshot,
      movement({
        movementType: "hold",
        remainingDelta: serializeTokenSubunits(0n),
        heldDelta: serializeTokenSubunits(3_000n),
        expectedRefundState: "none",
        resultingRefundState: "disputed",
      }),
    );
    expect(held.lot).toMatchObject({
      heldAmount: "3000",
      reversedAmount: "0",
      refundState: "disputed",
    });
    const released = applySourceLotMovement(
      held,
      movement({
        movementId: "movement:release",
        transactionId: "txn:release",
        movementType: "release-hold",
        remainingDelta: serializeTokenSubunits(0n),
        heldDelta: serializeTokenSubunits(-3_000n),
        expectedVersion: 2,
        resultingVersion: 3,
        expectedRefundState: "disputed",
        resultingRefundState: "none",
        occurredAt: "2026-07-15T10:02:00.000Z",
      }),
    );
    expect(released.lot).toMatchObject({
      heldAmount: "0",
      refundState: "none",
    });
  });

  it("moves partial and final refunds into a monotonic reversed basis", () => {
    const partial = applySourceLotMovement(
      snapshot,
      movement({
        movementType: "refund",
        remainingDelta: serializeTokenSubunits(-2_000n),
        reversedDelta: serializeTokenSubunits(2_000n),
        resultingRefundState: "partial",
      }),
    );
    expect(partial.lot).toMatchObject({
      remainingAmount: "8000",
      reversedAmount: "2000",
      refundState: "partial",
    });
    const refunded = applySourceLotMovement(
      partial,
      movement({
        movementId: "movement:refund:final",
        transactionId: "txn:refund:final",
        movementType: "refund",
        remainingDelta: serializeTokenSubunits(-8_000n),
        reversedDelta: serializeTokenSubunits(8_000n),
        expectedVersion: 2,
        resultingVersion: 3,
        expectedRefundState: "partial",
        resultingRefundState: "refunded",
        occurredAt: "2026-07-15T10:02:00.000Z",
      }),
    );
    expect(refunded.lot).toMatchObject({
      remainingAmount: "0",
      heldAmount: "0",
      reversedAmount: "10000",
      refundState: "refunded",
    });
  });

  it("finalizes a held lost chargeback without editing provenance", () => {
    const disputed = applySourceLotMovement(
      snapshot,
      movement({
        movementType: "hold",
        remainingDelta: serializeTokenSubunits(0n),
        heldDelta: serializeTokenSubunits(10_000n),
        resultingRefundState: "disputed",
      }),
    );
    const lost = applySourceLotMovement(
      disputed,
      movement({
        movementId: "movement:chargeback",
        transactionId: "txn:chargeback",
        movementType: "chargeback",
        remainingDelta: serializeTokenSubunits(-10_000n),
        heldDelta: serializeTokenSubunits(-10_000n),
        reversedDelta: serializeTokenSubunits(10_000n),
        expectedVersion: 2,
        resultingVersion: 3,
        expectedRefundState: "disputed",
        resultingRefundState: "chargeback-lost",
        occurredAt: "2026-07-15T10:02:00.000Z",
      }),
    );
    expect(lost.lot.settlementEvidenceHash).toBe(lot.settlementEvidenceHash);
    expect(lost.lot.refundState).toBe("chargeback-lost");
  });

  it("rejects stale versions, invalid delta directions, and impossible totals", () => {
    expect(() =>
      applySourceLotMovement(
        snapshot,
        movement({ expectedVersion: 2, resultingVersion: 3 }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertSourceLotMovement(
        movement({
          movementType: "reclaim",
          remainingDelta: serializeTokenSubunits(-1n),
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      applySourceLotMovement(
        snapshot,
        movement({ remainingDelta: serializeTokenSubunits(-11_000n) }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertSourceLotMovement(
        movement({
          movementType: "refund",
          reversedDelta: serializeTokenSubunits(2_000n),
          resultingRefundState: "chargeback-lost",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertVersionedSourceLot({ ...snapshot, version: 0 }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      createInitialSourceLotSnapshot({
        ...lot,
        remainingAmount: serializeTokenSubunits(9_000n),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});
