# `@plasius/economy`

Provider-neutral TypeScript contracts and deterministic invariants for the
Plasius sitewide Token economy.

This package models exact TokenSubunit amounts, immutable double-entry journal
transactions, source lots, family gameplay reservations, purpose-bound learning
module allowances, early-backer basis, future spend requests, acquisition
contracts, projections, and persistence ports. It intentionally contains no
HTTP, authentication, provider SDK, database driver, secret, or Azure
implementation.

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
  // Legacy V1 example. V3 writes the domain-separated HMAC digest here.
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

The package produces canonical bytes but deliberately leaves SHA-256 hashing
and any signing to an approved infrastructure adapter. Metadata keys and
posting IDs are ordered with locale-independent UTF-16 code-unit comparison. Their
validated ASCII alphabet makes that ordering identical to PostgreSQL
`COLLATE "C"`; adapters must hash the exact UTF-8 bytes returned by
`canonicalTransactionPayload()`.

## Audit receipts and integrity verification

`AuditedEconomyCommandEnvelopeV1` is a standalone, fingerprint-only V3
contract. It binds actor, subject, principal type, delegated
relationship/version, sanitized capability/flag/assurance evidence, route,
build, region, writer fence, correlation, causation, and payload. It never
extends the legacy raw-key envelope.

`EconomyHmacFingerprintV1` records an exact domain, key version, and
`hmac-sha256:` digest. Raw idempotency keys, provider event/object IDs,
callback bodies, and reconciliation material use distinct domains. Provider
commands require a canonical `EconomyProviderEvidenceManifestV1`; callback
signatures and payment data have no contract field.

Encrypted operational provider handles remain site-owned.
`EconomyEncryptedOperationalHandleBindingV1` binds only their purpose,
provider, AES-256-GCM label, key version, ciphertext-content hash, and
encryption-context hash. It contains no ciphertext, nonce, authentication tag,
plaintext, or Key Vault URI.

`EconomyAcceptedCommandReceiptV1` is safe to return after durable acceptance:
it exposes only receipt, command, and correlation IDs plus the command-envelope
hash and acceptance time. `EconomyCommandResultReceiptV1` is terminal and
exclusive:

- `completed` requires a transaction ID and its existing canonical hash and
  forbids outcome codes;
- `failed` requires one bounded safe failure code and forbids transaction
  fields;
- `no-op` requires one bounded safe no-op code and forbids transaction fields.

Every terminal shape retains a result hash. Replay is a processing mode, not a
command source: `assertExactAuditedEconomyCommandReplay()` requires identical
canonical bytes and preserves the original source. A collision with different
bytes is a security conflict.

The audit canonicalizers use explicit fixed field order and omit absent optional
fields. Runtime validators reject unknown fields rather than allowing raw
evidence to be persisted accidentally. `canonicalTransactionPayload()` is
unchanged. A V3 transaction stores the HMAC digest in its legacy canonical
`idempotencyKey` field; the HTTP key is never stored.

`EconomyAuthorityHeadV1` and hash-linked
`EconomyAuthorityCommitManifestV1` cover every immutable record, conditional
projection replacement, idempotency result, and outbox effect. Manifests
support only `create` and `conditional-replace`; batches are limited to 80
operations and 1.5 MiB. The manifest create and head replacement reserve
two operations, leaving at most 78 canonical record references.
`assertEconomyAuditGraph()` recomputes the complete command/evidence/receipt/
transaction/manifest graph and expected head.
`assertEconomyAuthorityRecoveryEvidence()` additionally recomputes the
successful prior verification receipt bound by any reopening manifest.

First-party commands use one atomic authority boundary. Provider workflows use
one boundary to durably accept verified evidence before acknowledgement and a
second boundary to record the externally reconciled completed, failed, or
no-op result.

`verifyJournalChainSegment()` accepts an approved canonical-payload hash
function, recomputes every transaction hash, checks previous-hash links and
duplicate transaction IDs, and proves the resulting head against an expected
head. `EconomyIntegrityVerificationReceiptV1` binds authority, journal, and
projection verification outcomes. `EconomyIntegrityAnchorManifestV1` defines
canonical hourly Merkle evidence while signing, keys, and storage remain
infrastructure responsibilities.

## Recoverable acknowledgements and portable receipts

The additive recovery protocol protects the acknowledgement boundary without
turning an evidence store into a second economy writer:

- `EconomyRecoveryAcceptanceEnvelopeV1` binds the provider-neutral audited
  command, accepted receipt, HMAC idempotency fingerprint, and an AES-256-GCM
  sealed reconstruction payload before command processing;
- `EconomyRecoveryCommittedResultV1` binds that exact acceptance to the
  terminal result receipt, authority commit/head, sequence, optional completed
  transaction, and sealed reconstruction payload after the authority commits;
- `EconomyRegionalEvidenceReceiptV1` is a signed, sequence-addressed,
  hash-chained retention assertion for the byte-identical acceptance or result
  stored in one evidence region; and
- `EconomyPortableCustomerReceiptV1` binds a positive TokenSubunit amount and
  direction to the completed transaction, result, authority sequence, at least
  two regional evidence receipts, and an optional authority-commit Merkle
  inclusion proof.

Every recovery record has a SHA-256 content-addressed ID derived from a
separate, explicitly ordered canonical body. Detached signatures cover that ID,
the complete body, and public algorithm/key-version/time metadata. The package
does not implement hashing, encryption, signing, key lookup, Blob access, or
identity. Callers supply approved hash and signature-verification functions;
`assertEconomyRegionalEvidenceChain()`,
`assertEconomyRegionalEvidenceEquality()`,
`assertEconomyMerkleInclusion()`, and
`assertEconomyPortableCustomerReceiptEvidence()` run without a cloud SDK or
authentication dependency.

Recovery validators reject unknown fields. Plaintext records have no field for
raw idempotency keys, provider/payment facts, callback bodies/signatures,
storage URIs, payer/household/account identity, email, session data, or exact
birth data. A portable receipt contains only opaque command/transaction
references, proof hashes, amount/direction, safe activity, terms version, and
`cashRedemptionAllowed: false`. The sealed payload's plaintext remains subject
to the same approved privacy-minimized authority schema; encryption is not
permission to retain unnecessary data.

A consuming service may acknowledge a provider callback after identical
acceptance evidence is durable in both approved regions, then process it
asynchronously. A successful browser value command is not customer-acknowledged
until the authoritative commit and both regional committed-result receipts
exist. Cross-service writes are not a distributed ACID transaction: exact
content IDs and idempotent create-only completion make orphan acceptances and
committed-but-not-yet-acknowledged results recoverable without duplicating
value.

These contracts enable a scoped recoverability claim only after the consuming
infrastructure proves dual durable writes, locked retention, independent keys,
monitoring, and tested reconstruction. They do not by themselves establish
zero RPO, WORM retention, HSM custody, administrator-proof storage, or
availability.

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

## Junior Coder Module Allowances

`ModuleAllowanceV1` is a Guardian-funded reservation for one linked child and
one purpose: purchasing independently sellable Junior Coder module
entitlements. It is deliberately separate from `GameplayAllocationV1`; callers
cannot spend gameplay value as a learning allowance or silently move learning
value into gameplay.

The purchase contracts implement the deterministic parts of:

```text
immutable quote -> allowance hold -> pending entitlement
  -> settle spend -> activate entitlement -> durable receipt
```

An immutable quote binds the exact module version, Token price, child,
Guardian acknowledgement, catalog version, and requirements-manifest version
plus canonical SHA-256 reference. This makes software-only declarations and
robotics bills of materials durable pre-purchase evidence even after a live
manifest changes.

`createModuleSpendHold()` moves whole Tokens from available to held value.
`settleModuleSpendHold()` requires a pending entitlement ID before it can move
held value to spent value. `releaseModuleSpendHold()` returns failed or expired
holds to the same Module Allowance. `createModulePurchaseReceipt()` accepts only
matching quote and settled-hold evidence. `reconcileModulePurchase()` returns
one forward-safe repair instruction and fails closed to manual review for a
settled debit without an entitlement or an active paid entitlement without a
settled debit.

These functions produce immutable next-state projections; they do not perform
authorization or persistence. The consuming service must evaluate
`learning.junior-coder.purchase.enabled`, enforce Guardian/child capabilities,
store actor/subject/operation-scoped idempotency evidence, and compare-and-swap
allowance and hold versions alongside the balanced journal, entitlement,
receipt, and outbox in a serializable transaction. A disabled feature may still
release and reconcile existing holds, but must reject new quotes and purchases.

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

`EconomyPersistencePortV3` is additive and retains every V2 economic primitive.
It removes V2's raw-key idempotency operations from its unit and replaces them
with `EconomyAuditedIdempotencyScopeV1` and
`EconomyAuditedIdempotencyResultV1`. It adds audited commands, evidence
manifests, encrypted-handle bindings, receipts, authority commits/head CAS,
integrity receipts, and anchor manifests. Its journal method accepts
`AuditedChainedEconomicJournalTransactionV1`, whose legacy idempotency slot is
type-narrowed to an HMAC digest. V1 and V2 remain exported unchanged.

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
workflow on configurable trusted self-hosted runners. Release LCOV and the
CycloneDX SBOM remain retained even when an external coverage or npm provenance
service is unavailable. Release tags and GitHub Releases use a current-repository
GitHub App token with explicit Contents and Workflows write permissions; npm
publication continues to use only the protected `NPM_TOKEN`. Both release jobs
install a checksum-pinned GitHub CLI under `RUNNER_TEMP`. A requested version
bump reuses the current version only when neither npm nor GitHub records it as a
completed release; use `bump=none` for deliberate recovery of prepared metadata.
Publication checks out the verified current release-branch HEAD so that recovery
always includes the reviewed workflow tooling.

## Security

Do not include raw idempotency keys, provider identifiers, provider callback
bodies or signatures, payment details, personal data, encrypted-handle
ciphertext, or secrets in contracts, metadata, tests, examples, or logs.
Report vulnerabilities privately according to [SECURITY.md](./SECURITY.md).
