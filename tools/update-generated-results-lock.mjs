#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertNoSpecialGitEntries } from "./results-source-policy.mjs";

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDirectory, "..");
const resultsRoot = process.env.GOTHER_RESULTS_ROOT
  ? path.resolve(process.env.GOTHER_RESULTS_ROOT)
  : path.resolve(siteRoot, "..", "gother-labs-results");
const lockPath = path.join(scriptDirectory, "generated-results.lock.json");
const supportedCatalogSchemas = new Set(["results-catalog/v1", "results-catalog/v2"]);

async function git(...arguments_) {
  const { stdout } = await execFile("git", ["-C", resultsRoot, ...arguments_]);
  return stdout.trim();
}

async function main() {
  const [head, originMain, status, index] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("rev-parse", "origin/main"),
    git("status", "--porcelain", "--untracked-files=all"),
    git("ls-files", "--stage", "-z"),
  ]);

  if (head !== originMain) {
    throw new Error(
      `Refusing to pin ${head}: the results checkout must be exactly merged origin/main ${originMain}.`,
    );
  }
  if (status) {
    throw new Error("Refusing to pin a results checkout with local changes.");
  }
  assertNoSpecialGitEntries(index, "Refusing results checkout because it");

  const [catalog, lock] = await Promise.all([
    fs.readFile(path.join(resultsRoot, "catalog.json"), "utf8").then(JSON.parse),
    fs.readFile(lockPath, "utf8").then(JSON.parse),
  ]);
  if (!supportedCatalogSchemas.has(catalog.schema_version)) {
    throw new Error(`Refusing unsupported catalog schema ${JSON.stringify(catalog.schema_version)}.`);
  }
  if (
    lock.schema_version !== "generated-results-source/v1" ||
    lock.repository !== "Gother-Labs/gother-labs-results"
  ) {
    throw new Error("Refusing to update an invalid generated-results lock contract.");
  }

  const updated = {
    ...lock,
    commit: head,
    catalog_schema: catalog.schema_version,
  };
  if (process.argv.includes("--check")) {
    console.log(
      `Lock update is eligible for Gother-Labs/gother-labs-results@${head} with ${catalog.schema_version}.`,
    );
    return;
  }
  await fs.writeFile(lockPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  console.log(
    `Pinned Gother-Labs/gother-labs-results@${head} with ${catalog.schema_version}.`,
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
