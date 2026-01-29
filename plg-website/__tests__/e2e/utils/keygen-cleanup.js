/**
 * Keygen Test License Cleanup Utility
 *
 * This utility deletes all test licenses from Keygen to prevent billing issues.
 * Test licenses are identified by:
 * 1. Metadata containing `e2e_test: true`
 * 2. Email addresses matching the pattern `e2e-test-*@hic-ai-test.invalid`
 *
 * CRITICAL: Run this after E2E tests to clean up test data.
 * Keygen charges based on active licenses, so cleanup is essential.
 *
 * Usage:
 *   node keygen-cleanup.js                    # Dry run (list licenses to delete)
 *   node keygen-cleanup.js --execute          # Actually delete licenses
 *   node keygen-cleanup.js --execute --force  # Delete ALL licenses (use with caution)
 *
 * Environment Variables Required:
 *   E2E_KEYGEN_TEST_KEY    - Keygen product token
 *   KEYGEN_ACCOUNT_ID      - Keygen account ID (or uses default staging)
 */

const KEYGEN_ACCOUNT_ID =
  process.env.KEYGEN_ACCOUNT_ID || "868fccd3-676d-4b9d-90ab-c86ae54419f6";
const KEYGEN_API_URL = `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}`;
const TEST_EMAIL_PATTERN = /^e2e-test-.*@hic-ai-test\.invalid$/;
const TEST_METADATA_MARKER = "e2e_test";

/**
 * Make authenticated request to Keygen API
 */
async function keygenRequest(path, options = {}) {
  const token = process.env.E2E_KEYGEN_TEST_KEY;
  if (!token) {
    throw new Error("E2E_KEYGEN_TEST_KEY environment variable is required");
  }

  const url = `${KEYGEN_API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
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

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * List all licenses in the account
 */
async function listAllLicenses() {
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
      // Keygen uses link-based pagination
      hasMore = response.links?.next != null;
    } else {
      hasMore = false;
    }
  }

  return licenses;
}

/**
 * Check if a license is a test license
 */
function isTestLicense(license) {
  // Check metadata marker
  if (license.attributes?.metadata?.[TEST_METADATA_MARKER] === true) {
    return true;
  }

  // Check name pattern
  if (license.attributes?.name?.startsWith("E2E Test License")) {
    return true;
  }

  // Check metadata for test email
  const email = license.attributes?.metadata?.email;
  if (email && TEST_EMAIL_PATTERN.test(email)) {
    return true;
  }

  return false;
}

/**
 * Delete a single license
 */
async function deleteLicense(licenseId) {
  await keygenRequest(`/licenses/${licenseId}`, {
    method: "DELETE",
  });
}

/**
 * Main cleanup function
 */
async function cleanup(options = {}) {
  const { execute = false, force = false, verbose = true } = options;

  const results = {
    total: 0,
    testLicenses: 0,
    deleted: 0,
    errors: [],
    licenses: [],
  };

  try {
    if (verbose) {
      console.log("\n🔍 Scanning Keygen for licenses...");
      console.log(`   Account: ${KEYGEN_ACCOUNT_ID}`);
    }

    const allLicenses = await listAllLicenses();
    results.total = allLicenses.length;

    if (verbose) {
      console.log(`   Found ${allLicenses.length} total license(s)\n`);
    }

    // Identify test licenses
    const licensesToDelete = force
      ? allLicenses
      : allLicenses.filter(isTestLicense);

    results.testLicenses = licensesToDelete.length;

    if (licensesToDelete.length === 0) {
      if (verbose) {
        console.log("✅ No test licenses found. Nothing to clean up.");
      }
      return results;
    }

    if (verbose) {
      console.log(
        `📋 ${force ? "ALL" : "Test"} licenses to ${execute ? "DELETE" : "review"}:`,
      );
      console.log("─".repeat(80));
    }

    for (const license of licensesToDelete) {
      const licenseInfo = {
        id: license.id,
        key: license.attributes?.key?.substring(0, 12) + "...",
        name: license.attributes?.name || "(unnamed)",
        email: license.attributes?.metadata?.email || "(no email)",
        created: license.attributes?.created,
        isTest: isTestLicense(license),
      };

      results.licenses.push(licenseInfo);

      if (verbose) {
        console.log(`  • ${licenseInfo.id}`);
        console.log(`    Key: ${licenseInfo.key}`);
        console.log(`    Name: ${licenseInfo.name}`);
        console.log(`    Email: ${licenseInfo.email}`);
        console.log(`    Created: ${licenseInfo.created}`);
        console.log(`    Is Test: ${licenseInfo.isTest ? "✓" : "✗"}`);
        console.log("");
      }

      if (execute) {
        try {
          await deleteLicense(license.id);
          results.deleted++;
          if (verbose) {
            console.log(`    ✅ DELETED`);
          }
        } catch (error) {
          results.errors.push({ id: license.id, error: error.message });
          if (verbose) {
            console.log(`    ❌ ERROR: ${error.message}`);
          }
        }
      }
    }

    console.log("─".repeat(80));

    if (execute) {
      console.log(`\n🧹 Cleanup complete!`);
      console.log(
        `   Deleted: ${results.deleted}/${results.testLicenses} licenses`,
      );
      if (results.errors.length > 0) {
        console.log(`   Errors: ${results.errors.length}`);
      }
    } else {
      console.log(`\n⚠️  DRY RUN - No licenses were deleted.`);
      console.log(`   Would delete: ${results.testLicenses} license(s)`);
      console.log(`   Run with --execute to actually delete.`);
      if (force) {
        console.log(
          `   ⚠️  --force flag is set - ALL licenses would be deleted!`,
        );
      }
    }
  } catch (error) {
    console.error(`\n❌ Cleanup failed: ${error.message}`);
    results.errors.push({ id: "global", error: error.message });
  }

  return results;
}

/**
 * Create a test license for validation purposes
 * Returns the created license for later cleanup testing
 */
async function createTestLicense(options = {}) {
  const token = process.env.E2E_KEYGEN_TEST_KEY;
  if (!token) {
    throw new Error("E2E_KEYGEN_TEST_KEY environment variable is required");
  }

  const timestamp = Date.now();
  const testEmail = `e2e-test-${timestamp}@hic-ai-test.invalid`;

  // Use Individual policy by default
  const policyId = options.policyId || "91f1947e-0730-48f9-b19a-eb8016ae2f84";

  const response = await keygenRequest("/licenses", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "licenses",
        attributes: {
          name: `E2E Test License ${timestamp}`,
          metadata: {
            [TEST_METADATA_MARKER]: true,
            email: testEmail,
            created_by: "keygen-cleanup-test",
            timestamp: new Date().toISOString(),
          },
        },
        relationships: {
          policy: {
            data: {
              type: "policies",
              id: policyId,
            },
          },
        },
      },
    }),
  });

  return response.data;
}

/**
 * Self-test: Create a test license and verify cleanup can find and delete it
 */
async function selfTest() {
  console.log("\n🧪 Running Keygen Cleanup Self-Test...\n");

  let testLicense = null;

  try {
    // Step 1: Create a test license
    console.log("1️⃣ Creating test license...");
    testLicense = await createTestLicense();
    console.log(`   ✅ Created: ${testLicense.id}`);
    console.log(`   Key: ${testLicense.attributes.key.substring(0, 20)}...`);

    // Step 2: Verify cleanup can find it
    console.log("\n2️⃣ Verifying cleanup detection...");
    const dryRunResults = await cleanup({ execute: false, verbose: false });

    const foundTestLicense = dryRunResults.licenses.find(
      (l) => l.id === testLicense.id,
    );
    if (!foundTestLicense) {
      throw new Error("Cleanup did not detect the test license!");
    }
    console.log(`   ✅ Test license detected in cleanup scan`);

    // Step 3: Execute cleanup on just the test license
    console.log("\n3️⃣ Cleaning up test license...");
    await deleteLicense(testLicense.id);
    console.log(`   ✅ Deleted: ${testLicense.id}`);
    testLicense = null; // Mark as cleaned

    // Step 4: Verify it's gone
    console.log("\n4️⃣ Verifying deletion...");
    const postCleanupResults = await cleanup({
      execute: false,
      verbose: false,
    });
    const stillExists = postCleanupResults.licenses.find(
      (l) => l.id === testLicense?.id,
    );
    if (stillExists) {
      throw new Error("Test license still exists after deletion!");
    }
    console.log(`   ✅ License successfully removed from Keygen`);

    console.log(
      "\n✅ Self-test PASSED! Cleanup utility is working correctly.\n",
    );
    return { success: true };
  } catch (error) {
    console.error(`\n❌ Self-test FAILED: ${error.message}\n`);

    // Attempt cleanup on failure
    if (testLicense) {
      console.log("   Attempting emergency cleanup of test license...");
      try {
        await deleteLicense(testLicense.id);
        console.log("   ✅ Emergency cleanup successful");
      } catch (cleanupError) {
        console.error(
          `   ⚠️ Emergency cleanup failed: ${cleanupError.message}`,
        );
      }
    }

    return { success: false, error: error.message };
  }
}

// Export for programmatic use
module.exports = {
  cleanup,
  createTestLicense,
  deleteLicense,
  listAllLicenses,
  isTestLicense,
  selfTest,
  KEYGEN_ACCOUNT_ID,
  TEST_EMAIL_PATTERN,
  TEST_METADATA_MARKER,
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const force = args.includes("--force");
  const test = args.includes("--test");

  if (test) {
    selfTest().then((result) => {
      process.exit(result.success ? 0 : 1);
    });
  } else {
    cleanup({ execute, force }).then((results) => {
      process.exit(results.errors.length > 0 ? 1 : 0);
    });
  }
}
