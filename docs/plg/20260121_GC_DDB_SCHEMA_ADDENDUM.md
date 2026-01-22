# MEMORANDUM — ADDENDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 21, 2026  
**RE:** DynamoDB Schema Addendum — Reconciliation with API Route Map

---

## Purpose

This addendum reconciles Q's original schema memo (`20260121_Q_SCHEMA_AND_DATA_STRUCTURE_FOR_PLG_WEB_DESIGN.md`) with the API route map (`20260121_GC_API_MAP_FOR_HIC_AI_WEBSITE.md`) and technical specification (`20260121_GC_PLG_TECHNICAL_SPECIFICATION.md`). It identifies discrepancies, missing fields, and implementation considerations discovered during API design.

---

## 1. Key Pattern Discrepancies

### 1.1 Partition Key Strategy

| Document         | PK Pattern          | Example                 |
| ---------------- | ------------------- | ----------------------- |
| **Q's Schema**   | `CUST#<email>`      | `CUST#simon@hic-ai.com` |
| **GC Tech Spec** | `CUST#<customerId>` | `CUST#cust_abc123`      |

**Issue:** Q uses email as partition key; GC uses internal customer ID.

**Resolution:** Adopt **Q's email-based approach**. Rationale:

- Email is the natural identifier users know
- Avoids extra lookup to resolve email → customerId
- Stripe webhook includes `customer_email` directly
- GSI2 (license key lookup) returns customer anyway

**Action Required:** Update GC tech spec to use `CUST#<email>` pattern.

---

### 1.2 License Key GSI Pattern

| Document         | GSI2PK Pattern        | Example                            |
| ---------------- | --------------------- | ---------------------------------- |
| **Q's Schema**   | `KEYGEN#<licenseKey>` | `KEYGEN#MOUSE-A3F9-B2E1-C7D4-8F6A` |
| **GC Tech Spec** | `LICENSE_KEY#<key>`   | `LICENSE_KEY#MOUSE-XXXX-XXXX-XXXX` |

**Issue:** Different GSI2 key prefixes.

**Resolution:** Adopt **Q's `KEYGEN#` prefix**. Rationale:

- Clearer that this is Keygen.sh integration
- Consistent with `STRIPE#` prefix for Stripe lookups

**Action Required:** Update GC tech spec GSI2PK references.

---

### 1.3 Sort Key Patterns

| Entity       | Q's SK              | GC Tech Spec SK    |
| ------------ | ------------------- | ------------------ |
| Customer     | `METADATA`          | `PROFILE`          |
| Subscription | `SUB#<stripeSubId>` | `SUB#<internalId>` |
| License      | `LIC#<keygenLicId>` | `LIC#<internalId>` |

**Issue:** Q uses external IDs (Stripe, Keygen) in sort keys; GC uses internal IDs.

**Resolution:** Adopt **Q's external ID approach**. Rationale:

- Direct correlation with source systems
- Easier debugging (can trace Stripe event → DDB record)
- Avoids maintaining internal ID mappings

**Action Required:** Update GC tech spec SK patterns.

---

## 2. Missing Fields in Q's Schema

The API route map requires fields not present in Q's original schema:

### 2.1 Customer Entity — Missing Fields

```javascript
// Add to Customer (METADATA)
{
  // Auth0 Integration (new)
  auth0UserId: "auth0|abc123",         // For portal authentication

  // Trial Tracking (new)
  trialStartedAt: "2026-01-21T00:00:00Z",
  trialEndsAt: "2026-02-04T00:00:00Z",
  convertedAt: "2026-02-04T00:00:00Z", // When trial → paid

  // Payment Failure Tracking (new)
  paymentFailedAt: "2026-01-21T00:00:00Z",
  gracePeriodEndsAt: "2026-01-28T00:00:00Z",

  // Source Attribution (new)
  acquisitionSource: "website",         // website | marketplace | referral
  acquisitionCampaign: "launch2026",
  referredBy: "cust_xyz789"             // For referral tracking
}
```

### 2.2 License Entity — Missing Fields

```javascript
// Add to License (LIC#)
{
  // Phone-Home Tracking (new)
  lastPhoneHomeAt: "2026-01-21T15:30:00Z",
  phoneHomeCount: 47,

  // Cache Control (new)
  cacheValidUntil: "2026-01-28T00:00:00Z",  // 7-day offline cache

  // Feature Entitlements (new)
  features: ["batch_edit", "for_lines", "adjust", "staging"],
  featureOverrides: {},                     // For custom enterprise grants
}
```

### 2.3 LICENSE_ACTIVATION Entity (New in GC Spec)

Q's schema tracks devices at the User level (`activeDevices`, `maxDevices`). The API map requires a separate entity for machine management:

```javascript
// New entity - aligns with GC Tech Spec
{
  PK: "LIC#lic-abc-123",
  SK: "MACHINE#<fingerprint>",

  // Machine Identity
  machineFingerprint: "sha256-of-hardware-ids",
  machineName: "MacBook Pro (Work)",

  // Environment
  platform: "darwin",                    // darwin | win32 | linux
  vsCodeVersion: "1.96.0",
  mouseVersion: "0.9.8",

  // Activity
  activatedAt: "2026-01-21T10:00:00Z",
  lastSeenAt: "2026-01-21T15:30:00Z",
  lastValidatedAt: "2026-01-21T15:30:00Z",

  // Status
  status: "ACTIVE"                       // ACTIVE | DEACTIVATED
}
```

**Access Pattern:**

- Get all machines for license: `PK = LIC#<id>, SK begins_with MACHINE#`

---

## 3. Entity Naming Reconciliation

| Concept                 | Q's Term   | GC Tech Spec Term    | Adopted                |
| ----------------------- | ---------- | -------------------- | ---------------------- |
| Primary customer record | `METADATA` | `PROFILE`            | `METADATA`             |
| Enterprise sub-account  | `User`     | `ORG_MEMBER`         | `USER`                 |
| Enterprise container    | (implied)  | `ORGANIZATION`       | **Add to Q's schema**  |
| Device record           | (in User)  | `LICENSE_ACTIVATION` | `MACHINE` (new entity) |

**Resolution:**

- Use Q's terminology where defined
- Add ORGANIZATION entity from GC spec for enterprise accounts
- Add MACHINE entity (using SK under License PK)

---

## 4. Pricing Field Reconciliation

### 4.1 Q's Schema Pricing

```javascript
// Q's approach
{
  pricePerSeat: 40.00,     // Annual price
  // Monthly calculated as: pricePerSeat * 1.15 / 12 = $3.83/mo
}
```

### 4.2 GC Tech Spec Pricing (Updated)

```javascript
// GC's approach (after pricing correction)
{
  // Individual: $40/seat/month (not /year)
  // Enterprise: $50/seat/month (not /year)
}
```

**Critical Discrepancy:** Q's schema assumed $40/year; actual pricing is $40/month.

**Resolution:** Update Customer and Subscription entities:

```javascript
{
  // Replace pricePerSeat with explicit fields
  monthlyPricePerSeat: 40.00,            // $40/seat/month (Individual)
  annualPricePerSeat: 400.00,            // $400/seat/year (~17% off)
  billingFrequency: "MONTHLY",           // MONTHLY | ANNUAL
  effectiveMonthlyRate: 40.00,           // Actual rate being charged
}
```

### 4.3 Launch Pricing Tracking

Add fields to track promotional pricing:

```javascript
{
  // Pricing tier
  pricingTier: "LAUNCH",                 // LAUNCH | STANDARD | CUSTOM
  launchDiscountPercent: 50,             // 50% off for early adopters
  lockedUntil: "2027-01-21T00:00:00Z",   // Price lock date

  // Coupon tracking
  appliedCoupon: "LAUNCH50",
  couponExpiresAt: "2026-07-21T00:00:00Z"
}
```

---

## 5. GSI Updates Required

### 5.1 Add GSI3 for Auth0 Lookup

**Use Case:** Portal login (Auth0 callback returns user ID, need to find customer)

```
GSI3: Auth0 User Lookup
- GSI3PK: String  (AUTH0#<auth0UserId>)
- GSI3SK: String  (METADATA)
- Projection: ALL
```

**Customer Entity Addition:**

```javascript
{
  GSI3PK: "AUTH0#auth0|abc123",
  GSI3SK: "METADATA"
}
```

**Access Pattern:**

```javascript
// Get customer by Auth0 user ID
const params = {
  TableName: "hic-plg-production",
  IndexName: "GSI3",
  KeyConditionExpression: "GSI3PK = :pk AND GSI3SK = :sk",
  ExpressionAttributeValues: {
    ":pk": "AUTH0#auth0|abc123",
    ":sk": "METADATA",
  },
};
```

---

## 6. Event Type Additions

Q's schema defines comprehensive event types. Add these for API operations:

### Authentication Events

```
AUTH_LOGIN_SUCCESS
AUTH_LOGIN_FAILED
AUTH_LOGOUT
AUTH_PASSWORD_RESET_REQUESTED
AUTH_PASSWORD_RESET_COMPLETED
```

### License Events (Phone-Home)

```
LICENSE_PHONE_HOME_SUCCESS
LICENSE_PHONE_HOME_FAILED
LICENSE_OFFLINE_GRACE_STARTED
LICENSE_OFFLINE_EXPIRED
```

### Machine Events (More Specific)

```
MACHINE_ACTIVATED
MACHINE_DEACTIVATED
MACHINE_ACTIVATION_DENIED      // Limit reached
MACHINE_VALIDATION_SUCCESS
MACHINE_VALIDATION_FAILED
```

### Trial Events

```
TRIAL_STARTED
TRIAL_ENDING_SOON             // Day 10, 12, 13 warnings
TRIAL_ENDED
TRIAL_CONVERTED               // Trial → Paid
TRIAL_EXPIRED                 // Trial ended, no conversion
```

---

## 7. Access Pattern Additions

Q's schema covers core patterns. Add for API routes:

| Access Pattern           | Key Condition                        | Index | Use Case             |
| ------------------------ | ------------------------------------ | ----- | -------------------- |
| Get customer by Auth0 ID | GSI3PK = AUTH0#id                    | GSI3  | Portal login         |
| Get machines for license | PK = LIC#id, SK begins_with MACHINE# | Table | Machine management   |
| Get trial customers      | Scan with filter: trialEndsAt < now  | Table | Trial expiration job |
| Get past-due customers   | Scan with filter: status = PAST_DUE  | Table | Dunning job          |

**Note:** Trial/past-due queries are batch jobs, not real-time—full scan is acceptable.

---

## 8. Table Name Reconciliation

| Document     | Table Name           |
| ------------ | -------------------- |
| Q's Schema   | `hic-plg-production` |
| GC Tech Spec | `hic-plg-prod`       |

**Resolution:** Adopt `hic-plg-production` (Q's convention, more explicit).

Add environment-specific tables:

- `hic-plg-development` — local/dev testing
- `hic-plg-staging` — pre-production
- `hic-plg-production` — live

---

## 9. Recommended Schema Consolidation

### Final Customer Entity

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "METADATA",

  // Identity
  customerId: "cust_abc123",
  email: "simon@hic-ai.com",
  name: "Simon Reiff",
  customerType: "INDIVIDUAL",            // INDIVIDUAL | TEAM | ENTERPRISE | ACADEMIC | NONPROFIT | GOVERNMENT

  // Auth0 Integration
  auth0UserId: "auth0|abc123",

  // Stripe Integration
  stripeCustomerId: "cus_StripeAbc123",
  stripeSubscriptionId: "sub_StripeXyz789",

  // Keygen Integration
  keygenLicenseId: "lic-abc-123",
  keygenLicenseKey: "MOUSE-A3F9-B2E1-C7D4-8F6A",

  // Organization (Enterprise only)
  organizationName: null,
  organizationDomain: null,

  // Subscription
  status: "ACTIVE",                      // ACTIVE | TRIAL | PAST_DUE | SUSPENDED | CANCELLED
  subscriptionStatus: "active",          // Stripe mirror
  billingFrequency: "MONTHLY",
  seats: 1,
  monthlyPricePerSeat: 40.00,

  // Trial Tracking
  trialStartedAt: "2026-01-21T00:00:00Z",
  trialEndsAt: "2026-02-04T00:00:00Z",
  convertedAt: null,

  // Payment Tracking
  paymentFailedAt: null,
  gracePeriodEndsAt: null,

  // Pricing
  pricingTier: "LAUNCH",
  appliedCoupon: "LAUNCH50",

  // Attribution
  acquisitionSource: "website",
  acquisitionCampaign: "launch2026",

  // Timestamps
  createdAt: "2026-01-21T22:00:00Z",
  updatedAt: "2026-01-21T22:00:00Z",

  // GSI Keys
  GSI1PK: "STRIPE#cus_StripeAbc123",
  GSI1SK: "METADATA",
  GSI2PK: "KEYGEN#MOUSE-A3F9-B2E1-C7D4-8F6A",
  GSI2SK: "METADATA",
  GSI3PK: "AUTH0#auth0|abc123",
  GSI3SK: "METADATA"
}
```

### Final License Entity

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "LIC#lic-abc-123",

  // Keygen Data
  keygenLicenseId: "lic-abc-123",
  keygenLicenseKey: "MOUSE-A3F9-B2E1-C7D4-8F6A",
  keygenPolicyId: "pol-individual",

  // License Details
  status: "ACTIVE",                      // ACTIVE | SUSPENDED | EXPIRED | REVOKED
  tier: "INDIVIDUAL",                    // INDIVIDUAL | TEAM | ENTERPRISE

  // Machine Limits
  maxMachines: 3,
  activeMachines: 2,

  // Features
  features: ["batch_edit", "for_lines", "adjust", "staging"],
  featureOverrides: {},

  // Validation
  lastValidatedAt: "2026-01-21T15:30:00Z",
  lastPhoneHomeAt: "2026-01-21T15:30:00Z",
  phoneHomeCount: 47,
  cacheValidUntil: "2026-01-28T00:00:00Z",

  // Expiration
  expiresAt: null,                       // null = subscription-linked

  // Timestamps
  createdAt: "2026-01-21T22:00:00Z",
  issuedBy: "stripe_webhook"
}
```

### Final Machine Entity

```javascript
{
  // Primary Keys
  PK: "LIC#lic-abc-123",
  SK: "MACHINE#sha256fingerprint",

  // Machine Identity
  machineFingerprint: "sha256fingerprint",
  machineName: "MacBook Pro (Work)",

  // Environment
  platform: "darwin",
  vsCodeVersion: "1.96.0",
  mouseVersion: "0.9.8",

  // Activity
  activatedAt: "2026-01-21T10:00:00Z",
  lastSeenAt: "2026-01-21T15:30:00Z",

  // Status
  status: "ACTIVE"                       // ACTIVE | DEACTIVATED
}
```

---

## 10. Implementation Checklist

Before development begins, ensure:

- [ ] CloudFormation template uses correct table name (`hic-plg-production`)
- [ ] GSI3 (Auth0 lookup) added to table definition
- [ ] All entities include updated fields from this addendum
- [ ] Pricing fields reflect $40/mo (not $40/yr)
- [ ] MACHINE entity added as sub-item under License PK
- [ ] Event types include all authentication and trial events
- [ ] lib/dynamodb.js helper functions align with adopted key patterns

---

## 11. Summary of Changes

| Item              | Q's Original         | Adopted              | Rationale                      |
| ----------------- | -------------------- | -------------------- | ------------------------------ |
| Customer PK       | `CUST#<email>`       | `CUST#<email>`       | Natural identifier             |
| Customer SK       | `METADATA`           | `METADATA`           | Q's convention                 |
| GSI2 Prefix       | `KEYGEN#`            | `KEYGEN#`            | Consistent with STRIPE#        |
| Table Name        | `hic-plg-production` | `hic-plg-production` | More explicit                  |
| Pricing           | $40/year             | $40/month            | Corrected business requirement |
| Auth0 GSI         | (not present)        | GSI3 added           | Portal authentication          |
| Machine entity    | In User              | Separate entity      | API requirements               |
| Trial fields      | (not present)        | Added                | Trial tracking                 |
| Phone-home fields | (not present)        | Added                | Offline validation             |

---

**Recommended Next Action:** Update CloudFormation template with GSI3, then proceed with lib/dynamodb.js implementation using this consolidated schema.

---

_This addendum supplements Q's original schema memo and should be read in conjunction with it._
