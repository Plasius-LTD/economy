# ADR-0011: Hosted OIDC package publication

- Status: Accepted
- Date: 2026-08-09

## Context

npm trusted publishing accepts GitHub Actions only from GitHub-hosted runners.
The previous `economy` release job selected self-hosted infrastructure and
required a long-lived npm write token. That prevented the package from using
its configured trusted-publisher binding and left release availability coupled
to a reusable credential.

The parent rollout control is
`platform.public-artifact-integrity.enabled`. It governs staged release
restoration but cannot bypass source, CI, package, or publication integrity
checks. No product capability is introduced.

## Decision

Publication is phase-isolated: dependency installation, package validation, SBOM generation, and immutable tarball packing run in `validate_and_pack` without the `production` environment or OIDC permission. The final hosted `publish` job downloads only that sealed artifact, explicitly installs npm 11.6.2, runs no repository dependency code, and publishes the tarball with lifecycle scripts disabled. It re-fetches current `main` immediately before the first release mutation and again immediately before npm publication. `.npmrc` contains no registry-auth placeholder, and release preparation returns the reviewed current `main` HEAD rather than package-file history.

The final npm publication job in `.github/workflows/cd.yml`:

1. runs on the literal `ubuntu-latest` GitHub-hosted runner;
2. remains bound to protected `main` and the GitHub `production`
   environment;
3. verifies that the prepared commit still equals remote `main` and that an
   exact-SHA `ci.yml` push run completed successfully;
4. verifies Node.js 24 and npm 11.5.1 or newer before publication;
5. receives least-privilege `id-token: write` and publishes only through npm
   OIDC with provenance; and
6. has no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or long-lived write-token
   fallback.

The external npm trusted publisher is bound exactly to organization
`Plasius-LTD`, repository `economy`, workflow `cd.yml`, environment
`production`, and action `npm publish`.

## Consequences

- A moved main branch, absent exact-SHA CI result, unsupported runtime, missing
  trusted-publisher binding, or OIDC failure stops publication before npm
  mutation.
- Public package CI and the narrow publication boundary use isolated
  GitHub-hosted capacity, keeping untrusted repository code away from company
  runners and avoiding private runner-group availability drift.
- Releases use short-lived workflow identity and retain npm provenance without
  a reusable write credential.
- Rollback disables `cd.yml` or the release-integrity flag. Published package
  history, tags, and registry versions are never rewritten or deleted.
