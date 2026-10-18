---
title: Live TV simple mode
description: A large, calm Live TV screen for older viewers, with their own numbered channels and what is on now and next. A helper or the admin sets it up and can lock it with a PIN.
---

Simple mode turns Live TV into a screen that works like a classic TV set. It is meant for
viewers who don't want to browse: for example an older family member. Someone else, a
younger relative or the server admin, sets it up for them and can lock it with a PIN.

Simple mode needs Live TV to be set up first. See [Setting up Live TV](/guides/live-tv/).

## What the viewer sees

- **Only their own channels**, numbered 1, 2, 3 in a fixed order. These are the
  account's favorite channels, in favorite order. A channel's number is its place in that
  list.
- **Large type and big buttons**, with what is on **now** and what comes **next**. A
  channel without a logo gets a coloured disc with its initials. A channel without a
  guide shows only its name.
- **Few choices.** Search, the guide grid and the category chips are hidden. Info
  messages don't pop up.

There are three layouts:

| Layout | What it does |
| --- | --- |
| **TV** (default) | Opens straight into the picture. Up and Down change the channel, like a classic TV. A large banner shows the channel number, name and what is on, for a few seconds after each change. |
| **List** | A numbered list of the channels with what is on now and next. Pick one to watch. |
| **Tiles** | Large numbered tiles. Best for touch screens and tablets. |

**Text size** is **Large** or **Extra large**. Extra large makes the simple screens about
a quarter bigger.

5 to 15 channels work best. Most viewers use only a handful.

## Set it up for someone

There are three places to set it up. All of them change the same settings, and every
device of that person follows them.

**As the admin, from your own device.** Go to **Admin > Users**, pick the person and open
the **Live TV** tab. You don't need their password, and you can do it from your phone.

**On the person's own account.** Sign in as them (or sit next to them) and open Live TV.
Click **Simple mode** in the Live TV header, or go to **Settings > Display > Live TV
simple mode** and click **Set up simple mode**. When simple mode is already on, the simple
screen has a **Settings for helpers** link at the bottom.

In the setup screen:

1. Turn on **Simple mode**.
2. Under **Channels**, add channels with **Add a channel** and put them in order with the
   arrows. The order is the channel number. These are also the account's favorite
   channels, so changing them here changes the favorites too.
3. Choose the **Layout** and the **Text size**.
4. Choose the **Start channel**. The TV layout opens with the last channel watched, or
   with this one.
5. Optionally turn on **Open Live TV on start** and **Lock with a PIN** (see below).
6. Click **Save**. The change applies the next time Live TV is opened.

The setup screen shows who last changed it and when.

**On an Apple TV.** In the Apple TV app, go to **Settings > Live TV > Simple Mode on This
Apple TV**:

- **Follow My Account** (default): the Apple TV uses simple mode when the account has it
  turned on.
- **Always On**: simple mode on this Apple TV, whatever the account says.
- **Always Off**: the normal Live TV screen on this Apple TV.

The channel order on the Apple TV comes from the account's favorites, the same list as on
the web.

## Lock it with a PIN

**Lock with a PIN** sets a PIN of 4 to 8 digits. Write it down for the helper, not for the
viewer. While simple mode is on and locked, the viewer's own account needs the PIN to:

- change the simple mode setup or switch it off,
- add, remove or reorder favorite channels, on the web and in the apps (the channel list
  is the favorites, so it would otherwise change by accident),
- set an Apple TV to **Always Off**.

After 5 wrong PINs in 15 minutes, the PIN screen asks to wait.

**Forgot the PIN?** The admin opens **Admin > Users**, the person, **Live TV** and turns
**Lock with a PIN** off. The admin never needs the PIN. Switching the lock off removes the
PIN; set a new one to lock it again.

## Remote control

A locked simple mode setup also limits the [remote](/using/remote-control/). Commands
that leave simple mode, such as starting a film or joining a party, are refused. Tuning a
channel, pausing and sending a message still work.

## Open Live TV on start

With **Open Live TV on start**, opening Lumastra in a browser goes straight to Live TV
instead of the home page, and the Apple TV app opens on Live TV.

The rest of Lumastra is still there. The simple screen has a **Films and more** link at
the bottom, and `/?home` (for example `https://tv.example.org/?home`) always opens the
normal home page.

## Controls

### Web, with a keyboard or TV remote

| Key | What it does |
| --- | --- |
| Up / Down, Page Up / Page Down | Next or previous channel. The list wraps around. |
| Digits | Type a channel number. It shows large and tunes after 3 seconds, or right away with Enter. |
| Enter | Opens the channel list. |
| Escape or Backspace | Closes the channel list. Escape also cancels a number being typed. |

With a mouse or a touch screen, the player shows large **▲** and **▼** buttons and a
**Channels** button. Moving the mouse brings back the channel banner. In the channel list,
**Back to TV** closes it and **Channel overview** goes to the simple home screen.

### Apple TV, with the Siri Remote

| Button | What it does |
| --- | --- |
| Up / Down (press or swipe) | Next or previous channel. The list wraps around. |
| Select | Opens a grid of channel numbers, with the current channel highlighted. |
| Menu (Back) | Closes the number grid, then goes to the channel list. From the list it goes back to the picture. |
| Play/Pause | Pauses and resumes. |

Remotes with number keys can type a channel number, as on the web.

If a channel doesn't play, the screen offers **Try again** or **Next channel**.
