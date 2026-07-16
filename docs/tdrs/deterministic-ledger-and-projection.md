# TDR: Deterministic ledger and projection rules

## Direction

- Validate every transaction before projection.
- Require at least two non-zero postings and an exact zero sum.
- Deduplicate transaction IDs, idempotency keys, and provider-event IDs.
- Apply postings in the accepted journal order; sort only for canonical hashing
  using locale-independent code-unit order. For validated ASCII identifiers and
  metadata keys, this matches PostgreSQL `COLLATE "C"`.
- Protect spendable/reservable accounts from negative balances while allowing
  modeled clearing accounts to carry signed balances.
- Rebuild projections solely from immutable transactions.
- Reverse economic effects with one compensating transaction, never row edits.
- Select eligible lots deterministically by credited timestamp then lot ID; the
  persistence adapter must lock and consume those slices atomically.

## Persistence expectations

Existing adapters may implement `EconomyPersistencePort`. New authoritative
adapters implement `EconomyPersistencePortV2` with the atomic delta, source-lot
movement, allocation CAS, chain-head, idempotency, and outbox sequence defined
in [Atomic projections and read model V2](./atomic-projections-and-read-model-v2.md).
V2 must not emulate an atomic add with V1's whole-projection replacement.
