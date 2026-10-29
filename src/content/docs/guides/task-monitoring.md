---
title: Monitoring tasks and pipelines
description: Task health, scheduling rules, run cancellation, and diagnosing stalled pipelines.
---

| Where | Use it for |
|---|---|
| **Tasks → Overview** (`/admin/tasks`) | Task health, failures, backlog, and settings |
| **Tasks → Runs** (`/admin/tasks/runs`) | Execution history, live logs, and parent/child traces |
| **Tasks → Pipeline** (`/admin/tasks/pipeline`) | Per-item processing stages and stalled work |
| **System → Health** (`/admin/system/health`) | Worker liveness, concurrency, and cluster health |
| **System → Cost** (`/admin/system/cost`) | External API spend and task CPU time |

The version-matched field reference is in `/admin/help/tasks`. For initial library
processing, see [Background tasks on day one](/guides/task-basics/).

## Task health

**Backlog**, **runs**, and **failures** measure different things:

- Backlog counts pending pipeline work. A large backlog with successful runs
  usually means processing is behind.
- Runs are task executions. Failures group recent failed runs by error fingerprint.
- Transient failures retry with backoff. Permanently failed or dead-lettered work
  has exhausted retries; fix the cause before retrying it.

In a task's **Failures** tab, **Retry all failed items** also restores automatic
exclusions caused by repeated analysis failures, with a fresh retry budget. It leaves
completed work, active runs, ineligible items and intentional operator exclusions
unchanged. The result reports how many items were queued; repeating it can report zero.
Failure history remains visible until processing succeeds. See
[intro-analysis recovery](/guides/task-troubleshooting/#retrying-intro-analysis-from-the-ui).

For file-health probes, **Failures** lists recorded issue observations. **Latest
recorded issue** dates that observation; it does not date the latest assessment.
A completed recheck can still leave warnings. Use **Browse current file health**
to review the current assessment; the earlier records remain available.

A **circuit auto-pause** follows repeated failures and probes again after a cooldown:
1 minute, then 5 minutes, 30 minutes, and 2 hours on repeated trips. A **schedule
pause** is an operator setting that stops automatic starts until resumed. The two
are independent.

Tasks are grouped by purpose. Internal tasks are hidden by default but remain
visible when they have an active problem; `?system=1` includes all system tasks.

A failed lookup is never shown as healthy: when the auto-pause state cannot be read,
the task page says so with a Retry button instead of "Running normally". Missing
lane data shows `—` rather than a green `0` for backlog and failed runs.

A **stale-edge warning** means an upstream task finished but a downstream task
hasn't started within its staleness window. It can clear at the next scheduled
sweep. Persistent warnings need
[troubleshooting](/guides/task-troubleshooting/).

## Triggers: when a task runs

Configure triggers in the task's **Settings** tab. Pipeline stages, tasks with
dynamic schedules (such as per-source Live TV refreshes), and manual-only tasks
have no editable triggers.

Available triggers are intervals, daily or weekly times, and server startup.
Startup triggers run once per start even during multi-replica rolling restarts.

- With no custom triggers, the built-in schedule applies. Adding a trigger
  replaces it; removing the last trigger restores it.
- Daily and weekly times use the container's `TZ` time zone. Missed occurrences
  while the server is down are skipped.
- Intervals catch up after downtime if a full interval elapsed. The minimum is
  15 minutes, or the task's default interval if shorter.
- Custom triggers take precedence over schedule environment variables such as
  `SYNC_CURATED_LISTS_HOURS`.
- Pausing keeps trigger settings intact and still allows manual runs.

The API supports `GET`, `PUT`, and `DELETE`
[`/api/v1/tasks/{taskId}/triggers`](/developers/api-routes/#tasks-runs-and-queues)
with `tasks:admin` scope. `PUT` replaces the set with `{ triggers: [...] }`
(1–8 entries); `DELETE` restores defaults. Saving or resetting triggers does not
resume a paused task. Pause or resume separately with
`PATCH /api/v1/tasks/{taskId}/state` and `{ "schedule": "paused" }` or
`{ "schedule": "active" }`. The older `GET/PUT /api/v1/tasks/{taskId}/schedule`
endpoint has been removed.

## Run options on the task page

**Run now** on the task list runs one catch-up batch, the same slice the schedule
runs. A task's page (Overview tab) offers more where the task supports it:

- **Process all pending** works through everything still waiting in one long run.
  Tasks that can discard their own results also offer **Discard and rebuild
  everything**, which deletes existing results first and must be acknowledged.
- **Re-detect segments…** (intro analyzer only) refreshes intro markers, outro
  markers, or both.

Both are disabled while a run of the task is in progress. If a run is already
going, the result says so; after a confirmed rebuild it says that nothing was
rebuilt.

## Cleaning up unavailable media

The daily `unavailable-media-retention` task removes catalog records whose media has
been continuously unavailable for at least **365 days**. The clock starts when the
files disappear (for Audiobookshelf books, when the sync confirms the book is gone
upstream), not when the media was last played. Media that still has playable files
is never removed, however long it has gone unwatched.

| Type | Removed as | Clock starts |
|---|---|---|
| Track | One track | Its files are removed |
| Album | One album, once it has no tracks left | Its last track's files are removed |
| Movie | The movie with its extras | Its files are removed |
| Series | The series with every season, episode, and extra | The last episode's files are removed |
| Audiobook | One book | The Audiobookshelf sync stops finding it |

Children are removed before their parents. Lost episodes or extras of a movie or
series that still has playable files are kept: they still describe that title.
Catalog entries that never had local files, such as Trending or requestable titles,
are never touched by this task; the next section covers them. A record whose loss date is unknown starts a fresh one-year grace
period once its absence can be confirmed; it is never back-dated.

**Anything a person did to a record keeps it, together with its whole series or
movie:** watch and listening history, playback sessions, playlists and the
watchlist, ratings, favorites and flags, comments and reactions, notes, assignments,
manually edited metadata or artwork, and a "Remove from library" dismissal. The task
never deletes physical files.

The task checks each library separately and skips one whose evidence is missing or
uncertain:

- **Folder libraries:** every folder must be enabled, readable, and not empty. Each
  folder's latest finished scan must have succeeded within the last 7 days, after the
  library's settings last changed.
- **Audiobookshelf libraries:** the latest sync covering the library must have
  succeeded without errors within the last 7 days.

Records with no known library are kept. Other libraries are still processed.

Manual runs use the same rules. To preview without changing the database:

```http
POST /api/v1/tasks/unavailable-media-retention/run
Content-Type: application/json
Authorization: Bearer <token-with-tasks:run-scope>

{"input":{"dryRun":true}}
```

The result lists candidates, deletions and kept records per type, plus the reason
each skipped library was skipped. `hasMore: true` means more work remains: the run
reached its batch size (`batchLimit`, default 100) or its 10-minute time budget.
A preview neither starts grace periods nor deletes records.

Other cleanup keeps its own rules. Soft-deleted records that never had local media
(for example duplicate artists or empty series stubs) are purged after 30 days.
They are kept while anything above still references them, and an artist is kept
while any track credits it. Accounts, sessions, logs and other operational data
follow their own retention settings, not this policy.

## Cleaning up titles that were never in your library

Discovery (Trending, popular lists, requestable titles) adds movies and series to the
catalog that you never had. The daily `never-owned-media-gc` task (*Remove Never-Owned
Catalog Entries*) removes the ones nothing needs any more. A movie is removed with its
extras, a series with every season, episode and extra. A title qualifies when:

- it never had a file: no file now, and it was never added to a library, lost its files
  or dismissed by a scan;
- it is older than the minimum age (Admin → Settings → Tasks, *Never-Owned Entry Minimum
  Age*, default 30 days, at least 7), and so is every season and episode in it;
- discovery has not listed it for at least the minimum age, and never less than 28 days,
  so a title that is still trending stays;
- nothing references it. The same things that keep a record in the section above keep it
  here, plus requests and grants in progress, Live TV, AI suggestions, assistant
  conversations, and membership of a synced list.

**Until you switch on *Delete Never-Owned Catalog Entries* (Admin → Settings → Tasks), every
run, scheduled or manual, is a preview.** The run log shows one line such as "Preview only
(cleanup is off in Settings): would delete 1,200 movies and 300 series (…); kept 40 units
(user-data 35, …); 900 still listed by discovery". The run result has every count and up
to 20 sample ids. Check a preview before you switch it on.

Each title is deleted in its own short transaction. A title that someone rates, adds to a
list or starts playing while the task runs is kept. The task never touches physical files.
Library sync clients receive no delete for these titles, because they never had them. A
deleted title that discovery lists again later comes back as a new catalog entry.

## Run access and cancellation

The admin Runs page requires admin access. Run history, run details, logs and the
live run stream are operator data (inputs, scopes and error text of every run), so
the `runs:read` scope comes only with `tasks:admin` or `admin`; an ordinary user
session or a device-flow token no longer has it. Mutations need their own scopes or
admin access.

On the **Runs** page, the **In progress** tab ignores the 24 h / 7 d window: a run that
started two days ago and is still active, or stuck stopping, is exactly what that
tab is for. The window applies to the other tabs. When you have used **Load more**,
the extra pages stay through the live refresh; if a refresh fails, the rows stay
with a "Could not refresh" notice.

Run rows distinguish **Running**, **Waiting in queue**, **Deferred during playback**,
and **Status unconfirmed** when supporting observations are available. A recorded
pending run alone does not prove that a worker is waiting or executing. Manual run
controls remain disabled while an unfinished run is recorded, even if it is outside
the loaded list.

In run details, **Recorded** is the run's creation time. **Execution started** and
execution elapsed are shown only when an actual execution start was recorded;
older runs can show **Execution time unknown**. A long recorded age is not proof
that a worker is stuck.

For a selected-file health check, the **Summary** tab shows the saved check outcome
when the run completes, including when you already have its details open. Completion
alone is not a healthy-file verdict. A successful check may have zero log entries.
If the final result cannot be loaded, use the result-loading retry control rather
than starting another file check.

Preview-generation counts use **frames**, while ordinary task counts use **items**.
Source-version progress is shown separately. When a completed pass stopped at its
budget, its details can show source checks remaining for a later pass. This does
not mean regeneration has already been queued or that every remaining source
needs new previews.

Cancelling is graceful unless you ask for more, both for one run and for all runs
of a task (`POST /api/v1/runs/cancel?byTask=…`, `{ "force": true }` to escalate).
A run that finished between loading the page and confirming **Stop** is reported
as already finished. For Force stop, see
[Run states and cancellation](/guides/administration-operations/#run-states-and-cancellation).

For seek-data synchronization, backlog counts use **file links**: each title and
linked file combination is one unit. A combined file linked to several episodes can
therefore contribute several links. Waiting, failed, and ineligible links are shown
separately. One version's result does not complete an unprocessed alternate. An
execution estimate is omitted when its completion-rate units do not match the
backlog units.

## Preparing a dedicated worker for an upgrade

The dedicated lean TypeScript worker supports a reversible preparation step. It temporarily pauses new local task claims and scheduled
starts, then waits for the work it tracks to settle. Pending jobs keep their
identities and delays; administrator pauses remain in force. The watcher stays
alive during preparation.

A `prepared` receipt permits the guarded stop step, which needs the one-time nonce from the
prepare response. A prepared worker resumes on its own after 15 minutes. `postponed`, `unknown`, a
missing response or a timeout means the upgrade must wait; do not start a second
worker. An active parent waiting for a queued child can postpone preparation,
then continue normally when claims are restored.

Use the [dedicated-worker upgrade procedure](/guides/task-troubleshooting/#preparing-a-dedicated-worker-for-an-upgrade)
and observe the old container's exit before starting its replacement. Preparation
covers observed runner work, not arbitrary plugin background effects or detached
processes. This opt-in procedure does not enable a new runtime automatically.

## Runs interrupted by a restart

A restart or deploy stops every run in progress. Scheduled runs simply continue on
their next cycle. A run you started by hand (from the admin UI, the API or a service
token) is resumed automatically when its task supports it: **Media Segment Repair**,
**Reconciliation Backfill**, **Metadata Aggregation Backfill**, **Bulk Metadata
Sync** and **Detach Deleted Library Folder**:

- A few minutes after the restart, the interrupted run shows **failed** with
  "continued in a new run (1/3)", and a new run of the same task starts. It is
  labelled **Resumed after restart (1/3)**, and its details name the run it
  continues. Where the task saves its position, the new run carries on from there.
- A run is resumed at most 3 times. The fourth interruption ends it with
  "Stopped after 3 restarts".
- A run interrupted again within 15 minutes of being resumed is not resumed again:
  restarts that close together look like a restart loop.
- Only a clean shutdown (a deploy, a container stop) leads to a resume. If the
  server crashed or was killed while the run was active, the run is not resumed,
  because the run itself may have caused the crash.
- Cancelling wins: a run you cancelled is never resumed. To stop a resumed run,
  cancel it like any other.

Start the task again by hand once the cause of the restarts is fixed. Tasks that do
not support resuming fail as before when a restart interrupts them.

## Reading System → Health

The verdict at the top weighs every check the page reads: the attention items, each
component check (database, Valkey, Valkey capacity and the rest) and the task-system
rollup. It is **Critical** when any component fails or the task system is unhealthy,
**Degraded** for warnings, and **Check incomplete** only when nothing is known to be
wrong but something could not be read. A known problem is never hidden behind
"Check incomplete".

- **Providers:** a tile is green only when Lumastra reached the service (Sonarr,
  Radarr, Seerr and Audiobookshelf are probed about once a minute). Unreachable
  services are red and listed first. Configured services that are not probed show
  **Configured · not checked**.
- **Configuration check:** the banner above admin pages is re-checked every five
  minutes and after you save settings. If the check itself fails, it says so.
- **Safe to restart:** shows **Can't tell** when the task database or the
  pending-write queue cannot be read; it never reports "safe" then.
- **Cluster:** a cluster with fewer live nodes than registered ones shows the
  degraded banner, even when only one node is left.
- **What changed?:** if the recent-failure lookup fails, the heading says it could
  not check instead of "No recent failures".

**Transcode failures** lists the newest 100 incident groups and says when there are
more. A link from a health finding to one encoder lists all of that encoder's
groups. Clearing removes only failures up to the newest one shown, so failures that
arrive while you look stay; with the list cut off, **Clear all** clears only the
groups shown.

The **Audit log** CSV export stops at 10,000 rows and warns when it did; narrow the
filters (for example a later start date) to export the rest.

## Read the pipeline

Open **Tasks → Pipeline** to follow processing in **Flow** or inspect individual
stage completion in **Completion**.

The health cards in Flow describe the whole pipeline, across all media types and
time windows. They remain visible in both **Map** and **Table**. Use the issue
links to jump to stopped retries, recent errors, or stuck items; matching failures
link to **Library → Fix matches**.

Search, media-type filters, and the time window control the items shown below the
cards. A line's item count includes recently completed items in that loaded window;
it is not the same as the global count of unfinished work. When only the newest
items are loaded, the page says so. Use **Table** to read titles and current stages,
or scroll within the map to inspect every station. The legend explains its symbols.

## Diagnose stalled work

The Pipeline's stuck-items panel flags:

- Stage rows recorded as running with no update for more than 15 minutes.
- Items with at least 3 recorded attempts while running, pending, or transiently failed.
- Items pending for more than 30 minutes in a stage with no completion in the last
  30 minutes and no future unpaused scheduled run.

Each row states the criterion that selected it. Its age measures time since the
stage-state row was updated; it does not establish how long a worker has been
executing. An attempt count alone does not establish repeated failures.

| Symptom | Check |
|---|---|
| High queue depth, few active items | Resource-class concurrency caps; see [resource classes](/architecture/task-system/#resource-classes) and `LUMASTRA_CONCURRENCY_*` in the [environment reference](/reference/environment-variables/) |
| Backlog doesn't drain, no recent completions | Worker liveness in System → Health; [queue recovery](/guides/task-troubleshooting/#recipe-2-queue-not-draining) |
| Active run with a stale heartbeat | The reconciler should fail it within a few minutes; persistent cases need [stale-run recovery](/guides/task-troubleshooting/#recipe-3-run-stuck-in-active-with-stale-heartbeat) |
| Many failures with the same error | Fix the cause, then use **Retry all failed items** in the task's **Failures** tab to requeue backlog; Runs has no bulk retry |
| A stage doesn't apply to an item | Check the stage's media-type applicability filter |

For the stuck-item predicates and recovery steps, see
[Troubleshooting the task system](/guides/task-troubleshooting/#recipe-1-stuck-items-panel-shows-entries).
For implementation details, see [Task system](/architecture/task-system/).
