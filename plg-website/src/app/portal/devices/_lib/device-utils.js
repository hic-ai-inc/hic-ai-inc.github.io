import {
  DEVICE_ACTIVITY_WINDOW_HOURS,
  DEVICE_ACTIVITY_WINDOW_MS,
} from "@/lib/constants";

export function isActiveDevice(device) {
  if (!device?.lastSeen && !device?.createdAt) {
    return false;
  }

  const lastActivityDate = new Date(device.lastSeen || device.createdAt);
  if (Number.isNaN(lastActivityDate.getTime())) {
    return false;
  }

  const cutoffTime = new Date(Date.now() - DEVICE_ACTIVITY_WINDOW_MS);
  return lastActivityDate > cutoffTime;
}

export function getPlatformName(platform) {
  const names = {
    darwin: "macOS",
    macos: "macOS",
    win32: "Windows",
    windows: "Windows",
    linux: "Linux",
  };
  return names[platform?.toLowerCase()] || platform;
}

export function formatRelativeTime(dateString) {
  if (!dateString) return "unknown";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getDeviceWindowDescription() {
  return `${DEVICE_ACTIVITY_WINDOW_HOURS}-hour window`;
}
