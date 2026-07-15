# Changelog

All notable changes to this project are documented here. Release section
promotion is owned by the approved GitHub CD workflow.

## Unreleased

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

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
