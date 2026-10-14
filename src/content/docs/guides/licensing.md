---
title: Editions & Licensing
description: What's free, what's part of the supporter tier, and how licensing works.
sidebar:
  order: 5
---

This page explains what's free, what belongs to the supporter tier (free during early
access), and how the license check works on a self-hosted install.

Lumastra is **open core**: almost all of it is free and open source, and a few
source-available modules make up the supporter tier.

:::tip[Early access: everything is included]
Until **January 31, 2027**, every install gets the full supporter tier for free:
unlimited `/j` streams, the AI assistant and every other supporter feature. Your install
fetches this early-access license by itself on first boot. There's nothing to buy and
nothing to sign up for. After that date, installs without a supporter license fall back
to the free tier described below.
:::

## What's free: the AGPL-3.0 core

The core is licensed under **AGPL-3.0-only** and covers nearly everything. The rule we
follow: **whatever a typical media server (Jellyfin, Emby, Plex) gives you, Lumastra
gives you for free**, plus a few things they don't. The basics aren't behind a paywall,
including features other servers charge for, like hardware transcoding, Live TV and
remote access. The supporter tier only adds things on top.

The free core includes:

- **Single sign-on** (OIDC and reverse-proxy forward auth), including sign-in on the TV
  through the native apps. SSO will never be a paid feature.
- Library organization, browsing, search and playback (gapless audio, subtitles, HLS
  streaming, trickplay)
- **Software and hardware transcoding**, and the engine that decides how each file is
  played
- AI **recommendations** and Quick Picks, including embedding generation and vector
  search (with your own OpenAI or Voyage API key)
- Metadata enrichment (TMDB, MusicBrainz and more) and the image proxy
- Background **sync** with a Jellyfin server (not the same as the `/j` client API below)
- The **Subsonic** music API, for any Subsonic client
- Requests, Watch Together, Live TV and the DJ crossfades
- Running several replicas for high availability, the admin task system and health
  monitoring
- iOS push notifications through the Lumastra push relay (see
  [iOS push notifications](/guides/push-notifications/))

## Supporter tier: source-available modules

Two modules are source-available, so you can read them in the repository, but using them
beyond the free tier needs a supporter license:

- **`/j`, the Jellyfin-compatible client API.** Lets Jellyfin and Streamyfin apps on TVs
  and phones connect to Lumastra, including casting and send-to-device. It works
  **without a Jellyfin server**; a Jellyfin URL and API key are only needed for the
  separate, optional watch-state sync. Two `/j` streams at a time are always free, and
  that's two for the whole server, not per user. Streams in the web app and the
  iPhone, iPad and Apple TV apps don't go through `/j` and aren't limited at all. More
  concurrent `/j` streams are part of the supporter tier, which is free during early
  access and has no published price yet. A small household usually stays within
  the free tier.
- **The AI chat assistant.** It searches your library and answers questions about it.
  You bring your own key: an **OpenAI-compatible or Anthropic API key**, from OpenAI,
  Anthropic or any compatible endpoint you run or pay for. Lumastra doesn't provide or
  proxy an AI key, so there's no running cost from us, only your provider's usage.

One smaller supporter feature comes with them: **custom branding**, i.e. replacing the
Lumastra name and logo.

Plans and prices for the supporter tier aren't published yet; during early access, all
of it is included for every install. Sponsoring the project on GitHub is a
separate donation and doesn't include a license.

## Why a few parts are source-available

- **The free core already does more than other media servers give you for free**,
  including hardware transcoding, Live TV and remote access.
- **The Jellyfin-compatible `/j` API is hard to maintain and isn't the preferred way for
  apps to connect.** It follows another project's API, with its quirks. The documented
  [`/api/v1`](/developers/api/) is fully open source, and new apps should use it.
- **Donations rarely cover the costs.** Other open-source maintainers report the same:
  donations are scarce, but a small incentive raises them a lot. The supporter tier isn't
  expected to bring in much; the hope is that it offsets some of the costs.

What's open source today stays open source and maintained; existing features won't be
moved behind a license. Most future features will be open source too. The likely
exception is recording (DVR).

Contributions need a Contributor License Agreement, as in many open-source projects:
Kubernetes, the Apache Software Foundation projects, Python and Go all ask for one. It's
what makes the commercial license below and the supporter features possible. You keep
the copyright to your code, contributions to the open-source core stay available under the
AGPL (or another open-source license), and anyone can fork the core under the AGPL at any time. Contributions to the
source-available supporter features are distributed under their license.

If you have questions or concerns about the licensing or the CLA, feel free to open a
discussion in [Discussions](https://github.com/Sapd/lumastra/discussions/categories/general).

## The Apple apps

The iPhone, iPad and Apple TV apps are **closed source** and free for now. Some features,
such as offline downloads, will probably become paid later. The apps use only the same
open `/api/v1` that any other app can use, and what went into building them is documented:
[building a player](/developers/building-a-player/),
[Watch Together](/developers/watch-together/),
[OAuth sign-in](/developers/oauth-clients/),
[offline downloads](/developers/offline-downloads/), and
[music](/developers/music-playback/), [audiobook](/developers/audiobook-playback/) and
[Live TV](/developers/live-tv-playback/) playback. The LGPL libraries the apps include are
published at [Lumastra/lgpl-source](https://github.com/Lumastra/lgpl-source).

## Enterprise modules

A third tier exists for organizations: a **learning management system** (courses,
quizzes, training assignments, certificates), **compliance reporting** and a **product
showcase**. These modules are **private and only available under contract**. They aren't
in the public repository; licensees get the source, and production use needs a
commercial agreement. Contact **git@sapd.eu** for details.

## Commercial license

Organizations that can't meet the AGPL's requirement to publish the source of a
network-facing modified version (§13) can get a separate **commercial license**. Contact
**git@sapd.eu**.

## How licensing works

Licensing works **offline** and sends almost nothing:

1. Your install has a unique **install ID**, shown under **System → Instance**
   (`/admin/system/instance`). It's created once on first boot and shared by every
   replica, so a whole cluster counts as one install.
2. On boot, the install **enrolls by itself**: it fetches a signed license key for that
   install ID from `lumastra.org`. During early access, that key unlocks every supporter
   feature until the end date. **System → Instance** shows the current status: *grace
   period*, *early access until &lt;date&gt;*, *valid*, *expiring soon*, *expired* or
   *free tier*.
3. The key is **checked offline** against a public key built into the app, so the check
   itself needs no connection. The app keeps working with the stored key. It contacts
   the licensing server again when the key is missing, invalid or less than 14 days from
   expiring, to renew the push relay token, and otherwise about once a week to check in
   (see the privacy note below). A check-in that fails changes nothing: the install keeps
   its key until that key really expires.
4. If your install can't reach the licensing server (offline, behind a firewall, during
   an outage), get a key by hand at [lumastra.org/license](https://lumastra.org/license/):
   paste your install ID, copy the key, and paste it into **Settings → General →
   Licensing**.

The key is stored in the `LICENSE_KEY` setting, which stays empty until the install
enrolls. The licensing server address is fixed in the official build and can't be
changed. Keys are signed with a private key that only the official server has, so no
other server could produce a key the app accepts.

:::tip[It never locks you out]
Licensing can only ever take features away. Any problem (an unreachable licensing
server, a failed check, a wrong clock) drops the install to the free tier. It never
blocks sign-in, browsing or free-tier playback.

- **No key yet** (first boot, offline, licensing server down): the install has the full
  early-access feature set for **30 days from the release's build date** while it keeps
  trying to enroll. The 30 days count from when the release was built, not from when
  you installed it, so they can't be reset, and running an old release doesn't extend
  them.
- **Expired key**: keeps working for 14 more days, so an outage of the licensing server
  at renewal time can't cut off an install that had a valid license. After that, the
  install runs on the free tier until it renews.
:::

:::note[Privacy]
When the install enrolls, renews or checks in, the only things that leave your server
are the **install ID**, the **Lumastra version** it runs, and a small status code that
shows the license check is working normally. Never your media, metadata, accounts or AI
prompts.

How often: once at first start, then about once a week. The same call also hands out the
24-hour token for the iOS push relay, so while push notifications are on (the default)
and use the standard relay, the install makes it every six hours instead.

What the licensing server records for its install counts: for each successful call, the
call type, the license tier, the version (release number only, such as `0.1.3`), the
country Cloudflare derives from the connection, and a pseudonymised install ID (a keyed
hash of the install ID) instead of the install ID itself. These records contain no IP
address and no license key, and are kept for three months. Like every request to
lumastra.org, the connection itself is handled by Cloudflare, whose short-lived request
logs can contain your server's IP address (see the
[privacy policy](https://lumastra.org/privacy/)).

Why: to issue and renew license keys, and to know roughly how many Lumastra installs
exist and run which versions.

To stop the weekly check-in, turn off **Weekly licence check-in** in **Admin → Settings →
General → Licensing** (the setup wizard offers the same switch on its main settings step). The
install then contacts the licensing server only to enroll, to renew a key that is missing,
invalid, expired or close to expiring, and for the push relay token while push uses the
standard relay (every six hours). A moved early-access end date then reaches the install
only in the last 14 days before its key expires. See [What Lumastra sends where](/reference/data-flows/).
:::

## Run without contacting lumastra.org

Turn off **Contact lumastra.org for the licence** in **Admin → Settings → General →
Licensing** (or in the setup wizard, or set `LICENSE_SERVER_CONTACT_ENABLED=false`).
The install then never calls the licensing server: no enrollment, no renewal, no
check-in, no push relay token.

- Without a key it runs on the **free tier right away**, with no 30 day grace period,
  so no feature lapses after 30 days. You lose: Jellyfin apps are limited to 2 streams
  at a time, no AI assistant, no iPhone or Apple TV push notifications through the
  standard relay, and no branding removal.
- A key that is already stored keeps working until it expires. It is not renewed, and
  there are no 14 extra days after it expires.
- You can still paste a key you got by hand at
  [lumastra.org/license](https://lumastra.org/license/); it is checked offline.

A new install fetches its first key only after you answered whether to contact
`lumastra.org`: in the setup wizard, in Admin → Settings, or with the environment variable.
An install set up without the wizard waits a day after its first admin was created.
Turning the switch off in the setup wizard therefore means nothing is ever sent. Setting
`LICENSE_SERVER_CONTACT_ENABLED=false` in the environment does the same and also locks the
switch.

**System → Instance** then shows "Not contacting lumastra.org: free tier." Turning the
switch back on enrolls or renews within half a minute, and turns the weekly check-in back on.

## Trademarks & forks

"Lumastra" and the Lumastra logos are trademarks of **Denis Arnst** (EU trade mark
application pending). They are **not** licensed under the AGPL or any other code
license. You may refer to Lumastra truthfully, redistribute unmodified packages under the
`lumastra` name and name plugins `lumastra-<something>`. A **fork or competing
distribution has to use its own name and branding**; the branding settings make that a
matter of configuration. The full policy is in `TRADEMARKS.md` in the repository.
Other product names in these docs belong to their owners and indicate compatibility,
not affiliation.

## Next

- [Get a license key by hand](https://lumastra.org/license/), for installs that can't
  reach the licensing server
- [Administering Lumastra](/guides/administration/), where the license key is entered
- [Plugins & extensions](/guides/plugins/)
- [Backup & key rotation](/guides/backup-recovery/)
