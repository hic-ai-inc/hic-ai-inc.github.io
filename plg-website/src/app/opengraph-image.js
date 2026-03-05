/**
 * Default Open Graph Image
 *
 * Generates the default OG image for social sharing at /opengraph-image.
 * Next.js App Router picks this up automatically and also serves it at the
 * path referenced in layout.js metadata (/images/og-image.png is a fallback;
 * Next.js will use this generated image for og:image tags).
 *
 * Dimensions: 1200×630 (standard OG image size)
 */

import { ImageResponse } from "next/og";

// Mirrors the aesthetic of hic-ai.com placeholder:
// large logo upper area, MOUSE wordmark, tagline in cerulean-mist

export const alt = "Mouse — Precision Editing Tools for AI Coding Agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Logo URL — absolute so ImageResponse can fetch it in any environment.
// Falls back gracefully if unreachable (logo simply won't render).
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hic-ai.com";
const LOGO_URL = `${BASE_URL}/images/mouse-logo.png`;

export default async function OGImage() {
  // Fetch logo as ArrayBuffer for reliable embedding
  let logoSrc = null;
  try {
    const res = await fetch(LOGO_URL);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      logoSrc = `data:image/png;base64,${b64}`;
    }
  } catch {
    // Render without logo if fetch fails
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0f1e",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Logo — large, upper portion */}
        {logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            width={220}
            height={220}
            style={{ objectFit: "contain", marginBottom: "32px", opacity: 0.92 }}
            alt=""
          />
        )}

        {/* MOUSE wordmark */}
        <div
          style={{
            display: "flex",
            fontSize: "80px",
            fontWeight: 800,
            color: "#f0f4f8",
            letterSpacing: "0.35em",
            lineHeight: 1,
            marginBottom: "20px",
          }}
        >
          MOUSE
        </div>

        {/* Tagline in cerulean-mist */}
        <div
          style={{
            display: "flex",
            fontSize: "24px",
            color: "#63b3ed",
            letterSpacing: "0.02em",
          }}
        >
          A Trust Layer for AI Agents
        </div>

        {/* Bottom label */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div style={{ fontSize: "11px", letterSpacing: "0.25em", color: "#f0f4f8", fontWeight: 700, textTransform: "uppercase" }}>
            TINY BUT POWERFUL
          </div>
          <div style={{ fontSize: "13px", color: "rgba(240,244,248,0.30)", letterSpacing: "0.05em" }}>
            hic-ai.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
