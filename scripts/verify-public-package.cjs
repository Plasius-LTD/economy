#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REQUIRED_EXPORT_FILES = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
];

const REQUIRED_RUNTIME_EXPORTS = [
  "BASELINE_GBP_TOKEN_PACKS",
  "assertBalancedTransaction",
  "assertFlatTokenCatalog",
  "assertPurchaseIntentBinding",
  "assertWallet",
];

function listTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listTypeScriptFiles(entryPath)
      : entry.isFile() && entry.name.endsWith(".ts")
        ? [entryPath]
        : [];
  });
}

function main() {
  const root = path.resolve(__dirname, "..");
  const cjsEntry = path.join(root, "dist/index.cjs");
  const declarationEntry = path.join(root, "dist/index.d.ts");
  for (const requiredPath of [cjsEntry, declarationEntry]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error("Build output is missing; run npm run build before pack:check");
    }
  }

  const oldestEntryMtime = Math.min(
    fs.statSync(cjsEntry).mtimeMs,
    fs.statSync(declarationEntry).mtimeMs,
  );
  const staleSource = listTypeScriptFiles(path.join(root, "src")).find(
    (sourcePath) => fs.statSync(sourcePath).mtimeMs > oldestEntryMtime,
  );
  if (staleSource) {
    throw new Error(
      `Build output is stale relative to ${path.relative(root, staleSource)}`,
    );
  }

  const runtime = require(cjsEntry);
  for (const exportName of REQUIRED_RUNTIME_EXPORTS) {
    if (!(exportName in runtime)) {
      throw new Error(`Built package is missing runtime export ${exportName}`);
    }
  }

  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "plasius-economy-pack-"));

  try {
    const output = execFileSync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cacheDir],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const parsed = JSON.parse(output);
    const paths = new Set((parsed[0]?.files ?? []).map((entry) => entry.path));

    for (const requiredPath of REQUIRED_EXPORT_FILES) {
      if (!paths.has(requiredPath)) {
        throw new Error(`Packed package is missing ${requiredPath}`);
      }
    }

    const forbidden = [...paths].filter((filePath) =>
      /(?:^|\/)(?:tests?|coverage|node_modules|\.env|infra|backend|frontend)(?:\/|$)/iu.test(
        filePath,
      ),
    );
    if (forbidden.length > 0) {
      throw new Error(`Forbidden public package paths: ${forbidden.join(", ")}`);
    }

    console.log("Public package check passed.");
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
