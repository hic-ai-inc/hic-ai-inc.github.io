import { describe, test, expect } from "../../../facade/test-helpers/index.js";
import {
  safeLog,
  sanitizeForLog,
  safePath,
  safeJsonParse,
  HicLog,
} from "../../../facade/helpers/__hic-base.js";

describe("HIC Base Facade", () => {
  test("should export safeLog function", () => {
    expect(typeof safeLog).toBe("function");
  });

  test("should export sanitizeForLog function", () => {
    expect(typeof sanitizeForLog).toBe("function");
  });

  test("should export safePath function", () => {
    expect(typeof safePath).toBe("function");
  });

  test("should export safeJsonParse function", () => {
    expect(typeof safeJsonParse).toBe("function");
  });

  test("should export HicLog class", () => {
    expect(typeof HicLog).toBe("function");
    expect(HicLog.prototype.constructor).toBe(HicLog);
  });

  test("should provide working safeJsonParse", () => {
    const result = safeJsonParse('{"test": "value"}');
    expect(result).toEqual({ test: "value" });
  });

  test("should provide working HicLog", () => {
    const logger = new HicLog("test-service");
    expect(logger.service).toBe("test-service");
    expect(typeof logger.info).toBe("function");
  });

  test("should provide working sanitizeForLog", () => {
    const result = sanitizeForLog("test\nvalue");
    expect(typeof result).toBe("string");
    expect(result).not.toContain("\n");
  });
});
