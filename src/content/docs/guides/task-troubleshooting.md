---
title: Troubleshooting the task system
description: >
  A recipe book for common task-system failure modes: stuck items, queues
  that won't drain, orphaned runs, identity collisions, and mirror drift.
  Each comes with diagnosis commands and a resolution path.
---

These recipes assume shell access and `psql` / `valkey-cli` inside the deployment.
For UI diagnostics, start with [Monitoring tasks and pipelines](/guides/task-monitoring/).
The state model is documented in [Task system](/architecture/task-system/).

:::note[Conventions used below]
Set these shell variables first. The actual container names depend on your
deployment:

```bash
APP_CONTAINER=lumastra           # app + orchestrator container
WORKER_CONTAINER=lumastra-worker # background-worker container
PG_CONTAINER=lumastra-postgres   # PostgreSQL
VALKEY_CONTAINER=lumastra-valkey # Valkey / Redis
VALKEY_PASSWORD=...              # matches `requirepass` in your compose file
```

If your Docker host is remote, prefix each command with `ssh <your-host> '...'`.
**Never paste real credentials into a shared document based on this template.**
:::

:::tip[Two Valkey instances]
If `TASK_CACHE_URL` is configured, set `VALKEY_CONTAINER` to the dedicated task
instance for every task/BullMQ command on this page. `CACHE_URL` is the general cache;
the task instance is the one that must use `noeviction`. Check both on the Health page
when diagnosing capacity.
:::

---

## Recipe 1: "Stuck items" panel shows entries

**Symptom:** the **Pipeline** page's Stuck Items panel (`/admin/tasks/pipeline`)
shows entries matching any of `running > 15m`, `attempt ≥ 3`, or pending in a
dormant stage (no completions in 30 min, and not just waiting on its next
scheduled run).

**Likely causes:** a worker died mid-stage; a handler hung (a transcode on a
corrupted file, an API call that never returns); or a legitimate retry loop
(`failed_transient`, a real underlying problem).

### Diagnosis

**1. Classify the row:**

```sql
SELECT media_item_id, stage_id, status, attempt,
       updated_at, last_error,
       EXTRACT(EPOCH FROM now() - updated_at)::int AS age_sec
  FROM media_item_stage_state
 WHERE media_item_id = '<UUID>'
   AND stage_id = '<stage>'
 ORDER BY updated_at DESC LIMIT 1;
```

**2. Find the owning run (if any):**

```sql
SELECT id, state, started_at, heartbeat_at, owner_instance_id, error
  FROM task_history
 WHERE id = '<last_run_id from above>';
```

**3. If `status='running'`, check the worker is alive** (`1`=alive,
`0`=dead; the reconciler sweeps every 30s, but a dead owner is only reclaimed
once its heartbeat has gone stale for 5 minutes):

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" EXISTS "cluster:node:<owner_instance_id>"
```

**4. If `failed_transient`,** read `last_error.message`.

### Resolution

| Case | Action |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Wedged-running, owner dead | Wait for the reconciler (30s sweep, but it only reclaims once the heartbeat is 5 min stale), or `UPDATE media_item_stage_state SET status='failed_transient', next_eligible_at=now() WHERE …`. The next sweep picks it up. |
| Wedged-running, owner alive | Kill the worker (forces re-enqueue) or `POST /api/v1/runs/{runId}/cancel` for a graceful abort. |
| Retry loop with a real error | Fix the underlying issue, then use **Retry all failed items** in the task’s **Failures** tab. For one item, use `POST /api/v1/tasks/{taskId}/failures/{itemId}/retry`. |
| `failed_permanent` (no further retries) | `last_error.code` says what went wrong; once fixed: `UPDATE media_item_stage_state SET status='pending', attempt=0, next_eligible_at=null WHERE media_item_id='<UUID>' AND stage_id='<stage>'`. |

A common "owner alive" case resolves itself: a `failedReason: "claimRun
failed for run_...: state mismatch: expected pending got active"` on the job
hash means the original worker died right after claiming the run. No manual
step is needed; see Recipe 11.

---

## Recipe 2: Queue not draining

**Symptom:** the **Pipeline** page shows a station with hundreds of pending
items, queue depth is high, but `active` is 0 or stuck low.

**Likely causes:** the worker never started; leader election failed; the
concurrency cap is 0 or the worker is paused; or it's hung on a previous
job.

### Diagnosis

**1. Worker started for the task.** With the default per-task queues, expect a
startup line for the affected task. The legacy class layout logs one line per
class instead:

```bash
docker logs "$WORKER_CONTAINER" --since 5m 2>&1 | grep -E 'Worker started for (task|class)'
```

**2. Leader is held.** With the default 15 s TTL and 5 s renewal interval, a
healthy leader’s PTTL repeatedly rises from about 10000 to 15000 ms. A value
that falls to zero without recovering means leadership is being lost:

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" --raw KEYS "lock:orch:*"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" GET lock:orch:cpu
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" PTTL lock:orch:cpu
```

**3. Concurrency cap** (or the Pipeline page's tooltip):

```bash
docker exec "$WORKER_CONTAINER" env | grep LUMASTRA_CONCURRENCY
```

**4. Worker processing.** No matches means idle, not hung:

```bash
docker exec "$WORKER_CONTAINER" ps -ef | grep -E 'ffmpeg|chromaprint' | grep -v grep | head -5
```

### Resolution

| Case | Action |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Worker missing | The worker process isn't booting a queue for that task (or class in legacy mode). Report it if you're not building from source yourself. |
| No leader | Restart the orchestrator-role container. Leader election races again on boot. |
| Cap = 0 | Raise `LUMASTRA_CONCURRENCY_<CLASS>` (see the [environment variable reference](/reference/environment-variables/)) via env or the admin UI. |
| Hung worker | Kill the worker container; the orchestrator re-enqueues the in-flight work. |
| Wrong resource class for a task | Not fixable from the admin UI. Flag it upstream. |

---

## Recipe 3: Run stuck in 'active' with stale heartbeat

**Symptom:** a run shows `state='active'` in `task_history`, but
`heartbeat_at` is many minutes old with no corresponding activity.

**Likely causes:** the worker was killed outright; a network partition kept
it from writing to Postgres/Valkey; the handler is hung on a blocking call;
or the orchestrator crashed before processing the run's terminal transition.

### Diagnosis

```sql
SELECT id, state, owner_instance_id,
       started_at, heartbeat_at,
       (now()-heartbeat_at)::interval(0) AS hb_age
  FROM task_history
 WHERE id = '<runId>';
```

If `hb_age > 5 min`, the reconciler should catch it next tick. Startup recovery
records **Boot recovery on &lt;instance&gt; inspected N, reclaimed M orphan(s)**
in the boot-recovery audit log. Check worker logs for recovery and reconciler activity:

```bash
docker logs "$WORKER_CONTAINER" --since 5m 2>&1 | grep -iE 'Boot recovery|Reconciler' | tail -10
```

If `reclaimed:0` for many ticks but stale rows persist, check the Valkey
state-hash guard directly: `-2` (missing key) or `HEXISTS` returning `0` (no
`state` field) both mean "not alive":

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" PTTL "task:run:active:<RUN_ID>"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" HEXISTS "task:run:active:<RUN_ID>" state
```

For a `pending` run, also check BullMQ: `failedReason`/`finishedOn` set
means terminal:

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" --raw KEYS "bull:task:*<RUN_ID>*"
```

Confirm the owning instance is dead (`0` = dead):

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" EXISTS "cluster:node:<owner_instance_id>"
```

### Resolution

| Case | Action |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Both signals "dead" but not reclaimed | Check the **Health** page's Subsystem Liveness grid for the reconciler's beat age; if stale, check the leader container's logs and confirm `lock:orch:<class>` holds. |
| Reconciler running but takes over 10 minutes | Normal. A 5-minute stale threshold plus classification work adds up. |
| Need an immediate manual clear | Direct SQL + Valkey cleanup (see below). |

A manually started run of a task that supports resuming (see
[Runs interrupted by a restart](/guides/task-monitoring/#runs-interrupted-by-a-restart))
stays `active` with a stale heartbeat after a clean shutdown on purpose: the reclaim
picks it up and starts the run that continues it. Its key
`task:run:interrupted:<RUN_ID>` exists until then. To stop it from being resumed,
cancel the run; don't clear it by hand while a resume is wanted.

### Manual cleanup example

A stale pending run blocking the scheduler:
```bash
# 1. Remove from BullMQ's prioritized queue
VPASS="$VALKEY_PASSWORD"; JOB="refresh-epg~~source-XXX#run_XXX"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" ZREM "bull:task:cpu:prioritized" "$JOB"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" DEL "bull:task:cpu:$JOB"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" DEL "task:run:active:run_XXX"

# 2. Mark the task_history row failed
docker exec "$PG_CONTAINER" psql -U lumastra -d lumastra <<'SQL'
UPDATE task_history
   SET state='failed',
       completed_at=NOW(),
       error='{"message":"manually_cleared"}'::jsonb
 WHERE id='run_XXX' AND state IN ('pending','active');
SQL
```

The scheduler re-fires on its next sweep once the blocking row is cleared.

---

## Recipe 4: Pending pile-up: orphans vs. legitimate backlog

**Symptom:** `SELECT count(*) FROM task_history WHERE state='pending'`
returns thousands, and the UI shows a huge backlog.

**Likely causes:** legitimate backlog (the most common case: the stage-sweep
enqueued a lot and workers haven't drained it); orphans (the Postgres row
was written but the Valkey/BullMQ enqueue crashed); or an identity lock
(rows blocked by one in-flight run sharing an identity key).

### Diagnosis

**Distribution by task:**

```sql
SELECT task_id, state, count(*),
       min(started_at)::timestamptz(0) AS oldest,
       max(started_at)::timestamptz(0) AS newest
  FROM task_history WHERE state IN ('pending','active')
 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 30;
```

**Check BullMQ presence for the oldest pending rows.** A present key means
**legitimate backlog** (queued behind others); a missing key means an
**orphan**. The reconciler sweeps every 30 s and reclaims pending rows once
they are about 3 minutes old. Startup boot recovery uses a 2-minute threshold:

```bash
VPASS="$VALKEY_PASSWORD"
for runId in <RUN1> <RUN2>; do
  echo "=== $runId ==="
  docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" --raw KEYS "bull:task:*${runId}*" | head -2
done
```

### Resolution

| Case | Action |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legitimate backlog | Wait it out, or scale up: raise `LUMASTRA_CONCURRENCY_<CLASS>`, move tasks to a less-contended class, or lower the priority of less-important tasks. |
| Orphans | Boot-recovery clears them on its own. If many remain, restart the container running the orchestrator role to force a fresh boot sweep. |
| Identity-locked | Check `task:identity:<taskId>:<formula>` keys in Valkey. If the holder run is terminal but the key lingers, `DEL` it. |

---

## Recipe 5: Worker not picking up jobs

If jobs are prioritized but none run, first use
[Recipe 2](#recipe-2-queue-not-draining) to check worker startup, leadership, and
concurrency. If those checks pass, inspect BullMQ's stalled-job set:

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" SCARD "bull:task:$CLS:stalled"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" SMEMBERS "bull:task:$CLS:stalled"
```

`stalled` is a SET, not a sorted set; `ZCARD` returns `WRONGTYPE`.
Only if BullMQ's own recovery fails, clear it:

```bash
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" DEL "bull:task:$CLS:stalled"
```

Otherwise restart the worker. Boot recovery reconciles remaining state.

---

## Recipe 6: Same task firing in a tight loop

**Symptom:** a task fires dozens of times within minutes when it's meant to
fire daily or hourly.

**Likely causes:** a scheduler bug (`last_fired_at` not updating); an
invalidation storm (triggers re-enqueueing far more than intended); or the
interval is wrong.

### Diagnosis

**Recent fires:**

```sql
SELECT id, started_at, state
  FROM task_history
 WHERE task_id = '<task>'
   AND started_at > now() - interval '10 minutes'
 ORDER BY started_at DESC;
```

**Scheduler state** (column names can vary across releases; check the
actual schema if this doesn't match what you see):

```sql
SELECT task_id, last_fired_at, next_due_at, payload
  FROM scheduler_state
 WHERE task_id = '<task>';
```

**Outbox events targeting the task's stages.** Thousands of rows for a
single `event_name` points to an invalidation storm, likely a database
trigger firing more broadly than it should:

```sql
SELECT event_name, count(*) AS n,
       min(created_at)::timestamptz(0) AS oldest,
       max(created_at)::timestamptz(0) AS newest
  FROM event_outbox
 WHERE created_at > now() - interval '10 minutes'
 GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

### Resolution

| Case | Action |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrong interval | Fix the task's declared schedule interval. |
| Invalidation storm | Find the database trigger emitting that event and check whether it's firing on writes that don't change meaningful content. |
| Scheduler not updating `last_fired_at` | Restart the container running the orchestrator role. If it recurs, the underlying dedup script may be failing. Check Valkey connectivity. |

---

## Recipe 7: Pipeline display drift

**Symptom:** the Pipeline metro map shows a "ghost" station for an item
that should pass through it, or a tooltip reports the wrong resource class.

**Likely cause:** the admin UI's hand-maintained display mapping (media
types, resource class) has drifted from the task's actual definition.

**Diagnosis:** compare the stage's real behavior (does the item get
a row in `media_item_stage_state`?) against the tooltip. If they disagree,
it's a display-mapping issue; pipeline coverage itself is still correct.

**Resolution:** cosmetic, not a correctness bug. From source, update the
display mapping alongside the task definition. On a packaged build, report
it rather than fixing it live.

---

## Recipe 8: Stage row stuck at 'running' (wedged)

**Symptom:** `media_item_stage_state.status = 'running'` for a row whose
`last_run_id` is no longer active in `task_history`.

**Likely cause:** the worker died between marking the stage running and
writing a terminal result; the owning run resolves via the failure listener
or reconciler, but that path doesn't touch the stage row itself.

### Diagnosis

```sql
SELECT s.media_item_id, s.stage_id, s.status, s.last_run_id,
       s.updated_at,
       (now()-s.updated_at)::interval(0) AS stage_age,
       th.state AS run_state
  FROM media_item_stage_state s
  LEFT JOIN task_history th ON th.id = s.last_run_id
 WHERE s.status='running'
   AND s.updated_at < now() - interval '10 minutes'
   AND (th.state IS NULL OR th.state NOT IN ('pending','active','cancelling'))
 ORDER BY s.updated_at ASC LIMIT 20;
```

### Resolution

The reconciler and boot-recovery both reclaim these automatically, resetting
them to `failed_transient` with `next_eligible_at=now()`. A `Reconciler:
reclaimed wedged-running stage_state rows {"count":N}` line confirms it's
firing:

```bash
docker logs "$WORKER_CONTAINER" --since 5m 2>&1 | grep -E 'wedged-running|Reconciler' | head -10
```

Manual SQL fallback if the reconciler is unavailable:

```sql
UPDATE media_item_stage_state s
   SET status = 'failed_transient',
       last_error = '{"message":"manual_wedged_reclaim"}',
       next_eligible_at = now(),
       updated_at = now()
 WHERE s.status='running'
   AND s.updated_at < now() - interval '10 minutes'
   AND NOT EXISTS (
       SELECT 1 FROM task_history th
        WHERE th.id = s.last_run_id
          AND th.state IN ('pending','active','cancelling')
   );
```

---

## Recipe 9: Item never goes through a stage

**Symptom:** a media item is missing a stage row entirely, or the row is
`skipped_permanent` / `skipped_transient` despite seeming eligible.

**Likely causes:** the eligibility check currently evaluates false (no
probe yet, no linked file), so the sweep set `skipped_permanent`/
`'ineligible'`. This is recoverable: a heal flips it back to `pending` the
instant eligibility becomes true. Other causes: the applicability check
returned false at creation and no row was ever created; the item was
dismissed (`is_dismissed=true`); or the task's applicability doesn't cover
this media type.

### Diagnosis

```sql
-- 1. Does a row exist?
SELECT stage_id, status, skipped_reason, last_error
  FROM media_item_stage_state
 WHERE media_item_id = '<UUID>'
 ORDER BY stage_id;

-- 2. What's the item like?
SELECT id, media_type, has_audio, has_video, runtime_seconds, is_dismissed
  FROM media_items
 WHERE id = '<UUID>';
```

Cross-check against the stage's applicability and eligibility rule. For
example, an analysis stage requiring a probed video stream over 60 seconds
legitimately skips a movie, and legitimately disposes of a 45-second
episode as `'ineligible'`.

**Check it's in the authoritative coverage set:**

```bash
docker exec "$APP_CONTAINER" env | grep PIPELINE_COVERAGE_AUTHORITATIVE_STAGES
```

### Resolution

| Case | Action |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility check correctly returns false | No bug. Document it if confusing to future you. |
| Eligibility check is buggy | Needs a fix to the task definition itself. |
| Stage missing from the authoritative set | Add it to `PIPELINE_COVERAGE_AUTHORITATIVE_STAGES` (see the [environment variable reference](/reference/environment-variables/)). |
| Item was dismissed | Restore it via the admin UI; coverage re-seeds automatically. |
| Need to force-enqueue once | `INSERT INTO media_item_stage_state (media_item_id, stage_id, processing_version, status) VALUES ('<UUID>', '<stage>', <version>, 'pending') ON CONFLICT (media_item_id, stage_id) DO UPDATE SET status='pending', attempt=0, next_eligible_at=null;` |

---

## Recipe 10: Identity collision / "already running" rejection

**Symptom:** starting a run returns `{ deduped: true, existingRunId: ... }`
when you wanted a fresh run, or an admin retry is rejected with "identity
already taken."

**Likely causes:** the identity TTL (commonly 24h) on
`task:identity:<taskId>:<formula>` hasn't expired; an in-flight run already
holds that identity; or an idempotency-key collision on the unique index.

### Diagnosis

**Find the identity key.** The value is the holding `runId`; look it up in
`task_history`:

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" GET "task:identity:<taskId>:<formula>"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" PTTL "task:identity:<taskId>:<formula>"
```

**Find in-flight runs for the same identity:**

```sql
SELECT id, state, started_at
  FROM task_history
 WHERE task_id = '<task>'
   AND state IN ('pending','active','cancelling')
 ORDER BY started_at DESC LIMIT 5;
```

### Resolution

| Case | Action |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Stale identity key (holder is terminal) | `DEL task:identity:<taskId>:<formula>`. |
| In-flight run blocking | Wait for it to finish, or cancel it via `POST /api/v1/runs/{runId}/cancel`. |
| Need to force-fire ignoring identity | Use a different idempotency key as a last resort; manually clearing the key is riskier if the original run is still legitimate. |

---

## Recipe 11: "claimRun failed: state mismatch" in the error column

**Symptom:** a `failed` `task_history` row has `error.message = "claimRun
failed for run_XXX: state mismatch: expected pending got active"`.

**Meaning:** a worker died after claiming the run. BullMQ redelivered it, but
the next worker couldn't claim the still-active state. Exhausted retries make
the run terminal. Investigate the original worker crash; see
[BullMQ retry interaction](/architecture/task-system/#bullmq-retry-interaction).

### Diagnosis

```sql
SELECT id, owner_instance_id, started_at, completed_at, error
  FROM task_history
 WHERE error::text ILIKE '%state mismatch%'
   AND completed_at > now() - interval '1 hour'
 ORDER BY completed_at DESC LIMIT 10;
```

Many of these in a short window means a lot of workers died at once.
Investigate container restarts, out-of-memory kills, or a deploy in that
window.

### Resolution

The row is already terminal. If the underlying stage still needs to run
again, mark `media_item_stage_state` back to `failed_transient` (see Recipe
8); the next sweep retries it with a fresh run.

---

## Task Valkey is near its memory limit

**Symptom:** the Health page shows `OOM command not allowed when used
memory > 'maxmemory'`, or the task/coordination Valkey is above 80% of its
memory limit.

**Resolution:** if `TASK_CACHE_URL` is set, inspect that instance, not
`CACHE_URL`. It holds BullMQ jobs, task-run state, and distributed locks,
and must run `noeviction`. Treat 80% as a warning; raise RAM/`maxmemory`
before 95%. Never switch to an evicting policy.

First check for the known historic progress leak: a leaked
`task:run:active:*` hash has no `state` field, a live run always does:

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" --scan \
  --pattern 'task:run:active:*' | head -n 1
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" \
  HMGET 'task:run:active:<runId>' state progressLastReported
```

Only after deploying the progress-state fix, and only once confirmed,
remove it in bounded batches, repeating with the returned cursor until
`next-cursor` is `0`:

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" --raw EVAL \
"local s=redis.call('SCAN',ARGV[1],'MATCH','task:run:active:*','COUNT',ARGV[2]); local n=0; for _,k in ipairs(s[2]) do if redis.call('HEXISTS',k,'state')==0 then redis.call('UNLINK',k); n=n+1 end end; return {s[1],#s[2],n}" \
0 0 1000
```

`UNLINK` frees the hashes without blocking the queue. Never `FLUSHDB`, and
never delete other `task:*` keys. That removes live locks and queued work.

## Recipe 12: Backfilling accessibility metadata (CC / SDH / AD) after an upgrade

**Symptom:** accessibility fields on media streams (closed captions,
hearing-impaired subtitles, visual-impaired audio description) read as
absent for files probed before your instance gained support for detecting
them, and the media detail API omits those badges.

These fields populate during probing. New and edited files gain them
automatically; existing files require a re-probe for a library-wide backfill.

### Resolution: reuse the existing media-probe wipe action

The media-probe task's **wipe** action clears the probed timestamp across
files in batches so they re-enter the probe pipeline. No bespoke backfill
task is needed.

1. Trigger **wipe** from the Overview page (`/admin/tasks`; Media File
   Probe → wipe). It's a **full re-probe**, so run it off-peak on
   network-attached storage, and avoid a parallel mass-scan since one hung
   file read can wedge the whole scan.
2. Watch progress on the Overview page or via `task_history`, then
   spot-check:

   ```sql
   SELECT count(*) FILTER (WHERE has_closed_captions) AS cc,
          count(*) FILTER (WHERE is_hearing_impaired) AS sdh,
          count(*) FILTER (WHERE is_visual_impaired)  AS ad
   FROM media_streams;
   ```

Skip the full wipe unless you need library-wide badges promptly; existing files
otherwise gain them when next probed.

## Recipe 13: Task stays auto-paused in "half-open" with no run

**Symptom:** the task's auto-pause shows *Recovering* (`half_open`) or **Run now**
answers `503` with "Circuit breaker is half_open … circuit_open", but no probe run
appears in Runs.

### Diagnosis

On builds before 2026-10-07, opening the task page or reading
`GET /api/v1/tasks/{id}/state` after the cooldown took the circuit's one probe
slot (a 5-minute lock in Valkey) and moved it to `half_open` without starting a run.
Real runs were refused until the lock expired. Current builds read the state
without touching the circuit.

**Run now** against an open circuit returns `503` with the reason; a quota stop
returns `422`.

### Resolution

Wait up to 5 minutes: the next start after the lock expires claims the probe.
To resume immediately, use **Resume now** on the task page (or
`PUT /api/v1/tasks/{id}/state` with `{ "breaker": "enable", "force": true }`).

---

<span id="quick-reference-useful-sql--valkey--bash-snippets"></span>

## Command reference

### Postgres

```bash
docker exec "$PG_CONTAINER" psql -U lumastra -d lumastra -c "<SQL>"
```

Multi-line:

```bash
docker exec "$PG_CONTAINER" psql -U lumastra -d lumastra <<'SQL'
SELECT ...
SQL
```

### Valkey

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" <COMMAND>
```

### Queue depths at a glance

```bash
VPASS="$VALKEY_PASSWORD"
for cls in cpu io embedding maintenance ingest bulk analysis discovery; do
  prio=$(docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" ZCARD "bull:task:$cls:prioritized")
  active=$(docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" LLEN "bull:task:$cls:active")
  echo "$cls: prio=$prio active=$active"
done
```

### Active runs older than N minutes

```sql
SELECT id, task_id, state, owner_instance_id,
       started_at::timestamp(0),
       (now()-started_at)::interval(0)  AS age,
       (now()-heartbeat_at)::interval(0) AS hb_age
  FROM task_history
 WHERE state IN ('active','cancelling')
   AND started_at < now() - interval '30 minutes'
 ORDER BY started_at ASC;
```

### Find a run's BullMQ keys

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" --raw KEYS "bull:task:*<RUN_ID>*"
```

### Inspect a job hash

```bash
VPASS="$VALKEY_PASSWORD"
docker exec "$VALKEY_CONTAINER" valkey-cli --no-auth-warning -a "$VPASS" HGETALL "bull:task:<CLS>:<JOB_ID>"
```

`<JOB_ID>` format: `<taskId>~~<identity>#<runId>`.

---

## Anti-patterns: things not to do

- **Don't `UPDATE task_history` directly in production** unless cleaning up
 a known-zombie row. The orchestrator and reconciler write through atomic
 scripts, and concurrent direct writes cause state drift.
- **Don't `FLUSHDB` Valkey.** It wipes leader locks, identity keys, run-state
 hashes, log buffers, and every BullMQ queue. Boot recovery can rebuild most
 of it from Postgres, but it's disruptive. Prefer targeted key deletion.
- **Don't bypass the orchestrator to enqueue work directly into BullMQ.**
 Direct enqueues skip identity dedup, backpressure, the circuit breaker, and
 Postgres durability.

---

<span id="when-youre-stuck-on-something-not-covered-here"></span>

## Further diagnostics

Check **System → Health** (`/admin/system/health`) for subsystem liveness and
Postgres/Valkey health. Then inspect the logs for the affected role:

```bash
docker logs "$WORKER_CONTAINER" --since 10m 2>&1 | grep -iE '<keyword>'
docker logs "$APP_CONTAINER" --since 10m 2>&1 | grep -iE '<keyword>'
```

Both containers use the same image; `WORKER_MODE` controls their roles. For state
and recovery rules, see [Task system](/architecture/task-system/#reliability-mechanisms).

## Next

- [Task system](/architecture/task-system/)
- [Monitoring tasks and pipelines](/guides/task-monitoring/)
- [Background tasks on day one](/guides/task-basics/)
- [Environment variable reference](/reference/environment-variables/)
