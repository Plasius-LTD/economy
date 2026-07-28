import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertEconomyEvidenceSignature,
  assertEconomyMerkleInclusion,
  assertEconomyPortableCustomerReceipt,
  assertEconomyPortableCustomerReceiptEvidence,
  assertEconomyPortableCustomerReceiptSignature,
  assertEconomyRecoveryAcceptanceEnvelope,
  assertEconomyRecoveryCommittedResult,
  assertEconomyRecoveryResultLink,
  assertEconomyRegionalEvidenceChain,
  assertEconomyRegionalEvidenceEquality,
  assertEconomyRegionalEvidenceReceipt,
  assertEconomyRegionalEvidenceReceiptSignature,
  assertEconomySealedRecoveryPayload,
  canonicalEconomyPortableCustomerReceiptBodyPayload,
  canonicalEconomyPortableCustomerReceiptPayload,
  canonicalEconomyRecoveryAcceptanceBodyPayload,
  canonicalEconomyRecoveryCommittedResultBodyPayload,
  canonicalEconomyRegionalEvidenceReceiptPayload,
  canonicalTransactionPayload,
  createEconomyRecoveryCommittedResult,
  serializeTokenSubunits,
  type LedgerTransactionV1,
} from "../src/index.js";
import {
  RECOVERY_HASH_A,
  RECOVERY_HASH_B,
  RECOVERY_HASH_C,
  integrityAnchorAndProof,
  portableReceiptBody,
  recoveryAcceptance,
  recoveryAcceptanceBody,
  recoveryCommittedResult,
  recoveryCommittedResultBody,
  recoveryHash,
  regionalReceiptBody,
  regionalResultReceipts,
  sealedRecoveryPayload,
  signedPortableReceipt,
  signedRegionalReceipt,
  verifyFakeSignature,
} from "./recovery-fixtures.js";

describe("dual-region recovery contracts", () => {
  it("creates deterministic provider-neutral acceptance and result IDs", () => {
    const firstAcceptance = recoveryAcceptance();
    const reorderedAcceptance = recoveryAcceptance({
      sealedPayload: { ...firstAcceptance.sealedPayload },
    });
    expect(firstAcceptance.acceptanceEnvelopeId).toBe(
      reorderedAcceptance.acceptanceEnvelopeId,
    );
    expect(firstAcceptance.acceptanceEnvelopeId).toMatch(
      /^recovery-acceptance:sha256:[a-f0-9]{64}$/u,
    );
    expect(() =>
      assertEconomyRecoveryAcceptanceEnvelope(
        firstAcceptance,
        recoveryHash,
      ),
    ).not.toThrow();

    const firstResult = recoveryCommittedResult(firstAcceptance);
    const secondResult = createEconomyRecoveryCommittedResult(
      { ...recoveryCommittedResultBody(firstAcceptance) },
      recoveryHash,
    );
    expect(firstResult.committedResultId).toBe(
      secondResult.committedResultId,
    );
    expect(firstResult.committedResultId).toMatch(
      /^recovery-result:sha256:[a-f0-9]{64}$/u,
    );
    expect(() =>
      assertEconomyRecoveryCommittedResult(firstResult, recoveryHash),
    ).not.toThrow();
    expect(() =>
      assertEconomyRecoveryResultLink(
        firstAcceptance,
        firstResult,
        recoveryHash,
      ),
    ).not.toThrow();
  });

  it("rejects content-address tampering and mismatched acceptance links", () => {
    const acceptance = recoveryAcceptance();
    const result = recoveryCommittedResult(acceptance);
    expect(() =>
      assertEconomyRecoveryAcceptanceEnvelope(
        {
          ...acceptance,
          commandEnvelopeHash: RECOVERY_HASH_A,
        },
        recoveryHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyRecoveryCommittedResult(
        {
          ...result,
          authoritySequence: "11",
        },
        recoveryHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    const otherAcceptance = recoveryAcceptance({
      commandId: "command:purchase:2",
    });
    expect(() =>
      assertEconomyRecoveryResultLink(
        otherAcceptance,
        result,
        recoveryHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("permits terminal non-economic recovery facts without transaction fields", () => {
    const acceptance = recoveryAcceptance();
    for (const outcome of ["failed", "no-op"] as const) {
      const {
        transactionId: _transactionId,
        transactionCanonicalHash: _transactionCanonicalHash,
        ...nonEconomicBody
      } = recoveryCommittedResultBody(acceptance);
      const result = createEconomyRecoveryCommittedResult({
        ...nonEconomicBody,
        outcome,
      }, recoveryHash);
      expect(() =>
        assertEconomyRecoveryCommittedResult(result, recoveryHash),
      ).not.toThrow();
    }
    expect(() =>
      createEconomyRecoveryCommittedResult(
        {
          ...recoveryCommittedResultBody(acceptance),
          outcome: "failed",
        },
        recoveryHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("accepts only bounded encrypted reconstruction payloads", () => {
    expect(() =>
      assertEconomySealedRecoveryPayload(sealedRecoveryPayload()),
    ).not.toThrow();
    for (const invalid of [
      { ...sealedRecoveryPayload(), nonce: "not+base64" },
      { ...sealedRecoveryPayload(), authenticationTag: "short" },
      { ...sealedRecoveryPayload(), cipherSuite: "AES-128-GCM" },
      { ...sealedRecoveryPayload(), plaintextContentHash: "not-a-hash" },
      { ...sealedRecoveryPayload(), webhookBody: "{}" },
    ]) {
      expect(() =>
        assertEconomySealedRecoveryPayload(invalid as never),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("rejects raw provider, payment, identity, and key material fields", () => {
    const acceptance = recoveryAcceptance();
    const result = recoveryCommittedResult(acceptance);
    const regional = regionalResultReceipts(result)[0];
    const portable = signedPortableReceipt(
      portableReceiptBody(result, regionalResultReceipts(result)),
    );
    for (const invalid of [
      { ...acceptance, idempotencyKey: "raw-key" },
      { ...acceptance, providerOrderId: "raw-order" },
      { ...result, webhookBody: "{}" },
      { ...result, paymentCard: "not-allowed" },
      { ...regional, storageAccountUri: "not-allowed" },
      { ...portable, actorAccountId: "account:guardian" },
      { ...portable, email: "not-allowed@example.invalid" },
      { ...portable, exactBirthDate: "2010-01-01" },
      { ...portable, signatureKey: "not-allowed" },
    ]) {
      const assertion =
        "portableReceiptId" in invalid
          ? () =>
              assertEconomyPortableCustomerReceipt(
                invalid as never,
                recoveryHash,
              )
          : "evidenceReceiptId" in invalid
            ? () =>
                assertEconomyRegionalEvidenceReceipt(
                  invalid as never,
                  recoveryHash,
                )
            : "committedResultId" in invalid
              ? () =>
                  assertEconomyRecoveryCommittedResult(
                    invalid as never,
                    recoveryHash,
                  )
              : () =>
                  assertEconomyRecoveryAcceptanceEnvelope(
                    invalid as never,
                    recoveryHash,
                  );
      expect(assertion).toThrowError(
        expect.objectContaining({ code: "INVALID_CONTRACT" }),
      );
    }
  });

  it("verifies detached regional signatures and byte equality", () => {
    const result = recoveryCommittedResult(recoveryAcceptance());
    const receipts = regionalResultReceipts(result);
    for (const receipt of receipts) {
      expect(() =>
        assertEconomyRegionalEvidenceReceiptSignature(
          receipt,
          recoveryHash,
          verifyFakeSignature,
        ),
      ).not.toThrow();
    }
    expect(() =>
      assertEconomyRegionalEvidenceEquality(
        receipts,
        ["uk-south", "uk-west"],
        recoveryHash,
      ),
    ).not.toThrow();

    expect(() =>
      assertEconomyRegionalEvidenceReceiptSignature(
        {
          ...receipts[0],
          signature: {
            ...receipts[0].signature,
            value: "Z".repeat(86),
          },
        },
        recoveryHash,
        verifyFakeSignature,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    expect(() =>
      assertEconomyRegionalEvidenceEquality(
        [
          receipts[0],
          signedRegionalReceipt({
            ...regionalReceiptBody("uk-west", result),
            recoveryRecordContentHash: RECOVERY_HASH_B,
          }),
        ],
        ["uk-south", "uk-west"],
        recoveryHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("verifies complete and partial regional receipt hash chains", () => {
    const acceptance = recoveryAcceptance();
    const result = recoveryCommittedResult(acceptance);
    const first = signedRegionalReceipt({
      ...regionalReceiptBody("uk-south", result),
      sequence: "1",
    });
    const firstHash = recoveryHash(
      canonicalEconomyRegionalEvidenceReceiptPayload(first, recoveryHash),
    );
    const second = signedRegionalReceipt({
      ...regionalReceiptBody("uk-south", result),
      sequence: "2",
      previousReceiptHash: firstHash,
      storedAt: "2026-07-26T10:00:04.000Z",
    });
    expect(() =>
      assertEconomyRegionalEvidenceChain(
        [first, second],
        undefined,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyRegionalEvidenceChain(
        [second],
        firstHash,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyRegionalEvidenceChain(
        [second],
        RECOVERY_HASH_C,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("recomputes duplicate-last Merkle proofs against canonical anchors", () => {
    const { anchor, proof } = integrityAnchorAndProof();
    expect(() =>
      assertEconomyMerkleInclusion(proof, anchor, recoveryHash),
    ).not.toThrow();
    expect(() =>
      assertEconomyMerkleInclusion(
        {
          ...proof,
          siblings: [{ ...proof.siblings[0]!, hash: RECOVERY_HASH_B }],
        },
        anchor,
        recoveryHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    const oddLeaf = RECOVERY_HASH_A;
    const oddRoot = recoveryHash(
      JSON.stringify({
        domain: "economy.merkle-node.v1",
        leftHash: oddLeaf,
        rightHash: oddLeaf,
      }),
    );
    const oddAnchor = {
      ...anchor,
      firstCommitSequence: "10",
      lastCommitSequence: "12",
      leafCount: "3",
      merkleRootHash: recoveryHash(
        JSON.stringify({
          domain: "economy.merkle-node.v1",
          leftHash: RECOVERY_HASH_B,
          rightHash: oddRoot,
        }),
      ),
    };
    const oddProof = {
      ...proof,
      anchorManifestHash: recoveryHash(
        JSON.stringify({
          schemaVersion: oddAnchor.schemaVersion,
          anchorId: oddAnchor.anchorId,
          authorityId: oddAnchor.authorityId,
          firstCommitSequence: oddAnchor.firstCommitSequence,
          lastCommitSequence: oddAnchor.lastCommitSequence,
          leafCount: oddAnchor.leafCount,
          merkleRootHash: oddAnchor.merkleRootHash,
          authorityHeadHash: oddAnchor.authorityHeadHash,
          producedAt: oddAnchor.producedAt,
        }),
      ),
      leafHash: oddLeaf,
      leafIndex: "2",
      leafCount: "3",
      siblings: [
        { schemaVersion: "1", side: "right", hash: oddLeaf },
        {
          schemaVersion: "1",
          side: "left",
          hash: RECOVERY_HASH_B,
        },
      ],
    } as const;
    expect(() =>
      assertEconomyMerkleInclusion(oddProof, oddAnchor, recoveryHash),
    ).not.toThrow();
  });

  it("verifies a portable receipt across signatures, regions, and Merkle proof", () => {
    const acceptance = recoveryAcceptance();
    const result = recoveryCommittedResult(acceptance);
    const regionalReceipts = regionalResultReceipts(result);
    const { anchor, proof } = integrityAnchorAndProof(
      result.authorityCommitHash,
    );
    const portable = signedPortableReceipt(
      portableReceiptBody(result, regionalReceipts, proof),
    );
    expect(() =>
      assertEconomyPortableCustomerReceiptEvidence(
        portable,
        regionalReceipts,
        ["uk-south", "uk-west"],
        anchor,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).not.toThrow();
    expect(
      canonicalEconomyPortableCustomerReceiptPayload(
        portable,
        recoveryHash,
      ),
    ).not.toMatch(
      /provider|payment|email|birth|actorAccount|subjectAccount|storageAccount/iu,
    );

    expect(() =>
      assertEconomyPortableCustomerReceiptEvidence(
        { ...portable, tokenAmount: serializeTokenSubunits(49_000n) },
        regionalReceipts,
        ["uk-south", "uk-west"],
        anchor,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("supports signed pre-anchor receipts and rejects ambiguous anchor state", () => {
    const result = recoveryCommittedResult(recoveryAcceptance());
    const regionalReceipts = regionalResultReceipts(result);
    const portable = signedPortableReceipt(
      portableReceiptBody(result, regionalReceipts),
    );
    expect(() =>
      assertEconomyPortableCustomerReceiptEvidence(
        portable,
        regionalReceipts,
        ["uk-south", "uk-west"],
        undefined,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyPortableCustomerReceiptEvidence(
        portable,
        regionalReceipts,
        ["uk-south", "uk-west"],
        integrityAnchorAndProof().anchor,
        recoveryHash,
        verifyFakeSignature,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("canonicalizes fixed fields independently of insertion order", () => {
    const acceptanceBody = recoveryAcceptanceBody();
    const acceptance = recoveryAcceptance();
    const resultBody = recoveryCommittedResultBody(acceptance);
    const result = recoveryCommittedResult(acceptance);
    const regional = regionalResultReceipts(result);
    const portable = signedPortableReceipt(
      portableReceiptBody(result, regional),
    );

    expect(
      canonicalEconomyRecoveryAcceptanceBodyPayload({
        acceptedAt: acceptanceBody.acceptedAt,
        preparedAt: acceptanceBody.preparedAt,
        sealedPayload: acceptanceBody.sealedPayload,
        acceptedReceiptHash: acceptanceBody.acceptedReceiptHash,
        acceptedReceiptId: acceptanceBody.acceptedReceiptId,
        commandEnvelopeHash: acceptanceBody.commandEnvelopeHash,
        idempotencyFingerprint: acceptanceBody.idempotencyFingerprint,
        correlationId: acceptanceBody.correlationId,
        commandId: acceptanceBody.commandId,
        authorityId: acceptanceBody.authorityId,
        recordType: acceptanceBody.recordType,
        recoveryVersion: acceptanceBody.recoveryVersion,
        schemaVersion: acceptanceBody.schemaVersion,
      }),
    ).toBe(canonicalEconomyRecoveryAcceptanceBodyPayload(acceptanceBody));
    expect(
      canonicalEconomyRecoveryCommittedResultBodyPayload({
        ...resultBody,
      }),
    ).toBe(canonicalEconomyRecoveryCommittedResultBodyPayload(resultBody));
    expect(
      canonicalEconomyPortableCustomerReceiptBodyPayload({ ...portable }),
    ).toBe(
      canonicalEconomyPortableCustomerReceiptBodyPayload(portable),
    );
  });

  it("property-checks that semantic mutations cannot retain a valid content ID", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,31}$/u),
        (correlationId) => {
          const original = recoveryAcceptance();
          if (correlationId === original.correlationId) {
            return;
          }
          expect(() =>
            assertEconomyRecoveryAcceptanceEnvelope(
              { ...original, correlationId },
              recoveryHash,
            ),
          ).toThrowError(
            expect.objectContaining({ code: "INVALID_CONTRACT" }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("preserves the published legacy canonical transaction vector exactly", () => {
    const transaction: LedgerTransactionV1 = {
      schemaVersion: "1",
      transactionId: "txn:audit:legacy",
      activityType: "purchase",
      status: "settled",
      idempotencyKey: "legacy:key",
      effectiveAt: "2026-07-15T10:00:00.000Z",
      recordedAt: "2026-07-15T10:00:01.000Z",
      metadata: { z: "last", a: "first" },
      postings: [
        {
          schemaVersion: "1",
          postingId: "posting:z",
          transactionId: "txn:audit:legacy",
          accountId: "account:z",
          amount: serializeTokenSubunits(-1n),
        },
        {
          schemaVersion: "1",
          postingId: "posting:a",
          transactionId: "txn:audit:legacy",
          accountId: "account:a",
          amount: serializeTokenSubunits(1n),
        },
      ],
    };
    expect(canonicalTransactionPayload(transaction)).toBe(
      '{"schemaVersion":"1","transactionId":"txn:audit:legacy","activityType":"purchase","status":"settled","idempotencyKey":"legacy:key","effectiveAt":"2026-07-15T10:00:00.000Z","recordedAt":"2026-07-15T10:00:01.000Z","metadata":{"a":"first","z":"last"},"postings":[{"schemaVersion":"1","postingId":"posting:a","transactionId":"txn:audit:legacy","accountId":"account:a","amount":"1"},{"schemaVersion":"1","postingId":"posting:z","transactionId":"txn:audit:legacy","accountId":"account:z","amount":"-1"}]}',
    );
  });

  it("rejects unsupported signature shapes and unverified portable signatures", () => {
    const result = recoveryCommittedResult(recoveryAcceptance());
    const regional = regionalResultReceipts(result);
    const portable = signedPortableReceipt(
      portableReceiptBody(result, regional),
    );
    expect(() =>
      assertEconomyEvidenceSignature({
        ...portable.signature,
        algorithm: "unknown",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyPortableCustomerReceiptSignature(
        portable,
        recoveryHash,
        () => false,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});
