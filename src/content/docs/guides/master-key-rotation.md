---
title: Rotating the master key
description: How to move every stored secret to a new LUMASTRA_MASTER_KEY without losing any of them. The order matters.
---

This guide walks through changing `LUMASTRA_MASTER_KEY` to a new value without losing
any secret it protects. You'll need admin access to the instance (or a PAT with
`tasks:admin`), and a way to back up the database and `/config` volume first.

`LUMASTRA_MASTER_KEY` is the one key every secret Lumastra stores is encrypted with.
It lives in your environment (or in `/config/master.key` if you never set it) and is
never written to the database, which is why a database dump on its own is useless to
an attacker. See [Backup & recovery](/guides/backup-recovery/) for where your key is
and how to keep it safe.

Rotating the key means **re-encrypting every stored secret under the new key before
the new key goes into service**. Lumastra does this for you from
**Admin → Settings → Secrets → Rotate Master Key** (or `POST /api/v1/admin/secrets/rotate`).
Everything below is about doing it in the right order.

:::danger[Do not change the environment variable first]
The rotation needs the **old** key to still be the live one. If you swap
`LUMASTRA_MASTER_KEY` and restart before rotating, there is nothing left that can read
the old ciphertext, and the affected values can only be re-entered by hand.
:::

## What rotation covers

Every store that is sealed with the master key is moved in one operation:

- Plugin secrets and per-user plugin credentials
- Sensitive values in `settings.json` (API keys, passwords, tokens entered in the admin UI)
- OpenSubsonic client tokens, including the lookup index that lets a client authenticate
- Webhook signing secrets (task webhooks and per-user notification webhooks)
- Jellyfin-compatible client passwords
- Live TV provider (Xtream) usernames and passwords

The response tells you what moved and what did **not** (see
[Reading the result](#reading-the-result)).

## What rotation cannot cover

Two values are *derived* from the master key rather than stored, so there is no
ciphertext to move. They change when the key changes:

- **Login sessions**, when `JWT_SECRET` is not set explicitly. The signing key for
  access and refresh tokens is derived from the master key, so rotating **signs every
  user out** and every app and TV client must log in again. Avoid this by setting an
  explicit `JWT_SECRET` (any long random string) **before** you rotate. Once it is
  set, sessions are independent of the master key.
- **The Jellyfin-compatible server id.** Clients paired through the `/j` compatibility
  layer (Jellyfin Media Player, Tizen, WebOS, Moonfin and friends) will see a "new"
  server and need to be paired once more. There is no way around this; plan for one
  round of re-pairing.

The master-key **fingerprint** shown in the admin UI is not a secret. It reports the
new key afterwards, which is how you check every replica agrees.

## Step by step

1. **Back up first.** Take a database dump *and* a copy of the `/config` volume (`settings.json`,
   `master.key`). Keep the **old key** with them: a backup can only be read with the
   key that was live when it was taken.
2. Set `JWT_SECRET` explicitly if you'd rather not sign everyone out, and restart.
   Optional, but it has to happen before rotating, not after.
3. Generate the new key:

   ```bash
   openssl rand -hex 32
   ```

   A 64-character hex value is the preferred form. A passphrase is accepted (at least
   24 characters with two character classes), but **do not change
   `LUMASTRA_KDF_SALT` at the same time**: it would derive a different key from the
   same passphrase and orphan everything.

4. **Run the rotation while the old key is still live.** In the admin UI, go to
   **Settings → Secrets → Rotate Master Key**, enter the current and the new key, and
   type the confirmation phrase. From a script:

   ```bash
   curl -sS -X POST https://<your-host>/api/v1/admin/secrets/rotate \
     -H 'Authorization: Bearer <PAT with tasks:admin>' \
     -H 'Content-Type: application/json' \
     -d '{"oldMasterKey":"<current>","newMasterKey":"<new>",
          "confirmation":"I_UNDERSTAND_THIS_RE_ENCRYPTS_ALL_SECRETS"}'
   ```

   Only one rotation can run at a time; a second concurrent one is refused with `409`.
   If Valkey is unavailable the endpoint refuses outright (`503`) rather than risk a
   half-done rotation.

5. **Read the result before doing anything else** (see below). Don't continue while
   `notRotated` lists anything.
6. **Only when the result is clean,** set the new `LUMASTRA_MASTER_KEY` (or replace
   `/config/master.key`) for **every** replica and worker.
7. Restart every replica. The instance that served the rotation switches to the
   new key by itself; every other one keeps the old key until restarted and logs
   `Secret decrypt failed` on each secret read in the meantime.
8. Verify: compare the master-key fingerprint across replicas in the admin UI,
   log in with a Subsonic client, send a webhook test delivery, open a Live TV
   source, and confirm the startup log has no
   `[ConfigService] … could not be decrypted` line.

## Reading the result

The response has three parts:

- **`rotated` / `skipped`**: values moved, and values that could be opened with
  *neither* key (a `207` status means at least one row could not be re-encrypted).
- **`notRotated`**: a list of `{store, reason}` entries. **Stop if this is not
  empty.** Everything listed is still sealed with the old key. Fix the cause and run
  the rotation again: every store is processed row by row and skips values that
  already moved, so a re-run finishes the job instead of double-encrypting anything.
- **`warning`**: a plain-language summary of the two above. The admin UI shows it in
  red together with "do NOT change `LUMASTRA_MASTER_KEY` yet".

## If something was missed

The tell-tale sign is this line at **error** level on startup:

```text
[ConfigService] N sensitive setting(s) could not be decrypted and are NOT in effect
```

It names each affected key. Those settings are not in effect: the app is running on
their defaults, so an API key you can still *see* configured in the admin UI isn't
being sent. The security self-check on **Admin → System → Health → Security** reports
the same condition as a failing finding.

The remedy is to put the **old** key back, restart, and run the rotation again. That
is why the old key must be kept until verification passes; without it those values can
only be re-entered by hand.

Other stores fail more quietly by design: a Subsonic token that cannot be opened fails
authentication, an unreadable webhook secret makes deliveries error, and a Live TV
source stops refreshing. Each recovers the same way.

## Backups and old ciphertext

- Label every backup with the key it needs. A pre-rotation dump restored onto a
  post-rotation deployment can't be decrypted. Keep the key in your secret manager,
  not in the same bucket as the dump.
- Rotation doesn't shred the old ciphertext. Earlier backups, replicas and WAL
  archives still contain values that open with the retired key. If you're rotating
  because the old key leaked, the rotation only protects new data: you must also
  replace the leaked credentials themselves (new Subsonic tokens, webhook secrets,
  Xtream credentials, provider API keys) and destroy or re-encrypt the old backups.
- `settings.json` is rewritten in place by the rotation. The `/config` backup from
  step 1 is your rollback.

## Next

- [Backup & recovery](/guides/backup-recovery/)
- [Environment Variables](/reference/environment-variables/)
- [Configuration](/guides/configuration/)
