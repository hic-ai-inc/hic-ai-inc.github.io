/**
 * Checkout Layout
 *
 * Minimal layout for checkout flow - no portal sidebar.
 */

import { Header, Footer } from "@/components/layout";

export const metadata = {
  title: "Checkout",
};

export default function CheckoutLayout({ children }) {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">{children}</main>
      <Footer />
    </>
  );
}
