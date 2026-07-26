# TDR: Trusted self-hosted release runners

## Status

Accepted — 2026-07-21

## Decision

Release preparation and publication use the configurable `CD_RUNNER_LABELS`
policy, defaulting to `["self-hosted", "Linux", "X64"]`. Publication remains
bound to the protected production environment. The reusable preparation job
stays outside an environment boundary. The caller explicitly maps the required
organisation-owned release-prep GitHub App key into the reusable workflow so
GitHub validates the credential contract before starting the job; that job
cannot access the npm publication token. The publication job mints a second
installation token scoped to the current repository with explicit Contents and
Workflows write permissions. That token is used only for checkout, immutable
tag creation, and GitHub Release finalization; npm publication remains
authenticated solely by the protected `NPM_TOKEN`. Validation remains
unchanged.

The release retains LCOV for 30 days and its CycloneDX SBOM for 90 days. npm
currently requires a cloud-hosted runner for provenance, so publication on a
self-hosted runner uses the protected `NPM_TOKEN` without making an unsupported
provenance claim. The public repository still receives a GitHub SBOM artifact
attestation through the existing attestation step.

## Consequences

- Package releases no longer depend on GitHub-hosted runner billing.
- Pull-request workflows cannot invoke the production release jobs.
- The release-prep GitHub App remains the only credential allowed to write
  version metadata, tags, and GitHub Releases. Its publication-job token is
  restricted to the current repository and revoked when the job finishes,
  while npm publication remains protected by the production environment.
- Deterministic validation, retained evidence and GitHub SBOM attestation remain
  release gates; npm provenance can be re-enabled when self-hosted support is
  officially available.
