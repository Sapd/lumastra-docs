---
title: Environment Variables
description: Reference for Lumastra's environment variables.
sidebar:
  order: 1
---

The variables below are grouped by area: core settings, performance tuning,
authentication, AI, and the optional integrations.

The canonical variable names are those in `.env.example`. Most service URLs and
keys can also be set in the admin **Settings** UI; the secrets below are
environment-only.

## Core

| Variable              | Required           | Default                  | Description                                          |
| --------------------- | ------------------- | -------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`        | Yes                 | —                          | PostgreSQL connection string (needs pgvector)        |
| `CACHE_URL`           | Yes                 | —                          | Valkey/Redis URL (cache + task queues)               |
| `TASK_CACHE_URL`      | No                  | falls back to `CACHE_URL` | Separate Valkey for task/BullMQ state. Point at a `noeviction` instance to isolate it from cache eviction (multi-replica). |
| `LUMASTRA_MASTER_KEY` | **Yes** for multi-replica | auto-generated at `<config>/master.key` | Encrypts stored secrets and client credentials; derives `JWT_SECRET` when that is unset. Keep stable and back it up. Replicas that share neither this variable nor the `/config` volume generate **different** keys. See [Configuration → Secrets at rest](/guides/configuration/#secrets-at-rest). |
| `JWT_SECRET`          | For token auth      | —                          | Signs session / access tokens (≥ 32 chars)           |
| `NODE_ENV`            | Recommended         | —                          | Set `production` for deployments                     |
| `ORIGIN`              | Recommended         | —                          | Public origin (`https://host`). When it's `https`, login cookies are always `Secure`. The host must match the address in the browser, or sign-in and other form posts fail with `403`. Leave it unset for plain-HTTP access on your local network. |
| `BASE_PATH`           | No                  | container default          | Where artwork / trickplay / the ffmpeg cache are written. Mount it as a shared **RWX** volume so web + worker share it. |
| `PORT`                | No                  | `3000`                     | App listen port                                      |
| `WORKER_MODE`         | No                  | `enabled`                  | `enabled` / `disabled` / `auto`. Multiple `enabled` replicas are supported: per-class leader locks elect leadership independently across them. Running **exactly one** is still the recommended deployment, since it's simpler to reason about. |
| `INSTANCE_ID`         | No                  | hostname + random suffix   | Node name for the cluster/admin UI. The random suffix means the default is **not** stable across restarts (it avoids a Valkey key collision when the same hostname restarts in a new container); set it explicitly if you need a name that persists. |
| `LOG_LEVEL`           | No                  | `info`                     | `debug` / `info` / `warn` / `error`                  |
| `TZ`                  | No                  | UTC (container default)    | The container's time zone (e.g. `Europe/Berlin`, set in `docker-compose.yml`). Daily and weekly [task triggers](/guides/task-monitoring/#triggers-when-a-task-runs) fire in this zone. There's no separate in-app setting for it. |
| `LUMASTRA_SKIP_PREFLIGHT` | No              | `false`                    | Boot past preflight **errors**. The check still runs and logs its findings; this only stops it blocking startup. |
| `TRICKPLAY_ENABLED`   | No                  | `false`                    | Generate hover-preview thumbnail sprite sheets with `ffmpeg` |
| `FFMPEG_PATH`         | No                  | `ffmpeg`                   | Path to the `ffmpeg` binary (override to use a custom build) |
| `FFPROBE_PATH`        | No                  | `ffprobe`                  | Path to the `ffprobe` binary                         |

## Performance tuning

Mostly relevant for **very large libraries** or busy servers. See
[Performance tuning](/guides/performance-tuning/) for guidance.

| Variable                           | Default | Description                                                              |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------- |
| `LUMASTRA_SCAN_CONCURRENCY`        | `8`     | Files processed in parallel per library scan. Keep ≤ the task DB pool; match it to NFS `nconnect`. |
| `SCAN_ENRICH_INLINE`               | `false` | `true` fills TMDB metadata inline during scan (offline installs); off defers it to a background stage. |
| `DISABLE_FILE_LIBRARY_SCAN`        | `false` | `true` disables the periodic (hourly) full library scan **and** the scheduled fallback. Set it only if you drive scans yourself (e.g. via the API after uploads). Note: on inotify-less media (S3/Mountpoint) this periodic scan is what ingests new files; don't disable it there. |
| `LUMASTRA_SCAN_STAT_BATCH_SIZE`    | `200`   | Files `stat()`-ed per triage batch. Lower only for very slow storage.   |
| `LUMASTRA_DB_POOL_WEB_MAX`         | `8`     | Postgres pool size for user-facing web/API requests                     |
| `LUMASTRA_DB_POOL_TASK_MAX`        | `7`     | Postgres pool size for background tasks/scans (raise on a worker container) |
| `LUMASTRA_DB_POOL_ADMIN_MAX`       | `4`     | Postgres pool size for admin polling                                    |
| `UV_THREADPOOL_SIZE`               | `64`*   | libuv threads for async file/DNS/crypto ops (*image default; Node's is 4). Large so file I/O can't starve DNS/DB connects. |
| `LUMASTRA_FS_MAX_CONCURRENCY`      | `24`    | Process-wide cap on concurrent guarded filesystem ops; kept under `UV_THREADPOOL_SIZE` so a slow NFS mount can't saturate the pool. |
| `LUMASTRA_FS_TIMEOUT_MS`           | `15000` | Per-op timeout for guarded filesystem ops (a hung NFS read fails fast instead of hanging the task). |
| `LUMASTRA_CONCURRENCY_*`           | varies  | Per-resource-class task caps (the heavy-job parallelism knobs): `CPU` _auto_ `floor(cores/2)` 1–6, `IO` _auto_ `cores` 4–12, `INGEST` 2, `BULK` 3, `EMBEDDING` 1, `ANALYSIS` 1, `MAINTENANCE` 1, `DISCOVERY` 1. Under per-task queues `INGEST`+`BULK` fold into `IO` and `ANALYSIS` into `CPU` (caps summed). |
| `LUMASTRA_LOW_RAM_MODE`            | `false` | Caps the Node.js heap and reduces Valkey connection overhead on the worker. Recommended on constrained hosts (Raspberry Pi-class, <4 GB). See [Memory](/start/quick-start/#memory). |

> Pool totals are per instance; the sum across all replicas must stay under Postgres'
> `max_connections` (default 100). Raise `max_connections` if you scale pools or replicas.
> Also set **`shm_size: 1gb`** on the Postgres container (compose): the 64 MB default
> `/dev/shm` causes parallel-query failures on large libraries. See
> [Performance tuning](/guides/performance-tuning/).

## Reliability & topology

| Variable | Default | Description |
| --- | --- | --- |
| `WORKER_MODE` | `enabled` | `enabled` runs task workers + can lead; `disabled` = enqueue-only web tier |
| `LUMASTRA_ORCHESTRATOR_LEADER_TTL_MS` | `15000` | **Advanced (rarely tuned).** Per-class leader-lock TTL. Raise to `30000` on a single heavy worker to avoid leadership flapping under cold-start backlog. |
| `LUMASTRA_ORCHESTRATOR_LEADER_RENEW_MS` | `5000` | **Advanced.** Leader-lock renew cadence (must be `<` TTL). |
| `LUMASTRA_RUN_STATE_TTL_ACTIVE_MS` | `900000` | **Advanced.** Zombie self-heal window: a crashed run is reclaimed ~15 min after its last heartbeat. |
| `PREVIEW_CACHE_DIR` | `/config/cache/preview` | Where hover-preview clips are cached as small content-addressed VOD artifacts. On a **multi-instance** web tier, put this on shared storage (it rides the `config` volume by default) so any instance can serve a finished preview from disk. See [Zero-downtime updates › Hover previews](/guides/zero-downtime-updates/#hover-previews-need-a-shared-preview-cache-too). Single-instance needs nothing. |
| `PREVIEW_CACHE_ENABLED` | `true` | Set `false` to disable the hover-preview disk cache entirely (every hover re-transcodes on demand). |

## Authentication

The three methods coexist. See [Authentication](/guides/authentication/). `ADMIN_GROUPS`
applies to both forward auth and OIDC.

### Forward auth / proxy

| Variable                   | Required        | Default             | Description                                            |
| ---------------------------- | ------------------ | ---------------------- | --------------------------------------------------------- |
| `FORWARD_AUTH_ENABLED`     | For forward auth | `false`               | Read identity headers at all. Off: ignored from every peer. Upgrading forward-auth installs must set `true` |
| `TRUSTED_PROXY_IPS`        | Behind a proxy   | (unset → fail-closed) | IPs/CIDRs allowed to set identity headers (with `FORWARD_AUTH_ENABLED`) and `X-Forwarded-For`|
| `LUMASTRA_TRUST_ANY_PROXY` | No               | `false`               | Trust any peer's identity headers (single host only)  |
| `USERHEADER`               | No               | `X-Forwarded-User`    | Header carrying the authenticated username             |
| `GROUPHEADER`              | No               | `X-Forwarded-Groups`  | Header carrying the user's groups (`\|`-separated)    |
| `ADMIN_GROUPS`             | No               | `admin`               | Groups granted admin (case-insensitive)               |
| `DEFAULT_USER`             | No (dev only)    | `admin`               | Fallback user when no header is present (development only) |
| `PROTOCOL_HEADER`          | Behind TLS proxy | `x-forwarded-proto`   | Header the app reads to learn the external scheme. Needed so session cookies get their `Secure` flag when TLS terminates at the proxy. |
| `HOST_HEADER`              | Behind a proxy   | `x-forwarded-host`    | Header the app reads to learn the external host      |

### Built-in (native) login

| Variable                       | Required | Default | Description                                                         |
| --------------------------------- | ---------- | --------- | ------------------------------------------------------------------------ |
| `AUTH_NATIVE_LOGIN_ENABLED`    | No       | `false` | Enable username/password login (auto-set when first native admin is created) |
| `NATIVE_AUTH_SESSION_TTL_DAYS` | No       | `30`    | Session-cookie lifetime in days                                     |

### OIDC

| Variable                           | Required        | Default               | Description                                                    |
| -------------------------------------- | ------------------ | ------------------------- | -------------------------------------------------------------------- |
| `AUTH_OIDC_ENABLED`                | For OIDC        | `false`               | Enable the OIDC client (also needs issuer + client ID)         |
| `AUTH_OIDC_ISSUER`                 | For OIDC        | —                     | Provider issuer / discovery base URL                           |
| `AUTH_OIDC_CLIENT_ID`              | For OIDC        | —                     | OAuth client ID                                                |
| `AUTH_OIDC_CLIENT_SECRET`          | No              | —                     | Client secret (empty = public/PKCE-only client)                |
| `AUTH_OIDC_SCOPES`                 | No              | `openid profile email` | Space-separated scopes (must include `openid`)                |
| `AUTH_OIDC_GROUPS_CLAIM`           | No              | `groups`              | Claim (dot-path ok) carrying groups, matched vs `ADMIN_GROUPS` |
| `AUTH_OIDC_PROVIDER_NAME`          | No              | `Single Sign-On`      | "Sign in with…" button label                                   |
| `AUTH_OIDC_REDIRECT_URI`           | No              | (auto)                | Override the `…/auth/oidc/callback` redirect URI               |
| `AUTH_OIDC_LINK_BY_VERIFIED_EMAIL` | No              | `true`                | Auto-link to an existing account on a verified-email match     |
| `AUTH_OIDC_LINK_BY_USERNAME`       | No              | `false`               | Auto-link by username (less safe; for migration)               |
| `AUTH_OIDC_USERINFO`               | No              | `false`               | Fetch UserInfo when groups/email absent from the ID token      |
| `AUTH_OIDC_ALLOW_INSECURE`         | No              | `false`               | Allow a non-HTTPS issuer (**test IdPs only**)                  |
| `AUTH_OIDC_BACKCHANNEL_LOGOUT_CASCADE` | No          | `false`               | On a user-wide (`sub`) back-channel logout, also revoke the user's device tokens |

## AI

Setting any of these keys sends library descriptions and user prompts to that
provider. See [What Lumastra sends where](/reference/data-flows/) before you do.
`ANTHROPIC_API_KEY`, `ASSISTANT_PROVIDER`, `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`
and `EMBEDDING_BASE_URL` (custom or on-premise endpoints) are documented in the
admin Settings UI under **AI assistant**.

| Variable               | Required | Default        | Description                                       |
| ---------------------- | -------- | -------------- | --------------------------------------------------- |
| `OPENAI_API_KEY`       | No       | —              | OpenAI embeddings + chat                          |
| `OPENAI_CHAT_MODEL`    | No       | `gpt-4o-mini`  | Chat model for the assistant                      |
| `VOYAGE_API_KEY`       | No       | —              | Alternative: Voyage AI embeddings                 |
| `EMBEDDING_MODEL`      | No       | (auto-detect)  | e.g. `text-embedding-3-small`, `voyage-3-large`   |
| `EMBEDDING_DIMENSIONS` | No       | `0` (auto)     | Vector dims (**must match the model**)            |

## Sonic music embedder

For the [sonic music features](/guides/music-discovery/). The sidecar
(`ghcr.io/lumastra/lumastra-sonic-embedder`) runs Microsoft's **CLAP-2023** model via
the `msclap` package; its weights download from HuggingFace (`microsoft/msclap`) at
runtime, not bundled by Lumastra (review the
[model card](https://huggingface.co/microsoft/msclap) for the weight terms).

| Variable                 | Set on            | Required          | Default                    | Description                                                                                          |
| --------------------------- | ------------------- | -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SONIC_EMBEDDER_URL`     | app + worker      | For sonic         | —                          | HTTP URL of the embedder sidecar (e.g. `http://lumastra-sonic-embedder:8000`). Required by any `FEATURE_MUSIC_SONIC*`. |
| `SONIC_EMBEDDER_THREADS` | sidecar           | No                | (all cores)                | PyTorch CPU thread cap. Keep it modest (e.g. `4`) on shared hardware so playback stays responsive     |
| `MODEL_ID`               | sidecar           | No                | `msclap-2023`              | Model identifier recorded with the embeddings                                                         |
| `HF_HOME`                | sidecar           | No                | `/app/.cache/huggingface`  | HuggingFace cache for the downloaded CLAP weights. Mount a persistent volume here to download once    |
| `SONIC_MODEL_FP`         | sidecar           | No                | —                          | Absolute in-container path to a local CLAP weights `.pth`. Set it (with a read-only mount) for air-gapped / offline installs; the sidecar then loads locally and never reaches HuggingFace |

## Branding

All optional; defaults render the bundled Lumastra identity. Logo values are
absolute URLs or paths relative to `/static/`.

| Variable               | Default          | Description                                                            |
| ------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `APP_NAME`             | `Lumastra`       | App name in the header, browser title, and installed PWA              |
| `APP_DESCRIPTION`      | `Media Dashboard`| Meta description (SEO + PWA manifest)                                  |
| `APP_LOGO_SMALL`       | (bundled)        | Square navbar logo                                                     |
| `APP_LOGO_FULL`        | (bundled)        | Wide logo for splash / header                                         |
| `APP_LOGO_PLAY`        | (bundled)        | Small play-button icon on cards                                       |
| `APP_BACKGROUND_IMAGE` | (bundled)        | Full-page background wallpaper                                         |
| `APP_THEME_COLOR`      | `#7c3aed`        | Tints the installed PWA titlebar + the mobile browser address bar     |
| `APP_BACKGROUND_COLOR` | `#0f172a`        | PWA splash-screen background shown while the app boots                 |
| `WEB_APP_INSTALL_HINT` | `true`           | "Get the app" hint for Safari on iPhone/iPad (HTTPS only); `false` hides it |
| `CHATBOT_NAME`         | (bundled)        | Display name of the AI assistant, if enabled                           |
| `CHATBOT_AVATAR`       | (bundled)        | Avatar image for the AI assistant                                      |

### Custom asset folder

Mount a folder of your own images read-only at `/app/build/client/custom` and reference
them as `/custom/<file>` in the variables above:

```yaml
services:
    lumastra:
        volumes:
            - /path/to/my-branding:/app/build/client/custom:ro
        environment:
            - APP_NAME=MyDashboard
            - APP_LOGO_SMALL=/custom/my-button.png # ~400×400, square
            - APP_LOGO_FULL=/custom/my-fulllogo.png # ~1000×300, wide
            - APP_LOGO_PLAY=/custom/my-play-24.png # 24×24
            - APP_BACKGROUND_IMAGE=/custom/my-background.jpg # 1920×1080 or larger
```

The default logos served at `/branding/…` and the PWA install icons aren't env vars.
Override the bundled files by mounting your own over them:

| Mount over                                                       | What it replaces          |
| -------------------------------------------------------------------- | ------------------------------ |
| `/app/build/client/branding/lumastra-icon.svg`                   | Default small logo / icon |
| `/app/build/client/branding/lumastra-logo-horizontal-ondark.svg` | Default full logo         |
| `/app/build/client/favicon.png`                                  | Browser favicon (48×48)   |
| `/app/build/client/icon-192.png`, `icon-512.png` (+ `-maskable`) | PWA install icons         |
| `/app/build/client/apple-touch-icon.png`                         | iOS home-screen icon      |

A few in-app brand usages (the About dialog, for one) are compiled into content-hashed
assets and keep the Lumastra identity. See
[Editions & Licensing](/guides/licensing/) for what a full rebrand of a fork involves.

:::tip[Behind a reverse proxy?]
Keep `manifest.json` and the icon files reachable **without** authentication, or the
PWA install prompt shows a generic icon: the browser fetches them credential-less.
See [SSO with Authentik](/guides/sso-authentik/#2-wire-up-the-reverse-proxy).
:::

## Navigation links

Three JSON-array variables replace the default footer buttons, sidebar entries and
avatar-menu items. Each entry takes `label`, `url`, `icon` (a Heroicons name or a path
under `/static/`) and optional `external` (default `true`; set `false` for in-app
routes). Sidebar entries also accept `groups`, a list of group names that must match
for the entry to show; the special group `__ADMIN__` means "admins only".

| Variable          | Replaces                                  |
| -------------------- | ---------------------------------------------- |
| `FOOTER_LINKS`    | The action buttons in the footer area     |
| `SIDEBAR_LINKS`   | The sidebar / dock navigation             |
| `USER_MENU_LINKS` | The avatar popup menu                     |

```bash
FOOTER_LINKS='[
  {"id":"request","label":"Request Movie","url":"https://requests.example.com","icon":"film","variant":"ghost-secondary"},
  {"id":"chat","label":"AI Assistant","url":"/chat","icon":"sparkles","variant":"ghost-primary","external":false},
  {"id":"quickconnect","label":"Quick Connect","icon":"command-line"}
]'
SIDEBAR_LINKS='[
  {"label":"Home","url":"/","icon":"home","external":false},
  {"label":"Browse","url":"/browse","icon":"/icons/browse.svg","external":false},
  {"label":"Admin","url":"/admin","icon":"cog-6-tooth","external":false,"groups":["__ADMIN__"]}
]'
USER_MENU_LINKS='[
  {"label":"Settings","url":"https://auth.example.com","icon":"cog-6-tooth"},
  {"label":"Logout","url":"https://auth.example.com/logout","icon":"arrow-right-on-rectangle"}
]'
```

Footer entries carry an `id`; the special id `quickconnect` opens the Jellyfin Quick
Connect dialog and needs no `url`. The same links can be managed from the admin UI
under **Settings → Homepage & navigation**, which is the easier route if you don't
manage configuration as code.

## Optional integrations

Each key below enables outbound calls to that service; what each one receives is
listed in [What Lumastra sends where](/reference/data-flows/). The iOS push
settings (`FEATURE_PUSH_NOTIFICATIONS`, `PUSH_RELAY_URL`, `PUSH_RELAY_TOKEN`,
`PUSH_TRANSPORT`, `APNS_KEY_P8`) live in the admin Settings UI under **Social**;
the default relay is run by the Lumastra maintainer and is covered on that page.

| Variable                          | Description                          |
| ------------------------------------ | --------------------------------------- |
| `TMDB_API_KEY`                    | Metadata, images, search             |
| `MDBLIST_API_KEY`                 | Aggregated ratings + keyword tags    |
| `OMDB_API_KEY`                    | OMDB / IMDB ratings                  |
| `LASTFM_API_KEY`                  | Music popularity                     |
| `DISCOGS_TOKEN`                   | Artist / album enrichment            |
| `JELLYFINURL` / `JELLYFINAPIKEY`  | Jellyfin background **sync** (the `/j` compat API needs neither) |
| `AUDIOURL` / `AUDIOAPIKEY`        | AudiobookShelf: the key needs **admin** rights so per-listener keys can be minted. See [Audiobooks](/guides/audiobooks/) |
| `KAVITAURL` / `KAVITAAPIKEY`      | Kavita (books / manga / comics)      |
| `SONARRURL` / `SONARRAPIKEY`      | Sonarr (TV calendar)                 |
| `RADARRURL` / `RADARRAPIKEY`      | Radarr (movie calendar)              |
| `SEERRURL` / `SEERRAPIKEY` | Seerr (requests)             |

## Audiobooks

| Variable                       | Default | Description                                                                                                                                 |
| ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUDIOBOOK_REMUX_MAX_PER_USER` | `2`     | Concurrent on-the-fly remuxes one listener may hold on a single instance. Each is an ffmpeg process started at a requested offset, and dragging the scrubber can ask for several in a second. `0` disables the cap. |

See [Audiobooks](/guides/audiobooks/) for the rest of the setup.

## Live TV

Most Live TV settings are managed in the admin UI and covered in the
[Live TV guide](/guides/live-tv/). The egress/privacy variable:

| Variable | Default | Description |
| --- | --- | --- |
| `LIVETV_SOURCE` | `standalone` | `standalone` uses Lumastra's own Live TV stack; `disabled` turns the subsystem off entirely. |
| `STREAM_PROXY_URL` | (unset) | Base URL of the Live TV stream proxy that pulls and re-serves channel streams. |
| `STREAM_PROXY_SECRET` | (unset) | Shared secret authenticating Lumastra to the stream proxy. Set the same value on both. |
| `LIVETV_UPSTREAM_PROXY_URL` | (unset → direct) | Forward **HTTP CONNECT** proxy for *all* outbound Live TV traffic to the source (M3U/XMLTV import, channel logos, Xtream validation, and live stream pulls), for networks that require an outbound proxy. Inline credentials supported. **Must be set on the app, worker, and stream-proxy containers** (each reads it independently). Fail-closed. See the [Live TV guide](/guides/live-tv/#sending-live-tv-through-an-outbound-proxy) and the [HTTPS-stream caveat](/architecture/live-tv/#outbound-proxy). |

## Sharing & privacy

What users on the same server can see about each other. See
[Sharing & privacy](/guides/sharing-privacy/) for the full picture.

| Variable                              | Default | Description                                                                                                    |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `SOCIAL_DEFAULT_AUDIENCE`             | `auto`  | Who can see each other's audiobook activity: `auto`, `household` (everyone on the server), or `groups`. `auto` uses `groups` when `SOCIAL_TRUST_GROUPS` names any, otherwise `household`. |
| `SOCIAL_TRUST_GROUPS`                 | empty   | Groups for `groups` mode; two users see each other only if they share one named here. Separate groups stay separate. **Empty means nobody**, not everyone. |
| `SOCIAL_REVIEW_GROUPS`                | empty   | Who may write community reviews. **Empty means everyone**, the opposite of `SOCIAL_TRUST_GROUPS`.              |
| `FEATURE_SESSIONS_PUBLIC`             | `true`  | Lets non-admins see other users' active sessions. Server-wide, not group-scoped. Requires `FEATURE_SESSIONS`.   |
| `FEATURE_SESSIONS_DEVICE_INFO_PUBLIC` | `false` | Also exposes client and browser names on those sessions.                                                       |

Users override all of this downward from **Settings → Privacy**; a per-book hide is
stronger still. Nothing here can force a user to share.

## Plugins

Extension loading and the signed-install trust gate. Full context in
[Plugins & extensions](/guides/plugins/).

| Variable                           | Default        | What                                                             |
| --------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `PLUGINS_ENABLED`                  | `true`         | Set `false` to load no external plugins at all                   |
| `PLUGINS_EXTERNAL_DIR`             | `/app/plugins` | Where plugin directories live                                    |
| `PLUGIN_TRUSTED_KEYS`              | *(unset)*      | `keyId:base64Spki` list, Ed25519. Required for signed install    |
| `PLUGINS_EXTERNAL_INSTALL_ENABLED` | `true`         | Set `false` to remove the remote-install endpoint entirely       |
| `PLUGINS_REQUIRE_REGISTRY`         | `false`        | Set `true` to load only signed, registry-managed plugins         |
| `PLUGIN_INSTALL_ALLOW_PRIVATE`     | `false`        | Allow manifest fetches from private IPs. Development only        |

Install resource caps below bound size and count only; they can never grant
trust: `PLUGIN_INSTALL_MAX_MANIFEST_BYTES` (64 KiB),
`PLUGIN_INSTALL_MAX_BUNDLE_BYTES` (8 MiB),
`PLUGIN_INSTALL_MAX_EXTRACTED_BYTES` (32 MiB),
`PLUGIN_INSTALL_MAX_FILE_BYTES` (8 MiB), `PLUGIN_INSTALL_MAX_ENTRIES` (2048),
`PLUGIN_INSTALL_FETCH_TIMEOUT_MS` (15000).

:::danger[Trusted keys are environment-only]
`PLUGIN_TRUSTED_KEYS` and the gate flags above are read from the environment and
never from `settings.json`. A trusted key editable from the admin UI would turn
any settings write into arbitrary code execution.
:::

## Feature flags

Every `FEATURE_*` flag, its default and what it gates is listed in
[FEATURE_* flags](/reference/feature-flags/); `FEATURE_SHARED_QUEUE_CONNECTION`
defaults to `LUMASTRA_LOW_RAM_MODE`'s value and can be set independently.

## Next

- [Configuration](/guides/configuration/)
- [Deploy with Docker](/guides/deploy-docker/)
- [Authentication](/guides/authentication/)
