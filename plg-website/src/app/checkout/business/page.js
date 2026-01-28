/**
 * Business Plan Checkout
 *
 * Auth-gated checkout flow for Business plan ($35/seat/mo).
 * Users must sign in to purchase. Free trials are available via
 * VS Code Marketplace or npx installation.
 *
 * @see PLG User Journey - Section 2.3
 */

"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Badge,
} from "@/components/ui";
import { PRICING, EXTERNAL_URLS } from "@/lib/constants";

// Loading fallback for Suspense
function CheckoutLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-card-bg rounded w-64 mx-auto mb-4" />
          <div className="h-4 bg-card-bg rounded w-48 mx-auto" />
        </div>
      </div>
    </div>
  );
}

// Wrapper component with Suspense
export default function BusinessCheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <BusinessCheckoutContent />
    </Suspense>
  );
}

// Main checkout content (uses useSearchParams)
function BusinessCheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useUser();
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [seats, setSeats] = useState(1);
  const [promoCode, setPromoCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const plan = PRICING.business;
  const pricePerSeat = plan.pricePerSeat;
  const annualPricePerSeat = pricePerSeat * 10; // 2 months free
  const monthlyTotal = pricePerSeat * seats;
  const annualTotal = annualPricePerSeat * seats;
  const price = billingCycle === "annual" ? annualTotal : monthlyTotal;
  const savings =
    billingCycle === "annual"
      ? (pricePerSeat * 12 - annualPricePerSeat) * seats
      : 0;

  // Support returnTo for deep-linking from editor extensions
  const returnTo = searchParams.get("returnTo");

  const handleSignIn = () => {
    // Store return URL so we come back here after auth
    if (typeof window !== "undefined") {
      sessionStorage.setItem("auth_returnTo", window.location.href);
    }
    router.push("/auth/login");
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Get the current session for the auth token
      const session = await getSession();
      if (!session?.idToken) {
        throw new Error("Please sign in to continue");
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.idToken}`,
        },
        body: JSON.stringify({
          plan: "business",
          billingCycle,
          email: user?.email,
          seats,
          promoCode: promoCode || undefined,
          returnTo: returnTo || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-frost-white mb-2">
          Mouse Business
        </h1>
        <p className="text-xl text-silver">
          Team-wide precision editing with management controls
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Plan Details */}
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>What&apos;s Included</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-silver">
                    <span className="text-success mt-0.5">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Volume Discounts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-silver text-sm">
                <li>50+ seats: 10% off</li>
                <li>100+ seats: 15% off</li>
                <li>500+ seats: 20% off</li>
              </ul>
              <p className="text-slate-grey text-xs mt-3">
                Volume discounts applied automatically at checkout
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Checkout Form - Auth Gated */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>
                {user ? "Complete Your Order" : "Sign In to Continue"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!user ? (
                /* Not signed in - show auth prompt */
                <div className="space-y-6">
                  <p className="text-silver">
                    Create an account or sign in to activate your team license.
                    After purchase, you&apos;ll have instant access to your license
                    keys and team management portal.
                  </p>

                  <div className="space-y-3">
                    <Button onClick={handleSignIn} className="w-full" size="lg">
                      Sign In to Continue
                    </Button>
                    <Button
                      onClick={handleSignIn}
                      variant="outline"
                      className="w-full"
                    >
                      Create Account
                    </Button>
                  </div>

                  {/* Price preview */}
                  <div className="border-t border-card-border pt-4">
                    <div className="flex justify-between text-silver mb-1">
                      <span>Per seat (monthly)</span>
                      <span>${plan.pricePerSeat}/mo</span>
                    </div>
                    <div className="flex justify-between text-silver">
                      <span>Per seat (annual)</span>
                      <span>
                        ${plan.pricePerSeat * 10}/yr{" "}
                        <span className="text-success text-sm">(save 17%)</span>
                      </span>
                    </div>
                  </div>

                  {/* Off-ramp */}
                  <div className="border-t border-card-border pt-4">
                    <p className="text-sm text-slate-grey text-center mb-3">
                      Not ready to purchase?
                    </p>
                    <div className="flex flex-col gap-2 text-center">
                      <a
                        href={EXTERNAL_URLS.marketplace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cerulean-mist hover:underline text-sm"
                      >
                        Try free from VS Code Marketplace →
                      </a>
                      <Link
                        href="/docs/installation"
                        className="text-cerulean-mist hover:underline text-sm"
                      >
                        Or install with npx in any editor →
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                /* Signed in - show checkout form */
                <form onSubmit={handleCheckout} className="space-y-6">
                  {/* Signed in indicator */}
                  <div className="p-3 bg-success/10 rounded-lg border border-success/30">
                    <p className="text-sm text-slate-grey">Signed in as</p>
                    <p className="text-frost-white font-medium">{user.email}</p>
                  </div>

                {/* Billing Cycle Toggle */}
                <div>
                  <label className="block text-sm text-slate-grey mb-2">
                    Billing Cycle
                  </label>
                  <div className="flex rounded-lg overflow-hidden border border-card-border">
                    <button
                      type="button"
                      onClick={() => setBillingCycle("monthly")}
                      className={`flex-1 py-2 px-4 text-sm transition-colors ${
                        billingCycle === "monthly"
                          ? "bg-cerulean-mist text-midnight-navy"
                          : "bg-card-bg text-silver hover:bg-card-border"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingCycle("annual")}
                      className={`flex-1 py-2 px-4 text-sm transition-colors ${
                        billingCycle === "annual"
                          ? "bg-cerulean-mist text-midnight-navy"
                          : "bg-card-bg text-silver hover:bg-card-border"
                      }`}
                    >
                      Annual (Save 17%)
                    </button>
                  </div>
                </div>

                {/* Seats */}
                <div>
                  <label className="block text-sm text-slate-grey mb-2">
                    Number of Seats
                  </label>
                  <Input
                    type="number"
                    min={plan.minSeats}
                    value={seats}
                    onChange={(e) =>
                      setSeats(
                        Math.max(plan.minSeats, parseInt(e.target.value) || 1),
                      )
                    }
                  />
                  <p className="text-xs text-slate-grey mt-1">
                    {plan.maxConcurrentMachinesPerSeat} machines per seat
                  </p>
                </div>

                {/* Promo Code */}
                <Input
                  label="Promo Code (optional)"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="EARLYBIRD"
                />

                {/* Price Summary */}
                <div className="border-t border-card-border pt-4">
                  <div className="flex justify-between text-silver mb-2">
                    <span>
                      {seats} seat{seats > 1 ? "s" : ""} × $
                      {billingCycle === "annual"
                        ? annualPricePerSeat
                        : pricePerSeat}
                      /{billingCycle === "annual" ? "yr" : "mo"}
                    </span>
                    <span>
                      ${price}
                      {billingCycle === "annual" ? "/yr" : "/mo"}
                    </span>
                  </div>
                  {savings > 0 && (
                    <div className="flex justify-between text-success text-sm">
                      <span>Annual savings</span>
                      <span>-${savings}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-frost-white font-bold text-lg mt-2 pt-2 border-t border-card-border">
                    <span>Total</span>
                    <span>
                      ${price}
                      <span className="text-sm font-normal text-silver">
                        /{billingCycle === "annual" ? "yr" : "mo"}
                      </span>
                    </span>
                  </div>

                </div>

                {error && (
                  <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Activate License"}
                </Button>

                <p className="text-xs text-center text-slate-grey">
                  By continuing, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="text-cerulean-mist hover:underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-cerulean-mist hover:underline"
                  >
                    Privacy Policy
                  </Link>
                </p>

                {/* Off-ramp */}
                <div className="border-t border-card-border pt-4 text-center">
                  <p className="text-sm text-slate-grey mb-2">
                    Want to try before you buy?
                  </p>
                  <a
                    href={EXTERNAL_URLS.marketplace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cerulean-mist hover:underline text-sm"
                  >
                    Get a free 14-day trial from the Marketplace →
                  </a>
                </div>
              </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
