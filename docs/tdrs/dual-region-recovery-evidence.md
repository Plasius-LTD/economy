# TDR: Dual-region recovery evidence protocol

## Boundary

The recovery protocol surrounds, but does not replace, the authoritative ACID
commit. Its state transitions are:

```text
prepared
  -> acceptance written create-only in region A
  -> acceptance written create-only in region B
  -> authority commit
  -> committed result written create-only in region A
  -> committed result written create-only in region B
  -> successful customer acknowledgement
```

Provider webhooks use the first durable boundary as their acknowledgement
point, then reconcile asynchronously. The result sequence still completes
before any Token credit is presented as final. Browser commands that commit
value use the last boundary as their success point.

Neither evidence journal can perform the authority commit. Recovery processing
stays offline and write-closed until signatures, chains, content addresses,
idempotency, authority manifests, journal transactions and projections have
all been verified.

## Canonical and content-addressed records

Every record has two canonical formats:

1. an explicit body format with no ID;
2. the complete record containing the ID and, where applicable, signature.

The content ID is:

```text
<record-prefix>:sha256:<lowercase hexadecimal SHA-256 of canonical body UTF-8>
```

The fixed `recordType` and protocol version in each body provide hash-domain
separation. Canonicalizers build new objects in source-defined field order,
omit only documented optional fields, validate every nested shape, and reject
unknown keys. They never enumerate caller-supplied fields into canonical
output.

The same acceptance/result body, including its generated timestamp and sealed
bytes, is constructed once and sent to both regions. A region must not rebuild
or re-encrypt it independently, because a fresh AES-GCM nonce would change the
content address and defeat equality verification.

## Sealed reconstruction payload

`EconomySealedRecoveryPayloadV1` carries:

- protocol and cipher labels;
- an opaque recovery key version;
- a 96-bit nonce and 128-bit authentication tag encoded as unpadded base64url;
- bounded ciphertext;
- plaintext content hash; and
- encryption-context hash.

Encryption, key derivation, envelope-key wrapping and decryption are site
adapter responsibilities. The key version is an opaque resolver, not a Key
Vault URI. The authenticated encryption context must bind the recovery record
type, authority, command, environment and protocol version. The plaintext is a
canonical reconstruction bundle of only the authority records already approved
for durable financial retention. It must not contain raw callbacks,
idempotency keys, provider/payment/customer data, email, sessions, exact birth
data or secrets.

## Exact retry state machine

Create-only storage uses the content-addressed ID. An existing object is an
exact retry only when its complete canonical byte hash matches. Otherwise the
adapter closes acquisition and reports a security conflict.

The safe partial states are:

| Observed state | Economic meaning | Retry action |
|---|---|---|
| no acceptance | no accepted command | start normally |
| one regional acceptance | no value committed | finish the matching acceptance |
| two acceptances, no authority result | accepted only | point-read authority/idempotency; process or resume |
| authority result, one/missing regional result | committed, not acknowledged | finish exact result evidence; never recommit |
| two regional results | committed and recoverable | return the existing result |

Ambiguous timeouts are resolved through deterministic point reads. Retry loops
are bounded by the consuming service deadline; no package function retries.

## Regional receipt and chain verification

Each regional journal maintains its own monotonic decimal sequence and hash
chain. Sequence one has no prior hash; later records require the canonical
hash of the complete preceding receipt, including its signature. A partial
verification segment must be supplied with its trusted preceding receipt hash.

The detached signature covers:

```json
{
  "domain": "economy.regional-evidence-receipt.signature.v1",
  "evidenceReceiptId": "...",
  "body": {},
  "signature": {
    "schemaVersion": "1",
    "signatureVersion": "1",
    "algorithm": "...",
    "keyId": "...",
    "signedAt": "..."
  }
}
```

Signature bytes are excluded from the signed payload. Supported declarations
are Ed25519, ECDSA P-256/SHA-256 and RSA-PSS/SHA-256. The package does not
select algorithms, resolve keys, or implement cryptography; an approved
verifier callback owns those operations.

Regional equality requires at least two unique expected regions and proves
that authority, command, recovery-record kind, content-addressed ID and
complete record hash match exactly. Region-specific journal, sequence,
timestamp, retention and signature data are not expected to match.

## Merkle inclusion

`EconomyMerkleInclusionProofV1` uses
`duplicate-last-sha256-v1`. Leaves are authority commit hashes in authority
sequence order. At an odd tree width, the final hash is paired with itself.
Parent bytes are:

```json
{
  "domain": "economy.merkle-node.v1",
  "leftHash": "sha256:...",
  "rightHash": "sha256:..."
}
```

Verification checks leaf bounds, sibling orientation at every level,
duplicate-last behavior, exact proof depth, anchor ID/hash/leaf count and final
root equality. The portable receipt proof leaf must be its
`authorityCommitHash`, not a provider or payment record.

## Portable receipt verification

The portable receipt signature domain is
`economy.portable-customer-receipt.signature.v1` and follows the same detached
signature construction. Full verification:

1. validates and content-addresses the portable body;
2. verifies its detached signature;
3. validates at least two byte-equal regional committed-result receipts;
4. verifies every regional signature and full-receipt hash;
5. proves the regional result ID/hash matches the portable commitment; and
6. when present, recomputes authority-commit inclusion against the supplied
   canonical anchor manifest.

A pre-anchor receipt is valid without an inclusion proof and may later be
reissued with one. Because the proof changes the canonical body, the enriched
receipt receives a new content address. Supplying an anchor without a proof, or
a proof without its anchor, fails closed.

## Operational requirements outside the package

- write both evidence regions with independent managed identities and
  `If-None-Match: *`;
- sign with an identity that cannot mutate the live authority or retention
  policy;
- enforce locked immutable retention and externally monitor expected receipt
  and anchor cadence;
- close acquisition on evidence lag, signature/chain conflict, missing
  heartbeat or unknown authority outcome;
- never acknowledge through a one-region degraded shortcut;
- retain and test offline decryption/reconstruction tooling; and
- perform recovery separately from each region and compare all projections.

Those controls must be evidenced before describing the deployed service as
dual-region recoverable. Even then, claims remain scoped to acknowledged
commands, retained evidence, named regions and surviving recovery keys.
