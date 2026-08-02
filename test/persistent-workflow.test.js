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

test('persistent workflow writes one new version for each successful state command', async () => {
  const store = new MemoryStateStore()
  const seed = workflowFixture()
  const workflow = await loadWorkflow({ store, seed, verifier: seed.verifier })
  assert.equal(store.record.version, 1)
  await workflow.claim('DES-001', 'alice')
  assert.equal(store.record.version, 2)
  await workflow.claim('DES-001', 'alice')
  assert.equal(store.record.version, 3)
})
