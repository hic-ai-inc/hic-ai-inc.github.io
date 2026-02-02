/**
 * Cognito Pre-Token Generation Lambda
 *
 * Triggered before Cognito issues tokens. This Lambda:
 *   1. Reads the user's Cognito group membership
 *   2. Injects custom:role claim into the ID token based on group
 *   3. Injects custom:org_id claim for Business tier members
 *
 * Role Priority (first match wins):
 *   - mouse-owner → "owner" (Business license purchaser)
 *   - mouse-admin → "admin" (Delegated administrator)
 *   - mouse-member → "member" (Team member)
 *   - (no group) → "individual" (Individual tier user)
 *
 * Trigger: Cognito PreTokenGeneration (V2_0)
 * Layer Dependencies: hic-base-layer, hic-dynamodb-layer
 *
 * @see PLG Roadmap v6 - Phase 2: Business RBAC
 * @see docs/plg/PLG_ROADMAP_v6.md#222-pre-token-lambda-trigger
 */
import { HicLog } from "hic-base-layer";
import { DynamoDBClient, DynamoDBDocumentClient, QueryCommand } from "hic-dynamodb-layer";

// ============================================================================
// Configuration
// ============================================================================
const ENVIRONMENT = process.env.ENVIRONMENT || "staging";
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "hic-plg-staging";

// Group-to-role mapping (priority order)
const GROUP_ROLE_MAP = {
  "mouse-owner": "owner",
  "mouse-admin": "admin",
  "mouse-member": "member",
};

// DynamoDB client for org membership lookup
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Look up user's organization membership from DynamoDB
 * @param {string} userId - Cognito user sub
 * @returns {Promise<{orgId: string, role: string}|null>} Membership info or null
 */
async function getUserOrgMembership(userId) {
  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "ORG#",
        },
      }),
    );

    // Return first active membership (users can only be in one org)
    const membership = result.Items?.find((item) => item.status === "active");
    return membership ? { orgId: membership.orgId, role: membership.role } : null;
  } catch (error) {
    // Non-fatal - log but continue without org_id
    console.error("Failed to lookup org membership:", error.message);
    return null;
  }
}

// ============================================================================
// Lambda Handler
// ============================================================================
export const handler = async (event, context) => {
  const log = new HicLog("cognito-pre-token");

  const userId = event.userName;
  const groups = event.request.groupConfiguration?.groupsToOverride || [];

  log.info("start", {
    userId,
    triggerSource: event.triggerSource,
    groups,
  });

  try {
    // Determine role from group membership (first match wins)
    let role = "individual"; // default for Individual tier users

    for (const [groupName, roleName] of Object.entries(GROUP_ROLE_MAP)) {
      if (groups.includes(groupName)) {
        role = roleName;
        break;
      }
    }

    log.info("role-determined", {
      userId,
      groups,
      assignedRole: role,
    });

    // For Business tier users (owner/admin/member), look up their org membership
    // This injects org_id into the token so APIs can verify organization access
    let orgId = null;
    if (role !== "individual") {
      const membership = await getUserOrgMembership(userId);
      if (membership) {
        orgId = membership.orgId;
        log.info("org-membership-found", {
          userId,
          orgId,
          memberRole: membership.role,
        });
      } else {
        log.warn("org-membership-not-found", {
          userId,
          role,
          message: "User has Business role but no org membership in DynamoDB",
        });
      }
    }

    // Build claims object - always include role, optionally include org_id
    const claims = {
      "custom:role": role,
    };
    
    // Only add org_id if user has an organization
    if (orgId) {
      claims["custom:org_id"] = orgId;
    }

    // Add custom claims to the ID token
    // These will be available as custom:role and custom:org_id in the decoded token
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: claims,
        // Optionally suppress groups from token if needed
        // groupOverrideDetails: null,
      },
    };

    log.info("complete", {
      userId,
      role,
      orgId: orgId || "none",
    });

    return event;
  } catch (error) {
    log.error("failed", {
      userId,
      error: error.message,
      stack: error.stack,
    });

    // Return event unchanged on error - user can still authenticate
    // but won't have role claim (will default to individual in frontend)
    return event;
  }
};
