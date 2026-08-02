import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { resolveEffectiveGuidance } from '../src/policy.js'
import { InMemoryWebhookInbox, WebhookProcessor } from '../src/webhook.js'
import { WorkflowService } from '../src/workflow.js'
import { workflowFixture } from './fixtures.js'

function setup() {
  const fixture = workflowFixture()
  const service = new WorkflowService(fixture)
  const policies = [{ id: 'organization', scope: 'organization', scopeId: 'northstar', role: '*', version: 1, rules: { branchPrefix: 'work/' } }]
  const webhook = new WebhookProcessor({ secret: 'test-secret', inbox: new InMemoryWebhookInbox(), onEvent: async () => {} })
  const app = buildApp({ service, users: fixture.users, policies, resolveEffectiveGuidance, webhook })
  return { app }
}

test('API authenticates virtual users and exposes role-eligible tasks', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/tasks' })).statusCode, 401)

  const response = await app.inject({ method: 'GET', url: '/api/v1/tasks', headers: { authorization: 'Bearer demo-alice' } })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().tasks.map((task) => task.id), ['DES-001'])
})

test('API resolves guidance and records a claim event', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const headers = { authorization: 'Bearer demo-alice' }
  const policy = await app.inject({ method: 'GET', url: '/api/v1/tasks/DES-001/guidance', headers })
  assert.equal(policy.statusCode, 200)
  assert.equal(policy.json().rules.branchPrefix, 'work/')

  const claim = await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers })
  assert.equal(claim.statusCode, 200)
  assert.equal(claim.json().task.ownerId, 'alice')
  const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', headers })
  assert.equal(dashboard.json().metrics.events, 1)
})

test('API drives the owner and reviewer lifecycle without exposing token hashes', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const alice = { authorization: 'Bearer demo-alice', 'content-type': 'application/json' }
  const bob = { authorization: 'Bearer demo-bob', 'content-type': 'application/json' }

  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers: alice })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/start', headers: alice })).json().task.status, 'in_progress')
  const submission = await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/submit', headers: alice,
    payload: JSON.stringify({
      repository: 'zhangzimingmmz/local-agent-workflow-poc', baseBranch: 'main',
      branch: 'work/DES-001-design', commitSha: 'a'.repeat(40),
      pullRequestUrl: 'https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1',
      artifacts: [{ kind: 'design', path: 'docs/design.md' }]
    })
  })
  assert.equal(submission.json().task.status, 'submitted')
  assert.equal((await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/review', headers: bob,
    payload: JSON.stringify({ decision: 'accept', note: 'Ready for development' })
  })).json().task.status, 'accepted')

  const detail = await app.inject({ method: 'GET', url: '/api/v1/tasks/DES-001', headers: alice })
  assert.equal(detail.statusCode, 200)
  assert.equal('tokenHash' in detail.json().task, false)
})

test('public webhook endpoint accepts a valid raw signed payload without user auth', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const body = JSON.stringify({ zen: 'hello' })
  const signature = `sha256=${createHmac('sha256', 'test-secret').update(body).digest('hex')}`
  const response = await app.inject({
    method: 'POST', url: '/webhooks/github', payload: body,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature, 'x-github-delivery': 'delivery-api', 'x-github-event': 'ping' }
  })
  assert.equal(response.statusCode, 202)
  assert.deepEqual(response.json(), { accepted: true, duplicate: false })
})

test('dashboard HTML presents the requirement and role lanes', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: '/' })
  assert.equal(response.statusCode, 200)
  assert.match(response.body, /Northstar Labs/)
  assert.match(response.body, /Design.*Development.*Testing/s)
})

test('API awaits a persistent service before serializing a state change', async (t) => {
  const fixture = workflowFixture()
  const domain = new WorkflowService(fixture)
  const service = new Proxy(domain, {
    get(target, property) {
      const value = target[property]
      if (property === 'claim') return async (...args) => value.apply(target, args)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  const app = buildApp({
    service,
    users: fixture.users,
    policies: [],
    resolveEffectiveGuidance,
    webhook: new WebhookProcessor({ secret: 'test-secret', inbox: new InMemoryWebhookInbox(), onEvent: async () => {} })
  })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers: { authorization: 'Bearer demo-alice' }
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().task.ownerId, 'alice')
})
