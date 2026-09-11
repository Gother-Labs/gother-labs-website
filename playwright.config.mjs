import { defineConfig } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
    },
  },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  use: {
    baseURL: BASE_URL,
    locale: "en-GB",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tools/preview.mjs 4173",
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
    env: {
      ...process.env,
      GOTHER_SITE_ROOT: "_site",
    },
  },
  projects: [
    {
      name: "desktop-light",
      use: {
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
        reducedMotion: "reduce",
      },
    },
    {
      name: "laptop-dark",
      use: {
        viewport: { width: 1280, height: 800 },
        colorScheme: "dark",
        reducedMotion: "reduce",
      },
    },
    {
      name: "mobile-light-reduced",
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        reducedMotion: "reduce",
      },
    },
    {
      name: "mobile-dark-reduced",
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        reducedMotion: "reduce",
      },
    },
    {
      name: "normal-motion-smoke",
      use: {
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
        reducedMotion: "no-preference",
      },
    },
  ],
});
