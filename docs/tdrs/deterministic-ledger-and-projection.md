# TDR: Deterministic ledger and projection rules

## Direction

- Validate every transaction before projection.
- Require at least two non-zero postings and an exact zero sum.
- Deduplicate transaction IDs, idempotency keys, and provider-event IDs.
- Apply postings in the accepted journal order; sort only for canonical hashing.
- Protect spendable/reservable accounts from negative balances while allowing
  modeled clearing accounts to carry signed balances.
- Rebuild projections solely from immutable transactions.
- Reverse economic effects with one compensating transaction, never row edits.
- Select eligible lots deterministically by credited timestamp then lot ID; the
  persistence adapter must lock and consume those slices atomically.

## Persistence expectations

The site adapter implements the `EconomyPersistencePort` with a serializable
database transaction, row/procedure security, same-transaction balance update,
idempotency result, and transactional outbox append.

