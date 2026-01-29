/**
 * Debug endpoint for secrets retrieval
 *
 * TEMPORARY - Remove after debugging checkout flow
 *
 * Returns diagnostic info about secrets retrieval WITHOUT exposing actual values
 */

import { NextResponse } from "next/server";

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION || "(not set)",
      AWS_APP_ID: process.env.AWS_APP_ID || "(not set, using default)",
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "(not set)",
    },
    ssmPaths: {
      expected: `/plg/secrets/${process.env.AWS_APP_ID || "d2yhz9h4xdd5rb"}/STRIPE_SECRET_KEY`,
    },
    checks: {},
  };

  // Check 1: Can we import the SSM client?
  try {
    const { SSMClient, GetParameterCommand } =
      await import("@aws-sdk/client-ssm");
    diagnostics.checks.ssmClientImport = "✅ OK";

    // Check 2: Can we create a client?
    const client = new SSMClient({ region: "us-east-1" });
    diagnostics.checks.ssmClientCreate = "✅ OK";

    // Check 3: Can we call SSM?
    const paramPath = `/plg/secrets/${process.env.AWS_APP_ID || "d2yhz9h4xdd5rb"}/STRIPE_SECRET_KEY`;
    try {
      const command = new GetParameterCommand({
        Name: paramPath,
        WithDecryption: true,
      });
      const response = await client.send(command);
      const value = response.Parameter?.Value;

      if (value) {
        diagnostics.checks.ssmGetParameter = "✅ OK";
        diagnostics.checks.valueLength = value.length;
        diagnostics.checks.valuePrefix = value.substring(0, 7) + "..."; // Only show sk_test or sk_live
      } else {
        diagnostics.checks.ssmGetParameter = "❌ Empty value returned";
      }
    } catch (ssmErr) {
      diagnostics.checks.ssmGetParameter = `❌ ${ssmErr.name}: ${ssmErr.message}`;
    }
  } catch (importErr) {
    diagnostics.checks.ssmClientImport = `❌ ${importErr.message}`;
  }

  // Check 4: Test getStripeSecrets function
  try {
    const { getStripeSecrets } = await import("@/lib/secrets");
    diagnostics.checks.secretsImport = "✅ OK";

    const secrets = await getStripeSecrets();
    diagnostics.checks.getStripeSecrets = {
      hasSecretKey: !!secrets.STRIPE_SECRET_KEY,
      secretKeyLength: secrets.STRIPE_SECRET_KEY?.length || 0,
      secretKeyPrefix: secrets.STRIPE_SECRET_KEY?.substring(0, 7) || "(empty)",
      hasWebhookSecret: !!secrets.STRIPE_WEBHOOK_SECRET,
    };
  } catch (secretsErr) {
    diagnostics.checks.getStripeSecrets = `❌ ${secretsErr.message}`;
  }

  // Check 5: Direct process.env fallback test
  diagnostics.checks.directEnvFallback = {
    STRIPE_SECRET_KEY_exists: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_SECRET_KEY_length: process.env.STRIPE_SECRET_KEY?.length || 0,
    STRIPE_SECRET_KEY_prefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7) || "(empty)",
    STRIPE_WEBHOOK_SECRET_exists: !!process.env.STRIPE_WEBHOOK_SECRET,
  };

  return NextResponse.json(diagnostics, { status: 200 });
}
