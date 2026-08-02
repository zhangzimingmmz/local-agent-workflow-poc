# PoC acceptance report

Updated: 2026-08-03

This report distinguishes implemented behavior from live, repeatable demonstration evidence. `Automated` means the repository test suite proves the contract in isolation. `Live` means the deployed control plane, public GitHub repository, and network path have produced the evidence. The PoC is not complete while any row remains Partial or Pending.

## Acceptance criteria

| Criterion | Required evidence | Current evidence | Status |
| --- | --- | --- | --- |
| AC-01 | Six independent Accounts authenticate and receive role-gated actions | Six hashed Accounts are seeded; API authentication and role filtering are automated; Alice has called the deployed API | Partial |
| AC-02 | Six Work Items, parent Requirement, and dependency graph are visible | Seed and dashboard tests verify six children, parent IDs, dependencies, responsibility, and blocking reasons | Automated |
| AC-03 | Concurrent claim has exactly one winner | Domain test verifies single ownership and conflict; a concurrent deployed request capture is still required | Partial |
| AC-04 | Blocked developer/tester cannot claim before Acceptance | State model and claim checks are automated; deployed negative capture is pending | Partial |
| AC-05 | Five-scope guidance includes exact source versions | Every seeded Work Item resolves Organization, Team, Project, Module, and Work Item sources with versions and snapshot hash | Automated |
| AC-06 | Real branch, commit, PR, and Artifact manifest submit successfully | GitHub verifier happy path is automated; a real owner Submission is pending | Partial |
| AC-07 | Fabricated or mismatched Git evidence is rejected | SHA/PR/branch/path adapter rejection tests pass and rejected commands are audited | Automated |
| AC-08 | Owner cannot self-review; configured Reviewer can decide | Domain and API lifecycle tests pass | Automated |
| AC-09 | Acceptance, not Submission, unlocks dependents | Domain transition test passes | Automated |
| AC-10 | Signed merge Webhook plus API verification integrates work | Webhook handler test passes; public signed ping is live; real merged PR delivery is pending | Partial |
| AC-11 | Six Integrated items complete the Requirement | Requirement completion transition is implemented and automated for the terminal invariant; six-item live flow is pending | Partial |
| AC-12 | Successful and rejected actions appear as ordered events | Success, rejection, reason code, correlation ID, and persistence tests pass; dashboard timeline renders them | Automated |
| AC-13 | Restart preserves identities, state, evidence, events, and policies | Deployed containers were restarted with workflow state and Webhook inbox preserved; Agent Run persistence was added afterward and needs a new live restart | Partial |
| AC-14 | Browser/API use Tailscale; PostgreSQL has no host port | Control plane is live on the Tailscale address; Compose has no DB port mapping; public edge exposes only the Webhook route | Live |
| AC-15 | Fresh Codex session completes owner/reviewer flow with Skill only | Installed Skill has executed `whoami`, `list`, and `policy` as Alice; complete owner/reviewer flows on separate sessions are pending | Partial |
| AC-16 | Invalid signature changes no trusted state | Automated raw-body test and live public `401 INVALID_SIGNATURE` capture exist | Live |
| AC-17 | Delivery replay is exactly once | Delivery-ID deduplication is automated; a captured live redelivery comparison is pending | Partial |
| AC-18 | Reconciliation recovers a missed merge exactly once | Reconciliation and idempotent Integration tests pass; deployed missed-delivery exercise is pending | Partial |

## Deliverables

| # | Deliverable | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Central Web/API, workflow, policy, GitHub verification, events, dashboard | `src/`, API and dashboard tests | Present |
| 2 | PostgreSQL schema/migrations and idempotent seed | `src/postgres.js`, `src/seed.js`, persistence tests | Present for PoC |
| 3 | `team-workflow` Codex Skill | Skills repository `skills/in-progress/team-workflow/SKILL.md` | Present locally; remote publication pending |
| 4 | Deterministic CLI | Skill `scripts/workflow.mjs` with account-scoped idempotency keys | Present; full live flow pending |
| 5 | Control-plane containers | `Dockerfile`, `docker-compose.yml`, deployed healthy services | Live |
| 6 | TLS Webhook edge | `deploy/traefik/workflow-hook.yml`, valid certificate and GitHub hook | Live |
| 7 | Sanitized Account configuration examples | `examples/accounts/*.env.example` | Present |
| 8 | Automated unit/API/persistence/GitHub/Webhook/CLI/browser tests | Unit/API suites and dashboard HTML contract exist; isolated CLI and real browser automation are pending | Partial |
| 9 | End-to-end demonstration runbook | `docs/RUNBOOK.md` | Present |
| 10 | AC-01 through AC-18 acceptance report | This document | Present; live evidence incomplete |

## Current verification commands

```bash
npm test
npm run test:coverage
npm audit --audit-level=high --registry=https://registry.npmjs.org
docker compose --env-file .env.example config --quiet
```

Do not change a row to Live based only on a health response, mocked GitHub data, or multiple Accounts sharing one local Agent session. Attach sanitized request timestamps, event IDs, commit SHAs, PR URLs, Webhook delivery IDs, and screenshots from the runbook execution.
