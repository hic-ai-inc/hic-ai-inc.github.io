/**
 * Enterprise Plan Checkout
 *
 * Checkout flow for Enterprise plan ($25/seat/mo, 10+ seats).
 * Requires credit card for trial.
 *
 * @see PLG User Journey - Section 2.3
 */

"use client";

import { useState, useMemo } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
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

export default function EnterpriseCheckoutPage() {
  const { user, isLoading } = useUser();
  const [seats, setSeats] = useState(10);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const plan = PRICING.enterprise;

  // Calculate pricing with volume discounts
  const pricing = useMemo(() => {
    let discount = 0;
    if (seats >= 500) discount = plan.volumeDiscounts[500];
    else if (seats >= 100) discount = plan.volumeDiscounts[100];

    const basePrice = seats * plan.pricePerSeat;
    const discountAmount = basePrice * discount;
    const finalPrice = basePrice - discountAmount;

    return {
      basePrice,
      discount,
      discountAmount,
      finalPrice,
      perSeatPrice: finalPrice / seats,
    };
  }, [seats, plan]);

  const handleCheckout = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "enterprise",
          seats,
          email: user?.email || email,
          companyName,
          promoCode: promoCode || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed");
      }

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
          30-day free trial
        </Badge>
        <h1 className="text-4xl font-bold text-frost-white mb-2">
          Mouse Enterprise
        </h1>
        <p className="text-xl text-silver">
          Precision editing for your entire engineering team
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Plan Details */}
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Enterprise Features</CardTitle>
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

          {/* Volume Discounts */}
          <Card>
            <CardHeader>
              <CardTitle>Volume Discounts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div
                  className={`flex justify-between p-2 rounded ${
                    seats >= 10 && seats < 100
                      ? "bg-cerulean-mist/10"
                      : "opacity-50"
                  }`}
                >
                  <span className="text-silver">10-99 seats</span>
                  <span className="text-frost-white">$25/seat/mo</span>
                </div>
                <div
                  className={`flex justify-between p-2 rounded ${
                    seats >= 100 && seats < 500
                      ? "bg-cerulean-mist/10"
                      : "opacity-50"
                  }`}
                >
                  <span className="text-silver">100-499 seats</span>
                  <span className="text-frost-white">
                    $22.50/seat/mo{" "}
                    <Badge variant="success" className="ml-2">
                      10% off
                    </Badge>
                  </span>
                </div>
                <div
                  className={`flex justify-between p-2 rounded ${
                    seats >= 500 ? "bg-cerulean-mist/10" : "opacity-50"
                  }`}
                >
                  <span className="text-silver">500+ seats</span>
                  <span className="text-frost-white">
                    $20/seat/mo{" "}
                    <Badge variant="success" className="ml-2">
                      20% off
                    </Badge>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Checkout Form */}
        <Card>
          <CardHeader>
            <CardTitle>Configure Your Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCheckout} className="space-y-6">
              {/* Seat Selector */}
              <div>
                <label className="block text-sm font-medium text-frost-white mb-3">
                  Number of Seats
                </label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setSeats(Math.max(plan.minSeats, seats - 10))
                    }
                    className="w-10 h-10 rounded-lg bg-card-bg border border-card-border text-frost-white hover:bg-card-border transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={seats}
                    onChange={(e) =>
                      setSeats(
                        Math.max(
                          plan.minSeats,
                          parseInt(e.target.value) || plan.minSeats,
                        ),
                      )
                    }
                    min={plan.minSeats}
                    className="w-24 text-center input"
                  />
                  <button
                    type="button"
                    onClick={() => setSeats(seats + 10)}
                    className="w-10 h-10 rounded-lg bg-card-bg border border-card-border text-frost-white hover:bg-card-border transition"
                  >
                    +
                  </button>
                </div>
                <p className="text-sm text-slate-grey mt-2">
                  Minimum {plan.minSeats} seats • 2 devices per seat
                </p>
              </div>

              {/* Company Name */}
              <Input
                label="Company Name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                required
              />

              {/* Email */}
              {!user && !isLoading && (
                <Input
                  label="Work Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
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
              <Input
                label="Promo Code (optional)"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="EARLYADOPTER20"
              />

              {/* Error */}
              {error && (
                <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                  {error}
                </div>
              )}

              {/* Order Summary */}
              <div className="border-t border-card-border pt-4 space-y-2">
                <div className="flex justify-between text-silver">
                  <span>
                    {seats} seats × ${plan.pricePerSeat}/mo
                  </span>
                  <span>${pricing.basePrice.toFixed(2)}</span>
                </div>
                {pricing.discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Volume discount ({pricing.discount * 100}%)</span>
                    <span>-${pricing.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-frost-white font-semibold text-lg pt-2 border-t border-card-border">
                  <span>Monthly total</span>
                  <span>${pricing.finalPrice.toFixed(2)}/mo</span>
                </div>
                <p className="text-sm text-slate-grey">
                  {plan.trialDays}-day trial (card required), then $
                  {pricing.finalPrice.toFixed(2)}/month
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting || (!user && (!email || !companyName))}
                loading={isSubmitting}
              >
                {isSubmitting ? "Processing..." : "Start 30-Day Trial"}
              </Button>

              <p className="text-xs text-center text-slate-grey">
                Credit card required for enterprise trial. You won&apos;t be
                charged during the trial period.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Contact Sales CTA */}
      <div className="mt-12 text-center">
        <p className="text-silver mb-4">
          Need a custom solution or have questions?
        </p>
        <Button href="mailto:sales@hic-ai.com" variant="secondary">
          Contact Sales
        </Button>
      </div>
    </div>
  );
}
