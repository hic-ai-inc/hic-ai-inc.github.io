QUESTION:

Hi GPT-5, I'm working hard on HIC's dependency management issues inside VS Code with Amazon Q Developer; however, we are now at a critical junction, so we agreed we need your expert advice and recommendations. Here is the situation as described by Q; let me know if you have any questions or need more information before diving in. Thanks! Subject: Critical Architecture Decision for HIC Platform Centralized Testing Infrastructure I'm working on the HIC (Human-In-Charge) platform and need deep architectural guidance on a complex dependency management and testing infrastructure problem that could make or break our entire testing strategy. Background Context HIC Platform Overview: Production-grade serverless platform with 81+ Lambda functions across 8 modules Modules: api-auth-unified, rfa-unified, research, qa, research-v2, etc. Each module currently has 10x dependency bloat (80MB packages vs 5KB actual needs) Successfully identified root cause: shared packages contain all AWS SDKs + Jest for every Lambda Current Problem: Built dependency-manager system with modular Lambda layers (hic-dynamodb-layer, hic-s3-layer, etc.) Built shared-testing infrastructure with centralized mocks (hic-dynamodb-mocks, hic-s3-mocks, etc.) Now facing circular dependency and architecture complexity that could create worse problems than we're solving The Critical Architecture Challenge We need to solve: How should centralized testing mocks be distributed, managed, and used across modules without creating dependency hell? Current State Analysis Existing QA Module Testing (Working): // qa/tests/lambda/qa-dispatcher.test.js const { mockClient } = require('aws-sdk-client-mock'); const { LambdaClient } = require('@aws-sdk/client-lambda'); const lambdaMock = mockClient(LambdaClient); Copy javascript New Centralized Mock (Built but Unused): // dependency-manager/shared-testing/mocks/dynamodb/dynamodb-mock.js const { dynamoMock, mockHelpers } = require('./dynamodb-mock'); mockHelpers.mockGetItem('users', { id: '123' }, { id: '123', name: 'John' }); Copy javascript Real Usage Analysis (From Source Code Inspection): 22 Lambda functions use DynamoDB with these patterns: dynamoClient.send() (15 functions) - modern SDK dynamodb.update() (7 functions) - legacy SDK dynamodb.put() (4 functions) - legacy SDK Commands: GetItem, PutItem, UpdateItem, Query, Scan, BatchGet, BatchWrite Core Architecture Questions 1. Mock Distribution Strategy: Option A: Direct imports require('hic-dynamodb-mocks') Option B: Through core wrapper require('hic-testing-core').createDynamoMock() Option C: Auto-discovery/injection pattern Question: Which approach scales to 8+ modules with different mock needs? 2. Dependency Management: Current: Each module has own devDependencies with duplicated mocks Option A: npm link to shared-testing directory Option B: file: dependencies in package.json Option C: Copy mock files during build process Question: How do we handle version conflicts when Research needs DynamoDB v3.800 but QA needs v3.700? 3. Circular Dependency Problem: dependency-manager creates mocks → QA uses mocks to test → dependency-manager needs testing using same mocks Question: How do we test the testing infrastructure without circular dependencies? 4. Migration Strategy: QA module has 133 passing tests using current approach Question: How do we migrate without breaking existing tests? 5. Mock Lifecycle Management: Question: Who owns mock versioning, updates, and compatibility? Question: How do we ensure mock behavior matches real AWS services? 6. Cross-Module Testing: Some modules test interactions with other modules Question: How do mocks handle cross-module dependencies? Additional Complexity Factors Version Management: AWS SDK versions vary across modules (v3.700, v3.800, v3.864) Jest versions may differ Mock framework versions need coordination Build/Deploy Implications: Current: Each module builds independently Proposed: Shared testing infrastructure needs coordination Question: How does this affect CI/CD pipelines? Development Experience: Developers work on individual modules Question: How do they get/update shared mocks without friction? Testing the Testers: Mocks themselves need comprehensive testing Question: What's the testing strategy for testing infrastructure? Specific Decisions Needed Architecture Pattern: Centralized vs. Distributed vs. Hybrid mock management Dependency Resolution: How modules discover and import mocks Version Coordination: How to handle AWS SDK version differences Migration Path: Step-by-step plan to convert existing modules Testing Strategy: How to validate mock behavior matches AWS Developer Workflow: How developers work with shared mocks day-to-day CI/CD Integration: How build pipelines handle shared testing infrastructure Success Criteria Zero Breaking Changes: Existing tests continue working during migration Dependency Reduction: Eliminate 10x bloat without creating new complexity Developer Productivity: Shared mocks accelerate testing, don't slow it down Maintainability: Clear ownership and update processes for shared infrastructure Scalability: Architecture works as platform grows to 100+ Lambda functions Request for GPT-5 Deep Thinking Please provide a comprehensive architectural recommendation that addresses all these concerns with: Detailed architecture pattern with pros/cons analysis Step-by-step implementation plan with risk mitigation Migration strategy that preserves existing functionality Governance model for shared testing infrastructure Alternative approaches if primary recommendation has significant risks This decision will impact the entire HIC platform's testing strategy and development velocity. I need confidence that the chosen approach will scale and remain maintainable as the platform grows.

ANSWER No. 1:

You’re right to pause and choose this carefully. Below is a pragmatic, scalable architecture that eliminates the 10× bloat while avoiding circulars, preserves your 133 passing tests, and gives you a clean path to 100+ Lambdas.

I’ll be precise and opinionated; where there are viable alternatives I’ll call them out.

1) Target Architecture (high-level)
Core idea

Inversion of control + thin adapters. Central testing utilities never import AWS SDKs directly. Instead, each test passes its own client (e.g., new DynamoDBClient(...)) into a mock factory. This removes SDK-version coupling and prevents circulars.

Package-per-surface with clear contracts:

@hic/test-core: Jest setup helpers, snapshot utils, contract-test harness, LocalStack harness, TypeScript types.

@hic/mock-dynamodb: factories to mock v2 and v3 usage patterns behind a single API (via adapters).

@hic/mock-s3, @hic/mock-lambda, etc. — same pattern.

@hic/contract-* (optional): cross-module “message/API contract” test kits (JSON Schemas + validators).

Monorepo + versioned publish (pnpm or Yarn Berry workspaces + Changesets) to ship the above as private NPM packages (GitHub Packages or AWS CodeArtifact). Modules consume them as devDependencies. No file: or npm link in CI.

Two test tiers everywhere:

Fast unit with central mocks (default).

Nightly/CI matrix integration vs LocalStack using the same test specs via a flag (to continuously verify “mocks ≈ reality”).

This yields:

No duplication of mocks.

No lockstep SDK versions across modules (clients are injected).

No circular dependency with your dependency-manager (it doesn’t depend on the mocks; tests do).

2) Concrete package design
2.1 @hic/test-core

Responsibility: testing scaffolding, not AWS specifics.

Contents:

jest.setup.js and createTestEnv(opts) to register globals, timers, random seeds, and per-suite isolation.

withLocalStack(resources, fn) to provision ephemeral LocalStack services for integration runs (implemented via testcontainers).

makeContractSuite({ name, schema, cases, runner }) to define “contract tests” once and execute in both mock and localstack modes.

Minimal dependencies (Jest-agnostic where possible), no AWS SDK import.

2.2 @hic/mock-dynamodb

Responsibility: consistent mocking interface for both v2 and v3 callers.

API sketch (TypeScript-ish for clarity; JS is fine too):

type DynamoMock = {
  whenGetItem(match: Match, result: Result | Error): void;
  whenPutItem(match: Match, result: Result | Error): void;
  whenUpdateItem(match: Match, result: Result | Error): void;
  whenQuery(match: Match, result: Result | Error): void;
  // ...BatchGet, BatchWrite, Scan, etc.
  reset(): void;
};

function createDynamoMock(opts: {
  // Inject your real client(s) so versions don’t matter
  v3?: import('@aws-sdk/client-dynamodb').DynamoDBClient | import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient;
  v2?: import('aws-sdk/clients/dynamodb'); // DocumentClient
  mode?: 'v2' | 'v3' | 'auto'; // auto inspects injected client
}): DynamoMock;

Under the hood:

If v3 is provided, shim to aws-sdk-client-mock or your own minimal interceptor.

If v2 is provided, shim via jest.spyOn(DocumentClient.prototype, 'get' | 'put' | 'update' | ...).

Matching by command + table + key; helper matchers support partials and predicates.

Zero direct import of AWS SDK in public surface (types are peerDependencies optional).

Repeat this pattern for @hic/mock-s3, @hic/mock-lambda, etc.

2.3 Version strategy (no more SDK lockstep)

peerDependencies (optional): declare broad ranges (e.g., @aws-sdk/client-dynamodb: ">=3.700 <4") but keep them optional so the package doesn’t install the SDK—your module already has it.

Adapters only rely on the runtime shape offered by the client you inject.

If a breaking AWS SDK change lands, you release a minor/patch as long as your adapter contract holds. A truly breaking adapter change → semver major of @hic/mock-dynamodb.

3) Distribution & dependency mechanics

Recommended: Monorepo (pnpm) + private registry publish.

Repos:

hic-testing/ (the monorepo for @hic/test-core, @hic/mock-*, @hic/contract-*)

Application modules (research, qa, api-auth-unified, …) remain in their repos/monorepo.

Why publish? Avoids file:/link fragility in CI, and removes circulars—production code never depends on test packages.

Dev experience:

Engineers add @hic/mock-dynamodb@^x.y as a devDependency in their module.

jest.config.js uses setupFilesAfterEnv: ['@hic/test-core/jest.setup.js'].

Updating mocks = bump versions via Changesets and pnpm publish -r.

4) Avoiding the circular dependency

Your “dependency-manager” builds layers and also ships shared-testing. Split responsibilities:

Repo A (hic-dependency-manager): production packaging of layers (hic-dynamodb-layer, hic-s3-layer, …). No dependency on testing packages.

Repo B (hic-testing): @hic/test-core and @hic/mock-*.

QA module and others: depend on both (layers for runtime, tests for dev-only) — but A and B never depend on each other.

To test the testers (Repo B):

Self-tests use LocalStack as the oracle:

For each operation (GetItem, PutItem, UpdateItem, Query, …), define canonical behaviors and edge cases (conditional updates, ConditionExpression, retries, throttling → simulated).

Run the same contract cases against (1) the mock adapters and (2) LocalStack + real SDK clients. The outputs must match. Where LocalStack diverges from AWS, capture fixtures and document differences; add targeted e2e runs in a separately scheduled pipeline (see §7).

No circulars introduced.

5) Mock behavior fidelity (mocks ≈ AWS)

Technique: “Dual-run contract suites”

Every @hic/mock-* package ships a /contracts suite: JSON Schema for request/response and canonical cases.

The same suite runs in:

Mock mode (default, fast)

LocalStack mode (slower, CI/nightly)

If a divergence is found, a CI job fails; maintainers patch the adapter or document the variance.

Throttling, retries, transient faults

Add opt-in fault injection to mocks: { fault: 'ThrottlingException', rate: 0.05 }.

Validate client retry policies via unit tests + a small number of LocalStack cases.

6) Cross-module testing

Separate three levels:

Unit (within a module): use @hic/mock-*.

Contract (cross-module boundaries): publish message/API schemas in @hic/contract-* and provide validators + sample fixtures. Each module runs these to ensure it produces and consumes valid contracts.

System integration: optional, scheduled flows using LocalStack + testcontainers where feasible (SQS/SNS/Lambda invoke/S3/DDB). Keep these focused and sparse (smoke tests), not exhaustive.

This drastically reduces the need to import one module’s code into another’s tests.

7) CI/CD integration

Per-module pipeline:

Install prod deps only for build (keep test deps out of Lambda bundles).

Test matrix:

MODE=mock: fast unit (default on PRs).

MODE=localstack: selective suites (e.g., @slow tag) on main merges or nightly.

Artifact hygiene: verify no @hic/mock-* or @hic/test-core ends up in the built layer/function zip (bundle audit step).

Testing repo pipeline (hic-testing):

Run adapter contract tests in both modes (mock & LocalStack) against a matrix of AWS SDK versions you care about (e.g., 3.700, 3.800, 3.864). This guards your promise to downstream modules with mixed SDK pins.

Versioning & release:

Use Changesets to bump versions of @hic/mock-* and @hic/test-core. Autogenerate changelogs.

Enforce CODEOWNERS for testing packages. Require 1–2 approvals from a “Testing Guild”.

8) Migration strategy (no breakages)

Phase 0 – Prep (no test changes yet)

Create @hic/test-core and @hic/mock-dynamodb (others later).

Implement createDynamoMock({ v3?: DynamoDBClient | DocumentClient, v2?: DocumentClient }).

Add the v2 adapter early (you have dynamodb.put()/update() in 7+ Lambdas).

Phase 1 – QA pilot (compat shim)

In qa/, replace current aws-sdk-client-mock usage with:

import { createDynamoMock } from '@hic/mock-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const ddb = createDynamoMock({ v3: client });

beforeEach(() => ddb.reset());
ddb.whenGetItem({ table: 'users', key: { id: '123' } }, { Item: { id: '123', name: 'John' } });

If you need zero changes to 133 tests, ship a compat layer:

@hic/mock-dynamodb/compat exports mockClient(LambdaClient) style helpers, internally backed by your new factory.

Update imports only (1-liner per file), keep assertions intact.

Phase 2 – Rollout across modules

Module-by-module: add @hic/test-core setup file; replace ad-hoc mocks with the factory; do not touch production code.

Start with DynamoDB users (22 functions), then S3/Lambda.

Phase 3 – Enable LocalStack verification

Mark a subset of suites @slow and wire MODE=localstack job for nightly on each module + full matrix in hic-testing.

Phase 4 – Remove legacy

Delete local mock files from modules.

Lock Lambda bundlers to exclude test-only deps (audit to confirm size drop).

9) Governance & ownership

Testing Guild (2–3 engineers) owns @hic/test-core and @hic/mock-*.

Semver discipline:

Behavior-affecting changes to mocks → minor or major with clear migration notes.

Add deprecated() annotations and lint rules to steer users off old helpers.

Contracts:

Each @hic/contract-* is owned by the team that owns the boundary (e.g., RFA messages).

Schemas live with the contract package; all producers/consumers depend on it for tests.

RFC process: Any new mock surface or behavior change = short RFC (template in repo) with examples and LocalStack parity notes.

10) Addressing your specific questions

1) Distribution strategy

Choose Option B (core wrapper) with IoC: require('@hic/mock-dynamodb').createDynamoMock(client)
Scales best, avoids SDK lockstep, and keeps callsites uniform.
You can add optional auto-injection via @hic/test-core’s Jest setup for teams that want zero boilerplate.

2) Dependency management & version conflicts

No direct SDK deps in mocks; clients are injected.

Declare optional peerDeps with broad ranges; test against a version matrix in hic-testing CI.

This survives QA on v3.700 while Research is on v3.864.

3) Circular dependency

Split testing infra to a separate repo; production dependency-manager never imports it.

Test the testers via LocalStack + contract suites. No circulars.

4) Migration without breaking 133 tests

Ship a compat shim that mirrors current helpers (e.g., mockClient) but routes to the new factory.

Flip imports first; then gradually adopt the clearer whenGetItem API.

5) Mock lifecycle & fidelity

Testing Guild owns versions.

Dual-run (mock + LocalStack) keeps behavior aligned.

Add fault-injection knobs to exercise retry & error paths.

6) Cross-module testing

Use contract packages with JSON Schemas and test fixtures.

Producers/consumers validate against the same schemas; avoid direct code coupling.

CI/CD implications

Add a two-mode test matrix per module; keep integration runs nightly/on-merge only to preserve speed.

Ensure bundling excludes test deps (size check in CI).

Dev ergonomics

One-liners: const ddb = createDynamoMock({ v3: client }); + a few when* calls.

Auto-setup via @hic/test-core for teams who prefer minimal boilerplate.

Testing the testers

hic-testing runs contract suites across:

mock mode

LocalStack mode

SDK version matrix

Optionally add mutation testing (Stryker) to ensure tests actually fail when they should.

11) Pros/Cons of this approach

Pros

Eliminates SDK lockstep; modules keep their own versions.

No circular dependencies.

Realistic behavior via LocalStack parity checks.

Clear ownership and release process.

Predictable developer ergonomics.

Cons / Risks

Maintaining adapters for both v2 and v3 surfaces (initial lift).

LocalStack is not 100% AWS—requires documented exceptions.

A private package registry adds mild operational overhead.

Mitigations

Start with DynamoDB (your heaviest cross-cutting surface).

Keep adapter internals thin, well-tested, and version-matrixed.

Document LocalStack variances; add targeted e2e in AWS for any critical deltas.

12) Success metrics to track

Bundle size: median Lambda package size before/after (target: remove Jest & SDK supersets from function zips entirely).

Test runtime: PR pipeline under N minutes with MODE=mock; nightly jobs green in both modes.

Adoption: % of modules using @hic/mock-* exclusively.

Escape hatch usage: count of “manual mocks” left in repos (trend to zero).

Defect rate: incidents caused by AWS behavior not covered by mocks (should trend to zero with dual-run parity).

13) Alternative paths (and why I didn’t lead with them)

Centralized LocalStack-only testing (no mocks)

✅ Fidelity; ❌ Slow, brittle for pure unit tests; ❌ Heavier CI infra; ❌ Poor DX for quick TDD.

Keep aws-sdk-client-mock everywhere + dedupe via workspaces

✅ Low friction; ❌ Reintroduces SDK-version coupling and hidden transitive deps; ❌ Doesn’t solve v2 vs v3 duality.

Codegen fakes from OpenAPI/Smithy

✅ Strong typing, future proofing; ❌ High initial investment; ❌ Still needs behavior parity and injection story.

The proposed IoC + adapter + dual-run pattern hits the best balance of speed, fidelity, and maintainability.

14) Immediate next steps (actionable)

Create hic-testing monorepo with @hic/test-core + @hic/mock-dynamodb.

Implement adapters for:

v3: intercept client.send(new GetItemCommand(...))

v2: spy on DocumentClient.prototype.get/put/update/query/...

Publish v0.1.0 to your private registry.

Add compat shim in @hic/mock-dynamodb/compat that mirrors mockClient(...) used in QA today.

Flip QA imports (no test logic change). Ensure all 133 pass.

Introduce MODE=localstack job for QA (nightly).

Roll out to next modules (prioritize the 22 DynamoDB users), then S3/Lambda packages.

Add contract kit @hic/contract-rfa with JSON Schemas for cross-module message validation.

Establish Testing Guild + CODEOWNERS + Changesets.

If you want, I can draft the initial @hic/mock-dynamodb API surface (including v2/v3 interceptors) and a sample Jest setup file.

///

END OF ANSWER No. 1

///

ANSWER No. 2: 

Awesome—thanks for the crisp brief. You’re at exactly the point where a clean testing architecture will either unlock velocity or hard-bake friction. Below is a concrete plan I’d ship if I were on the team.

Recommended Architecture (TL;DR)

Adopt a hybrid, boundary-first testing strategy:

Stabilize the runtime boundary: introduce thin, version-pinned service clients (adapters) for each AWS service (@hic/clients-dynamodb, @hic/clients-s3, …). All Lambdas call these, not raw SDKs.

Centralize test utilities as versioned dev packages published to an internal registry:
@hic/testing-core, @hic/testing-dynamodb-v3, @hic/testing-dynamodb-v2 (separate per major runtime API), @hic/testing-jest-preset, @hic/contracts.

Conformance & parity layer: every mock package ships a conformance test suite that runs (nightly/CI) against:

the mock itself,

LocalStack (fast integration),

a staging AWS account (slow, but source of truth).
The same tests run in 3 modes; diffs are reported automatically.

Consumer-driven contracts for cross-module tests: model inter-module events/HTTP as JSON Schemas in @hic/contracts and validate both producers and consumers via CDC.

Monorepo workspaces + strict dependency hygiene: use pnpm workspaces (or yarn/npm workspaces) with peerDependencies for SDKs (range-pinned), no Jest in any production layer, and overrides/resolutions to keep SDKs within agreed bands.

This gives you central control where it matters (mocks, presets, contracts), isolates version drift (per-major mock packages), and removes circulars by making “testing infra” a leaf, not a consumer of app code.

1) Mock Distribution Strategy
Choose: Hybrid via a core factory + granular per-service packages

Direct imports (A) scale poorly across v2/v3 and create hard ties.

Core wrapper factory (B) is the sweet spot: ergonomics + indirection.

Auto-discovery (C) is fragile and opaque in CI.

Concrete API

// @hic/testing-core
export type Runtime = 'aws-sdk-v2' | 'aws-sdk-v3';

export interface DynamoMock {
  // v3 shape normalized to a façade
  whenGetItem(params: { table: string; key: Record<string, any> }, result: any): void;
  whenPutItem(...): void;
  whenUpdateItem(...): void;
  whenQuery(...): void;
  reset(): void;
}

export function createDynamoMock(runtime: Runtime): DynamoMock;

@hic/testing-dynamodb-v3 implements createDynamoMock('aws-sdk-v3') using aws-sdk-client-mock.

@hic/testing-dynamodb-v2 implements createDynamoMock('aws-sdk-v2') over the legacy client.

Tests import only the factory from @hic/testing-core and declare runtime per module (or via a Jest setup file).

This keeps test call sites stable while you migrate Lambdas from v2→v3 at your pace.

2) Dependency Management & Version Coordination
Packages

@hic/testing-core (tiny, no SDK dependency)

@hic/testing-<svc>-v3 (peerDep: @aws-sdk/* ^3.7xx < 3.9xx)

@hic/testing-<svc>-v2 (peerDep: aws-sdk ^2.x)

@hic/testing-jest-preset (Jest config, environment, common setup)

@hic/contracts (JSON Schemas/types for events & HTTP DTOs)

Principles

peerDependencies for SDKs (not deps): the app/module owns the SDK version; the mock adapts to it.

Use pnpm workspaces for hoisting control & fast installs. Add a root-level overrides to keep your v3 range coherent:

"overrides": {
  "@aws-sdk/*": "^3.800.0"
}

When Research temporarily needs ^3.864, scope that override to the Research package.json and run the conformance suite (see §5) before merging.

Never ship Jest/ts-jest in runtime layers; keep all testing infra dev-only.

3) Circular Dependency Elimination

Rule: testing infra must not import HIC modules. It provides interfaces + conformance suites only.

The service clients (@hic/clients-dynamodb) are the runtime boundary your Lambdas import.
Tests target that boundary with the mocks (no need to “test the testers” by pulling app code into infra).

Testing infra tests itself via:

Self-contained unit tests (internal behavior),

Conformance suite (mock ↔ LocalStack ↔ AWS).
No app code involved ⇒ no cycle.

4) Migration Strategy (Preserve 133 Passing Tests)

Phase 0 – Prep (no prod changes)

Create @hic/testing-core, @hic/testing-jest-preset.

Create @hic/testing-dynamodb-v3 with façade methods: whenGetItem, whenPutItem, whenUpdateItem, whenQuery, etc. Implement via aws-sdk-client-mock.

Publish to your internal registry (e.g., CodeArtifact) with semver.

Phase 1 – Drop-in shim for existing QA tests

In QA, add a Jest setup file:

// qa/jest.setup.js
const { createDynamoMock } = require('@hic/testing-core');
global.dynamo = createDynamoMock('aws-sdk-v3');

Replace the few centralized places where mockClient(LambdaClient) is constructed with the factory (keep legacy where needed).
Provide a compat shim:

// @hic/testing-core/compat
export function mockClientCompat(ClientCtor) {
  const { mockClient } = require('aws-sdk-client-mock');
  return mockClient(ClientCtor);
}

This preserves existing test code while you gradually switch to the façade.

Phase 2 – Introduce runtime clients and refactor new/changed Lambdas first

Add @hic/clients-dynamodb. Example:

// runtime façade used by Lambdas
export interface IDynamo {
  get<T>(table: string, key: Record<string, any>): Promise<T | null>;
  put<T>(table: string, item: T): Promise<void>;
  update(table: string, key: any, expr: { update: string; names?: any; values?: any }): Promise<void>;
  query<T>(params: { table: string; keyCondition: string; ... }): Promise<T[]>;
}

For each new/modified Lambda, use the client instead of raw client.send/dynamodb.put.
Tests mock at the client boundary through the factory (no SDK knowledge in test files).

Phase 3 – Sweep existing tests (codemod)

Write a codemod to replace common patterns:

mockClient(LambdaClient) → createLambdaMock('aws-sdk-v3') (if you add a Lambda mock package)

Direct Dynamo mock calls → global.dynamo.whenGetItem({table,key}, result)

Run module by module. Your 133 tests remain green because the shim and compat helpers keep behavior intact during the sweep.

Phase 4 – Kill v2 at your pace

Where legacy v2 is entrenched, use @hic/testing-dynamodb-v2.
When you flip the module to v3, only change the runtime client + the one line in Jest setup from 'aws-sdk-v2' → 'aws-sdk-v3'. Test code stays the same (façade FTW).

5) Mock Lifecycle & “Testing the Testers”

Ownership

Establish a Testing Guild (Platform) that owns:

@hic/testing-* packages

@hic/testing-jest-preset

@hic/contracts

Conformance suites + nightly pipelines

Versioning & Policy

SemVer strictly:

Major: breaking façade changes (rare).

Minor: new façade methods, new service support.

Patch: bug fixes, parity tweaks.

Support window: maintain last two minors for mock packages.

Parity Guarantee

Each mock package includes a conformance test suite that runs the same tests in 3 modes:

Mock mode (fast, unit),

LocalStack (docker compose; near-AWS behavior),

Staging AWS (least frequent; authoritative).

A simple runner:

hic-conformance run dynamodb --mode=mock
hic-conformance run dynamodb --mode=localstack
hic-conformance run dynamodb --mode=aws
hic-conformance diff dynamodb  # summarizes behavior drift

Add property-based tests (e.g., with fast-check) for idempotency, conditional updates, and pagination behavior.

6) Cross-Module Testing (HTTP + Events)

Define contracts (JSON Schema + TypeScript types) for:

SNS/SQS event envelopes (e.g., ResearchProposalCreated),

API request/response DTOs.

Publish in @hic/contracts.

Producers run schema validation in unit tests and in pre-prod integration.

Consumers run CDC tests (Pact-style) against mock providers emitted from contracts.
Your mocks don’t “know” other modules; they instantiate providers from published contracts → no spaghetti cross-imports.

7) CI/CD Integration

Pipelines

Move to monorepo with pnpm + Turborepo or Nx:

Cache builds/tests.

Affected graph: only test modules impacted by changes.

CI matrix:

lint

unit (mock mode)

integration (LocalStack)

conformance (nightly: LocalStack + AWS staging)

Contracts gate: If @hic/contracts changes, re-run CDC for dependents.

Publish: On main, automatically publish changed @hic/testing-* packages to CodeArtifact with changelogs (e.g., Changesets).

Build/Deploy Impact

Modules continue to build independently. Shared testing packages are dev-only, pulled via registry—no coupling to deployment artifacts.

Lambda layers remain small because testing deps never land in runtime bundles.

8) Developer Workflow

Scaffold via CLI:

npx hic-test init dynamodb --runtime=v3

Adds @hic/testing-core, @hic/testing-dynamodb-v3, preset, and a jest.setup.ts.

VS Code snippets:

“mock dynamo getItem” → inserts façade call.

Documentation pages in each package with 1-screen recipes:

“How to mock conditional UpdateItem”

“How to record+replay a failing LocalStack interaction as a golden test”

Frictionless updates:

pnpm up -r @hic/testing-* across the monorepo

Changesets PR bot posts release notes scoped to affected modules.

9) Detailed Answers to Your Core Questions

1) Distribution
Pick Option B (core factory) + per-service packages split by SDK major. This scales across 8+ modules and absorbs v2/v3 differences behind a stable façade.

2) Dependency Management
Use peerDependencies for SDKs; pnpm overrides to keep bands coherent; publish testing packages to an internal registry. For the “Research v3.864 vs QA v3.700” case: both can coexist because mocks declare peer ranges; the conformance suite prevents you shipping a mock that fails under either bound.

3) Circular Dependency
Testing infra never imports app code. It exposes factories and runs conformance vs LocalStack/AWS. No cycles.

4) Migration
Introduce façade + compat shims; wire QA’s 133 tests via a Jest setup that supplies createDynamoMock('aws-sdk-v3'); codemod incrementally. Zero breaking changes, because the façade matches existing usage patterns and you keep legacy shims temporarily.

5) Mock Lifecycle
Testing Guild owns it. SemVer, Changesets, conformance tri-mode testing. Parity ensured by systematic diffs and nightly staging runs.

6) Cross-Module
Model DTOs/events in @hic/contracts. Use CDC tests and generated mock providers. No direct module→module test imports.

CI/CD Implications
Shared testing infra is publish-time, dev-only; monorepo caching + affected graphs keep builds fast. No deployment coupling.

Developer Experience
CLI scaffolds; Jest preset removes boilerplate; façade keeps test code readable and stable.

10) Risks & Mitigations

Risk: façade API drift
Mitigation: Keep façade minimal (CRUD + query primitives), version by SemVer, and deprecate slowly with codemods.

Risk: SDK feature gaps (e.g., specific command params)
Mitigation: façade exposes “escape hatches”:

rawSend<TCmd, TOut>(cmd: TCmd): Promise<TOut>; // guarded, rarely used

Conformance covers these when used.

Risk: LocalStack divergence
Mitigation: nightly staging AWS run; open issues gated by allowed-drift.yml with expiration dates.

Risk: Team adoption lag
Mitigation: provide codemods + cookbook; make new templates only expose façade; track adoption with a repo-level metric.

11) Concrete Implementation Checklist (2–3 days effort to first value)

pnpm workspaces + Turborepo/Nx if not already.

Create packages:

@hic/testing-core

@hic/testing-dynamodb-v3 (façade over aws-sdk-client-mock)

@hic/testing-dynamodb-v2 (legacy)

@hic/testing-jest-preset

@hic/contracts

Add conformance runner skeleton with three modes and a single DynamoDB suite covering: GetItem|PutItem|UpdateItem|Query|Scan|Batch*, conditional expressions, pagination.

Publish v0.1.0 to CodeArtifact; wire QA’s Jest setup to use the factory; keep existing test bodies intact.

Add @hic/clients-dynamodb runtime façade (small, no mocks inside).

Codemod one module to façade + factory; measure bundle shrink + test speed.

Add CI jobs: unit (mock), integration (LocalStack), nightly conformance (LocalStack+AWS).

12) Alternative Approaches (and why they’re second-best here)

Fully centralized mocks via direct import (Option A)

Simpler initially, but brittle under v2/v3, and pushes version fights into every module.

Pure integration-first (LocalStack only, no unit mocks)

Great fidelity, slower dev loop, harder to inject edge cases (faults, retries, throttling). You still want unit-level façades for speed and determinism.

Auto-discovery/injection

Magical until it isn’t. Hard to debug in CI and invites hidden global state.

13) Success Criteria Mapping

Zero Breaking Changes: Compat shims + Jest setup maintain green tests during migration.

Dependency Reduction: Jest & SDKs live in dev/test packages with peerDeps; runtime bundles depend only on @hic/clients-* (tiny) and minimal SDK subsets.

Developer Productivity: One import, stable façade, CLI scaffolds, fast unit loops.

Maintainability: Testing Guild ownership, SemVer + conformance, clear docs.

Scalability: Split per service and per SDK major; façade isolates churn; contracts scale cross-module validations.

If you want, I can draft:

the TypeScript typings for the façade,

the first DynamoDB conformance tests (including conditional updates & pagination),

a minimal hic-conformance CLI stub,

and a codemod to migrate common aws-sdk-client-mock patterns to the façade.

But the high-order bit is: put a stable façade at the runtime boundary, centralize test utilities behind factories, and prove parity via automated conformance across mock/LocalStack/AWS. This will pull you out of dependency quicksand and keep you nimble as HIC scales past 100 Lambdas.


