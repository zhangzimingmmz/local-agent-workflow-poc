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
