---
title: Audiobooks
description: Mirror an AudiobookShelf library into Lumastra, browse it as a first-class destination, and listen in the built-in player with chapters, sleep timer, and two-way progress sync.
sidebar:
  order: 3.65
---

Lumastra mirrors an AudiobookShelf library and syncs listening progress both ways.
It does not scan audiobook files itself: a folder of audiobooks on disk can't be a
Lumastra library, so you need an AudiobookShelf server. Audio is proxied through
Lumastra, so AudiobookShelf need not be reachable from listeners' browsers.

## Before you start

Three things must be in place. On a new install, the setup wizard does all
three: on the library step, open **Audiobooks from Audiobookshelf**, enter the
server URL and API key, select **Test & connect**, then pick the libraries to add.
The wizard tests the connection before it saves anything. Later, or to change
the server, use the steps below.

| Requirement                | Where                                   | Notes                                                              |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `AUDIOURL` + `AUDIOAPIKEY` | Environment / `settings.json`           | Your AudiobookShelf base URL and an **admin-or-up** API key.       |
| `FEATURE_AUDIOBOOKS`       | Environment                              | Defaults to **on**; the feature stays dormant until the two above are set. |
| A library path             | **Library → Sources & scanning**        | Create an empty library, then **Add folder** with **Source: AudiobookShelf** and pick the AudiobookShelf library. |

The API key needs admin rights because Lumastra mints **per-listener keys** from
it (see [Progress sync](#progress-sync) below). A read-only key can import the
library but cannot attribute playback to individual people.

:::caution[One media type per library group]
As with every other type, a library group holds a single media type. Give
audiobooks their own group rather than mixing them into a Music group.
:::

---

## How books reach Lumastra

The AudiobookShelf media source runs a **full reconcile sweep**, not an
incremental one. That follows from the upstream API: AudiobookShelf exposes no
`changed-since` parameter and no `updatedAt` sort, so the only way to learn
about additions, edits, replaced files and deletions is to page every library
and diff the id set against what Lumastra already holds.

Consequences:

- The sweep cost scales with library size, not with churn. A cadence of
  minutes is fine for a few hundred books; raise it for a few thousand. The
  interval is a plugin setting in **Settings → Plugins & features**.
- Deletions are guarded. A sweep that would remove an implausible share of the
  library in one pass is refused rather than run, so a temporarily
  half-responding AudiobookShelf cannot empty your shelves. The threshold is
  configurable.
- AudiobookShelf stays the **source of truth** for titles, authors, narrators,
  series, publisher and chapter marks. Edit metadata there, not in Lumastra.

---

## Turning a library off

Turn an AudiobookShelf folder off or on under **Library → Sources & scanning**.
Disabling it hides its books straight away, the same way deleting the folder does.
Watch progress, ratings and playlists are kept. Turn it back on and its books return
on the next sync. A book that now sits in another enabled AudiobookShelf library
stays available.

---

## Browsing

Browse at `/audiobooks`. Filters and sorting are stored in the URL, including library
group (`group`), language (`lang`), series (`series`), initial letter (`letter`), and
sort (`sort`). Series views default to reading order.

**Listening in your circle** shows activity within your sharing audience. On the
**For You** home feed, it appears only after ten minutes of audiobook listening in
the past month.

## The player

Seeking uses the current chapter's scrubber; the whole-book progress rail is not
draggable. A seek offers **Undo** for about ten seconds, during which the previous
position remains the one reported upstream.

Books split into numbered files without meaningful chapter names show **parts**
labelled by start time. Named chapters retain their titles.

Keyboard shortcuts: `Space` / `K` to pause, `←` / `J` and `→` / `L` to skip 30 seconds,
and `Esc` to minimise. On touch screens, swipe down to minimise.

## Progress sync

Progress moves in both directions between Lumastra and AudiobookShelf.

**Reading progress in** happens on a schedule for every active account.
Lumastra matches a Lumastra user to an AudiobookShelf account by **username**,
and the match must be unambiguous. If two accounts fold to the same name,
neither is used, to avoid attributing a stranger's listening to the wrong
person.

:::caution[Same-name matching is automatic]
A new Lumastra account whose username matches an existing AudiobookShelf
account will inherit that account's listening history on the next sync, with
no per-user confirmation step. This is sound when both systems draw from the
same directory, which is what this integration assumes. If you cannot
guarantee that, turn the inbound direction off.
:::

**Writing progress out** uses a per-listener API key, minted from the operator key
on the listener’s first playback.

Lumastra automatically creates an AudiobookShelf account for a listener without a
match, granting access to all libraries through an API key. Set
`AUDIOBOOK_AUTO_CREATE_USERS=false` to require existing accounts; an unmatched listener
then cannot play books.

Unlinking a listener revokes their key upstream *and* records the unlink, so
scheduled inbound syncs stop for them too. Starting a book in Lumastra again
re-links them.

---

## Sharing what you listen to

Audiobook activity is the one media type with a social layer, and it is
bounded by your **listening audience**. See
[Sharing & privacy](/guides/sharing-privacy/) for who that is and how to
change it.

Within that audience:

- Progress markers appear on other listeners' avatars along the book rail.
- Finished books show a marker for **7 calendar days**, then stop.
- The listening-sharing icon in a book's **…** menu hides that title from your
  audience while global audiobook sharing is enabled.
- A single switch in **Settings → Privacy** turns off audiobook sharing entirely.

The activity rail is **reciprocal**: you see other people's listening only while
sharing your own.

---

## Formats and playback

Lumastra plays the file directly when the browser can decode it, and remuxes
on the fly when it cannot. The container is rewritten; the audio is not
re-encoded. When a book needs a real transcode, AudiobookShelf performs it and
Lumastra proxies the result.

`AUDIOBOOK_REMUX_MAX_PER_USER` (default `2`) caps how many concurrent remuxes one
listener may hold on a single instance. Each remux is an ffmpeg process started
at a requested offset, and dragging the scrubber can ask for several in a second;
`0` disables the cap.

:::note[iOS]
Background playback works: locking the phone or switching apps keeps the book
running. Lumastra does not use a Web Audio graph on iOS, because capturing the
audio element into one breaks background playback there. The trade is a small
gap at each file boundary, roughly every few minutes on a split book.
:::

---

## Troubleshooting

| Symptom                                            | Likely cause                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| No audiobooks anywhere                             | `AUDIOURL`/`AUDIOAPIKEY` unset, or no library path uses the AudiobookShelf provider.                   |
| Books import but nobody's progress syncs           | The operator API key lacks admin rights, so per-listener keys cannot be minted.                        |
| One person's progress never syncs                  | Their Lumastra username matches two AudiobookShelf accounts, or none. Ambiguous matches are skipped on purpose. |
| Progress syncs one way only                        | The listener has been unlinked. Starting a book in Lumastra re-links them.                              |
| A book shows hundreds of "parts"                   | Expected: the book has no chapter marks upstream. Add them in AudiobookShelf and re-sync.              |
| Newly added books take a while to appear           | The sweep is a full reconcile; raise its cadence in **Settings → Plugins & features** for a large library. |
| Books are missing after a library was turned off   | Expected. Turn the library back on; its books return on the next sync. |
| Nothing in "Listening in your circle"              | Nobody in your audience has listened recently, or your listening audience is empty. See [Sharing & privacy](/guides/sharing-privacy/). |

## Next

- [Organizing your media](/guides/organizing-media/): the on-disk conventions
  for movies and TV, for comparison
- [Sharing & privacy](/guides/sharing-privacy/): the listening audience that
  bounds the activity rail
- [Optional integrations](/guides/integrations/): the other external services
  Lumastra can connect to
- [Administering Lumastra](/guides/administration/): general admin surfaces
