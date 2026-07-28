# TDR: Fingerprint-only audit receipts and authority verification

## Cryptographic domains

The package implements no cryptography. An approved adapter supplies:

- HMAC-SHA-256 for values derived from raw idempotency keys, provider event
  keys, provider object keys, provider callback payloads, and reconciliation
  material;
- SHA-256 for already-sanitized canonical package records and manifests;
- AES-256-GCM for the external operational provider-handle envelope; and
- signing for an external hourly integrity anchor.

HMAC input construction must be domain-separated outside this package. The
persisted fingerprint includes `fingerprintVersion`, algorithm, exact domain
tag, key version, and digest. Rotation changes the key version; an adapter must
continue resolving retained fingerprints under their recorded version.

No adapter may persist:

- the raw HTTP `Idempotency-Key`;
- provider event/object identifiers;
- provider callback bodies or signature values;
- payment or customer data; or
- plaintext operational handles, ciphertext, nonces, tags, or Key Vault URIs
  inside an economy ledger record.

The command `payloadHash` is SHA-256 only because it covers a separately
validated, sanitized semantic command projection. Callback bytes use
`payloadFingerprint`.

## Exact replay

V3 idempotency scope is:

```text
HMAC fingerprint
  + command type
  + actor account
  + subject account
  + principal type
  + optional relationship and authorization version
```

A uniqueness collision is a replay only when
`canonicalAuditedEconomyCommandEnvelopePayload()` matches byte-for-byte.
`assertExactAuditedEconomyCommandReplay()` rejects a different route, build,
authorization decision, correlation/causation edge, evidence manifest, writer
fence, or payload as a security conflict.

Replay is a processing disposition, not a `commandSource`. The original source
is immutable and remains available for source/command/evidence validation.

## First-party atomic boundary

Browser, operator, and system commands with no external completion dependency
use one serializable boundary:

1. lock and validate the current writer fence and authority head;
2. query the fingerprint-only idempotency scope;
3. return an exact existing accepted/terminal result, or reject a conflict;
4. validate actor/subject, relationship version, authorization evidence,
   command/source compatibility, balances, lots, allocations, and limits;
5. append the audited command and accepted receipt;
6. append the terminal completed, failed, or no-op receipt;
7. for completed work, append the balanced hash-chained transaction, movements,
   projections, and outbox;
8. save the fingerprint-only idempotency result;
9. append one `first-party-command` authority manifest binding every record;
10. conditionally replace the authority head.

No economic document is created for failed or no-op results.

## Provider acceptance boundary

Shopify, ayeT, and BitLabs verify their signature over the required raw bytes
before opening the authoritative transaction. The transaction:

1. locks writer fence and authority head;
2. checks the fingerprint-only idempotency scope and economic event scope;
3. appends provider evidence containing HMAC fingerprints;
4. appends the canonical evidence manifest;
5. appends any binding to a site-owned encrypted operational handle;
6. appends the audited command, accepted workflow event, accepted receipt, and
   sequence-addressed durable work item;
7. saves the accepted idempotency result;
8. appends a `provider-acceptance` authority manifest; and
9. conditionally replaces the authority head.

Only after this boundary succeeds may ingress acknowledge the provider.
Signature failure never opens an authority transaction.

## Provider result boundary

A durable poller reconciles accepted work against the provider source of truth.
The result boundary:

1. locks writer fence, authority head, workflow, wallet, lot, allocation, and
   projection records needed by the complete plan;
2. revalidates evidence, source transition, amount, currency, variant/rate,
   existing economic effects, and the accepted command hash;
3. appends the completed, failed, or no-op result receipt;
4. for completed work, appends the transaction, movements, projections, and
   outbox;
5. saves the terminal idempotency result and workflow attempt;
6. appends a `provider-result` authority manifest; and
7. conditionally replaces the authority head.

An ambiguous storage timeout is resolved by point-reading deterministic
accepted/result receipt IDs and their canonical hashes before retrying.
A conflict is a replay only when every canonical scope and record hash matches.

## Authority commits

The head is a singleton compare-and-swap projection. The next manifest must:

- use `head.version + 1`;
- bind `head.lastCommitHash`;
- start in `head.state`;
- use the active writer region and fence unless its kind is
  `writer-fence-transition`;
- have a non-decreasing canonical timestamp; and
- stay within 80 operations and 1.5 MiB, with 1–78 unique record references in
  canonical kind/ID order after reserving the manifest and head writes.

Immutable facts use `create`. Projection/head-adjacent records use
`conditional-replace` and bind both previous content and a hash of the expected
adapter concurrency token. The contract has no write kind for Upsert, Patch,
Delete, or unconditional Replace.

`EconomyAuthorityStateV1` gates mutation:

- `open`: first-party commands, provider acceptance, and provider results;
- `acquisition-closed`: no new acquisition; accepted provider results may
  finish;
- `closed`: integrity evidence and controlled state transitions only;
- `rebuilding`: deterministic reconstruction and integrity evidence.

A closed authority must enter rebuilding before reopening. The reopening
manifest binds a successful fresh verification receipt ID and canonical hash,
plus a dual-approval evidence hash. Reopening acquisition after an
`acquisition-closed` pause requires the same verification and approval
evidence, but not a reconstruction cycle.
Before commit, `assertEconomyAuthorityRecoveryEvidence()` recomputes the
receipt hash and proves that the receipt is valid, belongs to the authority,
precedes the transition, and covers an earlier sequence. The consuming service
also applies the operational maximum receipt age.

## Cross-record verification

`assertEconomyAuditGraph()` consumes a bounded command graph and approved
SHA-256 callback. It proves:

- canonical command and receipt hashes;
- provider/source/command compatibility;
- provider-event causation and exact evidence-manifest coverage;
- encrypted-handle binding coverage;
- accepted/result receipt linkage and time order;
- completed transaction identity, canonical hash, and HMAC digest in the
  legacy `idempotencyKey` slot;
- the correct one-boundary first-party or two-boundary provider structure;
- every required create reference; and
- complete authority-head reconstruction.

`verifyJournalChainSegment()` independently checks the established economic
transaction chain. The two checks are complementary: the transaction chain
proves immutable economic ordering; the authority chain proves the complete
atomic record graph, including projections and non-economic workflow evidence.

## Anchors and verification receipts

An hourly `EconomyIntegrityAnchorManifestV1` contains a bounded commit sequence,
leaf count, Merkle root, authority-head hash, and production time. The
infrastructure signs and stores the canonical bytes. This package deliberately
does not model the private key or claim HSM/WORM/administrator-proof storage.

A daily verifier reconstructs manifests, the journal chain, and projections.
`EconomyIntegrityVerificationReceiptV1` binds expected/observed authority,
journal, and projection hashes plus a safe first mismatch. An invalid result is
evidence to conditionally close the authority, never permission to rewrite
facts. Reopening requires a later valid receipt and dual approval.
