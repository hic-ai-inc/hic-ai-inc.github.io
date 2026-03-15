import { Inter, Manrope } from "next/font/google";
import Script from "next/script";
import { CognitoProvider } from "@/lib/cognito-provider";
import SkipLink from "@/components/layout/SkipLink";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://hic-ai.com",
  ),
  title: {
    default: "Mouse — Precision Editing Tools for AI Coding Agents",
    template: "%s | Mouse by HIC AI",
  },
  description:
    "The first proven treatment for execution slop. Mouse gives AI coding agents the precision tools they need to edit files reliably.",
  keywords: [
    "AI coding",
    "VS Code extension",
    "code editing",
    "execution slop",
    "AI tools",
    "developer tools",
    "MCP server",
  ],
  authors: [{ name: "HIC AI", url: "https://hic-ai.com" }],
  creator: "HIC AI",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://hic-ai.com",
    siteName: "Mouse by HIC AI",
    title: "Mouse — Precision Editing Tools for AI Coding Agents",
    description: "Mouse gives AI coding agents precision file editing tools — 56% higher accuracy, 58% lower cost, and 3.6× faster than built-in tools.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mouse — Precision Editing Tools for AI Coding Agents",
    description: "Mouse gives AI coding agents precision file editing tools — 56% higher accuracy, 58% lower cost, and 3.6× faster than built-in tools.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body className="antialiased">
        <SkipLink />
        <Script
          src="https://plausible.io/js/pa-oATZnItA7afIgWa2fSRsq.js"
          strategy="beforeInteractive"
        />
        <Script id="plausible-init" strategy="beforeInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
        </Script>
        <CognitoProvider>{children}</CognitoProvider>
      </body>
    </html>
  );
}
