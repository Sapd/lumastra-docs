---
title: Configuration
description: How Lumastra is configured, the three-layer model and key settings.
---

Settings resolve in this order (highest priority first):

1. **Environment variables**, set through `.env` or orchestrator secrets.
2. **Admin → Settings**, persisted in `/config/settings.json` on the config volume.
3. **Compiled defaults**.

Most URLs and API keys support both environment and UI configuration. JWT/master
keys and proxy-trust settings are environment-only.

## Finding and changing settings

Open **Admin → Settings** and use the search field to find settings across pages.
Search accepts words in any order, setting names, environment variable names and
common terms such as “hardware transcoding”. Results link to the matching setting.

The location trail shows **Settings → Page → Section**, including on smaller
screens. Selecting a section updates the address; use browser Back and Forward to
revisit sections, or bookmark a setting link to return directly to it.

A disabled setting explains what controls it. Follow its prerequisite link to the
controlling option. Search may show an inactive setting so you can find it, but
you must satisfy its prerequisite before editing it. Environment overrides name
the variable to change in your deployment; environment-only settings cannot be
changed through the admin form.

## Secrets at rest

`LUMASTRA_MASTER_KEY` encrypts stored integration and webhook secrets. Keep it stable
and back it up separately; losing it makes those secrets undecryptable.
`JWT_SECRET` signs tokens and can be rotated independently when explicitly set.

Without an explicit master key, the instance creates `<config-dir>/master.key`.
Replicas must share that config volume or use the same `LUMASTRA_MASTER_KEY`.
Divergent keys cause decryption failures and, when `JWT_SECRET` is derived from the
master key, intermittent logouts. Divergence raises a critical admin alert and appears
in **System → Health → Cluster**.

See [Backup & recovery](/guides/backup-recovery/) for backup and rotation.

## Common variables

| Variable              | Required           | Purpose                                          |
| --------------------- | ------------------- | -------------------------------------------------- |
| `DATABASE_URL`        | Yes                 | PostgreSQL connection string (needs pgvector)    |
| `CACHE_URL`           | In deployment examples | Disposable evictable cache Valkey URL |
| `TASK_CACHE_URL`      | Yes | Dedicated persistent `noeviction` Valkey for tasks and shared coordination |
| `LUMASTRA_MASTER_KEY` | Yes (with secrets)  | Encrypts stored secrets                          |
| `JWT_SECRET`          | Optional            | Signs session / access tokens. Derived from `LUMASTRA_MASTER_KEY` when unset |
| `FORWARD_AUTH_ENABLED` | For forward auth   | Read identity headers at all (default off), environment only |
| `TRUSTED_PROXY_IPS`   | Behind a proxy      | Proxy addresses allowed to set identity headers  |
| `ORIGIN`              | Behind a proxy / HTTPS | Public address, marks the login cookie `Secure` |
| `NODE_ENV`            | Recommended         | Set `production` for deployments                 |

`TASK_CACHE_URL` has no fallback to `CACHE_URL`. When both are configured, they must
use different server endpoints. Different database numbers, credentials or TLS schemes
on the same host and port do not separate eviction policy; startup rejects that layout.
Different DNS aliases are not proof of different servers: ensure they resolve to separate
instances. After transient startup failures, web task coordination retries automatically
with delays from one second up to thirty seconds. Fix invalid endpoint configuration and
restart the process; permanent configuration errors are not retried.

Optional providers (TMDB, Discogs, MDBList, Sonarr, Radarr and similar) need no
configuration to start. While one is not set up, the worker logs `WARN` lines such as
"provider not configured" or "dropped from the enrichment chain". They are expected and
harmless; the affected metadata is just missing until you add the key.

See the full [Environment Variables reference](/reference/environment-variables/)
for every option, and [Authentication](/guides/authentication/) for the
proxy-trust model.

## Startup validation

Configuration is validated before migrations. Errors (such as mismatched embedding
dimensions) block startup and appear in container logs. Run the doctor manually:

```bash
npm run doctor
```

For a fuller check that also tests database and cache connectivity (useful
right after a fresh install), run the preflight script instead:

```bash
docker compose exec lumastra npx tsx --tsconfig tsconfig.scripts.json scripts/preflight.ts
```

:::caution[Escape hatch]
If the preflight check reports errors and you need to boot past them anyway,
set `LUMASTRA_SKIP_PREFLIGHT=true`. The check still runs and logs its
findings; this only stops it from blocking startup.
:::

## Reverse proxy & forward-auth headers

Identity for forward auth arrives as plain HTTP headers, so Lumastra only
trusts them from known peers:

| Variable                   | Default               | Description                                                              |
| --------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `USERHEADER`               | `X-Forwarded-User`     | Header carrying the authenticated username                                |
| `GROUPHEADER`              | `X-Forwarded-Groups`   | Header carrying the user's groups (`\|`-separated)                        |
| `FORWARD_AUTH_ENABLED`     | `false`                | Read the identity headers at all. Off: ignored from every peer, so `TRUSTED_PROXY_IPS` alone signs nobody in. Environment only: Admin → Settings cannot change it |
| `TRUSTED_PROXY_IPS`        | unset (fail-closed)    | Comma-separated proxy addresses allowed to set the identity headers, **required** behind a reverse proxy. List every proxy hop and no LAN range (see [Reverse proxy](/guides/reverse-proxy/#trusted_proxy_ips)) |
| `LUMASTRA_TRUST_ANY_PROXY` | `false`                | Trust identity headers from any peer, single private host only            |

Forward auth fails closed when neither proxy-trust setting is configured.

The built-in-login session cookie is marked `Secure` unless the request shows plain
HTTP: the browser's `Origin` on the sign-in request, or the proxy's `X-Forwarded-Proto` header
from a `TRUSTED_PROXY_IPS` address (or from any address while that list is empty).
Behind a reverse proxy or on HTTPS, set `ORIGIN` to your `https` address. It is required
there: it makes the cookie `Secure` on every request, also for an app sign-in that sends
no `Origin` header through an inner proxy that reports `http`.

These paths authenticate their own clients and must bypass the proxy's identity gate.
Otherwise token/device clients fail or enter redirect loops:

| Path         | Why it self-authenticates                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| `/j/`        | Jellyfin-compatible clients (Emby token or `api_key` query param)            |
| `/subsonic/` | Subsonic/OpenSubsonic clients (`u`/`t`/`s` or `p`/`apiKey` query params)     |
| `/api/v1/`   | Bearer/PAT/service tokens for TV apps, scripts, automation                   |
| `/oauth/`    | Device-authorization flow, polled by devices with no browser session        |

For server-sent events (Watch Together and admin live views), disable buffering and
raise timeouts above the 10-second keepalive interval. On nginx, use
`proxy_buffering off;` and an appropriate `proxy_read_timeout`.

See [Authentication](/guides/authentication/) for the full proxy-trust model
and [Single sign-on with Authentik](/guides/sso-authentik/) for a complete
nginx example with all the bypass locations wired up.

## Generated media paths

| Variable            | Default               | Description                                                                                                 |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `BASE_PATH`         | container default    | Where extracted artwork, trickplay sprite sheets, and the ffmpeg/image-sync cache are written. Mount it as a shared **RWX** volume so web and worker see the same files. |
| `TRICKPLAY_ENABLED` | `false`               | Generate hover-preview thumbnail sprite sheets with `ffmpeg`                                                    |
| `FFMPEG_PATH`       | `ffmpeg` (on `PATH`)  | Absolute path to the `ffmpeg` binary, set explicitly on installs that don't put it on `PATH`                    |
| `FFPROBE_PATH`      | `ffprobe` (on `PATH`) | Absolute path to the `ffprobe` binary                                                                           |

Keep `BASE_PATH` persistent and shared before enabling trickplay. All four settings
can also be saved at **Admin → Settings**:

```json
{
    "FFMPEG_PATH": "/usr/bin/ffmpeg",
    "FFPROBE_PATH": "/usr/bin/ffprobe",
    "TRICKPLAY_ENABLED": true,
    "BASE_PATH": "/data/media"
}
```

## Live TV / stream proxy

The stream-proxy container relays live channels and needs its own env vars,
covered in full in the [Live TV guide](/guides/live-tv/):

| Variable               | Set on                | Description                                                                |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------- |
| `STREAM_PROXY_URL`     | app + worker             | URL of the stream-proxy container, required once Live TV is on                |
| `STREAM_PROXY_SECRET`  | app + worker + proxy     | Shared secret authenticating requests to the proxy                            |
| `LIVETV_SOURCE`        | app                      | `standalone` (default) or `disabled`, you normally don't need to set this    |

## Feature flags

Features are toggled with `FEATURE_*` variables. Most default **on**, but Live TV,
Subsonic compatibility, comments, media downloads, Gravatar and some preview features
default **off**. Each only does something once its backing service is configured. For example,
`FEATURE_AI_RECOMMENDATIONS` needs an AI provider key, and `FEATURE_JELLYFIN_SYNC`
needs a Jellyfin URL and key. Set a flag to `false` to disable a feature outright.

The **sonic music** features (`FEATURE_MUSIC_SONIC` and friends) also default **off**,
and need the embedder sidecar reachable at `SONIC_EMBEDDER_URL`.
That sidecar runs Microsoft's CLAP-2023 model whose weights download from HuggingFace
at runtime; for air-gapped hosts set `SONIC_MODEL_FP` to a local weights file. See
[Music discovery](/guides/music-discovery/) and the
[environment variables reference](/reference/environment-variables/#sonic-music-embedder).

### Background workers

Run the web role with `start.sh` (`WORKER_MODE=disabled`) and exactly one dedicated
worker with `start-worker.sh`. The worker starts the lean TypeScript task host,
existing tasks/plugins and one supervised Rust watcher child in its container.
The web tier can submit work while the worker is temporarily unavailable; accepted
jobs remain queued. Keep both roles for a functioning installation. There is no
combined web/worker mode or task-runtime opt-in selector. BullMQ and the two Valkeys
retain their existing task/shared-coordination and disposable-cache roles.

On constrained hosts, `LUMASTRA_LOW_RAM_MODE=true` caps the Node.js heap and
also makes BullMQ Queue connections share a single Valkey client instead of
one per queue, cutting connection overhead. `FEATURE_SHARED_QUEUE_CONNECTION`
overrides that sharing behavior explicitly, for example to force it off
while still capping the heap, and defaults to whatever
`LUMASTRA_LOW_RAM_MODE` is set to.
