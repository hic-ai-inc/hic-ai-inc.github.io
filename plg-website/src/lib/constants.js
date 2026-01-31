/**
 * Application Constants
 *
 * Central configuration for pricing, plans, and application constants.
 * v4.2: Individual ($15/mo) / Business ($35/seat/mo)
 * Note: Enterprise tier deferred to post-launch per v4 addendum
 *
 * @see 20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md
 */

// ===========================================
// PRICING TIERS
// ===========================================

// v4.2: 2-tier model for launch — Individual + Business only
export const PRICING = {
  individual: {
    id: "individual",
    name: "Individual",
    description: "For professional developers",
    priceMonthly: 15,
    priceAnnual: 150, // 2 months free (17% savings)
    seats: 1,
    maxConcurrentMachines: 3,
    trialDays: 14,
    requiresCard: false,
    features: [
      "All Mouse tools",
      "3 concurrent machines",
      "Commercial use allowed",
      "Social login (Google, GitHub, Microsoft)",
      "Usage dashboard",
      "Discord community support",
      "Documentation access",
      "Early access to new features",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    description: "For teams and organizations",
    pricePerSeat: 35, // Monthly per seat
    minSeats: 1, // v4.2: Changed from 5 — enables Individual → Business upgrades
    maxConcurrentMachinesPerSeat: 5, // v4.2: Changed from 3 — clear upgrade value
    trialDays: 14,
    requiresCard: false,
    features: [
      "Everything in Individual",
      "5 concurrent machines per seat",
      "Team management portal",
      "Invite & manage team members",
      "Role-based access control (RBAC)",
      "Full audit logging & exports",
      "License reassignment",
      "Email support (24h response)",
      "Volume discounts available",
      "Enterprise SSO (Contact Sales)",
    ],
    volumeDiscounts: {
      50: 0.1, // 10% off at 50+ seats
      100: 0.15, // 15% off at 100+ seats
      500: 0.2, // 20% off at 500+ seats
    },
  },
};

// ===========================================
// PROMO CODES
// ===========================================

export const PROMO_CODES = {
  EARLYADOPTER20: {
    code: "EARLYADOPTER20",
    discount: 0.2,
    description: "Early adopter discount - 20% off first year",
    validUntil: "2026-12-31",
    applicableTiers: ["individual", "business"],
  },
  STUDENT50: {
    code: "STUDENT50",
    discount: 0.5,
    description: "Academic discount - 50% off",
    validUntil: null,
    requiresVerification: true,
    applicableTiers: ["individual"],
  },
  NONPROFIT40: {
    code: "NONPROFIT40",
    discount: 0.4,
    description: "Nonprofit discount - 40% off",
    validUntil: null,
    requiresVerification: true,
    applicableTiers: ["individual", "business"],
  },
};

// ===========================================
// LICENSE STATUS
// ===========================================

export const LICENSE_STATUS = {
  PENDING_ACCOUNT: "PENDING_ACCOUNT",
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  RETIRED: "RETIRED", // A.5.3 - Enterprise seat retired by admin
  DISPUTED: "DISPUTED", // A.6.2 - Chargeback dispute in progress
  REVOKED: "REVOKED", // A.7 - License revoked by admin
};

export const LICENSE_STATUS_DISPLAY = {
  PENDING_ACCOUNT: { label: "Pending Setup", variant: "warning" },
  TRIAL: { label: "Trial", variant: "info" },
  ACTIVE: { label: "Active", variant: "success" },
  PAST_DUE: { label: "Past Due", variant: "error" },
  CANCELLED: { label: "Cancelled", variant: "error" },
  EXPIRED: { label: "Expired", variant: "error" },
  RETIRED: { label: "Retired", variant: "error" },
  DISPUTED: { label: "Disputed", variant: "warning" },
  REVOKED: { label: "Revoked", variant: "error" },
};

// ===========================================
// STRIPE PRICE IDS
// ===========================================

// v4.2: Simple monthly/annual for both tiers
// Business uses per-seat pricing — quantity is set at checkout
export const STRIPE_PRICES = {
  individual: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY,
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL,
  },
  business: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
  },
  // Legacy aliases for backward compatibility
  team: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
  },
};

// ===========================================
// NAVIGATION
// ===========================================

export const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Research", href: "/research" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export const PORTAL_NAV = [
  { label: "Dashboard", href: "/portal", icon: "dashboard" },
  { label: "License", href: "/portal/license", icon: "key" },
  { label: "Devices", href: "/portal/devices", icon: "devices" },
  { label: "Billing", href: "/portal/billing", icon: "credit-card" },
  { label: "Settings", href: "/portal/settings", icon: "settings" },
];

export const PORTAL_NAV_BUSINESS = [
  ...PORTAL_NAV.slice(0, -1),
  { label: "Team", href: "/portal/team", icon: "users" },
  { label: "Settings", href: "/portal/settings", icon: "settings" },
];

// ===========================================
// EXTERNAL URLS
// ===========================================

export const EXTERNAL_URLS = {
  docs: "https://docs.hic-ai.com",
  github: "https://github.com/hic-ai-inc/mouse",
  twitter: "https://twitter.com/hic_ai",
  discord: "https://discord.gg/hic-ai",
  support: "mailto:support@hic-ai.com",
  marketplace:
    "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse",
};

// ===========================================
// IDENTITY NAMESPACE (for custom claims in JWT tokens)
// ===========================================
// Used in Cognito for custom user attributes

export const AUTH_NAMESPACE = "https://hic-ai.com";

// ===========================================
// APP METADATA
// ===========================================

export const APP_NAME = "Mouse";
export const APP_DESCRIPTION = "Precision Editing Tools for AI Coding Agents";
export const COMPANY_NAME = "HIC AI";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hic-ai.com";


// ===========================================
// LICENSE KEY UTILITIES
// ===========================================

/**
 * Format a license key for display
 * Shows first 8 and last 4 characters with ellipsis in between
 *
 * @param {string} licenseKey - Full license key (e.g., "XXXXXX-XXXXXX-XXXXXX-XXXXXX-V3")
 * @returns {string} Formatted key (e.g., "XXXXXX-X...X-V3")
 */
export function formatLicenseKeyForDisplay(licenseKey) {
  if (!licenseKey || typeof licenseKey !== "string") {
    return "••••-••••-••••";
  }

  // For short keys, just return as-is
  if (licenseKey.length <= 16) {
    return licenseKey;
  }

  // Show first 8 chars, ellipsis, last 4 chars
  const prefix = licenseKey.slice(0, 8);
  const suffix = licenseKey.slice(-4);
  return `${prefix}...${suffix}`;
}
