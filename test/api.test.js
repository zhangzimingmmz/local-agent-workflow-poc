import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { resolveEffectiveGuidance } from '../src/policy.js'
import { InMemoryWebhookInbox, WebhookProcessor } from '../src/webhook.js'
import { WorkflowService } from '../src/workflow.js'
import { workflowFixture } from './fixtures.js'

function setup(options = {}) {
  const fixture = workflowFixture()
  fixture.clock = () => new Date('2026-08-03T00:00:00.000Z')
  const service = new WorkflowService(fixture)
  const policies = [{ id: 'organization', scope: 'organization', scopeId: 'northstar', role: '*', version: 1, rules: { branchPrefix: 'work/' } }]
  const webhook = new WebhookProcessor({ secret: 'test-secret', inbox: new InMemoryWebhookInbox(), onEvent: async () => {} })
  const app = buildApp({ service, users: fixture.users, policies, resolveEffectiveGuidance, webhook, ...options })
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

test('API reports the authenticated human account without exposing its token hash', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const response = await app.inject({
    method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer demo-alice' }
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { account: { id: 'alice', name: 'Alice Product', role: 'designer' } })
})

test('status resolves either a Requirement or Work Item without guessing its type', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const headers = { authorization: 'Bearer demo-alice' }

  const requirement = await app.inject({ method: 'GET', url: '/api/v1/status/REQ-001', headers })
  assert.equal(requirement.statusCode, 200)
  assert.deepEqual(requirement.json(), {
    entityType: 'requirement',
    requirement: { id: 'REQ-001', status: 'in_progress' }
  })

  const workItem = await app.inject({ method: 'GET', url: '/api/v1/status/DES-001', headers })
  assert.equal(workItem.statusCode, 200)
  assert.equal(workItem.json().entityType, 'work_item')
  assert.equal(workItem.json().workItem.id, 'DES-001')

  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/status/UNKNOWN', headers })).statusCode, 404)
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/status/REQ-001' })).statusCode, 401)
})

test('API resolves guidance and records a claim event', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const headers = { authorization: 'Bearer demo-alice', 'idempotency-key': 'claim-guidance' }
  const policy = await app.inject({ method: 'GET', url: '/api/v1/tasks/DES-001/guidance', headers })
  assert.equal(policy.statusCode, 200)
  assert.equal(policy.json().rules.branchPrefix, 'work/')

  const claim = await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers })
  assert.equal(claim.statusCode, 200)
  assert.equal(claim.json().task.ownerId, 'alice')
  const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', headers })
  assert.equal(dashboard.json().metrics.events, 1)
})

test('API lets an Owner split a Work Item and assign the child to an eligible Account', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const headers = {
    authorization: 'Bearer demo-alice',
    'content-type': 'application/json',
    'idempotency-key': 'api-split-child'
  }
  await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/claim',
    headers: { authorization: headers.authorization, 'idempotency-key': 'api-split-claim' }
  })

  const response = await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/subtasks', headers,
    payload: JSON.stringify({
      id: 'DES-001-A', title: 'Research one workflow option', role: 'designer',
      reviewerId: 'alice', assigneeId: 'bob', dependencyIds: []
    })
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().task.id, 'DES-001-A')
  assert.equal(response.json().task.parentId, 'DES-001')
  assert.equal(response.json().task.ownerId, 'bob')
  assert.equal(response.json().task.status, 'claimed')
})

test('API drives the owner and reviewer lifecycle without exposing token hashes', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const alice = { authorization: 'Bearer demo-alice', 'content-type': 'application/json' }
  const bob = { authorization: 'Bearer demo-bob', 'content-type': 'application/json' }

  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers: { ...alice, 'idempotency-key': 'lifecycle-claim' } })).statusCode, 200)
  assert.equal((await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/start',
    headers: { ...alice, 'idempotency-key': 'lifecycle-start' }, payload: '{}'
  })).json().task.status, 'in_progress')
  const submission = await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/submit', headers: { ...alice, 'idempotency-key': 'lifecycle-submit' },
    payload: JSON.stringify({
      repository: 'zhangzimingmmz/local-agent-workflow-poc', baseBranch: 'main',
      branch: 'work/DES-001-design', commitSha: 'a'.repeat(40),
      pullRequestUrl: 'https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1',
      artifacts: [{ kind: 'design', path: 'docs/design.md' }]
    })
  })
  assert.equal(submission.json().task.status, 'submitted')
  assert.equal((await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/review', headers: { ...bob, 'idempotency-key': 'lifecycle-review' },
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
  assert.match(response.body, /data-role="designer".*DES-001/s)
  assert.match(response.body, /data-role="developer".*DEV-001/s)
  assert.match(response.body, /data-role="tester".*TST-001/s)
  assert.equal((await app.inject({ method: 'GET', url: '/favicon.ico' })).statusCode, 204)
})

test('dashboard HTML exposes dependencies, responsibility, blocking reasons, evidence and activity', async (t) => {
  const { app } = setup()
  t.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/' })

  assert.match(response.body, /data-requirement="REQ-001"/)
  assert.match(response.body, /data-task="DEV-001"/)
  assert.match(response.body, /data-dependency="DES-001"/)
  assert.match(response.body, /Blocked by DES-001/)
  assert.match(response.body, /Reviewer: dave/)
  assert.match(response.body, /id="workflow-metrics"/)
  assert.match(response.body, /id="activity-timeline"/)
})

test('dashboard exposes Requirement relationships, all flow times, and guidance versions', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const alice = { authorization: 'Bearer demo-alice', 'content-type': 'application/json' }
  await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/claim',
    headers: { ...alice, 'idempotency-key': 'observable-claim' }
  })
  await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/start',
    headers: { ...alice, 'idempotency-key': 'observable-start' }, payload: '{}'
  })
  await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/submit',
    headers: { ...alice, 'idempotency-key': 'observable-submit' },
    payload: JSON.stringify({
      repository: 'zhangzimingmmz/local-agent-workflow-poc', baseBranch: 'main',
      branch: 'work/DES-001-design', commitSha: 'a'.repeat(40),
      pullRequestUrl: 'https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1',
      artifacts: [{ kind: 'design', path: 'docs/design.md' }]
    })
  })

  const response = await app.inject({ method: 'GET', url: '/' })
  assert.match(response.body, /Requirement:<\/dt><dd>REQ-001/)
  assert.match(response.body, /Guidance versions/)
  assert.match(response.body, /organization v1/)
  assert.match(response.body, /Active time/)
  assert.match(response.body, /Queue time/)
  assert.match(response.body, /Review time/)
  assert.match(response.body, /Blocked time/)
})

test('dashboard API derives evidence, acceptance, rework and timing metrics from events', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const alice = { authorization: 'Bearer demo-alice', 'content-type': 'application/json' }
  const bob = { authorization: 'Bearer demo-bob', 'content-type': 'application/json' }
  await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers: { ...alice, 'idempotency-key': 'metric-claim' } })
  await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/start', headers: { ...alice, 'idempotency-key': 'metric-start' }, payload: '{}' })
  await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/submit', headers: { ...alice, 'idempotency-key': 'metric-submit' },
    payload: JSON.stringify({
      repository: 'zhangzimingmmz/local-agent-workflow-poc', baseBranch: 'main',
      branch: 'work/DES-001-design', commitSha: 'a'.repeat(40),
      pullRequestUrl: 'https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1',
      artifacts: [{ kind: 'design', path: 'docs/design.md' }]
    })
  })
  await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/review', headers: { ...bob, 'idempotency-key': 'metric-review' },
    payload: JSON.stringify({ decision: 'reject', note: 'Clarify failure recovery' })
  })

  const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', headers: alice })
  assert.deepEqual(dashboard.json().metrics.flow, {
    activeMs: 0, queueMs: null, reviewMs: 0, blockedMs: null
  })
  assert.equal(dashboard.json().metrics.evidenceVerificationRate, 1)
  assert.equal(dashboard.json().metrics.submissionAcceptanceRate, 0)
  assert.deepEqual(dashboard.json().metrics.rework, { total: 1, byStage: { designer: 1 }, byReason: { 'Clarify failure recovery': 1 } })
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
    method: 'POST', url: '/api/v1/tasks/DES-001/claim',
    headers: { authorization: 'Bearer demo-alice', 'idempotency-key': 'persistent-claim' }
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().task.ownerId, 'alice')
})

test('state-changing API commands require and replay an Idempotency-Key', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const authorization = 'Bearer demo-alice'

  assert.equal((await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers: { authorization }
  })).statusCode, 400)

  const headers = { authorization, 'idempotency-key': 'claim-api-once' }
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers })).statusCode, 200)
  const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', headers })
  assert.equal(dashboard.json().events.filter((event) => event.type === 'TaskClaimed').length, 1)
})

test('starting through the API records a Codex Agent Run with server-resolved guidance', async (t) => {
  const { app } = setup()
  t.after(() => app.close())
  const headers = { authorization: 'Bearer demo-alice', 'content-type': 'application/json' }
  await app.inject({ method: 'POST', url: '/api/v1/tasks/DES-001/claim', headers: { ...headers, 'idempotency-key': 'claim-run' } })

  const response = await app.inject({
    method: 'POST', url: '/api/v1/tasks/DES-001/start',
    headers: { ...headers, 'idempotency-key': 'start-run' },
    payload: JSON.stringify({
      agentType: 'codex', repository: 'zhangzimingmmz/local-agent-workflow-poc',
      branch: 'work/DES-001-design'
    })
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().agentRun.guidanceSnapshot.rules.branchPrefix, 'work/')
  const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', headers })
  assert.equal(dashboard.json().agentRuns[0].agentType, 'codex')
})

test('health reports database readiness and returns 503 when the dependency fails', async (t) => {
  const ready = setup({ healthCheck: async () => ({ database: 'ok' }) }).app
  const unavailable = setup({ healthCheck: async () => { throw new Error('database unavailable') } }).app
  t.after(() => Promise.all([ready.close(), unavailable.close()]))

  assert.deepEqual((await ready.inject({ method: 'GET', url: '/health' })).json(), {
    status: 'ok', dependencies: { database: 'ok' }
  })
  const response = await unavailable.inject({ method: 'GET', url: '/health' })
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), { status: 'unavailable', dependencies: { database: 'error' } })
})

test('dashboard lanes and policy context come from organization configuration and task roles', async (t) => {
  const fixture = workflowFixture()
  fixture.organization = { id: 'acme', name: 'Acme Corporation' }
  fixture.team = { id: 'platform', name: 'Platform Team' }
  fixture.users[0].role = 'analyst'
  fixture.tasks[0].role = 'analyst'
  fixture.tasks[0].organizationId = 'acme'
  fixture.tasks[0].teamId = 'platform'
  const service = new WorkflowService(fixture)
  const policies = [{
    id: 'acme-policy', scope: 'organization', scopeId: 'acme', role: 'analyst',
    version: 3, rules: { configuredCompany: true }
  }]
  const app = buildApp({
    service, users: fixture.users, policies, resolveEffectiveGuidance,
    organization: fixture.organization, team: fixture.team,
    webhook: new WebhookProcessor({ secret: 'test-secret', inbox: new InMemoryWebhookInbox(), onEvent: async () => {} })
  })
  t.after(() => app.close())

  const page = await app.inject({ method: 'GET', url: '/' })
  assert.match(page.body, /Acme Corporation/)
  assert.match(page.body, /data-role="analyst"/)
  assert.doesNotMatch(page.body, /Northstar Labs/)

  const guidance = await app.inject({
    method: 'GET', url: '/api/v1/tasks/DES-001/guidance',
    headers: { authorization: 'Bearer demo-alice' }
  })
  assert.equal(guidance.json().rules.configuredCompany, true)
  assert.equal(guidance.json().sources[0].version, 3)
})
