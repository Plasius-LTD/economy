# Recovery evidence contracts V1

This document is the API guide for `@plasius/economy` recovery evidence. All
contracts are exported from the package root and use `schemaVersion: "1"` plus
`recoveryVersion: "1"` where applicable.

## Construction order

```ts
const acceptance = createEconomyRecoveryAcceptanceEnvelope(
  acceptanceBody,
  sha256CanonicalUtf8,
);

const committed = createEconomyRecoveryCommittedResult(
  committedResultBody,
  sha256CanonicalUtf8,
);

assertEconomyRecoveryResultLink(
  acceptance,
  committed,
  sha256CanonicalUtf8,
);
```

The hash callback must return `sha256:` followed by 64 lowercase hexadecimal
characters. Builders validate before deriving an ID. Runtime adapters must
write the returned complete canonical payload, not serialize the original
input independently:

- `canonicalEconomyRecoveryAcceptanceEnvelopePayload()`
- `canonicalEconomyRecoveryCommittedResultPayload()`

Both functions require the same hash callback because they revalidate the
content address.

## Regional receipt

An evidence adapter first prepares the content address and canonical signing
payload, signs it, and creates the final record:

```ts
const prepared = prepareEconomyRegionalEvidenceReceiptSignature(
  regionalBody,
  signatureMetadata,
  sha256CanonicalUtf8,
);

const receipt = createEconomyRegionalEvidenceReceipt(
  regionalBody,
  {
    ...signatureMetadata,
    value: sign(prepared.canonicalPayload),
  },
  sha256CanonicalUtf8,
);

assertEconomyRegionalEvidenceReceiptSignature(
  receipt,
  sha256CanonicalUtf8,
  verifySignature,
);
```

The signing payload intentionally excludes `signature.value`.
`prepared.contentAddressedId` must equal the ID on the final record. A receipt
is durable only after the final signature has been verified and the exact
complete canonical bytes have been retained. Portable receipts use the
equivalent `prepareEconomyPortableCustomerReceiptSignature()` helper.

Use `assertEconomyRegionalEvidenceChain()` for one ordered journal segment and
`assertEconomyRegionalEvidenceEquality()` to prove the same recovery object is
present in every expected region.

## Portable customer receipt

`tokenAmount` is a canonical, strictly positive TokenSubunit string.
`direction` supplies the sign without permitting negative presentation values.
The receipt always describes a completed transaction. Failed and no-op command
facts remain in `EconomyRecoveryCommittedResultV1` and do not create a customer
value receipt.

`regionalEvidence` requires at least two unique references in ascending region
order using locale-independent Unicode code-unit comparison. Each reference
contains only region, regional receipt ID and its full canonical hash.

The optional `merkleInclusionProof` covers `authorityCommitHash`. Use
`assertEconomyPortableCustomerReceiptEvidence()` for the full graph:

```ts
assertEconomyPortableCustomerReceiptEvidence(
  portableReceipt,
  regionalCommittedResultReceipts,
  ["uk-south", "uk-west"],
  anchorOrUndefined,
  sha256CanonicalUtf8,
  verifySignature,
);
```

The function verifies the portable and regional signatures, exact expected
region coverage, byte-equal committed result, regional full-receipt hashes and
optional Merkle proof. It performs no network or key lookup itself.

## Error behavior

Validation throws `EconomyError` with a safe stable code:

- `INVALID_CONTRACT` for unsupported fields, versions, hashes, content IDs,
  links, signatures, region sets, chains and proofs;
- `INVALID_AMOUNT` for a non-positive portable Token amount; and
- `INVALID_TIME_WINDOW` for impossible preparation, commit, retention,
  signature or issue ordering.

Messages contain no record contents, provider data, ciphertext or identity.
Callers must not log rejected inputs.

## Compatibility

Recovery records use new canonical domains. They do not add fields to
`LedgerTransactionV1`, `EconomyCommandEnvelopeV1`,
`AuditedEconomyCommandEnvelopeV1`, authority manifests, or V1/V2/V3
persistence ports. Published transaction vectors and V1/V2/V3 adapter behavior
remain unchanged.
