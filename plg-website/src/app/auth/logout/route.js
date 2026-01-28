/**
 * Logout API Route - Cognito Authentication
 *
 * Handles logout by:
 * 1. Clearing Amplify Auth session (client-side tokens)
 * 2. Redirecting to Cognito logout endpoint (clears hosted UI session)
 * 3. Cognito redirects back to app homepage
 *
 * This is an API route (not a page) to support programmatic logout.
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

import { NextResponse } from "next/server";

// Cognito configuration from environment
const cognitoConfig = {
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

export async function GET(request) {
  // Build Cognito logout URL
  // This clears the Cognito session and redirects back to our app
  const logoutUrl = new URL(`https://${cognitoConfig.domain}/logout`);
  logoutUrl.searchParams.set("client_id", cognitoConfig.userPoolClientId);
  logoutUrl.searchParams.set("logout_uri", `${cognitoConfig.appUrl}/`);

  // Clear any server-side session cookies if we add them later
  const response = NextResponse.redirect(logoutUrl.toString());

  // Clear cookies that might have session data
  // (Amplify Auth primarily uses localStorage, but be thorough)
  response.cookies.delete("amplify-session");

  return response;
}

export async function POST(request) {
  // Support POST for CSRF-safe logout forms
  return GET(request);
}
