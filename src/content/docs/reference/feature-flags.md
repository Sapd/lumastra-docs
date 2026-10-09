---
title: FEATURE_* flags
description: Every FEATURE_* flag Lumastra ships, its default, and what it gates.
sidebar:
  order: 5
---

Every `FEATURE_*` flag resolves through the config layer's live precedence chain
(admin-set value → environment variable → built-in default). It's read fresh on each
access, not cached once at boot; some flags are documented as safe to flip with no
restart (`FEATURE_PUBLIC_SHOWCASE` is one example). Without a feature-specific note
saying otherwise, treat a flag change as needing a container restart, since no
admin-UI control writes most of these flags live. Most also appear as a read-only,
lock-icon toggle on the matching Settings page for visibility, but can't be edited
there; a small number are infrastructure-only and have no admin-UI surface at all
(noted below).

This is a reference list, not a how-to. For the concepts and setup behind any one
feature, follow the linked guide.

## Core & library

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_LIVETV` | `false` | The Live TV section (M3U/XMLTV sources plus the stream proxy). See [Administering Lumastra](/guides/administration/#live-tv-and-radio). |
| `FEATURE_AUDIOBOOKS` | `true` | AudiobookShelf integration. |
| `FEATURE_KAVITA` | `true` | Books/manga (Kavita) integration. |
| `FEATURE_CALENDAR` | `true` | The release calendar widget. |
| `FEATURE_SHOW_UNAIRED_EPISODES` | `true` | Listing episodes that haven't aired yet. |
| `FEATURE_SHOW_MISSING_EPISODES` | `true` | Listing episodes not yet in your library. |

## AI

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_AI_RECOMMENDATIONS` | `true` | Embedding-based recommendations and Quick Picks. |
| `FEATURE_AI_ASSISTANT` | `true` | The RAG-powered chat assistant. A source-available supporter module, free during early access. See [Editions & Licensing](/guides/licensing/). |
| `FEATURE_ASSISTANT_TOOLS` | `true` | Agentic tool-calling for the assistant instead of single-shot retrieval; falls back automatically for models without tool-calling. |
| `FEATURE_ASSISTANT_WRITES` | `false` | Letting the assistant change a user's own data (watchlist, ratings, watched state, requests) on request. |
| `FEATURE_ASSISTANT_SHARED_HISTORY` | `false` | Letting the assistant use another consenting user's watch history for joint recommendations. |
| `FEATURE_ASSISTANT_INCLUDE_REQUESTABLE` | `false` | Including not-yet-in-library (Seerr) titles in assistant recommendation cards. |
| `FEATURE_TWO_PHASE_ANN` | `true` | The HNSW-accelerated two-phase similarity search path for recommendations. Env-only, no admin-UI surface; falls back to a full scan automatically on error. |

## Playback and streaming

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_JELLYFIN_SYNC` | `true` | Background watch-state sync with a Jellyfin server (distinct from the `/j` client API below). |
| `FEATURE_JELLYFIN_COMPAT` | `true` | The `/j` Jellyfin-compatible client API. Serves Lumastra's own catalog; no Jellyfin server required. More than one concurrent `/j` stream per server is a source-available supporter module, free during early access. See [Editions & Licensing](/guides/licensing/). |
| `FEATURE_SUBSONIC_COMPAT` | `false` | The OpenSubsonic-compatible API. Per-client credentials are stored recoverable (plaintext at rest) by protocol design. See the self-check note in [Administration operations](/guides/administration-operations/#health-and-self-check-findings). |
| `FEATURE_MEDIA_DOWNLOAD` | `false` | Downloading the original, untranscoded file. |
| `FEATURE_DOWNLOAD_RENDITIONS` | `false` | Offline download renditions at a chosen quality. |
| `FEATURE_PLAYER_AUTO_QUALITY` | `false` | Automatic quality switching in the player. |
| `FEATURE_WATCH_TOGETHER` | `true` | Watch Together. |
| `FEATURE_YOUTUBE_HERO` | `true` | YouTube trailers on the home hero. |
| `FEATURE_YOUTUBE_MODALS` | `true` | YouTube trailers in modals. |
| `FEATURE_MEDIA_HOVER_POPUP` | `true` | The hover-preview popup on media cards. |
| `FEATURE_MEDIA_HOVER_POPUP_TRAILERS` | `false` | YouTube trailers inside the hover popup. |
| `FEATURE_MEDIA_HOVER_VIDEO_PREVIEW` | `false` | Video (not just image) previews in the hover popup. |
| `FEATURE_MEDIA_HOVER_VIDEO_PREVIEW_LIVETV` | `false` | Video previews for Live TV channels specifically. |
| `FEATURE_FEATURED_PICK_VIDEO` | `false` | Video preview on the featured-pick hero slot. |
| `FEATURE_TOPSHELF_PREVIEWS` | `false` | tvOS Top Shelf previews. |

## Music

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_MUSIC_TRANSCODE` | `true` | Music transcoding. |
| `FEATURE_MUSIC_CLUSTERING` | `true` | Multi-mode taste clustering for Quick Picks. |
| `FEATURE_MUSIC_CLUSTERS` | `false` | Sonic Collections (KMeans auto-playlists). |
| `FEATURE_MUSIC_FIRST` | `false` | Music-first mode. |
| `FEATURE_MUSIC_SONIC` | `false` | Sonic embeddings (CLAP-based). |
| `FEATURE_MUSIC_SONIC_QUEUE` | `false` | Sonic smart queue. |
| `FEATURE_MUSIC_SONIC_TASTE` | `false` | Sonic taste profile (personalised Quick Picks). |
| `FEATURE_MUSIC_TEXT_SOUND` | `false` | Text-to-sound search. |
| `FEATURE_MUSIC_MAP` | `false` | Music map (UMAP projection). |
| `FEATURE_MUSIC_ALCHEMY` | `false` | Music Alchemy. |
| `FEATURE_AUTO_LYRICS` | `true` | Automatic lyrics fetching. |
| `FEATURE_MUSIC_LYRICS_FETCH` | `false` | Manual on-demand lyrics fetch action. |
| `FEATURE_MUSIC_LYRICS_SEARCH` | `false` | Lyrics search. |
| `FEATURE_SAVE_LYRICS_TO_DISK` | `false` | Writing fetched lyrics to a sidecar file next to the track. |

## Social and personalization

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_SOCIAL` | `true` | Social features (activity, presence). |
| `FEATURE_SOCIAL_REVIEWS` | `true` | Community reviews. |
| `FEATURE_COMMENTS` | `false` | Comments and emoji reactions on media, playlists, and people. No moderation queue: a comment is removable only by its author or an operator. Leave it off unless your users know each other. |
| `FEATURE_SESSIONS` | `true` | The Streaming Sessions widget. |
| `FEATURE_SESSIONS_PUBLIC` | `true` | Other users seeing your active sessions (subject to Sharing & privacy settings). |
| `FEATURE_SESSIONS_DEVICE_INFO_PUBLIC` | `false` | Including device info in the public session view. |
| `FEATURE_PLAYLISTS` | `true` | Playlists. |
| `FEATURE_PLAYLIST_CHAT` | `true` | Chat on a shared playlist. |
| `FEATURE_MEDIA_ANNOTATIONS` | `false` | Per-item annotations. |
| `FEATURE_MEDIA_CHAT` | `false` | Chat on a media item's page. |
| `FEATURE_PERSONAL_STATS` | `true` | Personal watch/listen statistics. |
| `FEATURE_TRENDING` | `true` | The trending widget. |
| `FEATURE_FORYOU_SECTION_RANKER` | `false` | Engagement-based ranking of For You home sections. |
| `FEATURE_FORYOU_ABANDONMENT_DEMOTE` | `false` | Demoting recommendations a user repeatedly abandons early. |
| `FEATURE_REQUEST_MODAL` | `false` | The in-app Seerr request modal. |
| `FEATURE_QUICK_CONNECT` | `true` | Quick Connect pairing. |

## Notifications and diagnostics

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_USER_NOTIFICATION_WEBHOOKS` | `false` | Per-user notification webhooks (distinct from the admin task-system webhooks in [Administration operations](/guides/administration-operations/#webhooks)). |
| `FEATURE_PUSH_NOTIFICATIONS` | `true` | iOS push notifications via the Lumastra relay. Works without setup; see [iOS push notifications](/guides/push-notifications/). |
| `FEATURE_CLIENT_DIAGNOSTICS` | `true` | Automatic client diagnostic reports. |
| `FEATURE_CLIENT_DIAGNOSTICS_LOG_TAIL` | `true` | Including a log tail in automatic client reports. |
| `FEATURE_CLIENT_LOG_BUNDLES` | `true` | Downloadable client log bundles. |
| `FEATURE_AUDIT_TAMPER_EVIDENCE` | `false` | Tamper-evidence hashing on the audit log. |
| `FEATURE_AVATAR_UPLOAD` | `true` | User avatar upload. |
| `FEATURE_GRAVATAR` | `false` | Falling back to Gravatar for users without an uploaded avatar. |

## UI and appearance

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_SIDEBAR` | `true` | Sidebar navigation (vs. mega-menu). |
| `FEATURE_DOCK_TOGGLE` | `true` | The dock-vs-sidebar toggle itself, dependent on `FEATURE_SIDEBAR`. |
| `FEATURE_STARS_BACKGROUND` | `true` | The animated starfield background. |

Custom CSS/JS injection, custom themes, and the default theme are configured (not
feature-flagged) at `/admin/settings/appearance` via `APPEARANCE_CUSTOM_CSS`,
`APPEARANCE_CUSTOM_JS`, `APPEARANCE_CUSTOM_THEMES`, and `APPEARANCE_DEFAULT_THEME`
(default `warp`).

## Programmatic access

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_DEVICE_AUTH` | `true` | The Public API: the `/api/v1/*` token surface, the OAuth2 Device Authorization flow (`/oauth/*`) the Lumastra iPhone/iPad/Apple TV apps sign in with, and service-token management. Needs `JWT_SECRET` (derived from `LUMASTRA_MASTER_KEY` when unset). Offered as a switch in the setup wizard; editable later under **Settings → Access → Public API & Device Auth**. See [Authentication](/guides/authentication/). |
| `FEATURE_USER_PATS` | `false` | Self-service personal access tokens at `/user/tokens`. Needs `JWT_SECRET`. |

:::caution[`FEATURE_DEVICE_AUTH` is on by default since v0.1]
It used to default to `false`. An install that never set it has the Public API **on**
after upgrading (**including one where an admin switched it off in Settings**,
because switching to the old default stored nothing): `/api/v1/*` and `/oauth/*`
answer, and your reverse proxy decides whether they are reachable from outside. To
keep it off, set `FEATURE_DEVICE_AUTH=false` in the environment, or switch it off
again under **Settings → Access → Public API & Device Auth** (that now saves an
explicit `false`).
An explicit `false` in the environment or in `settings.json` is unaffected.
:::

## Enterprise

| Flag | Default | Gates |
| ---- | ------- | ----- |
| `FEATURE_ASSESSMENT` | `false` | The native quiz & certificate (LMS assessment) module. |
| `FEATURE_TRAINING_ASSIGNMENTS` | `false` | Training assignments. |
| `FEATURE_PUBLIC_SHOWCASE` | `false` | The public showcase surface. See [Administering Lumastra](/guides/administration/#public-showcase-enterprise). |

## Internal / infrastructure-only

These have no admin-UI surface and are meant for advanced operators debugging a rollout,
not everyday configuration:

| Flag | Default | Purpose |
| ---- | ------- | ------- |
| `FEATURE_PER_TASK_QUEUES` | `true` | Per-task queue isolation in the task runner, rather than one shared in-process queue. |
| `FEATURE_PIPELINE_EVENT_OUTBOX` | `true` | Routing pipeline invalidation through the durable event outbox. |
| `FEATURE_PLUGIN_WORKER_ISOLATION` | `true` | Running external plugin tasks in an isolated worker rather than in-process. |

## Next

- [Administering Lumastra](/guides/administration/)
- [Administration: task and webhook operations](/guides/administration-operations/)
- [Editions & Licensing](/guides/licensing/)
