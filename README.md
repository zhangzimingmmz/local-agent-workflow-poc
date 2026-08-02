# Local Agent Workflow PoC

A vendor-neutral proof of concept for human teams using local Codex agents, GitHub evidence, layered standards, and an observable design-to-development-to-testing workflow.

## What it proves

- Six human accounts use separate local Codex sessions.
- One requirement is decomposed into role-owned work items and explicit dependencies.
- Standards resolve across Organization, Team, Project, Module, and Work Item scopes.
- Design, code, and test artifacts remain in GitHub branches and pull requests.
- The control plane verifies Git evidence instead of trusting completion claims.
- Signed GitHub Webhooks and API reconciliation update integration state exactly once.
- An append-only event record powers the workflow dashboard and metrics.

See [the detailed goals](./docs/GOALS.md) and [domain language](./CONTEXT.md).

Operators can follow the [six-account demonstration runbook](./docs/RUNBOOK.md), [deployment and recovery guide](./docs/DEPLOYMENT.md), and [acceptance report](./docs/ACCEPTANCE.md).

## Architecture

```text
Local Codex + team-workflow Skill ──Tailscale──> Web/API + PostgreSQL
             │                                      ^
             └──────── Git branch and PR ──> GitHub │
                                                  Webhook
                                                    │
                         public HTTPS edge ─────────┘
```

The Web/API binds only to a configured Tailscale address. PostgreSQL is available only on its private Docker network. The public edge exposes only `/webhooks/github` and preserves GitHub's raw body and signature headers.

## Local verification

Requirements: Node.js 22 or newer.

```bash
npm install
npm test
npm run test:coverage
```

## Container configuration

Copy `.env.example` to `.env` and replace every placeholder with a random value. Each demo token must contain at least 12 characters and the Webhook secret at least 32 characters.

```bash
docker compose config --quiet
docker compose up --build -d
curl "http://<tailscale-host>:8088/health"
```

Expected health response:

```json
{"status":"ok"}
```

Do not commit `.env`. The central service stores only SHA-256 token hashes in its workflow snapshot.

## GitHub Webhook

Create one repository Webhook with:

- Payload URL: `https://<public-webhook-domain>/webhooks/github`
- Content type: `application/json`
- Secret: the same value as `WEBHOOK_SECRET`
- Events: Pull requests
- Active: enabled

The endpoint also accepts GitHub's initial `ping` delivery. Invalid signatures are rejected before JSON processing or persistence.

## Current boundary

This is a proof of concept, not a production multi-tenant service. SSO, Git providers other than GitHub, arbitrary workflow design, automatic merging, high availability, and employee performance scoring are intentionally excluded.
