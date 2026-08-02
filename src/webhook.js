import { createHmac, timingSafeEqual } from 'node:crypto'

export class WebhookError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'WebhookError'
    this.code = code
  }
}

function header(headers, name) {
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function validSignature(secret, rawBody, signature) {
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export class InMemoryWebhookInbox {
  constructor() {
    this.deliveries = new Map()
  }

  putIfAbsent(delivery) {
    if (this.deliveries.has(delivery.id)) return false
    this.deliveries.set(delivery.id, structuredClone(delivery))
    return true
  }

  list() {
    return [...this.deliveries.values()].map((delivery) => structuredClone(delivery))
  }

  pending() {
    return [...this.deliveries.values()].filter((delivery) => ['pending', 'failed'].includes(delivery.status))
  }

  update(id, patch) {
    Object.assign(this.deliveries.get(id), structuredClone(patch))
  }
}

export class WebhookProcessor {
  constructor({ secret, inbox, onEvent, clock = () => new Date() }) {
    this.secret = secret
    this.inbox = inbox
    this.onEvent = onEvent
    this.clock = clock
  }

  async receive(headers, rawBody) {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)
    if (!validSignature(this.secret, body, header(headers, 'x-hub-signature-256'))) {
      throw new WebhookError('INVALID_SIGNATURE', 'GitHub webhook signature is invalid')
    }
    const id = header(headers, 'x-github-delivery')
    const event = header(headers, 'x-github-event')
    if (!id || !event) throw new WebhookError('INVALID_HEADERS', 'GitHub delivery and event headers are required')
    let payload
    try {
      payload = JSON.parse(body.toString('utf8'))
    } catch {
      throw new WebhookError('INVALID_JSON', 'GitHub webhook body is not valid JSON')
    }
    const inserted = this.inbox.putIfAbsent({
      id, event, payload, status: 'pending', attempts: 0, receivedAt: this.clock().toISOString()
    })
    return { accepted: true, duplicate: !inserted }
  }

  async processPending() {
    let processed = 0
    for (const delivery of this.inbox.pending()) {
      try {
        await this.onEvent(structuredClone(delivery))
        this.inbox.update(delivery.id, { status: 'processed', processedAt: this.clock().toISOString(), attempts: delivery.attempts + 1, lastError: null })
        processed += 1
      } catch (error) {
        this.inbox.update(delivery.id, { status: 'failed', attempts: delivery.attempts + 1, lastError: error.message })
      }
    }
    return processed
  }
}
