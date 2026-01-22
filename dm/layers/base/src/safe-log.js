/**
 * dm/layers/base/src/safe-log.js
 * Last modified: August 28, 2025
 *
 * Safe logging utility to prevent CWE-117 log injection attacks
 * Sanitizes user input before logging
 */

export function sanitizeForLog(input) {
  if (typeof input === "string") {
    // Replace meaningful whitespace characters with spaces first
    let result = input
      .replace(/\r\n|\r|\n/g, " ") // Replace newlines with spaces
      .replace(/\t/g, " "); // Replace tabs with spaces

    // For other control characters, replace with space if between word characters,
    // otherwise remove them
    result = result.replace(
      /[\x00-\x08\x0B-\x1F\x7F]/g,
      (match, offset, str) => {
        // Check if the control character is between word characters
        const before = offset > 0 ? str[offset - 1] : "";
        const after = offset < str.length - 1 ? str[offset + 1] : "";

        // If control char is between letters/numbers, replace with space
        if (/\w/.test(before) && /\w/.test(after)) {
          return " ";
        }
        // Otherwise, just remove it
        return "";
      }
    );

    return result.substring(0, 1000); // Limit length
  }

  if (typeof input === "object" && input !== null) {
    try {
      const jsonString = JSON.stringify(input, null, 2);
      return sanitizeForLog(jsonString);
    } catch (error) {
      return "[Object - could not serialize]";
    }
  }

  return String(input).substring(0, 1000);
}

export function safeLog(message, data = null) {
  // Suppress logs during tests for cleaner output
  if (process.env.SUPPRESS_LOGS === "true" || process.env.NODE_ENV === "test") {
    return;
  }

  const sanitizedMessage = sanitizeForLog(message);

  if (data !== null) {
    const sanitizedData = sanitizeForLog(data);
    console.log(`${sanitizedMessage}: ${sanitizedData}`);
  } else {
    console.log(sanitizedMessage);
  }
}
