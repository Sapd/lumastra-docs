---
title: Client diagnostics
description: What the iOS, tvOS and web apps report about crashes, hangs, errors, and playback problems, how it is redacted, and how to review or disable it.
---

The official iOS, tvOS and web apps report crashes, hangs, errors and playback
problems back to your Lumastra server. Here's what gets sent, how it's redacted,
and how to review or disable it.

## What gets reported

Each app can send small diagnostic events to `POST /diagnostics/events`, batched
(up to 50 per request) and mounted on both `/api` and `/api/v1`. There are six
kinds:

| Kind | What it is | Gated by |
| --- | --- | --- |
| `crash` | An app crash report | `FEATURE_CLIENT_DIAGNOSTICS` |
| `hang` | An app hang / frozen-UI detection | `FEATURE_CLIENT_DIAGNOSTICS` |
| `js_error` | An uncaught JavaScript error in the web UI | `FEATURE_CLIENT_DIAGNOSTICS` |
| `api_failures` | Counts of failed API calls, by endpoint | `FEATURE_CLIENT_DIAGNOSTICS` |
| `playback_incident` | A playback failure or stall | always on |
| `log_bundle` | A submitted log bundle (see below) | `FEATURE_CLIENT_LOG_BUNDLES` |

`playback_incident` is always recorded regardless of the feature switch: it's
the same report a client sends when a stream stalls or fails, and it's exempt
from the daily byte budget below (bounded instead by its own rate limit and a
500-row cap). The other four kinds are the "automatic" reports; turning
`FEATURE_CLIENT_DIAGNOSTICS` off (default: on) drops them before they reach the
database, and the response counts them as dropped rather than accepted.

Reporting is idempotent per event id: resending a batch after a timeout only
inserts the events the server hasn't already seen, so a client can safely retry.
A client also calls `PATCH /diagnostics/events/resolve` to mark a previously
reported playback attempt as recovered.

### Log bundles

Separately, a user can send their app's recent logs ("Send diagnostics" in the
app), or an admin can request logs from a device, via `POST /diagnostics/bundles`.
A bundle is a gzipped log file, capped at 2 MiB compressed / 16 MiB inflated, rate
limited to 10 uploads per hour per user, and gated by its own FEATURE_* flag,
`FEATURE_CLIENT_LOG_BUNDLES` (default: on). Every line in an uploaded bundle is
scrubbed server-side before it is stored. The stored size, not the upload's
original size, is what counts against the byte budget.

## Redaction

Everything reported is redacted before it is written:

- Known secret-shaped keys and values (tokens, passwords, API keys) are stripped
  from the JSON payload at any nesting depth.
- Free-text fields (log tails, error messages, stack traces) are scrubbed for
  `Authorization` header values and e-mail addresses.
- User-identifying fields (`logTail`, `clientInfo`, `note`, `message`, `stack`,
  `timeline`, `errorId`, and similar) are the only parts erasure ever needs to
  remove per GDPR request (below). The underlying event shape isn't personal
  data on its own.

Attaching the last ~200 redacted log lines to automatic crash/hang/playback
reports is controlled separately by `FEATURE_CLIENT_DIAGNOSTICS_LOG_TAIL`
(default: on).

## Limits and retention

| Setting | Default | Controls |
| --- | --- | --- |
| `CLIENT_DIAGNOSTICS_DAILY_BYTES_PER_USER` | 50 MiB | Per-user rolling 24h upload budget across automatic reports and bundles (`playback_incident` exempt). Over budget: automatic reports are dropped, bundle uploads are refused. |
| `CLIENT_DIAGNOSTICS_MAX_ROWS_PER_USER` | 1000 | Hard cap on non-playback diagnostic rows per user, independent of retention. |
| `CLIENT_DIAGNOSTICS_RETENTION_DAYS` | 30 | How long crash/hang/`js_error`/`api_failures` rows are kept. |
| `CLIENT_LOG_BUNDLE_RETENTION_DAYS` | 30 | How long uploaded log bundles are kept. |

The budget is enforced per user, under a per-user lock shared between the events
and bundle endpoints, so concurrent uploads from the same user's devices can't
collectively overshoot it.

## Reviewing reports

Admins review everything reported in **Admin → Users → Client Diagnostics**: a
filterable, paginated list (by kind, platform, user, device, app version,
fingerprint, resolved state, and time range), with a detail view per report and a
one-click download for a log bundle's blob. Admins can clear a filtered set, or
everything with an explicit confirmation.

## GDPR export and erasure

Client diagnostics are part of a user's data export and erasure:

- **Export** includes every diagnostic row the subject's own devices reported,
  including a log bundle's full decompressed text. The data was already
  redacted of secrets at write time, so it's safe to hand back as-is.
- **Erasure** deletes log-bundle rows outright (their blobs cascade with them,
  including a bundle uploaded by a different account that named this user as a
  contributor). Every other kind keeps its forensic shape (kind, platform,
  versions, timestamps, occurrence count, fingerprint), but has its user-derived
  fields (`logTail`, `clientInfo`, `note`, `message`, `stack`, `timeline`, and a
  few kind-specific identifiers) nulled, and the row's link to the account
  removed.

## Turning it off

Set `FEATURE_CLIENT_DIAGNOSTICS=false` to stop the four automatic kinds, or
`FEATURE_CLIENT_LOG_BUNDLES=false` to stop log-bundle uploads. Playback
incident reporting has no FEATURE_* flag; it's part of the playback reliability
pipeline, not optional telemetry. It never carries a log tail, media titles, or
anything beyond what [What Lumastra sends
where](/reference/data-flows/) already documents for on-server processing.

## Next

- [Known limitations](/reference/known-limitations/)
- [What Lumastra sends where](/reference/data-flows/)
- [Building a player](/developers/building-a-player/)
