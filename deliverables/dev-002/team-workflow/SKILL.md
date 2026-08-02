---
name: team-workflow
description: Claim, execute, submit, and review role-gated work through the local-agent workflow control plane.
---

# Team Workflow

Act for the authenticated human Account. PostgreSQL owns workflow truth, GitHub owns versioned Artifacts and evidence, and Codex runs locally. Never equate local completion with Acceptance or Integration.

Use `workflow.mjs`; never print `TEAM_WORKFLOW_TOKEN` or hand-build supported HTTP mutations.

## Owner flow

1. Run `whoami`, `list`, and `show <id>`.
2. Run `claim <id>` and stop on a role, state, or dependency rejection.
3. Run `policy <id>`. Apply sources in Organization → Team → Project → Module → Work Item order and preserve the returned versions.
4. Create the required `work/<id>-<slug>` branch without overwriting unrelated changes.
5. Run `start <id>` to record the Codex Agent Run, branch, and server-resolved guidance snapshot.
6. Produce the role-specific Artifact and execute every required check.
7. Commit the Work Item scope. Obtain human approval before pushing or opening a PR.
8. Run `submit <id> --pr <url> --artifact <kind:path>` for every Artifact path.

Report the result as Submitted only. A different configured Reviewer must accept it, and a GitHub-verified merge must integrate it.

## Role practices

- Designer: record problem, solution, risks, boundaries, and executable acceptance scenarios.
- Developer: use test-driven development; keep source, migrations, tests, and executed checks together.
- Tester: distinguish observed evidence from conclusions and keep automated results plus a human-readable report.
- Reviewer: inspect policy, diff, checks, PR facts, and Artifact paths; never review owned work.

## Review flow

Run `show <id>` and `policy <id>`, inspect the GitHub PR and checks, then use exactly one:

```text
review <id> --accept --note <text>
review <id> --reject --note <recovery-action>
```

## Recovery

Retry an identical command after a network failure. The CLI derives a stable idempotency key from non-secret command inputs, and the server scopes that key to the authenticated Account. On `IDEMPOTENCY_CONFLICT`, `INVALID_STATE`, `INVALID_EVIDENCE`, or an authorization error, inspect current state and correct the cause instead of forcing a transition.
