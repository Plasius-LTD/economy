# Economy contracts and versioning

## Compatibility

Public data contracts carry `schemaVersion: "1"`. Additive optional fields are
preferred. Renaming fields, changing amount units, weakening invariants, or
changing enum meaning requires a new version and migration guidance.

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

## Trust boundary

Contracts are data and validation primitives. A caller must still derive
identity from a trusted session, enforce flags/capabilities/relationships,
verify provider evidence over raw bytes, acquire persistence locks, and commit
the journal/projection/outbox atomically.
