---
title: Building a player
description: >
  Start here for a native client or player against Lumastra's /api/v1 surface:
  device-flow auth, error model, server capabilities, catalog browsing, item
  detail, and the playback plan. Streaming, progress reporting, and events
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

The single source of truth for exact request/response shapes is the interactive
[**API reference**](/reference/) (vendored from the app's OpenAPI spec). Target
endpoints marked `x-stability: stable`. The field lists below name the ones a
player needs; treat the spec as authoritative for the rest.

## The model in one paragraph

**The server owns the playback decision.** Your client never inspects codecs and
builds an HLS URL itself. Instead it calls `GET /api/v1/playback/{id}/info`,
optionally advertising its device capabilities in a `?caps=` string, and receives
back a *plan*: whether the item is playable, the recommended play method
(`direct` / `remux` / `audio_transcode` / `full_transcode`), and **pre-built
URLs** for each method. You open the recommended URL, report progress, and the
server handles the transcoder's decisions. IDs are **UUID-first**: every entity
carries a canonical `id` (UUID) and an open `ids{}` map of external identifiers.

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
(`pat_…`) instead. Create it once in the Lumastra UI; it doesn't expire.

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
Each successful refresh returns a **new** `refresh_token` and supersedes the
presented one. It isn't revoked outright: the old token stays valid until its
own successor is used, so a retry inside that window (for example a response
your client never received) gets back the identical pair rather than an error.
Persist the new token anyway and prefer it going forward. Don't rely on the old
one continuing to work.
:::

### Conventions that apply everywhere

| Convention | Rule |
|---|---|
| IDs | `id` is the canonical UUID. Item routes also accept a composite key (`tmdb:603:movie`) or `?externalId=provider:id:type`. Use the UUID once you have it. |
| Media type | Canonical discriminator is `type`, a closed enum: `movie \| series \| season \| episode \| track \| album \| artist`. Legacy `tv`/`show` are retired. |
| Pagination | Collections return `{ items, page }`, `page = { limit, offset, hasMore, total? }`. Cursor-based endpoints replace `offset` with `cursor`. |
| Images | `images{}` hrefs follow `/api/v1/{entity}/{id}/images/{role}[/{index}]`; add `?width=600&format=webp` for sizing. |
| Errors | Every `/api/v1/*` error is `application/problem+json`. Switch on `code`, never `status` or `error` text. |
| Header-less bearer | Pass the token as `?api_key=<token>`, or for long content a stream-session `?stream_token=stream_…` (see [Streaming](/developers/building-a-player-streaming/)). |
| Time units | Every `/api/v1` time field is **milliseconds**. Jellyfin "ticks" (10,000,000 = 1 s) only appear on `/j`. |

## Errors

Every error from `/api/v1/*` is `application/problem+json`:

```jsonc
// 422 response body
{
  "code": "validation_failed",
  "error": "Request body failed validation",
  "status": 422,
  "details": [{ "field": "event_seq", "message": "must be a positive integer" }],
  "requestId": "req_abc123",   // optional
  "retryAfter": 30             // optional, seconds — also in Retry-After header
}
```

The `code`s a player actually branches on: `unauthorized`/`invalid_token` (401, sign in
again), `not_found` (404, which is also what a disabled feature returns, not `403`), and
`dependency_unavailable` (503, never a `200` with an empty array). See
[API & tokens → Errors](/developers/api/#errors-applicationproblemjson) for the full
closed taxonomy.

:::note[`/oauth/*` errors use a different shape]
`/oauth/device` and `/oauth/token` return RFC 8628 `{ error, error_description }`
with `Cache-Control: no-store`, **not** problem+json. See
[API & tokens](/developers/api/) for the full table.
:::

## Discover server capabilities

Call `GET /api/v1/server/capabilities` once on startup to learn what this instance
supports. The response is public and cached (`Cache-Control: public, max-age=60`).

```bash
curl https://lumastra.example.com/api/v1/server/capabilities \
  -H "Authorization: Bearer pat_your_token_here"
```

```jsonc
{
  "playback": { "direct": true, "remux": true, "transcode": true },
  "transcoder": { "output_video_codecs": ["h264", "hevc", "av1"], "max_resolution": "4K" },
  "streaming": { "hls_variants": ["360p", "480p", "720p", "1080p", "4K"] },
  "features": {
    "livetv": true, "watch_together": true, "device_auth": true,
    "video_previews": true, "top_shelf_previews": false,
    "media_download": false, "download_renditions": false
  },
  "events": { "url": "/api/v1/events", "reconnect_max_ms": 30000 }
}
```

Use `features.*` to conditionally enable UI elements. `media_download` and
`download_renditions` gate the two offline paths (both default off); see
[Offline downloads](/developers/offline-downloads/) for the capability-gating rule.

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

Fields a player cares about on a catalog row item: `id` (canonical UUID),
`ids` (open map, e.g. `imdb`/`tmdb`), `type`, `title`, `images`, `year`. Add
`?include=user` to any detail call to attach per-user watch state and rating.

:::caution[Gate "Play" on `hasFiles`]
Catalog items with no local file (discovery-only) carry `hasFiles: false`. Show a
**Request** affordance instead of a **Play** button. For episode lists the
equivalent field is `hasFile` on each row.
:::

Series traversal:

```
GET /api/v1/series/{id}/seasons          → { items, page } of seasons
GET /api/v1/series/{id}/episodes         → all episodes, across seasons
GET /api/v1/series/{id}/next-episode     → next unwatched episode (?season=N&episode=M: that episode)
GET /api/v1/series/{id}/watch-status     → aggregate watched/total
```

## Item detail

`GET /api/v1/media/{id}` is the canonical detail node for any playable item,
type-discriminated by the `type` field. It accepts the internal UUID or a
composite external key (`tmdb:603:movie`); add `?include=user,playback` for
per-user watch state and a playback hint.

```jsonc
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "movie",
  "ids": { "imdb": "tt0133093", "tmdb": "603" },
  "title": "The Matrix",
  "year": 1999,
  "hasFiles": true,
  "images": { "poster": { "href": "/api/v1/media/550e8400-…/images/poster" } }
}
```

A series node additionally embeds traversal links (`seasons`, `episodes`,
`nextEpisode`, `watchStatus` hrefs).

## Get the playback plan

Once you have an item with `hasFiles: true`, call the playback info endpoint.
This probes the local file, returns codec/track detail, and negotiates against
the capabilities you report.

```http
GET /api/v1/playback/{itemId}/info?caps=v:h264,hevc,av1;a:aac,ac3,eac3,opus,flac;c:mp4,m4v,mov,ts,mkv;h:hdr10,hlg,dovi
Authorization: Bearer <token>
```

The `caps` string is four optional sections joined by `;`:

| Prefix | What to list |
|---|---|
| `v:` | Video codecs your device can decode |
| `a:` | Audio codecs |
| `c:` | Container formats for direct play |
| `h:` | HDR formats (`hdr10`, `hlg`, `dovi`) |

Case-insensitive, max 500 chars. Omit `caps` and the server falls back to
conservative browser defaults; omit just `h:` and it assumes the OS compositor
tonemaps HDR. Advertising source codecs/containers is what enables **direct play**
over a transcode.

**The plan, abridged:**

```jsonc
{
  "recommended": "audio_transcode",
  "output_hdr": "hdr10",
  "resume_position_ms": 2760000,
  "duration_ms": 7200000,
  "tracks": { "video": { "codec": "hevc", "hdr": "hdr10" }, "audio": [ /* … */ ] },
  "play_methods": {
    "direct":          { "url": "…", "available": false },
    "audio_transcode": { "url": "…", "available": true }
  },
  "versions": [ { "id": "uuid", "label": "4K Director's Cut", "size_bytes": 48318382080 } ],
  "trickplay": { "width": 320, "height": 180, "interval": 10000 }
}
```

Key fields:

- **`recommended`**: use this method; fall back to the next `available` one.
- **`play_methods[recommended].url`**: use the pre-built URL directly.
- **`resume_position_ms`**: milliseconds, not ticks.
- **`versions[].size_bytes`**: on-disk size of that version's file, for showing
  *"Download (45 GB)"* before a user commits. Optional: absent means the file has
  not been scanned yet ("unknown", not zero). See
  [Offline downloads](/developers/offline-downloads/).

:::caution[Check `play_methods[method].available`]
Some methods may be unavailable: `audio_transcode`, for example, requires the
transcoder to be configured on the server. Always check `available` before using a URL.
:::

`output_hdr` tells you what the recommended method will actually *emit*;
`tracks.video.hdr` is the *source* format. Matching values mean HDR is preserved
(even across a transcode); a mismatch means the server tonemapped. Dolby Vision
**always** requires explicit `h:dovi` to avoid a transcode. Its metadata is
complex enough that guessing produces corrupted colors, so the server never
passes it through speculatively.

## Putting it together

```text
on startup    → GET /server/capabilities, GET /server/notice
authenticate  → OAuth device flow, open GET /api/v1/events (SSE)
browse        → continue-watching, trending, search, GET /media/{id}
decide        → GET /playback/{id}/info?caps=…
stream        → see Streaming a player  (§ next page)
track         → see Progress & state    (§ next page)
```

The two linked pages below cover the rest: stream tokens, progress heartbeats,
and the event stream.

## Next

- [Streaming a player](/developers/building-a-player-streaming/): stream
  tokens, opening HLS, seeking, tracks, and previews.
- [Progress & state](/developers/building-a-player-state/): play sessions,
  watch state, offline sync, and the live event stream.
- [Audiobook playback](/developers/audiobook-playback/): a different resume
  model for audiobooks.
- [Live TV playback](/developers/live-tv-playback/): the shared, capacity-limited
  live channel lifecycle.
