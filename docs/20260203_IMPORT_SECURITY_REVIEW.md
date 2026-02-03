## Import Security Review — 2026-02-03

**Scope:** All JavaScript/Node imports across the repository, including `plg-website`, `dm` layers/facade, top-level scripts, and infrastructure lambdas.

### Method
- Enumerated all `import`/`require` statements across the repo and mapped them to package versions from each `package.json`.
- Checked current versions against public CVE feeds and vendor advisories (focus: AWS SDK v3, Next.js 16.1.x, Stripe SDK 20.x/8.x, React 19.2.x, Tailwind 3/4 toolchain).
- Reviewed usage hotspots for exploitation vectors: SSR rendering, HTML injection, command execution, cryptography, and secret handling.

### Findings
1) **AWS SDK version skew (auth layer only) — Medium (maintenance)**
   - `dm/layers/auth` depends on `@aws-sdk/client-cognito-identity-provider@^3.700.0`, while the rest of the repo uses `@aws-sdk` 3.874–3.980.
   - No published CVE for 3.700.0 identified, but the gap misses recent security fixes and behavioral patches. Recommend upgrading this layer to align with the newer 3.97x+ series.

2) **HTML injection surface — Low**
   - `dangerouslySetInnerHTML` used in static content pages (`plg-website/src/app/about/page.js`, `plg-website/src/app/docs/[slug]/page.js`). Inputs are locally defined structured data and not user-controlled. No actionable vulnerability with current data flow.

3) **Command execution — Low**
   - `scripts/build.js` uses `child_process.execSync` with a fixed Tailwind CLI command. No user input is incorporated; risk considered acceptable.

4) **Cryptography & secrets — No issues**
   - HMAC signing uses Node `crypto` with SHA-256 and random keys. Secrets are resolved via AWS Secrets Manager, not hardcoded.

### Conclusion
No known active vulnerabilities were found from current imports. Primary action item is to **bump `@aws-sdk/client-cognito-identity-provider` in `dm/layers/auth` to match the newer AWS SDK range** to stay current with security patches. Other import usages are presently low risk given static inputs and controlled execution paths.
