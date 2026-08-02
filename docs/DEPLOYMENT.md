# PoC deployment

The control plane runs on a private Tailscale host. A separate public Traefik host forwards only the signed GitHub Webhook path over Tailscale.

## Control plane

Clone the repository to `/opt/local-agent-workflow-poc`, then generate runtime secrets once:

```bash
chmod +x "deploy/bootstrap-env.sh"
"deploy/bootstrap-env.sh" "/opt/local-agent-workflow-poc"
docker compose config --quiet
docker compose up --build -d
```

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

`deploy/bootstrap-env.sh` creates one root-readable file per virtual Account under `/opt/local-agent-workflow-poc/accounts/`. Give each user only their own file through a secure channel. Do not commit or paste these values into issues, pull requests, or chat.
