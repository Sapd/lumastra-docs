---
title: Music playback
description: >
  Play music from a third-party client: start a track, stream it, report
  progress, send explicit like/dislike feedback, replay offline listens,
  and the OpenSubsonic scrobble/reportPlayback alternative.
sidebar:
  order: 2.65
---

A native client plays music through Lumastra's versioned **`/api/v1`** surface,
the same one used in [Building a player](/developers/building-a-player/). If you're reusing an existing
Subsonic-family music app instead, skip to
[OpenSubsonic clients](#5-opensubsonic-clients): that's a separate protocol,
not part of `/api/v1`.

## The model in one paragraph

Music uses the same session API as video and audiobooks. You start a track with
`POST /api/v1/play-sessions`, open the audio URL from the response, and report
position with `PUT` to `reporting.href`. There is no separate music session.
The terminal report (`status: "COMPLETED"`) is what records the listen: it
feeds play counts, listen history, top lists and taste stations. Likes and
dislikes are separate and explicit. Read [Explicit like and
dislike](#3-explicit-like-and-dislike) before you decide how your thumbs-up
button works.

Before offering music, check `capabilities.music.available` in `GET /api/v1/server`
(see [API routes](/developers/api-routes/#server-discovery-and-capabilities)).
It is true when the server has at least one enabled music library. Do not confuse it
with `capabilities.music.clustering`, which gates an unrelated recommendation feature.
Sonic mixes and the sonic similarity routes answer `404` while `sonicMixes` or
`sonicSimilarity` is off.

---

## 1. Get the track and stream it

Fetch track detail the same way as any catalog item:
`GET /api/v1/media/{id}` (type-discriminated, returns `type: "track"`) or the
music-specific `GET /api/v1/music/tracks/{id}`. Then start playback and open the
audio stream:

```bash
curl -X POST https://lumastra.example.com/api/v1/play-sessions \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{ "mediaId": "550e8400-e29b-41d4-a716-446655440000", "deviceId": "my-player-uuid",
        "audio": { "format": "opus", "bitrate": 160 } }'
```

The response is the same envelope as for video (see [Play media from your own
client](/developers/building-a-player/#play-media-from-your-own-client)):
`delivery.kind` is `file`, and `delivery.url` is the ready audio URL, already
carrying a `?grant=` for this one track and session. Music grants last 6 hours.
Each track gets its own playback session and grant, so for gapless playback
start the next track a little before the current one ends. Starting a new track on the
same `deviceId` supersedes the previous session, so a final `COMPLETED` report first is
good practice.

```http
GET <delivery.url>
```

This is a **Class R (raw)** endpoint, same rules as HLS segments and images:
pre-stream errors (auth, not-found) are `application/problem+json`, but the
body itself is raw audio with standard HTTP `Range` support for seeking.
Header-less clients (and any player you hand the URL to) need nothing else.
`api_key` and `stream_token` query parameters are not accepted. With a bearer
token you can still call `GET /api/v1/music/tracks/{id}/stream` directly.

Optional query parameters:

| Param | Meaning |
|---|---|
| `format` | Force a transcode target codec instead of the source format |
| `maxBitRate` | Cap output bitrate (transcoded formats only) |
| `timeOffset` | Start position for the byte stream (seconds) |
---

## 2. Report progress

Report against the `playbackSessionId` from the start response, with your normal
bearer token (never the `grant`). Starting needs the `media:write` scope, which a
`media:read` token lacks (`403 scope_required`).

```bash
curl -X PUT https://lumastra.example.com/api/v1/play-sessions/{playbackSessionId} \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{ "positionMs": 42000, "status": "ACTIVE", "eventSeq": 4, "sessionElapsedMs": 41000 }'
```

`positionMs`, `status` (`ACTIVE`, `PAUSED` or `COMPLETED`), `eventSeq` and
`sessionElapsedMs` are required; the field rules are the ones in [Building a player:
State](/developers/building-a-player-state/#1-report-progress). Music adds a few optional
fields:

| Field | Meaning |
|---|---|
| `listenedMs` | Audio actually heard since the session began. Defaults to `sessionElapsedMs` |
| `endReason` | On `COMPLETED`: `completion` for a track that played out, `skip` for a user skip. A skip is recorded as a skip |
| `nextMediaId` | Set-only hint: the track that plays next. `COMPLETED` clears it |
| `crossfade` | `otherTrackId`, `role` (`incoming` or `outgoing`), `remainingMs` and `durationMs`. Omit it to keep the current fade, send `null` to clear it. `PAUSED` and `COMPLETED` clear it |

Send a report every `reporting.intervalMs` (about 10 seconds) while `ACTIVE`, and on
pause, resume and seek. When the track ends, send `status: "COMPLETED"` with an
`endReason`. That closes the session (`204`). For page or app teardown, use
`POST {reporting.href}/beacon` with the same body (it works with `navigator.sendBeacon`).
To terminate a session at once, call `POST /api/v1/play-sessions/{playbackSessionId}/cancel`.
There is no `DELETE /api/v1/play-sessions/{playbackSessionId}`.

Ownership is enforced: another user's session id answers `404`. Reporting never needs the
playback grant.

---

## 3. Explicit like and dislike

Taste signals are explicit and separate from progress. Reports and skips never change them:

```http
PUT    /api/v1/user/music/tracks/{id}/feedback   { "feedback": "liked" }      → 204
PUT    /api/v1/user/music/tracks/{id}/feedback   { "feedback": "disliked" }   → 204
DELETE /api/v1/user/music/tracks/{id}/feedback                                → 204
```

`feedback` is `liked` or `disliked`. `DELETE` clears the feedback in either direction and
is idempotent. An unknown or inaccessible track answers `404`. Reserve these calls for an
explicit thumbs-up or thumbs-down in your UI: a string of skips never turns into a
dislike, and a finished track never turns into a like.

---

## 4. Play counting and offline listens

There is no separate play-count call. The first accepted report of a session counts the
start once, and the terminal `COMPLETED` report records the listen (duration, completion
or skip). A retried terminal report never counts twice.

Listens that finished without a live session (offline playback) are sent later in one
batch:

```http
POST /api/v1/play-sessions/replay
```

with up to 100 `items[]`. Each item needs `eventId` (a UUID you mint when the play
starts and keep for every retry), `kind: "music"`, `mediaId`, `startedAt`, `positionMs`,
`listenedMs` and `endReason`; `endedAt`, `durationMs`, `playContext` and `startReported`
(default `false`) are optional. Send `startReported: false` when the start never reached
the server, so the play is counted at the end. Starts may be at most 90 days old or 5
minutes in the future. Each result is `recorded`, `duplicate` or `rejected`, with an open
`reason` string and a `retryable` flag. Keep the event queued while `retryable` is `true`,
and drop it only on a terminal result. A retried `eventId` is a `duplicate` and never
increments counters.

Music is **not** accepted by
[`/offline-playback-sessions`](/developers/building-a-player-state/#4-offline-playback-sync):
that endpoint answers `unsupported_media_type` for a track. Replay is the music
equivalent.

---

## 5. OpenSubsonic clients

If you're building against (or reusing) an existing Subsonic-family app
instead of Lumastra's native `/api/v1`, use the OpenSubsonic-compatible
surface at `/subsonic/rest/`. See [Connecting third-party
apps](/using/third-party-players/#subsonic-music-clients) for how a user
points a client at Lumastra and generates a token. This surface requires
`FEATURE_SUBSONIC_COMPAT=true` on the server; if it's off, every call
(including the two below) returns a Subsonic error envelope rather than
`404`.

```
GET /rest/stream.view?id=<songId>
```

fetches the audio. Session registration then happens through **either** of
two endpoints. Pick one: they write to the same underlying session row and
can be mixed if you need to:

### `scrobble.view` (Subsonic-standard)

```
GET /rest/scrobble.view?id=<songId>&submission=false   # "now playing" — session start
GET /rest/scrobble.view?id=<songId>&submission=true     # completed play (default if omitted)
```

`id` is repeatable for multiple simultaneous ids; `submission` defaults to
`true` when omitted, so **you must pass `submission=false` explicitly** to
get "now playing" behavior rather than an immediate completion. The Subsonic
spec's `time` parameter is accepted but not read: this server doesn't use it.

- **`submission=false`**: increments `play_count` (this is one of the two
  start-side call sites that moves the stat), opens/refreshes an `ACTIVE`
  session (`source: 'subsonic'`, keyed by `{userId}:{songId}`), and closes
  any other un-scrobbled session for the user. A client that skips a track
  without ever scrobbling its completion doesn't leak an orphaned session.
- **`submission=true`**: records the same "complete" rating signal as
  a `COMPLETED` report on `PUT /api/v1/play-sessions/{id}`, bumps `complete_count`, and closes the
  session as `COMPLETED` with `stop_reason: 'scrobbled'`.

Response is a bare success envelope (`<subsonic-response status="ok"/>` in
XML, or the JSON equivalent per your `f=` param); no scrobble-specific
payload.

### `reportPlayback.view` (OpenSubsonic extension)

A richer, single-endpoint alternative that also covers pause and position
updates:

```
GET /rest/reportPlayback.view?mediaId=<id>&mediaType=<type>&positionMs=<ms>&state=<state>[&ignoreScrobble=true]
```

| `state` | Effect |
|---|---|
| `starting` | `play_count` +1, opens/refreshes an `ACTIVE` session, closes any other un-stopped session for the user |
| `playing` | Refreshes the `ACTIVE` session's position; does **not** increment `play_count` again |
| `paused` | Marks the session `PAUSED` at the given position |
| `stopped` | Unless `ignoreScrobble=true`: records the completion signal (same as `scrobble.view submission=true`); always closes the session (`stop_reason: 'reportPlayback-stopped'`) |
| anything else | Treated as a keepalive; refreshes session presence without changing status |

`ignoreScrobble=true` on a `stopped` report is how you report "playback
ended" without it counting as a completed listen, useful for a genuine skip
where you don't want the completion/rating signal to fire.

Both `scrobble.view` and `reportPlayback.view` key their session by
`{userId}:{mediaId}`, so calls from either endpoint against the same track
operate on the same session row. You can, for example, start with
`reportPlayback.view?state=starting` and later finish with
`scrobble.view?submission=true`.

---

---

## Putting it together

**Native `/api/v1`:**

```text
GET  /api/v1/music/tracks/{id}                      → track detail
POST /api/v1/play-sessions   { mediaId, deviceId }   → delivery.url, grant, reporting
GET  <delivery.url>                                  → play the audio
PUT  <reporting.href>   { positionMs, status: "ACTIVE", eventSeq, sessionElapsedMs }   (every ~10 s)
PUT  <reporting.href>   { positionMs, status: "COMPLETED", endReason, eventSeq, sessionElapsedMs }

PUT  /api/v1/user/music/tracks/{id}/feedback         (explicit like or dislike)
POST /api/v1/play-sessions/replay                    (offline listens, later)
```

**OpenSubsonic (for Subsonic-family clients):**

```text
GET /rest/stream.view?id=…
GET /rest/reportPlayback.view?mediaId=…&positionMs=0&state=starting
GET /rest/reportPlayback.view?mediaId=…&positionMs=…&state=playing     (periodically)
GET /rest/reportPlayback.view?mediaId=…&positionMs=…&state=stopped
```

---

## See also

- [Building a player](/developers/building-a-player/): auth, error model,
  the generic play-sessions/watch-state contract, and everything shared with
  video playback
- [Connecting third-party apps](/using/third-party-players/#subsonic-music-clients):
  how end users point a Subsonic client at Lumastra
- [API & tokens](/developers/api/): scope taxonomy, PAT/service tokens,
  device flow
- [API reference](/reference/): interactive per-endpoint reference from the
  vendored OpenAPI spec

## Radio, autoplay and the music home

Recommendations are stateless: you say what is playing and what was played, the server answers what
to play next.

**Start a radio from a song.** Start the track (`POST /api/v1/play-sessions`), then call
`POST /api/v1/music/recommendations` with `{ "context": { "currentTrackId": "<id>", "startedBy": "user" } }`.
Queue `next` and offer `alternatives` (up to three) as "up next" choices; `next` is absent when nothing
fits. Each time a track starts, call again with `currentTrackId` set to it, `startedBy: "autoplay"`,
`history` (played ids, newest first), `skipped` and `exclude` (already queued). Lists hold up to 200 ids.
Send `crossfade: false` if your player hard-cuts.

An optional `seed` biases the radio: `{ "type": "mood", "mood": "chill" }` (keys from
`GET /api/v1/music/moods`), or a genre, artist or album seed. A mood seed without a playing track is a
cold start: `next` is the first track of that mood radio. Explicit likes go to
`PUT /api/v1/user/music/tracks/{id}/feedback`; skips never change them.

**Show a music home.** Every row is one call and every item carries `images.primary.href`:
recently played (`GET /api/v1/user/music/recently-played`), top artists
(`GET /api/v1/user/music/top-artists`), taste stations (`GET /api/v1/user/music/taste-stations`, then
`…/{id}/tracks`; a station id may be stored and answers `410` once it expired), sonic mixes
(`GET /api/v1/music/clusters`, then `…/{id}/tracks`, when `/server` reports
`capabilities.music.sonicMixes`), and "more like this" on any track, album or artist
(`GET /api/v1/music/{tracks|albums|artists}/{id}/similar`).

