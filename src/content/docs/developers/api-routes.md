---
title: API routes reference
description: Public /api/v1 route groups, the global SSE channel, server capabilities, language negotiation, and the library scan/ingest contract.
---

This is the endpoint-by-endpoint shape of the `/api/v1` surface. For auth,
tokens, scopes, and the device flow, see [API & tokens](/developers/api/); for
full per-endpoint parameters and schemas, use the interactive [API
reference](/reference/).

## Route groups

Paths below are relative to `/api/v1`, except where stated. These are public route
groups, not a list of every browser or operator endpoint. Use your instance’s
`/api-docs?format=yaml` for exact fields and operation stability; the hosted
[API reference](/reference/) is a vendored snapshot and can lag new features.

`user` means a valid user credential plus any required scopes, feature flags, object
ownership and library/age access. It does not mean every token can call every method.
Device JWTs never become administrative tokens. An admin-looking path or a listed
scope does not grant access by itself. Operations labeled beta or experimental retain
that status even when their neighboring routes are stable.

The catalog, sessions, watch state, profile and sync foundations are stable. Watch
Together, device remote commands, requests, task controls, webhooks and many music
discovery operations are beta. HLS/audio/image bytes follow their protocol; consume
returned hrefs unchanged. Check stability per operation rather than assuming the
whole group has one label.

### Catalog

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/media` | user | stable | List library movies/series (`type`, `libraryGroupId`, `genre`, `letter`, `tag`, `keyword`, `year`, `sort`, `order`, paging); `include=facets` adds counts |
| `GET` | `/media/{id}` | user | stable | Polymorphic detail: movie, series, season, episode |
| `DELETE` | `/media/{id}` | `media:admin` | stable | Permanently remove an item; privileged operation |
| `GET` | `/media/{id}?include=user` | user | stable | Same + per-user watch state |
| `GET` | `/media/{id}/rating` | user | stable | Current rating for the item |
| `PUT/DELETE` | `/media/{id}/rating` | user | stable | Set a 0–10 rating or remove it with DELETE; PUT `0` also removes it |
| `GET` | `/media/{id}/images/{role}` | public | stable | Fetch an image by role (see [Images](#images)) |
| `GET` | `/series/{id}` | user | stable | Series detail with traversal links |
| `GET` | `/series/{id}/seasons` | user | stable | List seasons |
| `GET` | `/series/{id}/seasons/{n}` | user | stable | Season detail (`/seasons/{id}` takes a season handle) |
| `GET` | `/series/{id}/seasons/{n}/episodes/{e}` | user | stable | One episode, or `404` |
| `GET` | `/series/{id}/watch-marker` | user | stable | Resume target: episode, `positionMs` and state (`?from=` adds `relation`) |
| `GET` | `/series/{id}/episodes` | user | stable | Every episode, paged (`limit`, `offset`; `season`, `episode`, `absolute` and `specials` filters) |
| `GET` | `/series/{id}/next-episode` | user | stable | Next unwatched episode; `?afterPlayback=<episode UUID>` advances past that episode's whole default file (autoplay) |
| `GET` | `/series/{id}/watch-status` | user | stable | Aggregate watch status |
| `GET` | `/seasons/{id}`, `/episodes/{id}` | user | stable | Direct season/episode detail |
| `GET` | `/media/{id}/context`, `/media/{id}/similar` | user | stable | Context and similar titles |
| `POST` | `/media/batch` | user | beta | Batch lookup (beta) |
| `GET` | `/people/{id}` | user | stable | Person detail |
| `GET` | `/people/{id}/images/{role}` | user | stable | Person image (TMDB size vocabulary, see [Images](#images)) |

Library listings use `/media`; `/series/{id}` is the series detail route. Search
and discovery return the item schemas documented for each operation. Keep returned
`id`, `type`, provider `ids` and image hrefs instead of deriving handles from titles.

#### Images

```
GET /api/v1/{entity}/{id}/images/{role}
GET /api/v1/{entity}/{id}/images/{role}/{index}
```

`entity ∈ media | people | users | libraries`
`role` depends on the entity: media artwork includes poster, backdrop, logo, thumb,
banner and still; people use profile, users use avatar.
`index`: for entities with multiple backdrops or logos.
Descriptor-list routes (`GET /media/{id}/images`, `/people/{id}/images`,
`/users/{id}/images`) return available roles. Indexed image routes use the same
`/{role}/{index}` pattern. Item descriptors also use the `primary` role (square art: music, audiobooks, people, users,
stations, libraries, playlists). People have only `profile`; users have only `avatar`.

Media images and user avatars are reachable without a bearer credential. People and library
images need a signed-in user. Payloads embed
image `href`s directly and browsers load them without attaching an
`Authorization` header. Per-item library/age gating still applies whenever a
session *is* present; an `?sig=` HMAC query parameter on the same canonical
path serves as the alternate credential for gated content requested without
one (there is no separate `/image/signed/*` tree).

**Sizing and cache efficiency.** `?size=` is the canonical, cache-friendly way
to request a derivative:

| `?size=` | Pixel width | Where offered |
|---|---|---|
| `thumb` | 250px (library mosaics 256, avatars 48) | poster, thumb, primary, still |
| `medium` | 350px | accepted, but not offered in descriptor `variants` |
| `card` | 480px | most roles |
| `hd` | 1280px | backdrop |
| `wide` | 1920px | backdrop |
| `full` | original (no resize) | all |

A response is `immutable` only when the URL carries `v=<revision>` and a bounded size.
Everything else gets `max-age=3600` with an ETag. `full` is never `immutable`.

- **`?width=N`** snaps onto the smallest preset that is at least as wide and
  within ±20% of it (covering, not nearest), so a request never comes back
  with fewer pixels than it asked for (e.g. `?width=460` → `card`,
  `?width=300` → `medium`). Widths outside every ±20% band render as custom,
  non-`immutable` derivatives, clamped to `[1, 3840]`.
- **`?quality=Q`** snaps to the nearest canonical tier (`50, 70, 85, 95`),
  within ±20%.
- **`?exact=true`** bypasses both snapping rules; reserve for debugging, not
  production traffic.
- **`?format=`** can usually be omitted: the server negotiates AVIF or WebP.
  All image responses vary on `Vary: Accept, Save-Data`.

Two entity types don't follow the preset system: `/people/{id}/images/profile`
accepts `thumb`, `card`, `full` and TMDB sizes (`w45`, `w185`, `h632`, `original`), and
`/libraries/{id}/images/{role}` takes only `?size=thumb|card|hd|full` (256, 512 and 1280
pixels wide, or the generated original).

### Discovery and recommendations

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/search` | user | stable | Cross-type search (`q` and the documented type filters) |
| `GET` | `/trending` | user | stable | Trending titles (`?window=day\|week\|month&type=movie\|series\|all`) |
| `GET` | `/recommendations` | user | stable | Personalised recs multiplexer (`?type=for-you\|ai\|mood\|fulfilled-requests`) |
| `POST` | `/recommendations/refresh` | user | stable | Explicit synchronous refresh; send the same filters in a JSON body; returns the first page |
| `POST` | `/recommendations/dismiss` | user | beta | Dismiss a recommended item |
| `GET` | `/continue-watching` | user | stable | In-progress titles |
| `GET` | `/feed` | user | stable | SDUI home feed (sections wrapping Tier-2 rec endpoints); section titles localized per `Accept-Language`, see [Language negotiation](#language-negotiation-accept-language) |
| `GET` | `/upcoming` | user | stable | Upcoming releases (`?view=alerts\|episodes\|calendar`) |
| `POST` | `/upcoming/refresh` | user | stable | Explicit synchronous refresh; send view and filters in a JSON body |
| `GET` | `/keywords` | user | beta | Keyword browse (`?mode=you-like\|explore\|curated`) |
| `GET` | `/browse` | user | beta | Browse destination (beta); library sorting uses `/media` |
| `GET` | `/browse/genres`, `/browse/libraries` | user | stable | Available genre and library filters |
| `GET` | `/browse/tags` | user | beta | Tag filters (beta) |
| `GET` | `/search/suggest` | user | stable | Search suggestions |
| `GET` | `/watchlist` | user | stable | Saved titles |
| `POST/DELETE` | `/watchlist` | user | stable | Add or remove a title; use the operation’s request body |
| `DELETE` | `/continue-watching/{id}` | user | stable | Remove an entry from continue watching |

`/feed` is a thin composition over the same services as the Tier-2 endpoints.
Pin to the Tier-2 resource endpoints (`/trending`, `/recommendations`, etc.) for
stable automation; feed section structure may change between releases.
`section.id` is the stable part of the contract to filter/cache/branch on;
`section.title` is localized display text and may change wording between
releases.

### Playback

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `POST` | `/media/{id}/playability` | user | stable | Probe before you start: versions, play method per version for your `capabilities`, tracks, resume position, recommended tracks. Endpoint requires `media:read`; use a write-capable token because read-only credentials are blocked from POST; creates no session or grant |
| `GET` | `/playback/{id}/file` | user | stable | Inline direct playback (`?grant=`) |
| `GET` | `/playback/{id}/hls` | user | protocol | HLS master playlist (`?grant=`) |
| `GET` | `/playback/{id}/hls/{path}` | user | protocol | HLS segment (`?grant=`) |
| `GET` | `/playback/{id}/timeline` | user | stable | Chapters, skip segments and trickplay variants for the selected file (ms) |
| `GET` | `/playback/{id}/probe-status` | user | beta | Transcode probe status |
| `GET` | `/playback/{id}/trickplay/{width}` | user | protocol | Trickplay sprite |
| `GET` | `/playback/{id}/trickplay/{width}/manifest` | user | stable | Trickplay manifest (JSON, sheet hrefs) |
| `GET` | `/playback/{id}/subtitles/{index}` | user | protocol | Embedded subtitle by absolute stream index |
| `GET` | `/playback/{id}/subtitles/external/{subtitleId}` | user | stable | External subtitle by id |
| `GET` | `/playback/{id}/subtitles/{index}/rendered` | user | protocol | Bitmap subtitle manifest; image hrefs use `/rendered/{image}` |
| `GET` | `/playback/{id}/chapter-image/{index}` | user | protocol | Chapter artwork; follow the timeline href |
| `GET` | `/playback/grants/{id}` | user (owner) | stable | Grant state by its opaque `id` |
| `POST` | `/playback/grants/{id}/renew` | user (owner) | stable | Body `{ token }`; returns the grant with the extended expiry (never shorter) |
| `DELETE` | `/playback/grants/{id}` | user (owner) | stable | Revoke a grant |
| `POST` | `/playback/telemetry` | user | stable | Client telemetry / quality metrics |
| `POST` | `/playback/previews` | user | stable | Ephemeral hover-preview transcode session |
| `POST` | `/playback/previews/{id}/keepalive` | user (owner) | stable | Bodyless preview heartbeat; use the returned reporting descriptor |
| `DELETE` | `/playback/previews/{id}` | user (owner) | stable | Release a preview (idempotent, including unknown or foreign ids) |

The removed `GET` and `POST /playback/{id}/info` routes answer `410
route_retired` for older clients. Use `POST /media/{id}/playability` to probe
and `POST /play-sessions` to start.

File, manifest, subtitle and image routes return bytes; timeline, probe-status and
grant management return JSON. Stream URLs are **opaque**: take them from
the start response (`delivery.url` and the hrefs inside `delivery`) and send them back
unchanged. Never build, parse or rewrite an HLS URL yourself.

Start requests take library `mediaId` and stable client `deviceId`. Probe with the same
`capabilities` you will send to start. Optional capabilities use server defaults; advertise
only formats the client can decode. Video bitrate ceilings use `maxVideoBitrateBps`
(bits/second), audio uses `bitrateKbps` (kilobits/second), and playback/report positions
use milliseconds. Use the returned `reporting` descriptor for method, href and interval.

For multipart video, opt in with `capabilities.multipartVideo: true` on both playability
and start, select a returned `versionKind: "multipart_video"` with `versionId`, and omit
`fileId`. The server returns one aggregate HLS stream, currently fully transcoded.
All positions and duration use the aggregate clock. Parts are not complete alternate
releases. Without opt-in, a complete physical alternative may play; a multipart-only
item fails with `422`. Group downloads and part-local subtitles, chapters and trickplay
are unavailable. See [Multipart video episodes](/developers/building-a-player/#multipart-video-episodes).

For music only, `purpose: "prefetch"` prepares the next track without consuming a stream
slot. It needs an admitted ACTIVE/PAUSED session for the same user/device; otherwise
`422 prefetch_requires_current_session` means use `purpose: "play"`. One unpromoted
allocation per device is allowed. It expires after ten minutes or when its current
session ends, and real playback promotes it under the usual admission policies.

### Downloads and offline playback

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/media/{id}/download` | `media:read` | stable | Stable original-file attachment; `fileId` chooses a complete physical file; Range supported |
| `GET/POST` | `/media/{id}/renditions` | user | stable | Stable rendition discovery / preparation, subject to download feature flags |
| `GET` | `/renditions/{renditionId}` | user | stable | Stable preparation status |
| `GET` | `/renditions/{renditionId}/file` | user | protocol | Protocol bytes; use the returned href |
| `GET` | `/music/downloads/candidates`, `/series/downloads/candidates` | user | beta | Beta suggested offline items |
| `POST` | `/music/downloads/rescore`, `/series/downloads/rescore` | user | beta | Beta priority rescoring |
| `POST` | `/offline-playback-sessions` | user | experimental | Experimental batched offline playback records |
| `GET` | `/network/speed-test` | user | beta | Beta byte payload for client timing |
| `POST` | `/network/speed-test/results` | user | beta | Beta speed-test result upload |

Download-only transfers must not create a listening start. Music downloads use Bearer
`GET /music/tracks/{id}/stream?download=1`; audiobook transfer preparation uses the
start contract’s `audio.download`. See [Offline downloads](/developers/offline-downloads/)
for local playback reporting and the feature-specific access rules.

### Sessions and watch state

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/play-sessions` | user / admin | stable | Playing now (`?scope=mine\|all&itemId=`; `scope=all` requires admin) |
| `POST` | `/play-sessions` | user | stable | Start playback for video, music and audiobooks (`media:write`): `201` with `{ playbackSessionId, mediaId, kind, delivery, grant, reporting }`; see [Play media from your own client](/developers/building-a-player/#play-media-from-your-own-client) |
| `PUT` | `/play-sessions/{id}` | user (owner) | stable | Report progress (heartbeat). `status: COMPLETED` ends the session (`204`) |
| `POST` | `/play-sessions/{id}/beacon` | user (owner) | stable | `sendBeacon` alias of PUT; same report body |
| `GET` | `/play-sessions/{id}/events` | user (owner) | stable | SSE events for a session |
| `DELETE` | `/play-sessions/{id}` | owner or admin | stable | Terminate a session and free its stream slot. Anyone else gets `404` |
| `POST` | `/play-sessions/replay` | user | beta | Replay finished plays that had no live session (offline music) |
| `GET` | `/me/resume-handoff` | user | stable | Check whether another device continued this user's playback; call while paused, with `mediaId`, `positionMs`, `deviceId`, and `idleMs` |
| `GET` | `/watch-state/{id}` | user | stable | `{ watched, positionMs, resumeAnchor, favorite, rating }` |
| `PATCH` | `/watch-state/{id}` | user | stable | Set watched / favorite (partial); rate through `/media/{id}/rating` |

`positionMs` uses milliseconds, and so does `/playback/{id}/timeline` (chapters, skip
segments, trickplay). Follow the schema for each time field.

### Library sync and ingest

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/sync/library` | user | stable | Stable library snapshot bootstrap |
| `GET` | `/sync/changes` | user | stable | Stable incremental library changes; keep opaque cursors |
| `GET` | `/sync/user-state` | user | stable | Stable user-state snapshot/deltas |
| `POST` | `/libraries/ingest` | admin PAT/service token with `tasks:run` | beta | Beta delta ingest; send `Idempotency-Key` |
| `GET` | `/libraries/{id}/images`, `/libraries/{id}/images/{role}`, `/libraries/{id}/images/{role}/{index}` | user | stable | Library image descriptors and bytes |

See [Library sync](/developers/library-sync/) for cursor lifecycles. Library-path
configuration, full scan triggers, queue control and provider configuration belong to
operator tooling; their internal routes are not public stable integration promises.

### Tasks, runs, and queues

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/tasks` | `tasks:read` | beta | List scheduled task definitions |
| `GET` | `/tasks/{taskId}` | `tasks:read` | beta | One task definition |
| `POST` | `/tasks/{taskId}/run` | `tasks:run` | beta | Enqueue a run |
| `GET/PATCH` | `/tasks/{taskId}/state` | `tasks:admin` | beta | Pause/resume schedule, manage circuit breaker (partial update) |
| `GET` | `/tasks/{taskId}/backlog` | `tasks:read` | beta | Backlog item listing |
| `GET/PUT` | `/tasks/{taskId}/settings` | `tasks:admin` | beta | Per-task settings |
| `GET/PUT/DELETE` | `/tasks/{taskId}/triggers` | `tasks:admin` | beta | Interval/daily/weekly/startup triggers (`PUT` body `{ triggers: [...] }`, 1–8, replaces all; `DELETE` resets to the task's default schedule) |
| `GET` | `/tasks/{taskId}/failures` | `tasks:read` | beta | Per-item failure log |
| `POST` | `/tasks/{taskId}/failures/{itemId}/retry` | `tasks:run` | beta | Retry one failed item |
| `GET` | `/runs` | `runs:read` | beta | Run history (`{items,page}`) |
| `GET` | `/runs/{id}` | `runs:read` | beta | One run + result |
| `GET` | `/runs/{id}/logs` | `runs:read` | beta | Log lines for one run |
| `POST` | `/runs/{id}/cancel` | `tasks:run` | beta | Cancel one run: graceful, `{ "force": true }` hard-kills. `404` unknown run, `409` already finished, `alreadyCancelling: true` when a graceful cancel was already in progress |
| `POST` | `/runs/cancel?byTask={id}` | `tasks:run` | beta | Cancel all runs for a task: graceful unless `{ "force": true }`. Returns `cancelled`, `orphaned` (already finished or gone) and `escalated` (hard-kills scheduled) |
| `GET` | `/tasks/{taskId}/failures/{itemId}/history` | `tasks:read` | beta | Failure-attempt history |

These published task/run controls are **beta operator APIs**. The public schema does
not include queue/scheduler control or a live-run SSE operation. Cancellation here uses
`POST /runs/{id}/cancel` with `{ "force": true }` for escalation; playback cancellation
uses `DELETE /play-sessions/{id}`.

**Scope note:** task/ops routes (`/tasks`, `/runs`, `/queues`) accept only
`pat_`/`svc_` or an admin session, **not** device-flow JWTs. See [Scope
tree](/developers/api/#scope-tree): the coarse `read` alias does **not**
expand to `tasks:read`.

### Integrations

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/integrations/homepage` | `integrations:read` service token or admin | beta | Beta dashboard feed |
| `GET` | `/integrations/upcoming` | `integrations:read` service token | beta | Beta upcoming feed |
| `GET` | `/integrations/watch-history` | `integrations:read` service token | beta | Beta watch-history feed |

Watch-history and upcoming reject other credential kinds, including admin PATs and
admin service tokens; Homepage also accepts an admin principal. The exclusive
`integrations:read` service grant reads only these feeds and requires its owner to
remain an administrator. Keep the token
server-side. Provider setup and integration-key management are operator tooling, not
additional public routes under these prefixes.

### Diagnostics

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `POST` | `/diagnostics/events` | user | stable | Batch of client diagnostics: `crash \| hang \| js_error \| api_failures \| playback_incident` |
| `PATCH` | `/diagnostics/events/resolve` | user | stable | Mark a playback attempt recovered |
| `POST` | `/diagnostics/bundles` | user | stable | Upload a gzipped client log bundle |

See [Client diagnostics](/developers/client-diagnostics/) for what each kind
contains, redaction, retention, and how to review or disable it.

### Notifications and events

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/events` | user | stable | Global per-user SSE channel |
| `GET` | `/notifications` | user | stable | Durable notification inbox |
| `GET` | `/notifications/{id}` | user | stable | One owned notification |
| `GET` | `/notifications/unread-count` | user | stable | Fast unread badge count |
| `POST` | `/notifications/read-all` | user | stable | Mark all as read |
| `POST` | `/notifications/{id}/read` | user | stable | Mark one notification as read |
| `DELETE` | `/notifications/{id}` | user | stable | Delete one notification |
| `GET` | `/me/series-follows` | user | stable | Series you follow for new-episode notifications |
| `PUT` | `/me/series-follows/{seriesId}` | user | stable | Follow a series (idempotent) |
| `DELETE` | `/me/series-follows/{seriesId}` | user | stable | Unfollow a series (idempotent) |

`/me/series-follows` is a separate, explicit per-series subscription for
third-party clients. It's distinct from the end-user "New episode" toggle in the
web UI's notification settings, which controls the same event for the account
as a whole.

Notification forwarding is beta: `GET/PUT /me/notification-forwarding` and
`GET/POST/DELETE /me/notification-webhook`. Forwarded/push artwork and localized payloads
use issued links (`GET /notifications/{id}/image`, `/push-image`,
`/push-content/{locale}`); their endpoint-specific signed credentials do not authorize
resource API calls.

### Server discovery

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/server` | public / user | stable | Discovery: name, release, sign-in methods. With a bearer token it adds `capabilities`, `build` and `caller` (`id`, `isAdmin`, `permissions`) |
| `GET` | `/server/notice` | user | stable | The active maintenance notice, or `{ "notice": null }` |

### Watch-together

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/watch-together` | user | beta | Current user’s `{ party }` wrapper; `party` may be `null` |
| `GET` | `/watch-together/parties` | user | beta | List host-listed parties; admins may include unlisted parties |
| `POST` | `/watch-together/parties` | user | beta | Create a watch party (beta) |
| `GET` | `/watch-together/{code}` | user | beta | Get a party by code |
| `POST` | `/watch-together/{code}/events` | user | beta | Send an event (join, seek, reaction, etc.) |
| `GET` | `/watch-together/{code}/events` | user | beta | SSE downstream (beta) |

End a party by sending the `disband` event; guests leave with `leave`. There is
no `DELETE /watch-together/{code}` route.

Events use a discriminated `{ clientId, type, payload }` envelope on both the
`POST` upstream and the SSE downstream. The closed `type` enum falls into three groups:

- **Broadcasts** (fire-and-forget, no server confirmation): `seek`, `sync`,
  `position`, `reaction`, `effect`
- **Authoritative** (server-confirmed state changes): `join`, `leave`,
  `navigate`, `version`, `visibility`, `transfer-host`, `disband`, `activity`
- **Barriers** (playback sync primitives): `ready`, `stall`, `stall-ready`,
  `heartbeat`

### Devices and cast

:::caution[`{id}` here is the `device_session_id`, not your `device_id`]
For every `/devices/{id}/…` endpoint below, `{id}` is the **`device_session_id`
claim from the JWT**, not the `device_id` UUID you generate and send when
requesting a device code. The two are different identifiers:

- `device_id`: yours, stable per physical device, sent as `device_id` in the
  OAuth request and as `deviceId` in `POST /play-sessions`.
- `device_session_id`: the server’s, embedded in the JWT and used for device
  addressing. Reauthorization with the same `device_id` can reuse it for that user.

`/heartbeat` enforces `{id} === deviceSessionId` and returns `403` otherwise. Because
the session id is per-token, two accounts signed in on one physical device get
separate presence and separate command inboxes automatically.
:::

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/devices` | user | stable | List user devices (`?scope=mine`) |
| `POST` | `/devices/{id}/heartbeat` | device JWT | stable | Self-device presence keepalive; PAT/service tokens have no device-session claim |
| `PATCH/DELETE` | `/devices/{id}` | user (owner) | stable | Rename or revoke a device |
| `POST` | `/devices/revoke-all` | user | stable | Revoke own devices |
| `PUT/DELETE` | `/devices/{id}/push-token` | device JWT | stable | Register/remove push destination for this device |
| `GET/POST` | `/devices/{id}/commands` | user | beta | Read pending commands / send a command (beta) |
| `POST` | `/devices/{id}/commands/{commandId}/result` | target device | beta | Acknowledge a command result (beta) |
| `GET` | `/devices/{id}/commands/{commandId}` | user | beta | Read a command and its status |
| `DELETE` | `/devices/{id}/commands/{commandId}` | user | beta | Cancel a command that is not applied yet |
| `GET/PUT` | `/devices/{id}/state` | user | beta | What the device plays now and what it can do |
| `GET/POST` | `/devices/grants` | user | beta | List or grant household remote-control access (beta) |
| `DELETE` | `/devices/grants/{username}` | user | beta | Remove access by username (beta) |
| `GET` | `/devices/controllable` | user | beta | Devices others allowed you to control |

The commands and their arguments are described in
[Device remote control](/developers/watch-together/#device-remote-control).

### Users and profile

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET/PATCH` | `/me/privacy` | user | stable | Your privacy preferences (`hideFromOthers`, `shareListeningActivity`, `shareAudiobookActivity`, read-only `listeningCircleConfigured`); device tokens and PATs accepted. `PATCH` is partial: omitted fields keep their stored values; an empty update answers `422 validation_failed` |
| `GET` | `/me` | user | stable | Own profile: `{id, username, isAdmin, isAgeRestricted, permissions, groups}` |
| `GET/PATCH` | `/me/playback-preferences` | user | stable | Client playback settings; partial update. `metadataLanguage`/`metadataTitleLanguage` override `Accept-Language`, see [Language negotiation](#language-negotiation-accept-language) |
| `GET/POST` | `/me/pats` | user | stable | Own PATs; `DELETE /me/pats/{id}` revokes (`204`) |
| `GET` | `/me/links` | user | stable | Linked third-party accounts |
| `GET/DELETE` | `/me/links/{provider}` | user | stable | One linked account: status, and unlink |
| `POST` | `/me/links/{provider}/authorize` | user | stable | Initiate OAuth account linking (returns an `authUrl`) |
| `GET` | `/users/{id}` | `users:admin` | stable | Read another user's profile |
| `GET` | `/users/{id}/images/avatar` | public | stable | User avatar (shown in social contexts without a session); sizes `thumb`, `card`, `full` = 48, 96, 200 px |
| `PUT/DELETE` | `/users/{id}/images/avatar` | user (self or admin) | stable | Upload / remove an avatar (multipart) |

### Administration boundaries

The public schema also exposes user/access administration. These are privileged
operations, not capabilities of a device token:

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET/POST` | `/users` | `users:admin` | stable | List/create users; method-specific scope and admin ceiling |
| `PATCH` | `/users/{id}` | `users:admin` | stable | Update account state; admin ceiling for privilege changes |
| `GET/DELETE` | `/users/{id}/identities` | `users:admin` | stable | Inspect/remove federated identities |
| `POST` | `/users/{id}/password` | `users:admin` | stable | Reset password |
| `GET/POST` | `/users/{id}/pats` | `tokens:admin` | stable | List/mint for a user; minting ceiling applies |
| `DELETE` | `/users/{id}/pats/{tokenId}` | `tokens:admin` | stable | Revoke an authorized PAT |
| `GET` | `/users/{id}/devices` | `users:admin` | stable | List devices |
| `DELETE` | `/users/{id}/devices/{deviceSessionId}` | `users:admin` | stable | Revoke a device |
| `POST` | `/users/{id}/devices/revoke-all` | `users:admin` | stable | Revoke all devices |
| `GET/POST` | `/access/groups` | `access:admin` | beta | Beta list/create access groups |
| `GET/PATCH/DELETE` | `/access/groups/{id}` | `access:admin` | beta | Beta read/update/delete group |
| `GET` | `/access/groups/{id}/members` | `access:admin` | beta | Beta membership listing |
| `PUT/DELETE` | `/access/groups/{id}/members/{userId}` | `access:admin` | beta | Beta bodyless membership change |

The beta debug-report family (`GET /admin/debug-report`, `/health`,
`/runs/{runId}`, `/cluster/nodes/{instanceId}` and
`/client-diagnostics/{fingerprint}` below that prefix) requires admin or the exclusive,
admin-minted `diagnostics:read` service grant. It exposes operator data; keep such a
token on a trusted server. Other `/admin` routes are internal and intentionally omitted.

### Permissions

`GET /server` (`caller.permissions`) and `GET /me` (`permissions`) return the same
object:

| Field | Meaning |
|---|---|
| `canRequest` | Submit media requests |
| `canReview` | Write community reviews |
| `canAnnotateMedia` | Player annotations |
| `canWatchLiveTv` | Live TV. Without it every Live TV endpoint answers `403 forbidden` |
| `canSeeAllPlayback` | The web app's Active streams view shows everyone's playback. `GET /play-sessions?scope=all` still requires an administrator |

Playback also requires the appropriate token scope, an accessible source and admission
under stream/IP/transcode policies. `/server` capabilities describe server features;
`caller.permissions` describes account permissions, not the full token grant.

### Social: playlists and lists

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET/POST` | `/playlists` | user | stable | Collection: list or create |
| `GET/PATCH/DELETE` | `/playlists/{id}` | user | stable | One playlist |
| `GET/POST` | `/playlists/{id}/items` | user | stable | List or add playlist items |
| `DELETE` | `/playlists/{id}/items/{entryId}` | user | stable | Remove one item |
| `PUT` | `/playlists/{id}/items/{entryId}/watched` | user | stable | Update an item's watched status |
| `POST` | `/playlists/{id}/items/bulk-delete` | user | stable | Bulk removal of authorized entries |
| `PUT` | `/playlists/{id}/items/order` | user | stable | Reorder playlist items |
| `GET/POST` | `/playlists/{id}/members` | user | stable | Collaboration members |
| `PUT/DELETE` | `/playlists/{id}/members/{userId}` | user | stable | Manage one member (by user id) |
| `GET` | `/lists` | user | stable | Curated lists |
| `GET` | `/lists/{id}` | user | stable | One curated list |

Playlist membership paths use stable user UUIDs. Follow each resource’s path schema:
remote-control `/devices/grants/{username}` is an explicit username-based exception.

### Media requests (beta)

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/requests` | user | beta | Own requests (`?scope=mine\|all&status=`) |
| `POST` | `/requests` | user | beta | Submit a request |
| `GET` | `/requests/{id}` | user | beta | One request |
| `GET` | `/requests/quota` | user | beta | Per-user quota |
| `POST` | `/requests/{id}/dismissal` | user | beta | Dismiss a request notification (`204`) |
| `POST` | `/requests/dismissals` | user | beta | Dismiss a title that has no request: `{ externalIds, mediaType }` |

Quota is per-user, per-rolling-period, with separate `movie` and `series` buckets.
Exceeding quota → `422 quota_exceeded` with the bucket in `details`.

`POST /requests/seasons` and `POST /requests/status` provide beta requestability/status
lookups. Submission still depends on the caller’s `canRequest` account permission.

### Stats

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/me/stats` | user | beta | Own watch stats (`?period=7d\|30d\|90d\|year:YYYY\|all`) |

### Live TV

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/livetv/stations` | user | stable | Stable stations with number, images, shown `feedId` and `nowNext` |
| `GET` | `/livetv/stations/{stationId}` | user | stable | One station with `nowNext` (current and next airing) |
| `GET` | `/livetv/stations/{stationId}/feeds` | user | beta | Feed choices; pass a feed's `id` as `feedId` when starting playback |
| `GET` | `/livetv/stations/{stationId}/programs` | user | stable | Airings for a window (required UTC `from` / `to`, at most 24 hours) and `nowNext` |
| `GET` | `/livetv/stations/{stationId}/current-program` | user | stable | `nowNext` and `asOf` |
| `GET` | `/livetv/guide` | user | stable | Required `from` / `to` (at most 24 hours); `stationIds` (max 200) or `limit` + `cursor` paging; `stations[{stationId, airings, nowNext}]` |
| `GET` | `/livetv/programs/search` | user | beta | Program search; `channels[].id` identifies a station |
| `GET` | `/livetv/availability` | user | stable | Feed-keyed availability; join using the station's `feedId` |
| `GET/PUT` | `/livetv/favorites` | user | stable | Favorites use `stationIds`; PUT `{ stationId, favorite }` |
| `PUT` | `/livetv/favorites/order` | user | stable | Reorder favorites with `{ stationIds }` |
| `GET/PATCH` | `/livetv/simple-mode` | user | beta | Viewer settings use `stationIds`, `startStationId`, `clearStartStation` |
| `POST` | `/livetv/playback-sessions` | user | stable | Start: `{ stationId, feedId?, quality?, maxBitrateBps?, hevc? }` → `201` with `delivery.url`, quality details, `reporting` keepalive descriptor, and `grant` |
| `GET` | `/livetv/playback-sessions/{playbackSessionId}` | user (owner) | stable | `state` (`active` / `ended`), `endReason`, and `failure` (`code`, `retryable`, `retryAfterMs`, `at`) when the channel failed |
| `POST` | `/livetv/playback-sessions/{playbackSessionId}/keepalive` | user (owner) | stable | Call `reporting.href` every `reporting.intervalMs`; `204` or `410` with `reason: evicted\|superseded\|expired\|left\|failed` |
| `DELETE` | `/livetv/playback-sessions/{playbackSessionId}` | user (owner) | stable | Stop the session (`204`, idempotent). `POST .../leave` is the same for `sendBeacon` |
| `POST` | `/livetv/playback-sessions/{playbackSessionId}/leave` | user (owner) | stable | Same cleanup for `sendBeacon` |
| HLS | `delivery.url` | user | protocol | Opaque manifest URL returned by the start response; follow its child URLs and do not construct protocol paths |

`POST /livetv/simple-mode/verify-pin` verifies the viewer setting’s PIN (beta).
The HLS protocol path `/livetv/channels/{id}/stream/{path}` remains a byte endpoint;
that does not restore the retired channel-based browsing/start API.

Station and playback-session routes replace the old channel viewer routes
without aliases. For the complete lifecycle, feed selection, quality options
and eviction handling, see [Live TV playback](/developers/live-tv-playback/).

### Audiobooks

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/audiobooks` | user | stable | Stable book listing |
| `GET` | `/audiobooks/authors`, `/audiobooks/narrators`, `/audiobooks/series` | user | stable | Stable browse collections |
| `GET` | `/audiobooks/authors/{id}`, `/audiobooks/narrators/{id}`, `/audiobooks/series/{id}` | user | stable | Stable browse entity detail |
| `GET` | `/audiobooks/authors/{id}/books`, `/audiobooks/narrators/{id}/books`, `/audiobooks/series/{id}/books` | user | stable | Stable filtered book lists |
| `GET` | `/audiobooks/facets` | user | beta | Beta browse filters |
| `GET/PUT` | `/media/{id}/listening-sharing` | user | stable | Stable per-book sharing preference |
| `GET` | `/audiobooks/{mediaId}/files/{trackIndex}`, `/audiobooks/{mediaId}/remux/{trackIndex}` | user/grant | protocol | Protocol direct/remux audio; consume granted hrefs |
| `GET` | `/audiobook/{mediaId}/hls/{token}/{sessionId}/{file}` | user/grant | protocol | Protocol HLS; opaque issued URL |

The singular `/audiobook/{mediaId}/file/{ino}` and `/remux/{ino}` routes are deprecated
retirement responses, not alternate playback routes. Start with `POST /play-sessions`
and follow its delivery. Book progress and track offsets use the book-wide clock;
see [Audiobook playback](/developers/audiobook-playback/).

### Music

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/music/tracks`, `/music/albums`, `/music/artists`, `/music/genres` | user | stable | List endpoints |
| `GET` | `/music/tracks/{id}` | user | stable | Track detail |
| `GET` | `/music/tracks/{id}/lyrics` | user | stable | Lyrics, when available |
| `GET` | `/music/tracks/{id}/similar` | user | beta | Similar tracks; `?basis=auto\|metadata\|sonic`, `{ items, source, page }` |
| `GET` | `/music/tracks/{id}/stream` | user | protocol | Audio playback (see [Music streaming and transcoding](#music-streaming-and-transcoding)) |
| `PUT/DELETE` | `/me/music/tracks/{id}/feedback` | user | beta | Explicit like or dislike (`{ "feedback": "liked" }` or `"disliked"`). Skips and completions never change it |
| `POST` | `/music/recommendations` | user | beta | What to play next: `{ seed?, context: { currentTrackId?, history?, skipped?, exclude?, upcoming?, crossfade?, startedBy? } }` → `{ next?, alternatives, source }`; a mood seed alone is a cold start |
| `GET` | `/music/albums/{id}/similar`, `/music/artists/{id}/similar` | user | beta | Sonic similarity, requires `sonicEmbeddings` (`/server` → `capabilities.music.sonicSimilarity`) |
| `GET` | `/music/path` | user | beta | Sonic bridge between two tracks, requires `sonicEmbeddings`; rate-limited |
| `GET` | `/music/sonic-mixes`, `/music/sonic-mixes/{id}/tracks` | user | beta | Sonic mixes, requires `musicClusters` (`capabilities.music.sonicMixes`) |
| `GET` | `/me/music/taste-stations`, `/me/music/taste-stations/{id}/tracks` | user | beta | Taste stations; the `id` may be stored, `410` once its clustering expired |
| `GET` | `/music/mood-recommendations` | user | beta | Requires the `sonicQueue` feature; rate-limited |
| `GET/POST` | `/me/music/pinned-genres` | user | beta | Pinned genres |
| `DELETE` | `/me/music/pinned-genres/{genre}` | user | beta | Unpin (percent-encode any `/` in the genre name) |
| `GET` | `/me/music/recently-played`, `/me/music/top-tracks`, `/me/music/top-artists` | user | beta | Listener rows for a music home; `{ items, page: { limit, truncated } }` |
| `GET` | `/music/radio/stations` | user | beta | Internet-radio station list |
| `GET` | `/music/radio/stations/{id}/stream` | user | protocol | Radio stream |
| `GET` | `/music/radio/stations/{id}/now-playing` | user | beta | Current track on a station |

Additional music operations:

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/music` | user | stable | Stable server-built music destination |
| `GET` | `/music/albums/{id}`, `/music/artists/{id}` | user | stable | Stable album/artist detail |
| `GET` | `/music/lyrics-search`, `/music/text-search` | user | stable | Stable semantic discovery; requires the corresponding server features |
| `PUT` | `/music/tracks/{id}/lyrics` | admin | stable | Stable lyric upload/replacement |
| `GET` | `/music/alpha-index`, `/music/moods` | user | beta | Beta collection index / selectable moods |
| `POST` | `/music/quick-picks` | user | beta | Beta quick picks |
| `GET` | `/music/sections/because-you-listened`, `/music/sections/genre/{name}`, `/music/sections/mood-shelf`, `/music/sections/new-for-you`, `/music/sections/smart-mixes` | user | beta | Beta music-home sections |
| `GET` | `/music/sonic-fingerprint`, `/music/sonic-mixes/index` | user | beta | Beta sonic discovery |
| `GET` | `/music/sonic-mixes/{id}/shuffle` | user | beta | Protocol shuffled audio |
| `GET` | `/music/images/collage`, `/music/radio/stations/{id}/images/{role}` | user | beta | Beta artwork |

#### Music streaming and transcoding

`GET /music/tracks/{id}/stream` negotiates direct play or audio conversion. Query
`format` accepts `mp3 | opus | aac | m4a | raw`. `bitrateKbps` explicitly requests a
re-encode at a supported quality rung; `maxBitrateKbps` is a ceiling and converts only
when needed. `startPositionSeconds` is a stream seek in seconds, unlike the
millisecond positions used by session start/reporting. A different codec/container,
unsupported capability, channel limit, explicit bitrate or stream seek can require
conversion. It must be enabled server-side.

`format=raw` requests the original bytes. It rejects conflicting seeks, bitrate or
capability requirements; it does not silently bypass them. For normal listening,
start with `POST /play-sessions` and follow the returned audio URL, rather than
rewriting its query. See [Music playback](/developers/music-playback/) and
[Codec support](/reference/codec-support/) for format and quality details. Capacity
failures can return `503`; honour `Retry-After` when supplied.

### Community and collaboration (beta)

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET/POST` | `/media/{id}/comments`, `/people/{id}/comments`, `/playlists/{id}/comments` | user | beta | Read or add comments; account permissions and ownership apply |
| `DELETE` | `/media/{id}/comments/{commentId}`, `/people/{id}/comments/{commentId}`, `/playlists/{id}/comments/{commentId}` | user | beta | Delete an authorized comment |
| `GET/PUT/DELETE` | `/media/{id}/reactions`, `/people/{id}/reactions`, `/playlists/{id}/reactions` | user | beta | Read, set or remove a reaction |
| `GET` | `/media/{id}/viewers` | user | beta | Privacy-filtered viewers |
| `POST` | `/playlists/{id}/invite` | user | beta | Accept or decline an invitation |
| `GET` | `/playlists/{id}/playback-context`, `/playlists/{id}/progress`, `/playlists/{id}/suggestions` | user | beta | Collaborative playback context, progress and suggestions |
| `PUT` | `/playlists/{id}/view-state` | user | beta | Caller’s collapsed series/season groups |
| `POST/DELETE` | `/for-you/dismiss` | user | beta | Dismiss or restore a home suggestion |
| `POST` | `/for-you/less-like-this` | user | beta | Feedback on suggestions |

### Webhooks

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/webhooks` | `webhooks:write` | beta | List webhooks |
| `POST` | `/webhooks` | `webhooks:write` | beta | Create webhook |
| `PUT/DELETE` | `/webhooks/{id}` | `webhooks:write` | beta | Manage one webhook |
| `POST` | `/webhooks/{id}/test` | `webhooks:write` | beta | Send a test payload |
| `GET` | `/webhooks/events` | `webhooks:write` | beta | Available webhook event kinds |

### Miscellaneous

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `POST` | `/auth/logout` | device JWT | stable | Revoke current device session and refresh credentials |
| `GET/POST` | `/service-tokens` | `tokens:admin` | beta | List/create service tokens (beta; creation also enforces the minting ceiling) |
| `GET/DELETE` | `/service-tokens/{id}` | `tokens:admin` | beta | Read/revoke service tokens (beta) |

Internal config, plugin-management and forward-auth diagnostics paths are omitted from
the public contract. Use the operator UI for these tasks.

Experimental Top Shelf previews use `GET /media/{id}/topshelf-preview` and its issued
`/file/{variant}` URL. They are separate from ordinary hover-preview sessions.

### Health and metrics (unversioned)

These sit outside the `/api/v1` resource tree and carry no version prefix.
They're an operational ABI (load balancers, Kubernetes, Prometheus pin literal
paths) and are exempt from the `problem+json` and version-prefix conventions
used elsewhere.

| Method | Path | Auth | Stability | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | public | operational | Liveness: always `200`, no dependency checks |
| `GET` | `/api/health/ready` | public / admin | operational | Readiness: `200`/`503`; per-component verdict for an admin caller |
| `GET` | `/metrics` | public (opt-in) or `metrics:read` | operational | Prometheus text exposition; also gated by `LUMASTRA_METRICS_BEARER_TOKEN` |

## `/events`: the global per-user SSE channel

`GET /api/v1/events` is the **one global per-user push channel**. Connect with a
standard `EventSource`:

```js
const es = new EventSource('/api/v1/events', { withCredentials: true });
// Clients that cannot send a session cookie read the stream with fetch() and an
// Authorization header. Query-string tokens are not accepted.
```

On connect, the server immediately sends a `connected` bootstrap frame:

```
event: connected
data: {"serverTime":1766258109000}
```

Hub frames carry a numeric SSE `id:`. On reconnect, pass the last SSE ID in
`Last-Event-ID` (not the notification UUID). Replay comes from a shared 500-entry,
one-hour Valkey ring, filtered per recipient. It is bounded catch-up, not a durable
sync log. Use `/notifications` and sync endpoints to recover after a longer gap.
Hub `data:` is an envelope `{ targetUserId, targetDeviceSessionId?, replay?, kind,
data, notificationId? }`; the inner `data` is the event payload. `connected`, `admin`
and watch-state signals carry their payload directly and have no replay ID.

Signal and notification **SSE frame names** are advertised at `GET /server` in `capabilities.events.kinds[].name`; `connected` is the additional bootstrap frame:

| Event type | Trigger |
|---|---|
| `connected` | Bootstrap frame with server time |
| `admin` | Operator message or maintenance state; discriminate on `data.type` |
| `device.command` | A command for this device (sent to the target device only) |
| `device.command_cancelled` | A pending command for this target device was cancelled |
| `device.command_status` | A command you sent changed status |
| `device.state` | A device of your account reported new state |
| `session_changed` | Session/watch-state signal |
| `watch_state_set_changed` | Watch-state-set signal |
| `library.new_episode` | New episode for a followed series |
| `request.available` | Requested title is available |
| `admin.broadcast` | Durable operator notification |

The `admin` payload types are `admin_message`, `maintenance_notice` and
`maintenance_cleared`. These signals are live-only. The last three notification
types also write to the durable inbox (`/notifications`).

Device command/cancel/state/status frames are live-only. Reconnect a receiver by
reading `/devices/{id}/commands` for pending commands. Ignore unknown event names.
Handle `429` connection limits and `503` capacity failures before opening the stream;
retry with backoff and the advertised `reconnectMaxMs`. Native clients should use a
Bearer-authenticated streaming request. Browser `EventSource` cannot set that header.

For `admin_message`, honour optional `playSessionId`/`deviceId` targeting on the client;
an unknown severity should display as `info`. The server re-sends current maintenance
state on connect; `/server/notice` also recovers that state.

The scoped SSE channels (`watch-together/{code}/events`, `play-sessions/{id}/events`) remain separate; they have a resource lifecycle the
global channel does not.

## `/server`: discovery and capabilities

`GET /api/v1/server` (also `HEAD`) is the one discovery call, with `Cache-Control: private,
no-cache` and an `ETag`. Without a credential it answers the anonymous tier: `id`, `name`,
`release`, `apiVersions`, `branding`, `auth` (`deviceFlow`, `passwordLogin`) and `links`. With a
valid user bearer token it adds `build`, `caller` and `capabilities`. There is no separate
`/server/capabilities` route. Invalid credentials receive the anonymous tier; a
service token also receives the anonymous tier. Use a user JWT/PAT to discover caller
permissions. Treat absent optional capabilities as unsupported.

Selected fields from an authenticated response (feature values vary per server):

```jsonc
{
  "id": "550e8400-e29b-41d4-a716-446655440000", "name": "Home", "release": "0.1.0", "apiVersions": ["v1"],
  "caller": { "id": "…", "isAdmin": false, "permissions": { "canRequest": true, "canReview": true,
              "canAnnotateMedia": true, "canWatchLiveTv": true, "canSeeAllPlayback": false } },
  "capabilities": {
    "playback": { "direct": true, "remux": true, "transcode": true,
                  "transcoder": { "engine": "ffmpeg", "videoCodecs": ["h264", "hevc"],
                                  "audioCodecs": ["aac", "ac3"], "containers": ["mp4", "ts"],
                                  "maxResolution": "4K", "hdrPassthrough": true,
                                  "dolbyVisionPassthrough": false },
                  "hlsVariants": ["720p", "1080p"], "maxBitrateKbps": null },
    "liveTv": { "available": true },
    "music": { "available": true, "clustering": false, "sonicSimilarity": false, "sonicMixes": false },
    "audiobooks": { "available": false },
    "features": { "watchTogether": true, "videoPreviews": true, "topShelfPreviews": false,
                  "mediaDownload": false, "downloadRenditions": false },
    "events": { "href": "/api/v1/events", "reconnectMaxMs": 30000,
                "kinds": [ { "name": "admin", "class": "signal", "durable": false, "available": true } ] },
    "metadata": { "primary": "en", "additional": ["de"] }
  }
}
```

`capabilities.features` is the **engine-can-do matrix** (booleans in camelCase), distinct
from the `playback` transcoder capabilities. `music.available` is true when the server has at
least one enabled music library; `music.clustering` is a separate recommendation feature and
says nothing about whether music exists. `metadata.primary` and `.additional` list the
languages enabled for metadata translation, see [Language
negotiation](#language-negotiation-accept-language) below. `GET /api/v1/server/notice`
returns the active maintenance notice or `{ "notice": null }`; call it on launch and on
foreground.

## Language negotiation (`Accept-Language`)

`/api/v1` clients negotiate language per request with the standard
`Accept-Language` header. There is no `?language=` query parameter and no
`Content-Language` response header.

Two negotiations run independently, against different candidate sets:

| | Candidate set | Applies to |
|---|---|---|
| **Metadata** | Admin-enabled set: the server's primary language plus any additional languages enabled | `title` / `overview` / `tagline` on media, wherever the translation overlay runs |
| **UI chrome** | The UI's supported locales: `en`, `de` only | `/feed` section titles |

**Metadata precedence** is a chain of signals, each consulted only if the one
above it produced no signal:

1. Stored preference: `metadataLanguage` / `metadataTitleLanguage` fields on
   `PATCH /me/playback-preferences`
2. The language-switcher cookie set by the web UI
3. The `Accept-Language` request header
4. The server's primary language

A stored preference or cookie that is **present but unsatisfiable** (names a
language the server doesn't have enabled) ends the chain at the primary
language. It does **not** fall through to the next signal. For example, the
cookie is set to `de`, only `fr` is enabled server-side, and the request's
`Accept-Language` says `fr`. The response is still the primary language, not
French, because the cookie already supplied (and exhausted) a signal.

**UI chrome** (server-built section titles) resolves independently: explicit
`PARAGLIDE_LOCALE` cookie first, then `Accept-Language` against `en`/`de`, then
English. An unsupported but present cookie stops at English. Stored metadata
preferences do not affect this UI-language choice.

Use `GET /server` to discover which languages are enabled before
assuming a preference will resolve (see the `metadata` block above).

:::note[Behavior change for cookie-less clients]
Clients that never set the language-switcher cookie, including a browser that
never touched the UI's language switcher, now get both UI chrome and metadata
localized from `Accept-Language` instead of always defaulting to English. A
user browsing with a German-language browser who never opened Settings →
Display previously saw English throughout and now sees German. Explicitly
choosing a language in Settings → Display still writes the cookie, which takes
precedence over the header for both negotiations going forward.
:::


### Choosing a language as a client

Send `Accept-Language` with the device language on every request, for example
`Accept-Language: de-DE, de;q=0.9, en;q=0.5`. To let a user pick a metadata language that differs
from the device, store it once with `PATCH /api/v1/me/playback-preferences` (`metadataLanguage`
for overviews and taglines, `metadataTitleLanguage` for titles); the stored preference then wins
over the header on every client. Operations whose responses carry translated titles or overviews
list the `Accept-Language` header parameter in the [API reference](/reference/).

## Library scan & delta ingest

Full library scans and library-path configuration are operator actions. Their internal
routes are not part of the public schema. Use the server’s administration UI to configure
paths and scan them. The public **beta** integration below accepts known deltas with an
admin PAT or service token holding `tasks:run`; a device JWT is rejected with `403`.

### POST /api/v1/libraries/ingest

Push a known set of file changes without walking the library. Useful when your
storage layer can emit change events:

```bash
curl -X POST https://lumastra.example.com/api/v1/libraries/ingest \
  -H "Authorization: Bearer $ADMIN_PAT" \
  -H "Idempotency-Key: $EVENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "libraryPathId": "550e8400-e29b-41d4-a716-446655440000",
    "changes": [
      { "path": "movies/Nosferatu (1922)/Nosferatu.mkv", "op": "upsert" },
      { "path": "movies/OldMovie/old.mkv", "op": "remove" }
    ]
  }'
```

**Send an `Idempotency-Key` header** and reuse it after a timeout or retryable failure.
The key deduplicates run scheduling. Delta payloads are queued before scheduling, so a
retry can enqueue the changes again; do not treat the key as an exactly-once guarantee.

| Field | Type | Description |
|---|---|---|
| `libraryPathId` | `string` (UUID, optional) | Required when entries use `path`; omit when entries use `sourceUri`. |
| `changes` | `array` (1–5000) | The delta. Max 5 000 entries per request. |
| `changes[].path` | `string` | Path relative to the library root. Mutually exclusive with `sourceUri`. |
| `changes[].sourceUri` | `string` | Full object-store URI. Mutually exclusive with `path`. Requires `source_prefix` on the target path. |
| `changes[].op` | `"upsert" \| "remove"` | `upsert` = added/modified; `remove` = deleted. |

The response includes accepted counts:

```json
{
  "runId": "run_example",
  "deduped": false,
  "statusUrl": "/api/v1/runs/run_example",
  "accepted": { "upsert": 1, "remove": 1 }
}
```

Obtain the configured library-path UUID from the operator UI. Do not substitute a
media UUID. Ingest replies `202` when enqueued or `200` when deduplicated; accepted
counts may be absent on a deduplicated reply.

### Operational notes for automation

- **Ingest is async: poll `statusUrl`.** `GET /api/v1/runs/{runId}`
  returns the terminal state and per-file result. The run read requires `runs:read`; an admin token covers both gates. Fire-and-forget is fine when you don't need outcomes.
- **Check the result as well as the run state.** File ingest can report partial
  outcomes. Inspect the returned result and errors rather than assuming that a
  terminal run means every requested file succeeded.
- **Object-storage timing.** An `upsert` reads the file on the worker. If you
  fire the delta the instant you upload, the object may not be visible yet →
  soft error. Either tolerate it and let the periodic scan backstop catch it, or
  add a short delay. `remove` does not need to read the removed file.
- **Chunking.** Split deltas larger than 5 000 entries across multiple requests.
  Keep a rename's `upsert` and `remove` in **the same request** so they are
  processed in the same ingest batch; this is not a transactional filesystem rename.
- **Backpressure.** Under a burst the queue can fill → `503 dependency_unavailable`
  with `Retry-After`. Retry with the **same `Idempotency-Key`**.
- **One library per request.** All entries must resolve to one `libraryPathId`;
  mixed entries are rejected with `validation_failed` (current handler uses `422`).
- `/api/v1/*` is stateless at the web tier: no sticky sessions needed.

## Next

- [Building a player](/developers/building-a-player/)
- [Client diagnostics](/developers/client-diagnostics/)
- [Codec support](/reference/codec-support/)
