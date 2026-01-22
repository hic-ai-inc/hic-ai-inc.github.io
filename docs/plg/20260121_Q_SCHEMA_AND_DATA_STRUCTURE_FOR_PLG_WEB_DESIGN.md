# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** Q Developer  
**DATE:** January 21, 2026  
**RE:** Schema and Data Structure for PLG Web Design

---

## Executive Summary

This memo defines the complete data architecture for the HIC AI Product-Led Growth (PLG) system. The design uses a single DynamoDB table with a multi-entity pattern, supporting all customer lifecycle operations from signup through billing, licensing, and audit trails.

**Key Design Principles:**
- Single-table design for optimal performance and cost
- Event-driven architecture with complete audit trail
- Stripe and Keygen.sh integration via foreign key mappings
- Support for both individual and enterprise customers
- Comprehensive access patterns for all business operations

---

## 1. Core Entities

The PLG system manages six primary entity types:

| Entity         | Purpose                                    | Count per Customer |
| -------------- | ------------------------------------------ | ------------------ |
| **Customer**   | Organization or individual who pays        | 1                  |
| **User**       | People who use Mouse (enterprise)          | 1-N                |
| **Subscription** | Stripe subscription record               | 1                  |
| **License**    | Keygen.sh license key                      | 1                  |
| **Invoice**    | Stripe invoice/payment records             | 1-N                |
| **Event**      | Audit trail of all actions                 | 1-N                |

---

## 2. Access Patterns

The schema must support these critical access patterns:

| Pattern                          | Use Case                           | Frequency |
| -------------------------------- | ---------------------------------- | --------- |
| Get customer by email            | Login, dashboard access            | High      |
| Get customer by Stripe ID        | Webhook processing                 | High      |
| Get customer by license key      | License validation (npx installer) | Very High |
| Get all data for customer        | Dashboard rendering                | Medium    |
| Get all users for customer       | Team management (enterprise)       | Medium    |
| Get subscription for customer    | Billing page                       | Medium    |
| Get invoices for customer        | Invoice history                    | Low       |
| Get recent events for customer   | Audit log                          | Low       |

---

## 3. DynamoDB Single-Table Design

### Table Configuration

**Table Name:** `hic-plg-production`

**Primary Key:**
- Partition Key (PK): String
- Sort Key (SK): String

**Global Secondary Indexes:**

**GSI1: Stripe Customer Lookup**
- GSI1PK: String (Partition Key)
- GSI1SK: String (Sort Key)
- Projection: ALL

**GSI2: License Key Lookup**
- GSI2PK: String (Partition Key)
- GSI2SK: String (Sort Key)
- Projection: ALL

### Key Pattern Structure

```
PK (Partition Key)    SK (Sort Key)              Entity Type
------------------------------------------------------------------
CUST#<email>          METADATA                   Customer
CUST#<email>          USER#<userId>              User
CUST#<email>          SUB#<stripeSubId>          Subscription
CUST#<email>          LIC#<keygenLicId>          License
CUST#<email>          INV#<stripeInvId>          Invoice
CUST#<email>          EVENT#<timestamp>#<id>     Event

STRIPE#<custId>       METADATA                   Stripe→Customer lookup
KEYGEN#<licenseKey>   METADATA                   License→Customer lookup
```

**Design Rationale:**
- Email as partition key enables direct customer lookup
- Sort key prefixes enable querying all entities for a customer
- GSI1 enables Stripe webhook processing without email lookup
- GSI2 enables license validation without customer lookup
- Timestamp in event SK enables chronological ordering

---

## 4. Entity Schemas

### 4.1 Customer (METADATA)

The primary customer record containing identity, billing, and integration data.

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "METADATA",
  
  // Identity
  customerId: "cust_abc123",           // Internal UUID
  email: "simon@hic-ai.com",
  customerType: "INDIVIDUAL",          // ACADEMIC | NONPROFIT | GOVERNMENT | INDIVIDUAL | ENTERPRISE
  
  // Stripe Integration
  stripeCustomerId: "cus_StripeAbc123",
  stripeSubscriptionId: "sub_StripeXyz789",
  
  // Keygen Integration
  keygenLicenseId: "lic-abc-123",
  keygenLicenseKey: "MOUSE-A3F9-B2E1-C7D4-8F6A",
  
  // Organization (for Enterprise)
  organizationName: null,              // "Acme Corp" for enterprise
  organizationDomain: null,            // "acme.com" for enterprise
  
  // Billing
  billingEmail: "simon@hic-ai.com",
  billingFrequency: "ANNUAL",          // MONTHLY | ANNUAL
  seats: 1,
  pricePerSeat: 40.00,                 // Annual price in USD
  
  // Status
  status: "ACTIVE",                    // ACTIVE | SUSPENDED | CANCELLED
  subscriptionStatus: "active",        // Stripe status: active | past_due | canceled
  
  // Metadata
  createdAt: "2026-01-21T22:00:00Z",
  updatedAt: "2026-01-21T22:00:00Z",
  
  // GSI Keys
  GSI1PK: "STRIPE#cus_StripeAbc123",
  GSI1SK: "METADATA",
  GSI2PK: "KEYGEN#MOUSE-A3F9-B2E1-C7D4-8F6A",
  GSI2SK: "METADATA"
}
```

**Field Notes:**
- `customerId`: Internal UUID, never exposed to external systems
- `customerType`: Determines pricing tier and validation requirements
- `organizationName/Domain`: Null for individual customers
- `pricePerSeat`: Stored as annual price; monthly calculated with 15% surcharge
- `status`: Internal status; `subscriptionStatus` mirrors Stripe

### 4.2 User (Enterprise Multi-User)

Individual users within an enterprise customer account.

```javascript
{
  // Primary Keys
  PK: "CUST#acme@acme.com",
  SK: "USER#user_xyz789",
  
  // Identity
  userId: "user_xyz789",
  email: "developer@acme.com",
  name: "Jane Developer",
  
  // Role (for enterprise)
  role: "MEMBER",                      // OWNER | ADMIN | MEMBER
  
  // Device Tracking
  activeDevices: 2,
  maxDevices: 2,
  lastActiveAt: "2026-01-21T22:00:00Z",
  
  // Metadata
  createdAt: "2026-01-21T22:00:00Z",
  invitedBy: "user_abc123"
}
```

**Field Notes:**
- Individual customers have no USER records (they are the sole user)
- Enterprise customers can have multiple USER records
- `role`: OWNER can manage billing, ADMIN can invite users, MEMBER can only use
- `activeDevices`: Tracked by Keygen.sh, synced to our database

### 4.3 Subscription

Stripe subscription data mirrored for fast access.

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "SUB#sub_StripeXyz789",
  
  // Stripe Data
  stripeSubscriptionId: "sub_StripeXyz789",
  stripeCustomerId: "cus_StripeAbc123",
  stripePriceId: "price_IndividualAnnual",
  
  // Subscription Details
  status: "active",                    // active | past_due | canceled | unpaid
  currentPeriodStart: "2026-01-21T00:00:00Z",
  currentPeriodEnd: "2027-01-21T00:00:00Z",
  cancelAtPeriodEnd: false,
  
  // Pricing
  seats: 1,
  pricePerSeat: 40.00,
  totalAmount: 40.00,
  currency: "usd",
  billingFrequency: "ANNUAL",
  
  // Metadata
  createdAt: "2026-01-21T22:00:00Z",
  updatedAt: "2026-01-21T22:00:00Z"
}
```

**Field Notes:**
- Stripe is source of truth; this is a cached copy for performance
- Updated via Stripe webhooks
- `currentPeriodEnd`: Used to calculate renewal date
- `cancelAtPeriodEnd`: User requested cancellation but still active

### 4.4 License

Keygen.sh license data mirrored for fast access.

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "LIC#lic-abc-123",
  
  // Keygen Data
  keygenLicenseId: "lic-abc-123",
  keygenLicenseKey: "MOUSE-A3F9-B2E1-C7D4-8F6A",
  keygenPolicyId: "pol-standard",
  
  // License Details
  status: "ACTIVE",                    // ACTIVE | SUSPENDED | EXPIRED | REVOKED
  maxMachines: 2,
  activeMachines: 1,
  
  // Expiration
  expiresAt: "2027-01-21T00:00:00Z",
  lastValidatedAt: "2026-01-21T22:00:00Z",
  
  // Metadata
  createdAt: "2026-01-21T22:00:00Z",
  issuedBy: "stripe_webhook"
}
```

**Field Notes:**
- Keygen.sh is source of truth; this is a cached copy
- `keygenLicenseKey`: The actual key users enter in npx installer
- `maxMachines`: Concurrent device limit (2 for standard, 3 for enterprise)
- `lastValidatedAt`: Updated on each npx installer validation

### 4.5 Invoice

Stripe invoice records for billing history.

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "INV#in_StripeInv123",
  
  // Stripe Data
  stripeInvoiceId: "in_StripeInv123",
  stripeCustomerId: "cus_StripeAbc123",
  stripeSubscriptionId: "sub_StripeXyz789",
  
  // Invoice Details
  status: "paid",                      // draft | open | paid | void | uncollectible
  amountDue: 4000,                     // cents
  amountPaid: 4000,
  currency: "usd",
  
  // Dates
  invoiceDate: "2026-01-21T00:00:00Z",
  dueDate: "2026-01-21T00:00:00Z",
  paidAt: "2026-01-21T22:00:00Z",
  
  // PDF
  invoicePdfUrl: "https://stripe.com/invoices/...",
  
  // Metadata
  createdAt: "2026-01-21T22:00:00Z"
}
```

**Field Notes:**
- Created via Stripe webhooks on invoice generation
- `amountDue/amountPaid`: Stored in cents (Stripe convention)
- `invoicePdfUrl`: Direct link to Stripe-hosted PDF

### 4.6 Event (Audit Trail)

Complete audit trail of all system actions.

```javascript
{
  // Primary Keys
  PK: "CUST#simon@hic-ai.com",
  SK: "EVENT#2026-01-21T22:00:00.000Z#evt_abc123",
  
  // Event Identity
  eventId: "evt_abc123",
  eventType: "SUBSCRIPTION_CREATED",   // See event types below
  
  // Source
  source: "stripe_webhook",            // stripe_webhook | keygen_webhook | api | manual
  sourceId: "evt_stripe_xyz",          // External event ID
  
  // Payload
  payload: {
    subscriptionId: "sub_StripeXyz789",
    seats: 1,
    amount: 40.00
  },
  
  // Metadata
  timestamp: "2026-01-21T22:00:00.000Z",
  ipAddress: "203.0.113.42",
  userAgent: "Stripe/1.0"
}
```

**Field Notes:**
- SK includes timestamp for chronological ordering
- `eventType`: Standardized event taxonomy (see section 5)
- `payload`: Flexible JSON for event-specific data
- `source`: Tracks origin for debugging and compliance

---

## 5. Event Types

Complete taxonomy of system events for audit trail:

### Customer Lifecycle
```
CUSTOMER_CREATED
CUSTOMER_UPDATED
CUSTOMER_DELETED
```

### Subscription Lifecycle
```
SUBSCRIPTION_CREATED
SUBSCRIPTION_UPDATED
SUBSCRIPTION_CANCELLED
SUBSCRIPTION_RENEWED
SUBSCRIPTION_PAST_DUE
```

### License Lifecycle
```
LICENSE_CREATED
LICENSE_ACTIVATED
LICENSE_VALIDATED
LICENSE_SUSPENDED
LICENSE_REVOKED
LICENSE_EXPIRED
```

### Payment Events
```
INVOICE_CREATED
INVOICE_PAID
INVOICE_PAYMENT_FAILED
PAYMENT_METHOD_UPDATED
```

### User Events (Enterprise)
```
USER_INVITED
USER_JOINED
USER_REMOVED
USER_ROLE_CHANGED
```

### Device Events
```
DEVICE_ACTIVATED
DEVICE_DEACTIVATED
DEVICE_LIMIT_EXCEEDED
```

---

## 6. Access Pattern Implementation

### 6.1 Get Customer by Email

**Use Case:** User login, dashboard access

```javascript
const params = {
  TableName: 'hic-plg-production',
  Key: {
    PK: 'CUST#simon@hic-ai.com',
    SK: 'METADATA'
  }
};

const result = await dynamodb.getItem(params);
```

**Performance:** Single-item read, ~5ms latency

### 6.2 Get Customer by Stripe ID

**Use Case:** Stripe webhook processing

```javascript
const params = {
  TableName: 'hic-plg-production',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
  ExpressionAttributeValues: {
    ':pk': 'STRIPE#cus_StripeAbc123',
    ':sk': 'METADATA'
  }
};

const result = await dynamodb.query(params);
const customer = result.Items[0];
```

**Performance:** GSI query, ~10ms latency

### 6.3 Get Customer by License Key

**Use Case:** npx installer license validation (highest frequency)

```javascript
const params = {
  TableName: 'hic-plg-production',
  IndexName: 'GSI2',
  KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK = :sk',
  ExpressionAttributeValues: {
    ':pk': 'KEYGEN#MOUSE-A3F9-B2E1-C7D4-8F6A',
    ':sk': 'METADATA'
  }
};

const result = await dynamodb.query(params);
const customer = result.Items[0];
```

**Performance:** GSI query, ~10ms latency

### 6.4 Get All Data for Customer

**Use Case:** Dashboard rendering (customer + subscription + license + invoices)

```javascript
const params = {
  TableName: 'hic-plg-production',
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: {
    ':pk': 'CUST#simon@hic-ai.com'
  }
};

const result = await dynamodb.query(params);
// Returns: Customer, Users, Subscription, License, Invoices, Events
```

**Performance:** Single query, ~15ms latency, returns all related entities

### 6.5 Get Recent Events for Customer

**Use Case:** Audit log display

```javascript
const params = {
  TableName: 'hic-plg-production',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'CUST#simon@hic-ai.com',
    ':sk': 'EVENT#'
  },
  ScanIndexForward: false,  // Descending order (newest first)
  Limit: 50
};

const result = await dynamodb.query(params);
```

**Performance:** Single query with limit, ~10ms latency

---

## 7. Customer Type Configuration

Pricing and validation rules by customer type:

```javascript
const CUSTOMER_TYPES = {
  ACADEMIC: {
    priceAnnual: 20.00,
    priceMonthly: 23.50,              // 15% surcharge
    domainPattern: /\.edu$/,
    requiresVerification: true,
    description: "Universities, students, researchers"
  },
  NONPROFIT: {
    priceAnnual: 20.00,
    priceMonthly: 23.50,
    domainPattern: /\.org$/,
    requiresVerification: true,
    description: "501(c)(3) organizations"
  },
  GOVERNMENT: {
    priceAnnual: 30.00,
    priceMonthly: 35.25,
    domainPattern: /\.(gov|mil)$/,
    requiresVerification: false,
    description: "Federal, state, local agencies"
  },
  INDIVIDUAL: {
    priceAnnual: 40.00,
    priceMonthly: 47.00,
    domainPattern: null,
    requiresVerification: false,
    description: "Solo developers, freelancers"
  },
  ENTERPRISE: {
    priceAnnual: 50.00,
    priceMonthly: 58.75,
    domainPattern: null,
    requiresVerification: false,
    minSeats: 2,
    description: "Companies, teams"
  }
};
```

**Validation Logic:**
1. Extract email domain on signup
2. Match against `domainPattern` for automatic tier detection
3. If `requiresVerification: true`, flag for manual approval
4. Apply pricing based on tier and billing frequency

---

## 8. Integration Points

### 8.1 Stripe Integration

**Webhook Events to Handle:**

| Stripe Event                    | Action                                  |
| ------------------------------- | --------------------------------------- |
| `checkout.session.completed`    | Create customer + subscription + license |
| `customer.subscription.updated` | Update subscription record              |
| `customer.subscription.deleted` | Mark subscription cancelled, revoke license |
| `invoice.created`               | Create invoice record                   |
| `invoice.paid`                  | Update invoice status, create event     |
| `invoice.payment_failed`        | Mark subscription past_due, suspend license |

**Data Flow:**
```
Stripe Webhook → API Gateway → Lambda → DynamoDB
                                      → Keygen.sh (license creation)
                                      → SNS (event notification)
```

### 8.2 Keygen.sh Integration

**API Calls:**

| Operation           | Trigger                     | Action                    |
| ------------------- | --------------------------- | ------------------------- |
| Create License      | Stripe checkout completed   | POST /v1/accounts/:id/licenses |
| Validate License    | npx installer runs          | POST /v1/accounts/:id/licenses/actions/validate-key |
| Suspend License     | Payment failed              | POST /v1/accounts/:id/licenses/:id/actions/suspend |
| Revoke License      | Subscription cancelled      | DELETE /v1/accounts/:id/licenses/:id |
| Check Device Count  | Dashboard rendering         | GET /v1/accounts/:id/licenses/:id/machines |

**Data Sync:**
- Keygen.sh is source of truth for license status
- Our database caches for performance
- Sync on webhook events and periodic refresh

---

## 9. Data Lifecycle

### Customer Creation Flow

```
1. User completes Stripe Checkout
2. Stripe webhook: checkout.session.completed
3. Lambda creates:
   - Customer record (METADATA)
   - Subscription record (SUB#)
   - Event record (EVENT#...#CUSTOMER_CREATED)
4. Lambda calls Keygen.sh to create license
5. Lambda creates License record (LIC#)
6. Lambda creates Event record (EVENT#...#LICENSE_CREATED)
7. User redirected to dashboard with license key
```

### Subscription Update Flow

```
1. User changes seat count in Stripe Customer Portal
2. Stripe webhook: customer.subscription.updated
3. Lambda updates:
   - Customer record (seats, pricePerSeat, totalAmount)
   - Subscription record (seats, totalAmount)
   - Event record (EVENT#...#SUBSCRIPTION_UPDATED)
4. Lambda calls Keygen.sh to update license policy
5. Lambda updates License record (maxMachines if applicable)
```

### Payment Failure Flow

```
1. Stripe payment fails
2. Stripe webhook: invoice.payment_failed
3. Lambda updates:
   - Customer record (status: SUSPENDED, subscriptionStatus: past_due)
   - Subscription record (status: past_due)
   - Event record (EVENT#...#INVOICE_PAYMENT_FAILED)
4. Lambda calls Keygen.sh to suspend license
5. Lambda updates License record (status: SUSPENDED)
6. Next npx installer validation fails gracefully
```

### Cancellation Flow

```
1. User cancels subscription in Stripe Customer Portal
2. Stripe webhook: customer.subscription.deleted
3. Lambda updates:
   - Customer record (status: CANCELLED, subscriptionStatus: canceled)
   - Subscription record (status: canceled)
   - Event record (EVENT#...#SUBSCRIPTION_CANCELLED)
4. Lambda calls Keygen.sh to revoke license
5. Lambda updates License record (status: REVOKED)
6. npx installer validation fails immediately
```

---

## 10. Performance Considerations

### Read Patterns

| Operation                | Method    | Latency | Cost (per 1M) |
| ------------------------ | --------- | ------- | ------------- |
| Get customer by email    | GetItem   | ~5ms    | $0.25         |
| Get customer by Stripe   | GSI Query | ~10ms   | $0.25         |
| Get customer by license  | GSI Query | ~10ms   | $0.25         |
| Get all customer data    | Query     | ~15ms   | $0.25         |
| Get recent events        | Query     | ~10ms   | $0.25         |

### Write Patterns

| Operation              | Method  | Latency | Cost (per 1M) |
| ---------------------- | ------- | ------- | ------------- |
| Create customer        | PutItem | ~10ms   | $1.25         |
| Update subscription    | UpdateItem | ~10ms | $1.25      |
| Create event           | PutItem | ~10ms   | $1.25         |

### Capacity Planning

**Assumptions:**
- 1,000 active customers
- 10 license validations per customer per day (npx installer)
- 1 dashboard view per customer per day
- 1 webhook event per customer per month

**Daily Operations:**
- License validations: 10,000 reads (GSI2)
- Dashboard views: 1,000 reads (Query)
- Webhook events: ~33 writes

**Monthly Cost Estimate:**
- Reads: ~330,000 × $0.25/1M = $0.08
- Writes: ~1,000 × $1.25/1M = $0.00
- Storage: 1,000 customers × 10KB = 10MB = $0.00

**Total: < $1/month for 1,000 customers**

---

## 11. Security Considerations

### Data Protection

- **Encryption at rest:** DynamoDB encryption enabled
- **Encryption in transit:** TLS 1.2+ for all API calls
- **PII handling:** Email addresses are partition keys (queryable but not scanned)
- **Payment data:** Never stored (Stripe handles all payment details)

### Access Control

- **IAM roles:** Least-privilege policies per Lambda function
- **API Gateway:** JWT authentication for customer-facing APIs
- **Webhook validation:** Stripe signature verification required
- **License keys:** Stored in plaintext (required for validation, not sensitive)

### Audit Trail

- **All mutations logged:** Every write operation creates an EVENT record
- **Immutable events:** Events never updated or deleted
- **Source tracking:** Every event records source, sourceId, IP, user agent
- **Retention:** Events retained indefinitely for compliance

---

## 12. Migration and Versioning

### Schema Evolution

**Adding Fields:**
- New fields can be added without migration
- Old records will have undefined values (handle in application code)

**Removing Fields:**
- Mark as deprecated, remove from writes
- Old records retain field (ignored by application)

**Changing Keys:**
- Requires full table migration (avoid if possible)
- Use GSI for new access patterns instead

### Data Migration Strategy

**Phase 1: Dual Write**
- Write to both old and new schema
- Read from old schema

**Phase 2: Dual Read**
- Write to new schema only
- Read from new schema, fallback to old

**Phase 3: Cleanup**
- Remove old schema reads
- Archive old data

---

## 13. Testing Strategy

### Unit Tests

- Schema validation (ensure all required fields present)
- Access pattern queries (verify correct results)
- Customer type detection (domain pattern matching)
- Price calculation (annual vs monthly with surcharge)

### Integration Tests

- Stripe webhook processing (end-to-end)
- Keygen.sh API calls (license creation, validation)
- Event creation (audit trail completeness)

### Load Tests

- 1,000 concurrent license validations
- 100 concurrent dashboard renders
- Webhook burst (100 events in 1 second)

---

## 14. Monitoring and Alerting

### CloudWatch Metrics

- DynamoDB read/write capacity utilization
- Lambda invocation count and duration
- API Gateway 4xx/5xx error rates
- Stripe webhook processing latency

### Alarms

- DynamoDB throttling (capacity exceeded)
- Lambda errors (> 1% error rate)
- Webhook processing failures (> 5% failure rate)
- License validation failures (> 10% failure rate)

### Dashboards

- Real-time customer count by type
- Daily revenue (from invoice records)
- Active licenses vs suspended/revoked
- Top 10 customers by seat count

---

## 15. Next Steps

With this data schema defined, the next phase is API design:

### API Endpoints Required

**Customer-Facing:**
- `POST /api/customers` - Create customer (from Stripe webhook)
- `GET /api/customers/:email` - Get customer data
- `PATCH /api/customers/:email` - Update customer
- `GET /api/customers/:email/invoices` - Get invoice history
- `GET /api/customers/:email/events` - Get audit log

**Internal:**
- `POST /api/webhooks/stripe` - Stripe webhook handler
- `POST /api/webhooks/keygen` - Keygen.sh webhook handler
- `POST /api/licenses/validate` - License validation (npx installer)

**Admin:**
- `GET /api/admin/customers` - List all customers
- `GET /api/admin/metrics` - System metrics
- `POST /api/admin/customers/:email/suspend` - Manual suspension

### Infrastructure Required

- DynamoDB table with GSIs
- Lambda functions for API endpoints
- API Gateway with JWT authentication
- CloudWatch dashboards and alarms
- Secrets Manager for Stripe/Keygen.sh API keys

---

## 16. Conclusion

This data schema provides a complete foundation for the HIC AI PLG system. The single-table design optimizes for performance and cost while supporting all required access patterns. Integration with Stripe and Keygen.sh is straightforward via foreign key mappings and webhook processing.

**Key Strengths:**
- ✅ Single-table design for optimal performance
- ✅ Complete audit trail via event sourcing
- ✅ Support for individual and enterprise customers
- ✅ Efficient access patterns for all operations
- ✅ Scalable to 10,000+ customers with minimal cost

**Recommended Next Action:** Design API endpoints that operate on this schema, then proceed to website and infrastructure implementation.

---

**Attachments:**
- None

**Distribution:**
- Simon Reiff, President & Technical Founder
- General Counsel (for review)
- Corporate Records

---

_This memorandum is for internal planning purposes and does not constitute legal advice._
