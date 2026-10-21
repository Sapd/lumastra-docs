---
title: API & tokens
description: >
  The /api/v1 contract: resource model, auth, problem+json errors, pagination,
  token kinds, scopes, and the OAuth device authorization flow.
sidebar:
  order: 2
---

Building a third-party client, script, or integration against Lumastra means
dealing with the token surface, how auth and scopes work, and the contract every
response follows.

Lumastra exposes three distinct HTTP surfaces, each with its own authentication
model. The right choice depends on who's calling and from where.

| Surface | Path prefix | Auth method | Who uses it |
|---|---|---|---|
| Browser BFF | `/api/*` | Browser session: forward auth, built-in login, or OIDC | Browser UI only |
| Token API | `/api/v1/*` | Bearer token (JWT, PAT, service token) | External clients, TV apps, scripts |
| Device flow | `/oauth/*` | Public (no auth required) | OAuth device-code handshake |

`/api/*` and `/api/v1/*` are **separate surfaces**, not a mirror of each other.
Only `/api/v1/*` is the external token surface. Both surfaces share the same
handler logic underneath. The split exists as an **edge auth boundary**, so the
identity provider's forward-auth middleware can gate `/api/*` while `/api/v1/*`
handles its own Bearer auth without being redirected to a login page.

:::tip[Building a native player?]
This page covers the contract, tokens, and the device flow. For the full client
walkthrough (browse, server playback plan, HLS, tracks, trickplay, and progress
reporting), see [Building a player](/developers/building-a-player/).
:::

:::tip[Route-by-route reference]
Every `/api/v1/*` route group, `/events`, `/server`, language
negotiation, and the library scan/ingest contract live in [API routes
reference](/developers/api-routes/). The interactive [**API
reference**](/reference/) has parameters, schemas, and responses per endpoint.
:::

### Compatibility and schema evolution

The `/api/v1` contract evolves **additively**. A response may gain new optional
fields as the server learns to expose more information; clients must ignore
object properties they do not recognize and continue decoding the fields they
understand. The schemas in the OpenAPI reference describe the fields a client
can use, not a requirement that every response object contain only those keys.

Adding a response field is therefore not a breaking API change. Removing or
renaming a field, changing its type or meaning, or tightening an existing
requirement is breaking and is handled separately. Clients should still treat
known-field type mismatches and required-field omissions as errors, and should
handle unknown discriminator or enum values defensively.

### Stability labels and deprecation

Every operation in the reference carries `x-stability`:

| Label | What it promises |
|---|---|
| `stable` | No breaking change without the deprecation process below. New optional fields, documented-open enum values and new operations can appear at any time. |
| `beta` | Supported, but its shape may still change in a minor release. Changes are listed in the changelog. |
| `experimental` | May change or disappear in any release. |
| `protocol` | A byte or streaming endpoint (media files, HLS playlists and segments, images, OAuth). Its format follows the media or OAuth protocol; use the URL a JSON response gives you. |
| `deprecated` | Still works, names its replacement and a removal date. Move off it. |

From 0.1 on, `stable` operations and their documented fields keep working through the 0.x
series unless they go through deprecation: an operation stays marked deprecated for at least two
minor releases or 90 days, whichever is longer, and is removed only in a release whose changelog
says so.

A client notices a deprecation two ways. The spec marks the operation `deprecated: true` with
`x-deprecation: { since, sunset, replacement }`. At runtime every response of a deprecated
operation carries `Deprecation: @<unix-seconds>` (RFC 9745), `Sunset: <HTTP-date>` (RFC 8594) once
a removal date is set, and `Link: <replacement URL>; rel="successor-version"`. Log a warning when
you see `Deprecation`.

### Finding your way in the reference

The [API reference](/reference/) groups its tags into sections in the order a client needs them:
**Getting started** (Server, Authentication, Me, Live updates), **Library** (Media, Browse,
Series, People, Search, Discovery, Requests, Library sync, Images), **Playback** (Playback
sessions, Streaming, Timeline, Downloads, Network), **Music** (Music library, Music discovery &
radio), **Audiobooks**, **Live TV**, **Your data** (Watch state, Ratings, Watchlist, Your music,
Playlists), **Social** (Watch together, Community, Notifications), **Devices** (Devices, Remote
control, Client diagnostics), **Integrations** (Webhooks, Service feeds) and
**Administration**. Every operation sits in exactly one tag.

Each operation has a hand-picked `operationId` such as `getMediaItem`, `startPlaybackSession` or
`listLiveTvStations`. Generated clients use it as the method name, and it does not change when a
path changes.

## Resource model

`/api/v1` is a **resource-oriented API** with a polymorphic catalog spine.

Every object in every response carries a `type` field, a closed public enum:
`movie | series | season | episode | track | album | artist | audiobook`. `series` is the
canonical word for TV shows everywhere. The legacy values `tv` and `show` are
retired and never appear in responses.

Every entity response also carries `id`, an opaque handle. Pass it back as `{id}` and
never parse it. `catalogId` is the library row UUID, or `null` when the title is not in
the library. `ids` is an open map of raw provider values (for example `{ "imdb":
"tt0903747", "tmdb": "1396" }`) with no internal key. Every `{id}` also accepts an
external handle such as `tmdb:1396:series`; URL-encode the colons. `GET /media/{id}` and its
image routes also take that handle as `?externalId=tmdb:1396:series`. The
canonical detail node for any single item is `GET /media/{id}`. `/movies` and
`/series` are type-filtered aliases over `GET /media?type=…`, not their own
detail routes.

See [API routes reference](/developers/api-routes/#catalog) for the full
catalog, images, and sizing contract.

## Errors: `application/problem+json`

Resource API errors, including authentication failures and unknown paths, use
`application/problem+json`. One exception: HLS startup errors from
`GET /playback/{id}/hls` come back as JSON with an `error` string
(`transcode_start_timeout`, `transcode_start_failed` or `transcode_start_interrupted`) and a
`message`, not as problem+json. The `code` field is the machine-parseable contract; `error`
text is human-readable and must not be parsed by clients. `reason` refines some codes, such
as `invalid_grant`.

```jsonc
{
  "code": "validation_failed",
  "error": "Request validation failed",
  "status": 422,
  "details": [{ "field": "limit", "message": "Must be > 0" }],
  "requestId": "req_abc123",   // optional
  "retryAfter": 30             // optional, seconds
}
```

When `retryAfter` is present it is also emitted as the `Retry-After` HTTP
response header.

### Closed error code taxonomy

| `code` | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | No credential or session |
| `invalid_token` | 401 | Bearer token present but invalid or expired |
| `invalid_grant` | 401 | Playback grant invalid, expired or revoked, or its playback session ended. `reason`: `expired`, `revoked`, `session_ended` or `invalid` |
| `forbidden` | 403 | Authenticated but lacking permission. A grant used on a URL that is not one of its media URLs answers with `reason: wrong_scope` |
| `ip_mismatch` | 403 | An IP-pinned grant used from another network address. For a receiver on another network, start the session with `castTarget: true` |
| `scope_required` | 403 | Token present but required scope not granted |
| `not_found` | 404 | Resource does not exist, or feature is off |
| `conflict` | 409 | Resource exists / operation already in-flight |
| `gone` | 410 | Resource permanently removed |
| `payload_too_large` | 413 | Request body exceeds the endpoint cap |
| `validation_failed` | 422 | Request syntactically valid but semantically wrong |
| `quota_exceeded` | 422 | Request quota exhausted for the bucket |
| `rate_limited` | 429 | Too many requests |
| `internal_error` | 500 | Unhandled server error |
| `bad_gateway` | 502 | Upstream returned an unexpected error |
| `dependency_unavailable` | 503 | Required dependency (DB, Valkey, external API, stream proxy) is down. Always sent with `Retry-After` |
| `stream_limit` | 503 | Live-TV stream slot limit reached (capacity full) |
| `cap_unavailable` | 503 | Requested Live TV bitrate ceiling could not be honored |
| `server_id_unavailable` | 503 | The server's persistent identity is not available yet; retry after `Retry-After` |
| `channel_offline`, `provider_auth_failed`, `geo_blocked`, `no_video`, `all_feeds_failed`, `upstream_stalled` | 502 | Live TV start or playback failures; see [Live TV playback](/developers/live-tv-playback/) |
| `encoder_failed` | 500 | Live TV: the server could not encode the channel |
| `provider_connection_limit` | 503 | Live TV: the provider has no free connection |
| `provider_unreachable` | 504 | Live TV: the provider cannot be reached |

**Feature-off is `404 not_found`**, not `403 forbidden`: a disabled feature
does not exist from the client's perspective.

**Dependency-down is always `503 dependency_unavailable`**, never a `200` with
an empty array. The `details` field may name the failing component. Grant failures also send an
`X-Playback-Grant-Reason` header with the same `reason`.

Once a byte or stream response has started, errors are transport-native: an SSE `error`
event frame, an HLS `410` or `503` on the next segment fetch, or the connection closing.
Before the stream starts, errors are `application/problem+json` (the HLS startup JSON
above is the one exception).

## Pagination: `{ items, page }`

Every collection endpoint returns the same envelope:

```jsonc
{
  "items": [ /* … */ ],
  "page": {
    "limit": 20,
    "offset": 0,
    "hasMore": true,
    "total": 142       // only with ?includeTotal=true
  }
}
```

`hasMore` is mandatory and uniform across all endpoints. It drives infinite
scroll without requiring a `COUNT(*)` query. `total` is opt-in: add `?includeTotal=true`.
Lists that take only `limit` return `truncated` instead of `hasMore`. Unpaged collections
(seasons, groups, libraries, your tokens) return the whole set: `page.limit` equals the
item count and `hasMore` is `false`.

Endpoints with high churn (run history, event logs, feeds) use **cursor
pagination** instead of offset: `"page": { "limit": 50, "cursor": "eyJpZCI6…",
"hasMore": true }`. Pass `?cursor=<opaque>&limit=50` on subsequent requests.
Offset and cursor are mutually exclusive per endpoint.

## Token types

Three token types are accepted on `/api/v1/*`. The middleware checks the prefix
to route validation:

| Type | Prefix | Created by | Permissions | Expiry |
|---|---|---|---|---|
| JWT access token | *(none, compact JWT)* | OAuth device flow | User's groups | `JWT_ACCESS_TOKEN_TTL_SECONDS` (default 3 600 s) |
| Personal Access Token | `pat_` | User (settings UI or `/api/v1/user/pats`) | User's groups, scoped | User choice |
| Service token | `svc_` | Admin only (`/api/v1/service-tokens`) | Configurable scope, optional IP allowlist | Admin choice |

All token values are SHA-256-hashed before storage; the plaintext is returned
only at creation time and cannot be retrieved afterwards.

Media URLs use a fourth credential, the playback **grant** (see [Play media from
your own client](/developers/building-a-player/#play-media-from-your-own-client)).
`POST /api/v1/play-sessions` mints it and puts it in every URL it returns as
`?grant=`. A grant is opaque and bound to one item and one playback session. It works
only on media delivery URLs (manifests, segments, files, subtitles, previews, music
and audiobook audio, Live TV HLS), never on JSON calls. It expires after 24 hours for
video and audiobooks and 6 hours for music and Live TV. It is pinned to the IP address
that started the session unless the start asked for `castTarget` and the server's policy
allows it; unpinned grants last at most 6 hours. Renew it with `POST
/api/v1/playback/grants/{id}/renew` and `{ "token": "…" }`. The response is the
grant object with the extended expiry. Renewal never shortens expiry, and no grant lives
longer than 7 days after its first start. `GET` and `DELETE` on
`/api/v1/playback/grants/{id}` read and revoke it.

A grant ends with its playback session. Ending the session (a `COMPLETED` report on
`PUT /api/v1/play-sessions/{id}`, or `POST /api/v1/play-sessions/{id}/cancel`), a newer start on
the same device, or reaping makes every URL on that grant
answer `401 invalid_grant` with `reason: session_ended`. Start a new session to play
again.

### JWT access tokens

Issued by the OAuth 2.0 Device Authorization flow (RFC 8628). Short-lived
(default 1 hour). Refresh tokens (90-day default) rotate on every use. Require
`FEATURE_DEVICE_AUTH` (on by default) and `JWT_SECRET` (derived from
`LUMASTRA_MASTER_KEY` when unset).

JWT payload:

```json
{
  "username": "alice",
  "client_id": "my-tv-app",
  "scope": "media",
  "groups": ["admin"],
  "device_session_id": "…",
  "token_type": "access",
  "iat": 1766258109,
  "exp": 1766261709,
  "iss": "Lumastra"
}
```

### Personal Access Tokens (PATs)

Format: `pat_` + 48 hex chars.

- Inherit the creating user's groups and library access.
- Accepted scopes: `read`, `write`, `admin`, or either exclusive
  `jellyfin_compat` / `jellyfin_compat_read` scope. Fine-grained scopes are expanded
  permissions and cannot be requested independently. See the scope tree below.
- Max 10 active tokens per user.
- Usage (last-used timestamp, IP, count) is tracked per token.
- Revocation propagates cluster-wide via Valkey: each replica caches a validated
  token for 30 minutes, and a revocation writes a Valkey marker with the same
  30-minute TTL that other replicas check on every cache hit, so the only gap
  is Valkey being unreachable, not a fixed ~30-second window.
- A PAT is only ever treated as admin when **both** are true: the owning user
  is an admin, **and** the token itself carries an explicit admin-equivalent
  scope (`admin` or `tasks:admin`). A low-scope PAT created by an admin user
  is *not* admin. Scope the token; don't rely on the owner's group.
- `jellyfin_compat*` scopes are exclusive to PATs. They enable the `/j`
  Jellyfin-compatibility surface and are never granted to device JWTs or
  service tokens.

Require `FEATURE_USER_PATS=true` and `JWT_SECRET`.

Creating a PAT:

```bash
# Requires an active browser session on /api/* (forward auth, built-in, or OIDC)
curl -X POST https://lumastra.example.com/api/v1/user/pats \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Home Assistant",
    "description": "Active sessions widget",
    "scopes": ["read"],
    "expiresInDays": 365
  }'
```

The response body includes the `token` field (shown once, store it
immediately). Manage PATs at `GET/POST /api/v1/user/pats` and `DELETE
/api/v1/user/pats/{id}` (`204`).

### Service tokens

Format: `svc_` + 48 hex chars.

- Admin-created only (`POST /api/v1/service-tokens`). Creating one needs an administrator
  or a token with the `admin` scope.
- Accepted scopes: `read`, `write`, `admin` and `integrations:read`; fine-grained permissions come
  from alias expansion.
- Support optional IP allowlist, path/method restrictions, and expiry.
- Support user impersonation via the `actAsUser` field set at creation time.
  Impersonation target is database-bound. It cannot be changed via request
  headers at call time.
- An optional `forceNonAdmin: true` flag at creation guarantees the token can
  never resolve to an admin principal, regardless of scopes granted or the
  impersonated user's own group.

```bash
# Create (requires admin session or tokens:admin service token)
curl -X POST https://lumastra.example.com/api/v1/service-tokens \
  -H "Authorization: Bearer svc_your_admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Grafana",
    "scopes": ["read"],
    "actAsUser": "alice",
    "allowedIps": ["192.168.1.50"],
    "expiresInDays": null
  }'
```

Manage service tokens at `GET/POST /api/v1/service-tokens` and
`GET/DELETE /api/v1/service-tokens/{id}`.

#### Tokens minted by a service token

A service token with the `admin` scope can mint further service tokens, for
example an automation agent that hands each bot its own narrow token.

- **Owner.** The new token belongs to the person who owns the minting token,
  not to the minting token. Its `createdBy` is that person, and
  `createdViaTokenId` / `createdViaTokenName` name the minting token. The admin
  token list shows this as "created by alice via token deploy-agent". The new
  token stays valid if the minting token is revoked later, and stops working
  when its owner is disabled or deleted, like any other token of theirs.
- **No escalation.** The new token can never do more than the token that
  minted it. The request is refused (403) unless:
  - its scopes are ones the minting token holds;
  - if the minting token is limited to some paths, methods or IPs, the new
    token sets the same or a narrower list;
  - if the minting token has `forceNonAdmin`, the new token sets it too;
  - if the minting token expires, the new token expires no later;
  - if the minting token acts as a user, the new token sets `actAsUser` to that
    same user.

  Otherwise `actAsUser` follows the usual rules.

Earlier versions stored tokens minted this way without a real owner, and every
request with them was refused with 401. The upgrade repairs every such token
that stays within the token that minted it. Revoke and re-create any token it could not
repair; the server log lists them at upgrade time.

### Scope tree

`read`, `write`, and `admin` are **coarse aliases** that expand
deterministically at token-issuance time:

- `admin` → every scope in the tree.
- `write` → `read` + `media:read` + `media:write` + `sessions:read` +
  `requests:read`. It does **not** grant `tasks:run`, `webhooks:write`, or any
  `*:admin` scope. Those need `admin`.
- `read` → `media:read` + `sessions:read` + `requests:read`. It does **not**
  grant `tasks:read` or `runs:read`. Task/ops routes, run history included, need `admin` even for read access.

Several fine-grained `*:admin` scopes also imply their `:read` counterpart:
`users:admin`, `library:admin`, `providers:admin`, `media:admin` (implies both
`media:read` and `media:write`), and `playback:admin` all include read. `tasks:admin`
additionally implies `tasks:read`, `runs:read`, and `metrics:read`.

Tokens can be minted only with `read`, `write` or `admin`, plus `integrations:read` on service
tokens. The fine-grained names below are gates that `admin` covers; they cannot be minted on
their own.

| Scope | Grants access to |
|---|---|
| `read` | General read access |
| `write` | General write access (not tasks, webhooks, or admin ops) |
| `admin` | Everything |
| `tasks:read` | Read task definitions and run history |
| `tasks:run` | Enqueue and cancel runs |
| `tasks:admin` | Pause/resume tasks, manage queues and plugins |
| `runs:read` | Read run history and stream run logs (operator data: comes with `tasks:admin`) |
| `webhooks:write` | Create, update, and delete webhooks |
| `media:read` | Read catalog items |
| `media:write` | Update catalog metadata |
| `media:admin` | Rescan, delete, or manage individual items |
| `sessions:read` | Read active play sessions (admin view) |
| `sessions:write` | Terminate sessions |
| `requests:read` | Read own requests and quota |
| `requests:admin` | Read all requests across users |
| `users:read` | Read user list and profiles |
| `users:admin` | Manage user lifecycle and per-user config |
| `library:read` | Read library / path / group configuration |
| `library:admin` | CRUD library paths, groups, validate, and reports |
| `tokens:admin` | Mint/list/revoke PATs and service tokens on behalf of others |
| `livetv:admin` | Sources, channels, categories, proxy config |
| `providers:read` | Read metadata-provider config |
| `providers:admin` | Manage provider config and integration keys |
| `playback:read` | Transcode capabilities and quality stats |
| `playback:admin` | Reset playback quality, cancel ffmpeg jobs |
| `metrics:read` | System metrics, task metrics, Prometheus scrape |
| `access:admin` | Access groups and library-group permissions |

**Scope note:** task/ops routes (`/tasks`, `/runs`, `/queues`) accept only
`pat_`/`svc_` or an admin session, not device-flow JWTs.

## Making an authenticated request

All three token types use the standard `Authorization: Bearer` header on
`/api/v1/*`:

```bash
curl -H "Authorization: Bearer pat_your_token_here" \
  https://lumastra.example.com/api/v1/media/550e8400-e29b-41d4-a716-446655440000
```

Never put your account token in a media URL. Players that cannot set request headers
(Apple AVPlayer, VLC, Kodi, cast receivers) use the URLs that
`POST /api/v1/play-sessions` returns. Each one already carries a `?grant=` credential
that is bound to one item and one playback session, expires, and works only on media
URLs, never on JSON calls:

```
/api/v1/playback/{id}/hls?PlaySessionId=<playbackSessionId>&grant=<opaque grant>
```

`api_key` and `stream_token` query parameters are no longer accepted on `/api` and
`/api/v1` media routes. See [Play media from your own
client](/developers/building-a-player/#play-media-from-your-own-client).

## OAuth 2.0 Device Authorization flow

This flow lets TV apps and headless clients authenticate without a keyboard. It
follows RFC 8628.

**Prerequisites:** `FEATURE_DEVICE_AUTH` on (the default since v0.1) and a `JWT_SECRET` (derived from `LUMASTRA_MASTER_KEY` when unset).

The `/oauth/*` endpoints are **public**. They must be excluded from your
reverse proxy's forward-auth middleware. See [Authentication
guide](/guides/authentication/) for Authentik / Traefik / nginx examples.

Lumastra implements the **Device Authorization Grant only**. It is not an OIDC
provider: there is no authorization-code grant, no
`/.well-known/openid-configuration`, and no JWKS endpoint. (Lumastra *consumes*
OIDC as a relying party for browser login, but does not provide it.)

### Step 1: request a device code

```http
POST /oauth/device
Content-Type: application/json

{
  "client_id": "my-tv-app",
  "device_name": "Living Room TV",
  "scope": "media"
}
```

`client_id` is a free-form label: there is no client registration or client
secret. Security rests on the user's explicit approval in step 2.

`"media"` is read and write: browse, play and report. `"media:read"` gives a read-only
token that cannot start playback (`403 scope_required`). When `scope` is absent or not
recognized, the default is `"media"` (read and write).

An optional `device_id` (a stable UUID you generate and persist per physical
device) lets the server reuse the same `device_session_id` across
re-authorizations of that device, which preserves playback state across a
re-link. Omit it and every authorization gets a fresh session.

Response (RFC 8628 §3.2):

```json
{
  "device_code": "abc123…",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://lumastra.example.com/device",
  "verification_uri_complete": "https://lumastra.example.com/device?code=WDJB-MJHT",
  "expires_in": 600,
  "interval": 5
}
```

Display `user_code` (or the `verification_uri_complete` as a QR code) to the
user. The endpoint is rate-limited to 10 requests per minute per IP.

### Step 2: user authorizes

The user visits `/device` in a browser (this path goes through forward auth).
They enter or confirm the code, which marks the device code as authorized.

### Step 3: poll for tokens

Start polling `POST /oauth/token` at the `interval` returned in step 1. The
wire format follows RFC 8628 (snake_case, not the JSON contract used by the rest
of `/api/v1`):

```http
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "abc123…",
  "client_id": "my-tv-app"
}
```

`application/x-www-form-urlencoded` is also accepted for off-the-shelf OAuth
library compatibility.

Polling responses:

| HTTP | `error` field | Action |
|---|---|---|
| 200 | *(none)* | Success: use the returned tokens |
| 400 | `authorization_pending` | Keep polling at the given interval |
| 400 | `slow_down` | Back off: increase interval by at least 5s, then keep polling |
| 400 | `access_denied` | User denied: restart flow |
| 400 | `expired_token` | Device code expired: restart flow |
| 400 | `invalid_request` | Missing/malformed parameters, or the feature is disabled |
| 400 | `unsupported_grant_type` | `grant_type` value not recognized |
| 400 | `invalid_grant` | Bad/revoked `device_code`, or `client_id` mismatch: abort |
| 429 | `slow_down` | IP-level poll-rate limit: back off further |
| 500 | `server_error` | Transient server fault: back off and retry |

Error responses from `/oauth/*` use the RFC 8628 `{ error, error_description }`
shape, not `application/problem+json`, because OAuth client libraries hard-code
those field names.

Success response:

```json
{
  "access_token": "eyJhbGci…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "…",
  "scope": "media"
}
```

Store both values securely (Keychain on Apple platforms). The `device_code`
itself is consumed on success and cannot be reused.

### Step 4: refresh

```http
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "xyz789…"
}
```

Refresh tokens rotate on every use: the old token is revoked and a new one is
issued. Default lifetime: 90 days. Token responses include
`Cache-Control: no-store`. Persist the new `refresh_token` before making any
other API call: presenting an already-rotated (old) refresh token is treated
as a theft signal. The **entire** device session is revoked and the user must
re-authorize from Step 1.

Refresh proactively, roughly 5 minutes before `expires_at` (`now + expires_in`
from issuance), and reactively on any `401` from `/api/v1/*`.

## Rate limits

| Surface | Limit |
|---|---|
| `POST /oauth/device` | 10 requests / minute / IP |
| `POST /oauth/token` (polling) | 5s minimum poll interval |
| `PUT /play-sessions/{id}` + `POST /play-sessions/{id}/beacon` | No endpoint-level rate limit |
| `POST /play-sessions` | 60 requests / minute / user |
| `POST /playback/grants/{id}/renew` | 30 requests / minute / user |
| Everything else | No explicit client-side limit (dependency limits may still apply) |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `FEATURE_DEVICE_AUTH` | `true` | The Public API: `/api/v1/*`, the OAuth device flow and JWT token issuance. `false` makes feature-gated `/api/v1/*` endpoints answer 404 `not_found`; OAuth device authorization answers 400 |
| `FEATURE_USER_PATS` | `false` | Allow users to create PATs via the settings UI |
| `JWT_SECRET` | *(required when either feature is on)* | Signs JWTs and hashes PAT/service tokens. Min 32 chars. Derived from `LUMASTRA_MASTER_KEY` if unset. Generate: `openssl rand -hex 32` |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | `3600` | JWT access token lifetime |
| `JWT_REFRESH_TOKEN_TTL_DAYS` | `90` | Refresh token lifetime |
| `DEVICE_CODE_TTL_SECONDS` | `600` | Device code expiry |
| `DEVICE_CODE_POLL_INTERVAL_SECONDS` | `5` | Minimum client polling interval |
| `DEVICE_VERIFICATION_BASE_URL` | *(request origin)* | Canonical base URL for `verification_uri`. Set this when the endpoint is reachable directly to prevent host-header injection. |

## Reverse-proxy auth bypass

`/api/v1/*` and `/oauth/*` handle their own authentication. These paths **must
bypass** your identity provider's forward-auth middleware, or all external API
calls will be redirected to a login page.

These locations skip forward auth entirely, so they must explicitly blank the
identity headers. Otherwise a caller could set them directly and spoof an
identity (see [SSO with Authentik](/guides/sso-authentik/) for where this rule
comes from).

```nginx
# nginx — skip forward auth for the token surface and device flow
location /api/v1/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-authentik-username "";
    proxy_set_header X-authentik-groups "";
    proxy_pass http://backend;
}
location /oauth/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-authentik-username "";
    proxy_set_header X-authentik-groups "";
    proxy_pass http://backend;
}
```

For Authentik Proxy Provider, add to "Unauthenticated Paths":

```
^/oauth/.*
^/api/v1/.*
```

See [Authentication](/guides/authentication/) for full Traefik and Caddy examples.

## Third-party app compatibility surfaces

Lumastra also implements two separate compatibility APIs that use their own
authentication schemes and are not part of the `/api/v1` token surface:

- **Subsonic / OpenSubsonic** at `/subsonic/rest/*`: used by music clients
  (Ultrasonic, DSub, etc.)
- **Jellyfin compat** at `/j/*`: used by TV clients that speak the Jellyfin API.
  Works without a Jellyfin server; `JELLYFINURL`/`JELLYFINAPIKEY` are optional
  and only affect background metadata sync.

Both are documented in [Connecting third-party apps](/using/third-party-players/).

## Docs, spec, and machine-readable formats

A running instance publishes its own API documentation at `/api-docs` once
`FEATURE_DEVICE_AUTH` is on: an interactive Swagger UI, plus the same spec as
raw YAML (`?format=yaml`), JSON (`?format=json`), or Markdown
(`?format=md`). The same content is also available, unauthenticated by design,
as plain text at `/llms.txt` for LLM-agent tooling; returns 404 when the
public API is disabled.

The full interactive reference on this site, [/reference/](/reference/), is
built from a vendored copy of the same spec and covers every `/api/v1/*`
endpoint, parameters, schemas, and responses. Third-party integrations should
target endpoints marked `x-stability: stable` in the spec (see [Stability labels and
deprecation](#stability-labels-and-deprecation)).

## Next

- [API routes reference](/developers/api-routes/)
- [Building a player](/developers/building-a-player/)
- [Authentication](/guides/authentication/)
- [Client diagnostics](/developers/client-diagnostics/)
