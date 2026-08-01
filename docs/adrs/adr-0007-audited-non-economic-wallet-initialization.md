# ADR-0007: Audited non-economic personal-wallet initialization

## Status

- Accepted
- Date: 2026-08-01

## Context

An authorized account cannot read a Token portfolio until the authority has a
wallet descriptor, explicit portfolio scope, balance projection and lifetime
projection. Treating this baseline as a purchase, reward, adjustment or other
economic command would create false activity and weaken the meaning of the
double-entry journal. Creating projections outside the authority commit would
permit partial wallets and unaudited access expansion.

Initialization also has different recovery consequences from a value command.
It acknowledges no Token value, has an exact-zero deterministic rebuild, and
can safely be repeated after regional loss. Requiring value-recovery receipts
for this metadata-only baseline would conflate two trust boundaries and could
encourage broad value writes to be enabled before their independent controls
are ready.

## Decision

- Add `initialize-wallet` only to the additive audited command union. The
  published V1/V2 `EconomyCommandType` remains unchanged.
- Accept the command only from a browser with a direct account principal whose
  actor equals its subject. Delegated-child, provider, system and operator
  principals, and all relationship-bearing forms, are rejected.
- Derive stable wallet, portfolio, projection and outbox identifiers from the
  opaque subject through a caller-supplied SHA-256 adapter and a fixed domain.
- Build one exact personal wallet, one single-component personal portfolio,
  exact-zero balance and lifetime projections, no activity entries, and one
  privacy-minimized `wallet.initialized.v1` outbox intent.
- Bind a successful creation with the generic no-economic result code
  `WALLET_INITIALIZED`. A later complete observation uses
  `WALLET_ALREADY_INITIALIZED`. A `completed` receipt remains reserved for a
  journal transaction and is invalid for initialization.
- Persist command, accepted/result receipts, descriptor/access/balance/lifetime
  projections, idempotency result, outbox fact, authority manifest and the
  conditional head advance in one logical-partition ACID batch. A partial
  pre-existing projection set is an integrity failure, never permission to
  recreate selected records.
- Keep initialization behind its own runtime write gate. It does not authorize
  purchase, reward, allocation, spend or provider acquisition commands.

## Consequences

- A newly authorized self account can receive an authoritative zero portfolio
  without a fabricated Token transaction or history row.
- Concurrent initializers converge through deterministic identifiers,
  idempotency and authority-head compare-and-swap replanning.
- The hash-linked authority graph detects missing or altered initialization
  records. The exact-zero state can be reconstructed deterministically.
- No zero-RPO value or administrator-proof storage claim is made for wallet
  metadata. Before any Token value can be acknowledged, ADR-0006 recovery,
  retention, restore and operational gates still apply independently.
- Site adapters continue to own authentication, authorization, Cosmos schema,
  managed identity, feature flags, deadlines and response shaping.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0002](./adr-0002-atomic-persistence-v2-and-explicit-portfolio-reads.md)
- [ADR-0005](./adr-0005-economy-audit-receipts-and-atomic-v3-persistence.md)
- [ADR-0006](./adr-0006-dual-region-recovery-evidence-and-portable-receipts.md)
