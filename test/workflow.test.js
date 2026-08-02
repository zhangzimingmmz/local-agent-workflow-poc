import assert from 'node:assert/strict'
import test from 'node:test'

import { WorkflowError, WorkflowService } from '../src/workflow.js'
import { validEvidence, workflowFixture } from './fixtures.js'

test('an eligible owner submits verified work and acceptance unlocks a dependency', async () => {
  const workflow = new WorkflowService(workflowFixture())

  assert.equal(workflow.claim('DES-001', 'alice').status, 'claimed')
  assert.equal(workflow.start('DES-001', 'alice').status, 'in_progress')
  assert.equal((await workflow.submit('DES-001', 'alice', validEvidence())).status, 'submitted')
  assert.equal(workflow.review('DES-001', 'bob', 'accept', 'Testable design').status, 'accepted')
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

  assert.throws(() => workflow.review('DES-001', 'alice', 'accept'), (error) => error.code === 'SELF_REVIEW')
  assert.throws(() => workflow.review('DES-001', 'bob', 'accept'), (error) => error.code === 'NOT_REVIEWER')
})

test('only an accepted task can become integrated and complete its requirement', async () => {
  const fixture = workflowFixture()
  fixture.tasks = [fixture.tasks[0]]
  const workflow = new WorkflowService(fixture)
  workflow.claim('DES-001', 'alice')
  workflow.start('DES-001', 'alice')
  await workflow.submit('DES-001', 'alice', validEvidence())

  assert.throws(() => workflow.integrateByPullRequest(validEvidence().pullRequestUrl, 'merge-sha'), (error) => error.code === 'INVALID_STATE')
  workflow.review('DES-001', 'bob', 'accept')
  assert.equal(workflow.integrateByPullRequest(validEvidence().pullRequestUrl, 'merge-sha').status, 'integrated')
  assert.equal(workflow.getRequirement('REQ-001').status, 'completed')
})
