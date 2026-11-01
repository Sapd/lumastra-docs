---
title: Offline downloads
description: >
  Taking media offline from a native client: the original file, transcoded
  renditions at a chosen quality with size estimates, resumable transfers via
  ETag/If-Range, capability gating, and operator-side throughput and
  concurrency limits.
---

For a movie or episode, choose between the original physical file and a
server-encoded rendition. Both routes below use the `/api/v1` prefix:

| | **Original file** | **Rendition** |
|---|---|---|
| Endpoint | `GET /media/{id}/download` | `GET /media/{id}/renditions` → `POST` a rung → poll → download |
| What you get | The untouched source file, byte for byte | A newly encoded H.264/AAC MP4 at a quality you pick |
| Server work | Read and transfer the existing bytes | Encode and cache each requested quality |
| When to use it | The device can **direct play** the source | It cannot: 4K HEVC/TrueHD on a phone, say |
| Availability | `capabilities.features.mediaDownload` | `capabilities.features.downloadRenditions` |

Check that your local player can decode the original container, video and audio before
saving it. A rendition provides H.264 High, 8-bit SDR video and AAC-LC stereo audio in
MP4; a source without audio produces a video-only MP4. Test that combination on your
target device too. For music and audiobooks, use the [audio flows below](#music-and-audiobooks).

:::caution[Check server features and caller permissions]
Call authenticated `GET /api/v1/server` and check
`capabilities.features.mediaDownload` and `capabilities.features.downloadRenditions`.
The independent operator switches `FEATURE_MEDIA_DOWNLOAD` and
`FEATURE_DOWNLOAD_RENDITIONS` both default to false. Hide each unavailable action;
a disabled route answers `404`. Refresh discovery after sign-in or an account change.
There is no separate caller download feature flag: check your credential scopes and
handle the access result as well as the server switch.

The original-file, rendition list/create, status and rendition-file routes require
`media:read`. Probe also needs `media:read`; playback starts and playback-state sync
need `media:write`. Feature flags do not grant scopes or library access. Each request
checks the caller's access; inaccessible titles answer `404`.
:::

Choose a complete physical release with a `fileId` from playability. Save a file only
as the full release it is, never as part of an episode.

## Knowing the size before you commit

Show an exact size when known and label estimates explicitly. Unknown size is not zero;
your client must decide whether to ask the user or defer the transfer.

For the **original file**, each entry in `versions[]` from
`POST /api/v1/media/{id}/playability` carries `sizeBytes`, which is optional: absent
means the file has not been scanned yet, not zero. The old
`GET /api/v1/playback/{id}/info` has been removed and answers `410 route_retired`;
use the probe. For a **rendition**, the ladder endpoint below returns an estimate per quality
before anything has been encoded. `durationMs` is in milliseconds; `sizeBytes` and
`estimatedSizeBytes` are bytes. A ready rendition reports its actual `sizeBytes`.

For a successful full original/rendition byte response, `Content-Length` is the full
file length. For `206`, it is only that response's range length; read the full length
from `Content-Range`. The original-file route fails if it cannot obtain a usable file
size. These guarantees do not extend to live audio encodes or upstream audiobook
responses, where length can be unknown. An absent length needs indeterminate progress.

## The original file

```http
GET /api/v1/media/{id}/download
Authorization: Bearer <token>
```

Send `?fileId=<physical file UUID>` to pin the exact release the user chose. Omission
selects the default eligible complete file. An explicit invalid, foreign or grouped-part
`fileId` returns `404` on this route; it does not silently download another edition.
`mediaSourceId` belongs to the Jellyfin compatibility adapter and is not a v1 selector.
The response is
`Content-Disposition: attachment` with a filename rebuilt from catalog
metadata, for example `Example Series - S01E01 - First Episode.mkv`. The original
container and every embedded track remain unchanged. No play session or playback grant
is needed for this transfer, and fetching bytes does not record watching.

## Renditions

A rendition is one progressive MP4, at one quality, with at most one audio track.
HDR sources are tone-mapped to SDR. Subtitles and attachments are omitted; source
chapters are copied. For a silent source, `audioIndex` is null and `audioBitrate` is 0.
Renditions are shared: requests for the same file, rung and audio track join the same
encode and cached artifact. Access is checked separately for each caller.

### 1. List the qualities

```http
GET /api/v1/media/{id}/renditions?fileId=b5e72b98-2c43-4b7c-8d21-5ae7af7ca343&audioIndex=1
Authorization: Bearer <token>
```

Pass the physical `fileId` on both GET and POST. Check the listing's returned `fileId`
against your selection: the current rendition handlers can fall back to the default
complete file when an explicit selection no longer resolves. Stop and refresh
playability on a mismatch; never assume it encoded the requested edition. The POST
response does not echo `fileId`, so a file-selection change between listing and creation
cannot be verified from that response alone. Refresh rather than retrying a stale selector.

```json
{
  "fileId": "b5e72b98-2c43-4b7c-8d21-5ae7af7ca343",
  "durationMs": 300000,
  "sourceHeight": 720,
  "audioIndex": 1,
  "rungs": [
    { "id": "720p", "label": "720p", "height": 720,
      "videoBitrate": 2500000, "audioBitrate": 128000,
      "estimatedSizeBytes": 100521000, "status": "absent" },
    { "id": "540p", "label": "540p", "height": 540,
      "videoBitrate": 1200000, "audioBitrate": 128000,
      "estimatedSizeBytes": 50796000, "status": "absent" },
    { "id": "360p", "label": "360p", "height": 360,
      "videoBitrate": 600000, "audioBitrate": 96000,
      "estimatedSizeBytes": 26622000, "status": "absent" }
  ]
}
```

- `videoBitrate` and `audioBitrate` are **bits per second**. Estimates use their sum
  × duration ÷ 8, plus 2% container overhead. Actual encoded size can vary; do not treat
  an estimate as a hard storage bound. Unknown duration gives a null estimate.
- Rungs normally fit the source height. For a source shorter than 360 pixels the
  smallest rung is still offered and encoding keeps the source height. Unknown height
  offers the full ladder. Use returned rung IDs instead of assuming a fixed list.
- `status` is `absent` before a row exists, then `queued`, `encoding`, `ready` or
  `failed`. Existing rungs include `renditionId` and `progressPct`; ready ones can include
  `sizeBytes`.
- `audioIndex` is the **absolute** stream index (`tracks.audio[].absoluteIndex` in
  playability), not the display `index`. Omission selects the default audio track when
  audio exists; it does not request mute. Each audio selection has its own rendition.

### 2. Request one

```http
POST /api/v1/media/{id}/renditions
Authorization: Bearer <token>
Content-Type: application/json

{ "rung": "720p", "fileId": "b5e72b98-2c43-4b7c-8d21-5ae7af7ca343", "audioIndex": 1 }
```

```jsonc
// 202 Accepted — an encode started, or you joined one already running
{ "id": "4fea7c16-dd56-40a3-9a05-507e6494e089", "status": "queued", "progressPct": 0, "rungId": "720p", "audioIndex": 1 }
```

`200` means it was already built and is ready to download right now. The call
is **idempotent**: requesting the same quality again returns the existing
rendition rather than starting a second encode; requesting a `failed` one
retries it.

### 3. Poll, then download

```http
GET /api/v1/renditions/{renditionId}
Authorization: Bearer <token>
```

Automatic series-download candidates advertise `prepareRePostSeconds` on
`GET /api/v1/series/downloads/candidates`. For that pool workflow, a `queued`
preparation may need the original rendition POST repeated after that delay; polling
alone does not restart it. Retain the original request parameters and follow the
[API reference](/reference/) for the pool contract.

`url` appears only when `status` is `ready`. Don't construct it yourself from
the id. On `failed`, inspect `errorCode` (for example `encode_failed` or
`encode_stalled`) and offer a bounded retry by repeating the original POST. An encode
failure is a rendition state, distinct from an HTTP refusal of the POST.

```http
GET /api/v1/renditions/{renditionId}/file
Authorization: Bearer <token>
```

Served as an attachment named after the title with the quality appended:
`Example Series - S01E01 - First Episode (360p).mp4`.

## Resumable transfers

The original-file and rendition-file routes support a single byte range and return
`Accept-Ranges: bytes`, a strong `ETag` and normally `Last-Modified`. Save the ETag with
the partial file and send it back verbatim:

```http
GET /api/v1/renditions/{id}/file
Authorization: Bearer <token>
Range: bytes=10485760-
If-Range: "17b8824-19ff17949d5"
```

| What you sent | What you get |
|---|---|
| `Range` alone | `206` with `Content-Range` |
| `Range` + matching `If-Range` | `206`, resume proceeds |
| `Range` + stale `If-Range` | `200` with the whole file |
| `Range` past the end | `416` with `Content-Range: bytes */<size>` |

Only append a `206` whose `Content-Range` begins at the requested offset and whose
validator matches your saved representation. A `200` replaces the partial file in full.
For `416`, reconcile the reported length and validator before treating a local file as
complete. The ETag is derived from size and modification time; it is not a content hash.

Fence asynchronous completion locally too: associate each transfer with its media ID,
physical file ID, rendition/audio choice and a local attempt generation. A completion
from a cancelled or replaced attempt must not mark the current selection downloaded.
There is no download `generation` request parameter. A smart-pool rescore's `generation`
identifies a ranking snapshot, not the byte representation.

These URLs have no single-use token or fixed expiry. Every request needs the bearer
credential, scope and current title access. Refresh an expired access token and retry
the same URL with the saved `If-Range`. Playback `?grant=` credentials do not authorize
these download routes. A receiver that cannot send bearer headers cannot use them;
never give it your account token to work around that. Use the separate
[casting flow](/developers/building-a-player/#play-in-an-external-player-vlc-kodi-cast) for
network playback.

## Eviction, and why a URL can go 404

Finished renditions live in a cache with a byte budget, not an expiry: the
coldest artifacts are evicted, and eviction removes the rendition entirely.
Status polls and byte requests refresh its last-used time, reducing eviction risk;
this does not reserve the artifact. An evicted quality reads `absent` again and its file
URL answers `404`, including between a status poll and the next range request. Refresh
discovery/access and the ladder before requesting it again: `404` can also mean access
was revoked or the feature disabled. If still offered, POST to rebuild. Saved local bytes
remain local; cache eviction does not remove a completed device download.

## Concurrency and rate limits

A bounded worker pool limits active rendition encodes. Interactive POSTs omit `pool`
and are rate-limited per user. Automatic sweeps must send a nonempty `pool` lane name;
those POSTs instead face a per-user pending-preparation cap and global queue
backpressure. Either capacity check can return `503` with `Retry-After`. Interactive
requests bypass these pool checks, but still face validation and request-rate limits.
Back off according to the response rather than retrying a season in a tight loop.

An operator can also cap bandwidth per response, separately for downloads and
for transcoded streams. When a limit is set your transfer is just slower:
there's no header advertising it and nothing for a client to do differently.

For automatic series pools, `/api/v1/series/downloads/candidates` advertises
`maxConcurrentDownloads` (0 means start no byte transfers),
`maxConcurrentPreparations`, `prepareRePostSeconds` and `prepareQueueDepth`. Honor these
separately: preparing an encode is not a byte transfer. Other worker, queue, bandwidth
and cache settings remain operator configuration; see
[Integrations](/guides/integrations/).

### Handle refusals separately from encode failures

| Response | Client action |
|---|---|
| `401` (`unauthorized` / `invalid_token`) | Obtain a valid account credential, then retry. |
| `403 scope_required` | Request the required scope; repeated byte retries cannot fix it. |
| `404 not_found` | Refresh discovery, access and selection; it can also mean a disabled feature or evicted rendition. |
| `422 validation_failed` on rendition GET/POST | Inspect `details[].field`: a missing audio track, unknown rung or rung unavailable for the source needs a new selection. |
| `429 rate_limited` on interactive rendition POST | Wait for `Retry-After`, in seconds. The current limit is 60 requests per user per 60-second window. |
| `503 dependency_unavailable` | Back off; pool capacity refusals include `Retry-After`. A dependency failure may need server recovery. |

Read the problem response's `code` and structured details, rather than matching its
human-readable `error`. This download validation is separate from playback-start
refusals such as `source_incompatible`, `transcode_not_allowed` and `stream_limit`.
Do not silently fall back to an original file your device cannot decode.

## Subtitles

Renditions omit subtitle tracks. The original file retains embedded subtitles, but
external sidecars need their own download. Fetch the selected file's subtitle links
while online, store them with the media and render them locally. A playback start's
`delivery.subtitles[].hrefs` provides `text` (WebVTT), `raw` (original format) and, where
available, `rendered` links. Bitmap rendering may require a descriptor and image assets;
saving only a descriptor URL does not make it usable offline. ASS can need fonts. Prefer
a format your offline player actually renders; no rendition request burns subtitles in.

Issued subtitle URLs can carry session-bound grants. Complete those downloads before
closing the session or letting its grant expire, and never persist a remote URL as a
substitute for local subtitle bytes. See
[audio and subtitle tracks](/developers/building-a-player-streaming/#4-audio--subtitle-tracks).

## Music and audiobooks

| Kind | Download bytes | Record actual offline playback later |
|---|---|---|
| Movie / episode | Original or rendition routes above; no playback session required | `POST /api/v1/offline-playback-sessions` |
| Music | Bearer `GET /api/v1/music/tracks/{id}/stream?download=1` | `POST /api/v1/play-sessions/replay` |
| Audiobook | `POST /api/v1/play-sessions` with `audio: { "download": true }`, then its issued track URLs | `POST /api/v1/offline-playback-sessions` |

Music's transfer flag suppresses listening-session creation and leaves existing
listening sessions alone. For a complete file, omit `startPositionSeconds`. Optional
`format=mp3&bitrateKbps=128` selects an encode; `format=m4a` produces AAC in MP4 for
players that need that container. Raw `aac` is ADTS and may fail from disk on Apple
players. Audio bitrate controls are **kilobits per second**, unlike the video rendition
ladder's bits per second. Music's download route is separate from the two video download
switches; transcoding depends on the server's music-transcode feature. It can return
`429` with `Retry-After` (currently 300 download GETs per user per 600-second fixed window)
or capacity `503`. A live encode may not provide a final size or resumable bytes; do not
apply the video-file resume guarantee to every audio response. See
[Music playback](/developers/music-playback/) for negotiation and replay.

Audiobook download starts require `media:write` and require the user's AudiobookShelf
link. Save every required track, its book offset and duration; a book may have several
files. Follow issued URLs unchanged and inspect the delivery kind rather than assuming
one progressive file. A download start creates a **download session**, which is built for
long background transfers:

- Its grants last up to 7 days (see [Audiobook downloads](/developers/audiobook-playback/#audiobook-download-sessions)).
- It takes no stream slot, so it never blocks playback, and it does not supersede the
  user's listening sessions.
- It does not appear as playing, and it never writes a listening position.
- A user can hold only a limited number at once. A start over the cap answers
  `422 quota_exceeded` with `details.bucket = "audiobook_downloads"`.

Session termination revokes byte access. `castTarget: true` requests access from another
IP only when server policy allows it; the download flag itself grants no casting
permission. Send `castTarget: true` when another device, such as an Apple Watch, fetches
the files. See [Audiobook playback](/developers/audiobook-playback/) for session closure
and track clocks.

## Record playback, not transfers

Downloading bytes is not heard or watched time. When playing saved video or audiobooks
without a live session, retain a UUID `eventId` per playback stretch and upload up to 50
`sessions` to `/api/v1/offline-playback-sessions` with `media:write`. Records carry
`mediaId`, `startedAt`, `endedAt`, `positionMs`, `runtimeMs`, `sessionElapsedMs` and
`endReason` (`stopped` or `completion`), plus `knownAsOf` when tracked. Set `knownAsOf`
to when you last incorporated server state, so stale offline work cannot overwrite a
newer resume point from another device. All durations are milliseconds; active time excludes pauses and buffering. Positions for a combined
multi-episode physical file are file-absolute; the server applies episode windows.
Audiobook positions are book-absolute.

Use occurrence time, not upload time. Records older than 90 days or more than five
minutes in the future are refused individually. Follow each result's `retryable` flag;
`accepted` and `duplicate` are terminal. `applied: false` on an accepted record means it did not determine current resume
state, so re-read state rather than resubmitting it. Music uses replay
instead: `/offline-playback-sessions` rejects tracks as `unsupported_media_type`. Keep
actual online playback on its returned reporting contract; never send transfer progress
as listening. See [offline playback sync](/developers/building-a-player-state/#4-offline-playback-sync).

## Next

- [Music playback](/developers/music-playback/): the audio-only equivalent flow.
- [Audiobook playback](/developers/audiobook-playback/): offline sync for
  audiobooks specifically.
- [Integrations](/guides/integrations/): operator-side download and cache
  settings.
- [API reference](/reference/): hosted contract snapshot; use your instance's
  `/api-docs?format=yaml` for its installed release.
