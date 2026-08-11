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
  type IsoTimestamp,
  type ProviderEventId,
} from "./contracts.js";
import { economyAssert } from "./errors.js";
import { assertFxSnapshot, type FxSnapshotV1 } from "./acquisition.js";

/** Persisted provider identifiers. BitLabs remains historical-only. */
export type OfferwallProviderV1 = "ayet" | "adgem" | "bitlabs";

export type OfferAccessibilityStatusV1 =
  | "pending-review"
  | "approved"
  | "restricted";

export type OfferApprovalStateV1 = "pending" | "approved" | "suspended";

export interface OfferGoalV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly goalId: string;
  readonly requirement: string;
  readonly providerPayoutMinorUnits: string;
  readonly providerCurrency: "USD";
  readonly completionWindowDays: number;
  readonly purchaseRequired: false;
  readonly personalDataSubmissionRequired: false;
}

/** Immutable, manually reviewed offer metadata owned by a host adapter. */
export interface OfferVersionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly provider: OfferwallProviderV1;
  readonly offerId: string;
  readonly offerVersionId: string;
  readonly title: string;
  readonly summary: string;
  readonly category: "game" | "app";
  readonly interactionType: "cpe";
  readonly country: "GB";
  readonly destinationUrl: string;
  readonly supportUrl: string;
  readonly expiresAt: IsoTimestamp;
  readonly accessibilityStatus: OfferAccessibilityStatusV1;
  readonly approvalState: OfferApprovalStateV1;
  readonly reviewerAccountIds: readonly AccountId[];
  readonly reviewedAt?: IsoTimestamp;
  readonly goals: readonly OfferGoalV1[];
}

/** Versioned economics applied when an immutable reward quote is locked. */
export interface OfferwallRewardPolicyV2 {
  readonly schemaVersion: EconomyContractVersion;
  readonly rateVersion: string;
  readonly tokenReferenceGbpMinorUnits: "10";
  readonly maximumUserRewardBasisPoints: "8000";
  readonly minimumRetainedMarginBasisPoints: "2000";
}

export const OFFERWALL_REWARD_POLICY_V2: OfferwallRewardPolicyV2 =
  Object.freeze({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    rateVersion: "offerwall-gbp-margin-v2",
    tokenReferenceGbpMinorUnits: "10",
    maximumUserRewardBasisPoints: "8000",
    minimumRetainedMarginBasisPoints: "2000",
  });

export interface RewardQuoteV2 {
  readonly schemaVersion: EconomyContractVersion;
  readonly quoteId: string;
  readonly provider: OfferwallProviderV1;
  readonly offerVersionId: string;
  readonly goalId: string;
  readonly providerPayoutMinorUnits: string;
  readonly providerCurrency: "USD";
  readonly grossGbpMinorUnits: string;
  readonly eligibleNetGbpMinorUnits: string;
  readonly tokenSubunits: TokenSubunitString;
  readonly nominalTokenValueGbpMinorUnits: string;
  readonly retainedMarginGbpMinorUnits: string;
  readonly retainedMarginBasisPoints: string;
  readonly rateVersion: string;
  readonly fxSnapshotId: string;
  readonly chargebackHaircutBasisPoints: string;
  readonly expectedFeeGbpMinorUnits: string;
  readonly lockedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

export interface CreateRewardQuoteInputV2 {
  readonly quoteId: string;
  readonly provider: OfferwallProviderV1;
  readonly offerVersionId: string;
  readonly goalId: string;
  readonly providerPayoutMinorUnits: string;
  readonly expectedFeeGbpMinorUnits: string;
  readonly chargebackHaircutBasisPoints: string;
  readonly fxSnapshot: FxSnapshotV1;
  readonly lockedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

export interface ProviderConversionEvidenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly provider: OfferwallProviderV1;
  readonly providerEventId: ProviderEventId;
  readonly offerVersionId: string;
  readonly goalId: string;
  readonly providerPayoutMinorUnits: string;
  readonly providerCurrency: "USD";
  readonly signatureScheme: "hmac-sha256";
  readonly payloadFingerprint: `hmac-sha256:${string}`;
  readonly providerOccurredAt: IsoTimestamp;
  readonly receivedAt: IsoTimestamp;
  readonly signatureVerifiedAt: IsoTimestamp;
}

export interface ProviderReversalEvidenceV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly provider: OfferwallProviderV1;
  readonly providerEventId: ProviderEventId;
  readonly originalProviderEventId: ProviderEventId;
  readonly offerVersionId: string;
  readonly goalId: string;
  readonly signatureScheme: "hmac-sha256";
  readonly payloadFingerprint: `hmac-sha256:${string}`;
  readonly reasonCode: string;
  readonly providerOccurredAt: IsoTimestamp;
  readonly receivedAt: IsoTimestamp;
  readonly signatureVerifiedAt: IsoTimestamp;
}

export interface ProviderConversionAssessmentV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly creditTokenSubunits: TokenSubunitString;
  readonly reserveLiabilityTokenSubunits: TokenSubunitString;
  readonly disableOffer: boolean;
  readonly incidentCode?: "PROVIDER_PAYOUT_BELOW_LOCKED_QUOTE";
}

export interface ProviderReversalDispositionV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly recoverableTokenSubunits: TokenSubunitString;
  readonly reserveAbsorptionTokenSubunits: TokenSubunitString;
  readonly suspendAdultEarning: boolean;
  readonly revokeChildEntitlement: false;
  readonly createChildDebt: false;
}

function parseCanonicalNonNegativeInteger(value: string, label: string): bigint {
  economyAssert(
    /^(?:0|[1-9][0-9]*)$/u.test(value),
    "INVALID_AMOUNT",
    `${label} must be a canonical non-negative integer string`,
  );
  return BigInt(value);
}

function assertOfferwallProvider(provider: string): asserts provider is OfferwallProviderV1 {
  economyAssert(
    provider === "ayet" || provider === "adgem" || provider === "bitlabs",
    "INVALID_CONTRACT",
    "Unsupported offerwall provider",
  );
}

function assertSafeDisplayText(value: string, label: string, maxLength: number): void {
  economyAssert(
    value.trim().length > 0 &&
      value.length <= maxLength &&
      ![...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 8 || (code >= 11 && code <= 31) || code === 127;
      }),
    "INVALID_CONTRACT",
    `${label} must be bounded display text without control characters`,
  );
}

function assertHttpsUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    economyAssert(false, "INVALID_CONTRACT", `${label} must be an HTTPS URL`);
    return;
  }
  economyAssert(
    parsed.protocol === "https:" && parsed.username === "" && parsed.password === "",
    "INVALID_CONTRACT",
    `${label} must be an HTTPS URL without embedded credentials`,
  );
}

export function assertOfferVersion(offer: OfferVersionV1): void {
  economyAssert(
    offer.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported offer-version contract",
  );
  assertOfferwallProvider(offer.provider);
  assertEconomyIdentifier(offer.offerId, "offerId");
  assertEconomyIdentifier(offer.offerVersionId, "offerVersionId");
  assertSafeDisplayText(offer.title, "Offer title", 120);
  assertSafeDisplayText(offer.summary, "Offer summary", 1_000);
  economyAssert(
    (offer.category === "game" || offer.category === "app") &&
      offer.interactionType === "cpe" &&
      offer.country === "GB",
    "INVALID_CONTRACT",
    "Offer versions must be UK non-purchase game/app CPE",
  );
  assertHttpsUrl(offer.destinationUrl, "Offer destination");
  assertHttpsUrl(offer.supportUrl, "Offer support URL");
  parseIsoTimestamp(offer.expiresAt);
  economyAssert(
    ["pending-review", "approved", "restricted"].includes(
      offer.accessibilityStatus,
    ) && ["pending", "approved", "suspended"].includes(offer.approvalState),
    "INVALID_CONTRACT",
    "Offer accessibility or approval state is unsupported",
  );
  economyAssert(
    offer.goals.length > 0 && offer.goals.length <= 100,
    "INVALID_CONTRACT",
    "Offer versions require a bounded non-empty goal list",
  );
  const goalIds = new Set<string>();
  for (const goal of offer.goals) {
    economyAssert(
      goal.schemaVersion === ECONOMY_CONTRACT_VERSION &&
        goal.providerCurrency === "USD" &&
        goal.purchaseRequired === false &&
        goal.personalDataSubmissionRequired === false &&
        Number.isSafeInteger(goal.completionWindowDays) &&
        goal.completionWindowDays >= 1 &&
        goal.completionWindowDays <= 90,
      "INVALID_CONTRACT",
      "Offer goals must be bounded non-purchase USD CPE goals",
    );
    assertEconomyIdentifier(goal.goalId, "goalId");
    economyAssert(
      !goalIds.has(goal.goalId),
      "DUPLICATE_IDENTIFIER",
      "Offer goal IDs must be unique",
    );
    goalIds.add(goal.goalId);
    assertSafeDisplayText(goal.requirement, "Goal requirement", 500);
    economyAssert(
      parseCanonicalNonNegativeInteger(
        goal.providerPayoutMinorUnits,
        "Goal provider payout",
      ) > 0n,
      "INVALID_AMOUNT",
      "Offer goals require a positive provider payout",
    );
  }
  if (offer.approvalState === "approved") {
    economyAssert(
      offer.accessibilityStatus === "approved" &&
        offer.reviewerAccountIds.length === 2 &&
        offer.reviewerAccountIds[0] !== offer.reviewerAccountIds[1] &&
        offer.reviewedAt !== undefined,
      "INVALID_CONTRACT",
      "Approved offers require accessibility approval and two distinct reviewers",
    );
  }
  for (const reviewer of offer.reviewerAccountIds) {
    assertEconomyIdentifier(reviewer, "reviewerAccountId");
  }
  if (offer.reviewedAt !== undefined) {
    parseIsoTimestamp(offer.reviewedAt);
  }
}

export function createRewardQuoteV2(
  input: CreateRewardQuoteInputV2,
): RewardQuoteV2 {
  assertEconomyIdentifier(input.quoteId, "quoteId");
  assertOfferwallProvider(input.provider);
  assertEconomyIdentifier(input.offerVersionId, "offerVersionId");
  assertEconomyIdentifier(input.goalId, "goalId");
  assertFxSnapshot(input.fxSnapshot);
  economyAssert(
    input.fxSnapshot.sourceCurrency === "USD",
    "INVALID_CONTRACT",
    "Offerwall reward quotes require a USD-to-GBP FX snapshot",
  );
  const payout = parseCanonicalNonNegativeInteger(
    input.providerPayoutMinorUnits,
    "Provider payout",
  );
  const fee = parseCanonicalNonNegativeInteger(
    input.expectedFeeGbpMinorUnits,
    "Expected fee",
  );
  const haircut = parseCanonicalNonNegativeInteger(
    input.chargebackHaircutBasisPoints,
    "Chargeback haircut",
  );
  economyAssert(
    payout > 0n && haircut <= 5_000n,
    "INVALID_AMOUNT",
    "Provider payout must be positive and chargeback haircut cannot exceed 50%",
  );
  const fxNumerator = parseCanonicalNonNegativeInteger(
    input.fxSnapshot.gbpMinorUnitsNumerator,
    "FX numerator",
  );
  const fxDenominator = parseCanonicalNonNegativeInteger(
    input.fxSnapshot.sourceMinorUnitsDenominator,
    "FX denominator",
  );
  economyAssert(
    fxNumerator > 0n && fxDenominator > 0n,
    "INVALID_AMOUNT",
    "Offerwall FX numerator and denominator must be positive",
  );
  const grossGbpMinorUnits =
    (payout * fxNumerator) / fxDenominator;
  const afterHaircut = (grossGbpMinorUnits * (10_000n - haircut)) / 10_000n;
  economyAssert(
    afterHaircut > fee,
    "INVALID_AMOUNT",
    "Expected fees consume all eligible offerwall revenue",
  );
  const eligibleNetGbpMinorUnits = afterHaircut - fee;
  const maximumNominalReward =
    (eligibleNetGbpMinorUnits * 8_000n) / 10_000n;
  const tokenCount = maximumNominalReward / 10n;
  economyAssert(
    tokenCount >= 1n,
    "INVALID_AMOUNT",
    "Offer goal cannot fund one Token while retaining the required margin",
  );
  const nominalTokenValue = tokenCount * 10n;
  const retainedMargin = eligibleNetGbpMinorUnits - nominalTokenValue;
  const retainedMarginBasisPoints =
    (retainedMargin * 10_000n) / eligibleNetGbpMinorUnits;
  const lockedAt = parseIsoTimestamp(input.lockedAt);
  economyAssert(
    parseIsoTimestamp(input.expiresAt) > lockedAt,
    "INVALID_TIME_WINDOW",
    "Reward quote expiry must follow its lock time",
  );
  const quote: RewardQuoteV2 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    quoteId: input.quoteId,
    provider: input.provider,
    offerVersionId: input.offerVersionId,
    goalId: input.goalId,
    providerPayoutMinorUnits: payout.toString(10),
    providerCurrency: "USD",
    grossGbpMinorUnits: grossGbpMinorUnits.toString(10),
    eligibleNetGbpMinorUnits: eligibleNetGbpMinorUnits.toString(10),
    tokenSubunits: serializeTokenSubunits(tokenCount * TOKEN_SUBUNITS_PER_TOKEN),
    nominalTokenValueGbpMinorUnits: nominalTokenValue.toString(10),
    retainedMarginGbpMinorUnits: retainedMargin.toString(10),
    retainedMarginBasisPoints: retainedMarginBasisPoints.toString(10),
    rateVersion: OFFERWALL_REWARD_POLICY_V2.rateVersion,
    fxSnapshotId: input.fxSnapshot.snapshotId,
    chargebackHaircutBasisPoints: haircut.toString(10),
    expectedFeeGbpMinorUnits: fee.toString(10),
    lockedAt: input.lockedAt,
    expiresAt: input.expiresAt,
  };
  assertRewardQuoteV2(quote);
  return quote;
}

export function assertRewardQuoteV2(quote: RewardQuoteV2): void {
  economyAssert(
    quote.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      quote.providerCurrency === "USD" &&
      quote.rateVersion === OFFERWALL_REWARD_POLICY_V2.rateVersion,
    "INVALID_CONTRACT",
    "Unsupported reward quote contract or policy",
  );
  assertEconomyIdentifier(quote.quoteId, "quoteId");
  assertOfferwallProvider(quote.provider);
  assertEconomyIdentifier(quote.offerVersionId, "offerVersionId");
  assertEconomyIdentifier(quote.goalId, "goalId");
  assertEconomyIdentifier(quote.fxSnapshotId, "fxSnapshotId");
  const providerPayout = parseCanonicalNonNegativeInteger(
    quote.providerPayoutMinorUnits,
    "Provider payout",
  );
  const gross = parseCanonicalNonNegativeInteger(
    quote.grossGbpMinorUnits,
    "Gross GBP payout",
  );
  const eligible = parseCanonicalNonNegativeInteger(
    quote.eligibleNetGbpMinorUnits,
    "Eligible net GBP payout",
  );
  const nominal = parseCanonicalNonNegativeInteger(
    quote.nominalTokenValueGbpMinorUnits,
    "Nominal Token value",
  );
  const retained = parseCanonicalNonNegativeInteger(
    quote.retainedMarginGbpMinorUnits,
    "Retained margin",
  );
  const retainedBasisPoints = parseCanonicalNonNegativeInteger(
    quote.retainedMarginBasisPoints,
    "Retained margin basis points",
  );
  const tokenSubunits = parseTokenSubunits(quote.tokenSubunits);
  economyAssert(
    providerPayout > 0n &&
      gross >= eligible &&
      eligible === nominal + retained &&
      tokenSubunits > 0n &&
      isWholeTokenAmount(tokenSubunits) &&
      nominal === (tokenSubunits / TOKEN_SUBUNITS_PER_TOKEN) * 10n &&
      nominal * 10_000n <= eligible * 8_000n &&
      retainedBasisPoints >= 2_000n &&
      retainedBasisPoints === (retained * 10_000n) / eligible,
    "INVALID_AMOUNT",
    "Reward quote violates payout, Token, or retained-margin invariants",
  );
  parseCanonicalNonNegativeInteger(
    quote.chargebackHaircutBasisPoints,
    "Chargeback haircut",
  );
  parseCanonicalNonNegativeInteger(
    quote.expectedFeeGbpMinorUnits,
    "Expected fee",
  );
  economyAssert(
    parseIsoTimestamp(quote.expiresAt) > parseIsoTimestamp(quote.lockedAt),
    "INVALID_TIME_WINDOW",
    "Reward quote expiry must follow its lock time",
  );
}

export function assertProviderConversionEvidence(
  evidence: ProviderConversionEvidenceV1,
): void {
  economyAssert(
    evidence.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      evidence.providerCurrency === "USD" &&
      evidence.signatureScheme === "hmac-sha256" &&
      /^hmac-sha256:[a-f0-9]{64}$/u.test(evidence.payloadFingerprint),
    "INVALID_CONTRACT",
    "Provider conversion evidence must be minimized HMAC-SHA256 evidence",
  );
  assertOfferwallProvider(evidence.provider);
  assertEconomyIdentifier(evidence.providerEventId, "providerEventId");
  assertEconomyIdentifier(evidence.offerVersionId, "offerVersionId");
  assertEconomyIdentifier(evidence.goalId, "goalId");
  economyAssert(
    parseCanonicalNonNegativeInteger(
      evidence.providerPayoutMinorUnits,
      "Provider payout",
    ) > 0n,
    "INVALID_AMOUNT",
    "Provider conversion payout must be positive",
  );
  const occurredAt = parseIsoTimestamp(evidence.providerOccurredAt);
  const receivedAt = parseIsoTimestamp(evidence.receivedAt);
  const verifiedAt = parseIsoTimestamp(evidence.signatureVerifiedAt);
  economyAssert(
    receivedAt >= occurredAt && verifiedAt >= receivedAt,
    "INVALID_TIME_WINDOW",
    "Provider evidence timestamps are out of order",
  );
}

export function assertProviderReversalEvidence(
  evidence: ProviderReversalEvidenceV1,
): void {
  economyAssert(
    evidence.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      evidence.signatureScheme === "hmac-sha256" &&
      /^hmac-sha256:[a-f0-9]{64}$/u.test(evidence.payloadFingerprint),
    "INVALID_CONTRACT",
    "Provider reversal evidence must be minimized HMAC-SHA256 evidence",
  );
  assertOfferwallProvider(evidence.provider);
  assertEconomyIdentifier(evidence.providerEventId, "providerEventId");
  assertEconomyIdentifier(
    evidence.originalProviderEventId,
    "originalProviderEventId",
  );
  assertEconomyIdentifier(evidence.offerVersionId, "offerVersionId");
  assertEconomyIdentifier(evidence.goalId, "goalId");
  assertEconomyIdentifier(evidence.reasonCode, "reasonCode");
  economyAssert(
    evidence.providerEventId !== evidence.originalProviderEventId,
    "DUPLICATE_IDENTIFIER",
    "Reversal event must be distinct from its original conversion",
  );
  const occurredAt = parseIsoTimestamp(evidence.providerOccurredAt);
  const receivedAt = parseIsoTimestamp(evidence.receivedAt);
  const verifiedAt = parseIsoTimestamp(evidence.signatureVerifiedAt);
  economyAssert(
    receivedAt >= occurredAt && verifiedAt >= receivedAt,
    "INVALID_TIME_WINDOW",
    "Provider reversal timestamps are out of order",
  );
}

export function assessProviderConversion(
  quote: RewardQuoteV2,
  evidence: ProviderConversionEvidenceV1,
): ProviderConversionAssessmentV1 {
  assertRewardQuoteV2(quote);
  assertProviderConversionEvidence(evidence);
  economyAssert(
    quote.provider === evidence.provider &&
      quote.offerVersionId === evidence.offerVersionId &&
      quote.goalId === evidence.goalId,
    "INVALID_CONTRACT",
    "Provider conversion does not match its locked reward quote",
  );
  const payoutMismatch =
    BigInt(evidence.providerPayoutMinorUnits) <
    BigInt(quote.providerPayoutMinorUnits);
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    creditTokenSubunits: quote.tokenSubunits,
    reserveLiabilityTokenSubunits: quote.tokenSubunits,
    disableOffer: payoutMismatch,
    ...(payoutMismatch
      ? { incidentCode: "PROVIDER_PAYOUT_BELOW_LOCKED_QUOTE" as const }
      : {}),
  };
}

export function planProviderReversal(
  creditedTokenSubunits: TokenSubunitString,
  recoverableTokenSubunits: TokenSubunitString,
): ProviderReversalDispositionV1 {
  const credited = parseTokenSubunits(creditedTokenSubunits);
  const recoverable = parseTokenSubunits(recoverableTokenSubunits);
  economyAssert(
    credited > 0n && recoverable >= 0n && recoverable <= credited,
    "INVALID_AMOUNT",
    "Recoverable reversal value must be within the credited reward",
  );
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    recoverableTokenSubunits: serializeTokenSubunits(recoverable),
    reserveAbsorptionTokenSubunits: serializeTokenSubunits(
      credited - recoverable,
    ),
    suspendAdultEarning: credited !== recoverable,
    revokeChildEntitlement: false,
    createChildDebt: false,
  };
}
