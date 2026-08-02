# PoC deployment

The control plane runs on a private Tailscale host. A separate public Traefik host forwards only the signed GitHub Webhook path over Tailscale.

## Control plane

Clone the repository to `/opt/local-agent-workflow-poc`, then generate runtime secrets and bind the workflow to one trusted GitHub Project repository. Replace the repository and Tailscale address placeholders before running the command:

```bash
chmod +x "deploy/bootstrap-env.sh"
"deploy/bootstrap-env.sh" "/opt/local-agent-workflow-poc" "<github-owner/repository>" "8088" "main" "<control-plane-tailscale-ip>"
docker compose config --quiet
docker compose up --build -d
```

The generated `WORKFLOW_REPOSITORY` and `WORKFLOW_BASE_BRANCH` values are server-side evidence boundaries. A Submission from another repository or base branch is rejected even when its PR is otherwise self-consistent. Use a separate target directory, port, database volume, and Account files for each isolated demonstration.

Verify from another Tailscale machine:

```bash
curl "http://<control-plane-tailscale-ip>:8088/health"
```

## Public Webhook edge

Install `deploy/traefik/workflow-hook.yml` into the public host's watched Traefik dynamic configuration directory. Traefik obtains the certificate and forwards only `/webhooks/github` to the private control plane.

Verify the public route without a signature:

```bash
curl -i -X POST "https://<public-webhook-domain>/webhooks/github" -H "Content-Type: application/json" --data '{}'
```

Expected result: `401` with `INVALID_SIGNATURE`. A `2xx` response would indicate signature enforcement is missing.

## Account handoff

`deploy/bootstrap-env.sh` creates one root-readable file per virtual Account under `/opt/local-agent-workflow-poc/accounts/`. Each file contains the Account's opaque Workstation assignment but no Agent Session ID. Give each user only their own file through a secure channel. The user generates a new `TEAM_WORKFLOW_SESSION_ID` immediately before each fresh Codex session and never persists it. Do not commit or paste tokens or session IDs into issues, pull requests, or chat.

Sanitized per-account templates are available under `examples/accounts/`. They contain placeholders only.

## Backup and restore

Create an external, access-controlled backup directory and run:

```bash
mkdir -p "/opt/workflow-backups"
chmod 700 "/opt/workflow-backups"
"deploy/backup.sh" "/opt/workflow-backups"
```

The script creates a mode-`600` PostgreSQL custom-format dump. Copy it off the host according to the operator's retention policy.

Restore is destructive and stops the application while replacing workflow tables. First take a new backup, verify the target filename, then run:

```bash
"deploy/restore.sh" "/opt/workflow-backups/<verified-backup>.dump" --confirm-replace-workflow-database
curl "http://<control-plane-tailscale-ip>:8088/health"
```

Validate Account authentication, Work Item state, Activity Event count, Agent Runs, policy snapshots, and Webhook delivery count after restoration.

## Application rollback

Application rollback does not roll back PostgreSQL automatically.

1. Record the currently deployed commit and take a database backup.
2. Fetch the repository and check out the last known-good commit explicitly.
3. Run `npm test`, `npm run test:coverage`, and `docker compose config --quiet`.
4. Run `docker compose up --build -d` and wait for both services to become healthy.
5. Verify `/health`, one authenticated read request, the dashboard, and a signed test delivery.
6. If the release introduced an incompatible schema change, use the separately reviewed restore procedure; otherwise keep the newer database state.

Never delete the Compose volume as part of an application rollback.
