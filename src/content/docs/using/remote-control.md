---
title: Remote control
description: Control your other Lumastra devices from your phone or the web, let a household helper do the same, and send a message to a screen.
sidebar:
  order: 4
---

The remote controls any Lumastra device on your account. Start something on the TV from
your phone, pause it, skip ahead, or send a short message.

A device appears in the remote when it is signed in to your account and online.
Lumastra apps on iPhone, iPad and Apple TV work as targets. The web player works
as a remote.

## Open the remote

- **iPhone and iPad:** the **Remote** screen, the Live TV channel pad, and
  **Play on Apple TV** in a title's menu.
- **Web:** **Settings → Sessions**, then **Remote** next to a device. **Send to TV** on a
  title's page starts it on a device you pick.

The remote shows what the device plays now: the title or channel logo, the position and
whether it is paused. It offers only what that device can do at that moment. A control
that is missing is not available on that device right now.

## What you can do

| Action | Notes |
| --- | --- |
| Start a movie, episode, series, album, playlist, track or audiobook | A series continues where you left off. Playback resumes unless you choose to start over. |
| Pause, resume, stop | |
| Seek | Back or forward 10 or 30 seconds. |
| Next and previous | Episode, track or chapter. |
| Audio and subtitle track | Pick from the tracks of the current item, or turn subtitles off. |
| Skip intro | Also recap, credits and preview, when the current item has them. |
| Cancel autoplay | Stops the countdown to the next episode. |
| Sleep timer | After a number of minutes, or at the end of the current item. |
| Music queue | Add, move, remove or clear items. |
| Live TV | Tune a channel, or go one channel up or down. |
| Watch Together | Make the device join a party. See [Watch Together](/using/for-viewers/#watch-together). |
| Message | A short text, optionally with an **OK** button. The text shows on the screen. |

A command that cannot work is refused with a reason, for example when the device is
asleep or offline. An Apple TV in standby cannot be woken by the app.
The remote cannot change the volume of a TV.

## Live TV simple mode

When a device uses a locked [simple mode](/guides/live-tv-simple-mode/) setup, the remote
refuses commands that would leave it. Starting a film and joining a party are refused.
Tuning channels, pausing and messages still work.

## Let someone else control your devices

A household helper has their own account. You can allow them to use the remote on your
devices, for example to set a channel for a parent or to send a message.

1. Open **Settings** and find **Remote control helpers**.
2. Enter their username and select **Allow**.

The person sees your devices under **Devices you can control**, with your name next to
each one. Select **Remove** to stop it. The change applies at once. Helpers get the
same remote as you. The simple mode limit above applies to them too.

## Messages from the admin

Admins can send a message to a running session from **Admin → active sessions**. On a
Lumastra app, it shows on the device. In other players, such as a browser, it shows as
a notice. See [Sessions and transcoding](/guides/administration/#sessions-and-transcoding).

## Jellyfin apps

A Jellyfin app that offers remote control can control the Lumastra devices on your
own account. In the other direction, the Lumastra remote lists Jellyfin clients that
announce remote control. For those it supports basic transport, starting playback
and messages. See [Connecting third-party apps](/using/third-party-players/).

## For developers

Apps and scripts use the same commands over the API. See
[Device remote control API](/developers/watch-together/#device-remote-control).
