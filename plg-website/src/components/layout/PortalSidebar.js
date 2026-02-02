/**
 * Portal Sidebar Component
 *
 * Navigation sidebar for authenticated portal pages.
 * Fetches account data from DynamoDB via /api/portal/status to determine
 * which nav items to show (Team page for Business accounts).
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";
import {
  PORTAL_NAV,
  PORTAL_NAV_BUSINESS,
} from "@/lib/constants";

// Nav items restricted to admin/owner only (business accounts)
const ADMIN_ONLY_PATHS = ["/portal/billing", "/portal/team"];

export default function PortalSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [accountData, setAccountData] = useState(null);

  // Fetch account data from DynamoDB via status API
  useEffect(() => {
    async function fetchAccountData() {
      if (!user) return;

      try {
        const session = await getSession();
        if (!session?.idToken) return;

        const response = await fetch("/api/portal/status", {
          headers: {
            Authorization: `Bearer ${session.idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAccountData(data);
        }
      } catch (error) {
        console.error("[PortalSidebar] Failed to fetch account data:", error);
      }
    }

    fetchAccountData();
  }, [user]);

  // Get account type and role from DynamoDB data (not JWT claims)
  const accountType = accountData?.accountType || "individual";
  const orgRole = accountData?.orgMembership?.role || "owner"; // Default to owner if no membership data

  // Select base nav items based on account type
  let navItems =
    accountType === "business" ? PORTAL_NAV_BUSINESS : PORTAL_NAV;

  // For business accounts, filter out admin-only pages for regular members
  if (accountType === "business" && orgRole === "member") {
    navItems = navItems.filter((item) => !ADMIN_ONLY_PATHS.includes(item.href));
  }

  return (
    <aside className="w-64 min-h-screen bg-midnight-navy border-r border-card-border">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-card-border">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center overflow-hidden rounded">
            <Image
              src="/images/mouse-logo.png"
              alt="Mouse Logo"
              width={96}
              height={96}
              priority
              className="h-20 w-20 scale-100"
              style={{ objectFit: "none", objectPosition: "center 55%" }}
            />
          </div>
          <span className="text-xl font-bold tracking-wider text-frost-white">
            MOUSE
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-card-bg text-frost-white border border-card-border"
                      : "text-slate-grey hover:text-frost-white hover:bg-card-bg"
                  }`}
                >
                  <NavIcon name={item.icon} className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      <div className="absolute bottom-0 left-0 right-0 w-64 p-4 border-t border-card-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-cerulean-mist/20 flex items-center justify-center">
            <span className="text-sm font-medium text-cerulean-mist">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-frost-white truncate">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-slate-grey truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-2 text-sm text-slate-grey hover:text-frost-white transition-colors w-full text-left"
        >
          <LogoutIcon className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function NavIcon({ name, className }) {
  const icons = {
    dashboard: (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    ),
    key: (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        />
      </svg>
    ),
    devices: (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    "credit-card": (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
    receipt: (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
        />
      </svg>
    ),
    settings: (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    users: (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
  };

  return icons[name] || null;
}

function LogoutIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}
