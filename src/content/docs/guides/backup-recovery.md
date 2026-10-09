---
title: Backup & recovery
description: What to back up (and what's safe to skip), how to restore, and the one key that, if lost, can't be recovered.
---

Lumastra keeps everything important in **PostgreSQL** (the source of truth) plus a
small set of secrets. Back those up and you can rebuild a deployment from scratch;
caches, queues and generated thumbnails are all regenerable. You'll need shell or
volume access to your Postgres instance and the `config` volume.

## What to back up

| Item                          | Where it lives                                   | Criticality                          |
| ------------------------------ | --------------------------------------------------- | --------------------------------------- |
| **PostgreSQL database**       | Postgres data volume / server                    | **Critical**                         |
| **`LUMASTRA_MASTER_KEY`**     | your `.env` **or** `/config/master.key`          | **Critical: store separately**       |
| **Secrets / env**             | `.env` (master key, `JWT_SECRET`, passwords, API keys) | **Critical**                    |
| **`/config` volume**          | admin `settings.json`, custom artwork, the master key (if auto-generated) | **Recommended** |
| Image cache (`/app/.cache`)   | TMDB/Jellyfin art, avatars                        | Skip: regenerable                    |
| Valkey data                   | cache + task queues                               | Skip: rebuilt from Postgres          |
| Trickplay tiles / thumbnails  | inside `/config` (regenerable by re-running tasks) | Skip: regenerable                   |
| ffmpeg binary (`/config/bin`) | re-fetched on every boot                          | Skip: regenerable                    |

## Critical: the database

Postgres holds your media index, users, watch state, playlists, ratings, AI
embeddings (pgvector is just an extension, included in a normal dump), and task
history. Back it up with `pg_dump`:

```bash
pg_dump -U lumastra -d lumastra --no-owner --no-acl \
  --exclude-table-data=oauth_refresh_tokens \
  --exclude-table-data=hls_playback_tokens \
  --exclude-table-data=oauth_device_codes \
  -F c -f /backups/lumastra-$(date +%F).dump
```

The excluded tables hold short-lived tokens that clients re-mint automatically. A
volume snapshot of the Postgres data directory works too.

Lumastra has no built-in backup scheduler. Run `pg_dump` on a recurring schedule
yourself: a host-level cron entry (e.g. `0 2 * * * pg_dump ... >> /var/log/lumastra-backup.log 2>&1`),
a backup tool that wraps Postgres (WAL-G, pgBackRest, Velero on Kubernetes), or your
cloud provider's volume/database snapshots. A reasonable default is daily backups with
7-day retention, plus longer-retention weekly backups if you need a compliance or
disaster-recovery archive. If you need to restore to an arbitrary second rather than
the last nightly dump, add point-in-time recovery (PITR) via WAL archiving.

:::caution[Dumps are confidential]
A dump contains your data and some plaintext credentials (e.g. Subsonic client
passwords, which the protocol requires). Personal access tokens, service tokens, and
OAuth refresh tokens are stored as irreversible SHA-256 hashes, not plaintext.
Encrypted columns (plugin/integration secrets) are AES-256-GCM ciphertext, safe only
while your master key is. Store dumps somewhere private, restrict access to
database admins, and consider encrypting the dump file itself (e.g. `gpg --encrypt`).
Lumastra doesn't encrypt backups at rest for you.
:::

## Critical: the master key

`LUMASTRA_MASTER_KEY` encrypts your stored secrets and (when `JWT_SECRET` is unset)
derives your session-signing key. Back it up separately from the database. See
[Rotating the master key](/guides/master-key-rotation/) for what it protects, where it
lives, and how multi-replica installs must keep it in sync.

:::tip[Auditing access]
If you need to track who touched encrypted secrets, enable PostgreSQL audit logging
(e.g. the `pg_audit` extension, logging `FUNCTION` calls) rather than relying on
application logs alone.
:::

## Critical: secrets / env

Back up the whole `.env` (or your secrets-manager export):

| Variable | If lost / changed |
| -------- | ------------------ |
| `LUMASTRA_MASTER_KEY` | Stored secrets become unreadable (above) |
| `JWT_SECRET` | All current access tokens are invalidated; clients silently refresh and continue. (If unset, it's derived from the master key.) |
| `DATABASE_PASSWORD` / `CACHE_PASSWORD` | The app can't connect |
| Provider API keys | Metadata/AI features fail until re-entered (re-obtainable from the provider) |

Your identity provider's own client secret (forward auth or OIDC) isn't stored by
Lumastra. Rotate it per that provider's own docs; it's outside this guide's scope.

Running Docker Swarm or Kubernetes? Prefer native secret objects (Swarm secrets,
Kubernetes `Secret` resources) over plain environment variables for
`LUMASTRA_MASTER_KEY` and friends. The Helm chart reads every secret from a Secret you
create and never generates one. See [Deploy on
Kubernetes](/guides/deploy-kubernetes/).

## Recommended: the `/config` volume

`/config` holds your admin **`settings.json`** (the config you set in the admin UI
that *isn't* in env, so it's not recoverable from anywhere else), plus the
auto-generated master key (above) and a few folders of **generated data**. Back up the
whole volume to capture all of it, e.g.:

```bash
docker run --rm -v lumastra_config:/config -v "$PWD":/backup alpine \
  tar czf /backup/config-$(date +%F).tar.gz -C / config
```

The volume name is `<project>_config`, where the project is the folder that holds your
`docker-compose.yml` (`lumastra` if you followed the quick start). `docker volume ls`
shows the exact name.

### What's inside `/config`

:::note[Text metadata is in the database]
Titles, descriptions, cast, ratings, watch state, and the AI embeddings are all in
**PostgreSQL** (covered by your database backup). The folders below hold the *binary
by-products* (images and pre-computed files), not the metadata itself.
:::

| Path | What it is | Regenerate by |
| ---- | ---------- | -------------- |
| `settings.json` | Admin-UI config not set via env | **Not regenerable**: keep it |
| `master.key` | Auto-generated master key (if not in env) | **Not regenerable**: keep it |
| `.metadata/<id>/` | Item artwork, provider-pulled **and** admin-uploaded | Provider art: re-run metadata sync / **Match Local Artwork**. **Admin-uploaded art: not regenerable** |
| `image-sync/` | ffmpeg-extracted episode thumbnails | Re-run the **Match Local Artwork** task |
| `trickplay/` | Trickplay scrub sprites | Re-run **Generate Trickplay Images** (CPU/time-heavy for large libraries) |
| `cache/music-transcode/` | Transcoded music | Regenerated on demand |
| `bin/` | The ffmpeg / ffprobe binary | Re-downloaded on boot |

So the only truly irreplaceable things in `/config` are `settings.json`, the
`master.key` (if it lives here), and any custom artwork you uploaded yourself.
Everything else regenerates, but backing up the whole volume saves you from
re-extracting thumbnails and re-building trickplay across your entire library after a
restore, which can take a while.

:::note
This assumes the default artwork location (`METADATA_STORAGE_LOCATION=central`, in
`/config`). If you set it to store artwork **alongside** your media files instead, that
artwork lives with the media, not here.
:::

## What you can skip entirely

These live outside `/config` and rebuild themselves; no backup needed:

- **Image cache** (`/app/.cache`): provider posters/backdrops and avatars, re-fetched
  from TMDB/Jellyfin on demand.
- **Valkey**: cache plus the task queues. On restart the task system re-enqueues work
  from Postgres (the source of truth). Jobs that were mid-run when Valkey was lost
  simply re-run.

(The generated files *inside* `/config` (thumbnails, trickplay, transcode cache) also
regenerate; see the table above for what that costs.)

## Restore

1. Provision a fresh Postgres (`pgvector/pgvector:pg18`).
2. Restore the dump:
   ```bash
   pg_restore -U lumastra -d lumastra --clean --if-exists /backups/lumastra-2026-05-20.dump
   ```
3. Restore the *same* `LUMASTRA_MASTER_KEY` and env. This is the step people miss:
   a restored database with a different (or missing) master key starts fine but throws
   decrypt errors on every stored secret. There is a way back if you still have the
   key that was live when the backup was taken: put it back (env or `/config/master.key`)
   and restart, and every secret decrypts again. See [Rotating the master
   key](/guides/master-key-rotation/#if-something-was-missed) for the same recovery path
   used when a rotation is interrupted. Only a key that's lost, with no copy
   anywhere, leaves those secrets unrecoverable.
4. Restore the `/config` volume (at minimum `settings.json` and `master.key`).
5. Start the stack. Migrations run automatically on boot, the ffmpeg binary
   re-downloads if missing, and the task system heals from Postgres. No Valkey restore
   needed.

## Key rotation

### `JWT_SECRET`

Rotating it invalidates all in-flight access tokens immediately. There's no key-ID
header yet, so old and new signatures can't coexist and there's no graceful rollover
window. Refresh tokens (database-backed, not JWT-signed) survive, so clients silently
call `POST /oauth/token` with `grant_type=refresh_token` and keep working.

1. Generate a new key: `openssl rand -hex 32`
2. Update `JWT_SECRET` in your env.
3. Restart the app.

### `LUMASTRA_MASTER_KEY`

Don't rotate this by hand. Lumastra re-encrypts every store sealed with the master
key (plugin secrets, `settings.json` sensitive values, Subsonic tokens, webhook
secrets, Jellyfin client passwords, and Live TV credentials) in one operation from
**Admin → Settings → Secrets → Rotate Master Key** (or `POST
/api/v1/admin/secrets/rotate`), re-sealing everything under the new key before it
goes into service. Nothing needs to be re-entered afterward except the two things
rotation can't touch by design: login sessions (if `JWT_SECRET` is unset, set it first
to skip signing everyone out) and the Jellyfin-compat server identity (paired clients
re-pair once). The manual delete-and-re-enter path described in older docs is not the
supported procedure. See [Rotating the master key](/guides/master-key-rotation/) for
the full step-by-step, including how to read the rotation result and what to do if a
store is reported as `notRotated`.

### Database password

1. Update `DATABASE_PASSWORD` (or your `DATABASE_URL`) in the env.
2. Change it in Postgres itself:
   ```sql
   ALTER USER lumastra WITH PASSWORD 'newpassword';
   ```
3. Restart the app and any worker containers.

No downtime is required. The app reconnects on its next query or on restart.

## Next

- [Rotating the master key](/guides/master-key-rotation/)
- [Deploy with Docker](/guides/deploy-docker/)
- [Deploy on Kubernetes](/guides/deploy-kubernetes/)
- [Configuration](/guides/configuration/)
