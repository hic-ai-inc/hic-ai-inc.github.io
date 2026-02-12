/**
 * Shared Cognito JWT Verification Utility
 *
 * Centralizes the CognitoJwtVerifier singleton and token verification logic
 * that was previously copy-pasted across all API route files.
 *
 * Usage:
 *   import { verifyAuthToken } from "@/lib/auth-verify";
 *
 *   const tokenPayload = await verifyAuthToken();
 *   if (!tokenPayload) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 *
 * @see Phase 1 Step 1.2 — Multi-User/Multi-Device Implementation Plan V2
 */

import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";

/**
 * Singleton CognitoJwtVerifier instance for ID tokens.
 *
 * Lazy-initialized on first call to verifyAuthToken() so that
 * env vars are guaranteed to be available at runtime, not just
 * at module-load time. This also handles the edge case where
 * env vars aren't set during build/test.
 *
 * @type {import("aws-jwt-verify").CognitoJwtVerifier | null}
 */
let idVerifier = null;

function getVerifier() {
  if (
    !idVerifier &&
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID &&
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  ) {
    idVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    });
  }
  return idVerifier;
}

/**
 * Verify Cognito ID token from the Authorization header.
 *
 * Reads the `Authorization: Bearer <token>` header via Next.js `headers()`,
 * verifies the JWT against the configured Cognito User Pool, and returns
 * the decoded token payload on success or `null` on failure.
 *
 * The returned payload includes standard Cognito ID token claims:
 *   - sub: Cognito user UUID
 *   - email: User's email address
 *   - email_verified: Whether email is verified
 *   - cognito:username: Cognito username (for admin API calls)
 *   - name, given_name, family_name: Profile fields (when available)
 *
 * @returns {Promise<object|null>} Decoded token payload, or null if
 *   the token is missing, malformed, expired, or fails verification.
 */
export async function verifyAuthToken() {
  const verifier = getVerifier();
  if (!verifier) {
    console.error(
      "[auth-verify] JWT verifier not initialized — missing env vars",
    );
    return null;
  }

  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return await verifier.verify(token);
  } catch (error) {
    console.error("[auth-verify] JWT verification failed:", error.message);
    return null;
  }
}

/**
 * Reset the verifier singleton (for testing only).
 * @private
 */
export function _resetVerifierForTesting() {
  idVerifier = null;
}
