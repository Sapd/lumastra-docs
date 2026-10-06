---
title: What Lumastra sends where
description: "Every outbound connection a Lumastra server can make: what data leaves, when, which setting controls it, and who receives it. Includes the maintainer-operated services and what runs offline."
sidebar:
    order: 4
---

This inventory lists outbound destinations, payloads, triggers, and controls.
The operator controls the data their users send through configured services.
Provider calls were checked against server code and fresh-install traffic.

Every destination sees your server's IP address. Custom AI or push endpoints
receive the same feature data instead of the default provider. Most flows require
configuration; default contacts are listed below.

## What a fresh install contacts

| Destination | When | What is sent | How to stop it |
| --- | --- | --- | --- |
| `lumastra.org` | 5 to 30 seconds after the first start, then about every six hours | The install ID and a status code ([licence renewal](#lumastraorgapilicenserefresh-licence-renewal)) | Can't be switched off; blocking it is safe |
| `github.com`, then `release-assets.githubusercontent.com` | First start of each container that transcodes, until the ffmpeg volume holds a copy | Nothing; a download of the pinned jellyfin-ffmpeg release ([ffmpeg download](#ffmpeg-download)) | `FFMPEG_AUTO_DOWNLOAD=false` and your own binaries |
| `www.theaudiodb.com`, `api.deezer.com`, and their image hosts | Once a music library has artists or albums | Artist and album names ([TheAudioDB and Deezer](#metadata-artwork-and-ratings-providers)) | `DISABLE_MUSIC_ARTWORK_ENRICHMENT=true` |
| `raw.githubusercontent.com` | Every 48 hours, once the library has a movie or show with a TMDB id | Nothing; a download of a public anime id list ([Fribb anime list](#fribb-anime-list)) | `DISABLE_FRIBB_ANIME_SYNC=true` |
| `huggingface.co` and its CDN | First start of the optional sonic sidecar | Nothing; a download of the model weights ([sonic sidecar](#sonic-sidecar-model-weights)) | `SONIC_MODEL_FP` pointing at a local copy |

A user's browser additionally contacts YouTube when a trailer plays (see
[YouTube trailers](#youtube-trailers)). Push only starts once a user enables
notifications in the iOS app.

## Services run by the Lumastra maintainer

The project maintainer (Denis Arnst, Austria/EU, `git@sapd.eu`) operates the
licence endpoint and push relay. The signing-key file is a published mirror,
not a runtime destination.

### `push.lumastra.org`: the iOS push relay

The stock iOS app uses the maintainer's Apple signing key through a push relay.
Your server sends notifications to that relay for delivery.

| | |
| --- | --- |
| **On by default?** | **Yes**, but nothing is sent until a user has enabled notifications in the iOS app (which registers a device token with your server) and a notification fires for them. Turn it off with `FEATURE_PUSH_NOTIFICATIONS=false`. |
| **When** | Each time a new-episode or request-available notification is queued for a user who registered an iOS device. |
| **Sent** | `POST {PUSH_RELAY_URL}/api/push/send` with: the device tokens of the recipient's iOS devices, the app bundle id, the APNs environment (`sandbox`/`production`), a collapse id (the notification's UUID), an expiry timestamp, and the payload. Authenticated with a short-lived relay token your server obtains from the licence refresh below (or with `PUSH_RELAY_TOKEN` if you set one). The token carries only your install's random ID. |
| **What the payload contains** | On the relay route the payload is **content-free by design**: the banner title is your instance name, the body is a generic "you have a new notification" line, and the only extra fields are the notification UUID, its kind (e.g. `library.new_episode`), a badge count, and two signed URLs that point back at **your** server. The relay learns no media title, no media id and no artwork. The iOS app fetches the real text and picture from your server after the push arrives. |
| **Not sent** | Usernames, e-mail addresses, media titles, watch history, library contents. |
| **Setting** | `FEATURE_PUSH_NOTIFICATIONS` (default on), `PUSH_RELAY_URL` (default `https://push.lumastra.org`), `PUSH_RELAY_TOKEN` (optional), `PUSH_TRANSPORT`. See [iOS push notifications](/guides/push-notifications/). |
| **Avoid it entirely** | Build and distribute your own iOS app and set `APNS_KEY_P8` / `APNS_KEY_P8_PATH`. The server then talks to Apple directly over TLS (`api.push.apple.com`), the relay is never contacted, and, because no intermediary sees the payload, the banner carries the real title. |

**GDPR roles.** Push tokens are personal data. The operator is the controller;
the maintainer is a processor acting on the server's delivery instructions.
Art. 28 GDPR requires a written processor agreement. Until a standard agreement
is published, the policy below is the maintainer's commitment; contact
`git@sapd.eu` with concerns.

**Relay retention.** Tokens and payloads are retained only for delivery and
retries, with no per-token history or profiling. The relay never sees media
notification content. Its code is outside this repository, so these are policy
commitments rather than guarantees auditable from Lumastra source. You can
operate your own relay or use the direct Apple route.

Apple, in turn, receives the token and the content-free payload from the relay
under Apple's own terms, the same as with any iOS app.

### `lumastra.org/api/license/refresh`: licence renewal

Licence *verification* is fully offline against a baked-in public key; this
endpoint only *issues and renews* keys, and hands out the push-relay token.

| | |
| --- | --- |
| **On by default?** | **Yes.** |
| **When** | 5 to 30 seconds after the server starts, then about every six hours. The call is made when the stored licence key is missing, invalid or expiring, **or** when push is on and uses the default relay without a `PUSH_RELAY_TOKEN`. The relay token lasts 24 hours, so that second case renews it on every six-hour tick. The token is shared by all processes and replicas of the install through Valkey, so a restart or a split web/worker deployment does not add calls while the token is still fresh. Without a usable key a failed call is retried after about 30 minutes. |
| **Sent** | Two fields: a random per-install UUID and a one-digit licensing state code. |
| **Received** | A signed licence key, and a relay token valid for 24 hours and bound to that UUID. |
| **Not sent** | Titles, files, users, prompts, library contents. |
| **Avoid it** | Blocking it leaves the server on its current key until that expires, then on the free tier (never a lockout), and turns push off unless you run your own relay or use your own Apple key. See [iOS push notifications](/guides/push-notifications/). |

Full detail is in the repository's
[`LICENSING.md`](https://github.com/Sapd/lumastra/blob/main/LICENSING.md)
§3b: its "nothing else leaves the machine" refers to the licensing loop only,
not to the features on this page.

### `lumastra.org/.well-known/lumastra-signing-keys.json`: plugin signing keys

**Never fetched.** Official plugin verification uses the compiled-in public key
(`trust-anchors.ts`). The website mirror supports out-of-band verification only;
blocking `lumastra.org` doesn't affect plugin verification.

## AI providers

These flows send library descriptions and user queries. Cloud calls remain
inactive until a key is configured; custom local endpoints keep processing on-premise.

### Chat (the assistant)

| | |
| --- | --- |
| **Provider** | Anthropic (`api.anthropic.com`) when only `ANTHROPIC_API_KEY` is set, otherwise OpenAI (`api.openai.com`); `ASSISTANT_PROVIDER` forces one. `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` redirect to a proxy or a local, OpenAI-compatible model. |
| **When** | Every message a user sends to the assistant. |
| **Sent** | The user's message and the conversation history; the assistant's persona and instructions; and whatever the assistant's tools fetch for that turn: matching library titles with year, overview, genres, cast and ratings, the **asking user's** ratings, watch history, watchlist, playlists, requests and listening stats, shared household history where you allow it, active streams (admins), and upcoming releases. |
| **Not sent** | Files, streams, thumbnails, passwords, other users' data beyond what the sharing settings expose to that user. |
| **Setting** | `FEATURE_AI_ASSISTANT` (default on, inert without a key), `FEATURE_ASSISTANT_TOOLS`, `FEATURE_ASSISTANT_SHARED_HISTORY`, the daily limits. |

### Embeddings (recommendations, semantic search, "find by vibe")

| | |
| --- | --- |
| **Provider** | Voyage AI (`api.voyageai.com`) when `VOYAGE_API_KEY` is set, otherwise OpenAI's embedding endpoint; `EMBEDDING_BASE_URL` points to any OpenAI-compatible server (Ollama, text-embeddings-inference) and keeps this on-premise. |
| **When** | The embedding tasks run over your library (initially and as items are added), and again for every semantic search or assistant query. |
| **Sent** | Per library item: title, year, overview, genres, directors, tags and similar descriptive text; for music: artist, album, track and genre text (and lyrics, if lyrics are stored). Per search: the user's query text. |
| **Not sent** | Audio, video, file paths, usernames, watch history. Recommendations are computed on your server from stored vectors. |
| **Setting** | `FEATURE_AI_RECOMMENDATIONS` (default on, inert without a key), `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`. The sonic music features use a self-hosted embedder sidecar, not a cloud provider. |

## Metadata, artwork and ratings providers

Metadata lookups usually send a title/year or external ID plus provider credentials,
without viewer identity. Keyless providers and linked-account watch-sync flows
have different defaults and payloads, listed below.

| Service | Enabled by | When | What is sent |
| --- | --- | --- | --- |
| **TMDB** (`api.themoviedb.org`, `image.tmdb.org`) | `TMDB_API_KEY` | Library scans, enrichment tasks, people pages, artwork browsing, and **on demand** when a poster or still is first displayed (the image proxy fetches it from TMDB and caches it locally) | Search queries built from the parsed title and year of your files; TMDB ids for detail, season, episode, person and image lookups; person names for people search; the popular/trending feeds (no library data) |
| **MDBList** (`api.mdblist.com`, `mdblist.com`) | `MDBLIST_API_KEY` | Ratings enrichment and list sync tasks; the curated lists behind the Trending and For You rails (every 12 hours, and when a rail is empty) | TMDB/IMDb ids of your titles; the ids of lists you subscribe to; the names of the public curated lists (no library data) |
| **MusicBrainz** (`musicbrainz.org`) | Music enrichment enabled (no key; identifies itself with a Lumastra user agent) | Music scans and enrichment | Artist, album and track names parsed from your tags; MusicBrainz ids once matched |
| **Cover Art Archive** (`coverartarchive.org`, redirects to `archive.org`) | With MusicBrainz, and in *Album enrichment* when TheAudioDB returns a release id (on by default, no key; off with `DISABLE_MUSIC_ARTWORK_ENRICHMENT=true`) | Album artwork fetch | MusicBrainz release ids only |
| **AcoustID** (`api.acoustid.org`) | `ACOUSTID_API_KEY` (MusicBrainz provider settings) and the `fpcalc` binary | The background fingerprint task, for music tracks that have no MusicBrainz recording ID in their tags (once per track; a track with no match isn't looked up again). Never during the scan itself. Also the admin provider health check below | A Chromaprint audio fingerprint of the first two minutes and the track duration, derived from the audio, not the audio itself. No file names, tags or user data |
| **lrclib** (`lrclib.net`) | `FEATURE_MUSIC_LYRICS_FETCH` (default **off**) | Lyrics lookup for tracks without embedded lyrics | Artist name, track title, album, duration |
| **Last.fm** (`ws.audioscrobbler.com`) | `LASTFM_API_KEY` | Music popularity task, artist enrichment | Artist names / MusicBrainz ids. Read-only: Lumastra does **not** scrobble your users' listens to Last.fm |
| **Discogs** (`api.discogs.com`) | Discogs personal access token (integration settings) | Artist / album image enrichment | Artist and album names, then Discogs ids |
| **TheAudioDB** (`www.theaudiodb.com`, plus its image host) | **On by default**, no key (public free-tier key). Source order in the *Artist enrichment* and *Album enrichment* task settings. `DISABLE_MUSIC_ARTWORK_ENRICHMENT=true` stops it (pausing the tasks does not: a music scan starts them directly) | Artist and album image enrichment, after a music scan and then daily | Artist names; album and artist names |
| **Deezer** (`api.deezer.com`, images from `cdn-images.dzcdn.net`) | **On by default**, no key: the third source in the *Artist enrichment* chain. Set that source to *None* in the task settings, or set `DISABLE_MUSIC_ARTWORK_ENRICHMENT=true` | Artist image enrichment, for artists the other sources have no picture of | Artist names |
| **AniDB** (`anidb.net`, `api.anidb.net`) | AniDB provider enabled in provider settings | Anime matching | Downloads AniDB's public title list; then per-title detail requests by AniDB id, tagged with a client name registered for Lumastra |
| **MyAnimeList** (`api.myanimelist.net`) | `MAL_CLIENT_ID` / `MAL_CLIENT_SECRET`, plus each user linking their own MAL account | Anime id enrichment; the bundled MAL watch-sync plugin | Anime ids for lookups; for a **linked** user, their episode progress and list status are pushed to and pulled from their MAL list. Only that user's own data, only after they link |
| **Trakt** (`api.trakt.tv`) | `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET`, plus each user linking their own Trakt account | The bundled Trakt watch-sync plugin, in the direction the user chose | For a **linked** user: the movies and episodes they finished are added to their Trakt history as Trakt ids (marked watched "at release", no timestamps), and their Trakt history is read back. Only that user's own data, only after they link |

The admin **provider health check** (Admin → Providers) additionally sends one
test query with your key to TMDB, MDBList, OMDb, MusicBrainz, AcoustID, Trakt
and the configured OpenAI endpoint when you run it.

Provider artwork is fetched by your server and cached locally; the image URLs
users see point at your server, not at the provider. One exception: when an admin
opens the artwork picker for a title (choose a different poster or backdrop),
the thumbnails load straight from `image.tmdb.org` in that admin's browser.

### Fribb anime list

To tell which of your movies and shows are anime, the *Fribb anime sync* task
downloads the public [Fribb anime-lists](https://github.com/Fribb/anime-lists)
mapping file from `raw.githubusercontent.com` every 48 hours and matches it
locally against the TMDB ids in your library. Nothing is sent but the download
request, and it is skipped while no movie or show has a TMDB id. Turn it off with
`DISABLE_FRIBB_ANIME_SYNC=true`.

## Downloads at startup

### ffmpeg download

The container image does not ship ffmpeg. On first start, each container that
transcodes (web, worker, Live TV proxy) downloads the pinned jellyfin-ffmpeg
release from GitHub (`github.com`, redirected to
`release-assets.githubusercontent.com`), checks it against a SHA-256 baked into
the image, and keeps it in the ffmpeg volume, so later starts skip the download.
Nothing is sent but the request. Set `FFMPEG_AUTO_DOWNLOAD=false` and provide
your own binaries at `FFMPEG_PATH` / `FFPROBE_PATH` to avoid it.

### Sonic sidecar model weights

The optional sonic embedder sidecar loads Microsoft's CLAP model. On its first
start it downloads the weights from Hugging Face (`huggingface.co`, served from
its CDN hosts such as `cas-server.xethub.hf.co` and `*.cdn.hf.co`) into the model
cache volume. Nothing is sent but the request. Set `SONIC_MODEL_FP` to a local
weights file to skip it; see
[Deploy with Docker](/guides/deploy-docker/).

## Other outbound calls

### Gravatar

Off by default (`FEATURE_GRAVATAR`). When on, and a user has no avatar of their
own, the server sends a **SHA-256 hash of the user's lower-cased e-mail
address** to `www.gravatar.com` and caches the returned image. The e-mail itself
is never sent, but the hash is stable and Gravatar can link it to an account that
registered the same address. Turn it off if that is not acceptable to your
users.

### User notification webhooks

Off by default (`FEATURE_USER_NOTIFICATION_WEBHOOKS`). When on, each user may
register **one URL of their choosing** (ntfy, Gotify, Discord, Home Assistant…)
and your server posts a rendered title and body, for example a series name and
episode number, or a requested title, to that URL on each new-episode or
request-available event. The destination is the user's, so the user decides who
receives it; the server refuses private, loopback and cloud-metadata addresses.

### YouTube trailers

Trailer playback is done **in the user's browser**, not by your server: the
server only stores the YouTube key TMDB reports for a title. Opening a trailer
embeds `youtube-nocookie.com` and loads the player script from
`www.youtube.com`, so the user's browser contacts Google under Google's terms.
The hover-popup auto-play variant is off by default
(`FEATURE_MEDIA_HOVER_POPUP_TRAILERS`). Block the YouTube domains in your
browser policy if you need to prevent it; the server makes no YouTube request.

### HDHomeRun guide data

If you add an HDHomeRun tuner as a Live TV source, your server fetches the guide
(XMLTV) from `my.hdhomerun.com`, authenticated with the tuner's own device
identifier. Discovery and streaming talk to the tuner on your LAN only.

### Plugins installed from a URL

Installing a plugin by URL downloads the archive from the address the admin
typed and verifies its signature against the compiled-in trust anchor before
anything runs. Nothing is sent except the request itself; there is no plugin
telemetry and no "phone home" from installed plugins other than what a plugin's
own documentation declares (the bundled Trakt and MAL plugins are listed above).

### Services you point Lumastra at

Jellyfin, AudiobookShelf, Kavita, Sonarr, Radarr, Seerr, other service widgets, your
OIDC identity provider, Live TV M3U/EPG URLs, the sonic embedder sidecar and any
custom AI base URL are contacted **only** because you configured them, with the
credentials you gave. What they receive follows from the integration (library
sync, request creation, login); where they run, and whether that is on your
LAN, is your choice.

## Runs fully offline?

Core scanning, indexing, transcoding, playback, the web UI, compatible APIs,
accounts, ratings, playlists, and watch history work offline. Licence verification
also runs locally.

What stops: new metadata, artwork and ratings (already-cached artwork keeps
serving), the AI assistant and embedding-based recommendations and search
(unless pointed at a local model), lyrics fetching, iOS push (unless you run the
direct Apple route and *that* has a path out), Gravatar, Trakt and MAL sync,
HDHomeRun guide updates, user webhooks, plugin installs by URL, and YouTube
trailers in the browser.

For an air-gapped install, omit cloud credentials, leave default-off features
disabled, and prevent the default contacts:

- `FFMPEG_AUTO_DOWNLOAD=false`, with ffmpeg and ffprobe provided at
  `FFMPEG_PATH` / `FFPROBE_PATH`;
- `DISABLE_FRIBB_ANIME_SYNC=true`;
- `DISABLE_MUSIC_ARTWORK_ENRICHMENT=true` before adding a music library;
- `SONIC_MODEL_FP` if you run the sonic sidecar;
- `FEATURE_PUSH_NOTIFICATIONS=false`, unless you use your own Apple key.

The licence call to `lumastra.org` has no switch; when it can't get through, the
install keeps its current key and then falls back to the free tier, as described
[above](#lumastraorgapilicenserefresh-licence-renewal).

## Where this is shown in the app

Admin → System → Instance carries a short version of this inventory under
"Third-party services & data flows" and links here. The setting descriptions in
Admin → Settings say, per switch, what turning it on sends.

## Next

- [Client diagnostics](/developers/client-diagnostics/)
- [Configuration](/guides/configuration/)
- [Authentication](/guides/authentication/)
