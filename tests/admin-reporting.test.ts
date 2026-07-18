import { describe, expect, it } from "vitest";
import {
  ADMIN_TOKEN_ANOMALY_BASELINE_DAYS,
  ADMIN_TOKEN_MAXIMUM_TREND_POINTS,
  ADMIN_TOKEN_MINIMUM_COHORT_SIZE,
  TOKEN_SUBUNITS_MAX,
  TOKEN_SUBUNITS_MIN,
  assertAdminTokenActivityPage,
  assertAdminTokenActivityPageForRequest,
  assertAdminTokenActivityPageRequest,
  assertAdminTokenTrendResult,
  assertAdminTokenTrendResultForRequest,
  assertAdminTokenTrendRequest,
  createAdminTokenAnomalyIndicator,
  createAdminTokenAnomalyUnavailable,
  createDefaultAdminTokenReportingWindow,
  serializeTokenSubunits,
  type AdminTokenActivityEntryV1,
  type AdminTokenActivityPageV1,
  type AdminTokenActivityPageRequestV1,
  type AdminTokenActivityTypeV1,
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
  safeLabel: "token-acquisition",
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
        safeLabel: "token-spend",
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
        activityPage([
          activity({
            safeLabel:
              "accountId=account-recognisable" as AdminTokenActivityEntryV1["safeLabel"],
          }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([activity({ subjectAlias: "account:recognisable" })]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({ subjectAlias: "QvNq_Rp4bJSCcHkh7d4ZTQ" }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("rejects non-data serialization hooks that can bypass property allowlists", () => {
    const entry = activity();
    Object.defineProperty(entry, "toJSON", {
      enumerable: false,
      value: () => ({ accountId: "account:raw" }),
    });

    expect(JSON.stringify(entry)).toContain("accountId");
    expect(() =>
      assertAdminTokenActivityPage(activityPage([entry])),
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
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({
            activityType: "failure",
            status: "failed",
            amount: serializeTokenSubunits(0n),
            safeLabel: "token-acquisition",
          }),
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("represents a workflow failure with no economic amount as exact zero", () => {
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({
            activityType: "failure",
            status: "failed",
            amount: serializeTokenSubunits(0n),
            safeLabel: "token-activity-failed",
          }),
        ]),
      ),
    ).not.toThrow();
    expect(() =>
      assertAdminTokenActivityPage(
        activityPage([
          activity({
            activityType: "hold",
            status: "held",
            amount: serializeTokenSubunits(0n),
            safeLabel: "token-hold",
          }),
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

  it("validates query-bound cursors, filters, and stable result ordering", () => {
    const request: AdminTokenActivityPageRequestV1 = {
      schemaVersion: "1",
      limit: 25,
      cursor: "c1.QvNq_Rp4bJSCcHkh7d4ZTQyaQ4EMTVlKpfqtX30w3Paw",
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
      cursorBinding: {
        schemaVersion: "1",
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
      },
    };

    expect(() => assertAdminTokenActivityPageRequest(request)).not.toThrow();
    expect(() =>
      assertAdminTokenActivityPageRequest({
        ...request,
        sort: "amount-absolute-desc",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPageRequest({
        ...request,
        audience: "mcp-token-activity",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPageRequest({
        ...request,
        filter: {
          ...request.filter,
          statuses: ["held"],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPageRequest({
        ...request,
        cursorBinding: undefined,
      } as never),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
    expect(() =>
      assertAdminTokenActivityPageRequest({
        ...request,
        cursor: "account-raw-identifier",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));

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
    expect(() =>
      assertAdminTokenActivityPage({
        ...activityPage([activity()]),
        hasMore: true,
        nextCursor: "c1.QvNq_Rp4bJSCcHkh7d4ZTQyaQ4EMTVlKpfqtX30w3Paw",
      }),
    ).not.toThrow();
    expect(() =>
      assertAdminTokenActivityPage({
        ...activityPage([activity()]),
        hasMore: true,
        nextCursor: "account-raw-identifier",
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
    const basePage = activityPage([activity()]);
    const page: AdminTokenActivityPageV1 = {
      ...basePage,
      metadata: {
        ...basePage.metadata,
        filter: request.filter,
      },
    };

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
    expect(() =>
      assertAdminTokenActivityPageForRequest(
        {
          ...page,
          metadata: {
            ...page.metadata,
            filter: {
              ...page.metadata.filter,
              activityTypes: ["spend"],
            },
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
      activityTypes: [
        "acquisition",
        "spend",
        "reversal",
        "hold",
        "failure",
      ],
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
          } as AdminTokenTrendResultV1["series"][number],
        ]),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("builds a deterministic 28-window median/MAD spike explanation", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(100_000n),
      baselineSamples: Array.from({ length: 28 }, () => ({
        amount: serializeTokenSubunits(10_000n),
        distinctSubjects: 5,
      })),
      minimumAbsoluteDelta: serializeTokenSubunits(20_000n),
      madMultiplierMilli: 6_000,
    });

    expect(anomaly).toMatchObject({
      method: "same-window-median-mad-v1",
      status: "irregular-spike",
      baselineWindowCount: 28,
      medianAmount: { numerator: "10000", denominator: 1 },
      medianAbsoluteDeviation: { numerator: "0", denominator: 1 },
      deviationFromMedian: { numerator: "90000", denominator: 1 },
      explanationCode: "zero-mad-absolute-threshold-exceeded",
    });
  });

  it("uses the exact conventional median for an even bimodal baseline", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(200n),
      baselineSamples: [
        ...Array.from({ length: 14 }, () => ({
          amount: serializeTokenSubunits(100n),
          distinctSubjects: 5,
        })),
        ...Array.from({ length: 14 }, () => ({
          amount: serializeTokenSubunits(200n),
          distinctSubjects: 5,
        })),
      ],
      minimumAbsoluteDelta: serializeTokenSubunits(50n),
      madMultiplierMilli: 6_000,
    });

    expect(anomaly).toMatchObject({
      status: "normal",
      medianAmount: { numerator: "150", denominator: 1 },
      medianAbsoluteDeviation: { numerator: "50", denominator: 1 },
      deviationFromMedian: { numerator: "50", denominator: 1 },
      explanationCode: "within-baseline-variation",
    });
  });

  it("preserves half-TokenSubunit median and MAD values without rounding", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(102n),
      baselineSamples: [
        ...Array.from({ length: 14 }, () => ({
          amount: serializeTokenSubunits(100n),
          distinctSubjects: 5,
        })),
        ...Array.from({ length: 14 }, () => ({
          amount: serializeTokenSubunits(101n),
          distinctSubjects: 5,
        })),
      ],
      minimumAbsoluteDelta: serializeTokenSubunits(1n),
      madMultiplierMilli: 6_000,
    });

    expect(anomaly).toMatchObject({
      medianAmount: { numerator: "201", denominator: 2 },
      medianAbsoluteDeviation: { numerator: "1", denominator: 2 },
      deviationFromMedian: { numerator: "3", denominator: 2 },
    });
  });

  it("keeps full signed-64-bit input differences exact", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(TOKEN_SUBUNITS_MAX),
      baselineSamples: Array.from({ length: 28 }, () => ({
        amount: serializeTokenSubunits(TOKEN_SUBUNITS_MIN),
        distinctSubjects: 5,
      })),
      minimumAbsoluteDelta: serializeTokenSubunits(TOKEN_SUBUNITS_MAX),
      madMultiplierMilli: 6_000,
    });

    expect(anomaly).toMatchObject({
      medianAmount: {
        numerator: TOKEN_SUBUNITS_MIN.toString(10),
        denominator: 1,
      },
      deviationFromMedian: {
        numerator: (TOKEN_SUBUNITS_MAX - TOKEN_SUBUNITS_MIN).toString(10),
        denominator: 1,
      },
      status: "irregular-spike",
    });
  });

  it("fails closed when an anomaly baseline includes a suppressed cohort", () => {
    expect(() =>
      createAdminTokenAnomalyIndicator({
        observedAmount: serializeTokenSubunits(100_000n),
        baselineSamples: Array.from({ length: 28 }, (_, index) => ({
          amount: serializeTokenSubunits(10_000n),
          distinctSubjects: index === 0 ? 4 : 5,
        })),
        minimumAbsoluteDelta: serializeTokenSubunits(20_000n),
        madMultiplierMilli: 6_000,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("represents an unavailable privacy-safe anomaly baseline explicitly", () => {
    const result = trendResult([
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
        anomaly: createAdminTokenAnomalyUnavailable({
          reason: "privacy-suppressed-baseline",
          eligibleBaselineWindowCount: 27,
        }),
      },
    ]);

    expect(() => assertAdminTokenTrendResult(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(
      /baselineAmounts|distinctSubjects.{0,20}4/u,
    );
  });

  it("keeps reported aggregate arithmetic exact and rejects a forged anomaly", () => {
    const anomaly = createAdminTokenAnomalyIndicator({
      observedAmount: serializeTokenSubunits(25_000n),
      baselineSamples: Array.from({ length: 28 }, (_, index) => ({
        amount: serializeTokenSubunits(BigInt(10_000 + index * 100)),
        distinctSubjects: 5,
      })),
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
                  deviationFromMedian: {
                    numerator: "999",
                    denominator: 1,
                  },
                },
              }),
        })) as AdminTokenTrendResultV1["series"],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("binds trend metadata and activity types to the normalized request", () => {
    const broadResult = trendResult([
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
        anomaly: createAdminTokenAnomalyUnavailable({
          reason: "insufficient-history",
          eligibleBaselineWindowCount: 2,
        }),
      },
    ]);
    const result: AdminTokenTrendResultV1 = {
      ...broadResult,
      metadata: {
        ...broadResult.metadata,
        activityTypes: ["acquisition"],
      },
    };

    expect(() =>
      assertAdminTokenTrendResultForRequest(result, {
        schemaVersion: "1",
        window: {
          fromInclusive: "2026-06-30T00:00:00.000Z",
          toExclusive: "2026-07-01T00:00:00.000Z",
        },
        granularity: "day",
        activityTypes: ["acquisition"],
      }),
    ).not.toThrow();

    expect(() =>
      assertAdminTokenTrendResultForRequest(result, {
        schemaVersion: "1",
        window: {
          fromInclusive: "2026-06-30T00:00:00.000Z",
          toExclusive: "2026-07-01T00:00:00.000Z",
        },
        granularity: "day",
        activityTypes: ["spend"],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONTRACT" }));
  });

  it("supports every hourly activity series across the maximum window", () => {
    const activityTypes: readonly AdminTokenActivityTypeV1[] = [
      "acquisition",
      "failure",
      "hold",
      "reversal",
      "spend",
    ];
    const start = Date.parse("2026-06-01T00:00:00.000Z");
    const series = Array.from({ length: 31 * 24 }, (_, hour) => {
      const bucketStart = new Date(start + hour * 3_600_000).toISOString();
      const bucketEnd = new Date(start + (hour + 1) * 3_600_000).toISOString();
      return activityTypes.map((activityType) => ({
        schemaVersion: "1" as const,
        bucketStart,
        bucketEnd,
        activityType,
        aggregate: {
          visibility: "suppressed" as const,
          reason: "cohort-below-minimum" as const,
          threshold: 5 as const,
        },
      }));
    }).flat();
    const result: AdminTokenTrendResultV1 = {
      schemaVersion: "1",
      series,
      metadata: {
        schemaVersion: "1",
        generatedAt: "2026-07-02T01:00:00.000Z",
        fromInclusive: "2026-06-01T00:00:00.000Z",
        toExclusive: "2026-07-02T00:00:00.000Z",
        granularity: "hour",
        activityTypes,
        minimumCohortSize: 5,
        anomalyBaselineDays: 28,
        rawIdentifiersIncluded: false,
      },
    };

    expect(series).toHaveLength(ADMIN_TOKEN_MAXIMUM_TREND_POINTS);
    expect(() => assertAdminTokenTrendResult(result)).not.toThrow();
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
