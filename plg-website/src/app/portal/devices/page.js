/**
 * Device Management Page
 *
 * View and manage activated devices.
 *
 * @see PLG User Journey - Section 2.6
 */

import { getSession } from "@/lib/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { AUTH0_NAMESPACE } from "@/lib/constants";

export const metadata = {
  title: "Devices",
};

// Mock device data - in production this would come from Keygen API
const mockDevices = [
  {
    id: "dev_1",
    name: "MacBook Pro",
    fingerprint: "abc123...",
    lastSeen: "2026-01-22T10:30:00Z",
    platform: "darwin",
    vsCodeVersion: "1.96.0",
    activated: true,
  },
];

export default async function DevicesPage() {
  const session = await getSession();
  const user = session.user;
  const namespace = AUTH0_NAMESPACE;

  const accountType = user[`${namespace}/account_type`] || "individual";
  const maxDevices = accountType === "enterprise" ? 2 : 3;
  const devices = mockDevices; // Would fetch from API

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
                      {device.name}
                    </h3>
                    <p className="text-sm text-slate-grey">
                      VS Code {device.vsCodeVersion} • Last seen{" "}
                      {formatRelativeTime(device.lastSeen)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="success">Active</Badge>
                  <Button variant="danger" size="sm">
                    Deactivate
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
      {devices.length < maxDevices && (
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
    win32: "🪟",
    linux: "🐧",
  };
  return <span className="text-xl">{icons[platform] || "💻"}</span>;
}

function formatRelativeTime(dateString) {
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
