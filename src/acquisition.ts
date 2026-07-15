import {
  TOKEN_SUBUNITS_PER_TOKEN,
  isWholeTokenAmount,
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
  type ProviderEventId,
  type WalletId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import type { ActivityStatus, ActivityType } from "./ledger.js";

export interface TokenPackV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly packId: string;
  readonly catalogVersion: string;
  readonly currency: "GBP";
  readonly priceMinorUnits: string;
  readonly grantAmount: TokenSubunitString;
  readonly active: boolean;
}

/** Product-copy reference only; it is not a redemption or exchange promise. */
export interface TokenReferenceRateV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly rateVersion: string;
  readonly currency: "GBP";
  readonly referenceMinorUnitsPerToken: string;
  readonly tokenSubunitsPerToken: string;
  readonly cashRedemptionAllowed: false;
}

export const BASELINE_GBP_REFERENCE_RATE: TokenReferenceRateV1 = Object.freeze({
  schemaVersion: ECONOMY_CONTRACT_VERSION,
  rateVersion: "gbp-reference-v1",
  currency: "GBP",
  referenceMinorUnitsPerToken: "10",
  tokenSubunitsPerToken: TOKEN_SUBUNITS_PER_TOKEN.toString(10),
  cashRedemptionAllowed: false,
});

export const BASELINE_GBP_CATALOG_VERSION = "gbp-v1" as const;

/** Initial flat-price public catalog. Changes require a new catalog version. */
export const BASELINE_GBP_TOKEN_PACKS: readonly TokenPackV1[] = Object.freeze([
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    packId: "gbp_5_50_v1",
    catalogVersion: BASELINE_GBP_CATALOG_VERSION,
    currency: "GBP",
    priceMinorUnits: "500",
    grantAmount: serializeTokenSubunits(50_000n),
    active: true,
  }),
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    packId: "gbp_10_100_v1",
    catalogVersion: BASELINE_GBP_CATALOG_VERSION,
    currency: "GBP",
    priceMinorUnits: "1000",
    grantAmount: serializeTokenSubunits(100_000n),
    active: true,
  }),
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    packId: "gbp_25_250_v1",
    catalogVersion: BASELINE_GBP_CATALOG_VERSION,
    currency: "GBP",
    priceMinorUnits: "2500",
    grantAmount: serializeTokenSubunits(250_000n),
    active: true,
  }),
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    packId: "gbp_50_500_v1",
    catalogVersion: BASELINE_GBP_CATALOG_VERSION,
    currency: "GBP",
    priceMinorUnits: "5000",
    grantAmount: serializeTokenSubunits(500_000n),
    active: true,
  }),
]);

export interface PurchaseLimitPolicyV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly maxOrderPriceMinorUnits: string;
  readonly rollingPayerPriceMinorUnits: string;
  readonly rollingHouseholdPriceMinorUnits: string;
  readonly rollingDays: number;
}

/** Default server limits; household controls may only lower these values. */
export const BASELINE_PURCHASE_LIMIT_POLICY: PurchaseLimitPolicyV1 =
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    maxOrderPriceMinorUnits: "5000",
    rollingPayerPriceMinorUnits: "10000",
    rollingHouseholdPriceMinorUnits: "10000",
    rollingDays: 30,
  });

export type PurchaseIntentStatus =
  | "created"
  | "checkout-created"
  | "paid-unreconciled"
  | "credited"
  | "expired"
  | "cancelled"
  | "disputed";

/** Short-lived server authority binding checkout facts to a payer/household. */
export interface PurchaseIntentV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly intentId: string;
  readonly payerAccountId: AccountId;
  readonly receivingHouseholdId: HouseholdId;
  readonly receivingWalletId: WalletId;
  readonly packId: string;
  readonly catalogVersion: string;
  readonly expectedCurrency: "GBP";
  readonly expectedPriceMinorUnits: string;
  readonly grantAmount: TokenSubunitString;
  readonly status: PurchaseIntentStatus;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly providerCheckoutReferenceHash?: string;
}

export interface RewardRateV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly rateVersion: string;
  readonly provider: "ayet" | "bitlabs";
  /** TokenSubunits granted per denominator of authoritative GBP minor units. */
  readonly tokenSubunitsNumerator: string;
  readonly gbpMinorUnitsDenominator: string;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveUntil?: IsoTimestamp;
}

export interface FxSnapshotV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly snapshotId: string;
  readonly sourceCurrency: string;
  readonly quoteCurrency: "GBP";
  /** Exact rational conversion to GBP minor units. */
  readonly gbpMinorUnitsNumerator: string;
  readonly sourceMinorUnitsDenominator: string;
  readonly capturedAt: IsoTimestamp;
}

export type RewardConversionStatus =
  | "pending"
  | "completed"
  | "reconciled";

export type BitLabsConversionState =
  | "PENDING"
  | "COMPLETED"
  | "RECONCILED";

export interface RewardActivityTransitionV1 {
  readonly conversionStatus: RewardConversionStatus;
  readonly activityType: ActivityType;
  readonly activityStatus: ActivityStatus;
}

export interface RewardConversionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly provider: "ayet" | "bitlabs";
  readonly providerEventId: ProviderEventId;
  readonly beneficiaryAccountId: AccountId;
  readonly walletId: WalletId;
  readonly status: RewardConversionStatus;
  readonly providerPayoutMinorUnits: string;
  readonly providerCurrency: string;
  readonly gbpMinorUnits: string;
  readonly tokenSubunits: TokenSubunitString;
  readonly rateVersion: string;
  readonly fxSnapshotId: string;
  readonly occurredAt: IsoTimestamp;
}

/** Validates a minimized, signed-provider conversion record before journaling. */
export function assertRewardConversion(
  conversion: RewardConversionV1,
): void {
  economyAssert(
    conversion.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported reward-conversion contract version",
  );
  economyAssert(
    conversion.provider === "ayet" || conversion.provider === "bitlabs",
    "INVALID_CONTRACT",
    "Unsupported reward-conversion provider",
  );
  assertEconomyIdentifier(conversion.providerEventId, "providerEventId");
  assertEconomyIdentifier(
    conversion.beneficiaryAccountId,
    "beneficiaryAccountId",
  );
  assertEconomyIdentifier(conversion.walletId, "walletId");
  economyAssert(
    ["pending", "completed", "reconciled"].includes(conversion.status),
    "INVALID_CONTRACT",
    "Unsupported reward-conversion status",
  );
  economyAssert(
    /^[A-Z]{3}$/u.test(conversion.providerCurrency),
    "INVALID_CONTRACT",
    "Reward payout currency must use an uppercase ISO code",
  );
  economyAssert(
    parseNonNegativeInteger(
      conversion.providerPayoutMinorUnits,
      "Provider payout",
    ) > 0n &&
      parseNonNegativeInteger(conversion.gbpMinorUnits, "GBP payout") >= 0n &&
      parseTokenSubunits(conversion.tokenSubunits) > 0n,
    "INVALID_AMOUNT",
    "Reward conversion must carry positive payout and Token values",
  );
  assertEconomyIdentifier(conversion.rateVersion, "rateVersion");
  assertEconomyIdentifier(conversion.fxSnapshotId, "fxSnapshotId");
  parseIsoTimestamp(conversion.occurredAt);
}

function parseNonNegativeInteger(value: string, label: string): bigint {
  economyAssert(
    /^(?:0|[1-9][0-9]*)$/u.test(value),
    "INVALID_AMOUNT",
    `${label} must be a non-negative integer string`,
  );
  return BigInt(value);
}

/** Validates a paid pack; pack grants are whole Tokens in the baseline. */
export function assertTokenPack(pack: TokenPackV1): void {
  economyAssert(
    pack.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported Token pack contract version",
  );
  assertEconomyIdentifier(pack.packId, "packId");
  assertEconomyIdentifier(pack.catalogVersion, "catalogVersion");
  economyAssert(
    pack.currency === "GBP" && typeof pack.active === "boolean",
    "INVALID_CONTRACT",
    "Token packs must use GBP and declare whether they are active",
  );
  economyAssert(
    parseNonNegativeInteger(pack.priceMinorUnits, "Pack price") > 0n,
    "INVALID_AMOUNT",
    "Pack price must be positive",
  );
  const grant = parseTokenSubunits(pack.grantAmount);
  economyAssert(
    grant > 0n && isWholeTokenAmount(grant),
    "AMOUNT_NOT_WHOLE_TOKEN",
    "Paid pack grants must contain whole Tokens",
  );
}

/** Validates nominal reference metadata without creating redemption rights. */
export function assertTokenReferenceRate(
  rate: TokenReferenceRateV1,
): void {
  economyAssert(
    rate.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported Token reference-rate contract version",
  );
  assertEconomyIdentifier(rate.rateVersion, "rateVersion");
  const referenceMinorUnits = parseNonNegativeInteger(
    rate.referenceMinorUnitsPerToken,
    "Reference minor units per Token",
  );
  const subunitsPerToken = parseNonNegativeInteger(
    rate.tokenSubunitsPerToken,
    "TokenSubunits per Token",
  );
  economyAssert(
    rate.currency === "GBP" &&
      referenceMinorUnits > 0n &&
      subunitsPerToken === TOKEN_SUBUNITS_PER_TOKEN &&
      rate.cashRedemptionAllowed === false,
    "INVALID_CONTRACT",
    "Token reference rate must preserve the GBP nominal, subunit, and no-redemption boundary",
  );
}

/** Proves that every pack in one catalog uses the same flat nominal ratio. */
export function assertFlatTokenCatalog(
  packs: readonly TokenPackV1[],
  referenceRate: TokenReferenceRateV1,
): void {
  assertTokenReferenceRate(referenceRate);
  economyAssert(
    packs.length > 0,
    "INVALID_CONTRACT",
    "Token catalog must contain at least one pack",
  );
  const packIds = new Set<string>();
  const catalogVersion = packs[0]?.catalogVersion;
  const referenceMinorUnits = BigInt(
    referenceRate.referenceMinorUnitsPerToken,
  );
  const subunitsPerToken = BigInt(referenceRate.tokenSubunitsPerToken);
  for (const pack of packs) {
    assertTokenPack(pack);
    economyAssert(
      !packIds.has(pack.packId),
      "DUPLICATE_IDENTIFIER",
      "Token catalog pack IDs must be unique",
    );
    economyAssert(
      pack.catalogVersion === catalogVersion,
      "INVALID_CONTRACT",
      "Token catalog packs must share one catalog version",
    );
    packIds.add(pack.packId);
    const scaledReference =
      parseTokenSubunits(pack.grantAmount) * referenceMinorUnits;
    economyAssert(
      scaledReference % subunitsPerToken === 0n &&
        scaledReference / subunitsPerToken === BigInt(pack.priceMinorUnits),
      "INVALID_CONTRACT",
      "Token catalog must use the declared flat nominal reference ratio",
    );
  }
}

/** Validates server-side order and rolling acquisition ceilings. */
export function assertPurchaseLimitPolicy(
  policy: PurchaseLimitPolicyV1,
): void {
  economyAssert(
    policy.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-limit contract version",
  );
  const maxOrder = parseNonNegativeInteger(
    policy.maxOrderPriceMinorUnits,
    "Maximum order",
  );
  const payer = parseNonNegativeInteger(
    policy.rollingPayerPriceMinorUnits,
    "Rolling payer limit",
  );
  const household = parseNonNegativeInteger(
    policy.rollingHouseholdPriceMinorUnits,
    "Rolling household limit",
  );
  economyAssert(
    maxOrder > 0n && payer >= maxOrder && household >= maxOrder,
    "INVALID_AMOUNT",
    "Rolling purchase limits must cover at least one maximum order",
  );
  economyAssert(
    Number.isSafeInteger(policy.rollingDays) &&
      policy.rollingDays >= 1 &&
      policy.rollingDays <= 365,
    "INVALID_CONTRACT",
    "Purchase-limit rolling window must be a bounded whole-day count",
  );
}

/** Validates the immutable server-side facts bound into a purchase intent. */
export function assertPurchaseIntentBinding(
  intent: PurchaseIntentV1,
  pack: TokenPackV1,
): void {
  assertTokenPack(pack);
  economyAssert(
    intent.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported purchase-intent contract version",
  );
  assertEconomyIdentifier(intent.intentId, "intentId");
  assertEconomyIdentifier(intent.payerAccountId, "payerAccountId");
  assertEconomyIdentifier(intent.receivingHouseholdId, "receivingHouseholdId");
  assertEconomyIdentifier(intent.receivingWalletId, "receivingWalletId");
  assertEconomyIdentifier(intent.packId, "packId");
  assertEconomyIdentifier(intent.catalogVersion, "catalogVersion");

  const createdAt = parseIsoTimestamp(intent.createdAt);
  const expiresAt = parseIsoTimestamp(intent.expiresAt);
  economyAssert(
    expiresAt > createdAt,
    "INVALID_TIME_WINDOW",
    "Purchase intent expiry must follow its creation time",
  );
  economyAssert(
    intent.expectedCurrency === "GBP" &&
      intent.packId === pack.packId &&
      intent.catalogVersion === pack.catalogVersion &&
      intent.expectedCurrency === pack.currency &&
      intent.expectedPriceMinorUnits === pack.priceMinorUnits &&
      intent.grantAmount === pack.grantAmount,
    "INVALID_CONTRACT",
    "Purchase intent does not match its authoritative catalog pack",
  );
  parseNonNegativeInteger(intent.expectedPriceMinorUnits, "Expected price");
  parseTokenSubunits(intent.grantAmount);
  economyAssert(
    [
      "created",
      "checkout-created",
      "paid-unreconciled",
      "credited",
      "expired",
      "cancelled",
      "disputed",
    ].includes(intent.status),
    "INVALID_CONTRACT",
    "Purchase intent has an unsupported status",
  );
  if (intent.providerCheckoutReferenceHash !== undefined) {
    economyAssert(
      /^sha256:[a-f0-9]{64}$/u.test(intent.providerCheckoutReferenceHash),
      "INVALID_CONTRACT",
      "Checkout references must be stored as sanitized SHA-256 hashes",
    );
  }
}

/** Rejects stale, inactive, or already-consumed intents before checkout creation. */
export function assertOpenPurchaseIntent(
  intent: PurchaseIntentV1,
  pack: TokenPackV1,
  checkedAt: IsoTimestamp,
): void {
  assertPurchaseIntentBinding(intent, pack);
  const checkedAtValue = parseIsoTimestamp(checkedAt);
  economyAssert(
    pack.active &&
      (intent.status === "created" || intent.status === "checkout-created") &&
      checkedAtValue >= parseIsoTimestamp(intent.createdAt) &&
      checkedAtValue < parseIsoTimestamp(intent.expiresAt),
    "INVALID_TIME_WINDOW",
    "Purchase intent is inactive, expired, or not open for checkout",
  );
}

export function assertRewardRate(rate: RewardRateV1): void {
  economyAssert(
    rate.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported reward-rate contract version",
  );
  assertEconomyIdentifier(rate.rateVersion, "rateVersion");
  economyAssert(
    rate.provider === "ayet" || rate.provider === "bitlabs",
    "INVALID_CONTRACT",
    "Unsupported reward provider",
  );
  const effectiveFrom = parseIsoTimestamp(rate.effectiveFrom);
  if (rate.effectiveUntil !== undefined) {
    economyAssert(
      parseIsoTimestamp(rate.effectiveUntil) > effectiveFrom,
      "INVALID_TIME_WINDOW",
      "Reward-rate expiry must follow its effective time",
    );
  }
}

export function assertFxSnapshot(fx: FxSnapshotV1): void {
  economyAssert(
    fx.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported FX snapshot contract version",
  );
  assertEconomyIdentifier(fx.snapshotId, "snapshotId");
  economyAssert(
    /^[A-Z]{3}$/u.test(fx.sourceCurrency) && fx.quoteCurrency === "GBP",
    "INVALID_CONTRACT",
    "FX snapshots must convert an ISO currency into GBP",
  );
  parseIsoTimestamp(fx.capturedAt);
}

/** Converts provider payout using exact rational FX and rate snapshots. */
export function convertRewardPayout(
  providerPayoutMinorUnits: string,
  rate: RewardRateV1,
  fx: FxSnapshotV1,
): { readonly gbpMinorUnits: string; readonly tokenSubunits: TokenSubunitString } {
  assertRewardRate(rate);
  assertFxSnapshot(fx);
  const payout = parseNonNegativeInteger(
    providerPayoutMinorUnits,
    "Provider payout",
  );
  const fxNumerator = parseNonNegativeInteger(
    fx.gbpMinorUnitsNumerator,
    "FX numerator",
  );
  const fxDenominator = parseNonNegativeInteger(
    fx.sourceMinorUnitsDenominator,
    "FX denominator",
  );
  const tokenNumerator = parseNonNegativeInteger(
    rate.tokenSubunitsNumerator,
    "Rate numerator",
  );
  const tokenDenominator = parseNonNegativeInteger(
    rate.gbpMinorUnitsDenominator,
    "Rate denominator",
  );
  economyAssert(
    fxDenominator > 0n && tokenDenominator > 0n,
    "INVALID_AMOUNT",
    "FX and reward-rate denominators must be positive",
  );
  economyAssert(
    fxNumerator > 0n && tokenNumerator > 0n,
    "INVALID_AMOUNT",
    "FX and reward-rate numerators must be positive",
  );

  const gbpMinorUnits = (payout * fxNumerator) / fxDenominator;
  const tokenSubunits = (gbpMinorUnits * tokenNumerator) / tokenDenominator;
  return {
    gbpMinorUnits: gbpMinorUnits.toString(10),
    tokenSubunits: serializeTokenSubunits(tokenSubunits),
  };
}

/** Maps BitLabs' signed callback state into an immutable journal transition. */
export function mapBitLabsConversionState(
  state: string,
): RewardActivityTransitionV1 {
  const transitions: Readonly<
    Record<BitLabsConversionState, RewardActivityTransitionV1>
  > = {
    PENDING: {
      conversionStatus: "pending",
      activityType: "hold",
      activityStatus: "held",
    },
    COMPLETED: {
      conversionStatus: "completed",
      activityType: "offerwall",
      activityStatus: "settled",
    },
    RECONCILED: {
      conversionStatus: "reconciled",
      activityType: "reversal",
      activityStatus: "reversed",
    },
  };
  const transition = transitions[state as BitLabsConversionState];
  economyAssert(
    transition !== undefined,
    "INVALID_CONTRACT",
    "Unsupported BitLabs conversion state",
  );
  return transition;
}
