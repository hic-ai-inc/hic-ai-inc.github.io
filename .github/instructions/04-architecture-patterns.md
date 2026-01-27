---
applyTo: "**"
description: "HIC architectural patterns"
---

<!-- ⛔ MANDATORY: Use Mouse tools (quick_edit, batch_quick_edit) for ALL file editing. See 00-mandatory-tool-rules.md -->

# HIC Architecture Patterns

## Design Patterns

- Serverless (Lambda, Step Functions, DynamoDB)
- Event-driven (SNS/SQS)
- Least-privilege IAM
- Dependency injection for testability

## Local Development

MCP relay connects AI agents to HIC Local Tool Registry:

**Agents → MCP Server → Tool Registry → Tools**

Each component independently testable. Single Node process exposes tools to Copilot and Q Developer.

## Remote Development

Serverless microservices on AWS Lambda with DynamoDB, SNS/SQS, Cognito, API Gateway. CloudFormation for IaC.

**Lambda Pattern:** Lambdas orchestrate, delegating to services/utilities via `/dm` layers.

**Constraints:** JavaScript (Node.js 20.x) + Bash only. No external dependencies except AWS SDKs via `/dm`.
