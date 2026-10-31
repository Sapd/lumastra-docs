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

A rated title has a **minimum age** in years. A user with an age limit can see it
only if their limit is **greater than or equal to** that minimum age.

Seasons and episodes always use their **series' rating**.

Users with an age limit or a library-group limit don't see posters for **discovery
titles** (suggestions that are not in your library). Lumastra can't check the rating
of a title it doesn't have, so it doesn't show its artwork to them.

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

**Unrated** means the title has no usable numeric age rating. Missing certifications,
explicit “unrated” labels, or unreadable certifications can leave a title unrated.
Unrated titles are **hidden** from users with an age limit by default.

In **Admin → Settings → Access**, enable **Show Unrated Content to Age-Restricted
Users** (`UNRATED_CONTENT_VISIBLE=true`) to let those users see unrated titles.
Library-group access limits still apply. A library-group limit alone does not hide
unrated titles; this setting applies when the user has an age limit.

### Where ratings come from

**TMDB** supplies the national certification for the admin's **Age Rating Country**.
Find this setting in **Admin → Settings → Metadata → API keys & languages → Metadata
sources**, beside **TMDB Metadata Language**. Its default is **Automatic (from
metadata language)**. For example, `de-DE` selects Germany and `en-GB` selects the
United Kingdom. The fallback is the United States.

Lumastra uses the strictest readable TMDB certification for that country, across all
release types. If the country has no certification, or only explicit unrated labels,
it tries the US certification. If a national certification is present but cannot be
read, it does not borrow the US rating. Without another usable rating, the title
stays unrated.

A national certification replaces an **MDBList** age rating. MDBList fills ratings
where no national rating exists and cannot overwrite a national rating.

**Jellyfin OfficialRating** and movie NFO **`<mpaa>` / `<certification>`** tags can
also supply national certifications. NFO scans and Jellyfin file adoption keep an
existing national rating. They can replace an MDBList rating.

### Changing the rating country

Changing **Age Rating Country** makes existing titles eligible for another rating
check. The **Backfill Age Ratings** task runs at startup and hourly. It checks titles
in small batches, so a large library can take a while. TMDB lookups need a configured
TMDB API key.

Find the task under **Admin → Tasks → Overview** and its runs under **Tasks → Runs**.
As ratings change, users with age limits may see titles appear or disappear.

## Setting an age limit

There are three independent ways to limit a user. Use whichever fits your setup.

### 1. Per user (admin)

In **Admin → Users**, open a user and select **Access & sign-in**. The **Age limit**
field accepts 0–21; blank means no limit.
Setting it here **pins** the value, overriding whatever the identity provider says.
Select **Use identity provider groups** to release it and use your IdP groups again.

Beside the age limit, a message shows how many active library movies and series are
unrated, out of the total. It appears when at least one title is unrated. The count
covers the whole library, not just titles that user can access. The message also
says whether users with age limits can see unrated titles under the current setting.

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
A library disappears from the library list for users whose age limit is below that
value.

For **audiobooks**, this value also sets a minimum age for every book in that
library. A higher rating on the book still wins. A book with no rating uses the
library's value, so it does not count as unrated for access checks. **Movies and
series** use their own ratings; the library value does not replace them.

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
| `AGE_RATING_COUNTRY`      | env / Admin → Settings → Metadata             | `auto`  | Selects the national rating system; automatic follows metadata language, with US fallback |
| Library max age rating    | Library → Sources & scanning (group settings) | —       | Hides the library from the list below this age; also sets an audiobook age floor |
| `AGE_RATING_GROUP_PREFIX` | env / Admin → Settings                        | `age-`  | IdP group prefix; `age-12` limits a user to age ≤ 12 |
| `UNRATED_CONTENT_VISIBLE` | env / Admin → Settings → Access               | `false` | Lets users with an age limit see unrated titles; library access still applies |
| `ARR_MANAGER_GROUPS`      | env / Admin → Settings                        | `arrmanager,admin` | Groups that can manage the media-acquisition backend |
| `MODERATOR_GROUPS`        | env / Admin → Settings                        | empty   | Groups that can delete other users' community content |

## Next

- [Sharing & privacy](/guides/sharing-privacy/)
- [Authentication](/guides/authentication/)
- [Administering Lumastra](/guides/administration/)
