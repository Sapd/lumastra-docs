---
title: iOS push notifications
description: How push notifications reach the Lumastra iOS app, why they work without any setup, and how to run your own relay or talk to Apple directly instead.
sidebar:
  order: 3.8
---

This page explains how new-episode and request-available notifications reach
the Lumastra iOS app as push notifications. Push works out of the box — you don't
need to configure anything. The rest of this page is for operators who want to
check that it's working, switch it off, or keep the Lumastra-operated relay out of
the path entirely.

## How it works

Apple only accepts pushes for an app signed with that app's own Apple key. The
stock iOS app's key can't ship inside a self-hosted server, so it lives on a
small **relay** the maintainer runs at `push.lumastra.org`. Your server hands
each notification to the relay, and the relay forwards it to Apple.

To use the relay, your server needs a credential. It gets one automatically:
every six hours, the licence refresh your server already makes to
`lumastra.org` also returns a **relay token**. That's a signed credential,
valid for 24 hours and bound to your install's ID, that your server presents to
the relay. Every install gets one, free tier included. Nothing needs to be
copied, pasted or renewed by hand.

On the relay route the notification is **content-free**. The relay sees your
users' device tokens and a generic banner ("New episode available"), never a
title, poster or user name. The iOS app then fetches the real text and artwork
from your server. [What Lumastra sends where](/reference/data-flows/#pushlumastraorg-the-ios-push-relay)
lists every field.

## Checking it works

The server tells the iOS app whether push can be delivered, and the app asks
for notification permission only when it can. To see the same answer, call the
capabilities endpoint:

```bash
curl -s https://your-server/api/v1/server/capabilities | jq .push
```

`{"available": true}` means push is ready. Otherwise, `unavailable_reason` says
why:

| `unavailable_reason` | Meaning | Fix |
| --- | --- | --- |
| `feature_disabled` | `FEATURE_PUSH_NOTIFICATIONS` is off | Turn it on under **Settings → Access → Push notifications** |
| `device_auth_disabled` | `FEATURE_DEVICE_AUTH` (the Public API) is off, so the app cannot register a device | Turn it back on under **Settings → Access → Public API & Device Auth** (on by default) |
| `not_entitled` | The licence doesn't include push | Should not happen today (every tier includes push); check **Settings → Licensing** |
| `no_relay_credential` | No usable credential yet | See below |

`no_relay_credential` right after a restart is normal: the first relay token
arrives a few seconds after boot. If it stays, your server can't reach
`lumastra.org`. The server log names the failure under `LicenseRefresh`.
Outbound HTTPS to `lumastra.org` and `push.lumastra.org` must be allowed.

## Turning it off

Set `FEATURE_PUSH_NOTIFICATIONS=false` (**Settings → Access → Push notifications**).
Delivery stops immediately and queued pushes are dropped; the in-app
notification inbox is unaffected. With push off, your server no longer contacts
`push.lumastra.org`.

## Running your own relay

If you build and sign your own iOS app, you can run the relay yourself. It's a
small stateless service that holds your Apple `.p8` key. Point your server at it:

```bash
PUSH_RELAY_URL=https://push.example.com   # no trailing slash
PUSH_RELAY_TOKEN=<the bearer your relay expects>
```

A configured `PUSH_RELAY_TOKEN` always takes precedence over the automatic
relay token.

## Talking to Apple directly

If you build your own iOS app, you can skip the relay altogether. Set
`APNS_KEY_P8` (or `APNS_KEY_P8_PATH`) to your Apple push key. Your server then
talks to `api.push.apple.com` itself, and because no intermediary sees the
payload, the banner carries the real title. `PUSH_TRANSPORT` picks the route
when both are configured; the default, `auto`, prefers your own key.

## Rate limits

The Lumastra relay limits each install to 120 requests and 3,000 device
notifications per minute. That's far above what a household or a server with
friends sends, and the dashboard retries automatically when it's told to slow
down.
