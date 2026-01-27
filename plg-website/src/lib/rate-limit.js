/**
 * API Rate Limiting Utility
 *
 * Provides in-memory rate limiting for API routes.
 * Uses a sliding window algorithm with configurable limits.
 *
 * For production at scale, consider migrating to:
 * - DynamoDB-based rate limiting (works with AWS Amplify)
 * - Upstash Redis (@upstash/ratelimit)
 * - CloudFlare Rate Limiting
 *
 * @see Security Considerations for Keygen Licensing - Rate Limiting
 */

// In-memory store for rate limit tracking
// Note: This resets on serverless cold starts - acceptable for MVP
// For production, use DynamoDB or Redis
const rateLimitStore = new Map();

// Cleanup interval to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

/**
 * Clean up expired entries
 */
function cleanupExpiredEntries() {
  const now = Date.now();

  // Only cleanup every minute
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanup = now;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart + entry.windowMs < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate limit configuration presets
 */
export const RATE_LIMIT_PRESETS = {
  // Heartbeat: 10 requests per minute per license key
  heartbeat: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyPrefix: "heartbeat",
  },

  // Trial init: 5 requests per hour per fingerprint
  trialInit: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    keyPrefix: "trial",
  },

  // License validation: 20 requests per minute per license key
  validate: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    keyPrefix: "validate",
  },

  // License activation: 10 requests per hour per fingerprint
  activate: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    keyPrefix: "activate",
  },
};

/**
 * Check rate limit for a given key
 *
 * @param {string} identifier - Unique identifier (e.g., license key, fingerprint)
 * @param {object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum requests allowed in window
 * @param {string} options.keyPrefix - Prefix for the rate limit key
 * @returns {object} - { allowed: boolean, remaining: number, resetAt: Date }
 */
export function checkRateLimit(identifier, options) {
  const { windowMs, maxRequests, keyPrefix } = options;
  const now = Date.now();
  const key = `${keyPrefix}:${identifier}`;

  // Run cleanup
  cleanupExpiredEntries();

  // Get or create entry
  let entry = rateLimitStore.get(key);

  if (!entry || entry.windowStart + windowMs < now) {
    // Window expired or new entry
    entry = {
      windowStart: now,
      windowMs,
      count: 0,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  const allowed = entry.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetAt = new Date(entry.windowStart + windowMs);

  return {
    allowed,
    remaining,
    resetAt,
    current: entry.count,
    limit: maxRequests,
  };
}

/**
 * Rate limit middleware for Next.js API routes
 *
 * @param {Request} request - Next.js request object
 * @param {object} config - Rate limit configuration
 * @param {Function} config.getIdentifier - Function to extract identifier from request body
 * @param {object} config.limits - Rate limit options (or use preset name)
 * @returns {object|null} - Error response if rate limited, null if allowed
 */
export async function rateLimitMiddleware(request, config) {
  const { getIdentifier, limits } = config;

  // Get rate limit options (support preset names or custom config)
  const options =
    typeof limits === "string" ? RATE_LIMIT_PRESETS[limits] : limits;

  if (!options) {
    console.error(`Unknown rate limit preset: ${limits}`);
    return null; // Allow request if misconfigured
  }

  // Clone request to read body (since body can only be read once)
  const body = await request
    .clone()
    .json()
    .catch(() => ({}));

  // Get identifier from request
  const identifier = getIdentifier(body, request);

  if (!identifier) {
    // No identifier available - can't rate limit
    return null;
  }

  const result = checkRateLimit(identifier, options);

  if (!result.allowed) {
    return {
      error: "Rate limit exceeded",
      retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt.toISOString(),
    };
  }

  return null;
}

/**
 * Get rate limit headers for response
 *
 * @param {string} identifier - Rate limit identifier
 * @param {object} options - Rate limit options
 * @returns {object} - Headers object
 */
export function getRateLimitHeaders(identifier, options) {
  const key = `${options.keyPrefix}:${identifier}`;
  const entry = rateLimitStore.get(key);

  if (!entry) {
    return {
      "X-RateLimit-Limit": options.maxRequests.toString(),
      "X-RateLimit-Remaining": options.maxRequests.toString(),
    };
  }

  const remaining = Math.max(0, options.maxRequests - entry.count);
  const resetAt = new Date(entry.windowStart + options.windowMs);

  return {
    "X-RateLimit-Limit": options.maxRequests.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(resetAt.getTime() / 1000).toString(),
  };
}

/**
 * Reset rate limit for a specific key (for testing)
 */
export function resetRateLimit(identifier, keyPrefix) {
  rateLimitStore.delete(`${keyPrefix}:${identifier}`);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits() {
  rateLimitStore.clear();
}
