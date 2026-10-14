---
title: Environment Variables
description: Reference for Lumastra's environment variables.
sidebar:
  order: 1
---

The variables below are grouped by area: core settings, performance tuning,
authentication, AI, and the optional integrations.

Most settings are easier to change in the setup wizard and under **Admin → Settings**,
and every field there can also be set as an environment variable with the same name.
A value from the environment wins: the field in Admin → Settings then shows it and
can't be edited. `.env.example` lists only what a deployment needs before the app
runs; this page covers common deployment and tuning settings. The secrets and
deployment settings below are environment-only.

## Core

| Variable              | Required           | Default                  | Description                                          |
| --------------------- | ------------------- | -------------------------- | ------------------------------------------------------ |
| `DATABASE_PASSWORD` / `CACHE_PASSWORD` | Yes, with the example compose file | — (`.env.example` ships them empty) | Passwords for the bundled PostgreSQL and Valkey. The compose file builds `DATABASE_URL` / `CACHE_URL` from them and refuses to start while either is empty. Use hex (`openssl rand -hex 24`): they end up in connection strings. |
| `DATABASE_URL`        | Yes                 | —                          | PostgreSQL connection string (needs pgvector)        |
| `CACHE_URL`           | Yes                 | —                          | Valkey/Redis URL (cache + task queues)               |
| `TASK_CACHE_URL`      | No                  | falls back to `CACHE_URL` | Separate Valkey for task/BullMQ state. Point at a `noeviction` instance to isolate it from cache eviction (multi-replica). |
| `LUMASTRA_MASTER_KEY` | **Yes** for multi-replica | auto-generated at `<config>/master.key` | Encrypts stored secrets and client credentials; derives `JWT_SECRET` when that is unset. Keep stable and back it up. Replicas that share neither this variable nor the `/config` volume generate **different** keys. See [Configuration → Secrets at rest](/guides/configuration/#secrets-at-rest). |
| `JWT_SECRET`          | No                  | derived from the master key | Signs access tokens for the apps and the public API (≥ 32 chars). Usually left unset. |
| `NODE_ENV`            | Recommended         | —                          | Set `production` for deployments                     |
| `ORIGIN`              | **Yes** behind a reverse proxy or on HTTPS | —                | Public origin (`https://host`). When it's `https`, login cookies are always `Secure`. Without it, an app sign-in that sends no `Origin` header, through an inner proxy that reports `http`, can get a cookie without `Secure` on an HTTPS site. The host must match the address in the browser, or sign-in and other form posts fail with `403`. Leave it unset for plain-HTTP access on your local network. |
| `BASE_PATH`           | No                  | container default          | Where artwork / trickplay / the ffmpeg cache are written. Mount it as a shared **RWX** volume so web + worker share it. |
| `PORT`                | No                  | `3000`                     | App listen port                                      |
| `BODY_SIZE_LIMIT`     | No                  | `50M` (image)              | Largest request body the app accepts (Node's own default is 512K). Uploads fail with `413` if this, or your reverse proxy's limit, is lower than the upload. |
| `SETUP_UNLOCK`        | No                  | —                          | Set to `1` and restart to reopen `/setup` on a server with no administrator left. Applies only while no admin exists; remove it afterwards (the Security Self-Check warns while it is set). |
| `PUBLIC_BASE_URL`     | No                  | —                          | Public origin used for absolute links the server builds without a request: the Trakt sign-in redirect, poster links in notification webhooks, and the Security Self-Check's edge probes. |
| `WORKER_MODE`         | No                  | `enabled`                  | `enabled` / `disabled` / `auto`. Multiple `enabled` replicas are supported: per-class leader locks elect leadership independently across them. Running **exactly one** is still the recommended deployment, since it's simpler to reason about. |
| `INSTANCE_ID`         | No                  | hostname + random suffix   | Node name for the cluster/admin UI. The random suffix means the default is **not** stable across restarts (it avoids a Valkey key collision when the same hostname restarts in a new container); set it explicitly if you need a name that persists. |
| `UPDATE_CHECK_ENABLED` | No               | `true`                     | Once a day, read the Lumastra release list from `api.github.com` and tell admins about newer versions (red until installed for a security release). Usually set in Admin → Settings → General → Diagnostics instead; an environment value locks that switch. See [What Lumastra sends where](/reference/data-flows/#update-check). |
| `LICENSE_CHECK_IN_ENABLED` | No           | `true`                     | About once a week, send the install ID, Lumastra version and licence status code to `lumastra.org` so the project can count installs (pseudonymised counts, no IP address). Off skips only this check-in; renewal and the push relay token are unaffected. Usually set in Admin → Settings → General → Licensing or during setup; an environment value locks that switch. See [What Lumastra sends where](/reference/data-flows/#lumastraorgapilicenserefresh-licence-renewal). |
| `LICENSE_SERVER_CONTACT_ENABLED` | No | `true` | Off: the install never contacts `lumastra.org` (no licence enrolment or renewal, no check-in, no push relay token) and runs on the free tier at once, with no 30 day grace period. A stored licence key keeps working until it expires and is not renewed. Usually set in Admin → Settings → General → Licensing or during setup; an environment value locks that switch. See [What Lumastra sends where](/reference/data-flows/#switch-off-all-contact). |
| `LOG_LEVEL`           | No                  | `info`                     | `debug` / `info` / `warn` / `error`                  |
| `TZ`                  | No                  | UTC (container default)    | The container's time zone (e.g. `Europe/Berlin`, set in `docker-compose.yml`). Daily and weekly [task triggers](/guides/task-monitoring/#triggers-when-a-task-runs) fire in this zone. There's no separate in-app setting for it. |
| `LUMASTRA_SKIP_PREFLIGHT` | No              | `false`                    | Boot past preflight **errors**. The check still runs and logs its findings; this only stops it blocking startup. |
| `TRICKPLAY_ENABLED`   | No                  | `false`                    | Generate hover-preview thumbnail sprite sheets with `ffmpeg` |
| `FFMPEG_PATH`         | No                  | `/config/bin/ffmpeg` (image), `ffmpeg` otherwise | Path to the `ffmpeg` binary (override to use a custom build) |
| `FFPROBE_PATH`        | No                  | `/config/bin/ffprobe` (image), `ffprobe` otherwise | Path to the `ffprobe` binary                         |
| `FFMPEG_AUTO_DOWNLOAD` | No                 | `true` (image)             | The image downloads jellyfin-ffmpeg into `/config/bin` on first start. Set `false` for offline installs and point the two paths above at your own binaries. |

`LIBRARY_ALLOWED_ROOTS` accepts comma-separated absolute paths, such as `/data,/media`.
Library folders and the folder browser must stay within those roots when set;
when unset, any existing folder except `/` can be a library folder.

## Transcoding hardware

Also under **Admin → Settings → Playback → Encoder & Hardware Tuning**. A GPU must also be passed into the
container; see [GPU transcoding](/guides/gpu-transcoding/).

| Variable | Default | Description |
| --- | --- | --- |
| `GPU_ACCELERATION` | `none` | `none`, `nvenc` (NVIDIA), `qsv` (Intel), `vaapi` (Intel/AMD on Linux), `amf` (AMD on Windows, untested), `videotoolbox` (macOS bare metal, untested) |
| `VAAPI_DEVICE` | `/dev/dri/renderD128` | Render node for `vaapi` |
| `QSV_DEVICE` | (auto) | Device for `qsv` |
| `NVENC_PRESET` / `NVENC_TUNE` / `NVENC_RC` / `NVENC_CQ` | `p4` / — / `auto` / `23` | NVENC tuning |
| `AMF_QUALITY` | `balanced` | `quality`, `balanced` or `speed` |
| `FFMPEG_TRANSCODE_DIR` | `/tmp/lumastra-transcode` | Working directory for HLS segments; a tmpfs mount is faster |
| `FFMPEG_INACTIVITY_TIMEOUT_SECONDS` | `1800` | Remove a transcode nobody has used for this long |
| `LUMASTRA_MAX_CONCURRENT_TRANSCODES` | CPU cores × 3, clamped 12–32 | Global active-job cap for this instance |
| `FFMPEG_MAX_JOBS_PER_USER` | `10` | Concurrent transcoding jobs one account can hold |

If some accounts are untrusted, keep `FFMPEG_MAX_JOBS_PER_USER` well below
`LUMASTRA_MAX_CONCURRENT_TRANSCODES`: one account can occupy up to its per-user
limit in global slots. Configure both under **Settings → Playback**.

## Performance tuning

Mostly relevant for **very large libraries** or busy servers. See
[Performance tuning](/guides/performance-tuning/) for guidance.

| Variable                           | Default | Description                                                              |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------- |
| `LUMASTRA_SCAN_CONCURRENCY`        | `8`     | Files processed in parallel per library scan. Keep ≤ the task DB pool; match it to NFS `nconnect`. |
| `SCAN_ENRICH_INLINE`               | `false` | `true` fills TMDB metadata inline during scan (offline installs); off defers it to a background stage. |
| `DISABLE_FILE_LIBRARY_SCAN` | `false` | `true` stops scheduled, manual and API-triggered library scans and file reconciliation. Leave it `false` if you trigger scans yourself. On inotify-less media (S3/Mountpoint), periodic scans ingest new files. |
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
| `FORWARD_AUTH_ENABLED`     | For forward auth | `false`               | Read identity headers at all. Off: ignored from every peer. Upgrading forward-auth installs must set `true`. Environment only: Admin → Settings shows it read-only, and a value in `settings.json` is ignored (logged at startup) |
| `TRUSTED_PROXY_IPS`        | Behind a proxy   | (unset → fail-closed) | Addresses of your proxies, allowed to set identity headers (with `FORWARD_AUTH_ENABLED`) and `X-Forwarded-For`. List every proxy that adds to `X-Forwarded-For`, and only proxies: a LAN range lets every device in it choose its client IP and, with forward auth on, sign in as anyone. IPv4 ranges wider than `/24` are reported as a warning; IPv6 ranges are not supported. See [Reverse proxy](/guides/reverse-proxy/#trusted_proxy_ips) |
| `LUMASTRA_TRUST_ANY_PROXY` | No               | `false`               | Trust any peer's identity headers (single host only)  |
| `USERHEADER`               | No               | `X-Forwarded-User`    | Header carrying the authenticated username             |
| `GROUPHEADER`              | No               | `X-Forwarded-Groups`  | Header carrying the user's groups (`\|`- or comma-separated) |
| `NAMEHEADER`               | No               | `X-Authentik-Name`    | Header carrying the display name; empty ignores it    |
| `FORWARD_AUTH_GROUPS_ALWAYS_SENT` | No        | `false`               | The proxy sends `GROUPHEADER` on every signed-in request, so a missing header means "no groups" (stored groups are cleared, admin removed). Needed behind nginx `auth_request`, which drops empty headers |
| `ADMIN_GROUPS`             | No               | `admin`               | Groups whose members are administrators (case-insensitive). Also used by OIDC. Set it before the first SSO sign-in |
| `WATCH_PERMISSION_GROUPS`  | No               | `admin,stream-monitors` | Groups that see every user's streaming sessions     |
| `LIVETV_GROUPS`            | No               | `livetv,admin`        | Groups with Live TV access                            |
| `ARR_MANAGER_GROUPS`       | No               | `arrmanager,admin`    | Groups (besides admins) that see the debug panel and connected service URLs |
| `PUBLIC_AUTHURL`           | No               | —                     | Link to your identity provider's account page, shown in Settings when users don't use built-in login |
| `PUBLIC_LOGOUTURL`         | No               | —                     | Where "Sign out" sends the browser, e.g. the identity provider's logout URL |
| `DEFAULT_USER`             | No (dev only)    | `admin`               | Under `npm run dev`, the user assumed when no header is present. With Jellyfin connected, also the Jellyfin account used for some metadata lookups |
| `PROTOCOL_HEADER`          | Behind TLS proxy | `x-forwarded-proto`   | Header the app reads to learn the external scheme for the addresses it builds. Lumastra reads `X-Forwarded-Proto` for the session cookie's `Secure` flag on its own; set this when your proxy sends the scheme in another header. |
| `HOST_HEADER`              | Behind a proxy   | `x-forwarded-host`    | Header the app reads to learn the external host      |

### Built-in (native) login

| Variable                       | Required | Default | Description                                                         |
| --------------------------------- | ---------- | --------- | ------------------------------------------------------------------------ |
| `AUTH_NATIVE_LOGIN_ENABLED`    | No       | `false` | Enable username/password login. The setup wizard turns it on when it creates the first admin. `.env.example` sets it to `true`, because the startup check refuses to boot with no sign-in method configured; while it is set there, the switch in Admin → Settings is read-only |
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
| `OPENAI_API_KEY`       | No       | —              | OpenAI embeddings (used when `VOYAGE_API_KEY` is unset) |
| `VOYAGE_API_KEY`       | No       | —              | Voyage AI embeddings; wins when both keys are set |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` | No | — | Custom OpenAI-compatible embedding endpoint (e.g. Ollama). Needs both; there is no fallback to `OPENAI_API_KEY` |
| `EMBEDDING_MODEL`      | No       | (auto-detect)  | e.g. `text-embedding-3-small`, `voyage-3-large`   |
| `EMBEDDING_DIMENSIONS` | No       | `0` (auto)     | Vector width, fixed when the database is created (**must match the model**). Changing it later is not migrated: startup stops with a column-width mismatch |
| `OPENAI_CHAT_API_KEY`  | No       | —              | Key for the assistant's OpenAI-compatible chat backend (any non-empty value for a local server) |
| `OPENAI_CHAT_MODEL`    | No       | `gpt-4o-mini`  | Chat model for the assistant                      |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_CHAT_MODEL` | No | — / `claude-opus-4-8` | Claude as the assistant's chat backend |
| `ASSISTANT_PROVIDER`   | No       | `auto`         | `auto` uses Claude when `ANTHROPIC_API_KEY` is set and `OPENAI_CHAT_API_KEY` is not |

## Sonic music embedder

For the [sonic music features](/guides/music-discovery/). The sidecar
(`ghcr.io/lumastra/lumastra-sonic-embedder`) runs Microsoft's **CLAP-2023** model via
the `msclap` package; its weights download from HuggingFace (`microsoft/msclap`) at
runtime, not bundled by Lumastra (review the
[model card](https://huggingface.co/microsoft/msclap) for the weight terms).

| Variable                 | Set on            | Required          | Default                    | Description                                                                                          |
| --------------------------- | ------------------- | -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SONIC_EMBEDDER_URL`     | app + worker      | For sonic         | —                          | HTTP URL of the embedder sidecar (e.g. `http://lumastra-sonic-embedder:8000`). Required by any `FEATURE_MUSIC_SONIC*`. |
| `SONIC_READER_PASSWORD`  | `.env` (compose)  | For sonic         | —                          | Password of the sidecar's read-only database role, interpolated by the example compose file's `sonic` profile |
| `SONIC_EMBEDDER_THREADS` | sidecar           | No                | (all cores)                | PyTorch CPU thread cap. Keep it modest (e.g. `4`) on shared hardware so playback stays responsive     |
| `MODEL_ID`               | sidecar           | No                | `msclap-2023`              | Model identifier recorded with the embeddings                                                         |
| `HF_HOME`                | sidecar           | No                | `/app/.cache/huggingface`  | HuggingFace cache for the downloaded CLAP weights. Mount a persistent volume here to download once    |
| `SONIC_MODEL_FP`         | sidecar           | No                | —                          | Absolute in-container path to a local CLAP weights `.pth`. Set it (with a read-only mount) for air-gapped / offline installs; the sidecar then loads locally and never reaches HuggingFace |

## Branding

All optional; defaults render the bundled Lumastra identity. Custom name, logos,
description and background take effect only with the custom-branding licence module
(see [Editions & Licensing](/guides/licensing/)); the two colours always apply. Logo
values are `http(s)` URLs or paths starting with `/`, such as `/custom/logo.png`.

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
| `ASSISTANT_NAME` | `Assistant` | AI assistant display name; requires `FEATURE_AI_ASSISTANT` |
| `ASSISTANT_AVATAR` | (bundled) | AI assistant avatar; requires `FEATURE_AI_ASSISTANT` |

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

Three JSON-array variables customise the footer, the sidebar and the avatar menu.
Each entry takes `label`, `url` and optional `external` (default `true`; set `false`
for in-app routes). Sidebar and avatar-menu entries also take `icon` (a Heroicons name,
or a path such as `/custom/icon.svg` from the [custom asset folder](#custom-asset-folder)).
Sidebar entries also accept `groups`, a list of group names that must match for the
entry to show; the special group `__ADMIN__` means "admins only".

| Variable          | Effect                                    |
| -------------------- | ---------------------------------------------- |
| `FOOTER_LINKS`    | Links in the footer bar, which shows only with `SHOW_FOOTER=true` (default `false`) |
| `SIDEBAR_LINKS`   | Replaces the whole sidebar / dock navigation, so include Home and Browse yourself |
| `USER_MENU_LINKS` | Extra links in the avatar menu (empty by default; Settings and Sign out are always there) |

```bash
SHOW_FOOTER=true
FOOTER_LINKS='[
  {"id":"docs","label":"Help","url":"https://wiki.example.com"},
  {"id":"quickconnect","label":"Quick Connect"}
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
Connect dialog, needs no `url` and shows only when Jellyfin is connected.
`SIDEBAR_SECTIONS` (a JSON array of `{"id","label","icon","collapsed"}`) defines
collapsible groups; a sidebar entry joins one with `"section":"<id>"`. The same links
can be managed from the admin UI under **Settings → Homepage & navigation**, which is the easier route if you don't
manage configuration as code.

## Optional integrations

Each key below enables outbound calls to that service; what each one receives is
listed in [What Lumastra sends where](/reference/data-flows/). The iOS push
settings (`FEATURE_PUSH_NOTIFICATIONS`, `PUSH_RELAY_URL`, `PUSH_RELAY_TOKEN`,
`PUSH_TRANSPORT`, `APNS_KEY_P8`) live under **Admin → Settings → Access → Push Notifications**;
the default relay is run by the Lumastra maintainer and is covered on that page.

| Variable                          | Description                          |
| ------------------------------------ | --------------------------------------- |
| `TMDB_API_KEY`                    | Metadata, images, search             |
| `MDBLIST_API_KEY`                 | Aggregated ratings + keyword tags    |
| `LASTFM_API_KEY`                  | Music popularity                     |
| `DISCOGS_TOKEN`                   | Artist / album enrichment            |
| `JELLYFINURL` / `JELLYFINAPIKEY`  | Jellyfin background **sync** (the `/j` compat API needs neither) |
| `PUBLIC_JELLYFINURL`              | Public Jellyfin address for links users click (homepage button, Quick Connect hint). Environment only |
| `AUDIOURL` / `AUDIOAPIKEY`        | AudiobookShelf: the key needs **admin** rights so per-listener keys can be minted. See [Audiobooks](/guides/audiobooks/) |
| `PUBLIC_AUDIOBOOKURL`             | Public AudiobookShelf address for the "open in AudiobookShelf" button. Environment only |
| `KAVITAURL` / `KAVITAAPIKEY`      | Kavita (books / manga / comics)      |
| `PUBLIC_KAVITAURL`                | Public Kavita address for links from search results. Environment only |
| `ANIDB_CLIENT` / `ANIDB_CLIENT_VER` | Registered AniDB client name and version, for libraries that use the AniDB metadata provider. The value in the plugin settings wins |
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
| `STREAM_PROXY_SECRET` | (unset) | Shared secret authenticating Lumastra to the stream proxy. Set the same value on both; the proxy refuses to start without it. |
| `LIVETV_CAP_FALLBACK` | `source` | When a requested quality can't be produced: `source` serves the original, `refuse` fails playback |
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
