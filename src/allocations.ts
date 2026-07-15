import {
  isWholeTokenAmount,
  parseTokenSubunits,
  serializeTokenSubunits,
  sumTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type AllocationId,
  type EconomyContractVersion,
  type HouseholdId,
  type IsoTimestamp,
  type WalletId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { SourceLotSliceV1 } from "./lots.js";

export type AllocationStatus = "active" | "closed";
export type PeriodicLimitWindow = "daily" | "weekly" | "monthly";

export interface GameplayLimitsV1 {
  readonly perTransaction: TokenSubunitString;
  readonly periodic: TokenSubunitString;
  readonly periodicWindow: PeriodicLimitWindow;
}

/** Guardian-funded, child-visible reservation. This is not a gameplay ledger. */
export interface GameplayAllocationV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly allocationId: AllocationId;
  readonly householdId: HouseholdId;
  readonly hostWalletId: WalletId;
  readonly childWalletId: WalletId;
  readonly childAccountId: AccountId;
  readonly status: AllocationStatus;
  readonly reservedAmount: TokenSubunitString;
  readonly remainingAmount: TokenSubunitString;
  readonly reclaimedAmount: TokenSubunitString;
  readonly fundingSlices: readonly SourceLotSliceV1[];
  readonly reclaimedSlices: readonly SourceLotSliceV1[];
  readonly limits: GameplayLimitsV1;
  readonly version: number;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

function assertWholePositive(amount: TokenSubunitString, label: string): bigint {
  const parsed = parseTokenSubunits(amount);
  economyAssert(parsed > 0n, "INVALID_AMOUNT", `${label} must be positive`);
  economyAssert(
    isWholeTokenAmount(parsed),
    "AMOUNT_NOT_WHOLE_TOKEN",
    `${label} must contain whole Tokens`,
  );
  return parsed;
}

function assertSlices(
  slices: readonly SourceLotSliceV1[],
  expectedAmount: bigint,
  label: string,
): void {
  economyAssert(slices.length > 0, "INVALID_CONTRACT", `${label} are required`);
  const lotIds = new Set<string>();
  for (const slice of slices) {
    assertEconomyIdentifier(slice.lotId, "lotId");
    economyAssert(
      !lotIds.has(slice.lotId),
      "DUPLICATE_IDENTIFIER",
      `${label} must not repeat a lot`,
    );
    lotIds.add(slice.lotId);
    economyAssert(
      parseTokenSubunits(slice.amount) > 0n,
      "INVALID_AMOUNT",
      `${label} amounts must be positive`,
    );
  }
  economyAssert(
    sumTokenSubunits(slices.map((slice) => slice.amount)) === expectedAmount,
    "INVALID_CONTRACT",
    `${label} must sum to the command amount`,
  );
}

/** Validates allocation arithmetic and whole-Token reservation policy. */
export function assertGameplayAllocation(
  allocation: GameplayAllocationV1,
): void {
  economyAssert(
    allocation.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported allocation contract version",
  );
  assertEconomyIdentifier(allocation.allocationId, "allocationId");
  assertEconomyIdentifier(allocation.householdId, "householdId");
  assertEconomyIdentifier(allocation.hostWalletId, "hostWalletId");
  assertEconomyIdentifier(allocation.childWalletId, "childWalletId");
  assertEconomyIdentifier(allocation.childAccountId, "childAccountId");
  const createdAt = parseIsoTimestamp(allocation.createdAt);
  const updatedAt = parseIsoTimestamp(allocation.updatedAt);
  economyAssert(
    updatedAt >= createdAt,
    "INVALID_TIME_WINDOW",
    "Allocation update time cannot precede its creation time",
  );
  economyAssert(
    allocation.status === "active" || allocation.status === "closed",
    "INVALID_CONTRACT",
    "Allocation has an unsupported status",
  );

  const reserved = parseTokenSubunits(allocation.reservedAmount);
  const remaining = parseTokenSubunits(allocation.remainingAmount);
  const reclaimed = parseTokenSubunits(allocation.reclaimedAmount);
  economyAssert(
    reserved > 0n &&
      remaining >= 0n &&
      reclaimed >= 0n &&
      isWholeTokenAmount(reserved) &&
      isWholeTokenAmount(remaining) &&
      isWholeTokenAmount(reclaimed),
    "AMOUNT_NOT_WHOLE_TOKEN",
    "Allocation reservations and reclaims must contain whole Tokens",
  );
  economyAssert(
    remaining + reclaimed <= reserved,
    "INVALID_CONTRACT",
    "Allocation remaining and reclaimed amounts exceed its reservation",
  );

  const fundingByLot = new Map<string, bigint>();
  let funded = 0n;
  for (const slice of allocation.fundingSlices) {
    assertEconomyIdentifier(slice.lotId, "lotId");
    const amount = parseTokenSubunits(slice.amount);
    economyAssert(
      amount > 0n,
      "INVALID_AMOUNT",
      "Allocation funding slices must be positive",
    );
    funded += amount;
    fundingByLot.set(
      slice.lotId,
      (fundingByLot.get(slice.lotId) ?? 0n) + amount,
    );
  }
  economyAssert(
    funded === reserved,
    "INVALID_CONTRACT",
    "Allocation funding provenance must equal its total reservation",
  );

  const reclaimedByLot = new Map<string, bigint>();
  let reclaimedFromSlices = 0n;
  for (const slice of allocation.reclaimedSlices) {
    assertEconomyIdentifier(slice.lotId, "lotId");
    const amount = parseTokenSubunits(slice.amount);
    economyAssert(
      amount > 0n,
      "INVALID_AMOUNT",
      "Allocation reclaim slices must be positive",
    );
    reclaimedFromSlices += amount;
    reclaimedByLot.set(
      slice.lotId,
      (reclaimedByLot.get(slice.lotId) ?? 0n) + amount,
    );
  }
  economyAssert(
    reclaimedFromSlices === reclaimed,
    "INVALID_CONTRACT",
    "Allocation reclaim provenance must equal its reclaimed amount",
  );
  for (const [lotId, amount] of reclaimedByLot) {
    economyAssert(
      amount <= (fundingByLot.get(lotId) ?? 0n),
      "SOURCE_LOT_RESTRICTED",
      "Reclaimed provenance cannot exceed allocation funding",
    );
  }
  economyAssert(
    allocation.version >= 1 && Number.isSafeInteger(allocation.version),
    "INVALID_CONTRACT",
    "Allocation version must be a positive safe integer",
  );

  const perTransaction = parseTokenSubunits(allocation.limits.perTransaction);
  const periodic = parseTokenSubunits(allocation.limits.periodic);
  economyAssert(
    ["daily", "weekly", "monthly"].includes(allocation.limits.periodicWindow),
    "INVALID_CONTRACT",
    "Gameplay limit has an unsupported period",
  );
  economyAssert(
    perTransaction >= 0n &&
      periodic >= 0n &&
      isWholeTokenAmount(perTransaction) &&
      isWholeTokenAmount(periodic),
    "AMOUNT_NOT_WHOLE_TOKEN",
    "Gameplay limits must contain whole Tokens",
  );
  economyAssert(
    perTransaction <= periodic || periodic === 0n,
    "INVALID_CONTRACT",
    "Per-transaction limit cannot exceed an enabled periodic limit",
  );
}

export interface CreateGameplayAllocationInputV1 {
  readonly allocationId: AllocationId;
  readonly householdId: HouseholdId;
  readonly hostWalletId: WalletId;
  readonly childWalletId: WalletId;
  readonly childAccountId: AccountId;
  readonly amount: TokenSubunitString;
  readonly fundingSlices: readonly SourceLotSliceV1[];
  readonly limits: GameplayLimitsV1;
  readonly occurredAt: IsoTimestamp;
}

/** Creates a new whole-Token reservation from already-selected source lots. */
export function createGameplayAllocation(
  input: CreateGameplayAllocationInputV1,
): GameplayAllocationV1 {
  const amount = assertWholePositive(input.amount, "Allocation amount");
  assertSlices(input.fundingSlices, amount, "Allocation funding slices");
  const allocation: GameplayAllocationV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    allocationId: input.allocationId,
    householdId: input.householdId,
    hostWalletId: input.hostWalletId,
    childWalletId: input.childWalletId,
    childAccountId: input.childAccountId,
    status: "active",
    reservedAmount: input.amount,
    remainingAmount: input.amount,
    reclaimedAmount: serializeTokenSubunits(0n),
    fundingSlices: input.fundingSlices,
    reclaimedSlices: [],
    limits: input.limits,
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  assertGameplayAllocation(allocation);
  return allocation;
}

export interface BoostGameplayAllocationInputV1 {
  readonly amount: TokenSubunitString;
  readonly fundingSlices: readonly SourceLotSliceV1[];
  readonly expectedVersion: number;
  readonly occurredAt: IsoTimestamp;
}

/** Returns the next immutable allocation state after a whole-Token boost. */
export function boostGameplayAllocation(
  allocation: GameplayAllocationV1,
  input: BoostGameplayAllocationInputV1,
): GameplayAllocationV1 {
  assertGameplayAllocation(allocation);
  economyAssert(
    allocation.status === "active" && allocation.version === input.expectedVersion,
    "INVALID_CONTRACT",
    "Allocation is closed or its optimistic version is stale",
  );
  const amount = assertWholePositive(input.amount, "Boost amount");
  assertSlices(input.fundingSlices, amount, "Boost funding slices");

  const next: GameplayAllocationV1 = {
    ...allocation,
    reservedAmount: serializeTokenSubunits(
      parseTokenSubunits(allocation.reservedAmount) + amount,
    ),
    remainingAmount: serializeTokenSubunits(
      parseTokenSubunits(allocation.remainingAmount) + amount,
    ),
    fundingSlices: [...allocation.fundingSlices, ...input.fundingSlices],
    version: allocation.version + 1,
    updatedAt: input.occurredAt,
  };
  assertGameplayAllocation(next);
  return next;
}

export interface ReclaimGameplayAllocationInputV1 {
  readonly amount: TokenSubunitString;
  readonly sourceSlices: readonly SourceLotSliceV1[];
  readonly expectedVersion: number;
  readonly occurredAt: IsoTimestamp;
}

/** Reclaims unused whole Tokens without changing spent history. */
export function reclaimGameplayAllocation(
  allocation: GameplayAllocationV1,
  input: ReclaimGameplayAllocationInputV1,
): GameplayAllocationV1 {
  assertGameplayAllocation(allocation);
  economyAssert(
    allocation.status === "active" && allocation.version === input.expectedVersion,
    "INVALID_CONTRACT",
    "Allocation is closed or its optimistic version is stale",
  );
  const amount = assertWholePositive(input.amount, "Reclaim amount");
  economyAssert(
    amount <= parseTokenSubunits(allocation.remainingAmount),
    "INSUFFICIENT_BALANCE",
    "Cannot reclaim more than the unused allocation",
  );
  assertSlices(input.sourceSlices, amount, "Reclaim source slices");
  const fundedLotIds = new Set(
    allocation.fundingSlices.map((slice) => slice.lotId),
  );
  economyAssert(
    input.sourceSlices.every((slice) => fundedLotIds.has(slice.lotId)),
    "SOURCE_LOT_RESTRICTED",
    "Reclaim slices must originate from the allocation",
  );

  const remaining = parseTokenSubunits(allocation.remainingAmount) - amount;
  const next: GameplayAllocationV1 = {
    ...allocation,
    remainingAmount: serializeTokenSubunits(remaining),
    reclaimedAmount: serializeTokenSubunits(
      parseTokenSubunits(allocation.reclaimedAmount) + amount,
    ),
    reclaimedSlices: [...allocation.reclaimedSlices, ...input.sourceSlices],
    status: remaining === 0n ? "closed" : allocation.status,
    version: allocation.version + 1,
    updatedAt: input.occurredAt,
  };
  assertGameplayAllocation(next);
  return next;
}
