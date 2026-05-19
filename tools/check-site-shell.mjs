#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const SHELL_VERSION = "nav-wordmark-v1";

const REDIRECT_EXCEPTIONS = new Set(["careers/index.html"]);
const HOME_PAGE = "index.html";
const FOOTER_OPTIONAL = new Set(["index.html", "404.html"]);
const METADATA_OPTIONAL = new Set(["404.html", "evolther/index.html"]);

const requiredNavLabels = ["Company", "Results", "Contact"];

async function collectHtmlFiles(dir = SITE_ROOT) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === ".git") continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "index.html") {
      files.push(fullPath);
    }

    if (entry.isFile() && entry.name === "404.html") {
      files.push(fullPath);
    }
  }

  return files;
}

function toSitePath(filePath) {
  return path.relative(SITE_ROOT, filePath).split(path.sep).join("/");
}

function hasAll(html, needles) {
  return needles.every((needle) => html.includes(needle));
}

function assert(condition, failures, route, message) {
  if (!condition) {
    failures.push(`${route}: ${message}`);
  }
}

function checkSharedAssets(html, failures, route) {
  assert(
    html.includes(`/assets/fonts/inter-latin.woff2`) && html.includes(`as="font"`) && html.includes(`crossorigin`),
    failures,
    route,
    "missing Inter font preload",
  );
  assert(html.includes(`assets/gother-mark.svg`) && html.includes(`rel="icon"`), failures, route, "missing favicon");
  assert(
    html.includes(`styles.css?v=${SHELL_VERSION}`),
    failures,
    route,
    `missing shared stylesheet version ${SHELL_VERSION}`,
  );
  assert(
    html.includes(`scripts.js?v=${SHELL_VERSION}`),
    failures,
    route,
    `missing shared script version ${SHELL_VERSION}`,
  );
}

function checkNav(html, failures, route, { home = false } = {}) {
  assert(html.includes(`class="site-header"`), failures, route, "missing site header");
  assert(html.includes(`class="site-nav"`) && html.includes(`aria-label="Primary"`), failures, route, "missing primary nav");

  if (!home) {
    assert(html.includes(`nav-home-wordmark`), failures, route, "missing nav home wordmark");
    assert(html.includes(`nav-wordmark-text`), failures, route, "missing nav wordmark text");
    assert(html.includes(`class="nav-links"`), failures, route, "missing nav links wrapper");
  }

  for (const label of requiredNavLabels) {
    assert(new RegExp(`<a\\s[^>]*>${label}</a>`).test(html), failures, route, `missing ${label} nav link`);
  }
}

function checkFooter(html, failures, route) {
  if (FOOTER_OPTIONAL.has(route)) return;

  assert(html.includes(`class="site-footer"`), failures, route, "missing site footer");
}

function checkMetadata(html, failures, route) {
  assert(html.includes(`<title>`), failures, route, "missing title");
  assert(html.includes(`name="description"`), failures, route, "missing description metadata");

  if (METADATA_OPTIONAL.has(route) || route.endsWith("/run/index.html")) {
    assert(html.includes(`name="robots"`) && html.includes(`noindex`), failures, route, "metadata exception must be noindex");
    return;
  }

  assert(html.includes(`rel="canonical"`), failures, route, "missing canonical URL");
  assert(html.includes(`property="og:title"`), failures, route, "missing Open Graph title");
  assert(html.includes(`property="og:description"`), failures, route, "missing Open Graph description");
  assert(html.includes(`property="og:url"`), failures, route, "missing Open Graph URL");
  assert(html.includes(`property="og:image"`), failures, route, "missing Open Graph image");
  assert(html.includes(`name="twitter:card"`) && html.includes(`summary_large_image`), failures, route, "missing Twitter card metadata");
  assert(html.includes(`name="twitter:image"`), failures, route, "missing Twitter image metadata");
}

async function main() {
  const htmlFiles = (await collectHtmlFiles()).map(toSitePath).sort();
  const failures = [];

  for (const route of htmlFiles) {
    if (REDIRECT_EXCEPTIONS.has(route)) continue;

    const html = await fs.readFile(path.join(SITE_ROOT, route), "utf8");
    const home = route === HOME_PAGE;

    assert(html.startsWith("<!doctype html>"), failures, route, "missing HTML doctype");
    assert(html.includes(`id="site-main"`) || route.endsWith("/run/index.html"), failures, route, "missing site-main anchor");

    checkMetadata(html, failures, route);
    checkSharedAssets(html, failures, route);
    checkNav(html, failures, route, { home });
    checkFooter(html, failures, route);

    if (route.startsWith("results/") && route.endsWith("/index.html")) {
      assert(
        hasAll(html, [`nav-home-wordmark`, `nav-wordmark-text`, `Company`, `Results`, `Contact`]),
        failures,
        route,
        "generated result shell is not aligned with shared navigation",
      );
    }
  }

  if (failures.length > 0) {
    console.error("Shared site shell check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Shared site shell check passed for ${htmlFiles.length - REDIRECT_EXCEPTIONS.size} HTML files.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
