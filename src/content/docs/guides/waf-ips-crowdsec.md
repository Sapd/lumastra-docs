---
title: WAFs, IPS & CrowdSec
description: Run Lumastra behind CrowdSec, fail2ban or a WAF without banning your own
  viewers. Why HLS playback looks like aggressive crawling to generic bot rules, the
  CrowdSec parser fix, and making the real client IP survive every proxy hop.
sidebar:
  order: 4.35
---

This guide is for self-hosters running an intrusion-prevention system (CrowdSec,
fail2ban, or a WAF) in front of Lumastra. You'll need shell access to that system to
add a local parser or adjust its rate-limit rules.

Streaming does not look like browsing. A single viewer watching one film generates
**thousands of small, sequential, never-repeated requests**: one per media segment,
plus one per subtitle segment, plus playlist refreshes. To a generic bot-detection rule
that looks the same as someone enumerating your site.

An intrusion-prevention system installed to keep scanners out will happily ban **your
own users, mid-episode**, and from the client side the ban looks exactly like a server
fault.

:::caution[The short version]
If you run **CrowdSec** in front of Lumastra, apply the [parser
fix](#the-fix-mark-media-segments-as-static) below before you let it enforce anything.
With stock rules, roughly **40 seconds of playback** is enough to get a legitimate
viewer banned.
:::

## Why playback trips bot rules

Lumastra serves video through HLS. With the default 6-second segments
(`FFMPEG_SEGMENT_DURATION`), a two-hour film is **~1200 media segments**. If the viewer
enables subtitles, add roughly **120 more**, because subtitle renditions are segmented
on their own fixed 60-second interval, not the video's own segment timeline.

Every one of those has a **distinct filename** (`segment_00004.m4s`, `seg_00035.vtt`,
…), which is exactly the signal "aggressive crawling" rules look for. The burst is also
front-loaded: a player fills its buffer at startup, so the first seconds of playback
produce a much higher request rate than steady-state viewing.

A representative sample from one server's access log:

| Extension | What it is | Requests |
| --------- | ---------- | -------- |
| `.m4s`    | CMAF / fMP4 media segments | **5992** |
| `.ts`     | MPEG-TS media segments (legacy HLS) | 613 |
| `.vtt`    | WebVTT subtitle segments | 379 |

## CrowdSec: the stock rules ban viewers

Two stock components combine badly:

- **`crowdsecurity/http-logs`** decides whether a request is for a "static resource"
  purely by **file extension**. Its list includes `.TS` and `.MP4`, but not `.M4S`,
  `.M3U8` or `.VTT`.
- **`crowdsecurity/http-crawl-non_statics`** then counts **distinct non-static
  filenames**: `capacity: 40`, `leakspeed: 0.5s`. It fires once 40 distinct names
  overflow the bucket.

So classic `.ts` HLS is treated as static and passes, while **modern CMAF `.m4s`
segments and all subtitle segments count as a crawl**. The bucket drains about two
events per second; a player's initial buffer fill comfortably beats that. The viewer is
banned within about 40 seconds of pressing play.

:::note[This is not a Lumastra-specific quirk]
`.m4s` is the standard CMAF segment extension used across modern streaming, segmented
WebVTT is what the HLS specification calls for, and 6-second segments are the commonly
recommended default. The extension list simply predates CMAF: it contains `.ts`
(classic HLS) but not its replacement. Any modern streaming application behind
CrowdSec runs into this.
:::

### How to recognise it

Inspect what the banned address actually fetched. This separates viewers from
attackers immediately:

```bash
cscli alerts inspect <alert-id> -d | grep target_uri
```

| What you see | Verdict |
| ------------ | ------- |
| `/api/v1/playback/…/hls/…/segment_00004.m4s` | A **viewer**. False positive, unban. |
| `/api/v1/playback/…/hls/subs_0/seg_00035.vtt` | A **viewer** watching with subtitles. |
| `/.env`, `/.gitconfig`, `/.dockerenv` | A real scanner hunting for secrets. Keep banned. |
| `/wafs.php`, `/proc/self/cmdline`, `/var/run/secrets/kubernetes.io/serviceaccount/token` | A real attacker. Keep banned. |

### The fix: mark media segments as static

Add a local parser that re-classifies streaming extensions as static resources. This
is better than whitelisting the URLs outright: the requests still feed every other
scenario, they just stop counting as "crawling".

Create `/etc/crowdsec/parsers/s02-enrich/zz-media-segments-static.yaml`:

```yaml
onsuccess: next_stage
name: local/media-segments-static
description: >
  Treat HLS/DASH media segments, playlists and subtitle tracks as static resources.
  crowdsecurity/http-logs only lists .TS and .MP4, so CMAF .m4s segments and segmented
  .vtt subtitles count as non-static and trip http-crawl-non_statics during normal
  playback.
filter: "Upper(evt.Parsed.file_ext) in ['.VTT','.WEBVTT','.M3U8','.M4S','.SRT','.ASS','.MPD']"
statics:
  - parsed: static_ressource
    value: 'true'
```

Then reload and verify:

```bash
systemctl reload crowdsec
cscli explain --log '<a real segment line from your access log>' --type nginx
```

:::danger[The `zz-` filename prefix matters]
Parsers in the same stage run in **filename order**, and this one must run **after**
`http-logs.yaml`. Otherwise `http-logs` sets `static_ressource: false` again afterwards
and your parser does nothing. Keep a name that sorts after it. `cscli explain` will show
your parser listed **below** `crowdsecurity/http-logs`; if it appears above, rename it.
:::

Note that `static_ressource` is spelled with the double `s`. That is CrowdSec's own
spelling, not a typo here.

### Why a proxy path exclusion is not enough

The obvious alternative, excluding `/api/v1/playback/` from the bouncer in your reverse
proxy, does not solve this. It's worth understanding why before you reach for it.

A proxy-level exclusion only suppresses the **remediation lookup** on those paths.
Detection happens separately, by parsing your access logs, so:

1. The ban is still **created** from the playback requests.
2. The viewer is then blocked on **every other path** (browsing the library, the API,
   logging in) while media segments keep flowing.

The result is a user whose video plays but whose interface is broken: a confusing
thing to debug. Fix the classification, not the enforcement.

## Make the real client IP survive every hop

Anything that bans by IP is only as good as the address it sees. If you run **more than
one proxy**, say a TLS-terminating edge in front of an internal reverse proxy, the
client address must be carried across **every** hop, via PROXY protocol or a trusted
`X-Forwarded-For` chain.

When a hop drops it, every request downstream appears to come from that proxy, often
`127.0.0.1`. The consequences are worse than losing attribution:

- Your IPS **cannot ban a real attacker**, because every request shares one source.
- Per-IP rate limits and connection limits collapse into a **single shared bucket**.
- If the IPS ever decides to ban that address, it bans **every user at once**.
- Lumastra's own `TRUSTED_PROXY_IPS` check sees the wrong peer. See
  [Authentication](/guides/authentication/).

:::caution[PROXY protocol is a matched pair]
Sending PROXY protocol from one proxy and accepting it at the next are **two settings
that must be applied together, in one reload**. Enabling either alone breaks *all*
traffic through that path. Validate the config before reloading, and have a rollback
ready.
:::

:::danger[Fixing the client IP activates every existing ban at once]
If your IPS has been seeing one address for all traffic, its existing decisions have
been **inert**. The moment real client IPs start flowing, every one of those bans
becomes enforceable at the same time, including any false positives it accumulated
while nobody noticed. That may well include your own address.

Run `cscli decisions list` and triage **before** you apply the fix, not after.
:::

## Rate limits and connection limits

Sizing per-IP limits for "a web app" will throttle playback. Budget for:

- **Sustained request rate**: one media segment every segment duration (6s default),
  plus one subtitle segment every 60 seconds when the viewer has subtitles on, per
  active stream. Several times that during buffer fill and after every seek.
- **Concurrent connections**: players open several in parallel, and one household
  behind a single NAT address may have multiple streams running.
- **Long-lived responses**: a large segment or a download is a single connection held
  open for a while. Do not treat a long request as a stalled one.

Exempt the playback paths from per-IP request-rate limits, or set the limits high
enough that a household running two or three streams stays comfortably under them.

## Symptom table

| What you see | Likely cause |
| ------------ | ------------ |
| Playback works, but the UI returns 403 after a few minutes | IPS banned the viewer from playback traffic; the proxy excludes media paths but not the rest |
| A user is fine on mobile data but blocked at home | Their home address is banned; the mobile one is not |
| Every request appears to come from one address in your logs | A proxy hop is dropping the client IP |
| Bans appear for your own users shortly after enabling PROXY protocol | Previously inert decisions just became enforceable |
| Streams stall or abort while the server shows the response completing quickly | Not a WAF issue, look at the network path to the client |

:::tip[If you terminate HTTP/3 at your edge]
Measure it before trusting it. Proxy QUIC implementations vary widely in
sustained-download throughput, and a slow one is easy to miss because small requests
still feel fast. Pull one large file over HTTP/2 and again over HTTP/3, several times
each, and compare. Clients that see an `Alt-Svc` header will prefer HTTP/3 for up to 24
hours, so a degraded QUIC path silently becomes the path almost all of your traffic
takes.
:::

## Next

- [Backup & recovery](/guides/backup-recovery/): back up before you lock the front
  door down further
- [Rotating the master key](/guides/master-key-rotation/)
- [Administering Lumastra](/guides/administration/): where WAF/CrowdSec status
  surfaces in the admin UI
- [Authentication](/guides/authentication/): `TRUSTED_PROXY_IPS` and the proxy trust
  boundary
