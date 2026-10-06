---
title: Codec & client support
description: Which video, audio, container, and subtitle formats play directly on each client, and when Lumastra remuxes or transcodes.
sidebar:
  order: 2
---

Lumastra plays your files **directly** whenever the client can handle them, and only
**remuxes** (repackages the streams) or **transcodes** (re-encodes) when it has to.
The less transcoding, the lower the CPU/GPU cost and the better the quality, so it's
worth knowing what plays natively.

:::note[Capabilities are detected per client]
The tables below show *typical* support. Lumastra probes each client's actual
capabilities at playback time (via the browser's media APIs) and plans around what
that device reports, so a newer browser may direct-play more than the table suggests,
and an older one less.
:::

## How a file is delivered

Lumastra picks one of three delivery paths, in order:

| Path | Used by | Notes |
| ---- | ------- | ----- |
| **Direct file** | Any client, when the codec **and** container are supported | The raw file is streamed as-is: no processing. |
| **Native HLS** | **Safari only** | Safari's built-in player handles HEVC, AC-3/E-AC-3, and more than other browsers. |
| **MSE HLS** (hls.js) | Chrome, Firefox, Edge, … | The universal fallback; Lumastra remuxes or transcodes into it as needed. |

The server always prefers **direct file** when the file is fully compatible, then
native HLS, then MSE HLS. It isn't biased toward HLS for any browser.

:::note[Safari specifics]
Safari uses **direct play** whenever it can, and **Picture-in-Picture works on the
direct-play video**. It doesn't switch to HLS for PiP. The one exception is
**AirPlay**: when you cast to an Apple TV, the player switches to a tokenized HLS
stream so the Apple TV can fetch it.
:::

Legend for the tables: **✓** direct play · **R** remux (copied, no re-encode) · **T**
transcode (re-encoded) · **—** transcoded/unsupported.

## Video codecs

| Codec | Chrome / Edge | Firefox | Safari | Apple TV | Android TV |
| ----- | :-----------: | :-----: | :----: | :------: | :--------: |
| H.264 (8-bit) | ✓ | ✓ | ✓ | ✓ | ✓ |
| H.264 10-bit (Hi10P) | T | T | T | T | T |
| HEVC / H.265 | ✓¹ | ✓¹ | ✓ | ✓ | ✓ |
| VP9 | ✓ | ✓ | T | T | ✓ |
| AV1 | ✓² | ✓² | ✓ | T | ✓ |
| MPEG-2 / VC-1 / MPEG-4 | T | T | T | T | ✓³ |

¹ HEVC needs a recent browser **and** hardware decode support.<br />
² AV1 direct-plays from a file, but Lumastra disables AV1 over hls.js by default (a known parser bug), so AV1 may transcode on the web HLS path.<br />
³ Android TV / ExoPlayer direct-plays several legacy codecs others can't.

## Audio codecs

When an audio track can't be played, Lumastra transcodes **that track** to AAC
(stereo for browsers, up to 5.1 on Safari/Apple). Video is untouched.

| Codec | Chrome / Edge / Firefox | Safari / Apple | Android TV |
| ----- | :---------------------: | :------------: | :--------: |
| AAC, MP3 | ✓ | ✓ | ✓ |
| AC-3 (Dolby Digital), E-AC-3 (DD+) | T⁴ | ✓ | ✓ |
| FLAC | ✓ (direct file) / T (HLS) | T | ✓ |
| Opus | ✓ | T | ✓ |
| ALAC | T | ✓ | ✓ |
| DTS, DTS-HD, TrueHD / Atmos, PCM, Vorbis | T | T | ✓⁵ |

⁴ AC-3/E-AC-3 copy fine on Safari's native HLS and on direct file, but transcode to AAC on the web (MSE HLS) path.<br />
⁵ Android TV's profile passes through DTS/TrueHD.

## Containers

| Container | Result |
| --------- | ------ |
| MP4 / M4V / MOV | ✓ direct file |
| MKV / Matroska | R: remuxed (streams copied into HLS, no re-encode) |
| WebM | ✓ on Chrome/Firefox · remux on Safari |
| MPEG-TS / M2TS | Served via HLS |
| AVI | R / T: remux or transcode |

A container that isn't directly playable only needs a **remux** (cheap) as long as
its codecs are supported. Re-encoding is only triggered by an unsupported codec.

## HDR

| Source | DV-capable (Safari, Apple TV) | HDR10-capable (Chrome / Edge) | No HDR (Firefox, SDR screens) |
| ------ | :---------------------------: | :---------------------------: | :---------------------------: |
| SDR | ✓ | ✓ | ✓ |
| HDR10 / HLG | ✓ pass-through | ✓ pass-through | Tone-mapped to SDR |
| Dolby Vision (Profile 8) | ✓ pass-through (full DV) | Transcoded to **HDR10**¹ | Tone-mapped to SDR |
| Dolby Vision (Profile 5/7) | ✓ pass-through (full DV) | Tone-mapped to SDR | Tone-mapped to SDR |

¹ Profile 8 Dolby Vision carries an HDR10 base layer. When Lumastra has to transcode
it for an HDR-capable (but not DV) client, it keeps the picture in HDR: it outputs
HDR10 (or HLG) and copies the mastering metadata, instead of flattening it to SDR.
Many servers tone-map all Dolby Vision to SDR on transcode; Lumastra preserves HDR10
here by default (`ENABLE_HDR10_PRESERVATION`, default on). Profile 5/7 has no HDR10
base layer, so it tone-maps to SDR for non-DV clients.

When a client can't display the source HDR, Lumastra **tone-maps to SDR** during
transcode (curve set by `TONEMAPPING_ALGORITHM`, default `bt2390`). Direct play and
remux always preserve the source HDR untouched, including full Dolby Vision.

## Subtitles

Most subtitle formats render **without burning into the video**. Text formats use the
native player, and image formats (PGS, VobSub) and styled ASS/SSA render client-side
via WebAssembly. Only two formats force a burn-in (which forces a video transcode):

| Format | Rendering |
| ------ | --------- |
| SRT / SubRip, WebVTT, MOV_TEXT, TTML | Native text track |
| ASS / SSA | Client-side (JASSUB) |
| PGS, VobSub / DVD | Client-side (libbitsub) |
| **DVB-sub, XSUB** | **Burned in (server-side): forces a video transcode** |

## The decision, step by step

For a given file and client, Lumastra decides in this order:

1. **Dolby Vision** on a non-DV client → full transcode (tone-map).
2. **Video codec unsupported**, or a constraint (level, profile, resolution, bitrate)
   exceeded → full transcode.
3. **Audio** has too many channels, or no compatible track → transcode the audio.
4. **Container** unsupported but codecs are fine → remux.
5. Multiple audio tracks the client can't switch between in direct file → remux.
6. Everything supported → **direct play**.

When transcoding video, Lumastra prefers hardware encoders (AV1 → HEVC → H.264) and
falls back to software (H.264 first for speed); audio always transcodes to AAC.

## Get the most direct play

For the widest direct-play across clients, prefer:

- **Video:** H.264 (8-bit) or HEVC
- **Audio:** AAC (or AC-3 if your clients are mostly Apple)
- **Container:** MP4

That combination direct-plays on essentially every client with zero transcoding.

## Music

Standalone **music** playback (`/api/music`, `/api/v1/music`, and the
Subsonic-compatible `/subsonic` surface) is a separate delivery path from video, with
its own decision logic and codec matrix.

**Direct play is the default for music too.** A track only gets transcoded when one
of these applies:

- The client requests a `format` that differs from the source container.
- A `maxBitRate` is requested and the source exceeds it.
- Playback starts at a `timeOffset` (a seek before the stream begins).
- The client is an OpenSubsonic app that negotiated a transcode through the
  `transcoding`/`transcodeOffset` extensions (see the [API reference](/developers/api/)).

Requesting `format=raw` skips transcoding entirely and goes straight to direct
play, but only after authentication, the track/access lookup, and path resolution
have already run. It doesn't bypass those.

| Codec | Container | Bitrate ladder (kbps)           | Default |
| ----- | --------- | -------------------------------- | ------- |
| MP3   | MPEG      | 64, 96, 128, 160, 192, 256, 320  | 192     |
| Opus  | Ogg       | 32, 48, 64, 96, 128, 160, 192    | 128     |
| AAC   | ADTS      | 64, 96, 128, 160, 192, 256, 320  | 192     |

:::note[A seek always forces a transcode]
A `timeOffset > 0` against an already-cached file re-encodes from that point rather
than slicing raw bytes. Raw byte offsets aren't decoder-safe for Opus or MP3/ADTS
streams, so the server can't just jump ahead in the file without re-encoding.
:::

## Next

- [Playback decisions](/architecture/playback-decisions/): how the delivery path and method are chosen
- [Hardware (GPU) transcoding](/guides/gpu-transcoding/): offload transcoding to a GPU
- [Live TV](/architecture/live-tv/): codec handling for live streams
