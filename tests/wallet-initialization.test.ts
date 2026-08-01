import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertPersonalWalletInitializationState,
  canonicalPersonalWalletInitializationCommandPayload,
  canonicalPersonalWalletInitializationOutboxPayload,
  createPersonalWalletInitializationState,
} from "../src/index.js";

const INITIALIZED_AT = "2026-08-01T06:30:00.000Z";

function hash(payload: string): string {
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

function state(subjectAccountId = "account:adult:1") {
  return createPersonalWalletInitializationState(
    { subjectAccountId, initializedAt: INITIALIZED_AT },
    hash,
  );
}

describe("personal Token wallet initialization", () => {
  it("builds one deterministic personal wallet with exact zero projections and no activity", () => {
    const initialized = state();

    expect(() =>
      assertPersonalWalletInitializationState(initialized),
    ).not.toThrow();
    expect(initialized).toEqual(state());
    expect(initialized.wallet).toMatchObject({
      accountId: "account:adult:1",
      kind: "personal",
      ownerType: "account",
      ownerId: "account:adult:1",
      status: "active",
      version: 1,
      createdAt: INITIALIZED_AT,
    });
    expect(initialized.scope.components).toEqual([
      {
        walletId: initialized.wallet.walletId,
        role: "personal",
      },
    ]);
    expect(initialized.balance).toMatchObject({
      walletId: initialized.wallet.walletId,
      available: "0",
      reserved: "0",
      held: "0",
      rewardProgress: "0",
      version: 1,
      asOf: INITIALIZED_AT,
    });
    expect(initialized.lifetime).toMatchObject({
      walletId: initialized.wallet.walletId,
      totals: {
        bought: "0",
        earned: "0",
        allocated: "0",
        reclaimed: "0",
        spent: "0",
        reversed: "0",
      },
      version: 1,
      asOf: INITIALIZED_AT,
    });
    expect(initialized.activityEntries).toEqual([]);
    expect(new Set(Object.values(initialized.documentIds)).size).toBe(
      Object.values(initialized.documentIds).length,
    );
    expect(initialized.outboxIntent).toMatchObject({
      eventType: "wallet.initialized.v1",
      subjectAccountId: "account:adult:1",
      walletId: initialized.wallet.walletId,
      portfolioId: initialized.scope.portfolioId,
      occurredAt: INITIALIZED_AT,
    });
  });

  it("uses exact canonical semantic-command and outbox bytes without raw request material", () => {
    const initialized = state();
    const command = canonicalPersonalWalletInitializationCommandPayload(
      initialized.command,
    );
    const outbox = canonicalPersonalWalletInitializationOutboxPayload(
      initialized.outboxIntent,
    );

    expect(command).toBe(JSON.stringify({
      schemaVersion: "1",
      commandType: "initialize-wallet",
      walletKind: "personal",
      subjectAccountId: initialized.command.subjectAccountId,
      walletId: initialized.command.walletId,
      portfolioId: initialized.command.portfolioId,
      initializedAt: INITIALIZED_AT,
    }));
    expect(outbox).toBe(JSON.stringify({
      schemaVersion: "1",
      eventType: "wallet.initialized.v1",
      eventId: initialized.outboxIntent.eventId,
      subjectAccountId: initialized.outboxIntent.subjectAccountId,
      walletId: initialized.outboxIntent.walletId,
      portfolioId: initialized.outboxIntent.portfolioId,
      occurredAt: INITIALIZED_AT,
    }));
    for (const forbidden of [
      "idempotencyKey",
      "provider",
      "payment",
      "email",
      "dateOfBirth",
    ]) {
      expect(command).not.toContain(forbidden);
      expect(outbox).not.toContain(forbidden);
    }
  });

  it("rejects partial, non-zero, cross-subject, and unknown-field initialization state", () => {
    const initialized = state();
    for (const invalid of [
      {
        ...initialized,
        balance: { ...initialized.balance, available: "1000" as const },
      },
      {
        ...initialized,
        wallet: { ...initialized.wallet, accountId: "account:other" },
      },
      {
        ...initialized,
        scope: { ...initialized.scope, components: [] },
      },
      {
        ...initialized,
        email: "must-not-be-persisted@example.invalid",
      },
    ]) {
      expect(() =>
        assertPersonalWalletInitializationState(invalid as never),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("rebuilds stable, isolated identifiers for every valid opaque subject", () => {
    const identifierCharacter = fc.constantFrom(
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-",
    );
    fc.assert(
      fc.property(
        fc.array(identifierCharacter, { minLength: 1, maxLength: 64 })
          .map((characters) => characters.join(""))
          .filter((value) => /^[A-Za-z0-9]/u.test(value)),
        (subjectAccountId) => {
          const first = state(subjectAccountId);
          const second = state(subjectAccountId);
          expect(first.documentIds).toEqual(second.documentIds);
          expect(first.wallet.walletId).toBe(first.command.walletId);
          expect(first.scope.portfolioId).toBe(first.command.portfolioId);
          expect(Object.values(first.documentIds).every(
            (identifier) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(identifier),
          )).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
