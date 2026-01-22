# HIC AI PLG Website

Product-Led Growth website for **Mouse** - precision editing tools for AI coding agents.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js 16 App                          │
├─────────────────────────────────────────────────────────────────┤
│  Pages                     │  API Routes                       │
│  ├── / (landing)           │  ├── /api/auth/[auth0]           │
│  ├── /pricing              │  ├── /api/checkout               │
│  ├── /docs                 │  ├── /api/license/validate       │
│  ├── /checkout/*           │  ├── /api/license/activate       │
│  ├── /welcome              │  ├── /api/oss-application        │
│  └── /portal/*             │  ├── /api/portal/*               │
│       ├── dashboard        │  └── /api/webhooks/*             │
│       ├── license          │                                   │
│       ├── devices          │                                   │
│       ├── billing          │                                   │
│       ├── invoices         │                                   │
│       ├── settings         │                                   │
│       └── team             │                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │  Auth0   │       │  Stripe  │       │  Keygen  │
    │  (Auth)  │       │(Payments)│       │(Licenses)│
    └──────────┘       └──────────┘       └──────────┘
                              │
                              ▼
                       ┌──────────┐
                       │  AWS     │
                       │ DynamoDB │
                       │   SES    │
                       └──────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Auth0 account
- Stripe account
- Keygen.sh account
- AWS account (DynamoDB, SES)

### Installation

```bash
cd plg-website
npm install
```

### Environment Setup

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

### Development

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   │   ├── auth/           # Auth0 handlers
│   │   ├── checkout/       # Stripe checkout
│   │   ├── license/        # License validation
│   │   ├── portal/         # Portal APIs
│   │   └── webhooks/       # Stripe/Keygen webhooks
│   ├── docs/               # Documentation pages
│   ├── portal/             # Customer portal
│   ├── checkout/           # Checkout flows
│   └── welcome/            # Post-checkout onboarding
├── components/
│   ├── ui/                 # Reusable UI components
│   └── layout/             # Layout components
└── lib/                    # Utility libraries
    ├── auth.js             # Auth0 config
    ├── stripe.js           # Stripe client
    ├── keygen.js           # Keygen client
    ├── dynamodb.js         # DynamoDB operations
    ├── ses.js              # Email templates
    └── constants.js        # App constants
```

## 🎨 Design System

Based on HIC AI investor deck theme:

| Token         | Value     | Usage      |
| ------------- | --------- | ---------- |
| Midnight Navy | `#0B1220` | Background |
| Frost White   | `#F6F8FB` | Text       |
| Cerulean Mist | `#C9DBF0` | Accent     |

Typography:

- **Manrope** - Headlines
- **Inter** - Body text

## 💰 Pricing Tiers

| Tier            | Price       | Features                                           |
| --------------- | ----------- | -------------------------------------------------- |
| **Open Source** | $0          | 2 devices, community support                       |
| **Individual**  | $10/mo      | 3 devices, email support, 14-day trial             |
| **Enterprise**  | $25/seat/mo | 10 devices/seat, priority support, team management |

## 🔑 Key Flows

### Guest Checkout

1. User selects plan → Stripe Checkout
2. Payment success → Welcome page
3. Auth0 signup → License provisioned
4. Email with license key sent

### License Validation

1. VS Code extension calls `/api/license/validate`
2. Server validates with Keygen
3. Response includes status and expiry
4. Extension caches result

### Portal Access

1. User logs in via Auth0
2. Middleware protects `/portal/*`
3. Dashboard shows license/devices
4. Billing redirects to Stripe Portal

## 📝 Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## 🔧 Configuration

### Auth0

Create a Regular Web Application:

- Callback URL: `http://localhost:3000/api/auth/callback`
- Logout URL: `http://localhost:3000`

### Stripe

Configure products and prices:

- Individual Monthly: `price_individual_monthly`
- Individual Annual: `price_individual_annual`
- Enterprise tiers: `price_enterprise_10`, etc.

Set up webhooks:

- Endpoint: `/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`

### Keygen

Create policies:

- OSS Policy (2 machines, no expiry)
- Individual Policy (3 machines, monthly renewal)
- Enterprise Policy (10 machines per seat)

Set up webhooks:

- Endpoint: `/api/webhooks/keygen`
- Events: `license.*`, `machine.*`

## 📚 Documentation

- [PLG Technical Specification](../docs/plg/20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md)
- [User Journey](../docs/plg/20260122_GC_USER_JOURNEY_AND_GUEST_CHECKOUT_v2.md)
- [API Map](../docs/plg/20260122_GC_API_MAP_FOR_HIC_AI_WEBSITE_v2.md)
- [Security Considerations](../docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_NEXTJS_PROJECT.md)

## 🛡️ Security

- All sensitive keys server-side only (no `NEXT_PUBLIC_` prefix)
- CSRF protection via Auth0 SDK
- Webhook signature verification for Stripe/Keygen
- Rate limiting on license validation endpoints
- Input validation on all API routes

## 📄 License

Proprietary - HIC AI Inc.
