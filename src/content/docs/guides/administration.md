---
title: Administering Lumastra
description: "Orientation to the /admin area: libraries, integrations, users, branding, and where task and webhook operations live."
sidebar:
  order: 6
---

The `/admin` area manages libraries, integrations, users, and instance settings.
Admins qualify through `ADMIN_GROUPS` membership or a database-level Admin toggle;
other users are redirected to `/`.

For tasks, run cancellation, and webhooks, see
[Administration: task and webhook operations](/guides/administration-operations/).
The [quick reference](#quick-reference-where-to-go-for-common-tasks) lists common routes.

## Libraries and paths

**Route:** `/admin/library/sources`

Use **New library** to set up a library, then open its name to manage folders,
metadata providers, and access. Each folder needs an on-disk directory, media type,
and metadata provider. **Scan all** scans all libraries; each library also has its
own **Scan** action. While scanning, its row shows progress and a **Stop** action.

The **Scan status** panel brings together the automatic scan schedule, file totals,
and files awaiting hashing or probing. Choose **Reorder libraries** to reveal drag
handles and up/down buttons. Order changes save automatically; choose **Done**
to leave reorder mode.

**Library Types**, under **Settings → Homepage & navigation**, configures names,
icons, and sidebar visibility for non-entertainment media.

Each path belongs to exactly one library group, which holds the name, icon, age-rating
ceiling, and metadata-provider chain for all its paths. For naming conventions and
multi-episode-file support, see [Organizing your media](/guides/organizing-media/).

:::note[One media type per group]
TV and movies must be in separate groups. Each group holds one media type, and a single
path supports only one provider (TMDB, MusicBrainz, AniDB, etc.).
:::

Per-group access can be restricted to specific identity-provider groups from the
library’s detail page; an empty allowed-groups list means all authenticated
users can see it.

---

## Media library console

**Route:** `/admin/library/media` (per-item detail at `/admin/library/media/[id]`)

Browse and edit library items here, including duplicate cleanup and episode ordering.
Use [Fix matches](#fix-matches-unmatched-items) for failed or incorrect identification.

:::caution[This console never edits your files on disk]
Delete, dismiss, merge, identify, metadata sync, and episode reordering all operate on
Lumastra's **database only**, never on the file. The only exceptions are the per-item
detail page's custom-artwork upload/extraction and background jobs that generate
trickplay sprites, thumbnails, chapters, or segments; none of these alter your original
media file.
:::

Deleting an item removes its Lumastra data (ratings, history, embeddings, and external
IDs). A later scan imports it again. Duplicate merging can join items sharing an
external ID, including a file-backed item and its discovery-only counterpart.

Per-item tools include:

- **Drag-and-drop reorder**: rewrites the stored episode numbers within a season.
  Irreversible with no undo. Reorder one season at a time.
- **Alternative orderings** (**Ordering** tab): fetches TMDB's alternative episode
  groupings (DVD order, absolute order, etc.) and links to them non-destructively; pick
  **Standard (default)** to revert at any time.
- **Auto-fixing episode titles** (**Health** tab → **Analyze episode titles**): repairs
  wrong/generic titles by reading embedded chapter names (fallback: filenames) and
  fuzzy-matching the provider's episode list. Confident matches (≥ 90%) apply
  automatically right after a TMDB series sync completes with an episode catalog, and
  again in a periodic 24-hour sweep across the library; lower-confidence candidates are
  queued for manual review from the same tab, which you can also trigger by hand at any
  time.
- **Split-cour anime auto-fix**: after every TMDB series sync, Lumastra looks for a TMDB
  alternative episode group that matches your on-disk season layout and, if found,
  re-binds mismatched episodes and merges away duplicate "ghost" episodes automatically.

:::note[Watch progress survives reordering]
Both reordering tools key on each episode's internal id, which never changes. Watch
progress, ratings, and series links stay attached to the right episode regardless of its
displayed number.
:::

### Fix matches (unmatched items)

**Route:** `/admin/library/fix-matches`

This identity workbench has two views, switchable by tab:

- **Never matched** (default): personal files the scanner found that never had any
  external id. **Auto-identify** is the primary action, triggering a background job
  that attempts to match all unmatched items automatically; you can also identify or
  dismiss items one at a time.
- **Broken match** (`?view=broken`): items that were matched once but whose provider
  lookup now fails permanently. **Accept** them (marks as expected / `skipped_permanent`)
  or fix the match; accepted items leave the queue and stop generating attention signals.

---

## Integrations and secrets

**Routes:** `/admin/settings`, `/admin/settings/providers`, `/admin/settings/secrets`

Environment-controlled settings are locked in the UI and read at process boot;
changing them requires a restart. Other configuration edits take effect after saving.

Configure the metadata provider chain and AI services under **Providers & metadata**.
For integration setup, see [Optional integrations](/guides/integrations/).
Plugin management is at `/admin/settings/plugins`; integration health is at
`/admin/system/health`.

`/admin/settings/secrets` surfaces the master-key rotation UI and a plugin secret-key
audit. Rotation creates a new key and re-encrypts all stored secrets. For the full
procedure and multi-replica pitfalls, see [Backup & key rotation](/guides/backup-recovery/).

### Access

**Route:** `/admin/settings/access`

**Access Groups** manages in-app groups, capabilities, and membership. Membership and
capability changes save immediately, separately from the configuration fields.

Below it, this page groups the identity-provider-group knobs that gate specific capabilities
rather than whole libraries, for example `ARR_MANAGER_GROUPS` (who can manage the
media-acquisition backend, default `arrmanager,admin`), `WATCH_PERMISSION_GROUPS` (who
can see everyone's streaming sessions, default `admin,stream-monitors`),
`MODERATOR_GROUPS` (empty by default), `PLAYLIST_PUBLIC_GROUPS` (who may publish a
playlist publicly, empty by default). Each is independent of library-level permissions
above and of `ADMIN_GROUPS`. `NAVIGATION_AVAILABLE_GROUPS` (empty by default) is under
**Settings → Homepage & navigation**, in the navigation section.

### Branding and appearance

The Branding section on the general Settings page controls the instance name, logo, and
theme accent color. Deeper theming, a custom theme editor plus raw **Custom CSS** and
**Custom JavaScript** injected into every page, has its own dedicated editor at
`/admin/settings/appearance`. Homepage widget layout and sidebar navigation are
configured on `/admin/settings/homepage`.

---

## Users and permissions

**Route:** `/admin/users` (see also **Announcements**, `/admin/notifications`, and
**Activity**, `/admin/users/activity`)

How accounts get created depends on your [authentication method](/guides/authentication/):

- **Built-in login**: you create and manage accounts here (username, password, admin
  status).
- **Forward auth**: users auto-provision on their first authenticated request from the
  identity provider's headers; you manage them in your IdP.
- **OIDC**: users auto-provision on first sign-in; admin follows the groups claim. You
  can view and unlink a user's federated identities here.

Use **Connections** to revoke device sessions, `/j` and Subsonic clients, or personal
access tokens individually. The user editor also sets age-rating ceilings, privacy,
and admin status.

:::caution[Removing groups is not the same as offboarding]
Taking someone out of every identity-provider group stops new admin/permission grants
from applying, but a session or token issued earlier can keep working until it expires.
To fully revoke a departing user's access, **disable their account**. See Offboarding
in [Authentication](/guides/authentication/#offboarding).
:::

The Admin toggle pins a user independently of their identity-provider groups.

---

## Troubleshooting entry points

**Route:** `/admin/fix`. Symptom-first routing: pick what you're seeing (no poster,
missing episodes, a wrong match, slow performance, subtitle issues, stale clients, or
something stuck), and it links you to the page that fixes it.

**Route:** `/admin/system/diagnostics` (**Debug report**). A redacted report of the
instance (version, health, cluster, tasks, library, client errors, settings) to copy or
download for an AI assistant, an issue or a forum post. See
[Debugging with an AI assistant](/guides/debugging-with-ai/).

---

## AI & recommendation diagnostics

Developer-only pages, hidden from the nav until "Show developer tools" is turned on in
Settings → General:

| Page | Route |
| ---- | ----- |
| **Embedding Statistics** | `/admin/developer/embeddings` |
| **VOD Embedding Diagnostics** | `/admin/developer/vod-embeddings` |
| **Sonic Embedding Diagnostics** | `/admin/developer/sonic-embeddings` |

The music quick-picks recommender (bucket distribution, taste-cluster inspector) is the
**Quick Picks** tab on **Settings → Music**, visible in the regular nav.

---

## Sessions and transcoding

**Route:** `/admin/users/sessions`

Inspect active playback across users, including delivery method, bandwidth per stream,
total stream bandwidth, and transcoding jobs. With Jellyfin sync enabled, direct Jellyfin
sessions also appear. CPU, memory and GPU load are not shown here: **System load →**
opens **System health → Cluster**, which shows them per machine (see
[Watching GPU load](/guides/gpu-transcoding/#watching-gpu-load)).

Select a session to send a message to it. On a Lumastra app the message shows on the
device. In other players it shows as a notice. You can also stop a session from here.

When a viewer reports buffering, **Playback quality** (`/admin/users/playback-quality`)
and **Playback incidents** (`/admin/users/playback-incidents`) hold the delivery evidence.
See [Test your connection](/using/player/#test-your-connection).

---

## Live TV and Radio

**Route:** `/admin/settings/livetv`. Sources, Channels, Proxy, and Failures are tabs on
this one page, not separate routes.

Live TV is gated by `FEATURE_LIVETV` (off by default) and needs the stream proxy
(`STREAM_PROXY_URL` + `STREAM_PROXY_SECRET`). Add M3U/Xtream/HDHomeRun sources from the
**Sources** tab. For setup, see [Setting up Live TV](/guides/live-tv/). For how it
works, see [Live TV architecture](/architecture/live-tv/).

End-user access is restricted to the groups in `LIVETV_GROUPS`; groups in
`LIVETV_HIGH_PRIORITY_GROUPS` may preempt streams under contention.

:::caution[No DVR]
Live TV has strong channel management, but there is no recording / DVR today.
:::

Radio stations moved off the Live TV pages onto **Settings → Music → Radio**: internet
radio is treated as a music feature, not a Live TV one.

---

## API tokens

**Route:** `/admin/users/api-tokens`. Manage long-lived API tokens for programmatic
access. Tokens can be scoped and are shown once at creation; existing tokens show their
last-used timestamp and scopes but not the secret value.

---

## Public showcase (enterprise)

**Route:** `/admin/showcase` (Enterprise tier)

Exposes a curated slice of your library as a public, unauthenticated browsing surface,
for example a lobby display or a portfolio page, gated by `FEATURE_PUBLIC_SHOWCASE` (off
by default). Key knobs: `SHOWCASE_PUBLIC_LIBRARY_GROUP_ID` (which library group is
exposed), `SHOWCASE_REQUIRE_TOKEN` (require a share token rather than fully open access),
`SHOWCASE_KIOSK_MODE` (a chromeless, self-cycling display), `SHOWCASE_MAX_CONCURRENT_TRANSCODES`
(caps transcode load from anonymous viewers), and `SHOWCASE_ALLOW_EMBED` with
`SHOWCASE_EMBED_ALLOWED_ORIGINS` (allow the showcase to be framed on a named list of
origins). This is part of the Learning Management / compliance / showcase enterprise
tier. See [Editions & Licensing](/guides/licensing/).

---

## Licensing

**Route:** `/admin/system/instance`. Licensing lives on the Instance page alongside this
installation's profile info, not on a route of its own.

View license status and configure a commercial key here. See
[Editions & Licensing](/guides/licensing/) for component and tier terms.

## Recovering a locked-out install

If every admin account has been deleted or demoted and nobody can reach `/admin` to
promote one, set `SETUP_UNLOCK=1` on the server process and restart. This re-opens the
first-run setup flow so a new admin can be created. It's an environment-only switch
(never a settings-page toggle), because reopening setup needs control of the host
running the process, not just of the app. Remove `SETUP_UNLOCK` and restart again once
you've created the new admin.

---

## Quick-reference: where to go for common tasks

| Task                                     | Route                             |
| ----------------------------------------- | ---------------------------------- |
| Add a library folder                      | `/admin/library/sources` → open a library → Add folder |
| Fix unmatched files                       | `/admin/library/fix-matches` → Never matched view |
| Find / edit a title                       | `/admin/library/media`            |
| Reorder a series' episodes                | `/admin/library/media/[id]` → Reorder / Ordering tab |
| Configure an API key / integration        | `/admin/settings` or `/admin/settings/providers` |
| Rotate the master key                     | `/admin/settings/secrets`         |
| Revoke a user's devices / tokens          | `/admin/users` → Connections      |
| Monitor background tasks, webhooks, cost  | `/admin/tasks`: see [operations](/guides/administration-operations/) |
| View active play sessions                 | `/admin/users/sessions`           |
| Manage Live TV channels                   | `/admin/settings/livetv` → Channels tab |
| Manage internet-radio stations            | `/admin/settings/music` → Radio tab |
| Recover a locked-out install              | Set `SETUP_UNLOCK=1` and restart  |
| Enter a commercial license key            | `/admin/system/instance`          |

## Next

- [Administration: task and webhook operations](/guides/administration-operations/)
- [Authentication](/guides/authentication/)
- [Backup & key rotation](/guides/backup-recovery/)
- [Editions & Licensing](/guides/licensing/)
