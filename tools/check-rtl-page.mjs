#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");

const files = {
  page: path.join(siteRoot, "rtl-optimization", "index.html"),
  style: path.join(siteRoot, "rtl-optimization", "page.css"),
  home: path.join(siteRoot, "index.html"),
  contact: path.join(siteRoot, "contact", "index.html"),
  sitemap: path.join(siteRoot, "sitemap.xml"),
  ledger: path.join(siteRoot, "docs", "rtl-optimization-claims.md"),
};

const expectedClaims = [
  ["SHA-1", "2.27%", "/tree/v2.2.2/cases/sha1"],
  ["INT8 MatVec", "8.3230%", "/tree/v2.2.2/cases/int8-matvec"],
  ["ML-KEM CBD", "9.7338%", "/tree/v2.2.2/cases/mlkem-cbd"],
];

function requireText(source, expected, failures, label) {
  if (!source.includes(expected)) {
    failures.push(`${label}: missing ${JSON.stringify(expected)}`);
  }
}

async function main() {
  const [page, style, home, contact, sitemap, ledger] = await Promise.all(
    Object.values(files).map((file) => fs.readFile(file, "utf8")),
  );
  const failures = [];

  requireText(page, "Verified RTL/PPA Optimization | Göther Labs", failures, "page metadata");
  requireText(page, "https://www.gotherlabs.com/rtl-optimization/", failures, "canonical URL");
  requireText(page, "page.css?v=rtl-pilot-v1", failures, "page stylesheet");
  requireText(page, "No guaranteed improvement", failures, "commercial boundary");
  requireText(page, "not ASIC signoff", failures, "evidence boundary");
  requireText(page, "not a cross-circuit performance ranking", failures, "comparison boundary");
  requireText(page, "Your implementation flow is the final authority", failures, "customer authority");
  requireText(page, "Do not attach confidential RTL", failures, "confidentiality prompt");

  for (const [name, metric, sourcePath] of expectedClaims) {
    requireText(page, name, failures, `${name} label`);
    requireText(page, metric, failures, `${name} metric`);
    requireText(page, sourcePath, failures, `${name} source`);
    requireText(ledger, metric, failures, `${name} ledger metric`);
  }

  requireText(style, ".rtl-hero", failures, "RTL page styles");
  requireText(style, "@media (max-width: 720px)", failures, "mobile styles");
  requireText(style, "prefers-reduced-motion", failures, "motion preference");
  requireText(home, 'href="./rtl-optimization/"', failures, "home entry point");
  requireText(contact, 'href="../rtl-optimization/"', failures, "contact entry point");
  requireText(sitemap, "https://www.gotherlabs.com/rtl-optimization/", failures, "sitemap");
  requireText(ledger, "Reviewed release: `v2.2.2`", failures, "claim ledger release");

  if (failures.length > 0) {
    console.error("RTL page check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("RTL page check passed: claims, boundaries, entry points, and responsive assets are aligned.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
