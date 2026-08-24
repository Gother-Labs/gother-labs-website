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
  { name: "SHA-1 RTL", metric: "2.27%", sourcePath: "/tree/v2.2.2/cases/sha1" },
  { name: "INT8 MatVec RTL", metric: "8.3230%", sourcePath: "/tree/v2.2.2/cases/int8-matvec" },
  { name: "ML-KEM CBD RTL", metric: "9.7338%", sourcePath: "/tree/v2.2.2/cases/mlkem-cbd" },
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
  requireText(page, "page.css?v=rtl-pilot-v2", failures, "page stylesheet");
  requireText(page, "No guaranteed improvement", failures, "commercial boundary");
  requireText(page, "not ASIC signoff", failures, "evidence boundary");
  requireText(page, "not a cross-circuit performance ranking", failures, "comparison boundary");
  requireText(page, "not side-channel analysis", failures, "ML-KEM boundary");
  requireText(page, "certification of a complete", failures, "ML-KEM certification boundary");
  requireText(page, "functional checks and an agreed formal-equivalence scope", failures, "formal policy");
  requireText(page, "Your implementation flow is the final authority", failures, "customer authority");
  requireText(page, "Do not attach confidential RTL", failures, "confidentiality prompt");
  requireText(page, "/tree/v2.2.2#results-at-a-glance", failures, "versioned evidence entry point");

  for (const { name, metric, sourcePath } of expectedClaims) {
    const sourceIndex = page.indexOf(sourcePath);
    const cardEnd = sourceIndex >= 0 ? page.indexOf("</a>", sourceIndex) : -1;
    const card = sourceIndex >= 0 && cardEnd >= 0 ? page.slice(sourceIndex, cardEnd) : "";

    requireText(card, name, failures, `${name} card label`);
    requireText(card, metric, failures, `${name} card metric`);
    requireText(card, sourcePath, failures, `${name} card source`);
    requireText(ledger, metric, failures, `${name} ledger metric`);
  }

  requireText(style, ".rtl-hero", failures, "RTL page styles");
  requireText(style, "@media (max-width: 720px)", failures, "mobile styles");
  requireText(style, "prefers-reduced-motion", failures, "motion preference");
  requireText(home, 'href="./rtl-optimization/"', failures, "home entry point");
  requireText(contact, 'href="../rtl-optimization/"', failures, "contact entry point");
  requireText(contact, "Start an RTL/PPA enquiry", failures, "direct contact action");
  requireText(sitemap, "https://www.gotherlabs.com/rtl-optimization/", failures, "sitemap");
  requireText(ledger, "Reviewed release: `v2.2.2`", failures, "claim ledger release");
  requireText(
    ledger,
    "8cd8b479488f0693d76c2fab39eabf4bd6f9279c",
    failures,
    "claim ledger source commit",
  );

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
