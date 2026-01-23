/**
 * Middleware Logic Tests
 *
 * Tests the route protection logic used by the Next.js middleware.
 * Since Next.js middleware runs in Edge runtime and imports from 'next/server',
 * we test the protection logic directly rather than the middleware itself.
 *
 * Behaviors tested:
 * - Route classification (public vs protected)
 * - Portal route protection (requires authentication)
 * - Admin route protection (requires authentication + org context)
 * - Session validation rules
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
  createSpy,
} from "../../../dm/facade/test-helpers/index.js";
import {
  createAuth0Mock,
  createMockSession,
} from "../../../dm/facade/helpers/auth0.js";

import {
  __setAuth0ClientForTests,
  __resetAuth0ClientForTests,
  getOrganizationId,
} from "../../src/lib/auth0.js";

// Since Next.js middleware can't be directly imported (requires Edge runtime),
// we test the protection logic that the middleware uses

describe("middleware route protection logic", () => {
  let auth0Mock;

  beforeEach(() => {
    auth0Mock = createAuth0Mock();
    __setAuth0ClientForTests(auth0Mock);
  });

  afterEach(() => {
    __resetAuth0ClientForTests();
  });

  // Helper functions that mirror the middleware logic
  function requiresAuth(path) {
    return path.startsWith("/portal") || path.startsWith("/admin");
  }

  function requiresOrgContext(path) {
    return path.startsWith("/admin");
  }

  function shouldRedirectToLogin(path, session) {
    if (!requiresAuth(path)) return false;
    return !session;
  }

  function shouldRedirectToPortal(path, session) {
    if (!requiresOrgContext(path)) return false;
    if (!session) return false; // Will redirect to login instead
    const orgId = getOrganizationId(session);
    return !orgId; // Individual user accessing admin
  }

  describe("route classification", () => {
    it("should identify /portal as requiring auth", () => {
      expect(requiresAuth("/portal")).toBe(true);
    });

    it("should identify /portal/license as requiring auth", () => {
      expect(requiresAuth("/portal/license")).toBe(true);
    });

    it("should identify /portal/devices as requiring auth", () => {
      expect(requiresAuth("/portal/devices")).toBe(true);
    });

    it("should identify /portal/billing as requiring auth", () => {
      expect(requiresAuth("/portal/billing")).toBe(true);
    });

    it("should identify /portal/settings as requiring auth", () => {
      expect(requiresAuth("/portal/settings")).toBe(true);
    });

    it("should identify /admin as requiring auth", () => {
      expect(requiresAuth("/admin")).toBe(true);
    });

    it("should identify /admin/members as requiring auth", () => {
      expect(requiresAuth("/admin/members")).toBe(true);
    });

    it("should identify /admin/billing as requiring auth", () => {
      expect(requiresAuth("/admin/billing")).toBe(true);
    });

    it("should not require auth for /", () => {
      expect(requiresAuth("/")).toBe(false);
    });

    it("should not require auth for /pricing", () => {
      expect(requiresAuth("/pricing")).toBe(false);
    });

    it("should not require auth for /docs", () => {
      expect(requiresAuth("/docs")).toBe(false);
    });

    it("should not require auth for /checkout", () => {
      expect(requiresAuth("/checkout")).toBe(false);
    });

    it("should not require auth for /welcome", () => {
      expect(requiresAuth("/welcome")).toBe(false);
    });
  });

  describe("org context requirements", () => {
    it("should require org context for /admin", () => {
      expect(requiresOrgContext("/admin")).toBe(true);
    });

    it("should require org context for /admin/members", () => {
      expect(requiresOrgContext("/admin/members")).toBe(true);
    });

    it("should require org context for /admin/billing", () => {
      expect(requiresOrgContext("/admin/billing")).toBe(true);
    });

    it("should require org context for /admin/settings", () => {
      expect(requiresOrgContext("/admin/settings")).toBe(true);
    });

    it("should not require org context for /portal", () => {
      expect(requiresOrgContext("/portal")).toBe(false);
    });

    it("should not require org context for /portal/license", () => {
      expect(requiresOrgContext("/portal/license")).toBe(false);
    });

    it("should not require org context for /", () => {
      expect(requiresOrgContext("/")).toBe(false);
    });
  });

  describe("login redirect logic", () => {
    it("should redirect to login for /portal without session", () => {
      expect(shouldRedirectToLogin("/portal", null)).toBe(true);
    });

    it("should redirect to login for /portal/license without session", () => {
      expect(shouldRedirectToLogin("/portal/license", null)).toBe(true);
    });

    it("should redirect to login for /admin without session", () => {
      expect(shouldRedirectToLogin("/admin", null)).toBe(true);
    });

    it("should not redirect to login for /portal with session", () => {
      const session = createMockSession({ email: "user@example.com" });
      expect(shouldRedirectToLogin("/portal", session)).toBe(false);
    });

    it("should not redirect to login for / without session", () => {
      expect(shouldRedirectToLogin("/", null)).toBe(false);
    });

    it("should not redirect to login for /pricing without session", () => {
      expect(shouldRedirectToLogin("/pricing", null)).toBe(false);
    });
  });

  describe("portal redirect logic for admin routes", () => {
    it("should redirect individual user from /admin to /portal", () => {
      // Session without org_id
      const session = createMockSession({ email: "user@example.com" });
      expect(shouldRedirectToPortal("/admin", session)).toBe(true);
    });

    it("should redirect individual user from /admin/members to /portal", () => {
      const session = createMockSession({ email: "user@example.com" });
      expect(shouldRedirectToPortal("/admin/members", session)).toBe(true);
    });

    it("should redirect individual user from /admin/billing to /portal", () => {
      const session = createMockSession({ email: "user@example.com" });
      expect(shouldRedirectToPortal("/admin/billing", session)).toBe(true);
    });

    it("should not redirect enterprise user from /admin", () => {
      // Session WITH org_id (using namespaced key)
      const session = createMockSession({
        email: "admin@acme.com",
        "https://hic-ai.com/org_id": "org_acme_123",
      });
      expect(shouldRedirectToPortal("/admin", session)).toBe(false);
    });

    it("should not redirect enterprise user from /admin/members", () => {
      const session = createMockSession({
        email: "admin@acme.com",
        "https://hic-ai.com/org_id": "org_acme_123",
      });
      expect(shouldRedirectToPortal("/admin/members", session)).toBe(false);
    });

    it("should not redirect from /portal even for individual user", () => {
      const session = createMockSession({ email: "user@example.com" });
      expect(shouldRedirectToPortal("/portal", session)).toBe(false);
    });

    it("should not redirect from /portal for enterprise user", () => {
      const session = createMockSession({
        email: "admin@acme.com",
        "https://hic-ai.com/org_id": "org_acme_123",
      });
      expect(shouldRedirectToPortal("/portal", session)).toBe(false);
    });

    it("should not redirect to portal without session (redirects to login instead)", () => {
      expect(shouldRedirectToPortal("/admin", null)).toBe(false);
    });
  });

  describe("getOrganizationId integration", () => {
    it("should return null for session without org_id", () => {
      const session = createMockSession({ email: "user@example.com" });
      const orgId = getOrganizationId(session);
      expect(orgId).toBe(null);
    });

    it("should return org_id for enterprise session", () => {
      const session = createMockSession({
        email: "admin@acme.com",
        "https://hic-ai.com/org_id": "org_enterprise_123",
      });
      const orgId = getOrganizationId(session);
      expect(orgId).toBe("org_enterprise_123");
    });

    it("should return null for null session", () => {
      const orgId = getOrganizationId(null);
      expect(orgId).toBe(null);
    });
  });
});
