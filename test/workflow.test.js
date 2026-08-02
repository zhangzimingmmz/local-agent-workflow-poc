import assert from 'node:assert/strict'
import test from 'node:test'

import { WorkflowError, WorkflowService } from '../src/workflow.js'
import { validEvidence, workflowFixture } from './fixtures.js'

test('an eligible owner submits verified work and acceptance unlocks a dependency', async () => {
  const workflow = new WorkflowService(workflowFixture())

  assert.equal(workflow.claim('DES-001', 'alice').status, 'claimed')
  assert.equal(workflow.start('DES-001', 'alice').status, 'in_progress')
  assert.equal((await workflow.submit('DES-001', 'alice', validEvidence())).status, 'submitted')
  assert.equal((await workflow.review('DES-001', 'bob', 'accept', 'Testable design')).status, 'accepted')
  assert.equal(workflow.getTask('DEV-001').status, 'ready')
  assert.deepEqual(workflow.listEvents().map((event) => event.type), [
    'TaskClaimed', 'TaskStarted', 'TaskSubmitted', 'TaskAccepted', 'TaskUnblocked'
  ])
})

test('claiming is atomic and restricted to the required role', () => {
  const workflow = new WorkflowService(workflowFixture())

  assert.throws(() => workflow.claim('DES-001', 'carol'), (error) => {
    assert.equal(error instanceof WorkflowError, true)
    assert.equal(error.code, 'ROLE_MISMATCH')
    return true
  })

  workflow.claim('DES-001', 'alice')
  assert.throws(() => workflow.claim('DES-001', 'bob'), (error) => error.code === 'INVALID_STATE')
})

test('scoped Role Assignments authorize matching hierarchy and record the exact assignment', () => {
  const fixture = workflowFixture()
  delete fixture.users[0].role
  fixture.users[0].roleAssignments = [
    {
      id: 'ra-alice-designer-project', accountId: 'alice', role: 'designer',
      scope: 'project', scopeId: 'agent-workflow'
    },
    {
      id: 'ra-alice-developer-module', accountId: 'alice', role: 'developer',
      scope: 'module', scopeId: 'adapter-core'
    }
  ]
  fixture.tasks[1].status = 'ready'
  fixture.tasks.push({
    ...fixture.tasks[1],
    id: 'DEV-ADAPTER-001', title: 'Implement the adapter', moduleId: 'adapter-core',
    reviewerId: 'dave', dependencyIds: [], status: 'ready', initialStatus: 'ready'
  })
  const workflow = new WorkflowService(fixture)

  assert.deepEqual(workflow.listTasks('alice').map((task) => task.id), ['DES-001', 'DEV-ADAPTER-001'])
  assert.throws(
    () => workflow.claim('DEV-001', 'alice', { idempotencyKey: 'wrong-module' }),
    (error) => error.code === 'ROLE_MISMATCH'
  )

  workflow.claim('DES-001', 'alice', { idempotencyKey: 'project-role' })
  workflow.claim('DEV-ADAPTER-001', 'alice', { idempotencyKey: 'module-role' })

  assert.deepEqual(workflow.listEvents().at(-1).roleAssignment, {
    id: 'ra-alice-developer-module', accountId: 'alice', role: 'developer',
    scope: 'module', scopeId: 'adapter-core'
  })
})

test('a Work Item Owner can split and assign an inherited child Work Item to another role', () => {
  const workflow = new WorkflowService(workflowFixture())
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')

  const child = workflow.createSubtask('DES-001', 'alice', {
    id: 'DEV-CHILD-001',
    title: 'Implement the designed adapter',
    role: 'developer',
    reviewerId: 'dave',
    assigneeId: 'carol',
    dependencyIds: ['DES-001']
  }, { idempotencyKey: 'split-des-001' })

  assert.deepEqual(child, {
    id: 'DEV-CHILD-001', title: 'Implement the designed adapter',
    organizationId: 'northstar', teamId: 'delivery', projectId: 'agent-workflow', moduleId: 'workflow-core',
    requirementId: 'REQ-001', parentId: 'DES-001', role: 'developer', reviewerId: 'dave',
    ownerId: 'carol', dependencyIds: ['DES-001'], status: 'blocked', initialStatus: 'blocked',
    createdAt: child.createdAt
  })
  assert.equal(workflow.listTasks('carol').some((task) => task.id === 'DEV-CHILD-001'), true)
  assert.deepEqual(workflow.listEvents().at(-1), {
    id: 'evt-3', correlationId: 'split-des-001', type: 'WorkItemCreated',
    actorId: 'alice', taskId: 'DEV-CHILD-001', workItemId: 'DEV-CHILD-001', requirementId: 'REQ-001',
    previousStatus: 'draft', status: 'blocked', outcome: 'succeeded',
    organizationId: 'northstar', teamId: 'delivery', projectId: 'agent-workflow', moduleId: 'workflow-core',
    roleAssignment: {
      id: 'ra:alice:designer:project:agent-workflow',
      accountId: 'alice', role: 'designer', scope: 'project', scopeId: 'agent-workflow'
    },
    parentWorkItemId: 'DES-001', assignedOwnerId: 'carol',
    occurredAt: workflow.listEvents().at(-1).occurredAt
  })
})

test('split and review require Role Assignments that match the Work Item hierarchy', async () => {
  const fixture = workflowFixture()
  for (const accountId of ['alice', 'bob', 'carol', 'dave']) {
    const account = fixture.users.find((candidate) => candidate.id === accountId)
    const role = account.role
    delete account.role
    account.roleAssignments = [{
      id: `ra-${accountId}-${role}`, accountId, role,
      scope: 'project', scopeId: accountId === 'bob' ? 'another-project' : 'agent-workflow'
    }]
  }
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')

  const child = workflow.createSubtask('DES-001', 'alice', {
    id: 'DEV-SCOPED-001', title: 'Implement scoped behavior', role: 'developer',
    reviewerId: 'dave', assigneeId: 'carol', dependencyIds: []
  })
  assert.equal(child.ownerId, 'carol')

  workflow.start('DES-001', 'alice')
  await workflow.submit('DES-001', 'alice', validEvidence())
  await assert.rejects(
    workflow.review('DES-001', 'bob', 'accept'),
    (error) => error.code === 'ROLE_MISMATCH'
  )
})

test('dashboard derives initial queue and blocked time from persisted task lifecycle facts', () => {
  const fixture = workflowFixture()
  fixture.clock = () => new Date('2026-08-03T00:10:00.000Z')
  fixture.events = [
    {
      id: 'evt-1', type: 'TaskClaimed', taskId: 'DES-001', actorId: 'alice', outcome: 'succeeded',
      occurredAt: '2026-08-03T00:01:00.000Z'
    },
    {
      id: 'evt-2', type: 'TaskUnblocked', taskId: 'DEV-001', actorId: 'alice', outcome: 'succeeded',
      occurredAt: '2026-08-03T00:05:00.000Z'
    },
    {
      id: 'evt-3', type: 'TaskClaimed', taskId: 'DEV-001', actorId: 'carol', outcome: 'succeeded',
      occurredAt: '2026-08-03T00:07:00.000Z'
    }
  ]
  fixture.tasks[0].status = 'claimed'
  fixture.tasks[0].ownerId = 'alice'
  fixture.tasks[1].status = 'claimed'
  fixture.tasks[1].ownerId = 'carol'

  const metrics = new WorkflowService(fixture).dashboard().metrics.flow

  assert.equal(metrics.queueMs, 180000)
  assert.equal(metrics.blockedMs, 900000)
})

test('splitting rejects non-owners, duplicate IDs, and role-mismatched assignments without partial children', () => {
  const workflow = new WorkflowService(workflowFixture())
  workflow.claim('DES-001', 'alice')

  assert.throws(
    () => workflow.createSubtask('DES-001', 'bob', {
      id: 'CHILD-001', title: 'Unauthorized child', role: 'designer', reviewerId: 'alice'
    }, { idempotencyKey: 'split-not-owner' }),
    (error) => error.code === 'NOT_OWNER'
  )
  assert.throws(
    () => workflow.createSubtask('DES-001', 'alice', {
      id: 'DES-001', title: 'Duplicate child', role: 'designer', reviewerId: 'bob'
    }, { idempotencyKey: 'split-duplicate' }),
    (error) => error.code === 'DUPLICATE_WORK_ITEM'
  )
  assert.throws(
    () => workflow.createSubtask('DES-001', 'alice', {
      id: 'CHILD-002', title: 'Wrong assignment', role: 'developer', reviewerId: 'dave', assigneeId: 'erin'
    }, { idempotencyKey: 'split-role-mismatch' }),
    (error) => error.code === 'ROLE_MISMATCH'
  )
  assert.throws(() => workflow.getTask('CHILD-001'), (error) => error.code === 'NOT_FOUND')
  assert.throws(() => workflow.getTask('CHILD-002'), (error) => error.code === 'NOT_FOUND')
})

test('submission keeps the task in progress when GitHub evidence is invalid', async () => {
  const fixture = workflowFixture()
  fixture.verifier = { async verify() { throw new Error('commit not found') } }
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')

  await assert.rejects(workflow.submit('DES-001', 'alice', validEvidence()), (error) => {
    assert.equal(error.code, 'INVALID_EVIDENCE')
    return true
  })
  assert.equal(workflow.getTask('DES-001').status, 'in_progress')
})

test('Submission rejects a self-consistent PR outside the server-configured Project repository', async () => {
  const fixture = workflowFixture()
  let verificationCalls = 0
  fixture.verifier = { async verify(evidence) { verificationCalls += 1; return evidence } }
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')

  await assert.rejects(
    workflow.submit('DES-001', 'alice', validEvidence({
      repository: 'attacker/decoy',
      pullRequestUrl: 'https://github.com/attacker/decoy/pull/1'
    }), { idempotencyKey: 'wrong-repository' }),
    (error) => error.code === 'INVALID_EVIDENCE' && /configured Project repository/.test(error.message)
  )
  await assert.rejects(
    workflow.submit('DES-001', 'alice', validEvidence({ baseBranch: 'release' }), {
      idempotencyKey: 'wrong-base-branch'
    }),
    (error) => error.code === 'INVALID_EVIDENCE' && /configured base branch/.test(error.message)
  )

  assert.equal(verificationCalls, 0)
  assert.equal(workflow.getTask('DES-001').status, 'in_progress')
})

test('review requires the configured reviewer and forbids self-review', async () => {
  const fixture = workflowFixture()
  fixture.tasks[0].reviewerId = 'alice'
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')
  await workflow.submit('DES-001', 'alice', validEvidence())

  await assert.rejects(workflow.review('DES-001', 'alice', 'accept'), (error) => error.code === 'SELF_REVIEW')
  await assert.rejects(workflow.review('DES-001', 'bob', 'accept'), (error) => error.code === 'NOT_REVIEWER')
})

test('acceptance re-verifies GitHub evidence and rejects a changed pull-request head', async () => {
  const fixture = workflowFixture()
  let verification = 0
  fixture.verifier = {
    async verify(evidence) {
      verification += 1
      return { ...evidence, verified: true, headSha: verification === 1 ? 'head-before' : 'head-after' }
    }
  }
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')
  await workflow.submit('DES-001', 'alice', validEvidence())

  await assert.rejects(
    async () => workflow.review('DES-001', 'bob', 'accept', 'Looks good', { idempotencyKey: 'review-drift' }),
    (error) => error.code === 'EVIDENCE_CHANGED'
  )
  assert.equal(workflow.getTask('DES-001').status, 'submitted')
  assert.equal(workflow.listEvents().at(-1).reasonCode, 'EVIDENCE_CHANGED')
})

test('only an accepted task can become integrated and complete its requirement', async () => {
  const fixture = workflowFixture()
  fixture.tasks = [fixture.tasks[0]]
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')
  await workflow.submit('DES-001', 'alice', validEvidence())

  assert.throws(() => workflow.integrateByPullRequest(validEvidence().pullRequestUrl, 'merge-sha'), (error) => error.code === 'INVALID_STATE')
  await workflow.review('DES-001', 'bob', 'accept')
  assert.equal(workflow.integrateByPullRequest(validEvidence().pullRequestUrl, 'merge-sha').status, 'integrated')
  assert.equal(workflow.getRequirement('REQ-001').status, 'completed')
})

test('a started task records one Codex Agent Run with its exact guidance snapshot', () => {
  const fixture = workflowFixture()
  fixture.clock = () => new Date('2026-08-03T00:00:00.000Z')
  const workflow = new WorkflowService(fixture)
  const guidanceSnapshot = {
    rules: { branchPrefix: 'work/' },
    sources: [{ id: 'team-common', version: 1, scope: 'team', role: '*' }],
    snapshotHash: 'guidance-hash'
  }

  workflow.claim('DES-001', 'alice', { idempotencyKey: 'claim-des-001' })
  workflow.start('DES-001', 'alice', {
    agentType: 'codex',
    repository: 'zhangzimingmmz/local-agent-workflow-poc',
    branch: 'work/DES-001-design',
    guidanceSnapshot
  }, { idempotencyKey: 'start-des-001' })

  assert.deepEqual(workflow.listAgentRuns(), [{
    id: 'run-1', taskId: 'DES-001', actorId: 'alice', agentType: 'codex',
    repository: 'zhangzimingmmz/local-agent-workflow-poc', branch: 'work/DES-001-design',
    guidanceSnapshot, startedAt: '2026-08-03T00:00:00.000Z'
  }])
  assert.equal(workflow.listEvents().at(-1).agentRunId, 'run-1')
})

test('local Agent Session context distinguishes Owner and Reviewer actions across Workstations', async () => {
  const fixture = workflowFixture()
  fixture.users.find((user) => user.id === 'alice').workstationId = 'workstation-a'
  fixture.users.find((user) => user.id === 'bob').workstationId = 'workstation-b'
  fixture.clock = () => new Date('2026-08-03T00:00:00.000Z')
  const workflow = new WorkflowService(fixture)
  const owner = {
    idempotencyKey: 'owner-action',
    executionContext: { agentType: 'codex', workstationId: 'workstation-a', sessionId: 'session-owner' }
  }
  const reviewer = {
    idempotencyKey: 'reviewer-action',
    executionContext: { agentType: 'codex', workstationId: 'workstation-b', sessionId: 'session-reviewer' }
  }

  workflow.claim('DES-001', 'alice', { ...owner, idempotencyKey: 'owner-claim' })
  workflow.start('DES-001', 'alice', {
    repository: 'zhangzimingmmz/local-agent-workflow-poc', branch: 'work/DES-001-design'
  }, { ...owner, idempotencyKey: 'owner-start' })
  await workflow.submit('DES-001', 'alice', validEvidence(), { ...owner, idempotencyKey: 'owner-submit' })
  await workflow.review('DES-001', 'bob', 'accept', 'Independent review', reviewer)

  assert.deepEqual(workflow.listAgentRuns()[0], {
    id: 'run-1', taskId: 'DES-001', actorId: 'alice', agentType: 'codex',
    workstationId: 'workstation-a', agentSessionId: 'session-owner',
    repository: 'zhangzimingmmz/local-agent-workflow-poc', branch: 'work/DES-001-design',
    guidanceSnapshot: null, startedAt: '2026-08-03T00:00:00.000Z'
  })
  const accepted = workflow.listEvents().find((event) => event.type === 'TaskAccepted')
  assert.equal(accepted.actorId, 'bob')
  assert.equal(accepted.agentType, 'codex')
  assert.equal(accepted.workstationId, 'workstation-b')
  assert.equal(accepted.agentSessionId, 'session-reviewer')

  const dashboard = workflow.dashboard()
  assert.deepEqual(dashboard.metrics.execution, { agentSessions: 2, workstations: 2, accounts: 2 })
  assert.deepEqual(dashboard.agentSessions.map(({ sessionId, actorId, workstationId, actions }) => (
    { sessionId, actorId, workstationId, actions }
  )), [
    { sessionId: 'session-owner', actorId: 'alice', workstationId: 'workstation-a', actions: 3 },
    { sessionId: 'session-reviewer', actorId: 'bob', workstationId: 'workstation-b', actions: 1 }
  ])
})

test('an Agent Session cannot cross Account or configured Workstation boundaries', () => {
  const fixture = workflowFixture()
  fixture.users.find((user) => user.id === 'alice').workstationId = 'workstation-a'
  fixture.users.find((user) => user.id === 'bob').workstationId = 'workstation-b'
  const workflow = new WorkflowService(fixture)
  const context = (workstationId, sessionId) => ({
    idempotencyKey: `${workstationId}:${sessionId}`,
    executionContext: { agentType: 'codex', workstationId, sessionId }
  })

  assert.throws(
    () => workflow.claim('DES-001', 'alice', context('workstation-b', 'wrong-workstation')),
    (error) => error.code === 'WORKSTATION_MISMATCH'
  )
  workflow.claim('DES-001', 'alice', context('workstation-a', 'shared-session'))
  assert.throws(
    () => workflow.claim('DES-001', 'bob', context('workstation-b', 'shared-session')),
    (error) => error.code === 'AGENT_SESSION_CONFLICT'
  )
  assert.equal(workflow.listEvents().at(-1).agentSessionId, 'shared-session')
})

test('Submission events carry hierarchy, role, Agent, Git, and guidance trace context', async () => {
  const fixture = workflowFixture()
  fixture.repository = { name: 'acme/workflow', baseBranch: 'main' }
  fixture.clock = () => new Date('2026-08-03T00:00:00.000Z')
  const workflow = new WorkflowService(fixture)
  const guidanceSnapshot = {
    rules: { branchPrefix: 'work/' },
    sources: [
      { id: 'org-common', scope: 'organization', role: '*', version: 1 },
      { id: 'task-design', scope: 'work_item', role: 'designer', version: 4 }
    ],
    snapshotHash: 'guidance-hash'
  }

  workflow.claim('DES-001', 'alice', { idempotencyKey: 'trace-claim' })
  workflow.start('DES-001', 'alice', {
    agentType: 'codex', repository: 'acme/workflow', branch: 'work/DES-001-design', guidanceSnapshot
  }, { idempotencyKey: 'trace-start' })
  await workflow.submit('DES-001', 'alice', validEvidence({
    repository: 'acme/workflow', branch: 'work/DES-001-design'
  }), { idempotencyKey: 'trace-submit' })

  const event = workflow.listEvents().at(-1)
  assert.equal(event.correlationId, 'trace-submit')
  assert.equal(event.organizationId, 'northstar')
  assert.equal(event.teamId, 'delivery')
  assert.equal(event.projectId, 'agent-workflow')
  assert.equal(event.moduleId, 'workflow-core')
  assert.equal(event.requirementId, 'REQ-001')
  assert.equal(event.workItemId, 'DES-001')
  assert.deepEqual(event.roleAssignment, {
    id: 'ra:alice:designer:project:agent-workflow',
    accountId: 'alice', role: 'designer', scope: 'project', scopeId: 'agent-workflow'
  })
  assert.equal(event.agentType, 'codex')
  assert.equal(event.repository, 'acme/workflow')
  assert.equal(event.branch, 'work/DES-001-design')
  assert.equal(event.commitSha, 'a'.repeat(40))
  assert.equal(event.pullRequestUrl, validEvidence().pullRequestUrl)
  assert.deepEqual(event.guidanceSourceVersions, [
    { id: 'org-common', scope: 'organization', role: '*', version: 1 },
    { id: 'task-design', scope: 'work_item', role: 'designer', version: 4 }
  ])
  assert.equal(event.guidanceSnapshotHash, 'guidance-hash')
})

test('an idempotency key replays one successful command and rejects reuse for another command', () => {
  const workflow = new WorkflowService(workflowFixture())

  const first = workflow.claim('DES-001', 'alice', { idempotencyKey: 'claim-once' })
  const replay = workflow.claim('DES-001', 'alice', { idempotencyKey: 'claim-once' })

  assert.deepEqual(replay, first)
  assert.equal(workflow.listEvents().filter((event) => event.type === 'TaskClaimed').length, 1)
  assert.throws(() => workflow.start('DES-001', 'alice', {}, { idempotencyKey: 'claim-once' }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT')
})

test('idempotency keys are scoped to an Account without exposing an Account token hash', () => {
  const workflow = new WorkflowService(workflowFixture())

  workflow.claim('DES-001', 'alice', { idempotencyKey: 'shared-client-key' })
  assert.throws(
    () => workflow.claim('DES-001', 'bob', { idempotencyKey: 'shared-client-key' }),
    (error) => error.code === 'INVALID_STATE'
  )
  assert.deepEqual(workflow.listEvents().map((event) => event.outcome), ['succeeded', 'rejected'])
})

test('a rejected role or state check creates one audit event without changing task state', () => {
  const fixture = workflowFixture()
  fixture.clock = () => new Date('2026-08-03T00:00:00.000Z')
  const workflow = new WorkflowService(fixture)

  assert.throws(
    () => workflow.claim('DES-001', 'carol', { idempotencyKey: 'wrong-role' }),
    (error) => error.code === 'ROLE_MISMATCH'
  )

  assert.equal(workflow.getTask('DES-001').status, 'ready')
  assert.deepEqual(workflow.listEvents().at(-1), {
    id: 'evt-1', correlationId: 'wrong-role', type: 'ActionRejected', command: 'claim',
    actorId: 'carol', taskId: 'DES-001', workItemId: 'DES-001', requirementId: 'REQ-001',
    previousStatus: 'ready', status: 'ready', outcome: 'rejected',
    reasonCode: 'ROLE_MISMATCH', reason: 'carol cannot claim designer work',
    occurredAt: '2026-08-03T00:00:00.000Z',
    organizationId: 'northstar', teamId: 'delivery', projectId: 'agent-workflow', moduleId: 'workflow-core',
    roleAssignment: {
      id: 'ra:carol:developer:project:agent-workflow',
      accountId: 'carol', role: 'developer', scope: 'project', scopeId: 'agent-workflow'
    }
  })
})
