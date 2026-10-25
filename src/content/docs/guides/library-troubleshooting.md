---
title: Library problems on the admin home
description: >
  What each library and file item on the admin home means, how to check it in the
  admin UI, which causes need repair, and when to keep a warning visible.
---

The admin home (**Admin**) lists what needs your attention. Most library items there
have a handful of known causes, and several of them are not problems with your media
at all. Each recipe below goes from what you see, to what to check, to the cause, to
the fix.

Start with the linked admin page and its retry or repair action. The advanced checks
below use three tools when the UI needs supporting evidence:

- `psql` on the Lumastra database (read-only queries are enough).
- `ffprobe` from the same FFmpeg build Lumastra uses, run where the media is mounted.
- The admin API, with an admin session or an admin token (`Authorization: Bearer …`).

For task failures in general (stuck items, queues that won't drain), see
[Troubleshooting the task system](/guides/task-troubleshooting/).

## "N media files have health problems"

The item counts files whose `media_files.health_issues` is not empty. Open
**System → Health → Files**, read the warnings on the affected row, then choose
**Recheck** to check that one file again. A previous task failure or linked library
item is not required.

Rechecking starts a background run. Use its run link to follow progress; acceptance
or a running status does not mean the file is healthy. **Cancel** asks the run to
stop, and the page waits for its final state. Closing the page stops tracking, not
the worker. Repeating the request while the same file is being checked reuses that
run. A disabled media probe or an incomplete check retains the warning.

Only fresh evidence can remove a recorded problem. Other warnings, newer concurrent
findings and genuine damaged or unsupported media remain visible. See the recipes
below for interpreting a retained warning.

For an advanced count by issue type, use a read-only query:

```sql
SELECT e->>'type' AS issue, count(*)
FROM media_files mf, jsonb_array_elements(mf.health_issues) e
WHERE jsonb_typeof(mf.health_issues) = 'array'
GROUP BY 1 ORDER BY 2 DESC;
```

Then follow the recipe for each type.

### `truncated_video` or `video_ends_early`: is the file really cut off?

Both say the video stops before the duration the container header claims. That has
several possible causes. Read the end of the video and each audio stream. The commands below read from the final seek to
end-of-file; reading just one packet can stop at a keyframe before the true end.
A damaged index can make a tail read slow. Prefer the bounded UI **Recheck** for
routine checks, and keep the warning when the result is inconclusive:

```bash
f="/media/movies/Example Film (2001)/Example Film (2001).mkv"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"
ffprobe -v error -select_streams v:0 -read_intervals 999999% -show_entries packet=pts_time -of csv=p=0 "$f" | tail -1
ffprobe -v error -select_streams a:0 -read_intervals 999999% -show_entries packet=pts_time -of csv=p=0 "$f" | tail -1
```

| What you see | Cause | Fix |
| --- | --- | --- |
| ffprobe prints `File ended prematurely`; video and audio both stop early | The file is cut off (an incomplete copy) | Replace the file with a complete copy |
| Audio continues well past the last video frame | Possible missing video, a deliberate audio-only ending, or silent padding in one audio track | Inspect the actual ending and compare the language tracks; retain the warning if completeness is uncertain |
| Video and audio end together at the real running time, no error | Only the container header overstates the duration (common with old muxers and long subtitle tracks). Nothing is missing | Not damage. Remuxing the file (`mkvmerge -o out.mkv in.mkv`) corrects the header |

A duration mismatch alone does not establish missing content. Rechecking compares
the stream ends; failed or inconclusive checks retain the warning. Inspect the
actual release when an audio-only tail or a language-specific edit remains possible.
Silent audio after the last video frame does not prove that the video is complete.
Closing credits near the cutoff are supporting evidence, not a substitute for
checking the ending; scene footage at the cutoff needs further investigation.

Use **Recheck** on the affected row in **System → Health → Files** to re-check its
stream ends. **Retry** in the media-probe task's **Failures** tab starts the same
selected-file background check and exposes its run link. It removes only warnings
disproved by a successful check; failed or inconclusive checks keep the warning,
as do unrelated decode problems. This does not require discarding probe data for
the whole library. A recheck cannot repair missing or encrypted bytes; keep genuine
file warnings visible.

When a recheck measures audio after the last video frame, **Files**, the inspector,
and **Health → Files** show the dated observation and measured interval. Expand
**Measurement details** for stream/channel readings and measurement limits. The
check is bounded to 180 seconds, eight audio streams, and its time budget; skipped
streams or incomplete decoding are reported as inconclusive. Near-silent measured
channels do not prove a complete ending and do not clear existing warnings. Source
or stream changes discard the old measurement until a fresh check completes.

### `video_ends_early` that the file does not confirm

If the stream ends above are complete, check video **after the reported cutoff**
and near the expected end. Choose the seek time for the actual file:

```bash
ffmpeg -v error -ss 3500 -i "$f" -map 0:v:0 -t 10 -an -sn -f null - -progress pipe:1
```

Look for a positive `frame=` count and advancing output time, as well as decode
errors. An exit status of zero with no frames, a frame before the reported cutoff,
or a single successfully decoded frame does not prove the whole file is healthy.

Use the selected-file **Recheck** first. If fresh checks disprove the warning but
trickplay is incomplete, regenerate the item's trickplay. In the item's **Files**
tab, choose **Force Regenerate** under **Trickplay** and follow the resulting run.
Keep the warning if the check or regeneration fails or remains inconclusive. The
equivalent API request is:

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

### Replacing a confirmed damaged file

If you use Sonarr or Radarr, open the existing series or movie there and search for
a replacement for that specific episode or film. Check the title, year, episode
name and language as well as the number: releases can use different episode
ordering, and a search can return unrelated titles. Use the normal download and
import flow. Avoid changing monitoring or quality settings just to replace one file.

If you keep multiple versions, compare the managed folder and file with the
affected Lumastra file first. Separate HD and 4K Radarr instances can manage the
same film; replacing its healthy HD copy will not repair the damaged 4K copy.

A completed download is only the first step. Sonarr or Radarr can hold a complete
replacement because its quality or custom-format score is below the existing file.
Read the import warning, review the exact file, episode and language, then use the
selected download's **Manual Import** if that replacement is correct. Keep unrelated
downloads and global quality settings unchanged.

Check that Sonarr or Radarr reports a successful import, then open the same entry
in **Lumastra → Admin → Library → Media**:

1. In **Files**, check that the replacement is attached to the correct entry and is
   selected as the default. A changed filename can produce a new file record while
   the existing movie or episode remains.
2. In **Pipeline**, follow the fresh media probe and applicable intro/credits and
   trickplay stages. A queued stage, an old completed run or an expired run record
   does not prove that the replacement has been processed.
3. Check the new duration, streams and language, then confirm that the file warning
   has cleared after a successful check. If it remains, use the selected-file
   **Recheck** described above and inspect its result.
4. Confirm that the existing library identity and watch progress remain intact.
   Do not delete and recreate the movie or episode to remove a warning.

If no complete, correctly identified copy is available, keep the warning visible.
Retrying a task cannot restore missing bytes.

### Episode filenames and provider numbering disagree

Compare the episode title and physical content with the provider metadata before
changing links. A release can count a two-part story as two files while the provider
counts it as one episode, shifting the numbers of every later file in the season.
The number shown in the episode picker comes from the library’s canonical metadata;
it does not establish which episode the file contains.

The file’s episode editor assigns one physical file to one or more episodes. Saving
makes that file the default for the chosen episodes; other attached files remain
alternate versions. Linking two separate halves to the same episode does not join
them into continuous playback. Verify which version plays after any saved change.

If several episodes are shifted, review the whole season before saving individual
reassignments. Preserve existing provider identities, watch progress and alternate
files. A combined provider episode needs a verified complete source or a supported
multipart playback workflow before its separate halves can be considered repaired.
Do not delete an extra episode row merely because its number appears duplicated.

### Intro analysis reports video timestamps that do not advance

Open **Tasks → Detect Intros & Credits → Failures** and read the affected item's
error. A file can play normally at the beginning but contain many video packets
with the same timestamp near its end. Its declared duration and a successful probe
at the beginning do not disprove that defect.

The bounded timing check prevents repeatedly running a decoder against this known
failure. Retrying unchanged input cannot repair its timeline. Use the confirmed
file replacement workflow above, then follow the fresh analysis for the same
library entry. Keep the failure visible until the replacement has actually been
analysed successfully; download completion or a newly empty file-warning field is
not proof of recovery.

An analysis can complete without detecting any segments. Read its outcome before
retrying; a no-detection result does not mean the file is damaged or that segment
markers should be forced.

### `episode_number_unparsed`

The scanner found a file in a series folder but could not read an episode number from
its name, and the season already has matched episodes, so it did not invent one. The
file is not linked to any episode. Rename it with `SxxEyy`
(`Example Show - S02E06 - Title.mkv`), ideally inside a `Season 02` folder, and rescan
the library. Names like `Show.19.Title.avi` (a running number without a season) are not
read as episode numbers.

### `range_superseded`

A multi-episode file (`S11E14-E15`) whose episodes all have files of their own. It is
not linked. Verify that every episode in the combined file is available separately
before removing anything: a stale link or numbering mismatch can hide unique content.
Lumastra links the combined file again if a single-episode file disappears.

## "N library integrity issues found"

Open the finding in **System → Health** and follow its affected-items link. For a
sync backlog, open **Library → Quarantine** and inspect the series group. A backlog
count describes unresolved decisions; it does not mean every proposal is safe to apply.

- **`unprobed-files-stale`**: files older than a week that were never probed. If the file
  also has a `health_issues` entry (unreadable, unparsed episode name), the health item
  above is the real problem and fixing the file clears both. Current versions no longer
  count such files here. Without a health entry, the media probe queue is not draining:
  see [Troubleshooting the task system](/guides/task-troubleshooting/).
- **`quarantine-backlog-large`**: many rows wait in the sync quarantine. Review them
  using the controls below.

### Reviewing sync quarantine

Start with **Recheck completed decisions**. This closes only unchanged proposals
whose exact TMDB identity and proposed title are already bound to the expected
series and season. It does not change media. Read the examined, already-applied and
retained totals; use **Continue recheck** for later batches in a large group.
Ambiguous proposals, conflicting identities, changed records and fileless items
remain open for investigation.

For proposals that still need a change, choose **Review and accept batch**. A preview
can contain only retained warnings and no eligible changes. Cancel in that case and
inspect the reasons; accepting an empty batch does not repair those warnings.

For a batch with eligible changes:

1. Inspect each linked episode's current and proposed identity and title. Review
   the identity releases and dependencies too: a batch can include related episodes
   from later pages. Up to 1,000 decisions are reviewed together, without splitting
   a required dependency group.
2. Read the proposed overview and still. A missing provider value preserves the
   existing value; a present provider value may replace it. Accepting also binds
   the title to its provider identity, excluding that episode from later automatic
   title reconciliation until its binding is deliberately changed.
3. Confirm only decisions you have verified. These media changes cannot be undone
   from this screen. Read the accepted, blocked and skipped
   totals afterward. **Continue accepting** reaches later batches. A retained
   warning has not been repaired merely because another decision succeeded.

If the reviewed page changed, no decisions are accepted and traversal does not
advance. Review a fresh batch, or choose **Reload and restart review**. Follow links
in retained-dependency messages to inspect the specific blocking item. Protected,
ambiguous or oversized groups require individual investigation; accepting cannot
invent a supported match.

**Dismiss** applies to the whole series group. Use it only when you have established
that its warnings need no further action. Do not dismiss unresolved proposals to
make the backlog counter disappear.

For an optional advanced count, open findings live in `integrity_violations`:

```sql
SELECT rule, count(*) FROM integrity_violations WHERE resolved_at IS NULL GROUP BY 1;
```

## "N library items have never been matched to a provider"

Items with files but no provider id. Open **Library → Fix matches**. For each item:

1. Search the provider by title or IMDb id (the identify dialog does this).
2. If the id is free, match it.
3. If another entry owns the selected id, review the conflict and its file counts.
   For a series, choose **Review episode links** for each source file. Select the
   canonical target series, add the correct episodes and **Save links**. Changes stay
   in the draft until saved; closing the editor writes nothing. If the target has no
   episodes yet, open its **Sync** tab, select **Include children** and choose **Sync
   from provider**. After that task finishes, reload the episodes in the file editor.
4. Once every source file has moved, choose **Merge entries**. The canonical series
   remains, including its provider identity, files and watch data. Remaining source
   files keep the merge blocked. Movie merges retain the file-bearing entry and apply
   the selected provider identity; if that final step fails, the dialog explains what
   succeeded and **Confirm** retries only the identity update.
5. If the folder name is a release name (`[Group] Show - 07 (JA) [1080p]`), rename the
   folder to `Show (Year)` with a `Season 01` subfolder and rescan.
6. Home videos, test clips and personal compilations may have no provider entry.
   Keep their local metadata rather than selecting an unrelated provider match.
   The Fix matches list can continue to show these items; removing them from the
   library is not a metadata repair.

## "N items need re-identification"

A provider has rejected the stored identity, or the task explicitly needs a corrected
match. Review it in **Library → Fix matches → Broken match**. Read the error on the
stage row when more detail is needed:

```sql
SELECT media_item_id, stage_id, last_error
FROM media_item_stage_state
WHERE status = 'failed_permanent';
```

| `last_error` says | Cause | Fix |
| --- | --- | --- |
| The provider has no entry for the id | A wrong or deleted provider id; sometimes two TV films filed as a series | Match the item to the right id, or move the films into movie folders |

Timeouts, unsupported codecs, encryption and generic processing errors remain task
or file warnings. They do not establish that a provider identity is wrong. Follow
their task or pipeline action instead of changing the match.

## Series metadata says “No usable provider identity”

Open the series, choose **Pipeline**, and read **Refresh Series Metadata**. Without a
usable provider identity this step is **Not applicable**, with guidance to use
**Identify**. It has not completed a provider sync, and an empty response is not proof
that the provider has no episodes.

Use **Identify** only when you can verify the correct series. Assigning a supported
identity queues the step again. A provider that is temporarily unavailable remains
retryable. After updating from a version that reported the missing identity as a
failure, use **Retry** on this step, then **Do this one first** if it is waiting.
Keep unmatched personal material or an uncertain special separate until its identity
is established.

<span id="-could-not-process-n-items"></span>

## "Task could not process N items"

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
- **`FFmpeg operation timed out`** on intro detection: large 4K files under load, or
  files with invalid timing. Open the movie or episode's **Sync → Media Segments**
  section and choose **Generate** to process that item. Follow **View run** and use
  **Check result again** if the result has not arrived. Queued or running is not a
  completed analysis. A failed, skipped, cancelled or inconclusive check keeps its
  warning; **Cancel** asks the worker to stop. See
  [intro-analysis recovery](/guides/task-troubleshooting/#retrying-intro-analysis-from-the-ui).
  **Process all pending** works through waiting work without resetting completed
  analysis. Eligible movies also participate in video analysis; a formerly blocked
  movie can move from **Not applicable** to **Waiting** after an update. Processing
  must still succeed before its historical failure is resolved. Unsupported codecs
  and malformed timestamps remain warnings. A result with no detected segments can
  be valid, but only after the selected analysis actually completes. Existing manual
  segments are preserved; a later failure can leave earlier valid work in place.
- **`already mapped to media item …`** on artist enrichment: compare the artists'
  provider identities and credits before merging. Similar punctuation or a `DJ`
  prefix alone does not prove they are the same act. Keep distinct artists separate
  and investigate the lookup that selected the conflicting identity. Current
  enrichment preserves an existing artist identity and rejects metadata explicitly
  naming another artist. After updating, use that item's **Retry** action. A lookup
  that finds no compatible metadata does not require merging the artists.
- Anything else: open the task's **Failures** tab and use its available retry action
  after fixing the cause.

## Music hygiene items

These are review lists, not errors.

- **"N track titles come from their file names"**: tracks whose title was taken from the
  file name because the file has no title tag. Check a sample with
  `ffprobe -v error -show_entries format_tags=title -of csv=p=0 "<file>"`. If the tag is
  there, run a normal **Scan** from **Library → Sources & scanning → your music
  library**, then check its **Recent scans** result. Current versions also recheck
  previously scanned, unchanged files whose title source has not been verified.
  A successful tag read clears a stale filename marker; missing tags remain listed.
  Failed or cancelled reads stay eligible for a later scan. Manually locked titles
  are preserved, and segmented tracks are not renamed from a whole-file title tag.
  If the title is already correct, open that track's **Overview** and choose
  **Confirm title**. This keeps its exact spelling and protects the metadata from
  automatic updates, without changing the file or claiming it has a title tag. If
  the title is wrong, use **Edit** to correct it instead. Review each track before
  confirming; preserve meaningful version and guest-artist credits. A concurrent
  change requires reloading the current title before confirmation. If a request or
  refresh fails, reload before trying again: the write may already have succeeded.
  Alternatively, add the missing tag with your tagging tool and scan again.
- **"N artist names may be combined credits"**: names containing `&`, `and`, `feat.` and
  the like. For an act whose name really contains `&` (a duo), open the artist and mark
  it **single act, do not split**. Real one-off collaborations can stay as they are.

### Reviewing track artist credits

From an artist's **Overview**, choose **Review artist tracks**, open a track, and find
**Artist credits** on its **Overview**.

1. Expand **Original tag evidence** and compare it with reliable release credits.
   A separator in a name alone does not prove that it names separate performers.
2. Find and select the existing artist identities. Set each role to **Performer** or
   **Remixer**, and check their order and credited names. Keep legitimate groups intact.
   Remove a combined credit from the draft only after verifying its separate performers.
3. Choose **Review credit changes** and compare the current and proposed lists. Check
   the acknowledgement, then choose **Confirm artist credits**. A new artist entered in
   the draft is created only when this confirmation succeeds.
4. Wait for the saved, protected and reloaded result. If the review is stale or the
   result is uncertain, reload and inspect the current credits before trying again.

Confirmation preserves the track title, file versions, album ownership and listening
history. It protects the reviewed credits from automatic updates. Album ownership has
its own review link; changing track performers does not move the album to another owner.
A collaboration owner's name may therefore remain in the heuristic review list after
its track credits are corrected. Mark it as a single act only when that describes the
actual act, rather than to clear the count.

Music hygiene counts on the health page refresh every 15 minutes. The affected-item
list can reflect a saved correction before the aggregate health card does.

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
