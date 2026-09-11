#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const requirePath = (relativePath, label) => {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) failures.push(`Missing ${label}: ${relativePath}`);
  return fullPath;
};

const packagePath = requirePath("package.json", "browser QA package contract");
const lockPath = requirePath("package-lock.json", "browser QA lockfile");
const configPath = requirePath("playwright.config.mjs", "Playwright configuration");
const specPath = requirePath("tests/visual/site.visual.spec.mjs", "browser QA spec");
const screenshotRoot = requirePath(
  "tests/visual/__screenshots__/site.visual.spec.mjs",
  "visual baseline directory",
);

if (failures.length === 0) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const expectedVersion = pkg.devDependencies?.["@playwright/test"];
  if (!/^\d+\.\d+\.\d+$/.test(expectedVersion ?? "")) {
    failures.push("@playwright/test must be pinned to an exact semver version");
  }
  const lockedVersion = lock.packages?.["node_modules/@playwright/test"]?.version;
  if (lockedVersion !== expectedVersion) {
    failures.push(`Playwright lock mismatch: package=${expectedVersion}, lock=${lockedVersion}`);
  }

  const config = fs.readFileSync(configPath, "utf8");
  for (const requiredProject of [
    "desktop-light",
    "laptop-dark",
    "mobile-light-reduced",
    "mobile-dark-reduced",
    "normal-motion-smoke",
  ]) {
    if (!config.includes(`name: "${requiredProject}"`)) {
      failures.push(`Missing Playwright project: ${requiredProject}`);
    }
  }

  const spec = fs.readFileSync(specPath, "utf8");
  for (const requiredRoute of [
    'path: "/"',
    'path: "/company/"',
    'path: "/contact/"',
    'path: "/rtl-optimization/"',
    'path: "/results/"',
    'path: "/results/quadrature-rule-optimization/"',
    'path: "/results/quadrature-rule-optimization/run/"',
    'path: "/results/verified-rtl-optimization/"',
    'path: "/results/rcpsp-psplib-j30/"',
    'path: "/results/rcpsp-psplib-j30/run/"',
    'path: "/evolther/"',
    'path: "/domains", status: 404',
  ]) {
    if (!spec.includes(requiredRoute)) failures.push(`Missing representative route contract: ${requiredRoute}`);
  }

  const pngs = fs
    .readdirSync(screenshotRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".png"));
  if (pngs.length !== 48) {
    failures.push(`Expected exactly 48 committed visual baselines; found ${pngs.length}`);
  }
}

if (failures.length > 0) {
  console.error("Browser QA contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Browser QA contract OK: pinned dependency, route matrix, projects, and 48 baselines.");
