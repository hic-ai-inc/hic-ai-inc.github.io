/**
 * Team Management Page (Business Only)
 *
 * Manage team members, seats, and permissions.
 *
 * @see PLG User Journey - Section 2.6
 * @see PLG Pricing v4 - Business tier includes team management
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AUTH_NAMESPACE } from "@/lib/constants";
import { useUser } from "@/lib/cognito-provider";
import TeamManagement from "./TeamManagement";

export default function TeamPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const namespace = AUTH_NAMESPACE;

  const accountType = user?.[`${namespace}/account_type`];

  useEffect(() => {
    // Redirect non-business users (per v4 pricing: only business has team features)
    if (!isLoading && user && accountType !== "business") {
      router.push("/portal");
    }
  }, [isLoading, user, accountType, router]);

  if (isLoading || !user) {
    return (
      <div className="max-w-5xl">
        <div className="animate-pulse">
          <div className="h-8 bg-card-bg rounded w-48 mb-4"></div>
          <div className="h-64 bg-card-bg rounded-lg"></div>
        </div>
      </div>
    );
  }

  // Don't render for non-business (redirect will happen)
  if (accountType !== "business") {
    return null;
  }

  return (
    <div className="max-w-5xl">
      <TeamManagement initialUserId={user.sub} />
    </div>
  );
}

