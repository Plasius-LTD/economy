# Google rewarded web V1 contracts

## Purpose

This package supplies provider-neutral, fixed-point contracts for the first
Google Ad Manager rewarded-web release in Plasius-LTD/plasius-ltd-site#1586.
It does not contain Google Publisher Tag, HTTP handlers, credentials, report
clients, storage, or user identity logic.

## Provider and evidence boundary

`google-ad-manager` is an additive acquisition provider and Token source.
Existing `ayet` and `bitlabs` values remain readable for historical data.

Google rewarded web has no server-side verification. Contracts therefore keep
three facts distinct:

- a `client-claimed` browser grant associated with a one-use Plasius session;
- a `report-matched` paid impression associated with an HMAC fingerprint of a
  random Google reporting key; and
- `financially-reconciled` eligible-net revenue and reserve evidence.

No contract may label a browser event `provider-verified`.

## Quote and margin

All money uses canonical non-negative base-10 strings of integer GBP micros.
Floating-point values are forbidden. One Token has nominal liability of
100,000 GBP micros. A quote for one whole Token is valid only when conservative
eligible net is at least 125,000 GBP micros, preserving at least 25,000 micros
of retained contribution margin.

The immutable quote includes its version, fixed completion count, Google reward
payload, gross floor, fees, invalid-traffic haircut, other approved costs,
eligible net, Token amount, liability, retained margin, and effective window.
Production configuration has no default completion count.

## Reconciliation

A batch binds a domain-separated HMAC fingerprint of the Google report, a
dedicated ad-unit fingerprint, reporting period, quote version, claim count,
matched paid-impression count, revenue, finality, and mismatch status. A batch
can financially reconcile only if every credited bundle is covered by matched
paid impressions and eligible-net revenue satisfies every locked quote.

Google lots are `same-user-only`. Package validation rejects allocation or
reclaim to another beneficiary. A parent-owned household service is a distinct
model: the earning adult spends from their own lot, owns the resulting
entitlement, and linked family members receive dependent access without a
Token or entitlement assignment. The entitlement must remain bound to that
adult and household and must not be sold, gifted, reassigned, or detached.

Google's public policy does not expressly resolve that family-plan case. The
site may implement it behind a separate disabled flag, but production use
requires written Google approval for the exact journey. Without that evidence,
redemption remains personal-use-only.
