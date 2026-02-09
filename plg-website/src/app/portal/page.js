/**
 * Customer Portal - Dashboard
 *
 * Shows license status, device activations, and quick actions.
 * Authentication handled by portal layout.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { EXTERNAL_URLS, LICENSE_STATUS_DISPLAY } from "@/lib/constants";
import { useUser } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";

export default function PortalDashboardPage() {
  const { user, isLoading } = useUser();
  const [portalStatus, setPortalStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Check subscription status
  useEffect(() => {
    async function checkStatus() {
      if (!user) return;

      try {
        const session = await getSession();
        if (!session?.idToken) {
          setStatusLoading(false);
          return;
        }

        const response = await fetch("/api/portal/status", {
          headers: {
            Authorization: `Bearer ${session.idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPortalStatus(data);
        }
      } catch (error) {
        console.error("[Portal] Failed to check status:", error);
      } finally {
        setStatusLoading(false);
      }
    }

    if (user && !isLoading) {
      checkStatus();
    }
  }, [user, isLoading]);

  // Show loading while checking auth and subscription status
  if (isLoading || !user || statusLoading) {
    return (
      <div className="max-w-6xl">
        <div className="animate-pulse">
          <div className="h-8 bg-card-bg rounded w-64 mb-4"></div>
          <div className="h-4 bg-card-bg rounded w-96 mb-8"></div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="h-40 bg-card-bg rounded-lg"></div>
            <div className="h-40 bg-card-bg rounded-lg"></div>
            <div className="h-40 bg-card-bg rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  // Check if user has an active subscription
  const hasSubscription = portalStatus?.hasSubscription || false;
  const subscriptionStatus = portalStatus?.subscriptionStatus || "none";
  const accountType = portalStatus?.accountType || "individual";

  // Get display name - prefer name from Cognito (Google signups have it), 
  // but for email signups fall back to email username
  // The "-" check handles Cognito's auto-generated usernames like "abc123-def456"
  const displayName =
    user.name && !user.name.includes("-") && !user.name.includes("@")
      ? user.name.split(" ")[0]
      : user.email?.split("@")[0] || "";

  // New user without subscription - show Get Started state
  if (!hasSubscription) {
    return <NewUserDashboard displayName={displayName} user={user} />;
  }

  // Existing user with subscription - show full dashboard
  return (
    <ActiveUserDashboard
      displayName={displayName}
      user={user}
      portalStatus={portalStatus}
      accountType={accountType}
      subscriptionStatus={subscriptionStatus}
    />
  );
}

/**
 * Dashboard for new users without a subscription
 */
function NewUserDashboard({ displayName, user }) {
  return (
    <div className="max-w-6xl">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">
          Welcome{displayName ? `, ${displayName}` : ""}!
        </h1>
        <p className="text-slate-grey mt-1">
          Get started with Mouse to supercharge your editing workflow
        </p>
      </div>

      {/* Get Started CTA */}
      <Card className="mb-8 border-cerulean-mist/30 bg-gradient-to-br from-cerulean-mist/5 to-transparent">
        <CardContent className="py-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="mb-6">
              <Image
                src="/images/mouse-logo.png"
                alt="Mouse"
                width={96}
                height={96}
                className="mx-auto"
              />
            </div>
            <h2 className="text-2xl font-bold text-frost-white mb-3">
              Activate Your Mouse License
            </h2>
            <p className="text-silver mb-6">
              Purchase a license to unlock all of Mouse&apos;s powerful editing
              features. Try free for 14 days, or install from the VS Code
              Marketplace to explore.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/checkout/individual">
                <Button size="lg" className="w-full sm:w-auto">
                  Activate License
                </Button>
              </Link>
              <a
                href={EXTERNAL_URLS.marketplace}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Try Free via Marketplace
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* License Status */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>License</CardTitle>
            <Badge variant="default">No License</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-slate-grey text-sm mb-4">
              You don&apos;t have an active license yet.
            </p>
            <Link
              href="/pricing"
              className="text-cerulean-mist hover:text-frost-white text-sm"
            >
              View pricing →
            </Link>
          </CardContent>
        </Card>

        {/* Devices */}
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline space-x-2 mb-4">
              <span className="text-4xl font-bold text-frost-white">0</span>
              <span className="text-slate-grey">activated</span>
            </div>
            <p className="text-slate-grey text-sm">
              Activate a license to use Mouse on up to 3 devices.
            </p>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-grey text-sm mb-2">{user.email}</p>
            <Link
              href="/portal/settings"
              className="text-cerulean-mist hover:text-frost-white text-sm"
            >
              Manage settings →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Getting Started Guide */}
      <div className="bg-gradient-to-r from-cerulean-mist/10 to-info/10 rounded-2xl p-6 border border-cerulean-mist/20">
        <h2 className="text-lg font-semibold text-frost-white mb-2">
          🚀 Getting Started with Mouse
        </h2>
        <p className="text-silver mb-4">
          New to Mouse? Here&apos;s how to get started:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-silver">
          <li>Purchase a license or start a free trial</li>
          <li>Install the Mouse extension from the VS Code Marketplace</li>
          <li>Copy your license key and activate in VS Code settings</li>
          <li>Start editing with precision!</li>
        </ol>
        <Link
          href="/docs/quickstart"
          className="inline-block mt-4 text-cerulean-mist hover:text-frost-white transition-colors"
        >
          Read the full guide →
        </Link>
      </div>
    </div>
  );
}

/**
 * Dashboard for users with an active subscription
 */
function ActiveUserDashboard({
  displayName,
  user,
  portalStatus,
  accountType,
  subscriptionStatus,
}) {
  const statusDisplay =
    LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()] ||
    LICENSE_STATUS_DISPLAY.ACTIVE;
  const maxDevices = portalStatus?.maxDevices || (accountType === "business" ? 5 : 3);
  const activatedDevices = portalStatus?.activatedDevices || 0;

  // Check if user is org owner (for billing access)
  const isOrgMember = portalStatus?.isOrgMember || false;
  const orgRole = portalStatus?.orgMembership?.role;
  const isOrgOwner = !isOrgMember || orgRole === "owner";

  return (
    <div className="max-w-6xl">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">
          Welcome back{displayName ? `, ${displayName}` : ""}!
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
              {accountType === "business" ? "Business" : "Individual"} Plan
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

        {/* Billing - Only accessible to subscription owners */}
        <Card className={!isOrgOwner ? "opacity-60" : ""}>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-grey text-sm mb-4">
              {!isOrgOwner
                ? "Managed by subscription owner"
                : subscriptionStatus === "active" ||
                    subscriptionStatus === "trialing"
                  ? "Subscription active"
                  : "No active subscription"}
            </p>
            {isOrgOwner ? (
              <Link
                href="/portal/billing"
                className="text-cerulean-mist hover:text-frost-white text-sm"
              >
                Manage billing →
              </Link>
            ) : (
              <span className="text-slate-grey/50 text-sm cursor-not-allowed">
                Billing access restricted
              </span>
            )}
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
            <QuickActionLink
              href="/portal/license"
              icon="📋"
              label="Copy License Key"
            />
            <QuickActionLink
              href="/portal/devices"
              icon="💻"
              label="Manage Devices"
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
          href="/docs/quickstart"
          className="inline-block mt-4 text-cerulean-mist hover:text-frost-white transition-colors"
        >
          Read the full guide →
        </Link>
      </div>
    </div>
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
