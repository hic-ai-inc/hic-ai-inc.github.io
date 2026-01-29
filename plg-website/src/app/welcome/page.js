/**
 * Welcome Page - Redirect Handler
 *
 * This route exists for backwards compatibility only.
 * The normal flow goes directly to /welcome/complete after Stripe checkout.
 *
 * If someone lands here with a session_id (old links), redirect to /complete.
 * Otherwise, redirect to /pricing.
 *
 * @see PLG User Journey - Section 2.4
 */

import { redirect } from "next/navigation";

export const metadata = {
  title: "Welcome to Mouse",
  description: "Set up your Mouse account and get started",
};

export default async function WelcomePage({ searchParams }) {
  const params = await searchParams;
  const sessionId = params?.session_id;

  // If we have a session_id, this is from an old link - redirect to complete
  if (sessionId) {
    redirect(`/welcome/complete?session_id=${sessionId}`);
  }

  // No session_id - redirect to pricing
  redirect("/pricing");
}
