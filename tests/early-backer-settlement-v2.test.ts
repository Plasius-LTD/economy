import { describe, expect, it } from "vitest";
import {
  EARLY_BACKER_SETTLEMENT_POLICY_V2,
  evaluateEarlyBacker,
  evaluateEarlyBackerBySettlementV2,
  serializeTokenSubunits,
  type PaidLotRetentionV1,
  type TokenSubunitString,
} from "../src/index.js";

function paidLot(
  lotId: string,
  purchasedAt: string,
  settledAt: string,
  creditedAt: string,
  retainedAmount: TokenSubunitString = serializeTokenSubunits(50_000n),
): PaidLotRetentionV1 {
  return {
    schemaVersion: "1",
    lotId,
    payerAccountId: "account:payer",
    receivingHouseholdId: "household:1",
    purchaseId: `purchase:${lotId}`,
    catalogVersion: "gbp-v1",
    purchasedAt,
    settledAt,
    creditedAt,
    retainedAmount,
  };
}

const window = {
  publicTokensLaunchAt: "2026-07-15T10:00:00.000Z",
  firstPublicSpendLiveAt: "2026-08-01T10:00:00.000Z",
} as const;

describe("early-backer settlement policy V2", () => {
  it("uses inclusive launch and exclusive cutoff settlement timestamps", () => {
    const result = evaluateEarlyBackerBySettlementV2(
      "account:payer",
      "household:1",
      [
        paidLot(
          "lot:launch",
          "2026-07-15T09:59:00.000Z",
          window.publicTokensLaunchAt,
          "2026-07-15T10:00:01.000Z",
        ),
        paidLot(
          "lot:before-cutoff",
          "2026-08-01T09:59:00.000Z",
          "2026-08-01T09:59:59.999Z",
          "2026-08-01T10:00:01.000Z",
        ),
        paidLot(
          "lot:at-cutoff",
          "2026-08-01T09:59:00.000Z",
          window.firstPublicSpendLiveAt,
          "2026-08-01T10:00:01.000Z",
        ),
      ],
      window,
      "2026-08-02T10:00:00.000Z",
    );
    expect(result).toMatchObject({
      policyVersion: EARLY_BACKER_SETTLEMENT_POLICY_V2,
      qualificationEvent: "settled-at",
      status: "provisional",
      netRetainedAmount: "100000",
      contributingLotIds: ["lot:before-cutoff", "lot:launch"],
    });
  });

  it("treats purchase/credit as provenance ordering rather than window gates", () => {
    const crossing = paidLot(
      "lot:crossing",
      "2026-07-15T09:55:00.000Z",
      "2026-07-15T10:00:00.000Z",
      "2026-08-01T10:00:00.000Z",
    );
    expect(
      evaluateEarlyBackerBySettlementV2(
        "account:payer",
        "household:1",
        [crossing],
        window,
        "2026-08-02T10:00:00.000Z",
      ),
    ).toMatchObject({ status: "provisional", netRetainedAmount: "50000" });

    // V1 remains unchanged for existing consumers and requires all three
    // timestamps to be inside its window.
    expect(
      evaluateEarlyBacker(
        "account:payer",
        "household:1",
        [crossing],
        window,
        "2026-08-02T10:00:00.000Z",
      ),
    ).toMatchObject({ status: "not-qualified", netRetainedAmount: "0" });
  });

  it("does not qualify a settlement before its evaluation time", () => {
    const result = evaluateEarlyBackerBySettlementV2(
      "account:payer",
      "household:1",
      [
        paidLot(
          "lot:future",
          "2026-07-20T09:59:00.000Z",
          "2026-07-20T10:00:00.000Z",
          "2026-07-20T10:00:01.000Z",
        ),
      ],
      window,
      "2026-07-19T10:00:00.000Z",
    );
    expect(result).toMatchObject({
      status: "not-qualified",
      netRetainedAmount: "0",
      contributingLotIds: [],
    });
  });
});
