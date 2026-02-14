/**
 * Device Status Page
 *
 * Read-only view of activated devices.
 * Devices are auto-populated by Mouse heartbeat data.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { useUser } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";
import {
  DEFAULT_MAX_DEVICES,
  getMaxDevicesForAccountType,
} from "@/lib/constants";
import DeviceIcon from "./_components/DeviceIcon";
import {
  isActiveDevice,
  getPlatformName,
  formatRelativeTime,
} from "./_lib/device-utils";

export default function DevicesPage() {
  const { user, isLoading: userLoading } = useUser();
  const [devices, setDevices] = useState([]);
  const [maxDevices, setMaxDevices] = useState(DEFAULT_MAX_DEVICES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [totalActiveDevices, setTotalActiveDevices] = useState(null);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await getSession();
      if (!session) {
        setError("Session not found. Please sign in again.");
        return;
      }

      if (!session.idToken) {
        setError("Authentication token missing. Please refresh and try again.");
        return;
      }

      const res = await fetch("/api/portal/devices", {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.idToken}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch devices");
      }

      const data = await res.json();
      const fallbackMax = getMaxDevicesForAccountType(user?.accountType);
      setDevices(data.devices || []);
      setMaxDevices(data.maxDevices || fallbackMax || DEFAULT_MAX_DEVICES);
      setTotalActiveDevices(
        typeof data.totalActiveDevices === "number"
          ? data.totalActiveDevices
          : null,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.accountType]);

  useEffect(() => {
    if (user && !userLoading) {
      fetchDevices();
    }
  }, [user, userLoading, fetchDevices]);

  // Filter devices by active status (active = seen within 2-hour window)
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
          {typeof totalActiveDevices === "number" && (
            <p className="mt-3 text-xs text-slate-grey">
              {totalActiveDevices} active {totalActiveDevices === 1 ? "device" : "devices"} across your team
            </p>
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
