/**
 * Billing Management Page
 *
 * Manage subscription and payment methods via Stripe Customer Portal.
 *
 * @see PLG User Journey - Section 2.6
 */

import { getSession } from "@/lib/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { AUTH0_NAMESPACE, PRICING } from "@/lib/constants";

export const metadata = {
  title: "Billing",
};

export default async function BillingPage() {
  const session = await getSession();
  const user = session.user;
  const namespace = AUTH0_NAMESPACE;

  const accountType = user[`${namespace}/account_type`] || "individual";
  const billingCycle = user[`${namespace}/billing_cycle`] || "monthly";
  const customerId = user[`${namespace}/customer_id`];
  const subscriptionStatus =
    user[`${namespace}/subscription_status`] || "active";

  const planInfo = PRICING[accountType];
  const price =
    billingCycle === "annual" ? planInfo?.priceAnnual : planInfo?.priceMonthly;

  return (
    <div className="max-w-4xl">
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
          <Badge variant="success">Active</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-frost-white capitalize">
                {accountType}
              </h3>
              <p className="text-slate-grey">
                Billed {billingCycle === "annual" ? "annually" : "monthly"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-frost-white">
                ${price}
                <span className="text-lg text-slate-grey font-normal">
                  /{billingCycle === "annual" ? "year" : "month"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <form action="/api/portal/stripe-session" method="POST">
              <Button type="submit">Manage Subscription</Button>
            </form>
            {billingCycle === "monthly" && (
              <Button variant="secondary">Switch to Annual (Save 17%)</Button>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-8 bg-card-bg border border-card-border rounded flex items-center justify-center">
                <span className="text-xs text-slate-grey">VISA</span>
              </div>
              <div>
                <p className="text-frost-white">•••• •••• •••• 4242</p>
                <p className="text-sm text-slate-grey">Expires 12/2028</p>
              </div>
            </div>
            <form action="/api/portal/stripe-session" method="POST">
              <Button type="submit" variant="ghost" size="sm">
                Update
              </Button>
            </form>
          </div>
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
          <div className="divide-y divide-card-border">
            <InvoiceRow date="Jan 22, 2026" amount="$10.00" status="paid" />
            <InvoiceRow date="Dec 22, 2025" amount="$10.00" status="paid" />
            <InvoiceRow date="Nov 22, 2025" amount="$10.00" status="paid" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InvoiceRow({ date, amount, status }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-frost-white">{date}</p>
        <p className="text-sm text-slate-grey">Mouse Individual - Monthly</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-frost-white">{amount}</span>
        <Badge variant={status === "paid" ? "success" : "warning"}>
          {status}
        </Badge>
        <Button variant="ghost" size="sm">
          Download
        </Button>
      </div>
    </div>
  );
}
