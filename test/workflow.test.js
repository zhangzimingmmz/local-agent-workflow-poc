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
    actorId: 'carol', taskId: 'DES-001', requirementId: 'REQ-001',
    previousStatus: 'ready', status: 'ready', outcome: 'rejected',
    reasonCode: 'ROLE_MISMATCH', reason: 'carol cannot claim designer work',
    occurredAt: '2026-08-03T00:00:00.000Z'
  })
})
