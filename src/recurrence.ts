import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type EconomyContractVersion,
  type IsoTimestamp,
} from "./contracts.js";
import {
  isWholeTokenAmount,
  parseTokenSubunits,
  serializeTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import { economyAssert } from "./errors.js";

export type RecurrenceInterval = "daily" | "weekly" | "monthly";

/** Provider-neutral subscription contract. Site policy controls enablement. */
export interface TokenSubscriptionPlanV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly planId: string;
  readonly catalogVersion: string;
  readonly interval: RecurrenceInterval;
  readonly priceMinorUnits: string;
  readonly currency: "GBP";
  readonly grantAmount: TokenSubunitString;
  readonly enabled: boolean;
  readonly effectiveFrom: IsoTimestamp;
}

/** Future convenience plan contract; disabled until public spend is live. */
export const BASELINE_MONTHLY_SUBSCRIPTION_PLAN: TokenSubscriptionPlanV1 =
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    planId: "monthly-10-100-v1",
    catalogVersion: "gbp-subscriptions-v1",
    interval: "monthly",
    priceMinorUnits: "1000",
    currency: "GBP",
    grantAmount: serializeTokenSubunits(100_000n),
    enabled: false,
    effectiveFrom: "2026-07-15T00:00:00.000Z",
  });

/** Validates future provider-neutral recurrence without enabling it. */
export function assertTokenSubscriptionPlan(
  plan: TokenSubscriptionPlanV1,
): void {
  economyAssert(
    plan.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported subscription-plan contract version",
  );
  assertEconomyIdentifier(plan.planId, "planId");
  assertEconomyIdentifier(plan.catalogVersion, "catalogVersion");
  economyAssert(
    ["daily", "weekly", "monthly"].includes(plan.interval) &&
      plan.currency === "GBP" &&
      typeof plan.enabled === "boolean",
    "INVALID_CONTRACT",
    "Subscription recurrence, currency, or enabled state is invalid",
  );
  economyAssert(
    /^(?:0|[1-9][0-9]*)$/u.test(plan.priceMinorUnits) &&
      BigInt(plan.priceMinorUnits) > 0n,
    "INVALID_AMOUNT",
    "Subscription price must be a positive integer minor-unit string",
  );
  const grantAmount = parseTokenSubunits(plan.grantAmount);
  economyAssert(
    grantAmount > 0n && isWholeTokenAmount(grantAmount),
    "AMOUNT_NOT_WHOLE_TOKEN",
    "Subscription grants must contain whole Tokens",
  );
  parseIsoTimestamp(plan.effectiveFrom);
}
