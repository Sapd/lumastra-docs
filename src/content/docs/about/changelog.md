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
