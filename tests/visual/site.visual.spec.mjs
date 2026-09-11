import { expect, test } from "@playwright/test";

const BOOKING_URL = "https://calendar.app.google/Pcy2iSnJ4BL98of76";
const SCREENSHOT_PROJECTS = new Set([
  "desktop-light",
  "laptop-dark",
  "mobile-light-reduced",
  "mobile-dark-reduced",
]);

const routes = [
  { name: "home", path: "/", status: 200 },
  { name: "company", path: "/company/", status: 200 },
  { name: "contact", path: "/contact/", status: 200 },
  { name: "rtl-pilot", path: "/rtl-optimization/", status: 200 },
  { name: "results-index", path: "/results/", status: 200 },
  { name: "result-quadrature", path: "/results/quadrature-rule-optimization/", status: 200 },
  { name: "run-quadrature", path: "/results/quadrature-rule-optimization/run/", status: 200 },
  { name: "result-rtl", path: "/results/verified-rtl-optimization/", status: 200 },
  { name: "result-rcpsp", path: "/results/rcpsp-psplib-j30/", status: 200 },
  { name: "run-rcpsp", path: "/results/rcpsp-psplib-j30/run/", status: 200 },
  { name: "evolther", path: "/evolther/", status: 200 },
  { name: "missing-route", path: "/domains", status: 404 },
];

async function settlePage(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        if (typeof image.decode === "function") {
          await image.decode().catch(() => undefined);
        }
      }),
    );
  });
  await page.waitForTimeout(120);
}

async function assertBrowserHealth(page, route) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${route.name}: horizontal document overflow`).toBeLessThanOrEqual(1);

  const brokenImages = await page.locator("img").evaluateAll((images) =>
    images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src),
  );
  expect(brokenImages, `${route.name}: broken images`).toEqual([]);

  const navigation = await page.locator(".nav-links a").allTextContents();
  expect(navigation.map((item) => item.trim())).toEqual(["Results", "Company", "Contact"]);
}

for (const route of routes) {
  test(`${route.name} renders without browser regressions`, async ({ page }, testInfo) => {
    test.skip(!SCREENSHOT_PROJECTS.has(testInfo.project.name));

    const consoleErrors = [];
    const pageErrors = [];
    const badSameOriginResponses = [];

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      const expectedNavigation404 =
        route.status === 404 &&
        text.includes("Failed to load resource") &&
        text.includes("404");
      if (!expectedNavigation404) consoleErrors.push(text);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      const url = new URL(response.url());
      const expected = new URL(route.path, "http://127.0.0.1:4173");
      const isExpected404Document =
        route.status === 404 &&
        response.request().resourceType() === "document" &&
        url.origin === expected.origin &&
        url.pathname === expected.pathname;
      if (url.origin === expected.origin && response.status() >= 400 && !isExpected404Document) {
        badSameOriginResponses.push(`${response.status()} ${url.pathname}`);
      }
    });

    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    expect(response, `${route.name}: navigation response`).not.toBeNull();
    expect(response.status(), `${route.name}: document status`).toBe(route.status);

    await settlePage(page);
    await assertBrowserHealth(page, route);

    expect(pageErrors, `${route.name}: uncaught page errors`).toEqual([]);
    expect(consoleErrors, `${route.name}: console errors`).toEqual([]);
    expect(badSameOriginResponses, `${route.name}: missing or failing local assets`).toEqual([]);

    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: false,
    });
  });
}

test("home RTL evidence selector changes published case state", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "normal-motion-smoke");

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await settlePage(page);

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);

  const int8 = page.locator('[data-rtl-case="int8"]');
  await int8.click();
  await expect(int8).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-rtl-cloud]")).toHaveAttribute("src", /rtl-int8-matvec\.svg/);
  await expect(page.locator("[data-rtl-source]")).toHaveAttribute(
    "href",
    "./results/verified-rtl-optimization/#rtl-matvec",
  );

  expect(consoleErrors).toEqual([]);
});

test("commercial routes expose scheduling and asynchronous fallback", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "normal-motion-smoke");

  await page.goto("/rtl-optimization/", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Book technical scoping" })).toHaveAttribute(
    "href",
    BOOKING_URL,
  );
  await expect(page.getByRole("link", { name: /Email Göther/ })).toHaveAttribute(
    "href",
    "mailto:contact@gotherlabs.com",
  );

  await page.goto("/contact/", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Book 30-minute technical scoping" })).toHaveAttribute(
    "href",
    BOOKING_URL,
  );
  await expect(page.getByRole("link", { name: /Prefer email\? Start an RTL\/PPA enquiry/ })).toHaveAttribute(
    "href",
    /^mailto:contact@gotherlabs\.com/,
  );
});

test("representative keyboard targets inherit a visible non-obscured focus ring", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "normal-motion-smoke");

  for (const path of [
    "/",
    "/company/",
    "/contact/",
    "/rtl-optimization/",
    "/results/",
    "/results/verified-rtl-optimization/",
    "/evolther/",
  ]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await settlePage(page);

    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        return {
          tag: element?.tagName ?? "none",
          focusVisible: element?.matches?.(":focus-visible") ?? false,
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineOffset: Number.parseFloat(style.outlineOffset),
        };
      });

      expect(focus.focusVisible, `${path}: ${focus.tag} should match :focus-visible`).toBe(true);
      expect(focus.outlineStyle, `${path}: ${focus.tag} focus outline style`).toBe("solid");
      expect(focus.outlineWidth, `${path}: ${focus.tag} focus outline width`).toBeGreaterThanOrEqual(3);
      expect(focus.outlineOffset, `${path}: ${focus.tag} focus outline offset`).toBeGreaterThanOrEqual(3);
    }
  }
});
