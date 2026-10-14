---
title: Organizing your media
description: How to name and arrange files on disk so Lumastra recognizes them, including multiple episodes in one file.
sidebar:
  order: 3
---

Name and arrange movie, TV, and anime files on disk so Lumastra's scanner
identifies them correctly. This helps when setting up a new library or fixing
one that isn't matching well. You'll need shell or file-manager access to the
folders Lumastra scans.

Lumastra scans your library folders, parses each filename, and identifies titles
against metadata providers (TMDB). It's tolerant of messy layouts, but the
conventions below give the most reliable results. It is also unusually good at
**recognizing multiple episodes stored in a single file** (see below).

:::note[Examples use public-domain titles]
Lumastra ships with no media of its own: you supply your own library. The
examples below use public-domain films and shows purely to illustrate naming.
:::

## Libraries and groups

Lumastra's library model has two layers:

- A **library group** is what you see as "a library": a name, an icon, an age
  ceiling, and a metadata-provider chain.
- A **library path** is one on-disk root folder. Each path has a single
  **media type**: `movie`, `tv`, `anime`, `music`, `audiobook`, or one of the
  personal types (`home_video`, `training`, `educational`, `personal`).
  Audiobooks are mirrored from AudiobookShelf, not scanned from disk, so a folder
  can't be an `audiobook` path. See [Audiobooks](/guides/audiobooks/).

:::note[One media type per group]
Because each path carries one media type, keep **one media type per group**:
create a separate group (or at least a separate path) for Movies, TV, Music, and
so on. Pointing a Movie path and a TV path at the same group mixes types.
:::

In the first-run wizard, folders named like a library are suggested with their type
preselected. For example `Movies`, `Filme`, `Films`, `Películas` and `Filmy` are movie
folders, and `TV Shows`, `Serien`, `Séries` and `Seriale` are TV folders. English,
German, French, Spanish, Portuguese, Italian, Dutch, Polish and Czech names are
recognised. `Kids` and `Documentaries` folders are suggested without a type, and
audiobook folders are never suggested.

Lumastra scans both on a schedule (about hourly) and live via a filesystem
watcher. Scans are incremental: unchanged files are skipped.

## Folder structure

### Movies

A per-movie folder is recommended but not required; the title and year come from
the filename.

```
Movies/
  Night of the Living Dead (1968)/
    Night of the Living Dead (1968).mkv
  Metropolis (1927)/
    Metropolis (1927) {edition-Restored}.mkv
    Metropolis (1927) {edition-Theatrical}.mkv
```

Multiple video files in one movie folder are linked as selectable **versions /
editions** of the same movie.

### TV & Anime

```
TV/
  The Adventures of Superman (1952)/
    Season 01/
      The Adventures of Superman - S01E01 - Superman on Earth.mkv
      The Adventures of Superman - S01E02 - The Haunted Lighthouse.mkv
```

:::caution[The series name comes from the folder]
For TV, the **show folder** (the folder above `Season XX`) is what Lumastra uses
to identify the series, not the filename. A good folder name matters more than
the episode filename. Recognized season folders (case-insensitive):

- `Season 01`, `Season 1`
- `Staffel 2`, `Saison 3`, `Temporada 4`
- `S01`
:::

### Music

Music has its own naming and tagging rules (tags, compilations, multi-disc, album
art, lyrics). See the dedicated [Organizing your music](/guides/organizing-music/)
page.

### Personal & non-entertainment libraries

Lumastra isn't only for movies, TV, and music. It has dedicated media types for
**home videos**, **training**, **educational**, and **personal** content. These
**skip provider matching entirely** and build their structure from your folders,
so they work great for footage that isn't in any metadata database.

The **immediate parent folder becomes the title**, and the folders above it map to
metadata fields:

| Media type    | Folder level 1 → | Folder level 2 →     |
| ------------- | ---------------- | --------------------- |
| `home_video`  | Date / year      | Event                 |
| `training`    | Department       | Category (the title)  |
| `educational` | Subject          | Course (the title)    |
| `personal`    | (flat)           | —                      |

```
Training/
  Engineering/            ← department
    Onboarding/           ← becomes the "course" title; all files grouped here
      01 - Welcome.mp4
      02 - Safety.mp4
```

## Naming conventions

Before reading a filename, Lumastra:

- treats `.`, `_`, space, and `-` as separators;
- strips a leading `[Group]` tag;
- drops quality and codec tokens (`1080p`, `BluRay`, `x265`, `DTS`, …) so they
  never end up in the title.

### Movies

| Filename                                            | Recognized as                    |
| --------------------------------------------------- | --------------------------------- |
| `Night of the Living Dead 1968 1080p BluRay.mkv`    | Night of the Living Dead · 1968  |
| `His Girl Friday (1940).mkv`                        | His Girl Friday · 1940           |
| `Metropolis (1927) {tmdb-19}.mkv`                   | TMDB id (exact match)            |
| `Nosferatu.1922.{imdb-tt0013442}.mkv`               | IMDB id tt0013442                |

- A parenthesized `(Year)` is preferred and tells remakes apart. In a file name it is read
  from 1880 on, so early films such as `(1896)` keep a clean title.
- A `{tmdb-NNN}` or `tt#######` id in the filename **or** the parent folder
  skips the fuzzy search entirely.

### TV episodes

The primary pattern is `SxxExx`:

- It is case-insensitive.
- The episode number has no digit cap. Lumastra never shortens an over-long
  episode number, because that could turn a bad filename into a different,
  real-looking episode.
- The episode title may follow it in the filename.

The `1x05` form (season `x` episode) works too:

| Filename                                              | Season / Episode |
| ------------------------------------------------------ | ----------------- |
| `The.Adventures.of.Superman.S02E05.mkv`               | 2 / 5             |
| `Dragnet - S01E01 - The Human Bomb.mkv`               | 1 / 1             |
| `The.Adventures.of.Superman.S01E13.mkv`               | 1 / 13            |
| `Dragnet 1x05.mkv`                                    | 1 / 5             |
| `Dragnet S01.E05.mkv` or `Dragnet S01 E05.mkv`        | 1 / 5             |

### Daily shows (air date)

Talk shows, news, and other daily shows can be named by air date instead of
`SxxExx`. Lumastra links the file to the episode TMDB lists for that day:

- `The Daily Program 2021.03.14.mkv`
- `The Daily Program - 2021-03-14 - Guest Name.mkv`
- `2021_03_14.mkv` inside the show's folder

Rules:

- The date is year first (`YYYY.MM.DD`, `YYYY-MM-DD`, `YYYY_MM_DD`, or with
  spaces). Day-first dates like `14.03.2021` are not read.
- An episode number in the name wins over the date.
- Dates are read only in TV and anime libraries.
- If two episodes aired the same day, the season folder decides. If it can't,
  the file is left unlinked and listed as a scan issue; rename it with `SxxExx`.
- Files scanned before Lumastra has the show's episode list are moved to the
  right episode after the next metadata refresh.

### Anime / absolute numbering

When there's no `SxxExx`, these anime forms work:

- `[Fansub] Momotaro - 001 [1080p].mkv`
- `Momotaro 01 - The Peach Boy.mkv`
- `Momotaro.Ep01.mkv`
- a `v2` version suffix, as in `Momotaro - 01v2.mkv`

Absolute-ordered anime is stored as a high episode number under season 1
(e.g. `S01E0001`).

:::note[Split-cour anime and TMDB season mismatches]
Sonarr/TVDB and TMDB sometimes disagree on season structure for split-cour anime
(e.g. two 25-episode seasons on disk vs. one 50-episode TMDB season). Lumastra
detects and repairs this automatically after metadata sync. See [Auto-fixing
split-cour anime season structure](/guides/administration/#media-library-console).
:::

:::note[Absolute numbers in Sonarr anime names]
Sonarr's anime naming puts the absolute episode number after `SxxExx`, as in
`Momotaro - S09E21 - 188 - The Peach Boy.mkv`. When TMDB numbers the show
differently from your season folders, Lumastra uses that absolute number to find
the right TMDB episode and moves the file's episode there after metadata sync.

Without an absolute number, a match that rests only on episode numbers lining up
is not applied on its own. It appears as a proposal under **Admin → Library →
Quarantine**, unless an admin turns on **Auto-apply episode matches based on
numbers alone** (`RECONCILE_AUTO_APPLY_NUMBER_MATCHES`, off by default). The same
page lists recent automatic moves with an **Undo** button.
:::

## Multiple episodes in one file

This is where Lumastra shines. A single file containing several episodes is split
into one item per episode, all sharing the same file:

| Filename                                                   | Episodes      |
| ------------------------------------------------------------ | ------------- |
| `The.Adventures.of.Superman.S01E01E02E03.mkv`               | 1 → 3         |
| `Dragnet.S01E01-E03.mkv`                                     | 1 → 3         |
| `Betty Boop - S01E01-02-03 - Snow White + Bimbo + Ha!.mp4`   | 1 → 3         |
| `Momotaro.S01E0001E0002.mkv`                                 | 1 → 2 (anime) |
| `Dragnet 1x01-03.mkv`                                        | 1 → 3         |

- Lumastra creates a distinct episode entry for each number in the range and
  attaches the same physical file to all of them.
- On re-scan, a partially linked combined file repairs itself.
- Quality tokens are protected: `Dragnet.S01E05-1080p.mkv` is episode 5 only,
  **not** a range.
- **Per-segment thumbnails:** when frame extraction is enabled, each episode in
  a combined file gets a *different* frame, sampled proportionally. Two
  episodes get frames at 25% and 75% of the file, so the thumbnails aren't
  identical.

## Specials, editions & multi-part movies

- **Specials / OVA / ONA** without an explicit season are filed under **Season 0**
  (an explicit `SxxExx` always wins).
- **Editions** are recognized via Plex-style `{edition-Restored}` /
  `{edition-4K}` braces, a library-path edition label, or inline patterns.
  Multiple editions of a movie become selectable versions.
- **Multi-part files**: `Part1`, `pt2`, `cd1`, `disc2` mark the parts of one
  movie or episode, not separate items. A part counts only when the other
  parts sit in the same folder; a lone `Part 1` is read as part of the title.
  For an episode, every part needs the episode number:
  `The Show S01E01 pt1.mkv` and `The Show S01E01 pt2.mkv`. (To store two
  *episodes* in one file, use the `S01E01-E02` forms above.)

## Sidecar files & extensions

Scanned extensions:

- **Video:** `.mkv` `.mp4` `.avi` `.m4v` `.mov` `.wmv` `.ts` `.m2ts` `.webm`
  `.ogv` `.flv` `.3gp` `.mpg` `.mpeg`
- **Audio:** `.flac` `.mp3` `.m4a` `.opus` `.ogg` `.wav` `.wma` `.aac` `.alac`
  (only ingested in music libraries)

**Subtitles** (`.srt` `.ass` `.ssa` `.vtt` `.sub` `.sup`) are matched to the
video by name:

- `Nosferatu.en.srt`
- `Nosferatu.de.forced.srt`
- `Nosferatu.pt-BR.srt`
- `Nosferatu.en.sdh.srt`

These are picked up automatically:

- **Artwork:** `folder`, `poster`, `cover`, `backdrop`, `logo`, and `banner`
  images.
- **`.nfo` sidecars**, read for authoritative IMDB/TMDB ids.

**Ignored:**

- `extras`, `samples`, `trailers`, and `featurettes` folders
- disc folders (`VIDEO_TS`, `BDMV`)
- vendor folders (`@eaDir`, `$RECYCLE.BIN`)
- files with `sample` in the name
- anything matched by a per-folder **`.lumastraignore`** file (gitignore-style)

## Troubleshooting

Nothing is dropped. A file that can't be matched:

- is still added as a playable **unmatched** item built from its filename;
- is retried automatically once providers are healthy;
- appears in the admin re-identify surface when it needs manual attention.

**Make identification reliable:**

1. Embed a `{tmdb-NNN}` or `tt#######` id (filename or folder) to skip fuzzy
   matching.
2. For TV, name the **show folder** well: it's the series search query. Id tags such as
   `[tmdbid-1234]` or `{tvdb-5678}` in the folder name are removed from the title.
3. Use `(Year)` for movies.
4. Point each path at the correct **media type**.

**Common mistakes** (these patterns are **not** recognized):

| Mistake                                       | Fix                                |
| ---------------------------------------------- | ----------------------------------- |
| Split episode as `The Show pt1.mkv` / `pt2.mkv` (no episode number) | Use `The Show S01E01 pt1.mkv` / `pt2.mkv` |
| Episode title used as the show folder         | Folder must be the **show** name   |
| Music with no tags in a flat folder           | Use `Artist/Album/Track` folders   |

## Next

- [Organizing your music](/guides/organizing-music/): tags, folder rules, and
  album art for music libraries
- [Audiobooks](/guides/audiobooks/): the AudiobookShelf-mirrored audiobook
  library instead
- [Chapters, skip intro & trickplay](/guides/media-enrichment/): what happens
  to a file after it's matched
- [Administering Lumastra](/guides/administration/): the re-identify surface
  and provider settings
