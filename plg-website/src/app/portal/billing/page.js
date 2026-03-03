/**
 * Billing Management Page
 *
 * Manage subscription and payment methods via Stripe Customer Portal
 * using flow_data deep links. Each action button routes through
 * handlePortalAction(flow, options) which sends a targeted POST to
 * /api/portal/stripe-session with a JSON body — no generic portal
 * sessions are ever created.
 *
 * Invoices are fetched inline from /api/portal/invoices and displayed
 * in a table with PDF download links.
 *
 * @see PLG User Journey - Section 2.6
 * @see Bugfix: Stripe silently ignores products param on portal config
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
  const [seatCount, setSeatCount] = useState(1);
  const [invoices, setInvoices] = useState([]);

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
      fetchInvoices();
    }
  }, [searchParams, router, user, userLoading]);

  /**
   * Fetches billing data from /api/portal/billing.
   * Redirects non-owners to /portal on 403.
   */
  async function fetchBillingData() {
    try {
      setLoading(true);
      setError(null);

      const session = await getSession();
      if (!session?.idToken) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const billingRes = await fetch("/api/portal/billing", {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.idToken}`,
        },
      });

      if (!billingRes.ok) {
        const errorData = await billingRes.json().catch(() => ({}));
        if (billingRes.status === 403) {
          router.replace("/portal");
          return;
        }
        throw new Error(errorData.error || "Failed to fetch billing information");
      }

      const billingData = await billingRes.json();
      setBilling(billingData);

      // Initialize seat count from current subscription quantity
      if (billingData?.subscription?.quantity) {
        setSeatCount(billingData.subscription.quantity);
      }
    } catch (err) {
      console.error("[Billing] Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetches invoice history from /api/portal/invoices.
   * Fails silently — invoices are supplementary to the main billing view.
   */
  async function fetchInvoices() {
    try {
      const session = await getSession();
      if (!session?.idToken) return;

      const res = await fetch("/api/portal/invoices", {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.idToken}`,
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      // Invoices are non-critical — log but don't block the page
      console.error("[Billing] Invoice fetch error:", err);
    }
  }

  /**
   * Opens a Stripe Customer Portal session for a specific action.
   * Sends a POST with JSON body { flow, ...options } to /api/portal/stripe-session.
   * Every portal interaction is a flow_data deep link — no generic sessions.
   *
   * @param {string} flow - One of: switch_to_annual, switch_to_monthly, adjust_seats, update_payment, cancel
   * @param {object} [options={}] - Additional options (e.g. { quantity } for adjust_seats)
   */
  async function handlePortalAction(flow, options = {}) {
    setRedirecting(true);
    setError(null);
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
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flow, ...options }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to open billing portal");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error("[Billing] Portal action error:", err);
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
  const isBusinessAccount = billing?.accountType === "business";

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
            aria-label="Dismiss notification"
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
                      ` \u2022 ${subscription.quantity} seats`}
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
                <p className="text-slate-grey">\u2014</p>
              )}
              {subscription?.currentPeriodEnd && (
                <p className="text-sm text-slate-grey mt-1">
                  {subscription.cancelAtPeriodEnd ? "Access until" : "Renews"}{" "}
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
            </div>
          </div>

          {/* Targeted action buttons — each routes through a flow_data deep link */}
          <div className="flex flex-wrap gap-4">
            {/* Billing cycle switch */}
            {subscription?.status === "active" && (
              billingCycle === "monthly" ? (
                <Button
                  onClick={() => handlePortalAction("switch_to_annual")}
                  disabled={redirecting}
                >
                  {redirecting ? "Redirecting..." : "Switch to Annual (Save 17%)"}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => handlePortalAction("switch_to_monthly")}
                  disabled={redirecting}
                >
                  {redirecting ? "Redirecting..." : "Switch to Monthly"}
                </Button>
              )
            )}

            {/* Cancel subscription */}
            {subscription?.status === "active" && !subscription?.cancelAtPeriodEnd && (
              <Button
                variant="ghost"
                onClick={() => handlePortalAction("cancel")}
                disabled={redirecting}
                className="text-red-400 hover:text-red-300"
              >
                {redirecting ? "Redirecting..." : "Cancel Subscription"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seat Adjustment — Business accounts only */}
      {isBusinessAccount && subscription?.status === "active" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Manage Seats</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-grey mb-4">
              Current seats: {subscription.quantity || 1}
            </p>
            <div className="flex items-center gap-4">
              <label htmlFor="seat-count" className="sr-only">Number of seats</label>
              <input
                id="seat-count"
                type="number"
                min={1}
                max={99}
                value={seatCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setSeatCount(val);
                }}
                className="w-24 px-3 py-2 bg-card-bg border border-card-border rounded text-frost-white text-center"
                aria-label="Number of seats"
              />
              {seatCount >= 100 ? (
                <p className="text-amber-400 text-sm">
                  Contact sales for volume discounts
                </p>
              ) : (
                <Button
                  onClick={() => handlePortalAction("adjust_seats", { quantity: seatCount })}
                  disabled={redirecting || seatCount < 1 || seatCount > 99}
                >
                  {redirecting ? "Redirecting..." : "Update Seats"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
                    \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 {paymentMethod.last4}
                  </p>
                  <p className="text-sm text-slate-grey">
                    Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePortalAction("update_payment")}
                disabled={redirecting}
              >
                Update Payment Method
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-slate-grey">No payment method on file</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePortalAction("update_payment")}
                disabled={redirecting}
              >
                Add Payment Method
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices — inline table, no portal redirect */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices &amp; Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="pb-3 text-sm text-slate-grey font-medium">Date</th>
                    <th className="pb-3 text-sm text-slate-grey font-medium">Amount</th>
                    <th className="pb-3 text-sm text-slate-grey font-medium">Status</th>
                    <th className="pb-3 text-sm text-slate-grey font-medium text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-card-border/50">
                      <td className="py-3 text-frost-white text-sm">
                        {formatDate(invoice.date)}
                      </td>
                      <td className="py-3 text-frost-white text-sm">
                        {formatCurrency(invoice.amount, invoice.currency)}
                      </td>
                      <td className="py-3">
                        <InvoiceStatusBadge status={invoice.status} />
                      </td>
                      <td className="py-3 text-right">
                        {invoice.pdfUrl ? (
                          <a
                            href={invoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:text-blue-300 underline"
                          >
                            Download PDF
                          </a>
                        ) : (
                          <span className="text-sm text-slate-grey">\u2014</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-grey">No invoices yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Displays a colored badge for subscription status.
 *
 * @param {object} props
 * @param {string} props.status - Stripe subscription status
 * @returns {JSX.Element}
 */
function SubscriptionStatusBadge({ status }) {
  const variants = {
    active: "success",
    trialing: "info",
    past_due: "warning",
    cancellation_pending: "warning",
    canceled: "secondary",
    expired: "secondary",
    unpaid: "danger",
    incomplete: "warning",
    incomplete_expired: "danger",
  };

  const labels = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past Due",
    cancellation_pending: "Cancellation Pending",
    canceled: "Canceled",
    expired: "Expired",
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

/**
 * Displays a colored badge for invoice payment status.
 *
 * @param {object} props
 * @param {string} props.status - Stripe invoice status (paid, open, void, draft, uncollectible)
 * @returns {JSX.Element}
 */
function InvoiceStatusBadge({ status }) {
  const variants = {
    paid: "success",
    open: "warning",
    void: "secondary",
    draft: "secondary",
    uncollectible: "danger",
  };

  const labels = {
    paid: "Paid",
    open: "Open",
    void: "Void",
    draft: "Draft",
    uncollectible: "Uncollectible",
  };

  return (
    <Badge variant={variants[status] || "secondary"} className="text-xs">
      {labels[status] || status}
    </Badge>
  );
}

/**
 * Renders a short label for the card brand.
 *
 * @param {object} props
 * @param {string} props.brand - Card brand from Stripe (visa, mastercard, amex, discover)
 * @returns {JSX.Element}
 */
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

/**
 * Formats an ISO date string to a human-readable short date.
 *
 * @param {string} dateString - ISO 8601 date string
 * @returns {string} Formatted date or em dash
 */
function formatDate(dateString) {
  if (!dateString) return "\u2014";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats cents to a currency string.
 *
 * @param {number} cents - Amount in cents
 * @param {string} [currency="usd"] - ISO 4217 currency code
 * @returns {string} Formatted currency string or em dash
 */
function formatCurrency(cents, currency = "usd") {
  if (cents == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

