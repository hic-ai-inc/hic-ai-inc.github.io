import {
  describe,
  it,
  expect,
} from "../../../../../../dm/facade/test-helpers/index.js";

import {
  isActiveDevice,
  getPlatformName,
  formatRelativeTime,
  getDeviceWindowDescription,
} from "../../../../../src/app/portal/devices/_lib/device-utils.js";

describe("portal devices utilities", () => {
  describe("isActiveDevice", () => {
    it("returns false when device has no timestamps", () => {
      expect(isActiveDevice({})).toBe(false);
    });

    it("returns false for invalid timestamp strings", () => {
      expect(isActiveDevice({ lastSeen: "invalid-date" })).toBe(false);
    });

    it("returns true when lastSeen is within active window", () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(isActiveDevice({ lastSeen: recent })).toBe(true);
    });

    it("uses createdAt fallback when lastSeen is missing", () => {
      const recentCreatedAt = new Date(
        Date.now() - 60 * 60 * 1000,
      ).toISOString();
      expect(isActiveDevice({ createdAt: recentCreatedAt })).toBe(true);
    });
  });

  describe("getPlatformName", () => {
    it("maps known platform aliases", () => {
      expect(getPlatformName("darwin")).toBe("macOS");
      expect(getPlatformName("win32")).toBe("Windows");
      expect(getPlatformName("linux")).toBe("Linux");
    });

    it("falls back to original platform for unknown values", () => {
      expect(getPlatformName("solaris")).toBe("solaris");
    });
  });

  describe("formatRelativeTime", () => {
    it("returns unknown for missing date", () => {
      expect(formatRelativeTime()).toBe("unknown");
    });

    it("returns unknown for invalid dates", () => {
      expect(formatRelativeTime("bad-date")).toBe("unknown");
    });

    it("returns short relative format for recent times", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const value = formatRelativeTime(fiveMinutesAgo);
      expect(value).toContain("m ago");
    });
  });

  describe("getDeviceWindowDescription", () => {
    it("returns a 2-hour window description", () => {
      expect(getDeviceWindowDescription()).toBe("2-hour window");
    });
  });
});
