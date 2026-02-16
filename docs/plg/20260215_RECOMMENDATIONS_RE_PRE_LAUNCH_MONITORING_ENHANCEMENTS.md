# Pre-Launch Monitoring & Observability Enhancements

**Date:** 2026-02-15
**Author:** GC (GitHub Copilot)
**Status:** Recommendations — awaiting SWR review
**Context:** Structured logging rollout completed today (33 handlers, 24 endpoints, all emitting structured JSON via HicLog → CloudWatch). This memo identifies gaps and recommends enhancements to ensure launch-day visibility.

---

## Background

As of today, the HIC PLG platform has comprehensive structured logging across all 33 API route handlers via the `createApiLogger` → `HicLog` → `console.log(JSON.stringify())` → CloudWatch pipeline. Correlation IDs, sanitized metadata, and a consistent event taxonomy (`request_received`, `decision`, `response`, `exception`, `workflow_start/complete/error`) are in place.

**What already exists and is operational:**

| Component                            | Status                    | Details                                                                                               |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Structured logging (all 33 handlers) | ✅ Complete               | All API routes use `createApiLogger()` with correlation IDs                                           |
| Lambda log groups (4)                | ✅ CloudFormation-managed | `plg-stream-processor`, `plg-email-sender`, `plg-customer-update`, `plg-scheduled-tasks`              |
| Metric filters (6)                   | ✅ Live                   | `PAYMENT_SUCCEEDED/FAILED`, `CUSTOMER_CREATED`, `EMAIL_SENT/FAILED`, `ERROR` — Lambda log groups only |
| CloudWatch alarms (5)                | ✅ Live                   | High error rate, payment failures, email failures, 2× DLQ depth                                       |
| SNS alerting                         | ✅ Operational            | `plg-alerts-{env}` → `alerts@hic-ai.com` → `sreiff@hic-ai.com`                                        |
| PLG metrics CLI                      | ✅ Built (17 tests)       | `npm run metrics` — Stripe + KeyGen data, no CloudWatch integration                                   |
| Logging audit scripts (3)            | ✅ Built                  | `logging-audit.sh`, `logging-gate.sh`, `logging-probe.sh`                                             |
| Safe utilities                       | ✅ Wired                  | `safeJsonParse`, `sanitizeForLog` across all P0/P1/P2 files                                           |
| Secrets hygiene                      | ✅ Remediated             | All 4 findings closed, Secrets Manager canonical                                                      |

**The gap:** The 6 existing metric filters and 5 alarms target **Lambda log groups only**. Zero metric filters target `/aws/amplify/d2yhz9h4xdd5rb` — the Amplify SSR log group where all 33 API handlers emit structured JSON. The structured logging system is comprehensive but nobody is listening to it yet.

---

## Tier 1: Pre-Launch Blockers

These gaps would leave SWR genuinely blind on launch day. Estimated effort: **~6 hours total**.

### 1. CloudWatch Metric Filters for the Amplify SSR Log Group

**Priority:** Critical
**Effort:** 3 hours
**Why:** Without this, the structured logs from all 33 API handlers produce no metrics and trigger no alarms.

#### Recommended Metric Filters

| Metric Name                | Filter Pattern                                                                  | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `PLG-API-5xx`              | `{ $.level = "ERROR" && $.statusCode >= 500 }`                                  | Server errors — most important signal                                    |
| `PLG-API-4xx`              | `{ $.level = "WARN" && $.statusCode >= 400 && $.statusCode < 500 }`             | Client errors — auth failures, bad inputs                                |
| `PLG-Checkout-Started`     | `{ $.service = "plg-api-checkout" && $.event = "workflow_start" }`              | Funnel: checkout attempts                                                |
| `PLG-Checkout-Failed`      | `{ $.service = "plg-api-checkout" && $.level = "ERROR" }`                       | Funnel: checkout failures                                                |
| `PLG-Provision-Success`    | `{ $.service = "plg-api-provision-license" && $.event = "workflow_complete" }`  | Funnel: successful license provisioning                                  |
| `PLG-Provision-Failed`     | `{ $.service = "plg-api-provision-license" && $.level = "ERROR" }`              | Funnel: provisioning failures — **customer paid but didn't get license** |
| `PLG-Trial-Init`           | `{ $.service = "plg-api-license-trial-init" && $.event = "workflow_complete" }` | Funnel: trial starts                                                     |
| `PLG-Webhook-Stripe-Error` | `{ $.service = "plg-api-webhooks-stripe" && $.level = "ERROR" }`                | Upstream: Stripe webhook processing failures                             |
| `PLG-Webhook-Keygen-Error` | `{ $.service = "plg-api-webhooks-keygen" && $.level = "ERROR" }`                | Upstream: Keygen webhook processing failures                             |
| `PLG-Auth-Failed`          | `{ $.event = "auth_failed" }`                                                   | Security: authentication failures across all protected endpoints         |

#### Recommended Alarms (wired to existing `plg-alerts-{env}` SNS topic)

| Alarm Name               | Metric                                                  | Threshold     | Period | Rationale                                    |
| ------------------------ | ------------------------------------------------------- | ------------- | ------ | -------------------------------------------- |
| `API-5xx-High`           | `PLG-API-5xx`                                           | >5 in 5 min   | 5 min  | Something is broken for customers            |
| `Checkout-Failure-Spike` | `PLG-Checkout-Failed`                                   | >3 in 15 min  | 15 min | Revenue is at risk                           |
| `Provision-Failure-Any`  | `PLG-Provision-Failed`                                  | ≥1 in 5 min   | 5 min  | **P1: Customer paid but didn't get license** |
| `Webhook-Failure-Spike`  | `PLG-Webhook-Stripe-Error` + `PLG-Webhook-Keygen-Error` | >5 in 15 min  | 15 min | Stripe/Keygen state divergence growing       |
| `Auth-Failure-Spike`     | `PLG-Auth-Failed`                                       | >20 in 10 min | 10 min | Brute-force attempt or auth infra down       |

**Implementation note:** The `Provision-Failure-Any` alarm deserves special emphasis. If someone completes Stripe checkout but license provisioning fails, they've been charged and received nothing. This must be detected within minutes, not hours.

**Implementation path:** Add these as new resources in `plg-monitoring.yaml` referencing the Amplify SSR log group ARN, or create a companion `plg-monitoring-amplify.yaml` template.

---

### 2. Health Check Endpoint (`/api/health`)

**Priority:** Critical
**Effort:** 30 minutes
**Why:** No unauthenticated health endpoint exists. External uptime monitoring (UptimeRobot, Route 53 health checks) cannot work without one. Amplify access logs don't capture custom domain traffic (`staging.hic-ai.com`), so structured logging is the only internal signal — an external probe is the only way to catch infrastructure-layer failures (DNS, certificate expiry, CDN outages, Amplify platform issues).

**Specification:**

```
GET /api/health → 200 { "status": "ok", "timestamp": "2026-02-15T..." }
                → 503 { "status": "degraded", "checks": { "dynamodb": "fail", ... } }
```

Health checks:

- DynamoDB connectivity (lightweight `DescribeTable` or no-op read on `hic-plg-{env}`)
- Secrets Manager access (verify cache is populated)
- Return `200` only if all critical dependencies are reachable

This must be unauthenticated, fast (<500ms), and not emit verbose logs on success (to avoid noise). Use a dedicated `plg-api-health` service name so it can be filtered out of volume metrics.

---

### 3. Severity Definitions + Minimal Runbook (TODO 19 Completion)

**Priority:** Tier 2 pre-launch blocker (per PLG_ROADMAP_v7)
**Effort:** 2 hours
**Why:** 5 of 8 checklist items complete; 3 remain.

#### Severity Definitions

| Severity | Definition                            | Response Time     | Examples                                                                          |
| -------- | ------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| **P1**   | Revenue loss or total service outage  | 15 minutes        | Provision failures (paid but no license), site down, Stripe webhook failures      |
| **P2**   | Degraded experience or partial outage | 1 hour            | High API error rate, slow responses, email delivery failures, auth service issues |
| **P3**   | Non-critical feature broken           | 4 hours           | Portal settings error, team invite issue, dashboard rendering                     |
| **P4**   | Cosmetic or logging issue             | Next business day | Non-critical log gaps, minor UI issues, stale cache                               |

#### Minimal Runbook (3 scenarios)

Each entry should follow: **Detection → Verify → Impact Assessment → Remediation → Post-mortem**

1. **Site completely down** (P1)
   - Detection: External uptime monitor alert + user reports
   - Verify: Check Amplify console, CloudWatch, DNS resolution
   - Remediation: Check Amplify deployment status, roll back if needed, check AWS health dashboard

2. **Customer paid but didn't get license** (P1)
   - Detection: `Provision-Failure-Any` alarm
   - Verify: CloudWatch Logs Insights query filtering `service = "plg-api-provision-license"` and `level = "ERROR"`, correlate with Stripe dashboard
   - Remediation: Manual license provisioning via Keygen admin + customer notification via SES

3. **Stripe/Keygen webhook backlog** (P1/P2)
   - Detection: DLQ depth alarms, webhook error rate alarms
   - Verify: Check SQS DLQ message count, CloudWatch logs for webhook processing errors
   - Remediation: Investigate error cause, fix, then redrive DLQ messages; verify Stripe webhook delivery in Stripe dashboard

**Implementation path:** Create `docs/plg/INCIDENT_RESPONSE_RUNBOOK.md` as specified in the Security Audit Plan V2.

---

### 4. Amplify SSR Log Group Retention + IaC

**Priority:** High (cost protection)
**Effort:** 30 minutes
**Why:** The Amplify log group `/aws/amplify/d2yhz9h4xdd5rb` was manually created (Amplify Gen 2 bug), has **no retention policy** (infinite retention = unbounded cost), and is not managed by CloudFormation.

**Actions:**

- Set retention: **90 days** (staging), **365 days** (production)
- Add an `AWS::Logs::LogGroup` resource to CloudFormation with `DeletionPolicy: Retain` (CloudFormation will adopt the existing log group)
- This prevents unbounded CloudWatch Logs storage cost growth post-launch, especially if Mouse is more popular than expected

---

## Tier 2: Pre-Launch High-ROI

Strongly recommended. Separates "we'll probably notice if something breaks" from "we'll know within minutes exactly what broke and why." Estimated effort: **~5.5 hours total**.

### 5. CloudWatch Logs Insights Saved Queries

**Priority:** High
**Effort:** 1 hour
**Why:** Structured logs are perfectly formatted for Logs Insights but zero saved queries exist. These are the launch-day command center — create them in advance so they're one click away.

#### Recommended Query Library

**API Error Investigation (last 1h):**

```sql
fields @timestamp, service, event, message, statusCode, correlationId
| filter level = "ERROR"
| sort @timestamp desc
| limit 50
```

**Checkout Funnel (last 24h):**

```sql
fields @timestamp, service, event, message
| filter service like /plg-api-checkout/ or service like /plg-api-provision/
| stats count() by event
| sort count() desc
```

**Request Volume by Endpoint (last 1h):**

```sql
fields service
| filter event = "request_received"
| stats count() as requests by service
| sort requests desc
```

**Trace Single Request (by correlation ID):**

```sql
fields @timestamp, level, service, event, message
| filter correlationId = "YOUR-UUID-HERE"
| sort @timestamp asc
```

**Auth Failure Patterns:**

```sql
fields @timestamp, service, path, message, reason
| filter event = "auth_failed"
| stats count() as failures by path, reason
| sort failures desc
```

**Webhook Processing Health:**

```sql
fields @timestamp, service, event, message, duration_ms
| filter service like /webhook/
| stats count() as total,
        sum(level="ERROR") as errors,
        avg(duration_ms) as avg_duration
  by service
```

**Trial → Checkout Correlation (30d funnel):**

```sql
fields @timestamp, service, event
| filter (service = "plg-api-license-trial-init" and event = "workflow_complete")
    or (service = "plg-api-checkout" and event = "workflow_start")
| stats count() by service, event
```

**Implementation:** Create these directly in the CloudWatch console (Logs → Insights → Save query). No infrastructure code needed.

---

### 6. CloudWatch Dashboard for Launch Day

**Priority:** High
**Effort:** 2 hours
**Why:** Provides a single URL to open on launch day. Combined with the Logs Insights queries, enables going from "something's wrong" to "I know exactly what's wrong" in under 60 seconds.

#### Dashboard Layout: `PLG-LaunchDay-{env}`

| Row                       | Widgets                                                                       | Source                                        |
| ------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| **Row 1: Health**         | API 5xx rate (number + time-series), API 4xx rate, Total request volume       | Amplify SSR metric filters                    |
| **Row 2: Revenue Funnel** | Checkout Started → Checkout Verified → License Provisioned → Provision Failed | Amplify SSR metric filters                    |
| **Row 3: Growth**         | Trial Inits (today), Active Heartbeats, Auth Failures                         | Amplify SSR metric filters                    |
| **Row 4: Infrastructure** | Lambda Errors (all 4), DLQ Depth (Email + CustomerUpdate), Webhook Error Rate | Existing Lambda metrics + new Amplify filters |

**Implementation:** CloudFormation dashboard resource in `plg-monitoring.yaml` (or via console for speed, then codify later).

---

### 7. External Uptime Monitoring

**Priority:** High
**Effort:** 30 minutes (after health endpoint exists)
**Why:** Catches the things CloudWatch cannot: DNS failures, certificate expiry, CDN outages, Amplify platform outages.

**Recommendation:** UptimeRobot free tier or Better Stack free tier:

- Ping `https://staging.hic-ai.com/api/health` every 5 minutes
- Alert via email + SMS on failure
- Upgrade to paid tier post-launch if needed for more frequent checks or status page integration

---

### 8. Automate the Logging Probe

**Priority:** Medium-High
**Effort:** 1 hour
**Why:** `logging-probe.sh` already exists and hits 12 endpoints with `X-HIC-Probe-Id` correlation headers. Automating it creates a "the structured logging pipeline is actually working" canary.

**Options:**

- **Simple (staging):** Local cron job or Windows Task Scheduler running `logging-probe.sh` every 15 minutes
- **Production-ready:** EventBridge rule → Lambda that hits the same 12 probe endpoints and checks CloudWatch for corresponding log entries within 60 seconds
- Alert if any probe returns non-2xx or if correlating logs don't appear in CloudWatch

---

### 9. Plausible Analytics — Top-of-Funnel Visibility

**Priority:** High (pulled forward from Tier 3 post-launch → Tier 2 pre-launch)
**Effort:** 30 minutes
**Cost:** $9/month
**Why:** Structured logging covers the bottom of the funnel beautifully (checkout → payment → license → activation), but you are **completely blind to the top of the funnel** — the 99% of visitors who never hit an API endpoint. Without client-side analytics, you cannot answer the most important post-launch question: *"Is my problem that not enough people are visiting, or that visitors aren't converting?"* These require completely different responses (marketing vs UX/pricing fixes).

#### Why Plausible Specifically

- **No cookies** → no cookie consent banner needed (GDPR, CCPA, ePrivacy all satisfied)
- **No data lost to opt-outs** — GA4 loses 30-50% of data from European/California opt-outs
- **<1KB script** — zero performance impact (vs ~45KB for GA4, ~100KB for PostHog)
- **EU-hosted** (Germany), open source, privacy-first by design
- **Already recommended** in the existing [Cookie & Analytics Compliance Strategy](../20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md) — implementation checklist exists but is unchecked
- AWS does not offer a comparable website visitor analytics product (Pinpoint is for mobile/email engagement)

#### What Plausible Gives You (That CloudWatch Cannot)

| Metric | PLG Value |
|---|---|
| **Visitor count** | Traffic problem vs conversion problem diagnosis |
| **Pricing page views** | If 1000 people view pricing but only 5 click "Buy," pricing page has a problem |
| **Referral sources** | If 80% of conversions come from one blog post, double down on that channel |
| **Landing → Pricing conversion** | Is homepage copy compelling enough? |
| **Geographic distribution** | Marginal but useful for timezone/currency decisions |
| **Device/browser breakdown** | Catch platform-specific UX issues |

#### Full Funnel Visibility (Plausible + CloudWatch + Stripe/Keygen)

```
[Plausible]   visitors arrive at site
[Plausible]   visitors view pricing page
[Plausible]   visitors click "Get Started" (custom event)
[CloudWatch]  checkout session created
[CloudWatch]  payment completed
[CloudWatch]  license provisioned
[CloudWatch]  extension activated (heartbeat)
[Stripe]      revenue, MRR, churn
[Keygen]      active licenses, machines, activations
```

#### Implementation (30 min)

1. **Add Plausible script to `layout.js`** — single `<script>` tag:
   ```html
   <script defer data-domain="hic-ai.com" src="https://plausible.io/js/script.js"></script>
   ```
2. **Create `src/lib/analytics.js` helper** (per existing compliance strategy doc):
   ```javascript
   export function trackEvent(name, props = {}) {
     if (typeof window !== 'undefined' && window.plausible) {
       window.plausible(name, { props });
     }
   }
   ```
3. **Wire 6 custom events** via `trackEvent()` calls on key pages:
   - `Pricing: Viewed` — pricing page load
   - `CTA: Get Started` — primary CTA click on homepage
   - `CTA: Install Extension` — VS Code Marketplace link click
   - `Checkout: Started` — "Buy" button click (before Stripe redirect)
   - `Docs: Visited` — documentation page load
   - `Trial: Started` — trial flow initiation
4. **Configure goals in Plausible dashboard** — match the 6 custom events above to create a conversion funnel view
5. **Update privacy policy** — add Plausible disclosure (sample language exists in compliance strategy doc, Appendix A)

#### What You Do NOT Need (Avoid Over-Investing)

| Tool | Why Skip It |
|---|---|
| **Google Analytics 4** | Requires cookie consent banner, loses 30-50% of data to opt-outs, 90% of features are noise at pre-scale |
| **PostHog / Mixpanel / Amplitude** | Requires consent, heavyweight, overkill before 10K users |
| **Hotjar / FullStory (session replay)** | Useful at scale when optimizing, not when you have <1000 users |
| **Custom A/B testing** | Premature optimization — get baseline conversion data first |

---

## Tier 3: Post-Launch (Correctly Deferred)

These are already tracked in the roadmap and should not be pulled forward.

| Item                                      | Roadmap TODO             | Effort | Trigger                                            |
| ----------------------------------------- | ------------------------ | ------ | -------------------------------------------------- |
| Status page (`status.hic-ai.com`)         | TODO 12                  | 4h     | Customer-facing transparency                       |
| Slack integration for alerts              | Security Audit Plan §3.3 | 2h     | Faster incident response as team grows             |
| Weekly security digest                    | Security Audit Plan §3.3 | 3h     | Ongoing hygiene                                    |
| Production deployment of monitoring stack | Phase 8                  | 2h     | `./deploy.sh prod` when ready                      |

---

## What You Do NOT Need Pre-Launch

| Technology                                     | Why Not                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **APM (X-Ray, Datadog, etc.)**                 | Structured logs with correlation IDs already provide distributed tracing. APM adds cost and complexity. Revisit if performance issues surface post-launch. |
| **Custom metrics via `PutMetricData` API**     | Metric filters on structured logs are cheaper and simpler. Custom metrics only matter for sub-second resolution, which isn't relevant at launch scale.     |
| **Real-time log streaming (Kinesis/Firehose)** | CloudWatch Logs Insights handles batch analysis well. Real-time streaming matters at 10K+ req/sec. Not there yet.                                          |
| **Client-side error tracking (Sentry, etc.)**  | Server-side errors are in CloudWatch. Client-side tracking can wait until there's evidence of client-side issues.                                          |

---

## Summary: Pre-Launch Work Plan

| #   | Item                                              | Effort | Category | Impact                                                            |
| --- | ------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------- |
| 1   | Metric filters + alarms for Amplify SSR log group | 3h     | Tier 1   | **Critical** — without this, structured logs don't trigger alerts |
| 2   | `/api/health` endpoint                            | 30min  | Tier 1   | **Critical** — enables external uptime monitoring                 |
| 3   | Severity definitions + minimal runbook (TODO 19)  | 2h     | Tier 1   | **Blocker** — already on roadmap as Tier 2 pre-launch             |
| 4   | Amplify log group retention + IaC                 | 30min  | Tier 1   | **Cost protection** — prevents unbounded log storage growth       |
| 5   | CloudWatch Logs Insights saved queries            | 1h     | Tier 2   | **Launch day command center**                                     |
| 6   | CloudWatch dashboard for launch day               | 2h     | Tier 2   | **Single-pane visibility**                                        |
| 7   | External uptime monitoring (UptimeRobot)          | 30min  | Tier 2   | **Catches infra failures CloudWatch can't see**                   |
| 8   | Automate logging probe                            | 1h     | Tier 2   | **Pipeline health canary**                                        |
| 9   | Plausible Analytics ($9/mo)                       | 30min  | Tier 2   | **Top-of-funnel visibility** — the one gap CloudWatch can't fill  |

**Tier 1 total: ~6 hours.** Tier 2 total: ~5.5 hours. **Grand total: ~11.5 hours.**

The single most impactful item is #1: getting metric filters and alarms wired to the Amplify SSR log group. Without that, you've built a comprehensive structured logging system that nobody is listening to. The highest ROI-per-minute item is #9: 30 minutes of work + $9/mo gives you visibility into the 99% of visitors who never reach an API endpoint.
