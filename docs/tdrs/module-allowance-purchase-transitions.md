# TDR: Module Allowance purchase transitions

## Scope

This record defines the deterministic state transitions supplied by
`@plasius/economy`. It does not define an HTTP or database implementation.

## Aggregate transitions

| Operation | Available | Held | Spent | Reclaimed |
|---|---:|---:|---:|---:|
| Fund allowance | +amount | — | — | — |
| Create hold | -amount | +amount | — | — |
| Settle hold | — | -amount | +amount | — |
| Release hold | +amount | -amount | — | — |
| Reclaim unused value | -amount | — | — | +amount |

Every operation validates the current projection and expected optimistic
version before returning the next projection. Source-lot selection is a
proposal only; the authoritative persistence adapter locks and revalidates lot
rows before journal and projection writes.

## Reconciliation outcomes

- Held plus pending entitlement: resume settlement.
- Held plus no usable entitlement: release hold.
- Settled plus pending entitlement: activate entitlement.
- Settled plus active entitlement but missing receipt: issue receipt.
- Settled plus active entitlement and receipt: consistent.
- Released/missing financial state plus pending entitlement: cancel pending
  entitlement.
- Any settled debit without an entitlement, or active entitlement without a
  settled debit: manual review.

Automated reconciliation may only perform the named forward-safe action after
reloading and locking current state. `manual-review` is fail-closed.

