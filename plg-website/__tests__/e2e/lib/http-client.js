/**
 * E2E HTTP Client
 *
 * Lightweight HTTP client for E2E tests.
 * Wraps fetch with environment-aware base URL, timeout, and retries.
 *
 * Features:
 * - Automatic JSON serialization/deserialization
 * - Configurable timeout with AbortController
 * - Retry logic for transient failures
 * - Request/response logging (verbose mode)
 * - Error wrapping for consistent handling
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md - Section 8.1
 */

import { getEnvironment, getApiBase, testConfig, log } from "../config.js";

// ============================================================================
// HTTP Client Class
// ============================================================================

export class E2EHttpClient {
  constructor(options = {}) {
    this.env = getEnvironment();
    this.baseUrl = options.baseUrl || this.env.apiBase;
    this.timeout = options.timeout || this.env.timeout;
    this.retries = options.retries ?? this.env.retries;
    this.headers = {
      "Content-Type": "application/json",
      "User-Agent": "HIC-E2E-Test/1.0",
      ...options.headers,
    };
  }

  /**
   * Make an HTTP request
   * @param {string} method - HTTP method
   * @param {string} path - URL path (relative to baseUrl)
   * @param {Object} options - Request options
   * @returns {Promise<E2EResponse>}
   */
  async request(method, path, options = {}) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const startTime = Date.now();

    let lastError;
    const maxAttempts = (options.retries ?? this.retries) + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this._executeRequest(method, url, options);

        log.debug(`${method} ${path}`, {
          status: response.status,
          duration: `${Date.now() - startTime}ms`,
          attempt,
        });

        return response;
      } catch (error) {
        lastError = error;

        // Don't retry on client errors (4xx) or explicit no-retry
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxAttempts) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        log.warn(
          `Request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`,
        );
        await this._sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute a single HTTP request
   * @private
   */
  async _executeRequest(method, url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout || this.timeout,
    );

    try {
      const fetchOptions = {
        method,
        headers: {
          ...this.headers,
          ...options.headers,
        },
        signal: controller.signal,
      };

      // Add body for non-GET requests
      if (options.body && method !== "GET") {
        fetchOptions.body =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      }

      // Add query parameters for GET requests
      let finalUrl = url;
      if (options.query) {
        const params = new URLSearchParams(options.query);
        finalUrl = `${url}?${params.toString()}`;
      }

      log.debug(
        `→ ${method} ${finalUrl}`,
        options.body ? { body: options.body } : {},
      );

      const response = await fetch(finalUrl, fetchOptions);

      // Parse response body
      let data = null;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        data = await response.text();
      }

      log.debug(`← ${response.status}`, data);

      return new E2EResponse({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        data,
        ok: response.ok,
        url: finalUrl,
        method,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new E2EHttpError(
          `Request timeout after ${options.timeout || this.timeout}ms`,
          { status: 0, code: "TIMEOUT", url, method },
        );
      }
      throw new E2EHttpError(error.message, {
        status: 0,
        code: "NETWORK_ERROR",
        url,
        method,
        cause: error,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * GET request
   * @param {string} path - URL path
   * @param {Object} options - Request options (query, headers, etc.)
   * @returns {Promise<E2EResponse>}
   */
  get(path, options = {}) {
    return this.request("GET", path, options);
  }

  /**
   * POST request
   * @param {string} path - URL path
   * @param {Object} body - Request body
   * @param {Object} options - Additional options
   * @returns {Promise<E2EResponse>}
   */
  post(path, body, options = {}) {
    return this.request("POST", path, { ...options, body });
  }

  /**
   * PUT request
   * @param {string} path - URL path
   * @param {Object} body - Request body
   * @param {Object} options - Additional options
   * @returns {Promise<E2EResponse>}
   */
  put(path, body, options = {}) {
    return this.request("PUT", path, { ...options, body });
  }

  /**
   * DELETE request
   * @param {string} path - URL path
   * @param {Object} options - Request options
   * @returns {Promise<E2EResponse>}
   */
  delete(path, options = {}) {
    return this.request("DELETE", path, options);
  }

  /**
   * PATCH request
   * @param {string} path - URL path
   * @param {Object} body - Request body
   * @param {Object} options - Additional options
   * @returns {Promise<E2EResponse>}
   */
  patch(path, body, options = {}) {
    return this.request("PATCH", path, { ...options, body });
  }
}

// ============================================================================
// Response Wrapper
// ============================================================================

/**
 * Structured response object for consistent handling
 */
export class E2EResponse {
  constructor({ status, statusText, headers, data, ok, url, method }) {
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.data = data;
    this.ok = ok;
    this.url = url;
    this.method = method;
  }

  /**
   * Check if response has specific status
   * @param {number} expectedStatus
   * @returns {boolean}
   */
  hasStatus(expectedStatus) {
    return this.status === expectedStatus;
  }

  /**
   * Check if response is successful (2xx)
   * @returns {boolean}
   */
  isSuccess() {
    return this.status >= 200 && this.status < 300;
  }

  /**
   * Check if response is client error (4xx)
   * @returns {boolean}
   */
  isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Check if response is server error (5xx)
   * @returns {boolean}
   */
  isServerError() {
    return this.status >= 500;
  }

  /**
   * Get error message from response data
   * @returns {string|null}
   */
  getErrorMessage() {
    if (!this.data) return null;
    return this.data.error || this.data.message || this.data.detail || null;
  }

  /**
   * Convert to plain object for logging
   * @returns {Object}
   */
  toJSON() {
    return {
      status: this.status,
      statusText: this.statusText,
      ok: this.ok,
      data: this.data,
    };
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error for HTTP failures
 */
export class E2EHttpError extends Error {
  constructor(message, { status, code, url, method, cause }) {
    super(message);
    this.name = "E2EHttpError";
    this.status = status;
    this.code = code;
    this.url = url;
    this.method = method;
    this.cause = cause;
  }
}

// ============================================================================
// Default Client Instance
// ============================================================================

/**
 * Pre-configured client instance for convenience
 */
export const http = new E2EHttpClient();

export default {
  E2EHttpClient,
  E2EResponse,
  E2EHttpError,
  http,
};
