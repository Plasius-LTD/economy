import {
  TOKEN_SUBUNITS_PER_TOKEN,
  parseTokenSubunits,
  serializeTokenSubunits,
  type TokenSubunitString,
} from "./amount.js";
import { assertEconomyHmacFingerprint, type EconomyHmacFingerprintV1 } from "./audit.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
} from "./contracts.js";
import { economyAssert } from "./errors.js";

/** The only rewarded-web provider supported by this contract version. */
export const GOOGLE_REWARDED_WEB_PROVIDER = "google-ad-manager" as const;

/** Nominal liability of one non-redeemable Token in GBP micros. */
export const GOOGLE_REWARDED_WEB_NOMINAL_MICROS_PER_TOKEN = 100_000n;

/** Minimum eligible net revenue required to issue one Token. */
export const GOOGLE_REWARDED_WEB_MINIMUM_NET_MICROS_PER_TOKEN = 125_000n;

const SIGNED_BIGINT_MAX = 2n ** 63n - 1n;
const CANONICAL_UNSIGNED_INTEGER = /^(?:0|[1-9][0-9]*)$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

/** The fixed, policy-safe reward declaration shown before an ad is requested. */
export interface GoogleRewardedWebRewardPayloadV1 {
  readonly type: "plasius-token-progress";
  readonly amount: 1;
}

/**
 * Immutable economics applied to a bundle of rewarded-ad completions.
 * All GBP fields are integer micros and never floating-point values.
 */
export interface GoogleRewardedWebQuoteV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly quoteVersion: string;
  readonly provider: typeof GOOGLE_REWARDED_WEB_PROVIDER;
  readonly currency: "GBP";
  readonly bundleCompletions: number;
  readonly rewardPayload: GoogleRewardedWebRewardPayloadV1;
  readonly grossRevenueFloorMicros: string;
  readonly providerFeeMicros: string;
  readonly invalidTrafficHaircutMicros: string;
  readonly otherCostMicros: string;
  readonly eligibleNetRevenueMicros: string;
  readonly tokenAmount: TokenSubunitString;
  readonly nominalLiabilityMicros: string;
  readonly retainedMarginMicros: string;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveUntil?: IsoTimestamp;
}

/** Input used to create an exact rewarded-web quote. */
export interface CreateGoogleRewardedWebQuoteInputV1 {
  readonly quoteVersion: string;
  readonly bundleCompletions: number;
  readonly rewardPayload: GoogleRewardedWebRewardPayloadV1;
  readonly grossRevenueFloorMicros: string;
  readonly providerFeeMicros: string;
  readonly invalidTrafficHaircutMicros: string;
  readonly otherCostMicros: string;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveUntil?: IsoTimestamp;
}

/** Browser evidence recorded after GPT emits `rewardedSlotGranted`. */
export interface GoogleRewardedWebGrantClaimV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly provider: typeof GOOGLE_REWARDED_WEB_PROVIDER;
  /** Web GPT has no server-side verification; this value can never be upgraded. */
  readonly evidenceTrust: "client-claimed";
  readonly claimId: string;
  readonly sessionId: string;
  readonly beneficiaryAccountId: AccountId;
  readonly quoteVersion: string;
  readonly reportingKeyFingerprint: EconomyHmacFingerprintV1;
  readonly rewardPayload: GoogleRewardedWebRewardPayloadV1;
  readonly claimedAt: IsoTimestamp;
}

/** State of one server-created rewarded-web session and its evidence. */
export type GoogleRewardedWebSessionStateV1 =
  | "created"
  | "bootstrapped"
  | "client-claimed"
  | "report-matched"
  | "financially-reconciled"
  | "suspended"
  | "expired";

/** Outcome of matching privacy-minimised claims to a Google revenue report. */
export interface GoogleRewardedWebReconciliationV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly provider: typeof GOOGLE_REWARDED_WEB_PROVIDER;
  readonly batchId: string;
  readonly quoteVersion: string;
  readonly state: "report-matched" | "financially-reconciled" | "mismatch";
  readonly reportFinality: "estimated" | "final";
  readonly reportFingerprint: EconomyHmacFingerprintV1;
  readonly adUnitFingerprint: string;
  readonly periodStartedAt: IsoTimestamp;
  readonly periodEndedAt: IsoTimestamp;
  readonly acceptedClaimCount: number;
  readonly matchedPaidImpressionCount: number;
  readonly creditedBundleCount: number;
  readonly grossRevenueMicros: string;
  readonly eligibleNetRevenueMicros: string;
  readonly nominalLiabilityMicros: string;
  readonly reserveHeldMicros: string;
  readonly reconciledAt: IsoTimestamp;
}

function assertExactKeys(
  value: object,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  economyAssert(
    Object.keys(value).every((key) => allowed.has(key)) &&
      [...allowed].every(
        (key) =>
          key === "effectiveUntil" ||
          Object.prototype.hasOwnProperty.call(value, key),
      ),
    "INVALID_CONTRACT",
    `${label} contains missing or unsupported fields`,
  );
}

function parseGbpMicros(value: string, label: string): bigint {
  economyAssert(
    typeof value === "string" && CANONICAL_UNSIGNED_INTEGER.test(value),
    "INVALID_CONTRACT",
    `${label} must be canonical non-negative GBP micros`,
  );
  const parsed = BigInt(value);
  economyAssert(
    parsed <= SIGNED_BIGINT_MAX,
    "AMOUNT_OUT_OF_RANGE",
    `${label} is outside the signed 64-bit range`,
  );
  return parsed;
}

function assertRewardPayload(
  payload: GoogleRewardedWebRewardPayloadV1,
): void {
  assertExactKeys(payload, new Set(["type", "amount"]), "Reward payload");
  economyAssert(
    payload.type === "plasius-token-progress" && payload.amount === 1,
    "INVALID_CONTRACT",
    "Reward payload must disclose exactly one Token of bundle progress",
  );
}

function assertBoundedCount(value: number, label: string): void {
  economyAssert(
    Number.isSafeInteger(value) && value >= 0,
    "INVALID_CONTRACT",
    `${label} must be a non-negative safe integer`,
  );
}

/** Creates and validates an immutable one-Token rewarded-web quote. */
export function createGoogleRewardedWebQuote(
  input: CreateGoogleRewardedWebQuoteInputV1,
): GoogleRewardedWebQuoteV1 {
  const gross = parseGbpMicros(
    input.grossRevenueFloorMicros,
    "grossRevenueFloorMicros",
  );
  const providerFee = parseGbpMicros(
    input.providerFeeMicros,
    "providerFeeMicros",
  );
  const invalidTrafficHaircut = parseGbpMicros(
    input.invalidTrafficHaircutMicros,
    "invalidTrafficHaircutMicros",
  );
  const otherCost = parseGbpMicros(input.otherCostMicros, "otherCostMicros");
  const deductions = providerFee + invalidTrafficHaircut + otherCost;
  economyAssert(
    deductions <= gross,
    "INVALID_CONTRACT",
    "Rewarded-web costs cannot exceed the gross revenue floor",
  );
  const eligibleNet = gross - deductions;
  const retainedMargin =
    eligibleNet - GOOGLE_REWARDED_WEB_NOMINAL_MICROS_PER_TOKEN;

  const quote: GoogleRewardedWebQuoteV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    quoteVersion: input.quoteVersion,
    provider: GOOGLE_REWARDED_WEB_PROVIDER,
    currency: "GBP",
    bundleCompletions: input.bundleCompletions,
    rewardPayload: input.rewardPayload,
    grossRevenueFloorMicros: gross.toString(10),
    providerFeeMicros: providerFee.toString(10),
    invalidTrafficHaircutMicros: invalidTrafficHaircut.toString(10),
    otherCostMicros: otherCost.toString(10),
    eligibleNetRevenueMicros: eligibleNet.toString(10),
    tokenAmount: serializeTokenSubunits(TOKEN_SUBUNITS_PER_TOKEN),
    nominalLiabilityMicros:
      GOOGLE_REWARDED_WEB_NOMINAL_MICROS_PER_TOKEN.toString(10),
    retainedMarginMicros: retainedMargin.toString(10),
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: input.effectiveUntil }),
  };
  assertGoogleRewardedWebQuote(quote);
  return Object.freeze(quote);
}

/** Proves quote arithmetic, a whole-Token reward, and the 20% margin floor. */
export function assertGoogleRewardedWebQuote(
  quote: GoogleRewardedWebQuoteV1,
): void {
  assertExactKeys(
    quote,
    new Set([
      "schemaVersion",
      "quoteVersion",
      "provider",
      "currency",
      "bundleCompletions",
      "rewardPayload",
      "grossRevenueFloorMicros",
      "providerFeeMicros",
      "invalidTrafficHaircutMicros",
      "otherCostMicros",
      "eligibleNetRevenueMicros",
      "tokenAmount",
      "nominalLiabilityMicros",
      "retainedMarginMicros",
      "effectiveFrom",
      "effectiveUntil",
    ]),
    "Google rewarded-web quote",
  );
  economyAssert(
    quote.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      quote.provider === GOOGLE_REWARDED_WEB_PROVIDER &&
      quote.currency === "GBP",
    "INVALID_CONTRACT",
    "Unsupported Google rewarded-web quote contract",
  );
  assertEconomyIdentifier(quote.quoteVersion, "quoteVersion");
  economyAssert(
    Number.isSafeInteger(quote.bundleCompletions) &&
      quote.bundleCompletions >= 1 &&
      quote.bundleCompletions <= 1_000,
    "INVALID_CONTRACT",
    "Bundle completions must be between 1 and 1,000",
  );
  assertRewardPayload(quote.rewardPayload);

  const gross = parseGbpMicros(
    quote.grossRevenueFloorMicros,
    "grossRevenueFloorMicros",
  );
  const providerFee = parseGbpMicros(
    quote.providerFeeMicros,
    "providerFeeMicros",
  );
  const invalidTrafficHaircut = parseGbpMicros(
    quote.invalidTrafficHaircutMicros,
    "invalidTrafficHaircutMicros",
  );
  const otherCost = parseGbpMicros(quote.otherCostMicros, "otherCostMicros");
  const eligibleNet = parseGbpMicros(
    quote.eligibleNetRevenueMicros,
    "eligibleNetRevenueMicros",
  );
  const nominalLiability = parseGbpMicros(
    quote.nominalLiabilityMicros,
    "nominalLiabilityMicros",
  );
  const retainedMargin = parseGbpMicros(
    quote.retainedMarginMicros,
    "retainedMarginMicros",
  );
  economyAssert(
    gross === providerFee + invalidTrafficHaircut + otherCost + eligibleNet,
    "INVALID_CONTRACT",
    "Rewarded-web quote revenue arithmetic is inconsistent",
  );
  economyAssert(
    parseTokenSubunits(quote.tokenAmount) === TOKEN_SUBUNITS_PER_TOKEN &&
      nominalLiability === GOOGLE_REWARDED_WEB_NOMINAL_MICROS_PER_TOKEN,
    "INVALID_CONTRACT",
    "Rewarded-web quote must issue exactly one whole Token",
  );
  economyAssert(
    eligibleNet >= GOOGLE_REWARDED_WEB_MINIMUM_NET_MICROS_PER_TOKEN &&
      retainedMargin === eligibleNet - nominalLiability &&
      retainedMargin * 5n >= eligibleNet,
    "INVALID_CONTRACT",
    "Rewarded-web quote does not preserve the 20% contribution margin",
  );
  const effectiveFrom = parseIsoTimestamp(quote.effectiveFrom);
  if (quote.effectiveUntil !== undefined) {
    economyAssert(
      parseIsoTimestamp(quote.effectiveUntil) > effectiveFrom,
      "INVALID_TIME_WINDOW",
      "Rewarded-web quote expiry must follow its effective time",
    );
  }
}

/** Validates a privacy-minimised browser grant without overstating its trust. */
export function assertGoogleRewardedWebGrantClaim(
  claim: GoogleRewardedWebGrantClaimV1,
): void {
  assertExactKeys(
    claim,
    new Set([
      "schemaVersion",
      "provider",
      "evidenceTrust",
      "claimId",
      "sessionId",
      "beneficiaryAccountId",
      "quoteVersion",
      "reportingKeyFingerprint",
      "rewardPayload",
      "claimedAt",
    ]),
    "Google rewarded-web grant claim",
  );
  economyAssert(
    claim.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      claim.provider === GOOGLE_REWARDED_WEB_PROVIDER &&
      claim.evidenceTrust === "client-claimed",
    "INVALID_CONTRACT",
    "Rewarded-web grant evidence must remain client-claimed",
  );
  assertEconomyIdentifier(claim.claimId, "claimId");
  assertEconomyIdentifier(claim.sessionId, "sessionId");
  assertEconomyIdentifier(claim.beneficiaryAccountId, "beneficiaryAccountId");
  assertEconomyIdentifier(claim.quoteVersion, "quoteVersion");
  assertEconomyHmacFingerprint(
    claim.reportingKeyFingerprint,
    "economy.google-reporting-key.v1",
  );
  assertRewardPayload(claim.rewardPayload);
  parseIsoTimestamp(claim.claimedAt);
}

/** Validates final revenue coverage or a fail-closed mismatch record. */
export function assertGoogleRewardedWebReconciliation(
  reconciliation: GoogleRewardedWebReconciliationV1,
  quote: GoogleRewardedWebQuoteV1,
): void {
  assertGoogleRewardedWebQuote(quote);
  assertExactKeys(
    reconciliation,
    new Set([
      "schemaVersion",
      "provider",
      "batchId",
      "quoteVersion",
      "state",
      "reportFinality",
      "reportFingerprint",
      "adUnitFingerprint",
      "periodStartedAt",
      "periodEndedAt",
      "acceptedClaimCount",
      "matchedPaidImpressionCount",
      "creditedBundleCount",
      "grossRevenueMicros",
      "eligibleNetRevenueMicros",
      "nominalLiabilityMicros",
      "reserveHeldMicros",
      "reconciledAt",
    ]),
    "Google rewarded-web reconciliation",
  );
  economyAssert(
    reconciliation.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      reconciliation.provider === GOOGLE_REWARDED_WEB_PROVIDER &&
      reconciliation.quoteVersion === quote.quoteVersion &&
      ["report-matched", "financially-reconciled", "mismatch"].includes(
        reconciliation.state,
      ) &&
      ["estimated", "final"].includes(reconciliation.reportFinality),
    "INVALID_CONTRACT",
    "Unsupported Google rewarded-web reconciliation contract",
  );
  assertEconomyIdentifier(reconciliation.batchId, "batchId");
  assertEconomyHmacFingerprint(
    reconciliation.reportFingerprint,
    "economy.provider-reconciliation.v1",
  );
  economyAssert(
    SHA256.test(reconciliation.adUnitFingerprint),
    "INVALID_CONTRACT",
    "Ad-unit fingerprint must be a canonical SHA-256 reference",
  );
  const periodStartedAt = parseIsoTimestamp(reconciliation.periodStartedAt);
  const periodEndedAt = parseIsoTimestamp(reconciliation.periodEndedAt);
  const reconciledAt = parseIsoTimestamp(reconciliation.reconciledAt);
  economyAssert(
    periodEndedAt > periodStartedAt && reconciledAt >= periodEndedAt,
    "INVALID_TIME_WINDOW",
    "Reconciliation period and completion times are inconsistent",
  );
  assertBoundedCount(reconciliation.acceptedClaimCount, "acceptedClaimCount");
  assertBoundedCount(
    reconciliation.matchedPaidImpressionCount,
    "matchedPaidImpressionCount",
  );
  assertBoundedCount(
    reconciliation.creditedBundleCount,
    "creditedBundleCount",
  );

  const gross = parseGbpMicros(
    reconciliation.grossRevenueMicros,
    "grossRevenueMicros",
  );
  const eligibleNet = parseGbpMicros(
    reconciliation.eligibleNetRevenueMicros,
    "eligibleNetRevenueMicros",
  );
  const nominalLiability = parseGbpMicros(
    reconciliation.nominalLiabilityMicros,
    "nominalLiabilityMicros",
  );
  const reserveHeld = parseGbpMicros(
    reconciliation.reserveHeldMicros,
    "reserveHeldMicros",
  );
  const expectedCompletions =
    BigInt(reconciliation.creditedBundleCount) *
    BigInt(quote.bundleCompletions);
  const expectedEligibleNet =
    BigInt(reconciliation.creditedBundleCount) *
    BigInt(quote.eligibleNetRevenueMicros);
  const expectedLiability =
    BigInt(reconciliation.creditedBundleCount) *
    BigInt(quote.nominalLiabilityMicros);

  economyAssert(
    gross >= eligibleNet &&
      nominalLiability === expectedLiability &&
      reserveHeld >= nominalLiability,
    "INVALID_CONTRACT",
    "Reconciliation liability or reserve arithmetic is inconsistent",
  );
  if (reconciliation.state === "financially-reconciled") {
    economyAssert(
      reconciliation.reportFinality === "final" &&
        BigInt(reconciliation.acceptedClaimCount) >= expectedCompletions &&
        BigInt(reconciliation.matchedPaidImpressionCount) >=
          expectedCompletions &&
        eligibleNet >= expectedEligibleNet,
      "INVALID_CONTRACT",
      "Financial reconciliation requires final paid impressions and revenue coverage",
    );
  }
}

const STATE_TRANSITIONS: Readonly<
  Record<GoogleRewardedWebSessionStateV1, ReadonlySet<GoogleRewardedWebSessionStateV1>>
> = {
  created: new Set(["bootstrapped", "suspended", "expired"]),
  bootstrapped: new Set(["client-claimed", "suspended", "expired"]),
  "client-claimed": new Set(["report-matched", "suspended", "expired"]),
  "report-matched": new Set([
    "financially-reconciled",
    "suspended",
    "expired",
  ]),
  "financially-reconciled": new Set(),
  suspended: new Set(),
  expired: new Set(),
};

/** Rejects skipped, backwards, or post-terminal evidence transitions. */
export function assertGoogleRewardedWebStateTransition(
  from: GoogleRewardedWebSessionStateV1,
  to: GoogleRewardedWebSessionStateV1,
): void {
  economyAssert(
    STATE_TRANSITIONS[from]?.has(to) === true,
    "INVALID_CONTRACT",
    "Rewarded-web session transition is not forward-safe",
  );
}
