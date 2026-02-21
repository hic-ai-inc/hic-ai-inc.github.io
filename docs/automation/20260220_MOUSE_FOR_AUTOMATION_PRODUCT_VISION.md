# Mouse for Automation — Product Vision Memo

**Date:** February 20, 2026
**Author:** Kiro (memorializing SWR's product vision and collaborative discussion)
**Status:** Early-stage ideation — not yet scoped for implementation
**Purpose:** Capture the key insights, architecture concepts, business model ideas, and strategic rationale discussed during the Feb 20 session for use in future planning documents (technical specs, business plans, marketing plans, execution checklists).

---

## 1. Core Product Concept

Mouse for Automation extends Mouse from an interactive IDE tool into a containerized binary for async, unattended AI agent workflows. The binary is distributed as a Node.js Single Executable Application (SEA) that drops into any container environment — GitHub Actions runners, AWS Fargate tasks, or any Linux/macOS/Windows container — and exposes Mouse's 10 MCP tools over stdio to a terminal-based AI agent (Claude Code CLI, Aider, or any MCP-compatible client).

The value proposition: Mouse's dramatically higher Perfect First Try (PFT) rate, 3.3.6× faster completion, and 37% lower cost per edit make it the difference between "interesting automation demo" and "production infrastructure I depend on." In unattended contexts, a failed edit doesn't cost 30 seconds of developer frustration — it costs a wasted CI run, a broken PR, a re-trigger, and real compute dollars. Mouse eliminates that waste.

---

## 2. Why This Matters Strategically

### 2.1 TAM Expansion

Interactive Mouse targets developers using AI coding assistants in their IDEs. Mouse for Automation targets every CI/CD pipeline that uses AI agents — a significantly larger and faster-growing market. The progression from "tool in your IDE" to "tool in your CI" to "managed service" deepens the moat at each step.

### 2.2 The Black Box Advantage

Most developers using GitHub Actions don't look inside the actions they depend on. They care about inputs and outputs. If the action takes an issue URL and produces a well-formed PR with passing tests, they don't care how the file edits happened internally. Mouse becomes invisible infrastructure — critical infrastructure inside a black box that developers depend on without thinking about.

### 2.3 Natural Upsell Path

The heaviest interactive Mouse users are exactly the people most likely to want Mouse in their CI pipelines. They've experienced the quality difference firsthand. The sales motion: "You love Mouse in your IDE. Now imagine every automated PR your team generates has that same quality." Over-limit users (identified via the SES/SNS downstream pipeline documented in the heartbeat analysis) are the highest-value upsell candidates for Automation licenses.

---

## 3. Two-Track Distribution Model

### Track 1: Self-Hosted (Customer's Infrastructure)

Customer uses runbook YAML files in their own GitHub Actions (or GitLab CI, or equivalent). They install Mouse via the SEA binary, provide their own API key, run on their own infrastructure. Lower price point — they're paying for the Mouse Automation license only.

**Typical flow:**
1. Customer adds a `.github/workflows/mouse-automation.yml` to their repo
2. Workflow installs the Mouse SEA binary
3. Authenticates via API key (client credentials flow)
4. Clones repo, checks out feature branch
5. Runs the agent (Claude Code CLI, Aider, etc.) with Mouse tools against the task description
6. Agent does its work, commits, pushes, opens a PR
7. Customer reviews the PR at their convenience

### Track 2: HIC-Hosted (Managed Service)

Customer hits HIC AI's API with a job request. HIC handles everything — compute, agent execution, Mouse licensing, PR submission. Higher price point — they're paying for Mouse plus compute plus convenience plus SLA guarantee.

**Typical flow:**
1. Customer sends async request via API Gateway (repo URL, branch, task description, credentials)
2. Lambda validates API key, checks quota, submits job
3. AWS Batch on Fargate spins up an ephemeral container (pre-built image with Mouse, agent, git, Node.js)
4. Container clones repo, checks out feature branch, runs agent with Mouse tools
5. Agent completes work, commits, pushes, opens PR via GitHub API
6. Container exits
7. Completion webhook/SNS notification tells customer their PR is ready
8. Customer reviews at their convenience

**Why Track 2 exists:** The Vercel analogy — Vercel runs Next.js on AWS so developers don't have to. HIC runs AI agent workflows on AWS so developers don't have to configure GitHub Actions, manage secrets, debug YAML, or worry about runner availability. The heaviest-use users running many async processes simultaneously are the most lucrative submarket, and they'll pay a premium to avoid infrastructure management.

---

## 4. Licensing Model for Automation

### Distinct from Interactive Licensing

Automation licensing is fundamentally different from interactive licensing because the execution environment is ephemeral. Each workflow run spins up a fresh container with a fresh machine fingerprint. The interactive model (persistent devices, `lastSeenAt` tracking, device limits) doesn't map.

### API Key Authentication

- Accomplished programmatically via API key, analogous to Bedrock or Anthropic BYOK patterns
- Client credentials flow via a separate Cognito user pool (no interactive login, no browser redirect, no MFA — just machine-to-machine auth)
- API key maps to a license, license maps to a usage quota, metered against it

### Pricing Model Concepts

- **Self-hosted (Track 1):** Per-run or per-minute metering, or flat monthly allocation of CI minutes. Tiers: Starter (50 jobs/month), Team (500 jobs/month), Enterprise (custom).
- **HIC-hosted (Track 2):** Premium over Track 1 reflecting compute + convenience + SLA. Actual costs are Fargate compute (pennies per minute) plus AI API costs (BYOK initially — customer provides their own model API key).

### BYOK for AI Models (Initial Approach)

Customer provides their own Anthropic/OpenAI/Bedrock API key. This keeps HIC's costs predictable (only paying for compute, not inference), avoids becoming a reseller of AI tokens, and lets customers use whatever model they prefer. A "we provide the model" premium tier can be added later.

---

## 5. Runbooks — The Connective Tissue

### What They Are

Pre-built, documented workflow templates that customers can drop into their repos and start using immediately. Each runbook is a YAML file plus a setup guide that takes someone from zero to running in 15 minutes.

### Why They Matter

The biggest barrier to adoption for any automation tool isn't the tool itself — it's the setup cost. Developers look at "automate your documentation updates with AI" and think "that sounds great, I'll get to it someday." A runbook that they can drop into `.github/workflows/` turns "someday" into "this afternoon."

Runbooks serve triple duty:
1. **Marketing material** — showing what's possible
2. **Documentation** — showing how to do it
3. **Onboarding** — getting people running Mouse in automation immediately

### Starter Runbook Ideas

- **Documentation refresh from changelog/diff** — "Update our documentation to reflect the latest version's features and changes"
- **Test generation from PR diff** — "Implement unit tests based on the following diff in the feature branch"
- **Log analysis and incident summary** — "Review the following log files to diagnose and help troubleshoot X, then insert findings at Section 3.2 of the memo"
- **Dependency update review** — Review and summarize dependency update PRs with security and compatibility analysis
- **Code review pre-screening** — Automated first-pass review before human reviewers see the PR

### Documentation Strategy

The same documentation philosophy being built for the interactive product (the "How to Choose an IDE," "How to Install Mouse," "Best Practices" guides) extends to automation:
- "How to Set Up Your First Automated Documentation Workflow"
- "How to Configure Agent-to-Agent Review Pipelines"
- "How to Monitor Your Async Agent Queue"

Each guide walks someone from zero to running in 15 minutes. The runbooks are the quick-start; the guides are the deep understanding. Accessible to noobs with extensive documentation supporting both human developers and AI coding assistants on best practices and patterns.

---

## 6. Multi-Layer Agent Orchestration

### The Dispatch Model

The interactive agent in the IDE becomes a dispatcher. It identifies work that doesn't need to happen synchronously, opens an issue or invokes an MCP tool, and that request gets routed to an async agent running in a container with Mouse. The interactive agent keeps working. The async agent does its thing, submits a PR, and a notification comes back.

### MCP Tool as Dispatch Mechanism

The interactive agent would have access to tools like:
- `dispatch_async_task` — takes a repo, branch, task description, and optionally a review policy (auto-merge if tests pass, route to review agent, notify human). Creates the issue, triggers the workflow, returns a task ID.
- `check_task_status` — lets the agent or human check on progress.

The interactive agent never blocks. The human never context-switches. The work just happens.

### Agent-to-Agent Review Pipeline

- **Layer 1 (Work):** Agent A receives the task, does the work with Mouse, submits a PR.
- **Layer 2 (Review):** Agent B reviews the diff with Mouse (`find_in_file`, `read_lines` for efficient navigation rather than consuming raw diffs). Produces a structured review with deficiency analysis.
- **Layer 3 (Correction):** If issues are found, the task routes back to Agent A (or a fresh Agent C) for corrections — again with Mouse, so corrections are precise rather than introducing regressions.
- **Human Review:** By the time a human sees the PR, it's been through two Mouse-enhanced passes. The quality bar is meaningfully higher than anything a single-pass agent can produce today.

### Why Mouse Makes This Trustworthy

Without Mouse, async agents have roughly a coin-flip chance of corrupting files on complex edits. Nobody trusts that pipeline. With Mouse, the PFT rate is high enough that PRs coming back are genuinely reviewable — clean, correct, no phantom insertions or duplicated blocks or off-by-one line drift. That's the difference between "interesting demo" and "production infrastructure I depend on."

---

## 7. AWS Infrastructure for HIC-Hosted Solution (Track 2)

### Core Execution Engine: AWS Batch on Fargate

Purpose-built for this pattern: receive a job request, spin up an ephemeral container, execute the work, tear it down. No servers to manage, automatic scaling, pay-per-second billing.

**Why Batch on Fargate over alternatives:**
- **ECS tasks:** Would work but Batch gives job queuing, retry logic, and priority scheduling out of the box
- **Lambda:** Too constrained (15-minute timeout, limited filesystem)
- **CodeBuild:** Optimized for build/test, not arbitrary agent execution; less favorable pricing for variable-length jobs
- **Step Functions:** Could orchestrate the overall flow but actual execution still needs a container
- **EC2-backed Batch:** Cheaper at scale but Fargate eliminates instance management — right choice for launch

### Request Flow

```
API Gateway → Lambda (validate API key, check quota, submit job)
  → AWS Batch/Fargate (ephemeral container)
    → git clone, checkout feature branch
    → Run agent with Mouse tools against task description
    → Agent commits, pushes, opens PR via GitHub API
    → Container exits
  → SNS/webhook notification → customer notified PR is ready
```

### Secrets Management

- Customers provide a GitHub PAT (or install a GitHub App) for repo access
- Customer provides their AI provider API key (BYOK)
- All credentials stored in Secrets Manager, scoped per customer
- Mouse license is HIC's own — customer pays for the hosted service, not managing their own Mouse license

### Why Not GitHub Actions for Hosted

GitHub Actions is convenient for the self-hosted Track 1 path, but the hosted solution should be HIC-owned infrastructure from day one. Reasons:
- Can't commoditize or resell GitHub Actions workflows
- GitHub's reliability track record (ongoing migration issues, projected fixes not until July 2026)
- Owning the execution environment means controlling the SLA, scaling, pricing, and customer experience end to end

---

## 8. Marketing and Positioning

### For Technical Audiences

"Mouse's 64× PFT improvement means your automated PRs are correct the first time. Fewer wasted CI runs. Fewer review cycles. Lower compute costs. Drop a runbook into your repo and start automating today."

### For Decision-Makers

"Describe what you need. A PR shows up in your inbox." CTOs and engineering managers don't care about YAML files and Fargate containers. They care about inputs and outputs.

### The Nag-Banner Connection

Mouse's PLG trial conversion strategy (marketing to AI agents directly via nag-banners) extends naturally to automation. Agents running on trial licenses in automated settings encounter the escalating nag-banner, which compounds in async contexts and may degrade output quality — creating a natural incentive to activate a full license for automation workloads.

### Dogfooding as Marketing

Start by using Mouse for Automation internally — async agents updating Mouse documentation, generating tests from feature branch diffs, reviewing log files. Real examples to show prospective customers: "Here's a PR generated entirely by an async Mouse-enabled agent. Look at the diff quality. Look at the edit precision. This is what your team gets."

---

## 9. Legal and Licensing Considerations

### Distinct ToS for Automation

Automated, unattended execution in CI has different risk profiles from interactive usage:
- Higher volume
- No human review before execution
- Potential for runaway costs

The Automation ToS should address:
- Execution caps and quota enforcement
- Liability for automated changes
- Clear boundaries on what "unattended" means
- Data handling for customer repo contents processed in HIC-hosted containers

### IP Considerations

The hosted solution processes customer code in HIC-managed containers. Clear terms needed on:
- No retention of customer code beyond job execution
- No training on customer data
- Encryption at rest and in transit
- Container isolation guarantees

---

## 10. Implementation Sequencing

1. **Launch Mouse interactive** (current sprint — v0.10.10)
2. **Dogfood GitHub Actions runbooks** — use internally for HIC's own documentation, test generation, log analysis workflows. Validates the SEA binary, API key licensing, and runbook patterns.
3. **Release Mouse for Automation (Track 1, self-hosted)** — runbooks + SEA binary + API key licensing. Customers run on their own GitHub Actions / GitLab CI.
4. **Build and launch HIC-hosted solution (Track 2)** — API Gateway + Batch/Fargate infrastructure. Premium managed service for heavy-use customers.
5. **Multi-layer agent orchestration** — dispatch tools, review pipelines, correction routing. The most advanced capability, built on top of proven Track 1/Track 2 infrastructure.

Each step validates the next and generates revenue along the way.

---

## 11. Open Questions for Future Planning

1. **Pricing specifics** — exact per-run / per-minute rates for both tracks; how to price the hosted premium
2. **Agent support matrix** — which CLI agents to support at launch (Claude Code CLI, Aider, others?)
3. **GitHub App vs. PAT** — GitHub App installation provides finer-grained permissions and avoids PAT expiration issues; worth the setup complexity?
4. **Review pipeline configuration** — how much of the multi-layer orchestration to build vs. let customers configure?
5. **Monitoring and observability** — what dashboard/reporting do customers need to trust their async workflows?
6. **Compliance** — SOC 2, GDPR implications of processing customer code in HIC-hosted containers
7. **Nag-banner verification** — current state of the nag-banner system needs E2E verification (flagged in heartbeat analysis Journey D); relevant to automation trial behavior

---

*This memo captures the product vision as discussed on February 20, 2026. It is intended as a reference for future planning documents and does not represent committed scope or timeline.*
