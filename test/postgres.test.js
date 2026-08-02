import assert from 'node:assert/strict'
import test from 'node:test'
import { newDb } from 'pg-mem'

import { PostgresStateStore, PostgresWebhookInbox } from '../src/postgres.js'

function pool() {
  const memory = newDb()
  const adapter = memory.adapters.createPg()
  return new adapter.Pool()
}

test('Postgres state store persists a versioned workflow snapshot and append-only events', async (t) => {
  const database = pool()
  t.after(() => database.end())
  const store = new PostgresStateStore(database)
  await store.initialize()
  const snapshot = {
    users: [{ id: 'alice', tokenHash: 'hash' }], tasks: [{ id: 'DES-001', status: 'ready' }],
    requirements: [{ id: 'REQ-001', status: 'in_progress' }],
    events: [{ id: 'evt-1', type: 'TaskClaimed', occurredAt: '2026-08-03T00:00:00.000Z' }]
  }

  assert.equal(await store.save(snapshot, 0), 1)
  assert.deepEqual(await store.load(), { version: 1, snapshot })
  await assert.rejects(store.save({ ...snapshot, tasks: [] }, 0), /version conflict/)
  const result = await database.query('select count(*)::int as count from activity_events')
  assert.equal(result.rows[0].count, 1)
})

test('Postgres webhook inbox deduplicates deliveries and persists processing state', async (t) => {
  const database = pool()
  t.after(() => database.end())
  const inbox = new PostgresWebhookInbox(database)
  await inbox.initialize()
  const delivery = { id: 'delivery-1', event: 'ping', payload: { zen: 'hello' }, status: 'pending', attempts: 0, receivedAt: '2026-08-03T00:00:00.000Z' }

  assert.equal(await inbox.putIfAbsent(delivery), true)
  assert.equal(await inbox.putIfAbsent(delivery), false)
  assert.equal((await inbox.pending()).length, 1)
  await inbox.update(delivery.id, {
    status: 'failed', attempts: 1, nextRetryAt: '2026-08-03T00:00:10.000Z', lastError: 'temporary'
  })
  assert.equal((await inbox.pending('2026-08-03T00:00:09.000Z')).length, 0)
  assert.equal((await inbox.pending('2026-08-03T00:00:10.000Z')).length, 1)
  await inbox.update(delivery.id, {
    status: 'processed', attempts: 2, processedAt: '2026-08-03T00:00:11.000Z', nextRetryAt: null
  })
  assert.equal((await inbox.list())[0].status, 'processed')
  assert.equal((await inbox.list())[0].nextRetryAt, null)
})
