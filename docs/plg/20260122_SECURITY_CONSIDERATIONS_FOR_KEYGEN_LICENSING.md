# Security Considerations for Keygen Licensing

**Document ID:** 20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING  
**Date:** January 22, 2026  
**Author:** GitHub Copilot  
**Status:** Reference Guide  
**Classification:** Internal Engineering Reference

---

## 1. Executive Summary

This memo documents security architecture considerations for integrating Keygen.sh licensing into the HIC AI ecosystem. The primary concerns addressed are: (1) protecting license keys and product tokens, (2) preventing license abuse and piracy, (3) secure machine activation, and (4) maintaining the integrity of the licensing validation flow. This document aligns with OWASP, CWE, and Keygen's official security guidance.

---

## 2. Keygen Architecture Overview

### 2.1 Key Concepts

| Concept           | Description                                          | Security Sensitivity            |
| ----------------- | ---------------------------------------------------- | ------------------------------- |
| **Product Token** | API credential for your Keygen account               | 🔒 Server-only, never expose    |
| **License Key**   | User-facing key (e.g., `XXXX-XXXX-XXXX-XXXX`)        | Semi-sensitive — given to users |
| **License ID**    | Internal UUID for a license                          | Low — used in API calls         |
| **Machine ID**    | Fingerprint of activated device                      | Low — unique per device         |
| **Policy**        | Rules governing a license (limits, expiry, features) | Configuration — not secret      |

### 2.2 HIC AI Licensing Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KEYGEN POLICIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  mouse_oss        │ 1 device, non-commercial, no expiry                     │
│  mouse_individual │ 3 devices, 14-day trial, monthly/annual billing         │
│  mouse_enterprise │ 2 devices/seat, 30-day trial, annual billing            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Licensing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LICENSE PROVISIONING                               │
│                                                                              │
│  1. User completes Stripe checkout                                          │
│  2. Stripe webhook → your server                                            │
│  3. Server creates Keygen license (using Product Token)                     │
│  4. Server stores license_key in user record                                │
│  5. User receives license key via email/dashboard                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LICENSE ACTIVATION                                 │
│                                                                              │
│  1. User enters license key in Mouse MCP extension                          │
│  2. Extension generates machine fingerprint                                 │
│  3. Extension calls Keygen API to activate machine                          │
│  4. Keygen validates license + creates machine record                       │
│  5. Extension stores activation locally for offline use                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LICENSE VALIDATION                                 │
│                                                                              │
│  1. Mouse MCP starts up                                                     │
│  2. Extension validates license (online or cached)                          │
│  3. If valid → full functionality enabled                                   │
│  4. If invalid/expired → graceful degradation or block                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. API Credential Security

### 3.1 Keygen Credential Types

| Credential        | Usage                          | Exposure Risk                       |
| ----------------- | ------------------------------ | ----------------------------------- |
| **Product Token** | Server-side license management | 🔴 Critical — full account access   |
| **License Key**   | User activation                | 🟡 Medium — user-specific           |
| **Public Key**    | Offline signature verification | 🟢 Safe — designed for distribution |

### 3.2 Environment Variable Configuration

```bash
# .env.local (Server)

# 🔒 SERVER-ONLY - Never expose
KEYGEN_ACCOUNT_ID=your-account-uuid
KEYGEN_PRODUCT_TOKEN=prod_xxxxxxxxxxxxxxxxxxxxxxxx
KEYGEN_POLICY_ID_OSS=policy-uuid-for-oss
KEYGEN_POLICY_ID_INDIVIDUAL=policy-uuid-for-individual
KEYGEN_POLICY_ID_ENTERPRISE=policy-uuid-for-enterprise

# 🌐 PUBLIC - Safe for client (used in Mouse extension)
KEYGEN_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
```

### 3.3 Product Token Protection

**The Product Token grants full access to your Keygen account.** If compromised, an attacker could:

- Create unlimited licenses
- Revoke legitimate user licenses
- Access customer license data
- Modify policies and entitlements

**Mitigations:**

- Store only in server environment variables
- Never include in client-side code or bundles
- Use Keygen's IP allowlisting if available
- Rotate token if any exposure suspected
- Monitor Keygen audit logs for anomalies

---

## 4. License Key Security

### 4.1 License Key Exposure Risks

Unlike API keys, license keys are **intentionally given to users**. The risks are:

| Risk               | Description                       | Mitigation                       |
| ------------------ | --------------------------------- | -------------------------------- |
| **Key sharing**    | User shares key with others       | Machine limits, fingerprinting   |
| **Key scraping**   | Leaked keys collected from forums | Unique keys per user, revocation |
| **Brute force**    | Guessing valid license keys       | Long keys, rate limiting         |
| **Replay attacks** | Reusing old activation data       | Nonce-based validation           |

### 4.2 License Key Best Practices

```javascript
// License provisioning on your server
async function createLicense(userId, policyId, metadata) {
  const license = await keygen.licenses.create({
    policy: policyId,
    metadata: {
      userId: userId, // Link to your user system
      email: metadata.email, // For support lookup
      stripeCustomerId: metadata.stripeCustomerId,
      createdAt: new Date().toISOString(),
    },
  });

  // 🔒 Store license ID, not the key, in your database
  await db.users.update({
    where: { id: userId },
    data: {
      keygenLicenseId: license.id,
      // Optionally store encrypted key for display in dashboard
      licenseKeyEncrypted: encrypt(license.key),
    },
  });

  return license;
}
```

### 4.3 Key Display Security

When displaying license keys to users in your dashboard:

```javascript
// ❌ BAD - Key in HTML source, easily scraped
<div>{licenseKey}</div>

// ✅ BETTER - Require user action to reveal
const [revealed, setRevealed] = useState(false);

<div>
  {revealed ? licenseKey : '••••-••••-••••-••••'}
  <button onClick={() => setRevealed(true)}>Reveal Key</button>
</div>

// ✅ BEST - Copy without displaying
<button onClick={() => navigator.clipboard.writeText(licenseKey)}>
  Copy License Key to Clipboard
</button>
```

---

## 5. Machine Activation Security

### 5.1 Machine Fingerprinting

Machine fingerprints should be **unique** and **stable** but not contain sensitive data:

```javascript
// Mouse MCP extension - machine fingerprint generation
import { createHash } from "node:crypto";
import { hostname, platform, arch, cpus } from "node:os";

function generateMachineFingerprint() {
  const components = [
    hostname(),
    platform(),
    arch(),
    cpus()[0]?.model || "unknown-cpu",
    // Add more stable identifiers as needed
  ];

  const fingerprint = createHash("sha256")
    .update(components.join("|"))
    .digest("hex");

  return fingerprint;
}
```

### 5.2 Fingerprint Security Considerations

| Consideration         | Guidance                                                              |
| --------------------- | --------------------------------------------------------------------- |
| **Stability**         | Fingerprint should survive reboots, not change frequently             |
| **Uniqueness**        | Should be different across machines (avoid collision)                 |
| **Privacy**           | Don't include MAC addresses, serial numbers, or user data             |
| **Tamper resistance** | Combine multiple factors; single-value fingerprints are easy to spoof |

### 5.3 Activation Flow Security

```javascript
// Mouse MCP extension - secure activation
async function activateLicense(licenseKey) {
  const fingerprint = generateMachineFingerprint();

  try {
    const response = await fetch(
      "https://api.keygen.sh/v1/accounts/{account}/licenses/actions/validate-key",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          meta: {
            key: licenseKey,
            scope: {
              fingerprint: fingerprint,
            },
          },
        }),
      },
    );

    const data = await response.json();

    if (data.meta.valid) {
      // ✅ License valid - store activation locally
      await storeActivation({
        licenseId: data.data.id,
        fingerprint: fingerprint,
        validatedAt: new Date().toISOString(),
        // Store signed license for offline validation
        certificate: data.data.attributes.certificate,
      });
      return { success: true };
    } else {
      // ❌ License invalid - handle specific codes
      return {
        success: false,
        code: data.meta.code,
        message: getLicenseErrorMessage(data.meta.code),
      };
    }
  } catch (error) {
    // Network error - check cached activation
    return checkOfflineActivation();
  }
}
```

---

## 6. Validation Security

### 6.1 Server-Side vs Client-Side Validation

| Aspect              | Server-Side                   | Client-Side (Mouse Extension)       |
| ------------------- | ----------------------------- | ----------------------------------- |
| **When to use**     | Web dashboard, API access     | Desktop extension features          |
| **Trust level**     | High — controlled environment | Lower — user's machine              |
| **Offline support** | No                            | Yes, with signed certificates       |
| **Tampering risk**  | Low                           | Higher — local code can be modified |

### 6.2 Online Validation (Preferred)

```javascript
// Server-side validation for web dashboard
async function validateLicenseForUser(userId) {
  const user = await db.users.findUnique({ where: { id: userId } });

  if (!user.keygenLicenseId) {
    return { valid: false, reason: "NO_LICENSE" };
  }

  const validation = await keygen.licenses.validate(user.keygenLicenseId);

  return {
    valid: validation.valid,
    code: validation.code,
    expiry: validation.license?.expiry,
    entitlements: validation.license?.entitlements,
  };
}
```

### 6.3 Offline Validation (Mouse Extension)

For offline scenarios, use Keygen's signed license certificates:

```javascript
import { createVerify } from "node:crypto";

const KEYGEN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`;

function validateOffline(certificate, fingerprint) {
  try {
    // Parse the certificate (base64 encoded, signed JSON)
    const [encodedPayload, signature] = certificate.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64").toString(),
    );

    // 🔒 Verify signature using Keygen's public key
    const verifier = createVerify("RSA-SHA256");
    verifier.update(encodedPayload);

    const isValid = verifier.verify(KEYGEN_PUBLIC_KEY, signature, "base64");

    if (!isValid) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }

    // Check expiry
    if (payload.expiry && new Date(payload.expiry) < new Date()) {
      return { valid: false, reason: "LICENSE_EXPIRED" };
    }

    // Check machine fingerprint
    if (payload.machines && !payload.machines.includes(fingerprint)) {
      return { valid: false, reason: "MACHINE_NOT_ACTIVATED" };
    }

    return {
      valid: true,
      entitlements: payload.entitlements,
      expiry: payload.expiry,
    };
  } catch (error) {
    return { valid: false, reason: "VALIDATION_ERROR" };
  }
}
```

### 6.4 Validation Caching Strategy

```javascript
// Mouse extension - validation cache
const VALIDATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function validateWithCache() {
  const cached = await getStoredValidation();

  // Use cache if recent and we're offline
  if (cached && !navigator.onLine) {
    if (Date.now() - cached.validatedAt < VALIDATION_CACHE_TTL) {
      return validateOffline(cached.certificate, generateMachineFingerprint());
    }
  }

  // Online - always validate fresh
  if (navigator.onLine) {
    try {
      const result = await validateOnline();
      await storeValidation(result);
      return result;
    } catch (error) {
      // API error - fall back to cache
      if (cached) {
        return validateOffline(
          cached.certificate,
          generateMachineFingerprint(),
        );
      }
      throw error;
    }
  }

  // Offline with stale cache - allow with warning
  if (cached) {
    console.warn("Using stale license cache - please connect to validate");
    return {
      ...validateOffline(cached.certificate, generateMachineFingerprint()),
      stale: true,
    };
  }

  return { valid: false, reason: "NO_CACHED_VALIDATION" };
}
```

---

## 7. Anti-Piracy Considerations

### 7.1 Realistic Expectations

**No licensing system is unbreakable.** The goals are:

1. Make casual piracy inconvenient
2. Ensure paying customers have a smooth experience
3. Detect and respond to abuse
4. Avoid punishing legitimate users

### 7.2 Defense Layers

| Layer                  | Protection                 | Trade-off                             |
| ---------------------- | -------------------------- | ------------------------------------- |
| **Machine limits**     | Prevents unlimited sharing | May frustrate users with many devices |
| **Heartbeat checks**   | Detects simultaneous use   | Requires connectivity                 |
| **Usage analytics**    | Identifies abuse patterns  | Privacy considerations                |
| **License revocation** | Stops known-pirated keys   | Must have support process             |
| **Entitlement checks** | Per-feature validation     | Code complexity                       |

### 7.3 Grace Periods and User Experience

**Prioritize user experience over strict enforcement:**

```javascript
// Graceful degradation, not hard blocks
function enforceEntitlements(license, requestedFeature) {
  if (!license.valid) {
    // Allow basic functionality even with invalid license
    if (requestedFeature === "basic") {
      return { allowed: true, degraded: true };
    }
    return { allowed: false, reason: "LICENSE_REQUIRED" };
  }

  if (license.expiry && new Date(license.expiry) < new Date()) {
    // Grace period - 7 days after expiry
    const gracePeriod = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(license.expiry) < gracePeriod) {
      return { allowed: true, warning: "LICENSE_EXPIRED_GRACE_PERIOD" };
    }
    return { allowed: false, reason: "LICENSE_EXPIRED" };
  }

  if (!license.entitlements?.includes(requestedFeature)) {
    return { allowed: false, reason: "UPGRADE_REQUIRED" };
  }

  return { allowed: true };
}
```

---

## 8. Webhook Security

### 8.1 Keygen Webhook Events

Keygen can send webhooks for license lifecycle events:

| Event                 | Use Case                     |
| --------------------- | ---------------------------- |
| `license.created`     | Sync to your database        |
| `license.expired`     | Notify user, update status   |
| `license.suspended`   | Block access immediately     |
| `license.renewed`     | Update expiry in your system |
| `machine.activated`   | Audit logging                |
| `machine.deactivated` | Update device count          |

### 8.2 Webhook Signature Verification

```javascript
// app/api/webhook/keygen/route.js
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("keygen-signature");

  // 🔒 Verify webhook signature
  const expectedSignature = createHmac(
    "sha256",
    process.env.KEYGEN_WEBHOOK_SECRET,
  )
    .update(body)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature || "", "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    console.error("Keygen webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ✅ Signature verified - process event
  const event = JSON.parse(body);

  switch (event.data.type) {
    case "licenses":
      await handleLicenseEvent(event);
      break;
    case "machines":
      await handleMachineEvent(event);
      break;
  }

  return NextResponse.json({ received: true });
}
```

---

## 9. OWASP & CWE Alignment

### 9.1 Relevant CWE Entries

| CWE ID      | Name                                             | Licensing Context                | Mitigation                  |
| ----------- | ------------------------------------------------ | -------------------------------- | --------------------------- |
| **CWE-200** | Exposure of Sensitive Information                | Product token in client code     | Server-only storage         |
| **CWE-285** | Improper Authorization                           | User accessing another's license | Verify ownership            |
| **CWE-294** | Authentication Bypass by Capture-replay          | Replaying activation requests    | Nonce/timestamp validation  |
| **CWE-307** | Improper Restriction of Excessive Auth Attempts  | Brute-forcing license keys       | Rate limiting               |
| **CWE-345** | Insufficient Verification of Data Authenticity   | Unverified webhooks              | Signature verification      |
| **CWE-347** | Improper Verification of Cryptographic Signature | Accepting invalid certificates   | Proper signature validation |
| **CWE-613** | Insufficient Session Expiration                  | Cached validation never expires  | TTL on cached data          |

### 9.2 OWASP API Security Top 10 (2023)

| OWASP ID | Risk                                | Licensing Mitigation                      |
| -------- | ----------------------------------- | ----------------------------------------- |
| **API1** | Broken Object Level Authorization   | Verify user owns license before returning |
| **API2** | Broken Authentication               | Product token on server only              |
| **API4** | Unrestricted Resource Consumption   | Rate limit activation attempts            |
| **API5** | Broken Function Level Authorization | Only admins can revoke licenses           |
| **API8** | Security Misconfiguration           | Secure webhook endpoints                  |

---

## 10. Data Privacy Considerations

### 10.1 What Data Keygen Stores

| Data                    | Purpose             | Sensitivity  |
| ----------------------- | ------------------- | ------------ |
| License key             | User identification | Medium       |
| Email (if provided)     | Support lookup      | PII          |
| Machine fingerprint     | Activation tracking | Low (hashed) |
| IP address (activation) | Fraud detection     | PII          |
| Usage timestamps        | Audit trail         | Low          |

### 10.2 GDPR/Privacy Compliance

- **Data minimization**: Only send required metadata to Keygen
- **Right to erasure**: Implement license deletion when user requests
- **Transparency**: Document what data is sent to Keygen in privacy policy

```javascript
// User requests account deletion
async function deleteUserLicenseData(userId) {
  const user = await db.users.findUnique({ where: { id: userId } });

  if (user.keygenLicenseId) {
    // Revoke and delete license from Keygen
    await keygen.licenses.delete(user.keygenLicenseId);
  }

  // Remove from your database
  await db.users.update({
    where: { id: userId },
    data: {
      keygenLicenseId: null,
      licenseKeyEncrypted: null,
    },
  });
}
```

---

## 11. Error Handling

### 11.1 License Validation Error Codes

| Code                         | Meaning                    | User Message                                             |
| ---------------------------- | -------------------------- | -------------------------------------------------------- |
| `VALID`                      | License is valid           | ✅ (no message needed)                                   |
| `NOT_FOUND`                  | License key doesn't exist  | "Invalid license key. Please check and try again."       |
| `SUSPENDED`                  | License manually suspended | "Your license has been suspended. Contact support."      |
| `EXPIRED`                    | License past expiry date   | "Your license has expired. Please renew to continue."    |
| `OVERDUE`                    | Payment overdue            | "Payment is overdue. Please update your billing."        |
| `NO_MACHINE`                 | Machine not activated      | "This device is not activated. Please activate."         |
| `NO_MACHINES`                | All machine slots used     | "Device limit reached. Deactivate another device first." |
| `FINGERPRINT_SCOPE_MISMATCH` | Wrong machine              | "This license is not activated for this device."         |

### 11.2 Secure Error Messages

```javascript
// ❌ BAD - Reveals internal details
return { error: `License ${licenseId} not found in account ${accountId}` };

// ✅ GOOD - User-friendly, no internal details
const ERROR_MESSAGES = {
  NOT_FOUND: "Invalid license key. Please check and try again.",
  SUSPENDED: "Your license has been suspended. Please contact support.",
  EXPIRED: "Your license has expired. Renew at hic-ai.com/renew",
  NO_MACHINES: "Device limit reached. Manage devices at hic-ai.com/devices",
  // ... etc
};

return {
  error: ERROR_MESSAGES[code] || "License validation failed. Please try again.",
  code: code, // OK to return code for client-side handling
};
```

---

## 12. Pre-Launch Checklist

### 12.1 Keygen Configuration

- [ ] Product token stored in server environment only
- [ ] Public key embedded in Mouse extension for offline validation
- [ ] Policies created with correct machine limits
- [ ] Webhook endpoint configured with signature verification
- [ ] Test licenses created for QA

### 12.2 Server Security

- [ ] License creation only via authenticated endpoints
- [ ] User ownership verified before returning license data
- [ ] Rate limiting on activation endpoints
- [ ] Webhook signature verification implemented
- [ ] Error messages don't expose internal details

### 12.3 Client Security (Mouse Extension)

- [ ] Machine fingerprint is stable and unique
- [ ] Offline validation uses signed certificates
- [ ] Cached validation has TTL
- [ ] Graceful degradation when validation fails
- [ ] No product token in client code

### 12.4 User Experience

- [ ] Clear error messages for all validation codes
- [ ] Device management UI in dashboard
- [ ] License key copy-to-clipboard (not plain display)
- [ ] Grace period for expired licenses
- [ ] Email notifications for license events

---

## 13. Additional Resources

### 13.1 Keygen Documentation

- [API Reference](https://keygen.sh/docs/api/)
- [Licensing Models](https://keygen.sh/docs/choosing-a-licensing-model/)
- [Machine Fingerprinting](https://keygen.sh/docs/machine-fingerprinting/)
- [Offline Licensing](https://keygen.sh/docs/offline-licensing/)
- [Webhook Events](https://keygen.sh/docs/webhooks/)

### 13.2 Security References

- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [CWE Software Weaknesses](https://cwe.mitre.org/)

---

## 14. Document History

| Date       | Author         | Change           |
| ---------- | -------------- | ---------------- |
| 2026-01-22 | GitHub Copilot | Initial creation |

---

_This document should be reviewed and updated as the licensing integration evolves._
