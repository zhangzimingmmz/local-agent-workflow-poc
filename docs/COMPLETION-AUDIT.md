# PoC completion audit

Updated: 2026-08-03

## Verdict

The technical PoC is implemented, deployed, and repeatably verifiable. The strict completion definition in `GOALS.md` is **not yet satisfied** because the isolated rollout has not been executed by humans on two or more workstations with separate fresh Codex sessions.

This distinction is deliberate:

- the completed instance on `100.64.0.5:8088` proves the six-account GitHub, review, Webhook, reconciliation, persistence, and dashboard path;
- the isolated instance on `100.64.0.5:8089` is ready for the required two-workstation human rollout and has intentionally not been advanced;
- server-side automation, one shared Codex workspace, or six credentials on one machine are not accepted as substitutes for the human rollout.

No Account token, GitHub token, or Webhook secret is included in this report.

## Evidence snapshot

| Evidence | Direct observation |
| --- | --- |
| Deployed application revision | `591d7de` in both deployed application directories |
| CI | GitHub Actions run `30765060292` completed successfully for `591d7de`, including Chromium installation and browser E2E |
| Local verification | 69/69 unit/integration tests and 1/1 Playwright Chromium E2E passed; coverage 92.52% statements, 83.73% branches, 88.23% functions, and 92.52% lines |
| Dependency audit | `npm audit --audit-level=high` reported 0 vulnerabilities |
| Deployment configuration | `docker compose --env-file .env.example config --quiet` passed |
| Completed instance | healthy; `completed | 6 tasks | 38 events | 6 runs | 0 session evidence | 14 deliveries`; historical events are not backfilled |
| Rollout instance | healthy; `in_progress | 6 tasks | 0 events | 0 runs | 0 sessions | 0 deliveries`; six Account files carry the two configured Workstation assignments but no persisted Session ID |
| Browser observation, completed instance | `REQ-001` Completed; six Integrated cards in Designer, Developer, and Tester lanes; verified Git evidence; five guidance versions; 38 ordered events; active, queue, and review metrics |
| Browser observation, rollout instance | two design items Ready; four downstream items Blocked with explicit dependency reasons; no evidence/events yet; initial Queue and Blocked durations increase from persisted creation facts |
| Public/private boundary | user API remains on Tailscale; the public domain exposes the GitHub Webhook path; PostgreSQL has no host port mapping |

The browser-control environment could not navigate the `100.64` address directly. The read-only browser check used a temporary `127.0.0.1` SSH forward over Tailscale; the forward was closed immediately afterward. Direct `curl` health checks against both Tailscale URLs also passed.

## Completion-definition audit

| Required clause | Status | Evidence or remaining proof |
| --- | --- | --- |
| Two or more human-operated machines | **Open** | Workstation A and B have not yet completed the rollout |
| Separate virtual Accounts and fresh local Codex sessions | **Open** | Six technical identities are proven, but not six fresh human sessions split across two machines |
| One Requirement traverses design, development, testing, Acceptance, and Integration | **Live technical proof** | Completed instance has six Integrated Work Items and `RequirementCompleted`; must be repeated on the rollout instance by humans |
| All Artifacts are stored in GitHub | **Live** | Completed run produced PRs #1 through #6 and declared Artifact paths |
| Signed Webhooks and reconciliation maintain verified evidence exactly once | **Live + automated** | Signed deliveries, replay deduplication, API re-verification, and missed-merge reconciliation are captured and tested |
| Dashboard reconstructs the delivery flow from Activity Events | **Live** | Real browser observation shows requirement, lanes, dependency state, evidence, guidance, metrics, and 38 ordered events |
| Every acceptance criterion has repeatable evidence | **Partial** | AC-01 through AC-14 and AC-16 through AC-18 have technical evidence; AC-15 still lacks the required human rollout evidence |

## Acceptance-criterion audit

Status meanings:

- **Live proven**: observed in the deployed system with real GitHub or database evidence.
- **Automated + deployed**: covered by the passing suite and present in the deployed revision, but the newest behavior has not been exercised through a fresh live mutation.
- **Human rollout open**: only the prescribed human workstations can provide the missing evidence.

| Criterion | Status | Evidence and limits |
| --- | --- | --- |
| AC-01 | Live + automated | Six hashed-token Accounts completed distinct Owner and Reviewer actions. Role Assignments are first-class records, may coexist on one Account, match Organization through Work Item scopes, and are recorded by identity on new events; old single-role snapshots normalize to deterministic Project assignments. |
| AC-02 | Live + browser E2E | Browser shows `REQ-001`, all six top-level Work Items, three role lanes, owners/reviewers, and dependencies. The maintained Chromium E2E executes a child split and verifies the visible `Parent` relation without mutating either deployed database. |
| AC-03 | Live proven | Concurrent `DES-001` claims yielded one Owner and one `INVALID_STATE` rejection. |
| AC-04 | Live proven | Rollout browser shows all developer/tester work Blocked before design Acceptance; claim rejection and unlock rules are automated. |
| AC-05 | Live proven | Expanded browser evidence shows Organization, Team, Project, Module, and Work Item guidance at version 1; all six Agent Runs persist source versions and snapshot hashes. |
| AC-06 | Live proven | Six public GitHub PRs, commits, branches, and Artifact manifests passed authoritative verification. |
| AC-07 | Live + automated | Live `INVALID_EVIDENCE` rejection exists; tests cover wrong repository, PR facts, branch, commit membership, and Artifact path. Trusted configured-Project enforcement is newly automated + deployed rather than freshly mutated on the rollout. |
| AC-08 | Live proven | A live self-review rejection and six cross-account acceptances are ordered in the event history. |
| AC-09 | Live proven | Live `TaskUnblocked` events follow Acceptance, and the untouched rollout visibly remains Blocked. |
| AC-10 | Live proven | Accepted work was integrated only after signed merge delivery or reconciliation plus GitHub API verification. |
| AC-11 | Live proven | Six Integrated Work Items produced `RequirementCompleted` for `REQ-001`. |
| AC-12 | Live + automated | Browser and PostgreSQL show 38 ordered success/rejection events. New local actions carry Account, Role Assignment, Agent type, Workstation ID, Agent Session ID, hierarchy, Git, and guidance context; old events are not retroactively rewritten. An authenticated `start` whose Effective Guidance resolution is rejected records one idempotent `ActionRejected` without changing the Work Item. Invalid bearer credentials remain outside trusted workflow events because they cannot be bound to an Account or Role Assignment. |
| AC-13 | Live proven | Restart preserved the completed fingerprint; backup/restore was also verified in an isolated database. Both current instances survived deployment of `591d7de` without state changes. |
| AC-14 | Live proven with noted browser path | Direct Tailscale health checks pass; browser content was verified through a temporary SSH-over-Tailscale loopback forward; database is container-private and only the Webhook route is public. |
| AC-15 | **Human rollout open; evidence path deployed** | Skill discovery, CLI behavior, status lookup, session-scoped idempotent retry, Account-to-Workstation binding, session-conflict rejection, and a two-Workstation Owner/Reviewer browser flow are automated and deployed. The isolated rollout still requires the prescribed humans to create the fresh sessions. |
| AC-16 | Live proven | Invalid/missing signature returns `401 INVALID_SIGNATURE` before trusted persistence; raw-body behavior is automated. |
| AC-17 | Live proven | One delivery ID returned first-seen then duplicate and produced one stored processing result. |
| AC-18 | Live + automated | A missed merge was reconciled exactly once in the completed run; recovery and idempotency tests pass. |

## Deliverable audit

| # | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 1 | Central Web/API application | Present + live | Workflow engine, policy resolver, GitHub verification, event log, dashboard, status lookup, and split/assign endpoint |
| 2 | Schema, migrations, and seed data | Present + live | PostgreSQL snapshot/event/inbox storage and six-Account Northstar seed |
| 3 | `team-workflow` Codex Skill | Present locally and project-local | Source is on the unpushed `codex/team-workflow-poc` branch at `f7c1d09` by design; rollout repository contains a discoverable `.agents/skills/team-workflow/` copy |
| 4 | Deterministic CLI | Present + tested | Includes `status` and `split` in addition to the required owner/reviewer lifecycle |
| 5 | Container deployment | Present + live | Two isolated healthy application/database stacks on the control-plane host |
| 6 | TLS Webhook edge | Present + live | Public edge forwards only `/webhooks/github` to the private control plane |
| 7 | Sanitized Account examples | Present | Real rollout credentials remain server-side with mode `600` and are not copied into this report |
| 8 | Automated tests | Present | 69 unit/integration tests plus one maintained Playwright Chromium E2E cover the scoped owner/reviewer flow, two Workstations, distinct Agent Sessions, child decomposition, role lanes, dependency blocking, verified evidence, guidance versions, events, and metrics. CI retains the HTML report, screenshot, and trace on failure. |
| 9 | Demonstration runbook | Present | `RUNBOOK.md` covers the technical demo; `ROLLOUT.md` covers the strict two-workstation proof |
| 10 | Acceptance report | Present | `ACCEPTANCE.md`, the test deliverable, and this stricter audit map evidence to AC-01 through AC-18 |

## Capabilities added after the completed six-item run

These are in GitHub `main`, CI, and both deployed instances:

1. Unified `GET /api/v1/status/:id` and CLI `status <requirement-or-work-item-id>`.
2. Submission event envelopes with hierarchy, Role Assignment, Agent, Git, guidance versions, and snapshot hash.
3. Active, Queue, Review, and Blocked flow metrics, including initial Ready/Blocked intervals persisted at creation.
4. Server-configured trusted Project repository and base-branch enforcement.
5. Owner-controlled child Work Item split and eligible-role assignment with inheritance, dependency separation, idempotency, and audit events.
6. Multiple authoritative Role Assignments per Account, scoped from Organization through Work Item, with exact assignment identity in new Activity Events and legacy snapshot compatibility.
7. A maintained Playwright Chromium E2E and CI gate that executes a scoped owner/reviewer flow and proves child-parent visibility on the dashboard.
8. Idempotent `ActionRejected` persistence when authenticated `start` fails during Effective Guidance resolution, without changing the Work Item.
9. Opaque local execution evidence on every CLI action: Account-bound Workstation IDs, fresh Agent Session IDs, cross-context conflict rejection, session-scoped retries, and dashboard counts derived from Activity Events.

The rollout repository intentionally remains on its older application-feature baseline because its human Requirement is to implement the status capability through the workflow. The rollout control plane itself runs the current orchestration application.

## Known gaps and boundaries that should not be hidden

1. **Human rollout:** the only strict completion blocker. Workstation A must operate Alice, Carol, and Erin; workstation B must operate Bob, Dave, and Frank. Each Account needs its own clone and fresh Codex session.
2. **Audit trust boundary (not an implementation gap):** authenticated, Work Item-bound policy rejections carrying an `Idempotency-Key` are persisted as append-only Activity Events. Invalid bearer authentication is not admitted to the trusted workflow event stream because no Account or Role Assignment can be established; it remains an HTTP/security-log concern.
3. **Newest live mutation evidence:** trusted-repository enforcement, enriched event envelopes, child splitting, multiple scoped Role Assignments, and local Agent Session evidence are tested and deployed. A live partial-context request was rejected before workflow mutation and left the rollout at zero events; valid session evidence is intentionally awaiting the human rollout. Historical completed events are not backfilled.
4. **Legacy timing history:** the completed snapshot predates persisted task creation timestamps, so its initial Blocked duration cannot be reconstructed exactly and the dashboard correctly shows `No data`. Newly seeded and dynamically split work persists the necessary facts; the rollout instance visibly reports both initial Queue and Blocked time.

## Exact remaining acceptance run

Follow `ROLLOUT.md` without resetting either database:

1. Transfer only the three assigned Account files to each real workstation through a secure channel.
2. Use one separate clone and one fresh Codex session per Account; close the session before switching Accounts.
3. Complete and cross-review `DES-001` and `DES-002`, then merge them.
4. Complete and cross-review `DEV-001` and `DEV-002`, then merge them.
5. Complete, review, and merge `TST-001`; then complete, review, and merge `TST-002`.
6. Preserve session-level facts without prompts: Account, Work Item, Agent Run ID, guidance snapshot, branch, commit, PR, Artifact paths, review result, merge SHA, and ordered events.
7. Confirm the rollout dashboard shows six Integrated Work Items, `REQ-001` Completed, six Accounts, exactly two Workstations, and at least twelve distinct Owner/Reviewer Agent Sessions while the completed instance fingerprint remains unchanged.
8. Attach the two-workstation evidence to the acceptance report. Only then mark AC-15 and the overall completion definition complete.

Until that run finishes, the accurate project status is: **technical PoC ready; strict multi-workstation human acceptance pending**.
