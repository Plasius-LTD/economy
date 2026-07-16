# ADR-0002: Atomic persistence V2 and explicit portfolio reads

## Status

- Accepted
- Date: 2026-07-15

## Context

The initial package exposed a useful persistence sketch but its unit of work
could replace an entire balance projection, did not persist allocation state or
accepted command evidence, and could update source-lot amounts without an
immutable movement, refund-state transition, or optimistic version. It also had
no lock contract for the canonical hash-chain head.

The initial single-wallet summary cannot safely represent an adult host who has
both a household treasury and a same-user-only personal reward wallet. Hiding
those balances behind one wallet ID would erase transfer-policy boundaries.
Finally, the V1 activity status union allowed pending and failed workflows to
look like economic journal transactions.

## Decision

- Preserve all V1 public interfaces and behavior.
- Add `EconomyPersistencePortV2` and `EconomyUnitOfWorkV2`; do not extend the V1
  unit of work because that would retain its unsafe absolute projection write.
- V2 appends accepted command/workflow evidence, locks an exact owner-scoped
  wallet, loads household-and-child-scoped allocations, locks versioned source lots,
  appends and applies source-lot movements atomically, adds wallet balance and
  lifetime deltas, locks/advances a canonical chain head, records idempotency,
  and appends the outbox inside one serializable transaction.
- V2 idempotency lookup is namespaced by actor, subject, command type, and key;
  it cannot replay another principal's result. The unit of work also locks and
  validates the active regional writer fence before any journal mutation.
- Store mutually exclusive wallet projection buckets (`spendable`, `reserved`,
  `held`). Derive whole-Token availability and per-wallet sub-Token progress.
- Treat lifetime categories as monotonic gross counters rebuilt from settled,
  wallet-relative economic postings. Compensations add to `reversed` and never
  rewrite acquisition history.
- Add a server-authorized `WalletPortfolioReadScopeV1` and
  `EconomyQueryPortV1`. Results retain every wallet ID, role, beneficiary, and
  component snapshot. Aggregate columns are display sums only and never promote
  progress across wallets.
- Narrow V2 journal writes to `EconomicJournalTransactionV1` (`held` or
  `settled`). Model `pending`/`failed` as workflow activity; derive `reversed`
  for reads from compensating transactions.
- Add a settlement-authoritative early-backer V2 evaluator without changing
  the V1 evaluator. Public/staff/test/beta cohort classification remains an
  application rollout responsibility, not a timestamp-domain inference.

## Consequences

- PostgreSQL adapters can use atomic `balance = balance + delta` statements,
  unique transaction-application keys, row locks, and compare-and-swap versions
  without accepting caller-supplied absolute balances.
- A hash is computed only after locking the chain head; the head is advanced in
  the same commit as the journal and projection effects.
- Workflow failures remain visible without creating fake balanced postings or
  changing lifetime metrics.
- API adapters must authorize and construct portfolio scopes from trusted
  identity/relationship data. Query cursors cannot expand that scope.
- Existing V1 consumers keep compiling, but new authoritative adapters must not
  emulate V2 by delegating to `saveBalanceProjection`.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- Site ADR-0045 selects PostgreSQL for primary relational OLTP.
- Site ADR-0066 keeps gameplay point ledgers separate.
