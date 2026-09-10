#!/usr/bin/env node
import fs from "node:fs/promises";

const RESULTS_SHA = "ff2c6388c3b20f3a8aa8b5b0a898079a94d8b187";
const RESULT_ROOT = "./results/verified-rtl-optimization/";

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

// Pin the canonical Results source.
const lockPath = "tools/generated-results.lock.json";
const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
lock.commit = RESULTS_SHA;
await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

// The Result itself should open as a technical publication, without a category eyebrow.
const syncPath = "tools/sync-results.mjs";
let sync = await fs.readFile(syncPath, "utf8");
sync = replaceOnce(
  sync,
  '        ? `        <section class="hero compact-hero page-hero result-detail-hero verified-rtl-detail-hero">\n          <p class="eyebrow">${escapeHtml(full.domain)}</p>\n          <h1 class="page-title">${escapeHtml(full.title)}</h1>',
  '        ? `        <section class="hero compact-hero page-hero result-detail-hero verified-rtl-detail-hero">\n          <h1 class="page-title">${escapeHtml(full.title)}</h1>',
  "verified RTL hero category eyebrow",
);
await fs.writeFile(syncPath, sync, "utf8");

// Home: keep pilot and evidence actions distinct; the selected case lands inside the canonical Result.
const homePath = "index.html";
let home = await fs.readFile(homePath, "utf8");
home = replaceOnce(
  home,
  '<a class="studio-link" data-rtl-source href="https://github.com/juan-fernandez-gotherlabs/rtl-optimization-case-study/tree/7ee35dcf022d4ed590a55731ea643f17c648a8d1/cases/mlkem-cbd">Read the case and its limits <span aria-hidden="true">↗</span></a>',
  '<a class="studio-link" data-rtl-source href="./results/verified-rtl-optimization/#rtl-mlkem">Read this case in Results <span aria-hidden="true">→</span></a>',
  "home RTL evidence action",
);
await fs.writeFile(homePath, home, "utf8");

const studioPath = "assets/studio.js";
let studio = await fs.readFile(studioPath, "utf8");
studio = replaceOnce(
  studio,
  "      sha1: { slug: 'sha1', pool: '64 certification seeds · SHA-1', reference: 'Relative to the baseline median.' },\n      int8: { slug: 'int8-matvec', pool: '64 held-out pairs · INT8 MatVec', reference: 'Relative to the baseline geometric aggregate.' },\n      mlkem: { slug: 'mlkem-cbd', pool: '64 publication pairs · ML-KEM CBD', reference: 'Relative to the baseline geometric aggregate.' },",
  "      sha1: { slug: 'sha1', resultAnchor: 'rtl-sha1', pool: '64 certification seeds · SHA-1', reference: 'Relative to the baseline median.' },\n      int8: { slug: 'int8-matvec', resultAnchor: 'rtl-matvec', pool: '64 held-out pairs · INT8 MatVec', reference: 'Relative to the baseline geometric aggregate.' },\n      mlkem: { slug: 'mlkem-cbd', resultAnchor: 'rtl-mlkem', pool: '64 publication pairs · ML-KEM CBD', reference: 'Relative to the baseline geometric aggregate.' },",
  "home RTL case mapping",
);
studio = replaceOnce(
  studio,
  "        study.closest('.studio-offer').querySelector('[data-rtl-source]').href = `https://github.com/juan-fernandez-gotherlabs/rtl-optimization-case-study/tree/7ee35dcf022d4ed590a55731ea643f17c648a8d1/cases/${result.slug}`;",
  "        study.closest('.studio-offer').querySelector('[data-rtl-source]').href = `./results/verified-rtl-optimization/#${result.resultAnchor}`;",
  "home dynamic RTL evidence route",
);
await fs.writeFile(studioPath, studio, "utf8");

// Pilot: the Göther Result is the primary evidence layer; case cards deep-link into it.
const rtlPath = "rtl-optimization/index.html";
let rtl = await fs.readFile(rtlPath, "utf8");
rtl = replaceOnce(
  rtl,
  'href="https://github.com/juan-fernandez-gotherlabs/rtl-optimization-case-study/tree/v2.2.2#results-at-a-glance"\n                target="_blank"\n                rel="noreferrer"\n              >See public results</a>',
  'href="../results/verified-rtl-optimization/"\n              >Read the verified Result</a>',
  "pilot hero evidence action",
);
rtl = replaceOnce(rtl, '<a href="#public-evidence">Review the evidence</a>', '<a href="../results/verified-rtl-optimization/">Review the evidence</a>', "pilot proof-strip evidence action");
for (const [slug, anchor, label] of [
  ["sha1", "rtl-sha1", "Read SHA-1 in Results"],
  ["int8-matvec", "rtl-matvec", "Read MatVec in Results"],
  ["mlkem-cbd", "rtl-mlkem", "Read ML-KEM in Results"],
]) {
  rtl = replaceOnce(
    rtl,
    `href="https://github.com/juan-fernandez-gotherlabs/rtl-optimization-case-study/tree/v2.2.2/cases/${slug}"\n              target="_blank"\n              rel="noreferrer"`,
    `href="../results/verified-rtl-optimization/#${anchor}"`,
    `pilot ${slug} evidence card route`,
  );
  const oldLabels = {
    sha1: 'Inspect SHA-1 evidence <span aria-hidden="true">↗</span>',
    'int8-matvec': 'Inspect MatVec evidence <span aria-hidden="true">↗</span>',
    'mlkem-cbd': 'Inspect ML-KEM evidence <span aria-hidden="true">↗</span>',
  };
  rtl = replaceOnce(rtl, oldLabels[slug], `${label} <span aria-hidden="true">→</span>`, `pilot ${slug} card label`);
}
await fs.writeFile(rtlPath, rtl, "utf8");

// Release check: require the canonical Result and its case anchors rather than external GitHub as the primary route.
const checkPath = "tools/check-rtl-page.mjs";
let check = await fs.readFile(checkPath, "utf8");
check = replaceOnce(
  check,
  '  { name: "SHA-1 RTL", metric: "2.27%", sourcePath: "/tree/v2.2.2/cases/sha1" },\n  { name: "INT8 MatVec RTL", metric: "8.3230%", sourcePath: "/tree/v2.2.2/cases/int8-matvec" },\n  { name: "ML-KEM CBD RTL", metric: "9.7338%", sourcePath: "/tree/v2.2.2/cases/mlkem-cbd" },',
  '  { name: "SHA-1 RTL", metric: "2.27%", sourcePath: "../results/verified-rtl-optimization/#rtl-sha1" },\n  { name: "INT8 MatVec RTL", metric: "8.3230%", sourcePath: "../results/verified-rtl-optimization/#rtl-matvec" },\n  { name: "ML-KEM CBD RTL", metric: "9.7338%", sourcePath: "../results/verified-rtl-optimization/#rtl-mlkem" },',
  "RTL checker evidence card routes",
);
check = replaceOnce(check, 'requireText(page, "See public results", failures, "client-facing evidence action");', 'requireText(page, "Read the verified Result", failures, "client-facing evidence action");', "RTL checker hero copy");
check = replaceOnce(check, 'requireText(page, "/tree/v2.2.2#results-at-a-glance", failures, "versioned evidence entry point");', 'requireText(page, "../results/verified-rtl-optimization/", failures, "canonical Results evidence entry point");', "RTL checker primary evidence route");
check = replaceOnce(check, '  requireText(home, \'href="./rtl-optimization/"\', failures, "home entry point");', '  requireText(home, \'href="./rtl-optimization/"\', failures, "home commercial entry point");\n  requireText(home, \'href="./results/verified-rtl-optimization/#rtl-mlkem"\', failures, "home canonical evidence entry point");', "RTL checker home routes");
await fs.writeFile(checkPath, check, "utf8");

console.log(`Prepared final RTL evidence routing against Results ${RESULTS_SHA}`);
