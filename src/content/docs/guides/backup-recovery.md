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

## Docker Compose: backup and restore step by step

These commands match the [example compose file](/start/quick-start/#1-get-the-example-files):
the services are `lumastra` (web), `lumastra-worker`, `lumastra-postgres`, `lumastra-valkey`
and `lumastra-valkey-cache`, and the config volume is `config`. If you renamed anything,
adjust the names. Run everything from the folder that holds your `docker-compose.yml`.

A bare `pg_dump` on the host usually isn't installed on a Docker-only machine. Run it
inside the PostgreSQL container instead.

### Back up

1. Create a private folder for the backup. It will hold secrets.

   ```bash
   mkdir -p ~/lumastra-backup && chmod 700 ~/lumastra-backup
   ```

2. Stop web and worker so the database and the config volume are consistent. PostgreSQL
   keeps running.

   ```bash
   docker compose stop lumastra lumastra-worker
   ```

3. Dump the database. The container reads the password from its own environment.

   ```bash
   docker compose exec -T lumastra-postgres pg_dump -U lumastra -d lumastra \
     --no-owner --no-acl \
     --exclude-table-data=oauth_refresh_tokens \
     --exclude-table-data=hls_playback_tokens \
     --exclude-table-data=oauth_device_codes \
     -F c > ~/lumastra-backup/lumastra-$(date +%F).dump
   ```

   Check that the dump is readable: `docker compose exec -T lumastra-postgres pg_restore -l < ~/lumastra-backup/lumastra-$(date +%F).dump | head`.

4. Archive the config volume. The archive is created as root, so hand it back to your
   user. Replace `lumastra_config` with your volume name from `docker volume ls`.

   ```bash
   docker run --rm -v lumastra_config:/config -v ~/lumastra-backup:/backup alpine \
     tar czf /backup/config-$(date +%F).tar.gz -C / config
   sudo chown "$(id -u):$(id -g)" ~/lumastra-backup/config-*.tar.gz
   ```

5. Copy `.env` and `docker-compose.yml` into the backup folder, and store
   `LUMASTRA_MASTER_KEY` somewhere else as well, such as a password manager. A backup
   that sits next to the key it needs is not a safe backup.

   ```bash
   cp .env docker-compose.yml ~/lumastra-backup/ && chmod 600 ~/lumastra-backup/.env
   ```

6. Start web and worker again.

   ```bash
   docker compose start lumastra lumastra-worker
   ```

Then move the folder off the machine. Backups on the same disk don't protect you from
losing the disk.

### Restore on a fresh Docker host

1. Put `docker-compose.yml` and the backed-up `.env` into the install folder. Use the
   **same** `LUMASTRA_MASTER_KEY` and `DATABASE_PASSWORD`.
2. Create the volumes and start only PostgreSQL. Wait until it is healthy.

   ```bash
   docker compose up -d --wait lumastra-postgres
   ```

3. Restore the database. The `--clean --if-exists` flags make the command safe to repeat.

   ```bash
   docker compose exec -T lumastra-postgres pg_restore -U lumastra -d lumastra \
     --clean --if-exists < ~/lumastra-backup/lumastra-2026-05-20.dump
   ```

4. Restore the config volume while web and worker are still stopped. The files must belong
   to uid 1000, which the app runs as; `tar` keeps the owner stored in the archive when it
   runs as root, as it does here.

   ```bash
   docker run --rm -v lumastra_config:/config -v ~/lumastra-backup:/backup alpine \
     tar xzf /backup/config-2026-05-20.tar.gz -C /
   ```

   If `docker compose` has not created the volume yet, `docker volume create lumastra_config`
   first. Use the name that `docker volume ls` shows for your project.
5. Start everything else. Migrations run on boot, the cache and queue Valkeys start empty,
   and the task system heals from PostgreSQL.

   ```bash
   docker compose up -d
   ```

To restore onto an existing install, stop `lumastra` and `lumastra-worker` first, restore
the database and the config volume, and start them again. Never restore while web or
worker is running.

## Next

- [Rotating the master key](/guides/master-key-rotation/)
- [Deploy with Docker](/guides/deploy-docker/)
- [Deploy on Kubernetes](/guides/deploy-kubernetes/)
- [Configuration](/guides/configuration/)
