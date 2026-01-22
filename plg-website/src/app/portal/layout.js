/**
 * Portal Layout
 *
 * Authenticated layout with sidebar navigation.
 * Wraps all /portal/* pages.
 */

import { getSession } from "@auth0/nextjs-auth0";
import { redirect } from "next/navigation";
import { PortalSidebar } from "@/components/layout";

export const metadata = {
  title: "Portal",
};

export default async function PortalLayout({ children }) {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login?returnTo=/portal");
  }

  return (
    <div className="flex min-h-screen bg-midnight-navy">
      <PortalSidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
