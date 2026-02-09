/**
 * Billing Management Page
 *
 * Manage subscription and payment methods via Stripe Customer Portal.
 * Fetches real billing data from /api/portal/billing and /api/portal/invoices.
 *
 * @see PLG User Journey - Section 2.6
 */

"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { useUser } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";

export default function BillingPage() {
  const { user, isLoading: userLoading } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    // Check if returning from Stripe Portal with success indicator
    if (searchParams.get("updated") === "true") {
      setSuccessMessage("Your billing information has been updated successfully.");
      // Clear the URL param without triggering a full reload
      router.replace("/portal/billing", { scroll: false });
      // Auto-dismiss after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    }
    
    if (user && !userLoading) {
      fetchBillingData();
    }
  }, [searchParams, router, user, userLoading]);

  async function fetchBillingData() {
    try {
      setLoading(true);
      setError(null);

      // Get session for Authorization header
      const session = await getSession();
      if (!session?.idToken) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      // Fetch billing info with Authorization header
      const billingRes = await fetch("/api/portal/billing", {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.idToken}`,
        },
      });

      if (!billingRes.ok) {
        const errorData = await billingRes.json().catch(() => ({}));
        // Redirect non-owners back to portal dashboard
        if (billingRes.status === 403) {
          router.replace("/portal");
          return;
        }
        throw new Error(errorData.error || "Failed to fetch billing information");
      }

      const billingData = await billingRes.json();
      setBilling(billingData);
    } catch (err) {
      console.error("[Billing] Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleManageSubscription() {
    setRedirecting(true);
    try {
      const session = await getSession();
      if (!session?.idToken) {
        setError("Not authenticated");
        setRedirecting(false);
        return;
      }

      const res = await fetch("/api/portal/stripe-session", {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.idToken}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to open billing portal");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error("[Billing] Portal session error:", err);
      setError(err.message);
      setRedirecting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-frost-white">Billing</h1>
          <p className="text-slate-grey mt-1">Loading billing information...</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-pulse">
              <div className="h-4 bg-card-border rounded w-48 mx-auto mb-4"></div>
              <div className="h-4 bg-card-border rounded w-32 mx-auto"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-frost-white">Billing</h1>
          <p className="text-slate-grey mt-1">
            Manage your subscription and payment methods
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button onClick={fetchBillingData}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subscription = billing?.subscription;
  const paymentMethod = billing?.paymentMethod;
  const planName = billing?.planName || billing?.accountType || "Unknown";
  const billingCycle = subscription?.billingCycle || "monthly";
  const amount = subscription?.amount;
  const currency = subscription?.currency || "usd";

  return (
    <div className="max-w-4xl">
      {/* Success notification banner */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-500/50 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-green-300">{successMessage}</p>
          </div>
          <button 
            onClick={() => setSuccessMessage(null)}
            className="text-green-400 hover:text-green-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">Billing</h1>
        <p className="text-slate-grey mt-1">
          Manage your subscription and payment methods
        </p>
      </div>

      {/* Stripe Portal redirect via fetch with JWT auth */}

      {/* Current Plan */}
      <Card className="mb-6">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Current Plan</CardTitle>
          <SubscriptionStatusBadge status={subscription?.status} />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-frost-white capitalize">
                {planName}
              </h3>
              <p className="text-slate-grey">
                {subscription ? (
                  <>
                    Billed {billingCycle === "annual" ? "annually" : "monthly"}
                    {subscription.quantity > 1 &&
                      ` • ${subscription.quantity} seats`}
                  </>
                ) : (
                  "No active subscription"
                )}
              </p>
              {subscription?.cancelAtPeriodEnd && (
                <p className="text-amber-400 text-sm mt-1">
                  Cancels on {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
            </div>
            <div className="text-right">
              {amount != null ? (
                <p className="text-3xl font-bold text-frost-white">
                  {formatCurrency(amount, currency)}
                  <span className="text-lg text-slate-grey font-normal">
                    /{billingCycle === "annual" ? "year" : "month"}
                    {subscription?.quantity > 1 && "/seat"}
                  </span>
                </p>
              ) : (
                <p className="text-slate-grey">—</p>
              )}
              {subscription?.currentPeriodEnd && (
                <p className="text-sm text-slate-grey mt-1">
                  {subscription.cancelAtPeriodEnd ? "Access until" : "Renews"}{" "}
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={handleManageSubscription}
              disabled={redirecting || !billing?.stripeCustomerId}
            >
              {redirecting ? "Redirecting..." : "Manage Subscription"}
            </Button>
            {billingCycle === "monthly" &&
              subscription?.status === "active" && (
                <Button
                  variant="secondary"
                  onClick={handleManageSubscription}
                  disabled={redirecting}
                >
                  Switch to Annual (Save 17%)
                </Button>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentMethod ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-card-bg border border-card-border rounded flex items-center justify-center">
                  <CardBrandIcon brand={paymentMethod.brand} />
                </div>
                <div>
                  <p className="text-frost-white">
                    •••• •••• •••• {paymentMethod.last4}
                  </p>
                  <p className="text-sm text-slate-grey">
                    Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManageSubscription}
                disabled={redirecting}
              >
                Update
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-slate-grey">No payment method on file</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleManageSubscription}
                disabled={redirecting}
              >
                Add Payment Method
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices & Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-grey mb-4">
            View your complete invoice history and download receipts in the
            Stripe Customer Portal.
          </p>
          <Button
            onClick={handleManageSubscription}
            variant="outline"
            disabled={redirecting}
          >
            {redirecting ? "Opening..." : "View Invoices"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionStatusBadge({ status }) {
  const variants = {
    active: "success",
    trialing: "info",
    past_due: "warning",
    canceled: "secondary",
    unpaid: "danger",
    incomplete: "warning",
    incomplete_expired: "danger",
  };

  const labels = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past Due",
    canceled: "Canceled",
    unpaid: "Unpaid",
    incomplete: "Incomplete",
    incomplete_expired: "Expired",
  };

  if (!status) {
    return <Badge variant="secondary">No Subscription</Badge>;
  }

  return (
    <Badge variant={variants[status] || "secondary"}>
      {labels[status] || status}
    </Badge>
  );
}

function CardBrandIcon({ brand }) {
  const brandLabels = {
    visa: "VISA",
    mastercard: "MC",
    amex: "AMEX",
    discover: "DISC",
  };
  return (
    <span className="text-xs text-slate-grey font-medium">
      {brandLabels[brand?.toLowerCase()] || brand?.toUpperCase() || "CARD"}
    </span>
  );
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(cents, currency = "usd") {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
