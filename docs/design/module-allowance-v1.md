# Module Allowance V1

## Work definition

- Epic: `Plasius-LTD/plasius-ltd-site#1701`
- Feature: `Plasius-LTD/plasius-ltd-site#1703`
- Story: `Plasius-LTD/plasius-ltd-site#1710`
- Task: `Plasius-LTD/economy#11`
- Rollout flag: `learning.junior-coder.purchase.enabled`

## Purpose

`ModuleAllowanceV1` is a Guardian-funded, child-specific reservation of ordinary
Plasius Tokens that may only fund independently sellable learning-module
entitlements. It is separate from `GameplayAllocationV1`; neither balance nor
policy is shared implicitly between them.

The package owns provider-neutral contracts and deterministic arithmetic only.
The authoritative service owns Guardian authorization, feature and capability
evaluation, serializable persistence, ledger postings, entitlement writes,
idempotency storage, outbox delivery, and reconciliation scheduling.

## Purchase lifecycle

1. The service creates an immutable `ModuleSpendQuoteV1` after the Guardian has
   acknowledged the exact version and SHA-256 reference of the module's
   requirements manifest.
2. A hold moves exact whole Tokens from `availableAmount` to `heldAmount`.
3. The learning service creates a pending entitlement using the same quote and
   module-version identifiers.
4. Settlement requires that pending entitlement identifier and moves the amount
   from `heldAmount` to `spentAmount`.
5. The learning service activates the entitlement and the service emits a
   durable `ModulePurchaseReceiptV1`.
6. Any pre-settlement failure releases the hold to `availableAmount`.

All state transitions return new immutable projections with optimistic version
increments. Persistence adapters must compare-and-swap both the allowance and
hold within one serializable transaction. Command replays are resolved against
actor/subject/operation-scoped idempotency evidence before applying a second
economic effect.

## Invariants

- Amounts are canonical signed-64-bit TokenSubunit strings and Module Allowance
  movements contain whole Tokens.
- `allocated = available + held + spent + reclaimed` at every version.
- Funding provenance equals the lifetime allocated amount; reclaim provenance
  equals the lifetime reclaimed amount.
- A hold is bound to one immutable quote, one child, and one module version.
- A quote is unusable after expiry and cannot be used with another allowance,
  child, module version, price, or requirements manifest.
- A settled hold must carry both an entitlement ID and settlement transaction
  ID. A released hold carries neither an entitlement nor settlement ID.
- A receipt can be created only from a matching settled hold and quote.
- Reconciliation never invents economic success. A settled debit without an
  entitlement, or an active paid entitlement without settlement, requires
  manual review.

## Rollout and access

The consuming backend evaluates `learning.junior-coder.purchase.enabled` before
accepting Module Allowance commands. Guardian and child surfaces additionally
consume server-issued capabilities: Guardians can allocate and confirm
purchases; children can view allowance value and make a neutral module request
but never receive shop, advertising, funding, or confirmation actions.

Disabling the flag rejects new quotes, holds, and settlements. Existing held
value remains visible to the reconciliation worker, which may release it. The
flag does not delete balances, receipts, or entitlements.

