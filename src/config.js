function required(env, name) {
  const value = env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function positiveInteger(value, name, fallback) {
  const number = Number(value ?? fallback)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`)
  return number
}

export function loadConfig(env = process.env) {
  const webhookSecret = required(env, 'WEBHOOK_SECRET')
  if (webhookSecret.length < 32) throw new Error('WEBHOOK_SECRET must contain at least 32 characters')
  const demoTokens = {}
  for (const id of ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']) {
    const name = `DEMO_TOKEN_${id.toUpperCase()}`
    const value = required(env, name)
    if (value.length < 12) throw new Error(`${name} must contain at least 12 characters`)
    demoTokens[id] = value
  }
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    webhookSecret,
    demoTokens,
    githubToken: env.GITHUB_TOKEN || undefined,
    host: env.HOST || '0.0.0.0',
    port: positiveInteger(env.PORT, 'PORT', 8080),
    reconcileIntervalMs: positiveInteger(env.RECONCILE_INTERVAL_MS, 'RECONCILE_INTERVAL_MS', 60000),
    webhookProcessIntervalMs: positiveInteger(env.WEBHOOK_PROCESS_INTERVAL_MS, 'WEBHOOK_PROCESS_INTERVAL_MS', 1000)
  }
}
