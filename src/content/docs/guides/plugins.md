---
title: Plugins & extensions
description: >
  Install and manage Lumastra plugins: signing keys, repositories, webhooks,
  restart requirements, and persistent storage.
---

Plugins add tasks, metadata providers, watch-state sync, endpoints, widgets, library
sources, and notifications. For development, see [Writing a plugin](/developers/plugins/).

:::caution[A plugin runs as your server]
Plugins run in the Lumastra process with full access and no sandbox. Their code runs
before capability checks; declared capabilities do not restrict that access. Install
only code and publishers you trust. A signature verifies origin, not safety.
:::

## Two ways to install

### Drop-in: for plugins you wrote or audited yourself

Copy the plugin directory into `$PLUGINS_EXTERNAL_DIR`:

```
$PLUGINS_EXTERNAL_DIR/
  my-plugin/
    index.js
```

Lumastra loads it at startup. **Reload plugins** under **Settings → Plugins & features** picks
up newly added directories without a restart. Drop-ins have no signature or checksum
verification, including on later loads.

:::caution[Keep the plugin folder writable only by Lumastra]
Avoid storage that other services, such as download clients, can write to. Anyone who
can place code in this directory can execute it as Lumastra.
:::

### Signed remote install

Configure the publisher's [public key](#trusted-signing-keys), then enter the manifest
URL and detached signature under **Settings → Plugins & features**. The publisher supplies the
signed `manifest.json` and plugin bundle.

Lumastra applies SSRF, size, and timeout guards, verifies the signature over the exact
manifest bytes, and checks the bundle checksum. Every later load checks the installed
files against their recorded digest; modified files refuse to load.

### From a repository

Add a JSON repository index under **Settings → Plugins & features** to browse and install plugins.
Repository installs use the same signature, checksum, compatibility, publisher
continuity, and anti-rollback checks as manual signed installs.

#### The official repository

```
https://lumastra.org/plugins/index.json
```

Its reference plugins use the built-in key `lumastra-official-2026` and need no additional
key configuration. They demonstrate plugin contracts and are intended for adaptation.
Compare your build's key with
[the published signing keys](https://lumastra.org/.well-known/lumastra-signing-keys.json);
that document is informational and does not configure server trust.

Third-party repositories require the publisher's key in `PLUGIN_TRUSTED_KEYS` before
installation. A listing grants no trust or endorsement. Indexes are unsigned: they can
misrepresent a plugin or suppress updates, but cannot bypass per-plugin signatures.
Plugin details are verified against the signed manifest at install time, and the catalog
only offers versions compatible with your server's plugin ABI.

The **Check for Plugin Updates** task refreshes repositories every 12 hours and reports
available updates without installing them. **Sync now** refreshes manually. Removing a
repository leaves its installed plugins running.

## What a signature does and does not mean

A signature identifies a publisher and protects against forged updates. It does not
prove that code is safe or reviewed. Signed plugins have the same server access as
drop-ins.

## Trusted signing keys

The official key ships with Lumastra. Trust other publishers through the environment:

```bash
PLUGIN_TRUSTED_KEYS="alice-2026:MCowBQYDK2VwAyEA…"
```

Use a comma-separated list of `keyId:base64Spki` entries with Ed25519 keys. The key ID
appears in the admin UI and audit log.

:::danger[Keys are environment-only, by design]
`PLUGIN_TRUSTED_KEYS` and the gate flags on this page cannot be set through
`settings.json` or the admin UI: allowing settings writes to grant code-execution trust
would be unsafe.
:::

Removing a key blocks future installs signed by it. Already installed plugins keep
loading because load-time checks verify file digests. To revoke a plugin, uninstall it
and restart Lumastra.

## What takes effect immediately, and what needs a restart

| Action | Effect |
| ------ | ------ |
| Install (new plugin) | Loads immediately |
| Reload plugins | Picks up newly added directories |
| Enable | Loads immediately |
| Disable | **Next restart** |
| Uninstall | **Next restart** |
| Upgrade / downgrade | **Next restart** |

Lumastra cannot unload code from a running process. Removed or replaced plugins remain
loaded until restart.

With multiple replicas, shared storage distributes files, but only the replica serving
the install request loads the plugin immediately. Restart the other replicas to load
it; their cards report **loaded: false — restart required**.

## Plugin webhooks

```
POST /api/plugin-webhooks/<plugin-id>
```

The endpoint returns `404` until the plugin declares the `webhook` capability and has a
`webhookSecret` configured. Callers then authenticate with the
`X-Plugin-Webhook-Secret` header, without a browser session. Use a long random secret
unique to each plugin.

## What a plugin declares, and what the host checks

Signed manifests contain publisher, licence, source, and capability disclosures,
including database access, outbound domains, and dashboard code. Catalogs and mirrors
cannot alter these signed declarations.

A plugin registering capabilities beyond its declaration is refused and rolled back.
This check runs **after code has loaded**: rollback removes files and registrations,
but cannot undo code already executed.

### Publisher continuity

An update signed by a different key is refused, even if both keys are trusted. For a
verified publisher key rotation, explicitly accept it with `force`; the audit log
records both key IDs.

## Version compatibility

Plugins must match Lumastra's plugin ABI version to install or load. An ABI error after
upgrading Lumastra requires a plugin rebuild by its author.

## Auth-provider plugins

Auth plugins support credential or redirect-based login through an existing directory
or identity service. Their endpoints are reachable before authentication, so all three
gates default to empty:

| Variable | What it permits |
| -------- | ---------------- |
| `AUTH_PLUGIN_PROVIDERS` | Provider IDs allowed to authenticate users |
| `AUTH_PLUGIN_PROVISION` | Providers allowed to create unknown accounts |
| `AUTH_PLUGIN_ADMIN_ASSERT` | Providers whose asserted groups may confer admin |

```bash
AUTH_PLUGIN_PROVIDERS=acme-ldap
AUTH_PLUGIN_PROVISION=acme-ldap    # optional
# AUTH_PLUGIN_ADMIN_ASSERT=        # leave empty unless intended
```

Until a provider is listed in `AUTH_PLUGIN_PROVIDERS`, its login endpoint returns `404`
and its verification function is never called. Removing the ID blocks login immediately;
the list is read per request.

Without `AUTH_PLUGIN_PROVISION`, an admin must link unknown accounts. Provisioning never
creates an admin and requires an existing first admin. Without `AUTH_PLUGIN_ADMIN_ASSERT`,
groups matching `ADMIN_GROUPS` are stripped from provider claims; ordinary group mapping
still works.

Failed, malformed, or timed-out responses (over 10 seconds) reject login. Suspended
accounts remain blocked regardless of the provider's response.

For redirect providers, Lumastra enforces browser-bound, single-use state and keeps flow
context server-side. Redirect URLs require HTTPS, except HTTP loopback for local IdPs.
Login rate limits are 30 attempts per IP and 10 failures per account per 15 minutes;
provider outages do not consume the per-account budget.

See [Verifying a login](/developers/plugins/#6e-verifying-a-login) for the contract.

## Where plugins live, and how to not lose them

:::danger[Mount a volume at `$PLUGINS_EXTERNAL_DIR` before you install anything]
The default `/app/plugins` is inside the container. Without a persistent volume, an
image update loses installed files while their database records remain.

```yaml
services:
    lumastra:
        volumes:
            - plugins:/app/plugins

volumes:
    plugins:
        name: lumastra_plugins
```

Bundled plugins live separately at `/app/plugins-bundled` (`PLUGINS_BUNDLED_DIR`) and
update with the image; do not mount over that directory.
:::

If storage is lost, plugin cards name the missing directory. Reinstalling the same
version repairs it and is not treated as a downgrade. Multiple replicas need shared,
persistent storage and a restart on each replica to load changes.

## Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PLUGINS_ENABLED` | `true` | Set `false` to load no external plugins |
| `PLUGINS_EXTERNAL_DIR` | `/app/plugins` | Installed plugin directories; requires a persistent volume |
| `PLUGIN_TRUSTED_KEYS` | *(unset)* | Ed25519 `keyId:base64Spki` list for non-official publishers |
| `PLUGINS_EXTERNAL_INSTALL_ENABLED` | `true` | Set `false` to remove the remote-install endpoint |
| `PLUGINS_REQUIRE_REGISTRY` | `false` | Load only signed, registry-managed external plugins |
| `PLUGIN_INSTALL_ALLOW_PRIVATE` | `false` | Allow private-IP manifest fetches; development only |
| `AUTH_PLUGIN_PROVIDERS` | *(empty)* | Auth providers allowed to log users in |
| `AUTH_PLUGIN_PROVISION` | *(empty)* | Auth providers allowed to create accounts |
| `AUTH_PLUGIN_ADMIN_ASSERT` | *(empty)* | Auth providers whose groups may confer admin |

Install resource limits:

| Variable | Default |
| -------- | ------- |
| `PLUGIN_INSTALL_MAX_MANIFEST_BYTES` | 64 KiB |
| `PLUGIN_INSTALL_MAX_BUNDLE_BYTES` | 8 MiB |
| `PLUGIN_INSTALL_MAX_EXTRACTED_BYTES` | 32 MiB |
| `PLUGIN_INSTALL_MAX_FILE_BYTES` | 8 MiB |
| `PLUGIN_INSTALL_MAX_ENTRIES` | 2048 |
| `PLUGIN_INSTALL_FETCH_TIMEOUT_MS` | 15000 |

### Hardening

For signed installs, set:

```bash
PLUGINS_REQUIRE_REGISTRY=true
```

This prevents unverified drop-ins from loading alongside signed plugins. Bundled
plugins are exempt because they ship inside the image; directories in your plugin
volume are not.

Keep `PLUGIN_INSTALL_ALLOW_PRIVATE=false` in production. Public-IP pinning prevents
manifest fetches from reaching private network services.

## Troubleshooting

| Problem | Action |
| ------- | ------ |
| No trusted signing keys configured | Set `PLUGIN_TRUSTED_KEYS` if your build has no official key |
| Checksum mismatch on disk | Reinstall the plugin |
| Built for SDK ABI N | Request a rebuild for your Lumastra version |
| Runtime-imported the types-only SDK package | Request a fix from the plugin author |
| Listed but not loaded | Check the card for missing files or a required restart |
| Loaded but inactive | Check required settings and any plugin-specific enable toggle |

## Next

- [Writing a plugin](/developers/plugins/)
- [Administering Lumastra](/guides/administration/)
- [Authentication](/guides/authentication/)
- [Editions & Licensing](/guides/licensing/)
