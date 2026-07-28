# ADR-0006: Dual-region recovery evidence and portable customer receipts

## Status

- Accepted
- Date: 2026-07-26

## Context

ADR-0005 makes each live economy mutation atomic inside one authority
partition, hash-links all authority commits, and defines hourly Merkle anchors.
That protects transactional integrity but does not make a successful response
recoverable after unrecoverable loss of the live database region. An
asynchronous hourly anchor can detect historical alteration after it is
written; it cannot reconstruct every newly acknowledged command.

Running a second writable ledger would introduce split-brain and reconciliation
risk. Synchronous multi-region database replication has a standing cost or
throughput trade-off that is not yet justified at baseline volume. We need a
lower-cost evidence boundary that:

- preserves one live authority;
- makes acknowledged Token value reconstructable outside its database region;
- prevents exact retries from duplicating value;
- gives a customer a privacy-minimized proof they can retain; and
- remains explicit about the limits of storage, key, administrator, and
  platform guarantees.

The writes before and after the authority commit span independent services and
cannot be one distributed ACID transaction. Partial outcomes therefore have to
be first-class and safe.

## Decision

### One authority, two recovery journals

Cosmos (or another `EconomyPersistencePortV3` adapter) remains the only live
Token authority. Two independently configured regional evidence journals are
create-only recovery copies. They cannot calculate balances, settle a command,
or accept a new authority write.

Before processing, the service creates the same
`EconomyRecoveryAcceptanceEnvelopeV1` in both journals. The envelope is
provider-neutral and binds:

- the audited command and accepted-receipt hashes;
- the domain-separated idempotency HMAC fingerprint;
- opaque authority, command, and correlation identifiers;
- deterministic preparation/acceptance times; and
- an AES-256-GCM sealed, privacy-minimized reconstruction payload.

After the authority commits, the service creates the same
`EconomyRecoveryCommittedResultV1` in both journals. It binds the exact
acceptance, terminal result, authority commit/head and sequence, completed
transaction when present, and sealed reconstruction payload.

Provider ingress may acknowledge after dual durable acceptance because the
provider result is processed asynchronously. A successful first-party value
response is not acknowledged to the customer until both committed-result
records are durable. Failure to complete an evidence write closes or pauses
new value acquisition; it never weakens the acknowledgement rule.

### Deterministic partial-state recovery

Acceptance and result IDs are SHA-256 content addresses of explicit canonical
bodies. Each journal uses deterministic create-only object names. An exact
retry may finish a missing regional write. Reuse of an ID with different bytes
is a security conflict.

An orphan acceptance proves no economic value was committed and can be expired
under the approved retention policy. A committed result that was not yet
returned to the caller is authoritative: a retry point-reads deterministic
evidence and returns the existing outcome. The journals never race or dual
write the live authority.

### Regional and customer evidence

Each journal produces an `EconomyRegionalEvidenceReceiptV1` containing its
region, journal sequence, prior receipt hash, recovery record ID/hash, storage
time, retention horizon, and detached signature. Its content address covers the
unsigned retention fact; the signature covers the ID, exact body, algorithm,
key ID and signing time. This permits key rotation without changing the fact
being attested.

`EconomyPortableCustomerReceiptV1` contains only the positive TokenSubunit
amount, credit/debit direction, safe activity classifier, opaque transaction
and result references, authority sequence/commit, commitments to at least two
regional receipts, terms version, and a no-cash-redemption fact. It may include
a duplicate-last Merkle proof that the authority commit is present in an
hourly `EconomyIntegrityAnchorManifestV1`.

The package validates canonical bytes, content addresses, regional equality,
regional receipt chains, detached signatures through a caller-supplied
verifier, and Merkle inclusion through a caller-supplied SHA-256 function. It
contains no cloud, storage, identity, encryption, signing, or key-management
implementation.

### Privacy boundary

The plaintext recovery and customer schemas deliberately have no field for:

- raw idempotency keys or provider object/event identifiers;
- provider callbacks, callback signatures, reconciliation responses, payment
  instruments, prices, customer records, or receipts;
- actor, subject, payer, household, email, session, or exact-birth data;
- storage account/container URIs; or
- ciphertext keys, private signing material, or cloud credentials.

The sealed payload is for exact reconstruction of approved, already-minimized
authority records. Encryption does not permit collecting additional data.
Runtime validators reject all unknown fields before canonicalization.

## Consequences

- A successful acknowledgement can be reconstructed if either complete
  evidence journal and the applicable recovery/decryption keys survive.
- A customer can retain a signed proof of amount, direction, transaction,
  result, authority sequence, dual-region evidence and later Merkle inclusion.
- Four small evidence writes are added around a completed value command. Their
  latency, timeouts and failure modes must be measured before public launch.
- Cross-service state is intentionally not described as distributed ACID.
  Content addressing, create-only writes and existing idempotency make partial
  states convergent and non-duplicating.
- Existing V1, V2 and V3 contracts and `canonicalTransactionPayload()` bytes
  remain unchanged; the protocol is additive.
- Contracts alone do not prove zero RPO, locked WORM retention, HSM custody,
  administrator-proof operation, subscription survival, or uninterrupted
  availability. Those claims require deployed controls, external monitoring,
  restore/reconstruction evidence and an appropriately scoped statement.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0002](./adr-0002-atomic-persistence-v2-and-explicit-portfolio-reads.md)
- [ADR-0005](./adr-0005-economy-audit-receipts-and-atomic-v3-persistence.md)
