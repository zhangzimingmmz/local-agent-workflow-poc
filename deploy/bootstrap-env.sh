#!/bin/sh
set -eu

target_dir=${1:-/opt/local-agent-workflow-poc}
env_file="$target_dir/.env"
accounts_dir="$target_dir/accounts"

if [ -f "$env_file" ]; then
  echo "Environment already exists at $env_file; leaving it unchanged."
  exit 0
fi

umask 077
mkdir -p "$accounts_dir"

db_password=$(openssl rand -hex 24)
webhook_secret=$(openssl rand -hex 32)
alice=$(openssl rand -hex 20)
bob=$(openssl rand -hex 20)
carol=$(openssl rand -hex 20)
dave=$(openssl rand -hex 20)
erin=$(openssl rand -hex 20)
frank=$(openssl rand -hex 20)

{
  printf 'BIND_ADDRESS=100.64.0.5\n'
  printf 'APP_PORT=8088\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$db_password"
  printf 'WEBHOOK_SECRET=%s\n' "$webhook_secret"
  printf 'GITHUB_TOKEN=\n'
  printf 'DEMO_TOKEN_ALICE=%s\n' "$alice"
  printf 'DEMO_TOKEN_BOB=%s\n' "$bob"
  printf 'DEMO_TOKEN_CAROL=%s\n' "$carol"
  printf 'DEMO_TOKEN_DAVE=%s\n' "$dave"
  printf 'DEMO_TOKEN_ERIN=%s\n' "$erin"
  printf 'DEMO_TOKEN_FRANK=%s\n' "$frank"
} > "$env_file"

for record in "alice:$alice" "bob:$bob" "carol:$carol" "dave:$dave" "erin:$erin" "frank:$frank"; do
  name=${record%%:*}
  token=${record#*:}
  {
    printf 'TEAM_WORKFLOW_URL=http://100.64.0.5:8088\n'
    printf 'TEAM_WORKFLOW_TOKEN=%s\n' "$token"
    printf 'TEAM_WORKFLOW_BASE_BRANCH=main\n'
  } > "$accounts_dir/$name.env"
done

chmod 600 "$env_file" "$accounts_dir"/*.env
echo "Created runtime environment and six account files under $target_dir."
