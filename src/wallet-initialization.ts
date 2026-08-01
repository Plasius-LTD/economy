import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type EconomyContractVersion,
  type IsoTimestamp,
} from "./contracts.js";
import { serializeTokenSubunits } from "./amount.js";
import { economyAssert } from "./errors.js";
import type { CanonicalPayloadHashFunctionV1 } from "./integrity.js";
import {
  assertWalletLifetimeSnapshot,
  assertWalletPortfolioReadScope,
  type WalletActivityEntryV1,
  type WalletLifetimeSnapshotV1,
  type WalletPortfolioReadScopeV1,
} from "./ports/query.js";
import {
  assertWallet,
  assertWalletBalanceSummary,
  type WalletBalanceSummaryV1,
  type WalletV1,
} from "./wallets.js";

const INITIALIZATION_IDENTITY_DOMAIN =
  "economy.personal-wallet-initialization.identity.v1";
const ZERO_TOKEN_SUBUNITS = serializeTokenSubunits(0n);

export type WalletInitializationNoOpCodeV1 =
  | "WALLET_INITIALIZED"
  | "WALLET_ALREADY_INITIALIZED";

/** Deterministic storage identities for one self-owned personal wallet. */
export interface PersonalWalletInitializationDocumentIdsV1 {
  readonly walletDescriptorId: string;
  readonly accessProjectionId: string;
  readonly balanceProjectionId: string;
  readonly lifetimeProjectionId: string;
  readonly outboxEventId: string;
}

/** Privacy-minimized semantic payload bound by the audited command hash. */
export interface PersonalWalletInitializationCommandV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commandType: "initialize-wallet";
  readonly walletKind: "personal";
  readonly subjectAccountId: AccountId;
  readonly walletId: string;
  readonly portfolioId: string;
  readonly initializedAt: IsoTimestamp;
}

/** Non-economic integration intent emitted in the same authority batch. */
export interface PersonalWalletInitializationOutboxIntentV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly eventType: "wallet.initialized.v1";
  readonly eventId: string;
  readonly subjectAccountId: AccountId;
  readonly walletId: string;
  readonly portfolioId: string;
  readonly occurredAt: IsoTimestamp;
}

/** Complete rebuildable baseline for one new self-owned personal wallet. */
export interface PersonalWalletInitializationStateV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly documentIds: PersonalWalletInitializationDocumentIdsV1;
  readonly command: PersonalWalletInitializationCommandV1;
  readonly wallet: WalletV1;
  readonly scope: WalletPortfolioReadScopeV1;
  readonly balance: WalletBalanceSummaryV1;
  readonly lifetime: WalletLifetimeSnapshotV1;
  /** Initialization itself is not an economic activity. */
  readonly activityEntries: readonly WalletActivityEntryV1[];
  readonly outboxIntent: PersonalWalletInitializationOutboxIntentV1;
}

export interface CreatePersonalWalletInitializationStateInputV1 {
  readonly subjectAccountId: AccountId;
  readonly initializedAt: IsoTimestamp;
}

const STATE_KEYS = new Set([
  "schemaVersion",
  "documentIds",
  "command",
  "wallet",
  "scope",
  "balance",
  "lifetime",
  "activityEntries",
  "outboxIntent",
]);
const COMMAND_KEYS = new Set([
  "schemaVersion",
  "commandType",
  "walletKind",
  "subjectAccountId",
  "walletId",
  "portfolioId",
  "initializedAt",
]);
const OUTBOX_KEYS = new Set([
  "schemaVersion",
  "eventType",
  "eventId",
  "subjectAccountId",
  "walletId",
  "portfolioId",
  "occurredAt",
]);
const DOCUMENT_ID_KEYS = new Set([
  "walletDescriptorId",
  "accessProjectionId",
  "balanceProjectionId",
  "lifetimeProjectionId",
  "outboxEventId",
]);

function assertExactKeys(
  value: object,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  economyAssert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INVALID_CONTRACT",
    `${label} must be an object`,
  );
  economyAssert(
    Object.keys(value).every((key) => allowed.has(key)),
    "INVALID_CONTRACT",
    `${label} contains an unsupported field`,
  );
}

function identityDigest(
  subjectAccountId: AccountId,
  hash: CanonicalPayloadHashFunctionV1,
): string {
  assertEconomyIdentifier(subjectAccountId, "subjectAccountId");
  const canonicalIdentity = JSON.stringify({
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    domain: INITIALIZATION_IDENTITY_DOMAIN,
    subjectAccountId,
  });
  const canonicalHash = hash(canonicalIdentity);
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(canonicalHash),
    "INVALID_CONTRACT",
    "Wallet initialization identity hash must be canonical SHA-256",
  );
  return canonicalHash.slice("sha256:".length);
}

/** Produces stable, non-guessable-by-sequence IDs without owning cryptography. */
export function createPersonalWalletInitializationDocumentIds(
  subjectAccountId: AccountId,
  hash: CanonicalPayloadHashFunctionV1,
): PersonalWalletInitializationDocumentIdsV1 & {
  readonly walletId: string;
  readonly portfolioId: string;
} {
  const digest = identityDigest(subjectAccountId, hash);
  return {
    walletId: `wallet:personal:${digest}`,
    portfolioId: `portfolio:self:${digest}`,
    walletDescriptorId: `wallet-descriptor:${digest}`,
    accessProjectionId: `wallet-access:${digest}`,
    balanceProjectionId: `wallet-balance:${digest}`,
    lifetimeProjectionId: `wallet-lifetime:${digest}`,
    outboxEventId: `outbox:wallet-initialized:${digest}`,
  };
}

/** Validates the exact semantic initialization payload before hashing it. */
export function assertPersonalWalletInitializationCommand(
  command: PersonalWalletInitializationCommandV1,
): void {
  assertExactKeys(command, COMMAND_KEYS, "Wallet initialization command");
  economyAssert(
    command.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      command.commandType === "initialize-wallet" &&
      command.walletKind === "personal",
    "INVALID_CONTRACT",
    "Unsupported personal-wallet initialization command",
  );
  assertEconomyIdentifier(command.subjectAccountId, "subjectAccountId");
  assertEconomyIdentifier(command.walletId, "walletId");
  assertEconomyIdentifier(command.portfolioId, "portfolioId");
  parseIsoTimestamp(command.initializedAt);
}

/** Returns the exact UTF-8 JSON bytes an approved SHA-256 adapter must hash. */
export function canonicalPersonalWalletInitializationCommandPayload(
  command: PersonalWalletInitializationCommandV1,
): string {
  assertPersonalWalletInitializationCommand(command);
  return JSON.stringify({
    schemaVersion: command.schemaVersion,
    commandType: command.commandType,
    walletKind: command.walletKind,
    subjectAccountId: command.subjectAccountId,
    walletId: command.walletId,
    portfolioId: command.portfolioId,
    initializedAt: command.initializedAt,
  });
}

/** Validates the privacy-minimized outbox intent. */
export function assertPersonalWalletInitializationOutboxIntent(
  intent: PersonalWalletInitializationOutboxIntentV1,
): void {
  assertExactKeys(intent, OUTBOX_KEYS, "Wallet initialization outbox intent");
  economyAssert(
    intent.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      intent.eventType === "wallet.initialized.v1",
    "INVALID_CONTRACT",
    "Unsupported wallet initialization outbox intent",
  );
  assertEconomyIdentifier(intent.eventId, "eventId");
  assertEconomyIdentifier(intent.subjectAccountId, "subjectAccountId");
  assertEconomyIdentifier(intent.walletId, "walletId");
  assertEconomyIdentifier(intent.portfolioId, "portfolioId");
  parseIsoTimestamp(intent.occurredAt);
}

/** Canonical bytes for the create-only initialization outbox fact. */
export function canonicalPersonalWalletInitializationOutboxPayload(
  intent: PersonalWalletInitializationOutboxIntentV1,
): string {
  assertPersonalWalletInitializationOutboxIntent(intent);
  return JSON.stringify({
    schemaVersion: intent.schemaVersion,
    eventType: intent.eventType,
    eventId: intent.eventId,
    subjectAccountId: intent.subjectAccountId,
    walletId: intent.walletId,
    portfolioId: intent.portfolioId,
    occurredAt: intent.occurredAt,
  });
}

/**
 * Builds the complete exact-zero personal-wallet baseline. The caller supplies
 * SHA-256 and persists these records with receipts, idempotency, the authority
 * manifest, and the conditional head advance in one ACID boundary.
 */
export function createPersonalWalletInitializationState(
  input: CreatePersonalWalletInitializationStateInputV1,
  hash: CanonicalPayloadHashFunctionV1,
): PersonalWalletInitializationStateV1 {
  parseIsoTimestamp(input.initializedAt);
  const { walletId, portfolioId, ...documentIds } =
    createPersonalWalletInitializationDocumentIds(
      input.subjectAccountId,
      hash,
    );
  const command: PersonalWalletInitializationCommandV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    commandType: "initialize-wallet",
    walletKind: "personal",
    subjectAccountId: input.subjectAccountId,
    walletId,
    portfolioId,
    initializedAt: input.initializedAt,
  };
  const state: PersonalWalletInitializationStateV1 = {
    schemaVersion: ECONOMY_CONTRACT_VERSION,
    documentIds,
    command,
    wallet: {
      schemaVersion: ECONOMY_CONTRACT_VERSION,
      walletId,
      accountId: input.subjectAccountId,
      kind: "personal",
      ownerType: "account",
      ownerId: input.subjectAccountId,
      status: "active",
      version: 1,
      createdAt: input.initializedAt,
    },
    scope: {
      schemaVersion: ECONOMY_CONTRACT_VERSION,
      portfolioId,
      subjectAccountId: input.subjectAccountId,
      components: [{ walletId, role: "personal" }],
    },
    balance: {
      schemaVersion: ECONOMY_CONTRACT_VERSION,
      walletId,
      available: ZERO_TOKEN_SUBUNITS,
      reserved: ZERO_TOKEN_SUBUNITS,
      held: ZERO_TOKEN_SUBUNITS,
      rewardProgress: ZERO_TOKEN_SUBUNITS,
      version: 1,
      asOf: input.initializedAt,
    },
    lifetime: {
      schemaVersion: ECONOMY_CONTRACT_VERSION,
      walletId,
      totals: {
        schemaVersion: ECONOMY_CONTRACT_VERSION,
        bought: ZERO_TOKEN_SUBUNITS,
        earned: ZERO_TOKEN_SUBUNITS,
        allocated: ZERO_TOKEN_SUBUNITS,
        reclaimed: ZERO_TOKEN_SUBUNITS,
        spent: ZERO_TOKEN_SUBUNITS,
        reversed: ZERO_TOKEN_SUBUNITS,
      },
      version: 1,
      asOf: input.initializedAt,
    },
    activityEntries: [],
    outboxIntent: {
      schemaVersion: ECONOMY_CONTRACT_VERSION,
      eventType: "wallet.initialized.v1",
      eventId: documentIds.outboxEventId,
      subjectAccountId: input.subjectAccountId,
      walletId,
      portfolioId,
      occurredAt: input.initializedAt,
    },
  };
  assertPersonalWalletInitializationState(state);
  return state;
}

/** Proves the personal-wallet initialization state is complete and exact-zero. */
export function assertPersonalWalletInitializationState(
  state: PersonalWalletInitializationStateV1,
): void {
  assertExactKeys(state, STATE_KEYS, "Wallet initialization state");
  assertExactKeys(
    state.documentIds,
    DOCUMENT_ID_KEYS,
    "Wallet initialization document IDs",
  );
  economyAssert(
    state.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported wallet initialization state",
  );
  for (const identifier of Object.values(state.documentIds)) {
    assertEconomyIdentifier(identifier, "wallet initialization document ID");
  }
  economyAssert(
    new Set(Object.values(state.documentIds)).size ===
      Object.values(state.documentIds).length,
    "INVALID_CONTRACT",
    "Wallet initialization document IDs must be unique",
  );
  assertPersonalWalletInitializationCommand(state.command);
  assertWallet(state.wallet);
  assertWalletPortfolioReadScope(state.scope);
  assertWalletBalanceSummary(state.balance);
  assertWalletLifetimeSnapshot(state.lifetime);
  assertPersonalWalletInitializationOutboxIntent(state.outboxIntent);
  economyAssert(
    state.wallet.walletId === state.command.walletId &&
      state.wallet.accountId === state.command.subjectAccountId &&
      state.wallet.ownerId === state.command.subjectAccountId &&
      state.wallet.kind === "personal" &&
      state.wallet.ownerType === "account" &&
      state.wallet.createdAt === state.command.initializedAt &&
      state.scope.portfolioId === state.command.portfolioId &&
      state.scope.subjectAccountId === state.command.subjectAccountId &&
      state.scope.components.length === 1 &&
      state.scope.components[0]?.walletId === state.command.walletId &&
      state.scope.components[0]?.role === "personal" &&
      state.scope.components[0]?.beneficiaryAccountId === undefined &&
      state.balance.walletId === state.command.walletId &&
      state.balance.available === ZERO_TOKEN_SUBUNITS &&
      state.balance.reserved === ZERO_TOKEN_SUBUNITS &&
      state.balance.held === ZERO_TOKEN_SUBUNITS &&
      state.balance.rewardProgress === ZERO_TOKEN_SUBUNITS &&
      state.balance.version === 1 &&
      state.balance.asOf === state.command.initializedAt &&
      state.lifetime.walletId === state.command.walletId &&
      state.lifetime.version === 1 &&
      state.lifetime.asOf === state.command.initializedAt &&
      state.lifetime.totals.bought === ZERO_TOKEN_SUBUNITS &&
      state.lifetime.totals.earned === ZERO_TOKEN_SUBUNITS &&
      state.lifetime.totals.allocated === ZERO_TOKEN_SUBUNITS &&
      state.lifetime.totals.reclaimed === ZERO_TOKEN_SUBUNITS &&
      state.lifetime.totals.spent === ZERO_TOKEN_SUBUNITS &&
      state.lifetime.totals.reversed === ZERO_TOKEN_SUBUNITS &&
      state.activityEntries.length === 0 &&
      state.outboxIntent.eventId === state.documentIds.outboxEventId &&
      state.outboxIntent.subjectAccountId === state.command.subjectAccountId &&
      state.outboxIntent.walletId === state.command.walletId &&
      state.outboxIntent.portfolioId === state.command.portfolioId &&
      state.outboxIntent.occurredAt === state.command.initializedAt,
    "INVALID_CONTRACT",
    "Personal-wallet initialization state is incomplete or inconsistent",
  );
}
