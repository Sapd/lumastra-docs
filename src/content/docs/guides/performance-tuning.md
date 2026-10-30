---
title: Performance tuning
description: "Scale Lumastra for very large libraries: scan concurrency, database pools, Postgres shared memory, NFS mount options and Windows-client filename encoding, the libuv thread pool, worker parallelism, and leader-election timing."
sidebar:
  order: 4.3
---

Tune one bottleneck at a time while watching CPU, disk I/O, **System → Health**,
and **System → Cost & usage**. More concurrency helps only while capacity is idle.
Settings below are environment variables unless marked as host/runtime settings.

Two limits govern scan throughput:

- Match `LUMASTRA_SCAN_CONCURRENCY` to NFS `nconnect`; otherwise reads queue on
  one connection. See [NFS mount options](#nfs-mount-options-media-library).
- Allow enough `LUMASTRA_DB_POOL_TASK_MAX` connections for scanning plus other
  tasks. Across all replicas, total DB pools must remain below Postgres
  `max_connections`, with headroom for migrations and administration.

## Library scanning

| Variable | Default | Notes |
| --- | --- | --- |
| `LUMASTRA_SCAN_CONCURRENCY` | `8` | Files probed/imported in parallel per scan. **The #1 throughput knob on network storage.** Lower (`4`) on slow NFS/spinning disks; raise (`12`–`16`) on NVMe with spare CPU. Keep ≤ the task DB pool. |
| `SCAN_ENRICH_INLINE` | `false` | When off (default), TMDB/provider enrichment is **deferred to a background stage** so scanning stays fast. Set `true` only for **offline / no-network installs** that must fill metadata inline during the scan. |
| `LUMASTRA_SCAN_STAT_BATCH_SIZE` | `200` | How many files the scanner `stat()`s per triage batch. Rarely touched. Lower it only if very slow storage stalls on large batches. |

## Database connection pools

Lumastra splits one Postgres database into **four connection pools** so background work
can never starve user-facing requests (see
[Architecture decisions](/developers/architecture-decisions/)):

| Variable | Default | Pool (used by) |
| --- | --- | --- |
| `LUMASTRA_DB_POOL_WEB_MAX`   | `8` | User-facing web & API requests |
| `LUMASTRA_DB_POOL_TASK_MAX`  | `7` | Background tasks, scans, ingest |
| `LUMASTRA_DB_POOL_ADMIN_MAX` | `4` | Admin polling (separate so it never delays playback) |
| `LUMASTRA_DB_POOL_HEARTBEAT_MAX` | `2` | Task liveness heartbeats (separate so a busy scan can't starve them) |

Defaults sum to **21 connections per instance**, well under Postgres' default
`max_connections` of 100. For comparison, a setup with two web replicas, a worker and
the stream proxy uses about 55 connections.

- Raise `LUMASTRA_DB_POOL_TASK_MAX` on a **dedicated worker container**, since its
  web/admin pools sit idle, and keep it `≥ LUMASTRA_SCAN_CONCURRENCY + a few`.
- Pools are *per instance*, so across all replicas the sum of every pool must stay under
  Postgres `max_connections`. If you raise the pools or add replicas, raise
  `max_connections` on Postgres too, and leave headroom for migrations and `psql`.

## Postgres shared memory (`shm_size`)

Not an env var: a **compose/runtime setting**, but important enough to call out:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg18
    shm_size: 1gb # Docker's default /dev/shm is only 64 MB
```

:::danger[Required for large libraries]
Docker gives a container **64 MB** of `/dev/shm` by default. Postgres **parallel-query
workers** (which kick in on large libraries, e.g. the intro analyzer scanning tens of
thousands of stage rows) allocate shared-memory segments there and fail with
`could not resize shared memory segment … No space left on device` when it fills. Set
`shm_size: 1gb` on the Postgres service. (The shipped `docker-compose.example.yml` already
does.)
:::

## Postgres query planner (`shared_buffers`, JIT thresholds)

Also compose/runtime settings, not env vars, set as `-c` flags on the Postgres
`command:`. The shipped `docker-compose.example.yml` and `docker-compose.yml` both already
set these:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg18
    command: >
      postgres
      -c shared_buffers=${POSTGRES_SHARED_BUFFERS:-512MB}
      -c jit_above_cost=10000000
      -c jit_optimize_above_cost=50000000
      -c jit_inline_above_cost=50000000
```

**`shared_buffers`**: Postgres's own default (128 MB) is sized for tiny/shared hosting,
not a dedicated container. 512 MB is a safe floor for the library-browsing query patterns
Lumastra runs constantly. On a host with RAM to spare, raise `POSTGRES_SHARED_BUFFERS`:
2-3 GB is a reasonable target once your database reaches the multi-GB range (check with
`SELECT pg_size_pretty(pg_database_size(current_database()));`). It requires a Postgres
restart to take effect, since it's allocated at server startup and not reloadable.

:::caution[JIT can slow browsing]
Large-library browse queries can have inflated planner cost estimates that trigger
JIT compilation even when it costs more than executing the query. Production
measurements showed 4–19× overhead. The thresholds above avoid this for browsing
while retaining JIT for expensive analytics. They require no additional memory.
:::

## libuv thread pool

Node offloads filesystem, DNS, and crypto work to a small **libuv thread pool** (Node's
own default is 4; the Lumastra image raises it to **64**).

| Variable | Image default | Notes |
| --- | --- | --- |
| `UV_THREADPOOL_SIZE` | `64` | Threads for async file/DNS/crypto ops. |
| `LUMASTRA_FS_MAX_CONCURRENCY` | `24` | Max concurrent guarded filesystem ops, process-wide. |
| `LUMASTRA_FS_TIMEOUT_MS` | `15000` | Per-op timeout for guarded filesystem ops. |

Filesystem operations share the pool with DNS, including hostname resolution for
Postgres and Valkey. Blocked NFS reads can exhaust it, causing connection timeouts
and failed task heartbeats. Keep `LUMASTRA_FS_MAX_CONCURRENCY` comfortably below
`UV_THREADPOOL_SIZE` to reserve capacity for connection setup. Guarded filesystem
operations use `LUMASTRA_FS_TIMEOUT_MS` to bound waiting.

Raise both concurrency and the pool only when storage can handle more parallel
I/O. Leave the filesystem cap low on slow or unreliable storage; additional pool
threads also consume memory.

## Background-job parallelism

Heavy jobs (trickplay, intro/credits analysis, music analysis, scans all spawn
`ffmpeg`/`ffprobe`) run under per-task queues governed by a **per-resource-class budget**.
Each class has its own cap: raise only your bottleneck, lower them all on a small host:

| Variable | Default | Class |
| --- | --- | --- |
| `LUMASTRA_CONCURRENCY_CPU` | _auto_: `floor(cores/2)`, clamped 1–6 | Heavy ffmpeg (trickplay, intro analyzer) |
| `LUMASTRA_CONCURRENCY_IO` | _auto_: `cores`, clamped 4–12 | File-scan, probe, chapter-sync, image-sync, watch-sync (I/O-bound) |
| `LUMASTRA_CONCURRENCY_INGEST` | `2` | "New file just arrived" fast-path (probe, image-sync) |
| `LUMASTRA_CONCURRENCY_BULK` | `3` | Mass enrichment / API-bound (TMDB, MusicBrainz, series-sync) |
| `LUMASTRA_CONCURRENCY_EMBEDDING` | `1` | AI embedding generation (provider-rate-limited) |
| `LUMASTRA_CONCURRENCY_ANALYSIS` | `1` | Long-running analysis (intro/credits chromaprint) |
| `LUMASTRA_CONCURRENCY_MAINTENANCE` | `1` | Scheduled housekeeping |
| `LUMASTRA_CONCURRENCY_DISCOVERY` | `1` | Discovery-catalog work |

CPU and I/O defaults use the detected CPU budget, including a container's `cpus:`
limit. Each ffmpeg job can use several threads, so raise caps gradually and watch
CPU and storage load. Explicit environment or admin settings override defaults.
The global filesystem cap still limits simultaneous filesystem operations.

:::note[Classes fold into shared pools]
Background work runs on per-task queues whose concurrency is capped by a **physical** pool
budget. `ingest` and `bulk` fold into the **`io`** pool and `analysis` folds into **`cpu`**,
and the folded caps are **summed**: the effective CPU budget is
`LUMASTRA_CONCURRENCY_CPU` + `…_ANALYSIS`, and the I/O budget is
`…_IO` + `…_INGEST` + `…_BULK`. So the simplest way to give CPU-bound analysis (intro/credits,
trickplay) more parallelism is to raise **`LUMASTRA_CONCURRENCY_CPU`**.
:::

## Capping total CPU (concurrency limits jobs, not threads)

Concurrency caps limit jobs, not their threads. With `-threads 0`, even one
analysis job can saturate the host. On shared hardware, set per-process thread
caps and a worker container CPU ceiling to reserve capacity for playback.

| Knob | Where | Effect |
| --- | --- | --- |
| `LUMASTRA_FFMPEG_THREADS` | env | Threads per **transcode** ffmpeg. `0` = all cores. |
| `ANALYSIS_FFMPEG_THREADS` | env | Threads per **analysis** ffmpeg op (chromaprint, black-frame, silence). **Default `0` = auto = all cores**: set it (e.g. `4`) on a shared box, or a single analysis job alone can saturate the host. |
| per-task **CPU threads** | Admin → task settings | The ML / audio tasks (music sonic embeddings, clustering, map) expose a thread cap, and the embedding sidecar honours `SONIC_EMBEDDER_THREADS`. Keep them modest (e.g. `4`) on shared hardware. |

Even with per-process thread caps, the surest protection for the **serving path** is a
**hard CPU ceiling on the worker container**, a compose/runtime setting, not an env var:

```yaml
services:
  worker:
    cpus: 10 # never use more than 10 cores, whatever runs inside
    cpu_shares: 512 # …and yield to the web / Postgres containers under contention
```

- **`cpus`** is a hard ceiling: the worker can spawn all the multi-threaded ffmpeg it likes
  and still never exceed it. On a shared box, **~half the host** is a sound default: it
  guarantees headroom for playback / API and Postgres no matter how heavy the backlog.
- **`cpu_shares`** is *relative weight* (Docker default `1024`). Give the worker (and any
  analysis/embedding sidecar) a lower share so that **under contention** CPU goes to
  user-facing work first; when the box is idle they still use everything.

:::caution[`nice` does not cross containers]
Lowering a worker process's `nice` value has **no effect** relative to processes in *other*
containers on a modern **cgroup-v2** host: the kernel schedules between cgroups by their CPU
weight, not per-process nice. Use `cpus` / `cpu_shares` (and the thread caps above), never
`nice`, to keep background work from starving the serving path.
:::

:::tip[Symptom → lever]
Load average ≫ core count while *container* CPU% looks modest is **I/O wait**: raise
`nconnect` / lower scan concurrency. Load high **and** a container pegged near
`cores × 100%` is genuine CPU: cap the per-process threads and set `cpus`. A single task
that alone saturates the host is almost always `ANALYSIS_FFMPEG_THREADS=0` or an un-capped
ML task.
:::

## NFS mount options (media library)

Scanning is **read-heavy with many small concurrent reads** (ffprobe reads each new file's
header, plus a `stat` per file). NFS defaults leave a lot on the table. Mount your library
like:

```text
# /etc/fstab
server:/path/to/library  /data/media  nfs  vers=4.2,nconnect=16,rsize=1048576,wsize=1048576,hard,noatime,nodiratime,nocto,proto=tcp  0 0
```

| Option | Why it matters for scanning |
| --- | --- |
| `nconnect=16` | **The big one.** Opens 16 parallel TCP connections so concurrent reads run in parallel instead of queuing on one. Set it **≈ `LUMASTRA_SCAN_CONCURRENCY`**. Requires kernel ≥ 5.3, and is **per server IP** (all mounts to that server share the pool). |
| `vers=4.2` | Newest NFS, better caching/efficiency than v3 / v4.0. |
| `rsize`/`wsize=1048576` | 1 MB transfers (usually auto-negotiated, but pin it). |
| `noatime,nodiratime` | The scanner touches every file; avoids an access-time write per read. |
| `nocto` | Skips the close-to-open re-validation `GETATTR`, fine for media that doesn't change under you, and noticeably cuts metadata round-trips on a read-heavy scan. |
| `hard` | Retry if the server stalls. **Never use `soft`** for a library: it can return truncated/garbage reads on a timeout. |

Notes:

- The media mount can be **`ro`** *only with the default* **`METADATA_STORAGE_LOCATION=central`**:
  then extracted artwork/frames go in `/config` and nothing is written to the library. If
  you set **`alongside`** (or `alongside-prefer`), the worker writes those files **next to
  your media**, so the mount **must be writable**. Check your setting before going read-only.
- For a **very static** library, `actimeo=600` lengthens attribute caching to cut repeated
  `stat` calls, at the cost of slower new-file detection. Skip it if you add files often.

## Windows NFS clients and filename encoding

Microsoft's built-in NFS client writes filenames in the Windows ANSI codepage,
which can produce invalid UTF-8 names on Linux. If only Windows-written filenames
are affected, fix the write path before repairing existing names. Prefer SMB for
Windows writers; Linux/container readers can continue using NFS.

See [Windows media shares and filename encoding](/guides/windows-media-shares/)
for client alternatives, mixed SMB/NFS share settings, and `convmv` repair commands.

## Topology

Set once per deployment:

| Variable | Default | What it does |
| --- | --- | --- |
| `WORKER_MODE` | `disabled` for web | Start scripts set each role: `start.sh` serves web requests; `start-worker.sh` runs the dedicated lean task host with `enabled`. Run exactly one worker (see [Docker](/guides/deploy-docker/) / [Kubernetes](/guides/deploy-kubernetes/)). |
| `INSTANCE_ID` | hostname + suffix | Stable, human-readable node name in the admin cluster view. Set one per replica. |

### Advanced: leader election & run-state internals

:::caution[Most deployments never touch these]
These are internal task-system timing knobs with safe defaults. Change them only for the
specific case below. Wrong values can cause unnecessary leadership churn.
:::

| Variable | Default | What it does |
| --- | --- | --- |
| `LUMASTRA_ORCHESTRATOR_LEADER_TTL_MS` | `15000` | Per-class leader-lock TTL. |
| `LUMASTRA_ORCHESTRATOR_LEADER_RENEW_MS` | `5000` | How often the leader renews the lock (must be `<` TTL). |
| `LUMASTRA_RUN_STATE_TTL_ACTIVE_MS` | `900000` (15 min) | Zombie self-heal window: a crashed run is reclaimed roughly this long after its last heartbeat. |

The **one** case worth tuning: under a fresh-install **cold-start drain** (a big library
with intro/trickplay analysis, embeddings, and sync all running at once) a single worker's
event loop can stall for several seconds. At the tight default 15 s / 5 s that flaps
leadership and produces false **"no leader" / "no heartbeat" CRITICAL** alerts. On a
**single heavy worker** (which has no failover target anyway) raise both, e.g.
`LUMASTRA_ORCHESTRATOR_LEADER_TTL_MS=30000` and `LUMASTRA_ORCHESTRATOR_LEADER_RENEW_MS=10000`,
to tolerate ~20 s stalls.

## A starting point for a very large library

A **dedicated worker container** on a 16-core host with an NFS library on fast storage:

```dotenv
# Scan & I/O parallelism (match nconnect on the NFS mount)
LUMASTRA_SCAN_CONCURRENCY=16
UV_THREADPOOL_SIZE=32

# Give background work more of the database (raise Postgres max_connections to match)
LUMASTRA_DB_POOL_TASK_MAX=20

# More parallel ffmpeg / analysis jobs (16+ cores only).
# The cpu pool also absorbs the analysis class (intro/credits, trickplay).
LUMASTRA_CONCURRENCY_CPU=8

# Single worker under heavy cold-start: don't flap leadership
LUMASTRA_ORCHESTRATOR_LEADER_TTL_MS=30000
LUMASTRA_ORCHESTRATOR_LEADER_RENEW_MS=10000
```

…with `shm_size: 1gb` on Postgres and the NFS mount above (`nconnect=16`). Then watch a
real ingest: if Postgres connections, CPU, or disk saturate, ease back; if they don't and
the backlog still drains slowly, nudge further.

## Small or constrained hosts

For a small library or a host under ~4 GB, set:

```dotenv
LUMASTRA_LOW_RAM_MODE=true
```

This caps the Node.js heap on the web and worker processes and reduces the worker's
Valkey connection count. It does **not** change job scheduling, fairness, or the
per-task-queue isolation that keeps a stuck task from wedging others (see
[Per-resource-class queues](/developers/architecture-decisions/#one-isolated-queue-per-task-type-budgeted-by-resource-class)).
It can remain enabled permanently on small hosts.

### Measured on a 4 GB host

A host with 4 GB RAM and 2 vCPUs, no swap, low-RAM mode on and the default example
compose file, handled a small library (a few movies and about 200 music tracks) like this:

- **Memory.** All containers together peaked at about 2.6 GB working set. No container
  was killed for lack of memory and the host never swapped.
- **Building from source needs more.** Compiling the image on a 4 GB host stalled for lack
  of memory and finished only with temporary swap. Pull the published image instead, or
  build elsewhere.
- **First enrichment.** Analysing the 200 tracks took about 40 minutes after the scan.
  Browsing stays responsive meanwhile; the page loads were well under a second.
- **CPU-only transcoding.** 1080p to 720p ran at about 4 times real time when idle, and
  2 to 3 times while background work was running. 4K to 1080p ran at about 0.8 times
  real time, which is too slow for smooth playback.

So on 2 vCPUs, 4K sources need **direct play**, a [GPU](/guides/gpu-transcoding/) or more
cores. If your devices can't play the 4K file directly, keep a smaller copy of it.
The optional sonic sidecar is sized for 6 GB and does not fit on a 4 GB host.

## See also

- [Deploy with Docker](/guides/deploy-docker/) · [Deploy on Kubernetes](/guides/deploy-kubernetes/): topology, the worker split, and the second `noeviction` Valkey (`TASK_CACHE_URL`)
- [Hardware (GPU) transcoding](/guides/gpu-transcoding/): offload transcoding from the CPU
- [Environment variables](/reference/environment-variables/): the full variable reference
