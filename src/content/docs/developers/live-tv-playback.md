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

All endpoints are on the `/api/v1` token surface and need a bearer token (and
Live TV permission). Stations are the stable viewer identity; feeds identify
individual upstream choices; `playbackSessionId` (the `{sessionId}` in the lifecycle paths) identifies one playback lifecycle.
The station and playback-session routes replace the old channel viewer routes
with no compatibility aliases. HLS protocol paths remain feed-addressed.

## The flow

```text
1. GET    /api/v1/livetv/stations                            → station list
2. GET    /api/v1/livetv/guide?from=…&to=…                   → programs keyed by stationId
3. POST   /api/v1/livetv/playback-sessions                   → playbackSessionId, delivery.url, grant, reporting
4. play   delivery.url                                     → HLS player
5. POST   /api/v1/livetv/playback-sessions/{sessionId}/keepalive → every reporting.intervalMs
6. DELETE /api/v1/livetv/playback-sessions/{sessionId}         → on stop / station switch
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
| `currentProgram` | object (optional) | Currently-airing program (see below) |

Use `id` as `stationId` for guide lookups, favorites, simple mode and session
starts. A change to the shown feed does not change the station's identity.
Sort a flat lineup by `channelNumber`; `sortOrder` only orders a category.

`GET /api/v1/livetv/stations/{stationId}` returns the station object itself,
useful for deep-link flows. It includes the list-item fields and optional
`nextProgram`. Read the fields directly on the response object.

Unknown stations return `404 not_found`; an unavailable Live TV provider
returns `503 dependency_unavailable`.

## 2. Guide / EPG

```http
GET /api/v1/livetv/guide?from=2026-10-17T18:00:00Z&to=2026-10-17T20:00:00Z
Authorization: Bearer <token>
```

Listing stations, then fetching the guide takes two calls; no feed or backup
group traversal is needed. Supply explicit ISO 8601 UTC `from` and `to` times.
`to` must be after `from`, and the window must be **at most 8 hours**.
Optional `stationIds` is a comma-separated list of up to 200 station ids;
omit it for all visible stations.

The guide returns a bare object `{ programs, windowStart, windowEnd }`, not a
paginated collection. `programs` maps each **stationId** to its chronological
program array.

For one station, use
`GET /api/v1/livetv/stations/{stationId}/programs?from=…&to=…` with the same
explicit window rules. It returns `{ items, page }`. There is no `view=now-next`
or `view=day` shortcut.
`GET /api/v1/livetv/stations/{stationId}/current-program` returns
`{ isLive, program? }` for a now-playing banner.

Each `LiveTvProgram` has `id`, `stationId`, `title`, `startTime` and `endTime`
(ISO 8601), plus optional `description`, `genres`, `officialRating`, `epgId`
(feed provenance, not a per-program id) and `sourceId`. Compute duration from
`endTime - startTime`. Invalid windows return `422 validation_failed`; an
unavailable provider returns `503 dependency_unavailable`.

### Non-overlap guarantee

Programs on a station are guaranteed **non-overlapping**: one ends at or
before the next begins. You can lay them out on a timeline without collision
handling; at most one program covers any instant. Gaps are possible.

Lumastra deduplicates at import time and re-checks on read. **Do not write your
own title-based deduplication**: genuine repeats at different times are
preserved. Report overlapping entries rather than filtering them in a client.

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

A successful start returns **`201`** with:

| Field | Type | Meaning |
|---|---|---|
| `playbackSessionId`, `stationId`, `feedId` | string | Session handle (the `{sessionId}` in the lifecycle paths), stable station, and selected feed |
| `delivery` | object | `kind: "live-hls"` and `url`: the HLS URL, ready to hand to the player, already carrying a `?grant=` |
| `grant` | object | `{ id, token, param: "grant", ipPinned, expiresAt, renewAfter, renewHref }`, as for every other media kind |
| `reporting` | object | `intervalMs` is the interval between keepalives |
| `requiresProxy` | boolean | Whether playback must go through the Live TV proxy |
| `sourceId` | string (optional) | Upstream source id |
| `maxStreams` | number (optional) | Concurrent-stream limit when enforced |
| `rungId` | string \| null | Selected quality rung |
| `requestedMaxBitrate`, `appliedMaxBitrate`, `appliedMaxHeight` | number \| null | Requested cap and applied output limits |
| `reason` | string \| null | Quality decision: `source_within_cap`, `hdr_source`, `unprobeable`, `capacity`, `below_ladder` or `insufficient_ladder` |
| `adaptive` | object (optional) | `{ rungs: [{ id, height, maxBitrate, codec: "h264" }], includesOriginal }` |
| `variant` | `fmp4` \| `h264` (optional) | HEVC compatibility output selected for this player |

Use the returned output information to show the quality actually applied.
Adaptive quality depends on server configuration and available capacity;
don't assume the requested ladder or cap was applied. The successful response's
`reason` describes quality selection; a `410` error's `reason` describes why
playback ended.

Starting another session for the same viewer key **supersedes** its previous
session, which becomes `ended` with `endReason: superseded`. Keep the returned
`playbackSessionId` and use it for all subsequent lifecycle operations. Each accepted
start records one watch-history entry; manifest fetches do not.

| Status | `code` | Meaning |
|---|---|---|
| `403` | `forbidden` | Live TV or feed access denied |
| `404` | `not_found` | Unknown station or feed |
| `409` | `conflict` | Another session change is in progress |
| `410` | `gone` | Viewer eviction guard still active: stop, show the reason, don't auto-rejoin |
| `422` | `validation_failed` | Invalid station, feed or quality options |
| `502` | `bad_gateway` | Upstream failure |
| `503` | `stream_limit` | Concurrent-stream cap reached; honor `retryAfter` when supplied |
| `503` | `cap_unavailable` | Requested output cap cannot be produced |
| `503` | `dependency_unavailable` | Session store, stream proxy or provider unavailable |

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
POST /api/v1/livetv/playback-sessions/{sessionId}/keepalive
Authorization: Bearer <token>
```

Send every **`reporting.intervalMs`** from the start response. Success is
`204 No Content`. Without keepalives the session can expire and the proxy can
release the slot.

`GET /api/v1/livetv/playback-sessions/{sessionId}` returns
`{ sessionId, stationId, feedId, state, endReason?, adaptive?, variant? }`.
`state` is `active` or `ended`; `endReason` uses the same four values below.
Session state and lifecycle operations are restricted to the owning user.

An ended session's keepalive returns `410` with `code: gone`,
`error: playback_session_ended` and a typed `reason`:

| `reason` | Meaning | Client action |
|---|---|---|
| `evicted` | A higher-priority viewer took the slot | Stop, explain that playback was taken over, and do not auto-rejoin |
| `superseded` | Another session replaced this viewer's session | Stop the old player and its keepalive timer |
| `expired` | The session lifetime elapsed | Stop; start a new session only for a new playback attempt |
| `left` | The session was explicitly ended | Stop and clear its handle |

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
DELETE /api/v1/livetv/playback-sessions/{sessionId}
Authorization: Bearer <token>
```

Stop the keepalive timer and release the session on stop or before switching
stations. Success is `204 No Content`; ending an already-ended or unknown
session is idempotent.
`POST /api/v1/livetv/playback-sessions/{sessionId}/leave` provides the same
operation for `navigator.sendBeacon` on unload, with a browser session cookie.

:::caution[Always release the session]
Skipping cleanup wastes a stream slot until expiry. During that window,
another viewer can be blocked by the stream limit.
:::

## Checklist

- List stations, then fetch the guide with explicit `from` and `to` times.
- Start with `POST …/playback-sessions`; retain `playbackSessionId` and play `delivery.url`.
- Keepalive every `reporting.intervalMs`; delete the session on stop.
- Stop on `410` and inspect `reason`; never auto-rejoin after eviction.
- Handle stream limits, unavailable quality caps and temporary dependencies.

## Next

- [Offline downloads](/developers/offline-downloads/): original files and
  transcoded renditions.
- [Music playback](/developers/music-playback/): the audio-only equivalent flow.
- [Watch Together](/developers/watch-together/): synchronized playback over a
  live channel.
