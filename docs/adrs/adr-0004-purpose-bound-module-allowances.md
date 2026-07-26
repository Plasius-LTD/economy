# ADR-0004: Purpose-bound Module Allowances

## Status

- Accepted
- Date: 2026-07-21

## Context

Junior Coder modules are purchased for linked children using Tokens assigned by
a Guardian. Module purchases need immutable prices, pre-purchase requirements
evidence, failure-safe holds, entitlement coupling, and reconciliation. Existing
`GameplayAllocationV1` represents a different purpose and must not acquire
learning-commerce semantics.

## Decision

- Add `ModuleAllowanceV1` as a separate, purpose-bound aggregate without
  changing `GameplayAllocationV1`.
- Treat a learning module version as an opaque validated identifier so the
  economy library remains independent of learning content and infrastructure.
- Bind each quote to the child, allowance, module version, exact amount, catalog
  version, Guardian acknowledgement, and requirements-manifest version/hash.
- Represent held, settled, and released purchase states explicitly. Settlement
  requires a pending entitlement identifier; receipts require a settled hold.
- Provide deterministic reconciliation advice but leave all repairs and durable
  writes to a serializable consuming service.
- Gate command acceptance with `learning.junior-coder.purchase.enabled` and use
  capabilities for Guardian/child user-visible access.

## Consequences

- Module and gameplay budgets cannot be mixed accidentally.
- Purchase retries can be made idempotent without charging per assessment,
  mistake, hint, or agent request.
- Requirements evidence remains durable even if the live module manifest later
  changes.
- The consuming service must atomically persist allowance/hold versions, ledger
  evidence, entitlement state, idempotency results, receipt, and outbox records.
- Disabling the rollout flag blocks new commerce while allowing safe release and
  reconciliation of existing holds.

## Related decisions

- ADR-0001 defines the pure economy boundary and exact TokenSubunit arithmetic.
- ADR-0002 defines atomic V2 persistence and deterministic projection rules.

