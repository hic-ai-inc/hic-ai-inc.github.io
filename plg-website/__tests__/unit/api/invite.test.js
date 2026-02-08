/**
 * Invite Acceptance Tests
 *
 * Tests cover:
 * - GET /api/portal/invite/[token] — invite lookup and validation
 * - POST /api/portal/invite/[token] — invite acceptance logic
 * - Invite page decision logic — auth-first UX behavior
 *
 * Pattern: Extracts and tests business logic inline (no React rendering).
 * Matches team.test.js approach.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

// ============================================================================
// Helpers
// ============================================================================

function createMockInvite(overrides = {}) {
  return {
    inviteId: "inv_12345_abc123",
    orgId: "org_test123",
    email: "invited@example.com",
    role: "member",
    status: "pending",
    token: "test-invite-token-12345",
    createdAt: "2025-01-20T00:00:00.000Z",
    expiresAt: "2030-01-27T00:00:00.000Z", // Far future so tests don't expire
    ...overrides,
  };
}

function createMockSession(overrides = {}) {
  return {
    user: {
      sub: "cognito|user123",
      email: "invited@example.com",
      email_verified: true,
      ...overrides,
    },
  };
}

// ============================================================================
// GET /api/portal/invite/[token] — Invite Lookup Logic
// ============================================================================

/**
 * Extracted from route.js GET handler.
 * Validates invite token and returns safe invite details or error.
 */
function validateInviteForDisplay(token, invite) {
  if (!token) {
    return { error: "Invalid invite link", status: 400 };
  }

  if (!invite) {
    return { error: "Invite not found or has expired", status: 404 };
  }

  if (invite.status !== "pending") {
    return {
      error: "This invite has already been used or cancelled",
      status: 400,
    };
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return {
      error: "This invite has expired. Please request a new one.",
      status: 400,
    };
  }

  return {
    data: {
      email: invite.email,
      role: invite.role,
      orgId: invite.orgId,
      expiresAt: invite.expiresAt,
    },
    status: 200,
  };
}

describe("Invite API - GET Validation", () => {
  it("returns 400 for missing token", () => {
    const result = validateInviteForDisplay(null, null);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error, "Invalid invite link");
  });

  it("returns 400 for empty string token", () => {
    const result = validateInviteForDisplay("", null);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error, "Invalid invite link");
  });

  it("returns 404 when invite not found", () => {
    const result = validateInviteForDisplay("valid-token", null);
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error, "Invite not found or has expired");
  });

  it("returns 400 for already accepted invite", () => {
    const invite = createMockInvite({ status: "accepted" });
    const result = validateInviteForDisplay("valid-token", invite);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(
      result.error,
      "This invite has already been used or cancelled",
    );
  });

  it("returns 400 for cancelled invite", () => {
    const invite = createMockInvite({ status: "cancelled" });
    const result = validateInviteForDisplay("valid-token", invite);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(
      result.error,
      "This invite has already been used or cancelled",
    );
  });

  it("returns 400 for expired invite", () => {
    const invite = createMockInvite({ expiresAt: "2020-01-01T00:00:00.000Z" });
    const result = validateInviteForDisplay("valid-token", invite);
    assert.strictEqual(result.status, 400);
    assert.match(result.error, /expired/i);
  });

  it("returns invite details for valid pending invite", () => {
    const invite = createMockInvite();
    const result = validateInviteForDisplay("valid-token", invite);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.email, "invited@example.com");
    assert.strictEqual(result.data.role, "member");
    assert.strictEqual(result.data.orgId, "org_test123");
    assert.strictEqual(result.data.expiresAt, invite.expiresAt);
  });

  it("does not expose internal fields like inviteId or token", () => {
    const invite = createMockInvite();
    const result = validateInviteForDisplay("valid-token", invite);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.inviteId, undefined);
    assert.strictEqual(result.data.token, undefined);
    assert.strictEqual(result.data.createdAt, undefined);
    assert.strictEqual(result.data.status, undefined);
  });
});

// ============================================================================
// POST /api/portal/invite/[token] — Invite Acceptance Logic
// ============================================================================

/**
 * Simulates JWT token payload from CognitoJwtVerifier.
 * The actual route.js now uses verifyAuthToken() which returns a JWT payload
 * (with .sub, .email, etc.) instead of getSession() which returned .user wrapper.
 */
function createMockTokenPayload(overrides = {}) {
  return {
    sub: "cognito|user123",
    email: "invited@example.com",
    email_verified: true,
    ...overrides,
  };
}

/**
 * Extracted from route.js POST handler (updated to JWT auth pattern).
 * Validates token payload, invite, and email match before accepting.
 * Note: orgId check was removed — invitees ARE joining this org.
 */
function validateInviteAcceptance(tokenPayload, token, invite) {
  if (!tokenPayload) {
    return { error: "Please sign in to accept this invite", status: 401 };
  }

  if (!token) {
    return { error: "Invalid invite link", status: 400 };
  }

  if (!invite) {
    return { error: "Invite not found or has expired", status: 404 };
  }

  if (invite.status !== "pending") {
    return {
      error: "This invite has already been used or cancelled",
      status: 400,
    };
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return {
      error: "This invite has expired. Please request a new one.",
      status: 400,
    };
  }

  // Verify email matches (case-insensitive)
  const userEmail = tokenPayload.email?.toLowerCase();
  const inviteEmail = invite.email?.toLowerCase();

  if (userEmail !== inviteEmail) {
    return {
      error: `This invite was sent to ${invite.email}. Please sign in with that email address.`,
      status: 403,
    };
  }

  return {
    valid: true,
    userId: tokenPayload.sub,
    status: 200,
  };
}

describe("Invite API - POST Acceptance Validation", () => {
  it("returns 401 when no token payload (unauthenticated)", () => {
    const invite = createMockInvite();
    const result = validateInviteAcceptance(null, "token", invite);
    assert.strictEqual(result.status, 401);
    assert.match(result.error, /sign in/i);
  });

  it("returns 401 when token payload is undefined", () => {
    const invite = createMockInvite();
    const result = validateInviteAcceptance(undefined, "token", invite);
    assert.strictEqual(result.status, 401);
  });

  it("returns 400 for missing token", () => {
    const payload = createMockTokenPayload();
    const result = validateInviteAcceptance(payload, null, null);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error, "Invalid invite link");
  });

  it("returns 404 when invite not found", () => {
    const payload = createMockTokenPayload();
    const result = validateInviteAcceptance(payload, "token", null);
    assert.strictEqual(result.status, 404);
  });

  it("returns 400 for non-pending invite", () => {
    const payload = createMockTokenPayload();
    const invite = createMockInvite({ status: "accepted" });
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.status, 400);
    assert.match(result.error, /already been used/i);
  });

  it("returns 400 for expired invite", () => {
    const payload = createMockTokenPayload();
    const invite = createMockInvite({ expiresAt: "2020-01-01T00:00:00.000Z" });
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.status, 400);
    assert.match(result.error, /expired/i);
  });

  it("returns 403 when email does not match", () => {
    const payload = createMockTokenPayload({ email: "different@example.com" });
    const invite = createMockInvite({ email: "invited@example.com" });
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.status, 403);
    assert.ok(result.error.includes("invited@example.com"));
  });

  it("email match is case-insensitive", () => {
    const payload = createMockTokenPayload({ email: "INVITED@Example.COM" });
    const invite = createMockInvite({ email: "invited@example.com" });
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.status, 200);
  });

  it("allows acceptance when no customer record exists (new signup)", () => {
    const payload = createMockTokenPayload();
    const invite = createMockInvite();
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.userId, "cognito|user123");
  });

  it("returns the user sub on successful validation", () => {
    const payload = createMockTokenPayload({ sub: "cognito|abc999" });
    const invite = createMockInvite();
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.userId, "cognito|abc999");
  });

  it("does NOT reject users who are joining an org (orgId check removed)", () => {
    // Previously the route checked customer?.orgId and rejected.
    // Now that check is removed — invitees ARE joining this org.
    // The validateInviteAcceptance function no longer takes a customer param.
    const payload = createMockTokenPayload();
    const invite = createMockInvite();
    const result = validateInviteAcceptance(payload, "token", invite);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.status, 200);
  });
});

// ============================================================================
// Invite Page Decision Logic — Auth-First UX Behavior
// ============================================================================

/**
 * Extracted from page.js.
 * Determines what the primary button should display based on auth state.
 */
function getButtonLabel(isAuthenticated, accepting) {
  if (accepting) return "Joining...";
  if (isAuthenticated) return "Accept Invite";
  return "Sign in to Accept";
}

/**
 * Extracted from page.js.
 * Determines what action the primary button should trigger.
 */
function getButtonAction(isAuthenticated) {
  return isAuthenticated ? "accept" : "signIn";
}

/**
 * Extracted from page.js useEffect.
 * Determines if auto-accept should trigger after returning from auth.
 */
function shouldAutoAccept({
  isAuthenticated,
  invite,
  autoAcceptAttempted,
  success,
  accepting,
}) {
  return Boolean(
    isAuthenticated && invite && !autoAcceptAttempted && !success && !accepting
  );
}

/**
 * Extracted from page.js.
 * Determines if the loading spinner should show.
 */
function shouldShowLoading(inviteLoading, authLoading) {
  return inviteLoading || authLoading;
}

describe("Invite Page - Button Behavior", () => {
  it("shows 'Sign in to Accept' when not authenticated", () => {
    assert.strictEqual(getButtonLabel(false, false), "Sign in to Accept");
  });

  it("shows 'Accept Invite' when authenticated", () => {
    assert.strictEqual(getButtonLabel(true, false), "Accept Invite");
  });

  it("shows 'Joining...' when accepting regardless of auth", () => {
    assert.strictEqual(getButtonLabel(true, true), "Joining...");
    assert.strictEqual(getButtonLabel(false, true), "Joining...");
  });

  it("triggers signIn action when not authenticated", () => {
    assert.strictEqual(getButtonAction(false), "signIn");
  });

  it("triggers accept action when authenticated", () => {
    assert.strictEqual(getButtonAction(true), "accept");
  });
});

describe("Invite Page - Auto-Accept Logic", () => {
  it("triggers auto-accept when authenticated with loaded invite", () => {
    const result = shouldAutoAccept({
      isAuthenticated: true,
      invite: createMockInvite(),
      autoAcceptAttempted: false,
      success: false,
      accepting: false,
    });
    assert.strictEqual(result, true);
  });

  it("does not auto-accept when not authenticated", () => {
    const result = shouldAutoAccept({
      isAuthenticated: false,
      invite: createMockInvite(),
      autoAcceptAttempted: false,
      success: false,
      accepting: false,
    });
    assert.strictEqual(result, false);
  });

  it("does not auto-accept when invite not loaded yet", () => {
    const result = shouldAutoAccept({
      isAuthenticated: true,
      invite: null,
      autoAcceptAttempted: false,
      success: false,
      accepting: false,
    });
    assert.strictEqual(result, false);
  });

  it("does not auto-accept if already attempted", () => {
    const result = shouldAutoAccept({
      isAuthenticated: true,
      invite: createMockInvite(),
      autoAcceptAttempted: true,
      success: false,
      accepting: false,
    });
    assert.strictEqual(result, false);
  });

  it("does not auto-accept if already succeeded", () => {
    const result = shouldAutoAccept({
      isAuthenticated: true,
      invite: createMockInvite(),
      autoAcceptAttempted: false,
      success: true,
      accepting: false,
    });
    assert.strictEqual(result, false);
  });

  it("does not auto-accept if currently accepting", () => {
    const result = shouldAutoAccept({
      isAuthenticated: true,
      invite: createMockInvite(),
      autoAcceptAttempted: false,
      success: false,
      accepting: true,
    });
    assert.strictEqual(result, false);
  });
});

describe("Invite Page - Loading State", () => {
  it("shows loading when invite is loading", () => {
    assert.strictEqual(shouldShowLoading(true, false), true);
  });

  it("shows loading when auth is loading", () => {
    assert.strictEqual(shouldShowLoading(false, true), true);
  });

  it("shows loading when both are loading", () => {
    assert.strictEqual(shouldShowLoading(true, true), true);
  });

  it("does not show loading when neither is loading", () => {
    assert.strictEqual(shouldShowLoading(false, false), false);
  });
});

// ============================================================================
// Invite Page - handleAccept Auth Guard
// ============================================================================

describe("Invite Page - Accept Auth Guard", () => {
  /**
   * Extracted from page.js handleAccept.
   * Returns which action to take based on auth state and API response.
   */
  function resolveAcceptAction(isAuthenticated, responseStatus) {
    if (!isAuthenticated) return "redirect-to-signin";
    if (responseStatus === 401) return "redirect-to-signin";
    if (responseStatus >= 400) return "show-error";
    return "success";
  }

  it("redirects to sign-in when not authenticated", () => {
    assert.strictEqual(resolveAcceptAction(false, null), "redirect-to-signin");
  });

  it("redirects to sign-in on 401 response (session expired)", () => {
    assert.strictEqual(resolveAcceptAction(true, 401), "redirect-to-signin");
  });

  it("shows error on 403 response (email mismatch)", () => {
    assert.strictEqual(resolveAcceptAction(true, 403), "show-error");
  });

  it("shows error on 400 response (already used)", () => {
    assert.strictEqual(resolveAcceptAction(true, 400), "show-error");
  });

  it("shows error on 404 response (invite not found)", () => {
    assert.strictEqual(resolveAcceptAction(true, 404), "show-error");
  });

  it("succeeds on 200 response", () => {
    assert.strictEqual(resolveAcceptAction(true, 200), "success");
  });
});

// ============================================================================
// JWT Bearer Auth — Client sends Authorization header
// ============================================================================

/**
 * Extracted from page.js acceptInvite callback.
 * Determines whether the client-side session is ready to make the POST.
 */
function canSendAcceptRequest(session) {
  return Boolean(session?.idToken);
}

/**
 * Extracted from page.js acceptInvite callback.
 * Builds the headers for the invite acceptance POST request.
 */
function buildAcceptHeaders(session) {
  if (!session?.idToken) return {};
  return { Authorization: `Bearer ${session.idToken}` };
}

describe("Invite Page - JWT Bearer Auth", () => {
  it("cannot send accept request without session", () => {
    assert.strictEqual(canSendAcceptRequest(null), false);
  });

  it("cannot send accept request without idToken", () => {
    assert.strictEqual(canSendAcceptRequest({}), false);
    assert.strictEqual(canSendAcceptRequest({ user: {} }), false);
  });

  it("can send accept request with valid idToken", () => {
    assert.strictEqual(canSendAcceptRequest({ idToken: "jwt.token.here" }), true);
  });

  it("builds Authorization header with Bearer prefix", () => {
    const headers = buildAcceptHeaders({ idToken: "my-jwt-token" });
    assert.strictEqual(headers.Authorization, "Bearer my-jwt-token");
  });

  it("returns empty headers when no idToken", () => {
    const headers = buildAcceptHeaders(null);
    assert.deepStrictEqual(headers, {});
  });

  it("returns empty headers when session has no idToken", () => {
    const headers = buildAcceptHeaders({ user: {} });
    assert.deepStrictEqual(headers, {});
  });
});

// ============================================================================
// Server-side JWT Verification — Authorization header parsing
// ============================================================================

/**
 * Extracted from route.js verifyAuthToken logic.
 * Parses Authorization header and extracts the token.
 */
function extractBearerToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

describe("Invite API - JWT Token Extraction", () => {
  it("extracts token from valid Bearer header", () => {
    assert.strictEqual(extractBearerToken("Bearer abc123"), "abc123");
  });

  it("returns null for missing header", () => {
    assert.strictEqual(extractBearerToken(null), null);
    assert.strictEqual(extractBearerToken(undefined), null);
  });

  it("returns null for empty string header", () => {
    assert.strictEqual(extractBearerToken(""), null);
  });

  it("returns null for non-Bearer auth scheme", () => {
    assert.strictEqual(extractBearerToken("Basic abc123"), null);
  });

  it("returns null for 'Bearer' without space and token", () => {
    assert.strictEqual(extractBearerToken("Bearertoken"), null);
  });

  it("handles token with dots (JWT format)", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.signature";
    assert.strictEqual(extractBearerToken(`Bearer ${jwt}`), jwt);
  });

  it("handles Bearer with empty token after space", () => {
    // "Bearer " with just a space — returns empty string (valid parse, verifier will reject)
    assert.strictEqual(extractBearerToken("Bearer "), "");
  });
});

