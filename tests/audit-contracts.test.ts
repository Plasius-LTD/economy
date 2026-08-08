import { describe, expect, it } from "vitest";
import {
  assertAuditedEconomyCommandEnvelope,
  assertEconomyAcceptedCommandReceipt,
  assertEconomyAuditedIdempotencyResult,
  assertEconomyAuditedIdempotencyScope,
  assertEconomyAuthorizationEvidence,
  assertEconomyCommandResultReceipt,
  assertEconomyEncryptedOperationalHandleBinding,
  assertEconomyHmacFingerprint,
  assertEconomyProviderEvidenceHash,
  assertEconomyProviderEvidenceManifest,
  assertExactAuditedEconomyCommandReplay,
  canonicalAuditedEconomyCommandEnvelopePayload,
  canonicalEconomyAcceptedCommandReceiptPayload,
  canonicalEconomyCommandResultReceiptPayload,
  canonicalEconomyEncryptedOperationalHandleBindingPayload,
  canonicalEconomyProviderEvidenceHashPayload,
  canonicalEconomyProviderEvidenceManifestPayload,
  canonicalTransactionPayload,
  serializeTokenSubunits,
  type AuditedEconomyCommandEnvelopeV1,
  type EconomyAuditedIdempotencyResultV1,
  type EconomyAuditedIdempotencyScopeV1,
  type EconomyCommandResultReceiptV1,
  type EconomyPersistencePortV2,
  type EconomyPersistencePortV3,
  type LedgerTransactionV1,
} from "../src/index.js";
import {
  HASH_A,
  HASH_B,
  HASH_C,
  acceptedReceipt,
  auditedProviderCommand,
  authorizationEvidence,
  encryptedHandle,
  fingerprint,
  hash,
  providerEvidence,
  providerManifest,
} from "./audit-fixtures.js";

function command(): AuditedEconomyCommandEnvelopeV1 {
  const evidence = providerEvidence();
  const handle = encryptedHandle();
  return auditedProviderCommand(providerManifest(evidence, handle));
}

describe("privacy-minimized economy audit contracts", () => {
  it("requires the exact domain-separated HMAC shape", () => {
    expect(() =>
      assertEconomyHmacFingerprint(
        fingerprint("economy.idempotency-key.v1"),
        "economy.idempotency-key.v1",
      ),
    ).not.toThrow();
    expect(() =>
      assertEconomyHmacFingerprint(
        fingerprint("economy.provider-event-key.v1"),
        "economy.idempotency-key.v1",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyHmacFingerprint(
        {
          ...fingerprint("economy.idempotency-key.v1"),
          digest: `sha256:${"1".repeat(64)}`,
        } as never,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyHmacFingerprint({
        ...fingerprint("economy.idempotency-key.v1"),
        rawValue: "must-not-be-stored",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyHmacFingerprint(null as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("binds complete authorization evidence and rejects invalid time order", () => {
    expect(() =>
      assertEconomyAuthorizationEvidence(authorizationEvidence()),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuthorizationEvidence({
        ...authorizationEvidence(),
        authorizedAt: "2026-07-26T09:58:59.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      assertEconomyAuthorizationEvidence({
        ...authorizationEvidence(),
        sessionToken: "raw-token",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("validates source, principal, relationship, and evidence compatibility", () => {
    const audited = command();
    expect(() => assertAuditedEconomyCommandEnvelope(audited)).not.toThrow();

    for (const invalid of [
      { ...audited, commandType: "allocate" as const },
      { ...audited, commandSource: "replay" },
      { ...audited, principalType: "account" as const },
      { ...audited, providerEvidenceManifestHash: undefined },
      { ...audited, causation: undefined },
      { ...audited, acceptedAt: "2026-07-26T09:59:58.000Z" },
      {
        ...audited,
        relationshipId: undefined,
        authorizationVersion: audited.authorizationVersion,
      },
    ]) {
      expect(() =>
        assertAuditedEconomyCommandEnvelope(
          invalid as AuditedEconomyCommandEnvelopeV1,
        ),
      ).toThrowError(expect.objectContaining({ code: expect.any(String) }));
    }
  });

  it("keeps privileged corrections classified as adjustments, not acquisition", () => {
    const providerCommand = command();
    const {
      providerEvidenceManifestHash: _providerEvidenceManifestHash,
      causation: _causation,
      ...common
    } = providerCommand;
    const operatorCommand: AuditedEconomyCommandEnvelopeV1 = {
      ...common,
      commandId: "command:adjust:1",
      commandType: "adjust",
      commandSource: "operator",
      actorAccountId: "account:operator",
      principalType: "operator",
      routeId: "api:economy:adjustments",
    };
    expect(() =>
      assertAuditedEconomyCommandEnvelope(operatorCommand),
    ).not.toThrow();
    expect(() =>
      assertAuditedEconomyCommandEnvelope({
        ...operatorCommand,
        commandType: "credit-purchase",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("accepts initialization only as a direct self-account browser command", () => {
    const providerCommand = command();
    const {
      providerEvidenceManifestHash: _providerEvidenceManifestHash,
      causation: _causation,
      relationshipId: _relationshipId,
      authorizationVersion: _authorizationVersion,
      ...common
    } = providerCommand;
    const initialization: AuditedEconomyCommandEnvelopeV1 = {
      ...common,
      commandId: "command:wallet-initialization:1",
      commandType: "initialize-wallet",
      commandSource: "browser",
      actorAccountId: "account:adult",
      subjectAccountId: "account:adult",
      principalType: "account",
      routeId: "api:economy:wallet-initialization",
    };

    expect(() =>
      assertAuditedEconomyCommandEnvelope(initialization),
    ).not.toThrow();
    for (const invalid of [
      { ...initialization, principalType: "delegated-child" as const },
      { ...initialization, actorAccountId: "account:guardian" },
      {
        ...initialization,
        relationshipId: "relationship:household",
        authorizationVersion: 1,
      },
      { ...initialization, commandSource: "system" as const },
    ]) {
      expect(() =>
        assertAuditedEconomyCommandEnvelope(invalid),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("classifies Admin reporting initialization as a service-only system command", () => {
    const providerCommand = command();
    const {
      providerEvidenceManifestHash: _providerEvidenceManifestHash,
      causation: _causation,
      relationshipId: _relationshipId,
      authorizationVersion: _authorizationVersion,
      ...common
    } = providerCommand;
    const initialization: AuditedEconomyCommandEnvelopeV1 = {
      ...common,
      commandId: "command:admin-reporting-initialization:v1",
      commandType: "initialize-admin-reporting",
      commandSource: "system",
      actorAccountId: "service:economy-reporting-bootstrap",
      subjectAccountId: "system:economy-reporting",
      principalType: "service",
      routeId: "cd:economy:admin-reporting-bootstrap",
    };

    expect(() =>
      assertAuditedEconomyCommandEnvelope(initialization),
    ).not.toThrow();
    for (const invalid of [
      { ...initialization, commandSource: "browser" as const },
      { ...initialization, commandSource: "operator" as const },
      { ...initialization, principalType: "account" as const },
    ]) {
      expect(() =>
        assertAuditedEconomyCommandEnvelope(invalid),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("rejects raw Idempotency-Key fields even if JavaScript bypasses typing", () => {
    const audited = {
      ...command(),
      idempotencyKey: "raw-browser-key",
    };
    expect(() =>
      assertAuditedEconomyCommandEnvelope(
        audited as AuditedEconomyCommandEnvelopeV1,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(canonicalAuditedEconomyCommandEnvelopePayload(command())).not.toContain(
      "raw-browser-key",
    );
  });

  it("validates provider HMAC evidence and rejects raw provider material", () => {
    expect(() =>
      assertEconomyProviderEvidenceHash(providerEvidence()),
    ).not.toThrow();
    expect(() =>
      assertEconomyProviderEvidenceHash(
        providerEvidence({
          payloadFingerprint: fingerprint(
            "economy.provider-event-key.v1",
          ),
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyProviderEvidenceHash(
        providerEvidence({
          receivedAt: "2026-07-26T09:59:57.000Z",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      assertEconomyProviderEvidenceHash(
        providerEvidence({
          providerOccurredAt: "2026-07-26T10:00:01.000Z",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
    expect(() =>
      assertEconomyProviderEvidenceHash({
        ...providerEvidence(),
        webhookBody: '{"email":"not-allowed"}',
        signature: "not-allowed",
        providerOrderId: "not-allowed",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("binds external encrypted handles without accepting ciphertext or key URIs", () => {
    const binding = encryptedHandle();
    expect(() =>
      assertEconomyEncryptedOperationalHandleBinding(binding),
    ).not.toThrow();
    const canonical =
      canonicalEconomyEncryptedOperationalHandleBindingPayload(binding);
    expect(canonical).toContain('"cipherSuite":"AES-256-GCM"');
    expect(canonical).not.toContain("ciphertext:");

    expect(() =>
      assertEconomyEncryptedOperationalHandleBinding({
        ...binding,
        ciphertext: "sealed-provider-order",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyEncryptedOperationalHandleBinding({
        ...binding,
        ciphertextContentHash: "not-a-hash",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("requires exact canonically ordered evidence and handle references", () => {
    const evidence = providerEvidence();
    const handle = encryptedHandle();
    const manifest = providerManifest(evidence, handle);
    expect(() =>
      assertEconomyProviderEvidenceManifest(manifest),
    ).not.toThrow();
    expect(() =>
      assertEconomyProviderEvidenceManifest({
        ...manifest,
        evidenceReferences: [
          {
            schemaVersion: "1",
            recordId: "provider-event:z",
            contentHash: HASH_A,
          },
          {
            schemaVersion: "1",
            recordId: "provider-event:a",
            contentHash: HASH_B,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyProviderEvidenceManifest({
        ...manifest,
        evidenceReferences: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("enforces completed, failed, and no-op receipt exclusivity", () => {
    const audited = command();
    const accepted = acceptedReceipt(audited);
    const receiptBase = {
      schemaVersion: "1",
      commandId: audited.commandId,
      correlationId: audited.correlationId,
      acceptedReceiptId: accepted.receiptId,
      commandEnvelopeHash: accepted.commandEnvelopeHash,
      resultHash: HASH_A,
      recordedAt: "2026-07-26T10:00:02.000Z",
    } as const;
    const completed: EconomyCommandResultReceiptV1 = {
      ...receiptBase,
      receiptId: "receipt:completed:1",
      outcome: "completed",
      transactionId: "transaction:purchase:1",
      transactionCanonicalHash: HASH_B,
    };
    const failed: EconomyCommandResultReceiptV1 = {
      ...receiptBase,
      receiptId: "receipt:failed:1",
      outcome: "failed",
      failureCode: "PROVIDER_REJECTED",
    };
    const noOp: EconomyCommandResultReceiptV1 = {
      ...receiptBase,
      receiptId: "receipt:no-op:1",
      outcome: "no-op",
      noOpCode: "DUPLICATE_EFFECT",
    };
    expect(() =>
      assertEconomyAcceptedCommandReceipt(accepted),
    ).not.toThrow();
    for (const receipt of [completed, failed, noOp]) {
      expect(() =>
        assertEconomyCommandResultReceipt(receipt),
      ).not.toThrow();
    }
    for (const invalid of [
      { ...completed, failureCode: "NOT_ALLOWED" },
      { ...failed, noOpCode: "NOT_ALLOWED" },
      { ...noOp, failureCode: "NOT_ALLOWED" },
      { ...noOp, noOpCode: undefined },
    ]) {
      expect(() =>
        assertEconomyCommandResultReceipt(invalid as never),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("validates raw-key-free accepted and terminal idempotency results", () => {
    const audited = command();
    const scope: EconomyAuditedIdempotencyScopeV1 = {
      schemaVersion: "1",
      idempotencyFingerprint: audited.idempotencyFingerprint,
      commandType: audited.commandType,
      actorAccountId: audited.actorAccountId,
      subjectAccountId: audited.subjectAccountId,
      principalType: audited.principalType,
      ...(audited.relationshipId === undefined
        ? {}
        : { relationshipId: audited.relationshipId }),
      ...(audited.authorizationVersion === undefined
        ? {}
        : { authorizationVersion: audited.authorizationVersion }),
    };
    const acceptedResult: EconomyAuditedIdempotencyResultV1 = {
      schemaVersion: "1",
      commandId: audited.commandId,
      commandEnvelopeHash: HASH_A,
      acceptedReceiptId: "receipt:accepted:1",
      state: "accepted",
      responseHash: HASH_B,
      recordedAt: audited.acceptedAt,
    };
    expect(() => assertEconomyAuditedIdempotencyScope(scope)).not.toThrow();
    expect(() =>
      assertEconomyAuditedIdempotencyResult(acceptedResult),
    ).not.toThrow();
    expect(() =>
      assertEconomyAuditedIdempotencyResult({
        ...acceptedResult,
        state: "completed",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertEconomyAuditedIdempotencyResult({
        ...acceptedResult,
        state: "no-op",
        resultReceiptId: "receipt:no-op:1",
      }),
    ).not.toThrow();
  });

  it("keeps original source stable and rejects conflicting replay bytes", () => {
    const audited = command();
    expect(() =>
      assertExactAuditedEconomyCommandReplay(audited, { ...audited }),
    ).not.toThrow();
    expect(() =>
      assertExactAuditedEconomyCommandReplay(audited, {
        ...audited,
        buildId: "build:conflicting",
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }));
    expect(audited.commandSource).toBe("shopify");
  });

  it("canonicalizes fixed fields independently of insertion order", () => {
    const audited = command();
    const reordered = {
      writerFencingToken: audited.writerFencingToken,
      acceptedRegion: audited.acceptedRegion,
      acceptedAt: audited.acceptedAt,
      providerEvidenceManifestHash:
        audited.providerEvidenceManifestHash!,
      payloadHash: audited.payloadHash,
      causation: audited.causation!,
      correlationId: audited.correlationId,
      buildId: audited.buildId,
      routeId: audited.routeId,
      authorizationEvidence: audited.authorizationEvidence,
      authorizationVersion: audited.authorizationVersion!,
      relationshipId: audited.relationshipId!,
      principalType: audited.principalType,
      subjectAccountId: audited.subjectAccountId,
      actorAccountId: audited.actorAccountId,
      idempotencyFingerprint: audited.idempotencyFingerprint,
      commandSource: audited.commandSource,
      commandType: audited.commandType,
      commandId: audited.commandId,
      schemaVersion: audited.schemaVersion,
    } satisfies AuditedEconomyCommandEnvelopeV1;
    const canonical =
      canonicalAuditedEconomyCommandEnvelopePayload(audited);
    expect(canonicalAuditedEconomyCommandEnvelopePayload(reordered)).toBe(
      canonical,
    );
    expect(canonical).toContain(
      '"domain":"economy.idempotency-key.v1"',
    );
    expect(canonical).not.toContain('"idempotencyKey"');
    expect(hash(canonical)).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("canonicalizes provider manifests, evidence, and receipts without raw facts", () => {
    const evidence = providerEvidence();
    const handle = encryptedHandle();
    const manifest = providerManifest(evidence, handle);
    const audited = auditedProviderCommand(manifest);
    const accepted = acceptedReceipt(audited);
    const failed: EconomyCommandResultReceiptV1 = {
      schemaVersion: "1",
      receiptId: "receipt:failed:1",
      commandId: audited.commandId,
      correlationId: audited.correlationId,
      acceptedReceiptId: accepted.receiptId,
      commandEnvelopeHash: accepted.commandEnvelopeHash,
      outcome: "failed",
      resultHash: HASH_C,
      failureCode: "PROVIDER_REJECTED",
      recordedAt: "2026-07-26T10:00:02.000Z",
    };
    for (const payload of [
      canonicalEconomyProviderEvidenceHashPayload(evidence),
      canonicalEconomyProviderEvidenceManifestPayload(manifest),
      canonicalEconomyAcceptedCommandReceiptPayload(accepted),
      canonicalEconomyCommandResultReceiptPayload(failed),
    ]) {
      expect(payload).not.toContain("raw");
      expect(payload).not.toContain("providerOrderId");
      expect(payload).not.toContain("account:guardian");
    }
  });

  it("does not alter the published legacy transaction canonical vector", () => {
    const transaction: LedgerTransactionV1 = {
      schemaVersion: "1",
      transactionId: "txn:legacy:1",
      activityType: "purchase",
      status: "settled",
      idempotencyKey: "idem:legacy:1",
      effectiveAt: "2026-07-26T10:00:00.000Z",
      recordedAt: "2026-07-26T10:00:01.000Z",
      metadata: {},
      postings: [
        {
          schemaVersion: "1",
          postingId: "posting:legacy:debit",
          transactionId: "txn:legacy:1",
          accountId: "account:clearing",
          amount: serializeTokenSubunits(-1_000n),
        },
        {
          schemaVersion: "1",
          postingId: "posting:legacy:credit",
          transactionId: "txn:legacy:1",
          accountId: "account:wallet",
          walletId: "wallet:1",
          amount: serializeTokenSubunits(1_000n),
        },
      ],
    };
    expect(canonicalTransactionPayload(transaction)).toBe(
      '{"schemaVersion":"1","transactionId":"txn:legacy:1","activityType":"purchase","status":"settled","idempotencyKey":"idem:legacy:1","effectiveAt":"2026-07-26T10:00:00.000Z","recordedAt":"2026-07-26T10:00:01.000Z","metadata":{},"postings":[{"schemaVersion":"1","postingId":"posting:legacy:credit","transactionId":"txn:legacy:1","accountId":"account:wallet","walletId":"wallet:1","amount":"1000"},{"schemaVersion":"1","postingId":"posting:legacy:debit","transactionId":"txn:legacy:1","accountId":"account:clearing","amount":"-1000"}]}',
    );
  });

  it("keeps V2 exported while adding a distinct fingerprint-only V3 port", () => {
    const acceptsV2 = (
      port: EconomyPersistencePortV2,
    ): EconomyPersistencePortV2 => port;
    const acceptsV3 = (
      port: EconomyPersistencePortV3,
    ): EconomyPersistencePortV3 => port;
    expect(typeof acceptsV2).toBe("function");
    expect(typeof acceptsV3).toBe("function");
  });
});
