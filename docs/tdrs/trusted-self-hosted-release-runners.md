# TDR: Trusted self-hosted release runners

## Status

Accepted — 2026-07-21

## Decision

Release preparation and publication use the configurable `CD_RUNNER_LABELS`
policy, defaulting to `["self-hosted", "Linux", "X64"]`. Production environment
controls, release-prep GitHub App authorization, validation, immutable tags,
GitHub Releases and the protected npm token remain unchanged.

The release retains LCOV for 30 days and its CycloneDX SBOM for 90 days. npm
currently requires a cloud-hosted runner for provenance, so publication on a
self-hosted runner uses the protected `NPM_TOKEN` without making an unsupported
provenance claim. The public repository still receives a GitHub SBOM artifact
attestation through the existing attestation step.

## Consequences

- Package releases no longer depend on GitHub-hosted runner billing.
- Pull-request workflows cannot invoke the production release jobs.
- Deterministic validation, retained evidence and GitHub SBOM attestation remain
  release gates; npm provenance can be re-enabled when self-hosted support is
  officially available.
