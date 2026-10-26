---
title: Setting up Live TV
description: Set up tuner broadcasts or provider-approved Live TV feeds, organize channels and program guides, and configure playback and source limits.
sidebar:
  order: 3.5
---

Lumastra's Live TV brings broadcasts from your own tuner and provider-approved feeds
into the same interface as your media library. Use broadcasts you are entitled to receive
and feeds licensed for this use by the broadcaster or an authorized TV provider,
including playback in third-party players. A paid subscription alone does not establish
that permission.

Sources connect through HDHomeRun, M3U playlists or Xtream Codes. Lumastra imports their
channels, matches a program guide, groups alternate feeds of the same station, and streams
through a dedicated [stream proxy](/architecture/live-tv/). It supplies no channels or TV
subscriptions, and needs no separate IPTV middleware.

Here's how to turn Live TV on and add your first source. The proxy, multiplexing and
failover are covered in [Live TV architecture](/architecture/live-tv/); day-to-day channel
administration is in [Administering Lumastra → Live TV](/guides/administration/#live-tv-and-radio).

## Example setups

### TV from your own tuner

Use a compatible network tuner to watch broadcasts you lawfully receive, privately at
home. For example, add your HDHomeRun’s LAN address, import its lineup and choose which
channels your household sees. Use channels available without bypassing encryption or
access restrictions; the tuner’s reception standard must match your local broadcasts.

### Broadcaster-published streams

Add an M3U playlist containing a broadcaster’s documented feeds for external players,
along with an XMLTV guide if one is available for this use. A regional or community
station that publishes such a feed can sit beside your tuner channels in the same guide.
Use the broadcaster’s reception instructions and permitted viewing area as your source.

### Your own live programming

Add a compatible feed from a production you control, such as a community event or a
live programme you make yourself. Include only material you own or have permission to
stream to the intended viewers, including any music or other third-party material.
Lumastra imports and plays the feed; you run the live production and source separately.

The [architecture page](/architecture/live-tv/#example-delivery-paths) shows how these
setups use the same import, guide and playback pipeline.

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

With adaptive bitrate the server encodes a channel in several qualities at once (1080p up
to 8 Mbps, 720p, 540p and 360p up to 1 Mbps), and the player switches between them to
match each viewer's connection. Click the quality badge in the player to see the qualities
and which one is playing.

It needs a GPU for hardware encoding and is tested with an Intel Arc A380; see
[GPU transcoding](/guides/gpu-transcoding/).

The synchronized quality ladder is off by default: enable
`LIVETV_ADAPTIVE_LADDER_ENABLED=true` in **Settings → Live TV** to offer multiple
qualities; `LIVETV_DEFAULT_QUALITY` sets the initial choice (`adaptive` by default).
When a requested quality cannot be produced, `LIVETV_CAP_FALLBACK=source` serves
the original stream; choose `refuse` to fail playback instead.

## Playback buffering and brief interruptions

When a live HLS source already offers completed segments, the proxy can start farther
behind its live edge to use that available history. It does not wait for a fixed buffer
on every channel change: a short source playlist starts with the entries it already has.
The tradeoff is a little more delay behind the broadcast, depending on segment length.

During a brief playlist-refresh failure, the proxy can keep using its last good playlist
for a limited time while available media remains readable. Access refusals and source
connection limits are still reported. This helps with temporary delivery interruptions;
it cannot restore missing video, repair corrupt timestamps, or guarantee uninterrupted
playback when the source itself fails.

## Monitor an active stream

Open **Admin → Users → Sessions** and expand **Stream diagnostics** beneath an active
Live TV channel. The channel logo appears beside its name when artwork is available.

The diagnostics show the source codecs and resolution, whether FFmpeg copies or
transcodes each track, failover attempts, and when the latest complete ingest segment
arrived. Retained video is the sum of segment durations currently held by the relay;
the viewer's own buffer and bandwidth are shown separately in their playback session.

Video timestamp observations help investigate freezes even when FFmpeg is running.
Forward jumps greater than one second are counted, with the largest jump and the time
of the latest observation. Backward jumps and signalled discontinuities are counted as
clock resets. The scan uses video PES decode timestamps (DTS), falling back to
presentation timestamps (PTS), in the ingest MPEG-TS output. It does not decode video
or inspect every viewer's output.

Counters start again when the ingest FFmpeg process restarts. **Not measured yet** means
no usable measurement is available, including when an older proxy does not supply the
new diagnostics. A timestamp jump can indicate missing video, but zero jumps or a
healthy FFmpeg process alone cannot guarantee smooth playback. Deploy the updated app
and stream proxy together to get all measurements.

## Add a source

Open **`/admin/settings/livetv`** (Sources tab) and choose **Add Source**, then pick a
source type supported by your tuner or provider and fill in its fields:

#### M3U playlist

| Field | Required | Notes |
| --- | --- | --- |
| Name | ✓ | Label shown in the admin list. |
| M3U URL | ✓ | A playlist supplied or approved by your broadcaster/provider, or exported by your own tuner (`http`/`https`). |
| XMLTV URL | — | An XMLTV program guide you have permission to use. Optional but recommended. |
| Max streams | — | Set the concurrent-channel cap within your source’s permitted limits (default 1). |

#### Xtream Codes

| Field | Required | Notes |
| --- | --- | --- |
| Name | ✓ | |
| Server URL | ✓ | The base URL supplied by a provider that permits this connection. |
| Username / Password | ✓ | Your provider-issued credentials. **Test credentials** checks the connection, not the rights to a service. |
| Max streams | — | Use the cap permitted by your provider. |

#### HDHomeRun

| Field | Required | Notes |
| --- | --- | --- |
| Name | ✓ | |
| Device IP | ✓ | Your own tuner’s LAN address, e.g. `192.168.1.50`, for broadcasts you are entitled to receive. |
| Max streams | — | Auto-filled from the device's tuner count. |

Saving starts the channel import immediately.

:::caution[Public URLs only, by default]
For SSRF safety, only public `http`/`https` URLs are accepted. To use a source on a
private/LAN address (a local IPTV box, or an HDHomeRun on `192.168.x` / `10.x`), set
`LIVETV_ALLOW_PRIVATE_URLS=true`.
:::

## What the import does

The import organizes your tuner’s lineup or a broadcaster/provider-approved playlist.
It cleans up metadata and alternate quality entries without adding access to other
channels:

- **Section headers**: playlist headings such as `DE • News` are metadata, not channels.
  They give the channels below them their group, and often their country.
- **Backup groups**: the feeds of one station (for example `Example One HD`,
  `Example One FHD` and `Example One (Mobile)`) form one backup group. Use only alternate
  feeds you are entitled to play. The preferred feed becomes the primary; the others become automatic
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
- **Parallel-schedule collapsing**: an XMLTV feed can reuse one `tvg-id` across
  several channel variants and concatenate each variant's schedule under it, so a single
  channel arrives carrying two or more complete schedules offset by seconds to hours.
  Lumastra keeps the richest one, gap-fills from the rest, and preserves genuine repeats.
  The import summary reports how many duplicate entries were dropped and on how many
  channels; a large count is normal for such feeds and needs no action.

The Sources tab shows channel-import progress, followed by guide-import progress.

:::tip[Playlists without channel IDs]
A playlist link that ends in a bare `type=` parameter usually carries no channel IDs,
groups or logos, so the guide can only be matched by name. The Sources tab shows a hint
for such a playlist. If the provider uses Xtream (a `get.php` link), change the end of
the M3U URL to `type=m3u_plus`, or add the provider as an Xtream Codes source instead.
:::

## Configure Lineup

After importing your source, choose **Configure Lineup** to organize the channels
viewers see. These are display filters for the supplied lineup; they do not change
which broadcasts or regions you are entitled to access:

- **Countries**: filter the supplied channels by country or region. The list shows
  every country the provider tags, with channel counts, plus regional groups (for example
  Arabic) and the religious and adult groups. Countries that match your browser languages
  are pre-selected. Religious and adult channels are never pre-selected. With no country
  selected, every country is kept.
- **Channels without a country**: keep them too. Providers often leave the channels of
  their home market untagged.
- **24/7 channels**: hide continuous-programming channels if you prefer scheduled
  broadcasts. The filter detects loops using channel names, missing guide data and
  neighboring playlist entries, including title-and-year names and themed channel families.
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

For older viewers, a helper or the admin can switch on
[Live TV simple mode](/guides/live-tv-simple-mode/): a large, calm screen with only their
own numbered channels and what is on now and next, optionally locked with a PIN.

## Sending Live TV through an outbound proxy

On managed networks that require an outbound HTTP proxy, route your permitted Live TV
connections through that network’s gateway with one variable:

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
tier, categories, ordering, and EPG-match review, including large tuner or provider lineups:

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
For a home setup, choose which household accounts can watch the configured sources.
Assign access only to viewers covered by your source’s viewing and sharing permissions;
Lumastra groups are application access controls, not broadcaster or provider authorization.

### Live TV in Active Streams

Active Streams shows each Live TV viewer separately, including the station logo,
current and next programme, guide progress, client, and available codec, resolution,
and adaptive-quality details. Clicking the card opens the station; stopping your
own stream releases that viewer's connection without interrupting other viewers.

You need Live TV permission to see someone else's Live TV stream, including when
you are an administrator. Stream privacy and device-detail visibility still apply.
Previews and ended or expired viewers are excluded. A missing programme guide or
a brief failure to read proxy details does not hide an otherwise live viewer.

### How stream limits are counted

Per-source **Max streams** counts distinct upstream channels, not viewers. For example,
household viewers watching the same tuner channel reuse one upstream connection. This is a transport counter:
it does not enforce or extend a provider’s separate viewer, device, household or
redistribution permissions. Set the source cap and user access to fit those permissions.

### Priority and preemption

When a source is already at its stream limit and someone tries to start an *additional*
(different) channel:

- A **low-priority** viewer is **refused**: they're told the stream limit is reached and can
  either wait or join a channel that's already live (no additional upstream slot, subject
  to the same viewing permissions).
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
each other. This priority only allocates the capacity already permitted for the source.

### Configure it

| Setting | Default | What it controls |
| --- | --- | --- |
| `LIVETV_GROUPS` | `livetv,admin` | Groups allowed to use Live TV at all. |
| `LIVETV_HIGH_PRIORITY_GROUPS` | `admin` | Groups whose members can preempt low-priority viewers. |
| `LIVETV_KICK_POLICY` | `shortest` | Which low-priority viewer to evict (`shortest` / `longest`). |
| Per-source **Max streams** | `1` | Local cap on concurrent *distinct upstream channels*; keep it within the source’s permitted limits. |
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

- [Live TV simple mode](/guides/live-tv-simple-mode/): a large, simple Live TV screen for older viewers
- [Live TV architecture](/architecture/live-tv/): the stream proxy, multiplexing, and failover
- [Administering Lumastra → Live TV](/guides/administration/#live-tv-and-radio): day-to-day channel management
- [Deploy with Docker](/guides/deploy-docker/): running the stream proxy as its own container
