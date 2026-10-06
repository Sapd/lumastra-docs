# Install Lumastra: instructions for an AI assistant

You are helping a person install Lumastra, a self-hosted media server, on a machine they
control. Follow these steps in order. Run commands yourself where you can, check each
result before you go on, and ask the person whenever a step needs a decision or
information you can't check yourself. The human-readable guide is
https://lumastra.org/start/quick-start/.

This file has the same steps as the `lumastra-install` skill in the Lumastra repository
(`plugins/lumastra-skills`). You don't need the skill to follow this file.

## Rules

- Never print, paste or send the generated secrets (`DATABASE_PASSWORD`, `CACHE_PASSWORD`,
  `LUMASTRA_MASTER_KEY`) into the chat or any log. Write them only into `.env`. Don't
  `cat .env`, run `docker compose config` without `--quiet`, or run `docker inspect`
  without a `-f` format that selects only the fields you need; all three print them.
  Before you show the person log or doctor output, replace any `://user:password@` part
  with `://***@`.
- Keep port 3000 off the internet. Keep the mapping `127.0.0.1:3000:3000`. Change it to
  `3000:3000` only when the person explicitly wants plain-HTTP access from their local
  network without a proxy; then leave `ORIGIN` unset and tell them that passwords cross
  the network unencrypted, that the iPhone, iPad and Apple TV apps need HTTPS, and never
  to forward port 3000 on their router. Remote access goes through a reverse proxy with
  HTTPS (step 8).
- Ask before you delete or overwrite any file, container, volume or network. This
  includes an existing `docker-compose.yml` or `.env` and existing Lumastra containers or
  volumes.
- The secrets file must be named exactly `.env`. Docker Compose reads variables such as
  `${DATABASE_PASSWORD}` only from a file with that name.
- Your shell may not keep its working directory between commands. Start every command
  with `cd <install folder> &&`.
- If a step fails, show the person the relevant error lines and the fix you propose, and
  wait for their approval before you change anything.

## 1. Docker Compose or Kubernetes

Ask first. Docker Compose is the default and the steps below cover it. For Kubernetes,
stop here and follow https://lumastra.org/guides/deploy-kubernetes/ (Helm chart, beta).
Its "What you need" section lists what to ask the person.

## 2. Check the machine

Report each result. The commands are for Linux and macOS; on Windows, run them in WSL or
report what Docker Desktop shows under Settings > Resources.

```bash
docker --version          # 24 or newer
docker compose version    # 2.20 or newer
docker info --format '{{.ServerVersion}} {{.MemTotal}} {{.Architecture}}'
df -h "$(docker info --format '{{.DockerRootDir}}')" ~
uname -m
grep -o -w 'sse4_2\|popcnt' /proc/cpuinfo | sort -u    # Linux on x86-64 only
```

- **Docker.** If `docker info` fails with a permission error, the user account is not in
  the `docker` group. Tell the person: they add the account to the group and log in
  again, or prefix every `docker` command with `sudo`. If Docker is missing, ask before
  installing it.
- **Memory.** `MemTotal` is the memory Docker can use, in bytes; on Docker Desktop it is
  the VM's limit. 8 GB is recommended; the background tasks that scan and analyze the
  library use most of it. The example compose file sets `LUMASTRA_LOW_RAM_MODE: 'true'`,
  which caps the Node.js heap. Keep it below 8 GB. Below about 4 GB, warn the person that
  only a small library will run.
- **Disk.** Docker's data directory (the first `df` line) needs at least 20 GB free.
  Check media folders on other disks separately.
- **CPU.** On `x86_64`, the `grep` must print both `popcnt` and `sse4_2` (x86-64-v2). In
  a virtual machine, set the CPU model to `host-passthrough` or Nehalem or newer. On
  `aarch64` or `arm64`, tell the person that music BPM and mood analysis, the
  sound-similarity sidecar and Intel Quick Sync transcoding are not available.

## 3. Ask the person

1. **Install folder.** Default `~/lumastra`.
2. **Media folders** (movies, series, music). They are mounted read-only.
3. **Reverse proxy and domain.** The iPhone, iPad and Apple TV apps only connect over
   HTTPS. Ask whether they already run a proxy (Traefik, Caddy, nginx, Nginx Proxy
   Manager) and whether it runs on the host or as a container. Ask which domain to use
   and whether that domain's DNS points at this server. With no proxy, offer Traefik with
   Docker labels or Caddy and let them choose. Skip the proxy only if they explicitly
   want local use.
4. **Sign-in.** Built-in accounts work without extra setup. OIDC can be added later:
   https://lumastra.org/guides/authentication/. If they want forward auth, set
   `FORWARD_AUTH_ENABLED=true` in `.env`. It is off by default, nobody signs in through
   the proxy without it, and it can only be set in the environment. The proxy then has to
   run on the compose network with a fixed address; see
   https://lumastra.org/guides/deploy-docker/#reverse-proxy--tls.
5. **TMDB credential** for movie and series metadata. It is optional, strongly
   recommended and free: https://www.themoviedb.org/settings/api. Either the "API Key" or
   the "API Read Access Token" works.

## 4. Download the two files

Check for an earlier install first:

```bash
docker compose ls -a
docker volume ls --format '{{.Name}}' | grep -i lumastra
mkdir -p ~/lumastra && cd ~/lumastra && ls -A
```

If any of them shows Lumastra, or the folder already holds `docker-compose.yml` or
`.env`, stop and ask. Compose names the project after the folder, so a second folder with
the same name reuses the first install's volumes. Then download, using the folder from
question 1:

```bash
cd ~/lumastra && \
  curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/Sapd/lumastra/main/docker-compose.example.yml && \
  curl -fsSL -o .env https://raw.githubusercontent.com/Sapd/lumastra/main/.env.example && \
  chmod 600 .env
```

You don't need to clone the repository.

## 5. Generate the secrets

Check that `.env` still holds the placeholders; this must print `3`:

```bash
grep -c -e '^DATABASE_PASSWORD=changeme' -e '^CACHE_PASSWORD=changeme' -e '^# LUMASTRA_MASTER_KEY=' .env
```

If it prints another number, `.env` holds values other than the placeholders, for example
from an earlier install. Stop and ask the person. Replacing `DATABASE_PASSWORD` or
`LUMASTRA_MASTER_KEY` on an existing database locks Lumastra out of its data.

On Linux and macOS, this writes the three secrets as hex and prints `written`:

```bash
(
  hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }
  db=$(hex 24); cache=$(hex 24); key=$(hex 32)
  if [ ${#db} -eq 48 ] && [ ${#cache} -eq 48 ] && [ ${#key} -eq 64 ]; then
    sed -i.bak \
      -e "s|^DATABASE_PASSWORD=.*|DATABASE_PASSWORD=$db|" \
      -e "s|^CACHE_PASSWORD=.*|CACHE_PASSWORD=$cache|" \
      -e "s|^# LUMASTRA_MASTER_KEY=.*|LUMASTRA_MASTER_KEY=$key|" \
      .env && rm -f .env.bak && chmod 600 .env && echo written
  else
    echo 'secret generation failed; .env unchanged' >&2
  fi
)
```

Check them without printing them; this must print `3`:

```bash
grep -c -e '^DATABASE_PASSWORD=[0-9a-f]\{48\}$' -e '^CACHE_PASSWORD=[0-9a-f]\{48\}$' -e '^LUMASTRA_MASTER_KEY=[0-9a-f]\{64\}$' .env
```

Use hex only: the compose file puts both passwords into `DATABASE_URL` and `CACHE_URL`,
where base64 characters break the connection strings. On Windows without WSL, use the
PowerShell variant from the quick start guide.

**TMDB.** Don't uncomment the sample line `# TMDB_API_KEY=your_tmdb_api_key`. Lumastra
treats the sample value as a real key, and every TMDB request fails. The person can add
the line `TMDB_API_KEY=<value>` to `.env` themselves in an editor, which keeps the value
out of the chat. If they give you the value, run `grep -c '^TMDB_API_KEY=' .env` first;
if it prints `0`, append the line with `printf '\nTMDB_API_KEY=%s\n' '<value>' >> .env`.

## 6. Mount the media

Add one read-only line per media folder from question 2 to the existing `volumes:` list
of the `lumastra` service (the top-level `volumes:` block is a different list). Keep the
container paths under `/data/media/`, and quote a line whose host path has spaces:

```yaml
services:
    lumastra:
        volumes:
            # existing entries stay as they are
            - /srv/media/movies:/data/media/movies:ro
            - '/srv/media/tv shows:/data/media/series:ro'
```

The host folders must exist and be readable by uid 1000, which the container runs as.
Docker creates a missing folder as an empty root-owned one. On Fedora or RHEL with
SELinux, use `:ro,z`. On Docker Desktop, the folders must be in the file sharing list.
Validate with `docker compose config --quiet`. No output means the file is valid.

## 7. Start and verify

```bash
cd ~/lumastra && docker compose up -d --wait --wait-timeout 600
```

`--wait` returns once every container is healthy. The first start pulls the images and
runs the database migrations, which can take several minutes. If `--wait` reports an
unhealthy or timed-out container, read `docker compose logs --tail=200 lumastra`; while
the log still shows migration progress, run the same command again. Then check:

```bash
cd ~/lumastra && \
  curl -fsS http://localhost:3000/api/health/ready && \
  docker compose logs lumastra | grep -c 'Schema migration completed successfully' && \
  docker compose exec lumastra ls /data/media
```

The ready check must print `{"status":"pass"}`; it also checks PostgreSQL and Valkey. The
`grep` must print at least `1`, and the last command must list the media folders. If
something fails, run `docker compose ps` and `docker compose exec lumastra npm run doctor`
and show the person the result, with connection strings masked.

## 8. Reverse proxy and HTTPS

Do this step unless the person chose local use only in question 3. Follow the reverse
proxy guide for the exact configuration: https://lumastra.org/guides/reverse-proxy/. If
you can't fetch it, ask the person to open it; don't write proxy configuration from
memory. Show the person each change to `docker-compose.yml` and `.env`, and wait for
their approval before you apply it.

Before you start:

- Run `dig +short <domain>` and ask the person whether the address is the server's
  public address. Don't look it up through an outside service without asking.
- Ports 80 and 443 must reach the server. For a new proxy, check that nothing on the host
  uses them yet (`ss -ltn` on Linux, `lsof -nP -iTCP -sTCP:LISTEN` on macOS).

Then:

- **Proxy on the compose network** (a container in the same `docker-compose.yml`, or on a
  Docker network shared with Lumastra): point it at `lumastra:3000`.
- **Proxy on the host:** point it at `127.0.0.1:3000` and keep the `ports:` mapping.
- **Traefik:** the example compose file ships Traefik labels that use an Authentik
  middleware (`authentik@docker`). Replace all of them with the labels from the guide.
  With an existing Traefik, use its network, entrypoint and certificate resolver names.
  Edit the existing `labels:` and `networks:` keys instead of adding a second key of the
  same name, and keep `lumastra` on `lumastra-network`.
- Copy the guide's config for that proxy as it is. It passes `Host`, sets
  `X-Forwarded-For` and `X-Forwarded-Proto`, turns off buffering, allows long timeouts and
  request bodies of at least 50 MB, and removes the sign-in headers `X-Forwarded-User`,
  `X-Forwarded-Groups` and `X-Authentik-Name`. Never drop the lines that remove those
  headers.
- In `.env`, check that `grep -c -e '^ORIGIN=' -e '^TRUSTED_PROXY_IPS=' .env` prints `0`,
  then add the line `ORIGIN=https://<domain>` (the example file has none). It is required
  behind a proxy.
- `TRUSTED_PROXY_IPS`: for a proxy in a container, give the proxy the fixed address the
  guide shows and set `TRUSTED_PROXY_IPS` to that one address, never the network's subnet.
  Adding the subnet to `lumastra-network` changes the network, so run
  `docker compose down` once before `docker compose up -d`. For a proxy on the host, or on
  Docker Desktop, leave `TRUSTED_PROXY_IPS` unset and tell the person that rate limits are
  then shared by all clients.
- Run `docker compose up -d`, then check `curl -fsS https://<domain>/api/health/ready`.
  It must print `{"status":"pass"}`. HTML or any other body means the request did not
  reach Lumastra. If the certificate can't be issued, check that DNS points at this
  server and that ports 80 and 443 reach it.
- Check that the proxy removes the sign-in headers. This must print `401`:
  `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-User: admin' https://<domain>/api/user/profile`.
  A `200` means anyone can sign in as anyone: stop, tell the person, and fix the proxy
  config before you continue.
- If the proxy reaches Lumastra over the compose network, remove the `ports:` block from
  the `lumastra` service, run `docker compose up -d` and check again. From then on, check
  the app directly with
  `docker compose exec lumastra curl -fsS http://localhost:3000/api/health/ready`.

## 9. Finish

Until the first admin account exists, anyone who can open the address can create it.
Tell the person to open `https://<domain>/setup` as soon as the proxy works, create the
admin account and add the libraries under `/data/media/...`. Without a proxy, they open
`http://localhost:3000/setup` on that machine, or through an SSH tunnel from their own
computer: `ssh -L 3000:127.0.0.1:3000 <user>@<server>`. With the mapping `3000:3000` for
local-network access they open `http://<server-ip>:3000/setup`. You can't do this step
for them.

Summarize for the person: the install folder, the mounted media folders, the proxy and
domain, the URL to open, and these points:

- Back up `LUMASTRA_MASTER_KEY` from `.env` outside the server. Without it, the secrets
  Lumastra stores can't be decrypted.
- Backups: https://lumastra.org/guides/backup-recovery/
- Known limitations: https://lumastra.org/reference/known-limitations/
- Updating: back up first, then run `docker compose pull && docker compose up -d` in the
  install folder. New versions migrate the database on start, and an older image can't
  undo that.
