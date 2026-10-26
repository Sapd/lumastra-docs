---
title: Introduction
description: What Lumastra is, what it does, and how the pieces fit together.
---

Lumastra is a self-hosted media server. You point it at your movies, series and music,
and it organizes, streams and recommends them. Audiobooks come in through
Audiobookshelf, and books through Kavita.

It runs on your own hardware with PostgreSQL and Valkey next to it. You can use it in
the browser, in the native iPhone, iPad and Apple TV apps, or with Jellyfin- and
Subsonic-compatible apps you may already have. You don't need a Jellyfin server; if you
have one, Lumastra can sync watch progress with it.

Lumastra is aimed at homelabs and small groups of users. Sign-in works with built-in
accounts, with single sign-on through a reverse proxy (forward auth), or with OIDC, and
you can use more than one of these at the same time. Every integration is optional, so
you can start small and add things later.

:::note
Lumastra is an early release (v0.1). These docs describe it as of commit `3479464f1`
(2026-09-26).
:::

## What it does

- **Movies, series and music** from your own folders, with metadata and artwork from
  TMDB and MusicBrainz.
- **More than entertainment.** Library types for home videos, training and educational
  content, organized straight from your folders.
- **Recommendations.** For You, mood-based and similar-title picks, built on
  embeddings (OpenAI or Voyage AI) and similarity search in PostgreSQL. They include
  titles you don't own yet. With a request service connected, users can ask the server's
  admin for one.
- **Chat assistant.** Ask about your library in plain language. It's a supporter
  module and free during early access.
- **Watch Together.** Synchronized playback between the web app and the Apple TV app.
- **A built-in player** that decides per device whether to play a file directly, remux
  it or transcode it, with hardware transcoding and subtitles that don't need burn-in.
- **Live TV** from M3U, Xtream or HDHomeRun sources, with a programme guide.
- **Installable web app** on desktop and mobile.
- **Your own branding.** Custom name, logos, background and app icons (a supporter
  feature, free during early access).
- **An API for other apps.** A versioned `/api/v1` with token and OAuth sign-in, for
  TV apps, Home Assistant and scripts. See [API & tokens](/developers/api/) or
  [Building a player](/developers/building-a-player/).

## Live TV built and tested for reliable viewing

- **Bring your own sources.** M3U, Xtream and HDHomeRun, with a programme guide,
  automatic channel grouping and numbering.
- **Share the upstream stream.** The default Rust proxy reuses one connection for
  viewers of the same channel; heartbeats manage active viewer sessions.
- **Use backup feeds.** Automatic failover tries alternate feeds; exhausted feeds
  produce a clear playback failure and a choice to try another channel.
- **Adapt quality to the connection.** Optional GPU encoding provides multiple
  qualities from 1080p down to 360p for the player to switch between.
- **Keep viewing simple.** Simple mode offers large controls, personal channel
  numbers, now/next information and an optional helper PIN.
- **Exercise the real pipeline.** End-to-end tests use a synthetic provider for
  imports, decoded playback, stream limits and upstream failures through the app and proxy.

Start with [Live TV setup](/guides/live-tv/) and
[simple mode](/guides/live-tv-simple-mode/), or read about the
[proxy and failover](/architecture/live-tv/). Recording (DVR) isn't available yet.

## Media management with review built in

- **Trace artwork choices.** Inspect image candidates and their recorded sources,
  select the image to use and protect curated choices. Unknown origins stay explicit.
- **Preview identity repairs.** A reviewed two-episode TMDB ID exchange preserves
  internal episode IDs, file links and watch data on their existing episodes.
- **Review album merges.** Inspect the kept album, tracks, artwork and user-data
  policies before confirming; duplicate track candidates keep their separate files.
- **Match episodes to actual files.** Review boundaries in combined multi-episode
  files, or compose several files as one multipart episode with its identity and
  progress intact. Multipart playback needs a supported player and transcoding.
- **Inspect file health.** Stream and audio-tail measurements support bounded
  rechecks; inconclusive results keep their warnings.
- **Resolve uncertain matches in quarantine.** Compare historical proposals with
  current files and metadata, then preview eligible changes before accepting a batch.

See [media enrichment](/guides/media-enrichment/),
[administration](/guides/administration/),
[multipart episodes](/guides/multipart-episodes/) and
[library troubleshooting](/guides/library-troubleshooting/) for the detailed workflows.

## The stack

| Layer            | Technology                                              |
| ---------------- | -------------------------------------------------------- |
| Framework        | SvelteKit + TypeScript (Svelte 5), Node 22                |
| UI               | TailwindCSS                                              |
| Database         | PostgreSQL 18 + pgvector                                 |
| Cache / queues   | Valkey 9 (Redis-compatible)                               |
| Background jobs  | BullMQ worker process                                     |
| AI               | OpenAI or Voyage AI embeddings, pgvector similarity, RAG chat |
| Media (optional) | Jellyfin, TMDB, MDBList, Sonarr/Radarr, Audiobookshelf, Kavita |

## Licensing

The core of Lumastra is open source under AGPL-3.0-only. Two parts are
source-available supporter modules (the chat assistant and extra streams through the
Jellyfin-compatible API), and a commercial license is available for businesses. See
[Editions & licensing](/guides/licensing/).

## Next

- [Quick start](/start/quick-start/): get an instance running
- [For viewers](/using/for-viewers/): a tour of the everyday interface
- [API & tokens](/developers/api/): build a client against `/api/v1`
- [Building a player](/developers/building-a-player/): write your own playback client
