import type { TokenSubunitString } from "../amount.js";
import type {
  AccountId,
  EconomyContractVersion,
  IsoTimestamp,
  LotId,
  TransactionId,
  WalletId,
} from "../contracts.js";
import type { LedgerTransactionV1 } from "../ledger.js";
import type { SourceLotV1 } from "../lots.js";
import type {
  BalanceProjection,
  BalanceProjectionSnapshotV1,
} from "../projection.js";
import type { WalletV1 } from "../wallets.js";

export type EconomyCommandType =
  | "credit-purchase"
  | "credit-reward"
  | "allocate"
  | "boost"
  | "reclaim"
  | "hold"
  | "refund"
  | "chargeback"
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

export interface EconomyClockPort {
  now(): IsoTimestamp;
}

export interface EconomyIdPort {
  nextId(namespace: string): string;
}

