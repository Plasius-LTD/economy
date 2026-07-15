# `@plasius/economy`

Provider-neutral TypeScript contracts and deterministic invariants for the
Plasius sitewide Token economy.

This package models exact TokenSubunit amounts, immutable double-entry journal
transactions, source lots, family gameplay reservations, early-backer basis,
future spend requests, acquisition contracts, projections, and persistence
ports. It intentionally contains no HTTP, authentication, provider SDK,
database driver, secret, or Azure implementation.

## Product boundary

- 1 public Token = 1,000 TokenSubunits.
- The nominal product reference is 1 Token = £0.10; it is not a redemption,
  transfer, investment, or cash-equivalence promise.
- Amounts use `bigint` internally and canonical base-10 strings in contracts.
- Tokens have no cash-redemption value and do not replace PP, ESP, TIS, or DIS.
- Gameplay conversion, spending, and subscriptions are policy decisions owned
  by consuming services and are disabled in the baseline product.

## Requirements

- Node.js 24 or later
- TypeScript with NodeNext-compatible module resolution

## Install

```bash
npm install @plasius/economy
```

## Exact amounts

```ts
import {
  parseTokenSubunits,
  serializeTokenSubunits,
  wholeTokensToSubunits,
} from "@plasius/economy";

const packGrant = wholeTokensToSubunits(50n);
const wireAmount = serializeTokenSubunits(packGrant); // "50000"
const restored = parseTokenSubunits(wireAmount); // 50000n
```

Non-canonical values such as `"01"`, decimals, exponent notation, and values
outside signed PostgreSQL `bigint` range are rejected. Runtime validators also
reject non-string JSON values rather than coercing numbers into wire amounts.

`ActivityEntryV1` contains both a stable `source` (`shopify`, `ayet`, `bitlabs`,
`subscription`, `event`, `competition`, or `adjustment`) and a bounded
display-oriented `sourceLabel`. Filters and reconciliation must use `source`;
localized UI must use `sourceLabel`.

## Baseline GBP catalog

`BASELINE_GBP_REFERENCE_RATE` is versioned product-copy metadata with
`cashRedemptionAllowed: false`. `assertFlatTokenCatalog()` proves that a catalog
uses the declared flat nominal ratio. The initial immutable catalog facts are:

| Pack ID | Price | Grant |
|---|---:|---:|
| `gbp_5_50_v1` | £5 | 50 Tokens |
| `gbp_10_100_v1` | £10 | 100 Tokens |
| `gbp_25_250_v1` | £25 | 250 Tokens |
| `gbp_50_500_v1` | £50 | 500 Tokens |

The default server ceilings are £50 per order and £100 per payer and household
over 30 days. A consuming service may apply a lower household control but must
not raise these defaults without a separately versioned policy decision.

## Balanced journal transactions

```ts
import {
  assertBalancedTransaction,
  canonicalTransactionPayload,
  serializeTokenSubunits,
  type LedgerTransactionV1,
} from "@plasius/economy";

const transaction: LedgerTransactionV1 = {
  schemaVersion: "1",
  transactionId: "txn:purchase:1",
  activityType: "purchase",
  status: "settled",
  idempotencyKey: "intent:1:paid",
  effectiveAt: "2026-07-15T10:00:00.000Z",
  recordedAt: "2026-07-15T10:00:01.000Z",
  metadata: { catalogVersion: "gbp-v1" },
  postings: [
    {
      schemaVersion: "1",
      postingId: "post:1",
      transactionId: "txn:purchase:1",
      accountId: "account:purchase-clearing",
      amount: serializeTokenSubunits(-50_000n),
    },
    {
      schemaVersion: "1",
      postingId: "post:2",
      transactionId: "txn:purchase:1",
      accountId: "account:household-treasury",
      lotId: "lot:shopify:1",
      amount: serializeTokenSubunits(50_000n),
    },
  ],
};

assertBalancedTransaction(transaction);
const payloadForApprovedHashAdapter = canonicalTransactionPayload(transaction);
```

The package produces canonical bytes but deliberately leaves SHA-256/HSM
signing to an approved infrastructure adapter.

## Source-lot policy and allocations

`selectSourceLots()` selects spendable slices in credited-time/lot-ID order and
enforces `household-allocatable`, `same-user-only`, and `non-transferable`
policies. `createGameplayAllocation()`, `boostGameplayAllocation()`, and
`reclaimGameplayAllocation()` require exact whole Tokens and return new
immutable states.

Selection is only a deterministic proposal. The persistence adapter must lock
the source rows, revalidate them, append the balanced transaction, update the
projection, save idempotency evidence, and append the outbox event within one
serializable database transaction.

## Early backers

`evaluateEarlyBacker()` calculates provisional `pre_utility_backer_v1` status
from net retained paid lots. It uses an inclusive public launch and exclusive
first-public-spend cutoff. It does not express or promise a reward entitlement.

## Acquisition and future contracts

Purchase intents bind payer, receiving household/wallet, pack, catalog,
expected GBP price, grant, and an expiry. `assertOpenPurchaseIntent()` is for
checkout creation; a late provider webhook must instead be reconciled against
the immutable purchase facts and provider purchase time.

Reward conversion contracts retain signed provider-event IDs, server rate/FX
versions, exact payout values, and beneficiary/wallet IDs. ayeT and BitLabs lots
are structurally restricted to `same-user-only`; changing a provider-earned lot
to household-allocatable is rejected.

`BASELINE_MONTHLY_SUBSCRIPTION_PLAN` preserves the provider-neutral future £10
monthly/100 Token shape with `enabled: false`. Spend-request contracts likewise
exist for future use but this package does not enable their creation.

## Persistence ports

Implement `EconomyPersistencePort` in the authoritative service. Runtime roles
should execute approved posting procedures but must not update or delete journal
rows directly. The adapter is responsible for:

- serializable row locking and optimistic versions;
- unique transaction, idempotency, and provider-event constraints;
- same-transaction projection and source-lot updates;
- transactional outbox append;
- managed identity and least-privilege database access; and
- immutable audit/integrity evidence outside this package.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:coverage
npm run pack:check
```

Coverage must remain at least 80%, and every changed source file must appear in
LCOV. Generated property tests cover exact arithmetic, double-entry balance,
projection rebuilds, idempotency, reversals, lot isolation, and allocation
non-negativity. npm publication is performed only by the approved GitHub CD
workflow.

## Security

Do not include raw payment details, personal data, provider callback bodies, or
secrets in contracts, metadata, tests, examples, or logs. Report vulnerabilities
privately according to [SECURITY.md](./SECURITY.md).
