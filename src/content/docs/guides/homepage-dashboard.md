---
title: Homepage dashboard
description: >
  Show Lumastra's sessions, cluster nodes, running tasks, health and library on a
  Homepage (gethomepage.dev) dashboard with the customapi widget.
---

[Homepage](https://gethomepage.dev) is a self-hosted dashboard for your services.
Lumastra provides one read-only endpoint built for Homepage's generic
[`customapi` widget](https://gethomepage.dev/widgets/services/customapi/). You paste a
few tiles into `services.yaml`. You don't need a plugin or a custom Homepage build.

The endpoint returns:

- **Sessions**: who is playing what, the playback method, bitrate and progress.
- **Cluster**: each node with its role, CPU, memory and uptime.
- **Tasks**: running task runs with their current stage and progress, plus queue and
  24-hour failure counts.
- **Health**: overall status and an alert for every component that isn't healthy.
- **Library**: item counts per type and the most recently added titles.

:::caution[Who can see your dashboard]
The **Now playing** tile shows every user's name and what they're watching. Anyone who
can open your Homepage page sees it. Put Homepage behind authentication, or leave that
tile out.
:::

:::note[Beta]
`GET /api/v1/integrations/homepage` is marked beta in the API. Field names may still
change before 1.0. Any change will be listed in the changelog.
:::

## 1. Create a token

Before you start, turn on the `FEATURE_DEVICE_AUTH` feature flag. Service tokens
require it (see [Authentication](/guides/authentication/#service-tokens)).

Create a dedicated integration token. It can read the integration endpoints and nothing
else, so a leaked Homepage configuration exposes only the summary:

1. Open **Admin → Users → API tokens** (`/admin/users/api-tokens`), and create a
   **service token**.
2. **Scope:** `Integrations (read-only)` (`integrations:read`).
3. Optionally, tick only `/api/v1/integrations/homepage` under **Endpoints**.
4. Optionally, restrict **Allowed IPs** to the address Homepage connects from (exact
   addresses, no ranges).
5. Copy the `svc_…` value. Lumastra shows it only once.

The token works only while the admin who created it is still an admin.

You can revoke the token at any time without affecting anything else.

Store the token as a Homepage secret, not in `services.yaml`. Homepage substitutes
environment variables whose names start with `HOMEPAGE_VAR_`:

```bash
HOMEPAGE_VAR_LUMASTRA_TOKEN=svc_...
```

## 2. Add the tiles

Replace `https://lumastra.example.com` with your server's URL. The Homepage server
fetches widget data, not your browser. So if Homepage runs on the same Docker network
or Kubernetes cluster as Lumastra, use Lumastra's internal address in `url`.

The **Now playing** and **Tasks** tiles are lists. When nothing is playing or running,
they show an empty tile, not an error.

```yaml
- Lumastra:
    - Lumastra:
        icon: https://lumastra.example.com/icon-192.png
        href: https://lumastra.example.com
        widget:
          type: customapi
          url: https://lumastra.example.com/api/v1/integrations/homepage
          headers:
            Authorization: Bearer {{HOMEPAGE_VAR_LUMASTRA_TOKEN}}
          mappings:
            - field: summary.streams
              label: Streams
              format: number
            - field: summary.transcodes
              label: Transcodes
              format: number
            - field: summary.bandwidthMbps
              label: Mbps
              format: float
            - field: summary.health
              label: Health

    - Now playing:
        icon: mdi-play-circle
        widget:
          type: customapi
          url: https://lumastra.example.com/api/v1/integrations/homepage
          headers:
            Authorization: Bearer {{HOMEPAGE_VAR_LUMASTRA_TOKEN}}
          display: dynamic-list
          mappings:
            items: sessions
            name: name
            label: label
            limit: 8

    - Cluster:
        icon: mdi-server
        widget:
          type: customapi
          url: https://lumastra.example.com/api/v1/integrations/homepage
          headers:
            Authorization: Bearer {{HOMEPAGE_VAR_LUMASTRA_TOKEN}}
          display: dynamic-list
          mappings:
            items: nodes
            name: name
            label: label

    - Tasks:
        icon: mdi-progress-clock
        widget:
          type: customapi
          url: https://lumastra.example.com/api/v1/integrations/homepage
          headers:
            Authorization: Bearer {{HOMEPAGE_VAR_LUMASTRA_TOKEN}}
          display: dynamic-list
          mappings:
            items: tasks
            name: name
            label: label
```

Reload Homepage. The tiles show live values within 10 seconds. If a tile shows an
error, check the token: a `401` means Homepage sent no valid token, and a `403` means
the token isn't an admin token or its path prefix doesn't match.

### Optional tiles

Build each of these like the tiles above (same `type`, `url` and `headers`), and use
the `display` and `mappings` shown.

**Library counts:**

```yaml
          mappings:
            - field: library.movies
              label: Movies
              format: number
            - field: library.series
              label: Series
              format: number
            - field: library.episodes
              label: Episodes
              format: number
            - field: library.tracks
              label: Tracks
              format: number
```

**Recently added.** `addedAt` is a timestamp, so Homepage renders it as "2 hours ago":

```yaml
          display: dynamic-list
          mappings:
            items: recentlyAdded
            name: name
            label: addedAt
            format: relativeDate
```

**Alerts.** The list is empty while everything is healthy:

```yaml
          display: dynamic-list
          mappings:
            items: alerts
            name: name
            label: label
```

## How often it updates

Homepage polls each tile every 10 seconds. Lumastra caches the summary for 5 seconds,
and library counts and recently added titles for 5 minutes. Several tiles on one
dashboard therefore cost the server one summary rebuild, not one per tile.

## Behind forward auth

You only need this section if Lumastra sits behind a forward-auth proxy such as
Authentik or oauth2-proxy.

The endpoint authenticates with the `Authorization: Bearer` header alone, so the proxy
must pass bearer requests under `/api/v1/` through to Lumastra. The Helm chart's
router does this by default (`forwardAuth.apiV1Passthrough: true`). To skip the
forward-auth round trip on every poll, add `/api/v1/integrations/homepage` to
`forwardAuth.bypassPaths`:

```yaml
router:
  forwardAuth:
    bypassPaths: [/j/, /subsonic/, /oauth/, /api/v1/integrations/homepage]
```

## Field reference

| Field | Meaning |
| --- | --- |
| `summary.streams` / `transcodes` / `directPlays` | Active sessions, how many are transcoded, how many aren't |
| `summary.users` | Distinct users playing right now |
| `summary.bandwidthMbps` | Aggregate bandwidth being served |
| `summary.nodesUp` / `nodesExpected` | Nodes with a live heartbeat / nodes expected online |
| `summary.tasksRunning` / `tasksQueued` / `tasksFailed24h` | Active runs, queued jobs, runs that failed in the last 24 hours |
| `summary.health` | `ok`, `degraded` (something needs attention) or `down` (database or Valkey failing) |
| `summary.alerts` | Number of alerts (the `alerts` list shows at most 10) |
| `summary.version` | Server version |
| `sessions`, `nodes`, `tasks`, `alerts` | Up to 10 rows each, `{ name, label }` |
| `library.*` | Counts of movies, series, episodes, artists, albums, tracks and audiobooks that have files |
| `recentlyAdded` | Up to 10 newest movies, series and audiobooks, `{ name, addedAt }` |

Alerts cover unhealthy components, missing cluster nodes and paused task queues. If a
part of the summary can't be read (for example, Valkey is down, so the cluster nodes
are unknown), that part comes back empty, and an alert named `homepage:<section>`
says why. The response itself still succeeds.

The full schema is in the [API reference](/developers/api/) under **Integrations**.
