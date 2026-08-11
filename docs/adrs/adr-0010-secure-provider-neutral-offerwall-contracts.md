# ADR-0010: Secure provider-neutral offerwall contracts

## Status

- Accepted
- Date: 2026-08-09

## Context

The original acquisition contract names ayeT and BitLabs and converts provider
payouts through a general reward rate. BitLabs cannot remain a launch
dependency, and the host needs immutable offer review, exact margin, signed
conversion/reversal, reserve, and child-safety evidence without moving HTTP,
cryptography, persistence, or provider SDK concerns into this package.

## Decision

- Preserve BitLabs as a valid historical provider value and add AdGem
  additively across acquisition, audit, ledger, source-lot, and query contracts.
- Define provider-neutral UK CPE offer and goal versions. An approved offer
  requires two distinct reviewers and an approved accessibility assessment.
- Lock `RewardQuoteV2` using exact USD/GBP rational arithmetic. One Token has a
  nominal value of 10 GBP minor units, and user value may consume at most 80%
  of eligible net provider revenue.
- Credit the locked reward from verified conversion evidence. A lower observed
  payout disables the offer and creates an incident disposition without
  silently reducing the user's reward.
- Model reversals so recoverable unspent value is distinguished from reserve
  absorption. Reversals never revoke a child entitlement or create child debt.
- Store only minimized HMAC fingerprints in provider evidence contracts. Raw
  callbacks, provider identifiers, secrets, signatures, and personal data stay
  in the consuming adapter's trust boundary.

## Consequences

- A host can qualify ayeT and AdGem against the same contracts and enable one
  adapter without migrating historical BitLabs data.
- Offer approval, callback verification, reconciliation, reserve funding, and
  transactional persistence remain host responsibilities.
- Only whole-Token offerwall rewards are quotable. Goals unable to fund one
  Token and the required margin fail closed.

## Related decisions

- [ADR-0001](./adr-0001-pure-economy-boundary-and-token-subunit-ledger.md)
- [ADR-0003](./adr-0003-provider-neutral-paid-acquisition-lifecycles.md)
- [ADR-0004](./adr-0004-purpose-bound-module-allowances.md)
