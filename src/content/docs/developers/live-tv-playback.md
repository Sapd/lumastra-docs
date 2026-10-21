---
title: Live TV playback
description: >
  Play Live TV from a third-party client: list stations, fetch the guide,
  start a playback session, keep it alive, and release the slot on exit.
---

Live TV has a different lifecycle from on-demand playback (see
[Building a player](/developers/building-a-player/) for the VOD flow). A live
stream is a **shared, capacity-limited** resource: start a playback session,
keep it alive with periodic keepalives, and **release it** when you're done so
the slot frees up for other viewers.

All endpoints are on the `/api/v1` token surface and need a bearer token and the
`canWatchLiveTv` permission. Without it, every Live TV endpoint answers `403 forbidden`
with "Live TV access requires permission".

Stations are the stable viewer identity. Feeds identify individual upstream choices.
`playbackSessionId` identifies one playback lifecycle; it is the `{playbackSessionId}` in
the lifecycle paths. HLS protocol paths remain feed-addressed.

## The flow

```text
1. GET    /api/v1/livetv/stations                                  → station list
2. GET    /api/v1/livetv/guide?from=…&to=…                         → airings and nowNext per station
3. POST   /api/v1/livetv/playback-sessions                         → playbackSessionId, delivery, grant
4. play   delivery.url                                             → HLS player
5. POST   delivery.keepaliveHref   every delivery.heartbeatIntervalMs
6. DELETE /api/v1/livetv/playback-sessions/{playbackSessionId}    → on stop or station switch
                                                                   (or POST …/leave from sendBeacon)
```

## How Live TV differs from on-demand

Live streams use a **separate stream proxy** from the one that serves VOD,
with different trade-offs to plan around:

- **No seeking.** Live output only plays forward. There's no VOD manifest to
  scrub within, so don't show a seek bar for Live TV.
- **Single muxed audio track.** Unlike VOD's per-track demuxed HLS renditions
  (see [Streaming a player](/developers/building-a-player-streaming/#4-audio--subtitle-tracks)),
  a live stream carries one AAC audio track, so there's no track-switching UI
  to build.
- **Shared output.** Viewers of the same feed share the proxy output rather
  than each getting a separate VOD transcode. Provider stream limits and
  viewer priority still apply.
- **Automatic source failover.** If the upstream source degrades or errors, the
  server rotates to a configured backup URL and marks the next manifest with
  `#EXT-X-DISCONTINUITY`. Let the HLS player handle it normally (a brief
  re-buffer).

## 1. List stations

```http
GET /api/v1/livetv/stations
Authorization: Bearer <token>
```

Returns `{ items, page }` where each item is a station object:

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable station UUID: the backup group id, or the feed id for an ungrouped station |
| `feedId` | string | Shown feed UUID; availability observations and HLS paths use feed ids |
| `name` | string | Display name |
| `images` | object | Image descriptors by role; use their supplied image URLs |
| `channelNumber` | integer (optional) | Stable station number (1–9999); numbers can have gaps |
| `category`, `categoryId` | string (optional) | Category name and UUID |
| `sortOrder` | number | Display order within the category |
| `categorySortOrder` | integer (optional) | Display order of the category |
| `isVisible` | boolean | Whether the station is visible |
| `qualityTier` | `uhd` \| `fhd` \| `hd` \| `sd` (optional) | Stream quality |
| `sourceId` | string (optional) | Upstream source UUID |
| `nowNext` | object (optional) | Current and next airing |

Use `id` as `stationId` for guide lookups, favorites, simple mode and session
starts. A change to the shown feed does not change the station's identity.
Sort a flat lineup by `channelNumber`; `sortOrder` only orders a category.

`GET /api/v1/livetv/stations/{stationId}` returns the station object itself, with `nowNext`
(current and next airing), useful for deep-link flows.

Unknown stations return `404 not_found`; an unavailable Live TV provider
returns `503 dependency_unavailable`.

## 2. Guide / EPG

```http
GET /api/v1/livetv/guide?from=2026-10-17T18:00:00Z&to=2026-10-18T00:00:00Z&limit=50
Authorization: Bearer <token>
```

Listing stations, then fetching the guide takes two calls. Supply explicit ISO 8601 UTC
`from` and `to` times. Both are required, and the window must be **at most 24 hours**.
Pass `stationIds` (up to 200 station ids, comma-separated) for a chosen set, or `limit`
with `cursor` paging for all visible stations. Follow `page.nextCursor` until
`page.hasMore` is `false`.

The guide returns `stations[{stationId, airings, nowNext}]`, ordered, plus `window`,
`page` and, when you passed `stationIds`, `unknownStationIds` for ids that matched nothing.
Each airing has `id`, `stationId`, `title`, `startTime` (inclusive) and `endTime` (exclusive),
both ISO 8601 UTC, plus optional `description`, `genres` and `officialRating`.
`nowNext` is the current airing and the next one. Current is `startTime <= now < endTime`;
next is the first airing that has not started. The same rule applies in every response.

For one station, use
`GET /api/v1/livetv/stations/{stationId}/programs?from=…&to=…` with the same
window rules (required UTC, at most 24 hours). It returns `airings` and `nowNext`.
`GET /api/v1/livetv/stations/{stationId}/current-program` returns `nowNext` and `asOf`
(server time) for a now-playing banner.

Compute duration from `endTime - startTime`. Invalid windows return `422 validation_failed`;
an unavailable provider returns `503 dependency_unavailable`.

### Non-overlap guarantee

Airings on a station are **non-overlapping**: one ends at or before the next begins. You can
lay them out on a timeline without collision handling; at most one airing covers any instant.
Gaps are possible.

Lumastra deduplicates at import time and re-checks on read. **Do not write your own
title-based deduplication**: genuine repeats at different times are preserved. Report
overlapping entries rather than filtering them in a client.

### Pick a feed

`GET /api/v1/livetv/stations/{stationId}/feeds` returns `{ stationId, feeds }`.
Each feed carries `id`, `name`, optional `qualityTier`, and the booleans
`isDegraded`, `isPrimary`, `isVisible` and `isDefault`. The default feed is
first, followed by rank.

To choose one, pass its `id` as `feedId` when starting a session. It must belong
to the station. Omit `feedId` to use the shown feed or the viewer's saved
choice. To switch feeds, start a new session with the same `stationId` and the
new `feedId`.

## 3. Start a playback session

```http
POST /api/v1/livetv/playback-sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "stationId": "11111111-1111-4111-8111-111111111111",
  "quality": "adaptive",
  "maxBitrate": 8000000,
  "hevc": "fmp4"
}
```

Only `stationId` is required. Playback choices belong in this JSON body:

| Field | Values | Meaning |
|---|---|---|
| `feedId` | Feed UUID | Select a feed belonging to the station |
| `quality` | `server`, `adaptive`, `original`, `1080p8m`, `720p4m`, `540p2m`, `360p1m` | `server` follows the administrator's default |
| `maxBitrate` | Positive number | Maximum total mux bitrate in bits per second |
| `hevc` | `any`, `fmp4`, `none` | HEVC decoding capability: MPEG-TS and fMP4, fMP4 only (such as AVPlayer), or no HEVC support |

Omitting `hevc` preserves original-stream behavior. For an HEVC source, the
server can select fMP4 packaging or an H.264 compatibility encode for the
capability you declare.

A successful start returns **`201`** with the shared playback envelope:

| Field | Meaning |
|---|---|
| `playbackSessionId`, `stationId` | Session handle and the stable station |
| `delivery` | `kind: "live-hls"`, `url` (the HLS URL, already carrying a `?grant=`), `feedId` (the selected feed), `heartbeatIntervalMs` (how often to send keepalives) and `keepaliveHref`. Also the output details below |
| `grant` | `{ id, token, param: "grant", ipPinned, expiresAt, renewAfter, renewHref }`, as for every other media kind. Valid for 6 hours |

`delivery` also carries the output details:

| Field | Meaning |
|---|---|
| `requiresProxy` | Whether playback must go through the Live TV proxy |
| `sourceId`, `maxStreams` | Optional: upstream source id, and the concurrent-stream limit when enforced |
| `rungId` | Selected quality rung, or `null` |
| `requestedMaxBitrate`, `appliedMaxBitrate`, `appliedMaxHeight` | Requested cap and applied output limits, or `null` |
| `reason` | Quality decision: `source_within_cap`, `hdr_source`, `unprobeable`, `capacity`, `below_ladder` or `insufficient_ladder`, or `null` |
| `adaptive` | Optional: `{ rungs: [{ id, height, maxBitrate, codec: "h264" }], includesOriginal }` |
| `variant` | Optional: `fmp4` or `h264`, the HEVC compatibility output selected for this player |

Use this information to show the quality actually applied.
Adaptive quality depends on server configuration and available capacity;
don't assume the requested ladder or cap was applied.

Starting another session for the same viewer key **supersedes** its previous
session, which becomes `ended` with `endReason: superseded`. Keep the returned
`playbackSessionId` and use it for all subsequent lifecycle operations. One accepted
start counts as one watch; manifest fetches do not.

Every failed start answers `application/problem+json`. Switch on `code`, never on `error`
text. Each row below lists the `code`, its HTTP status, whether a retry can succeed, and
what to show.

| `code` | HTTP | `retryable` | `retryAfterMs` | What to show |
|---|---|---|---|---|
| `channel_offline` | 502 | no | - | This channel is offline right now |
| `provider_auth_failed` | 502 | no | - | The provider rejected the account (expired or wrong credentials) |
| `provider_connection_limit` | 503 | yes | 30000 | The provider has no free connection; try again shortly |
| `provider_unreachable` | 504 | yes | 10000 | The provider cannot be reached |
| `geo_blocked` | 502 | no | - | The provider blocks this channel in the server's region |
| `no_video` | 502 | no | - | The channel carries no playable video or audio |
| `encoder_failed` | 500 | yes | 5000 | The server could not encode the channel |
| `all_feeds_failed` | 502 | if any feed's reason is retryable | the smallest of those | Every feed failed; offer another station |
| `upstream_stalled` | 502 | yes | 3000 | The channel stopped delivering video |
| `stream_limit` | 503 | yes | 30000 | Our own viewer slots are full (`details` has the limit) |
| `dependency_unavailable` | 503 | yes | 5000 | The stream proxy is down |
| `cap_unavailable` | 503 | - | - | The requested output cap cannot be produced |

`retryable: false` means do not retry automatically; offer another station. When
`retryAfterMs` is set, wait that long before one more try (the same value, rounded up to
seconds, is the `Retry-After` header). A station tries all of its feeds before it fails,
so one `all_feeds_failed` already covers every URL.

Administrators also get `feedsTried` (`feedId`, `feedName`, `reason`, `upstreamStatus?`)
to see which feed failed how. Viewers never receive it, and no response contains a stream
URL.

## 4. HLS playback

:::caution[Don't hand-build this URL]
Play `delivery.url` as returned. HLS manifests and segments still live under
`/api/v1/livetv/channels/{feedId}/stream/**`; these protocol paths are unchanged.
Do not replace `channels` with `stations` or substitute a station id into them.
Fetching a manifest does not start a playback session.
:::

The start response carries a **grant**, the same model as for video, music and
audiobooks: a `?grant=` already attached to `delivery.url`, bound to this one
station and playback session. A grant is valid only while the session is `active`
and only for the feed named in the path, and it lasts 6 hours. The server
propagates it into every segment URL in the manifest, so header-less players need
nothing else. `api_key` and `stream_token` query parameters are not accepted. If
you can send headers, renew with `POST grant.renewHref` and `{ "token": grant.token }`.
Media fetches count as activity, but keep sending keepalives (§5) so the slot stays
yours.

```js
// HLS.js in a browser: the grant in the URL authenticates manifest and segments
const hls = new Hls();
hls.loadSource(session.delivery.url);
hls.attachMedia(videoElement);
```

```swift
// AVPlayer (tvOS/iOS): open the URL as returned
let url = URL(string: session.delivery.url, relativeTo: serverBaseURL)!
player.replaceCurrentItem(with: AVPlayerItem(url: url))
player.play()
```

## 5. Keepalive and session state

```http
POST /api/v1/livetv/playback-sessions/{playbackSessionId}/keepalive
Authorization: Bearer <token>
```

Send it every **`delivery.heartbeatIntervalMs`**, at `delivery.keepaliveHref`. Success is
`204 No Content`. Without keepalives the session can expire and the proxy can release the
slot. Players that cannot send keepalives stay alive through media fetches.

```http
GET /api/v1/livetv/playback-sessions/{playbackSessionId}
```

returns `playbackSessionId`, `stationId`, `feedId`, `state` (`active` or `ended`), optional
`adaptive` and `variant`, and `endReason` (the values in the table below, plus `failed`). For a failed session it also returns `failure`:
`{ code, retryable, retryAfterMs?, at }`. Session state and lifecycle operations are
restricted to the owning user.

An ended session's keepalive returns `410` with `code: gone`,
`error: playback_session_ended` and a typed `reason`:

| `reason` | Meaning | Client action |
|---|---|---|
| `evicted` | A higher-priority viewer took the slot | Stop, explain that playback was taken over, and do not auto-rejoin |
| `superseded` | Another session replaced this viewer's session | Stop the old player and its keepalive timer |
| `expired` | The session lifetime elapsed | Stop; start a new session only for a new playback attempt |
| `left` | The session was explicitly ended | Stop and clear its handle |
| `failed` | The channel stopped while playing | Stop; read `code`, `retryable` and `retryAfterMs` from the body and offer another station if needed |

When the channel fails while playing, the next keepalive ends the session with `reason:
failed` and the same `code`, `retryable` and `retryAfterMs`. Every later keepalive answers
the same way. A player that only fetches media sees a `410` on the HLS routes with the same
`code` in its body; read the session state for details. Once a keepalive or a stop has
ended the session, its grant ends with it, and media URLs answer `401 invalid_grant` with
`reason: session_ended`.

Eviction is terminal for the affected session. A still-active eviction guard
can also reject a new start with `410`; repeatedly starting sessions must not
be used to reclaim the slot. The guard is consumed once by keepalive under
the eviction rules and otherwise expires after 120 seconds. A delayed leave
for an old session cannot remove the viewer's replacement session.

A keepalive `404` with `reason: session_not_found` means the record is unknown;
`reason: session_expired` means proxy presence expired. A fresh playback
attempt needs a new POST start, not a manifest reload. On
`503 dependency_unavailable`, retry the keepalive: the slot may still be live.

## 6. Stop: release the slot

```http
DELETE /api/v1/livetv/playback-sessions/{playbackSessionId}
Authorization: Bearer <token>
```

Stop the keepalive timer and release the session on stop or before switching
stations. Success is `204 No Content`; ending an already-ended or unknown
session is idempotent. Live TV sessions are stopped with this `DELETE`, not with a
`PUT` to the play-sessions path.

`POST /api/v1/livetv/playback-sessions/{playbackSessionId}/leave` provides the same
operation for `navigator.sendBeacon` on unload.

:::caution[Always release the session]
Skipping cleanup wastes a stream slot until expiry. During that window,
another viewer can be blocked by the stream limit.
:::

## Checklist

- List stations, then fetch the guide with explicit `from` and `to` times (at most 24 hours apart).
- Start with `POST …/playback-sessions`; retain `playbackSessionId` and play `delivery.url`.
- Keepalive every `delivery.heartbeatIntervalMs` at `delivery.keepaliveHref`; `DELETE` the session on stop.
- Stop on `410` and inspect `reason`; never auto-rejoin after eviction.
- Handle the start errors from the table: retry only when `retryable` is true, and wait `retryAfterMs`.

## Next

- [Offline downloads](/developers/offline-downloads/): original files and
  transcoded renditions.
- [Music playback](/developers/music-playback/): the audio-only equivalent flow.
- [Watch Together](/developers/watch-together/): synchronized playback over a
  live channel.
