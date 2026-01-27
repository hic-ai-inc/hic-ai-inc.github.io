/**
 * Device Status Page
 *
 * Read-only view of activated devices.
 * Devices are auto-populated by Mouse heartbeat data.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, Badge, Button } from "@/components/ui";

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [maxDevices, setMaxDevices] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  async function fetchDevices() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/portal/devices");
      if (!res.ok) {
        throw new Error("Failed to fetch devices");
      }
      const data = await res.json();
      setDevices(data.devices || []);
      setMaxDevices(data.maxDevices || 3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Filter devices by active status (active = seen in last 7 days)
  const activeDevices = devices.filter((d) => isActiveDevice(d));
  const inactiveDevices = devices.filter((d) => !isActiveDevice(d));
  const displayedDevices = showInactive ? devices : activeDevices;

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-frost-white">Devices</h1>
          <p className="text-slate-grey mt-1">Loading your devices...</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-pulse">
              <div className="h-4 bg-card-border rounded w-48 mx-auto mb-4"></div>
              <div className="h-4 bg-card-border rounded w-32 mx-auto"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-frost-white">Devices</h1>
          <p className="text-slate-grey mt-1">View your activated devices</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button onClick={fetchDevices}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">Devices</h1>
        <p className="text-slate-grey mt-1">
          {activeDevices.length} active{" "}
          {activeDevices.length === 1 ? "installation" : "installations"} of{" "}
          {maxDevices} allowed
        </p>
      </div>

      {/* Usage Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-grey">
              Active Installations
            </span>
            <span className="text-sm text-frost-white">
              {activeDevices.length} / {maxDevices}
            </span>
          </div>
          <div className="h-2 bg-card-border rounded-full overflow-hidden">
            <div
              className="h-full bg-cerulean-mist rounded-full transition-all"
              style={{
                width: `${Math.min((activeDevices.length / maxDevices) * 100, 100)}%`,
              }}
            />
          </div>
          {inactiveDevices.length > 0 && (
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="mt-3 text-sm text-cerulean-mist hover:text-frost-white transition-colors"
            >
              {showInactive
                ? "Hide inactive installations"
                : `Show all installations (${devices.length} total)`}
            </button>
          )}
        </CardContent>
      </Card>

      {/* Device List */}
      <div className="space-y-4">
        {displayedDevices.map((device) => {
          const isActive = isActiveDevice(device);
          return (
            <Card
              key={device.id}
              className={!isActive ? "opacity-60" : undefined}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-card-bg border border-card-border flex items-center justify-center">
                      <DeviceIcon platform={device.platform} />
                    </div>
                    <div>
                      <h3 className="font-medium text-frost-white">
                        {device.name || "Unknown Device"}
                      </h3>
                      <p className="text-sm text-slate-grey">
                        {device.platform &&
                          `${getPlatformName(device.platform)} • `}
                        {device.lastSeen
                          ? `Last seen ${formatRelativeTime(device.lastSeen)}`
                          : `Activated ${formatRelativeTime(device.createdAt)}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isActive ? "success" : "secondary"}>
                    {isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {displayedDevices.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-card-bg border border-card-border flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-slate-grey"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-frost-white font-medium mb-2">
                No devices activated yet
              </p>
              <p className="text-sm text-slate-grey mb-4">
                Install Mouse in VS Code and sign in to activate this device.
              </p>
              <Link
                href="/docs/getting-started"
                className="text-cerulean-mist hover:text-frost-white transition-colors text-sm"
              >
                Learn how to activate →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Device Info */}
      {activeDevices.length < maxDevices && devices.length > 0 && (
        <div className="mt-6 p-6 border-2 border-dashed border-card-border rounded-2xl text-center">
          <p className="text-slate-grey mb-2">
            You can activate Mouse on{" "}
            <span className="text-frost-white font-medium">
              {maxDevices - activeDevices.length} more
            </span>{" "}
            {maxDevices - activeDevices.length === 1 ? "device" : "devices"}.
          </p>
          <p className="text-sm text-slate-grey mb-4">
            Install Mouse on another machine or container and we&apos;ll
            automatically update this list.
          </p>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 text-cerulean-mist hover:text-frost-white transition-colors text-sm font-medium"
          >
            Learn how to activate
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Check if device is "active" (seen within last 7 days)
 */
function isActiveDevice(device) {
  if (!device.lastSeen && !device.createdAt) return true; // No data, assume active
  const lastActivity = new Date(device.lastSeen || device.createdAt);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return lastActivity > sevenDaysAgo;
}

/**
 * Platform-specific icons using SVG
 */
function DeviceIcon({ platform }) {
  const p = platform?.toLowerCase();

  // Apple/macOS icon
  if (p === "darwin" || p === "macos") {
    return (
      <svg
        className="w-5 h-5 text-slate-grey"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    );
  }

  // Windows icon
  if (p === "win32" || p === "windows") {
    return (
      <svg
        className="w-5 h-5 text-slate-grey"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .09v6.81l-6-1.15V13zm17 .25V22l-10-1.91V13.1l10 .15z" />
      </svg>
    );
  }

  // Linux icon
  if (p === "linux") {
    return (
      <svg
        className="w-5 h-5 text-slate-grey"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587.26 1.24.43 1.922.43.682 0 1.335-.17 1.922-.43.238.482.682.83 1.208.946.75.2 1.69-.004 2.616-.47.865-.465 1.964-.4 2.774-.6.405-.131.766-.267.94-.601.174-.34.142-.804-.106-1.484-.077-.242-.018-.571.04-.97.028-.135.055-.337.055-.536a1.44 1.44 0 00-.132-.602c-.206-.411-.551-.544-.864-.68-.312-.133-.598-.201-.797-.4a3.68 3.68 0 01-.663-.839.424.424 0 00-.11-.135c.123-.805-.009-1.657-.287-2.489-.589-1.771-1.831-3.47-2.716-4.521-.75-1.067-.974-1.928-1.05-3.02-.065-1.491 1.056-5.965-3.17-6.298A5.417 5.417 0 0012.504 0z" />
      </svg>
    );
  }

  // Default computer icon
  return (
    <svg
      className="w-5 h-5 text-slate-grey"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function getPlatformName(platform) {
  const names = {
    darwin: "macOS",
    macos: "macOS",
    win32: "Windows",
    windows: "Windows",
    linux: "Linux",
  };
  return names[platform?.toLowerCase()] || platform;
}

function formatRelativeTime(dateString) {
  if (!dateString) return "unknown";
  const date = new Date(dateString);
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
