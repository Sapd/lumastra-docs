---
title: Music playback
description: >
  Register a music play session from a third-party client: stream a track,
  open a music session, heartbeat progress, send like/skip/complete feedback,
  and the OpenSubsonic scrobble/reportPlayback alternative.
sidebar:
  order: 2.65
---

A native client plays music through Lumastra's versioned **`/api/v1`** surface,
the same one used in [Building a player](/developers/building-a-player/). If you're reusing an existing
Subsonic-family music app instead, skip to
[OpenSubsonic clients](#6-opensubsonic-clients): that's a separate protocol,
not part of `/api/v1`.

:::note[Stability]
Every endpoint in this guide is tagged `x-stability: beta` in the
[API reference](/reference/). The shapes below are correct as of this
writing, but treat them as more likely to change than the `stable` VOD
endpoints in [Building a player](/developers/building-a-player/).
:::

## The model in one paragraph

A music session is lighter-weight than a video play-session: no playback
planner, no HLS negotiation, no codec caps string. You stream the track
directly, open a session that tracks *position and lifecycle* (playing /
paused / stopped), and heartbeat it periodically. **Session heartbeats alone
do not drive recommendations or the play-count stat.** Those are separate,
explicit signals (`like`, `dislike`, `skip`, `complete`) you send once per
track, independent of the heartbeat loop. Read [Recommendation signals vs
lifecycle tracking](#4-recommendation-signals-vs-lifecycle-tracking) before
you decide which calls your client needs.

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
start the next track a little before the current one ends.

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

## 2. Open a music session

:::note[Starting a track already opened a playback session]
The `POST /api/v1/play-sessions` call in §1 creates the playback session and returns
`reporting.href` for progress. The music-specific session endpoints in this section
and §3 are the lighter alternative described in §5.
:::

```bash
curl -X POST https://lumastra.example.com/api/v1/music/sessions \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{ "trackId": "550e8400-e29b-41d4-a716-446655440000", "deviceId": "my-player-uuid" }'
```

```jsonc
// 201 Created + Location: /api/v1/music/sessions/{sessionId}
{ "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

`trackId` and `deviceId` are required. Optional `clientFeatures` advertises
admin-action support, such as `admin_message` and `maintenance_notice`. The server checks library and
age-rating access on `trackId` the same way any playback route does, and
returns `404` if the track isn't accessible. There's no separate feature flag
gating this endpoint, unlike some other music subsystems (clustering or
lyrics search, for example): this session/interaction surface is always on
for accessible tracks.

Before calling any of these endpoints, check `capabilities.features.music`
from `GET /api/v1/server/capabilities`. It's `true` only when the server has
at least one enabled music library. Don't confuse it with the neighboring
`features.music_clustering`, which gates an unrelated recommendation feature
(Quick Picks taste clustering) and says nothing about whether music exists on
the server.

Opening a new session for the same `(user, deviceId)` **automatically closes
any prior session on that device** (`stop_reason: 'track_change'`). You don't
need to end the previous track's session before starting the next one, though
sending a final `COMPLETED` heartbeat first is still good practice so the
position/timing lands correctly.

**Auth note:** this endpoint only requires *any* authenticated principal
(`{kind:'user'}`: session cookie, PAT, device JWT, or service token). No
particular PAT scope is checked. That's narrower than the generic
`/api/v1/play-sessions` endpoint covered in
[§5](#5-alternative-the-generic-play-sessions-endpoint), which requires the
`media:write` scope. A PAT scoped to nothing but `media:read` can drive the
whole music-session and track-interaction flow in this guide, but can't use
the generic play-sessions path.

---

## 3. Heartbeat progress

```bash
curl -X PUT https://lumastra.example.com/api/v1/music/sessions/{sessionId} \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{ "positionMs": 42000, "status": "ACTIVE" }'
# → 204 No Content
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `positionMs` | integer ≥ 0 | yes | Current playback position, milliseconds |
| `status` | `ACTIVE` \| `PAUSED` \| `COMPLETED` | yes | |
| `nextTrackId` | UUID | no | See [queue prefetch](#queue-prefetch-nexttrackid) below |

An optional `crossfade` object carries `otherTrackId`, `role` (`incoming` or
`outgoing`), `remainingMs` and `durationMs` for Active Streams. Send `null` to
clear it; omitting it leaves it unchanged. Use `status` to report whether music
is playing.

Send heartbeats every **~10 seconds** while `ACTIVE`. On pause, send one
`status: "PAUSED"` heartbeat rather than stopping the heartbeat loop
entirely: a `PAUSED` session gets a 30-minute reap grace period, while a
session that just stops heartbeating without transitioning to `PAUSED` falls
back to a 5-minute window before the server reaps it.

On track end, send a final heartbeat with `status: "COMPLETED"`. This sets
`stopped_at` and closes the session. There is no separate "stop" or "delete
session" endpoint.

**Ownership is enforced**: the update is scoped to the session's owning
`user_id` server-side, so one user's bearer token cannot heartbeat another
user's session id (a mismatched or unknown id both return `404`).

### Rate limit

`PUT .../sessions/{id}` and `POST .../sessions/{id}/beacon` share one budget:
**30 requests / 60 seconds**, keyed per user, not per session. Run multiple
concurrent sessions on one account (two devices, say), and they compete for
the same 30-request window. A 10-second heartbeat cadence per device uses 6
requests/minute, comfortably under the limit for a couple of concurrent
devices. Exceeding it returns `429` with a `Retry-After` header.

### Beacon variant

For contexts where you can't issue a normal `PUT` (page/app teardown, tab
close), use the beacon alias, compatible with `navigator.sendBeacon`:

```javascript
navigator.sendBeacon(
  `/api/v1/music/sessions/${sessionId}/beacon`,
  new Blob([JSON.stringify({ positionMs, status: 'PAUSED' })], { type: 'application/json' }),
);
```

Same body schema, same response (`204`), same shared rate-limit bucket as the
PUT above.

### Queue prefetch: `nextTrackId`

If you send `nextTrackId` on a heartbeat, the server caches it against the
session (a few minutes, in Valkey) as a hint for what plays next. This is
useful if your client wants to warm the server's queue/recommendation state
before the track actually changes. It's purely a hint with no required use;
omitting it changes nothing about playback. Sending a final `COMPLETED`
heartbeat with no `nextTrackId` clears the hint.

---

## 4. Recommendation signals vs. lifecycle tracking

This is the part most third-party integrations get wrong: **the session
endpoints in §2–§3 never touch `play_count`, ratings, or the
recommendation/skip signal.** They exist purely to track *where the user is*
(for resume, "currently listening" UI, active-session lists), scoped to
*position*, not *taste*.

Taste/engagement signals are four separate, explicit calls, all scoped to the
track (not the session):

```http
POST   /api/v1/music/tracks/{id}/complete   → 204
POST   /api/v1/music/tracks/{id}/skip       → 204
POST   /api/v1/music/tracks/{id}/like       → 204   (DELETE to unlike)
POST   /api/v1/music/tracks/{id}/dislike    → 204   (DELETE to undislike)
```

No request body is required on any of them (`complete`/`skip` accept
optional, currently-unused `sessionId`/`positionMs` fields for future use:
send them or not, they have no effect today). All four use `{kind:'user'}`
auth like the session endpoints, return `404` when the track isn't
accessible, and `401` when unauthenticated. None of them are rate-limited.

Internally these write a single 0–10 `rating` value per `(user, track)`, with
`like`/`dislike` as hard-pinned endpoints and `complete`/`skip` nudging an
*implicit* score toward or away from them:

| Call | Effect |
|---|---|
| `like` | Rating pinned to **9** (or raised to at least 9 if already higher via a prior `like`) |
| `dislike` | Rating pinned to **2** (or lowered to at most 2) |
| `complete` | First call sets rating to **6**; later calls nudge it up by 1, capped at **8**; never overrides an existing `like` |
| `skip` | First call sets rating to **4**; later calls nudge it down by 1, floored at **3**; never overrides an existing `dislike` |

A rating ≥ 9 reads back as "liked", ≤ 2 as "disliked", so the implicit
signals from `complete`/`skip` alone can never *become* a like or dislike:
only the explicit endpoints can cross those thresholds. Call `complete` when
a track finishes naturally and `skip` when the user skips before it ends.
Reserve `like`/`dislike` for an explicit thumbs-up/down UI action; a string
of skips won't silently "dislike" a track the user never actually rejected.

:::caution[`complete`/`skip` don't check how much was actually played]
Unlike the generic play-sessions path (§5, which applies a 90%-of-duration
completion threshold), `/music/tracks/{id}/complete` takes your client's word
for it. Call it only when the track has actually finished, not on every
heartbeat or every few seconds of playback.
:::

`play_count` is **not** touched by anything in §2–§3 either. It has its own
lane, described next.

---

## 4b. Play counting: `/music/progress/start` and `/music/progress/end`

`play_count`, `total_listen_ms` and the listen history come from a pair of
calls that are separate from both the session endpoints and the taste
signals above. They are public on `/api/v1` and available to any client:
this is the same lane Lumastra's own players use.

```http
POST /api/v1/music/progress/start   { "trackId": "…", "playContext": "queue" }
POST /api/v1/music/progress/end     { "trackId": "…", "listenedMs": …, "startedAt": "…", "wasSkipped": false, … }
```

`start` is what increments `play_count`. `end` records the listen itself
(duration, completion, skip) and feeds the rotation lane's ranking, the
taste stations and top-tracks.

### Always send an `eventId`

`end` is at-least-once without one. You cannot tell a lost request from a
lost response, so your only safe move on a timeout is to resend. Without an
idempotency key, every resend appends a second listen event **and**
increments `play_count` again.

```jsonc
{
  "trackId": "…",
  "eventId": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",  // one UUID per PLAY
  "listenedMs": 213000,
  "startedAt": "2026-08-17T08:00:00Z",
  "durationMs": 217000,
  "wasSkipped": false
}
```

Mint it **when the play starts**, alongside your `startedAt`, and keep it for
every retry of that play. A key generated per attempt is a fresh key each
time, which is the same as having none.

The key is scoped to `(user, eventId, trackId)`, so a genuine retry collapses
to one row while two different tracks that happen to share an id are both
recorded. Reusing one id across tracks is still a client bug; don't rely on
this. It now costs you nothing rather than silently dropping a play.

### `startReported`: when the start never landed

`start` is what counts the play, so if it never reached the server (offline,
a failed request) the `end` report is the only evidence the play happened.
Tell the server:

```jsonc
{ "trackId": "…", "eventId": "…", "startReported": false, /* … */ }
```

and it counts the play at the end instead. Omit the field if you can't tell:
the server then assumes the start landed, which under-counts rather than
inflating. Only send `false` when you actually know.

### Flushing a backlog: `/music/progress/end/batch`

For listening that happened offline, submit the queue in one call rather
than looping the single-event endpoint. It reports **per-event** outcomes
instead of failing the whole flush on one bad record:

```http
POST /api/v1/music/progress/end/batch   { "events": [ … ] }
```

Each result carries `retryable`, and that flag is the contract: keep the
event queued when it's `true`, and drop it only on a terminal result. The
same asymmetry as the video/audiobook lane applies here. Keeping a doomed
event wastes a batch slot; dropping a transient one destroys listening that
was still recoverable.

Music is **not** accepted by
[`/offline-playback-sessions`](/developers/building-a-player-state/#4-offline-playback-sync):
that endpoint answers `unsupported_media_type` for a track. This batch
endpoint is the music equivalent.

---

## 5. Alternative: the generic `/play-sessions` endpoint

The endpoints above are music-specific, but Lumastra's shared,
media-type-agnostic session API, documented in full in [Building a player:
State §1](/developers/building-a-player-state/#1-report-progress), also
accepts music tracks as `mediaId` and is the call that starts a track (§1). Trade-offs versus `/music/sessions`:

| | `/api/v1/music/sessions` | `/api/v1/play-sessions` |
|---|---|---|
| Auth | Any authenticated principal | Bearer scope `media:write` required |
| Request fields | `trackId`, `deviceId` only | Full device/client/capability metadata |
| Returns the stream URL and grant | No | Yes, in the `201` response (`delivery.url`, `grant`) |
| Rate limit | 30/60s (PUT + beacon shared) | None enforced |
| `event_seq` required on heartbeats | No | Yes; monotonic counter, server rejects non-increasing values |
| Drives `play_count` | No | Indirectly, see below |
| Writes durable watch-state (`wrote_to_durable`) | N/A | Always `false` for music (`media_type` `track`/`audio` is explicitly excluded from the durable watch-state write path) |

On the generic path, when a session for a music track ends, the server
applies a **90%-of-duration completion threshold**
(`listenedMs ≥ 0.9 × durationMs`) to decide whether the play counts as
"completed" for `complete_count`. This is the one path in the whole music
surface where the server judges completion by actual listened time rather
than trusting the client's say-so. It still doesn't touch `play_count` on an
already-existing `(user, track)` row: only a first-ever end-event with no
prior recorded start can seed it, which means `play_count` primarily still
comes from a start-side call (Lumastra's own player, or Subsonic below).

Use this path if you want the ready stream URL and its grant bundled into session
start, richer device/capability reporting, or you're already sharing session code
with a video-playing client. Use `/music/sessions` if you want the simplest
possible integration and don't need those extras.

---

## 6. OpenSubsonic clients

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
  `/music/tracks/{id}/complete` in §4, bumps `complete_count`, and closes the
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

## Putting it together

**Native `/api/v1` (simplest path):**

```text
GET  /api/v1/music/tracks/{id}                     → track detail
GET  /api/v1/music/tracks/{id}/stream               → play the audio

POST /api/v1/music/sessions        { trackId, deviceId }   → sessionId
PUT  /api/v1/music/sessions/{id}   { positionMs, status }   (every ~10 s)
PUT  /api/v1/music/sessions/{id}   { positionMs, status: "COMPLETED" }

POST /api/v1/music/tracks/{id}/complete     (track finished naturally)
  — or —
POST /api/v1/music/tracks/{id}/skip         (user skipped early)
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
