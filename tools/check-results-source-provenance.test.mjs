import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { checkResultsSourceProvenance } from "./check-results-source-provenance.mjs";

const execFile = promisify(execFileCallback);
const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: "Release Gate Test",
  GIT_AUTHOR_EMAIL: "release-gate@example.invalid",
  GIT_COMMITTER_NAME: "Release Gate Test",
  GIT_COMMITTER_EMAIL: "release-gate@example.invalid",
};

async function git(directory, ...arguments_) {
  const { stdout } = await execFile("git", ["-C", directory, ...arguments_], {
    env: gitEnvironment,
  });
  return stdout.trim();
}

async function writeLock(siteRoot, commit) {
  await fs.mkdir(path.join(siteRoot, "tools"), { recursive: true });
  await fs.writeFile(
    path.join(siteRoot, "tools", "generated-results.lock.json"),
    `${JSON.stringify({
      schema_version: "generated-results-source/v1",
      repository: "Gother-Labs/gother-labs-results",
      commit,
      catalog_schema: "results-catalog/v2",
    })}\n`,
  );
}

async function provenanceFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "results-provenance-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const origin = path.join(root, "origin.git");
  const resultsRoot = path.join(root, "results");
  const siteRoot = path.join(root, "website");
  await execFile("git", ["init", "--bare", origin], { env: gitEnvironment });
  await execFile("git", ["init", "-b", "main", resultsRoot], { env: gitEnvironment });
  await git(resultsRoot, "remote", "add", "origin", origin);

  await fs.writeFile(path.join(resultsRoot, "catalog.json"), "first\n");
  await git(resultsRoot, "add", "catalog.json");
  await git(resultsRoot, "-c", "commit.gpgsign=false", "commit", "-m", "first");
  const first = await git(resultsRoot, "rev-parse", "HEAD");
  await git(resultsRoot, "push", "-u", "origin", "main");

  await fs.writeFile(path.join(resultsRoot, "catalog.json"), "second\n");
  await git(resultsRoot, "add", "catalog.json");
  await git(resultsRoot, "-c", "commit.gpgsign=false", "commit", "-m", "second");
  const second = await git(resultsRoot, "rev-parse", "HEAD");
  await git(resultsRoot, "push", "origin", "main");
  return { resultsRoot, siteRoot, first, second };
}

test("accepts a clean locked commit already merged into origin/main", async (t) => {
  const { resultsRoot, siteRoot, first, second } = await provenanceFixture(t);
  await git(resultsRoot, "checkout", "--detach", first);
  await writeLock(siteRoot, first);

  assert.deepEqual(await checkResultsSourceProvenance({ siteRoot, resultsRoot }), {
    commit: first,
    originMain: second,
  });
});

test("rejects a locked commit that is not merged into origin/main", async (t) => {
  const { resultsRoot, siteRoot, first } = await provenanceFixture(t);
  await git(resultsRoot, "checkout", "--detach", first);
  await fs.writeFile(path.join(resultsRoot, "private.txt"), "private\n");
  await git(resultsRoot, "add", "private.txt");
  await git(resultsRoot, "-c", "commit.gpgsign=false", "commit", "-m", "unmerged");
  const unmerged = await git(resultsRoot, "rev-parse", "HEAD");
  await writeLock(siteRoot, unmerged);

  await assert.rejects(
    checkResultsSourceProvenance({ siteRoot, resultsRoot }),
    /is not merged into origin\/main/,
  );
});

test("rejects a dirty source checkout", async (t) => {
  const { resultsRoot, siteRoot, second } = await provenanceFixture(t);
  await writeLock(siteRoot, second);
  await fs.writeFile(path.join(resultsRoot, "untracked.txt"), "dirty\n");

  await assert.rejects(
    checkResultsSourceProvenance({ siteRoot, resultsRoot }),
    /must be clean/,
  );
});
