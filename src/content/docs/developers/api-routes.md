---
title: API routes reference
description: Every /api/v1 route group, the global SSE channel, server capabilities, language negotiation, and the library scan/ingest contract.
---

This is the endpoint-by-endpoint shape of the `/api/v1` surface. For auth,
tokens, scopes, and the device flow, see [API & tokens](/developers/api/); for
full per-endpoint parameters and schemas, use the interactive [API
reference](/reference/).

## Route groups

The following tables list the major route groups on `/api/v1`. The interactive
[API reference](/reference/) has the complete per-endpoint details.

### Catalog

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/media/{id}` | user | Polymorphic detail: movie, series, season, episode |
| `GET` | `/media/{id}?include=user` | user | Same + per-user watch state |
| `GET` | `/media/{id}/rating` | user | Current rating for the item |
| `PUT` | `/media/{id}/rating` | user | Rate an item (0–10; `0` removes the rating) |
| `GET` | `/media/{id}/images/{role}` | public | Fetch an image by role (see [Images](#images)) |
| `GET` | `/series/{id}` | user | Series detail with traversal links |
| `GET` | `/series/{id}/seasons` | user | List seasons |
| `GET` | `/series/{id}/seasons/{n}` | user | Season detail (`/seasons/{id}` takes a season handle) |
| `GET` | `/series/{id}/seasons/{n}/episodes/{e}` | user | One episode, or `404` |
| `GET` | `/series/{id}/watch-marker` | user | Resume target: episode, `positionMs` and state (`?from=` adds `relation`) |
| `GET` | `/series/{id}/episodes` | user | Every episode, paged (`limit`, `offset`; `season`, `episode`, `absolute` and `specials` filters) |
| `GET` | `/series/{id}/next-episode` | user | Next unwatched episode; `?afterPlayback=<episode UUID>` advances past that episode's whole default file (autoplay) |
| `GET` | `/series/{id}/watch-status` | user | Aggregate watch status |
| `GET` | `/people/{id}` | user | Person detail |
| `GET` | `/people/{id}/images/{role}` | user | Person image (TMDB size vocabulary, see [Images](#images)) |

Collection endpoints (`/movies`, `/series`, `/search`) return `{ items, page }` of
`MediaSummary`: a compact handle carrying `id`, `type`, `ids{}`, and `images{}`.

#### Images

```
GET /api/v1/{entity}/{id}/images/{role}
GET /api/v1/{entity}/{id}/images/{role}/{index}
```

`entity ∈ media | people | users | libraries`
`role ∈ poster | backdrop | logo | thumb | banner | still`
`index`: for entities with multiple backdrops or logos.
Item descriptors also use the `primary` role (square art: music, audiobooks, people, users,
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
uses TMDB's native size vocabulary (`w45`, `w185`, `h632`, `original`), and
`/libraries/{id}/images/{role}` takes only `?size=thumb|card|hd|full` (256, 512 and 1280
pixels wide, or the generated original).

### Discovery and recommendations

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/search` | user | Cross-type search (`?q=&type=movie\|series\|person`) |
| `GET` | `/trending` | user | Trending titles (`?window=day\|week\|month&type=movie\|series\|all`) |
| `GET` | `/recommendations` | user | Personalised recs multiplexer (`?type=for-you\|ai\|mood\|fulfilled-requests`) |
| `POST` | `/recommendations/dismiss` | user | Dismiss a recommended item |
| `GET` | `/continue-watching` | user | In-progress titles |
| `GET` | `/feed` | user | SDUI home feed (sections wrapping Tier-2 rec endpoints); section titles localized per `Accept-Language`, see [Language negotiation](#language-negotiation-accept-language) |
| `GET` | `/upcoming` | user | Upcoming releases (`?view=alerts\|episodes\|calendar`) |
| `GET` | `/keywords` | user | Keyword browse (`?mode=you-like\|explore\|curated`) |
| `GET` | `/browse` | user | Browse by genre (`?sort=az` for A-Z) |
| `GET` | `/watchlist` | user | Saved titles |
| `POST` | `/watchlist` | user | Add a title to the watchlist |

`/feed` is a thin composition over the same services as the Tier-2 endpoints.
Pin to the Tier-2 resource endpoints (`/trending`, `/recommendations`, etc.) for
stable automation; feed section structure may change between releases.
`section.id` is the stable part of the contract to filter/cache/branch on;
`section.title` is localized display text and may change wording between
releases.

### Playback

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/playback/{id}/info` | user | **Deprecated** for third parties: the first-party player's internal record (snake_case). Use `POST /play-sessions` |
| `GET` | `/playback/{id}/file` | user | Direct file download (`?grant=`) |
| `GET` | `/playback/{id}/hls` | user | HLS master playlist (`?grant=`) |
| `GET` | `/playback/{id}/hls/{…path}` | user | HLS segment (`?grant=`) |
| `GET` | `/playback/{id}/timeline` | user | Chapters, skip segments and trickplay variants for the selected file (ms) |
| `GET` | `/playback/{id}/probe-status` | user | Transcode probe status |
| `GET` | `/playback/{id}/trickplay/{width}` | user | Trickplay sprite |
| `GET` | `/playback/{id}/trickplay/{width}/manifest` | user | Trickplay manifest (JSON, sheet hrefs) |
| `GET` | `/playback/{id}/subtitles/{id}` | user | Subtitle file by track id |
| `GET` | `/playback/{id}/subtitles/{n}` | user | Subtitle file by index |
| `GET` | `/playback/grants/{id}` | user (owner) | Grant state by its opaque `id` |
| `POST` | `/playback/grants/{id}/renew` | user (owner) | Body `{ token }`; returns the grant with the extended expiry (never shorter) |
| `DELETE` | `/playback/grants/{id}` | user (owner) | Revoke a grant |
| `POST` | `/playback/telemetry` | user | Client telemetry / quality metrics |
| `POST` | `/playback/previews` | user | Ephemeral hover-preview transcode session |

### Sessions and watch state

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/play-sessions` | user / admin | Playing now (`?scope=mine\|all&itemId=`; `scope=all` requires admin) |
| `POST` | `/play-sessions` | user | Start playback for video, music and audiobooks (`media:write`): `201` with `{ playbackSessionId, mediaId, kind, delivery, grant, reporting }`; see [Play media from your own client](/developers/building-a-player/#play-media-from-your-own-client) |
| `PUT` | `/play-sessions/{id}` | user (owner) | Report progress (heartbeat). `status: COMPLETED` ends the session (`204`) |
| `POST` | `/play-sessions/{id}/beacon` | user (owner) | `sendBeacon` alias of PUT; rate-limited |
| `GET` | `/play-sessions/{id}/events` | user (owner) | SSE events for a session |
| `POST` | `/play-sessions/{id}/cancel` | owner or admin | Terminate a session and free its stream slot. Anyone else gets `404` |
| `POST` | `/play-sessions/replay` | user | Replay finished plays that had no live session (offline music) |
| `GET` | `/watch-state/{id}` | user | `{ watched, positionMs, resumeAnchor, favorite, rating }` |
| `PUT` | `/watch-state/{id}` | user | Set watched / favorite / rating (partial) |

`positionMs` uses milliseconds, and so does `/playback/{id}/timeline` (chapters, skip
segments, trickplay). Follow the schema for each time field.

### Library management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/library-paths` | `library:admin` | List configured library paths |
| `POST` | `/library-paths` | `library:admin` | Add a library path |
| `GET/PATCH/DELETE` | `/library-paths/{id}` | `library:admin` | Manage one path |
| `POST` | `/libraries/scan` | `tasks:run` | Trigger a full or path-scoped library scan |
| `POST` | `/libraries/ingest` | `tasks:run` | Push delta changes (add `Idempotency-Key`) |
| `GET` | `/library-groups` | `library:admin` | List library groups |
| `POST` | `/library-groups` | `library:admin` | Create a library group |
| `GET/PUT/DELETE` | `/library-groups/{id}` | `library:admin` | Manage one library group |
| `GET/POST/DELETE` | `/access/groups` | `access:admin` | Library-group permission assignments |
| `GET` | `/libraries/{id}/images/{role}` | user | Generated library mosaic image (see [Images](#images)) |

See [Library scan and delta ingest](#library-scan--delta-ingest) below for
detailed scan and ingest documentation.

### Tasks, runs, and queues

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tasks` | `tasks:read` | List scheduled task definitions |
| `GET` | `/tasks/{taskId}` | `tasks:read` | One task definition |
| `POST` | `/tasks/{taskId}/run` | `tasks:run` | Enqueue a run |
| `PUT` | `/tasks/{taskId}/state` | `tasks:admin` | Pause/resume schedule, manage circuit breaker |
| `GET` | `/tasks/{taskId}/backlog` | `tasks:read` | Backlog item listing |
| `GET/PUT` | `/tasks/{taskId}/settings` | `tasks:admin` | Per-task settings |
| `GET/PUT/DELETE` | `/tasks/{taskId}/triggers` | `tasks:admin` | Interval/daily/weekly/startup triggers (`PUT` body `{ triggers: [...] }`, 1–8, replaces all; `DELETE` resets to the task's default schedule) |
| `GET` | `/tasks/{taskId}/failures` | `tasks:read` | Per-item failure log |
| `POST` | `/tasks/{taskId}/failures/{itemId}/retry` | `tasks:run` | Retry one failed item |
| `GET` | `/runs` | `runs:read` | Run history (`{items,page}`) |
| `GET` | `/runs/{id}` | `runs:read` | One run + result |
| `GET` | `/runs/{id}/logs` | `runs:read` | Log lines for one run |
| `GET` | `/runs/stream` | `runs:read` | SSE live-run stream |
| `POST` | `/runs/{id}/cancel` | `tasks:run` | Cancel one run: graceful, `{ "force": true }` hard-kills. `404` unknown run, `409` already finished, `alreadyCancelling: true` when a graceful cancel was already in progress |
| `POST` | `/runs/cancel?byTask={id}` | `tasks:run` | Cancel all runs for a task: graceful unless `{ "force": true }`. Returns `cancelled`, `orphaned` (already finished or gone) and `escalated` (hard-kills scheduled) |
| `POST` | `/queues/{queue}/pause` | `tasks:admin` | Pause a queue class |
| `POST` | `/queues/{queue}/resume` | `tasks:admin` | Resume a queue class |
| `GET` | `/scheduler` | `tasks:read` | Scheduler state, per-class queue depths and pause flags |

Task control verbs follow a single grammar: `POST /{collection}/{id}/{verb}`,
where `verb ∈ run | cancel | retry | pause | resume | enable | disable`. Force /
hard stop is always a body flag (`{ "force": true }`), never a path segment.

**Scope note:** task/ops routes (`/tasks`, `/runs`, `/queues`) accept only
`pat_`/`svc_` or an admin session, **not** device-flow JWTs. See [Scope
tree](/developers/api/#scope-tree): the coarse `read` alias does **not**
expand to `tasks:read`.

### Providers and integrations

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/PUT` | `/providers` | `providers:admin` | Metadata provider configuration |
| `GET/POST` | `/radio/stations` | `providers:admin` | Radio station CRUD |

Integration endpoints live under `/integrations/homepage`, `/integrations/upcoming`,
`/integrations/watch-history` and `/integrations/keys/{id}`. See their individual
contracts in the [API reference](/reference/).

### Diagnostics

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/diagnostics/events` | user | Batch of client diagnostics: `crash \| hang \| js_error \| api_failures \| playback_incident` |
| `PATCH` | `/diagnostics/events/resolve` | user | Mark a playback attempt recovered |
| `POST` | `/diagnostics/bundles` | user | Upload a gzipped client log bundle |

See [Client diagnostics](/developers/client-diagnostics/) for what each kind
contains, redaction, retention, and how to review or disable it.

### Notifications and events

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/events` | user | Global per-user SSE channel |
| `GET` | `/notifications` | user | Durable notification inbox |
| `GET` | `/notifications/unread-count` | user | Fast unread badge count |
| `POST` | `/notifications/read-all` | user | Mark all as read |
| `POST` | `/notifications/{id}/read` | user | Mark one notification as read |
| `DELETE` | `/notifications/{id}` | user | Delete one notification |
| `GET` | `/user/series-follows` | user | Series you follow for new-episode notifications |
| `PUT` | `/user/series-follows/{seriesId}` | user | Follow a series (idempotent) |
| `DELETE` | `/user/series-follows/{seriesId}` | user | Unfollow a series (idempotent) |

`/user/series-follows` is a separate, explicit per-series subscription for
third-party clients. It's distinct from the end-user "New episode" toggle in the
web UI's notification settings, which controls the same event for the account
as a whole.

### Server discovery

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/server` | public / user | Discovery: name, release, sign-in methods. With a bearer token it adds `capabilities`, `build` and `caller` (`id`, `isAdmin`, `permissions`) |
| `GET` | `/server/notice` | user | The active maintenance notice, or `{ "notice": null }` |

### Watch-together

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/watch-together` | user | List sessions (`?scope=mine\|current`) |
| `POST` | `/watch-together` | user | Create a watch-together session |
| `DELETE` | `/watch-together/{code}` | user (host) | Disband a session |
| `POST` | `/watch-together/{code}/events` | user | Send an event (join, seek, reaction, etc.) |
| `GET` | `/watch-together/{code}/events` | user | SSE downstream (renamed from `/stream`) |

Events use a discriminated `{ clientId, type, payload }` envelope on both the
`POST` upstream and the SSE downstream. A future WebSocket transport would
reuse the same message schema. The closed `type` enum falls into three groups:

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

- `device_id`: yours, stable per physical device, sent in the device-code
  request and in the `POST /play-sessions` body.
- `device_session_id`: the server's, minted per authorization, embedded in
  the JWT, and the addressing unit for heartbeat and commands.

`/heartbeat` enforces `{id} === deviceSessionId` and returns `403` otherwise. Because
the session id is per-token, two accounts signed in on one physical device get
separate presence and separate command inboxes automatically.
:::

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/devices` | user | List user devices (`?scope=mine`) |
| `POST` | `/devices/{id}/heartbeat` | user | Device presence keepalive |
| `POST` | `/devices/{id}/commands` | user | Send a command to a device |
| `GET` | `/devices/{id}/commands/{commandId}` | user | Read a command and its status |
| `DELETE` | `/devices/{id}/commands/{commandId}` | user | Cancel a command that is not applied yet |
| `GET` | `/devices/{id}/state` | user | What the device plays now and what it can do |
| `GET`/`POST`/`DELETE` | `/devices/grants[/{username}]` | user | Household helpers who may control your devices |
| `GET` | `/devices/controllable` | user | Devices others allowed you to control |

The commands and their arguments are described in
[Device remote control](/developers/watch-together/#device-remote-control).

### Users and profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/user/profile` | user | Own profile: `{id, username, isAdmin, isAgeRestricted, permissions, groups}` |
| `GET/PUT` | `/user/playback-preferences` | user | Client playback settings; `metadataLanguage`/`metadataTitleLanguage` override `Accept-Language`, see [Language negotiation](#language-negotiation-accept-language) |
| `GET/POST` | `/user/pats` | user | Own PATs; `DELETE /user/pats/{id}` revokes (`204`) |
| `GET` | `/user/links` | user | Linked third-party accounts |
| `GET/DELETE` | `/user/links/{provider}` | user | One linked account: status, and unlink |
| `POST` | `/user/links/{provider}/authorize` | user | Initiate OAuth account linking (returns an `authUrl`) |
| `GET` | `/users/{id}` | `users:read` | Read another user's profile |
| `GET` | `/users/{id}/images/avatar` | public | User avatar (shown in social contexts without a session); sizes `thumb`, `card`, `full` = 48, 96, 200 px |
| `PUT/DELETE` | `/users/{id}/images/avatar` | user (self or admin) | Upload / remove an avatar (multipart) |

### Permissions

`GET /server` (`caller.permissions`) and `GET /user/profile` (`permissions`) return the same
object:

| Field | Meaning |
|---|---|
| `canRequest` | Submit media requests |
| `canReview` | Write community reviews |
| `canAnnotateMedia` | Player annotations |
| `canWatchLiveTv` | Live TV. Without it every Live TV endpoint answers `403 forbidden` |
| `canSeeAllPlayback` | The web app's Active streams view shows everyone's playback. `GET /play-sessions?scope=all` still requires an administrator |

Media playback needs no permission flag, only library access.

### Social: playlists and lists

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/playlists` | user | Collection: list or create |
| `GET/PATCH/DELETE` | `/playlists/{id}` | user | One playlist |
| `GET/POST` | `/playlists/{id}/items` | user | Items in a playlist |
| `GET/PUT/DELETE` | `/playlists/{id}/items/{id}` | user | One item |
| `GET/POST` | `/playlists/{id}/members` | user | Collaboration members |
| `PUT/DELETE` | `/playlists/{id}/members/{id}` | user | Manage one member (by user id) |
| `GET/POST` | `/lists` | user | Curated lists |
| `GET/PATCH` | `/lists/{id}` | user | One curated list |

User identity in these paths is always the stable user `id` (UUID), never
`username`, which is display-only. This applies to playlist member paths,
watchlist ownership, and every other user-scoped path in this API.

### Requests (media requests via Seerr)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/requests` | user | Own requests (`?scope=mine\|all&status=`) |
| `POST` | `/requests` | user | Submit a request |
| `GET` | `/requests/{id}` | user | One request |
| `GET` | `/requests/quota` | user | Per-user quota |
| `POST` | `/requests/{id}/dismissal` | user | Dismiss a request notification (`204`) |
| `POST` | `/requests/dismissals` | user | Dismiss a title that has no request: `{ externalIds, mediaType }` |

Quota is per-user, per-rolling-period, with separate `movie` and `series` buckets.
Exceeding quota → `422 quota_exceeded` with the bucket in `details`.

### Stats

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/stats/me` | user | Own watch stats (`?period=7d\|30d\|90d\|year:YYYY\|all`) |
| `GET` | `/stats/users/{id}` | user (self or admin) | Another user's stats (requires `FEATURE_SOCIAL`) |

### Live TV

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/livetv/stations` | user | Stable stations with number, images, shown `feedId` and `nowNext` |
| `GET` | `/livetv/stations/{stationId}` | user | One station with `nowNext` (current and next airing) |
| `GET` | `/livetv/stations/{stationId}/feeds` | user | Feed choices; pass a feed's `id` as `feedId` when starting playback |
| `GET` | `/livetv/stations/{stationId}/programs` | user | Airings for a window (required UTC `from` / `to`, at most 24 hours) and `nowNext` |
| `GET` | `/livetv/stations/{stationId}/current-program` | user | `nowNext` and `asOf` |
| `GET` | `/livetv/guide` | user | Required `from` / `to` (at most 24 hours); `stationIds` (max 200) or `limit` + `cursor` paging; `stations[{stationId, airings, nowNext}]` |
| `GET` | `/livetv/programs/search` | user | Program search; `channels[].id` identifies a station |
| `GET` | `/livetv/availability` | user | Feed-keyed availability; join using the station's `feedId` |
| `GET/PUT` | `/livetv/favorites` | user | Favorites use `stationIds`; PUT `{ stationId, favorite }` |
| `PUT` | `/livetv/favorites/order` | user | Reorder favorites with `{ stationIds }` |
| `GET/PATCH` | `/livetv/simple-mode` | user | Viewer settings use `stationIds`, `startStationId`, `clearStartStation` |
| `POST` | `/livetv/playback-sessions` | user | Start: `{ stationId, feedId?, quality?, maxBitrate?, hevc? }` → `201` with the shared envelope (`playbackSessionId`, `delivery.url`, `delivery.heartbeatIntervalMs`, `delivery.keepaliveHref`, `grant`) |
| `GET` | `/livetv/playback-sessions/{playbackSessionId}` | user (owner) | `state` (`active` / `ended`), `endReason`, and `failure` (`code`, `retryable`, `retryAfterMs`, `at`) when the channel failed |
| `POST` | `/livetv/playback-sessions/{playbackSessionId}/keepalive` | user (owner) | Every `delivery.heartbeatIntervalMs` (`delivery.keepaliveHref`); `204` or `410` with `reason: evicted\|superseded\|expired\|left\|failed` |
| `DELETE` | `/livetv/playback-sessions/{playbackSessionId}` | user (owner) | Stop the session (`204`, idempotent). `POST .../leave` is the same for `sendBeacon` |
| `POST` | `/livetv/playback-sessions/{playbackSessionId}/leave` | user (owner) | Same cleanup for `sendBeacon` |
| `GET` | `/livetv/channels/{feedId}/stream/**` | user | Unchanged HLS manifests and segments; use the returned `delivery.url` |

Station and playback-session routes replace the old channel viewer routes
without aliases. For the complete lifecycle, feed selection, quality options
and eviction handling, see [Live TV playback](/developers/live-tv-playback/).

### Music

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/music/tracks`, `/music/albums`, `/music/artists`, `/music/genres` | user | List endpoints |
| `GET` | `/music/tracks/{id}` | user | Track detail |
| `GET` | `/music/tracks/{id}/lyrics` | user | Lyrics, when available |
| `GET` | `/music/tracks/{id}/similar` | user | Similar tracks; `?basis=auto|metadata|sonic`, `{ items, source, page }` |
| `GET` | `/music/tracks/{id}/stream` | user | Audio playback (see [Music streaming and transcoding](#music-streaming-and-transcoding)) |
| `PUT`, `DELETE` | `/user/music/tracks/{id}/feedback` | user | Explicit like or dislike (`{ "feedback": "liked" }` or `"disliked"`). Skips and completions never change it |
| `POST` | `/music/recommendations` | user | What to play next: `{ seed?, context: { currentTrackId?, history?, skipped?, exclude?, upcoming?, crossfade?, startedBy? } }` → `{ next?, alternatives, source }`; a mood seed alone is a cold start |
| `GET` | `/music/albums/{id}/similar`, `/music/artists/{id}/similar` | user | Sonic similarity, requires `sonicEmbeddings` (`/server` → `capabilities.music.sonicSimilarity`) |
| `GET` | `/music/path` | user | Sonic bridge between two tracks, requires `sonicEmbeddings`; rate-limited |
| `GET` | `/music/clusters`, `/music/clusters/{id}/tracks` | user | Sonic mixes, requires `musicClusters` (`capabilities.music.sonicMixes`) |
| `GET` | `/user/music/taste-stations`, `/user/music/taste-stations/{id}/tracks` | user | Taste stations; the `id` may be stored, `410` once its clustering expired |
| `GET` | `/music/mood-recommendations` | user | Requires the `sonicQueue` feature; rate-limited |
| `GET/POST` | `/user/music/pinned-genres` | user | Pinned genres |
| `DELETE` | `/user/music/pinned-genres/{genre}` | user | Unpin (percent-encode any `/` in the genre name) |
| `GET` | `/user/music/recently-played`, `/user/music/top-tracks`, `/user/music/top-artists` | user | Listener rows for a music home; `{ items, page: { limit, truncated } }` |
| `GET` | `/music/radio/stations` | user | Internet-radio station list |
| `GET` | `/music/radio/stations/{id}/stream` | user | Radio stream |
| `GET` | `/music/radio/stations/{id}/now-playing` | user | Current track on a station |

#### Music streaming and transcoding

`GET /music/tracks/{id}/stream` direct-plays by default. Transcoding kicks in
when any of these is true, checked in this order, first match wins:

1. `?format=` is set and differs from the source container
2. `?maxBitRate=` (kbps) is set and the source bitrate exceeds it
3. `?timeOffset=` (seconds) is greater than `0`

`?format=raw` always short-circuits to direct play regardless of the other
params. `format` accepts `mp3 | opus | aac | raw`; see [Codec
support](/reference/codec-support/) for the full codec/bitrate/container matrix
and defaults. Under sustained load the server enforces a cluster-wide
concurrent-transcode cap. Once it's hit, the endpoint returns `503` with a
`Retry-After` header rather than queuing indefinitely.

### Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/webhooks` | `webhooks:write` | List webhooks |
| `POST` | `/webhooks` | `webhooks:write` | Create webhook |
| `GET/PUT/DELETE` | `/webhooks/{id}` | `webhooks:write` | Manage one webhook |
| `POST` | `/webhooks/{id}/test` | `webhooks:write` | Send a test payload |

### Miscellaneous

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/config` | user | Per-user config (features, permission bits) |
| `POST` | `/auth/logout` | device JWT | Revoke the current device session and refresh token |
| `GET/POST` | `/plugins/external` | `tasks:admin` | Installable third-party plugin management |
| `POST` | `/plugins/external/{id}/enable` | `tasks:admin` | Enable an installed plugin |
| `POST` | `/plugins/external/{id}/disable` | `tasks:admin` | Disable an installed plugin |
| `POST` | `/plugins/external/{id}/reload` | `tasks:admin` | Reload an installed plugin |
| `POST` | `/plugins/external/{id}/uninstall` | `tasks:admin` | Remove an installed plugin |
| `GET` | `/service-tokens` | `tokens:admin` | List service tokens |
| `POST` | `/service-tokens` | `tokens:admin` | Create service token |
| `GET/DELETE` | `/service-tokens/{id}` | `tokens:admin` | Manage one service token |
| `GET` | `/_diag/forward-auth-headers` | admin | Forward-auth header diagnostics |

### Health and metrics (unversioned)

These sit outside the `/api/v1` resource tree and carry no version prefix.
They're an operational ABI (load balancers, Kubernetes, Prometheus pin literal
paths) and are exempt from the `problem+json` and version-prefix conventions
used elsewhere.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | public | Liveness: always `200`, no dependency checks |
| `GET` | `/api/health/ready` | public / admin | Readiness: `200`/`503`; per-component verdict for an admin caller |
| `GET` | `/metrics` | public (opt-in) or `metrics:read` | Prometheus text exposition; also gated by `LUMASTRA_METRICS_BEARER_TOKEN` |

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

Notification frames carry an `id:` field for `Last-Event-ID` replay. On
reconnect, pass the last received notification ID to replay missed notifications
from the Valkey buffer. Live signals such as `admin` carry no replay ID.

**SSE frame names** are advertised at `GET /server` in `capabilities.events.kinds[].name`:

| Event type | Trigger |
|---|---|
| `connected` | Bootstrap frame with server time |
| `admin` | Operator message or maintenance state; discriminate on `data.type` |
| `device.command` | A command for this device (sent to the target device only) |
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

The scoped SSE channels (`watch-together/{code}/events`, `runs/stream`,
`play-sessions/{id}/events`) remain separate; they have a resource lifecycle the
global channel does not.

## `/server`: discovery and capabilities

`GET /api/v1/server` (also `HEAD`) is the one discovery call, with `Cache-Control: private,
no-cache` and an `ETag`. Without a credential it answers the anonymous tier: `id`, `name`,
`release`, `apiVersions`, `branding`, `auth` (`deviceFlow`, `passwordLogin`) and `links`. With a
valid bearer token it adds `build`, `caller` and `capabilities`. There is no separate
`/server/capabilities` route.

```jsonc
{
  "id": "…", "name": "Home", "release": "0.1.0", "apiVersions": ["v1"],
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
                  "mediaDownload": false, "downloadRenditions": false, "…": true },
    "events": { "href": "/api/v1/events", "reconnectMaxMs": 30000,
                "kinds": [ { "name": "connected", "class": "bootstrap", "durable": false, "available": true } ] },
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
   `PUT /user/playback-preferences`
2. The language-switcher cookie set by the web UI
3. The `Accept-Language` request header
4. The server's primary language

A stored preference or cookie that is **present but unsatisfiable** (names a
language the server doesn't have enabled) ends the chain at the primary
language. It does **not** fall through to the next signal. For example, the
cookie is set to `de`, only `fr` is enabled server-side, and the request's
`Accept-Language` says `fr`. The response is still the primary language, not
French, because the cookie already supplied (and exhausted) a signal.

**UI chrome** (`/feed` section titles) resolves independently, per request,
from `Accept-Language` against `en`/`de` only. It is never affected by the
metadata chain above, nor by a stored `metadataLanguage` preference.

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
from the device, store it once with `PUT /api/v1/user/playback-preferences` (`metadataLanguage`
for overviews and taglines, `metadataTitleLanguage` for titles); the stored preference then wins
over the header on every client. Operations whose responses carry translated titles or overviews
list the `Accept-Language` header parameter in the [API reference](/reference/).

## Library scan & delta ingest

Trigger a full library scan:

```bash
curl -X POST https://host/api/v1/libraries/scan \
  -H "Authorization: Bearer $ADMIN_PAT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

This requires a **`tasks:run` scope** (admin PAT or service token). Regular user
tokens are rejected. Omitting `libraryPathId` scans all enabled paths.

The response body is the same for `200` (deduplicated) and `202` (enqueued):

```json
{
  "runId": "019x…",
  "deduped": false,
  "statusUrl": "/api/v1/runs/019x…"
}
```

### POST /api/v1/libraries/scan

| Field | Type | Description |
|---|---|---|
| `libraryPathId` | `string` (UUID, optional) | Scope the scan to one library path. Omit to scan all enabled paths. |

### POST /api/v1/libraries/ingest

Push a known set of file changes without walking the library. Useful when your
storage layer can emit change events:

```bash
curl -X POST https://host/api/v1/libraries/ingest \
  -H "Authorization: Bearer $ADMIN_PAT" \
  -H "Idempotency-Key: $EVENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "libraryPathId": "<library-path-uuid>",
    "changes": [
      { "path": "movies/Casablanca (1942)/Casablanca.mkv", "op": "upsert" },
      { "path": "movies/OldMovie/old.mkv", "op": "remove" }
    ]
  }'
```

**Always send an `Idempotency-Key` header** so retries after a 5xx or timeout
are safe. The server deduplicates on this key.

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
  "runId": "019x…",
  "deduped": false,
  "statusUrl": "/api/v1/runs/019x…",
  "accepted": { "upsert": 1, "remove": 1 }
}
```

`GET /api/v1/library-paths` lists the configured library paths and their UUIDs.

### Operational notes for automation

- **Both endpoints are async, poll `statusUrl`.** `GET /api/v1/runs/{runId}`
  returns the terminal state and per-file result. Your `tasks:run` token can
  read any run it created. Fire-and-forget is fine when you don't need outcomes.
- **Per-file outcomes, not all-or-nothing.** A run finishes `completed` even if
  some files soft-errored. Check the rollup (`succeeded` / `filtered` /
  `softErrors`), not just the status. The run only `fail`s if every file
  errored.
- **Object-storage timing.** An `upsert` reads the file on the worker. If you
  fire the delta the instant you upload, the object may not be visible yet →
  soft error. Either tolerate it and let the periodic scan backstop catch it, or
  add a short delay. `remove` is database-only and is reliable regardless.
- **Chunking.** Split deltas larger than 5 000 entries across multiple requests.
  Keep a rename's `upsert` and `remove` in **the same request** so they are
  handled atomically.
- **Backpressure.** Under a burst the queue can fill → `503 dependency_unavailable`
  with `Retry-After`. Retry with the **same `Idempotency-Key`**.
- **One library per request.** All entries must resolve to one `libraryPathId`;
  mixed entries → `400 validation_failed`.
- `/api/v1/*` is stateless at the web tier: no sticky sessions needed.

## Next

- [Building a player](/developers/building-a-player/)
- [Client diagnostics](/developers/client-diagnostics/)
- [Codec support](/reference/codec-support/)
