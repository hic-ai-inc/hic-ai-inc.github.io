/**
 * Team Management Page (Team/Enterprise Only)
 *
 * Manage team members, seats, and permissions.
 *
 * @see PLG User Journey - Section 2.6
 * @see PLG Pricing v4 - Team tier includes team management
 */

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AUTH0_NAMESPACE } from "@/lib/constants";
import TeamManagement from "./TeamManagement";

export const metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const session = await getSession();
  const user = session.user;
  const namespace = AUTH0_NAMESPACE;

  const accountType = user[`${namespace}/account_type`];

  // Redirect non-team users (per v4 pricing: team and enterprise have team features)
  if (accountType !== "team" && accountType !== "enterprise") {
    redirect("/portal");
  }

  return (
    <div className="max-w-5xl">
      <TeamManagement initialUserId={user.sub} />
    </div>
  );
}
