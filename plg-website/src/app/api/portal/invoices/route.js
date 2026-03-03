/**
 * Portal Invoices API
 *
 * GET /api/portal/invoices
 *
 * Fetches the 12 most recent invoices from Stripe for the authenticated customer.
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import { getStripeClient } from "@/lib/stripe";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { createApiLogger } from "@/lib/api-log";

/**
 * Formats a Stripe invoice object into a minimal client-safe shape.
 * @param {import("stripe").Stripe.Invoice} invoice - Raw Stripe invoice
 * @returns {{ id: string, date: string, amount: number, currency: string, status: string, pdfUrl: string|null }}
 */
function formatInvoice(invoice) {
  return {
    id: invoice.id,
    date: new Date(invoice.created * 1000).toISOString(),
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status,
    pdfUrl: invoice.invoice_pdf || null,
  };
}

export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-portal-invoices",
    request,
    operation: "portal_invoices",
  });

  log.requestReceived();

  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Portal invoices rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Portal invoices rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customer = await getCustomerByEmail(tokenPayload.email);
    if (!customer?.stripeCustomerId) {
      log.decision("customer_not_found", "Portal invoices rejected", {
        reason: "no_stripe_customer",
      });
      log.response(404, "Portal invoices rejected", {
        reason: "no_stripe_customer",
      });
      return NextResponse.json(
        { error: "No Stripe customer found. Please purchase a license first." },
        { status: 404 },
      );
    }

    const stripe = await getStripeClient();
    const invoices = await stripe.invoices.list({
      customer: customer.stripeCustomerId,
      limit: 12,
    });

    const formatted = invoices.data.map(formatInvoice);

    log.response(200, "Portal invoices fetched", {
      count: formatted.length,
    });

    return NextResponse.json({ invoices: formatted });
  } catch (error) {
    log.exception(error, "portal_invoices_failed", "Portal invoices failed");
    log.response(500, "Portal invoices failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}
