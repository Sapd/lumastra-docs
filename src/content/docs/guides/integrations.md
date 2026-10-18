---
title: Optional integrations
description: Add optional integrations in the setup wizard or Admin Settings, with environment variables as an alternative.
sidebar:
  order: 3
---

Lumastra can connect to metadata providers, media servers, and AI services.
Each one is optional. Add the services you want in the **first-run setup wizard**,
or later under **Admin → Settings**. Enter the service URL and API key in the UI;
you don't need to edit environment variables.

Every external integration is **optional** and **skips gracefully** when its
key or URL is unset: an unconfigured integration never fails the app or
degrades its health. Data only leaves your server for the integrations you
explicitly enable.

## Add integrations in the UI

- **During setup:** the wizard asks about your integrations and checks the connections
  and credentials you enter. You can skip optional services and add them later.
- **After setup:** open **Admin → Settings** to add or change provider keys and service
  connections. Changes take effect without a restart.
- **Environment variables:** available as an alternative for deployments managed through
  configuration files. The variable names below are a reference for that path, not
  required setup steps.

:::tip[For the full experience]
Everything here is optional, but these make the biggest difference. Set them up in
roughly this order:

1. **TMDB API key** (free): metadata, posters, backdrops, search and discovery. Without
   it, titles fall back to file-name metadata with no artwork. Either credential from
   [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) works: the
   short **API Key** or the long **API Read Access Token**.
2. **An embeddings key** (OpenAI or Voyage AI, paid per use, usually cheap):
   recommendations, For You, mood picks and semantic search. The music features below
   build on it.
3. **MDBList API key** (free account): the Trending and Popular shows rows on For You,
   and rich keyword tags that make recommendations and semantic search noticeably better.
   Without a key, Lumastra doesn't contact MDBList at all and those two rows are hidden.
4. **The sonic embedder sidecar** (x86-64; a GPU helps but isn't needed): music by sound,
   including sound-alike tracks, a smart queue that follows the sound, mixes and
   collections, and search by sound. See [Music discovery](/guides/music-discovery/).
5. **AcoustID API key** (free): identifies your music by its sound, for accurate matches in
   MusicBrainz. Only tracks without MusicBrainz IDs in their tags are looked up. See
   [Organizing music](/guides/organizing-music/#musicbrainz).

Tempo, key and energy analysis (for DJ crossfades and mood picks) is built into the image
on x86-64 and needs no setup. The native apps also need your server on HTTPS with a
trusted certificate.
:::

:::note[Local-first streaming]
Movies, series and music stream from files available to Lumastra; audiobooks
stream from your Audiobookshelf server. Discovery-only items (for example, TMDB metadata with no local file)
surface a **Request** action instead of **Play**. Jellyfin is background
**sync only**: Lumastra does not stream from it, and it isn't required for
any feature.
:::

## Metadata & ratings

Enter provider keys during setup or later in **Admin → Settings**.
The last column lists optional environment-variable alternatives.

| Integration    | What it adds                                          | Environment alternative |
| -------------- | ------------------------------------------------------ | --------------------- |
| **TMDB**       | Metadata, posters/backdrops, search, discovery (**strongly recommended**) | `TMDB_API_KEY` |
| **MusicBrainz**| Music metadata enrichment                             | (built-in)          |
| **AcoustID**   | Identifies music without MusicBrainz tags by its sound (free key) | `ACOUSTID_API_KEY` |
| **MDBList**    | Trending and Popular shows rows, aggregated ratings, rich keyword tags (**recommended**) | `MDBLIST_API_KEY`   |
| **AniDB**      | Anime-specific metadata; an alternate to TMDB, selectable per library path | `ANIDB_CLIENT` + `ANIDB_CLIENT_VER` |
| **Last.fm**    | Music popularity data                                 | `LASTFM_API_KEY`    |
| **Discogs**    | Artist / album enrichment                             | `DISCOGS_TOKEN`     |

:::note[AniDB needs your own client identifier]
AniDB's API terms require every application to register its own client id and
version, rather than share one built into Lumastra. Register at
[AniDB's UDP API page](https://wiki.anidb.net/UDP_API_Definition), then enter the
client id and version in **Admin → Settings → Metadata → AniDB provider card**.
The environment alternatives are `ANIDB_CLIENT` and `ANIDB_CLIENT_VER`.
:::

## Media servers & tools

**Most integration settings can be configured in Admin → Settings. Some are also
requested during the first-run setup wizard.**

For integrations offered during setup, the wizard asks for and verifies the connection
details. You can also add or change connections later in **Admin → Settings**.
For Jellyfin sync, enter your Jellyfin server URL and API key in the UI. The
`JELLYFINURL` and `JELLYFINAPIKEY` variables are optional alternatives.

Jellyfin watch-state sync works in both directions, with users matched by username.
Both servers can use the same media folders while you try Lumastra.

| Integration         | What it adds                                  | Environment alternative / option |
| -------------------- | ------------------------------------------------ | ---------------------------------- |
| **Jellyfin sync**   | Bidirectional watch-state sync and "now streaming" sessions | `JELLYFINURL` + `JELLYFINAPIKEY` |
| **Jellyfin-compatible `/j` API** | Connect existing Jellyfin / Streamyfin TV & mobile apps to Lumastra (**no Jellyfin server required**) | (built-in) |
| **Subsonic** | Use any Subsonic music client | Enable OpenSubsonic API Compatibility under Settings → Music, or set `FEATURE_SUBSONIC_COMPAT=true` (off by default) |
| **AudiobookShelf**  | Audiobook library, see [Audiobooks](/guides/audiobooks/) | `AUDIOURL` + `AUDIOAPIKEY`      |
| **Kavita**          | Books / manga / comics                        | `KAVITAURL` + `KAVITAAPIKEY`    |
| **Sonarr / Radarr** | Release calendar                              | `SONARRURL` / `RADARRURL` + keys |
| **Seerr**      | Media requests                                | `SEERRURL` + `SEERRAPIKEY` |

### Connecting Jellyfin tools

Open **Settings → Connections → Connect a Jellyfin app** to generate a client
password or a separate read-only token for tools that observe your library.

## Music analysis

| Component | What it adds | Enable with |
| --------- | ------------ | ----------- |
| **Audio analysis** (Essentia, built into the x86-64 image) | Tempo, key, energy, beat grid and intro/outro markers for DJ crossfades and mood picks | on by default; `DISABLE_MUSIC_ANALYSIS=true` turns it off |
| **Sonic embedder sidecar** | Sound-alike tracks, the sonic smart queue, Sonic Collections, Smart Mixes, Song Paths, Music Map, Sound Search | `docker compose --profile sonic up -d`, `SONIC_EMBEDDER_URL`, then `FEATURE_MUSIC_SONIC` and the per-feature flags in [Music discovery](/guides/music-discovery/#enabling-the-features) |

## AI

Choose your providers and enter their keys in the **setup wizard** or later in
**Admin → Settings**. Use the separate embedding and chat fields for the two features.

AI recommendations (vector embeddings, stored in pgvector) and the AI chat
assistant are two separate features with **separate keys**: there's no
fallback between them. Bring a **Voyage AI** or **OpenAI** key for embeddings;
Voyage is preferred when both keys are set. A custom `EMBEDDING_BASE_URL` with
`EMBEDDING_API_KEY` takes precedence over both. Bring an **OpenAI** or **Anthropic** key for chat. See
[The AI assistant](/guides/ai-assistant/) for what the chat assistant does,
its limits, and where its settings live.

| Optional environment variable | Purpose                                                    |
| ------------------------- | ------------------------------------------------------------ |
| `OPENAI_API_KEY`        | Embeddings only (OpenAI)                                   |
| `VOYAGE_API_KEY`        | Alternative embedding provider                             |
| `EMBEDDING_DIMENSIONS`  | Must match the embedding model (else AI features error)   |
| `OPENAI_CHAT_API_KEY`   | Chat assistant only (OpenAI), separate from `OPENAI_API_KEY` |
| `ANTHROPIC_API_KEY`     | Chat assistant only (Anthropic)                            |



Keys and connections added after install take effect without a restart. Saving a
Jellyfin connection, a Last.fm key or an MDBList key starts the matching tasks right
away, and changing the GPU acceleration setting makes Lumastra check the hardware again.
A TMDB key added under **Admin → Settings → Metadata** also scans libraries that were
waiting for a match again, and the items are identified in place.

## Next

- [The AI assistant](/guides/ai-assistant/): what the chat assistant does and
  where its own settings live
- [Music discovery (sonic AI)](/guides/music-discovery/): the sonic embedding
  suite, separate from these AI keys
- [Chapters, skip intro & trickplay](/guides/media-enrichment/): how TMDB,
  MDBList, Jellyfin, and AniDB metadata gets merged
- [Audiobooks](/guides/audiobooks/): the AudiobookShelf integration in detail
