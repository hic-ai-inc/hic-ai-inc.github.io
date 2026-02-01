/**
 * Cleanup All Test Data
 *
 * Deletes all test data from:
 * - Keygen (all licenses)
 * - DynamoDB (PLG_Customers table)
 * - Cognito (all users except admins)
 *
 * Usage:
 *   node scripts/cleanup-all-test-data.js
 *   node scripts/cleanup-all-test-data.js --execute    # Actually delete
 *
 * Requires environment variables from .env.local
 */

require("dotenv").config({ path: ".env.local" });

const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN;
// Use staging pool by default (local .env.local might have dev pool ID)
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID_STAGING || "us-east-1_CntYimcMm";
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE_NAME || "hic-plg-staging";
const AWS_REGION = "us-east-1";

// Check required env vars
if (!KEYGEN_ACCOUNT_ID || !KEYGEN_PRODUCT_TOKEN) {
  console.error("❌ Missing Keygen credentials in .env.local");
  console.error("   Required: KEYGEN_ACCOUNT_ID, KEYGEN_PRODUCT_TOKEN");
  process.exit(1);
}

if (!COGNITO_USER_POOL_ID) {
  console.error("❌ Missing Cognito User Pool ID");
  console.error("   Required: NEXT_PUBLIC_COGNITO_USER_POOL_ID");
  process.exit(1);
}

const execute = process.argv.includes("--execute");

// ============================================================================
// KEYGEN CLEANUP
// ============================================================================

async function keygenRequest(path, options = {}) {
  const url = `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      ...options.headers,
    },
  });

  if (!response.ok && response.status !== 204) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(
      `Keygen API error: ${response.status} - ${JSON.stringify(error)}`,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

async function cleanupKeygen() {
  console.log("\n🔑 KEYGEN CLEANUP");
  console.log("─".repeat(60));

  const licenses = [];
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    const response = await keygenRequest(
      `/licenses?page[size]=100&page[number]=${page}`,
    );
    if (response.data && response.data.length > 0) {
      licenses.push(...response.data);
      page++;
      hasMore = response.links?.next != null;
    } else {
      hasMore = false;
    }
  }

  console.log(`   Found ${licenses.length} license(s)`);

  if (licenses.length === 0) {
    console.log("   ✅ No licenses to delete");
    return { total: 0, deleted: 0 };
  }

  for (const license of licenses) {
    console.log(
      `   • ${license.id} - ${license.attributes?.name || "(unnamed)"}`,
    );
    console.log(
      `     Email: ${license.attributes?.metadata?.email || "(none)"}`,
    );

    if (execute) {
      try {
        await keygenRequest(`/licenses/${license.id}`, { method: "DELETE" });
        console.log("     ✅ DELETED");
      } catch (err) {
        console.log(`     ❌ Error: ${err.message}`);
      }
    }
  }

  return { total: licenses.length, deleted: execute ? licenses.length : 0 };
}

// ============================================================================
// DYNAMODB CLEANUP
// ============================================================================

async function cleanupDynamoDB() {
  console.log("\n📦 DYNAMODB CLEANUP");
  console.log("─".repeat(60));

  const { DynamoDBClient, ScanCommand, DeleteItemCommand } =
    await import("@aws-sdk/client-dynamodb");

  const client = new DynamoDBClient({ region: AWS_REGION });

  // Scan all items
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const command = new ScanCommand({
      TableName: DYNAMODB_TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response = await client.send(command);
    if (response.Items) {
      items.push(...response.Items);
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`   Found ${items.length} customer record(s)`);

  if (items.length === 0) {
    console.log("   ✅ No records to delete");
    return { total: 0, deleted: 0 };
  }

  let deleted = 0;
  let skipped = 0;
  for (const item of items) {
    // Table uses PK/SK composite key
    const pk = item.PK?.S || "(no PK)";
    const sk = item.SK?.S || "(no SK)";
    const email = item.email?.S || "(no email)";

    // Skip VERSION# records - these are configuration, not test data
    if (pk.startsWith("VERSION#")) {
      console.log(`   • ${pk} / ${sk} [SKIPPED - config data]`);
      skipped++;
      continue;
    }

    console.log(`   • ${pk} / ${sk}`);
    console.log(`     Email: ${email}`);

    if (execute) {
      try {
        await client.send(
          new DeleteItemCommand({
            TableName: DYNAMODB_TABLE,
            Key: { PK: item.PK, SK: item.SK },
          }),
        );
        deleted++;
        console.log("     ✅ DELETED");
      } catch (err) {
        console.log(`     ❌ Error: ${err.message}`);
      }
    }
  }

  if (skipped > 0) {
    console.log(`   ℹ️  Skipped ${skipped} config record(s)`);
  }

  return { total: items.length, deleted };
}

// ============================================================================
// COGNITO CLEANUP
// ============================================================================

async function cleanupCognito() {
  console.log("\n👤 COGNITO CLEANUP");
  console.log("─".repeat(60));

  const {
    CognitoIdentityProviderClient,
    ListUsersCommand,
    AdminDeleteUserCommand,
  } = await import("@aws-sdk/client-cognito-identity-provider");

  const client = new CognitoIdentityProviderClient({ region: AWS_REGION });

  // List all users
  const users = [];
  let paginationToken = undefined;

  do {
    const command = new ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      PaginationToken: paginationToken,
    });

    const response = await client.send(command);
    if (response.Users) {
      users.push(...response.Users);
    }
    paginationToken = response.PaginationToken;
  } while (paginationToken);

  console.log(`   Found ${users.length} user(s)`);

  if (users.length === 0) {
    console.log("   ✅ No users to delete");
    return { total: 0, deleted: 0 };
  }

  for (const user of users) {
    const email =
      user.Attributes?.find((a) => a.Name === "email")?.Value || "(no email)";
    console.log(`   • ${user.Username}`);
    console.log(`     Email: ${email}`);
    console.log(`     Status: ${user.UserStatus}`);

    if (execute) {
      try {
        await client.send(
          new AdminDeleteUserCommand({
            UserPoolId: COGNITO_USER_POOL_ID,
            Username: user.Username,
          }),
        );
        console.log("     ✅ DELETED");
      } catch (err) {
        console.log(`     ❌ Error: ${err.message}`);
      }
    }
  }

  return { total: users.length, deleted: execute ? users.length : 0 };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  CLEANUP ALL TEST DATA");
  console.log("═".repeat(60));
  console.log(
    `  Mode: ${execute ? "🔴 EXECUTE (will delete data)" : "🟡 DRY RUN (preview only)"}`,
  );
  console.log("═".repeat(60));

  const results = {
    keygen: { total: 0, deleted: 0 },
    dynamodb: { total: 0, deleted: 0 },
    cognito: { total: 0, deleted: 0 },
  };

  try {
    results.keygen = await cleanupKeygen();
  } catch (err) {
    console.error(`   ❌ Keygen cleanup failed: ${err.message}`);
  }

  try {
    results.dynamodb = await cleanupDynamoDB();
  } catch (err) {
    console.error(`   ❌ DynamoDB cleanup failed: ${err.message}`);
  }

  try {
    results.cognito = await cleanupCognito();
  } catch (err) {
    console.error(`   ❌ Cognito cleanup failed: ${err.message}`);
  }

  console.log("\n" + "═".repeat(60));
  console.log("  SUMMARY");
  console.log("═".repeat(60));
  console.log(
    `  Keygen:   ${results.keygen.deleted}/${results.keygen.total} licenses deleted`,
  );
  console.log(
    `  DynamoDB: ${results.dynamodb.deleted}/${results.dynamodb.total} records deleted`,
  );
  console.log(
    `  Cognito:  ${results.cognito.deleted}/${results.cognito.total} users deleted`,
  );
  console.log("═".repeat(60));

  if (!execute) {
    console.log("\n⚠️  DRY RUN - No data was deleted.");
    console.log("   Run with --execute to actually delete.");
  } else {
    console.log("\n✅ Cleanup complete!");
  }
}

main().catch(console.error);
