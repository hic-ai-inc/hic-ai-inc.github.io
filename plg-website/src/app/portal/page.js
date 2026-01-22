/**
 * Customer Portal - Dashboard
 *
 * Shows license status, device activations, and quick actions.
 * Authentication handled by portal layout.
 *
 * @see PLG User Journey - Section 2.6
 */

import { getSession } from "@auth0/nextjs-auth0";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import {
  AUTH0_NAMESPACE,
  EXTERNAL_URLS,
  LICENSE_STATUS_DISPLAY,
} from "@/lib/constants";

export const metadata = {
  title: "Dashboard",
};

export default async function PortalDashboardPage() {
  const session = await getSession();
  const user = session.user;

  const namespace = AUTH0_NAMESPACE;
  const accountType = user[`${namespace}/account_type`] || "individual";
  const licenseStatus = user[`${namespace}/license_status`] || "ACTIVE";
  const activatedDevices = user[`${namespace}/activated_devices`] || 1;
  const maxDevices = accountType === "enterprise" ? 2 : 3;

  const statusDisplay =
    LICENSE_STATUS_DISPLAY[licenseStatus] || LICENSE_STATUS_DISPLAY.ACTIVE;

  return (
    <div className="max-w-6xl">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">
          Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}!
        </h1>
        <p className="text-slate-grey mt-1">
          Manage your Mouse license and account settings
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* License Status */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>License</CardTitle>
            <Badge variant={statusDisplay.variant}>{statusDisplay.label}</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-slate-grey text-sm mb-4">
              {accountType === "enterprise" ? "Enterprise" : "Individual"} Plan
            </p>
            <Link
              href="/portal/license"
              className="text-cerulean-mist hover:text-frost-white text-sm"
            >
              View license key →
            </Link>
          </CardContent>
        </Card>

        {/* Device Activations */}
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline space-x-2 mb-4">
              <span className="text-4xl font-bold text-frost-white">
                {activatedDevices}
              </span>
              <span className="text-slate-grey">/ {maxDevices} activated</span>
            </div>
            <Link
              href="/portal/devices"
              className="text-cerulean-mist hover:text-frost-white text-sm"
            >
              Manage devices →
            </Link>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-grey text-sm mb-4">
              Next payment: Feb 22, 2026
            </p>
            <Link
              href="/portal/billing"
              className="text-cerulean-mist hover:text-frost-white text-sm"
            >
              Manage billing →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionButton icon="📋" label="Copy License Key" />
            <QuickActionLink
              href="/portal/devices"
              icon="💻"
              label="Add Device"
            />
            <QuickActionLink href="/docs" icon="📖" label="Documentation" />
            <QuickActionLink
              href={EXTERNAL_URLS.support}
              icon="💬"
              label="Get Support"
              external
            />
          </div>
        </CardContent>
      </Card>

      {/* Getting Started Guide */}
      <div className="bg-gradient-to-r from-cerulean-mist/10 to-info/10 rounded-2xl p-6 border border-cerulean-mist/20">
        <h2 className="text-lg font-semibold text-frost-white mb-2">
          🚀 Getting Started with Mouse
        </h2>
        <p className="text-silver mb-4">
          Follow these steps to activate Mouse in VS Code:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-silver">
          <li>Install the Mouse extension from the VS Code Marketplace</li>
          <li>Copy your license key from the License page</li>
          <li>Open VS Code Settings and paste your key</li>
          <li>Restart VS Code to activate</li>
        </ol>
        <Link
          href="/docs/getting-started"
          className="inline-block mt-4 text-cerulean-mist hover:text-frost-white transition-colors"
        >
          Read the full guide →
        </Link>
      </div>
    </div>
  );
}

function QuickActionButton({ icon, label }) {
  return (
    <button className="flex items-center space-x-3 p-4 bg-card-bg hover:bg-card-border/30 border border-card-border rounded-lg transition">
      <span className="text-2xl">{icon}</span>
      <span className="text-frost-white text-sm">{label}</span>
    </button>
  );
}

function QuickActionLink({ href, icon, label, external }) {
  const className =
    "flex items-center space-x-3 p-4 bg-card-bg hover:bg-card-border/30 border border-card-border rounded-lg transition";

  if (external) {
    return (
      <a
        href={href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="text-2xl">{icon}</span>
        <span className="text-frost-white text-sm">{label}</span>
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      <span className="text-2xl">{icon}</span>
      <span className="text-frost-white text-sm">{label}</span>
    </Link>
  );
}
