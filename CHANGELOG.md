# Changelog

All notable changes to this project are documented here. Release section
promotion is owned by the approved GitHub CD workflow.

## Unreleased

- **Added**
  - Added purpose-bound `ModuleAllowanceV1` contracts with exact funding,
    reclaim, quote, hold, settle, release, receipt, and reconciliation
    invariants for Guardian-funded Junior Coder module entitlements.
  - Added immutable pre-purchase requirements-manifest evidence and fail-closed
    cross-service reconciliation outcomes without changing
    `GameplayAllocationV1`.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - Module settlement now requires a pending entitlement identifier, while
    inconsistent settled-debit or active-entitlement observations require
    blocking manual review.

## [0.3.2] - 2026-07-17

- **Added**
  - Added provider-neutral, versioned paid-acquisition lifecycles for
    deterministic purchase-intent transitions, atomic payer/household rolling
    cap reservation/finalization, and retained-lot refund/dispute arithmetic.
  - Added exact GBP minor-unit parsing, one-credit/one-reversal replay guards,
    current early-backer retained-basis inputs, and property/concurrency tests.

- **Changed**
  - Documented paid-acquisition compare-and-swap, allocation-reclaim, feature-
    flag, and adapter trust boundaries while preserving all published V1 APIs.

- **Fixed**
  - (placeholder)

- **Security**
  - Conflicting event-ID reuse, stale cap/lifecycle writers, half-mirrored cap
    state, rolling-cap overspend, and duplicate economic effects now fail in
    deterministic domain validation.

## [0.3.1] - 2026-07-16

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
[0.3.1]: https://github.com/Plasius-LTD/economy/releases/tag/v0.3.1
[0.3.2]: https://github.com/Plasius-LTD/economy/releases/tag/v0.3.2
