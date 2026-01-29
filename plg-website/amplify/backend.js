import { defineBackend } from "@aws-amplify/backend";

/**
 * Amplify Gen 2 Backend Configuration
 *
 * Minimal backend for Gen 2 hosting with SSR runtime IAM access.
 *
 * We manage Cognito auth separately (configured directly in src/lib/cognito.js)
 * because referenceAuth() requires an Identity Pool which we don't use.
 *
 * This backend enables:
 * - Gen 2 hosting platform with proper IAM for SSR
 * - Secrets management via Amplify Console
 * - amplify_outputs.json generation
 *
 * @see https://docs.amplify.aws/nextjs/deploy-and-host/fullstack-branching/
 */
defineBackend({});
