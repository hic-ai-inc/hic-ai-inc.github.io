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
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";

export default function BillingPage() {
  const [billing, setBilling] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    fetchBillingData();
  }, []);

  async function fetchBillingData() {
    try {
      setLoading(true);
      setError(null);

      // Fetch billing info and recent invoices in parallel
      const [billingRes, invoicesRes] = await Promise.all([
        fetch("/api/portal/billing"),
        fetch("/api/portal/invoices?limit=3"),
      ]);

      if (!billingRes.ok) {
        throw new Error("Failed to fetch billing information");
      }

      const billingData = await billingRes.json();
      setBilling(billingData);

      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(invoicesData.invoices || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleManageSubscription() {
    setRedirecting(true);
    // The form will POST to /api/portal/stripe-session which redirects to Stripe
    document.getElementById("stripe-portal-form").submit();
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">Billing</h1>
        <p className="text-slate-grey mt-1">
          Manage your subscription and payment methods
        </p>
      </div>

      {/* Hidden form for Stripe Portal redirect */}
      <form
        id="stripe-portal-form"
        action="/api/portal/stripe-session"
        method="POST"
        className="hidden"
      />

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
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent Invoices</CardTitle>
          <Button href="/portal/invoices" variant="ghost" size="sm">
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="divide-y divide-card-border">
              {invoices.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </div>
          ) : (
            <p className="text-slate-grey py-4 text-center">
              No invoices yet. Your invoices will appear here after your first
              payment.
            </p>
          )}
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

function InvoiceRow({ invoice }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-frost-white">{formatDate(invoice.date)}</p>
        <p className="text-sm text-slate-grey">{invoice.description}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-frost-white">
          {formatCurrency(invoice.amount, invoice.currency)}
        </span>
        <Badge variant={invoice.status === "paid" ? "success" : "warning"}>
          {invoice.status}
        </Badge>
        {invoice.pdfUrl ? (
          <a
            href={invoice.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cerulean-mist hover:text-frost-white text-sm"
          >
            Download
          </a>
        ) : (
          <span className="text-slate-grey text-sm">—</span>
        )}
      </div>
    </div>
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
