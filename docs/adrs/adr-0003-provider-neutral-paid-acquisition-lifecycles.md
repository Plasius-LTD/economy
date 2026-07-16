# ADR-0003: Provider-neutral paid-acquisition lifecycles

## Status

- Accepted
- Date: 2026-07-16

## Context

The V1 acquisition contracts bind catalog, payer, household, wallet, price,
grant, and expiry, but deliberately do not define how asynchronous payment
evidence advances an intent. The original rolling-limit descriptor also lacks
reservation semantics, so two concurrent checkout requests could each observe
capacity before either commits. Source-lot movements prove low-level amount
deltas but do not separately preserve the paid amount retained for provisional
early-backer recalculation across partial refunds and dispute outcomes.

The package must define these invariants without embedding Shopify, HTTP,
database, queue, authentication, or Azure types. All published V1 APIs and
their behavior must remain available.

## Decision

- Keep `PurchaseIntentV1`, `PurchaseLimitPolicyV1`, `SourceLotV1`, and every
  other published V1 API unchanged. Add independent lifecycle projections and
  commands.
- Reduce purchase-intent events in canonical event-time, transition-precedence,
  and code-unit identifier order. Store transition receipts, retain an explicit
  `creditRecorded` invariant, and emit at most one stable credit instruction.
- Mirror each checkout reservation into payer and household rolling-cap
  aggregates. Reserve, settle, release, and expire both versions as one
  compare-and-swap operation. Exact retries are no-ops; conflicting identifier
  reuse and stale writers fail.
- Represent GBP minor units as canonical non-negative signed-64-bit strings and
  use `bigint` for all cap arithmetic.
- Track a paid lot as exact `original = retained + reversed` basis, with held
  value remaining retained. Refunds, lost disputes, chargebacks, and the single
  one-time reversal reduce retained basis; dispute wins only release holds.
- Create `PaidLotRetentionV1` inputs from the current lifecycle projection so a
  future reward calculation never relies on a stale settlement-time snapshot.
- Keep provider verification, persistence locking, balanced postings,
  allocation reclaim, feature flags, and authorization in consuming adapters.

## Consequences

- A provider adapter can replay duplicate or out-of-order evidence without
  creating a second credit or reversal.
- An authoritative persistence adapter must lock and commit both cap aggregates
  together; saving one returned state without the other is invalid.
- Allocated-but-unspent value must be reclaimed before the corresponding
  source-lot reversal commits. Spent or otherwise unavailable value cannot be
  treated as reclaimable merely because retained backer basis exists.
- Partial lost disputes can retain legitimate basis while recording the exact
  chargeback portion; a hold itself does not prematurely reduce early-backer
  basis.
- The package does not activate checkout. The consuming service continues to
  enforce `economy.tokens.shopify.enabled` and all legal/operational gates.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0002](./adr-0002-atomic-persistence-v2-and-explicit-portfolio-reads.md)
