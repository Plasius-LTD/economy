# Paid-acquisition invariants design

## Scope

This design supplies deterministic pure-domain rules for Task #6. It contains
no checkout client, Shopify schema, webhook signature implementation, HTTP
route, PostgreSQL driver, queue client, session principal, or Azure resource.
Those adapters consume the contracts only after their own trust-boundary
checks.

The consuming site must keep checkout behind
`economy.tokens.shopify.enabled`. Package availability does not enable a
feature or authorize a payer.

## Purchase intent lifecycle

`PurchaseIntentLifecycleV1` wraps, rather than changes, `PurchaseIntentV1`.
Every accepted event receives an immutable receipt and increments the
optimistic version. An exact event retry returns the same lifecycle even when
the caller presents an old expected version. An event ID with different facts
fails.

```text
created -> checkout-created -> paid-unreconciled -> credited
   |              |                                  |
   +-> expired    +-> cancelled before payment       +-> disputed
                                                        |       |
                                                        won     lost
                                                        |       |
                                                     credited disputed
```

Payment evidence may bind checkout directly when the separate checkout event
is delayed. Credit requires authoritative payment. Once `creditRecorded` is
true, no later event emits another credit instruction.

## Payer and household caps

`RollingPurchaseCapStateV1` has one scope (`payer` or `household`) and a
compare-and-swap version. `reserveRollingPurchaseCaps()` accepts both scopes and
returns both new states or throws before returning either. Persistence must
preserve that atomic boundary.

Reservation IDs are the cross-scope identity. Immutable payer, household,
price, reservation time, and expiry facts must match in both copies. Terminal
states are `settled`, `released`, or `expired`; their transition evidence is
one-time and replayable. The baseline policy remains £50 per order and £100 per
payer/household over 30 days.

## Paid-lot retained basis

`PaidLotLifecycleV1` begins from a validated source lot carrying payer and
receiving-household provenance. It separates retained cohort basis from wallet
availability:

- holds remain in retained basis;
- won disputes release holds without changing basis;
- refunds, lost disputes, direct chargebacks, and the one-time reversal reduce
  basis immediately;
- partial outcomes preserve the exact unreversed remainder;
- `createEarlyBackerRetentionFromPaidLot()` creates the current evaluator input
  rather than copying a stale amount from settlement.

An adapter must separately prove that source-lot value can be reclaimed or
reversed. The lifecycle never converts spent value back into available value.

## Concurrency and replay acceptance

- Two new cap commands using the same expected versions cannot both commit.
- A payer and household reservation can never be half-created or half-finalized
  by a conforming adapter.
- Shuffled intent events reduce to the same projection and at most one credit
  instruction.
- Shuffled paid-lot events reduce in event-time/type/ID order.
- Exact duplicate event IDs are no-ops; conflicting duplicate facts fail.
- One-time reversal has one effective receipt even under retry.
- All arithmetic is exact signed-64-bit `bigint` serialized as canonical base-10
  strings.

Property tests exercise arbitrary retry multiplicity and refund partitions.
Concurrency tests apply stale commands to already advanced aggregates and
prove rejection before any returned projection can exceed a cap or reverse the
same basis twice.
