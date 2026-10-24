---
title: Chapters, skip intro & trickplay
description: Configure metadata priority, playback analysis, and trickplay storage; troubleshoot missing results.
sidebar:
  order: 3.7
---

After matching files, background jobs merge provider metadata, generate AI embeddings,
and analyze chapters, intro/credits segments, and seek-preview thumbnails. Media files
are read only; results go to the database or separate thumbnail folders.

File scanning is covered in [Organizing your media](/guides/organizing-media/);
music has a [separate enrichment pipeline](/guides/organizing-music/#enrichment--analysis).

## Metadata sources & priority

Configure the provider order and per-field overrides in **Settings → Providers &
metadata**. Each field uses the first non-empty value; lower priority numbers win.

| Default priority | Source | Main contribution |
|---|---|---|
| 10 | **TMDB** | Titles, descriptions, artwork, cast, genres, certifications, and external IDs |
| 20 | **MDBList** | Additional ratings, streaming availability, and anime genres |
| 60 | **AniDB** | Alternative anime metadata, selectable per library path |
| 70 | **Jellyfin** | Library metadata when optional Jellyfin sync is configured |

Per-field overrides take precedence over anime-specific overrides, then provider
defaults. Anime's `imdb_rating` prefers MDBList over TMDB by default. MAL and AniList IDs
are attached through the scheduled [Fribb anime-lists](https://github.com/Fribb/anime-lists)
mapping sync, using the item's TMDB match.

When identifying a title manually, check its media type, poster, and year. Numeric
provider IDs can repeat across movies and series.

## Keeping metadata fresh

New provider data triggers a merge automatically. The admin UI records which provider
supplied each field.

| Source | Refresh behaviour |
|---|---|
| TMDB | Daily sync sweep; provider cache lasts 24 hours. Refreshes are batched and rate-limited. |
| MDBList | Batched ratings and keyword refresh, up to 200 TMDB IDs per request. |
| Jellyfin | Provider metadata refreshes with sync work. Optional watch-state push/pull tasks run every 5 minutes. |
| Seasons and episodes | Scan-driven; skips series synced within 6 hours unless new episodes appear. |

### Locked items are skipped by design

Editing a title locks it against later provider updates. Clear the lock or delete the
override to allow automatic updates. A forced **Sync metadata** overwrites locked items,
so make corrections after a forced sync.

## Images

Custom uploads take precedence over cached TMDB artwork, fresh TMDB lookup, and Jellyfin
fallback. Live TV can use custom logo URLs.

**Settings → Media & images** controls provider priority, episode/music overrides,
WebP/AVIF output, cache retention and size, local image patterns, and video-frame
extraction when episode artwork is missing.

Environment defaults are WebP and AVIF enabled (`IMAGE_AVIF_ENABLED=true`), thumbnail
quality `75`, full-image quality `85`, and cache retention `30` days
(`IMAGE_WEBP_ENABLED`, `IMAGE_THUMB_QUALITY`,
`IMAGE_FULL_QUALITY`, `IMAGE_CACHE_RETENTION_DAYS`).

## AI embeddings

Embeddings power similarity search, recommendations, and the AI assistant. They are
created during scans and provider syncs, or by running **Tasks → Overview →
`library-embeddings`**. Search doesn't generate them on demand.

Provider order is a custom OpenAI-compatible endpoint (`EMBEDDING_BASE_URL`), then
Voyage AI (`VOYAGE_API_KEY`), then OpenAI. See [AI environment variables](/reference/environment-variables/#ai).
OpenAI runs use its Batch API at 500 queued items, split into 8,000-item batches for
larger runs; smaller runs use the real-time API.

## Chapters

Chapter scanning is enabled per library path by default. It reads embedded markers,
falling back to Jellyfin chapters when sync is configured. Re-run it from the title's
admin page under **Maintenance → Media processing → Sync Chapters**.

Chapter names also support episode-title repair and segment detection.

## Skip intro & skip credits

The analyzer runs when files are added or changed and on a six-hour schedule by default.
It combines chapter-name matching, black-frame detection for credits, and audio
fingerprinting across episodes.

- Fingerprinting needs at least two episodes with files in the same season.
- Movies and single-episode seasons use chapter and black-frame detection only.
- Specials (season 0) are skipped.
- A stability delay allows imports to finish before analysis.
- Fingerprinting requires Chromaprint in `ffmpeg`, included in the official image.

On a title's admin page, **Maintenance → Media processing** contains segment analysis
and maintenance actions. Check the stated scope before running work for a whole
series. Detector thresholds are configured in the analyzer's admin settings.
When a file contains several episodes, distinguish file-relative timestamps from
episode-relative timestamps before adding or changing a segment.

| Variable | Default | Purpose |
|---|---|---|
| `PLUGIN_LUMASTRA_INTRO_ANALYZER_ENABLED` | `true` | Enable analysis |
| `PLUGIN_LUMASTRA_INTRO_ANALYZER_INTERVAL_HOURS` | `6` | Scheduled interval |
| `ANALYSIS_FFMPEG_THREADS` | `0` (auto) | Limit analysis threads |

## Trickplay (scrubbing-preview thumbnails)

Self-generation is off by default because it uses CPU and disk space. Enable
`TRICKPLAY_ENABLED` and generate trickplay under **Maintenance → Media processing**
on a title's admin page, or let
processing generate previews.

Lumastra writes WebP sprite sheets with a timestamp manifest. Reused Jellyfin sheets
need an inferred interval and can drift from the seek position.

### Storage

Central storage defaults to `/config/trickplay` and must be shared between the web and
worker containers. Alongside storage writes `.trickplay/` next to each video and needs
a writable media mount.

`TRICKPLAY_STORAGE_LOCATION` defaults to `inherit`, following
`METADATA_STORAGE_LOCATION`. Override it to `central`, `alongside`, or
`alongside-prefer` (try alongside, then central). Reads check both locations, so changing
the setting doesn't hide existing previews.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TRICKPLAY_ENABLED` | `false` | Enable generation |
| `TRICKPLAY_PROVIDER` | `prefer_local` | Local with Jellyfin fallback; alternatives: `local_only`, `jellyfin_disk` |
| `TRICKPLAY_STORAGE_PATH` | `/config/trickplay` | Central sprite directory |
| `TRICKPLAY_STORAGE_LOCATION` | `inherit` | Storage policy described above |
| `TRICKPLAY_INTERVAL_MS` | `10000` | Frame interval; smaller values use more disk |
| `TRICKPLAY_WIDTH` | `320` | Thumbnail width in pixels |
| `TRICKPLAY_QUALITY` | `80` | WebP quality |

`jellyfin_disk` reads Jellyfin sheets without generating local ones. Deleting sheets
allows them to be regenerated or re-read on the next analysis.

## Troubleshooting

| Symptom | Check |
|---|---|
| Stale metadata | Item lock and provider freshness; force **Sync metadata** if needed. |
| Missing Rotten Tomatoes, Letterboxd, or MAL score | `MDBLIST_API_KEY`; these scores have no TMDB fallback. |
| Missing anime MAL ID | TMDB match and scheduled Fribb mapping sync; the title may be absent from the mapping. |
| Missing similarity results | Embedding coverage in **Tasks → Pipeline**; backfill with `library-embeddings`. |
| Missing skip segments | Episode count, specials exclusion, analyzer status, and Chromaprint support. |
| Generated previews aren't served | Web and worker share the sprite storage; alongside mounts are writable. |

## Related guides

- [Optional integrations](/guides/integrations/)
- [Administering Lumastra](/guides/administration/)
- [Music discovery](/guides/music-discovery/)
