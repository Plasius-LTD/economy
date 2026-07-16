# Changelog

All notable changes to this project are documented here. Release section
promotion is owned by the approved GitHub CD workflow.

## Unreleased

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - Made canonical transaction metadata and posting ordering independent of
    host locale, with exact JSON and SHA-256 golden vectors aligned to
    PostgreSQL `COLLATE "C"` ordering for the validated ASCII fields.

- **Security**
  - (placeholder)

## [0.3.0] - 2026-07-16

- **Added**
  - Added the backward-compatible `EconomyPersistencePortV2` atomic mutation boundary for command/workflow evidence, owner-constrained wallets and allocations, versioned source-lot movements, balance/lifetime deltas, active-writer fencing, canonical chain-head locking, actor/subject/command-scoped idempotency, and outbox append.
  - Added `EconomyQueryPortV1`, explicit multi-wallet portfolio scopes/results, deterministic wallet balance and lifetime helpers, and discriminated economic versus workflow activity with bounded cursor pagination.
  - Added settlement-authoritative early-backer policy V2 while retaining the V1 evaluator unchanged.

- **Changed**
  - Documented exclusive spendable/reserved/held projection buckets, per-wallet progress, non-fungible portfolio aggregation, monotonic gross lifetime totals, and the V2 serializable mutation order.

- **Fixed**
  - (placeholder)

- **Security**
  - New persistence contracts replace absolute balance writes with transaction-scoped atomic deltas and require source-lot/refund/version, active-writer-fence, scoped-idempotency, and canonical chain-head transitions to commit with the immutable journal.

## [0.2.0] - 2026-07-15

- **Added**
  - (placeholder)

- **Changed**
  - Added stable `TokenSource` provenance to privacy-safe activity entries so UI filters never depend on localized source labels.

- **Fixed**
  - Rejected non-string JSON values in exact amount, identifier, timestamp, and activity display validation instead of permitting implicit coercion or native type errors.

- **Security**
  - (placeholder)

## [0.1.0] - 2026-07-15

- Create the provider-neutral Token economy package with exact TokenSubunit
  arithmetic, versioned wallet/journal/source-lot/allocation/acquisition/backer
  contracts, deterministic double-entry and projection invariants, one-time
  compensating reversals, dual-control adjustment checks, and persistence ports.
- Add the canonical flat GBP catalog, £0.10 nominal/no-redemption metadata,
  default payer controls, disabled monthly recurrence descriptor, strict
  purchase-intent/provider conversion validation, and same-user reward-lot policy.
- Add generated domain property tests and packed-entrypoint freshness/export checks.


[0.1.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.1.0
[0.2.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.2.0
[0.3.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.3.0
