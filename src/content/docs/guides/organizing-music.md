---
title: Organizing your music
description: How to name, tag, and arrange music files so Lumastra recognizes artists, albums, and tracks correctly.
sidebar:
  order: 3.5
---

Lumastra's music scanner builds an **artist → album → track** hierarchy from
your audio files, deriving each level from tags first and folder names second.
Use the fallback rules below to diagnose missing or inconsistent metadata.

Tags win over folder names, but a well-organized folder tree is the best
safety net when tags are missing or inconsistent.

:::note[Examples use public-domain composers]
All examples below use classical music whose authors are in the public domain
(Beethoven, Bach, Mozart, Chopin, Vivaldi) purely to illustrate naming
conventions.
:::

---

## Supported audio formats

| Extension | Container / codec |
| --------- | ------------------ |
| `.flac`   | FLAC                |
| `.mp3`    | MP3 (ID3 tags)      |
| `.m4a`    | MP4 / AAC or ALAC   |
| `.opus`   | Opus                 |
| `.ogg`    | Ogg Vorbis           |
| `.wav`    | PCM / RIFF           |
| `.wma`    | Windows Media        |
| `.aac`    | Raw AAC              |
| `.alac`   | Apple Lossless        |

---

## Tags win over the path

The scanner always prefers embedded tags over folder-name heuristics. The
**artist derivation** chain runs in this exact order:

| Priority | Source | Notes |
| -------- | ------ | ----- |
| 1 | `ALBUMARTIST` tag | Canonical album-level artist. Always preferred: it keeps compilations together even when individual `ARTIST` tags vary per track. |
| 2 | Folder parent of the album directory | The folder one level above the album dir (the `Artist/` folder in a standard tree). Trusted over per-track tags because per-track artists on a compilation would fragment it into one hierarchy per track. |
| 3 | `ARTIST` tag (per-track) | Used only when there is no folder context (file sits at the library root with no `/Artist/` subfolder). |
| 4 | `{Artist} - {Title}` filename split | Applied only when the folder parent gives no usable signal (e.g. a flat playlist folder). A bare 4-digit year on the left side (e.g. `1999 - Title.mp3`) is rejected so years are not promoted to artist names. |
| 5 | `Unknown Artist` | Last resort. |

:::tip[Always set ALBUMARTIST on compilations]
On compilation albums where each track has a different `ARTIST` value, the
`ALBUMARTIST` tag is the only thing that keeps all tracks under one album
hierarchy. Without it, the scanner falls back to the folder parent, which only
works when your layout follows the `Artist/Album/Track` convention (see below).
:::

**Album name** fallback chain:

1. `ALBUM` tag (leading/trailing whitespace trimmed; trailing scene-release
   tokens such as `-WEB`, `-FLAC`, `-REMASTERED` stripped automatically)
2. `VA - Album` folder pattern (when no artist tags are present; see
   [Compilations](#compilations--various-artists) below)
3. Name of the album directory
4. `Unknown Album`

**Album year** fallback chain:

1. `YEAR` / `DATE` tag
2. `(YYYY)` in the album folder name (see [Album year](#album-year) below)

**Track title** fallback: the `TITLE` tag, then the filename stem with any
leading track-number prefix stripped.

---

## Where well-tagged music comes from

Prefer files with consistent `ALBUMARTIST`, `ALBUM`, `TITLE`, and embedded artwork.
FLAC is a reliable choice for lossless audio with metadata. Store-supplied tempo and
key tags are not imported; Lumastra derives those with [Essentia](#audio-analysis-essentia).

## Recommended folder structure

```
/music/
  Ludwig van Beethoven/
    Symphony No. 9 (1824)/
      01 - I. Allegro ma non troppo.flac
      02 - II. Molto vivace.flac
      03 - III. Adagio molto e cantabile.flac
      04 - IV. Presto.flac
    Piano Sonata No. 14 (1801)/
      01 - I. Adagio sostenuto.flac
      02 - II. Allegretto.flac
      03 - III. Presto agitato.flac

  Johann Sebastian Bach/
    The Well-Tempered Clavier Book I (1722)/
      01 - Prelude and Fugue No. 1 in C major.flac
      02 - Prelude and Fugue No. 2 in C minor.flac
```

The scanner derives the **artist** from the folder one level above the album
directory (`Ludwig van Beethoven`, `Johann Sebastian Bach`). Tags take
precedence when present, so the folder name is the fallback, not the primary
source.

---

## Multi-disc albums

Disc subfolders inside an album directory are recognized automatically. The
folder name is matched case-insensitively against:

```
CD1  CD2  CD3  …
Disc 1  Disc 2  Disc 3  …
Disk 1  Disk 2  …
Vol 1  Vol 2  Vol 3  …
Volume 1  Volume 2  …
Part 1  Part 2  …
```

The disc subfolder collapses up to the album directory for hierarchy purposes:

```
Johann Sebastian Bach/
  The Well-Tempered Clavier (1722)/
    CD1/
      01 - Prelude and Fugue No. 1.flac
      …
    CD2/
      01 - Prelude and Fugue No. 13.flac
      …
```

The `CD1` / `CD2` folders are treated as disc markers, not as album names. All
tracks end up under a single album row. The disc number is read from the `DISC`
tag when present; the folder name (`CD1` → disc 1) is the fallback.



## Album year

Append a four-digit year in parentheses anywhere in the album folder name to let
the scanner pick it up when the `YEAR` tag is absent:

```
Symphony No. 9 (1824)/
Piano Sonata No. 14 (1801)/
The Four Seasons (1725)/
```

Any `(YYYY)` between 1900 and one year in the future is accepted. Multiple year
tokens in the same folder name: the first match wins.

---

## Compilations / Various Artists

### Folder naming convention

When audio files have no artist tags at all, the scanner recognizes a folder
named `VA - Album Title` or `Various Artists - Album Title` (and the variants
`Various - …`, `V.A. - …`) and sets the artist to the canonical label
`Various Artists`:

```
/music/
  Various Artists - Piano Music of the Romantic Era/
    01 - Frédéric Chopin - Nocturne Op. 9 No. 2.flac
    02 - Ludwig van Beethoven - Für Elise.flac
```

This path is only a fallback. **Tags always take priority.** If any `ALBUMARTIST`
or `ARTIST` tag is present, the folder pattern is ignored.

### Tags (recommended)

For compilations that are properly tagged:

- Set `ALBUMARTIST` to `Various Artists` (or any alias: `VA`, `V.A.`, `Various`)
  on every track. All aliases are normalized to `Various Artists` in the
  database.
- Set `ARTIST` per track to the actual performer.

The scanner will group all tracks under a single `Various Artists` album and
additionally link each track to its individual `ARTIST` row, so tracks remain
discoverable when browsing by performer.

### Cover art for compilations

When a compilation's tracks live in a **shared folder** (multiple albums in the
same directory, the classic "Various Artists" flat layout), the scanner cannot
safely write a `cover.jpg` there without risking collisions between sibling
albums. Cover art for those albums is stored in the central metadata directory
(`{BASE_PATH}/metadata/music/album-covers/{albumId}.{ext}`) instead of
alongside the tracks.

---

## Multiple artists & collaborations

When a track credits more than one artist, Lumastra splits the names and links the
track to each one, so it appears under every performer. It splits on:

- collaboration markers: `feat.`, `ft.`, `featuring`, `&`, `+`, `vs.`
- **multi-value tags**: a Vorbis comment with several `ARTIST` entries, or an
  ID3v2.4 null-separated artist tag

The first name becomes the track's primary artist; the rest are linked as additional
artists. Band names are protected: ` and ` and commas are **not** split when a part
starts with "The", so "Florence and the Machine" and "Tyler, The Creator" stay
intact.

Artists are matched case- and punctuation-insensitively, so `The Beatles`,
`the beatles`, and `The Beatles!` all resolve to one artist. (The leading "The" is
kept as written: there's no "Beatles, The" sort rewrite, and `ARTISTSORT` tags
aren't read.)

:::tip
For reliable multi-artist credits, use proper multi-value `ARTIST` tags (or a clear
`feat.`) instead of ad-hoc separators.
:::

## Track numbers

The scanner strips the following leading track-number prefix forms from
filenames before deriving the title:

| Pattern | Example filename | Derived title |
| ------- | ----------------- | -------------- |
| `NN - ` | `01 - Allegro.flac` | `Allegro` |
| `NN. ` | `01. Allegro.flac` | `Allegro` |
| `NN_` | `01_Allegro.flac` | `Allegro` |
| `NN-` (no space) | `01-Allegro.flac` | `Allegro` |
| `NNN ` (number followed by space) | `001 Allegro.flac` | `Allegro` |

Track numbers embedded in the `TRACKNUMBER` tag are always preferred over
prefix-derived numbering and control sort order.

---

## Album art

The scanner looks for cover art in this order:

1. **Embedded art** in the audio file's tags (`APIC` for MP3, `METADATA_BLOCK_PICTURE`
   for FLAC/Ogg, etc.). The first track scanned that carries embedded art sets
   the album poster.
2. **Folder image**, only when the album directory is not shared across
   multiple albums (see [Compilations](#compilations--various-artists) above).

### Recognized poster filenames

| Stem (case-insensitive) | Artwork type |
| ------------------------ | ------------- |
| `cover`, `folder`, `front`, `poster` | Poster (front cover) |
| `album`, `artwork`, `art`, `sleeve`, `albumart`, `coverart`, `frontcover` | Poster (supporting names) |

Files whose stem contains any of the following tokens are **rejected** as
posters (they are treated as supplementary scans, not front covers):

`back`, `rear`, `disc`, `disk`, `cd`, `dvd`, `booklet`, `inlay`, `inside`,
`tray`, `label`, `scan`, `scans`

Recognized image formats: `.jpg`, `.jpeg`, `.png`, `.webp`.

:::tip[Use cover.jpg for simplicity]
Naming your front-cover image `cover.jpg` (or `.png`, `.webp`) is the most
reliable choice: it matches the primary token set and is unambiguous.
:::

If no embedded art and no recognized folder image are found, the scanner flags
the album for a deferred Cover Art Archive (MusicBrainz) lookup.

### Genre and artist artwork, once tracks exist

Genre tiles use collages of album covers already in the library. Artist images come
from the [enrichment providers](#optional-artist-enrichment) below.

## Lyrics sidecars

Place a sidecar file with the same stem as the audio file in the same directory:

| Extension | Format detected as |
| --------- | -------------------- |
| `.lrc` | LRC (synced), always treated as synced regardless of content |
| `.txt` | Auto-detected: synced LRC if the file contains `[mm:ss.xx]` timestamp tags; otherwise plain text |

Examples:
```
01 - Kyrie.flac
01 - Kyrie.lrc      ← synced lyrics (LRC format with [mm:ss.xx] timestamps)

02 - Gloria.flac
02 - Gloria.txt     ← plain lyrics (no timestamp tags detected)
```

Sidecar lyrics take priority over lyrics embedded in the audio tags. The scanner
also probes a central lyrics directory (`{BASE_PATH}/metadata/lyrics/`) so lyrics
can be stored separately from the media tree if your music folder is read-only.

---

## Album & artist info files

Lumastra reads Kodi-style `album.nfo` and `artist.nfo` sidecars when present:

- **`album.nfo`**: album title, year, genres, MusicBrainz album / release-group IDs,
  and a review/description.
- **`artist.nfo`**: artist name, MusicBrainz artist ID, biography, and genres.

These only **fill in** fields that are otherwise empty (they never overwrite what's
already there), and are re-read when the file changes.

## Scene-release tag cleaning

Album titles that end in common scene-release tokens are cleaned automatically.
For example, a folder or ID3 tag like `Symphony No. 9-WEB` becomes
`Symphony No. 9`. Stripped tokens include: `WEB`, `WEB-DL`, `FLAC`, `MP3`,
`AAC`, `REMASTERED`, `REPACK`, `VINYL`, `320`, `V0`, and similar. Only
trailing tokens preceded by `-`, `.`, or `_` are removed. Space-separated
words in album titles are preserved.

---

## Excluding files and folders

Place a `.lumastraignore` file in any folder to exclude specific files or
subdirectories (gitignore-style patterns):

```
# .lumastraignore
*.wav           ← exclude all .wav files in this directory
temp/           ← exclude the temp subfolder
liner-notes/    ← exclude booklet scans folder
```

Patterns without `/` match against the bare filename. Patterns with `/` match
against the path relative to the `.lumastraignore` file. Patterns are inherited
by subdirectories.

---

:::note[What the scanner ignores]
- **ReplayGain / volume tags are ignored**: Lumastra derives loudness from its own
  audio analysis ([Essentia](#audio-analysis-essentia)), not from file tags.
- **Embedded MusicBrainz IDs in audio tags aren't read during the scan**: MusicBrainz
  data comes from `.nfo` sidecars or the online lookup ([enrichment](#enrichment--analysis)).
- **Playlist files (`.m3u` / `.m3u8`) aren't imported**: they're skipped by the scan.

Re-scans are incremental: a track is only re-read when its size, modification time,
or content hash changes.
:::

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------- | ---- |
| Tracks appear under `Unknown Artist` | No `ALBUMARTIST` or `ARTIST` tag, and the file is at library root with no `/Artist/` folder above it | Add an `ALBUMARTIST` tag, or move files into an `Artist/Album/` subfolder |
| One album is split across multiple artist entries | Inconsistent `ALBUMARTIST` tag (e.g. `Ludwig van Beethoven` on some tracks, `L. v. Beethoven` on others) | Normalize the `ALBUMARTIST` tag to a single spelling across the album |
| Compilation album is fragmented, each track under its own artist | No `ALBUMARTIST` tag; scanner fell through to per-track `ARTIST` tags | Add `ALBUMARTIST = Various Artists` to every track in the compilation |
| Album art not showing | No embedded art, and no recognized poster image (`cover.jpg`, `folder.jpg`, etc.) in the album folder | Add a `cover.jpg` to the album folder, or embed art in the audio tags |
| Album year is wrong or missing | `YEAR` tag absent, and no `(YYYY)` in the album folder name | Add a `YEAR` tag, or rename the folder to include `(YYYY)` |
| Multi-disc album split into separate albums | Disc subfolders use unrecognized names (e.g. `Part A`, `Side 1`) | Rename disc subfolders to one of the recognized patterns: `CD1`, `Disc 1`, `Vol 1`, `Part 1` |
| Lyrics not showing | Sidecar file uses a different stem than the audio file, or a `.txt` sidecar has no timestamps | Ensure the sidecar stem matches the audio filename stem; add `[mm:ss.xx]` timestamps if synced display is needed |
| Track title is the raw filename | `TITLE` tag is absent and filename has no parseable `Artist - Title` split | Add a `TITLE` tag, or rename the file to `NN - Title.ext` |

---

## Enrichment & analysis

Everything below is **optional** and runs as a **background task** after a scan.
None of it is needed for basic playback. Tasks drain on a schedule and can be
triggered from **Tasks → Overview** (`/admin/tasks`).

### MusicBrainz

Albums and artists are matched to the open [MusicBrainz](https://musicbrainz.org)
database using your tags, including MusicBrainz IDs when your files carry them. A
match adds canonical IDs, genres and artist details. Synced lyrics come from LRCLIB in
a separate background task. Every step is skipped quietly if a service is unreachable.

Tracks with no MusicBrainz IDs in their tags can be identified by their sound. Get a
free application key at [acoustid.org](https://acoustid.org/new-application) and enter it
under **Admin → Providers → MusicBrainz** (or set `ACOUSTID_API_KEY`). A background
task then reads the first two minutes of each such track, computes an audio
fingerprint with `fpcalc` (included in the image), and looks it up on AcoustID. Only a
confident match with a single clear recording is kept. It fills in the track's
MusicBrainz recording ID, and when the matched tracks of an album agree on the album, the
album and artist get their MusicBrainz IDs too, which helps cover art and popularity.

IDs from your tags always win, existing IDs are never overwritten, and your files are
never renamed or moved. The task runs at low priority and slows while a video transcode is
active. Music playback, direct play, and remux sessions do not slow it. Without a
key it does nothing. Progress and results (matched, no match) show under **Tasks** as *Identify Music by Fingerprint (AcoustID)*.

### Audio analysis (Essentia)

If the Essentia analysis tool is installed, a background task computes per-track
audio features: **tempo (BPM), musical key, energy, danceability, a beat grid, and
intro/outro markers**. This powers:

- the **crossfade / DJ engine**: beat-aligned transitions and BPM matching, with
  blend, cut, filter, echo, and bass-swap fade modes;
- **mood-based quick-picks**: filtering by energy, danceability, and BPM (relaxed,
  workout, focus, and so on);
- **"similar track" recommendations**: these features feed the music embeddings.

Analysis is optional. Without the tool installed the task does nothing
(disable it explicitly with `DISABLE_MUSIC_ANALYSIS=true`).

On arm64 or WSL2, the built-in analyzer can crash: configure a running sidecar
with `SONIC_ANALYZE_URL`, then select **Sidecar service**
(`MUSIC_ANALYSIS_ENGINE=sidecar`) under **Settings → Task runner → Advanced Tasks**;
without a configured sidecar it falls back to the built-in engine.
`MUSIC_ANALYSIS_MAX_DURATION_MINUTES` skips tracks longer than 30 minutes by
default; set it to `0` to analyze every length.

### Genres

Genres come from two places: the `GENRE` tag embedded in your files (available
immediately after a scan) and MusicBrainz (after enrichment runs). Both are used
for browsing and feed "similar track" recommendations.

### Optional artist enrichment

Each provider degrades to a graceful skip (not a failure) when unconfigured, and
refreshes on a schedule. They're tried in this order, each filling gaps the
previous one left:

| Provider       | Adds                                                  | Configure with    |
| -------------- | ------------------------------------------------------ | ------------------ |
| **TheAudioDB** | Artist images, banner/fanart, bio (no key required)   | built-in          |
| **Discogs**    | Artist photos and profile text                        | `DISCOGS_TOKEN`   |
| **Deezer**     | Artist photos, particularly for niche electronic/dance acts other sources miss (no key required) | built-in |
| **Last.fm**    | Listener/play counts, top tracks, tags, similar artists, bio | `LASTFM_API_KEY` |

---

## Next

- [Music discovery (sonic AI)](/guides/music-discovery/): the AI suite built on
  this scanner's output
- [Organizing your media](/guides/organizing-media/): the same conventions for
  movies and TV
- [Media enrichment](/guides/media-enrichment/): what happens after a scan
  matches a file
- [Backup & recovery](/guides/backup-recovery/): back up your library, not just
  your store account
