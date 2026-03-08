/**
 * Retry Helper for Keygen API Calls
 *
 * Provides exponential backoff retry for non-critical Keygen write operations
 * (renew, suspend, reinstate). These calls are best-effort — DDB is the source
 * of truth, and guard clauses in the Keygen webhook handler prevent stale
 * events from corrupting DDB state.
 *
 * @see Keygen webhook guard clauses in /api/webhooks/keygen/route.js
 */

/**
 * Execute an async function with retry and exponential backoff.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options
 * @param {number} [options.maxAttempts=3] - Total attempts (1 = no retry)
 * @param {number} [options.baseDelayMs=1000] - Base delay between retries
 * @param {string} options.label - Operation label for logging
 * @param {Object} options.log - Logger instance with .warn() and .error()
 * @returns {Promise<{success: boolean, result?: any, error?: string}>}
 */
export async function withRetry(
  fn,
  { maxAttempts = 3, baseDelayMs = 1000, label, log },
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        log.info(
          `${label}_retry_succeeded`,
          `${label} succeeded on attempt ${attempt}/${maxAttempts}`,
          {
            attempt,
            maxAttempts,
          },
        );
      }
      return { success: true, result };
    } catch (e) {
      if (attempt < maxAttempts) {
        log.warn(
          `${label}_retry`,
          `${label} attempt ${attempt}/${maxAttempts} failed — retrying`,
          {
            attempt,
            maxAttempts,
            errorMessage: e?.message,
          },
        );
        await delay(baseDelayMs * attempt);
      } else {
        log.error(
          `${label}_exhausted`,
          `${label} failed after ${maxAttempts} attempts`,
          e,
          {
            attempt,
            maxAttempts,
            errorMessage: e?.message,
          },
        );
        return { success: false, error: e?.message };
      }
    }
  }
}

/**
 * Injectable delay for testing. Production uses real setTimeout.
 * @param {number} ms
 * @returns {Promise<void>}
 */
let delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function delay(ms) {
  return delayFn(ms);
}

/**
 * Replace the delay function (for testing — avoids real waits).
 * @param {Function} fn - Replacement delay function
 */
export function __setDelayForTests(fn) {
  delayFn = fn;
}

/**
 * Reset to production delay.
 */
export function __resetDelayForTests() {
  delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}
