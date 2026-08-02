# DES-001: Local-agent collaborative delivery design

## Problem

Product, development, and test specialists use separate local AI agents, but their work has no shared, authoritative lifecycle. Chat transcripts cannot prove ownership, review, repository evidence, dependency readiness, or completion. A reusable solution must coordinate humans without centralizing their Agent runtimes or collecting prompts and source contents.

## Solution

Use three authorities with explicit boundaries:

1. PostgreSQL owns Requirements, Work Items, role-gated transitions, Agent Runs, guidance snapshots, idempotency records, and append-only Activity Events.
2. GitHub owns versioned Artifacts, commits, pull requests, reviews, and merge facts. The control plane accepts references only after read-only API verification.
3. Local Codex owns task execution. The `team-workflow` Skill and deterministic CLI discover, claim, start, submit, and review work through the control-plane protocol.

The control plane resolves guidance from Organization, Team, Project, Module, and Work Item scopes. A start command stores the exact resolved snapshot on an Agent Run. Submission, Acceptance, and Integration remain distinct. Acceptance unlocks dependencies; a verified merge integrates accepted work. Signed Webhooks provide prompt notification and periodic reconciliation repairs missed delivery.

The protocol is vendor-neutral at the domain boundary: company names, Accounts, Roles, Work Items, policies, and repository coordinates are data. GitHub and Codex are first-version adapters.

## Risks

- A forged self-report could bypass repository truth. Mitigation: verify the repository, PR target, branch, commit membership, changed Artifact paths, and later merge through GitHub's API.
- Concurrent commands could create duplicate ownership or events. Mitigation: atomic state persistence, account-scoped idempotency keys, serialized single-instance commands, PostgreSQL version checks, and Webhook delivery deduplication.
- A policy edit could rewrite history. Mitigation: store source versions and a content hash on each Agent Run and Submission.
- Public webhook exposure increases attack surface. Mitigation: expose only one TLS path, validate the raw-body HMAC before parsing, keep application/API routes on Tailscale, and expose no PostgreSQL host port.
- Workflow metrics could become employee surveillance. Mitigation: retain task-flow metadata only; exclude prompts, model output, token counts, rankings, and uncommitted source.

## Boundaries

The PoC includes six virtual human Accounts, one fixed design-to-development-to-test graph, Codex, public GitHub, a private control plane, and a public signed Webhook edge. Production multi-tenancy, SSO, arbitrary workflow design, automatic merge, high availability, and employee scoring are excluded.

## Acceptance boundary

The design is accepted only when an independent Designer confirms that it:

- preserves separate human ownership and local Agent execution;
- makes dependency, role, review, and evidence invariants explicit;
- identifies PostgreSQL and GitHub authority without trusting Webhook payloads alone;
- resolves and snapshots all five guidance levels;
- defines privacy and portability boundaries;
- can be exercised by the executable scenarios in `DES-002`.
