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
