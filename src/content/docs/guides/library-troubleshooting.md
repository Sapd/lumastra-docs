---
title: Library problems on the admin home
description: >
  What each library and file item on the admin home means, how to check it in a
  few commands, which causes are real and which are noise, and how to clear it.
---

The admin home (**Admin**) lists what needs your attention. Most library items there
have a handful of known causes, and several of them are not problems with your media
at all. Each recipe below goes from what you see, to what to check, to the cause, to
the fix.

The checks use three tools:

- `psql` on the Lumastra database (read-only queries are enough).
- `ffprobe` from the same FFmpeg build Lumastra uses, run where the media is mounted.
- The admin API, with an admin session or an admin token (`Authorization: Bearer …`).

For task failures in general (stuck items, queues that won't drain), see
[Troubleshooting the task system](/guides/task-troubleshooting/).

## "N media files have health problems"

The item counts files whose `media_files.health_issues` is not empty. It links to
**System → Health → Files**. Group them by issue type first:

```sql
SELECT e->>'type' AS issue, count(*)
FROM media_files mf, jsonb_array_elements(mf.health_issues) e
WHERE jsonb_typeof(mf.health_issues) = 'array'
GROUP BY 1 ORDER BY 2 DESC;
```

Then follow the recipe for each type.

### `truncated_video` or `video_ends_early`: is the file really cut off?

Both say the video stops before the duration the container header claims. That has
three different causes, and only two of them mean the file is damaged. Read the end of
the video and the audio stream (one seek each, fast even on large files):

```bash
f="/media/movies/Example Film (2001)/Example Film (2001).mkv"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"
ffprobe -v error -select_streams v:0 -read_intervals 999999%+#1 -show_entries packet=pts_time -of csv=p=0 "$f" | tail -1
ffprobe -v error -select_streams a:0 -read_intervals 999999%+#1 -show_entries packet=pts_time -of csv=p=0 "$f" | tail -1
```

| What you see | Cause | Fix |
| --- | --- | --- |
| ffprobe prints `File ended prematurely`; video and audio both stop early | The file is cut off (an incomplete copy) | Replace the file with a complete copy |
| Audio continues well past the last video frame | Video is missing at the end, or the release has an audio-only tail (black screen with sound) | Replace the file if the missing part matters |
| Video and audio end together at the real running time, no error | Only the container header overstates the duration (common with old muxers and long subtitle tracks). Nothing is missing | Not damage. Remuxing the file (`mkvmerge -o out.mkv in.mkv`) corrects the header |

The last row used to be reported as damage. Current versions only report a file when
the stream ends are really missing; older entries are re-checked by the next media
probe run.

### `video_ends_early` that the file does not confirm

If the ends above are complete and a frame near the end decodes:

```bash
ffmpeg -v error -ss 3500 -i "$f" -map 0:v:0 -frames:v 1 -f null - && echo decodes
```

then the entry is stale: the trickplay run that wrote it hit a temporary decode
failure. Regenerate the item's trickplay, which re-checks the file and clears the
entry:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"force":true}' "$LUMASTRA/api/admin/media/<media-item-id>/trickplay/generate"
```

### `container_unreadable`

FFmpeg cannot open the file. Look at the bytes and the codec:

```bash
head -c 32 "$f" | od -A d -t x1 | head -2      # all 00 = the file is empty or zero-filled
mediainfo --Inform="Video;%Format% %CodecID%" "$f"
```

| What you see | Cause | Fix |
| --- | --- | --- |
| Size 0, or only `00` bytes | A placeholder or a failed copy | Replace or remove the file |
| `VVC` / `V_MPEGI/ISO/VVC` | H.266 video, which the bundled FFmpeg cannot decode | Replace it with an H.264 or HEVC release |
| `encv` sample entry, "unknown codec" | An encrypted video track | Replace the file |

### `episode_number_unparsed`

The scanner found a file in a series folder but could not read an episode number from
its name, and the season already has matched episodes, so it did not invent one. The
file is not linked to any episode. Rename it with `SxxEyy`
(`Example Show - S02E06 - Title.mkv`), ideally inside a `Season 02` folder, and rescan
the library. Names like `Show.19.Title.avi` (a running number without a season) are not
read as episode numbers.

### `range_superseded`

A multi-episode file (`S11E14-E15`) whose episodes all have files of their own. It is
not linked, so it is a duplicate. Remove it if you don't need it; Lumastra links it
again if one of the single-episode files disappears.

## "N library integrity issues found"

Open integrity findings live in `integrity_violations`:

```sql
SELECT rule, count(*) FROM integrity_violations WHERE resolved_at IS NULL GROUP BY 1;
```

- **`unprobed-files-stale`**: files older than a week that were never probed. If the file
  also has a `health_issues` entry (unreadable, unparsed episode name), the health item
  above is the real problem and fixing the file clears both. Current versions no longer
  count such files here. Without a health entry, the media probe queue is not draining:
  see [Troubleshooting the task system](/guides/task-troubleshooting/).
- **`quarantine-backlog-large`**: many rows wait in the sync quarantine. Triage them at
  **Library → Quarantine**.

## "N library items have never been matched to a provider"

Items with files but no provider id. Open **Library → Fix matches**. For each item:

1. Search the provider by title or IMDb id (the identify dialog does this).
2. If the id is free, match it.
3. If the match is refused because another item already owns that id, the library holds
   a duplicate: usually a file-less catalog entry created earlier. Merge the two (keep
   the item with the files).
4. If the folder name is a release name (`[Group] Show - 07 (JA) [1080p]`), rename the
   folder to `Show (Year)` with a `Season 01` subfolder and rescan.
5. Home videos and test clips have no provider entry. Dismiss them.

## "N items need re-identification"

A provider call for the item failed permanently. Read the error on the stage row:

```sql
SELECT media_item_id, stage_id, last_error
FROM media_item_stage_state
WHERE status = 'failed_permanent';
```

| `last_error` says | Cause | Fix |
| --- | --- | --- |
| The provider has no entry for the id | A wrong or deleted provider id; sometimes two TV films filed as a series | Match the item to the right id, or move the films into movie folders |
| `aborted due to timeout` | A timeout that was recorded as permanent | Retry the stage: `POST /api/admin/media/<id>/pipeline` with `{"stageId":"<stage>"}` |
| A trickplay or decode stage failed | The file itself cannot be decoded | See `container_unreadable` above |

## "<Task> could not process N items"

These count unresolved rows in `plugin_failure_events`, per task. Group them by reason
and compare with the item's current state:

```sql
SELECT f.plugin_id, left(f.reason, 80) AS reason, count(DISTINCT f.item_id) AS items,
       count(DISTINCT f.item_id) FILTER (WHERE mi.id IS NULL AND mf.id IS NULL) AS subject_gone,
       count(DISTINCT f.item_id) FILTER (WHERE mi.has_files = false) AS no_files
FROM plugin_failure_events f
LEFT JOIN media_items mi ON mi.id::text = f.item_id
LEFT JOIN media_files mf ON mf.id::text = f.item_id
WHERE f.resolved_at IS NULL
GROUP BY 1, 2 ORDER BY 1, 3 DESC;
```

- **Subject gone or no files**: the failure belongs to a file that was deleted or an item
  whose files moved. Nothing to fix; current versions no longer count these.
- **Completed since**: the item was processed later (for example after a fix for GIF
  artwork). Also no longer counted.
- **`FFmpeg aborted`**: a run was stopped by a restart or update. Not a file problem; the
  next run processes the item.
- **`FFmpeg operation timed out`** on intro detection: large 4K files under load. Retry
  the task when the server is quiet.
- **`already mapped to media item …`** on artist enrichment: two artist rows for one act
  (different apostrophes, hyphens or a `DJ` prefix). Merge them.
- Anything else: open the task's **Failures** tab; the per-item **Retry** re-runs it.

## Music hygiene items

These are review lists, not errors.

- **"N track titles come from their file names"**: tracks whose title was taken from the
  file name because the file has no title tag. Check a sample with
  `ffprobe -v error -show_entries format_tags=title -of csv=p=0 "<file>"`. If the tag is
  there, the marker is left over from an older version and clears on the next scan.
  If it is missing, tag the files.
- **"N artist names may be combined credits"**: names containing `&`, `and`, `feat.` and
  the like. For an act whose name really contains `&` (a duo), open the artist and mark
  it **single act, do not split**. Real one-off collaborations can stay as they are.

## "Live TV source imported with N warnings"

An informational item. Read the warnings:

```sql
SELECT w FROM livetv_sources, jsonb_array_elements_text(last_refresh_summary->'warnings') w
WHERE name = '<source>';
```

Reused guide channel ids, dropped duplicate programmes and shortened long descriptions
are normal for large providers and handled by the import. Programmes with a zero-length
or reversed time range are broken entries in the provider's guide; they are skipped.
Current versions list these as notes instead of warnings.
