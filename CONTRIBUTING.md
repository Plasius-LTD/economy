# Contributing to `@plasius/economy`

Thank you for helping improve the provider-neutral Token economy contracts.

## Before contributing

- Follow `CODE_OF_CONDUCT.md`, `SECURITY.md`, and the CLA process in `legal/`.
- Large changes require a tracked GitHub Task under the site Epic/Feature/Story
  hierarchy and an ADR for public boundary changes.
- Never put real personal, payment, provider, settlement, or authentication data
  in code, tests, issues, examples, or logs.

## Local development

Use Node.js 24 and npm:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:coverage
npm run pack:check
```

## Domain rules

- Keep the package pure and provider neutral. HTTP, authentication, provider
  SDKs, database clients, and cloud adapters belong in consuming services.
- Use `bigint` for TokenSubunits and base-10 strings across JSON boundaries.
- Preserve balanced double-entry postings and deterministic projections.
- Prefer additive, versioned public contracts and document breaking changes.
- Add tests for all invariants and failure paths. Every changed source file must
  appear in LCOV and coverage must remain at least 80%.

## Pull requests and releases

- Use a focused feature branch and Conventional Commits.
- Update `README.md`, `CHANGELOG.md`, and relevant ADR/TDR/design documents.
- Ensure CI is green before merge.
- Never publish locally. npm publication is only through the approved GitHub
  `cd.yml` workflow and protected `production` environment.

