# ADR-0010: Separate Google web claims from report and financial evidence

## Status

Accepted.

## Context

Google Ad Manager rewarded web emits a browser `rewardedSlotGranted` event but
does not support server-side verification. Treating that callback like a signed
provider conversion would misrepresent its trust level and weaken ledger
controls.

## Decision

Add `google-ad-manager` as a backwards-compatible provider/source. Model
browser grants as `client-claimed`, Google paid-impression matches as
`report-matched`, and final revenue coverage as `financially-reconciled`.
Require exact integer GBP-micro quotes, one whole Token per fixed bundle,
eligible net of at least 125% of nominal liability, a full reserve, immutable
batch evidence, and same-user-only source lots.

## Consequences

- Callers cannot accidentally describe web evidence as cryptographically
  provider-verified.
- Site adapters must retain an opaque per-session reporting-key mapping and
  import Google reports before releasing the reserve.
- Promised rewards may be credited from reserve before revenue becomes final,
  while later shortfalls suspend future earning rather than reducing the user
  reward.
- Google-earned value cannot fund another account in V1.
- A parent-owned, non-assignable household entitlement is not represented as a
  Token transfer. It may be implemented behind a separate disabled flag, but
  cannot be enabled until Google approves the exact family-plan journey in
  writing.
