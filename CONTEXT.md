# Collaborative Delivery Workflow

This context describes how people use local AI agents to deliver one requirement through design, development, and testing while a central control plane records responsibility, state, policy, and verifiable Git evidence.

## Organization and work

**Organization**:
The tenant boundary representing one company and its governance rules.
_Avoid_: Company tenant, customer account

**Team**:
A group of people inside an Organization that shares delivery practices and a work queue.
_Avoid_: Workspace

**Project**:
A delivery boundary owned by a Team and connected to one or more Git repositories.
_Avoid_: Repository

**Module**:
A policy and ownership scope inside a Project, normally corresponding to a coherent product or code area.
_Avoid_: Folder, package

**Requirement**:
A user or business outcome delivered by several roles and completed only when all required Work Items are integrated.
_Avoid_: Task, ticket, story

**Work Item**:
The smallest independently assignable unit of delivery, with exactly one Accountable Owner.
_Avoid_: Requirement, job

**Parent-child relation**:
A decomposition relation in which a parent Work Item contains smaller Work Items; it does not determine execution order.
_Avoid_: Dependency

**Dependency**:
An execution constraint in which one Work Item is blocked until another reaches its required acceptance state.
_Avoid_: Parent task, subtask

## People and execution

**Account**:
A human identity recognized by the control plane. An Account may operate a local Agent but remains responsible for its actions.
_Avoid_: Agent, GitHub user

**Role Assignment**:
The authorization for an Account to perform one Role within one Organization, Team, Project, Module, Requirement, or Work Item scope. An Account may hold several Role Assignments, but each applies only to work inside its scope.
_Avoid_: Job title

**Accountable Owner**:
The single Account responsible for taking a Work Item from claim through submission.
_Avoid_: Assignee list

**Contributor**:
An Account that helps produce a Work Item without owning its final submission.
_Avoid_: Co-owner

**Reviewer**:
An Account other than the Accountable Owner that accepts or rejects a Submission.
_Avoid_: Approver when no review occurred

**Workstation**:
A human-operated local delivery environment identified by an opaque configured ID and used to run an Account's Agent Sessions.
_Avoid_: Control-plane host, Agent server

**Agent Session**:
One fresh local Codex session for one Account on one Workstation, identified by an opaque ID that is reported with its workflow actions.
_Avoid_: Login session, Agent Run

**Agent Run**:
One traceable execution of a Work Item inside an Agent Session, associated with a repository, branch, and Effective Guidance snapshot.
_Avoid_: Agent Session, user login

## Governance

**Standard**:
Versioned role-specific guidance that tells a person and their Agent how work should be performed and evidenced.
_Avoid_: Prompt, policy

**Policy**:
A versioned machine-enforceable rule that can allow, reject, or gate an action.
_Avoid_: Documentation, suggestion

**Effective Guidance**:
The ordered combination of Standards and Policies inherited from Organization, Team, Project, Module, and Work Item scopes for one role.
_Avoid_: Global prompt

## State and evidence

**Artifact**:
A deliverable produced by a Work Item and stored in Git, such as a design document, source change, test case, or test report.
_Avoid_: Commit, status update

**Git Evidence**:
Verified facts that connect a Submission to a repository, branch, commit, pull request, and declared Artifact paths.
_Avoid_: Artifact, user-provided URL

**GitHub Delivery**:
A signed, uniquely identified webhook event sent by GitHub and durably recorded before workflow processing.
_Avoid_: Activity Event, application log

**Submission**:
An Accountable Owner's request for review, containing Git Evidence and an Artifact manifest. It is not proof that the work is accepted or integrated.
_Avoid_: Completion

**Acceptance**:
A review decision that a Submission satisfies its Work Item and Effective Guidance.
_Avoid_: Submission, merge

**Integration**:
Confirmation that accepted work has entered the Project's configured target branch.
_Avoid_: Acceptance, done

**Activity Event**:
An append-only fact describing who performed a workflow action, when it occurred, and what state or evidence changed.
_Avoid_: Mutable audit row, application log

## Relationships

- An Organization contains Teams; a Team owns Projects; a Project contains Modules and Requirements.
- A Requirement is decomposed into Work Items.
- A Work Item has zero or one parent Work Item and zero or more Dependencies.
- A Work Item has exactly one Accountable Owner after it is claimed, plus optional Contributors and Reviewers.
- An Account may hold multiple Role Assignments; every authorized action records the exact matching assignment rather than a global Account role.
- A Submission references Artifacts and Git Evidence.
- A GitHub Delivery may create or update Git Evidence and then produce Activity Events.
- Acceptance applies to a Submission; Integration applies to accepted Git Evidence.
- Every state transition and evidence verification produces an Activity Event.
- An Agent Session belongs to one Account and one Workstation; its actions carry the same opaque execution context.
- An Agent Run acts inside one Agent Session and records the Effective Guidance versions it used.
