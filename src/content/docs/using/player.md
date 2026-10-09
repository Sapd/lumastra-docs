---
title: Using the video player
description: Keyboard shortcuts, playback preferences, quality choices, and buffering diagnostics.
sidebar:
  order: 2
---

## Keyboard and touch shortcuts

| Key | Action |
|---|---|
| `Space` / `k` | Play / pause |
| `f` | Fullscreen |
| `m` | Mute |
| `←` / `j`, `→` / `l` | Seek back / forward 10 s |
| `↑` / `↓` | Volume |
| `c` | Toggle subtitles |
| `0`–`9` | Jump to 0%–90% |
| `>` / `<` | Change speed |
| `.` / `,` | Step a frame forward / back while paused |
| `Enter` | Skip the current intro/credits segment or advance to the next episode |

Double-tap the left or right edge on touch devices to seek.

## Quality and tracks

In **Settings → Quality**, **Original** streams the source when your browser supports
it. Fixed resolutions use server transcoding. **Auto**, when enabled by your
administrator, adjusts bitrate to your connection. Titles with multiple cuts or encodes
list them under **Versions**.

Your last audio language, subtitle language, and subtitle style are saved to your account
and restored next session. Seek-preview thumbnails and intro/credits skipping depend on
server-side analysis; missing previews or skip buttons may mean it hasn't run yet.

## Playback preferences

**Quality → Playback Settings** contains autoplay (with a 3–60 s countdown) and
automatic intro/credits skipping. Enable **Ask if you're still watching** under
**Settings → Playback**. The prompt appears after two episodes autoplay without
interaction and is off by default.

In a [Watch Together party](/using/for-viewers/#watch-together), only the host can seek,
skip segments, change speed, or advance the party. Anyone can pause or resume.

## Test your connection

For buffering, open **Settings → Playback → Connection**. The test measures downloads
from your Lumastra server to the device and network you're using.

| Profile | Use when |
|---|---|
| **Quick (16 MB)** | You need an initial speed check. |
| **Long (64 MB, up to 60 s)** | Speed drops during a longer download. |
| **Segment cadence (8 × 4 MB, 2 s apart)** | Playback stutters intermittently despite a good average speed. |

### Reading the result

- **Mbit/s** measures download speed after the first byte arrives.
- **First byte** measures the wait before data starts arriving. A long wait with good
  throughput can indicate server load or distance.
- **Slowest ¼ second** and **Stalled** reveal uneven delivery hidden by the average.
- For **Segment cadence**, compare the **worst segment** and **worst first byte** with
  the overall result to spot intermittent delays.

Compare sustained throughput with the video's bitrate. If delivery is uneven, try a
lower quality. The Apple TV and iPhone apps offer the same profiles in Settings.

Your device submits the measurements to the server. Results are kept for 90 days,
visible to you and your administrator, included in your data export, and removed when
your data is erased.
