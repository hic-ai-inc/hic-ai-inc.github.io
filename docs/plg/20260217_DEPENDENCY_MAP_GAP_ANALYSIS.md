# Dependency Map Gap Analysis

**Date:** February 17, 2026
**Author:** General Counsel
**Purpose:** Identifies items present in the Pre-Launch Status Assessment (`20260216_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS.md`) and PLG Roadmap v7 (`PLG_ROADMAP_v7.md`) that are missing from or insufficiently covered in the Action Plan Dependency Map (`20260216_ACTION_PLAN_DEPENDENCY_MAP.md`). Organized to support SWR's decisions on how to interleave these items into Tracks A and B.

---

## Table of Contents

1. [Tier 1: Pre-Launch Items That Need Track Placement](#tier-1-pre-launch-items-that-need-track-placement)
2. [Tier 2: Post-Launch Backlog](#tier-2-post-launch-backlog)
3. [Summary Matrix](#summary-matrix)
4. [Addendum: GAP-12 — Staging-to-Production Cutover Sequence](#addendum-gap-12--staging-to-production-cutover-sequence-critical)

---

## Tier 1: Pre-Launch Items That Need Track Placement

These items are identified as pre-launch work in at least one source document but have no corresponding step, checkpoint, or explicit mention in the Dependency Map's track sequence.

---

### GAP-1: Keygen Policy Verification

**Source:** Assessment "Items Requiring Further Investigation" (TODO 26); Roadmap TODO 26 (Tier 1)

**What's missing:** The Assessment flags that Phase 0 was marked done Feb 11, but questions whether `maxMachines=3`, `ALWAYS_ALLOW_OVERAGE`, and `heartbeatDuration=3600s` were _actually applied_ in the Keygen dashboard. The Dependency Map assumes Phase 5 is complete and includes no verification step.

**Risk if omitted:** Silent launch-day failure. If the Individual policy still has `maxMachines=2` and `NO_OVERAGE`, the 3rd device activation will fail with a confusing Keygen error instead of being handled by the DynamoDB enforcement layer.

**Effort:** ~15 minutes (Keygen dashboard check or API query)

**Dependencies:** None

**Suggested placement:** Track B, Level 0 — before or parallel with B-D1–B-D8 decision session. Zero dependencies, takes minutes, high consequence if wrong.

---

### GAP-2: Security Hygiene / 2FA Hardening

**Source:** Roadmap Phase 7.2 (7 items); Roadmap TODO 6 (Tier 2)

**What's missing:** The Roadmap lists 7 specific account-level security tasks:

| #   | Task                                       | Status  |
| --- | ------------------------------------------ | ------- |
| 1   | Enable 2FA on GitHub org (hic-ai-inc)      | Open    |
| 2   | Enable 2FA on Stripe dashboard             | Open    |
| 3   | Enable 2FA on AWS root + IAM admin         | ✅ Done |
| 4   | Enable 2FA on Keygen dashboard             | Open    |
| 5   | Verify MFA on Cognito admin accounts       | ✅ Done |
| 6   | Set up AWS Budget alerts ($50, $100, $250) | Open    |
| 7   | Review Lambda concurrency limits           | Open    |

These are _not_ covered by AP 2a (website surface security) or AP 2b (comprehensive code audit). They are account-level operational security — a different attack surface entirely.

**Risk if omitted:** A compromised GitHub org account or unprotected Stripe dashboard is a catastrophic security event. The Roadmap marks these "boring but catastrophic if skipped."

**Effort:** ~1 hour total across all items

**Dependencies:** None

**Suggested placement:** Track B, parallel with B2 (comprehensive security audit) — same security mindset, different scope. Could be a B2 sub-step with an explicit checklist, or a standalone Level 0 item since it has no dependencies.

---

### GAP-3: VS Code Marketplace + Open VSX Publishing

**Source:** Roadmap Phase 8.1 / Phase 6 (6.5); Assessment "Items Requiring Further Investigation" (2 items)

**What's missing:** The Dependency Map mentions Marketplace publishing in "External Blockers & Wait Times" and the Day 12–14 timeline but provides no Action Plan step for:

1. **Publisher account verification** — Run `vsce login hic-ai` to confirm the PAT is configured and the publisher ID works. The Assessment flags this as an open investigation item.
2. **Open VSX research** — Account setup requirements and review/approval timeline are entirely unknown.
3. **24–48h Marketplace review sequencing** — This is a hard external wait comparable to the LS wait, but it has no checkpoint, no step designation, and no explicit dependency in the track graph.

**Risk if omitted:** Discovering on Day 12 that the publisher account doesn't work, or that Open VSX requires a separate multi-day approval, pushes the launch date by 2–4 days with zero ability to compress.

**Effort:** Verification: 15 minutes. Open VSX research: 30 minutes. The 24–48h Marketplace review is a passive wait.

**Dependencies:** Publisher verification has no dependencies (can be done Day 1). Actual submission depends on AP 4 (production deployment) and the final VSIX build.

**Suggested placement:**

- **Publisher verification:** Track B, Level 0 — 5-minute check with zero dependencies. De-risks the entire launch timeline.
- **Open VSX research:** Track B, Level 0 or during LS wait.
- **Marketplace submission:** New step between AP 4 (production deployment) and LAUNCH, with the 24–48h review explicitly modeled as an external wait (like LS).

---

### GAP-4: IP Review

**Source:** Assessment AP 11.5–11.7; Roadmap TODO 9 (🟠 PRE-LAUNCH)

**What's missing:** The Dependency Map covers AP 11.1–11.4 (Privacy Policy, ToS, refund xref, Plausible) but stops there. The Assessment's AP 11 includes three additional items:

| #    | Item                                                                  | Effort |
| ---- | --------------------------------------------------------------------- | ------ |
| 11.5 | IP review of all public-facing documentation content                  | 1–2h   |
| 11.6 | IP review of FAQ content for proprietary detail exposure              | 30m    |
| 11.7 | Remove or generalize sensitive technical details from any public docs | 1h     |

The Roadmap marks TODO 9 (IP Review) as 🟠 PRE-LAUNCH with the note that "SWR is an attorney and will handle this himself. Must complete before launch."

**Risk if omitted:** Proprietary implementation details (architecture, algorithms, infrastructure specifics) exposed in public documentation could undermine IP protection or give competitors unnecessary insight.

**Effort:** 2.5–3.5 hours (SWR personal review)

**Dependencies:** Best done after AP 5 (docs accuracy) since it reviews finalized documentation content. Does not depend on Plausible — unlike 11.1, the IP review doesn't need analytics to be wired up first.

**Suggested placement:** Extend Step A2 to cover AP 11.1–11.7 (full legal review including IP), or add as a separate step parallel with A4 (documentation accuracy) since the IP review and docs work are natural companions. The IP items (11.5–11.7) don't depend on Plausible, so they could start earlier than the Privacy Policy review if SWR prefers.

---

### GAP-5: Stripe E2E Validation (AP 8.6)

**Source:** Assessment AP 8 Phase B (item 8.6); LS Migration doc Phase 1 prerequisite

**What's missing:** The Assessment explicitly _promotes_ item 8.6 from Phase B to early Track A:

> "AP 8.6 (verify all 4 Stripe test-mode checkout paths, 30 min) is promoted from Phase B to early Track A because the LS Phase 1 feasibility assessment must map _verified_ Stripe behavior against LS equivalents."

The Dependency Map mentions this promotion in the AP 8 dependency detail footnote ("AP 8.6 sequencing" note) but does not give it a step number, place it in the track ASCII diagram, or include it in the Full Dependency Graph levels.

**Risk if omitted:** The LS feasibility assessment (GAP-6) would be based on assumed rather than verified Stripe integration state. If any of the 4 checkout paths are broken, the assessment would be wrong.

**Effort:** 30 minutes

**Dependencies:** None — Stripe test mode is already configured

**Suggested placement:** Track A, Level 0 (parallel with AP 11.4 Plausible). Takes 30 minutes, has no dependencies, and unlocks GAP-6.

---

### GAP-6: LS Migration Feasibility Assessment

**Source:** `20260216_PROPOSED_PLANS_FOR_LEMON_SQUEEZY_MIGRATION.md` Phase 1; Assessment AP 8 notes

**What's missing:** The LS Migration planning doc describes a structured Phase 1 feasibility assessment (~45–60 min) that:

- Maps verified Stripe integration against LS equivalents
- Surfaces the DynamoDB field naming decision (rename `stripeCustomerId` etc. or abstract?)
- Identifies any architectural blockers to migration
- Produces a go/no-go recommendation

The Dependency Map references this document as a companion but doesn't step the feasibility assessment into the track sequence.

**Risk if omitted:** Submitting the LS application (A7) without having confirmed that migration is technically feasible. If LS approves but migration turns out to be architecturally harder than expected, the timeline blows up during what's supposed to be the sprint.

**Effort:** 45–60 minutes

**Dependencies:** GAP-5 (Stripe E2E validation — must verify current state before mapping against LS)

**Suggested placement:** Track A, between GAP-5 (Stripe validation) and A7 (LS application submission). Natural sequence: validate Stripe → assess LS feasibility → submit application with confidence.

---

### GAP-7: Email Deliverability Full Pass (AP 7.2–7.6)

**Source:** Assessment AP 7 (LAUNCH BLOCKER); Roadmap TODO 3 / TODO 6

**What's missing:** The Dependency Map explicitly steps AP 7.1 (DMARC record) as Step A5 but treats items 7.2–7.6 as "AP 7 remainder" — mentioned only in the parallel work table, the Full Dependency Graph at Level 2, and a brief note in the Minimum Viable Path timeline. Given the Assessment marks AP 7 as a **LAUNCH BLOCKER**, the remaining items deserve explicit enumeration:

| #   | Item                                                                                                                          | Effort     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 7.2 | Test email delivery to Gmail (verify not spam-filtered)                                                                       | 30m        |
| 7.3 | Test email delivery to Outlook/Hotmail (verify not spam-filtered)                                                             | 30m        |
| 7.4 | Verify all transactional emails fire: welcome, license delivery, payment confirmation, payment failed, subscription cancelled | 1h         |
| 7.5 | Set up bounce/complaint monitoring in SES console                                                                             | 30m        |
| 7.6 | Verify duplicate email prevention fix (deployed Feb 14) is holding                                                            | 15m verify |

**Risk if omitted:** Launch-day transactional emails land in spam or don't fire at all. Users complete checkout but never receive their license key.

**Effort:** 2.5–3 hours

**Dependencies:** AP 7.1 (DMARC record live and propagated). Better after AP 11.1 (Privacy Policy review) since the welcome email may reference the privacy policy.

**Suggested placement:** Track A, explicit step after A5 (DMARC live + propagation time). Could run during the LS wait window since its only hard dependency is DMARC propagation, which happens passively.

---

### GAP-8: Branch Protection Rules

**Source:** Assessment AP 11.10; Roadmap TODO 14 Phase 3 / Tier 2

**What's missing:** The Assessment's AP 11 includes item 11.10: "Set up branch protection rules on both repos (`development` → PR required)." The Roadmap lists this as a Tier 2 item. The Dependency Map doesn't mention it.

**Risk if omitted:** An accidental direct push to `development` or `main` bypasses CI/CD checks and code review, potentially introducing regressions at the worst possible time (pre-launch sprint).

**Effort:** 30 minutes

**Dependencies:** None

**Suggested placement:** Track B, Level 0 — can be done alongside B-D1–B-D8 decisions. No dependencies, 30 minutes, meaningful protection during the pre-launch sprint.

---

### GAP-9: VSIX Distribution Cleanup (Roadmap Phase 6.2)

**Source:** Roadmap Phase 6.2 (5 tasks)

**What's missing:** The Roadmap Phase 6.2 lists 5 specific distribution cleanup tasks:

| #   | Task                                          | Status |
| --- | --------------------------------------------- | ------ |
| 1   | Set `BUILD_NPM=false` in `scripts/build.sh`   | Open   |
| 2   | Delete `packaging/dist/` artifacts            | Open   |
| 3   | Update Release Runbook for VSIX-only workflow | Open   |
| 4   | Update licensing README                       | Open   |
| 5   | Verify VSIX build scripts work end-to-end     | Open   |

The Dependency Map's B1 (version update wire-up) covers Phase 6 _feature_ work (AP 9.8–9.10) but not Phase 6.2 _distribution cleanup_. These are related but distinct: one is about wiring up version notifications, the other is about removing dead npm distribution code.

**Risk if omitted:** Stale npm distribution artifacts and references ship in the final build. Security audit (B2) scans dead code. Release runbook references deprecated npm publish steps.

**Effort:** 1–2 hours

**Dependencies:** Logically belongs after B1 (version wire-up complete) and before B2 (security audit should scan the cleaned-up codebase, not stale artifacts)

**Suggested placement:** Track B, sub-step of B1 or a brief step between B1 and B2.

---

### GAP-10: Phase 4 Hardening (Multi-Seat)

**Source:** Assessment "Items Requiring Further Investigation"; Roadmap Phase 5.1 (Phase 4)

**What's missing:** The Dependency Map's B1 step covers AP 9.8–9.10 (heartbeat version wire-up + Update command), but doesn't mention Phase 4 hardening. The heartbeat status alignment work — where the extension's allow-list doesn't match backend status codes — is inextricably intertwined with the AP 9.8–9.10 wire-up and should be addressed as part of B1.

The remaining Phase 4 items are separable:

- **Cognito callback cleanup** — Remove vestigial `vscode://hic-ai.mouse/callback` from Cognito App Client (Phase 1 artifact, harmless but should be cleaned up).
- **Enforcement edge case tests** — Additional test coverage for non-happy-path device management scenarios.

These remaining items will be scoped for fix-or-defer when B1 is reached.

**Risk if omitted:** The heartbeat status alignment is the highest-risk item — edge cases (`over_limit` vs `concurrent_limit`, `machine_not_found`) may fail silently if the extension allow-list isn't aligned with the backend status codes during the AP 9.8–9.10 wire-up.

**Effort:** Heartbeat status alignment: naturally absorbed into B1. Remaining Phase 4 items: ~4 hours (decided at B1 time).

**Dependencies:** B0 (decisions B-D1–B-D3 resolved — same as B1)

**Suggested placement:** Heartbeat status alignment folds into B1 (AP 9.8–9.10). Remaining Phase 4 items: fix-or-defer decision made at B1 completion.

---

### GAP-11: Copyright Application + Provisional Patent Filing

**Source:** Assessment AP 11.8–11.9; Roadmap TODO 10 (Tier 1)

**What's missing:** The Dependency Map covers AP 11.1–11.4 but not these two remaining legal filings:

| #    | Item                                                           | Effort |
| ---- | -------------------------------------------------------------- | ------ |
| 11.8 | File copyright application (Register Mouse software copyright) | 1h     |
| 11.9 | File provisional patent application                            | TBD    |

Both are confirmed pre-launch. Public launch constitutes a disclosure event that starts the 1-year provisional patent filing clock under US patent law, so the provisional application must be filed before launch.

**Risk if omitted:** Loss of patent rights if provisional application is not filed before public disclosure. Copyright registration, while not strictly required for protection, strengthens enforcement position and should be in place before the product is publicly available.

**Effort:** Copyright: 1 hour. Provisional patent: TBD (SWR will handle directly).

**Dependencies:** None — these are SWR personal legal tasks with no technical dependencies.

**Suggested placement:** Track A, during the LS wait window (parallel with AP 13 disclosures). No technical dependencies; just needs SWR's time. Patent filing should complete before LAUNCH.

---

## Tier 2: Post-Launch Backlog

The following items are intentionally absent from the Dependency Map's critical path. They are listed here to ensure nothing falls through the cracks and to provide a clean handoff to a post-launch roadmap update.

> **Note on AP 10 scope:** The Dependency Map's B3 step references AP 10.1–10.6. Items 10.7–10.9 (PITR verification, backup restore/DR playbooks, CloudWatch launch day dashboard) are also pre-launch must-haves and should be folded into B3's scope. Only AP 10.10 (external uptime monitoring) is deferred to post-launch, where it is covered by PL-8 below.

| #    | Item                                         | Source                            | Notes                                                                                                                                                                                            |
| ---- | -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PL-1 | AP 5 non-essential items (5.3–5.5, 5.7–5.9)  | Assessment AP 5                   | Troubleshooting guide, editor-specific docs, FAQ content, "Getting Help" page, API reference, installation docs currency check                                                                   |
| PL-2 | Cross-browser portal testing (AP 9.6–9.7)    | Assessment AP 9 / Roadmap TODO 21 | The Dep Map's A3.5 (AP 9.1–9.7) is scoped to _extension client_ E2E verification, but 9.6–9.7 are _portal browser_ testing (Chrome, Firefox, Safari, Edge + mobile). These are different scopes. |
| PL-3 | Onboarding flow polish (TODO 22)             | Roadmap                           | Post-purchase UX: "what to do next" guidance, tooltips, inline help                                                                                                                              |
| PL-4 | Load/stress testing (TODO 18)                | Roadmap                           | Define scenarios, set up k6/Artillery, test Lambda cold starts, document baselines                                                                                                               |
| PL-5 | CI/CD completion (TODO 8)                    | Roadmap                           | Version bump automation, changelog generation, release notes automation, staging → production promotion workflow. `release-mouse.sh` works for now.                                              |
| PL-6 | CloudWatch dashboards (TODO 13)              | Roadmap                           | CloudWatch dashboards for Lambda metrics, error rates, API latency, DynamoDB capacity                                                                                                            |
| PL-7 | AWS Cost Planning (Roadmap 7.4)              | Roadmap                           | $1K AWS Activate credits; calculate monthly costs, set Cost Explorer alerts, track burn rate, plan Kiro Pro budget                                                                               |
| PL-8 | Status page + external uptime (TODO 12)      | Roadmap                           | `status.hic-ai.com`, external uptime monitoring (UptimeRobot / Better Stack) — manual monitoring sufficient at launch                                                                            |
| PL-9 | Dependency update policy (TODO 14 Phase 2–3) | Roadmap                           | Dependabot configuration, SAST in CI/CD pipeline, dependency vulnerability scanning                                                                                                              |
| PL-10 | Stripe Customer Portal branding             | Roadmap 6.3                       | Optional polish — HIC brand colors in Stripe portal                                                                                                                                              |

---

## Summary Matrix

### Pre-Launch Gaps (Tier 1) — Need Track Placement

| GAP    | Item                                        | Track                          | Effort               | Dependencies                  | Risk Level                   |
| ------ | ------------------------------------------- | ------------------------------ | -------------------- | ----------------------------- | ---------------------------- |
| GAP-1  | Keygen policy verification                  | B                              | 15 min               | None                          | High (silent failure)        |
| GAP-2  | Security hygiene / 2FA                      | B                              | 1h                   | None                          | High (account compromise)    |
| GAP-3  | VS Code Marketplace + Open VSX              | B (verify) → Post-AP4 (submit) | 45 min + 24–48h wait | None (verify); AP 4 (submit)  | High (hard external wait)    |
| GAP-4  | IP review (AP 11.5–11.7)                    | A                              | 2.5–3.5h             | After AP 5 (docs finalized)   | Medium (IP exposure)         |
| GAP-5  | Stripe E2E validation (AP 8.6)              | A                              | 30 min               | None                          | Medium (informs GAP-6)       |
| GAP-6  | LS migration feasibility assessment         | A                              | 45–60 min            | GAP-5                         | Medium (migration viability) |
| GAP-7  | Email deliverability full pass (AP 7.2–7.6) | A                              | 2.5–3h               | AP 7.1 (DMARC)                | High (launch blocker)        |
| GAP-8  | Branch protection rules                     | B                              | 30 min               | None                          | Low–Medium (process safety)  |
| GAP-9  | VSIX distribution cleanup                   | B                              | 1–2h                 | After B1 (version wire-up)    | Low (dead code in audit)     |
| GAP-10 | Phase 4 heartbeat status alignment          | B (part of B1)                 | Absorbed into B1     | B0 (same as B1)               | High (silent edge-case fail) |
| GAP-11 | Copyright + provisional patent filing       | A (LS wait window)             | 1h + TBD             | None                          | High (patent clock)          |
| GAP-12 | Staging-to-production cutover sequence      | A → Gate → Post-gate           | 6–10 days (phased)   | All tracks (phased)           | **Critical** (launch event)  |

### Post-Launch Backlog (Tier 2) — Acknowledged, Deferred

10 items (PL-1 through PL-10) documented above for inclusion in a post-launch roadmap update. AP 10.7–10.9 are pre-launch (folded into B3 scope).


---

## Addendum: GAP-12 — Staging-to-Production Cutover Sequence (Critical)

*Added 2026-02-17 per SWR direction.*

### The Gap

The existing Dependency Map treats AP 4 (Launch Plan & Production Deployment) as a single convergence gate — a monolithic "Day 11" event that happens after both tracks complete. In reality, the staging-to-production transition is a **phased sequence** that touches every layer of the stack, requires retesting at each phase boundary, and can (and should) begin significantly earlier than the current timeline implies.

The current AP 4 (Assessment items 4.1–4.12) captures the _mechanical_ steps — create Amplify environment, populate secrets, deploy CloudFormation, re-point webhooks — but does not address:

1. **Phasing strategy** — which parts of production can go live safely before others, and in what order
2. **Retesting scope** — what must be re-validated after each phase of infrastructure switchover
3. **Service-by-service cutover dependencies** — which services can switch independently vs. which must switch atomically
4. **Rollback boundaries** — at which points a partial cutover can be safely reversed

This is arguably the most significant gap in the entire planning corpus. Every other Action Plan assumes a production environment exists; none specifies how to bring it into existence without breaking the staging environment that's currently supporting all development and testing.

### Why This Is Critical

The staging-to-production cutover is not a single "flip the switch" moment. It is a sequence of at least four distinct phases, each with its own prerequisites, verification steps, and rollback procedures:

**Phase C1: Website Goes Live at `hic-ai.com`**

The PLG website can be brought online at the production domain _before_ the extension is published to marketplaces. This is low-risk because:

- The site already has marketplace install links disabled (implemented as a gating mechanism)
- No traffic is being directed to the site yet
- The Amplify production environment needs to exist anyway for all subsequent phases

This phase requires:
- Create Amplify production environment (AP 4.3) — connect `main` branch or dedicated prod branch
- Deploy to production branch, verify build succeeds
- Point `hic-ai.com` DNS to the new Amplify environment (AP 4.10, 4.12)
- SSL certificate verification for `hic-ai.com`
- Verify site renders correctly at production URL
- Confirm marketplace install links remain disabled

**Phase C2: Backend Infrastructure Cutover**

This is the complex, high-risk phase. Each backend service must switch from staging to production configuration. The following services are affected:

| Service | Staging State | Production Action | Risk |
|---------|--------------|-------------------|------|
| **Amplify** | `staging.hic-ai.com`, app ID `d2yhz9h4xdd5rb`, compute role `plg-amplify-compute-role-staging` | Create production environment, new compute role, 15+ env vars via `update-amplify-env.sh` | Medium — well-understood process |
| **Cognito** | User pool `mouse-staging-v2` (`us-east-1_CntYimcMm`), domain `mouse-staging-v2.auth.us-east-1.amazoncognito.com` | New production user pool via CloudFormation, production callback URLs, pre-token Lambda `plg-cognito-pretoken-prod` | High — auth is foundational |
| **DynamoDB** | Table `hic-plg-staging` | New production table(s) via CloudFormation (`hic-plg-prod` or equivalent), PITR enabled (AP 10.7) | Medium — schema identical, no data migration |
| **SES** | Production-approved (50K/day), domain + DKIM verified | **Open question:** Does new Amplify production environment inherit SES production access, or does it require re-verification? SES approval is per-identity, and a new sending identity may restart the sandbox process. | **High — potential launch blocker if re-approval required** |
| **Secrets Manager** | `plg/secrets/*` (staging values) | Create `plg/production/*` secrets (AP 4.4) — Stripe live keys, Keygen production tokens, app secrets | Medium — manual but straightforward |
| **CloudFormation** | Staging stacks deployed | Deploy all stacks to production via `./deploy.sh prod` (AP 4.6) — Cognito, SES, DynamoDB, IAM roles | High — ordering matters |
| **SSM Parameters** | `/plg/secrets/*` (staging) | Production parameter paths, Amplify compute role must have access | Low — follows CF deployment |
| **Keygen** | Live (not sandboxed), webhooks pointing to staging URL | Re-point webhooks to production URL (AP 4.8). **Note:** Keygen is already in production mode — this is an endpoint change, not a mode switch. | Medium — instant config change, verify propagation |
| **Stripe** | Test mode (`sk_test_*`), webhook to staging URL | Switch to live mode, create live-mode products + price IDs, re-point webhooks (AP 4.7). **Note:** This may change entirely if LS migration (GAP-6) proceeds. If staying with Stripe, live-mode activation may require Stripe account verification + review period. | **High — uninvestigated timeline for go-live review** |

**Critical ordering constraints within C2:**
1. CloudFormation stacks must deploy first (creates Cognito pool, DynamoDB tables)
2. Secrets Manager population depends on CF stack outputs (Cognito IDs, table names)
3. Amplify env vars depend on Secrets Manager + CF outputs
4. Webhook re-pointing (Keygen, Stripe) depends on production API endpoints being live
5. SES identity verification (if required) is an external wait — must be investigated early

**Phase C3: End-to-End Retesting on Production**

After C2, a subset of the E2E testing performed on staging must be repeated against production infrastructure. This is _not_ a full regression — it targets the seams where staging and production configurations differ:

- **Auth flow:** Cognito sign-up → verify email → sign in → token refresh (new user pool, new callback URLs)
- **Payment flow:** Create checkout session → complete purchase → webhook fires → license created (Stripe live mode or LS, Keygen production)
- **License activation:** Install extension → authenticate via production Cognito → activate license via production Keygen → heartbeat confirms
- **Email delivery:** Transactional emails (welcome, receipt, password reset) actually send and arrive via production SES identity
- **Webhook reliability:** Keygen → production API, Stripe/LS → production API — verify payloads match expected format
- **Portal flows:** Customer portal login, subscription management, device management — all via production endpoints

This retesting scope maps roughly to a condensed version of AP 9 (E2E verification), but targeted at production endpoints only. Happy-path only is likely sufficient — edge cases were validated on staging.

**Phase C4: Marketing & Traffic Activation**

The final phase enables public discovery:

- Enable marketplace install links on the website (remove the current gating)
- Submit to VS Code Marketplace (GAP-3 — 24–48h review wait) and Open VSX
- Activate Plausible analytics (AP 11.4 / Step A1 in Dep Map)
- Begin any planned marketing activities (social, content, outreach)
- Confirm `hic-ai.com` appears correctly in search results

This phase has a hard external dependency on marketplace review times, which is why GAP-3 recommends submitting early and why C1 (website live) can and should happen well before C4.

### Relationship to Existing AP 4

The existing AP 4 items (4.1–4.12) are the _mechanical building blocks_ of this cutover sequence. The gap is not that the individual steps are missing — it's that they lack:

- **Phasing** — AP 4 treats everything as one block; in reality, C1 can happen days before C2/C3
- **Retesting requirements** — AP 4 doesn't mention C3 at all
- **Service-specific investigation** — AP 4 notes the steps but doesn't investigate SES re-verification, Stripe go-live review timelines, or Cognito pool creation dependencies
- **Traffic activation** — AP 4 ends at "DNS cut-over" without addressing the marketplace/marketing/analytics activation that constitutes the _real_ launch moment

**Recommendation:** Expand AP 4 dramatically to incorporate the C1–C4 phasing above. The existing AP 4 items map approximately as:

| AP 4 Item | Cutover Phase |
|-----------|---------------|
| 4.1 (Launch Plan document) | Overarching — becomes the C1–C4 plan |
| 4.2 (Deployment checklist) | C2 — the backend infrastructure checklist |
| 4.3 (Amplify production env) | C1 |
| 4.4 (Secrets Manager) | C2 |
| 4.5 (Amplify env vars) | C2 |
| 4.6 (CloudFormation deployment) | C2 |
| 4.7 (Stripe webhooks) | C2 |
| 4.8 (Keygen webhooks) | C2 |
| 4.9 (Cognito callbacks) | C2 |
| 4.10 (Custom domain SSL) | C1 |
| 4.11 (Rollback procedures) | C1, C2 (phase-specific rollback) |
| 4.12 (DNS cut-over) | C1 |
| *New: Retesting* | C3 |
| *New: Marketplace submission* | C4 (cross-ref GAP-3) |
| *New: Analytics activation* | C4 |
| *New: Marketing enablement* | C4 |
| *New: SES identity investigation* | C2 prerequisite (urgent) |
| *New: Stripe live-mode timeline* | C2 prerequisite (or LS-dependent) |

### Open Questions Requiring Investigation

These questions are flagged in the Dependency Map's "Requires Investigation" table but gain urgency in the context of the cutover sequence:

1. **SES production identity:** Does a new Amplify production environment automatically inherit the SES production sending approval (50K/day)? Or does the production environment get a new SES identity that starts in sandbox mode? This is potentially a **launch blocker with multi-day wait** if re-approval is required. Must be investigated immediately.

   > **RESOLVED (2026-02-17):** SES production mode approval is **account-wide, not stack-specific** (confirmed via AWS Console Q). The production stack will automatically have production sending access in the same region. No reapplication required. New sending identities (domains) still need DNS verification (SPF, DKIM, DMARC), but `hic-ai.com` domain records are already in place. **This is not a blocker.**

2. **Stripe live-mode activation timeline:** If staying with Stripe (not migrating to LS), what is the review/approval timeline for switching from test mode to live mode? Is there an account verification step? A waiting period? This directly impacts C2 scheduling.

   > **RESOLVED (2026-02-17):** Stripe's test-to-live switch is **instantaneous** once the business profile is complete — and SWR has already completed Stripe business profile activation. Swap API keys, recreate products/prices and webhooks in live mode, done. First payout has a mandatory 7–14 day hold, but payments can be accepted immediately. For LS: store activation requires a 2–3 business day review (the Track A/LS approval that the Dependency Map already pivots around), but the LS docs do not document any *secondary* review to promote from test to live payments once the store is approved. Uncertainty remains on whether LS has an additional go-live step post-approval; if so, it is not documented. **Stripe is not a blocker; LS approval timeline is already on the critical path.**

3. **Cognito user pool creation:** When CloudFormation creates a new production Cognito user pool, how long does full provisioning take? Are there any manual steps (domain verification, email template configuration) that aren't captured in the CF template?

4. **Keygen webhook propagation:** When webhook URLs are changed in Keygen's dashboard, is the change instant? Or is there a propagation delay that could cause missed events during the switchover window?

5. **Parallel staging preservation:** During and after the cutover, does the staging environment remain fully functional? Or do some changes (DNS, webhook re-pointing) break staging? If staging breaks, development workflow must be adapted.

   > **RESOLVED (2026-02-17, per SWR):** Staging remains permanently intact. Production will be **added** to Amplify entirely additively — `staging.hic-ai.com` continues to serve as the private, secure staging environment (reverted to allowlist-only after production goes live). The cutover is strictly additive: no existing staging infrastructure is modified or torn down. This is a firm architectural constraint for the C1–C4 sequence.

### Impact on Dependency Map Timeline

The current Dependency Map places AP 4 as a single "Day 11" convergence gate. The phased approach suggests:

- **C1 can begin as early as Track A completion** — there's no reason to wait for Track B to bring the website live at `hic-ai.com`
- **C2 requires both tracks complete** — this is the true convergence gate
- **C3 adds 1–2 days after C2** — retesting is not optional
- **C4 has an external wait** — marketplace review (24–48h) should be submitted during C3 retesting to run in parallel

The net effect: the Dependency Map's Day 11 becomes approximately Days 9–14 (C1 starting earlier, C3/C4 extending later), but with better risk management because the phases are independently verifiable and rollback-capable.

### Summary

| ID | Phase | Scope | Timing |
|----|-------|-------|--------|
| C1 | Website live at `hic-ai.com` | Amplify prod env, DNS, SSL | Can precede Track B completion |
| C2 | Backend infrastructure cutover | Cognito, DynamoDB, SES, Stripe/LS, Keygen, CF, Secrets | Convergence gate — both tracks done |
| C3 | Production E2E retesting | Auth, payments, licensing, email, webhooks, portal | 1–2 days after C2 |
| C4 | Traffic activation | Marketplace publish, analytics, marketing, install links enabled | After C3 + marketplace review wait |

**Risk level:** CRITICAL — this is the single most complex event in the entire launch sequence, touching every infrastructure layer simultaneously.

**Next steps:** Expand AP 4 in the Dependency Map and Assessment to incorporate C1–C4 phasing. Investigate SES and Stripe go-live timelines immediately (these are potential schedule risks). Update the Dependency Map timeline to reflect phased cutover rather than monolithic Day 11 deployment.
