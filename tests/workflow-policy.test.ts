import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string): string =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");

const ciWorkflow = readWorkflow("ci");
const cdWorkflow = readWorkflow("cd");
const releasePrepareWorkflow = readWorkflow("release-prepare");
const installGithubCliScript = readFileSync(
  new URL("../.github/scripts/install-github-cli.sh", import.meta.url),
  "utf8",
);
const trustedProductionRunner =
  "runs-on: ${{ fromJSON(vars.CD_RUNNER_LABELS || '[\"self-hosted\",\"Linux\",\"X64\"]') }}";

describe("workflow trust and release policy", () => {
  it("keeps fork pull requests off trusted CI runners", () => {
    expect(ciWorkflow).toContain(
      "github.event.pull_request.head.repo.full_name != github.repository",
    );
    expect(ciWorkflow).not.toContain("pull_request_target:");
  });

  it("runs both production release jobs on configurable trusted runners", () => {
    expect(cdWorkflow).toContain(trustedProductionRunner);
    expect(releasePrepareWorkflow).toContain(trustedProductionRunner);
    expect(releasePrepareWorkflow).not.toContain("runs-on: ubuntu-latest");
  });

  it("keeps inherited release-preparation secrets outside environment shadowing", () => {
    expect(cdWorkflow).toContain("environment: production");
    expect(releasePrepareWorkflow).not.toContain("environment: production");
    expect(cdWorkflow).toContain(
      "RELEASE_PREP_APP_PRIVATE_KEY: ${{ secrets.RELEASE_PREP_APP_PRIVATE_KEY }}",
    );
    expect(releasePrepareWorkflow).toMatch(
      /secrets:\s*\n\s+RELEASE_PREP_APP_PRIVATE_KEY:[\s\S]*?\n\s+required: true\s*\n\s+outputs:/u,
    );
    expect(releasePrepareWorkflow).toContain(
      "private-key: ${{ secrets.RELEASE_PREP_APP_PRIVATE_KEY }}",
    );
  });

  it("uses a least-privilege App token for workflow-bearing release tags", () => {
    expect(cdWorkflow).toContain(
      "name: Create release-finalization GitHub App token",
    );
    expect(cdWorkflow).toContain("permission-contents: write");
    expect(cdWorkflow).toContain("permission-workflows: write");
    expect(cdWorkflow).toContain(
      "token: ${{ steps.release_finalization_app_token.outputs.token }}",
    );
    expect(
      cdWorkflow.match(
        /GH_TOKEN: \$\{\{ steps\.release_finalization_app_token\.outputs\.token \}\}/gu,
      ),
    ).toHaveLength(3);
    expect(cdWorkflow).not.toContain(
      "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    );
  });

  it("installs a checksum-pinned GitHub CLI for every self-hosted release job", () => {
    expect(cdWorkflow).toContain("name: Install pinned GitHub CLI");
    expect(releasePrepareWorkflow).toContain(
      "name: Install pinned GitHub CLI",
    );
    expect(cdWorkflow).toContain(
      "run: .github/scripts/install-github-cli.sh",
    );
    expect(releasePrepareWorkflow).toContain(
      "run: .github/scripts/install-github-cli.sh",
    );
    expect(installGithubCliScript).toContain(
      'readonly GH_CLI_VERSION="2.96.0"',
    );
    expect(installGithubCliScript).toContain(
      'readonly GH_CLI_SHA256="83d5c2ccad5498f58bf6368acb1ab32588cf43ab3a4b1c301bf36328b1c8bd60"',
    );
    expect(installGithubCliScript).toContain(
      'actual_sha256="$(sha256sum "${GH_CLI_ARCHIVE}"',
    );
    expect(installGithubCliScript).toContain(
      '[[ "${actual_sha256}" != "${GH_CLI_SHA256}" ]]',
    );
    expect(installGithubCliScript).toContain('"${RUNNER_TEMP:?');
    expect(installGithubCliScript).toContain('"${GITHUB_PATH:?');
  });

  it("only reuses an incomplete release when neither public release is complete", () => {
    expect(releasePrepareWorkflow).toContain(
      '[ "${CURRENT_PUBLISHED}" != "true" ] && [ "${CURRENT_RELEASE_STATE}" != "published" ]',
    );
    expect(releasePrepareWorkflow).not.toContain(
      '[ "${CURRENT_PUBLISHED}" != "true" ] || [ "${CURRENT_RELEASE_STATE}" != "published" ]',
    );
  });

  it("keeps production release workflows off pull-request triggers", () => {
    expect(cdWorkflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(releasePrepareWorkflow).toMatch(/on:\s*\n\s+workflow_call:/u);
    expect(cdWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
    expect(releasePrepareWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
  });

  it("retains evidence and only requests npm provenance on hosted runners", () => {
    expect(cdWorkflow).toContain("name: release-coverage-lcov");
    expect(cdWorkflow).toContain("name: release-sbom");
    expect(cdWorkflow).toContain('RUNNER_ENVIRONMENT: ${{ runner.environment }}');
    expect(cdWorkflow).toContain("npm publish ${FLAGS} --provenance");
    expect(cdWorkflow).toContain("npm publish ${FLAGS} --registry");
  });
});
