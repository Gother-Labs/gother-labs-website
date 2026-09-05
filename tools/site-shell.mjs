// Shared primitives for generated shell output and shell validation.
// Hand-authored HTML remains committed directly; keep this boundary small.
export const SITE_SHELL_VERSION = "editorial-v7";

export const SHARED_SITE_SHELL = Object.freeze({
  version: SITE_SHELL_VERSION,
  fontPreloadHref: "/assets/fonts/inter-latin.woff2",
  faviconPath: "assets/gother-mark.svg",
  stylesheetPath: "styles.css",
  scriptPath: "scripts.js",
  navLinks: Object.freeze([
    ["results/", "Results"],
    ["company/", "Company"],
    ["contact/", "Contact"],
  ]),
});

export const REQUIRED_NAV_LABELS = SHARED_SITE_SHELL.navLinks.map(([_href, label]) => label);

export function versionedSharedAsset(prefix, assetPath) {
  return `${prefix}${assetPath}?v=${SHARED_SITE_SHELL.version}`;
}

export function sharedStylesheetTag(prefix) {
  return `<link rel="stylesheet" href="${versionedSharedAsset(prefix, SHARED_SITE_SHELL.stylesheetPath)}">\n    <link rel="stylesheet" href="${prefix}assets/studio.css?v=${SITE_SHELL_VERSION}">`;
}

export function sharedScriptTag(prefix) {
  return `<script src="${versionedSharedAsset(prefix, SHARED_SITE_SHELL.scriptPath)}"></script>\n    <script src="${prefix}assets/studio.js?v=${SITE_SHELL_VERSION}"></script>`;
}

export function sharedFaviconTag(prefix) {
  return `<link rel="icon" href="${prefix}${SHARED_SITE_SHELL.faviconPath}" type="image/svg+xml">`;
}

export function sharedFontPreloadTag() {
  return `<link rel="preload" href="${SHARED_SITE_SHELL.fontPreloadHref}" as="font" type="font/woff2" crossorigin>`;
}

export function sharedNav(prefix) {
  const links = SHARED_SITE_SHELL.navLinks
    .map(([href, label]) => `<a href="${prefix}${href}">${label}</a>`)
    .join("\n            ");

  return `<header class="site-header">
        <nav class="site-nav" aria-label="Primary">
          <a class="brand nav-brand nav-home-wordmark animated-symbol-scope" href="${prefix}" aria-label="Göther Labs home">
            <span class="wordmark-mark-wrap" aria-hidden="true"><svg class="animated-reference-geometry live-symbol-svg" viewBox="6 18 56 56" focusable="false"><g class="source-geometry"><circle class="source-geometry-dot" cx="34.5" cy="34.5" r="3.6"/><circle class="source-geometry-dot" cx="21" cy="58" r="3.6"/><circle class="source-geometry-dot" cx="48" cy="58" r="3.6"/></g><path class="live-trail" d=""/><path class="live-trail" d=""/><path class="live-trail" d=""/><circle class="geometry-dot live-geometry-dot" cx="34.5" cy="34.5" r="3.6"/><circle class="geometry-dot live-geometry-dot" cx="21" cy="58" r="3.6"/><circle class="geometry-dot live-geometry-dot" cx="48" cy="58" r="3.6"/></svg></span>
            <span class="nav-wordmark-text">Göther Labs</span>
          </a>
          <div class="nav-links">
            ${links}
          </div>
        </nav>
      </header>`;
}

export function sharedFooter() {
  return `<footer class="site-footer">
        <p>© <span id="year">2026</span> Göther Labs</p>
      </footer>`;
}

export function normalizeCopiedRunShell(html, prefix) {
  return html
    .replace(
      /<link rel="stylesheet" href="\.\.\/\.\.\/\.\.\/styles\.css(?:\?v=[^"]*)?">/,
      sharedStylesheetTag(prefix),
    )
    .replace(/<header class="site-header">[\s\S]*?<\/header>/, sharedNav(prefix))
    .replace(
      /<script src="\.\.\/\.\.\/\.\.\/scripts\.js(?:\?v=[^"]*)?"><\/script>/,
      sharedScriptTag(prefix),
    );
}
