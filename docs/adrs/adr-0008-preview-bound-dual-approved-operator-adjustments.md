# ADR-0008: Preview-bound dual-approved operator Token adjustments

## Status

- Accepted
- Date: 2026-08-01

## Context

Support operators need a controlled way to credit an account without treating
an administrative correction as a purchase or editing a balance projection.
A client-selected wallet, self-approved command, mutable proposal or generic
update/delete API would allow a compromised operator or confused deputy to
mint value without trustworthy provenance.

The package already supports `adjustment` source lots and journal activity,
fingerprint-only audited commands, balanced postings and atomic authority
manifests. It lacked an exact public contract binding the two-operator preview,
proposal, decision and execution graph.

## Decision

- Add a server-prepared preview binding the target account/component to the
  resolved wallet, target and offset ledger accounts, deterministic source lot,
  positive amount, bounded reason, ticket hash, policies and expiry.
- Represent the first operator's intent as an immutable pending proposal bound
  to the preview hash.
- Require a distinct stable account for approval or rejection and bind the
  decision to both the preview and proposal hashes.
- Bind execution to the approved decision, source lot, journal transaction and
  terminal result receipt.
- Represent correction only as a new dual-approved `reverse-credit` plan tied
  to the original source lot and transaction.
- Reject zero or negative adjustment magnitudes, expired approvals, preview or
  proposal mismatches, self-approval, unsupported fields and execution without
  approval using stable domain codes.
- Preserve `AdjustmentRequestV1` and all existing canonical transaction bytes.
- Keep owner authority, MFA, capabilities, feature flags, hashing, HTTP, MCP,
  persistence and infrastructure in consuming adapters.

## Consequences

- Admin and MCP adapters can share one deterministic contract without exposing
  a generic balance-edit or delete primitive.
- Source-lot provenance and compensating reversals remain reconstructable from
  immutable records.
- A consuming authority must still prove platform-owner status, operator
  step-up, distinct identities, account lifecycle eligibility, ACID persistence
  and production recovery gates before acknowledging value.

## Rollout

The consuming feature is controlled by
`economy.tokens.owner-adjustments.enabled`, composed with the existing Token
parent flag and finance-operation capabilities. Disabling the flag stops new
proposals and decisions while retaining read-only audit history.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0002](./adr-0002-atomic-persistence-v2-and-explicit-portfolio-reads.md)
- [ADR-0005](./adr-0005-economy-audit-receipts-and-atomic-v3-persistence.md)
- [ADR-0006](./adr-0006-dual-region-recovery-evidence-and-portable-receipts.md)
