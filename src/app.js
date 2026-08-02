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

function dashboardHtml(data) {
  const cards = data.tasks.map((task) => `<article><strong>${task.id}</strong><span>${task.title}</span><em>${task.status}</em></article>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Northstar Labs Workflow</title><style>body{font:16px system-ui;margin:0;background:#f4f6f8;color:#17212b}main{max-width:1100px;margin:auto;padding:32px}header{display:flex;justify-content:space-between;align-items:end}nav{display:flex;gap:24px;margin:32px 0;font-weight:700}section{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{background:white;border:1px solid #dce2e8;border-radius:12px;padding:18px;display:grid;gap:8px}em{font-style:normal;color:#52606d}@media(max-width:700px){section{grid-template-columns:1fr}}</style></head><body><main><header><div><small>Organization</small><h1>${data.organization.name}</h1></div><strong>${data.metrics.events} events</strong></header><nav><span>Design</span><span>Development</span><span>Testing</span></nav><section>${cards}</section></main></body></html>`
}

export function buildApp({ service, users, policies, resolveEffectiveGuidance, webhook }) {
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

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WebhookError) return reply.code(401).send({ error: error.code, message: error.message })
    if (error instanceof WorkflowError || error instanceof PolicyError) {
      const status = ['UNAUTHORIZED'].includes(error.code) ? 401 : ['NOT_FOUND'].includes(error.code) ? 404 : 409
      return reply.code(status).send({ error: error.code, message: error.message })
    }
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: error.message })
  })

  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(dashboardHtml(service.dashboard())))
  app.get('/api/v1/me', { preHandler: authenticate }, async (request) => ({
    account: { id: request.actor.id, name: request.actor.name, role: request.actor.role }
  }))
  app.get('/api/v1/tasks', { preHandler: authenticate }, async (request) => ({ tasks: service.listTasks(request.actor.id) }))
  app.get('/api/v1/tasks/:taskId/guidance', { preHandler: authenticate }, async (request) => {
    const task = service.getTask(request.params.taskId)
    return resolveEffectiveGuidance(policies, {
      organizationId: 'northstar', teamId: 'delivery', projectId: task.projectId,
      moduleId: task.moduleId, workItemId: task.id, role: request.actor.role
    })
  })
  app.post('/api/v1/tasks/:taskId/claim', { preHandler: authenticate }, async (request) => ({ task: await service.claim(request.params.taskId, request.actor.id) }))
  app.post('/api/v1/tasks/:taskId/start', { preHandler: authenticate }, async (request) => ({ task: await service.start(request.params.taskId, request.actor.id) }))
  app.post('/api/v1/tasks/:taskId/submit', { preHandler: authenticate }, async (request) => ({ task: await service.submit(request.params.taskId, request.actor.id, asJson(request.body)) }))
  app.post('/api/v1/tasks/:taskId/review', { preHandler: authenticate }, async (request) => {
    const body = asJson(request.body)
    return { task: await service.review(request.params.taskId, request.actor.id, body.decision, body.note) }
  })
  app.get('/api/v1/tasks/:taskId', { preHandler: authenticate }, async (request) => ({ task: service.getTask(request.params.taskId) }))
  app.get('/api/v1/dashboard', { preHandler: authenticate }, async () => service.dashboard())
  app.post('/webhooks/github', async (request, reply) => {
    const result = await webhook.receive(request.headers, request.body)
    return reply.code(202).send(result)
  })
  return app
}
