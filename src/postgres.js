function json(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

export class PostgresStateStore {
  constructor(pool) {
    this.pool = pool
  }

  async initialize() {
    await this.pool.query(`
      create table if not exists workflow_state (
        id text primary key,
        version integer not null,
        snapshot jsonb not null,
        updated_at timestamptz not null default now()
      );
      create table if not exists activity_events (
        id text primary key,
        type text not null,
        occurred_at timestamptz not null,
        payload jsonb not null
      );
    `)
  }

  async load() {
    const result = await this.pool.query("select version, snapshot from workflow_state where id = 'primary'")
    if (result.rowCount === 0) return null
    return { version: result.rows[0].version, snapshot: json(result.rows[0].snapshot) }
  }

  async save(snapshot, expectedVersion) {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const current = await client.query("select version from workflow_state where id = 'primary' for update")
      let nextVersion
      if (current.rowCount === 0) {
        if (expectedVersion !== 0) throw new Error(`workflow state version conflict: expected ${expectedVersion}, found none`)
        nextVersion = 1
        await client.query("insert into workflow_state (id, version, snapshot) values ('primary', $1, $2::jsonb)", [nextVersion, JSON.stringify(snapshot)])
      } else {
        const actual = current.rows[0].version
        if (actual !== expectedVersion) throw new Error(`workflow state version conflict: expected ${expectedVersion}, found ${actual}`)
        nextVersion = actual + 1
        await client.query("update workflow_state set version = $1, snapshot = $2::jsonb, updated_at = now() where id = 'primary'", [nextVersion, JSON.stringify(snapshot)])
      }
      for (const event of snapshot.events ?? []) {
        await client.query(
          'insert into activity_events (id, type, occurred_at, payload) values ($1, $2, $3, $4::jsonb) on conflict (id) do nothing',
          [event.id, event.type, event.occurredAt, JSON.stringify(event)]
        )
      }
      await client.query('commit')
      return nextVersion
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}

function delivery(row) {
  return {
    id: row.id,
    event: row.event,
    payload: json(row.payload),
    status: row.status,
    attempts: row.attempts,
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
    processedAt: row.processed_at instanceof Date ? row.processed_at.toISOString() : row.processed_at,
    lastError: row.last_error
  }
}

export class PostgresWebhookInbox {
  constructor(pool) {
    this.pool = pool
  }

  async initialize() {
    await this.pool.query(`
      create table if not exists github_deliveries (
        id text primary key,
        event text not null,
        payload jsonb not null,
        status text not null,
        attempts integer not null default 0,
        received_at timestamptz not null,
        processed_at timestamptz,
        last_error text
      );
    `)
  }

  async putIfAbsent(value) {
    const existing = await this.pool.query('select id from github_deliveries where id = $1', [value.id])
    if (existing.rowCount > 0) return false
    try {
      await this.pool.query(
        `insert into github_deliveries (id, event, payload, status, attempts, received_at)
         values ($1, $2, $3::jsonb, $4, $5, $6)`,
        [value.id, value.event, JSON.stringify(value.payload), value.status, value.attempts, value.receivedAt]
      )
      return true
    } catch (error) {
      if (error.code === '23505') return false
      throw error
    }
  }

  async list() {
    const result = await this.pool.query('select * from github_deliveries order by received_at, id')
    return result.rows.map(delivery)
  }

  async pending() {
    const result = await this.pool.query("select * from github_deliveries where status in ('pending', 'failed') order by received_at, id")
    return result.rows.map(delivery)
  }

  async update(id, patch) {
    const columns = { status: 'status', attempts: 'attempts', processedAt: 'processed_at', lastError: 'last_error' }
    const entries = Object.entries(patch).filter(([key]) => columns[key])
    if (entries.length === 0) return
    const setters = entries.map(([key], index) => `${columns[key]} = $${index + 1}`)
    await this.pool.query(`update github_deliveries set ${setters.join(', ')} where id = $${entries.length + 1}`, [...entries.map(([, value]) => value), id])
  }
}
