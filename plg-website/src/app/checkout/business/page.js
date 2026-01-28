/**
 * Business Plan Checkout
 *
 * Checkout flow for Business plan ($35/seat/mo).
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

export default function BusinessCheckoutPage() {
  const { user, isLoading } = useUser();
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [email, setEmail] = useState("");
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

  const handleCheckout = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "business",
          billingCycle,
          email: user?.email || email,
          seats,
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

        {/* Checkout Form */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Complete Your Order</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCheckout} className="space-y-6">
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

                {/* Email (if not logged in) */}
                {!user && !isLoading && (
                  <Input
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                )}

                {user && (
                  <div className="text-sm text-silver">
                    Checking out as{" "}
                    <span className="text-frost-white">{user.email}</span>
                  </div>
                )}

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
                  <p className="text-xs text-slate-grey mt-2">
                    14-day free trial • Cancel anytime
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || (!user && !email)}
                >
                  {isSubmitting ? "Processing..." : "Start Free Trial"}
                </Button>

                <p className="text-xs text-center text-slate-grey">
                  By continuing, you agree to our{" "}
                  <a
                    href="/terms"
                    className="text-cerulean-mist hover:underline"
                  >
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
    </div>
  );
}
