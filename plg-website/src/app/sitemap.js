/**
 * Sitemap
 *
 * Auto-generates /sitemap.xml for search engine indexing.
 * Next.js App Router convention: this file is picked up automatically.
 *
 * Excludes: auth flows, portal (auth-gated), checkout, invite, welcome/complete,
 * api routes, and activate (deep-link only).
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hic-ai.com";

export default function sitemap() {
  const now = new Date();

  // Static public marketing routes
  const routes = [
    { url: "/", priority: 1.0, changeFrequency: "weekly" },
    { url: "/features", priority: 0.9, changeFrequency: "weekly" },
    { url: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { url: "/research", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs", priority: 0.8, changeFrequency: "weekly" },
    { url: "/docs/installation", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/quickstart", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/license-activation", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/how-it-works", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/edit-operations", priority: 0.7, changeFrequency: "monthly" },
    { url: "/faq", priority: 0.7, changeFrequency: "monthly" },
    { url: "/about", priority: 0.6, changeFrequency: "monthly" },
    { url: "/contact", priority: 0.6, changeFrequency: "monthly" },
    { url: "/privacy", priority: 0.4, changeFrequency: "yearly" },
    { url: "/terms", priority: 0.4, changeFrequency: "yearly" },
    { url: "/refunds", priority: 0.4, changeFrequency: "yearly" },
  ];

  return routes.map(({ url, priority, changeFrequency }) => ({
    url: `${BASE_URL}${url}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
