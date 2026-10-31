---
title: Changelog
description: What changed in each release of the Lumastra server and the iPhone, iPad and Apple TV apps.
sidebar:
    order: 2
---

Lumastra has two release lines. The server is versioned on its own; the iPhone, iPad and
Apple TV apps have their own version numbers. Whatever the number, both are early
releases.

## Server

The full changelog is in the repository:
[CHANGELOG.md](https://github.com/Sapd/lumastra/blob/main/CHANGELOG.md). Each release on
[GitHub Releases](https://github.com/Sapd/lumastra/releases) carries the same notes.

### Unreleased

Live TV proxy: update needed (protocol 0 → 1, TypeScript proxy, Rust proxy, shared modules,
build scripts, image build).

- Home’s **What's On Now** row searches channel names and the current or single next
  programme. Large lineups reveal cards in small batches to keep scrolling responsive.
- Web playback stays fullscreen when advancing between episodes, and seek previews keep
  their correct proportions on partial thumbnail sheets.
- A season is available once all aired episodes are present.
- Sync quarantine can recheck decisions that are already applied and retain uncertain
  proposals. Changes that remain use reviewed batches with dependency checks and clear
  continuation results. See [Library troubleshooting](/guides/library-troubleshooting/).
- Unavailable library entries now use a 30-day retention window by default. Installations
  without a stored or environment override adopt it; existing unavailable entries receive
  a one-time grace reset before cleanup.
- Music can prepare the next track without occupying a playback slot before it starts.
- Album cover lookup adds Deezer and normalized title searches, retries missing covers,
  and can fall back to the album artist's picture.
- Image choices retain their provider and source references across caching and metadata
  updates, with protected manual choices and provider-based selection.
- Artwork upgrades preserve existing selections and enrichment attribution. Replacing a
  cover at the same path refreshes its image version, and stale repair or cleanup work
  cannot remove a newer image. Cached local artwork verifies its source bytes, adding
  filesystem reads when images are served.
- Cleanup works through successive bounded batches, and the homepage's active streams
  refresh follows the same display rules as its first load.
- Each release now says whether the Live TV proxy needs an update, and Admin → System
  health → Cluster warns when the running proxy is behind or no longer works with the app.
  Update the proxy image to this release once, so later checks can tell. See
  [Live TV proxy](/guides/deploy-kubernetes/#live-tv-proxy).
- One remote control for every Lumastra device on your account. From the iPhone app or
  the web, start a title on another device, pause, seek, pick tracks, skip an intro, set a
  sleep timer, manage the music queue, tune Live TV, join a party or send a message.
  You can allow a household helper to use it, and Jellyfin apps can control your devices.
  The old `/devices/{id}/actions` endpoints are replaced by `/devices/{id}/commands`. See
  [Remote control](/using/remote-control/).
- The audio and subtitle menu shares one scrolling list and adapts to the player and
  viewport height. Mobile episode and season pickers scroll more reliably.
- Music cards show crossfades correctly, and Jellyfin apps stop unused transcode work
  when playback is cancelled. Stream health diagnostics are more accurate.
- Licence clocks are initialised and repaired correctly, so grace periods and expiry
  checks use the current time.
- Security fixes tighten sign-in, Quick Connect, Watch Together identities, private
  activity, playlist membership, library access and upstream requests.
- Episode files named "Show_Series_2_-_03" (as iPlayer downloads are) or "Show.OVA.01"
  are filed under the right season and episode.
- Web playback in Safari on iPhone and iPad starts right away instead of loading the
  first segment over and over.
- Live TV imports providers with more than 10,000 channels. Playlist section headers are
  no longer imported as channels, and all quality feeds of a station (including HD+, raw,
  cable, transcoded and mobile ones) form one backup group. Channels are sorted into
  genres, with category chips on /livetv, and numbered channel families open in a dialog
  with their own guide. Configure Lineup keeps any number of countries, can hide 24/7 loop
  channels and single categories, and remembers its choices for re-imports and refreshes.
  Channel Management handles large lineups, and Backup Groups gets search,
  filters, problem badges and **Make primary**. See
  [Setting up Live TV](/guides/live-tv/#what-the-import-does). Re-import a source to apply
  the new grouping to its existing channels.
- The sonic sidecar analyses long tracks in chunks, so it needs far less memory (a
  30-minute track about 0.9 GB instead of 8 GB). See
  [Sonic sidecar memory](/guides/deploy-docker/#sonic-sidecar-memory).
- Albums no longer show another album's cover, GIF, TIFF and AVIF covers are converted
  instead of failing, and artist images are retried when a provider is down.
- Provider images stay visible while the image host refuses requests.
- In the iPhone, iPad and Apple TV apps, subtitles show again after resuming from Continue
  Watching or after a long seek.
- Live TV's Configure Lineup can hide info and welcome screens, radio stations, local
  stations and event slots, and its 24/7 switch also hides film loops and single titles.
  Provider bouquets that mix many genres are split into those genres on import. See
  [Configure Lineup](/guides/live-tv/#configure-lineup).
- Live TV simple mode: a large, calm Live TV screen for older viewers with their own
  numbered channels, on the web and on Apple TV. A helper or the admin sets it up and can
  lock it with a PIN. See [Live TV simple mode](/guides/live-tv-simple-mode/).

### 0.1.0 (2026-10-15)

The first public release, with movies and series, music, audiobooks through
Audiobookshelf, Live TV, Watch Together, single sign-on on every device, and a
documented API. See [all features](https://lumastra.org/#all-features), the
[quick start](/start/quick-start/) and the
[known limitations](/reference/known-limitations/).

Forward auth is now opt-in: set `FORWARD_AUTH_ENABLED=true` to sign in through
Authentik, Authelia or another forward-auth proxy. **If you ran a pre-release build with
forward auth, add that line before you upgrade**, or nobody can sign in. With forward
auth off, a proxy trusted only for client IP addresses can no longer sign anyone in by
passing an `X-Forwarded-User` header through. See
[Authentication](/guides/authentication/#forward-authentication).

## iPhone, iPad and Apple TV apps

The apps are in public TestFlight. New builds show their notes in TestFlight under
"What to test".

### 1.0.1

The first public TestFlight version of both apps.

- Movies, series, music and audiobooks, with Watch Together on the Apple TV.
- Offline downloads on iPhone and iPad.
- Continue on Apple TV: hand a movie or episode, with its position, from iPhone to
  Apple TV.
- Smart Queue for music.
- When the server refuses playback, for example because a stream limit is reached, the
  app says why.
- More reliable seeking and scrubbing.
- Send Diagnostics in Settings, with a note, so problems can be traced on your server.
