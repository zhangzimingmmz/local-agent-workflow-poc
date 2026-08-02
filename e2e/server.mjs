import { buildApp } from '../src/app.js'
import { resolveEffectiveGuidance } from '../src/policy.js'
import { createSeed } from '../src/seed.js'
import { InMemoryWebhookInbox, WebhookProcessor } from '../src/webhook.js'
import { WorkflowService } from '../src/workflow.js'

const tokens = {
  alice: 'e2e-token-alice', bob: 'e2e-token-bob', carol: 'e2e-token-carol',
  dave: 'e2e-token-dave', erin: 'e2e-token-erin', frank: 'e2e-token-frank'
}
const seed = createSeed(tokens, { createdAt: '2026-08-03T00:00:00.000Z' })
const verifier = {
  async verify(evidence) {
    return { ...evidence, verified: true, verifiedAt: new Date().toISOString() }
  }
}
const service = new WorkflowService({ ...seed, verifier })
const webhook = new WebhookProcessor({
  secret: 'browser-e2e-secret',
  inbox: new InMemoryWebhookInbox(),
  onEvent: async () => {}
})
const app = buildApp({
  service,
  users: seed.users,
  policies: seed.policies,
  resolveEffectiveGuidance,
  webhook,
  organization: seed.organization,
  team: seed.team
})

await app.listen({ host: '127.0.0.1', port: 4173 })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await app.close()
    process.exit(0)
  })
}
