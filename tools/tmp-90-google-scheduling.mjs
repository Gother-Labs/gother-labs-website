#!/usr/bin/env node
import fs from "node:fs/promises";

const BOOKING_URL = "https://calendar.app.google/Pcy2iSnJ4BL98of76";

function replaceFirst(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Missing ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const rtlPath = "rtl-optimization/index.html";
let rtl = await fs.readFile(rtlPath, "utf8");

const rtlMailto = 'href="mailto:contact@gotherlabs.com?subject=RTL%2FPPA%20pilot%20inquiry&amp;body=Block%20function%3A%0ATarget%3A%20ASIC%20%2F%20FPGA%20%2F%20exploratory%0ACurrent%20implementation%20flow%3A%0APrimary%20objective%3A%0AAvailable%20functional%20and%20formal%20checks%3A%0AConfidentiality%20constraints%3A%0ADesired%20evaluation%20window%3A%0A%0APlease%20do%20not%20attach%20confidential%20RTL%20to%20this%20first%20message."';

rtl = replaceFirst(
  rtl,
  `${rtlMailto}\n              >Evaluate one RTL block</a>`,
  `href="${BOOKING_URL}"\n              >Book technical scoping</a>`,
  "RTL hero scheduling action",
);

rtl = replaceOnce(
  rtl,
  '<p class="rtl-hero-note">One owned block. Your flow. Evidence before adoption.</p>',
  '<p class="rtl-hero-note">One owned block. Your flow. Evidence before adoption. Prefer async? <a href="mailto:contact@gotherlabs.com">Email Göther</a>.</p>',
  "RTL hero async fallback",
);

await fs.writeFile(rtlPath, rtl, "utf8");

const contactPath = "contact/index.html";
let contact = await fs.readFile(contactPath, "utf8");

const contactMailtoHref = 'mailto:contact@gotherlabs.com?subject=RTL%2FPPA%20pilot%20inquiry&amp;body=Block%20function%20and%20ownership%3A%0ATarget%3A%20ASIC%20%2F%20FPGA%20%2F%20exploratory%0ACurrent%20implementation%20flow%3A%0APrimary%20objective%3A%0AAvailable%20functional%20and%20formal%20checks%3A%0ADesired%20evaluation%20window%3A%0A%0APlease%20do%20not%20attach%20confidential%20RTL%20to%20this%20first%20message.';

const oldContactActions = `<a class="studio-link" href="${contactMailtoHref}">Start an RTL/PPA enquiry <span aria-hidden="true">↗</span></a><a class="studio-link studio-link--quiet" href="../rtl-optimization/">Read about the pilot <span aria-hidden="true">→</span></a>`;
const newContactActions = `<a class="studio-link" href="${BOOKING_URL}">Book 30-minute technical scoping <span aria-hidden="true">↗</span></a><a class="studio-link studio-link--quiet" href="${contactMailtoHref}">Prefer email? Start an RTL/PPA enquiry <span aria-hidden="true">→</span></a><a class="studio-link studio-link--quiet" href="../rtl-optimization/">Read about the pilot <span aria-hidden="true">→</span></a>`;

contact = replaceOnce(contact, oldContactActions, newContactActions, "Contact RTL scheduling actions");
await fs.writeFile(contactPath, contact, "utf8");

const checkPath = "tools/check-rtl-page.mjs";
let check = await fs.readFile(checkPath, "utf8");
check = replaceOnce(
  check,
  '  requireText(page, "../results/verified-rtl-optimization/", failures, "canonical Results evidence entry point");',
  '  requireText(page, "../results/verified-rtl-optimization/", failures, "canonical Results evidence entry point");\n  requireText(page, "https://calendar.app.google/Pcy2iSnJ4BL98of76", failures, "RTL scheduling entry point");\n  requireText(page, "Book technical scoping", failures, "RTL scheduling action");',
  "RTL checker scheduling route",
);
check = replaceOnce(
  check,
  '  requireText(contact, "Start an RTL/PPA enquiry", failures, "direct contact action");',
  '  requireText(contact, "Start an RTL/PPA enquiry", failures, "direct contact action");\n  requireText(contact, "https://calendar.app.google/Pcy2iSnJ4BL98of76", failures, "contact scheduling entry point");\n  requireText(contact, "Book 30-minute technical scoping", failures, "contact scheduling action");',
  "Contact checker scheduling route",
);
await fs.writeFile(checkPath, check, "utf8");

console.log("Prepared #90 Google technical-scoping scheduling links.");
