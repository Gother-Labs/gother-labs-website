#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertNoSpecialGitEntries } from "./results-source-policy.mjs";

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const defaultSiteRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultResultsRoot = process.env.GOTHER_RESULTS_ROOT
  ? path.resolve(process.env.GOTHER_RESULTS_ROOT)
  : path.resolve(defaultSiteRoot, "..", "gother-labs-results");
const commitPattern = /^[0-9a-f]{40}$/;

async function git(resultsRoot, ...arguments_) {
  return execFile("git", ["-C", resultsRoot, ...arguments_], {
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function readLock(siteRoot) {
  const lockPath = path.join(siteRoot, "tools", "generated-results.lock.json");
  let lock;
  try {
    lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  } catch (error) {
    throw new Error(`Generated-results lock cannot be read: ${error.message}`);
  }
  if (
    lock.schema_version !== "generated-results-source/v1" ||
    lock.repository !== "Gother-Labs/gother-labs-results" ||
    !commitPattern.test(lock.commit) ||
    !["results-catalog/v1", "results-catalog/v2"].includes(lock.catalog_schema)
  ) {
    throw new Error("Generated-results lock contract is invalid.");
  }
  return lock;
}

export async function checkResultsSourceProvenance({
  siteRoot = defaultSiteRoot,
  resultsRoot = defaultResultsRoot,
} = {}) {
  const lock = await readLock(path.resolve(siteRoot));
  const checkout = path.resolve(resultsRoot);
  let head;
  let originMain;
  let status;
  let index;
  try {
    [{ stdout: head }, { stdout: originMain }, { stdout: status }, { stdout: index }] =
      await Promise.all([
        git(checkout, "rev-parse", "--verify", "HEAD^{commit}"),
        git(checkout, "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"),
        git(checkout, "status", "--porcelain", "--untracked-files=all"),
        git(checkout, "ls-files", "--stage", "-z"),
      ]);
  } catch {
    throw new Error(
      "Results checkout must be a Git worktree with a fetched refs/remotes/origin/main.",
    );
  }

  head = head.trim();
  originMain = originMain.trim();
  if (head !== lock.commit) {
    throw new Error(`Results checkout HEAD ${head} does not match locked commit ${lock.commit}.`);
  }
  if (status.trim()) {
    throw new Error("Results checkout must be clean before its release provenance is accepted.");
  }
  assertNoSpecialGitEntries(index, "Results checkout");

  try {
    await git(checkout, "merge-base", "--is-ancestor", lock.commit, "refs/remotes/origin/main");
  } catch (error) {
    if (error.code === 1) {
      throw new Error(
        `Locked Results commit ${lock.commit} is not merged into origin/main ${originMain}.`,
      );
    }
    throw new Error("Results origin/main ancestry could not be verified.");
  }

  return { commit: lock.commit, originMain };
}

async function main() {
  const provenance = await checkResultsSourceProvenance();
  console.log(
    `Results source provenance passed: ${provenance.commit} is merged into origin/main ${provenance.originMain}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
