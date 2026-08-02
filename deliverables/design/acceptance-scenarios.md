# DES-002: Executable acceptance scenarios

These scenarios use the seeded `REQ-001` graph and six independent Account tokens. API responses, Activity Event IDs, commit SHAs, PR URLs, and Webhook delivery IDs are captured as evidence.

## Identity and authorization

```gherkin
Scenario Outline: A virtual Account sees only role-eligible work
  Given a fresh client configured with the token for <account>
  When the client runs whoami and list
  Then the authenticated identity is <account>
  And every returned Work Item requires <role>

Examples:
  | account | role      |
  | alice   | designer  |
  | bob     | designer  |
  | carol   | developer |
  | dave    | developer |
  | erin    | tester    |
  | frank   | tester    |
```

## Atomic ownership and dependencies

```gherkin
Scenario: Concurrent claim has one winner
  Given DES-001 is Ready
  When Alice and Bob claim DES-001 concurrently with different account-scoped idempotency keys
  Then exactly one request succeeds
  And DES-001 has exactly one Accountable Owner
  And the rejected request records one ActionRejected event

Scenario: Submission alone does not unlock development
  Given DES-001 and DES-002 are Submitted
  Then DEV-001 and DEV-002 remain Blocked
  When both design Work Items are Accepted by their configured reviewers
  Then DEV-001 and DEV-002 become Ready
```

## Guidance and Agent Run

```gherkin
Scenario: Starting work snapshots five guidance levels
  Given Alice owns DES-001 on a conforming Git branch
  When Alice retrieves policy and starts DES-001 with Codex
  Then the sources contain Organization, Team, Project, Module, and Work Item in order
  And every source has an ID and version
  And the Agent Run stores the snapshot hash, repository, branch, Account, and Agent type
```

## Git evidence and review

```gherkin
Scenario: Valid evidence becomes Submitted
  Given an owner PR targets the configured base repository and branch
  And its head contains the declared commit and every Artifact path
  When the owner submits the evidence manifest
  Then GitHub facts are captured at verification time
  And the Work Item becomes Submitted

Scenario Outline: Invalid evidence is rejected
  Given the Submission contains <fault>
  When the owner submits it
  Then the Work Item remains In Progress
  And one rejected audit event records INVALID_EVIDENCE

Examples:
  | fault                         |
  | a fabricated commit SHA       |
  | an unrelated pull request     |
  | a mismatched head branch      |
  | an unchanged Artifact path    |

Scenario: Review is independent
  Given a Work Item is Submitted
  When its owner attempts to accept it
  Then the command is rejected with SELF_REVIEW
  When the configured reviewer accepts it with a note
  Then the Work Item becomes Accepted
```

## Webhook, reconciliation, and completion

```gherkin
Scenario: Signed merge integrates accepted work exactly once
  Given an Accepted Work Item references a merged PR
  When a correctly signed pull_request delivery is received twice with one delivery ID
  Then the delivery is stored once
  And GitHub API verification runs before Integration
  And one TaskIntegrated event records the merge commit

Scenario: Reconciliation repairs a missed delivery
  Given an Accepted Work Item PR was merged without a received delivery
  When scheduled reconciliation checks nonterminal Submissions
  Then the Work Item becomes Integrated through the same idempotent path

Scenario: Requirement completion is derived
  Given five required Work Items are Integrated and one is Accepted
  Then REQ-001 remains In Progress
  When the final Work Item is Integrated
  Then REQ-001 becomes Completed
  And the Activity Event timeline reconstructs the transition
```

## Persistence and network

```gherkin
Scenario: Restart preserves workflow truth
  Given users, Agent Runs, evidence, events, policy snapshots, and deliveries exist
  When both containers restart
  Then authenticated reads return the same values and counts

Scenario: The public edge rejects unsigned traffic
  When an unsigned JSON request reaches the public Webhook URL
  Then it returns 401 INVALID_SIGNATURE
  And no trusted delivery or workflow event is persisted
```
