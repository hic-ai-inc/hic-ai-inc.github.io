/**
 * License Management Page
 *
 * Display and manage license key.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { AUTH0_NAMESPACE, LICENSE_STATUS_DISPLAY } from "@/lib/constants";
import { useUser } from "@/lib/cognito-provider";
import CopyLicenseButton from "./CopyLicenseButton";

export default function LicensePage() {
  const { user, isLoading } = useUser();

  if (isLoading || !user) {
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

  const namespace = AUTH0_NAMESPACE;
  const licenseKey = user[`${namespace}/license_key`] || "XXXX-XXXX-XXXX-XXXX";
  const licenseStatus = user[`${namespace}/license_status`] || "ACTIVE";
  const accountType = user[`${namespace}/account_type`] || "individual";
  const expiresAt = user[`${namespace}/license_expires`];

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
            <CopyLicenseButton licenseKey={licenseKey} />
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
            <div>
              <dt className="text-sm text-slate-grey">Issued</dt>
              <dd className="text-frost-white">January 22, 2026</dd>
            </div>
            {expiresAt && (
              <div>
                <dt className="text-sm text-slate-grey">Expires</dt>
                <dd className="text-frost-white">{expiresAt}</dd>
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
                <a
                  href="https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse"
                  className="text-cerulean-mist hover:text-frost-white"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mouse extension
                </a>{" "}
                from VS Code Marketplace
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <span>
                Open VS Code Settings (
                <code className="text-cerulean-mist">Cmd/Ctrl + ,</code>)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <span>
                Search for{" "}
                <code className="text-cerulean-mist">mouse.licenseKey</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center text-sm font-semibold">
                4
              </span>
              <span>Paste your license key and restart VS Code</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
