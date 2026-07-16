import {
  parseTokenSubunits,
  serializeTokenSubunits,
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
  type LotId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";

export const PRE_UTILITY_BACKER_COHORT = "pre_utility_backer_v1" as const;

export interface EarlyBackerWindowV1 {
  readonly publicTokensLaunchAt: IsoTimestamp;
  readonly firstPublicSpendLiveAt?: IsoTimestamp;
}

/** Paid-lot facts required to recalculate retained early-backer basis. */
export interface PaidLotRetentionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly lotId: LotId;
  readonly payerAccountId: AccountId;
  readonly receivingHouseholdId: HouseholdId;
  readonly purchaseId: string;
  readonly catalogVersion: string;
  readonly purchasedAt: IsoTimestamp;
  readonly settledAt: IsoTimestamp;
  readonly creditedAt: IsoTimestamp;
  readonly retainedAmount: TokenSubunitString;
}

export interface EarlyBackerEvaluationV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly cohortKey: typeof PRE_UTILITY_BACKER_COHORT;
  readonly status: "not-qualified" | "provisional";
  readonly payerAccountId: AccountId;
  readonly receivingHouseholdId: HouseholdId;
  readonly netRetainedAmount: TokenSubunitString;
  readonly contributingLotIds: readonly LotId[];
  readonly evaluatedAt: IsoTimestamp;
}

export const EARLY_BACKER_SETTLEMENT_POLICY_V2 =
  "settlement-window-v2" as const;

/**
 * Additive evaluation result using settlement as the sole qualification event.
 * Purchase and credit times remain provenance/order facts.
 */
export interface EarlyBackerEvaluationV2 {
  readonly schemaVersion: EconomyContractVersion;
  readonly policyVersion: typeof EARLY_BACKER_SETTLEMENT_POLICY_V2;
  readonly qualificationEvent: "settled-at";
  readonly cohortKey: typeof PRE_UTILITY_BACKER_COHORT;
  readonly status: "not-qualified" | "provisional";
  readonly payerAccountId: AccountId;
  readonly receivingHouseholdId: HouseholdId;
  readonly netRetainedAmount: TokenSubunitString;
  readonly contributingLotIds: readonly LotId[];
  readonly evaluatedAt: IsoTimestamp;
}

function isWithinWindow(
  timestamp: IsoTimestamp,
  launch: number,
  cutoff: number | undefined,
): boolean {
  const value = parseIsoTimestamp(timestamp);
  return value >= launch && (cutoff === undefined || value < cutoff);
}

/**
 * Recalculates provisional cohort basis from retained paid lots. It promises no
 * future reward and deliberately has no permanent entitled state.
 */
export function evaluateEarlyBacker(
  payerAccountId: AccountId,
  receivingHouseholdId: HouseholdId,
  paidLots: readonly PaidLotRetentionV1[],
  window: EarlyBackerWindowV1,
  evaluatedAt: IsoTimestamp,
): EarlyBackerEvaluationV1 {
  assertEconomyIdentifier(payerAccountId, "payerAccountId");
  assertEconomyIdentifier(receivingHouseholdId, "receivingHouseholdId");
  const launch = parseIsoTimestamp(window.publicTokensLaunchAt);
  const cutoff =
    window.firstPublicSpendLiveAt === undefined
      ? undefined
      : parseIsoTimestamp(window.firstPublicSpendLiveAt);
  economyAssert(
    cutoff === undefined || cutoff > launch,
    "INVALID_TIME_WINDOW",
    "First public spend must occur after public Token launch",
  );
  parseIsoTimestamp(evaluatedAt);

  let retained = 0n;
  const contributingLotIds: LotId[] = [];
  const seenLotIds = new Set<string>();
  for (const lot of paidLots) {
    economyAssert(
      lot.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported paid-lot retention contract version",
    );
    assertEconomyIdentifier(lot.lotId, "lotId");
    economyAssert(
      !seenLotIds.has(lot.lotId),
      "DUPLICATE_IDENTIFIER",
      "Paid-lot retention input must not repeat a source lot",
    );
    seenLotIds.add(lot.lotId);
    assertEconomyIdentifier(lot.payerAccountId, "payerAccountId");
    assertEconomyIdentifier(lot.receivingHouseholdId, "receivingHouseholdId");
    assertEconomyIdentifier(lot.purchaseId, "purchaseId");
    assertEconomyIdentifier(lot.catalogVersion, "catalogVersion");
    const purchasedAt = parseIsoTimestamp(lot.purchasedAt);
    const settledAt = parseIsoTimestamp(lot.settledAt);
    const creditedAt = parseIsoTimestamp(lot.creditedAt);
    economyAssert(
      purchasedAt <= settledAt && settledAt <= creditedAt,
      "INVALID_TIME_WINDOW",
      "Paid-lot timestamps must follow purchase, settlement, then credit order",
    );
    if (
      lot.payerAccountId !== payerAccountId ||
      lot.receivingHouseholdId !== receivingHouseholdId
    ) {
      continue;
    }
    const inWindow =
      isWithinWindow(lot.purchasedAt, launch, cutoff) &&
      isWithinWindow(lot.settledAt, launch, cutoff) &&
      isWithinWindow(lot.creditedAt, launch, cutoff);
    const amount = parseTokenSubunits(lot.retainedAmount);
    economyAssert(
      amount >= 0n,
      "INVALID_AMOUNT",
      "Retained paid-lot basis cannot be negative",
    );
    if (inWindow && amount > 0n) {
      retained += amount;
      contributingLotIds.push(lot.lotId);
    }
  }

  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    cohortKey: PRE_UTILITY_BACKER_COHORT,
    status: retained > 0n ? "provisional" : "not-qualified",
    payerAccountId,
    receivingHouseholdId,
    netRetainedAmount: serializeTokenSubunits(retained),
    contributingLotIds: contributingLotIds.sort((left, right) =>
      left.localeCompare(right),
    ),
    evaluatedAt,
  };
}

/**
 * Evaluates the approved settlement-window policy. The caller owns environment
 * and rollout classification: `publicTokensLaunchAt` and
 * `firstPublicSpendLiveAt` must be derived from the entire public cohort, so
 * staff, test, and closed-beta availability cannot open or close this window.
 * The caller must also exclude non-production/test lots before evaluation.
 */
export function evaluateEarlyBackerBySettlementV2(
  payerAccountId: AccountId,
  receivingHouseholdId: HouseholdId,
  paidLots: readonly PaidLotRetentionV1[],
  window: EarlyBackerWindowV1,
  evaluatedAt: IsoTimestamp,
): EarlyBackerEvaluationV2 {
  assertEconomyIdentifier(payerAccountId, "payerAccountId");
  assertEconomyIdentifier(receivingHouseholdId, "receivingHouseholdId");
  const launch = parseIsoTimestamp(window.publicTokensLaunchAt);
  const cutoff =
    window.firstPublicSpendLiveAt === undefined
      ? undefined
      : parseIsoTimestamp(window.firstPublicSpendLiveAt);
  economyAssert(
    cutoff === undefined || cutoff > launch,
    "INVALID_TIME_WINDOW",
    "First public spend must occur after public Token launch",
  );
  const evaluationTime = parseIsoTimestamp(evaluatedAt);

  let retained = 0n;
  const contributingLotIds: LotId[] = [];
  const seenLotIds = new Set<string>();
  for (const lot of paidLots) {
    economyAssert(
      lot.schemaVersion === ECONOMY_CONTRACT_VERSION,
      "INVALID_CONTRACT",
      "Unsupported paid-lot retention contract version",
    );
    assertEconomyIdentifier(lot.lotId, "lotId");
    economyAssert(
      !seenLotIds.has(lot.lotId),
      "DUPLICATE_IDENTIFIER",
      "Paid-lot retention input must not repeat a source lot",
    );
    seenLotIds.add(lot.lotId);
    assertEconomyIdentifier(lot.payerAccountId, "payerAccountId");
    assertEconomyIdentifier(lot.receivingHouseholdId, "receivingHouseholdId");
    assertEconomyIdentifier(lot.purchaseId, "purchaseId");
    assertEconomyIdentifier(lot.catalogVersion, "catalogVersion");
    const purchasedAt = parseIsoTimestamp(lot.purchasedAt);
    const settledAt = parseIsoTimestamp(lot.settledAt);
    const creditedAt = parseIsoTimestamp(lot.creditedAt);
    economyAssert(
      purchasedAt <= settledAt && settledAt <= creditedAt,
      "INVALID_TIME_WINDOW",
      "Paid-lot timestamps must follow purchase, settlement, then credit order",
    );
    const amount = parseTokenSubunits(lot.retainedAmount);
    economyAssert(
      amount >= 0n,
      "INVALID_AMOUNT",
      "Retained paid-lot basis cannot be negative",
    );
    if (
      lot.payerAccountId === payerAccountId &&
      lot.receivingHouseholdId === receivingHouseholdId &&
      settledAt >= launch &&
      (cutoff === undefined || settledAt < cutoff) &&
      settledAt <= evaluationTime &&
      amount > 0n
    ) {
      retained += amount;
      contributingLotIds.push(lot.lotId);
    }
  }

  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    policyVersion: EARLY_BACKER_SETTLEMENT_POLICY_V2,
    qualificationEvent: "settled-at",
    cohortKey: PRE_UTILITY_BACKER_COHORT,
    status: retained > 0n ? "provisional" : "not-qualified",
    payerAccountId,
    receivingHouseholdId,
    netRetainedAmount: serializeTokenSubunits(retained),
    contributingLotIds: contributingLotIds.sort((left, right) =>
      left.localeCompare(right),
    ),
    evaluatedAt,
  };
}
