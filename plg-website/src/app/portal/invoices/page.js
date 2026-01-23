/**
 * Invoice History Page
 *
 * Display all invoices with download links.
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
import { AUTH0_NAMESPACE } from "@/lib/constants";

export const metadata = {
  title: "Invoices",
};

// Mock invoice data - in production this comes from Stripe API
const mockInvoices = [
  {
    id: "inv_001",
    date: "2026-01-22",
    amount: 1000,
    status: "paid",
    description: "Mouse Individual - Monthly",
    pdfUrl: "#",
  },
  {
    id: "inv_002",
    date: "2025-12-22",
    amount: 1000,
    status: "paid",
    description: "Mouse Individual - Monthly",
    pdfUrl: "#",
  },
  {
    id: "inv_003",
    date: "2025-11-22",
    amount: 1000,
    status: "paid",
    description: "Mouse Individual - Monthly",
    pdfUrl: "#",
  },
  {
    id: "inv_004",
    date: "2025-10-22",
    amount: 1000,
    status: "paid",
    description: "Mouse Individual - Monthly",
    pdfUrl: "#",
  },
];

export default async function InvoicesPage() {
  const session = await getSession();
  const user = session.user;

  const invoices = mockInvoices; // Would fetch from Stripe API

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
                    <td className="py-4 px-6 text-frost-white">
                      {invoice.description}
                    </td>
                    <td className="py-4 px-6 text-frost-white">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="py-4 px-6">
                      <Badge
                        variant={
                          invoice.status === "paid" ? "success" : "warning"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <a
                        href={invoice.pdfUrl}
                        className="text-cerulean-mist hover:text-frost-white text-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoices.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-slate-grey">No invoices yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
