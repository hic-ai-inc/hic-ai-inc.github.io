/**
 * Individual Plan Checkout
 *
 * Auth-gated checkout flow for Individual plan ($15/mo or $150/year).
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
export default function IndividualCheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <IndividualCheckoutContent />
    </Suspense>
  );
}

// Main checkout content (uses useSearchParams)
function IndividualCheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login } = useUser();
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [promoCode, setPromoCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Support returnTo for deep-linking from editor extensions
  const returnTo = searchParams.get("returnTo");

  const plan = PRICING.individual;
  const price =
    billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  const savings =
    billingCycle === "annual" ? plan.priceMonthly * 12 - plan.priceAnnual : 0;

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
          plan: "individual",
          billingCycle,
          email: user?.email,
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

  // Loading state
  if (isLoading) {
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

  return (
    <div className="max-w-4xl mx-auto px-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-frost-white mb-2">
          Mouse Individual
        </h1>
        <p className="text-xl text-silver">
          Professional-grade precision editing for solo developers
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
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="font-medium text-frost-white">
                    Secure checkout via Stripe
                  </p>
                  <p className="text-sm text-slate-grey">
                    Your payment info is never stored on our servers
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Checkout Form - Auth Gated */}
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
                  Create an account or sign in to activate your license. After
                  purchase, you&apos;ll have instant access to your license key
                  and admin portal.
                </p>

                <div className="space-y-3">
                  <Button
                    onClick={handleSignIn}
                    className="w-full"
                    size="lg"
                  >
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
                    <span>Monthly</span>
                    <span>${plan.priceMonthly}/mo</span>
                  </div>
                  <div className="flex justify-between text-silver">
                    <span>Annual</span>
                    <span>
                      ${plan.priceAnnual}/yr{" "}
                      <span className="text-success text-sm">
                        (save ${plan.priceMonthly * 12 - plan.priceAnnual})
                      </span>
                    </span>
                  </div>
                </div>

                {/* Off-ramp for users not ready to purchase */}
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
                  <label className="block text-sm font-medium text-frost-white mb-3">
                    Billing Cycle
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBillingCycle("monthly")}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        billingCycle === "monthly"
                          ? "border-cerulean-mist bg-cerulean-mist/10"
                          : "border-card-border hover:border-card-border/80"
                      }`}
                    >
                      <p className="font-semibold text-frost-white">Monthly</p>
                      <p className="text-2xl font-bold text-frost-white">
                        ${plan.priceMonthly}
                        <span className="text-sm font-normal text-slate-grey">
                          /mo
                        </span>
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingCycle("annual")}
                      className={`p-4 rounded-lg border-2 transition-all relative ${
                        billingCycle === "annual"
                          ? "border-cerulean-mist bg-cerulean-mist/10"
                          : "border-card-border hover:border-card-border/80"
                      }`}
                    >
                      <Badge
                        variant="success"
                        className="absolute -top-2 -right-2 text-xs"
                      >
                        Save ${savings}
                      </Badge>
                      <p className="font-semibold text-frost-white">Annual</p>
                      <p className="text-2xl font-bold text-frost-white">
                        ${plan.priceAnnual}
                        <span className="text-sm font-normal text-slate-grey">
                          /yr
                        </span>
                      </p>
                    </button>
                  </div>
                </div>

                {/* Promo Code */}
                <div>
                  <Input
                    label="Promo Code (optional)"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="EARLYADOPTER20"
                  />
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                    {error}
                  </div>
                )}

                {/* Order Summary */}
                <div className="border-t border-card-border pt-4">
                  <div className="flex justify-between text-silver mb-2">
                    <span>Mouse Individual ({billingCycle})</span>
                    <span>${price}</span>
                  </div>
                  <div className="flex justify-between text-frost-white font-semibold text-lg">
                    <span>Total</span>
                    <span>${price}</span>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitting}
                  loading={isSubmitting}
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
  );
}
