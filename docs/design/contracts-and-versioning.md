# Economy contracts and versioning

## Compatibility

Public data contracts carry `schemaVersion: "1"`. Additive optional fields are
preferred. Renaming fields, changing amount units, weakening invariants, or
changing enum meaning requires a new version and migration guidance.

The `V2` suffix on `EconomyPersistencePortV2` and settlement-policy helpers is
an additive API-generation name; their nested wire records continue to carry
their declared `schemaVersion`. V1 types and behavior remain exported.

## Amount boundary

All amounts are TokenSubunits in signed 64-bit range. JSON examples use strings:

```json
{
  "available": "50000",
  "reserved": "10000",
  "held": "0",
  "rewardProgress": "275"
}
```

No API or adapter may parse authoritative amounts with JavaScript `number`.

The versioned nominal reference is 10 GBP minor units for 1,000 TokenSubunits.
It exists for catalog consistency and product copy only. The contract fixes
`cashRedemptionAllowed` to `false`; no adapter may present it as cash value.

## Acquisition boundary

- Catalog pack IDs and versions are immutable wire identifiers.
- Purchase intents are server-created bindings; browsers cannot supply an
  authoritative price, grant, wallet, payer, household, or completion state.
- Provider conversion records use signed unique event identifiers and
  server-owned FX/rate versions.
- ayeT and BitLabs source lots must remain `same-user-only`.
- The future monthly subscription descriptor is exported disabled; site flags
  and authorization remain authoritative.

## Public validation

Every public V1 wire contract with behavioral invariants has a corresponding
runtime assertion. HTTP/database/provider adapters must validate at ingress and
must not treat TypeScript types as runtime validation.

## Journal and workflow status boundary

- `EconomicJournalTransactionV1` accepts only `held` and `settled` economic
  effects.
- `pending` and `failed` are command-workflow activity states and never create
  postings or affect projections/lifetime totals.
- `reversed` is an economic read-model state derived from a compensating
  transaction. It is not an update to an original immutable row.

Legacy `LedgerTransactionV1` and `ActivityEntryV1` retain their V1 unions for
binary/source compatibility. New persistence and query adapters use the
narrower additive contracts.

## Portfolio read boundary

`WalletPortfolioReadScopeV1` is server-created after authorization and lists
every permitted component wallet explicitly. Component identities are retained
in all results. Aggregate columns are display totals, not a fungibility claim;
in particular, sub-Token progress is not promoted between a household treasury
and a same-user-only personal wallet.

### Personal-wallet initialization

`PersonalWalletInitializationStateV1` is a deterministic exact-zero baseline,
not editable profile data and not an economic transaction. Its command and
outbox canonicalizers accept exact allowed keys only. A caller-supplied SHA-256
adapter derives stable document identities in a fixed initialization domain;
the package does not implement cryptography or persistence.

The baseline has exactly one personal component, zero available/reserved/held
and progress, zero lifetime counters and no activity entries. The consuming
authority commits it with fingerprint-only command/receipt facts,
idempotency, a manifest and conditional head replacement. A partial stored set
fails integrity validation rather than being silently completed.

## Admin reporting boundary

`AdminEconomyReportingQueryPortV1` is an additive, read-only contract for
identifier-free global summaries plus bounded pseudonymous wallet, activity,
and trend reporting. Wallet and activity entries deliberately omit account,
wallet, transaction, order, payment, provider-event, idempotency, and journal
integrity identifiers. Runtime validators accept plain enumerable data
properties only, reject serialization hooks, and use exact property and safe
label-code allowlists.

The consuming service supplies opaque HMAC-derived aliases and records their
audience and version in result metadata. The package validates the alias shape
but does not generate aliases or know the secret. Interactive activity reads
default to 30 days, are capped at 365 days and 100 rows, and use stable sorts.
Resumed requests include a confidentiality-protected opaque cursor with no raw
identifiers and a trusted decoded binding to their normalized window, sort,
filters, pseudonym audience, and version. Result metadata echoes the normalized
filter. Failure rows alone may carry zero when no economic amount exists.

Global summaries carry exact aggregate balance/lifetime totals, wallet counts,
and the canonical positive authority sequence through which the rebuildable
projection is current. Wallet balance pages use a separate pseudonym audience,
closed component/status codes, signed opaque cursors, a 100-row maximum, and
stable available- or update-time-descending ordering.

Trend points below five distinct subjects are suppression records with no
counts or amounts. Reported points carry either a deterministic conventional
28-window median/MAD advisory over privacy-eligible baselines or an explicit
unavailable reason. Exact rational statistics preserve half-TokenSubunit
values. Complete hourly results are bounded to 3,720
points. This contract never authorizes or mutates a financial record.

## Trust boundary

Contracts are data and validation primitives. A caller must still derive
identity from a trusted session, enforce flags/capabilities/relationships,
verify provider evidence over raw bytes, acquire persistence locks, and commit
the journal/projection/outbox atomically.

Admin reporting callers must additionally enforce finance capabilities and
stored rollout flags, use a least-privilege projection identity, generate
audience-separated aliases, apply query deadlines/rate limits, send
private/no-store responses, and audit only safe query shapes. Identity
resolution is outside the routine reporting contract.

V2 persistence deliberately offers no unscoped wallet mutation lookup.
Allocation mutation/read lookups require the server-derived household and
child account together. Caller idempotency keys are namespaced by actor,
subject, and command type, and a regional worker must lock and validate its
active writer-fencing token before extending the journal.

## Audit-capable V3 boundary

`EconomyPersistencePortV3` is additive. It does not alter or emulate the V1
absolute-projection port and does not change any V2 method. Its unit of work
omits V2's raw-key command/idempotency methods and replaces them with
fingerprint-only equivalents. It adds the audited envelope, provider evidence
manifest, encrypted-handle binding, accepted/result receipts, authority
commit/head, integrity receipt, and anchor operations.

`AuditedEconomyCommandEnvelopeV1` is standalone and does not extend legacy
`EconomyCommandEnvelopeV1`, because the legacy contract contains a raw
`idempotencyKey`. V3 stores an `EconomyHmacFingerprintV1` tagged with
`economy.idempotency-key.v1`, a key version, and an
`hmac-sha256:<lowercase-hex>` digest. Runtime validators reject unknown fields,
including a caller that bypasses TypeScript and supplies `idempotencyKey`.

`EconomyAuditedCommandTypeV1` additively includes `initialize-wallet` while
`EconomyCommandType` remains the unchanged V1/V2 union. Initialization is a
browser/direct-account command with actor equal to subject and no relationship
context. Its terminal receipt is a no-op in the economic sense: it proves the
metadata/projection boundary completed without a journal transaction.

The envelope binds:

- actor and subject opaque account IDs;
- principal type and optional relationship/authorization-version pair;
- sanitized capability, feature-flag, and assurance decision hashes;
- authentication and authorization times;
- route, build, region, and writer-fencing identities;
- correlation and optional typed causation;
- a sanitized semantic command-payload hash; and
- for Shopify, ayeT, or BitLabs, a provider-evidence manifest hash and
  provider-event causation.

`commandSource` never has a replay value. `EconomyCommandProcessingModeV1`
models `initial` versus `replay` outside immutable command bytes, and
`assertExactAuditedEconomyCommandReplay()` accepts a replay only when every
canonical byte matches. A collision with different bytes is a security
conflict.

Provider evidence applies domain-separated HMAC fingerprints to raw event IDs,
object IDs, callback bodies, and reconciliation material. SHA-256 remains
appropriate for package-generated canonical records and sanitized manifests.
No contract field accepts a callback body, signature, payment datum, or raw
provider identifier. `EconomyEncryptedOperationalHandleBindingV1` binds only
the AES-256-GCM key version, ciphertext-content hash, encryption-context hash,
purpose, and site-owned opaque binding ID; the ciphertext and Key Vault handle
remain in the consuming service.

Completed terminal receipts require `transactionId` and
`transactionCanonicalHash`. Failed receipts require only `failureCode`; no-op
receipts require only `noOpCode`. The latter two create no economic
transaction. All result shapes bind the accepted envelope hash and exact
result hash. In a V3 journal transaction, the legacy canonical
`idempotencyKey` field contains the HMAC digest. The field order and published
transaction bytes are unchanged, but the raw HTTP key is never persisted.

## Authority commit graph

`EconomyAuthorityHeadV1` is the compare-and-swap singleton for one authority.
Every atomic boundary appends one `EconomyAuthorityCommitManifestV1` and
advances the head by exactly one decimal sequence. A manifest:

- hash-links to the preceding manifest;
- records the original writer region and fencing token;
- records authority state before and after;
- binds every created record by canonical content hash;
- binds each projection replacement by new content, previous content, and
  hashed optimistic-concurrency token; and
- stays within 80 operations and 1.5 MiB, reserving two operations for the
  manifest create and authority-head replacement and therefore allowing at most
  78 canonically ordered record references.

There is no Upsert, Patch, Delete, or unconditional Replace write kind.
`advanceEconomyAuthorityHead()` rejects a stale sequence, hash, state, time,
region, or fence. Writer rotation requires an explicit
`writer-fence-transition` commit.

The authority state machine is `open`, `acquisition-closed`, `closed`, and
`rebuilding`. New first-party commands and provider acceptance require `open`;
already accepted provider results may finish in `acquisition-closed`;
reconstruction requires `rebuilding`. A closed authority cannot move directly
to open. Reopening from rebuilding or acquisition-closed requires a fresh
verification-receipt ID and canonical hash plus a dual-approval evidence hash.
`assertEconomyAuthorityRecoveryEvidence()` proves that the bound receipt is
valid, belongs to the same authority, precedes the transition, covers an
earlier authority sequence, and has the declared canonical hash.

`assertEconomyAuditGraph()` recomputes the command, evidence, handle, receipt,
transaction, and authority-manifest hashes. It proves exact record references,
provider/source compatibility, causation, receipt linkage, the transaction's
HMAC idempotency value, and the reconstructed authority head.

First-party commands use one authority manifest containing acceptance and
terminal effects. Provider workflows use two:

1. verified evidence, command, accepted receipt, durable work item, and head
   advancement before provider acknowledgement;
2. reconciled result, optional journal effects, projections, idempotency
   result, outbox, and head advancement.

Failed and no-op provider results use the second boundary without journal or
projection effects.

## Audit canonical formats

Every `canonical*Payload()` function validates an exact allowed-key set, creates
a fresh object in its documented source-code field order, omits absent optional
fields, and serializes with `JSON.stringify`. It never walks arbitrary input
keys. HMAC fingerprints have nested order `schemaVersion`,
`fingerprintVersion`, `algorithm`, `domain`, `keyVersion`, `digest`.
Authorization evidence and causation likewise have explicit nested order.
Record and evidence references must arrive unique and in canonical Unicode
code-unit order; canonicalizers never silently repair malformed input.

Existing `canonicalTransactionPayload()` bytes and golden vectors remain
unchanged. New audit, authority, integrity-receipt, and anchor formats are
separate additive canonical domains.

## Recovery evidence V1

Recovery evidence is an additive protocol around V3 authority commits. It does
not modify a command, transaction, authority manifest, or persistence port.

`EconomyRecoveryAcceptanceEnvelopeV1` and
`EconomyRecoveryCommittedResultV1` use separate canonical body and complete
record formats. Their IDs are the record prefix plus SHA-256 of the exact
canonical body. The body includes a fixed `recordType`, so acceptance, result,
regional, and portable identifiers cannot collide across domains.

`EconomyRegionalEvidenceReceiptV1` and
`EconomyPortableCustomerReceiptV1` likewise content-address their unsigned
facts and add detached signatures. The signature payload includes the record
ID, exact canonical body, algorithm, key ID and signing time under an explicit
signature domain; it excludes the signature value.

All recovery validators use exact allowed-key sets. Plaintext schemas do not
accept raw idempotency/provider/payment data, actor/subject/payer identity,
email, sessions, exact birth data, storage locations, or key material.
Encrypted reconstruction bytes are bounded AES-256-GCM/base64url envelopes
whose plaintext remains restricted to approved, privacy-minimized authority
records.

The complete construction and verification API is documented in
[Recovery evidence contracts V1](./recovery-evidence-contracts-v1.md).
