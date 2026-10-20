---
title: Offline downloads
description: >
  Taking media offline from a native client: the original file, transcoded
  renditions at a chosen quality with size estimates, resumable transfers via
  ETag/If-Range, capability gating, and operator-side throughput and
  concurrency limits.
---

There are two ways to put a title on a device for offline playback, and a
client usually needs both:

| | **Original file** | **Rendition** |
|---|---|---|
| Endpoint | `GET /media/{id}/download` | `POST /media/{id}/renditions` → poll → download |
| What you get | The untouched source file, byte for byte | A newly encoded H.264/AAC MP4 at a quality you pick |
| Cost to the server | None: it streams bytes that already exist | CPU-minutes and gigabytes of cache per quality |
| When to use it | The device can **direct play** the source | It cannot: 4K HEVC/TrueHD on a phone, say |
| Availability | `features.media_download` | `features.download_renditions` |

Downloading a source the device cannot decode leaves the user with an
unplayable multi-gigabyte file. That's the failure this whole surface exists
to prevent.

:::caution[Gate on capabilities, not on optimism]
Both features are **off by default**; turning them on is a self-hoster's
decision, since raw file egress and per-user transcoding cost real bandwidth
and CPU. Check `GET /api/v1/server/capabilities` once at startup and hide the
affordance when the flag is false. A disabled feature answers **404**, the
same as a missing item.
:::

## Knowing the size before you commit

Every download decision the user makes is really a decision about bytes on a
metered connection, so both paths tell you the size up front.

For the **original file**, each entry in `versions[]` from
`GET /api/v1/playback/{id}/info` carries `size_bytes`, which is optional:
absent means the file has not been scanned yet, not zero. For a
**rendition**, the ladder endpoint below returns an estimate per quality
before anything has been encoded.

## The original file

```http
GET /api/v1/media/{id}/download
Authorization: Bearer <token>
```

`media:read` scope. Optional `?mediaSourceId=` selects a specific edition; it
defaults to the item's default file. The response is
`Content-Disposition: attachment` with a filename rebuilt from catalog
metadata (`Series - S01E19 - Title.mkv`), not the on-disk filename.

## Renditions

A **rendition** is a server-produced progressive MP4 of one title, at one
quality, with at most one audio track: a single file you can save, not HLS. It
is always **H.264 High 8-bit video in MP4**, whatever the source was: the
artifact has to decode on the device offline, with no server left to fall back
to, so it gets the one video combination that plays everywhere. Audio is
**AAC-LC stereo when the source has an audio track**. A source with no audio
stream is encoded video-only (`-an`), and its `audio_bitrate` in the ladder
response reports `0` rather than a stereo AAC estimate. HDR sources are
tone-mapped to SDR during the encode. Renditions are **shared, not per-user**:
the artifact for a given (file, quality, audio track) is identical no matter
who asked, so two users requesting the same thing share one encode.

### 1. List the qualities

```http
GET /api/v1/media/{id}/renditions?audioIndex=1
Authorization: Bearer <token>
```

```jsonc
{
  "file_id": "b5e72b98-…", "duration_ms": 300576, "source_height": 1080, "audio_index": 1,
  "rungs": [
    { "id": "1080p", "height": 1080, "estimated_size_bytes": 159425510, "status": "absent" },
    { "id": "720p",  "height": 720,  "estimated_size_bytes": 100714000, "status": "absent" },
    { "id": "540p",  "height": 540,  "estimated_size_bytes": 50893528,  "status": "ready",
      "rendition_id": "4fea7c16-…", "progress_pct": 100, "size_bytes": 50102314 }
  ]
}
```

- **`estimated_size_bytes`** is bitrate × duration plus container overhead.
  It's enough for a picker row reading *"720p · ~1.4 GB"*, within roughly ±10%
  of the finished file. `null` when the source duration is unknown.
- **`status`** is `absent` until something has been built for that quality;
  after that it mirrors the rendition (`queued` → `encoding` → `ready`, or
  `failed`).
- The ladder never offers a quality above the source height.
- **`audio_index`** is the **absolute** stream index, not the display index.
  It's the same `absoluteIndex` value `playback/{id}/info` gives per audio
  track. Renditions are keyed on (file, quality, audio track).

### 2. Request one

```http
POST /api/v1/media/{id}/renditions
Content-Type: application/json

{ "rung": "720p", "audioIndex": 1 }
```

```jsonc
// 202 Accepted — an encode started, or you joined one already running
{ "id": "4fea7c16-…", "status": "queued", "progress_pct": 0, "rung_id": "720p" }
```

`200` means it was already built and is ready to download right now. The call
is **idempotent**: requesting the same quality again returns the existing
rendition rather than starting a second encode; requesting a `failed` one
retries it.

### 3. Poll, then download

```http
GET /api/v1/renditions/{renditionId}
```

`url` appears only when `status` is `ready`. Don't construct it yourself from
the id: an encode is only named once complete. On `failed`, `error_code` says
why; POST the rendition again to retry.

```http
GET /api/v1/renditions/{renditionId}/file
Authorization: Bearer <token>
```

Served as an attachment named after the title with the quality appended:
`Leo the Truck - S01E19 - Roller (360p).mp4`.

## Resumable transfers

Both download endpoints support byte-range resume with a strong `ETag`:

```http
GET /api/v1/renditions/{id}/file
Range: bytes=10485760-
If-Range: "17b8824-19ff17949d5"
```

| What you sent | What you get |
|---|---|
| `Range` alone | `206` with `Content-Range` |
| `Range` + matching `If-Range` | `206`, resume proceeds |
| `Range` + stale `If-Range` | `200` with the whole file |
| `Range` past the end | `416` with `Content-Range: bytes */<size>` |

A stale `If-Range` means the file changed since you started. The server
refuses a partial you'd splice onto stale bytes, so discard what you have and
take the full response. This is the contract `URLSessionDownloadTask` resume
data relies on; nothing here is single-use in the URL, so a transfer that
outlives its access token can be retried against the same URL with a freshly
minted bearer token.

## Eviction, and why a URL can go 404

Finished renditions live in a cache with a byte budget, not an expiry: the
coldest artifacts are evicted, and eviction removes the rendition entirely.
Every status poll and byte range you fetch marks a rendition as recently used,
so something you're actively downloading won't be evicted underneath you, but
a rendition downloaded weeks ago may be gone: its quality reads `absent` again
and its file URL answers `404`. Treat that `404` as "ask for it again" (a
`POST` re-encodes it), not as an error. That includes mid-transfer: an
artifact evicted between your status poll and byte request answers `404`
rather than a `5xx`.

## Concurrency and rate limits

Renditions are built by a bounded worker pool, so operator-side settings cap
how many encodes run at once and how many a single user can have in flight or
queued. An interactive `POST /media/{id}/renditions` (a person tapping
Download) is metered per user. Exceeding it returns **429** with
`Retry-After`, sized so a person queueing a season by hand never reaches it.
Unattended, larger sweeps
(a season or series downloaded in bulk) are instead subject to a per-user
preparation cap and to global encode-queue backpressure, answering **503**
with `Retry-After` when the server is saturated. A human tap is always
admitted; an unattended sweep backs off. Treat both as "come back later," not
as failure.

An operator can also cap bandwidth per response, separately for downloads and
for transcoded streams. When a limit is set your transfer is just slower:
there's no header advertising it and nothing for a client to do differently.

:::note[These are operator-configured, not client-visible]
The concurrency, queue, and cache-size settings above live in server
configuration (env vars), not in the client-facing API. A client only ever
sees their effects (`429`/`503`, or a slower transfer), never the numbers
themselves. Self-hosters configure them in
[Integrations](/guides/integrations/).
:::

## Subtitles

Renditions do **not** have subtitles burned in, and carry only the one audio
track you asked for. Subtitles stay sidecar files: fetch them from
`delivery.subtitles[].hrefs` from the playback start response, or the subtitle endpoints in
[Streaming a player](/developers/building-a-player-streaming/#4-audio--subtitle-tracks),
store them next to the media, and render them client-side.

## Next

- [Music playback](/developers/music-playback/): the audio-only equivalent flow.
- [Audiobook playback](/developers/audiobook-playback/): offline sync for
  audiobooks specifically.
- [Integrations](/guides/integrations/): operator-side download and cache
  settings.
- [API reference](/reference/): exact request/response shapes.
