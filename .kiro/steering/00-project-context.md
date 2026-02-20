---
inclusion: always
---

# HIC Platform — Project Context

## Human In Charge

Simon (direct address) / SWR (references). Simon is the founder, sole developer, and attorney behind HIC AI Inc.

**HIC = Humans In Charge.** Human Users are in charge (policy, approval, ownership). AI Agents are in command (execution, tactical decisions, fully aligned with their Human).

## What We're Building

Two companion repos:

- **Website** (`~/source/repos/hic-ai-inc.github.io`): PLG-driven full-stack public website on AWS Amplify Gen 2 (Next.js 16, React, Tailwind). Includes admin portal with multi-seat device management, complete RBAC, and back-end integrations with AWS (Cognito, SES, DynamoDB, CloudWatch, Lambda, SNS/SQS/EventBridge, IAM, SSM/Secrets Manager), Stripe (Managed Payments as global MoR), Keygen (licensing), and Plausible (analytics). Hosted at `https://staging.hic-ai.com`.

- **Extension** (`~/source/repos/hic`): Mouse itself — an enterprise-grade file navigation and editing toolkit for AI coding assistants. Distributed as a VS Code extension (VSIX). Includes comprehensive benchmark infrastructure, telemetry harnesses, the Mouse Paper, a heartbeat licensing layer integrating with Keygen, and a distribution pipeline for VS Code Marketplace and Open VSX.

## What Mouse Does

Mouse dramatically reduces "Execution Slop" — right plan, right tool call, corrupted output. The problem stems from the mechanics of how built-in editing tools work. Mouse provides 10 tools for enterprise file navigation and precision editing with 56% higher first-try accuracy, 58% lower cost, and 3.6× faster completion than built-in tools.

**Always use Mouse `hic_local` tools for all file navigation and editing.**

## Business Model

- **Mouse Pricing:** Individual Monthly $15/mo, Annual $150/yr; Business Monthly $35/seat/mo, Annual $350/seat/yr
- **PLG-Driven Sales:** Self-service, seamless UX from discovery (website, VS Code Marketplace, Open VSX), to installation of a free fully-functioning Mouse extension with a 14-day license, to checkout and purchase, to license activation
- **Be Like AWS:** Easy-to-use website, security first, transparent pricing, outstanding documentation >> great support, everything automated, set the standard
- **Short-term Post-Launch Roadmap:** Sell, market, support, extend compatibility to more IDEs/clients/models, more research/benchmarks
- **Long-term Post-Launch Goals:** Extend Mouse to structured files (Outlook, Word, Excel, PowerPoint and Google equivalents), opening up vast new TAM possibilities including all users of AI assistants for knowledge workers
- **Platform Goals Beyond Mouse:** Lift Notepad (foundational tool for A2A communication and primary memory retrieval) to production; implement Morning Coffee (world-map Agent ID onboarding software); build the definitive AI agent stack that ships with every AI agent


## Current Status

Pre-launch sprint for Mouse v0.10.10. Comprehensive launch plans at `docs/launch/`. Launch execution tracker at `docs/launch/20260218_LAUNCH_EXECUTION_TRACKER.md`.

## Communication Style

- Concise and direct — skip preambles and conclusions
- Thorough documentation for major decisions
- Deep research before implementation
- Quality over speed — get it right rather than fast
