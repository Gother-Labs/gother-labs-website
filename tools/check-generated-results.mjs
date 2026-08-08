#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_ROOT = path.resolve(__dirname, "..", "results");

async function exists(target) {
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) await fs.access(path.join(target, "index.html"));
    return true;
  } catch {
    return false;
  }
}

function localTargets(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:https?:|mailto:|data:|\/)/.test(target));
}

async function main() {
  const entries = await fs.readdir(RESULTS_ROOT, { withFileTypes: true });
  const resultDirs = entries.filter((entry) => entry.isDirectory());
  const failures = [];

  for (const entry of resultDirs) {
    const articlePath = path.join(RESULTS_ROOT, entry.name, "index.html");
    let html;
    try {
      html = await fs.readFile(articlePath, "utf8");
    } catch {
      continue;
    }

    if (/<p>[^<]*(?:!\[|\[[^\]]+\]\()/.test(html)) failures.push(`${entry.name}: raw Markdown remains in generated HTML`);
    for (const target of localTargets(html)) {
      if (!(await exists(path.resolve(path.dirname(articlePath), target)))) failures.push(`${entry.name}: missing local target ${target}`);
    }
  }

  const qubitHtml = await fs.readFile(path.join(RESULTS_ROOT, "qubit-routing-lightsabre", "index.html"), "utf8");
  const requiredQubitTargets = [
    "artifacts/evaluation_contract.md",
    "artifacts/accepted_candidate.rs",
    "artifacts/metrics.json",
    "artifacts/replay.json",
    "artifacts/score-trace.json",
    "assets/objective-curve.svg",
    "assets/target-comparison.svg",
    "assets/routing-readout.svg",
  ];
  for (const target of requiredQubitTargets) {
    if (!qubitHtml.includes(`\"${target}\"`)) failures.push(`qubit-routing-lightsabre: missing rendered target ${target}`);
  }

  if (failures.length) {
    console.error("Generated result validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Generated result validation passed for ${resultDirs.length} result directories.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
