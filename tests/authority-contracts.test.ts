import { describe, expect, it } from "vitest";
import {
  ECONOMY_AUTHORITY_COMMIT_OVERHEAD_OPERATIONS,
  ECONOMY_AUTHORITY_MAX_BATCH_BYTES,
  ECONOMY_AUTHORITY_MAX_BATCH_OPERATIONS,
  ECONOMY_AUTHORITY_MAX_RECORD_REFERENCES,
  advanceEconomyAuthorityHead,
  assertEconomyAuthorityRecoveryEvidence,
  assertEconomyAuthorityBatchLimits,
  assertEconomyAuthorityCommitManifest,
  assertEconomyAuthorityHead,
  assertEconomyAuthorityRecordReference,
  assertEconomyIntegrityAnchorManifest,
  assertEconomyIntegrityVerificationReceipt,
  canonicalEconomyAuthorityCommitManifestPayload,
  canonicalEconomyAuthorityHeadPayload,
  canonicalEconomyIntegrityAnchorManifestPayload,
  canonicalEconomyIntegrityVerificationReceiptPayload,
  sortEconomyAuthorityRecordReferences,
  type EconomyAuthorityCommitManifestV1,
  type EconomyAuthorityRecordReferenceV1,
  type EconomyIntegrityVerificationReceiptV1,
} from "../src/index.js";
import {
  HASH_A,
  HASH_B,
  HASH_C,
  authorityHead,
  authorityManifest,
  createdReference,
  hash,
} from "./audit-fixtures.js";

describe("authority commit and integrity contracts", () => {
  it("reserves manifest and head writes inside the strict batch ceilings", () => {
    expect(ECONOMY_AUTHORITY_MAX_BATCH_OPERATIONS).toBe(80);
    expect(ECONOMY_AUTHORITY_COMMIT_OVERHEAD_OPERATIONS).toBe(2);
    expect(ECONOMY_AUTHORITY_MAX_RECORD_REFERENCES).toBe(78);
    expect(ECONOMY_AUTHORITY_MAX_BATCH_BYTES).toBe(1_572_864);
    expect(() =>
      assertEconomyAuthorityBatchLimits(80, 1_572_864),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityBatchLimits(81, 1_572_864),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuthorityBatchLimits(80, 1_572_865),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("creates the unique genesis commit before command commits", () => {
    const genesisHead = authorityHead({
      version: "0",
      state: "closed",
      lastCommitId: undefined,
      lastCommitHash: undefined,
    } as never);
    const genesis = authorityManifest(
      [createdReference("work-item", "authority:genesis", HASH_A)],
      {
        commitId: "authority-commit:genesis",
        sequence: "1",
        commitKind: "genesis",
        previousCommitHash: undefined,
        commandId: undefined,
        correlationId: undefined,
        authorityStateBefore: "closed",
        authorityStateAfter: "closed",
      } as never,
    );
    const genesisHash = hash(
      canonicalEconomyAuthorityCommitManifestPayload(genesis),
    );
    expect(
      advanceEconomyAuthorityHead(genesisHead, genesis, genesisHash),
    ).toMatchObject({
      version: "1",
      state: "closed",
      lastCommitId: "authority-commit:genesis",
    });
  });

  it("requires create-only or fully conditional record writes", () => {
    const created = createdReference(
      "command-envelope",
      "command:1",
      HASH_A,
    );
    const replaced: EconomyAuthorityRecordReferenceV1 = {
      schemaVersion: "1",
      recordKind: "balance-projection",
      recordId: "balance:wallet:1",
      writeKind: "conditional-replace",
      contentHash: HASH_A,
      previousContentHash: HASH_B,
      expectedConcurrencyTokenHash: HASH_C,
    };
    expect(() =>
      assertEconomyAuthorityRecordReference(created),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityRecordReference(replaced),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityRecordReference({
        ...replaced,
        expectedConcurrencyTokenHash: undefined,
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuthorityRecordReference({
        ...created,
        previousContentHash: HASH_B,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuthorityRecordReference({
        ...created,
        writeKind: "delete",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    expect(() =>
      assertEconomyAuthorityRecordReference(
        createdReference("wallet", "wallet:personal:1", HASH_A),
      ),
    ).not.toThrow();
  });

  it("sorts references canonically and rejects duplicate or unsorted input", () => {
    const refs = [
      createdReference("work-item", "work:z", HASH_A),
      createdReference("accepted-receipt", "receipt:a", HASH_B),
      createdReference("work-item", "work:a", HASH_C),
    ];
    const sorted = sortEconomyAuthorityRecordReferences(refs);
    expect(sorted.map((reference) => reference.recordId)).toEqual([
      "receipt:a",
      "work:a",
      "work:z",
    ]);
    expect(() => authorityManifest(refs)).not.toThrow();
    expect(() =>
      assertEconomyAuthorityCommitManifest({
        ...authorityManifest(refs),
        recordReferences: refs,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuthorityCommitManifest({
        ...authorityManifest(refs),
        recordReferences: [sorted[0]!, sorted[0]!],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("advances exactly one hash-linked singleton head", () => {
    const head = authorityHead();
    const manifest = authorityManifest([
      createdReference("command-envelope", "command:purchase:1", HASH_A),
    ]);
    const manifestHash = hash(
      canonicalEconomyAuthorityCommitManifestPayload(manifest),
    );
    const next = advanceEconomyAuthorityHead(
      head,
      manifest,
      manifestHash,
    );
    expect(next).toEqual({
      schemaVersion: "1",
      authorityId: head.authorityId,
      version: "2",
      state: "open",
      lastCommitId: manifest.commitId,
      lastCommitHash: manifestHash,
      writerRegion: head.writerRegion,
      writerFencingToken: head.writerFencingToken,
      updatedAt: manifest.committedAt,
    });
    expect(() => assertEconomyAuthorityHead(next)).not.toThrow();
    expect(() =>
      advanceEconomyAuthorityHead(
        head,
        { ...manifest, sequence: "3", previousCommitHash: HASH_B },
        manifestHash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("fails closed on stale state, fence, time, and manifest hashes", () => {
    const head = authorityHead();
    const manifest = authorityManifest([
      createdReference("command-envelope", "command:purchase:1", HASH_A),
    ]);
    for (const [changedManifest, manifestHash] of [
      [{ ...manifest, authorityStateBefore: "closed" as const }, HASH_A],
      [{ ...manifest, writerFencingToken: "fence:stale" }, HASH_A],
      [
        { ...manifest, committedAt: "2026-07-26T09:59:58.000Z" },
        HASH_A,
      ],
      [{ ...manifest }, "not-a-hash"],
    ] as const) {
      expect(() =>
        advanceEconomyAuthorityHead(head, changedManifest, manifestHash),
      ).toThrowError(expect.objectContaining({ code: expect.any(String) }));
    }
  });

  it("permits writer rotation only through an explicit fence transition", () => {
    const head = authorityHead({
      version: "1",
      lastCommitId: "authority-commit:1",
      lastCommitHash: HASH_A,
    });
    const transition = authorityManifest(
      [createdReference("work-item", "writer-fence:42", HASH_B)],
      {
        commitId: "authority-commit:2",
        sequence: "2",
        previousCommitHash: HASH_A,
        commitKind: "writer-fence-transition",
        commandId: undefined,
        correlationId: undefined,
        stateReasonCode: "REGIONAL_FAILOVER",
        writerRegion: "uk-west",
        writerFencingToken: "fence:production:42",
      } as never,
    );
    const transitionHash = hash(
      canonicalEconomyAuthorityCommitManifestPayload(transition),
    );
    expect(
      advanceEconomyAuthorityHead(head, transition, transitionHash),
    ).toMatchObject({
      writerRegion: "uk-west",
      writerFencingToken: "fence:production:42",
    });
  });

  it("requires rebuilding, fresh verification, and dual approval to reopen", () => {
    const reopening: EconomyAuthorityCommitManifestV1 = authorityManifest(
      [createdReference("integrity-receipt", "verification:fresh", HASH_A)],
      {
        commitId: "authority-commit:9",
        sequence: "9",
        previousCommitHash: HASH_B,
        commitKind: "state-transition",
        commandId: undefined,
        correlationId: undefined,
        authorityStateBefore: "rebuilding",
        authorityStateAfter: "open",
        stateReasonCode: "VERIFIED_RECOVERY",
        recoveryVerificationReceiptId: "verification:fresh",
        recoveryVerificationReceiptHash: HASH_A,
        dualApprovalEvidenceHash: HASH_C,
      } as never,
    );
    expect(() =>
      assertEconomyAuthorityCommitManifest(reopening),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityCommitManifest({
        ...reopening,
        authorityStateBefore: "acquisition-closed",
      }),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityCommitManifest({
        ...reopening,
        dualApprovalEvidenceHash: undefined,
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuthorityCommitManifest({
        ...reopening,
        authorityStateBefore: "closed",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

    const recoveryReceipt: EconomyIntegrityVerificationReceiptV1 = {
      schemaVersion: "1",
      verificationId: "verification:fresh",
      authorityId: reopening.authorityId,
      status: "valid",
      checkedThroughSequence: "8",
      checkedCommits: "8",
      checkedRecords: "60",
      expectedAuthorityHeadHash: HASH_A,
      observedAuthorityHeadHash: HASH_A,
      verifiedAt: "2026-07-26T09:59:59.000Z",
    };
    const verifiedReopening = {
      ...reopening,
      recoveryVerificationReceiptHash: hash(
        canonicalEconomyIntegrityVerificationReceiptPayload(
          recoveryReceipt,
        ),
      ),
    };
    expect(() =>
      assertEconomyAuthorityRecoveryEvidence(
        verifiedReopening,
        recoveryReceipt,
        hash,
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityRecoveryEvidence(
        {
          ...verifiedReopening,
          recoveryVerificationReceiptHash: HASH_B,
        },
        recoveryReceipt,
        hash,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("enforces acquisition and reconstruction write-gate states", () => {
    const commandRef = createdReference(
      "command-envelope",
      "command:purchase:1",
      HASH_A,
    );
    expect(() =>
      assertEconomyAuthorityCommitManifest(
        authorityManifest([commandRef], {
          authorityStateBefore: "acquisition-closed",
          authorityStateAfter: "acquisition-closed",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuthorityCommitManifest(
        authorityManifest([commandRef], {
          sequence: "2",
          previousCommitHash: HASH_B,
          commitKind: "provider-result",
          authorityStateBefore: "acquisition-closed",
          authorityStateAfter: "acquisition-closed",
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorityCommitManifest(
        authorityManifest([commandRef], {
          sequence: "2",
          previousCommitHash: HASH_B,
          commitKind: "reconstruction",
          commandId: undefined,
          correlationId: undefined,
          authorityStateBefore: "rebuilding",
          authorityStateAfter: "rebuilding",
        } as never),
      ),
    ).not.toThrow();
  });

  it("validates complete and mismatch integrity receipts", () => {
    const valid: EconomyIntegrityVerificationReceiptV1 = {
      schemaVersion: "1",
      verificationId: "verification:daily:1",
      authorityId: "economy:authority:global",
      status: "valid",
      checkedThroughSequence: "41",
      checkedCommits: "41",
      checkedRecords: "360",
      expectedAuthorityHeadHash: HASH_A,
      observedAuthorityHeadHash: HASH_A,
      expectedJournalHeadHash: HASH_B,
      observedJournalHeadHash: HASH_B,
      expectedProjectionSetHash: HASH_C,
      observedProjectionSetHash: HASH_C,
      anchorManifestHash: HASH_A,
      verifiedAt: "2026-07-26T11:00:00.000Z",
    };
    const invalid: EconomyIntegrityVerificationReceiptV1 = {
      ...valid,
      verificationId: "verification:daily:2",
      status: "invalid",
      observedProjectionSetHash: HASH_B,
      failureCode: "projection-mismatch",
      firstInvalidRecordId: "balance:wallet:1",
    };
    expect(() =>
      assertEconomyIntegrityVerificationReceipt(valid),
    ).not.toThrow();
    expect(() =>
      assertEconomyIntegrityVerificationReceipt(invalid),
    ).not.toThrow();
    expect(() =>
      assertEconomyIntegrityVerificationReceipt({
        ...invalid,
        failureCode: undefined,
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyIntegrityVerificationReceipt({
        ...valid,
        observedAuthorityHeadHash: HASH_B,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("validates bounded Merkle anchors without claiming signature or WORM fields", () => {
    const anchor = {
      schemaVersion: "1",
      anchorId: "anchor:hourly:1",
      authorityId: "economy:authority:global",
      firstCommitSequence: "1",
      lastCommitSequence: "41",
      leafCount: "41",
      merkleRootHash: HASH_A,
      authorityHeadHash: HASH_B,
      producedAt: "2026-07-26T11:00:00.000Z",
    } as const;
    expect(() =>
      assertEconomyIntegrityAnchorManifest(anchor),
    ).not.toThrow();
    const canonical =
      canonicalEconomyIntegrityAnchorManifestPayload(anchor);
    expect(canonical).not.toContain("signature");
    expect(canonical).not.toContain("storage");
    expect(() =>
      assertEconomyIntegrityAnchorManifest({
        ...anchor,
        firstCommitSequence: "42",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("canonicalizes heads, manifests, and integrity records deterministically", () => {
    const head = authorityHead();
    const manifest = authorityManifest([
      createdReference("command-envelope", "command:purchase:1", HASH_A),
    ]);
    const valid: EconomyIntegrityVerificationReceiptV1 = {
      schemaVersion: "1",
      verificationId: "verification:hourly:1",
      authorityId: head.authorityId,
      status: "valid",
      checkedThroughSequence: "1",
      checkedCommits: "1",
      checkedRecords: "1",
      expectedAuthorityHeadHash: HASH_A,
      observedAuthorityHeadHash: HASH_A,
      verifiedAt: "2026-07-26T11:00:00.000Z",
    };
    expect(canonicalEconomyAuthorityHeadPayload(head)).toContain(
      '"version":"1"',
    );
    expect(canonicalEconomyAuthorityCommitManifestPayload(manifest)).toContain(
      '"commitKind":"provider-acceptance"',
    );
    expect(
      canonicalEconomyIntegrityVerificationReceiptPayload(valid),
    ).toContain('"status":"valid"');
  });
});
