#!/usr/bin/env node
import fs from "node:fs/promises";

const RESULTS_SHA = "7bc3968eee42da2415864cef37f23960ec237a66";

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Ambiguous ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const lockPath = "tools/generated-results.lock.json";
const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
lock.commit = RESULTS_SHA;
await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

const homePath = "index.html";
let home = await fs.readFile(homePath, "utf8");
home = replaceOnce(home, "Explore all five studies", "Explore all six studies", "home study count");
await fs.writeFile(homePath, home, "utf8");

const syncPath = "tools/sync-results.mjs";
let sync = await fs.readFile(syncPath, "utf8");

const formatPercent = `function formatPercent(value) {
  return \`${"${formatMetric(value, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}"}%\`;
}
`;
const localAssets = `${formatPercent}
function localArticleAssetPaths(article) {
  const paths = [];
  for (const match of article.matchAll(/!\\[[^\\]\\n]*\\]\\((assets\\/[^)\\s]+)\\)/g)) {
    paths.push(match[1]);
  }
  return [...new Set(paths)];
}
`;
sync = replaceOnce(sync, formatPercent, localAssets, "local article asset helper insertion");

sync = replaceOnce(
  sync,
  "  const plots = full.artifacts?.plots ?? [];\n",
  "  const plots = full.artifacts?.plots ?? [];\n  const articleAssets = localArticleAssetPaths(article);\n",
  "article asset collection",
);
sync = replaceOnce(
  sync,
  "    ...plots,\n    ...(full.artifacts?.tolerance_certificates ?? []),\n",
  "    ...articleAssets,\n    ...plots,\n    ...(full.artifacts?.tolerance_certificates ?? []),\n",
  "article asset copy list",
);

const quadratureFallback = `  if (result.website?.card_visual !== "quadrature") return "";
`;
const rtlCard = `  if (result.website?.card_visual === "rtl-portfolio") {
    return \`<svg class="result-card-visual result-card-visual--rtl-portfolio" viewBox="0 0 560 330" aria-hidden="true" focusable="false">
                <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M48 272H512" opacity=".22" />
                  <path d="M187 56V276M373 56V276" opacity=".16" />
                  <g transform="translate(56 76)">
                    <text x="0" y="0" fill="currentColor" stroke="none" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="650" letter-spacing="1.2">BOOLEAN</text>
                    <circle cx="30" cy="88" r="20" />
                    <circle cx="104" cy="62" r="20" />
                    <path d="M48 80L85 68M48 96L88 126M104 82V126" />
                    <circle cx="104" cy="142" r="20" stroke="var(--accent)" stroke-width="2.2" />
                    <path d="M93 142H115M104 131V153" stroke="var(--accent)" stroke-width="2.2" />
                  </g>
                  <g transform="translate(210 76)">
                    <text x="0" y="0" fill="currentColor" stroke="none" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="650" letter-spacing="1.2">ARITHMETIC</text>
                    <path d="M12 54H112M22 54V82M52 54V82M82 54V82M112 54V82" />
                    <path d="M22 82L42 112M52 82L42 112M82 82L102 112M112 82L102 112" />
                    <path d="M42 112L72 148M102 112L72 148M72 148V176" stroke="var(--accent)" stroke-width="2.2" />
                    <circle cx="72" cy="148" r="5" fill="var(--accent)" stroke="none" />
                  </g>
                  <g transform="translate(396 76)">
                    <text x="0" y="0" fill="currentColor" stroke="none" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="650" letter-spacing="1.2">STATE</text>
                    <rect x="0" y="54" width="108" height="42" rx="2" />
                    <path d="M12 68H94M12 82H94" opacity=".45" />
                    <path d="M54 96V126" />
                    <rect x="28" y="126" width="52" height="30" rx="15" stroke="var(--accent)" stroke-width="2.2" />
                    <text x="54" y="146" text-anchor="middle" fill="var(--accent)" stroke="none" font-family="Inter,Arial,sans-serif" font-size="10" font-weight="700">+ phase</text>
                    <path d="M54 156V178" stroke="var(--accent)" stroke-width="2.2" />
                  </g>
                </g>
              </svg>\`;
  }

${quadratureFallback}`;
sync = replaceOnce(sync, quadratureFallback, rtlCard, "RTL card visual");

const indexCopy = `            Five studies. The problem, the result, and the evidence behind it.
            <a class="studio-link" href="../rtl-optimization/#public-evidence">Explore the three RTL/PPA cases <span aria-hidden="true">↗</span></a>`;
sync = replaceOnce(
  sync,
  indexCopy,
  "            Six studies. The problem, the result, and the evidence behind it.",
  "results index study count",
);

sync = replaceOnce(
  sync,
  `  const isCirclePackingWhitepaper = full.slug === "circle-packing-26-unit-square";\n`,
  `  const isCirclePackingWhitepaper = full.slug === "circle-packing-26-unit-square";\n  const isVerifiedRtlWhitepaper = full.slug === "verified-rtl-optimization";\n`,
  "RTL whitepaper discriminator",
);

const genericBodyMarker = `    : \`        <section class="hero compact-hero page-hero result-detail-hero">`;
const rtlBody = `      : isVerifiedRtlWhitepaper
        ? \`        <section class="hero compact-hero page-hero result-detail-hero verified-rtl-detail-hero">
          <p class="eyebrow">\${escapeHtml(full.domain)}</p>
          <h1 class="page-title">\${escapeHtml(full.title)}</h1>
          <p class="intro results-hero-intro">\${escapeHtml(full.summary)}</p>
        </section>

        <section class="result-detail result-whitepaper-shell verified-rtl-whitepaper-shell">
          <article class="result-article result-whitepaper verified-rtl-whitepaper">
\${markdownToHtml(articleWithoutTitle(article), {}, markdownOptions)}
          </article>
        </section>\`
${genericBodyMarker}`;
sync = replaceOnce(sync, genericBodyMarker, rtlBody, "RTL whitepaper body");

const bodyClassMarker = `            : isCirclePackingWhitepaper
              ? "result-circle-packing-page"
              : "",`;
const bodyClassReplacement = `            : isCirclePackingWhitepaper
              ? "result-circle-packing-page"
              : isVerifiedRtlWhitepaper
                ? "result-verified-rtl-page"
                : "",`;
sync = replaceOnce(sync, bodyClassMarker, bodyClassReplacement, "RTL body class");

await fs.writeFile(syncPath, sync, "utf8");
console.log(`Prepared #148 source integration against Results ${RESULTS_SHA}`);
