# TDR: Paid-acquisition transition and cap compare-and-swap

## Intent event reduction

`reducePurchaseIntentTransitions()` first validates and collapses exact event-ID
retries, rejecting an ID reused with different facts. It then sorts by:

1. authoritative `occurredAt`;
2. transition precedence (checkout, payment, credit, dispute, terminal action);
3. locale-independent UTF-16 code-unit transition ID.

This makes delivery order irrelevant. Payment that authoritatively occurred
before expiry wins over a later expiry delivery. An unbound payment whose
authoritative occurrence is after expiry is rejected. The stable credit
instruction key is `<intentId>:credit`; a distinct second credit event is
recorded as ignored and emits no instruction. The intent ID itself is the
bounded stable credit idempotency key; the adapter namespaces it by command
type and principal scope.

The intent projection keeps the published statuses: `created`,
`checkout-created`, `paid-unreconciled`, `credited`, `expired`, `cancelled`, and
`disputed`. “Checkout bound” is the transition name; `checkout-created` remains
the compatible stored status.

## Rolling-cap mutation

Each reservation is copied verbatim into one payer aggregate and one household
aggregate. A service performs this logical serializable operation:

1. lock the payer and household cap rows in deterministic key order;
2. load and validate both versions and mirrored reservation facts;
3. calculate live pending plus settled rolling usage using exact `bigint` GBP
   minor units;
4. reject an over-order, over-payer, or over-household amount;
5. append the reservation evidence and increment both versions once;
6. commit both aggregates with the purchase intent/accepted command.

Settlement, release, and explicit expiry follow the same two-row
compare-and-swap. A reserved amount counts until its expiry even if an expiry
worker has not yet written the final state. A settled amount counts from its
authoritative payment time until it falls outside the inclusive rolling-window
start. Released and expired reservations do not count.

An exact reservation or final-transition replay succeeds before stale-version
validation. A conflicting replay, a half-present mirrored reservation, or a
stale new mutation aborts the whole operation.

## Paid-lot arithmetic

The lifecycle preserves:

```text
original = retained + reversed
reversed = refunded + chargeback + oneTimeReversal
0 <= held <= retained
```

| Event | Retained | Held | Reversed |
|---|---:|---:|---:|
| dispute hold | unchanged | `+ amount` | unchanged |
| dispute won | unchanged | `- amount` | unchanged |
| dispute lost | `- amount` | `- amount` | `+ amount` |
| refund | `- amount` | unchanged | `+ amount` |
| chargeback | `- amount` | unchanged | `+ amount` |
| one-time reversal | `- amount` | unchanged | `+ amount` |

Refund, direct chargeback, hold, and reversal amounts cannot consume held or
already reversed basis. Lost-dispute amounts cannot exceed the active hold.
Only one distinct `reversal` event is accepted for a lifecycle; exact replay of
that event remains a no-op.

The retained projection is not proof that value remains spendable. Before
posting a refund/chargeback/reversal, the persistence adapter must reclaim any
unused allocation, reject value already spent or otherwise unavailable, append
the balanced compensation, update the source-lot projection, refresh the paid
lot lifecycle and early-backer input, and append the outbox in one transaction.
