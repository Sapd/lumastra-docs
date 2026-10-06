---
title: Parental controls & age ratings
description: "Limit what a user can see and play with numeric age ratings: per user, per library, or via your identity provider."
sidebar:
  order: 6.5
---

Lumastra restricts content with **numeric age ratings**, for operators who share a
server with a household. There's no separate "kids account" to switch into. You give
a user an age ceiling, and everything rated above it disappears for them, everywhere
in the app.

## How age ratings work

Every title carries a **minimum age** (in years), derived from its provider
certification. A user can see a title only if their age limit is **greater than or
equal to** the title's minimum age.

| Certification                          | Minimum age |
| --------------------------------------- | ----------- |
| G · TV-Y · TV-G · U (BBFC)             | 0           |
| TV-Y7                                  | 7           |
| PG                                     | 8           |
| TV-PG                                  | 10          |
| PG-13                                  | 13          |
| TV-14                                  | 14          |
| R (US)                                 | 17          |
| NC-17 · TV-MA · R18                    | 18          |
| FSK 0 / 6 / 12 / 16 / 18 (Germany)     | the number  |
| 12 / 12A / 15 / 18 (UK)                | the number  |
| MA15+ / R18+ (Australia)               | 15 / 18     |

**Unrated titles** (no certification) are **hidden** from age-restricted users by
default. Set `UNRATED_CONTENT_VISIBLE=true` (or the toggle in admin Settings) to show
them instead.

:::tip[Where ratings come from]
Age ratings are populated from your metadata providers, most reliably from
**MDBList**. If you rely on age limits, configure MDBList (see
[Optional integrations](/guides/integrations/)) so titles are rated consistently.
:::

## Setting an age limit

There are three independent ways to limit a user. Use whichever fits your setup.

### 1. Per user (admin)

In **Admin → Users**, each user has an **Age Limit** field (0–21; blank = no limit).
Setting it here **pins** the value, overriding whatever the identity provider says.
Click the pin to release it and hand control back to your IdP groups.

### 2. Via your identity provider

Put a user in a group named `age-<N>` and they're limited to age `N`. For example, a
member of **`age-12`** sees only titles rated 12 and under. The prefix is
`AGE_RATING_GROUP_PREFIX` (default `age-`). If a user is in several such groups, the
**highest** wins (most permissive).

This is the cleanest option when you already manage users in
[Authentik or similar](/guides/authentication/): no per-user setup in Lumastra.

:::note[Admins are never restricted]
Administrators bypass age limits regardless of their groups.
:::

### 3. Per library

A **library group** can have a **Max age rating** (set in **Library → Sources & scanning**).
A library is hidden entirely from any user whose age limit is below it. Useful for
keeping an adult library out of a child's view completely.

The per-library ceiling and the per-title rating work at different levels: the
library ceiling hides a whole library from browse, while the per-title rating filters
individual titles inside the libraries a user *can* see.

## What a restricted user experiences

A restricted user gets the **normal interface** (there's no separate mode), but:

- Browse, search, and recommendations only ever show permitted titles.
- An over-limit title returns **"not found"** even via a direct link or a playback
  request (a deliberate 404, so the restriction doesn't reveal that the title
  exists).
- **AI recommendations and the chat assistant are hidden entirely** for restricted
  users, along with "similar titles" sections.

## Other group-based permissions

Age limits aren't the only access decision driven by IdP or in-app groups. Two related
settings are configured the same way (name a group, put users in it), but govern
different capabilities than content visibility:

- **`ARR_MANAGER_GROUPS`** (default `arrmanager,admin`): grants access to the
  media-acquisition backend (service URLs and the debug panel), the same way
  `ADMIN_GROUPS` does for full admin.
- **`MODERATOR_GROUPS`** (empty by default) lets members delete *other* users'
  community content: annotation pins, media-chat messages, and (once shipped) reviews.
  It does not grant metadata editing or admin access. Admins always have moderation
  privileges regardless of this setting.

Both are configured in env or **Admin → Settings**, alongside `ADMIN_GROUPS` and
`AGE_RATING_GROUP_PREFIX`.

## Configuration reference

| Setting                   | Where                                         | Default | Effect                                               |
| -------------------------- | ----------------------------------------------- | ------- | ------------------------------------------------------ |
| Per-user age limit        | Admin → Users                                 | —       | Pins an age ceiling for one user                     |
| Library max age rating    | Library → Sources & scanning (group settings) | —       | Hides a whole library below the given age            |
| `AGE_RATING_GROUP_PREFIX` | env / Admin → Settings                        | `age-`  | IdP group prefix; `age-12` limits a user to age ≤ 12 |
| `UNRATED_CONTENT_VISIBLE` | env / Admin → Settings                        | `false` | Show titles with no rating to restricted users       |
| `ARR_MANAGER_GROUPS`      | env / Admin → Settings                        | `arrmanager,admin` | Groups that can manage the media-acquisition backend |
| `MODERATOR_GROUPS`        | env / Admin → Settings                        | empty   | Groups that can delete other users' community content |

## Next

- [Sharing & privacy](/guides/sharing-privacy/)
- [Authentication](/guides/authentication/)
- [Administering Lumastra](/guides/administration/)
