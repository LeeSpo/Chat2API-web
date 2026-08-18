# Chat2API Web Deployment Guide

This document describes how to run Chat2API as a Docker/Web service.
A single Node.js process serves the OpenAI-compatible API, management API,
and web UI on one port.

```
┌─────────────────────────────────────────────────────────────┐
│                      Single Node.js process                  │
│ ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐  │
│ │ /v1/* OpenAI API │  │ /v0/management/* │  │ /  static  │  │
│ └──────────────────┘  └──────────────────┘  │   web UI   │  │
└─────────────────────────────────────────────┴────────────┴──┘
```

## Quick start with Docker

```bash
docker compose up -d --build
docker compose logs -f chat2api
```

On first boot the logs include:

```
================================================================
  First run detected.
  Open the web UI to create your administrator password.
  Until you do, the management API will reject every request
  except /v0/management/auth/{status,setup,login}.
================================================================
```

Open `http://your-server:8080/`. Create an administrator password (8+
characters), then add provider accounts from the UI.

To skip the browser first-run flow, set `CHAT2API_MANAGEMENT_SECRET` in `.env`.

## Health

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/v0/management/auth/status
```

`/admin` redirects to `/`.

## Adding accounts

Use **Providers → Add Account → OAuth Login**. Generate the bookmarklet,
drag it to the bookmark bar, sign in on the provider site, then click the
bookmark. Manual token paste remains available.

## Persisting data

Docker Compose mounts the `chat2api-data` volume at `/data`. Back this up
if you care about provider accounts and API keys.

## Reverse proxy / TLS

Chat2API speaks plain HTTP. Put it behind Caddy, Nginx, Traefik, or
Cloudflare for TLS.

### Caddy

```caddyfile
chat2api.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name chat2api.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
```

Allow `POST /v0/management/oauth/bookmarklet/ingest` through any WAF so
the bookmarklet can POST from provider origins.

## Optional LiteLLM sidecar

See `docs/litellm.md` and `docker-compose.litellm.yml`.

## Environment variables

See `.env.example` for the web-facing surface. Qwen-specific tuning remains
documented in `docs/docker.md`.
