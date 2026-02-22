# Pre-Launch Git Branch Strategy Recommendations

**Date:** 2026-02-22  
**Author:** Kiro (memorializing discussion with SWR)  
**Owner:** SWR  
**Status:** Recommendation — pending SWR implementation  
**Context:** SWR raised questions about branch protection strategy, PR requirements for a solo developer, and forward-compatibility with the Mouse for Automation product vision.

---

## 1. Problem Statement

Three interrelated questions arose during pre-launch planning:

1. **Branch protection for solo development:** Does requiring PRs add meaningful security when SWR is both author and approver, or is it ceremony without substance?
2. **Automation forward-compatibility:** The [Mouse for Automation Product Vision](../automation/20260220_MOUSE_FOR_AUTOMATION_PRODUCT_VISION.md) envisions agents pushing code for review. PRs are a GitHub-specific concept — how should automation work in a git-native, platform-agnostic way?
3. **Workflow disruption:** Any branch strategy change must preserve the existing CI/CD pipeline triggers and Amplify deployment flow without adding friction to SWR's daily workflow.

---

## 2. Current Workflow

SWR uses a trunk-based development variant with two long-lived branches:

```bash
git checkout development
# ... work ...
git add . && git commit -m "feature work"
git push origin development          # CI runs on development
git checkout main
git merge development
git push origin main                  # CI runs on main, Amplify deploys
git checkout development
git merge main                        # keep in sync
git push origin development
```

### 2.1 Existing CI/CD Protections

The pipeline (`.github/workflows/cicd.yml`) already provides:

- **Trigger on push** to both `development` and `main`
- **Trigger on PRs** to both branches (available but not required)
- **Unit tests (code-quality)** gate all merges
- **E2E tests** gate merges to `main`; warnings-only for `development` (resolves the chicken-and-egg problem of deploying new code to staging)
- **Concurrency control** with `cancel-in-progress: true`
- **Manual dispatch** via `workflow_dispatch` for targeted environment runs

### 2.2 Assessment

The `development`-first workflow is itself the primary gate. Code reaches `main` only after passing CI on `development`. The pipeline's merge policy (unit tests block everything, E2E blocks `main`) enforces quality without requiring PRs.

---

## 3. Recommendation: Protect Without PRs

### 3.1 What to Enable on `main`

| Protection | Enable? | Rationale |
|---|---|---|
| Prevent force-pushes | ✅ Yes | Prevents accidental history rewrite on `main` |
| Prevent branch deletion | ✅ Yes | Prevents accidental deletion of `main` |
| Require status checks to pass | ✅ Optional | Belt-and-suspenders; see caveat in §3.2 |
| Require pull requests | ❌ No | Ceremony without security benefit for solo developer |

### 3.2 Status Check Caveat

"Require status checks to pass before merging" gates merges via the GitHub UI/API. Direct CLI pushes (`git push origin main` after a local merge) may still succeed depending on GitHub's evaluation of the rule for non-PR pushes. For SWR's workflow, the `development`-first pattern is the real gate — branch protection prevents accidents (force-push, deletion), not the normal merge flow.

### 3.3 GitHub Configuration Steps

1. GitHub → Repository Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. Check: **"Do not allow force pushes"**
4. Check: **"Do not allow deletions"**
5. Optionally check: **"Require status checks to pass before merging"**
   - If enabled, search and add: `Code Quality Gate`, `E2E Integration Tests`, `Pipeline Results`
6. Leave **"Require a pull request before merging"** UNCHECKED

### 3.4 Workflow Impact

**Before:** `git push origin main` works.  
**After:** `git push origin main` works. `git push --force origin main` is rejected. `git push origin :main` is rejected.

No change to daily workflow. No `gh` CLI dependency. No PR ceremony.

---

## 4. Automation Forward-Compatibility

### 4.1 The PR Problem

PRs are a GitHub-specific concept. GitLab calls them Merge Requests. Bitbucket has its own variant. Tying Mouse for Automation to PRs would:

- Lock the product to GitHub's API and `gh` CLI
- Exclude GitLab, Bitbucket, and self-hosted git users
- Increase Microsoft/GitHub dependency — counter to SWR's strategic preferences

### 4.2 Git-Native Alternative: Feature Branch Push

The automation agent operates entirely with standard `git` commands:

```bash
# What the automation agent does — pure git, no forge-specific CLI
git checkout -b automation/task-description-123
# ... agent does work with Mouse ...
git add . && git commit -m "Automated: task description"
git push origin automation/task-description-123
```

The branch exists on the remote. What happens next is forge-agnostic:

| Customer's Forge | What Happens |
|---|---|
| GitHub | Customer opens a PR from the branch, or an optional GitHub Action auto-creates one |
| GitLab | Customer opens an MR, or CI auto-creates one |
| Bitbucket | Customer opens a PR via their UI |
| HIC-Hosted (Track 2) | Completion webhook notifies customer the branch is ready for review |
| Any git remote | Customer reviews the branch diff and merges at their discretion |

The forge-specific PR/MR creation is a thin optional layer — not part of Mouse's core automation product. This keeps the product platform-agnostic.

### 4.3 Dogfooding Approach

For internal dogfooding, SWR would:

1. Automation agent pushes an `automation/*` branch
2. SWR reviews the branch diff locally or on GitHub
3. Merges into `development` through the normal flow, or discards

No changes to the current branch strategy or CI/CD pipeline are needed.

### 4.4 Future CI/CD Extension (When Needed)

When automation dogfooding begins, a 2-line addition to `cicd.yml` would run tests on automation branches before review:

```yaml
push:
  branches: [development, main, 'automation/**']
```

This is not needed now. The current pipeline configuration is forward-compatible.

---

## 5. What NOT to Change Now

| Item | Action | Rationale |
|---|---|---|
| CI/CD triggers | No change | Already triggers on push to `development` and `main`; automation branches added later |
| Branch naming | No change | `development` / `main` convention is compatible with automation branch patterns |
| Amplify deployment | No change | Deploys on push to `main` — unaffected by branch protection settings |
| PR workflow in `cicd.yml` | No change | PR triggers exist in the pipeline but are not required; available if needed later |
| `gh` CLI adoption | Skip | Not needed for branch protection or current workflow |

---

## 6. Summary of Decisions Needed

| # | Decision | Recommendation | Urgency |
|---|---|---|---|
| 1 | Enable force-push + deletion protection on `main` | Yes | Before launch |
| 2 | Require status checks on `main` | Optional — real gate is the `development`-first workflow | Low |
| 3 | Require PRs on `main` | No | N/A |
| 4 | Change current git workflow | No | N/A |
| 5 | Add automation branch CI triggers | Not yet — when dogfooding begins | Post-launch |

---

*This memo captures recommendations discussed on February 22, 2026. Implementation of branch protection settings is a GitHub UI configuration task requiring no code changes.*
