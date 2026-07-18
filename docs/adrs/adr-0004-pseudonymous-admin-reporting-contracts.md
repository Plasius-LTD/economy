# ADR-0004: Pseudonymous Admin Token reporting contracts

## Status

- Accepted
- Date: 2026-07-18

## Context

Finance operators need bounded Token activity and trend reads to identify
acquisition and usage spikes. The authoritative journal remains immutable and
contains identifiers that must not be exposed through routine Admin or MCP
reads. Provider names, account, wallet, order, payment, idempotency, transaction,
and journal-integrity identifiers are unnecessary for this purpose.

The economy package is provider neutral. It cannot own authentication,
capabilities, feature flags, secret-keyed HMAC generation, PostgreSQL queries,
timeouts, rate limits, or MCP transport. It can define the narrow data boundary
that a consuming service must satisfy and reject undeclared identifying fields.

Small trend cohorts also create a re-identification risk. Anomaly detection must
remain explainable and must never become an automatic financial mutation.

## Decision

- Add the versioned `AdminEconomyReportingQueryPortV1` activity and trend
  contracts without changing the immutable ledger or existing query port.
- Activity rows contain only time, normalized activity type/status/source,
  signed TokenSubunits, a closed safe-label code, and opaque row and subject
  aliases. Presentation layers map label codes to localized text. Runtime
  validation accepts only plain enumerable data properties and rejects
  serialization hooks and every undeclared property.
- Failure rows may carry exact zero when no related economic transaction or
  attempted amount exists. Every economically meaningful activity remains
  non-zero.
- Provider-specific sources are normalized into non-identifying source
  groupings before entering this boundary.
- Result metadata records the pseudonym audience and version and fixes
  `rawIdentifiersIncluded` to `false`. The host generates aliases with an
  approved secret-keyed, versioned, audience- and purpose-separated HMAC
  adapter; row and subject aliases cannot be equal.
- Activity pages have a maximum of 100 rows. Interactive windows default to 30
  days and cannot exceed 365 days. Hourly trend windows are limited to 31 days;
  daily windows may cover the 365-day maximum. A server-authenticated,
  confidentiality-protected cursor carries no raw identifiers and has a
  decoded binding to the normalized window, sort, filters, pseudonym audience,
  and version. Result metadata echoes the normalized filter. The maximum
  complete trend result is 3,720 points.
- Trend aggregates with fewer than five distinct subjects are represented only
  by a suppression marker. Counts, amounts, aliases, and anomaly indicators are
  absent from suppressed points.
- Reported points use exact signed TokenSubunit strings. Explainable anomalies
  use 28 preceding same-window values whose cohorts each meet the privacy
  threshold, a conventional median/MAD calculation, and an explicit absolute
  minimum. Reduced rational TokenSubunit statistics with denominators up to
  two preserve the exact two even-sized median operations.
- If 28 eligible baselines do not exist because history is short or a cohort
  was suppressed, the point carries an explicit non-identifying unavailable
  result instead of exposing a derived statistic. The result remains advisory.
- The package contains no identity resolution operation. Any governed
  re-identification workflow remains a separate owner-only site boundary.

## Consequences

- Site and MCP adapters share one privacy contract and can prove that ordinary
  activity responses contain no raw identifiers.
- Audience separation remains enforceable without placing an HMAC secret or
  cryptographic implementation in this package.
- Conventional median/MAD values remain deterministic and exact without
  floating point; half-subunits are represented as reduced rationals.
- Query cancellation, reporting database credentials, authorization, audit,
  rate limiting, retention, and remediation links remain host responsibilities.
- A future contract version is required if a new field, source grouping,
  suppression rule, or anomaly method would weaken this privacy boundary.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0002](./adr-0002-atomic-persistence-v2-and-explicit-portfolio-reads.md)
- Site Admin Token/MCP privacy-boundary ADR.
