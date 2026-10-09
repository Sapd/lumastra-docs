---
title: Background tasks on day one
description: Initial library processing, when playback is ready, and how to reduce background load.
---

## Initial library processing

A fresh install processes your existing library in batches: scanning files, reading
codecs and tracks, fetching metadata and artwork, and generating recommendation
embeddings. Enabled features add intro detection and
[music audio analysis](/guides/organizing-music/#audio-analysis-essentia).

This initial backlog can take minutes to a day or more, depending on library size,
hardware, network speed, and provider rate limits. The backlog worker picks up
remaining work automatically. Once it catches up, new additions account for most
of the load; audio analysis and intro detection repeat only when files change.

[Self-generated trickplay](/guides/media-enrichment/#trickplay-scrubbing-preview-thumbnails)
is disabled by default because it uses substantial CPU and disk space.

## Playback during processing

A scanned file can play before enrichment finishes. Lumastra reads the file's
technical details on demand. Filenames and placeholder artwork may appear until
metadata arrives; recommendations and detected skip segments become available
as their respective tasks finish.

## Failures that need attention

Transient failures, such as provider rate limits or network errors, retry with
backoff. **Stopped retrying** means retries are exhausted: fix the cause, then
retry the work.

**Auto-pause** temporarily quarantines a task after repeated failures. It probes
again after a cooldown and resumes if successful. Repeated trips warrant checking
the dependency or error in the task's failure history.

An unidentified title under **Library → Fix matches**
(`/admin/library/fix-matches`) is a metadata-matching problem. Correct its title,
year, or provider match there; rerunning unrelated tasks won't fix the match.

For a backlog that stops progressing, use
[Monitoring tasks and pipelines](/guides/task-monitoring/) and the
[troubleshooting recipes](/guides/task-troubleshooting/).

## Reduce background load

- **Pause or reschedule a task** in **Tasks → Overview** (`/admin/tasks`). Pause
  stops automatic starts but still allows manual runs. For scheduling rules, see
  [task triggers](/guides/task-monitoring/#triggers-when-a-task-runs).
- **Lower concurrency** in **Settings → Task runner** (`/admin/settings/tasks`),
  under **Task Runner & Queue Tuning**. Per-resource-class caps reduce peak load
  at the cost of a longer catch-up. Environment overrides are documented as
  `LUMASTRA_CONCURRENCY_*` in the
  [environment variable reference](/reference/environment-variables/).
- **Disable optional work** in the same page's **Advanced Tasks** section. These
  persistent switches cover selected tasks, including anime cross-reference ID lookups (Fribb and MyAnimeList),
  local trickplay serving, and library integrity checks.

## History and log retention

**Settings → Task runner → Advanced Tasks** also controls how long task history,
admin audit logs, watch history, failure events, quota records and webhook deliveries
are kept. Shorter retention reduces database growth and leaves less history for
troubleshooting; task history first moves from hot storage to an archive.

For sustained load after the initial backlog clears, see
[Performance tuning](/guides/performance-tuning/).
