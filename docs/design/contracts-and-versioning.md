# Economy contracts and versioning

## Compatibility

Public data contracts carry `schemaVersion: "1"`. Additive optional fields are
preferred. Renaming fields, changing amount units, weakening invariants, or
changing enum meaning requires a new version and migration guidance.

The `V2` suffix on `EconomyPersistencePortV2` and settlement-policy helpers is
an additive API-generation name; their nested wire records continue to carry
their declared `schemaVersion`. V1 types and behavior remain exported.

## Amount boundary

All amounts are TokenSubunits in signed 64-bit range. JSON examples use strings:

```json
{
  "available": "50000",
  "reserved": "10000",
  "held": "0",
  "rewardProgress": "275"
}
```

No API or adapter may parse authoritative amounts with JavaScript `number`.

The versioned nominal reference is 10 GBP minor units for 1,000 TokenSubunits.
It exists for catalog consistency and product copy only. The contract fixes
`cashRedemptionAllowed` to `false`; no adapter may present it as cash value.

## Acquisition boundary

- Catalog pack IDs and versions are immutable wire identifiers.
- Purchase intents are server-created bindings; browsers cannot supply an
  authoritative price, grant, wallet, payer, household, or completion state.
- Provider conversion records use signed unique event identifiers and
  server-owned FX/rate versions.
- ayeT and BitLabs source lots must remain `same-user-only`.
- The future monthly subscription descriptor is exported disabled; site flags
  and authorization remain authoritative.

## Public validation

Every public V1 wire contract with behavioral invariants has a corresponding
runtime assertion. HTTP/database/provider adapters must validate at ingress and
must not treat TypeScript types as runtime validation.

## Journal and workflow status boundary

- `EconomicJournalTransactionV1` accepts only `held` and `settled` economic
  effects.
- `pending` and `failed` are command-workflow activity states and never create
  postings or affect projections/lifetime totals.
- `reversed` is an economic read-model state derived from a compensating
  transaction. It is not an update to an original immutable row.

Legacy `LedgerTransactionV1` and `ActivityEntryV1` retain their V1 unions for
binary/source compatibility. New persistence and query adapters use the
narrower additive contracts.

## Portfolio read boundary

`WalletPortfolioReadScopeV1` is server-created after authorization and lists
every permitted component wallet explicitly. Component identities are retained
in all results. Aggregate columns are display totals, not a fungibility claim;
in particular, sub-Token progress is not promoted between a household treasury
and a same-user-only personal wallet.

## Trust boundary

Contracts are data and validation primitives. A caller must still derive
identity from a trusted session, enforce flags/capabilities/relationships,
verify provider evidence over raw bytes, acquire persistence locks, and commit
the journal/projection/outbox atomically.

V2 persistence deliberately offers no unscoped wallet mutation lookup.
Allocation mutation/read lookups require the server-derived household and
child account together. Caller idempotency keys are namespaced by actor,
subject, and command type, and a regional worker must lock and validate its
active writer-fencing token before extending the journal.
