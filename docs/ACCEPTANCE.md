# PoC acceptance report

Updated: 2026-08-03

This report distinguishes implemented behavior from live, repeatable demonstration evidence. `Automated` means the repository test suite proves the contract in isolation. `Live` means the deployed control plane, public GitHub repository, and network path have produced the evidence. The six-item technical Requirement is complete. The separate two-human-machine Codex rollout exercise remains open and is not inferred from server logs. See the [completion audit](./COMPLETION-AUDIT.md) for the stricter clause-by-clause audit and known gaps.

## Acceptance criteria

| Criterion | Required evidence | Current evidence | Status |
| --- | --- | --- | --- |
| AC-01 | Six independent Accounts authenticate and receive role-gated actions | Alice, Bob, Carol, Dave, Erin, and Frank used separate credentials for their assigned Owner/Reviewer actions; scoped multi-role Role Assignment filtering is automated and legacy snapshots migrate in memory | Live + automated |
| AC-02 | Six Work Items, parent Requirement, and dependency graph are visible | Dashboard and seed tests show the Requirement, children, dependencies, responsibility, and blocking reasons; a maintained Chromium E2E splits a child and verifies its visible parent relation; the live dashboard reconstructed all six top-level items | Live + browser E2E |
| AC-03 | Concurrent claim has exactly one winner | Overlapping Alice/Bob `DES-001` claims produced one Owner (`evt-1`) and one `INVALID_STATE` rejection (`evt-2`) | Live |
| AC-04 | Blocked developer/tester cannot claim before Acceptance | Developer items remained visibly Blocked after design Submission and moved Ready only after both Acceptances; state rejection is automated | Live + automated |
| AC-05 | Five-scope guidance includes exact source versions | Agent Runs `run-1` through `run-6` each store Organization, Team, Project, Module, and Work Item sources, versions, and snapshot hash | Live |
| AC-06 | Real branch, commit, PR, and Artifact manifest submit successfully | PRs #1 through #6 submitted verified commits, branches, targets, and declared Artifact paths | Live |
| AC-07 | Fabricated or mismatched Git evidence is rejected | Live `TST-001` mismatched evidence produced `evt-28 INVALID_EVIDENCE` and stayed In Progress; adapter negative tests also pass | Live + automated |
| AC-08 | Owner cannot self-review; configured Reviewer can decide | Alice self-review produced `evt-8 SELF_REVIEW`; all six configured cross-role reviews then succeeded | Live |
| AC-09 | Acceptance, not Submission, unlocks dependents | Developer list remained Blocked after design Submission; `evt-11`, `evt-12`, `evt-23`, and `evt-31` show Acceptance-driven unlocks | Live |
| AC-10 | Signed merge Webhook plus API verification integrates work | Signed GitHub merge deliveries were processed, GitHub API facts were confirmed, and every accepted item received one `TaskIntegrated` event | Live |
| AC-11 | Six Integrated items complete the Requirement | All six items are Integrated and `evt-38 RequirementCompleted` set `REQ-001` to Completed | Live |
| AC-12 | Successful and rejected actions appear as ordered events | The dashboard and PostgreSQL contain 38 ordered success/rejection events with correlation and reason data; new local actions also carry opaque Workstation and Agent Session context without backfilling history | Live + automated |
| AC-13 | Restart preserves identities, state, evidence, events, and policies | Before/after restart fingerprint was identical: version 34, Completed, 6 tasks, 38 events, 6 Agent Runs, 14 deliveries; backup restored identically into an isolated database | Live |
| AC-14 | Browser/API use Tailscale; PostgreSQL has no host port | Control plane is live on the Tailscale address; Compose has no DB port mapping; public edge exposes only the Webhook route | Live |
| AC-15 | Fresh Codex session completes owner/reviewer flow with Skill only | The Skill/CLI requires a configured Workstation and fresh Session ID, uses session-scoped idempotency, and the browser E2E reconstructs distinct Owner/Reviewer sessions across two Workstations; independent fresh human Codex sessions remain open | Automated + deployed; human rollout open |
| AC-16 | Invalid signature changes no trusted state | Automated raw-body test and live public `401 INVALID_SIGNATURE` capture exist | Live |
| AC-17 | Delivery replay is exactly once | Signed delivery `acceptance-replay-001` returned `duplicate:false` then `duplicate:true`; one row exists with one attempt | Live |
| AC-18 | Reconciliation recovers a missed merge exactly once | One design merge missed immediate Integration and reconciliation later produced only `evt-14`; automated recovery tests also pass | Live + automated |

## Deliverables

| # | Deliverable | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Central Web/API, workflow, policy, GitHub verification, events, dashboard | `src/`, API and dashboard tests | Present |
| 2 | PostgreSQL schema/migrations and idempotent seed | `src/postgres.js`, `src/seed.js`, persistence tests | Present for PoC |
| 3 | `team-workflow` Codex Skill | Skills repository `skills/in-progress/team-workflow/SKILL.md`; public demonstration copy in PR #3 | Present; upstream skills publication intentionally not performed |
| 4 | Deterministic CLI | Skill `scripts/workflow.mjs`; six live role flows and ambiguous-result retry completed | Live |
| 5 | Control-plane containers | `Dockerfile`, `docker-compose.yml`, deployed healthy services | Live |
| 6 | TLS Webhook edge | `deploy/traefik/workflow-hook.yml`, valid certificate and GitHub hook | Live |
| 7 | Sanitized Account configuration examples | `examples/accounts/*.env.example` | Present |
| 8 | Automated unit/API/persistence/GitHub/Webhook/CLI/browser tests | 69 unit/integration tests plus one maintained Playwright Chromium E2E cover the scoped owner/reviewer lifecycle, two Workstations, distinct Agent Sessions, child parent relation, role lanes, blocking, evidence, guidance, events, and metrics; GitHub Actions passes | Present |
| 9 | End-to-end demonstration runbook | `docs/RUNBOOK.md` | Present |
| 10 | AC-01 through AC-18 acceptance report | This document and `deliverables/test/acceptance-report.md` | Present |

## Current verification commands

```bash
npm test
npm run test:coverage
npm run test:e2e
npm audit --audit-level=high --registry=https://registry.npmjs.org
docker compose --env-file .env.example config --quiet
```

The strict completion sentence still requires two or more human-operated workstations with separate fresh Codex sessions. This run established the complete technical path with six credentials and six branches from one Codex workspace; a team rollout should repeat the runbook on distinct machines and attach session-level evidence without collecting prompts.
