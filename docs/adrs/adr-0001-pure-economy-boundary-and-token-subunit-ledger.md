# ADR-0001: Pure economy boundary and exact TokenSubunit ledger

## Status

- Accepted
- Date: 2026-07-15

## Context

Plasius needs a sitewide Token economy for paid and earned value, family
reservations, history, future spending, and early-backer provenance. Existing
PP, ESP, TIS, and DIS gameplay ledgers have different meanings and must not be
silently combined with a paid/earned site currency. Profile autosave is also
not an authoritative financial persistence mechanism.

## Decision

- `@plasius/economy` owns provider-neutral, versioned domain contracts and pure
  deterministic invariants only.
- One Token equals exactly 1,000 TokenSubunits. Runtime arithmetic uses `bigint`
  and JSON/persistence contracts use canonical base-10 strings.
- The £0.10 nominal reference is versioned catalog metadata with no cash
  redemption right; flat catalog validation must not be used as an exchange API.
- Transactions are immutable double-entry envelopes whose postings sum to zero.
- Source lots retain provenance and transfer policy. Family allocations are
  reservations, not gameplay ledger conversion.
- Provider, HTTP, authentication, PostgreSQL, queue, HSM, and Azure adapters are
  implemented by consuming services through explicit ports.
- Canonical serialization is provided for an approved SHA-256/HSM adapter; this
  package does not implement cryptography.

## Consequences

- The domain can be property-tested without infrastructure and reused by APIs,
  workers, projection rebuilds, and reconciliation tools.
- Consumers must perform persistence, locking, authorization, idempotency, and
  signature verification; importing this package alone does not make a command
  authoritative.
- Existing gameplay points remain separate and conversion remains a future,
  explicitly approved ledger operation.
- Guardian identity, household roles, and delegated principals remain owned by
  `@plasius/entity-manager` and `@plasius/auth`; this package only receives
  server-authorized identifiers and models Token reservations.

## Related decisions

- Site ADR-0045 selects PostgreSQL for primary relational OLTP.
- Site ADR-0066 keeps gameplay point ledgers separate.
