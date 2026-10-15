---
title: Setting up Live TV
description: Add M3U, Xtream Codes, or HDHomeRun sources, import channels with automatic backup groups, genres and EPG, choose the countries to keep, and manage channels from the admin UI.
sidebar:
  order: 3.5
---

Lumastra's Live TV is **standalone**: you bring your own channel source (an M3U
playlist, an Xtream Codes account, or an HDHomeRun tuner), and Lumastra imports the
channels, matches a program guide, groups quality variants of the same channel, and
streams everything through a dedicated [stream proxy](/architecture/live-tv/). There is
no separate IPTV middleware to run.

Only add sources you're licensed to receive: your own tuner, free-to-air broadcasts, or a
provider you have a proper subscription with.

Here's how to turn Live TV on and add your first source. The proxy, multiplexing and
failover are covered in [Live TV architecture](/architecture/live-tv/); day-to-day channel
administration is in [Administering Lumastra → Live TV](/guides/administration/#live-tv-and-radio).

## Before you start

Two things must be in place before the Live TV admin pages do anything. Until then,
Live TV stays hidden from users and the admin pages are empty.

| Requirement | Variable | Notes |
| --- | --- | --- |
| Turn the feature on | `FEATURE_LIVETV` | **Off by default**: set it to `true`. This is the single on/off switch for Live TV. |
| Stream proxy reachable | `STREAM_PROXY_URL`, `STREAM_PROXY_SECRET` | Required once the feature is on. Run the stream proxy as a separate container and point the app + worker at it; the **same** `STREAM_PROXY_SECRET` must be set on the app and the proxy. See [Deploy with Docker](/guides/deploy-docker/). |

:::note[About `LIVETV_SOURCE`]
You normally don't set `LIVETV_SOURCE`. It defaults to `standalone` (M3U/XMLTV with the
stream proxy), the only working mode, and is an advanced setting. It chooses *how* channels
are sourced; it is **not** a playlist URL. The actual playlists/accounts/tuners are added as
**sources** in the admin UI (below), and you can add several. (Its other value, `disabled`,
just turns the source off while leaving the feature flag on.)
:::

## Adaptive quality

The synchronized quality ladder is off by default: enable
`LIVETV_ADAPTIVE_LADDER_ENABLED=true` in **Settings → Live TV** to offer multiple
qualities; `LIVETV_DEFAULT_QUALITY` sets the initial choice (`adaptive` by default).
When a requested quality cannot be produced, `LIVETV_CAP_FALLBACK=source` serves
the original stream; choose `refuse` to fail playback instead.

## Add a source

Open **`/admin/settings/livetv`** (Sources tab) and choose **Add Source**, then pick a
source type and fill in its fields:

#### M3U playlist

| Field | Required | Notes |
| --- | --- | --- |
| Name | ✓ | Label shown in the admin list. |
| M3U URL | ✓ | The playlist URL (`http`/`https`). |
| XMLTV URL | — | Program-guide (EPG) URL. Optional but recommended. |
| Max streams | — | Concurrent-stream cap for this source (default 1). |

#### Xtream Codes

| Field | Required | Notes |
| --- | --- | --- |
| Name | ✓ | |
| Server URL | ✓ | The Xtream server base URL. |
| Username / Password | ✓ | Use **Test credentials** to verify before saving. |
| Max streams | — | |

#### HDHomeRun

| Field | Required | Notes |
| --- | --- | --- |
| Name | ✓ | |
| Device IP | ✓ | e.g. `192.168.1.50`. |
| Max streams | — | Auto-filled from the device's tuner count. |

Saving starts the channel import immediately.

:::caution[Public URLs only, by default]
For SSRF safety, only public `http`/`https` URLs are accepted. To use a source on a
private/LAN address (a local IPTV box, or an HDHomeRun on `192.168.x` / `10.x`), set
`LIVETV_ALLOW_PRIVATE_URLS=true`.
:::

## What the import does

While importing, Lumastra auto-processes the channel list so you don't have to clean up
hundreds or thousands of near-duplicate entries by hand:

- **Section headers**: many large playlists put decorated header rows between their
  channels, such as `✦●✦ DE • News ✦●✦`. These rows are not imported as channels. They
  give the channels below them their group, and often their country.
- **Backup groups**: the feeds of one station (for example `Example One HD`,
  `Example One FHD`, `Example One HD+`, `Example One HDraw`, `Example One Cable`,
  `Example One (Transcoded)` and `Example One (Mobile)`) form one backup group. The best
  clean feed becomes the primary; the others become automatic
  [backup/failover](/architecture/live-tv/#backup-channels-failover) streams, so a dropped
  stream switches to the next. A transcoded or mobile feed is never the primary while a
  normal feed exists.
- **Quality tiers**: SD / HD / FHD / UHD are detected from channel names.
- **Categories**: each channel gets a genre, read from the provider's section names in
  many languages: Live Events, Sports, News, Movies, Series, Kids, Documentary, Music,
  Entertainment, General, Regional, Radio, Shopping, 24/7, Religious or Adult. A section
  that names no genre keeps the provider's bouquet name, without its country part. A
  bouquet section whose stations span several genres is split into those genres (General
  for a station without one), unless your Configure Lineup choices hide that bouquet.
- **Country or region**: taken from the channel's `tvg-id`, a tag in its name (`US:`,
  `|BG|`, `[DE]`), the section header above it, or the script of the section name.
  Configure Lineup uses it to pick countries (below).
- **EPG matching**: if you supplied an XMLTV URL, programs are matched to each channel for
  the guide. When a guide lists the same station once per country, a channel gets the
  entry of its own country. All feeds of a backup group share the guide and the logo
  that one of them has.
- **Parallel-schedule collapsing**: many aggregator XMLTV feeds reuse one `tvg-id` across
  several channel variants and concatenate each variant's schedule under it, so a single
  channel arrives carrying two or more complete schedules offset by seconds to hours.
  Lumastra keeps the richest one, gap-fills from the rest, and preserves genuine repeats.
  The import summary reports how many duplicate entries were dropped and on how many
  channels; a large count is normal for such feeds and needs no action.

Providers with more than 10,000 channels import too. The source shows the progress of the
channel import, and then of the guide import, which starts when the channels are in.

:::tip[Playlists without channel IDs]
A playlist link that ends in a bare `type=` parameter usually carries no channel IDs,
groups or logos, so the guide can only be matched by name. The Sources tab shows a hint
for such a playlist. If the provider uses Xtream (a `get.php` link), change the end of
the M3U URL to `type=m3u_plus`, or add the provider as an Xtream Codes source instead.
:::

## Configure Lineup

A large provider carries channels from many countries. After the import, choose
**Configure Lineup** on the source to decide which channels viewers see:

- **Countries**: keep channels from any number of countries or regions. The list shows
  every country the provider tags, with channel counts, plus regional groups (for example
  Arabic) and the religious and adult groups. Countries that match your browser languages
  are pre-selected. Religious and adult channels are never pre-selected. With no country
  selected, every country is kept.
- **Channels without a country**: keep them too. Providers often leave the channels of
  their home market untagged.
- **24/7 channels**: hide channels that loop one show, film or episode. This also covers
  film titles with a year and no guide (`Example Film (1998)`), a provider's large
  families of film-loop channels (dozens of `Example Cinema <theme>` channels), and
  single titles that sit next to loop channels in the playlist.
- **Info and welcome screens** (on by default): hide the provider's announcement
  channels, such as `Event Info`, `Welcome Channel` or a channel overview. A station whose
  name merely ends in "Info" stays.
- **Radio stations** (on by default): hide channels in the Radio category.
- **Local stations** (on by default): hide many stations of one network, each with its
  own call sign in brackets, like `Network (WXYZ) City`.
- **Event slots** (off by default): hide numbered channels without a guide that only show
  a picture during a match, such as `Example Event 1` to `Example Event 40`. They stay by
  default because `/livetv` shows each family as one card. A slot with its own guide is
  treated as a station and stays.
- **Categories**: hide single categories.

- **Quality preference**: with **Prefer highest quality** on, each backup group keeps only
  its primary feed visible and hides the other feeds.

A switch only appears when the source has channels of that kind, with their count next to
it.

Channels that Configure Lineup leaves out are hidden, not deleted; you can show them again
in Channel Management.

The choices are saved with the source. A re-import applies them again, and a refresh hides
new channels they exclude. A source set up before the info, radio, local-station and
event-slot switches existed keeps hiding none of those until you run Configure Lineup on
it again; its 24/7 choice covers the wider loop detection after the next re-import or
refresh.

## What viewers see

Viewers see each backup group as one channel. That channel plays the group's primary feed
when it is visible. If the primary is hidden, viewers get the best visible feed of the
group instead: a normal feed before a transcoded or mobile one, then the higher quality. A
group disappears only when none of its feeds is visible.

On `/livetv`, a row of category chips filters the channel grid and the guide to one genre;
the last choice is remembered. A family of numbered channels (for example "Live Event 1"
to "Live Event 10") is one card that opens a dialog with those channels and a guide of
just them.

## Sending Live TV through an outbound proxy

Some networks only allow outbound traffic through a proxy. To send **all** outbound Live
TV traffic through a forward proxy, set one variable:

| Variable | Notes |
| --- | --- |
| `LIVETV_UPSTREAM_PROXY_URL` | HTTP **CONNECT** proxy URL, e.g. `http://proxy:8888`. Inline credentials are supported (`http://user:pass@proxy:8888`). Empty = direct connections (default). |

It covers every path that talks to the source: M3U/XMLTV import and refresh, channel
logos, Xtream credential checks and the live stream pulls. It is **fail-closed**: when a
proxy is set, Lumastra never falls back to a direct connection, so if the proxy is down,
Live TV stops instead of bypassing it. Only **HTTP CONNECT** proxies are supported; for a
SOCKS-only proxy, put a `socks→http` shim such as gost or privoxy in front.

:::caution[Set it on the stream proxy too]
The app/worker and the **stream proxy** are separate containers, and each reads this
variable on its own. Set `LIVETV_UPSTREAM_PROXY_URL` on **all** of them. If you set it only
on the app, imports and logos go through the proxy but live playback doesn't.
:::

:::note[HTTPS streams and the bundled FFmpeg]
Imports and the app handle HTTPS fine, but the bundled (Jellyfin) FFmpeg can **crash when
it pulls an HTTPS stream through an HTTP proxy**. HTTP streams are unaffected. If your
source serves **HTTPS** streams, run the stream-proxy container inside the network of the
container that provides your outbound route, instead of using
`LIVETV_UPSTREAM_PROXY_URL` for it. See
[Live TV architecture → Outbound proxy](/architecture/live-tv/#outbound-proxy).
:::

## Manage channels

Once imported, manage everything from **`/admin/settings/livetv`**. See
[Administering Lumastra → Live TV](/guides/administration/#live-tv-and-radio) for the full
reference.

The **Channels** tab (Channel Management) holds channel visibility, display names, quality
tier, categories, ordering, and EPG-match review. It is built for lineups with thousands of
channels:

- **Show hidden** is off by default, so the list shows what viewers get. Turn it on to see
  and restore hidden channels; the setting is remembered in your browser. While hidden
  channels are out of view, moving a channel takes its hidden feeds along.
- A **category rail** beside the list jumps to a category and highlights the one you are
  scrolling through. On phones it is a **Jump to category…** list.
- The header of an open category stays at the top while you scroll its channels. Long
  categories show their first 100 channels and a button for more.
- **Move to category…** (in the context menu and for a selection) opens a picker you can
  type into, and adds the channels at the end or at the top of that category.

**Backup Groups**, next to the channel list on the Channels tab, lists the groups the
import detected:

- Search group and feed names, filter by category, country and on/off air, and sort by
  name, number of feeds or category.
- Each group shows how many of its feeds are visible ("2 of 4 on air") and tags the feed
  viewers get as **On air**. Every feed has a button to show or hide it.
- Problem badges point out groups to check: **Primary hidden**, **No primary**, **Mixed
  countries** (probably two stations in one group; split it) and **Mixed categories**.
  **Problems only** lists just those groups.
- **Make primary** (the star on a feed) makes that feed the group's primary. A group whose
  primary is hidden offers **Make the on-air feed primary**, and the toolbar does this for
  all such groups at once. A refresh keeps the primary you chose.
- **Add to group** moves an ungrouped channel into a group, through a picker you can type
  into.

## Keeping channels fresh

Each source has a **refresh schedule** (default: every 12 hours), selectable per source in
the admin list. Two manual actions are also available on each source:

- **Refresh**: an incremental update that absorbs provider-side changes (new/removed
  channels, changed URLs) while **preserving your admin customizations** (visibility,
  renames, categories, grouping, the primary of a group). New channels that your
  Configure Lineup choices exclude are hidden.
- **Re-import**: rebuilds the source's channel list from scratch. Use this if you want a
  clean slate; it discards per-channel customizations for that source. Your Configure
  Lineup choices are applied again. A re-import is also how existing channels pick up
  improvements to the import, such as new grouping or category rules.

## When a source is unavailable

Cached channels and guide data remain browsable during outages. A failed feed refresh
alone does not mean streams are unavailable. Homepage recommendations hide channels
with recent playback failures, or unverified channels from sources with both feed
and upstream stream failures.

Check `/admin/tasks` for refresh-run details and `/admin/settings/livetv` for source
and playback failures. The admin dashboard groups incidents by source. Availability
reflects observed refreshes and playback; Lumastra does not continuously test every
channel.

## Access, stream limits & priority

### Who can watch

Live TV is restricted to the identity-provider groups in `LIVETV_GROUPS` (default
`livetv,admin`). Users outside those groups don't see the Live TV section at all.

### How stream limits are counted

Per-source **Max streams** counts distinct channels, not viewers. Ten viewers watching
one channel use one slot; joining an already-live channel uses no extra slot.

### Priority and preemption

When a source is already at its stream limit and someone tries to start an *additional*
(different) channel:

- A **low-priority** viewer is **refused**: they're told the stream limit is reached and can
  either wait or join a channel that's already live (joining a live channel is always free).
- A **high-priority** viewer **preempts**: Lumastra evicts one low-priority viewer to free a
  slot. The evicted viewer's stream stops, and they see a message that they were disconnected
  because a higher-priority viewer needed the slot.

A viewer is **high priority** if they're an admin **or** belong to any group in
`LIVETV_HIGH_PRIORITY_GROUPS` (default `admin`); everyone else is low priority.

Which low-priority viewer is evicted is set by `LIVETV_KICK_POLICY`:

| Value | Evicts |
| --- | --- |
| `shortest` (default) | The viewer who started **most recently** (shortest watch time): the least disruptive choice. |
| `longest` | The viewer who has been watching **longest** (oldest session). |

Preemption only ever targets a low-priority viewer on a *different* channel. If every occupied
slot is held by a high-priority viewer (or the only other viewers are on the channel you're
joining), even a high-priority request is refused. Priority lets you bump casual viewers, not
each other.

### Configure it

| Setting | Default | What it controls |
| --- | --- | --- |
| `LIVETV_GROUPS` | `livetv,admin` | Groups allowed to use Live TV at all. |
| `LIVETV_HIGH_PRIORITY_GROUPS` | `admin` | Groups whose members can preempt low-priority viewers. |
| `LIVETV_KICK_POLICY` | `shortest` | Which low-priority viewer to evict (`shortest` / `longest`). |
| Per-source **Max streams** | `1` | Concurrent *distinct channels* allowed from that source. |
| `LIVETV_VIEWER_TIMEOUT_SECONDS` | `30` | Heartbeat timeout before an idle viewer's slot is reclaimed. |
| `LIVETV_GRACE_PERIOD_SECONDS` | `30` | How long the encoder keeps running after the last viewer leaves, so rejoining is instant. |

The group/policy settings are editable under `/admin` settings (or as environment variables);
**Max streams** is per source in the `/admin/settings/livetv` source form.



### Transcoding

The proxy remuxes or transcodes per stream; tune it from `/admin/settings/livetv` (Proxy tab)
(see [Administration](/guides/administration/#live-tv-and-radio)).

:::note[No DVR]
Live TV has rich channel management and automatic failover, but there is **no recording /
DVR** today.
:::

## Next

- [Live TV architecture](/architecture/live-tv/): the stream proxy, multiplexing, and failover
- [Administering Lumastra → Live TV](/guides/administration/#live-tv-and-radio): day-to-day channel management
- [Deploy with Docker](/guides/deploy-docker/): running the stream proxy as its own container
