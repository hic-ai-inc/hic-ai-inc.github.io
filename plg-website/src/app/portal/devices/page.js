/**
 * Device Management Page
 *
 * View and manage activated devices.
 * Fetches real device data from /api/portal/devices.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [maxDevices, setMaxDevices] = useState(3);
  const [licenseId, setLicenseId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deactivating, setDeactivating] = useState(null);

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
      setLicenseId(data.licenseId || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate(machineId) {
    if (!licenseId) return;

    const confirmed = window.confirm(
      "Are you sure you want to deactivate this device? You can reactivate it later.",
    );
    if (!confirmed) return;

    try {
      setDeactivating(machineId);
      const res = await fetch("/api/portal/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, licenseId }),
      });

      if (!res.ok) {
        throw new Error("Failed to deactivate device");
      }

      // Refresh the device list
      await fetchDevices();
    } catch (err) {
      alert("Failed to deactivate device: " + err.message);
    } finally {
      setDeactivating(null);
    }
  }

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
          <p className="text-slate-grey mt-1">Manage your activated devices</p>
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
          Manage your activated devices ({devices.length} of {maxDevices} used)
        </p>
      </div>

      {/* Usage Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-grey">Device Activations</span>
            <span className="text-sm text-frost-white">
              {devices.length} / {maxDevices}
            </span>
          </div>
          <div className="h-2 bg-card-border rounded-full overflow-hidden">
            <div
              className="h-full bg-cerulean-mist rounded-full transition-all"
              style={{ width: `${(devices.length / maxDevices) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Device List */}
      <div className="space-y-4">
        {devices.map((device) => (
          <Card key={device.id}>
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
                <div className="flex items-center gap-3">
                  <Badge variant="success">Active</Badge>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeactivate(device.id)}
                    disabled={deactivating === device.id}
                  >
                    {deactivating === device.id ? "..." : "Deactivate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {devices.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-slate-grey mb-4">No devices activated yet.</p>
              <p className="text-sm text-slate-grey">
                Install Mouse in VS Code and enter your license key to activate.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Device CTA */}
      {devices.length < maxDevices && devices.length > 0 && (
        <div className="mt-6 p-6 border-2 border-dashed border-card-border rounded-2xl text-center">
          <p className="text-slate-grey mb-4">
            You can activate {maxDevices - devices.length} more{" "}
            {maxDevices - devices.length === 1 ? "device" : "devices"}.
          </p>
          <Button href="/docs/getting-started" variant="secondary">
            Learn How to Activate
          </Button>
        </div>
      )}
    </div>
  );
}

function DeviceIcon({ platform }) {
  const icons = {
    darwin: "🍎",
    macos: "🍎",
    win32: "🪟",
    windows: "🪟",
    linux: "🐧",
  };
  return (
    <span className="text-xl">{icons[platform?.toLowerCase()] || "💻"}</span>
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
