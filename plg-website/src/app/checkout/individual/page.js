/**
 * Individual Plan Checkout
 *
 * Checkout flow for Individual plan ($10/mo or $100/year).
 * Supports guest checkout with optional account creation.
 *
 * @see PLG User Journey - Section 2.3
 */

"use client";

import { useState } from "react";
import { useUser } from "@/lib/cognito-provider";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Badge,
} from "@/components/ui";
import { PRICING } from "@/lib/constants";

export default function IndividualCheckoutPage() {
  const { user, isLoading } = useUser();
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [email, setEmail] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const plan = PRICING.individual;
  const price =
    billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  const savings =
    billingCycle === "annual" ? plan.priceMonthly * 12 - plan.priceAnnual : 0;

  const handleCheckout = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "individual",
          billingCycle,
          email: user?.email || email,
          promoCode: promoCode || undefined,
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
        <Badge variant="info" className="mb-4">
          14-day free trial
        </Badge>
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

        {/* Checkout Form */}
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCheckout} className="space-y-6">
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

              {/* Email (for guest checkout) */}
              {!user && !isLoading && (
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              )}

              {user && (
                <div className="p-3 bg-card-bg rounded-lg border border-card-border">
                  <p className="text-sm text-slate-grey">Signed in as</p>
                  <p className="text-frost-white">{user.email}</p>
                </div>
              )}

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
                  <span>Due today</span>
                  <span>$0.00</span>
                </div>
                <p className="text-sm text-slate-grey mt-1">
                  {plan.trialDays}-day free trial, then ${price}/
                  {billingCycle === "annual" ? "year" : "month"}
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting || (!user && !email)}
                loading={isSubmitting}
              >
                {isSubmitting ? "Processing..." : "Start Free Trial"}
              </Button>

              <p className="text-xs text-center text-slate-grey">
                By continuing, you agree to our{" "}
                <a href="/terms" className="text-cerulean-mist hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="text-cerulean-mist hover:underline"
                >
                  Privacy Policy
                </a>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
