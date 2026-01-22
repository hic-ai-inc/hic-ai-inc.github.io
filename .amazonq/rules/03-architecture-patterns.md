---
applyTo: "**"
description: "HIC architectural patterns and design principles"
---

# HIC Architecture Patterns

## Design Patterns

- Serverless architecture (Lambda, Step Functions, DynamoDB)
- Event-driven with SNS/SQS
- Least-privilege IAM policies
- Dependency injection for testability

## Local Development

**MCP relay system** connects AI agents to HIC Local Tool Registry in VS Code.

**Architecture:** Agents → MCP Server → Tool Registry → Individual Tools

Each component independently testable and replaceable. MCP server runs as single Node process, exposing tools to both Copilot and Q Developer.

**Workflow:** Feature branches (`feature/*`) for new work → `development` for integration tests → `main` after all tests pass. Revert to feature branch for fixes.

## Remote Development

**Serverless, event-driven microservices** on AWS Lambda with DynamoDB, SNS/SQS, Cognito, API Gateway. CloudFormation for IaC. Versions managed through `/dm` system.

**Lambda Pattern:** Lambdas orchestrate, delegating business logic to services and utilities via `/dm` layers. Same delegation pattern in local code: MCP clients → Tool Registry → Tool implementations.

**Constraints:** JavaScript (Node.js 20.x) + Bash only. No external dependencies except AWS SDKs via `/dm` layers. See `02-coding-standards.md` and `05-security-requirements.md` for details.
