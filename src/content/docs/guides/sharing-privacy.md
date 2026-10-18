---
title: Sharing & privacy
description: Control what users on your server can see about each other, activity, live sessions, and reviews.
sidebar:
  order: 6.6
---

These settings control visibility of activity, reviews, and live sessions.
[Parental controls](/guides/parental-controls/) govern media access separately.
User opt-outs and per-item hides further restrict sharing.

## Where the settings live

Find **Sharing & Privacy** under **Settings → Access**.

| Setting                     | Default             | What it does                                                       |
| --------------------------- | ------------------- | ------------------------------------------------------------------ |
| Social Features             | On                  | Master switch for the Community tab (who watched / rated a title). |
| Community Reviews           | On                  | Written reviews in the Community tab.                              |
| Review Groups               | Empty = everyone    | Restricts who may *write* reviews.                                 |
| Activity Audience Mode      | Automatic           | Who can see each other's activity. See below.                      |
| Activity Audience Groups    | Empty               | The specific groups, when the mode is "Selected groups".           |

Two sharing controls live elsewhere: **Public Sessions** and **Public Device Info** are
under **Playback → Playback & Media Mode**, because they depend on the Streaming Sessions
widget toggle. See [Live sessions](#live-sessions) below.

### Checking who it actually reaches

**Who this currently reaches** reports audience, sharing, and hidden-user counts,
without names, and warns if the configured audience is empty.

## Activity audience

Two things are visible only between people in the same audience:

- **Audiobook activity**: progress, finished books, and the shared-listening indicator.
- **Who watched or rated a title**: the Community tab on movies and series.

The **Activity Audience Mode** decides who that is.
For what that looks like while listening, see [Audiobooks](/guides/audiobooks/#sharing-what-you-listen-to).

| Mode                | Who can see each other                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| **Automatic** (default) | Household if you have named no groups; Selected groups as soon as you name one. |
| **Household**       | Everyone on this server.                                                |
| **Selected groups** | Only users who share a group named in *Activity Audience Groups*.       |

### Drawing a narrower audience

Name one or more groups in **Activity Audience Groups**. Two users then see each other
only if they share a group named there.

1. **Settings → Access Groups**: create a group, e.g. `bookclub`.
2. Same page: add the members.
3. **Settings → Sharing & Privacy → Activity Audience Groups**: select `bookclub`.

Separate groups stay separate. Naming `family, bookclub` creates **two** audiences that
cannot see each other, even if everyone also carries a broad group from your identity
provider.

:::caution
Don't reuse your admin group as a sharing audience. It works, but promoting someone to
admin would then silently add them to a sharing audience, and demoting them would remove
them: a privacy change as a side effect of a permissions change. Make a separate group
with the same people.
:::



### Groups come from both sources

The group names you can select are the union of your in-app **Access Groups** and any
groups your identity provider sends. Both work, and you don't need an identity provider at
all: in-app groups are enough.

:::note
Group membership from an identity provider refreshes on ordinary requests, not only at
login. Lumastra re-checks the groups header the proxy sends and, when it has changed,
writes the new list within moments (throttled to at most once every 5 minutes while it
stays unchanged). Removing someone from a group in your IdP takes effect on their next
request through the proxy, not their next login, but only if the proxy sends an updated
header. A long-lived token used against a surface that bypasses the proxy, or a client
that never makes an ordinary request, won't see the change until it does.
In-app Access Groups apply immediately regardless. Prefer them when you need removal to
be prompt and guaranteed.
:::

## Live sessions

Whether users see each other's **active streams** is separate from the activity audience
and is not group-scoped. It's on or off for the whole server.

| Setting             | Where                              | Effect                                                      |
| -------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Now Streaming Widget | Playback → Playback & Media Mode   | Whether the widget exists at all.                           |
| Public Sessions      | Playback → Playback & Media Mode   | Lets non-admins see other people's sessions.                |
| Public Device Info   | Playback → Playback & Media Mode   | Also shows client and browser names. Off by default.        |

Regardless of these:

- A user always sees and can stop **their own** sessions.
- Admins always see all sessions, because they need it to manage streams. Sessions from
  users who opted out are marked as private in the admin view.
- A user who sets **Hide my streams** disappears from the widget for everyone else.

:::note
A per-book hide does **not** remove the corresponding live session. If someone hides a
book and then plays it, the title still appears on their live session card to anyone who
can see sessions. Users who want a session hidden should use *Hide my streams*, which is
absolute.
:::

<span id="first-run-tells-the-operator"></span>

## Setup defaults

Users start with sharing **off**: new accounts hide their streams and share no listening or
audiobook activity until they opt in under **Settings → Privacy**. The upgrade that
introduced this default switched existing accounts that never saved a privacy choice to the
same private state; accounts with a saved choice were not touched. Activity Audience Mode
(above) is the operator-side audience; a user's switches decide whether they take part in it.

Setup enables **Share activity between users** by default. Turning it off selects
**Selected groups** with no groups, disabling activity sharing until a group is named.

## What users control themselves

Each user has **Settings → Privacy** with three switches, described in
[For viewers](/using/for-viewers/#privacy). Your settings set the outer bound; theirs
decide whether they share at all. A user who turns everything off is invisible no matter
how you configure this page.

Audiobook sharing is **reciprocal**: someone sees other people's audiobook activity only
while sharing their own, on both the detailed and the coarse feed.

## Turning it all off

Set **Social Features** to off. The Community tab disappears and the activity audience
stops applying. Live-session visibility is independent: turn off **Public Sessions**
separately.

## Configuration reference

| Variable                              | Default | Notes                                                                 |
| -------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `FEATURE_SOCIAL`                      | `true`  | Master switch for social surfaces.                                    |
| `FEATURE_SOCIAL_REVIEWS`              | `true`  | Written reviews. Requires `FEATURE_SOCIAL`.                           |
| `SOCIAL_REVIEW_GROUPS`                | empty   | Who may write reviews. **Empty = everyone.**                          |
| `SOCIAL_DEFAULT_AUDIENCE`             | `auto`  | `auto` · `household` · `groups`.                                      |
| `SOCIAL_TRUST_GROUPS`                 | empty   | Groups for `groups` mode: governs audiobook activity **and** the Community tab. **Empty = nobody**, not everyone. |
| `FEATURE_SESSIONS`                    | `true`  | The Streaming Sessions widget.                                             |
| `FEATURE_SESSIONS_PUBLIC`             | `true`  | Non-admins can see others' sessions.                                  |
| `FEATURE_SESSIONS_DEVICE_INFO_PUBLIC` | `false` | Also expose client/browser names.                                     |

:::caution
`SOCIAL_TRUST_GROUPS` is the one group setting where **empty means off, not everyone**,
the opposite of `SOCIAL_REVIEW_GROUPS`.
:::

## Next

- [Parental controls & age ratings](/guides/parental-controls/)
- [For viewers](/using/for-viewers/#privacy)
- [Audiobooks](/guides/audiobooks/)
- [Administering Lumastra](/guides/administration/)
