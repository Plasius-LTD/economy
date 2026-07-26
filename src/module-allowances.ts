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
  type EconomyContractVersion,
  type HouseholdId,
  type IsoTimestamp,
  type LearningEntitlementId,
  type LearningModuleVersionId,
  type ModuleAllowanceId,
  type ModuleSpendHoldId,
  type ModuleSpendQuoteId,
  type TransactionId,
  type WalletId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { SourceLotSliceV1 } from "./lots.js";

export const MODULE_ALLOWANCE_PURPOSE =
  "junior-coder-module-entitlement" as const;

export type ModuleAllowanceStatusV1 = "active" | "closed";

/** Guardian-funded value that can only purchase modules for one child. */
export interface ModuleAllowanceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly purpose: typeof MODULE_ALLOWANCE_PURPOSE;
  readonly allowanceId: ModuleAllowanceId;
  readonly householdId: HouseholdId;
  readonly hostWalletId: WalletId;
  readonly allowanceWalletId: WalletId;
  readonly childAccountId: AccountId;
  readonly status: ModuleAllowanceStatusV1;
  readonly allocatedAmount: TokenSubunitString;
  readonly availableAmount: TokenSubunitString;
  readonly heldAmount: TokenSubunitString;
  readonly spentAmount: TokenSubunitString;
  readonly reclaimedAmount: TokenSubunitString;
  readonly fundingSlices: readonly SourceLotSliceV1[];
  readonly reclaimedSlices: readonly SourceLotSliceV1[];
  readonly version: number;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface CreateModuleAllowanceInputV1 {
  readonly allowanceId: ModuleAllowanceId;
  readonly householdId: HouseholdId;
  readonly hostWalletId: WalletId;
  readonly allowanceWalletId: WalletId;
  readonly childAccountId: AccountId;
  readonly amount: TokenSubunitString;
  readonly fundingSlices: readonly SourceLotSliceV1[];
  readonly occurredAt: IsoTimestamp;
}

export interface FundModuleAllowanceInputV1 {
  readonly amount: TokenSubunitString;
  readonly fundingSlices: readonly SourceLotSliceV1[];
  readonly expectedVersion: number;
  readonly occurredAt: IsoTimestamp;
}

export interface ReclaimModuleAllowanceInputV1 {
  readonly amount: TokenSubunitString;
  readonly sourceSlices: readonly SourceLotSliceV1[];
  readonly expectedVersion: number;
  readonly occurredAt: IsoTimestamp;
}

export interface CloseModuleAllowanceInputV1 {
  readonly expectedVersion: number;
  readonly occurredAt: IsoTimestamp;
}

/** Immutable Guardian-approved module price and requirements evidence. */
export interface ModuleSpendQuoteV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly quoteId: ModuleSpendQuoteId;
  readonly allowanceId: ModuleAllowanceId;
  readonly householdId: HouseholdId;
  readonly guardianAccountId: AccountId;
  readonly childAccountId: AccountId;
  readonly moduleVersionId: LearningModuleVersionId;
  readonly catalogVersion: string;
  readonly amount: TokenSubunitString;
  readonly requirementsManifestVersion: string;
  readonly requirementsManifestHash: string;
  readonly requirementsAcknowledgedAt: IsoTimestamp;
  readonly issuedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

export type CreateModuleSpendQuoteInputV1 = Omit<
  ModuleSpendQuoteV1,
  "schemaVersion"
>;

export type ModuleSpendHoldStatusV1 = "held" | "settled" | "released";

/** Versioned projection for one quote-bound allowance hold. */
export interface ModuleSpendHoldV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly holdId: ModuleSpendHoldId;
  readonly quoteId: ModuleSpendQuoteId;
  readonly allowanceId: ModuleAllowanceId;
  readonly householdId: HouseholdId;
  readonly guardianAccountId: AccountId;
  readonly childAccountId: AccountId;
  readonly moduleVersionId: LearningModuleVersionId;
  readonly amount: TokenSubunitString;
  readonly requirementsManifestVersion: string;
  readonly requirementsManifestHash: string;
  readonly sourceSlices: readonly SourceLotSliceV1[];
  readonly status: ModuleSpendHoldStatusV1;
  readonly holdIdempotencyKey: string;
  readonly settlementIdempotencyKey?: string;
  readonly releaseIdempotencyKey?: string;
  readonly entitlementId?: LearningEntitlementId;
  readonly settlementTransactionId?: TransactionId;
  readonly releaseTransactionId?: TransactionId;
  readonly version: number;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface CreateModuleSpendHoldInputV1 {
  readonly holdId: ModuleSpendHoldId;
  readonly idempotencyKey: string;
  readonly sourceSlices: readonly SourceLotSliceV1[];
  readonly expectedAllowanceVersion: number;
  readonly occurredAt: IsoTimestamp;
}

export interface SettleModuleSpendHoldInputV1 {
  readonly entitlementId: LearningEntitlementId;
  readonly settlementTransactionId: TransactionId;
  readonly idempotencyKey: string;
  readonly expectedAllowanceVersion: number;
  readonly expectedHoldVersion: number;
  readonly occurredAt: IsoTimestamp;
}

export interface ReleaseModuleSpendHoldInputV1 {
  readonly releaseTransactionId: TransactionId;
  readonly idempotencyKey: string;
  readonly expectedAllowanceVersion: number;
  readonly expectedHoldVersion: number;
  readonly occurredAt: IsoTimestamp;
}

export interface ModuleSpendTransitionResultV1 {
  readonly allowance: ModuleAllowanceV1;
  readonly hold: ModuleSpendHoldV1;
}

/** Durable economic receipt for an activated learning entitlement. */
export interface ModulePurchaseReceiptV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly receiptId: string;
  readonly quoteId: ModuleSpendQuoteId;
  readonly holdId: ModuleSpendHoldId;
  readonly allowanceId: ModuleAllowanceId;
  readonly householdId: HouseholdId;
  readonly guardianAccountId: AccountId;
  readonly childAccountId: AccountId;
  readonly moduleVersionId: LearningModuleVersionId;
  readonly entitlementId: LearningEntitlementId;
  readonly amount: TokenSubunitString;
  readonly requirementsManifestVersion: string;
  readonly requirementsManifestHash: string;
  readonly settlementTransactionId: TransactionId;
  readonly issuedAt: IsoTimestamp;
}

export interface CreateModulePurchaseReceiptInputV1 {
  readonly receiptId: string;
  readonly issuedAt: IsoTimestamp;
}

export type ModulePurchaseFinancialStateV1 =
  | "missing"
  | "held"
  | "settled"
  | "released";
export type ModulePurchaseEntitlementStateV1 =
  | "missing"
  | "pending"
  | "active"
  | "cancelled";

/** Privacy-minimized observation used by an authoritative reconciler. */
export interface ModulePurchaseReconciliationObservationV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly quoteId: ModuleSpendQuoteId;
  readonly holdId: ModuleSpendHoldId;
  readonly childAccountId: AccountId;
  readonly moduleVersionId: LearningModuleVersionId;
  readonly financialState: ModulePurchaseFinancialStateV1;
  readonly entitlementState: ModulePurchaseEntitlementStateV1;
  readonly receiptPresent: boolean;
  readonly observedAt: IsoTimestamp;
}

export type ModulePurchaseReconciliationActionV1 =
  | "none"
  | "resume-settlement"
  | "release-hold"
  | "activate-entitlement"
  | "issue-receipt"
  | "cancel-pending-entitlement"
  | "manual-review";

export interface ModulePurchaseReconciliationResultV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly action: ModulePurchaseReconciliationActionV1;
  readonly blocking: boolean;
  readonly consistent: boolean;
  readonly reasonCode: string;
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

function assertPositiveSlices(
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
    `${label} must sum to the operation amount`,
  );
}

function sumSlicesByLot(
  slices: readonly SourceLotSliceV1[],
): ReadonlyMap<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const slice of slices) {
    assertEconomyIdentifier(slice.lotId, "lotId");
    const amount = parseTokenSubunits(slice.amount);
    economyAssert(amount > 0n, "INVALID_AMOUNT", "Lot slices must be positive");
    totals.set(slice.lotId, (totals.get(slice.lotId) ?? 0n) + amount);
  }
  return totals;
}

function assertSha256Reference(value: string, label: string): void {
  economyAssert(
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "INVALID_CONTRACT",
    `${label} must be a canonical SHA-256 reference`,
  );
}

function assertUpdatedAt(
  current: IsoTimestamp,
  occurredAt: IsoTimestamp,
  label: string,
): void {
  economyAssert(
    parseIsoTimestamp(occurredAt) >= parseIsoTimestamp(current),
    "INVALID_TIME_WINDOW",
    `${label} cannot precede the current state`,
  );
}

/** Validates exact arithmetic and source-lot provenance for an allowance. */
export function assertModuleAllowance(allowance: ModuleAllowanceV1): void {
  economyAssert(
    allowance.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      allowance.purpose === MODULE_ALLOWANCE_PURPOSE,
    "INVALID_CONTRACT",
    "Unsupported Module Allowance contract",
  );
  assertEconomyIdentifier(allowance.allowanceId, "allowanceId");
  assertEconomyIdentifier(allowance.householdId, "householdId");
  assertEconomyIdentifier(allowance.hostWalletId, "hostWalletId");
  assertEconomyIdentifier(allowance.allowanceWalletId, "allowanceWalletId");
  assertEconomyIdentifier(allowance.childAccountId, "childAccountId");
  economyAssert(
    allowance.hostWalletId !== allowance.allowanceWalletId,
    "INVALID_CONTRACT",
    "Host and Module Allowance wallets must be distinct",
  );
  economyAssert(
    allowance.status === "active" || allowance.status === "closed",
    "INVALID_CONTRACT",
    "Module Allowance status is unsupported",
  );
  const createdAt = parseIsoTimestamp(allowance.createdAt);
  const updatedAt = parseIsoTimestamp(allowance.updatedAt);
  economyAssert(
    updatedAt >= createdAt,
    "INVALID_TIME_WINDOW",
    "Module Allowance update cannot precede creation",
  );
  economyAssert(
    Number.isSafeInteger(allowance.version) && allowance.version >= 1,
    "INVALID_CONTRACT",
    "Module Allowance version must be a positive safe integer",
  );

  const allocated = parseTokenSubunits(allowance.allocatedAmount);
  const available = parseTokenSubunits(allowance.availableAmount);
  const held = parseTokenSubunits(allowance.heldAmount);
  const spent = parseTokenSubunits(allowance.spentAmount);
  const reclaimed = parseTokenSubunits(allowance.reclaimedAmount);
  economyAssert(
    allocated > 0n &&
      [allocated, available, held, spent, reclaimed].every(
        (amount) => amount >= 0n && isWholeTokenAmount(amount),
      ),
    "AMOUNT_NOT_WHOLE_TOKEN",
    "Module Allowance amounts must be non-negative whole Tokens",
  );
  economyAssert(
    allocated === available + held + spent + reclaimed,
    "INVALID_CONTRACT",
    "Module Allowance buckets must equal its lifetime allocation",
  );
  economyAssert(
    allowance.status !== "closed" || (available === 0n && held === 0n),
    "INVALID_CONTRACT",
    "A closed Module Allowance cannot retain available or held value",
  );

  const fundedByLot = sumSlicesByLot(allowance.fundingSlices);
  const reclaimedByLot = sumSlicesByLot(allowance.reclaimedSlices);
  economyAssert(
    sumTokenSubunits(allowance.fundingSlices.map((slice) => slice.amount)) ===
      allocated,
    "INVALID_CONTRACT",
    "Module Allowance funding provenance must equal allocated value",
  );
  economyAssert(
    sumTokenSubunits(allowance.reclaimedSlices.map((slice) => slice.amount)) ===
      reclaimed,
    "INVALID_CONTRACT",
    "Module Allowance reclaim provenance must equal reclaimed value",
  );
  for (const [lotId, amount] of reclaimedByLot) {
    economyAssert(
      amount <= (fundedByLot.get(lotId) ?? 0n),
      "SOURCE_LOT_RESTRICTED",
      "Reclaimed provenance cannot exceed Module Allowance funding",
    );
  }
}

/** Creates a child-specific Module Allowance from locked source-lot slices. */
export function createModuleAllowance(
  input: CreateModuleAllowanceInputV1,
): ModuleAllowanceV1 {
  const amount = assertWholePositive(input.amount, "Module Allowance amount");
  assertPositiveSlices(input.fundingSlices, amount, "Funding slices");
  const allowance: ModuleAllowanceV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    purpose: MODULE_ALLOWANCE_PURPOSE,
    allowanceId: input.allowanceId,
    householdId: input.householdId,
    hostWalletId: input.hostWalletId,
    allowanceWalletId: input.allowanceWalletId,
    childAccountId: input.childAccountId,
    status: "active",
    allocatedAmount: input.amount,
    availableAmount: input.amount,
    heldAmount: serializeTokenSubunits(0n),
    spentAmount: serializeTokenSubunits(0n),
    reclaimedAmount: serializeTokenSubunits(0n),
    fundingSlices: input.fundingSlices,
    reclaimedSlices: [],
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(allowance);
  return allowance;
}

/** Adds Guardian-selected source-lot value without replacing prior history. */
export function fundModuleAllowance(
  allowance: ModuleAllowanceV1,
  input: FundModuleAllowanceInputV1,
): ModuleAllowanceV1 {
  assertModuleAllowance(allowance);
  economyAssert(
    allowance.status === "active" && allowance.version === input.expectedVersion,
    "INVALID_CONTRACT",
    "Module Allowance is closed or its optimistic version is stale",
  );
  assertUpdatedAt(allowance.updatedAt, input.occurredAt, "Funding time");
  const amount = assertWholePositive(input.amount, "Module Allowance funding");
  assertPositiveSlices(input.fundingSlices, amount, "Funding slices");
  const next: ModuleAllowanceV1 = {
    ...allowance,
    allocatedAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.allocatedAmount) + amount,
    ),
    availableAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.availableAmount) + amount,
    ),
    fundingSlices: [...allowance.fundingSlices, ...input.fundingSlices],
    version: allowance.version + 1,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(next);
  return next;
}

/** Returns unused value to its source lots without changing spent history. */
export function reclaimModuleAllowance(
  allowance: ModuleAllowanceV1,
  input: ReclaimModuleAllowanceInputV1,
): ModuleAllowanceV1 {
  assertModuleAllowance(allowance);
  economyAssert(
    allowance.status === "active" && allowance.version === input.expectedVersion,
    "INVALID_CONTRACT",
    "Module Allowance is closed or its optimistic version is stale",
  );
  assertUpdatedAt(allowance.updatedAt, input.occurredAt, "Reclaim time");
  const amount = assertWholePositive(input.amount, "Module Allowance reclaim");
  economyAssert(
    amount <= parseTokenSubunits(allowance.availableAmount),
    "INSUFFICIENT_BALANCE",
    "Cannot reclaim held, spent, or unavailable Module Allowance value",
  );
  assertPositiveSlices(input.sourceSlices, amount, "Reclaim slices");
  const fundedLotIds = new Set(
    allowance.fundingSlices.map((slice) => slice.lotId),
  );
  economyAssert(
    input.sourceSlices.every((slice) => fundedLotIds.has(slice.lotId)),
    "SOURCE_LOT_RESTRICTED",
    "Reclaim slices must originate from the Module Allowance",
  );
  const next: ModuleAllowanceV1 = {
    ...allowance,
    availableAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.availableAmount) - amount,
    ),
    reclaimedAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.reclaimedAmount) + amount,
    ),
    reclaimedSlices: [...allowance.reclaimedSlices, ...input.sourceSlices],
    version: allowance.version + 1,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(next);
  return next;
}

/** Closes an empty allowance; funding later requires a new allowance. */
export function closeModuleAllowance(
  allowance: ModuleAllowanceV1,
  input: CloseModuleAllowanceInputV1,
): ModuleAllowanceV1 {
  assertModuleAllowance(allowance);
  economyAssert(
    allowance.status === "active" && allowance.version === input.expectedVersion,
    "INVALID_CONTRACT",
    "Module Allowance is closed or its optimistic version is stale",
  );
  assertUpdatedAt(allowance.updatedAt, input.occurredAt, "Closure time");
  economyAssert(
    parseTokenSubunits(allowance.availableAmount) === 0n &&
      parseTokenSubunits(allowance.heldAmount) === 0n,
    "INVALID_CONTRACT",
    "Available value must be reclaimed and holds resolved before closure",
  );
  const next: ModuleAllowanceV1 = {
    ...allowance,
    status: "closed",
    version: allowance.version + 1,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(next);
  return next;
}

/** Validates immutable price, Guardian acknowledgement, and manifest evidence. */
export function assertModuleSpendQuote(quote: ModuleSpendQuoteV1): void {
  economyAssert(
    quote.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported module-spend quote contract version",
  );
  assertEconomyIdentifier(quote.quoteId, "quoteId");
  assertEconomyIdentifier(quote.allowanceId, "allowanceId");
  assertEconomyIdentifier(quote.householdId, "householdId");
  assertEconomyIdentifier(quote.guardianAccountId, "guardianAccountId");
  assertEconomyIdentifier(quote.childAccountId, "childAccountId");
  assertEconomyIdentifier(quote.moduleVersionId, "moduleVersionId");
  assertEconomyIdentifier(quote.catalogVersion, "catalogVersion");
  assertEconomyIdentifier(
    quote.requirementsManifestVersion,
    "requirementsManifestVersion",
  );
  assertSha256Reference(
    quote.requirementsManifestHash,
    "Requirements manifest hash",
  );
  assertWholePositive(quote.amount, "Module price");
  const acknowledgedAt = parseIsoTimestamp(quote.requirementsAcknowledgedAt);
  const issuedAt = parseIsoTimestamp(quote.issuedAt);
  const expiresAt = parseIsoTimestamp(quote.expiresAt);
  economyAssert(
    acknowledgedAt <= issuedAt && expiresAt > issuedAt,
    "INVALID_TIME_WINDOW",
    "Requirements must be acknowledged before a bounded quote is issued",
  );
}

/** Creates immutable quote evidence from server-derived catalog facts. */
export function createModuleSpendQuote(
  input: CreateModuleSpendQuoteInputV1,
): ModuleSpendQuoteV1 {
  const quote: ModuleSpendQuoteV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    ...input,
  };
  assertModuleSpendQuote(quote);
  return quote;
}

/** Validates one quote-bound hold lifecycle projection. */
export function assertModuleSpendHold(hold: ModuleSpendHoldV1): void {
  economyAssert(
    hold.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported module-spend hold contract version",
  );
  assertEconomyIdentifier(hold.holdId, "holdId");
  assertEconomyIdentifier(hold.quoteId, "quoteId");
  assertEconomyIdentifier(hold.allowanceId, "allowanceId");
  assertEconomyIdentifier(hold.householdId, "householdId");
  assertEconomyIdentifier(hold.guardianAccountId, "guardianAccountId");
  assertEconomyIdentifier(hold.childAccountId, "childAccountId");
  assertEconomyIdentifier(hold.moduleVersionId, "moduleVersionId");
  assertEconomyIdentifier(
    hold.requirementsManifestVersion,
    "requirementsManifestVersion",
  );
  assertSha256Reference(
    hold.requirementsManifestHash,
    "Requirements manifest hash",
  );
  assertEconomyIdentifier(hold.holdIdempotencyKey, "holdIdempotencyKey");
  const amount = assertWholePositive(hold.amount, "Module hold amount");
  assertPositiveSlices(hold.sourceSlices, amount, "Hold source slices");
  economyAssert(
    ["held", "settled", "released"].includes(hold.status),
    "INVALID_CONTRACT",
    "Module hold status is unsupported",
  );
  economyAssert(
    Number.isSafeInteger(hold.version) && hold.version >= 1,
    "INVALID_CONTRACT",
    "Module hold version must be a positive safe integer",
  );
  const createdAt = parseIsoTimestamp(hold.createdAt);
  const expiresAt = parseIsoTimestamp(hold.expiresAt);
  const updatedAt = parseIsoTimestamp(hold.updatedAt);
  economyAssert(
    expiresAt > createdAt && updatedAt >= createdAt,
    "INVALID_TIME_WINDOW",
    "Module hold requires a bounded lifetime and ordered updates",
  );

  if (hold.status === "held") {
    economyAssert(
      hold.entitlementId === undefined &&
        hold.settlementTransactionId === undefined &&
        hold.releaseTransactionId === undefined &&
        hold.settlementIdempotencyKey === undefined &&
        hold.releaseIdempotencyKey === undefined,
      "INVALID_CONTRACT",
      "An unsettled hold cannot claim an entitlement or final transaction",
    );
  } else if (hold.status === "settled") {
    economyAssert(
      hold.entitlementId !== undefined &&
        hold.settlementTransactionId !== undefined &&
        hold.settlementIdempotencyKey !== undefined &&
        hold.releaseTransactionId === undefined &&
        hold.releaseIdempotencyKey === undefined,
      "INVALID_CONTRACT",
      "A settled hold requires entitlement and transaction evidence",
    );
    assertEconomyIdentifier(hold.entitlementId, "entitlementId");
    assertEconomyIdentifier(
      hold.settlementTransactionId,
      "settlementTransactionId",
    );
    assertEconomyIdentifier(
      hold.settlementIdempotencyKey,
      "settlementIdempotencyKey",
    );
  } else {
    economyAssert(
      hold.entitlementId === undefined &&
        hold.settlementTransactionId === undefined &&
        hold.settlementIdempotencyKey === undefined &&
        hold.releaseTransactionId !== undefined &&
        hold.releaseIdempotencyKey !== undefined,
      "INVALID_CONTRACT",
      "A released hold requires release evidence only",
    );
    assertEconomyIdentifier(hold.releaseTransactionId, "releaseTransactionId");
    assertEconomyIdentifier(hold.releaseIdempotencyKey, "releaseIdempotencyKey");
  }
}

function assertAllowanceMatchesQuote(
  allowance: ModuleAllowanceV1,
  quote: ModuleSpendQuoteV1,
): void {
  economyAssert(
    allowance.status === "active" &&
      allowance.allowanceId === quote.allowanceId &&
      allowance.householdId === quote.householdId &&
      allowance.childAccountId === quote.childAccountId,
    "INVALID_CONTRACT",
    "Module quote does not belong to this active child allowance",
  );
}

function assertAllowanceMatchesHold(
  allowance: ModuleAllowanceV1,
  hold: ModuleSpendHoldV1,
): void {
  economyAssert(
    allowance.status === "active" &&
      allowance.allowanceId === hold.allowanceId &&
      allowance.householdId === hold.householdId &&
      allowance.childAccountId === hold.childAccountId,
    "INVALID_CONTRACT",
    "Module hold does not belong to this active child allowance",
  );
}

/** Moves quoted value from available to held after all bindings are checked. */
export function createModuleSpendHold(
  allowance: ModuleAllowanceV1,
  quote: ModuleSpendQuoteV1,
  input: CreateModuleSpendHoldInputV1,
): ModuleSpendTransitionResultV1 {
  assertModuleAllowance(allowance);
  assertModuleSpendQuote(quote);
  assertAllowanceMatchesQuote(allowance, quote);
  economyAssert(
    allowance.version === input.expectedAllowanceVersion,
    "INVALID_CONTRACT",
    "Module Allowance optimistic version is stale",
  );
  const occurredAt = parseIsoTimestamp(input.occurredAt);
  economyAssert(
    occurredAt >= parseIsoTimestamp(allowance.updatedAt) &&
      occurredAt >= parseIsoTimestamp(quote.issuedAt) &&
      occurredAt < parseIsoTimestamp(quote.expiresAt),
    "INVALID_TIME_WINDOW",
    "Module quote is not valid at hold time",
  );
  const amount = parseTokenSubunits(quote.amount);
  economyAssert(
    amount <= parseTokenSubunits(allowance.availableAmount),
    "INSUFFICIENT_BALANCE",
    "Module Allowance has insufficient available value",
  );
  assertEconomyIdentifier(input.holdId, "holdId");
  assertEconomyIdentifier(input.idempotencyKey, "idempotencyKey");
  assertPositiveSlices(input.sourceSlices, amount, "Hold source slices");
  const fundedLotIds = new Set(
    allowance.fundingSlices.map((slice) => slice.lotId),
  );
  economyAssert(
    input.sourceSlices.every((slice) => fundedLotIds.has(slice.lotId)),
    "SOURCE_LOT_RESTRICTED",
    "Hold slices must originate from the Module Allowance",
  );

  const nextAllowance: ModuleAllowanceV1 = {
    ...allowance,
    availableAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.availableAmount) - amount,
    ),
    heldAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.heldAmount) + amount,
    ),
    version: allowance.version + 1,
    updatedAt: input.occurredAt,
  };
  const hold: ModuleSpendHoldV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    holdId: input.holdId,
    quoteId: quote.quoteId,
    allowanceId: quote.allowanceId,
    householdId: quote.householdId,
    guardianAccountId: quote.guardianAccountId,
    childAccountId: quote.childAccountId,
    moduleVersionId: quote.moduleVersionId,
    amount: quote.amount,
    requirementsManifestVersion: quote.requirementsManifestVersion,
    requirementsManifestHash: quote.requirementsManifestHash,
    sourceSlices: input.sourceSlices,
    status: "held",
    holdIdempotencyKey: input.idempotencyKey,
    version: 1,
    createdAt: input.occurredAt,
    expiresAt: quote.expiresAt,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(nextAllowance);
  assertModuleSpendHold(hold);
  return { allowance: nextAllowance, hold };
}

/** Settles a hold only when the pending learning entitlement is identified. */
export function settleModuleSpendHold(
  allowance: ModuleAllowanceV1,
  hold: ModuleSpendHoldV1,
  input: SettleModuleSpendHoldInputV1,
): ModuleSpendTransitionResultV1 {
  assertModuleAllowance(allowance);
  assertModuleSpendHold(hold);
  assertAllowanceMatchesHold(allowance, hold);
  economyAssert(
    hold.status === "held" &&
      allowance.version === input.expectedAllowanceVersion &&
      hold.version === input.expectedHoldVersion,
    "INVALID_CONTRACT",
    "Module hold is final or an optimistic version is stale",
  );
  assertEconomyIdentifier(input.entitlementId, "entitlementId");
  assertEconomyIdentifier(
    input.settlementTransactionId,
    "settlementTransactionId",
  );
  assertEconomyIdentifier(input.idempotencyKey, "idempotencyKey");
  const occurredAt = parseIsoTimestamp(input.occurredAt);
  economyAssert(
    occurredAt >= parseIsoTimestamp(allowance.updatedAt) &&
      occurredAt >= parseIsoTimestamp(hold.updatedAt) &&
      occurredAt < parseIsoTimestamp(hold.expiresAt),
    "INVALID_TIME_WINDOW",
    "Module hold cannot settle outside its valid lifetime",
  );
  const amount = parseTokenSubunits(hold.amount);
  economyAssert(
    amount <= parseTokenSubunits(allowance.heldAmount),
    "INSUFFICIENT_BALANCE",
    "Module Allowance does not contain the quoted held value",
  );
  const nextAllowance: ModuleAllowanceV1 = {
    ...allowance,
    heldAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.heldAmount) - amount,
    ),
    spentAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.spentAmount) + amount,
    ),
    version: allowance.version + 1,
    updatedAt: input.occurredAt,
  };
  const nextHold: ModuleSpendHoldV1 = {
    ...hold,
    status: "settled",
    settlementIdempotencyKey: input.idempotencyKey,
    entitlementId: input.entitlementId,
    settlementTransactionId: input.settlementTransactionId,
    version: hold.version + 1,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(nextAllowance);
  assertModuleSpendHold(nextHold);
  return { allowance: nextAllowance, hold: nextHold };
}

/** Releases failed or expired held value back to the same allowance. */
export function releaseModuleSpendHold(
  allowance: ModuleAllowanceV1,
  hold: ModuleSpendHoldV1,
  input: ReleaseModuleSpendHoldInputV1,
): ModuleSpendTransitionResultV1 {
  assertModuleAllowance(allowance);
  assertModuleSpendHold(hold);
  assertAllowanceMatchesHold(allowance, hold);
  economyAssert(
    hold.status === "held" &&
      allowance.version === input.expectedAllowanceVersion &&
      hold.version === input.expectedHoldVersion,
    "INVALID_CONTRACT",
    "Module hold is final or an optimistic version is stale",
  );
  assertEconomyIdentifier(input.releaseTransactionId, "releaseTransactionId");
  assertEconomyIdentifier(input.idempotencyKey, "idempotencyKey");
  const occurredAt = parseIsoTimestamp(input.occurredAt);
  economyAssert(
    occurredAt >= parseIsoTimestamp(allowance.updatedAt) &&
      occurredAt >= parseIsoTimestamp(hold.updatedAt),
    "INVALID_TIME_WINDOW",
    "Module hold release cannot precede its current state",
  );
  const amount = parseTokenSubunits(hold.amount);
  economyAssert(
    amount <= parseTokenSubunits(allowance.heldAmount),
    "INSUFFICIENT_BALANCE",
    "Module Allowance does not contain the quoted held value",
  );
  const nextAllowance: ModuleAllowanceV1 = {
    ...allowance,
    availableAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.availableAmount) + amount,
    ),
    heldAmount: serializeTokenSubunits(
      parseTokenSubunits(allowance.heldAmount) - amount,
    ),
    version: allowance.version + 1,
    updatedAt: input.occurredAt,
  };
  const nextHold: ModuleSpendHoldV1 = {
    ...hold,
    status: "released",
    releaseIdempotencyKey: input.idempotencyKey,
    releaseTransactionId: input.releaseTransactionId,
    version: hold.version + 1,
    updatedAt: input.occurredAt,
  };
  assertModuleAllowance(nextAllowance);
  assertModuleSpendHold(nextHold);
  return { allowance: nextAllowance, hold: nextHold };
}

/** Validates a durable receipt against settled economic evidence. */
export function assertModulePurchaseReceipt(
  receipt: ModulePurchaseReceiptV1,
): void {
  economyAssert(
    receipt.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported module-purchase receipt contract version",
  );
  assertEconomyIdentifier(receipt.receiptId, "receiptId");
  assertEconomyIdentifier(receipt.quoteId, "quoteId");
  assertEconomyIdentifier(receipt.holdId, "holdId");
  assertEconomyIdentifier(receipt.allowanceId, "allowanceId");
  assertEconomyIdentifier(receipt.householdId, "householdId");
  assertEconomyIdentifier(receipt.guardianAccountId, "guardianAccountId");
  assertEconomyIdentifier(receipt.childAccountId, "childAccountId");
  assertEconomyIdentifier(receipt.moduleVersionId, "moduleVersionId");
  assertEconomyIdentifier(receipt.entitlementId, "entitlementId");
  assertEconomyIdentifier(
    receipt.requirementsManifestVersion,
    "requirementsManifestVersion",
  );
  assertSha256Reference(
    receipt.requirementsManifestHash,
    "Requirements manifest hash",
  );
  assertEconomyIdentifier(
    receipt.settlementTransactionId,
    "settlementTransactionId",
  );
  assertWholePositive(receipt.amount, "Receipt amount");
  parseIsoTimestamp(receipt.issuedAt);
}

/** Creates a receipt only when quote and settled hold evidence match exactly. */
export function createModulePurchaseReceipt(
  quote: ModuleSpendQuoteV1,
  hold: ModuleSpendHoldV1,
  input: CreateModulePurchaseReceiptInputV1,
): ModulePurchaseReceiptV1 {
  assertModuleSpendQuote(quote);
  assertModuleSpendHold(hold);
  economyAssert(
    hold.status === "settled" &&
      hold.quoteId === quote.quoteId &&
      hold.allowanceId === quote.allowanceId &&
      hold.householdId === quote.householdId &&
      hold.guardianAccountId === quote.guardianAccountId &&
      hold.childAccountId === quote.childAccountId &&
      hold.moduleVersionId === quote.moduleVersionId &&
      hold.amount === quote.amount &&
      hold.requirementsManifestVersion === quote.requirementsManifestVersion &&
      hold.requirementsManifestHash === quote.requirementsManifestHash,
    "INVALID_CONTRACT",
    "Receipt quote and settled hold evidence do not match",
  );
  economyAssert(
    parseIsoTimestamp(input.issuedAt) >= parseIsoTimestamp(hold.updatedAt),
    "INVALID_TIME_WINDOW",
    "Receipt cannot precede settlement",
  );
  const receipt: ModulePurchaseReceiptV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    receiptId: input.receiptId,
    quoteId: quote.quoteId,
    holdId: hold.holdId,
    allowanceId: quote.allowanceId,
    householdId: quote.householdId,
    guardianAccountId: quote.guardianAccountId,
    childAccountId: quote.childAccountId,
    moduleVersionId: quote.moduleVersionId,
    entitlementId: hold.entitlementId!,
    amount: quote.amount,
    requirementsManifestVersion: quote.requirementsManifestVersion,
    requirementsManifestHash: quote.requirementsManifestHash,
    settlementTransactionId: hold.settlementTransactionId!,
    issuedAt: input.issuedAt,
  };
  assertModulePurchaseReceipt(receipt);
  return receipt;
}

/** Validates privacy-minimized cross-service reconciliation evidence. */
export function assertModulePurchaseReconciliationObservation(
  observation: ModulePurchaseReconciliationObservationV1,
): void {
  economyAssert(
    observation.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported module-purchase reconciliation contract version",
  );
  assertEconomyIdentifier(observation.quoteId, "quoteId");
  assertEconomyIdentifier(observation.holdId, "holdId");
  assertEconomyIdentifier(observation.childAccountId, "childAccountId");
  assertEconomyIdentifier(observation.moduleVersionId, "moduleVersionId");
  economyAssert(
    ["missing", "held", "settled", "released"].includes(
      observation.financialState,
    ),
    "INVALID_CONTRACT",
    "Reconciliation financial state is unsupported",
  );
  economyAssert(
    ["missing", "pending", "active", "cancelled"].includes(
      observation.entitlementState,
    ),
    "INVALID_CONTRACT",
    "Reconciliation entitlement state is unsupported",
  );
  economyAssert(
    typeof observation.receiptPresent === "boolean",
    "INVALID_CONTRACT",
    "Receipt presence must be Boolean",
  );
  parseIsoTimestamp(observation.observedAt);
}

function reconciliationResult(
  action: ModulePurchaseReconciliationActionV1,
  reasonCode: string,
  blocking = false,
  consistent = false,
): ModulePurchaseReconciliationResultV1 {
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    action,
    blocking,
    consistent,
    reasonCode,
  };
}

/**
 * Returns one forward-safe action. Callers must reload and lock authoritative
 * state before carrying it out; `manual-review` never authorizes a mutation.
 */
export function reconcileModulePurchase(
  observation: ModulePurchaseReconciliationObservationV1,
): ModulePurchaseReconciliationResultV1 {
  assertModulePurchaseReconciliationObservation(observation);
  const { financialState, entitlementState, receiptPresent } = observation;

  if (receiptPresent && !(financialState === "settled" && entitlementState === "active")) {
    return reconciliationResult(
      "manual-review",
      "receipt-conflicts-with-authoritative-state",
      true,
    );
  }
  if (financialState === "settled" && entitlementState === "active") {
    return receiptPresent
      ? reconciliationResult("none", "purchase-consistent", false, true)
      : reconciliationResult("issue-receipt", "settled-active-receipt-missing");
  }
  if (financialState === "held" && entitlementState === "pending") {
    return reconciliationResult("resume-settlement", "held-pending");
  }
  if (
    financialState === "held" &&
    (entitlementState === "missing" || entitlementState === "cancelled")
  ) {
    return reconciliationResult("release-hold", "held-without-usable-entitlement");
  }
  if (financialState === "settled" && entitlementState === "pending") {
    return reconciliationResult("activate-entitlement", "settled-pending");
  }
  if (
    (financialState === "missing" || financialState === "released") &&
    entitlementState === "pending"
  ) {
    return reconciliationResult(
      "cancel-pending-entitlement",
      "pending-without-settlement-path",
    );
  }
  if (
    (financialState === "missing" || financialState === "released") &&
    (entitlementState === "missing" || entitlementState === "cancelled")
  ) {
    return reconciliationResult("none", "no-active-purchase", false, true);
  }
  return reconciliationResult(
    "manual-review",
    financialState === "settled"
      ? "settled-debit-without-entitlement"
      : "active-entitlement-without-settled-debit",
    true,
  );
}
