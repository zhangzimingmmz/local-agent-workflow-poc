import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import { InMemoryWebhookInbox, WebhookError, WebhookProcessor } from '../src/webhook.js'

function signed(secret, body) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

test('webhook receiver validates the raw body and deduplicates GitHub delivery IDs', async () => {
  const secret = 'test-secret'
  const inbox = new InMemoryWebhookInbox()
  const processor = new WebhookProcessor({ secret, inbox, onEvent: async () => {} })
  const rawBody = Buffer.from(JSON.stringify({ zen: 'keep it logically awesome' }))
  const headers = {
    'x-hub-signature-256': signed(secret, rawBody),
    'x-github-delivery': 'delivery-1',
    'x-github-event': 'ping'
  }

  assert.deepEqual(await processor.receive(headers, rawBody), { accepted: true, duplicate: false })
  assert.deepEqual(await processor.receive(headers, rawBody), { accepted: true, duplicate: true })
  assert.equal(inbox.list().length, 1)
})

test('webhook receiver rejects a missing or invalid signature before persistence', async () => {
  const inbox = new InMemoryWebhookInbox()
  const processor = new WebhookProcessor({ secret: 'test-secret', inbox, onEvent: async () => {} })
  await assert.rejects(processor.receive({
    'x-hub-signature-256': 'sha256=bad', 'x-github-delivery': 'delivery-1', 'x-github-event': 'ping'
  }, Buffer.from('{}')), (error) => error instanceof WebhookError && error.code === 'INVALID_SIGNATURE')
  assert.equal(inbox.list().length, 0)
})

test('processing a merged pull request invokes the integration handler exactly once', async () => {
  const body = Buffer.from(JSON.stringify({ action: 'closed', pull_request: { merged: true, html_url: 'https://github.com/acme/widgets/pull/42' } }))
  const calls = []
  const inbox = new InMemoryWebhookInbox()
  const processor = new WebhookProcessor({ secret: 'test-secret', inbox, onEvent: async (delivery) => calls.push(delivery) })
  await processor.receive({
    'x-hub-signature-256': signed('test-secret', body),
    'x-github-delivery': 'delivery-merge', 'x-github-event': 'pull_request'
  }, body)

  assert.equal(await processor.processPending(), 1)
  assert.equal(await processor.processPending(), 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.pull_request.merged, true)
})

test('failed Webhook processing persists exponential retry time and skips work until due', async () => {
  let now = new Date('2026-08-03T00:00:00.000Z')
  let calls = 0
  const inbox = new InMemoryWebhookInbox()
  const processor = new WebhookProcessor({
    secret: 'test-secret', inbox, clock: () => now, retryBaseMs: 1000,
    onEvent: async () => {
      calls += 1
      if (calls < 3) throw new Error('temporary GitHub failure')
    }
  })
  const body = Buffer.from('{}')
  await processor.receive({
    'x-hub-signature-256': signed('test-secret', body),
    'x-github-delivery': 'delivery-retry', 'x-github-event': 'pull_request'
  }, body)

  assert.equal(await processor.processPending(), 0)
  assert.equal(calls, 1)
  assert.equal(inbox.list()[0].nextRetryAt, '2026-08-03T00:00:01.000Z')
  assert.equal(await processor.processPending(), 0)
  assert.equal(calls, 1)

  now = new Date('2026-08-03T00:00:01.000Z')
  assert.equal(await processor.processPending(), 0)
  assert.equal(inbox.list()[0].nextRetryAt, '2026-08-03T00:00:03.000Z')
  now = new Date('2026-08-03T00:00:03.000Z')
  assert.equal(await processor.processPending(), 1)
  assert.equal(inbox.list()[0].nextRetryAt, null)
  assert.equal(inbox.list()[0].attempts, 3)
})
