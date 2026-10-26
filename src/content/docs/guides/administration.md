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

### Find a title or a problem

The media browser starts with **title search**. Choose broader search explicitly to
include other metadata. **All**, **Needs attention**, and **Recently added** are the
primary views; choose an issue category within Needs attention to narrow the list.
Use **Table settings** for columns and page size. Music, video, and audiobook views
show information appropriate to their media type. Fresh table settings give titles
more room and leave the TMDB ID column off; enable it in Table settings when needed.
Existing saved column choices stay in place. Dense layouts scroll inside the table.

Selections can span pages. The selection bar distinguishes items on the current
page from items selected elsewhere; selecting the table header selects that page,
not every matching item. Returning from a detail page restores the browser context.

### Inspect a title

Video details have these sections:

| Section | Use it for |
| --- | --- |
| **Overview** | Availability, outstanding issues, metadata, and the title's files or versions |
| **Episodes** | Regular seasons, specials, ordering, and episode issues for a series |
| **Files** | Physical files, episode links, streams, chapters, and preview information |
| **Artwork** | Provider or inherited images and custom overrides |
| **Maintenance** | Metadata refresh, media processing, and processing history |

The series availability summary distinguishes aired regular episodes with files
from provider-listed episodes. Specials are counted separately. Catalog totals may
also include future episodes or entries without files. An unresolved identity or
ordering conflict can make the missing count uncertain; resolve that conflict before
treating the count as a list of files to find.

Episode rows and episode details show audio and subtitle languages for the default
file, including embedded and sidecar subtitles. Rows keep this to two compact
lines; the **+N more** tooltip shows additional languages. Expand track details
for individual track flags.
Compare alternate file versions under **Files**: languages can differ between releases. Default and forced track
markers describe the stored track flags; an unidentified language or a file that
has not been inspected is shown explicitly rather than treated as having no tracks.

A physical file can serve several episodes. **Files** groups those links beneath the
file, showing each episode's boundaries. **File time** starts at the beginning of the
physical file; **episode time** starts at the beginning of the selected episode.
The file's size and full duration describe the whole file, not each episode's share.
The linked-media total counts every association for that physical file across the
library, including links outside the current detail page.
Use **Episodes in file** to inspect or correct the links and their playback order.

The editor names the target series and supports searching by episode title or code,
plus filtering by season. Its selected list defines playback order: it can cross
seasons, skip numbers, or run in descending episode-number order. Review the actual
content before changing that list.

Boundary labels describe the evidence. Runtime and even splits are estimates; they
do not prove where a story ends. Saved chapter records and manually reviewed cuts
have different provenance. A file may contain embedded chapters that have not yet
been imported into the library. Use the chapter refresh and inspect its run/result,
then reload the saved chapters before applying them. Refreshing records does not
replace an unsaved mapping draft. Review start/end previews and the saved/reloaded
result after confirming a mapping.
Chapter cuts retain millisecond precision in editable times. Missing draft cuts
remain blank and prevent saving until you supply valid boundaries.

Saving or resetting a manual mapping checks that the file, current links, and target
episodes still match the review you opened. If another edit or scan changed them,
the operation stops for a fresh review. Check the updated evidence before saving
again; do not retry an old selection blindly. Episodes that were removed or moved
out of the selected series stay visible in your draft but must be removed or
replaced before saving. A successful manual repair records
the administrator and removes only the mapping warning it actually resolves.
Other source-file warnings remain.
If selected episodes are dismissed, explicitly confirm each one you intend to
restore before saving. Reloading changed evidence clears that confirmation; review
the current selection again. The repair audits which episodes were restored.

With chapter scanning enabled, new episode files also invalidate the series'
chapter-processing result. Library scans revisit files whose chapter inspection is
missing or outdated. An inspection that successfully finds no embedded chapters
is remembered, so it does not cause repeated work, and replaces any obsolete
chapter records. Chapter refresh preserves manually reviewed episode windows.

A descending or otherwise ambiguous filename range requires review of the file's
actual contents. It is not proof that other files already cover its episodes.

For movies with multiple versions, compare the version's available source, quality,
size, and default status. Expand technical details to see the full filename and path.

### Episode organization

- **Reorder** rewrites stored episode numbers within one season. It is irreversible
  and has no undo; review the selected season before saving.
- **Ordering**, within **Episodes**, chooses TMDB alternative episode groupings
  (DVD order, absolute order, etc.). Choose **Standard (default)** to revert.
  Changing the display ordering does not move or rename files, or correct a file
  linked to the wrong episode; inspect that mapping under **Files**.
- **Issues**, within **Episodes**, shows availability and linking discrepancies.
  Episode-title analysis compares embedded chapter names (fallback: filenames) with
  provider episode names. Confident matches (at least 90%) apply automatically after
  a TMDB series sync with an episode catalog and during the periodic 24-hour sweep;
  lower-confidence candidates need review.
- **Split-cour anime auto-fix** looks for a TMDB alternative episode group matching
  the season layout after a series sync, and can re-bind mismatched episodes and
  merge duplicate catalog episodes.

### Metadata and processing

Use **Maintenance → Metadata** for provider refreshes and **Maintenance → Media
processing** for analysis jobs. **History** keeps the earlier runs. Check the stated
scope before starting a series-wide action: including descendants affects seasons
and episodes as well as the series. A forced metadata refresh can overwrite manual
edits and unlock the item. Processing history shows completed, pending, and failed
steps; an expired run record means its detailed logs are no longer retained.

For an episode, provider refreshes are managed through its parent series. The episode
page links to that series rather than queuing an unsupported child refresh.
**Review two-episode TMDB ID exchange** previews two active episodes from the same
series. Confirm only after checking their actual content identities. The operation
exchanges both IDs together; files, metadata, artwork, locks and watch data remain
attached to their existing episode IDs. Changed evidence requires a fresh preview.

Segment analysis waits for an eligible local video file with a usable duration.
If the default version is unavailable but an alternate qualifies, the page names
the version analysis will use. A completed pass that finds no segments is different
from work that was skipped or ran against an earlier file. Replacing a file or
changing an episode's playback window, detector settings, or analysis version requires
fresh evidence for that input; older failures stay available as history.

Open file, processing, and Health views refresh when you return to the page and
periodically while visible. The last refresh time describes the displayed data;
if a refresh fails, retained rows are marked stale. Health lists physical files,
including files without a title link. For an episode mapping warning on an unlinked
file, use **Review episode mapping**, select the intended series, and review the
episode list before saving through the same guarded editor.

Audio-tail measurements describe observed packets and decoded channels, not proof
that a file is complete. Streams that demonstrably end before the post-video
interval count toward the measured stream total. Contradictory endpoints, missing
packet evidence, decoding errors or measurement limits keep the result inconclusive.
Expand **Measurement details** for the recorded evidence. Existing warnings remain.

In **Library → Quarantine**, **Review current matches** compares a bounded page of
historical proposals with current metadata. Select only the exact matches you
reviewed, then confirm closing those warnings. This acknowledgement does not verify
physical file identity, change title binding or remap media. Ineligible proposals
show why they remain; changed evidence requires another review.

Delete remains available under the title's **More** actions and requires confirmation.

:::note[Watch progress survives reordering]
Both reordering tools key on each episode's internal id, which never changes. Watch
progress, ratings, and series links stay attached to the right episode regardless of its
displayed number.
:::

### Music: artists, albums, and tracks

An artist's **Discography** leads to its albums. Its **Tracks** tab includes credited
tracks on albums owned by another artist. Use an album's **Tracks** to find
and inspect a track, open its metadata editor, or jump to lyrics, audio analysis,
and files. Search covers the whole collection; use the page controls to browse long
track lists. The album list keeps its search and ordering when you return from a track.
The default album order follows stored disc and track numbers; missing numbers do
not imply that the tracks are missing. Sorting the list changes the view, not the
stored playback order.

A personal collection stored as an album can be managed without linking an external
metadata provider. Use **Edit metadata** for its title, year, description, or artist
assignment. Manual changes retain the existing metadata-lock protection; provider
refreshes can overwrite edits and unlock the item, so check their scope first.

Track details retain **Lyrics**, **Audio Features**, and **Chapters**. Lyrics support
plain and timed text; chapters can describe a continuous mix or be pasted from a
tracklist. Audio analysis shows danceability on Essentia's 0–3 scale. It is a score,
not a percentage. An artist or album's files belong to its descendant tracks; a
parent with no direct file is not necessarily missing audio.

#### Review artist credits

A track's performing artists, remixers, album, and album artist are separate
relationships. Use **Artist credits** to select canonical artists deliberately,
review their credited names and roles, and arrange the performing order. The
before/after review shows the exact proposed credits and the album ownership that
will remain. A new artist must represent a deliberately identified act; an artist
name containing punctuation is not evidence that it should be split.

Saving credits protects the track's metadata and records the administrator who
confirmed the change. A stale title, credit, parent, artist identity, or protection
snapshot requires a fresh review. A saved result whose reload fails is shown as
unverified until it can be read again. File tags, physical files, watch state,
provider identities, and the title's version/remix wording are retained.

An artist's track list helps find credited tracks even when another artist owns
the album. Return links retain the reviewed list's search, filters, order, and page.
For a compilation, change album ownership separately from the album's metadata
editor after reviewing the whole release. The single-act declaration is for a real
band, duo, or artist identity; it does not repair a genuine collaboration's credits.

In the **Possibly a combined artist (heuristic)** review queue, use **Mark as a single act** for a
confirmed band, duo, or artist identity. Its entry leaves the queue and the count
refreshes. The confirmation keeps an **Undo** action: this removes the single-act
flag and returns the artist to review. It does not undo a merge or a split. Failed
writes keep a retry action visible; if only the list refresh fails, retry the
refresh separately. Names containing conjunctions are review hints, not evidence
of multiple artists. Genuine collaboration repair remains a separate review.


#### Resolve a collaboration

Use **Resolve collaboration** in the combined-artist review queue. Choose the
ordered artist identities explicitly, inspect the source evidence and proposed
track credits, then select the eligible tracks to repair. Protected or uncertain
tracks stay visible for manual review. Album ownership is shown separately and
stays unchanged.

After every track is resolved, acknowledge the retained album owners and mark the
collaboration reviewed to remove it from the queue. This differs from marking a
single act: it does not set `no_split`. **Return to review queue** restores the
review classification without undoing saved credits. Changes to relevant source
evidence reopen review automatically.

#### Review an album merge

The merge preview identifies the kept album and the album that will be removed,
including their IDs, artist ownership, tracks, images, metadata, and user-data
policies. Duplicate candidates remain distinct tracks with their files. Review
those versions after merging; a similar title does not prove identical content.

Confirm only the displayed plan. Changing the survivor or protection override
requires another preview. Archived source metadata is reference information;
there is no ordinary Undo or automatic restoration of the removed album's original
ID and relationships. Recovery of the original catalog may require a backup.

#### Provider-free local media

Only attach a provider result that describes the actual content. A technical clip,
personal recording, or uncertain cut can remain unmatched while its local metadata
is reviewed. Closing identification preserves that state; it does not declare the
warning resolved or turn the file into a provider movie. Incomplete episode or
season identities are displayed with their media type instead of an invented movie
link.

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
| Reorder a series' episodes                | `/admin/library/media/[id]` → Episodes → Reorder / Ordering |
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
