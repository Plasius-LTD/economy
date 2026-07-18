import { describe, expect, it } from "vitest";
import {
  ADMIN_TOKEN_ANOMALY_BASELINE_DAYS,
  ADMIN_TOKEN_MINIMUM_COHORT_SIZE,
  assertAdminTokenActivityPage,
  assertAdminTokenActivityPageForRequest,
  assertAdminTokenActivityPageRequest,
  assertAdminTokenTrendResult,
  assertAdminTokenTrendRequest,
  createAdminTokenAnomalyIndicator,
  createDefaultAdminTokenReportingWindow,
  serializeTokenSubunits,
  type AdminTokenActivityEntryV1,
  type AdminTokenActivityPageV1,
  type AdminTokenTrendResultV1,
} from "../src/index.js";

const at = (day: number, hour = 0): string =>
  `2026-06-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

const activity = (
  overrides: Partial<AdminTokenActivityEntryV1> = {},
): AdminTokenActivityEntryV1 => ({
  schemaVersion: "1",
  occurredAt: at(30, 12),
  activityType: "acquisition",
  status: "settled",
  source: "paid-purchase",
  amount: serializeTokenSubunits(50_000n),
  safeLabel: "Token pack acquired",
  rowAlias: "QvNq_Rp4bJSCcHkh7d4ZTQ",
  subjectAlias: "yaQ4EMTVlKpfqtX30w3Paw",
  ...overrides,
});

const activityPage = (
  entries: readonly AdminTokenActivityEntryV1[],
): AdminTokenActivityPageV1 => ({
  schemaVersion: "1",
  entries,
  hasMore: false,
  metadata: {
    schemaVersion: "1",
    generatedAt: at(30, 13),
    fromInclusive: at(1),
    toExclusive: at(30, 14),
    sort: "occurred-at-desc",
    pageLimit: 100,
    audience: "admin-token-activity",
    pseudonymVersion: "hmac-v1",
    rawIdentifiersIncluded: false,
  },
});

describe("privacy-safe Admin Token activity contracts", () => {
  it("validates bounded, signed, pseudonymous activity rows", () => {
    const page = activityPage([
      activity(),
      activity({
        occurredAt: at(30, 11),
        activityType: "spend",
        source: "gameplay",
        amount: serializeTokenSubunits(-1_000n),
        rowAlias: "7tYv1kPhd6d-h9W8mR3wUA",
        safeLabel: "Gameplay Token use",
      }),
    ]);

    expect(() => assertAdminTokenActivityPage(page)).not.toThrow();
  });

  it("rejects raw journal, wallet, account, payment, and provider identifiers", () => {
    for (const [key, value] of [
      ["transactionId", "txn:raw"],
      ["walletId", "wallet:raw"],
      ["accountId", "account:raw"],
      ["orderId", "order:raw"],
      ["providerEventId", "provider:raw"],
      ["idempotencyKey", "idem:raw"],
    ] as const) {
      expect(() =>
        assertAdminTokenActivityPage(
          activityPage([
            {
              ...activity(),
              [key]: value,
            } as AdminTokenActivityEntryV1,
          ]),
        ),
      ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    }
  });

  it("rejects provider-specific sources, unsafe labels, and malformed aliases", () => {
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({
            source: "shopify" as AdminTokenActivityEntryV1["source"],
          }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([activity({ safeLabel: "Unsafe\nlabel" })]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([activity({ subjectAlias: "account:recognisable" })]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("enforces semantic amount signs and canonical exact subunits", () => {
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({
            activityType: "acquisition",
            amount: serializeTokenSubunits(-1n),
          }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({
            activityType: "spend",
            amount: "1" as AdminTokenActivityEntryV1["amount"],
          }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({ amount: "1.5" as AdminTokenActivityEntryV1["amount"] }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });

  it("normalizes a 30-day default window and caps interactive requests at 365 days", () => {
    expect(
      createDefaultAdminTokenReportingWindow("2026-07-01T00:00:00.000Z"),
    ).toEqual({
      fromInclusive: "2026-06-01T00:00:00.000Z",
      toExclusive: "2026-07-01T00:00:00.000Z",
    });

    expect(() =>
      assertAdminTokenActivityPageRequest({
        schemaVersion: "1",
        limit: 100,
        sort: "amount-absolute-desc",
        audience: "admin-token-activity",
        pseudonymVersion: "hmac-v1",
        window: {
          fromInclusive: "2025-07-01T00:00:00.000Z",
          toExclusive: "2026-07-01T00:00:00.001Z",
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));
  });

  it("validates query filters, opaque cursors, and stable result ordering", () => {
    expect(() =>
      assertAdminTokenActivityPageRequest({
        schemaVersion: "1",
        limit: 25,
        cursor: "opaque-cursor-v1",
        sort: "occurred-at-desc",
        audience: "admin-token-activity",
        pseudonymVersion: "hmac-v1",
        window: {
          fromInclusive: at(1),
          toExclusive: at(30, 14),
        },
        filter: {
          activityTypes: ["acquisition", "failure"],
          statuses: ["settled", "failed"],
          sources: ["paid-purchase", "rewarded-activity"],
          subjectAlias: "yaQ4EMTVlKpfqtX30w3Paw",
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({ occurredAt: at(30, 11) }),
          activity({
            occurredAt: at(30, 12),
            rowAlias: "7tYv1kPhd6d-h9W8mR3wUA",
          }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("requires cursor presence exactly when another page exists", () => {
    expect(() =>
      assertAdminTokenActivityPage({
        ...activityPage([activity()]),
        hasMore: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("binds result metadata and rows to the server-normalized request", () => {
    const request = {
      schemaVersion: "1",
      limit: 100,
      sort: "occurred-at-desc",
      audience: "admin-token-activity",
      pseudonymVersion: "hmac-v1",
      window: {
        fromInclusive: at(1),
        toExclusive: at(30, 14),
      },
      filter: {
        activityTypes: ["acquisition"],
        subjectAlias: "yaQ4EMTVlKpfqtX30w3Paw",
      },
    } as const;
    const page = activityPage([activity()]);

    expect(() =>
      assertAdminTokenActivityPageForRequest(page, request),
    ).not.toThrow();
    expect(() =>
      assertAdminTokenActivityPageForRequest(
        {
          ...page,
          metadata: {
            ...page.metadata,
            audience: "mcp-token-activity",
          },
        },
        request,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});

describe("suppressed trends and explainable anomaly indicators", () => {
  const trendResult = (
    series: AdminTokenTrendResultV1["series"],
  ): AdminTokenTrendResultV1 => ({
    schemaVersion: "1",
    series,
    metadata: {
      schemaVersion: "1",
      generatedAt: "2026-07-01T01:00:00.000Z",
      fromInclusive: "2026-06-30T00:00:00.000Z",
      toExclusive: "2026-07-01T00:00:00.000Z",
      granularity: "day",
      minimumCohortSize: ADMIN_TOKEN_MINIMUM_COHORT_SIZE,
      anomalyBaselineDays: ADMIN_TOKEN_ANOMALY_BASELINE_DAYS,
      rawIdentifiersIncluded: false,
    },
  });

  it("represents cohorts below five without leaking counts or amounts", () => {
    const result = trendResult([
      {
        schemaVersion: "1",
        bucketStart: "2026-06-30T00:00:00.000Z",
        bucketEnd: "2026-07-01T00:00:00.000Z",
        activityType: "acquisition",
        aggregate: {
          visibility: "suppressed",
          reason: "cohort-below-minimum",
          threshold: 5,
        },
      },
    ]);

    expect(() => assertAdminTokenTrendResult(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(
      /accountId|walletId|transactionId|subjectAlias|activityCount|signedAmount/u,
    );
  });

  it("rejects disclosed values on a suppressed aggregate", () => {
    expect(() =>
      assertAdminTokenTrendResult(
        trendResult([
          {
            schemaVersion: "1",
            bucketStart: "2026-06-30T00:00:00.000Z",
            bucketEnd: "2026-07-01T00:00:00.000Z",
            activityType: "acquisition",
            aggregate: {
              visibility: "suppressed",
              reason: "cohort-below-minimum",
              threshold: 5,
              activityCount: 4,
            } as AdminTokenTrendResultV1["series"][number]["aggregate"],
          },
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("builds a deterministic 28-window median/MAD spike explanation", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(100_000n),
      baselineAmounts: Array.from({ length: 28 }, () =>
        serializeTokenSubunits(10_000n),
      ),
      minimumAbsoluteDelta: serializeTokenSubunits(20_000n),
      madMultiplierMilli: 6_000,
    });

    expect(anomaly).toMatchObject({
      method: "same-window-median-mad-v1",
      status: "irregular-spike",
      baselineWindowCount: 28,
      medianAmount: "10000",
      medianAbsoluteDeviation: "0",
      deviationFromMedian: "90000",
      explanationCode: "zero-mad-absolute-threshold-exceeded",
    });
  });

  it("keeps reported aggregate arithmetic exact and rejects a forged anomaly", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(25_000n),
      baselineAmounts: Array.from({ length: 28 }, (_, index) =>
        serializeTokenSubunits(BigInt(10_000 + index * 100)),
      ),
      minimumAbsoluteDelta: serializeTokenSubunits(50_000n),
      madMultiplierMilli: 6_000,
    });
    const reported = trendResult([
      {
        schemaVersion: "1",
        bucketStart: "2026-06-30T00:00:00.000Z",
        bucketEnd: "2026-07-01T00:00:00.000Z",
        activityType: "acquisition",
        aggregate: {
          visibility: "reported",
          distinctSubjects: 5,
          activityCount: 7,
          signedAmount: serializeTokenSubunits(25_000n),
        },
        anomaly,
      },
    ]);

    expect(() => assertAdminTokenTrendResult(reported)).not.toThrow();
    expect(() =>
      assertAdminTokenTrendResult({
        ...reported,
        series: reported.series.map((point) => ({
          ...point,
          ...(point.anomaly === undefined
            ? {}
            : {
                anomaly: {
                  ...point.anomaly,
                  deviationFromMedian: serializeTokenSubunits(999n),
                },
              }),
        })),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("bounds hourly trend reads and rejects unsupported query properties", () => {
    expect(() =>
      assertAdminTokenTrendRequest({
        schemaVersion: "1",
        granularity: "hour",
        window: {
          fromInclusive: "2026-05-01T00:00:00.000Z",
          toExclusive: "2026-07-01T00:00:00.000Z",
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TIME_WINDOW" }));

    expect(() =>
      assertAdminTokenTrendRequest({
        schemaVersion: "1",
        granularity: "day",
        window: {
          fromInclusive: "2026-06-01T00:00:00.000Z",
          toExclusive: "2026-07-01T00:00:00.000Z",
        },
        accountId: "account:forbidden",
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });
});
