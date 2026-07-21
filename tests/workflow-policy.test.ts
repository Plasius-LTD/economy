import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string): string =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");

const ciWorkflow = readWorkflow("ci");
const cdWorkflow = readWorkflow("cd");
const releasePrepareWorkflow = readWorkflow("release-prepare");
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
