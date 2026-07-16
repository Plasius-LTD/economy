import {
  parseTokenSubunits,
  serializeTokenSubunits,
  type TokenSubunitString,
} from "../amount.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
  type TransactionId,
  type WalletId,
} from "../contracts.js";
import { economyAssert } from "../errors.js";
import type { ActivityType } from "../ledger.js";
import type { TokenSource } from "../lots.js";
import { assertDeterministicWalletBalanceSummary } from "../projection.js";
import {
  assertWalletLifetimeTotals,
  type WalletBalanceSummaryV1,
  type WalletLifetimeTotalsV1,
} from "../wallets.js";

export type WalletPortfolioComponentRole =
  | "household-treasury"
  | "personal"
  | "gameplay-allocation"
  | "hold";

/** One server-authorized component of a portfolio read. */
export interface WalletPortfolioComponentScopeV1 {
  readonly walletId: WalletId;
  readonly role: WalletPortfolioComponentRole;
  readonly beneficiaryAccountId?: AccountId;
}

/**
 * Explicit portfolio scope assembled after authorization. It prevents a host's
 * household treasury and same-user-only personal wallet from being silently
 * represented as one wallet.
 */
export interface WalletPortfolioReadScopeV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly portfolioId: string;
  readonly subjectAccountId: AccountId;
  readonly components: readonly WalletPortfolioComponentScopeV1[];
}

export interface WalletBalanceTotalsV1 {
  readonly available: TokenSubunitString;
  readonly reserved: TokenSubunitString;
  readonly held: TokenSubunitString;
  readonly rewardProgress: TokenSubunitString;
}

export interface WalletPortfolioBalanceComponentV1
  extends WalletPortfolioComponentScopeV1 {
  readonly summary: WalletBalanceSummaryV1;
}

export interface WalletPortfolioSummaryV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly portfolioId: string;
  readonly subjectAccountId: AccountId;
  readonly components: readonly WalletPortfolioBalanceComponentV1[];
  /**
   * Exact column sums for display only. Progress is intentionally not promoted
   * across wallets because their source/transfer policies may differ.
   */
  readonly totals: WalletBalanceTotalsV1;
  readonly asOf: IsoTimestamp;
}

/** Self-identifying lifetime read for one wallet. */
export interface WalletLifetimeSnapshotV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly walletId: WalletId;
  readonly totals: WalletLifetimeTotalsV1;
  readonly version: number;
  readonly asOf: IsoTimestamp;
}

export interface WalletPortfolioLifetimeComponentV1
  extends WalletPortfolioComponentScopeV1 {
  readonly snapshot: WalletLifetimeSnapshotV1;
}

export interface WalletPortfolioLifetimeV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly portfolioId: string;
  readonly subjectAccountId: AccountId;
  readonly components: readonly WalletPortfolioLifetimeComponentV1[];
  readonly totals: WalletLifetimeTotalsV1;
  readonly asOf: IsoTimestamp;
}

export type EconomicActivityStatusV1 = "held" | "settled" | "reversed";
export type WorkflowActivityStatusV1 = "pending" | "failed";
export type WalletActivityStatusV1 =
  | EconomicActivityStatusV1
  | WorkflowActivityStatusV1;

interface WalletActivityBaseV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly activityId: string;
  /** Component wallet whose signed display amount this row represents. */
  readonly walletId: WalletId;
  readonly activityType: ActivityType;
  readonly occurredAt: IsoTimestamp;
  readonly amount: TokenSubunitString;
  readonly source: TokenSource;
  readonly beneficiaryAccountId?: AccountId;
  readonly maskedReference?: string;
  readonly sourceLabel: string;
}

/** Economically effective or read-model-derived reversal activity. */
export interface EconomicWalletActivityEntryV1 extends WalletActivityBaseV1 {
  readonly entryKind: "economic";
  readonly transactionId: TransactionId;
  readonly status: EconomicActivityStatusV1;
}

/**
 * Non-economic accepted/failed work. Its amount is display context only and is
 * excluded from balances and lifetime aggregates.
 */
export interface WorkflowWalletActivityEntryV1 extends WalletActivityBaseV1 {
  readonly entryKind: "workflow";
  readonly commandId: string;
  readonly status: WorkflowActivityStatusV1;
}

export type WalletActivityEntryV1 =
  | EconomicWalletActivityEntryV1
  | WorkflowWalletActivityEntryV1;

export interface WalletActivityFilterV1 {
  readonly activityTypes?: readonly ActivityType[];
  readonly statuses?: readonly WalletActivityStatusV1[];
  readonly sources?: readonly TokenSource[];
  readonly beneficiaryAccountId?: AccountId;
  readonly fromInclusive?: IsoTimestamp;
  readonly toExclusive?: IsoTimestamp;
}

export interface WalletActivityPageRequestV1 {
  readonly limit: number;
  readonly cursor?: string;
  readonly filter?: WalletActivityFilterV1;
}

export interface WalletActivityPageV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly entries: readonly WalletActivityEntryV1[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

const ACTIVITY_TYPES = new Set<ActivityType>([
  "purchase",
  "subscription",
  "rewarded-ad",
  "offerwall",
  "allocation",
  "boost",
  "reclaim",
  "spend",
  "hold",
  "refund",
  "chargeback",
  "adjustment",
  "reversal",
  "event",
  "competition",
]);
const ACTIVITY_STATUSES = new Set<WalletActivityStatusV1>([
  "pending",
  "held",
  "settled",
  "reversed",
  "failed",
]);
const ACTIVITY_SOURCES = new Set<TokenSource>([
  "shopify",
  "ayet",
  "bitlabs",
  "subscription",
  "event",
  "competition",
  "adjustment",
]);
const PORTFOLIO_ROLES = new Set<WalletPortfolioComponentRole>([
  "household-treasury",
  "personal",
  "gameplay-allocation",
  "hold",
]);

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function assertSafeDisplayString(value: string, label: string): void {
  economyAssert(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 128 &&
      !hasControlCharacters(value),
    "INVALID_CONTRACT",
    `${label} must be bounded and safe for display`,
  );
}

function assertOpaqueCursor(value: string): void {
  economyAssert(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 512 &&
      !hasControlCharacters(value),
    "INVALID_CONTRACT",
    "Activity cursor must be a bounded opaque value",
  );
}

function assertUniqueValues<T extends string>(
  values: readonly T[],
  allowed: ReadonlySet<T>,
  label: string,
): void {
  const unique = new Set(values);
  economyAssert(
    values.length > 0 &&
      values.length === unique.size &&
      values.every((value) => allowed.has(value)),
    "INVALID_CONTRACT",
    `${label} must contain unique supported values`,
  );
}

/** Validates a server-created, bounded portfolio scope. */
export function assertWalletPortfolioReadScope(
  scope: WalletPortfolioReadScopeV1,
): void {
  economyAssert(
    scope.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet-portfolio scope contract version",
  );
  assertEconomyIdentifier(scope.portfolioId, "portfolioId");
  assertEconomyIdentifier(scope.subjectAccountId, "subjectAccountId");
  economyAssert(
    scope.components.length > 0 && scope.components.length <= 100,
    "INVALID_CONTRACT",
    "Wallet portfolio must contain between one and 100 components",
  );
  const walletIds = new Set<string>();
  for (const component of scope.components) {
    assertEconomyIdentifier(component.walletId, "walletId");
    economyAssert(
      PORTFOLIO_ROLES.has(component.role),
      "INVALID_CONTRACT",
      "Wallet portfolio component has an unsupported role",
    );
    economyAssert(
      !walletIds.has(component.walletId),
      "DUPLICATE_IDENTIFIER",
      "Wallet portfolio cannot repeat a wallet",
    );
    walletIds.add(component.walletId);
    if (component.beneficiaryAccountId !== undefined) {
      assertEconomyIdentifier(
        component.beneficiaryAccountId,
        "beneficiaryAccountId",
      );
    }
    economyAssert(
      component.role !== "gameplay-allocation" ||
        component.beneficiaryAccountId !== undefined,
      "INVALID_CONTRACT",
      "Gameplay-allocation portfolio components require a beneficiary",
    );
  }
}

/** Validates a self-identifying wallet lifetime read. */
export function assertWalletLifetimeSnapshot(
  snapshot: WalletLifetimeSnapshotV1,
): void {
  economyAssert(
    snapshot.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet-lifetime-snapshot contract version",
  );
  assertEconomyIdentifier(snapshot.walletId, "walletId");
  assertWalletLifetimeTotals(snapshot.totals);
  economyAssert(
    Number.isSafeInteger(snapshot.version) && snapshot.version >= 1,
    "INVALID_CONTRACT",
    "Wallet lifetime version must be a positive safe integer",
  );
  parseIsoTimestamp(snapshot.asOf);
}

function assertPortfolioComponentMatch(
  expected: WalletPortfolioComponentScopeV1,
  actual: WalletPortfolioComponentScopeV1,
): void {
  economyAssert(
    expected.walletId === actual.walletId &&
      expected.role === actual.role &&
      expected.beneficiaryAccountId === actual.beneficiaryAccountId,
    "INVALID_CONTRACT",
    "Portfolio result component does not match its authorized read scope",
  );
}

/**
 * Constructs a portfolio balance without merging wallet identities or
 * promoting sub-Token progress across policy boundaries.
 */
export function createWalletPortfolioSummary(
  scope: WalletPortfolioReadScopeV1,
  components: readonly WalletPortfolioBalanceComponentV1[],
  asOf: IsoTimestamp,
): WalletPortfolioSummaryV1 {
  assertWalletPortfolioReadScope(scope);
  parseIsoTimestamp(asOf);
  economyAssert(
    components.length === scope.components.length,
    "INVALID_CONTRACT",
    "Portfolio balance must include every authorized component exactly once",
  );
  const byWallet = new Map(components.map((item) => [item.walletId, item]));
  economyAssert(
    byWallet.size === components.length,
    "DUPLICATE_IDENTIFIER",
    "Portfolio balance cannot repeat a wallet",
  );

  const ordered = scope.components.map((expected) => {
    const actual = byWallet.get(expected.walletId);
    economyAssert(
      actual !== undefined,
      "INVALID_CONTRACT",
      "Portfolio balance is missing an authorized wallet",
    );
    assertPortfolioComponentMatch(expected, actual);
    assertDeterministicWalletBalanceSummary(actual.summary);
    economyAssert(
      actual.summary.walletId === actual.walletId &&
        actual.summary.asOf === asOf,
      "INVALID_CONTRACT",
      "Portfolio component summary must identify its wallet and shared snapshot time",
    );
    return actual;
  });

  const totals: WalletBalanceTotalsV1 = {
    available: serializeTokenSubunits(
      ordered.reduce(
        (sum, item) => sum + parseTokenSubunits(item.summary.available),
        0n,
      ),
    ),
    reserved: serializeTokenSubunits(
      ordered.reduce(
        (sum, item) => sum + parseTokenSubunits(item.summary.reserved),
        0n,
      ),
    ),
    held: serializeTokenSubunits(
      ordered.reduce(
        (sum, item) => sum + parseTokenSubunits(item.summary.held),
        0n,
      ),
    ),
    rewardProgress: serializeTokenSubunits(
      ordered.reduce(
        (sum, item) => sum + parseTokenSubunits(item.summary.rewardProgress),
        0n,
      ),
    ),
  };
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    portfolioId: scope.portfolioId,
    subjectAccountId: scope.subjectAccountId,
    components: ordered,
    totals,
    asOf,
  };
}

/** Validates a portfolio balance read independently of its producing adapter. */
export function assertWalletPortfolioSummary(
  summary: WalletPortfolioSummaryV1,
): void {
  const scope: WalletPortfolioReadScopeV1 = {
    schemaVersion: summary.schemaVersion,
    portfolioId: summary.portfolioId,
    subjectAccountId: summary.subjectAccountId,
    components: summary.components.map(
      ({ walletId, role, beneficiaryAccountId }) => ({
        walletId,
        role,
        ...(beneficiaryAccountId === undefined
          ? {}
          : { beneficiaryAccountId }),
      }),
    ),
  };
  const rebuilt = createWalletPortfolioSummary(
    scope,
    summary.components,
    summary.asOf,
  );
  for (const field of [
    "available",
    "reserved",
    "held",
    "rewardProgress",
  ] as const) {
    economyAssert(
      summary.totals[field] === rebuilt.totals[field],
      "INVALID_CONTRACT",
      "Portfolio balance totals must equal their component column sums",
    );
  }
}

/** Builds monotonic lifetime totals while retaining per-wallet components. */
export function createWalletPortfolioLifetime(
  scope: WalletPortfolioReadScopeV1,
  components: readonly WalletPortfolioLifetimeComponentV1[],
  asOf: IsoTimestamp,
): WalletPortfolioLifetimeV1 {
  assertWalletPortfolioReadScope(scope);
  parseIsoTimestamp(asOf);
  economyAssert(
    components.length === scope.components.length,
    "INVALID_CONTRACT",
    "Portfolio lifetime must include every authorized component exactly once",
  );
  const byWallet = new Map(components.map((item) => [item.walletId, item]));
  economyAssert(
    byWallet.size === components.length,
    "DUPLICATE_IDENTIFIER",
    "Portfolio lifetime cannot repeat a wallet",
  );
  const ordered = scope.components.map((expected) => {
    const actual = byWallet.get(expected.walletId);
    economyAssert(
      actual !== undefined,
      "INVALID_CONTRACT",
      "Portfolio lifetime is missing an authorized wallet",
    );
    assertPortfolioComponentMatch(expected, actual);
    assertWalletLifetimeSnapshot(actual.snapshot);
    economyAssert(
      actual.snapshot.walletId === actual.walletId &&
        actual.snapshot.asOf === asOf,
      "INVALID_CONTRACT",
      "Portfolio lifetime component must identify its wallet and shared snapshot time",
    );
    return actual;
  });
  const sumField = (
    field: Exclude<keyof WalletLifetimeTotalsV1, "schemaVersion">,
  ): TokenSubunitString =>
    serializeTokenSubunits(
      ordered.reduce(
        (sum, item) => sum + parseTokenSubunits(item.snapshot.totals[field]),
        0n,
      ),
    );
  const totals: WalletLifetimeTotalsV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    bought: sumField("bought"),
    earned: sumField("earned"),
    allocated: sumField("allocated"),
    reclaimed: sumField("reclaimed"),
    spent: sumField("spent"),
    reversed: sumField("reversed"),
  };
  assertWalletLifetimeTotals(totals);
  return {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    portfolioId: scope.portfolioId,
    subjectAccountId: scope.subjectAccountId,
    components: ordered,
    totals,
    asOf,
  };
}

/** Validates a portfolio lifetime read independently of its producing adapter. */
export function assertWalletPortfolioLifetime(
  lifetime: WalletPortfolioLifetimeV1,
): void {
  const scope: WalletPortfolioReadScopeV1 = {
    schemaVersion: lifetime.schemaVersion,
    portfolioId: lifetime.portfolioId,
    subjectAccountId: lifetime.subjectAccountId,
    components: lifetime.components.map(
      ({ walletId, role, beneficiaryAccountId }) => ({
        walletId,
        role,
        ...(beneficiaryAccountId === undefined
          ? {}
          : { beneficiaryAccountId }),
      }),
    ),
  };
  const rebuilt = createWalletPortfolioLifetime(
    scope,
    lifetime.components,
    lifetime.asOf,
  );
  for (const field of [
    "bought",
    "earned",
    "allocated",
    "reclaimed",
    "spent",
    "reversed",
  ] as const) {
    economyAssert(
      lifetime.totals[field] === rebuilt.totals[field],
      "INVALID_CONTRACT",
      "Portfolio lifetime totals must equal their component column sums",
    );
  }
}

/** Validates the economic/workflow activity discriminant and safe display data. */
export function assertWalletActivityEntry(
  entry: WalletActivityEntryV1,
): void {
  economyAssert(
    entry.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet-activity contract version",
  );
  assertEconomyIdentifier(entry.activityId, "activityId");
  assertEconomyIdentifier(entry.walletId, "walletId");
  economyAssert(
    ACTIVITY_TYPES.has(entry.activityType) &&
      ACTIVITY_STATUSES.has(entry.status) &&
      ACTIVITY_SOURCES.has(entry.source),
    "INVALID_CONTRACT",
    "Wallet activity type, status, or source is unsupported",
  );
  parseIsoTimestamp(entry.occurredAt);
  economyAssert(
    parseTokenSubunits(entry.amount) !== 0n,
    "INVALID_AMOUNT",
    "Wallet activity amount cannot be zero",
  );
  if (entry.beneficiaryAccountId !== undefined) {
    assertEconomyIdentifier(
      entry.beneficiaryAccountId,
      "beneficiaryAccountId",
    );
  }
  if (entry.maskedReference !== undefined) {
    assertSafeDisplayString(entry.maskedReference, "Masked reference");
  }
  assertSafeDisplayString(entry.sourceLabel, "Source label");
  economyAssert(
    entry.entryKind === "economic" || entry.entryKind === "workflow",
    "INVALID_CONTRACT",
    "Wallet activity has an unsupported entry kind",
  );
  if (entry.entryKind === "economic") {
    assertEconomyIdentifier(entry.transactionId, "transactionId");
    economyAssert(
      entry.status === "held" ||
        entry.status === "settled" ||
        entry.status === "reversed",
      "INVALID_CONTRACT",
      "Economic activity cannot use a workflow status",
    );
  } else {
    assertEconomyIdentifier(entry.commandId, "commandId");
    economyAssert(
      entry.status === "pending" || entry.status === "failed",
      "INVALID_CONTRACT",
      "Workflow activity cannot use an economic status",
    );
  }
}

/** Validates bounded filters and opaque cursor input. */
export function assertWalletActivityPageRequest(
  request: WalletActivityPageRequestV1,
): void {
  economyAssert(
    Number.isSafeInteger(request.limit) &&
      request.limit >= 1 &&
      request.limit <= 100,
    "INVALID_CONTRACT",
    "Activity page limit must be between one and 100",
  );
  if (request.cursor !== undefined) {
    assertOpaqueCursor(request.cursor);
  }
  const filter = request.filter;
  if (filter === undefined) {
    return;
  }
  if (filter.activityTypes !== undefined) {
    assertUniqueValues(filter.activityTypes, ACTIVITY_TYPES, "Activity types");
  }
  if (filter.statuses !== undefined) {
    assertUniqueValues(filter.statuses, ACTIVITY_STATUSES, "Activity statuses");
  }
  if (filter.sources !== undefined) {
    assertUniqueValues(filter.sources, ACTIVITY_SOURCES, "Activity sources");
  }
  if (filter.beneficiaryAccountId !== undefined) {
    assertEconomyIdentifier(
      filter.beneficiaryAccountId,
      "beneficiaryAccountId",
    );
  }
  const from =
    filter.fromInclusive === undefined
      ? undefined
      : parseIsoTimestamp(filter.fromInclusive);
  const to =
    filter.toExclusive === undefined
      ? undefined
      : parseIsoTimestamp(filter.toExclusive);
  economyAssert(
    from === undefined || to === undefined || from < to,
    "INVALID_TIME_WINDOW",
    "Activity filter start must precede its exclusive end",
  );
}

/**
 * Validates stable descending `(occurredAt, activityId)` page order and cursor
 * presence. Cursors remain opaque to this provider-neutral package.
 */
export function assertWalletActivityPage(page: WalletActivityPageV1): void {
  economyAssert(
    page.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      typeof page.hasMore === "boolean",
    "INVALID_CONTRACT",
    "Unsupported wallet-activity-page contract",
  );
  economyAssert(
    page.hasMore === (page.nextCursor !== undefined),
    "INVALID_CONTRACT",
    "Activity page cursor must be present exactly when more rows exist",
  );
  economyAssert(
    page.entries.length <= 100 && (!page.hasMore || page.entries.length > 0),
    "INVALID_CONTRACT",
    "Activity pages are bounded and cannot advertise more rows from an empty page",
  );
  if (page.nextCursor !== undefined) {
    assertOpaqueCursor(page.nextCursor);
  }
  const activityIds = new Set<string>();
  let previous: WalletActivityEntryV1 | undefined;
  for (const entry of page.entries) {
    assertWalletActivityEntry(entry);
    economyAssert(
      !activityIds.has(entry.activityId),
      "DUPLICATE_IDENTIFIER",
      "Activity page cannot repeat an activity ID",
    );
    activityIds.add(entry.activityId);
    if (previous !== undefined) {
      const previousTime = parseIsoTimestamp(previous.occurredAt);
      const currentTime = parseIsoTimestamp(entry.occurredAt);
      economyAssert(
        previousTime > currentTime ||
          (previousTime === currentTime &&
            previous.activityId.localeCompare(entry.activityId) > 0),
        "INVALID_CONTRACT",
        "Activity page must use stable descending time and ID order",
      );
    }
    previous = entry;
  }
}

/** Prevents an activity cursor/result from expanding an authorized portfolio. */
export function assertWalletActivityPageForPortfolio(
  page: WalletActivityPageV1,
  scope: WalletPortfolioReadScopeV1,
): void {
  assertWalletActivityPage(page);
  assertWalletPortfolioReadScope(scope);
  const walletIds = new Set(scope.components.map((item) => item.walletId));
  economyAssert(
    page.entries.every((entry) => walletIds.has(entry.walletId)),
    "INVALID_CONTRACT",
    "Portfolio activity contains a wallet outside its authorized read scope",
  );
}

/** Read-only adapter boundary; authorization must precede scope construction. */
export interface EconomyQueryPortV1 {
  getWalletSummary(walletId: WalletId): Promise<WalletBalanceSummaryV1 | null>;
  getWalletLifetime(
    walletId: WalletId,
  ): Promise<WalletLifetimeSnapshotV1 | null>;
  listWalletActivity(
    walletId: WalletId,
    request: WalletActivityPageRequestV1,
  ): Promise<WalletActivityPageV1>;
  getPortfolioSummary(
    scope: WalletPortfolioReadScopeV1,
  ): Promise<WalletPortfolioSummaryV1>;
  getPortfolioLifetime(
    scope: WalletPortfolioReadScopeV1,
  ): Promise<WalletPortfolioLifetimeV1>;
  listPortfolioActivity(
    scope: WalletPortfolioReadScopeV1,
    request: WalletActivityPageRequestV1,
  ): Promise<WalletActivityPageV1>;
}
