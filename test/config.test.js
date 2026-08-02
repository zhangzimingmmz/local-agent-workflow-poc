import assert from 'node:assert/strict'
import test from 'node:test'

import { loadConfig } from '../src/config.js'

function environment() {
  return {
    DATABASE_URL: 'postgres://workflow:secret@db:5432/workflow',
    WEBHOOK_SECRET: 'w'.repeat(32),
    WORKFLOW_REPOSITORY: 'acme/workflow', WORKFLOW_BASE_BRANCH: 'release',
    DEMO_TOKEN_ALICE: 'alice-token-value', DEMO_TOKEN_BOB: 'bob-token-value',
    DEMO_TOKEN_CAROL: 'carol-token-value', DEMO_TOKEN_DAVE: 'dave-token-value',
    DEMO_TOKEN_ERIN: 'erin-token-value', DEMO_TOKEN_FRANK: 'frank-token-value',
    HOST: '0.0.0.0', PORT: '8080', RECONCILE_INTERVAL_MS: '60000'
  }
}

test('server config validates secrets and maps six virtual account tokens', () => {
  const config = loadConfig(environment())
  assert.equal(config.port, 8080)
  assert.equal(config.demoTokens.alice, 'alice-token-value')
  assert.equal(config.reconcileIntervalMs, 60000)
  assert.deepEqual(config.repository, { name: 'acme/workflow', baseBranch: 'release' })
})

test('server config fails closed when a required secret is absent or weak', () => {
  const missing = environment()
  delete missing.DEMO_TOKEN_FRANK
  assert.throws(() => loadConfig(missing), /DEMO_TOKEN_FRANK/)
  assert.throws(() => loadConfig({ ...environment(), WEBHOOK_SECRET: 'short' }), /WEBHOOK_SECRET/)
  assert.throws(() => loadConfig({ ...environment(), WORKFLOW_REPOSITORY: '' }), /WORKFLOW_REPOSITORY/)
})
