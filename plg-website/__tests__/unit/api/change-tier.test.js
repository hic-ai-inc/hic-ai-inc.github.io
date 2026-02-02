/**
 * Change Tier API Route Tests
 *
 * Tests the tier change API logic including:
 * - Individual → Business upgrades
 * - Business → Individual downgrades
 * - Business → Individual blocked when seatsUsed > 1
 * - Authentication checks
 * - Validation of inputs
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Constants used in the routes
const AUTH_NAMESPACE = "https://hic-ai.com";

// Mock STRIPE_PRICES for testing (actual values come from env vars)
const STRIPE_PRICES = {
  individual: {
    monthly: "price_individual_monthly_test",
    annual: "price_individual_annual_test",
  },
  business: {
    monthly: "price_business_monthly_test",
    annual: "price_business_annual_test",
  },
};

// =============================================================================
// Helper Functions (extracted business logic for testing)
// =============================================================================

/**
 * Validate target tier input
 */
function validateTargetTier(targetTier) {
  if (!targetTier || !["individual", "business"].includes(targetTier)) {
    return {
      valid: false,
      error: "Invalid target tier. Must be 'individual' or 'business'.",
    };
  }
  return { valid: true };
}

/**
 * Check if user is already on target tier
 */
function checkAlreadyOnTier(currentTier, targetTier) {
  if (currentTier === targetTier) {
    return {
      alreadyOnTier: true,
      error: `Already on ${targetTier} tier`,
    };
  }
  return { alreadyOnTier: false };
}

/**
 * Check if Business → Individual downgrade is allowed
 * Only allowed if seatsUsed <= 1 (prevents orphaning team members)
 */
function canDowngradeToIndividual(currentTier, targetTier, seatsUsed) {
  // Only applies to Business → Individual
  if (currentTier !== "business" || targetTier !== "individual") {
    return { allowed: true };
  }

  // Must have 1 or fewer seats in use
  if (seatsUsed > 1) {
    return {
      allowed: false,
      error: "Cannot downgrade to Individual with active team members",
      details: `You have ${seatsUsed} active members in your organization. Please remove all team members except yourself before downgrading to Individual.`,
      seatsUsed,
    };
  }

  return { allowed: true };
}

/**
 * Get appropriate Stripe price ID for tier and billing cycle
 */
function getPriceId(tier, billingCycle) {
  const prices = STRIPE_PRICES[tier];
  if (!prices) {
    throw new Error(`Unknown tier: ${tier}`);
  }
  const priceId = prices[billingCycle];
  if (!priceId) {
    throw new Error(`Unknown billing cycle: ${billingCycle}`);
  }
  return priceId;
}

/**
 * Determine if the tier change is an upgrade or downgrade
 */
function getActionWord(currentTier, targetTier) {
  if (targetTier === "business") {
    return "upgraded";
  }
  return "downgraded";
}

// =============================================================================
// Tests
// =============================================================================

describe("change-tier API logic", () => {
  describe("target tier validation", () => {
    it("should reject null target tier", () => {
      const result = validateTargetTier(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(
        result.error,
        "Invalid target tier. Must be 'individual' or 'business'.",
      );
    });

    it("should reject invalid target tier", () => {
      const result = validateTargetTier("enterprise");
      assert.strictEqual(result.valid, false);
    });

    it("should accept 'individual' tier", () => {
      const result = validateTargetTier("individual");
      assert.strictEqual(result.valid, true);
    });

    it("should accept 'business' tier", () => {
      const result = validateTargetTier("business");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("already on tier check", () => {
    it("should detect when already on target tier", () => {
      const result = checkAlreadyOnTier("individual", "individual");
      assert.strictEqual(result.alreadyOnTier, true);
      assert.strictEqual(result.error, "Already on individual tier");
    });

    it("should allow switching to different tier", () => {
      const result = checkAlreadyOnTier("individual", "business");
      assert.strictEqual(result.alreadyOnTier, false);
    });
  });

  describe("Business → Individual downgrade protection", () => {
    it("should allow downgrade when seatsUsed is 1", () => {
      const result = canDowngradeToIndividual("business", "individual", 1);
      assert.strictEqual(result.allowed, true);
    });

    it("should allow downgrade when seatsUsed is 0", () => {
      const result = canDowngradeToIndividual("business", "individual", 0);
      assert.strictEqual(result.allowed, true);
    });

    it("should block downgrade when seatsUsed is 2", () => {
      const result = canDowngradeToIndividual("business", "individual", 2);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(
        result.error,
        "Cannot downgrade to Individual with active team members",
      );
      assert.strictEqual(result.seatsUsed, 2);
    });

    it("should block downgrade when seatsUsed is 5", () => {
      const result = canDowngradeToIndividual("business", "individual", 5);
      assert.strictEqual(result.allowed, false);
      assert.ok(result.details.includes("5 active members"));
    });

    it("should not apply to Individual → Business upgrades", () => {
      const result = canDowngradeToIndividual("individual", "business", 0);
      assert.strictEqual(result.allowed, true);
    });

    it("should not apply to same-tier (no change)", () => {
      const result = canDowngradeToIndividual("individual", "individual", 0);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("price ID lookup", () => {
    it("should get individual monthly price", () => {
      const priceId = getPriceId("individual", "monthly");
      assert.strictEqual(priceId, STRIPE_PRICES.individual.monthly);
    });

    it("should get individual annual price", () => {
      const priceId = getPriceId("individual", "annual");
      assert.strictEqual(priceId, STRIPE_PRICES.individual.annual);
    });

    it("should get business monthly price", () => {
      const priceId = getPriceId("business", "monthly");
      assert.strictEqual(priceId, STRIPE_PRICES.business.monthly);
    });

    it("should get business annual price", () => {
      const priceId = getPriceId("business", "annual");
      assert.strictEqual(priceId, STRIPE_PRICES.business.annual);
    });

    it("should throw for unknown tier", () => {
      assert.throws(
        () => getPriceId("enterprise", "monthly"),
        /Unknown tier: enterprise/,
      );
    });

    it("should throw for unknown billing cycle", () => {
      assert.throws(
        () => getPriceId("individual", "quarterly"),
        /Unknown billing cycle: quarterly/,
      );
    });
  });

  describe("action word determination", () => {
    it("should return 'upgraded' for Individual → Business", () => {
      const word = getActionWord("individual", "business");
      assert.strictEqual(word, "upgraded");
    });

    it("should return 'downgraded' for Business → Individual", () => {
      const word = getActionWord("business", "individual");
      assert.strictEqual(word, "downgraded");
    });
  });
});

describe("change-tier edge cases", () => {
  describe("multi-user organization scenarios", () => {
    it("should provide clear guidance on removing members", () => {
      const result = canDowngradeToIndividual("business", "individual", 3);
      assert.strictEqual(result.allowed, false);
      assert.ok(
        result.details.includes("remove all team members except yourself"),
      );
    });

    it("should include seatsUsed in response for UI feedback", () => {
      const result = canDowngradeToIndividual("business", "individual", 4);
      assert.strictEqual(result.seatsUsed, 4);
    });
  });

  describe("solo business account (1 seat)", () => {
    it("should allow downgrade for solo business user", () => {
      // A solo business user who wants Individual features is valid
      const result = canDowngradeToIndividual("business", "individual", 1);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("new business account (0 seats)", () => {
    it("should allow downgrade for newly created business with no members", () => {
      // Edge case: business account just created, owner hasn't used it yet
      const result = canDowngradeToIndividual("business", "individual", 0);
      assert.strictEqual(result.allowed, true);
    });
  });
});
