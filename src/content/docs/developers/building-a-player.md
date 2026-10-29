---
title: Building a player
description: >
  Start here for a native client or player against Lumastra's /api/v1 surface:
  device-flow auth, error model, server capabilities, catalog browsing, item
  detail, and how to start playback. Streaming, progress reporting, and events
  continue on the linked pages.
---

Build a native client or player (Apple TV, Android TV, Roku, a custom app)
against Lumastra's versioned **`/api/v1`** token surface. It's the same surface
Lumastra's own native apps use.

:::note[Which surface should I build against?]
- **Native client → `/api/v1`** (this guide). Full access to the playback
  planner, HLS, multi-audio tracks, watch state, and push notifications.
- **Reusing an existing Jellyfin/Subsonic app:** use the `/j` or `/subsonic`
  compat layers instead. See [Connecting third-party apps](/using/third-party-players/).
  Those speak their own protocols and aren't part of `/api/v1`.
:::

For exact request/response shapes, use your instance's `/api-docs?format=yaml`, which
matches its installed release. The hosted [**API reference**](/reference/) is a vendored
snapshot and can lag newly shipped fields. Target endpoints marked `x-stability: stable`.
The field lists below explain the contracts a player needs.

## The model in one paragraph

**The server owns the playback decision.** Your client never builds an HLS or file
URL itself. It starts playback with `POST /api/v1/play-sessions`, and sends its
device capabilities in `capabilities` when the defaults do not fit. The response
carries **ready URLs** in `delivery`, each with a scoped `?grant=` already attached.
You open `delivery.url` and report progress. The same start call works for video,
music and audiobooks; Live TV has its own start with the same response shape. IDs are
**opaque handles**: pass `id` back as it is. `catalogId` is the library row UUID, or
`null` when the title is not in your library.

## Authenticate

Get a bearer token via the **OAuth 2.0 Device Authorization flow** (RFC 8628),
the keyboard-free TV flow. The full handshake is documented in
[API & tokens](/developers/api/). In short:

1. `POST /oauth/device` → `device_code` + `user_code` + `verification_uri`.
2. User approves at `/device` (signed in via any supported browser auth method).
3. Poll `POST /oauth/token` → `access_token` (JWT, ~1 h) + `refresh_token`
   (rotated on every use, 90-day default).
4. Send `Authorization: Bearer <token>` on every `/api/v1/*` request.

For headless or server integrations, use a **personal access token (PAT)**
(`pat_…`) instead. Create it in the Lumastra UI or with an interactive browser session
at `POST /api/v1/me/pats`. Choose the `write` scope alias for playback. A read-only
PAT or `media:read` device token can probe but cannot start or report playback.

Requires `FEATURE_DEVICE_AUTH` (on by default) and `JWT_SECRET` on the server; your reverse
proxy must let `/oauth/*` and `/api/v1/*` bypass forward-auth middleware.

```bash
# Step 1 — request a device code
curl -X POST https://lumastra.example.com/oauth/device \
  -H "Content-Type: application/json" \
  -d '{"client_id":"my-tv-app","device_name":"Living Room TV","scope":"media"}'
# → { "device_code": "…", "user_code": "WDJB-MJHT",
#     "verification_uri": "https://lumastra.example.com/device",
#     "expires_in": 600, "interval": 5 }

# Step 3 — poll (every 5 s, or as given by interval)
curl -X POST https://lumastra.example.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:device_code",
       "device_code":"…","client_id":"my-tv-app"}'
# → 400 { "error": "authorization_pending" }  (keep polling)
# → 200 { "access_token": "eyJ…", "refresh_token": "…", "expires_in": 3600 }
```

:::caution[Refresh token rotation]
Persist the `refresh_token` returned by every successful refresh. Share one in-flight
refresh among concurrent API requests. Current servers allow recovery from a lost
refresh response: the predecessor remains usable until its successor is used, and a
short replay window can return the same replacement. Do not rely on that recovery as
normal token storage. A terminal `invalid_grant` on refresh requires reauthorization.
:::

### Conventions that apply everywhere

| Convention | Rule |
|---|---|
| IDs | `id` is an opaque handle: pass it back as `{id}` and never parse it. `catalogId` is the library row UUID, or `null` for titles outside your library. Catalog detail can resolve external handles such as `tmdb:653:movie`. Playback start requires a library UUID in `mediaId`; playability requires that UUID in its path. Do not assume every route resolves external handles. |
| Media type | Canonical discriminator is `type`, a closed enum: `movie \| series \| season \| episode \| track \| album \| artist \| audiobook`. Ignore or filter types your client does not render. Legacy `tv`/`show` are retired. |
| Pagination | Collections return `{ items, page }`, `page = { limit, offset, hasMore, total? }`. `total` is returned only with `?includeTotal=true`. Limit-only lists return `truncated` instead of `hasMore`. Cursor-based endpoints return `page.nextCursor`; send it back as the `cursor` query parameter. |
| Images | Read `images.<role>.href` from the item, or pick a size from `variants` (`thumb`, `card`, `hd`, `wide`, `full`). Never build an image URL. |
| Errors | Resource errors, including HLS startup failures, use `application/problem+json`. Switch on `code`, then any documented `reason`. |
| Header-less players | Use the `delivery` URLs from `POST /play-sessions`: each carries a `?grant=` for that one item and session. The server does not accept `api_key` or `stream_token` query parameters. |
| Time units | Fields ending in `Ms` use milliseconds. Some specialized routes use explicitly named seconds fields; Watch Together positions use seconds. |

## Errors

Resource errors from `/api/v1/*` are `application/problem+json`, including bearer, grant
and HLS startup failures:

```jsonc
// 422 response body
{
  "code": "validation_failed",
  "error": "Request body failed validation",
  "status": 422,
  "details": [{ "field": "eventSeq", "message": "must be a positive integer" }],
  "requestId": "req_abc123",   // optional
  "retryAfter": 30             // optional, seconds — also in the Retry-After header
}
```

The `code`s a player branches on:

- `unauthorized` or `invalid_token` (401): sign in again.
- `invalid_grant` (401): the playback grant cannot be used. `reason` says why.
  `session_ended` means the session finished; start a new session. An expired or
  revoked grant also needs a fresh start; renewal must happen before expiry.
- `gone` (410) with `reason: session_restarted`: the old media binding did not survive
  a server restart. Start a fresh session at the current position; do not retry its URL.
- `forbidden` (403): a grant used on a URL that is not one of its media URLs answers
  `reason: wrong_scope`.
- `ip_mismatch` (403): the grant is pinned to another network address. Start the
  session with `castTarget: true` for a receiver on another network.
- `not_found` (404): also what a disabled feature returns, not `403`.
- `validation_failed` (422): correct the request fields before retrying.
- `stream_limit`, `transcode_not_allowed`, `source_incompatible`, `ip_restricted` or
  `plugin_denied` (422) on a start: show the structured playback refusal. Its `details`
  is an object; validation errors instead carry a list of field issues.
- `rate_limited` (429) or `dependency_unavailable` (503): back off and honor
  `Retry-After` when present. A probe does not reserve a stream slot.

See [API & tokens → Errors](/developers/api/#errors-applicationproblemjson) for the full
closed taxonomy.

:::note[`/oauth/*` errors use a different shape]
`/oauth/device` and `/oauth/token` return RFC 8628 `{ error, error_description }`
with `Cache-Control: no-store`, **not** problem+json. See
[API & tokens](/developers/api/) for the full table.
:::

## Discover server capabilities

Call `GET /api/v1/server` once on startup, then again after sign-in. Without a credential it
returns the server name, release, sign-in methods (`auth.deviceFlow`, `auth.passwordLogin`)
and `links`. With `Authorization: Bearer …` it adds `build`, `caller.permissions` and
`capabilities`. The response is `Cache-Control: private, no-cache` with an `ETag`.

```bash
curl https://lumastra.example.com/api/v1/server \
  -H "Authorization: Bearer pat_your_token_here"
```

```jsonc
{
  "caller": { "id": "…", "isAdmin": false,
              "permissions": { "canRequest": true, "canReview": true, "canAnnotateMedia": true,
                               "canWatchLiveTv": true, "canSeeAllPlayback": false } },
  "capabilities": {
    "playback": { "direct": true, "remux": true, "transcode": true },
    "liveTv": { "available": true },
    "audiobooks": { "available": false },
    "music": { "available": true, "clustering": false, "sonicSimilarity": false, "sonicMixes": false },
    "features": { "watchTogether": true, "videoPreviews": true, "topShelfPreviews": false,
                  "mediaDownload": false, "downloadRenditions": false },
    "events": { "href": "/api/v1/events", "reconnectMaxMs": 30000 }
  }
}
```

Show a feature only when both `capabilities` and `caller.permissions` allow it. Use
`capabilities.features.*` to conditionally enable UI elements. `mediaDownload` and
`downloadRenditions` gate the two offline paths (both default off); see
[Offline downloads](/developers/offline-downloads/) for the capability-gating rule.
`GET /api/v1/server/notice` returns the active maintenance notice, or `{ "notice": null }`.

## Browse & discover

There's no single "home" payload. Assemble your home screen from section
endpoints instead. Each returns a `{ items, page }` envelope of catalog items.

| Endpoint | Rail |
|---|---|
| `GET /api/v1/continue-watching` | In-progress titles |
| `GET /api/v1/trending?window=week` | Trending (`?window=day\|week\|month&type=movie\|series\|all`) |
| `GET /api/v1/recommendations?type=for-you` | For You: personalized recommendations |
| `GET /api/v1/media/{id}/similar` | "Because you watched…" |
| `GET /api/v1/browse?sort=az&type=movie&limit=50&offset=0` | Paginated A-Z browse |
| `GET /api/v1/search?q=…&type=movie,series&limit=20` | Cross-type search |

Fields a player cares about on a catalog row item: `id` (opaque handle), `catalogId`,
`ids` (raw provider values, e.g. `imdb`/`tmdb`), `type`, `title`, `images`, `year`. Add
`?include=user` to any detail call to attach per-user watch state and rating.

:::caution[Play only titles in your library]
A title with `catalogId: null` is not in the library (discovery or requestable). Show a
**Request** affordance instead of a **Play** button. Episode rows carry
`availability.hasFile`; check it before you show Play on an episode.
:::

Series traversal:

```
GET /api/v1/series/{id}/seasons                    → { ordering, items, page } of seasons
GET /api/v1/series/{id}/episodes?limit=&offset=    → episodes, season then episode order
GET /api/v1/series/{id}/seasons/{n}/episodes/{e}   → one episode, or 404
GET /api/v1/series/{id}/next-episode               → next unwatched episode
GET /api/v1/series/{id}/watch-status               → aggregate watched/total
```

## Item detail

`GET /api/v1/media/{id}` is the canonical detail node for any item,
type-discriminated by the `type` field. It accepts the `id` handle or an external handle
(`tmdb:653:movie`); add `?include=user,playback` for per-user watch state and a playback
hint. Durations are in `durationMs`.

```jsonc
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "catalogId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "movie",
  "ids": { "tmdb": "653" },
  "title": "Nosferatu",
  "year": 1922,
  "durationMs": 5640000,
  "images": { "poster": { "href": "/api/v1/media/550e8400-…/images/poster" } }
}
```

A series node additionally embeds traversal links (`seasons`, `episodes`, `nextEpisode`,
`watchStatus`), each with an `href`.

## Probe before you start

`POST /api/v1/media/{id}/playability` answers "what would a start decide?" without
starting anything: no session, no grant, no transcode, no watch history. Send the same
optional `capabilities` as a start, and an optional `fileId` or `versionId` to probe one
version. Each
entry in `versions[]` carries `playable` and `blockedBy`, the `playMethod` a start would
choose for your capabilities, the tracks, and `sizeBytes` (on-disk size; absent means
unknown, not zero) — enough for a version picker, a track picker, a "this will
transcode" hint, or sizing a download (see [Offline
downloads](/developers/offline-downloads/)). The response also gives the resume
position and `recommended` tracks. It needs `media:read` and applies the same library
and age checks as a start. It is for movies, episodes and videos; music, audiobooks,
Live TV and series answer `422`.

Then start with the pick: `POST /api/v1/play-sessions` with `fileId`, `audioStreamIndex`
(an audio track's `absoluteIndex`) and `subtitleId` (the selected subtitle's stable
`id`, or `"none"` to disable subtitles). The start response carries the tracks, the
subtitles and the resume point.

`GET` and `POST /api/v1/playback/{itemId}/info` have been removed. Older clients
receive `410 route_retired`; use this playability probe and `POST
/api/v1/play-sessions` instead.

### Removed: multipart video versions

Lumastra no longer composes several files into one logical episode. Versions in
`versions[]` are always complete physical releases with a `fileId`. The
`capabilities.multipartVideo` field on probe and start and `versionId` on start are
deprecated: the server still accepts them so shipped clients keep working, but ignores
them. Do not send them from new clients, and do not rely on `versionId` or
`versionKind: "multipart_video"` appearing in a response.

## Play media from your own client

Every recipe below needs only the server address and a bearer token with the
`media:write` scope. `POST /api/v1/play-sessions` starts playback for video, music and
audiobooks. For example, an abridged video start returns:

```jsonc
{
  "playbackSessionId": "uuid",
  "mediaId": "uuid",
  "kind": "video",
  "delivery": { "kind": "hls", "url": "/api/v1/…?grant=…", "startPositionMs": 0 },
  "grant": { "id": "uuid", "token": "…", "param": "grant", "mediaId": "uuid",
             "playbackSessionId": "uuid", "kind": "video", "ipPinned": true,
             "expiresAt": "…", "renewAfter": "…", "renewHref": "/api/v1/playback/grants/{id}/renew" },
  "reporting": { "kind": "progress", "method": "PUT", "playbackSessionId": "uuid", "href": "/api/v1/play-sessions/{id}", "intervalMs": 10000, "unit": "ms" }
}
```

- Every URL in `delivery` (manifest, files, subtitles, timeline, previews) is ready to
  use and already carries `?grant=`. Never append your account token or build media
  URLs yourself. The server never puts your account credential into a URL.
- A **grant** belongs to one item and one playback session, and works only on media URLs.
  The first grant lasts 24 hours for video and audiobooks, and 6 hours for music and Live
  TV. Renewing is optional: `POST grant.renewHref` with your bearer token and
  `{ "token": grant.token }` returns the grant with the extended expiry. Renewal never
  shortens expiry. Live TV grants can be renewed only while their session is active.
- A grant ends with its playback session. Ending the session (a `COMPLETED` report, or a
  cancel), a newer start on the same device, or reaping makes every URL on that grant
  answer `401 invalid_grant` with `reason: session_ended`. Start a new session to play
  again.
- Use `reporting.kind` and `reporting.method` to choose the reporting protocol.
  `progress` uses `PUT` with a body; `keepalive` uses a bodyless `POST`.
- Positions and durations in this envelope are milliseconds. For `multipart-audio`,
  read the URLs from `delivery.tracks[]`; there is no top-level `delivery.url`.

### Ending a playback session

End a video or audiobook session with `PUT /api/v1/play-sessions/{id}` and
`status: "COMPLETED"` (a normal end, `204`). To terminate a session at once and free its
stream slot, call `DELETE /api/v1/play-sessions/{id}`. Live TV sessions are different: stop them with
`DELETE /api/v1/livetv/playback-sessions/{playbackSessionId}`, or `POST …/leave` from
`sendBeacon`.

### Capabilities

`capabilities` is optional, and every field inside it is optional too. An omitted list
takes its default:

| Field | Default |
|---|---|
| `containers` | `mp4`, `ts`, `mp3`, `m4a` |
| `videoCodecs` | `h264` |
| `audioCodecs` | `aac`, `mp3` |
| `subtitleFormats` | `vtt` |
| `hdr` | none (SDR) |

Send a field when your player differs from the default:

```json
{ "containers": ["mp4", "ts", "mkv"], "videoCodecs": ["h264", "hevc"],
  "audioCodecs": ["aac", "ac3", "eac3"], "subtitleFormats": ["vtt", "pgs"],
  "hdr": ["hdr10", "dovi"], "maxAudioChannels": 6 }
```

Codec lists use open lower-case tokens; unknown tokens in those lists are ignored.
Unknown capability **fields** are rejected. Declaring a subtitle format does not select
a subtitle. Unsupported selected embedded subtitles may require burn-in; unsupported
sidecars can instead be unavailable. `hlsCopyReload` defaults to false; `multipartVideo` is deprecated and ignored. `maxVideoBitrateBps` (bits per second), `maxHeight` (pixels) and
`maxAudioChannels` are optional.

### Play a movie

1. `POST /api/v1/play-sessions` with `{ "mediaId": "<movie id>", "deviceId": "<stable id>", "entry": "explicit", "capabilities": { … } }`.
2. Give `delivery.url` to your player (`delivery.kind` is `hls` or `file`). Subtitles are
   in `delivery.subtitles[]`, an available timeline is at `delivery.timeline.href`, and
   `delivery.recommended` names the suggested audio and subtitle tracks.
3. Every `reporting.intervalMs`, `PUT` the position to `reporting.href`. Finish with
   `status: "COMPLETED"`. A player that can't report skips this step.

### Resume an episode

The same call. `delivery.startPositionMs` is the effective resume/entry position; send
`startPositionMs` in the request to override it. Seek to it before showing the first
frame when `delivery.seek.clientShouldSeek` is true. For a combined file representing
several episodes, positions remain on the **whole file clock**;
`delivery.seek.streamStartPositionMs` is the episode entry point. It is not a new time
origin or a stop boundary.
Do not subtract an entry offset from progress reports.

Set `entry` to `continue` when the viewer chose a Continue Watching item, or
`resume` when continuing the current item from its saved position. Use `next_up` for
the next episode and `autoplay` for an automatically started item. These values let
the server recognize a linear viewing chain for cross-device handoff. Use `explicit`
for a direct item/episode/chapter selection or a Watch Together start; omit `entry`
when the origin is unknown. Explicit and omitted entries do not continue a handoff
chain.

### Follow playback from another device

When a paused player returns to the foreground, or is about to resume, it can ask
whether the same user continued elsewhere:

```http
GET /api/v1/me/resume-handoff?mediaId=<current-media-id>&positionMs=<playhead-ms>&deviceId=<this-device-id>&idleMs=<time-since-own-action-ms>
Authorization: Bearer <token>
```

Call this only while paused. If the response has no `handoff`, stay where you are.
For `relation: "same_media"`, seek to `handoff.positionMs`. For
`relation: "later_episode"`, open `handoff.mediaId` and start at that position,
unless `sameFileAsFrom` is `true`; then seek within the current combined file.
Remember `chainId`: after the viewer undoes a handoff, ignore later answers with
that same chain id. The server returns `serverNow` and `updatedAt` so the client can
account for how old the other device's position is.

### Play an album

For each track, in queue order, `POST /api/v1/play-sessions` with
`{ "mediaId": "<track id>", "deviceId": "…", "audio": { "format": "opus", "bitrateKbps": 160 } }`.
`delivery.kind` is `file` and `delivery.url` streams the audio. Each track has its own
session and grant. Use `purpose: "prefetch"` to prepare the next track while the
current track is playing; a normal start on the same device supersedes the old one.
See the prefetch lifecycle in [Music playback](/developers/music-playback/).

### Play an audiobook

`POST /api/v1/play-sessions` with `{ "mediaId": "<book id>", "deviceId": "…" }`.
`delivery.kind` is `multipart-audio`. `delivery.tracks[]` sit on the book clock
(`startMs`, `durationMs`). Media URLs always start at 0, so seek to
`delivery.startPositionMs` yourself. When the server transcodes, `tracks[]` holds one
HLS playlist for the whole book. Report progress against the `playbackSessionId`, as for
video. Convert the book resume position to an offset within the selected track before
seeking. See [Audiobook playback](/developers/audiobook-playback/).

### Watch a channel

`POST /api/v1/livetv/playback-sessions` with a station id returns the same envelope with
`delivery.kind` `live-hls` and `delivery.url`. The separate `reporting` object carries
`kind: "keepalive"`, `method: "POST"`, `href` and `intervalMs`. Keep the session alive as described in
[Live TV playback](/developers/live-tv-playback/).

### Play in an external player (VLC, Kodi, cast)

An integrating app or script authenticates, probes when needed, and starts a session.
It resolves a relative `delivery.url` against the server origin and hands the resulting
URL to VLC, mpv or another URL-capable player. Those players can render an already-issued
HLS stream without implementing the negotiation API.
An existing Jellyfin/Subsonic client instead uses its compatibility protocol.

Media fetches keep a URL-only session active while it is being read, but do not report
an accurate playhead or heard time. The integrating client should report progress when
it can measure it, renew before expiry for long sessions, and close the session on exit.
A grant is a secret: avoid logging or sharing the URL. Keep bearer credentials on the
configured server origin. For a cast receiver on another address, request
`"castTarget": true` and inspect `grant.ipPinned`; operator policy may keep it pinned.

## Putting it together

```text
on startup    → GET /server, GET /server/notice
authenticate  → OAuth device flow, open GET /api/v1/events (SSE)
browse        → continue-watching, trending, search, GET /media/{id}
start         → POST /play-sessions → delivery.url
stream        → see Streaming a player  (§ next page)
track         → see Progress & state    (§ next page)
stop          → PUT status COMPLETED, or DELETE /play-sessions/{id}
```

The two linked pages below cover the rest: grants, progress heartbeats,
and the event stream.

## Next

- [Streaming a player](/developers/building-a-player-streaming/): starting
  playback, grants, opening HLS, seeking, tracks, and previews.
- [Progress & state](/developers/building-a-player-state/): play sessions,
  watch state, offline sync, and the live event stream.
- [Audiobook playback](/developers/audiobook-playback/): a different resume
  model for audiobooks.
- [Live TV playback](/developers/live-tv-playback/): the shared, capacity-limited
  live channel lifecycle.
