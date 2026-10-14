---
title: Optional integrations
description: Connect metadata providers, media servers, and AI — each is optional.
sidebar:
  order: 3
---

Lumastra can connect to metadata providers, media servers, and AI services.
Each one is optional: you'll need whichever API keys or URLs you decide to
use, and none are required to run Lumastra.

Every external integration is **optional** and **skips gracefully** when its
key or URL is unset: an unconfigured integration never fails the app or
degrades its health. Data only leaves your server for the integrations you
explicitly enable.

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
Streaming is **local-files-only**. An item is playable when it has actual
files; discovery-only items (for example, TMDB metadata with no local file)
surface a **Request** action instead of **Play**. Jellyfin is background
**sync only**: Lumastra does not stream from it, and it isn't required for
any feature.
:::

## Metadata & ratings

| Integration    | What it adds                                          | Enable with         |
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
[AniDB's UDP API page](https://wiki.anidb.net/UDP_API_Definition) and set
`ANIDB_CLIENT` (the registered id) and `ANIDB_CLIENT_VER` (an integer you
increment if you ever re-register). Both can also be set from **Settings →
Metadata → AniDB provider card** instead of the environment.
:::

## Media servers & tools

| Integration         | What it adds                                  | Enable with                     |
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

AI recommendations (vector embeddings, stored in pgvector) and the AI chat
assistant are two separate features with **separate keys**: there's no
fallback between them. Bring a **Voyage AI** or **OpenAI** key for embeddings;
Voyage is preferred when both keys are set. A custom `EMBEDDING_BASE_URL` with
`EMBEDDING_API_KEY` takes precedence over both. Bring an **OpenAI** or **Anthropic** key for chat. See
[The AI assistant](/guides/ai-assistant/) for what the chat assistant does,
its limits, and where its settings live.

| Variable                | Purpose                                                    |
| ------------------------- | ------------------------------------------------------------ |
| `OPENAI_API_KEY`        | Embeddings only (OpenAI)                                   |
| `VOYAGE_API_KEY`        | Alternative embedding provider                             |
| `EMBEDDING_DIMENSIONS`  | Must match the embedding model (else AI features error)   |
| `OPENAI_CHAT_API_KEY`   | Chat assistant only (OpenAI), separate from `OPENAI_API_KEY` |
| `ANTHROPIC_API_KEY`     | Chat assistant only (Anthropic)                            |

:::tip
The music keys (Last.fm, Discogs, MDBList), TMDB, and the AI chat/embedding
keys can all be entered directly in the first-run **`/setup`** wizard, or set
later as secrets in the admin **Settings** UI / environment variables,
whichever you prefer.
:::

## Next

- [The AI assistant](/guides/ai-assistant/): what the chat assistant does and
  where its own settings live
- [Music discovery (sonic AI)](/guides/music-discovery/): the sonic embedding
  suite, separate from these AI keys
- [Chapters, skip intro & trickplay](/guides/media-enrichment/): how TMDB,
  MDBList, Jellyfin, and AniDB metadata gets merged
- [Audiobooks](/guides/audiobooks/): the AudiobookShelf integration in detail
