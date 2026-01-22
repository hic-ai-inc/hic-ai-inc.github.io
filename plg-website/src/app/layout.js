import { Inter, Manrope } from "next/font/google";
import { UserProvider } from "@auth0/nextjs-auth0/client";
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
    description: "The first proven treatment for execution slop.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mouse by HIC AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mouse — Precision Editing Tools for AI Coding Agents",
    description: "The first proven treatment for execution slop.",
    images: ["/images/og-image.png"],
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
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
