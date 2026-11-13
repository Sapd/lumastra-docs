---
title: Quick Start
description: Install Lumastra with Docker Compose in about ten minutes, then open the setup wizard and add your media.
---

Lumastra is a self-hosted media server for movies, series, music and more. You run it on
your own machine and use it in a browser, in the Apple apps, or with Jellyfin and
Subsonic apps. This page installs it with Docker Compose. To use Kubernetes instead, see
[Deploy on Kubernetes](/guides/deploy-kubernetes/).

## What you need

- Docker 24 or newer with Compose 2.20 or newer ([install Docker](https://docs.docker.com/engine/install/)). Then run `sudo usermod -aG docker $USER` and log out and in again, or put `sudo` before each `docker` command.
- 8 GB of RAM (a small library runs on 4 GB) and 20 GB of disk
- An x86-64 CPU from 2011 or newer, or any 64-bit ARM CPU
- Internet access on the first start. Lumastra downloads FFmpeg then.
- A folder with your media

## 1. Get the example files

```bash
mkdir lumastra && cd lumastra
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/Sapd/lumastra/v0.1.4/docker-compose.example.yml
curl -fsSL -o .env https://raw.githubusercontent.com/Sapd/lumastra/v0.1.4/.env.example
sed -i.bak 's|lumastra:stable|lumastra:0.1.4|' docker-compose.yml && rm docker-compose.yml.bak
```

You should now have `docker-compose.yml` and `.env` in the `lumastra` folder. The second
file must be named exactly `.env`.

## 2. Generate secrets

```bash
sed -i.bak \
  -e "s|^DATABASE_PASSWORD=.*|DATABASE_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^CACHE_PASSWORD=.*|CACHE_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^# LUMASTRA_MASTER_KEY=.*|LUMASTRA_MASTER_KEY=$(openssl rand -hex 32)|" \
  .env && rm -f .env.bak && chmod 600 .env
```

Run this once. After the first start, a second run writes a new `DATABASE_PASSWORD` that
the existing database rejects.

Back up the `LUMASTRA_MASTER_KEY` line from `.env` somewhere safe. Without it, stored
API keys cannot be decrypted. See [Backup & recovery](/guides/backup-recovery/).

## 3. Add your media folder

Replace the path, then run the command. It adds the folder to the web and worker
containers, read-only.

```bash
MEDIA="/path/to/your/media"
sed -i.bak "s|# - /path/to/media:/data/media:ro|- $MEDIA:/data/media:ro|" docker-compose.yml && rm docker-compose.yml.bak
grep -n '^ *- .*:/data/media' docker-compose.yml
```

You should see your path on three lines. The third belongs to an optional service that
stays off.

## 4. Start Lumastra

```bash
docker compose up -d
docker compose ps
```

After a minute or two, `lumastra`, `lumastra-worker`, `lumastra-postgres` and both
Valkey containers show `healthy`. Check the app:

```bash
curl http://localhost:3000/api/health
```

You should see `{"status":"pass"}`.

## 5. Create your admin

Open `http://localhost:3000/setup` in a browser on the same machine. No browser on the
server? See "You open Lumastra from another computer" below. Choose **Built-in login**
and pick a username and password. You should now see **Your account is ready**.

The next page is a list of optional settings, with a TMDB API key as one field. The key is
free: see [how to get one](/guides/integrations/). Without it, titles and artwork come from
file names only. Everything else can wait: use **Skip for now**.

## 6. Add your libraries

The library step lists the folders inside your media folder under **Found these
folders**. Tick the ones you want and select the button that reads **Add N libraries and continue**. Lumastra
scans them and your titles appear in the library. Folder layout is in
[Organizing your media](/guides/organizing-media/).

## 7. Put it behind HTTPS

The iPhone, iPad and Apple TV apps only connect over HTTPS. Follow the
[Reverse proxy guide](/guides/reverse-proxy/). Then, before other people use it:

- Set `ORIGIN` to your public address. The reverse proxy guide shows how.
- Back up the database, the `config` volume and your master key. See
  [Backup & recovery](/guides/backup-recovery/).
- Keep PostgreSQL and Valkey off public ports. The example file publishes neither.
- Read [Deploy with Docker](/guides/deploy-docker/) for updates and optional services.

## If something differs

**You open Lumastra from another computer.** Port 3000 listens on the server only. For a
quick test on your network, change `127.0.0.1:3000:3000` to `3000:3000` in
`docker-compose.yml` and run `docker compose up -d`. Sign-in then crosses your network
without encryption.

**`docker compose up` says `required variable DATABASE_PASSWORD is missing`.** The secrets
file is not named `.env`, or you ran the command in another folder.

**You use Windows without WSL.** The `sed` and `openssl` commands do not run, and `curl`
must be `curl.exe`. Make the same edits in an editor. In `.env`, fill in
`DATABASE_PASSWORD` and `CACHE_PASSWORD` with 48 hex characters each, and
`LUMASTRA_MASTER_KEY` with 64 (remove the `# `). Use only digits and the letters a to f.
In `docker-compose.yml`, change `lumastra:stable` to `lumastra:0.1.4` and remove the `# `
before the media path, with a path like `C:/Users/you/Videos`.

**You have more than 4 GB of RAM.** The example file turns on low-RAM mode. Delete its two
`LUMASTRA_LOW_RAM_MODE` lines and restart. See
[Performance tuning](/guides/performance-tuning/).

```bash
sed -i.bak '/LUMASTRA_LOW_RAM_MODE/d' docker-compose.yml && rm docker-compose.yml.bak
docker compose up -d
```

**The containers exit with `Illegal instruction`.** The CPU is too old (before 2011) or a
virtual machine hides its features. In Proxmox or libvirt, set the CPU type to `host`.

**You are on ARM64.** Music BPM and mood analysis, the sonic sidecar and Intel hardware
transcoding are off. See [Known limitations](/reference/known-limitations/#what-is-unavailable-on-arm64).

**The machine has no internet.** See [What Lumastra sends where](/reference/data-flows/)
for the hosts it contacts and for running offline.

**You want audiobooks.** They come from an Audiobookshelf server. Use **Audiobooks from
Audiobookshelf** on the library step. See [Audiobooks](/guides/audiobooks/).

**You prefer an AI assistant to do this.** Give an assistant with shell access this
prompt:

```text wrap
Read https://lumastra.org/install.md and follow it to install Lumastra on this server. Ask me before anything you can't check yourself.
```

**You want to know what each container does.** See the
[architecture overview](/architecture/overview/).
