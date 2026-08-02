# Demonstration runbook

This runbook carries the seeded `REQ-001` requirement through design, development, testing, review, and GitHub integration. Use a separate local clone and Codex session for each virtual Account. Never share account environment files.

## Prepare each workstation

1. Clone or fork the public repository and install the `team-workflow` Skill.
2. Load only that Account's environment file without printing it.
3. Invoke `team-workflow`; run `whoami`, `list`, and `policy <work-item-id>`.
4. Preserve command output, commit SHA, pull-request URL, and the resulting Activity Event IDs in the acceptance report.

The client derives stable account-scoped idempotency keys for every state-changing command. Retry the identical command after a network failure; do not alter inputs merely to force a transition.

## Stage 1: parallel design

| Owner | Work Item | Reviewer | Required Artifact |
| --- | --- | --- | --- |
| Alice | `DES-001` | Bob | `deliverables/design/problem-solution.md` |
| Bob | `DES-002` | Alice | `deliverables/design/acceptance-scenarios.md` |

Each owner runs `claim`, `policy`, creates `work/<id>-<slug>`, then runs `start`. Commit the Artifact, push after human approval, open a PR to `main`, and run `submit`. The other Designer reviews and accepts. Confirm that neither development item becomes Ready after Submission alone, and both become Ready after both design items are Accepted.

Merge accepted PRs. Wait for the signed Webhook or reconciliation and confirm both design items are Integrated.

## Stage 2: parallel development

| Owner | Work Item | Reviewer | Required Artifact |
| --- | --- | --- | --- |
| Carol | `DEV-001` | Dave | source, migration, and tests |
| Dave | `DEV-002` | Carol | Skill instructions and deterministic CLI |

Repeat the owner and reviewer flow. Capture the executed test commands and coverage result in each PR. Confirm tester work remains Blocked until both development items are Accepted, then merge and verify Integration.

## Stage 3: testing and final acceptance

Erin owns `TST-001`; Frank reviews it. Store automated workflow results and an evidence manifest under `deliverables/test/`. After it is Accepted and Integrated, Frank owns `TST-002`; Erin reviews the human-readable acceptance report.

Merge the final accepted PR and confirm:

- all six Work Items are Integrated;
- `REQ-001` is Completed;
- each Submission contains verified Git evidence and a guidance snapshot;
- the dashboard timeline contains distinct Submitted, Accepted, and Integrated events;
- replaying a captured Webhook delivery and a client command creates no duplicate event.

## Negative and recovery checks

Before finishing, capture repeatable evidence for: concurrent claim conflict, blocked claim, self-review rejection, fabricated SHA rejection, invalid signature rejection, delivery replay, restart persistence, and reconciliation after a deliberately omitted merge delivery.

Do not reset production data to repeat the demonstration. Restore a backup into an isolated Compose project or reseed a fresh instance.
