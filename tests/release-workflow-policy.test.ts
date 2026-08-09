import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/cd.yml"),
  "utf8",
);

describe("npm release trust boundary", () => {
  it("uses hosted OIDC publication without a long-lived npm write token", () => {
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("npm publish");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
  });

  it("admits only the prepared main commit after exact successful CI", () => {
    expect(workflow).toContain("Enforce exact-main successful CI");
    expect(workflow).toContain("needs.prepare_release.outputs.commit_sha");
    expect(workflow).toContain("refs/remotes/origin/main");
    expect(workflow).toContain("-f branch=main");
    expect(workflow).toContain("-f event=push");
    expect(workflow).toContain('-f head_sha="${EXPECTED_SHA}"');
    expect(workflow).toContain("conclusion == \"success\"");
  });

  it("fails closed when the release runtime cannot use npm OIDC", () => {
    expect(workflow).toContain("Verify release runtime");
    expect(workflow).toContain('ACTUAL_NODE%%.*');
    expect(workflow).toContain('"11.5.1"');
    expect(workflow).toContain("--provenance");
  });
});

