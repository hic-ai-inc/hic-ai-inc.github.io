/**
 * License Management Page
 *
 * Display and manage license key.
 * Fetches license data from /api/portal/license API.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { LICENSE_STATUS_DISPLAY, formatLicenseKeyForDisplay, EXTERNAL_URLS, MARKETPLACE_ENABLED } from "@/lib/constants";
import { useUser } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";
import CopyLicenseButton from "./CopyLicenseButton";

export default function LicensePage() {
  const { user, isLoading: userLoading } = useUser();
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchLicense() {
      if (!user) return;

      try {
        const session = await getSession();
        if (!session?.idToken) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/portal/license", {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${session.idToken}`,
          },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch license");
        }

        const data = await res.json();
        setLicense(data.license);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (user && !userLoading) {
      fetchLicense();
    }
  }, [user, userLoading]);

  // Loading state
  if (userLoading || loading) {
    return (
      <div className="max-w-4xl">
        <div className="animate-pulse">
          <div className="h-8 bg-card-bg rounded w-48 mb-4"></div>
          <div className="h-4 bg-card-bg rounded w-80 mb-8"></div>
          <div className="h-48 bg-card-bg rounded-lg mb-6"></div>
          <div className="h-48 bg-card-bg rounded-lg"></div>
        </div>
      </div>
    );
  }

  // No license - show purchase CTA
  if (!license) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-frost-white">License</h1>
          <p className="text-slate-grey mt-1">
            Your Mouse license key and activation status
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-silver mb-4">
              {error || "You don't have a license yet."}
            </p>
            <Link href="/checkout/individual">
              <Button>Get Started</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fullLicenseKey = license.licenseKey || "";
  const licenseKey = formatLicenseKeyForDisplay(fullLicenseKey);
  const licenseStatus = license.status?.toUpperCase() || "ACTIVE";
  const accountType = license.planName || license.accountType || "Individual";
  const expiresAt = license.expiresAt;
  const issuedAt = license.createdAt;

  const statusDisplay =
    LICENSE_STATUS_DISPLAY[licenseStatus] || LICENSE_STATUS_DISPLAY.ACTIVE;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">License</h1>
        <p className="text-slate-grey mt-1">
          Your Mouse license key and activation status
        </p>
      </div>

      {/* License Key Card */}
      <Card className="mb-6">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>License Key</CardTitle>
          <Badge variant={statusDisplay.variant}>{statusDisplay.label}</Badge>
        </CardHeader>
        <CardContent>
          <div className="bg-midnight-navy rounded-lg p-4 mb-4 font-mono text-lg text-cerulean-mist border border-card-border">
            {licenseKey}
          </div>
          <div className="flex items-center gap-4">
            <CopyLicenseButton licenseKey={fullLicenseKey} />
            <Button variant="ghost" size="sm">
              Regenerate Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* License Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>License Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-slate-grey">Plan</dt>
              <dd className="text-frost-white font-medium capitalize">
                {accountType}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-grey">Status</dt>
              <dd>
                <Badge variant={statusDisplay.variant}>
                  {statusDisplay.label}
                </Badge>
              </dd>
            </div>
            {issuedAt && (
              <div>
                <dt className="text-sm text-slate-grey">Issued</dt>
                <dd className="text-frost-white">
                  {new Date(issuedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
            )}
            {expiresAt && (
              <div>
                <dt className="text-sm text-slate-grey">Expires</dt>
                <dd className="text-frost-white">
                  {new Date(expiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Installation Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Activate</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4 text-silver">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                1
              </span>
              <span>
                Install the{" "}
                {MARKETPLACE_ENABLED ? (
                  <a
                    href={EXTERNAL_URLS.marketplace}
                    className="text-cerulean-mist hover:text-frost-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Mouse extension
                  </a>
                ) : (
                  <Link
                    href="/docs/installation"
                    className="text-cerulean-mist hover:text-frost-white"
                  >
                    Mouse extension
                  </Link>
                )}{" "}
                {MARKETPLACE_ENABLED ? "from VS Code Marketplace" : "(see installation guide)"}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <span>
                Open the Command Palette (
                <code className="text-cerulean-mist">Ctrl+Shift+P</code>) and run{" "}
                <code className="text-cerulean-mist">Mouse: Initialize Workspace</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <span>
                Open the Command Palette again and run{" "}
                <code className="text-cerulean-mist">Mouse: Enter License Key</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                4
              </span>
              <span>Paste your license key from above when prompted</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
