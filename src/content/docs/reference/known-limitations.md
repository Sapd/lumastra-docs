---
title: Known limitations
description: Deliberate trade-offs, platform limits and unfinished work in the current release. Read before you deploy.
sidebar:
    order: 3
---

Read this before you deploy. It lists the trade-offs we chose, the limits of some
platforms, and the things that aren't finished yet, so none of them surprises you
later. If one of them rules Lumastra out for your setup, better to know now.

None of this is a bug report. Bugs go to
[GitHub issues](https://github.com/sapd/lumastra/issues).

## Early release

**Lumastra is at v0.1.** It runs real libraries every day, but it's an early release.
Expect rough edges and bugs, especially on hardware and setups we haven't tested yet.
Back up `/config` and the database before upgrading, and please
[report what breaks](https://github.com/sapd/lumastra/issues).

The iPhone, iPad and Apple TV apps have their own version numbers, which started at 1.0.1.
That number says nothing about maturity: the apps are as early as the server.

**No new features are planned before 1.0.** Lumastra is built by one person who uses it
every day, and it has to work well for that setup first. Until a 1.0 release the focus is
on fixing bugs and polishing what's there, based on feedback. Feature ideas are still
welcome in [Discussions](https://github.com/Sapd/lumastra/discussions/categories/features),
but replies and fixes may take a while. If the number of issues grows, features may later
be split into a supported core and best-effort areas that are fixed when time allows.

## Deployment shape

**There is no single-container mode.** Lumastra needs **PostgreSQL 17 or newer with
the `pgvector` extension** and **Valkey (or Redis)** running next to it. PostgreSQL 16
doesn't work, because the schema uses `transaction_timeout`, which only exists from
version 17. Start from `docker-compose.example.yml`, which sets up both; see
[Deploy with Docker](/guides/deploy-docker/).

**`/config` must survive a container restart.** It holds `master.key`, created on first
boot. That key encrypts stored secrets and, unless you set `JWT_SECRET` yourself, is
also where the token-signing secret comes from. Lose it and every phone, TV app and
browser is signed out, and saved secrets can't be decrypted any more. It's the most
important thing to back up; see [Backup & recovery](/guides/backup-recovery/).

**Image tags are not equivalent.** Release tags (`:stable`, `:latest` and version tags
such as `:0.1.0`) are built for `linux/amd64` **and** `linux/arm64`. `:edge` follows
every commit to `main` and is **amd64 only**; on an ARM host it fails with
`exec format error`. The reference compose file uses `:stable`.

**x86-64 hosts need x86-64-v2** (SSE4.2, POPCNT) for the `sharp` image library. In a
VM, give it a modern CPU model (`host-passthrough`, or at least `Nehalem`).

## What is unavailable on arm64

The core of the media server works on arm64: browsing, streaming, transcoding,
metadata and recommendations. Three optional extras don't. Each one logs a warning
instead of failing:

| Feature                                      | On arm64    | Why                                               |
| -------------------------------------------- | ----------- | ------------------------------------------------- |
| Music BPM / mood analysis                    | unavailable | Essentia publishes no arm64 extractor build       |
| Sonic-similarity sidecar (`--profile sonic`) | unavailable | its PyTorch CUDA base image has no arm64 manifest |
| Intel QSV / VA-API hardware transcoding      | unavailable | Intel's GPU runtime is an amd64-only apt repo     |

Software transcoding works normally on arm64, and so does any hardware path the board
itself offers through the `jellyfin-ffmpeg` build that is downloaded at runtime.

## Docker Desktop on Windows

**Music BPM / mood analysis is off under Docker Desktop.** The Essentia extractor
fails its startup self-test (it crashes) inside Docker Desktop's WSL2 VM on Windows.
Lumastra logs `Essentia self-test FAILED` once and skips the analysis; the music
library, playback and the CLAP "sounds like" features are unaffected. The admin
pipeline marks those tracks as skipped with "Audio analysis is unavailable on this
host"; on a host where the extractor works they are picked up again after a restart.

## Scaling

**The web tier scales out; the worker doesn't.** Run as many web replicas as you like
(`WORKER_MODE=disabled` on each) plus one dedicated worker container
(`WORKER_MODE=enabled`). The shipped `docker-compose.example.yml` runs all-in-one by
default and has this split as a commented-out "SCALE-UP" section. Give the worker more resources rather than more copies: it holds the leader lock
for background tasks, and while a second worker wouldn't poll Jellyfin twice, running
more than one worker isn't something we test or recommend.

**Several web replicas need requests for one playback session to reach the same
replica.** HLS transcode state lives on the replica that started a session. On
Kubernetes the Helm chart ships a router that does this by hashing the stream token or
playback session id. With any other setup, keep each client on one replica with cookie
or source-IP affinity. **Round-robin breaks playback.** A request that lands on the wrong
replica gets a `503` until the session is taken over, about 15 seconds later.

**`/config` and the transcode directory must be shared** when you run several pods. The
worker writes artwork and trickplay images that the web pods serve, so `/config` needs a
ReadWriteMany volume (or one node). A shared transcode volume lets a pod take over a
session and serve the segments already written.

**Keep task data from being evicted.** The task system keeps its authoritative state
(locks, run state, BullMQ jobs) in Valkey keys with an expiry time, on the same Valkey
instance as the app cache by default. Any eviction policy can pick those keys,
`volatile-lru` included, and a job in progress could then be picked up again and run
twice. So a single Valkey runs with `--maxmemory-policy noeviction` and **no**
`--maxmemory` cap, as the shipped compose file does: cache entries expire on their own.
If you need a hard memory limit, run a second Valkey for the cache with `--maxmemory`
and `allkeys-lru` (`CACHE_URL`), and keep the task keys on the `noeviction` one
(`TASK_CACHE_URL`). The admin Health page warns when the instance holding task data
uses an evicting policy.

**Kubernetes support is in beta.** Lumastra ships a Helm chart, and lumastra.org's own
instance runs on it. It is the only production install so far. Docker Compose stays the
main supported way to run Lumastra, and Kubernetes support is best-effort until 1.0. The
manifests in [`deploy/k8s/`](https://github.com/sapd/lumastra/tree/main/deploy/k8s) are
minimal examples. See [Deploy on Kubernetes](/guides/deploy-kubernetes/).

## Set `TRUSTED_PROXY_IPS` if you run behind a reverse proxy

See [Configuration](/guides/configuration/) for where the variable lives.

Most people know this variable from forward auth: it decides which machines may send
identity headers, and without it forward auth doesn't work at all. It also has a second
effect that is easy to miss: it decides whether Lumastra believes `X-Forwarded-For` for
the **client's IP address**.

If it's empty, everything that works per client address sees only your proxy's
address:

- per-IP rate limits and failed-login counters give **everyone behind the proxy one
  shared budget**, so one noisy client can hit the limit for everybody;
- a personal access token restricted with `allowed_ips` is compared against the
  **proxy's** address instead of the real client's, so the token is refused.

Neither is a security hole; the security-relevant checks use the address that can't be
forged. But both are coarser than you'd want, and the token case looks like a broken
token rather than a missing setting. Set `TRUSTED_PROXY_IPS` to your proxy's address
and both work per client again.

## Performance on large libraries

Browsing isn't optimised yet, and on a large library that's the first thing you'll
notice. Three paths do more database work than they should:

- **Poster and artwork requests.** Each image request runs its own access check.
  Metadata and artwork lookups are cached in memory for 5 minutes, so a repeated
  request is fast, but a grid of 40 cards with a cold cache still makes 40+ lookups
  against a web connection pool limited to 8.
- **Genre rows on the browse page.** Up to twelve JSONB scans per page load.
- **A–Z browsing.** An unbounded `COUNT(*)` over the filtered items plus a deep
  `OFFSET` query with a subquery per row.

We haven't published latency numbers yet, because we'd rather say so than quote a figure
we haven't measured on a realistic library. If browsing feels slow, this is why, and
it's being worked on. You don't need to open an issue for it unless you see something
worse than "slow", such as timeouts.

## Diagnostics and error reporting

**The apps report errors to your server, on by default.** The iOS, tvOS and web apps
send crash reports, app hangs, JavaScript errors and counts of failed API calls to your
own server. Playback problem reports are always recorded, whatever that setting is.
Everything is redacted on the server before it's stored (auth headers, e-mail addresses
and anything that looks like a credential are removed), and each user has a daily size
and row limit. Admins review reports under Admin → Users → Client Diagnostics, filtered
by kind, platform, user and time. Each report also shows a **reference id** on the error
page (a line starting with `REFERENCE:`), so a bug report can be matched to its row. See
[Client diagnostics](/developers/client-diagnostics/) for the details, what gets
reported, and how to turn it off (`FEATURE_CLIENT_DIAGNOSTICS`).

**Server errors (5xx) show a generic message in the UI on purpose.** The details are in
the server log and, for reported client errors, in the matching diagnostics row, under
that reference id.

**An uncaught exception is logged and the process keeps running** instead of
restarting. That keeps one bad code path from taking down the whole process, but the
process may carry on in an inconsistent state. If you see an `uncaughtException` in the
logs, restart the container.

**Version strings differ by image.** A release image reports a clean version such as
`v0.1.0`. Images built from `main` report a commit SHA instead, because there's no
release tag on that branch. Either is fine in a bug report.

## Hardware transcoding

Hardware transcoding is supported on **Intel** (Quick Sync / VA-API), **NVIDIA**
(NVENC) and **AMD** (VA-API). Intel runs the developers' own server. Before 0.1 we also
tested an NVIDIA GeForce RTX 3090 (Docker Desktop on Windows, driver 617.14) and an AMD
Radeon 760M (Ryzen 5 8600G, Linux) with H.264, HEVC, HDR10, Dolby Vision, AV1 and
burned-in PGS subtitles. The [GPU transcoding guide](/guides/gpu-transcoding/#tested-hardware)
lists what ran where and how fast. Other GPU generations and drivers may behave
differently. Please include the diagnostics export when you report a problem. Software
transcoding always works as a fallback.

**On AMD, HDR to SDR leans on the CPU.** AMD's Linux driver can't tone-map HDR, so when a
client needs SDR from an HDR source, decoding and tone-mapping run on the CPU and only
the encode uses the GPU. A 6-core Ryzen handles two or three 4K HDR streams like this at
once. Clients that play HEVC keep HDR, and that path stays on the GPU.

**10-bit H.264 is decoded on the CPU.** No GPU has a hardware decoder for it. The encode
still runs on the GPU.

**Burned-in image subtitles use the CPU.** When a client can't show PGS or VobSub
subtitles itself, Lumastra draws them into the picture. That step, and decoding the
video (plus tone-mapping for HDR), runs on the CPU on every GPU, and an HDR source is
delivered as SDR. The encode still uses the GPU. A 4K HDR film with burned-in subtitles
ran at 3× real time or faster on both test GPUs.

**Seeking far ahead in a slow transcode can take a while.** When the server transcodes
slower than about 9× real time (CPU-only servers, or HDR to SDR on AMD), jumping up to
about 90 seconds ahead waits for the encoder to reach that point instead of restarting
there. That can take 10–20 seconds, and when the encoder needs longer than about
10 seconds to get there the jump can fail. On a fast GPU this isn't noticeable.

**Direct play isn't the goal at any price.** If you tune your library so every file
direct-plays everywhere, Lumastra won't reward that as much as you might expect.
Remuxing into HLS (repackaging video and audio without re-encoding them) is a normal,
cheap path, and it's what keeps audio-track and subtitle switching, seeking and
multiple languages reliable on Apple devices, in browsers and on other clients. What Lumastra avoids is re-encoding the
video when the device could decode it.

## Live TV

**No recording (DVR) yet.** Live TV is for watching channels with a programme guide;
recording isn't available.

## Apps

**The Apple apps need HTTPS.** The iPhone, iPad and Apple TV apps only connect to a
server on HTTPS with a certificate the device trusts. Plain HTTP and self-signed
certificates don't work.

**Watch Together on iPhone and iPad.** Sessions work between the web app and the Apple
TV app; the iPhone and iPad app can't join a session yet.

**Other listeners' positions are web-only.** Audiobooks play in the web app and in the
iPhone, iPad and Apple TV apps, but seeing where other listeners are in the same book only
works on the web for now.

## Integrations

**Jellyfin is optional and only syncs in the background.** No Lumastra feature needs
Jellyfin. When sync is on, users are matched by username, so a Lumastra username must
match the Jellyfin one.

**Media on S3 or other object storage: new files aren't picked up right away.** The live
file watcher relies on file-system events, which a mounted bucket doesn't send. Use a
scheduled scan instead.

---

_If something here is out of date, that's a bug in this page. Please [open an issue](https://github.com/sapd/lumastra/issues)._

## Next

- [Client diagnostics](/developers/client-diagnostics/)
- [What Lumastra sends where](/reference/data-flows/)
- [Deploy with Docker](/guides/deploy-docker/)
- [Configuration](/guides/configuration/)
