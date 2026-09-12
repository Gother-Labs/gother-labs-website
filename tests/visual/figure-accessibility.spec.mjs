import { expect, test } from "@playwright/test";

const cases = [
  {
    path: "/results/iberian-bess-policy-challenge/run/",
    selectors: ["#dispatch-chart", "#score-chart"],
  },
  {
    path: "/results/qubit-routing-lightsabre/run/",
    selectors: ["#score-svg", "#circuit-svg", "#topology-svg"],
  },
  {
    path: "/results/rcpsp-psplib-j30/run/",
    selectors: ["#score-mini-svg", "#dispatch-svg", "#schedule-svg"],
  },
  {
    path: "/results/quadrature-rule-optimization/run/",
    selectors: ["#score-mini-svg", "#rule-svg"],
  },
  {
    path: "/results/circle-packing-26-unit-square/run/",
    selectors: ["#score-mini-svg", "#packing-svg", "#contact-svg"],
  },
];

test("evidence replay figures expose material textual alternatives", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "normal-motion-smoke");

  for (const entry of cases) {
    const response = await page.goto(entry.path, { waitUntil: "networkidle" });
    expect(response?.status(), `${entry.path}: document status`).toBe(200);

    for (const selector of entry.selectors) {
      const figure = page.locator(selector);
      await expect(figure, `${entry.path}: ${selector}`).toHaveAttribute("role", "img");
      const descriptionId = await figure.getAttribute("aria-describedby");
      expect(descriptionId, `${entry.path}: ${selector} aria-describedby`).toBeTruthy();

      const description = page.locator(`#${descriptionId}`);
      await expect(description, `${entry.path}: #${descriptionId}`).toHaveCount(1);
      const text = (await description.textContent())?.replace(/\s+/g, " ").trim() ?? "";
      expect(text.length, `${entry.path}: #${descriptionId} material summary`).toBeGreaterThanOrEqual(80);
    }
  }
});
