alter table github_deliveries
  add column if not exists next_retry_at timestamptz;
