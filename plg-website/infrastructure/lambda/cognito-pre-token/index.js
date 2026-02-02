/**
 * Cognito Pre-Token Generation Lambda
 *
 * Triggered before Cognito issues tokens. This Lambda:
 *   1. Reads the user's Cognito group membership
 *   2. Injects custom:role claim into the ID token based on group
 *
 * Role Priority (first match wins):
 *   - mouse-owner → "owner" (Business license purchaser)
 *   - mouse-admin → "admin" (Delegated administrator)
 *   - mouse-member → "member" (Team member)
 *   - (no group) → "individual" (Individual tier user)
 *
 * Trigger: Cognito PreTokenGeneration (V2_0)
 * Layer Dependencies: hic-base-layer
 *
 * @see PLG Roadmap v6 - Phase 2: Business RBAC
 * @see docs/plg/PLG_ROADMAP_v6.md#222-pre-token-lambda-trigger
 */
import { HicLog } from "hic-base-layer";

// ============================================================================
// Configuration
// ============================================================================
const ENVIRONMENT = process.env.ENVIRONMENT || "staging";

// Group-to-role mapping (priority order)
const GROUP_ROLE_MAP = {
  "mouse-owner": "owner",
  "mouse-admin": "admin",
  "mouse-member": "member",
};

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

    // Add custom claims to the ID token
    // These will be available as custom:role in the decoded token
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: {
          "custom:role": role,
        },
        // Optionally suppress groups from token if needed
        // groupOverrideDetails: null,
      },
    };

    log.info("complete", {
      userId,
      role,
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
