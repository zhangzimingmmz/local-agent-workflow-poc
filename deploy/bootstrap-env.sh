#!/bin/sh
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 5 ]; then
  echo "Usage: deploy/bootstrap-env.sh <target-directory> <github-owner/repository> [app-port] [base-branch] [bind-address]" >&2
  exit 2
fi

target_dir=$1
workflow_repository=$2
app_port=${3:-8088}
base_branch=${4:-main}
bind_address=${5:-100.64.0.5}

case "$workflow_repository" in
  ?*/?*) ;;
  *) echo "Repository must use github-owner/repository format." >&2; exit 2 ;;
esac
case "$app_port" in
  ''|*[!0-9]*) echo "App port must be a positive integer." >&2; exit 2 ;;
esac
[ "$app_port" -gt 0 ] || { echo "App port must be a positive integer." >&2; exit 2; }
[ -n "$base_branch" ] || { echo "Base branch must not be empty." >&2; exit 2; }
[ -n "$bind_address" ] || { echo "Bind address must not be empty." >&2; exit 2; }

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
  printf 'BIND_ADDRESS=%s\n' "$bind_address"
  printf 'APP_PORT=%s\n' "$app_port"
  printf 'POSTGRES_PASSWORD=%s\n' "$db_password"
  printf 'WEBHOOK_SECRET=%s\n' "$webhook_secret"
  printf 'GITHUB_TOKEN=\n'
  printf 'WORKFLOW_REPOSITORY=%s\n' "$workflow_repository"
  printf 'WORKFLOW_BASE_BRANCH=%s\n' "$base_branch"
  printf 'DEMO_TOKEN_ALICE=%s\n' "$alice"
  printf 'DEMO_TOKEN_BOB=%s\n' "$bob"
  printf 'DEMO_TOKEN_CAROL=%s\n' "$carol"
  printf 'DEMO_TOKEN_DAVE=%s\n' "$dave"
  printf 'DEMO_TOKEN_ERIN=%s\n' "$erin"
  printf 'DEMO_TOKEN_FRANK=%s\n' "$frank"
} > "$env_file"

for record in "alice:$alice:workstation-a" "bob:$bob:workstation-b" "carol:$carol:workstation-a" "dave:$dave:workstation-b" "erin:$erin:workstation-a" "frank:$frank:workstation-b"; do
  name=${record%%:*}
  account_config=${record#*:}
  token=${account_config%%:*}
  workstation_id=${account_config#*:}
  {
    printf 'TEAM_WORKFLOW_URL=http://%s:%s\n' "$bind_address" "$app_port"
    printf 'TEAM_WORKFLOW_TOKEN=%s\n' "$token"
    printf 'TEAM_WORKFLOW_BASE_BRANCH=%s\n' "$base_branch"
    printf 'TEAM_WORKFLOW_WORKSTATION_ID=%s\n' "$workstation_id"
  } > "$accounts_dir/$name.env"
done

chmod 600 "$env_file" "$accounts_dir"/*.env
echo "Created runtime environment and six account files under $target_dir."
