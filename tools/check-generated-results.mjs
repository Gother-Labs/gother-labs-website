#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertNoSpecialGitEntries } from "./results-source-policy.mjs";

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const defaultSiteRoot = path.resolve(scriptDirectory, "..");
const expectedRepository = "Gother-Labs/gother-labs-results";
const generatedPaths = ["index.html", "sitemap.xml", "results"];

function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function resolveInside(root, candidate, label, failures) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    failures.push(`${label}: path escapes its result root: ${JSON.stringify(candidate)}`);
    return null;
  }
  return resolved;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root, prefix = "") {
  if (!(await pathExists(root))) return [];
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) {
    throw new Error(`Generated output must not contain symbolic links: ${root}`);
  }
  if (stat.isFile()) return [prefix];

  const files = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const childPrefix = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const childPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Generated output must not contain symbolic links: ${childPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(childPath, childPrefix)));
    } else if (entry.isFile()) {
      files.push(childPrefix);
    }
  }
  return files;
}

async function compareGeneratedPath(siteRoot, generatedRoot, ownedPath, failures) {
  const currentPath = path.join(siteRoot, ownedPath);
  const candidatePath = path.join(generatedRoot, ownedPath);
  const currentFiles = await collectFiles(currentPath);
  const candidateFiles = await collectFiles(candidatePath);
  const allFiles = [...new Set([...currentFiles, ...candidateFiles])].sort();

  for (const child of allFiles) {
    const label = child ? path.posix.join(ownedPath, child) : ownedPath;
    const currentFile = child ? path.join(currentPath, child) : currentPath;
    const candidateFile = child ? path.join(candidatePath, child) : candidatePath;
    const currentExists = await pathExists(currentFile);
    const candidateExists = await pathExists(candidateFile);

    if (!currentExists) {
      failures.push(`generated drift: ${label} is missing from the website checkout`);
      continue;
    }
    if (!candidateExists) {
      failures.push(`generated drift: ${label} is stale and is not produced by the pinned source`);
      continue;
    }

    const [current, candidate] = await Promise.all([
      fs.readFile(currentFile),
      fs.readFile(candidateFile),
    ]);
    if (!current.equals(candidate)) {
      failures.push(`generated drift: ${label} differs from the pinned source`);
    }
  }
}

function collectArtifactPaths(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectArtifactPaths(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectArtifactPaths(item, output);
  }
  return output;
}

async function validateDeclaredArtifacts(siteRoot, resultsRoot, catalog, failures) {
  for (const catalogResult of catalog.results.filter((result) => result.status === "published")) {
    if (!/^[a-z0-9-]+$/.test(catalogResult.slug ?? "")) {
      failures.push(`catalog contains an unsafe result slug: ${JSON.stringify(catalogResult.slug)}`);
      continue;
    }
    let resultRoot = path.join(resultsRoot, "results", catalogResult.slug);
    let result;
    if (catalog.schema_version === "results-catalog/v2") {
      result = catalogResult;
    } else {
      if (!catalogResult.path) {
        failures.push(`catalog ${catalogResult.slug}: published result is missing its result.json path`);
        continue;
      }
      const resultJsonPath = resolveInside(
        resultsRoot,
        catalogResult.path,
        `catalog ${catalogResult.slug}`,
        failures,
      );
      if (!resultJsonPath || !(await pathExists(resultJsonPath))) {
        if (resultJsonPath) failures.push(`catalog ${catalogResult.slug}: missing ${catalogResult.path}`);
        continue;
      }
      resultRoot = path.dirname(resultJsonPath);
      result = JSON.parse(await fs.readFile(resultJsonPath, "utf8"));
    }
    const declared = new Set([
      ...collectArtifactPaths(result.artifacts),
      ...(result.evaluation_contract?.artifact ? [result.evaluation_contract.artifact] : []),
    ]);

    for (const artifact of [...declared].sort()) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(artifact)) continue;
      const source = resolveInside(resultRoot, artifact, `result ${result.slug}`, failures);
      if (!source) continue;
      const published = path.join(siteRoot, "results", result.slug, artifact);
      if (!(await pathExists(source))) {
        failures.push(`result ${result.slug}: declared source artifact is missing: ${artifact}`);
        continue;
      }
      if (!(await pathExists(published))) {
        failures.push(`result ${result.slug}: declared artifact is not published: ${artifact}`);
        continue;
      }
      const [sourceBytes, publishedBytes] = await Promise.all([
        fs.readFile(source),
        fs.readFile(published),
      ]);
      if (!sourceBytes.equals(publishedBytes)) {
        failures.push(`result ${result.slug}: published artifact differs from source: ${artifact}`);
      }
    }
  }
}

async function readSourceLock(siteRoot) {
  const lockPath = path.join(siteRoot, "tools", "generated-results.lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  if (lock.schema_version !== "generated-results-source/v1") {
    throw new Error(`Unsupported generated-results lock schema in ${relativePath(siteRoot, lockPath)}.`);
  }
  if (lock.repository !== expectedRepository) {
    throw new Error(`Generated results must use ${expectedRepository}; lock names ${lock.repository}.`);
  }
  if (!/^[0-9a-f]{40}$/.test(lock.commit)) {
    throw new Error("Generated-results lock must contain a full lowercase 40-character commit SHA.");
  }
  if (!["results-catalog/v1", "results-catalog/v2"].includes(lock.catalog_schema)) {
    throw new Error(`Generated-results lock contains unsupported catalog schema ${lock.catalog_schema}.`);
  }
  for (const field of ["curated_detail_slugs", "preserved_run_slugs"]) {
    if (!Array.isArray(lock[field]) || lock[field].some((slug) => !/^[a-z0-9-]+$/.test(slug))) {
      throw new Error(`Generated-results lock field ${field} must be an array of safe result slugs.`);
    }
  }
  if (!Array.isArray(lock.curated_paths) || lock.curated_paths.some((entry) => {
    const normalized = path.posix.normalize(entry);
    return normalized !== entry || normalized.startsWith("../") || path.posix.isAbsolute(normalized);
  })) {
    throw new Error("Generated-results lock field curated_paths must contain safe relative paths.");
  }
  return lock;
}

async function verifySourceCheckout(resultsRoot, lock, failures) {
  let head;
  try {
    ({ stdout: head } = await execFile("git", ["-C", resultsRoot, "rev-parse", "HEAD"]));
  } catch {
    failures.push(`source checkout is not a Git worktree: ${resultsRoot}`);
    return false;
  }

  let verified = true;
  if (head.trim() !== lock.commit) {
    failures.push(`source checkout is ${head.trim()}; expected pinned commit ${lock.commit}`);
    verified = false;
  }

  let status;
  let index;
  try {
    [{ stdout: status }, { stdout: index }] = await Promise.all([
      execFile("git", ["-C", resultsRoot, "status", "--porcelain", "--untracked-files=all"]),
      execFile("git", ["-C", resultsRoot, "ls-files", "--stage", "-z"], {
        maxBuffer: 16 * 1024 * 1024,
      }),
    ]);
  } catch {
    failures.push("source checkout status or index could not be verified");
    return false;
  }
  if (status.trim()) {
    failures.push("source checkout has local changes; reproducibility requires the clean pinned commit");
    verified = false;
  }
  try {
    assertNoSpecialGitEntries(index, "source checkout");
  } catch (error) {
    failures.push(error.message);
    verified = false;
  }
  return verified;
}

function validateReleaseBoundaries(lock, catalog, failures) {
  if (!Array.isArray(catalog.results)) return;
  const publishedSlugs = new Set(
    catalog.results.filter((result) => result.status === "published").map((result) => result.slug),
  );
  for (const field of ["curated_detail_slugs", "preserved_run_slugs"]) {
    if (new Set(lock[field]).size !== lock[field].length) {
      failures.push(`release lock contains duplicate entries in ${field}`);
    }
    for (const slug of lock[field]) {
      if (!publishedSlugs.has(slug)) {
        failures.push(`release lock ${field} names non-published result ${slug}`);
      }
    }
  }
  if (new Set(lock.curated_paths).size !== lock.curated_paths.length) {
    failures.push("release lock contains duplicate entries in curated_paths");
  }
  for (const curatedPath of lock.curated_paths) {
    const [, slug] = curatedPath.split("/");
    if (!curatedPath.startsWith("results/") || !publishedSlugs.has(slug)) {
      failures.push(`curated path must belong to a published result: ${curatedPath}`);
    }
  }
}

async function generateCleanTree(siteRoot, resultsRoot, lock) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gother-generated-results-"));
  const generatedRoot = path.join(temporaryRoot, "site");
  await fs.mkdir(generatedRoot, { recursive: true });
  await fs.copyFile(path.join(siteRoot, "index.html"), path.join(generatedRoot, "index.html"));

  for (const slug of lock.curated_detail_slugs) {
    const curatedDetail = path.join(siteRoot, "results", slug, "index.html");
    if (!(await pathExists(curatedDetail))) {
      throw new Error(`Curated result detail is missing: results/${slug}/index.html`);
    }
    const generatedDetail = path.join(generatedRoot, "results", slug, "index.html");
    await fs.mkdir(path.dirname(generatedDetail), { recursive: true });
    await fs.copyFile(curatedDetail, generatedDetail);
  }

  for (const slug of lock.preserved_run_slugs) {
    const archivedRun = path.join(siteRoot, "results", slug, "run");
    if (!(await pathExists(archivedRun))) continue;
    const generatedRun = path.join(generatedRoot, "results", slug, "run");
    await fs.mkdir(path.dirname(generatedRun), { recursive: true });
    await fs.cp(archivedRun, generatedRun, { recursive: true });
  }

  for (const curatedPath of lock.curated_paths) {
    const source = path.join(siteRoot, curatedPath);
    if (!(await pathExists(source))) {
      throw new Error(`Curated generated-results path is missing: ${curatedPath}`);
    }
    const destination = path.join(generatedRoot, curatedPath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }

  try {
    await execFile(process.execPath, [path.join(scriptDirectory, "sync-results.mjs")], {
      env: {
        ...process.env,
        GOTHER_SITE_ROOT: generatedRoot,
        GOTHER_RESULTS_ROOT: resultsRoot,
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { generatedRoot, temporaryRoot };
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Clean result generation failed.${detail ? `\n${detail}` : ""}`);
  }
}

export async function checkGeneratedResults({
  siteRoot = defaultSiteRoot,
  resultsRoot = process.env.GOTHER_RESULTS_ROOT
    ? path.resolve(process.env.GOTHER_RESULTS_ROOT)
    : path.resolve(siteRoot, "..", "gother-labs-results"),
} = {}) {
  const lock = await readSourceLock(siteRoot);
  const failures = [];
  const sourceVerified = await verifySourceCheckout(resultsRoot, lock, failures);
  if (!sourceVerified) {
    throw new Error(
      `Generated results source verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }

  const catalogPath = path.join(resultsRoot, "catalog.json");
  if (!(await pathExists(catalogPath))) {
    failures.push(`pinned source is missing catalog.json: ${resultsRoot}`);
  } else {
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    if (catalog.schema_version !== lock.catalog_schema) {
      failures.push(
        `source catalog is ${catalog.schema_version}; lock records ${lock.catalog_schema}`,
      );
    }
    validateReleaseBoundaries(lock, catalog, failures);
    await validateDeclaredArtifacts(siteRoot, resultsRoot, catalog, failures);
  }

  let temporaryRoot;
  try {
    const generated = await generateCleanTree(siteRoot, resultsRoot, lock);
    temporaryRoot = generated.temporaryRoot;
    for (const ownedPath of generatedPaths) {
      await compareGeneratedPath(siteRoot, generated.generatedRoot, ownedPath, failures);
    }
  } finally {
    if (temporaryRoot) {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Generated results check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n` +
        "Refresh with `node tools/sync-results.mjs`, inspect the diff, and rerun `node tools/sync-results.mjs --check`.",
    );
  }

  console.log(
    `Generated results check passed against ${lock.repository}@${lock.commit}; ` +
      "declared artifacts and source-owned generated output are byte-aligned.",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  checkGeneratedResults().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
