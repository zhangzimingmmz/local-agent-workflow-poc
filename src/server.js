import pg from 'pg'

import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { createGitHubEventHandler, reconcileAccepted } from './github-event.js'
import { GitHubEvidenceVerifier } from './github.js'
import { loadWorkflow } from './persistent-workflow.js'
import { resolveEffectiveGuidance } from './policy.js'
import { PostgresStateStore, PostgresWebhookInbox } from './postgres.js'
import { createSeed } from './seed.js'
import { WebhookProcessor } from './webhook.js'

const config = loadConfig()
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 })
const stateStore = new PostgresStateStore(pool)
const inbox = new PostgresWebhookInbox(pool)
await stateStore.initialize()
await inbox.initialize()

const seed = createSeed(config.demoTokens)
const github = new GitHubEvidenceVerifier({ token: config.githubToken })
const workflow = await loadWorkflow({ store: stateStore, seed, verifier: github })
const webhook = new WebhookProcessor({
  secret: config.webhookSecret,
  inbox,
  onEvent: createGitHubEventHandler({ github, workflow })
})
const app = buildApp({
  service: workflow,
  users: seed.users,
  policies: seed.policies,
  organization: seed.organization,
  team: seed.team,
  resolveEffectiveGuidance,
  webhook,
  healthCheck: async () => {
    await pool.query('select 1')
    return { database: 'ok' }
  }
})

const webhookTimer = setInterval(() => {
  webhook.processPending().catch((error) => app.log.error({ err: error }, 'Webhook processing failed'))
}, config.webhookProcessIntervalMs)
const reconcileTimer = setInterval(() => {
  reconcileAccepted({ github, workflow }).catch((error) => app.log.error({ err: error }, 'GitHub reconciliation failed'))
}, config.reconcileIntervalMs)
webhookTimer.unref()
reconcileTimer.unref()

app.addHook('onClose', async () => {
  clearInterval(webhookTimer)
  clearInterval(reconcileTimer)
  await pool.end()
})

async function shutdown(signal) {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  process.exit(0)
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
await app.listen({ host: config.host, port: config.port })
