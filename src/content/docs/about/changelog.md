---
title: Changelog
description: What changed in each release of the Lumastra server and the iPhone, iPad and Apple TV apps.
sidebar:
    order: 2
---

Lumastra has two release lines. The server is versioned on its own; the iPhone, iPad and
Apple TV apps have their own version numbers.

## Server

The full changelog is in the repository:
[CHANGELOG.md](https://github.com/Sapd/lumastra/blob/main/CHANGELOG.md). Each release on
[GitHub Releases](https://github.com/Sapd/lumastra/releases) carries the same notes.

### 0.2.0 (2026-11-14)

Live TV proxy: no update needed.

- **License:** everything in the repository is AGPL-3.0-only, including the Jellyfin-compatible
  `/j` API and the AI assistant. There are no paid parts and no license key. The 0.1.x
  source-available files are also licensed under AGPL-3.0-only.
- `/j` no longer has the two-stream limit; the per-user stream limit you set still applies.
- The license check, the weekly check-in, `LICENSE_KEY` and the license panel are gone. A
  leftover key is ignored.
- Push through the standard relay gets its token from lumastra.org (install ID and version
  only). The update check asks lumastra.org first and sends only the version; it falls back to
  GitHub. **Contact lumastra.org** (Admin → Settings → General) switches both off. A new
  install makes neither call until the setup question is answered, or a day after setup. See
  [data flows](/reference/data-flows/).
- **Security:** `scripts/reset-password.ts` now also revokes personal access tokens, service
  tokens and `/j` sessions. If you reset a password on 0.1.x because of possible misuse, run it
  again after updating.
- Jellyfin apps: a series' episode list returns every episode when the app sends no limit
  (Infuse showed only the first seasons of long series).
- The Helm chart is no longer marked beta. The plain manifests in `deploy/k8s` are removed; use
  the chart.
- 0.1.x installs: the old license endpoints are switched off with this release. Push through
  the standard relay stops working on 0.1.x within a day; update to 0.2.0.

### 0.1.4 (2026-11-13)

Live TV proxy: update needed (its Rust dependencies were updated).

- **Security:** the Docker images use Node.js 24.22.3, Node's November security release.
  npm and Rust dependencies are updated too.
- Browse: the search box in the A-Z and Recently-added views also finds titles in your
  language and original titles, as global search already did.
- Search: an exact or prefix match on a title in your language ranks first. Exact matches
  ignore case.
- Jellyfin apps: Moonfin's Quick Connect QR code opens the approve dialog with the code
  filled in. `/j` and its server-info endpoints all report the same address
  (`PUBLIC_BASE_URL`, else the request address plus the base path).
- When the Jellyfin-compatible API is on, the default home screen shows a **Set up a
  Jellyfin app** button that opens Settings → Connections. Admins can remove it in the home
  screen editor.
- The setup wizard offers every library type, including home videos, training, educational
  and personal.

### 0.1.3 (2026-11-05)

Live TV proxy: no update needed.

- Helm chart: with more than one router pod (two by default), video often didn't start and
  media requests failed with `403 ip_mismatch`. The router now proves itself to the web
  pods with a value derived from `LUMASTRA_MASTER_KEY`. Restart the router pods after
  rotating the key. `helm install` warns when other pods could set their client address
  through the router.
- Setup wizard: **Skip for now** on the basics step goes on to the library step.
- Quieter logs after a Valkey restart, and `npm run doctor` no longer names an embedding
  provider when no key is set.

### 0.1.2 (2026-11-04)

Live TV proxy: no update needed.

- A full `docker compose restart` no longer keeps the worker stopping for about 60 s. The
  worker and web stop in a few seconds, each shutdown step has a time limit, and a Valkey
  restart no longer floods the log.
- The example compose file gives the web service a stop grace period.

### 0.1.1 (2026-11-04)

Live TV proxy: no update needed.

- **Security:** device sign-in codes and the passwords generated for Jellyfin apps use
  unbiased random characters; search boxes escape the backslash in SQL patterns; the Watch
  Together fallback client ID uses `crypto.randomUUID()`.
- Fixes for music transcode cancellation, double-decoded HTML in guide and metadata
  titles, and Markdown tables in diagnostics reports.

### 0.1.0 (2026-11-03)

Live TV proxy: update needed (protocol 0 → 1) if you ran the 2026-10-15 release candidate;
new installs start with the current proxy.

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
[Authentication](/guides/authentication/#if-you-use-forward-authentication).

#### Changes since the 2026-10-15 release candidate

- Home’s **What's On Now** row searches channel names and the current or single next
  programme. The search field shows its full placeholder. Large lineups reveal cards
  in small batches to keep scrolling responsive.
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
  [Live TV proxy](/guides/deploy-kubernetes-advanced/#how-do-i-add-live-tv-or-the-sonic-sidecar).
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
  [Sonic sidecar memory](/guides/deploy-docker/#add-sound-based-music-features).
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
