/**
 * Copy License Button (Client Component)
 *
 * Handles clipboard copy with feedback.
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export default function CopyLicenseButton({ licenseKey }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Button onClick={handleCopy} size="sm">
      {copied ? "Copied!" : "Copy Key"}
    </Button>
  );
}
