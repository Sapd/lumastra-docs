---
title: Quick Start
description: Get a local Lumastra instance running with Docker Compose.
---

This guide gets a Lumastra instance running with Docker Compose. It takes about ten
minutes, plus the time for the first library scan.

## Prerequisites

- **Docker** ≥ 24 and **Docker Compose** ≥ 2.20
- **8 GB RAM** recommended. See [Memory](#memory) below for a breakdown per container.
- **20 GB disk** minimum (grows with metadata and the image cache)
- A supported **CPU** (see below)
- For access from other devices: a **domain and a reverse proxy with HTTPS**. The iPhone,
  iPad and Apple TV apps only connect over HTTPS. The
  [Reverse proxy guide](/guides/reverse-proxy/) has setups for Caddy, nginx, Traefik and
  Nginx Proxy Manager.
- Optionally an **identity provider** for single sign-on, through [OIDC](/guides/sso-oidc/)
  or a forward-auth reverse proxy. Lumastra also has built-in accounts, so you don't need
  one. See [Authentication](/guides/authentication/) for which to pick.

### Memory

Plan for 8 GB across the app, background jobs, PostgreSQL, and Valkey. The
background tasks that scan and analyse your library are the main reason; a small
library can run on about 4 GB in low-RAM mode, but it gets tight. The app typically uses a few hundred MB and the worker
about 1–1.6 GB during scans, embeddings, or thumbnail generation. PostgreSQL grows
with library size; Valkey typically uses tens of MB.

:::tip[Constrained hosts]
The example compose file already sets `LUMASTRA_LOW_RAM_MODE=true`. It caps the
Node.js heap and uses fewer Valkey connections for hosts with under about 4 GB.
On a host with plenty of RAM, remove that line from the compose file or set it to
`false`. See [Environment variables](/reference/environment-variables/).
:::

### CPU requirements

Lumastra runs on both **x86-64** and **ARM64**.

| Architecture         | Requirement                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **x86-64 (amd64)**    | A CPU with **x86-64-v2** support (**SSE4.2** and **POPCNT**), which the `sharp`/libvips image library needs. Any CPU since ~Intel Nehalem (2009) or AMD Bulldozer (2011) qualifies. |
| **ARM64 (aarch64)**   | Any standard **ARMv8-A** CPU (Apple Silicon, AWS Graviton, Ampere, Raspberry Pi 4/5 on a 64-bit OS). Uses NEON; no special extension needed. |

:::caution[Old or emulated virtual machines]
Use `host-passthrough` or a Nehalem/Westmere-equivalent VM CPU model. Older
emulated models such as `qemu64` and `kvm64` may lack SSE4.2/POPCNT.
:::

:::note[ARM caveat]
The Essentia audio-analysis binary only exists for x86-64, so on ARM64 the music
**BPM and mood analysis is off**, and the DJ crossfades and mood picks work without
those signals. The optional sound-similarity sidecar and Intel Quick Sync / VA-API
hardware transcoding are x86-64 only as well; software transcoding works normally.
Everything else works the same. See
[Known limitations](/reference/known-limitations/#what-is-unavailable-on-arm64).
:::

## The stack

The example compose file starts **three containers**:

| Container  | Role                                                    |
| ---------- | -------------------------------------------------------- |
| `lumastra-postgres` | PostgreSQL 18 + pgvector (catalog, users, vectors) |
| `lumastra-valkey` | Valkey 9: cache, task queues, locks |
| `lumastra` | The Lumastra app (SvelteKit on Node.js ≥ 22; the shipped image runs Node 24), port 3000. It also runs the background jobs (metadata, images, embeddings) |

For heavier multi-user load you can move the background jobs into a separate
`worker` container. The example file has a commented-out "SCALE-UP" section for
that; see [Deploy with Docker](/guides/deploy-docker/).

:::tip[Install with an AI assistant]
Prefer to let an AI assistant with shell access (Claude Code, Codex, Cursor and similar)
do the steps below? Give it this prompt:

```text wrap
Read https://lumastra.org/install.md and follow it to install Lumastra on this server. Ask me before anything you can't check yourself.
```

The file walks it through the same steps, tells it what to ask you, and keeps the
generated secrets out of the chat.

In Claude Code, you can install these instructions as a skill instead:

```text
/plugin marketplace add Sapd/lumastra
/plugin install lumastra-skills@lumastra
```

Then ask Claude to install Lumastra.
[Read the skill's source on GitHub](https://github.com/Sapd/lumastra/tree/main/plugins/lumastra-skills).
:::

## 1. Get the example files

```bash
mkdir lumastra && cd lumastra
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/Sapd/lumastra/main/docker-compose.example.yml
curl -fsSL -o .env https://raw.githubusercontent.com/Sapd/lumastra/main/.env.example
```

This downloads the two files into a new folder. The compose file mounts nothing from
the repository and pulls the published image, so you don't need the source. Clone the
repository only if you want to [build from source](/developers/local-development/).

:::caution[The secrets file must be named `.env`]
The compose file uses `${DATABASE_PASSWORD}`-style variables. Docker Compose fills
those in from your shell or from a file named exactly `./.env`, before it starts
anything; an `env_file:` entry can't provide them. With any other file name,
`docker compose up -d` stops with `required variable DATABASE_PASSWORD is missing a
value`. If you really want another name, pass `--env-file <name>` to **every** compose
command, including `down` and `logs`.
:::

:::note[Mount your media]
The example compose file mounts no media folder, so the app can't see your files
yet. Add one read-only line under `volumes:` of the `lumastra` service, for example
`- /path/to/media:/data/media:ro` (on Windows: `- C:/Users/you/Videos:/data/media:ro`).
In the setup wizard the folder then shows up under **Found these folders**. See
[Deploy with Docker → Volumes](/guides/deploy-docker/#volumes).

Audiobooks don't need a mount: they come from an Audiobookshelf server. On the
wizard's library step, open **Audiobooks from Audiobookshelf**, enter the server
URL and an admin API key, and pick its libraries. See [Audiobooks](/guides/audiobooks/).
:::

## 2. Generate secrets

One paste writes all three into `.env` (macOS and Linux):

```bash
sed -i.bak \
  -e "s|^DATABASE_PASSWORD=.*|DATABASE_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^CACHE_PASSWORD=.*|CACHE_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^# LUMASTRA_MASTER_KEY=.*|LUMASTRA_MASTER_KEY=$(openssl rand -hex 32)|" \
  .env && rm -f .env.bak
```

On Windows without WSL, `openssl` usually isn't installed. Run this in PowerShell in
the same folder instead; it does the same thing:

```powershell
function Hex($n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }
(Get-Content .env) `
  -replace '^DATABASE_PASSWORD=.*', "DATABASE_PASSWORD=$(Hex 24)" `
  -replace '^CACHE_PASSWORD=.*', "CACHE_PASSWORD=$(Hex 24)" `
  -replace '^# LUMASTRA_MASTER_KEY=.*', "LUMASTRA_MASTER_KEY=$(Hex 32)" |
  Set-Content .env
```

Or set the three lines by hand: `DATABASE_PASSWORD` and `CACHE_PASSWORD` take 48 hex
characters each, `LUMASTRA_MASTER_KEY` takes 64 (and remove the `# ` in front of it).

That's all `.env` needs to start. Integrations and metadata keys are entered in the
setup wizard and under **Admin → Settings**. The one worth adding early is a free
[TMDB API key](/guides/integrations/), which the setup wizard asks for: without it,
titles and artwork come from file names only.

Use hex, not base64. Both passwords end up inside `DATABASE_URL` and `CACHE_URL`, where
a `/`, `+` or `=` breaks the connection string. `JWT_SECRET` is optional: without it,
the token-signing secret is derived from the master key, the same on every replica.

`LUMASTRA_MASTER_KEY` encrypts every secret Lumastra stores. Keep it the same across
restarts and back it up separately. See
[Master key rotation](/guides/master-key-rotation/) for what to do if it's lost or
needs to change, and
[Configuration → Secrets at rest](/guides/configuration/#secrets-at-rest) for what
happens if replicas diverge.

## 3. Start

```bash
docker compose up -d
docker compose logs -f
```

On first boot the app **runs all database migrations by itself**. Look for
`✅ Schema migration completed successfully` in the logs. You don't need to run any SQL;
the `pgvector/pgvector:pg18` image already includes the vector extension.

## 4. Verify

```bash
# Health (the compose healthcheck hits this)
curl http://localhost:3000/api/health
```

The example compose file publishes port 3000 on `127.0.0.1` only, so this check works
right away. To reach the app from other machines on your network without a reverse
proxy, change `127.0.0.1:3000:3000` to `3000:3000` on the `lumastra` service, leave
`ORIGIN` unset, and open `http://<server-ip>:3000`. Sign-in works over plain HTTP, but
your password and session then cross the network unencrypted, and the iPhone, iPad and
Apple TV apps only connect over HTTPS. For those apps and for access from outside your
network, put the [reverse proxy](/guides/reverse-proxy/) in front. A reverse proxy
installed on the same host connects to `127.0.0.1:3000`, so keep the `ports:` block
then. If the proxy runs in the same compose file, remove the `ports:` block so the app
is only reachable through the proxy.

The admin-only config doctor at `/api/health/config` returns `401` before setup.
Run it locally instead:

```bash
docker compose exec lumastra npm run doctor
```

For database/cache connectivity checks, use:

```bash
docker compose exec lumastra npx tsx --tsconfig tsconfig.scripts.json scripts/preflight.ts
```

The doctor also runs at startup; configuration errors block boot and appear in the
logs. See [Startup validation](/guides/configuration/#startup-validation) for recovery.

## 5. Create your admin

Open `/setup`. The first screen, **Check your install**, shows what the server found
(database, Valkey, sidecars, hardware transcoding, config volume, reverse proxy and
HTTPS). Fix anything marked with a warning, or continue and come back to it later.
Then create the first admin:

- **OIDC:** single sign-on is recommended and pre-selected. Configure the provider in the
  wizard or with `AUTH_OIDC_*`, then sign in with an `ADMIN_GROUPS` account.
- **Forward auth:** pre-selected instead when the wizard sees an identity from a trusted
  reverse proxy. Your forwarded identity must belong to an `ADMIN_GROUPS` group.
- **Built-in login:** one click away. Choose a username and password.

See [Authentication](/guides/authentication/) for configuration and recovery.

The setup preference **Allow apps and third-party clients (Public API)** is on by
default. It enables native app sign-in, push notifications, and `/api/v1`. You can
change it later at **Settings → Access**.

The next step, **Your account is ready. Now the basics**, is optional and only shows
problems, such as a background worker that does not answer. Change anything on it later
in the admin settings.

## 6. Add your libraries

The library step lists the folders it found under `/data`, `/media`, `/mnt` and similar
places under **Found these folders**. If a folder groups your libraries, for example
`/data/media` holding `movies/`, `serien/` and `musique/`, the wizard looks one level
inside it.

- A folder named like a library gets its type preselected and is ticked. Names are
  recognised in English, German, French, Spanish, Portuguese, Italian, Dutch, Polish and
  Czech. For example, a movie library can be called `Movies`, `Filme`, `Films`,
  `Películas`, `Filmes` or `Filmy`; a TV library `TV Shows`, `Serien`, `Séries`, `Serie TV`
  or `Seriale`; a music library `Music`, `Musik`, `Musique`, `Muziek` or `Muzyka`.
- Folders such as `Kids` or `Documentaries` are listed without a type. Pick one to add
  them.
- Audiobook folders are never suggested. Audiobooks come only from Audiobookshelf.
- Ticked folders are added when you continue. The button shows the count, for example
  **Add 3 libraries and continue**.
- You can still type a folder path by hand under **Or enter a folder path**.

To use audiobooks, open **Audiobooks from Audiobookshelf** on the same step, enter the
server URL and an API key, and tick the book libraries to add. They are added when you
continue, like the folders.

After you continue, Lumastra scans the folders. If the scan ran without a TMDB API key,
or the key was rejected, the finish screen says so. Paste a key there and select
**Save key and re-scan**: the items are identified in place and keep their IDs. If you
add the key later under **Admin → Settings → Metadata**, libraries that were waiting for
a match are scanned again too.

## Needs internet on first start

The first start needs outbound internet. Each container that transcodes downloads
FFmpeg from GitHub, and the app contacts `lumastra.org` for the licence. On a host behind
a firewall, allow both, or see [What Lumastra sends where](/reference/data-flows/) for
the full list and for running offline. If you don't want any contact with `lumastra.org`,
set `LICENSE_SERVER_CONTACT_ENABLED=false` before the first start; the install then runs on
the free tier ([what that means](/guides/licensing/#run-without-contacting-lumastraorg)).
The same switch is in the setup wizard, but by then the server has usually fetched its
first key already.

## Next: put it behind HTTPS

The iPhone, iPad and Apple TV apps only connect over HTTPS with a trusted certificate.
The [Reverse proxy guide](/guides/reverse-proxy/) sets that up with Caddy, nginx,
Traefik or Nginx Proxy Manager.
