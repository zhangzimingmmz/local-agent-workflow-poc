import Fastify from 'fastify'
import { createHash } from 'node:crypto'

import { PolicyError } from './policy.js'
import { WebhookError } from './webhook.js'
import { WorkflowError } from './workflow.js'

function asJson(body) {
  if (body === undefined || body === null) return {}
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8'))
  return body
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character])
}

function displayRate(value) {
  return value === null ? 'No data' : `${Math.round(value * 100)}%`
}

function dashboardHtml(data) {
  const roles = [
    ['designer', 'Design'],
    ['developer', 'Development'],
    ['tester', 'Testing']
  ]
  const lanes = roles.map(([role, label]) => {
    const cards = data.tasks.filter((task) => task.role === role).map((task) => {
      const dependencies = task.dependencyIds.map((id) => `<span class="chip" data-dependency="${escapeHtml(id)}">${escapeHtml(id)}</span>`).join('') || '<span class="muted">None</span>'
      const artifacts = task.evidence?.artifacts?.map((artifact) => `<li>${escapeHtml(artifact.kind)}: <code>${escapeHtml(artifact.path)}</code></li>`).join('') ?? ''
      const evidence = task.evidence ? `<details><summary>Verified Git evidence</summary><p><code>${escapeHtml(task.evidence.commitSha)}</code></p><p>${escapeHtml(task.evidence.pullRequestUrl)}</p><ul>${artifacts}</ul></details>` : '<span class="muted">No verified evidence</span>'
      return `<article data-task="${escapeHtml(task.id)}"><div class="card-title"><strong>${escapeHtml(task.id)}</strong><em>${escapeHtml(task.status)}</em></div><span>${escapeHtml(task.title)}</span><dl><div><dt>Owner</dt><dd>${escapeHtml(task.ownerId || 'Unassigned')}</dd></div><div aria-label="Reviewer: ${escapeHtml(task.reviewerId)}"><dt>Reviewer</dt><dd>${escapeHtml(task.reviewerId)}</dd></div></dl><p>Dependencies: ${dependencies}</p>${task.blockingReason ? `<p class="blocked">${escapeHtml(task.blockingReason)}</p>` : ''}${evidence}</article>`
    }).join('')
    return `<section data-role="${role}"><h2>${label}</h2>${cards}</section>`
  }).join('')
  const requirements = data.requirements.map((requirement) => `<div data-requirement="${escapeHtml(requirement.id)}"><strong>${escapeHtml(requirement.id)}</strong> · ${escapeHtml(requirement.status)}</div>`).join('')
  const timeline = data.events.map((event) => `<li><time>${escapeHtml(event.occurredAt)}</time><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.taskId || event.requirementId)} · ${escapeHtml(event.actorId)} · ${escapeHtml(event.outcome)}</span>${event.reason ? `<small>${escapeHtml(event.reasonCode)}: ${escapeHtml(event.reason)}</small>` : ''}</li>`).join('') || '<li class="muted">No activity yet</li>'
  const metrics = data.metrics
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Northstar Labs Workflow</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{font:15px system-ui;margin:0;background:#f4f6f8;color:#17212b}main{max-width:1240px;margin:auto;padding:32px}header,.card-title{display:flex;justify-content:space-between;align-items:center}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.metric,article,.panel{background:white;border:1px solid #dce2e8;border-radius:12px;padding:18px}.metric{display:grid;gap:6px}.metric strong{font-size:1.4rem}.lanes{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}.lanes section{display:flex;flex-direction:column;gap:16px}h2{font-size:1rem;margin:0}article{display:grid;gap:10px}em{font-style:normal;color:#52606d}dl{display:grid;grid-template-columns:1fr 1fr;margin:0}dt{font-size:.75rem;color:#66788a}dd{margin:2px 0}.chip{background:#e8eef5;border-radius:999px;padding:3px 8px;margin-left:4px}.blocked{color:#9b2c2c}.muted{color:#718096}.panel{margin-top:24px}.timeline{list-style:none;padding:0;display:grid;gap:12px}.timeline li{display:grid;grid-template-columns:190px 170px 1fr;gap:10px;border-bottom:1px solid #edf1f5;padding-bottom:10px}.timeline small{grid-column:2/4;color:#9b2c2c}code{overflow-wrap:anywhere}@media(max-width:800px){.lanes,.summary{grid-template-columns:1fr}.timeline li{grid-template-columns:1fr}}</style></head><body><main><header><div><small>Organization</small><h1>${escapeHtml(data.organization.name)}</h1>${requirements}</div><strong>${metrics.events} events</strong></header><section id="workflow-metrics" class="summary"><div class="metric"><span>Evidence verified</span><strong>${displayRate(metrics.evidenceVerificationRate)}</strong></div><div class="metric"><span>Submission accepted</span><strong>${displayRate(metrics.submissionAcceptanceRate)}</strong></div><div class="metric"><span>Rework</span><strong>${metrics.rework.total}</strong></div><div class="metric"><span>Review time</span><strong>${metrics.flow.reviewMs === null ? 'No data' : `${metrics.flow.reviewMs} ms`}</strong></div></section><div class="lanes">${lanes}</div><section class="panel"><h2>Activity Events</h2><ol id="activity-timeline" class="timeline">${timeline}</ol></section></main></body></html>`
}

export function buildApp({
  service, users, policies, resolveEffectiveGuidance, webhook,
  healthCheck = async () => ({ database: 'not_configured' })
}) {
  const app = Fastify({ logger: false })
  const tokens = new Map(users.map((user) => [user.tokenHash, user]))
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body))

  async function authenticate(request, reply) {
    const match = request.headers.authorization?.match(/^Bearer (.+)$/)
    const hash = match ? createHash('sha256').update(match[1]).digest('hex') : null
    const actor = hash ? tokens.get(hash) : null
    if (!actor) return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'A valid workflow token is required' })
    request.actor = actor
  }

  async function requireIdempotencyKey(request, reply) {
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
      return reply.code(400).send({
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must contain between 1 and 128 characters'
      })
    }
    request.idempotencyKey = key
  }

  function guidance(task, role) {
    return resolveEffectiveGuidance(policies, {
      organizationId: 'northstar', teamId: 'delivery', projectId: task.projectId,
      moduleId: task.moduleId, workItemId: task.id, role
    })
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WebhookError) return reply.code(401).send({ error: error.code, message: error.message })
    if (error instanceof WorkflowError || error instanceof PolicyError) {
      const status = ['UNAUTHORIZED'].includes(error.code) ? 401 : ['NOT_FOUND'].includes(error.code) ? 404 : 409
      return reply.code(status).send({ error: error.code, message: error.message })
    }
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: error.message })
  })

  app.get('/health', async (_request, reply) => {
    try {
      return { status: 'ok', dependencies: await healthCheck() }
    } catch {
      return reply.code(503).send({ status: 'unavailable', dependencies: { database: 'error' } })
    }
  })
  app.get('/favicon.ico', async (_request, reply) => reply.code(204).send())
  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(dashboardHtml(service.dashboard())))
  app.get('/api/v1/me', { preHandler: authenticate }, async (request) => ({
    account: { id: request.actor.id, name: request.actor.name, role: request.actor.role }
  }))
  app.get('/api/v1/tasks', { preHandler: authenticate }, async (request) => ({ tasks: service.listTasks(request.actor.id) }))
  app.get('/api/v1/tasks/:taskId/guidance', { preHandler: authenticate }, async (request) => {
    const task = service.getTask(request.params.taskId)
    return guidance(task, request.actor.role)
  })
  const commandHandlers = { preHandler: [authenticate, requireIdempotencyKey] }
  app.post('/api/v1/tasks/:taskId/claim', commandHandlers, async (request) => ({
    task: await service.claim(request.params.taskId, request.actor.id, { idempotencyKey: request.idempotencyKey })
  }))
  app.post('/api/v1/tasks/:taskId/start', commandHandlers, async (request) => {
    const body = asJson(request.body)
    const task = service.getTask(request.params.taskId)
    const started = await service.start(request.params.taskId, request.actor.id, {
      agentType: body.agentType ?? 'codex',
      repository: body.repository,
      branch: body.branch,
      guidanceSnapshot: guidance(task, request.actor.role)
    }, { idempotencyKey: request.idempotencyKey })
    return { task: started, agentRun: service.getAgentRunForTask(task.id, request.actor.id) }
  })
  app.post('/api/v1/tasks/:taskId/submit', commandHandlers, async (request) => ({
    task: await service.submit(request.params.taskId, request.actor.id, asJson(request.body), { idempotencyKey: request.idempotencyKey })
  }))
  app.post('/api/v1/tasks/:taskId/review', commandHandlers, async (request) => {
    const body = asJson(request.body)
    return {
      task: await service.review(
        request.params.taskId, request.actor.id, body.decision, body.note,
        { idempotencyKey: request.idempotencyKey }
      )
    }
  })
  app.get('/api/v1/tasks/:taskId', { preHandler: authenticate }, async (request) => ({ task: service.getTask(request.params.taskId) }))
  app.get('/api/v1/dashboard', { preHandler: authenticate }, async () => service.dashboard())
  app.post('/webhooks/github', async (request, reply) => {
    const result = await webhook.receive(request.headers, request.body)
    return reply.code(202).send(result)
  })
  return app
}
