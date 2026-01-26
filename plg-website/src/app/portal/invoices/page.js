/**
 * Invoice History Page
 *
 * Display all invoices with download links.
 * Fetches real invoice data from /api/portal/invoices (Stripe API).
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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices(limit = 20) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/portal/invoices?limit=${limit}`);
      if (!res.ok) {
        throw new Error("Failed to fetch invoices");
      }
      const data = await res.json();
      setInvoices(data.invoices || []);
      setHasMore(data.hasMore || false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-frost-white">Invoices</h1>
          <p className="text-slate-grey mt-1">
            Loading your billing history...
          </p>
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
          <h1 className="text-3xl font-bold text-frost-white">Invoices</h1>
          <p className="text-slate-grey mt-1">
            View and download your billing history
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button onClick={() => fetchInvoices()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">Invoices</h1>
        <p className="text-slate-grey mt-1">
          View and download your billing history
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Date
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Invoice #
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Description
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Amount
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Status
                  </th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-slate-grey">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-card-border last:border-0"
                  >
                    <td className="py-4 px-6 text-frost-white">
                      {formatDate(invoice.date)}
                    </td>
                    <td className="py-4 px-6 text-slate-grey text-sm">
                      {invoice.number || "—"}
                    </td>
                    <td className="py-4 px-6 text-frost-white">
                      {invoice.description}
                    </td>
                    <td className="py-4 px-6 text-frost-white">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </td>
                    <td className="py-4 px-6">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="py-4 px-6 text-right">
                      {invoice.pdfUrl ? (
                        <a
                          href={invoice.pdfUrl}
                          className="text-cerulean-mist hover:text-frost-white text-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download PDF
                        </a>
                      ) : invoice.hostedUrl ? (
                        <a
                          href={invoice.hostedUrl}
                          className="text-cerulean-mist hover:text-frost-white text-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View Invoice
                        </a>
                      ) : (
                        <span className="text-slate-grey text-sm">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoices.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-slate-grey">No invoices yet.</p>
              <p className="text-sm text-slate-grey mt-2">
                Your invoices will appear here after your first payment.
              </p>
            </div>
          )}

          {hasMore && (
            <div className="py-4 text-center border-t border-card-border">
              <Button variant="ghost" onClick={() => fetchInvoices(50)}>
                Load More Invoices
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }) {
  const variants = {
    paid: "success",
    open: "warning",
    draft: "secondary",
    uncollectible: "danger",
    void: "secondary",
  };

  const labels = {
    paid: "Paid",
    open: "Open",
    draft: "Draft",
    uncollectible: "Uncollectible",
    void: "Void",
  };

  return (
    <Badge variant={variants[status] || "secondary"}>
      {labels[status] || status}
    </Badge>
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
