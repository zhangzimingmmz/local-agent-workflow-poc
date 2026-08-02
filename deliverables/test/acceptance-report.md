# TST-002: Independent acceptance report

Date: 2026-08-03  
Requirement: `REQ-001`  
Reviewer: Erin  
Conclusion: **Technical workflow accepted; distributed-human-session evidence remains a rollout exercise**

## Observed evidence

### Identity, roles, and ownership

All six virtual Accounts authenticated with separate local token files and executed their assigned role actions:

| Account | Role | Work Item activity |
| --- | --- | --- |
| Alice | Designer | owned `DES-001`, reviewed `DES-002` |
| Bob | Designer | owned `DES-002`, reviewed `DES-001` |
| Carol | Developer | owned `DEV-001`, reviewed `DEV-002` |
| Dave | Developer | owned `DEV-002`, reviewed `DEV-001` |
| Erin | Tester | owned `TST-001`, will review `TST-002` |
| Frank | Tester | reviewed `TST-001`, owns `TST-002` |

Alice and Bob issued overlapping `DES-001` claims. Event `evt-1` recorded Alice as the single owner and `evt-2` rejected Bob with `INVALID_STATE`. No duplicate ownership was observed. Alice's attempted self-review produced `evt-8` with `SELF_REVIEW` and no state advance.

### Layered guidance and Agent Runs

Agent Runs `run-1` through `run-6` record Codex, Account, repository, conforming branch, start time, rules, source IDs and versions, and a snapshot hash. Every run contains Organization, Team, Project, Module, and Work Item sources. Developer runs also contain the Module-level append-only event rule.

### GitHub evidence

| Stage | PR | Declared commit | Integration evidence |
| --- | --- | --- | --- |
| Design criteria | [#1](https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1) | `c433d2f7fb81bb619505bf9d4a099f4031da9e4d` | merge `1708b0191739429c304f59535f448648a208f26b` |
| Solution design | [#2](https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/2) | `9df568c2e1699a4a55df741a4a4165a65ec4c239` | merge `168e880a8bc79f9f839430b72d9ad96cace8ef3e` |
| Codex Skill/CLI | [#3](https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/3) | `c222bb55d21e60105f852a13c1beafcec41681b4` | merge `4ae9e96e1ed2ef284d47d7c579a3f8be9cdd1ad6` |
| Workflow schema | [#4](https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/4) | `a5f85fafb4c674253277c8f3a61c4e73645a9b03` | merge `096b0bf1977694e98b978d1ebfbfee839e9c674f` |
| E2E evidence | [#5](https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/5) | `104a8529a72ee4aacf70d2547c36a98d2558f2e8` | merge `e19bc341e1d34ba43dfddf15fb7e1b6131844ec9` |

The control plane verified each PR target, head branch, declared commit membership, and changed Artifact paths before recording Submission. A deliberately mismatched `TST-001` PR/branch/SHA request was rejected as `INVALID_EVIDENCE` in `evt-28`; `TST-001` remained In Progress until valid evidence was submitted.

### Dependency and state flow

- Design Submissions did not unlock development; the developer list still returned both items as Blocked.
- Cross-Acceptance produced `evt-11` and `evt-12`, moving both development items to Ready.
- Development Acceptance produced `evt-23`, moving `TST-001` to Ready.
- `TST-001` Acceptance produced `evt-31`, moving `TST-002` to Ready.
- Submitted, Accepted, and Integrated are distinct events for every completed item.

### Webhook integrity and recovery

The public TLS edge accepted signed GitHub `pull_request` deliveries and rejected unsigned traffic with `401 INVALID_SIGNATURE`. All recorded GitHub deliveries have status `processed` and one processing attempt.

One design merge was not integrated by its immediate processed delivery; scheduled reconciliation queried GitHub and produced exactly one later `TaskIntegrated` event (`evt-14`). This is positive live evidence for missed-delivery recovery.

A separately signed replay used delivery ID `acceptance-replay-001` twice. The responses were `duplicate:false` and `duplicate:true`; PostgreSQL contains one row with status `processed` and `attempts=1`.

### Automated checks and operations

`deliverables/test/automated-results.json` records 45 passing tests, all four coverage dimensions above 80%, and zero high/critical dependency vulnerabilities. GitHub Actions passed on PRs #1 through #5. The deployed health endpoint reports PostgreSQL readiness, the database has no published host port, and a pre-upgrade custom-format backup was stored with mode `600`.

## Conclusions

1. The control-plane protocol correctly coordinates independently authenticated role actions, preserves single ownership, enforces independent review, snapshots layered guidance, and derives dependency readiness.
2. GitHub references are not trusted as self-reports: invalid evidence is rejected, valid evidence is verified through GitHub, and Integration requires a confirmed merge.
3. Idempotent client commands, serialized persistence, delivery deduplication, and reconciliation cover the observed retry, concurrency, and lost-notification paths.
4. The event-backed dashboard can reconstruct ownership, blocking, evidence, rejection reasons, review, Integration, and aggregate flow metrics without collecting prompts or source contents.
5. The protocol and seed are not tied to xPulse. Company, role, hierarchy, Work Item, repository, and policy behavior are represented as data or adapters.

## Remaining rollout evidence

This technical demonstration used six isolated credentials and branches, but its commands were coordinated from one Codex workspace. The strict completion sentence in `docs/GOALS.md` additionally calls for two or more human-operated machines with separate fresh Codex sessions. That organizational exercise cannot be inferred from server logs and should remain an explicit rollout gate rather than being marked complete by this report.

No individual productivity ranking, prompt capture, token-count score, or uncommitted source telemetry was observed.
