import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { STATE_SCHEMA, WEBHOOK_SCHEMA } from '../src/schema.js'

test('versioned schema source covers workflow state, audit events and durable Webhook inbox', async () => {
  assert.match(STATE_SCHEMA, /create table if not exists workflow_state/)
  assert.match(STATE_SCHEMA, /create table if not exists activity_events/)
  assert.match(WEBHOOK_SCHEMA, /create table if not exists github_deliveries/)

  const migration = await readFile(new URL('../migrations/001_workflow_schema.sql', import.meta.url), 'utf8')
  for (const table of ['workflow_state', 'activity_events', 'github_deliveries']) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`))
  }
})
