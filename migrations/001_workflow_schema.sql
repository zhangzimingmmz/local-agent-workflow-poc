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

create table if not exists github_deliveries (
  id text primary key,
  event text not null,
  payload jsonb not null,
  status text not null,
  attempts integer not null default 0,
  received_at timestamptz not null,
  processed_at timestamptz,
  next_retry_at timestamptz,
  last_error text
);
