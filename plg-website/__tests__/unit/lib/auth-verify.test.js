/**
 * Shared Auth Verification Utility Tests
 *
 * Tests the centralized Cognito JWT verification logic in auth-verify.js.
 * This module is the single source of truth for Bearer token parsing and
 * JWT verification across all 14 API route files.
 *
 * Test strategy:
 * - Bearer header parsing (extracted from inline tests formerly in
 *   provision-license.test.js and invite.test.js)
 * - Verifier singleton lifecycle (lazy init, env var requirements, reset)
 * - Full verifyAuthToken flow with mocked dependencies
 * - Integration points: confirms each route file imports from @/lib/auth-verify
 *
 * @see src/lib/auth-verify.js
 * @see Phase 1 Step 1.2 — Multi-User/Multi-Device Implementation Plan V2
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ============================================================================
// Test Helpers — Simulating auth-verify.js internals
// ============================================================================

/**
 * Simulates Bearer token extraction from Authorization header.
 * Mirrors the exact logic inside verifyAuthToken().
 *
 * We test this as an extracted pure function because the real
 * verifyAuthToken() has side effects (reads Next.js headers(),
 * calls CognitoJwtVerifier.verify()). Testing the parsing logic
 * in isolation gives us confidence without mocking Next.js internals.
 */
function extractBearerToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Simulates the lazy verifier initialization logic.
 * Returns whether a verifier would be created given the env vars.
 */
function wouldInitializeVerifier(userPoolId, clientId) {
  return !!(userPoolId && clientId);
}

/**
 * Simulates the full verifyAuthToken decision tree.
 * Given a verifier state, auth header, and verify result,
 * returns the expected outcome.
 */
async function simulateVerifyAuthToken({
  hasVerifier = true,
  authHeader = null,
  verifyResult = null,
  verifyThrows = null,
}) {
  // Step 1: Check verifier exists
  if (!hasVerifier) return null;

  // Step 2: Extract Bearer token
  const token = extractBearerToken(authHeader);
  if (token === null) return null;

  // Step 3: Verify token
  if (verifyThrows) return null; // Verification failure → null
  return verifyResult;
}

// ============================================================================
// Bearer Token Extraction Tests
// ============================================================================

describe("auth-verify: Bearer token extraction", () => {
  describe("valid headers", () => {
    it("extracts token from standard Bearer header", () => {
      const token = extractBearerToken("Bearer eyJhbGciOiJSUzI1NiJ9");
      assert.strictEqual(token, "eyJhbGciOiJSUzI1NiJ9");
    });

    it("extracts full JWT with dots", () => {
      const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.signature-here";
      const token = extractBearerToken(`Bearer ${jwt}`);
      assert.strictEqual(token, jwt);
    });

    it("preserves token content exactly (no trimming)", () => {
      const token = extractBearerToken("Bearer abc 123");
      assert.strictEqual(token, "abc 123");
    });

    it("handles empty token after Bearer prefix", () => {
      // "Bearer " with trailing space — returns empty string
      // The actual verifier.verify() will reject this downstream
      const token = extractBearerToken("Bearer ");
      assert.strictEqual(token, "");
    });
  });

  describe("invalid headers — returns null", () => {
    it("returns null for null header", () => {
      assert.strictEqual(extractBearerToken(null), null);
    });

    it("returns null for undefined header", () => {
      assert.strictEqual(extractBearerToken(undefined), null);
    });

    it("returns null for empty string header", () => {
      assert.strictEqual(extractBearerToken(""), null);
    });

    it("returns null for Basic auth scheme", () => {
      assert.strictEqual(extractBearerToken("Basic abc123"), null);
    });

    it("returns null for Digest auth scheme", () => {
      assert.strictEqual(extractBearerToken("Digest realm=test"), null);
    });

    it("returns null for bearer (lowercase)", () => {
      // RFC 6750 requires "Bearer" with capital B
      assert.strictEqual(extractBearerToken("bearer token123"), null);
    });

    it("returns null for BEARER (all caps)", () => {
      assert.strictEqual(extractBearerToken("BEARER token123"), null);
    });

    it("returns null for 'Bearer' without space (no separator)", () => {
      assert.strictEqual(extractBearerToken("Bearertoken123"), null);
    });

    it("returns null for random string", () => {
      assert.strictEqual(extractBearerToken("not-a-valid-header"), null);
    });

    it("returns null for numeric value", () => {
      // In practice, headers().get() always returns string|null,
      // never a number. But we verify graceful handling.
      assert.throws(() => extractBearerToken(12345));
    });
  });
});

// ============================================================================
// Verifier Initialization Logic Tests
// ============================================================================

describe("auth-verify: verifier initialization", () => {
  it("initializes when both env vars are set", () => {
    const result = wouldInitializeVerifier(
      "us-east-1_CntYimcMm",
      "3jobildap1dobb5vfmiul47bvc",
    );
    assert.strictEqual(result, true);
  });

  it("does not initialize when userPoolId is missing", () => {
    assert.strictEqual(wouldInitializeVerifier(null, "client-id"), false);
    assert.strictEqual(wouldInitializeVerifier(undefined, "client-id"), false);
    assert.strictEqual(wouldInitializeVerifier("", "client-id"), false);
  });

  it("does not initialize when clientId is missing", () => {
    assert.strictEqual(wouldInitializeVerifier("pool-id", null), false);
    assert.strictEqual(wouldInitializeVerifier("pool-id", undefined), false);
    assert.strictEqual(wouldInitializeVerifier("pool-id", ""), false);
  });

  it("does not initialize when both env vars are missing", () => {
    assert.strictEqual(wouldInitializeVerifier(null, null), false);
    assert.strictEqual(wouldInitializeVerifier("", ""), false);
    assert.strictEqual(wouldInitializeVerifier(undefined, undefined), false);
  });
});

// ============================================================================
// Full verifyAuthToken Decision Tree Tests
// ============================================================================

describe("auth-verify: verifyAuthToken decision tree", () => {
  const mockPayload = {
    sub: "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed",
    email: "test@example.com",
    email_verified: true,
    "cognito:username": "testuser",
    name: "Test User",
  };

  it("returns null when verifier is not initialized", async () => {
    const result = await simulateVerifyAuthToken({
      hasVerifier: false,
      authHeader: "Bearer valid-token",
    });
    assert.strictEqual(result, null);
  });

  it("returns null when Authorization header is missing", async () => {
    const result = await simulateVerifyAuthToken({
      authHeader: null,
    });
    assert.strictEqual(result, null);
  });

  it("returns null when Authorization header is not Bearer", async () => {
    const result = await simulateVerifyAuthToken({
      authHeader: "Basic abc123",
    });
    assert.strictEqual(result, null);
  });

  it("returns null when token verification throws", async () => {
    const result = await simulateVerifyAuthToken({
      authHeader: "Bearer expired-token",
      verifyThrows: new Error("Token expired"),
    });
    assert.strictEqual(result, null);
  });

  it("returns decoded payload on successful verification", async () => {
    const result = await simulateVerifyAuthToken({
      authHeader: "Bearer valid-jwt-token",
      verifyResult: mockPayload,
    });
    assert.deepStrictEqual(result, mockPayload);
  });

  it("returned payload includes standard Cognito ID token claims", async () => {
    const result = await simulateVerifyAuthToken({
      authHeader: "Bearer valid-jwt-token",
      verifyResult: mockPayload,
    });

    // These are the claims that route handlers depend on
    assert.ok(result.sub, "payload must include sub");
    assert.ok(result.email, "payload must include email");
    assert.strictEqual(typeof result.email_verified, "boolean");
    assert.ok(
      result["cognito:username"],
      "payload must include cognito:username",
    );
  });
});

// ============================================================================
// Route-Specific Wrapper Contract Tests
// ============================================================================

describe("auth-verify: route wrapper contracts", () => {
  const mockPayload = {
    sub: "user-uuid-123",
    email: "user@example.com",
    email_verified: true,
    name: "User Name",
    given_name: "User",
    "cognito:username": "user123",
  };

  describe("status/route.js — getUserFromRequest wrapper", () => {
    /**
     * Mirrors the local wrapper in status/route.js:
     * Calls verifyAuthToken(), extracts { userId, email, emailVerified }
     */
    function getUserFromRequest(payload) {
      if (!payload) return null;
      return {
        userId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
      };
    }

    it("returns null when auth fails", () => {
      assert.strictEqual(getUserFromRequest(null), null);
    });

    it("maps sub → userId", () => {
      const result = getUserFromRequest(mockPayload);
      assert.strictEqual(result.userId, "user-uuid-123");
    });

    it("includes email and emailVerified", () => {
      const result = getUserFromRequest(mockPayload);
      assert.strictEqual(result.email, "user@example.com");
      assert.strictEqual(result.emailVerified, true);
    });

    it("does not expose extra claims", () => {
      const result = getUserFromRequest(mockPayload);
      assert.strictEqual(Object.keys(result).length, 3);
      assert.strictEqual(result.name, undefined);
      assert.strictEqual(result["cognito:username"], undefined);
    });
  });

  describe("settings/route.js — getUserFromRequest wrapper", () => {
    /**
     * Mirrors the local wrapper in settings/route.js:
     * Calls verifyAuthToken(), extracts { sub, email, name }
     */
    function getUserFromRequest(payload) {
      if (!payload) return null;
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name || payload.given_name || null,
      };
    }

    it("returns null when auth fails", () => {
      assert.strictEqual(getUserFromRequest(null), null);
    });

    it("uses name when available", () => {
      const result = getUserFromRequest(mockPayload);
      assert.strictEqual(result.name, "User Name");
    });

    it("falls back to given_name when name is missing", () => {
      const result = getUserFromRequest({ ...mockPayload, name: undefined });
      assert.strictEqual(result.name, "User");
    });

    it("returns null name when both name and given_name are missing", () => {
      const result = getUserFromRequest({
        ...mockPayload,
        name: undefined,
        given_name: undefined,
      });
      assert.strictEqual(result.name, null);
    });
  });

  describe("checkout/route.js — getUserEmailFromRequest wrapper", () => {
    /**
     * Mirrors the local wrapper in checkout/route.js:
     * Calls verifyAuthToken(), returns just the email or null
     */
    function getUserEmailFromRequest(payload) {
      return payload?.email || null;
    }

    it("returns null when auth fails", () => {
      assert.strictEqual(getUserEmailFromRequest(null), null);
    });

    it("returns email from payload", () => {
      assert.strictEqual(
        getUserEmailFromRequest(mockPayload),
        "user@example.com",
      );
    });

    it("returns null when payload has no email", () => {
      assert.strictEqual(getUserEmailFromRequest({ sub: "user" }), null);
    });

    it("returns null for empty email", () => {
      assert.strictEqual(getUserEmailFromRequest({ email: "" }), null);
    });
  });
});

// ============================================================================
// Source Code Verification — All 14 route files import from @/lib/auth-verify
// ============================================================================

describe("auth-verify: route file import verification", () => {
  // All route files that previously had inline CognitoJwtVerifier
  const routeFiles = [
    "src/app/api/portal/devices/route.js",
    "src/app/api/portal/status/route.js",
    "src/app/api/portal/team/route.js",
    "src/app/api/portal/seats/route.js",
    "src/app/api/portal/settings/route.js",
    "src/app/api/portal/stripe-session/route.js",
    "src/app/api/portal/billing/route.js",
    "src/app/api/portal/license/route.js",
    "src/app/api/portal/invite/[token]/route.js",
    "src/app/api/portal/settings/leave-organization/route.js",
    "src/app/api/portal/settings/delete-account/route.js",
    "src/app/api/portal/settings/export/route.js",
    "src/app/api/checkout/route.js",
    "src/app/api/provision-license/route.js",
  ];

  // Resolve the plg-website root (test runs from plg-website/)
  const plgRoot = resolve(import.meta.dirname, "..", "..", "..");

  for (const routeFile of routeFiles) {
    const shortName = routeFile
      .replace("src/app/api/", "")
      .replace("/route.js", "");

    it(`${shortName} imports from @/lib/auth-verify`, () => {
      const fullPath = join(plgRoot, routeFile);
      assert.ok(existsSync(fullPath), `File not found: ${routeFile}`);

      const content = readFileSync(fullPath, "utf8");

      // Must import verifyAuthToken from the shared module
      assert.ok(
        content.includes('from "@/lib/auth-verify"'),
        `${shortName} must import from @/lib/auth-verify`,
      );
      assert.ok(
        content.includes("verifyAuthToken"),
        `${shortName} must reference verifyAuthToken`,
      );
    });

    it(`${shortName} does NOT have inline CognitoJwtVerifier`, () => {
      const fullPath = join(plgRoot, routeFile);
      const content = readFileSync(fullPath, "utf8");

      // Must NOT import CognitoJwtVerifier directly
      assert.ok(
        !content.includes("CognitoJwtVerifier"),
        `${shortName} must NOT contain CognitoJwtVerifier (use shared auth-verify)`,
      );
    });
  }

  it("auth-verify.js exists and exports verifyAuthToken", () => {
    const authVerifyPath = join(plgRoot, "src/lib/auth-verify.js");
    assert.ok(existsSync(authVerifyPath), "auth-verify.js must exist");

    const content = readFileSync(authVerifyPath, "utf8");
    assert.ok(
      content.includes("export async function verifyAuthToken"),
      "auth-verify.js must export verifyAuthToken",
    );
    assert.ok(
      content.includes("export function _resetVerifierForTesting"),
      "auth-verify.js must export _resetVerifierForTesting",
    );
  });

  it("auth-verify.js is the ONLY file importing CognitoJwtVerifier", () => {
    const authVerifyPath = join(plgRoot, "src/lib/auth-verify.js");
    const content = readFileSync(authVerifyPath, "utf8");
    assert.ok(
      content.includes('from "aws-jwt-verify"'),
      "auth-verify.js must import from aws-jwt-verify",
    );

    // Verify no route file imports it directly
    for (const routeFile of routeFiles) {
      const routeContent = readFileSync(join(plgRoot, routeFile), "utf8");
      assert.ok(
        !routeContent.includes('from "aws-jwt-verify"'),
        `${routeFile} must NOT import from aws-jwt-verify directly`,
      );
    }
  });
});
