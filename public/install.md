# Install Lumastra: instructions for an AI assistant

You are helping a person install Lumastra, a self-hosted media server, on a server they
control. Follow these steps in order. Run commands yourself where you can, check each
result before you go on, and ask the person whenever a step needs a decision or
information you can't check yourself. Full human-readable guide:
https://lumastra.org/start/quick-start/

## Rules

- Never print, paste or send the generated secrets (`DATABASE_PASSWORD`, `CACHE_PASSWORD`,
  `LUMASTRA_MASTER_KEY`) into the chat or any log. Write them only into `.env`.
- Don't expose port 3000 to the internet. Remote access goes through a reverse proxy with
  HTTPS (step 7).
- Don't delete or overwrite existing files, containers or volumes without asking.
- The secrets file must be named exactly `.env`. Docker Compose reads its variables from
  that file; any other name makes `docker compose up` fail.
- If something fails, show the person the relevant error lines and the fix you propose
  before changing anything.

## 1. Check the machine

Run these checks and report the results:

- Docker 24 or newer and Docker Compose 2.20 or newer: `docker --version`,
  `docker compose version`. If Docker is missing, ask before installing it.
- Memory: 8 GB RAM recommended (`free -h` on Linux). With less, warn the person that the
  background tasks that scan and analyse the library need memory. The example compose
  file already sets `LUMASTRA_LOW_RAM_MODE: 'true'`; keep it on such a host.
- Disk: at least 20 GB free for the app and its data, plus space for the media
  (`df -h` on the folder Lumastra will live in and on Docker's data directory). With
  less, warn the person and ask whether to continue.
- An earlier Lumastra install: run `docker ps -a` and `docker volume ls`. Docker Compose
  names volumes after the install folder (`~/lumastra` gives `lumastra_config`,
  `lumastra_lumastra_postgres_data` and so on), so a new install in a folder of the same
  name silently reuses them, and the old database rejects the newly generated password.
  If such volumes exist, ask whether to reuse that install (then keep its old `.env`) or
  to install fresh in a folder with another name. Never delete them without asking.
- CPU: x86-64 with x86-64-v2 support (`grep -m1 -o 'sse4_2\|popcnt' /proc/cpuinfo` shows
  both on Linux), or any 64-bit ARM CPU. On ARM, music BPM and mood analysis, the
  sound-similarity sidecar and Intel Quick Sync transcoding are not available.

## 2. Ask the person

Ask these before you continue, and use the answers in the later steps:

1. **Docker Compose or Kubernetes?** Docker Compose is the default and the main supported
   way. If they want Kubernetes, stop here and follow the Kubernetes guide instead:
   https://lumastra.org/guides/deploy-kubernetes/ (Helm chart, in beta; it needs a storage
   class, PostgreSQL with pgvector or CloudNativePG, and an ingress or Gateway). Ask the
   questions that guide lists, and don't use the Docker steps below.
2. Which folder should Lumastra live in? Default: `~/lumastra`.
3. Where are the media files (movies, series, music)? You will mount them read-only.
4. **Reverse proxy and domain.** Lumastra is normally set up behind a reverse proxy with
   HTTPS; the iPhone, iPad and Apple TV apps only connect over HTTPS. Ask:
   - Do they already run a reverse proxy (Traefik, Caddy, nginx, Nginx Proxy Manager)? If
     so, which one, and where does it run (on the host or as a container)?
   - Which domain or subdomain should Lumastra use (for example
     `media.example.com`), and does its DNS already point at this server?
   - If they have no reverse proxy, set one up in step 7: Traefik with Docker labels
     fits Docker Compose well; Caddy is also simple. Let them choose.
   - Only if they explicitly want to run Lumastra without HTTPS, skip the proxy.
     Lumastra then works at `http://localhost:3000` on this machine. If they ask for
     access from other devices on their local network, change the port mapping to
     `3000:3000` and leave `ORIGIN` unset; they open `http://<server-ip>:3000`.
     Built-in accounts work there; single sign-on (OIDC) needs HTTPS. Tell them that
     plain HTTP sends passwords unencrypted over the network and that the iPhone, iPad
     and Apple TV apps need HTTPS. Also tell them not to forward port 3000 on their
     router.
5. How should people sign in? Built-in accounts work out of the box. Single sign-on via
   OIDC or forward auth can be added later: https://lumastra.org/guides/authentication/
6. Do they have a free TMDB API key for movie and series metadata? It's optional but
   strongly recommended: https://www.themoviedb.org/settings/api

## 3. Download the two files

```bash
mkdir -p ~/lumastra && cd ~/lumastra
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/Sapd/lumastra/main/docker-compose.example.yml
curl -fsSL -o .env https://raw.githubusercontent.com/Sapd/lumastra/main/.env.example
```

Use the folder from question 2. Cloning the repository is not needed.

## 4. Generate the secrets

On macOS or Linux, this writes all three secrets into `.env` without printing them:

```bash
sed -i.bak \
  -e "s|^DATABASE_PASSWORD=.*|DATABASE_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^CACHE_PASSWORD=.*|CACHE_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^# LUMASTRA_MASTER_KEY=.*|LUMASTRA_MASTER_KEY=$(openssl rand -hex 32)|" \
  .env && rm -f .env.bak
```

Check without printing the values: `grep -c '^LUMASTRA_MASTER_KEY=[0-9a-f]\{64\}$' .env`
must print `1`. Use hex only; base64 characters break the database connection string.
On Windows without WSL, use the PowerShell variant from the quick start guide.

If the person has a TMDB key, add `TMDB_API_KEY=<key>` to `.env`. Let them paste it
into the file themselves if they prefer not to share it with you.

Tell the person to back up `LUMASTRA_MASTER_KEY` somewhere safe outside the server. If it
is lost, the secrets Lumastra stores can't be decrypted.

## 5. Mount the media

Edit `docker-compose.yml`: the `lumastra` service's `volumes:` list is the first one in the
file and ends with `- plugins:/app/plugins`. Add one read-only line per media folder from
question 3 right after that entry, keeping the folder names under `/data/media`, for
example:

```yaml
      - /srv/movies:/data/media/movies:ro
      - /srv/music:/data/media/music:ro
```

Keep the indentation of the existing entries. Validate the file with
`docker compose config --quiet` (no output means it's valid). That check does not notice a
line added to the wrong service, so also confirm that `docker compose config` lists the
`/data/media/...` targets under `lumastra`.

## 6. Start and verify

```bash
docker compose up -d --wait --wait-timeout 600
docker compose logs --tail=100 lumastra
```

`--wait` returns once every container is healthy; the first start runs the database
migrations and downloads the transcoder, which can take several minutes. The log must
show `Schema migration completed successfully`. Then check:

```bash
curl -fsS http://localhost:3000/api/health
```

It must return `{"status":"pass"}`. If not, run `docker compose exec lumastra npm run doctor`
and show the person the result.

## 7. Reverse proxy and HTTPS

Do this step by default, using the answers to question 4. Skip it only if the person
explicitly chose local-only use. Follow the reverse proxy guide for the exact
configuration: https://lumastra.org/guides/reverse-proxy/

- **Existing proxy:** add Lumastra to it with the matching section of the guide. If the
  proxy runs as a container, put it on the same Docker network as Lumastra and point it
  at `lumastra:3000`; if it runs on the host, point it at `127.0.0.1:3000`.
- **No proxy yet:** set up the one they chose (Traefik with Docker labels, or Caddy) as a
  service in the same `docker-compose.yml`, following the guide. Show them the changes
  before applying them.
- Make sure the proxy follows the guide's checklist: no buffering, long timeouts for
  streams, a request body limit of at least 50 MB, the forwarded headers, and removing
  the sign-in headers `X-Forwarded-User`, `X-Forwarded-Groups` and `X-Authentik-Name`.
  Copy the guide's config for that proxy as it is, including those lines.
- Add the line `ORIGIN=https://<their domain>` to `.env` (the example file has none). It is
  required behind a proxy. If the proxy runs as a container,
  give it the fixed address the guide shows and set `TRUSTED_PROXY_IPS` to that address
  so Lumastra sees real client IPs. Put only that address there, never the network's
  subnet. Adding the subnet to `lumastra-network` changes the
  network, so run `docker compose down` once before `docker compose up -d`. If the proxy runs on the host, leave
  `TRUSTED_PROXY_IPS` empty.
- Restart with `docker compose up -d`.
- If the proxy runs as a container, remove the `ports:` block from the `lumastra`
  service once the proxy works, so the app is only reachable through the proxy. A proxy
  on the host needs the block, so keep it then.
- Check: `curl -fsS https://<their domain>/api/health` returns `{"status":"pass"}`. If the
  certificate can't be issued, check that DNS points at this server and that ports 80
  and 443 reach it.
- Check the sign-in headers are removed:
  `curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-User: admin' https://<their domain>/api/user/profile`
  must print `401`. A `200` means anyone can sign in as anyone: stop and fix the proxy
  config.

## 8. Finish

Tell the person to open `https://<their domain>/setup` to create the admin account and
add the libraries under `/data/media/...`. Without a proxy, they open
http://localhost:3000/setup on that machine, through an SSH tunnel, or at
`http://<server-ip>:3000/setup` if they changed the port mapping. You can't do this
step for them.

Summarise for the person: the install folder, which media folders are mounted, the
reverse proxy and domain, the URL to open, that the master key must be backed up, and these links:

- Known limitations: https://lumastra.org/reference/known-limitations/
- Backups: https://lumastra.org/guides/backup-recovery/
- Updating later: `docker compose pull && docker compose up -d` in the install folder.
