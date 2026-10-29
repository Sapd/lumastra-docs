---
title: Keep a local library in sync
description: >
  Bootstrap a local library cache, hydrate media, apply user-state changes, and recover
  from expired cursors or changed access.
sidebar:
  order: 2.62
---

Use `/api/v1/sync` when your app keeps a local library cache. Load the visible library
once, then poll a cursor feed for changes. The feed describes current state; it is not
an event history or a backup of the server.

The three sync endpoints are `stable`. Authenticate with an OAuth device-flow bearer
token or a personal access token in `Authorization: Bearer …`. Service tokens,
playback grants, stream tokens and Jellyfin credentials are not accepted. Do not put
`api_key` or `stream_token` in the query string: these routes refuse them.

A read-only token can read the sync endpoints. Hydration uses `POST /api/v1/media/batch`,
so the complete recipe needs OAuth device scope `media`, or a PAT with `write`.
OAuth `media:read` and a read-only PAT cannot make that POST. See
[authentication](/developers/api/#making-an-authenticated-request).

## What belongs in the cache

Catalog kinds are `movie`, `series`, `season`, `episode`, `artist`, `album`, `track`
and `audiobook`. The initial catalog list and catalog upserts use the same rules:
active, not dismissed, file-backed items that pass the caller's library permissions
and age restriction. Container availability and access include their descendants.
Discovery-only titles and missing episodes are outside this set; fetch those online
through the relevant catalog endpoints.

State kinds are `watch_state`, `listen_state`, `rating`, `watchlist` and `playlist`.
They describe the caller's state. Media-keyed state is filtered by library and age
access, but does not require catalog sync-set membership. Keep state separately from
the file-backed catalog cache. A playlist is included when the caller owns it or is
an accepted member.

## 1. Save a starting checkpoint

```http
GET /api/v1/sync/changes
Authorization: Bearer <token>
```

The response has empty `items`, `page.nextCursor`, `page.hasMore: false`, and
`initialLoad`: an array of `{ kind, href }` links. **Save this change-feed cursor
before loading anything.** Keep a flag that bootstrap is unfinished. If the app
stops during bootstrap, restart the load rather than treating the partial cache as
complete.

Cursors are opaque. Keep a separate cache and checkpoint per server and signed-in
account. Do not decode, edit, or share the change-feed cursor between accounts.

## 2. Follow every initial-load link

Follow each `initialLoad[].href`. All paths in the following table are relative to
`/api/v1`.

| Data | First request | Page size |
| --- | --- | --- |
| Catalog ids, once per catalog kind | `GET /sync/library?kind=movie` | Default and maximum 1000; minimum 1 |
| Caller state, once per state kind | `GET /sync/user-state?kind=watch_state` | Default and maximum 500; minimum 1 |

Each response has `items` and `page`. While `page.hasMore` is true, repeat the same
request with `cursor=page.nextCursor`. Keep the kind unchanged. These snapshot-page
cursors are id-order checkpoints, separate from the change-feed cursor saved in
step 1. A terminal snapshot page can omit `nextCursor`; stop on `hasMore: false`.
There is no `after` or offset parameter.

Each request reads a consistent snapshot, but the whole initial load is not frozen
across requests. Finish all initial pages before replaying changes from step 1.
That replay reconciles changes made while the initial load was running.

### Hydrate catalog ids

`/sync/library` returns `{ "id": "<media UUID>" }` entries. Hydrate them in batches:

```http
POST /api/v1/media/batch
Authorization: Bearer <token>
Content-Type: application/json

{"ids":["12345678-1234-4123-8123-123456789abc"],"include":"preview"}
```

The response is `{ items, missing }`. Preview mode, also the default when `include`
is omitted, accepts up to 100 ids. Store the returned items by `id`; remove or omit
ids returned in `missing`. Missing handles can be unknown, unresolvable or
inaccessible, so do not infer why an id is missing.

`include: "detail"` accepts at most 25 ids and uses the normal media-detail
contract. Kinds that media detail does not serve are returned in `missing`; use
preview hydration for the full sync catalog. Hydration is currently `beta` even
though the sync endpoints are `stable`. Every hydrated item has an opaque
`revision`; compare it for equality, not ordering.

### Store state projections

Snapshot state items contain `id` and exactly the field for the requested kind.
Change-feed state upserts use the same fields:

| Kind | Inline field | Contents |
| --- | --- | --- |
| `watch_state` | `watchState` | `progress`, completed `playCount`, `favorite`, `lastWatchedAt` |
| `listen_state` | `listenState` | Track `playCount`, `skipCount`, `completeCount`, `lastPlayedAt` |
| `rating` | `rating` | Explicit integer rating 1–10 and nullable `style` (`quick` or `stars`); inferred listening ratings are excluded |
| `watchlist` | `watchlist` | Earliest `addedAt` and all `entries`, including nullable season/episode numbers and each entry's `addedAt` |
| `playlist` | `playlist` | `revision`; refetch the playlist and its items when it changes |

`progress.positionMs` and `durationMs` are milliseconds; `fraction` is 0–1.
These values and `updatedAt` can be null. `finished` is a boolean. State timestamps
are ISO date-time strings or null. Watch-position changes are captured at
30-second boundaries; hydrate current progress when exact resume state matters.

## 3. Poll and commit each page

```http
GET /api/v1/sync/changes?cursor=<saved-change-cursor>&limit=500
Authorization: Bearer <token>
```

`limit` defaults to 500 and accepts 1–1000. Poll every few minutes or when the app
returns to the foreground. Each entry has `kind`, `id`, `op`, and `version`:

- Catalog `upsert`: hydrate the id and replace the cached entity.
- State `upsert`: replace the stored inline projection. For playlists, refetch
  details and items as needed.
- `delete`: remove that catalog entity or that state projection. Ignore an id you
  do not have. A state delete does not delete the catalog item with the same id.

Key catalog entities by `id` alone: an entity can change kind. Key state by
`(kind, id)`. State ids are media UUIDs except playlist ids, which are strings
representing playlist integers. Catalog tombstones are sent when the server can
establish that the item was previously visible; a move into a denied library can
therefore remove a previously cached item. A tombstone is not proof that the
underlying server record was physically deleted.

The feed projects current state and can coalesce multiple changes. Store the
latest `version` for each key, including deletions. Versions compare
lexicographically as strings; ignore older entries. A sync `version` is distinct
from a hydrated item's opaque `revision` and a playlist's integer `revision`.

Apply a page and complete its required hydration before committing
`page.nextCursor`. Persist the cache changes and checkpoint together where
possible. Serialize page application and hydration so an older response cannot
overwrite a newer item. On failure, retry the same page; applying it twice must
be harmless.

**Always save the returned change-feed `page.nextCursor`, even when `items` is
empty.** Filtering and scan limits can produce empty pages with `hasMore: true`.
Continue immediately while `hasMore` is true; otherwise wait until the next poll.
Keep the bootstrap flag set until the initial pages and catch-up pass finish.

## 4. Rebuild after a reset

A change-feed `410 Gone` uses `application/problem+json` with a `reason`:

| `reason` | Meaning |
| --- | --- |
| `cursor_expired` | The checkpoint is older than the pruned change-log watermark; cleanup normally keeps 30 days of changes |
| `access_changed` | The effective library restrictions or age rule changed, including the unrated-content rule |
| `log_reset` | The server identity or log epoch changed, or the cursor is ahead of this database; this can follow a restore or catalog reset |
| `invalid_cursor` | The cursor fails signature or account validation |

Discard the old cache, state, and cursors, then repeat step 1. This also removes
items made inaccessible by a permission change. Malformed cursors or invalid
parameters return `422`; fix the request. Snapshot cursors are only validated as
id checkpoints and do not carry change-feed expiry or access tags. The catch-up
poll checks the access tag after bootstrap; rebuild if it returns `410`.

## Concurrency, limits, and boundaries

Sync responses use `Cache-Control: private, no-store`. They do not provide an ETag
or an `If-Match` write protocol. Use the cursor to track reads. Send mutations
through their own endpoints and follow their conflict rules: for example, playlist
reordering uses `expectedRevision` and returns `409` if it changed. Refetch before
retrying. A sync version is not a write precondition.

The sync endpoints and batch hydration currently declare no separate endpoint
rate limit. Poll at the cadence above, bound hydration concurrency, and honor any
`429` and `Retry-After` returned by the server or proxy. Authentication failures,
proxy limits, and other endpoints can have their own limits. `401` requires a
valid sign-in, `403` can indicate insufficient token scope, and `503` means a
required service is unavailable; retry transient failures with backoff.

A long-running server write transaction can delay the change feed. Keep the cursor
and poll again. A file rename alone does not generate a catalog update.

People, Live TV stations, historical playback events, and playback preferences
are outside the sync projection.
Audiobook authors and series are fields of each book rather than separate synced
entities. Before playing, fetch fresh playability and use the current version
and file. A cached catalog entry or an unchanged cursor cannot
establish that an old playback plan is still usable. See
[building a player](/developers/building-a-player/).
