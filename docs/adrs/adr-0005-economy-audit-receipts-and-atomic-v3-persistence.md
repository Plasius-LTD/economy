# ADR-0005: Fingerprint-only audit graphs and atomic V3 authority commits

## Status

- Accepted
- Date: 2026-07-26

## Context

The V2 economy boundary defines balanced immutable journal transactions,
source-lot movements, projection deltas, accepted-command workflow evidence,
actor/subject-scoped idempotency, writer fencing, an outbox, and a transaction
hash chain. Its published compatibility contracts also contain raw
`idempotencyKey` fields and cannot represent a terminal failure or no-op without
an economic transaction.

Production acquisition needs stronger evidence:

- the exact actor, subject, principal, delegated relationship/version,
  authorization decisions, route, build, region, and writer fence;
- provider callback verification without retaining raw provider identifiers,
  callbacks, signatures, or payment data;
- durable accepted, completed, failed, and no-op outcomes;
- an authority-wide commit sequence covering immutable facts, projections,
  idempotency, and outbox effects;
- conditional closure and controlled recovery after an integrity failure; and
- cross-record validation that proves every reference and hash edge.

Extending `AuditedEconomyCommandEnvelopeV1` from the legacy command envelope
would accidentally preserve its raw key. Adding audit fields to
`LedgerTransactionV1` or changing `canonicalTransactionPayload()` would alter
published canonical bytes and historical verification vectors. Adding required
methods to `EconomyPersistencePortV2` would break existing adapters.

## Decision

### Privacy and canonical commands

- Preserve every V1 and V2 public contract and the exact legacy transaction
  canonical format.
- Make `AuditedEconomyCommandEnvelopeV1` a standalone V3 contract.
- Replace raw idempotency keys with versioned, domain-separated
  `EconomyHmacFingerprintV1` values.
- Bind actor, subject, principal type, relationship/authorization version,
  sanitized capability/flag/assurance hashes, authentication/authorization
  times, route, build, region, writer fence, correlation, causation, and the
  sanitized semantic payload.
- Reject unknown audit-record fields at runtime so a JavaScript caller cannot
  smuggle a raw key or callback property past TypeScript.
- Keep replay as an external processing mode. The immutable command retains its
  original browser, provider, operator, or system source. A replay is valid
  only when the complete canonical command bytes match.

### Provider evidence

- HMAC-fingerprint raw provider event IDs, provider object IDs, callback bytes,
  and reconciliation material with distinct domain tags and explicit key
  versions.
- Persist only an opaque internal provider-event ID, safe event/signature
  classifiers, timestamps, fingerprints, and canonical evidence-manifest hash.
- Provide no field for a callback body, signature value, payment datum, or raw
  provider identifier.
- Keep encrypted operational provider handles site-owned. The package binds
  only an opaque handle ID, purpose, provider, AES-256-GCM cipher label, key
  version, ciphertext-content hash, encryption-context hash, and creation time.

### Receipts and boundaries

- Keep a client-safe accepted receipt.
- Define exclusive terminal outcomes:
  - `completed` binds one transaction and canonical transaction hash;
  - `failed` binds one safe failure code and no transaction;
  - `no-op` binds one safe no-op code and no transaction.
- A first-party command commits acceptance, result, economic effects,
  idempotency result, projections, outbox, commit manifest, and authority-head
  compare-and-swap in one serializable boundary.
- A provider command uses two serializable boundaries:
  1. verified evidence, command, accepted receipt, durable work item, manifest,
     and head advancement before acknowledgement;
  2. externally reconciled result, optional economic effects, projections,
     idempotency result, outbox, manifest, and head advancement.
- A V3 transaction puts the HMAC digest in the legacy canonical
  `idempotencyKey` slot. This retains byte compatibility without retaining the
  raw HTTP key.

### Authority graph and integrity

- Add a singleton `EconomyAuthorityHeadV1` and immutable, hash-linked
  `EconomyAuthorityCommitManifestV1`.
- Limit an authority batch to 80 operations and 1.5 MiB. Reserve two
  operations for the manifest create and head replacement, leaving at most 78
  unique canonically ordered record references.
- Support only `create` and `conditional-replace`; a replacement must bind its
  previous content hash and hashed optimistic-concurrency token. Upsert, Patch,
  Delete, and unconditional Replace have no representation.
- Advance the head by exactly one decimal sequence through
  `advanceEconomyAuthorityHead()`, rejecting stale hashes, state, time, writer
  region, or fence.
- Make writer-fence rotation an explicit commit.
- Define authority states `open`, `acquisition-closed`, `closed`, and
  `rebuilding`. New acquisition requires open. Already accepted provider
  results may finish while acquisition is closed. Rebuilding is the only state
  that accepts reconstruction. Reopening from rebuilding or
  acquisition-closed requires a fresh integrity-receipt ID/hash and
  dual-approval evidence.
- Add privacy-safe integrity receipts and canonical Merkle anchor manifests.
  Signing, keys, storage, and ciphertext remain consuming-infrastructure
  responsibilities.
- Add `assertEconomyAuditGraph()` to recompute and validate the command,
  evidence, handle, receipt, transaction, authority record, commit-chain, and
  expected-head edges.
- Add `EconomyPersistencePortV3` without modifying V1 or V2.

## Consequences

- New adapters cannot claim V3 support while retaining raw idempotency APIs.
- Exact replays, failures, and no-ops are auditable without inventing
  zero-value or failed journal transactions.
- Provider evidence supports reconciliation while minimizing correlation and
  disclosure risk; HMAC key rotation is explicit.
- One authority commit graph covers economic facts and mutable projections,
  making a deterministic rebuild and tamper check possible.
- An authority can fail closed and cannot be reopened by one unverified write.
- Existing consumers, historical records, and canonical transaction vectors
  remain valid.
- V3 types do not by themselves provide ACID storage, encryption, signing,
  managed identity, HSM, WORM, or administrator-proof guarantees. Those claims
  require evidence from the consuming adapter and infrastructure.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0002](./adr-0002-atomic-persistence-v2-and-explicit-portfolio-reads.md)
- [ADR-0003](./adr-0003-provider-neutral-paid-acquisition-lifecycles.md)
