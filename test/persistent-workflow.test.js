import assert from 'node:assert/strict'
import test from 'node:test'

import { loadWorkflow } from '../src/persistent-workflow.js'
import { workflowFixture } from './fixtures.js'

class MemoryStateStore {
  constructor() {
    this.record = null
  }
  async load() { return structuredClone(this.record) }
  async save(snapshot, expectedVersion) {
    const actual = this.record?.version ?? 0
    if (actual !== expectedVersion) throw new Error('version conflict')
    this.record = { version: actual + 1, snapshot: structuredClone(snapshot) }
    return this.record.version
  }
}

test('persistent workflow restores tasks and events after a process restart', async () => {
  const store = new MemoryStateStore()
  const seed = workflowFixture()
  const first = await loadWorkflow({ store, seed, verifier: seed.verifier })
  await first.claim('DES-001', 'alice')
  await first.start('DES-001', 'alice')

  const restarted = await loadWorkflow({ store, seed, verifier: seed.verifier })
  assert.equal(restarted.getTask('DES-001').status, 'in_progress')
  assert.deepEqual(restarted.listEvents().map((event) => event.type), ['TaskClaimed', 'TaskStarted'])
})

test('persistent workflow does not write a new version for an idempotent replay', async () => {
  const store = new MemoryStateStore()
  const seed = workflowFixture()
  const workflow = await loadWorkflow({ store, seed, verifier: seed.verifier })
  assert.equal(store.record.version, 1)
  await workflow.claim('DES-001', 'alice', { idempotencyKey: 'claim-once' })
  assert.equal(store.record.version, 2)
  await workflow.claim('DES-001', 'alice', { idempotencyKey: 'claim-once' })
  assert.equal(store.record.version, 2)
})

test('persistent workflow stores rejected command audit events across restart', async () => {
  const store = new MemoryStateStore()
  const seed = workflowFixture()
  const workflow = await loadWorkflow({ store, seed, verifier: seed.verifier })

  await assert.rejects(
    workflow.claim('DES-001', 'carol', { idempotencyKey: 'wrong-role' }),
    (error) => error.code === 'ROLE_MISMATCH'
  )

  const restarted = await loadWorkflow({ store, seed, verifier: seed.verifier })
  assert.equal(restarted.listEvents().at(-1).outcome, 'rejected')
  assert.equal(restarted.getTask('DES-001').status, 'ready')
})

test('persistent workflow serializes concurrent commands without a snapshot version conflict', async () => {
  const store = new MemoryStateStore()
  const seed = workflowFixture()
  const workflow = await loadWorkflow({ store, seed, verifier: seed.verifier })

  const [alice, bob] = await Promise.allSettled([
    workflow.claim('DES-001', 'alice', { idempotencyKey: 'concurrent-alice' }),
    workflow.claim('DES-001', 'bob', { idempotencyKey: 'concurrent-bob' })
  ])

  assert.equal(alice.status, 'fulfilled')
  assert.equal(bob.status, 'rejected')
  assert.equal(bob.reason.code, 'INVALID_STATE')
  assert.equal(store.record.version, 3)
  assert.deepEqual(store.record.snapshot.events.map((event) => event.outcome), ['succeeded', 'rejected'])
})
