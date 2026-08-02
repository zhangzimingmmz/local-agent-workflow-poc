# Local-Agent Collaborative Delivery PoC

## 1. Goal

Build a vendor-neutral proof of concept in which real people use Codex locally to complete parts of one shared requirement, while a central control plane coordinates work, resolves role-specific standards, verifies GitHub evidence, and makes the entire delivery flow observable.

The PoC must prove collaboration across people and roles. It is not a server-side multi-agent swarm: Codex runs on each user's machine, GitHub stores the deliverables, and the central service stores workflow truth and evidence verification results.

## 2. Decisions already fixed

| Area | PoC decision |
| --- | --- |
| Git provider | A public GitHub repository, using fork/branch/pull-request collaboration |
| Local agent | Codex only |
| Agent workflow | A `team-workflow` Skill in the current skills repository plus a deterministic CLI script |
| Organization | One fictional Organization with one Team and one Project |
| Accounts | Six fictional human Accounts: two designers, two developers, two testers |
| Network | Control plane through Tailscale; one public HTTPS path for GitHub Webhooks |
| Delivery stages | Design, development, and testing |
| Control-plane authority | PostgreSQL workflow state and append-only Activity Events |
| Artifact authority | GitHub repository content and GitHub-verified commit/PR facts |
| GitHub connectivity | Signed Webhooks for change notification; outbound API verification for authoritative facts and reconciliation |

The solution must not depend on xPulse or any company-specific internal platform. Provider- and company-specific behavior belongs behind configuration or adapters.

### Network roles

The two hosts have separate responsibilities:

```text
GitHub
  └── HTTPS POST https://<public-webhook-domain>/webhooks/github
          │
          v
<webhook-edge-host>                 public edge
  └── raw-body reverse proxy over Tailscale
          │
          v
<control-plane-host>                private control plane
  ├── signature verification and durable webhook inbox
  ├── Web/API, policy resolver, workflow engine, and dashboard
  └── PostgreSQL on a private container network
```

Only the GitHub Webhook path is public. User-facing Web/API routes remain available only through Tailscale. The edge preserves the original request body and GitHub headers; the control plane validates `X-Hub-Signature-256` before processing.

## 3. Questions the PoC must answer

The demonstration is successful only if it produces evidence for all of these questions:

1. Can six people use separate local Codex sessions to work on one Requirement without sharing an Agent runtime?
2. Can the Requirement be decomposed into independently owned Work Items and explicit Dependencies?
3. Can only an eligible role claim a Work Item, and can concurrent claims produce exactly one winner?
4. Can Codex retrieve the exact Organization-to-Work-Item guidance that applies to its current user and role?
5. Can every role store its Artifact on a Git branch and submit a commit and pull request as evidence?
6. Can the control plane reject fabricated or mismatched Git evidence instead of trusting self-reported completion?
7. Can a Reviewer distinguish Submitted, Accepted, and Integrated work?
8. Can blocked downstream work become ready automatically after the required upstream Acceptance?
9. Can managers observe flow efficiency and evidence quality without reading local Agent conversations or source code?
10. Can the same protocol later support other companies, repositories, roles, and local Agent products without changing the core domain model?

## 4. Fictional organization and users

The seed data uses the following hierarchy:

```text
Northstar Labs                       Organization
└── Product Delivery                 Team
    └── Agent Collaboration Demo     Project
        └── Workflow Core            Module
```

| Account | Role | Demonstration responsibility |
| --- | --- | --- |
| Alice | Designer | Own the problem statement and solution design |
| Bob | Designer | Own acceptance criteria and review Alice's design |
| Carol | Developer | Implement the central workflow capability |
| Dave | Developer | Implement the Codex Skill/CLI and review Carol's work |
| Erin | Tester | Implement and execute workflow acceptance tests |
| Frank | Tester | Independently verify evidence and publish the test report |

An Account represents a human even when Codex performs commands. The PoC may assign one Role to each Account, but the model must permit multiple scoped Role Assignments later.

## 5. Demonstration Requirement

The seeded Requirement is:

> As a delivery manager, I want local Codex users to complete a role-gated requirement through GitHub, so that I can verify ownership, evidence, dependencies, and delivery flow from one dashboard.

It is decomposed into six Work Items:

| Work Item | Owner role | Depends on | Required Artifact |
| --- | --- | --- | --- |
| `DES-001` Problem and solution design | Designer | None | Versioned design document |
| `DES-002` Acceptance criteria | Designer | None | Executable acceptance scenarios |
| `DEV-001` Central workflow capability | Developer | `DES-001`, `DES-002` accepted | Source, migration, and tests |
| `DEV-002` Codex Skill and CLI | Developer | `DES-001`, `DES-002` accepted | Skill instructions and CLI script |
| `TST-001` End-to-end workflow verification | Tester | `DEV-001`, `DEV-002` accepted | Automated results and evidence manifest |
| `TST-002` Independent acceptance report | Tester | `TST-001` accepted | Human-readable test report |

The graph demonstrates parallel design, parallel implementation, downstream blocking, independent review, and a final Requirement-level completion decision.

## 6. End-to-end user journey

1. A user opens the public GitHub repository or their fork and starts Codex in the local clone.
2. The user explicitly invokes the `team-workflow` Skill.
3. The Skill identifies the user through a local workflow token and requests eligible Work Items.
4. Codex claims one Work Item. The control plane atomically records the Accountable Owner.
5. Codex fetches Effective Guidance for the Organization, Team, Project, Module, Work Item, and role.
6. Codex confirms the repository, creates or checks out `work/<work-item-id>-<slug>`, and records an Agent Run.
7. The user and Codex produce the role-specific Artifact, validate it locally, commit it, push the branch, and open a pull request.
8. Codex submits the branch, commit SHA, pull-request URL, Artifact paths, checks, and guidance snapshot.
9. The control plane queries GitHub and records whether the evidence is verified. Invalid evidence leaves the Work Item in progress.
10. A different Account reviews the Submission and accepts or rejects it with a reason.
11. Acceptance unlocks dependent Work Items. Rejection returns the same Work Item to its owner with a new Activity Event.
12. A signed GitHub Webhook reports pull-request changes and merge. The control plane re-queries GitHub for authoritative facts before changing workflow state.
13. If a delivery is delayed or lost, scheduled reconciliation detects the mismatch without creating duplicate events.
14. When all required Work Items are Integrated, the Requirement becomes Completed.
15. The dashboard shows the Requirement graph, current responsibility, transitions, evidence, guidance versions, and aggregate timing metrics.

## 7. Workflow states and invariants

### Work Item state model

```text
Draft ── dependencies missing ──> Blocked
  │                                  │
  └── dependencies satisfied ──> Ready <── dependencies accepted
                                  │
                                  v
                              Claimed ──> In Progress ──> Submitted
                                             ^                │
                                             └── rejected ────┤
                                                              v
                                                          Accepted
                                                              │
                                                     verified merge
                                                              │
                                                              v
                                                          Integrated
```

### Required invariants

- A Work Item has exactly one Accountable Owner after claim.
- Claim is atomic; two eligible users cannot both win the same Work Item.
- Parent-child decomposition never implies execution order.
- Dependencies never imply containment.
- Only Accounts with the required Role Assignment may claim or review a Work Item.
- A Reviewer cannot accept their own Submission.
- A Work Item cannot be Submitted without at least one Artifact and verified Git Evidence.
- Submitted, Accepted, and Integrated are separate states and events.
- Acceptance can unlock Dependencies; a self-reported Submission cannot.
- A Requirement becomes Completed only after all required Work Items are Integrated.
- Every state-changing command is idempotent and emits one Activity Event for one successful change.
- Failed authorization, state, policy, or evidence checks emit an outcome suitable for audit without changing the Work Item.

Cancellation, reassignment after claim, dependency removal after execution begins, and partial integration are outside the first demonstration.

## 8. Standards and policies

### Scope order

Effective Guidance resolves in this order, from broadest to most specific:

```text
Organization → Team → Project → Module → Work Item
```

At each scope, common guidance applies first and role-specific guidance applies second. A more specific rule may override a broader rule only when the broader rule is marked overridable. Mandatory Organization rules cannot be weakened below Organization scope.

### PoC guidance examples

| Scope | Applies to | Example |
| --- | --- | --- |
| Organization | Everyone | Every submission must reference a public GitHub commit and PR |
| Team | Everyone | Branch names use `work/<work-item-id>-<slug>` |
| Project | Designer | Design Artifacts contain problem, solution, risks, and acceptance boundary |
| Project | Developer | Behavior changes use tests and report the executed checks |
| Project | Tester | Reports separate observed evidence from conclusions |
| Module | Developer | Workflow state changes preserve the append-only event record |
| Work Item | Assigned role | Task-specific Artifact paths and acceptance checks |

The control plane returns both the merged rules and their source IDs, versions, and content hashes. Each Agent Run and Submission stores that guidance snapshot so later policy edits do not rewrite history.

## 9. Codex Skill objective

The Skill is the local workflow entry point, not the workflow database. It must make correct behavior easier than manually constructing API requests.

The Skill must guide Codex to:

- authenticate without printing or committing the workflow token;
- discover eligible work before editing files;
- claim before starting and stop when the claim fails;
- fetch and display Effective Guidance before planning;
- verify the current repository and branch convention;
- select role-appropriate work practices;
- keep all Artifacts in the Git repository;
- run relevant local validation before submission;
- infer branch and commit facts from Git where safe;
- require explicit Artifact paths and pull-request evidence;
- submit metadata only, never source contents or local conversation transcripts;
- report rejection, policy, dependency, and verification failures with a recovery action.

The deterministic CLI surface should cover at least:

```text
whoami
list
show <work-item-id>
claim <work-item-id>
start <work-item-id>
policy <work-item-id>
submit <work-item-id> --pr <url> --artifact <kind:path>
review <work-item-id> --accept|--reject --note <text>
status <requirement-or-work-item-id>
```

The first version uses explicit Skill invocation because claim, submit, and review mutate shared state.

## 10. GitHub evidence and Webhook objective

Users push branches and create pull requests using their own local GitHub identity; the central service does not hold a write-capable GitHub token. The service consumes signed Webhooks for notification and performs read-only GitHub API calls to verify the resulting repository facts.

A valid Submission proves:

- the configured public base repository exists;
- the commit SHA exists in the submitted repository or fork;
- the pull request exists and targets the configured base repository and branch;
- the declared commit is included in the pull request;
- the submitted branch matches the pull request head branch;
- every declared Artifact path appears in the pull request's changed files;
- the pull request and commit facts are captured at verification time;
- a later integration check confirms the pull request was merged and identifies its merge commit.

The service must reject malformed URLs, absent commits, wrong repositories, unrelated pull requests, missing Artifact paths, and evidence that changed between verification and review.

Anonymous GitHub API access is sufficient for a small demonstration. An optional read-only token may be added through server configuration to raise rate limits, but it is never stored in the Skill or repository.

### Webhook processing requirements

- GitHub sends events to `https://<public-webhook-domain>/webhooks/github` using TLS.
- The edge proxies only that path and preserves the raw bytes, `X-Hub-Signature-256`, `X-GitHub-Event`, and `X-GitHub-Delivery` headers.
- The control plane rejects an absent or invalid signature before parsing or changing state.
- A valid delivery is durably stored before the endpoint acknowledges it.
- `X-GitHub-Delivery` is the idempotency key; redelivery produces one processing result and no duplicate Activity Event.
- The request endpoint acknowledges quickly and processes workflow consequences asynchronously.
- The PoC handles `ping` and `pull_request` events; unknown event types are recorded and ignored safely.
- A `pull_request` merge notification is not trusted alone. The worker retrieves the PR through GitHub's API before marking accepted work Integrated.
- Failed processing retains the delivery, attempt count, last error, and next retry time.
- Scheduled reconciliation compares nonterminal Submissions with GitHub and repairs a missed notification through the same idempotent event path.
- Webhook secrets remain only in server configuration and are never returned by an API, written to logs, or stored in the repository.

## 11. Observability objective

### Event record

Each Activity Event contains:

- event ID and correlation ID;
- Organization, Team, Project, Module, Requirement, and Work Item IDs;
- Account, Role Assignment, and Agent type;
- event type, prior state, resulting state, and outcome;
- repository, branch, commit, and pull-request references when applicable;
- Effective Guidance source versions and snapshot hash;
- server timestamp and optional client timestamp;
- rejection or failure reason using a stable reason code.

The platform does not collect prompts, model responses, uncommitted files, source file contents, or personal telemetry.

### Dashboard views

The PoC dashboard provides:

- Requirement progress and dependency graph;
- current Work Item state, owner, reviewer, and blocking reason;
- verified Artifacts and Git Evidence;
- chronological Activity Events;
- active-time, queue-time, review-time, and blocked-time summaries;
- submission acceptance and evidence-verification rates;
- rework count by stage and reason;
- guidance versions used by each Submission.

Metrics are intended to improve workflow design. The PoC must not present individual productivity rankings or use model token counts as a performance score.

## 12. Functional acceptance criteria

| ID | Observable result |
| --- | --- |
| `AC-01` | Six virtual Accounts can authenticate independently and see only actions permitted by their roles |
| `AC-02` | The seeded Requirement displays all six Work Items, owners, parent relations, and Dependencies |
| `AC-03` | Two simultaneous claims produce one success and one conflict without duplicate ownership |
| `AC-04` | A blocked developer or tester cannot claim work before the required Acceptance |
| `AC-05` | Codex can retrieve merged guidance with all five scope levels and exact source versions |
| `AC-06` | A valid public GitHub branch, commit, pull request, and Artifact manifest can be submitted |
| `AC-07` | A fabricated SHA, wrong PR, wrong branch, or undeclared changed path is rejected without advancing state |
| `AC-08` | An owner cannot review their own Submission; the configured Reviewer can accept or reject it |
| `AC-09` | Acceptance unlocks downstream work; Submission alone does not |
| `AC-10` | A signed GitHub merge delivery followed by API verification advances Accepted work to Integrated |
| `AC-11` | Completing all required Work Items advances the Requirement to Completed |
| `AC-12` | Every successful and rejected action is visible as a time-ordered Activity Event |
| `AC-13` | Restarting the containers preserves users, work state, evidence, events, and policy versions |
| `AC-14` | Browser and API are reachable through Tailscale while PostgreSQL has no host-exposed port |
| `AC-15` | A fresh Codex session can run the entire owner or reviewer flow using only the installed Skill and local configuration |
| `AC-16` | An absent or invalid GitHub signature is rejected without persisting a trusted event or changing work state |
| `AC-17` | Replaying one GitHub delivery ID produces one processing result and no duplicate Activity Event |
| `AC-18` | A missed merge delivery is recovered by reconciliation and reaches the same Integrated state exactly once |

## 13. Non-functional goals

- **Portability:** Organization names, roles, states, repository IDs, and guidance are seeded data or configuration, not product constants.
- **Security:** Tokens are stored locally outside Git, server tokens are hashed, and authorization is checked on every state-changing operation.
- **Privacy:** Only workflow metadata, evidence references, and validation outcomes leave the user's machine.
- **Reliability:** State changes and their Activity Events commit atomically; client retries are safe.
- **Traceability:** Every visible metric can be traced back to Activity Events.
- **Recoverability:** PostgreSQL data uses a dedicated local volume and can be backed up independently of existing services.
- **Network isolation:** User-facing services bind to Tailscale; the public edge exposes only the HTTPS Webhook path; PostgreSQL has no host-exposed port.
- **Webhook integrity:** Raw-body signature validation happens before JSON processing, delivery IDs are idempotent, and merge state is confirmed through GitHub's API.
- **Compatibility:** The local CLI runs with a maintained Node.js release on macOS and Linux, which covers the initial Codex users.

## 14. Explicitly out of scope

- Production-grade multi-tenant isolation, billing, quotas, or data residency.
- Enterprise SSO, SCIM, HR directory synchronization, or organization lifecycle management.
- GitLab, Bitbucket, Azure DevOps, or self-hosted forge adapters.
- Claude Code, Cursor, OpenHands, or server-hosted Agent execution.
- Autonomous task assignment, AI employee scoring, prompt surveillance, or model cost optimization.
- Automatic merging, branch protection administration, CI configuration, or write-capable GitHub automation.
- A general visual workflow designer or arbitrary BPMN execution.
- Offline multi-master operation and conflict resolution.
- Production alerting, high availability, disaster recovery, or compliance certification.

These exclusions keep the demonstration focused without preventing later adapters or production hardening.

## 15. Deliverables

1. A central Web/API application with persistent workflow state, policy resolution, GitHub verification, events, and dashboard.
2. Database schema, migrations, and idempotent seed data for Northstar Labs and the six Accounts.
3. A `team-workflow` Codex Skill in this skills repository.
4. A deterministic local CLI script bundled with the Skill.
5. Container definitions that deploy the application and a dedicated PostgreSQL instance to `<control-plane-host>`.
6. A minimal TLS Webhook edge configuration for `<webhook-edge-host>` that forwards only `/webhooks/github` over Tailscale.
7. Sanitized local configuration examples for each virtual Account.
8. Automated unit, API, persistence, GitHub-adapter, Webhook, CLI, and critical browser-flow tests.
9. A demonstration runbook that walks from the first design claim to Requirement completion.
10. An acceptance report mapping `AC-01` through `AC-18` to captured evidence.

## 16. Completion definition

The PoC is complete when two or more machines can use separate virtual Accounts and local Codex sessions to carry the seeded Requirement through design, development, testing, Acceptance, and Integration; all Artifacts are present in GitHub; signed Webhooks and API reconciliation maintain verified evidence exactly once; the dashboard reconstructs the flow from Activity Events; and every acceptance criterion has repeatable evidence.

A UI mock, a server health check, unverified status updates, or multiple Agents sharing one server process does not satisfy this definition.
