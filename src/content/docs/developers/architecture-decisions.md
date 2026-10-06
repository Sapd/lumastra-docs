---
title: Architecture decisions
description: The notable design choices behind Lumastra, and the reasoning and trade-offs behind each.
sidebar:
  order: 3
---

These are the decisions that most shape the codebase: what was chosen, why, and
what it costs. Many are enforced by custom ESLint rules so they don't silently
erode (see the [zero-warning lint policy](/developers/local-development/)).

## Data & types

### Query modules and a three-tier database, not an ORM

Database access flows through three tiers: **query modules** (pure SQL functions
taking `sql` as their first argument, no side effects), **services** (transactions
and multi-table writes), and **service managers** (business-logic orchestration).
There is no ORM, and new methods may not be added to the legacy `Database` class.

**Why:** direct SQL gives explicit query control and zero ORM overhead, and makes
it easy to add indexes for the exact query shapes used. ORMs generate queries nobody
wrote: extra joins, N+1 lookups and SQL that is hard to trace back to the code. When a
query shows up in `pg_stat_statements` or a slow-query log, the same SQL is in the
source, so it can be found with a search and run directly with `EXPLAIN`. Each query
also has one home: more than 200 query modules, grouped by area, with integration tests
that run them against a real PostgreSQL with `pgvector` (over 500 integration test files
in total). A broken or changed query fails in CI before it ships. Passing `sql` as a
parameter makes every query trivially unit-testable and reusable across routes and
services. The choice was reinforced by watching the old monolithic class grow past
4,000 lines of mixed concerns.

**Trade-off:** every query module carries integration tests, transactions are
explicit (`sql.begin()`), and there's no ORM "magic": that's the point.

### PostgreSQL only, with no database abstraction

Lumastra runs on PostgreSQL 17 or newer with `pgvector`, and nothing else. There is no
SQLite mode and no adapter layer for other databases.

**Why:** the app relies on PostgreSQL features in hundreds of places: `pgvector` HNSW
indexes for recommendations, semantic search and music similarity; `pg_trgm` and
`unaccent` for fuzzy search; full-text search; JSONB; advisory locks and
`FOR UPDATE SKIP LOCKED` in the task system; triggers that emit pipeline invalidation
events; and `LISTEN`/`NOTIFY`. Several web replicas and a worker write concurrently,
which SQLite's single-writer model handles poorly. An abstraction over several databases
can only use what they all have in common, so it would cost these features or their
performance, and every query would need testing on every backend. One maintainer can't
keep that working.

Supporting several databases also wouldn't give admins much. The database ships as a
container next to the app, so whichever database it is, nobody installs or tunes it by
hand. The only real difference for an admin is how backups work, and
[Backup & recovery](/guides/backup-recovery/) covers that for PostgreSQL.

**Trade-off:** a PostgreSQL server is required. The reference compose file starts one,
so a normal install doesn't need any database setup.

### Composite keys `(provider_id, media_type)` for every external ID

External IDs from TMDB or IMDB are never used as bare keys; lookups always combine
the ID with the media type.

**Why:** external IDs collide across types. TMDB ID `1429` is both a movie *and* a
TV show, and a bare ID as a key produces silent identity mismatches. Writes go
through `CatalogService.upsertExternalId()`, and an ESLint rule blocks direct
`external_ids` writes.

**Trade-off:** every lookup takes two parameters instead of one. That friction
removes a whole class of identity bugs.

### Zod schemas as the single source of truth

API shapes are defined once as Zod schemas; TypeScript types are `z.infer<>`
re-exports, and the OpenAPI spec is generated from the same schemas.

**Why:** runtime validation, static types, and API docs never drift because they
all come from one definition. `.optional()` is preferred over `.nullable()` for
cleaner cross-platform client generation.

**Trade-off:** schema changes require re-running OpenAPI generation, and every type
is a two-step (define schema → infer type).

### UUID-first internal IDs

The internal `media_items.id` UUID is the primary identifier end-to-end. Middleware
resolves any incoming format (bare UUID, composite `tmdb:550:movie`, Jellyfin UUID)
to one internal ID at the edge.

**Why:** a single stable key is correct for joins, cache keys, and user-state
tables; the rest of the system never handles ID-format polymorphism.

**Trade-off:** external input must be resolved once at the boundary, and the UUID
travels through response payloads.

## Auth & access

### Three coexisting auth methods; forward-auth headers are fail-closed

Lumastra supports built-in username/password login, forward auth via a reverse proxy /
identity provider, **and** OIDC (Lumastra as the OpenID Connect client), and all three
coexist. Identity resolves in a fixed order: a valid session cookie (built-in or OIDC)
first, then trusted forward-auth headers, with a "proxy wins on username mismatch" rule
so a stale cookie can't outlive a proxy-level logout. When forward auth is used,
Lumastra reads identity headers. If the configured trusted-proxy range is unset,
those headers are **discarded** and the request is treated as unauthenticated.

**Why:** the original forward-auth behaviour was fail-open, so anyone who could set a
header got admin. Fail-closed treats a forged header from an untrusted peer as
anonymous. Forward auth and OIDC are equally supported: forward auth fits stacks already
built around a forward-auth proxy, OIDC gives the same central management without one,
and built-in login exists so neither is a hard requirement. OIDC and built-in share
one session-cookie path, so the per-request hot path stays unchanged. Admin is uniform:
group membership (forward-auth groups or the OIDC groups claim) matched against
`ADMIN_GROUPS`, with manual promotion as a pinned override.

**Trade-off:** if you use forward auth you **must** set `TRUSTED_PROXY_IPS` (or opt
into `LUMASTRA_TRUST_ANY_PROXY` on a single host), or forward-auth sign-in fails; and a
forward-auth proxy in front of OIDC must allowlist the `/auth/oidc/*` paths. See
[Authentication](/guides/authentication/).

### Access-denied returns 404, not 403

When a user requests media they can't see (wrong library or age policy), the
response is `404`, not `403`.

**Why:** a `403` confirms the item exists, enabling enumeration. A `404` makes
"doesn't exist" and "exists but hidden" indistinguishable.

**Trade-off:** developers must remember a `404` from a mutation route can mean
"access denied."

### Native apps sign in with the OAuth device flow, not passwords

The iPhone, iPad and Apple TV apps use the OAuth 2.0 device authorization grant: the
app shows a short code, the user approves it in a browser, and the app receives its own
access token (one hour by default) plus a refresh token. There is no password field in
the apps and no Quick Connect-style pairing for them.

**Why:** the approval happens in a normal browser session, so it goes through whatever
login the server uses: built-in accounts, OIDC, or a reverse proxy doing SSO. A
password field in the app would only work for built-in accounts and would bypass the
identity provider entirely. Each device also gets its own token, so one TV can be signed
out without touching the others.

**Trade-off:** signing in needs a second device with a browser, and the public API
(`/api/v1`) has to be enabled for the apps to work at all.

## Task system & reliability

### Postgres is the source of truth; Valkey is a cache

All run and user state is authoritative in Postgres; Valkey holds TTL'd hot state,
queues, and locks; BullMQ is a delivery mechanism, not the state owner.

**Why:** Valkey evicts under memory pressure, so anything correctness-critical
(e.g. daily run quotas) lives in Postgres with atomic writes. Worker crashes and
queue resets are safe because the real state survives in Postgres.

**Trade-off:** terminal-state writes need a Postgres round-trip; a pending-write
buffer drains when Postgres is briefly unavailable.

### One isolated queue per task type, budgeted by resource class

Every background task type (file scanning, thumbnail generation, metadata sync,
embeddings, etc.) gets its own BullMQ queue and worker, so a single task's jobs can
never be blocked behind another task's backlog. Each task's concurrency is then
capped by a shared budget semaphore for its resource class (`cpu`, `io`, `embedding`,
`maintenance`, `discovery`), so the classes bound *total* resource usage without
merging unrelated tasks into one queue. Three additional values (`ingest`, `bulk`,
`analysis`) are legacy fairness-lane classes kept as a compatibility shim. They're
deprecated in favor of their physical class (`ingest`/`bulk` → `io`, `analysis` →
`cpu`) plus a per-task concurrency quota, and a plugin using one logs a migration
warning.

**Why:** an earlier design shared one queue per resource class, and hit real
starvation incidents: a wedged sync holding every `io` slot and starving "a new
file just arrived," or hundreds of trickplay jobs blocking intro analysis for hours.
Per-task queues fix that at the root. A hung job (e.g. a stalled NFS read during a
file scan) can only ever occupy its own task's slots.

**Trade-off:** dozens of queues running in one process is real, unavoidable memory
overhead. Each queue needs its own dedicated Valkey connections for blocking pop
and event notifications, which can't be shared no matter how the client connections
are pooled. This is the main reason the worker's memory floor is higher than a
single-queue design would need; see [Memory](/start/quick-start/#memory) and
`LUMASTRA_LOW_RAM_MODE` in [Performance tuning](/guides/performance-tuning/#small-or-constrained-hosts).

### Invalidation events come from database triggers, not app hooks

Pipeline invalidation events are emitted by PostgreSQL triggers into an
`event_outbox` table and drained by a leader-elected dispatcher, not by
application call sites.

**Why:** the row transition *is* the event, so invalidation is impossible to
forget. The motivating bug was 100k+ episodes stuck forever because one of several
file-attach call sites didn't fire a lifecycle hook.

**Trade-off:** triggers can't read env vars (a `feature_flags` table gates them),
and worst-case invalidation latency is ~90 seconds.

### A per-item × per-stage coverage table

Every `(media_item, stage)` pair is tracked in Postgres with status and eligibility,
replacing ~12 hand-rolled backlog predicates spread across task files.

**Why:** timer-based polling couldn't express *why* a stage was skipped or
distinguish transient from permanent failure. The table makes re-runs deterministic
and observable.

**Trade-off:** stages that write per-file rather than per-item need special handling
(the table's granularity is per-item).

### Three-signal orphan classification

A run is only declared dead if **all three** signals agree: its BullMQ job is gone,
its Valkey live hash is absent, and its owner's cluster heartbeat has expired.

**Why:** any single signal produces false positives. A stray heartbeat write or a
worker briefly behind on renewal would otherwise get a live run killed.

**Trade-off:** a crashed run can stay `active` for up to a few minutes before the
reconciler reclaims it. That's on purpose, to avoid killing a live run.

### Two Valkey roles: an evictable cache and a coordination store that never evicts

Locks, task run state, circuit breakers and budgets can live on a separate Valkey
instance configured with `noeviction` (`TASK_CACHE_URL`), while ordinary caches stay on
an instance that is allowed to evict. Every direct Valkey call site was classified into
one role or the other rather than routed by key prefix.

**Why:** under memory pressure an evicting Valkey drops keys it considers cold. For a
cache that is fine; for a lock or a run-state key it means two workers believing they
own the same job. Routing by key prefix was tried on paper and rejected: most cache keys
don't share a prefix, so the rule would have filled the coordination instance with cache
data. The first implementation still missed the core run-state writer, which a review
caught before it shipped. That's why the classification is now explicit per call site.

**Trade-off:** a second Valkey to run in larger deployments (a single instance still
works for small ones), and every new Valkey call has to pick a role.

## Media & playback

### Local-files-only streaming; Jellyfin is optional sync

All media is served from local library paths; playability is gated on
`has_files`. Jellyfin integration is background sync only and never sits in the
playback path.

**Why:** keeping Jellyfin out of the critical path means streaming and watch-state
don't depend on it. Items without local files surface a **Request** action instead
of **Play**.

**Trade-off:** discovery-only catalog entries aren't directly playable by design.

### The server owns the playback decision; `/j` translates, never proxies

A server-side planner produces an immutable playback plan; the client consumes it
and never re-evaluates codec/container compatibility. The Jellyfin-compatible `/j`
layer translates Jellyfin calls into native operations (it is not a proxy), so a
Streamyfin client's progress is recorded the same way as the web player's.

**Why:** delivery paths (Safari native HLS vs. MSE vs. direct `<video>`) support
different codecs; a client re-evaluating would make wrong choices. Converging all
clients on one session lifecycle keeps watch state consistent.

**Trade-off:** the Jellyfin surface needs its own decision engine in Jellyfin's
profile format; an observability bridge logs when the two disagree.

### One embedding per item, split by `has_files`

Items have either a **library** embedding (local files) or a **discovery**
embedding (catalog-only), never both, stored in pgvector.

**Why:** discovery embeddings power recommendations across the full catalog without
the library pipeline wasting work on unplayable items. When a file is attached, the
discovery embedding is invalidated and a library one generated.

**Trade-off:** an item can't hold both kinds simultaneously; transitions are
event-driven.

### Image subtitles are rendered on the server, once

PGS and VobSub subtitles are decoded by the server and turned into transparent PNG
pictures plus a timing manifest. The result is cached and shared by every client. The
web player draws them over the video; the Apple apps fetch the pictures just ahead of
playback and overlay them on the native player.

**Why:** image subtitles traditionally leave two bad options. Burning them into the
video forces a full re-encode just to draw text, which on HDR costs either the HDR or
the hardware encoder. Shipping the raw subtitle stream instead makes every client carry
its own PGS and VobSub decoder. Rendering once on the server avoids both: measured at
about 20 ms to decode and 115 ms to encode the pictures for a whole film, paid once.

**Trade-off:** a feature film is roughly 1,400 pictures and 5–20 MB, so clients fetch
them in a sliding window instead of all at once, and the cue timing has to line up
with the player's timeline. Burn-in stays available for clients that can't overlay.

## Infrastructure & modularity

### An isolated stream proxy

The Live TV stream proxy is a standalone Node process that imports only Node
built-ins and a small shared module: no app framework, no database, no npm
packages.

**Why:** FFmpeg work is long-lived and resource-intensive; isolating it keeps
spikes off the web event loop and lets it restart and scale independently. See
[Live TV](/architecture/live-tv/).

**Trade-off:** shared types live in a dedicated module, and the proxy can't use the
app's cache or utilities.

### Split Postgres connection pools (web / task / admin)

Three pools share one database so background work can't exhaust connections needed
by user-facing routes.

**Why:** a single shared pool let bulk task work queue playback and auth behind it.
Admin polling gets its own small pool so it can never delay video starts.

**Trade-off:** importing the wrong pool in the wrong layer is an architectural
violation; each connection carries a statement timeout as a backstop.

### Supporter modules ship as pre-built modules, not plugins

The source-available `/j` and AI-assistant supporter-module surfaces are pre-built
modules bundled into the image by CI, not runtime plugins loaded from a directory.
Both are free during early access.

**Why:** the plugin architecture exists for *untrusted third-party* code with
sandboxing overhead; the source-available supporter modules don't need that and
benefit from direct access to the server. The open-source core defines stub
extension points the modules fill in. See [Editions & Licensing](/guides/licensing/).

**Trade-off:** those modules aren't operator-modifiable; a signed key is verified
offline.

### Server-driven UI

Content pages are assembled server-side as `PageSection[]` arrays of a unified
`UniversalMediaItem` type; two generic client components render them.

**Why:** new sections (trending, personalized, genre, seasonal) can be added on the
server without shipping new client components, and one card component handles every
content type.

**Trade-off:** the `PageSection` contract must stay stable (it has hundreds of
call sites), and the server composes page data on each request.

### Signed plugins, with the official key built into the app

Plugins installed from a repository are verified with Ed25519 signatures. The official
public key is a compile-time constant in the app, not fetched and not configurable from
the web UI, and is mirrored at `/.well-known/lumastra-signing-keys.json` so anyone can
check what a build trusts. The download URL is part of the signed manifest, upgrades must
be signed by the same key as the installed version, older versions can't be installed
over newer ones, and the capabilities a plugin declares are checked again every time it
loads.

**Why:** a plugin runs with the same trust as the server itself, so "where did this code
come from" has to be answered by cryptography, not by a URL and a checksum. Building the
key into the app means changing it takes a code change and a release, the same bar as
shipping any other server code. Operators can still add their own keys, or use plain
drop-in plugins, without the official key.

**Trade-off:** key rotation has to be planned: the new key ships alongside the old one
until every manifest is re-signed, and the private key must stay offline and out of CI.

### Security is measured, not only reviewed

Before the public release the code went through several rounds of security review, and
every finding was checked against the code before being accepted. After that, a
runtime pass on a pre-production server measured what the reviews could only read from
source: concurrent requests racing each other, what happens when a user is removed from
the identity provider, and what the reverse proxy forwards.

**Why:** some problems don't exist in the source. The runtime pass found that nginx drops
an empty header, so a user removed from every identity-provider group kept their admin
rights on API tokens, something no code review could see. Measuring again after fixes
matters too: one race-condition fix passed review and then turned out, on the real
server, to have opened a new problem.

**Trade-off:** it takes a pre-production environment that mirrors production and time
that doesn't produce features. It's the only way to confirm a fix works.

## Next

- [Architecture overview](/architecture/overview/)
- [Environment variables](/reference/environment-variables/)
- [FEATURE_* flags](/reference/feature-flags/)
