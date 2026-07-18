# Changelog

All notable changes to this project are documented here. Release section
promotion is owned by the approved GitHub CD workflow.

## Unreleased

- **Added**
  - Added bounded, provider-neutral Admin Token activity, trend, suppression,
    pseudonym metadata, and explainable 28-window median/MAD contracts.

- **Changed**
  - Exported a read-only Admin reporting query port while keeping
    authentication, HMAC aliases, persistence, MCP, and remediation outside the
    package.

- **Fixed**
  - (placeholder)

- **Security**
  - Admin reporting validators reject undeclared identifying fields,
    provider-specific sources, unsafe labels, malformed aliases, cohorts below
    five, and interactive queries beyond their supported bounds.

## [0.7.0] - 2026-08-01

- **Added**
  - Added server-prepared operator adjustment preview, pending proposal,
    distinct approval/rejection, execution and dual-approved reversal
    contracts with exact canonical payloads and stable failure codes.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - Operator adjustment plans bind server-resolved wallet, ledger account and
    source-lot identities; positive value cannot execute without an unexpired
    preview and a distinct approving account, and correction has no delete or
    mutable-balance contract.

## [0.6.0] - 2026-08-01

- **Added**
  - Added an audited `initialize-wallet` command and deterministic personal
    wallet, portfolio, exact-zero projection and outbox planning contracts.

- **Changed**
  - Extended only the V3 audited command union and authority record kinds;
    legacy V1/V2 command types and transaction canonical bytes are unchanged.

- **Fixed**
  - (placeholder)

- **Security**
  - Initialization is restricted to direct self-account browser principals,
    creates no economic transaction or activity row, rejects unknown/raw
    fields, and remains independently gated from Token value writes.

## [0.5.0] - 2026-07-28

- **Added**
  - Added fingerprint-only audited command envelopes binding actor, subject,
    principal/relationship authorization evidence, route, build, region,
    writer fence, correlation, causation, and provider manifests.
  - Added domain-separated HMAC provider evidence, site-owned
    encrypted-handle bindings, accepted/completed/failed/no-op receipts,
    raw-key-free V3 idempotency, and exact replay validation.
  - Added a hash-linked authority head and commit manifests, create/conditional
    replace record references, the open/acquisition-closed/closed/rebuilding
    state machine, cross-record graph validation, integrity receipts, canonical
    Merkle anchors, and deterministic journal-chain verification.
  - Added the additive `EconomyPersistencePortV3` atomic audit surface while
    retaining V1/V2 exports.
  - Added provider-neutral, content-addressed recovery acceptance and committed
    result envelopes, signed regional retention receipts, portable customer
    receipts, and sealed reconstruction-payload contracts.
  - Added cloud-independent verification for detached signatures, regional
    byte equality and receipt chains, duplicate-last Merkle inclusion, and the
    complete customer-receipt evidence graph.

- **Changed**
  - Extended the persistence and integrity boundaries additively without
    changing published V1/V2 transaction canonical bytes.

- **Fixed**
  - Selected the verified current release-branch HEAD for publication so a
    `bump=none` recovery cannot check out workflow tooling from an older package
    metadata commit.

- **Security**
  - V3 audit validators reject unknown/raw idempotency and provider fields,
    preserve original command source on replay, enforce source/command/evidence
    compatibility, and require versioned domain-separated HMAC fingerprints.
  - V3 journal writes type-narrow the unchanged legacy idempotency field to the
    HMAC digest, preserving published canonical transaction bytes without
    storing the raw HTTP key.
  - Authority recovery requires a fresh verification receipt and dual-approval
    evidence; unconditional replacement, Upsert, Patch, and Delete have no V3
    write contract.
  - Recovery and customer-receipt validators reject unknown raw provider,
    payment, identity, storage, and key fields; portable receipts disclose only
    the minimum transaction, amount, result, sequence, regional and inclusion
    evidence needed for customer verification.

## [0.4.0] - 2026-07-26

- **Added**
  - Added purpose-bound `ModuleAllowanceV1` contracts with exact funding,
    reclaim, quote, hold, settle, release, receipt, and reconciliation
    invariants for Guardian-funded Junior Coder module entitlements.
  - Added immutable pre-purchase requirements-manifest evidence and fail-closed
    cross-service reconciliation outcomes without changing
    `GameplayAllocationV1`.

- **Changed**
  - (placeholder)

- **Fixed**
  - Installed a checksum-pinned GitHub CLI in both self-hosted release jobs so
    release preparation and finalization do not depend on runner image state.
  - Restricted incomplete-version recovery to versions that are unpublished on
    both npm and GitHub, allowing an explicit bump after the current package
    version has already been published.
  - Finalized workflow-bearing version tags and GitHub Releases with a
    current-repository GitHub App token that has explicit Contents and
    Workflows write permissions, while keeping npm publication on
    `NPM_TOKEN`.
  - Routed release preparation through the configurable trusted self-hosted
    runner policy, retained LCOV/SBOM evidence, and avoided unsupported npm
    provenance on self-hosted publication.
  - Kept reusable release preparation outside the publication environment so
    inherited organisation GitHub App credentials remain available.
  - Declared and mapped the release-prep GitHub App key explicitly at the
    reusable-workflow boundary so missing credentials fail during validation.

- **Security**
  - Module settlement now requires a pending entitlement identifier, while
    inconsistent settled-debit or active-entitlement observations require
    blocking manual review.

## [0.3.2] - 2026-07-17

- **Added**
  - Added provider-neutral, versioned paid-acquisition lifecycles for
    deterministic purchase-intent transitions, atomic payer/household rolling
    cap reservation/finalization, and retained-lot refund/dispute arithmetic.
  - Added exact GBP minor-unit parsing, one-credit/one-reversal replay guards,
    current early-backer retained-basis inputs, and property/concurrency tests.

- **Changed**
  - Documented paid-acquisition compare-and-swap, allocation-reclaim, feature-
    flag, and adapter trust boundaries while preserving all published V1 APIs.

- **Fixed**
  - (placeholder)

- **Security**
  - Conflicting event-ID reuse, stale cap/lifecycle writers, half-mirrored cap
    state, rolling-cap overspend, and duplicate economic effects now fail in
    deterministic domain validation.

## [0.3.1] - 2026-07-16

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - Made canonical transaction metadata and posting ordering independent of
    host locale, with exact JSON and SHA-256 golden vectors aligned to
    PostgreSQL `COLLATE "C"` ordering for the validated ASCII fields.

- **Security**
  - (placeholder)

## [0.3.0] - 2026-07-16

- **Added**
  - Added the backward-compatible `EconomyPersistencePortV2` atomic mutation boundary for command/workflow evidence, owner-constrained wallets and allocations, versioned source-lot movements, balance/lifetime deltas, active-writer fencing, canonical chain-head locking, actor/subject/command-scoped idempotency, and outbox append.
  - Added `EconomyQueryPortV1`, explicit multi-wallet portfolio scopes/results, deterministic wallet balance and lifetime helpers, and discriminated economic versus workflow activity with bounded cursor pagination.
  - Added settlement-authoritative early-backer policy V2 while retaining the V1 evaluator unchanged.

- **Changed**
  - Documented exclusive spendable/reserved/held projection buckets, per-wallet progress, non-fungible portfolio aggregation, monotonic gross lifetime totals, and the V2 serializable mutation order.

- **Fixed**
  - (placeholder)

- **Security**
  - New persistence contracts replace absolute balance writes with transaction-scoped atomic deltas and require source-lot/refund/version, active-writer-fence, scoped-idempotency, and canonical chain-head transitions to commit with the immutable journal.

## [0.2.0] - 2026-07-15

- **Added**
  - (placeholder)

- **Changed**
  - Added stable `TokenSource` provenance to privacy-safe activity entries so UI filters never depend on localized source labels.

- **Fixed**
  - Rejected non-string JSON values in exact amount, identifier, timestamp, and activity display validation instead of permitting implicit coercion or native type errors.

- **Security**
  - (placeholder)

## [0.1.0] - 2026-07-15

- Create the provider-neutral Token economy package with exact TokenSubunit
  arithmetic, versioned wallet/journal/source-lot/allocation/acquisition/backer
  contracts, deterministic double-entry and projection invariants, one-time
  compensating reversals, dual-control adjustment checks, and persistence ports.
- Add the canonical flat GBP catalog, £0.10 nominal/no-redemption metadata,
  default payer controls, disabled monthly recurrence descriptor, strict
  purchase-intent/provider conversion validation, and same-user reward-lot policy.
- Add generated domain property tests and packed-entrypoint freshness/export checks.


[0.1.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.1.0
[0.2.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.2.0
[0.3.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.3.0
[0.3.1]: https://github.com/Plasius-LTD/economy/releases/tag/v0.3.1
[0.3.2]: https://github.com/Plasius-LTD/economy/releases/tag/v0.3.2
[0.4.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.4.0
[0.5.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.5.0
[0.6.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.6.0
[0.7.0]: https://github.com/Plasius-LTD/economy/releases/tag/v0.7.0
