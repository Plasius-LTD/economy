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

New read adapters should return the discriminated `WalletActivityEntryV1`.
`economic` rows may be `held`, `settled`, or read-model-derived `reversed`;
`workflow` rows alone may be `pending` or `failed`. The additive
`EconomicJournalTransactionV1` narrows immutable journal writes to `held` or
`settled`. A reversed display state is derived from a compensating transaction;
the original journal row is never rewritten.

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
signing to an approved infrastructure adapter. Metadata keys and posting IDs
are ordered with locale-independent UTF-16 code-unit comparison. Their
validated ASCII alphabet makes that ordering identical to PostgreSQL
`COLLATE "C"`; adapters must hash the exact UTF-8 bytes returned by
`canonicalTransactionPayload()`.

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

`VersionedSourceLotV1` and `SourceLotMovementV1` make allocation, boost,
reclaim, spend, hold, release, refund, chargeback, and reversal changes explicit.
`applySourceLotMovement()` proves the signed amount deltas, refund-state
transition, and exact optimistic-version increment. A V2 persistence adapter
must append the movement evidence and compare-and-swap the projection as one
operation.

## Early backers

`evaluateEarlyBacker()` calculates provisional `pre_utility_backer_v1` status
from net retained paid lots. It uses an inclusive public launch and exclusive
first-public-spend cutoff. It does not express or promise a reward entitlement.

Existing `evaluateEarlyBacker()` behavior is preserved for V1 consumers. The
approved additive `evaluateEarlyBackerBySettlementV2()` policy treats
`settledAt` as the sole inclusive-launch/exclusive-cutoff qualification event;
purchase and credit timestamps remain ordering/provenance facts. It ignores
settlements after `evaluatedAt`. The caller must derive both window timestamps
from the entire public cohort and exclude non-production/test lots: staff,
closed-beta, and test availability must never open or close the public window.

## Acquisition and future contracts

Purchase intents bind payer, receiving household/wallet, pack, catalog,
expected GBP price, grant, and an expiry. `assertOpenPurchaseIntent()` is for
checkout creation; a late provider webhook must instead be reconciled against
the immutable purchase facts and provider purchase time.

Reward conversion contracts retain signed provider-event IDs, server rate/FX
versions, exact payout values, and beneficiary/wallet IDs. ayeT and BitLabs lots
are structurally restricted to `same-user-only`; changing a provider-earned lot
to household-allocatable is rejected.

### Deterministic paid-acquisition lifecycle

`PurchaseIntentLifecycleV1` adds receipts and optimistic versions around the
unchanged `PurchaseIntentV1`. `reducePurchaseIntentTransitions()` canonicalizes
out-of-order checkout, payment, credit, expiry, cancellation, and dispute
evidence. Exact retries collapse, conflicting ID reuse fails, and one intent
can emit at most one stable intent-ID-scoped credit instruction. The transition
name is `checkout-bound`; the published compatible intent status remains
`checkout-created`.

`reserveRollingPurchaseCaps()` mirrors one exact GBP-minor-unit reservation
into payer and household aggregates. Both expected versions must match and both
returned versions must be committed in one serializable transaction.
Settlement keeps the amount in the rolling window; release and expiry free it.
Exact command replays are no-ops, including after finalization. GBP minor units
use canonical non-negative signed-64-bit strings through
`parseGbpMinorUnits()` and `serializeGbpMinorUnits()`.

`PaidLotLifecycleV1` separately preserves early-backer retained basis:

- a dispute hold leaves retained basis unchanged;
- a dispute win releases only the hold;
- refunds, lost disputes, direct chargebacks, and the one permitted reversal
  reduce retained basis exactly;
- partial outcomes retain their unreversed remainder;
- `createEarlyBackerRetentionFromPaidLot()` supplies a current
  `PaidLotRetentionV1` for recalculation.

Retained basis is not a spendable-balance claim. Before a compensation commits,
the authoritative service must atomically reclaim allocated-but-unused value,
reject value already spent or otherwise unavailable, append balanced journal
postings, update source-lot/lifecycle projections, save idempotency evidence,
and append the outbox. This package contains none of those provider or
persistence adapters.

These contracts do not enable checkout. The site must still enforce
`economy.tokens.shopify.enabled`, payer/household authorization, legal gates,
provider-signature verification, and server-derived purchase facts.

`BASELINE_MONTHLY_SUBSCRIPTION_PLAN` preserves the provider-neutral future £10
monthly/100 Token shape with `enabled: false`. Spend-request contracts likewise
exist for future use but this package does not enable their creation.

## Balance, lifetime, and portfolio reads

`WalletBalanceProjectionV1` stores exclusive `spendable`, `reserved`, and
`held` buckets. `createWalletBalanceSummary()` splits each wallet's spendable
amount into independently usable whole-Token `available` value and a
sub-Token `rewardProgress` remainder. `WalletBalanceDeltaV1` is an atomic add,
never an absolute balance replacement.

Lifetime counters are monotonic gross flows. Settled purchase/subscription
credits add to `bought`; rewarded-ad, offerwall, event, and competition credits
add to `earned`; source-wallet allocation/boost debits add to `allocated`;
returns add to `reclaimed`; spend debits add to `spent`; and refund,
chargeback, or reversal debits add to `reversed`. A reversal does not subtract
from the earlier bought/earned counter.

`EconomyQueryPortV1` keeps single-wallet reads and introduces an explicit
`WalletPortfolioReadScopeV1`. A host portfolio may contain both a household
treasury and a same-user-only personal reward wallet, and every component keeps
its wallet ID, role, beneficiary, summary, and lifetime snapshot. Portfolio
totals are display-only column sums: progress is deliberately not promoted
across wallets, even if the sum reaches 1,000 TokenSubunits, because source and
transfer restrictions may differ. Authorization must happen before the server
constructs a portfolio scope.

Activity reads use bounded opaque cursor pagination in stable descending
`(occurredAt, activityId)` order. Each row retains the component `walletId`
whose signed display amount it represents. Cursor contents and signatures are
adapter concerns; `assertWalletActivityPageForPortfolio()` proves that a result
never expands the authorized portfolio scope.

## Pseudonymous Admin reporting

`AdminEconomyReportingQueryPortV1` defines provider-neutral activity and trend
results for governed finance operations. It does not grant access or query a
database. A host must authenticate the caller, enforce the stored rollout flags
`economy.admin-history.enabled` and `mcp.admin-economy-history.enabled` as
applicable, re-check the finance capability, and use a least-privilege
reporting projection.

Activity rows are deliberately narrow:

- timestamp, normalized type/status/source, and exact signed TokenSubunits;
- a closed non-identifying label code that the presentation layer maps to
  localized text; and
- distinct opaque row and subject aliases produced by a versioned,
  audience- and purpose-separated HMAC adapter.

The label-code allowlist is `token-acquisition`, `token-spend`,
`token-reversal`, `token-hold`, `token-activity-failed`,
`token-system-adjustment`, and `token-activity-unclassified`. A label must also
be valid for its activity type.

Failure rows may use exact zero when a failed workflow has no related economic
transaction or attempted amount. Zero remains invalid for every economically
meaningful activity type.

The validator accepts only plain enumerable data properties and rejects
serialization hooks and undeclared properties, including raw account, wallet,
transaction, order, payment, provider-event, idempotency, and journal-integrity
identifiers. It also rejects provider-specific source names and free-form
labels. Result metadata fixes `rawIdentifiersIncluded` to `false`.

Activity pages are capped at 100 rows. Cursor values use a versioned `c1.`
base64url confidentiality-protected opaque format and cannot contain raw
identifiers. A resumed request carries both that value and its trusted,
server-decoded binding to the original window, sort, filters, pseudonym
audience, and version. Result metadata echoes the normalized filter. The
deterministic default reporting window is 30 days and the interactive maximum
is 365 days.

Hourly trends are limited to 31 days and daily trends may cover the maximum
window. The result ceiling is 3,720 points, covering all five activity types
through the maximum hourly window. Trend cohorts with fewer than five distinct
subjects contain only a suppression marker.

Reported trend points carry either a calculated 28-window same-time
conventional median/MAD indicator or an explicit unavailable result. Only
non-suppressed baseline cohorts may enter the calculation. Median and MAD
values use reduced exact rational TokenSubunits with denominators up to two,
so no floating point or rounding is introduced. Indicators are review alerts
only and never mutate the ledger. Routine contracts contain no
identity-resolution operation.

## Persistence ports

`EconomyPersistencePort` remains exported unchanged for existing consumers.
New authoritative services should implement `EconomyPersistencePortV2`, whose
unit of work deliberately omits V1's whole-projection overwrite. Runtime roles
should execute approved posting procedures but must not update or delete
journal rows directly. The V2 adapter is responsible for:

- serializable row locking and optimistic versions;
- exact owner-constrained wallet access and household/child-constrained
  allocation compare-and-swap;
- immutable accepted-command and workflow-event append;
- actor/subject/command-scoped idempotency plus unique transaction and
  provider-event constraints;
- active regional writer-fence validation and locked canonical chain-head
  extension;
- atomic wallet balance and monotonic lifetime deltas;
- atomic source-lot movement append, refund-state update, and version advance;
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
