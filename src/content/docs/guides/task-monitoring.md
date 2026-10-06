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

A **circuit auto-pause** follows repeated failures and probes again after a cooldown:
1 minute, then 5 minutes, 30 minutes, and 2 hours on repeated trips. A **schedule
pause** is an operator setting that stops automatic starts until resumed. The two
are independent.

Tasks are grouped by purpose. Internal tasks are hidden by default but remain
visible when they have an active problem; `?system=1` includes all system tasks.

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
[`/api/v1/tasks/{id}/triggers`](/developers/api-routes/#tasks-runs-and-queues)
with `tasks:admin` scope. `PUT` replaces the set with `{ triggers: [...] }`
(1–8 entries); `DELETE` restores defaults. The older
`PUT /api/v1/tasks/{id}/schedule` endpoint remains supported: presets become
interval triggers, `"never"` pauses the task, and custom trigger sets read back
as `"custom"`.

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
are never touched. A record whose loss date is unknown starts a fresh one-year grace
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

## Run access and cancellation

The admin Runs page requires admin access. The API's `GET /runs` and
`/api/v1/runs` endpoints accept `runs:read`, allowing scoped non-admin access to
runs and their logs. Mutations need their corresponding scopes or admin access.

For graceful cancellation and Force stop behavior, see
[Run states and cancellation](/guides/administration-operations/#run-states-and-cancellation).

## Runs interrupted by a restart

A restart or deploy stops every run in progress. Scheduled runs simply continue on
their next cycle. A run you started by hand (from the admin UI, the API or a service
token) is resumed automatically when its task supports it, for example **Media
Segment Repair**:

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

## Diagnose stalled work

The Pipeline's stuck-items panel flags:

- Runs active for more than 15 minutes.
- Items with at least 3 attempts while running, pending, or transiently failed.
- Pending items in a stage with no completions for 30 minutes, unless it is waiting
  for its next scheduled run.

| Symptom | Check |
|---|---|
| High queue depth, few active items | Resource-class concurrency caps; see [resource classes](/architecture/task-system/#resource-classes) and `LUMASTRA_CONCURRENCY_*` in the [environment reference](/reference/environment-variables/) |
| Backlog doesn't drain, no recent completions | Worker liveness in System → Health; [queue recovery](/guides/task-troubleshooting/#recipe-2-queue-not-draining) |
| Active run with a stale heartbeat | The reconciler should fail it within a few minutes; persistent cases need [stale-run recovery](/guides/task-troubleshooting/#recipe-3-run-stuck-in-active-with-stale-heartbeat) |
| Many failures with the same error | Fix the cause, then use the task's **Retry pending** action to requeue backlog; Runs has no bulk retry |
| A stage doesn't apply to an item | Check the stage's media-type applicability filter |

For the stuck-item predicates and recovery steps, see
[Troubleshooting the task system](/guides/task-troubleshooting/#recipe-1-stuck-items-panel-shows-entries).
For implementation details, see [Task system](/architecture/task-system/).
