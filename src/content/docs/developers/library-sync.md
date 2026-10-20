---
title: Keep a local library in sync
description: >
  Cache the library in your own app or add-on and find what was added, changed or removed
  since your last visit, without re-reading every list: one cursor feed, ids to hydrate,
  and your own state delivered inline.
sidebar:
  order: 2.62
---

An app that keeps its own copy of the library (an offline player, a Kodi-style add-on, an
Infuse-like app) should not walk every list on every start to find what changed. Lumastra
has one feed for that, under **`/api/v1/sync`**. You load everything once, then ask "what
changed since my cursor?" and get a short list.

:::note[Stability]
These endpoints are `x-stability: stable` in the [API reference](/reference/) (tag
**Library sync**). You need a bearer token (OAuth device flow or a personal access token),
as for the rest of `/api/v1`. A token in the URL is refused on these routes.
:::

## The model in one paragraph

Every change to a movie, series, season, episode, artist, album, track or audiobook, and to
your own watch state, listening counts, explicit ratings, watchlist and playlists, is
recorded. `GET /sync/changes` returns the entries after your cursor. Each entry describes the
**current** state for **you**: `upsert` ("you can see this, fetch it") or `delete` ("drop it
if you have it"). You only ever see what you may see: items in libraries you cannot access
never appear, not even as a delete, and your state is delivered to you alone.

## 1. Start

```http
GET /api/v1/sync/changes
```

Without a cursor you get an empty page, a starting `nextCursor`, and `initialLoad` links
for each kind. **Store `nextCursor` before you load anything.** Changes that happen while you
load show up again in the first poll; applying an entry twice is harmless.

## 2. Load everything once

| What | Request | You get |
| --- | --- | --- |
| Library items, per kind (`movie`, `series`, `season`, `episode`, `artist`, `album`, `track`, `audiobook`) | `GET /sync/library?kind=movie&limit=1000`, then `after=<nextAfter>` until it is `null` | ids only |
| Your state, per kind (`watch_state`, `listen_state`, `rating`, `watchlist`, `playlist`) | `GET /sync/user-state?kind=watch_state`, then `after=<nextAfter>` | the state inline |

Hydrate the ids with `POST /media/batch` (up to 100 per call) and store the items by `id`.
An id the batch call returns in `missing` is not visible to you: leave it out.

Library items are the ones that are in your library: they have a file (or, for audiobooks,
a book) and are not dismissed. Missing episodes and discovery-only titles are not part of
the cache; read them online from the series endpoints.

## 3. Poll

```http
GET /api/v1/sync/changes?cursor=<stored>&limit=500
```

Every few minutes, or when the app comes to the foreground. For each entry in `changes`:

- `op: "delete"`: remove the `id` (ignore ids you never had).
- State kinds with `op: "upsert"`: replace your stored state with the inline field named
  after the kind (`watchState`, `listenState`, `rating`, `watchlist`, `playlist`).
- Catalog kinds with `op: "upsert"`: collect the `id`; hydrate the collected ids with
  `POST /media/batch`.

Then **store `nextCursor`**, always, even when `changes` is empty. While `hasMore` is `true`,
call again right away.

A poll with nothing changed is one call. With N changed catalog items it is 1 + ⌈N/100⌉.

## 4. Reload when the server says so

`410 Gone` means "drop your cursor and start again at step 1". The `reason` says why:

| `reason` | Meaning |
| --- | --- |
| `cursor_expired` | You were away longer than the server keeps changes (30 days). |
| `access_changed` | Your libraries or age limit changed. |
| `log_reset` | The server was restored or its catalog was reset. |
| `invalid_cursor` | The cursor is not one this server issued for you. |

A cursor the server cannot parse at all is a `422` (a bug in your client, not a reason to
reload).

## Good to know

- Entries are keyed by `id` for catalog items. State entries are keyed by `(kind, id)`: a
  movie and your `watch_state` for it share the media id. Use `version` (it compares as a
  string) to drop an entry older than one you already applied.
- A catalog item can change kind (for example after a re-identify); the newest entry wins.
- A renamed or moved file keeps its id and causes no entry of its own.
- Watch positions arrive in steps of at least 30 seconds. The hydrated item's `progress` is exact.
- Not in the feed: people, Live TV stations, and audiobook authors and series (these are
  fields of each audiobook; group them yourself).
- Changes can appear a little late while a long database transaction is open on the server.
  They are never lost.
