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

Both self-hosted release jobs install GitHub CLI 2.96.0 into `RUNNER_TEMP` from
the official Linux AMD64 archive and verify its published SHA-256 checksum
before adding it to the job path. Release correctness therefore does not depend
on mutable, system-wide runner tooling.

When a bump is requested, release preparation reuses an existing changelog
version only if that version is incomplete on both npm and GitHub. An npm
publication or a published GitHub Release makes the current version complete
for bump selection, so the requested bump is applied to the highest local,
registry, or tag version. `bump=none` remains the explicit recovery path for
already-prepared metadata.

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
- GitHub CLI upgrades require an explicit version and checksum review in the
  repository rather than an untracked runner-image change.
- Version recovery no longer turns a requested bump into an impossible
  duplicate publication when the current npm version is already live.
- Deterministic validation, retained evidence and GitHub SBOM attestation remain
  release gates; npm provenance can be re-enabled when self-hosted support is
  officially available.
