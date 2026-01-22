/**
 * Portal Invoices API
 *
 * GET /api/portal/invoices
 *
 * Fetches invoice history from Stripe for the authenticated user.
 */

import { NextResponse } from "next/server";
import { getSession } from "@auth0/nextjs-auth0";
import { stripe } from "@/lib/stripe";
import { getCustomerByAuth0Id } from "@/lib/dynamodb";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer to find Stripe customer ID
    const customer = await getCustomerByAuth0Id(session.user.sub);
    if (!customer?.stripeCustomerId) {
      return NextResponse.json({ invoices: [] });
    }

    // Get limit from query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: customer.stripeCustomerId,
      limit: Math.min(limit, 100),
    });

    // Format invoices for response
    const formattedInvoices = invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      date: new Date(invoice.created * 1000).toISOString(),
      dueDate: invoice.due_date
        ? new Date(invoice.due_date * 1000).toISOString()
        : null,
      status: invoice.status,
      amount: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      description: invoice.lines.data[0]?.description || "Subscription",
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    }));

    return NextResponse.json({
      invoices: formattedInvoices,
      hasMore: invoices.has_more,
    });
  } catch (error) {
    console.error("Portal invoices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}
