import { describe, expect, it } from "vitest";
import {
  assertSourceLot,
  availableSourceLotAmount,
  canUseSourceLot,
  selectSourceLots,
  serializeTokenSubunits,
  type SourceLotV1,
} from "../src/index.js";

function lot(
  overrides: Partial<SourceLotV1> & Pick<SourceLotV1, "lotId">,
): SourceLotV1 {
  return {
    schemaVersion: "1",
    walletId: "wallet:adult",
    beneficiaryAccountId: "account:adult",
    householdId: "household:1",
    payerAccountId: "account:adult",
    source: "shopify",
    rateVersion: "rate:gbp:v1",
    settlementEvidenceHash: `sha256:${"a".repeat(64)}`,
    transferPolicy: "household-allocatable",
    refundState: "none",
    originalAmount: serializeTokenSubunits(50_000n),
    remainingAmount: serializeTokenSubunits(50_000n),
    heldAmount: serializeTokenSubunits(0n),
    reversedAmount: serializeTokenSubunits(0n),
    settledAt: "2026-07-15T10:00:00.000Z",
    creditedAt: "2026-07-15T10:00:01.000Z",
    ...overrides,
  };
}

describe("source-lot accounting", () => {
  it("validates and exposes only unheld remaining value", () => {
    const sourceLot = lot({
      lotId: "lot:1",
      remainingAmount: serializeTokenSubunits(40_000n),
      heldAmount: serializeTokenSubunits(10_000n),
    });
    expect(() => assertSourceLot(sourceLot)).not.toThrow();
    expect(availableSourceLotAmount(sourceLot)).toBe(30_000n);
  });

  it("rejects unsupported, malformed, negative, and inconsistent lots", () => {
    const cases: SourceLotV1[] = [
      lot({ lotId: "lot:version", schemaVersion: "2" as "1" }),
      lot({ lotId: "lot:evidence", settlementEvidenceHash: "raw-evidence" }),
      lot({ lotId: "lot:zero", originalAmount: serializeTokenSubunits(0n) }),
      lot({ lotId: "lot:remaining", remainingAmount: serializeTokenSubunits(60_000n) }),
      lot({ lotId: "lot:held", heldAmount: serializeTokenSubunits(60_000n) }),
      lot({ lotId: "lot:reversed", reversedAmount: serializeTokenSubunits(60_000n) }),
      lot({
        lotId: "lot:combined",
        remainingAmount: serializeTokenSubunits(40_000n),
        reversedAmount: serializeTokenSubunits(20_000n),
      }),
      lot({
        lotId: "lot:time",
        creditedAt: "2026-07-15T09:59:59.000Z",
      }),
      lot({
        lotId: "lot:provider",
        providerEventId: "contains spaces",
      }),
    ];
    for (const sourceLot of cases) {
      expect(() => assertSourceLot(sourceLot)).toThrow();
    }
  });

  it("selects eligible household lots deterministically", () => {
    const selected = selectSourceLots(
      [
        lot({
          lotId: "lot:b",
          originalAmount: serializeTokenSubunits(20_000n),
          remainingAmount: serializeTokenSubunits(20_000n),
          creditedAt: "2026-07-15T10:00:02.000Z",
        }),
        lot({
          lotId: "lot:a",
          originalAmount: serializeTokenSubunits(20_000n),
          remainingAmount: serializeTokenSubunits(20_000n),
          creditedAt: "2026-07-15T10:00:01.000Z",
        }),
      ],
      serializeTokenSubunits(30_000n),
      {
        operation: "allocate",
        beneficiaryAccountId: "account:child",
        householdId: "household:1",
      },
    );
    expect(selected).toEqual([
      { lotId: "lot:a", amount: "20000" },
      { lotId: "lot:b", amount: "10000" },
    ]);
  });

  it("keeps same-user provider earnings out of child allocations", () => {
    const paidShape = lot({
      lotId: "lot:earned",
      source: "ayet",
      transferPolicy: "same-user-only",
    });
    const {
      householdId: _householdId,
      payerAccountId: _payerAccountId,
      ...earned
    } = {
      ...paidShape,
      providerEventId: "ayet:event:1",
    };
    expect(
      canUseSourceLot(earned, {
        operation: "spend",
        beneficiaryAccountId: "account:adult",
      }),
    ).toBe(true);
    expect(
      canUseSourceLot(earned, {
        operation: "spend",
        beneficiaryAccountId: "account:child",
      }),
    ).toBe(false);
    expect(
      canUseSourceLot(earned, {
        operation: "refund",
        beneficiaryAccountId: "account:adult",
      }),
    ).toBe(true);
    expect(() =>
      selectSourceLots([earned], serializeTokenSubunits(1_000n), {
        operation: "allocate",
        beneficiaryAccountId: "account:child",
        householdId: "household:1",
      }),
    ).toThrowError(expect.objectContaining({ code: "SOURCE_LOT_RESTRICTED" }));
  });

  it("rejects attempts to mark adult reward-provider earnings as allocatable", () => {
    expect(() =>
      assertSourceLot(
        lot({
          lotId: "lot:unsafe-earned",
          source: "bitlabs",
          providerEventId: "bitlabs:event:1",
          transferPolicy: "household-allocatable",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "SOURCE_LOT_RESTRICTED" }));
    expect(() =>
      assertSourceLot(
        lot({
          lotId: "lot:missing-provider-event",
          source: "ayet",
          transferPolicy: "same-user-only",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "SOURCE_LOT_RESTRICTED" }));
  });

  it("distinguishes insufficient total value from policy restriction", () => {
    const small = lot({
      lotId: "lot:small",
      originalAmount: serializeTokenSubunits(500n),
      remainingAmount: serializeTokenSubunits(500n),
    });
    expect(() =>
      selectSourceLots([small], serializeTokenSubunits(1_000n), {
        operation: "allocate",
        beneficiaryAccountId: "account:child",
        householdId: "household:1",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INSUFFICIENT_ELIGIBLE_LOTS" }),
    );
    expect(() =>
      selectSourceLots([], serializeTokenSubunits(0n), {
        operation: "spend",
        beneficiaryAccountId: "account:adult",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });
});
