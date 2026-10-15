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
