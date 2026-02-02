/**
 * Team Management Page (Business Only)
 *
 * Manage team members, seats, and permissions.
 * Fetches account data from DynamoDB to determine access.
 *
 * @see PLG User Journey - Section 2.6
 * @see PLG Pricing v4 - Business tier includes team management
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";
import TeamManagement from "./TeamManagement";

export default function TeamPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [accountData, setAccountData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Fetch account data from DynamoDB
  useEffect(() => {
    async function fetchAccountData() {
      if (!user) return;

      try {
        const session = await getSession();
        if (!session?.idToken) {
          setDataLoading(false);
          return;
        }

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
        console.error("[TeamPage] Failed to fetch account data:", error);
      } finally {
        setDataLoading(false);
      }
    }

    if (user && !isLoading) {
      fetchAccountData();
    }
  }, [user, isLoading]);

  const accountType = accountData?.accountType;

  useEffect(() => {
    // Redirect non-business users (per v4 pricing: only business has team features)
    if (!dataLoading && accountData && accountType !== "business") {
      router.push("/portal");
    }
  }, [dataLoading, accountData, accountType, router]);

  if (isLoading || !user || dataLoading) {
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

