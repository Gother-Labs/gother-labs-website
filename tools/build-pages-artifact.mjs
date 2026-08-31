#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultSiteRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultOutputRoot = path.join(defaultSiteRoot, "_site");

export const publishedEntries = Object.freeze([
  ".nojekyll",
  "404.html",
  "CNAME",
  "assets",
  "careers",
  "company",
  "contact",
  "evolther",
  "index.html",
  "results",
  "robots.txt",
  "rtl-optimization",
  "scripts.js",
  "sitemap.xml",
  "styles.css",
]);

async function copyPublishedEntry(source, destination, relativePath) {
  const metadata = await fs.lstat(source);
  if (metadata.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link in published artifact: ${relativePath}`);
  }
  if (metadata.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      await copyPublishedEntry(
        path.join(source, entry.name),
        path.join(destination, entry.name),
        path.posix.join(relativePath, entry.name),
      );
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new Error(`Refusing non-regular published entry: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

export async function buildPagesArtifact({
  siteRoot = defaultSiteRoot,
  outputRoot = defaultOutputRoot,
} = {}) {
  const source = path.resolve(siteRoot);
  const output = path.resolve(outputRoot);
  const expectedOutput = path.join(source, "_site");
  if (output !== expectedOutput) {
    throw new Error(`Refusing unsafe Pages artifact output path: ${output}`);
  }

  // Keep the temporary tree on the same filesystem so the final rename cannot
  // fail with a cross-device error after the previous artifact is removed.
  const temporary = await fs.mkdtemp(path.join(source, ".gother-pages-artifact-"));
  try {
    for (const entry of publishedEntries) {
      await copyPublishedEntry(path.join(source, entry), path.join(temporary, entry), entry);
    }
    await fs.rm(output, { recursive: true, force: true });
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return output;
}

function readOutputArgument(arguments_) {
  if (arguments_.length === 0) return defaultOutputRoot;
  if (arguments_.length !== 2 || arguments_[0] !== "--output" || !arguments_[1]) {
    throw new Error("Usage: node tools/build-pages-artifact.mjs [--output <directory>]");
  }
  return path.resolve(arguments_[1]);
}

async function main() {
  const outputRoot = readOutputArgument(process.argv.slice(2));
  const output = await buildPagesArtifact({ outputRoot });
  console.log(`Pages artifact built from the explicit public allowlist at ${output}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
