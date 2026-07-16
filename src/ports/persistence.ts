import type { TokenSubunitString } from "../amount.js";
import type { GameplayAllocationV1 } from "../allocations.js";
import {
  ECONOMY_CONTRACT_VERSION,
  assertEconomyIdentifier,
  parseIsoTimestamp,
  type AccountId,
  type AllocationId,
  type EconomyContractVersion,
  type HouseholdId,
  type IsoTimestamp,
  type LotId,
  type TransactionId,
  type WalletId,
} from "../contracts.js";
import { economyAssert } from "../errors.js";
import type {
  ChainedEconomicJournalTransactionV1,
  JournalChainHeadV1,
} from "../integrity.js";
import type { LedgerTransactionV1 } from "../ledger.js";
import type {
  SourceLotMovementV1,
  SourceLotV1,
  VersionedSourceLotV1,
} from "../lots.js";
import type {
  BalanceProjection,
  BalanceProjectionSnapshotV1,
  WalletBalanceDeltaV1,
  WalletBalanceProjectionV1,
  WalletLifetimeDeltaV1,
} from "../projection.js";
import type {
  WalletOwnerReferenceV1,
  WalletV1,
} from "../wallets.js";

export type EconomyCommandType =
  | "credit-purchase"
  | "credit-subscription"
  | "credit-reward"
  | "credit-event"
  | "credit-competition"
  | "allocate"
  | "boost"
  | "reclaim"
  | "spend"
  | "hold"
  | "release-hold"
  | "refund"
  | "chargeback"
  | "reverse"
  | "adjust";

export interface EconomyCommandEnvelopeV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commandId: string;
  readonly commandType: EconomyCommandType;
  readonly idempotencyKey: string;
  readonly actorAccountId: AccountId;
  readonly subjectAccountId: AccountId;
  readonly relationshipId?: string;
  readonly authorizationVersion?: number;
  readonly payloadHash: string;
  readonly acceptedAt: IsoTimestamp;
  readonly acceptedRegion: string;
  readonly writerFencingToken: string;
}

export type EconomyCommandWorkflowStateV1 =
  | "accepted"
  | "processing"
  | "failed"
  | "completed";

/** Immutable workflow evidence; it is never an economic journal transaction. */
export interface EconomyCommandWorkflowEventV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly workflowEventId: string;
  readonly commandId: string;
  readonly state: EconomyCommandWorkflowStateV1;
  /** Stable non-sensitive classifier; detailed failure data stays operational. */
  readonly failureCode?: string;
  readonly occurredAt: IsoTimestamp;
}

export interface EconomyOutboxEventV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly eventId: string;
  readonly transactionId: TransactionId;
  readonly eventType: string;
  readonly payloadHash: string;
  readonly occurredAt: IsoTimestamp;
}

export interface PersistedIdempotencyResultV1 {
  readonly transactionId: TransactionId;
  readonly responseHash: string;
  readonly recordedAt: IsoTimestamp;
}

/** Exact actor/subject/operation namespace for a caller-owned idempotency key. */
export interface EconomyIdempotencyScopeV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly idempotencyKey: string;
  readonly commandType: EconomyCommandType;
  readonly actorAccountId: AccountId;
  readonly subjectAccountId: AccountId;
}

/** V2 replay evidence bound to one accepted command and exact scope. */
export interface ScopedPersistedIdempotencyResultV1
  extends PersistedIdempotencyResultV1 {
  readonly schemaVersion: EconomyContractVersion;
  readonly commandId: string;
}

/** Validates replay evidence before it is returned across a command boundary. */
export function assertScopedPersistedIdempotencyResult(
  result: ScopedPersistedIdempotencyResultV1,
): void {
  economyAssert(
    result.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported scoped idempotency-result contract version",
  );
  assertEconomyIdentifier(result.commandId, "commandId");
  assertEconomyIdentifier(result.transactionId, "transactionId");
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(result.responseHash),
    "INVALID_CONTRACT",
    "Idempotency response hash must be a canonical SHA-256 reference",
  );
  parseIsoTimestamp(result.recordedAt);
}

const ECONOMY_COMMAND_TYPES = new Set<EconomyCommandType>([
  "credit-purchase",
  "credit-subscription",
  "credit-reward",
  "credit-event",
  "credit-competition",
  "allocate",
  "boost",
  "reclaim",
  "spend",
  "hold",
  "release-hold",
  "refund",
  "chargeback",
  "reverse",
  "adjust",
]);

/** Validates the namespace that prevents cross-principal replay collisions. */
export function assertEconomyIdempotencyScope(
  scope: EconomyIdempotencyScopeV1,
): void {
  economyAssert(
    scope.schemaVersion === ECONOMY_CONTRACT_VERSION &&
      ECONOMY_COMMAND_TYPES.has(scope.commandType),
    "INVALID_CONTRACT",
    "Unsupported economy idempotency scope",
  );
  assertEconomyIdentifier(scope.idempotencyKey, "idempotencyKey");
  assertEconomyIdentifier(scope.actorAccountId, "actorAccountId");
  assertEconomyIdentifier(scope.subjectAccountId, "subjectAccountId");
}

/** Validates minimized accepted-command evidence before durable append. */
export function assertEconomyCommandEnvelope(
  envelope: EconomyCommandEnvelopeV1,
): void {
  economyAssert(
    envelope.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported economy-command-envelope contract version",
  );
  assertEconomyIdentifier(envelope.commandId, "commandId");
  economyAssert(
    ECONOMY_COMMAND_TYPES.has(envelope.commandType),
    "INVALID_CONTRACT",
    "Economy command has an unsupported type",
  );
  assertEconomyIdentifier(envelope.idempotencyKey, "idempotencyKey");
  assertEconomyIdentifier(envelope.actorAccountId, "actorAccountId");
  assertEconomyIdentifier(envelope.subjectAccountId, "subjectAccountId");
  if (envelope.relationshipId !== undefined) {
    assertEconomyIdentifier(envelope.relationshipId, "relationshipId");
  }
  if (envelope.authorizationVersion !== undefined) {
    economyAssert(
      Number.isSafeInteger(envelope.authorizationVersion) &&
        envelope.authorizationVersion >= 1,
      "INVALID_CONTRACT",
      "Command authorization version must be a positive safe integer",
    );
  }
  economyAssert(
    (envelope.relationshipId === undefined) ===
      (envelope.authorizationVersion === undefined),
    "INVALID_CONTRACT",
    "Relationship identity and authorization version must be supplied together",
  );
  economyAssert(
    /^sha256:[a-f0-9]{64}$/u.test(envelope.payloadHash),
    "INVALID_CONTRACT",
    "Command payload hash must be a canonical SHA-256 reference",
  );
  parseIsoTimestamp(envelope.acceptedAt);
  assertEconomyIdentifier(envelope.acceptedRegion, "acceptedRegion");
  assertEconomyIdentifier(
    envelope.writerFencingToken,
    "writerFencingToken",
  );
}

/** Validates one immutable command-workflow state event. */
export function assertEconomyCommandWorkflowEvent(
  event: EconomyCommandWorkflowEventV1,
): void {
  economyAssert(
    event.schemaVersion === ECONOMY_CONTRACT_VERSION,
    "INVALID_CONTRACT",
    "Unsupported command-workflow-event contract version",
  );
  assertEconomyIdentifier(event.workflowEventId, "workflowEventId");
  assertEconomyIdentifier(event.commandId, "commandId");
  economyAssert(
    ["accepted", "processing", "failed", "completed"].includes(event.state),
    "INVALID_CONTRACT",
    "Command workflow has an unsupported state",
  );
  economyAssert(
    (event.state === "failed") === (event.failureCode !== undefined),
    "INVALID_CONTRACT",
    "Only failed command workflows require a failure code",
  );
  if (event.failureCode !== undefined) {
    assertEconomyIdentifier(event.failureCode, "failureCode");
  }
  parseIsoTimestamp(event.occurredAt);
}

/** Operations available only inside one serializable database transaction. */
export interface EconomyUnitOfWork {
  getWalletForUpdate(walletId: WalletId): Promise<WalletV1 | null>;
  listSpendableLotsForUpdate(walletId: WalletId): Promise<readonly SourceLotV1[]>;
  findLotForUpdate(lotId: LotId): Promise<SourceLotV1 | null>;
  findIdempotencyResult(
    idempotencyKey: string,
  ): Promise<PersistedIdempotencyResultV1 | null>;
  appendTransaction(transaction: LedgerTransactionV1): Promise<void>;
  appendSourceLot(lot: SourceLotV1): Promise<void>;
  updateSourceLotProjection(
    lotId: LotId,
    remainingAmount: TokenSubunitString,
    heldAmount: TokenSubunitString,
    reversedAmount: TokenSubunitString,
  ): Promise<void>;
  saveBalanceProjection(
    projection: BalanceProjection,
    transactionId: TransactionId,
  ): Promise<void>;
  saveIdempotencyResult(
    idempotencyKey: string,
    result: PersistedIdempotencyResultV1,
  ): Promise<void>;
  appendOutboxEvent(event: EconomyOutboxEventV1): Promise<void>;
}

/** Adapter boundary for serializable, ACID economy mutations. */
export interface EconomyPersistencePort {
  runSerializable<T>(
    operation: (unitOfWork: EconomyUnitOfWork) => Promise<T>,
  ): Promise<T>;
  getWallet(walletId: WalletId): Promise<WalletV1 | null>;
  getBalanceProjection(walletId: WalletId): Promise<BalanceProjectionSnapshotV1 | null>;
  getTransaction(transactionId: TransactionId): Promise<LedgerTransactionV1 | null>;
  rebuildProjection(): Promise<BalanceProjection>;
}

/**
 * V2 mutation surface. Unlike `EconomyUnitOfWork`, it has no absolute balance
 * overwrite: journal, source-lot movement, allocation state, balance/lifetime
 * deltas, idempotency, chain head, and outbox are committed atomically.
 */
export interface EconomyUnitOfWorkV2 {
  getWalletForOwnerForUpdate(
    walletId: WalletId,
    owner: WalletOwnerReferenceV1,
  ): Promise<WalletV1 | null>;
  listSpendableLotsForUpdate(
    walletId: WalletId,
  ): Promise<readonly VersionedSourceLotV1[]>;
  findLotForUpdate(lotId: LotId): Promise<VersionedSourceLotV1 | null>;
  getGameplayAllocationForUpdate(
    allocationId: AllocationId,
    householdId: HouseholdId,
    childAccountId: AccountId,
  ): Promise<GameplayAllocationV1 | null>;
  findIdempotencyResult(
    scope: EconomyIdempotencyScopeV1,
  ): Promise<ScopedPersistedIdempotencyResultV1 | null>;
  /** Locks and rejects any stale/non-active regional writer lease. */
  lockActiveWriterFence(
    acceptedRegion: string,
    writerFencingToken: string,
  ): Promise<void>;
  lockJournalChainHead(chainId: string): Promise<JournalChainHeadV1>;

  appendCommandEnvelope(envelope: EconomyCommandEnvelopeV1): Promise<void>;
  appendCommandWorkflowEvent(
    event: EconomyCommandWorkflowEventV1,
  ): Promise<void>;
  appendTransaction(
    transaction: ChainedEconomicJournalTransactionV1,
  ): Promise<void>;
  /** Appends `createInitialSourceLotSnapshot()` output; later changes are movements. */
  appendSourceLot(snapshot: VersionedSourceLotV1): Promise<void>;
  /** Appends movement evidence and applies its lot CAS as one operation. */
  applySourceLotMovement(movement: SourceLotMovementV1): Promise<void>;
  appendGameplayAllocation(allocation: GameplayAllocationV1): Promise<void>;
  /**
   * Compares `expectedVersion`, requires `allocation.version` to be exactly the
   * next value, and never overwrites a stale row.
   */
  saveGameplayAllocation(
    allocation: GameplayAllocationV1,
    expectedVersion: number,
  ): Promise<void>;
  /**
   * Atomically adds deltas, verifies them against the appended postings and
   * account bindings, and records transaction-scoped application keys.
   */
  applyWalletBalanceDeltas(
    transactionId: TransactionId,
    deltas: readonly WalletBalanceDeltaV1[],
  ): Promise<void>;
  /**
   * Atomically increments monotonic lifetime counters after verifying the
   * deltas against the appended transaction's deterministic classification.
   */
  applyWalletLifetimeDeltas(
    transactionId: TransactionId,
    deltas: readonly WalletLifetimeDeltaV1[],
  ): Promise<void>;
  saveIdempotencyResult(
    scope: EconomyIdempotencyScopeV1,
    result: ScopedPersistedIdempotencyResultV1,
  ): Promise<void>;
  appendOutboxEvent(event: EconomyOutboxEventV1): Promise<void>;
  /** Compare-and-swaps the full locked head, including its canonical hash. */
  advanceJournalChainHead(
    expected: JournalChainHeadV1,
    next: JournalChainHeadV1,
  ): Promise<void>;
}

/**
 * Additive authoritative persistence boundary for new consumers. V1 remains
 * exported for compatibility but must not be adapted by delegating its
 * absolute `saveBalanceProjection` operation to this interface.
 */
export interface EconomyPersistencePortV2 {
  runSerializable<T>(
    operation: (unitOfWork: EconomyUnitOfWorkV2) => Promise<T>,
  ): Promise<T>;
  getWallet(walletId: WalletId): Promise<WalletV1 | null>;
  listWalletsByOwner(
    owner: WalletOwnerReferenceV1,
  ): Promise<readonly WalletV1[]>;
  getGameplayAllocation(
    allocationId: AllocationId,
    householdId: HouseholdId,
    childAccountId: AccountId,
  ): Promise<GameplayAllocationV1 | null>;
  getCommandEnvelope(
    commandId: string,
  ): Promise<EconomyCommandEnvelopeV1 | null>;
  getTransaction(
    transactionId: TransactionId,
  ): Promise<ChainedEconomicJournalTransactionV1 | null>;
  rebuildWalletBalanceProjections(): Promise<
    readonly WalletBalanceProjectionV1[]
  >;
}

export interface EconomyClockPort {
  now(): IsoTimestamp;
}

export interface EconomyIdPort {
  nextId(namespace: string): string;
}
