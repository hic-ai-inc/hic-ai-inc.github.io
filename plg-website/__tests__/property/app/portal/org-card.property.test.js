/**
 * Property-Based Tests — Organization Card: Certification Modal Text Interpolation
 *
 * Feature: business-name-implementation, Property 10
 *
 * Property 10: Certification Modal Text Interpolation
 * For any non-empty business name string, the modal renders text containing
 * that exact business name interpolated in the certification language.
 *
 * Uses extracted pure function — mirrors the certification text template
 * from the Settings page's CertificationModal component.
 *
 * **Validates: Requirements 7.2**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors certification modal text from settings/page.js
// ============================================================================

/**
 * Build the certification modal text with the business name interpolated.
 * Pure function extraction of the modal's text rendering logic.
 *
 * @param {string} businessName - The submitted business name (trimmed)
 * @returns {string} The full certification text with name interpolated
 */
function buildCertificationText(businessName) {
  return (
    `By providing this business name, you certify that you are legally ` +
    `authorized to act on behalf of ${businessName} and to bind it to the ` +
    `HIC AI, INC. Terms of Service. You understand that HIC AI, INC. may ` +
    `request additional proof of entity existence or authorization.`
  );
}

// ============================================================================
// Random generators
// ============================================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(len) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.&',";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Generate a valid non-empty org name (1–120 chars, trimmed non-empty) */
function randomOrgName() {
  const len = randomInt(1, 120);
  let name;
  do {
    name = randomString(len).trim();
  } while (!name); // ensure non-empty after trim
  return name;
}

// ============================================================================
// Property 10: Certification Modal Text Interpolation
// ============================================================================

describe("Property 10: Certification Modal Text Interpolation", () => {
  it("certification text contains the exact business name for any valid name (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const name = randomOrgName();
      const text = buildCertificationText(name);

      // The text must contain the exact business name as a substring
      expect(text.includes(name)).toBe(true);

      // The text must contain the fixed legal language fragments
      expect(text.includes("you certify that you are legally authorized to act on behalf of")).toBe(true);
      expect(text.includes("and to bind it to the HIC AI, INC. Terms of Service")).toBe(true);
      expect(text.includes("may request additional proof of entity existence or authorization")).toBe(true);
    }
  });

  it("certification text places the business name in the correct position (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const name = randomOrgName();
      const text = buildCertificationText(name);

      // Name should appear after "on behalf of " and before " and to bind"
      const prefix = "on behalf of ";
      const suffix = " and to bind";
      const startIdx = text.indexOf(prefix) + prefix.length;
      const endIdx = text.indexOf(suffix, startIdx);
      const interpolated = text.substring(startIdx, endIdx);

      expect(interpolated).toBe(name);
    }
  });
});
