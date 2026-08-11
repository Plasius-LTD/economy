import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string): string =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");

const ciWorkflow = readWorkflow("ci");
const cdWorkflow = readWorkflow("cd");
const releasePrepareWorkflow = readWorkflow("release-prepare");
const npmConfig = readFileSync(new URL("../.npmrc", import.meta.url), "utf8");

describe("workflow trust and release policy", () => {
  it("keeps public package CI on isolated hosted capacity", () => {
    expect(ciWorkflow).toContain("runs-on: ubuntu-latest");
    expect(ciWorkflow).not.toContain("self-hosted");
    expect(ciWorkflow).not.toContain("pull_request_target:");
  });

  it("binds publication to the exact prepared main commit and successful CI", () => {
    expect(cdWorkflow).toContain("expected_commit_sha");
    expect(cdWorkflow).toContain("Enforce exact-main successful CI");
    expect(cdWorkflow).toContain('-f head_sha="${EXPECTED_SHA}"');
    expect(cdWorkflow).toContain("Revalidate exact main immediately before release mutation");
    expect(cdWorkflow).toContain("Revalidate exact main immediately before npm publication");
    expect(releasePrepareWorkflow).toContain("COMMIT_SHA=$(git rev-parse HEAD)");
    expect(releasePrepareWorkflow).not.toContain('git log -n 1 --format=%H -- "${PACKAGE_JSON}"');
  });

  it("isolates dependency validation from the OIDC publication job", () => {
    const validationJob = cdWorkflow.slice(
      cdWorkflow.indexOf("\n  validate_and_pack:"),
      cdWorkflow.indexOf("\n  publish:"),
    );
    const publishJob = cdWorkflow.slice(cdWorkflow.indexOf("\n  publish:"));

    expect(validationJob).toContain("npm ci");
    expect(validationJob).toContain("npm pack --ignore-scripts --json");
    expect(validationJob).not.toContain("id-token: write");
    expect(publishJob).toContain("id-token: write");
    expect(publishJob).toContain("actions/download-artifact@v8");
    expect(publishJob).not.toContain("npm ci");
    expect(publishJob).not.toContain("npm run ");
  });

  it("uses a pinned tokenless npm client and immutable package artifact", () => {
    expect(cdWorkflow).toContain("npm@11.6.2");
    expect(cdWorkflow).toContain('npm publish "./${TARBALL}" --ignore-scripts');
    expect(cdWorkflow).toContain("--provenance");
    expect(cdWorkflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/u);
    expect(npmConfig).not.toMatch(/_authToken|NPM_TOKEN|NODE_AUTH_TOKEN/u);
  });
});
