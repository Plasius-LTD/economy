# TDR: Atomic projections and read model V2

## Serializable mutation order

One V2 command worker uses this logical order inside a single serializable
database transaction:

1. append or verify the accepted command envelope and actor/subject/command-
   scoped idempotency result;
2. lock exact owner-scoped wallets, allocations, and eligible source lots;
3. lock and verify the active regional writer fence, then lock the canonical
   journal-chain head;
4. validate the economic transaction, compute its canonical hash against the
   locked head, and append it;
5. append/apply source-lot movements by expected version and refund state;
6. append or compare-and-swap allocation state;
7. atomically add one exclusive-bucket balance delta per affected wallet;
8. atomically add monotonic lifetime deltas;
9. compare-and-swap the canonical chain head;
10. save the idempotency result and append the transactional outbox event.

Any failed comparison aborts all ten effects. Adapters must enforce unique
command, idempotency, transaction, provider-event, movement, outbox, and
transaction/projection-application keys.

## Wallet balance semantics

Stored buckets are exclusive:

- `spendable`: settled, unreserved, unheld value in this wallet;
- `reserved`: unused value in a gameplay-allocation wallet;
- `held`: value unavailable while a hold/dispute is active.

For each individual wallet:

```text
rewardProgress = spendable mod 1,000
available      = spendable - rewardProgress
```

All three stored buckets must remain non-negative. Portfolio totals add
component display columns without normalizing `rewardProgress`; two restricted
wallets with 600 progress each report aggregate progress 1,200 and available 0,
not a fungible 1 Token.

## Lifetime semantics

Only settled journal transactions contribute. Per wallet, first sum all
wallet-linked postings in the transaction, then classify the signed net:

| Transaction | Required net | Lifetime bucket |
|---|---:|---|
| purchase, subscription | positive | bought |
| rewarded-ad, offerwall, event, competition | positive | earned |
| allocation, boost | negative source wallet | allocated |
| reclaim | positive receiving wallet | reclaimed |
| spend | negative | spent |
| refund, chargeback, reversal | negative | reversed |

Unmatched directions and adjustment/hold transactions do not change these six
product totals. Counters are positive and monotonic. Projection rebuild applies
the immutable journal in accepted order and must reproduce the same result.

## Activity and cursor semantics

- Economic activity references a journal transaction and may be held, settled,
  or read-derived reversed.
- Workflow activity references a command and may be pending or failed. Its
  amount is display context only.
- Every row identifies the component wallet whose signed amount it represents;
  portfolio page validation rejects wallets outside the authorized scope.
- Pages use descending `(occurredAt, activityId)` order with unique activity
  IDs and a bounded opaque cursor.
- Cursor encoding, integrity, expiry, and scope binding are adapter concerns.
  Decoding a cursor must never add a wallet to the authorized read scope.

## Early-backer settlement policy

The V2 policy qualifies a retained paid lot when:

```text
publicTokensLaunchAt <= settledAt < firstPublicSpendLiveAt
settledAt <= evaluatedAt
```

The cutoff condition is omitted until public spend exists. `purchasedAt <=
settledAt <= creditedAt` remains mandatory provenance ordering, but purchase and
credit are not qualification-window gates. The application supplies public
cohort timestamps and production lots; the evaluator deliberately cannot infer
staff, test, closed-beta, or public rollout state.
