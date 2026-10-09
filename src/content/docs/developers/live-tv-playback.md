---
title: Live TV playback
description: >
  Play Live TV channels from a third-party client: list channels, fetch EPG
  programs, open an HLS stream session, keep it alive with keepalives, and
  release the slot cleanly on exit.
---

Live TV has a different lifecycle from on-demand playback (see
[Building a player](/developers/building-a-player/) for the VOD flow). A live
stream is a **shared, capacity-limited** resource: you register a viewer
session, keep it alive with periodic keepalives, and **must release it** when
you're done so the slot frees up for other viewers.

All endpoints are on the `/api/v1` token surface and need a bearer token (and
Live TV permission). The stream session returns its own short-lived `stream_`
token for HLS playback.

## The flow

```text
1. GET    /api/v1/livetv/channels                             → channel list
2. GET    /api/v1/livetv/channels/{id}/programs?view=now-next → EPG (optional)
3. GET    /api/v1/livetv/channels/{id}/stream                 → streamUrl (+ requiresProxy)
4. play   streamUrl  (append ?stream_token=<token> for header-less players)
5. POST   /api/v1/livetv/channels/{id}/keepalive              → every 10–15 s
6. DELETE /api/v1/livetv/channels/{id}/leave                  → on stop / channel switch
```

## How Live TV differs from on-demand

Live channels are transcoded by a **separate stream proxy** from the one that
serves VOD, with different trade-offs to plan around:

- **No seeking.** Live output only plays forward. There's no VOD manifest to
  scrub within, so don't show a seek bar for Live TV.
- **Single muxed audio track.** Unlike VOD's per-track demuxed HLS renditions
  (see [Streaming a player](/developers/building-a-player-streaming/#4-audio--subtitle-tracks)),
  a live stream carries one AAC audio track, so there's no track-switching UI
  to build.
- **One transcode process serves every viewer** of a channel (ref-counted), so
  joining an already-popular channel is free. VOD is different: each session
  gets its own transcode.
- **Automatic source failover.** If the upstream source degrades or errors, the
  server rotates to a configured backup URL and marks the next manifest with
  `#EXT-X-DISCONTINUITY`. Treat that tag the way any HLS player normally would
  (brief re-buffer, no error). It isn't a sign of a broken stream.

## 1. List channels

```http
GET /api/v1/livetv/channels
Authorization: Bearer <token>
```

Returns `{ items, page }` where each item is a channel object:

| Field | Type | Description |
|---|---|---|
| `id` | string | Channel UUID |
| `name` | string | Display name |
| `channelNumber` | integer (optional) | Dense 1-based global lineup position |
| `logoUrl` | string \| null | Ready proxy URL, use directly |
| `qualityTier` | `uhd` \| `fhd` \| `hd` \| `sd` (optional) | Stream quality |
| `currentProgram` | object \| null | Currently-airing program (see below) |

`currentProgram` carries `id`, `channelId`, `title`, `startTime`, `endTime`, and
optional metadata: the same `LiveTvProgram` shape as [§2](#2-programs--epg). It
resolves to exactly one program; see the
[non-overlap guarantee](#non-overlap-guarantee).

`GET /api/v1/livetv/channels/{id}` returns the channel object itself, useful for
deep-link flows. It includes the list-item fields, a resolved logo URL and the
enriched current program. Read the fields directly on the response object.

| Status | `code` | Meaning |
|---|---|---|
| `404` | `not_found` | Channel UUID not found |
| `503` | `dependency_unavailable` | Live TV provider unavailable |

## 2. Programs / EPG

```http
GET /api/v1/livetv/channels/{id}/programs?view=now-next
Authorization: Bearer <token>
```

Returns `{ items, page }` of program entries. Fetch this to populate an
on-screen guide or a "next up" banner before opening the stream.

| Query param | Default | Values | Notes |
|---|---|---|---|
| `view` | `now-next` | `now-next` \| `day` | `now-next` returns programs spanning from **30 minutes before the current moment to about 2 hours ahead**, so the window doesn't start right at "now". `day` returns the full calendar day. |
| `from` | now | ISO 8601 | Start of the window (`view=day`). Defaults to midnight of the current day. |
| `to` | next midnight | ISO 8601 | End of the window (`view=day`). Must be after `from`. |

Each program item is a `LiveTvProgram`: `id`, `channelId`, `title`, `startTime`,
`endTime` (ISO 8601), plus optional `description`, `genres`, `officialRating`,
`epgId` (feed provenance, not a per-program id), and `sourceId`. Compute
duration yourself from `endTime - startTime`.

:::caution[Field names]
Earlier revisions of this page documented `startsAt`, `endsAt`, and
`durationMinutes`. Those were never emitted. The fields have always been
`startTime` and `endTime`, with no duration field.
:::

| Status | `code` | Meaning |
|---|---|---|
| `422` | `validation_failed` | Invalid `view`, unparseable `from`/`to`, or `to` ≤ `from` |
| `503` | `dependency_unavailable` | Live TV provider unavailable |

### Non-overlap guarantee

Programs on a channel are guaranteed **non-overlapping**: for any two entries
with the same `channelId`, one ends at or before the next begins. You can lay
them out on a timeline without collision handling, and "what's on now" always
resolves to exactly one program. The same holds for `GET /api/v1/livetv/guide`.

You get this because Lumastra deduplicates at import time and re-checks on
read. Aggregator XMLTV feeds routinely reuse one channel id across several
schedule variants offset by seconds to hours, with no field marking a copy as
a duplicate. **Do not write your own deduplication**; a client-side title
filter would wrongly eat genuine repeats (the same show airing again later),
which never overlap and are always preserved. If you do observe overlapping
entries, the server is serving data imported by an older build. Report it
instead of working around it.

## 3. Open the stream

```http
GET /api/v1/livetv/channels/{id}/stream
Authorization: Bearer <token>
```

The server resolves the upstream HLS URL, enforces stream limits, checks for
kicked viewers, and **registers a viewer session**:

```jsonc
{ "streamUrl": "/api/v1/livetv/channels/{id}/stream/master.m3u8",
  "requiresProxy": true, "sourceId": "provider-source-id", "maxStreams": 4 }
```

:::caution[Don't hand-build this URL]
`streamUrl` is surface-aware: the server rewrites it for the prefix you called
(`/api/v1/…` or `/api/…`). Play it as given rather than reconstructing a path
from the channel id.
:::

Authentication for the manifest and its segments uses your normal credential: a
session cookie in the browser, or a `stream_` token as a `?stream_token=…` query
parameter for header-less players such as AVPlayer. The server rewrites segment
URLs inside the manifest to carry the same credential automatically.

| Status | `code` | Meaning |
|---|---|---|
| `410` | `gone` | Viewer was kicked: stop playback, show the reason, don't auto-reconnect |
| `503` | `stream_limit` | Concurrent-stream cap hit: `retryAfter` indicates when to try again |
| `503` | `dependency_unavailable` | Stream proxy or Live TV provider down |
| `502` | `bad_gateway` | Upstream returned an unexpected error |

## 4. HLS playback

```js
// HLS.js (browser — session cookie handles auth automatically)
const hls = new Hls();
hls.loadSource(streamInfo.streamUrl);
hls.attachMedia(videoElement);
```

```swift
// AVPlayer (tvOS/iOS) — must pass token as query parameter
let url = URL(string: streamInfo.streamUrl + "?stream_token=\(streamToken)", relativeTo: serverBaseURL)!
player.replaceCurrentItem(with: AVPlayerItem(url: url))
player.play()
```

## 5. Keepalive: maintain the session

```http
POST /api/v1/livetv/channels/{id}/keepalive
Authorization: Bearer <token>
```

Send **every 10–15 seconds**. Without keepalives the session TTL lapses and the
proxy may tear down the stream or hand the slot to another viewer. Returns
`204 No Content` on success.

| Status | `code` | Meaning |
|---|---|---|
| `404` | `not_found` | Session expired: call `…/stream` again to re-register (idempotent) |
| `410` | `gone` | Evicted by a higher-priority viewer: stop, show the reason, don't auto-reconnect |
| `503` | `dependency_unavailable` | Proxy transiently unavailable: retry, the slot may still be live |

## 6. Leave: release the slot

```http
DELETE /api/v1/livetv/channels/{id}/leave    # normal exit / channel switch
POST   /api/v1/livetv/channels/{id}/leave    # via navigator.sendBeacon on unload
```

Both return `204 No Content` and are idempotent: leaving a channel you have
already left (or never joined) isn't an error.

:::caution[Always leave cleanly]
Not leaving wastes a stream slot until the TTL expires. During that window,
another viewer can be blocked by the stream limit.
:::

## Checklist

- Fetch `GET …/stream`, save `streamUrl` and `requiresProxy`.
- Keepalive every 10–15 s; always `leave` on stop and before a channel switch.
- Handle `410 gone` on `/stream` and `/keepalive`: stop, don't auto-reconnect.
- Handle `503 stream_limit` and `503 dependency_unavailable` (retry on the latter).
- Handle `502 bad_gateway` on `/stream`: the upstream source is down.

## Next

- [Offline downloads](/developers/offline-downloads/): original files and
  transcoded renditions.
- [Music playback](/developers/music-playback/): the audio-only equivalent flow.
- [Watch Together](/developers/watch-together/): synchronized playback over a
  live channel.
