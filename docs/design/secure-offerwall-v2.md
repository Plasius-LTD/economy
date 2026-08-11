# Secure offerwall V2 contract design

## Boundary

`@plasius/economy` defines deterministic contracts and arithmetic only. The
site owns adult verification, consent, feature flags, capabilities, HMAC key
management, provider API calls, HTTP redirects, callback byte verification,
rate limiting, storage, reconciliation, cash, and incident response.

## Offer approval

`OfferVersionV1` accepts only GB game/app CPE offers. Every goal is explicitly
non-purchase and cannot require personal-data submission. An approved version
requires two distinct opaque reviewer account IDs and approved accessibility
status. A changed provider version is a different immutable identifier and
must be reviewed again.

## Reward economics

`createRewardQuoteV2()` converts provider USD minor units using an immutable
rational FX snapshot, then subtracts a bounded chargeback haircut and expected
GBP fees. It allocates no more than 80% of eligible net revenue to whole Tokens:

```text
eligible net = floor(gross GBP * (10000 - haircut bps) / 10000) - fees
max nominal user value = floor(eligible net * 8000 / 10000)
whole Tokens = floor(max nominal user value / 10p)
```

The quote records gross, eligible net, nominal reward, retained margin, rate,
FX, haircut, fees, lock time, and expiry. Validators independently recompute
the margin invariant at every boundary.

## Conversion and reversal

Conversion and reversal contracts contain opaque provider event IDs and
domain-separated HMAC payload fingerprints. A host must verify the real raw
request before constructing them. `assessProviderConversion()` binds evidence
to one quote and identifies payout mismatch incidents. `planProviderReversal()`
separates unspent recovery from reserve absorption and always forbids child
debt and entitlement revocation.
