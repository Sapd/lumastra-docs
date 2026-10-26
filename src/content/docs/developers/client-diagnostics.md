---
title: Client diagnostics
description: >
  Send diagnostic events and user-submitted log bundles from an integration, correlate
  playback failures, and understand operator access, redaction and retention.
---

Apps can report errors and submit logs to the user's own Lumastra server. The stable
integration endpoints are under `/api/v1/diagnostics`; the web app also uses mounts
under `/api/diagnostics`. Reports are associated with the authenticated account.
They are visible to the server's administrators.

Use an OAuth device-flow token with scope `media`, or a PAT with `write`, in
`Authorization: Bearer …`. Read-only credentials cannot POST events or bundles or
PATCH recovery state. Use `Content-Type: application/json` on every request. See
[API authentication](/developers/api/#making-an-authenticated-request) for sign-in and token handling.

For exact fields, check your instance's `/api-docs?format=yaml`; the hosted
[API reference](/reference/) is a versioned snapshot. Administrative review and
retrieval are separate from the client ingestion API.

## Send an event batch

`POST /api/v1/diagnostics/events` takes `{ "events": [...] }`, with 1–50 events
and a maximum JSON request body of 512 KiB. Five kinds are accepted:

| Kind | Required payload fields | Purpose |
| --- | --- | --- |
| `crash`, `hang` | `source`, `confidence`, `callStacks` | Native crash or hang reports; source is `metrickit_legacy`, `metrickit`, `exception_handler` or `abnormal_exit`; confidence is `high` or `low` |
| `js_error` | `name`, `message`, `origin` | JavaScript error; origin is `handle_error`, `window_error`, `unhandled_rejection` or `error_toast` |
| `api_failures` | `windowStart`, `windowEnd`, `method`, `route`, `outcome` | Failed API calls grouped over a time window |
| `playback_incident` | `triggerType`, `timeline` | Playback failure, reconnect or terminal incident; also requires envelope `attemptId` |

`log_bundle` and `compat_incident` appear in the admin list, but cannot be submitted
as event kinds here. Bundles have their own endpoint; compatibility incidents are
written by the server's Jellyfin layer.

Every event needs these envelope fields:

| Field | Format |
| --- | --- |
| `eventId` | Client-minted UUID, reused when retrying the same event |
| `platform` | `ios`, `tvos`, `web` or `other`; use `other` for other platforms |
| `occurredAt` | Epoch **milliseconds**, from 2000-01-01 through at most 24 hours in the future |
| `kind`, `payload` | One of the five kinds and its typed payload |

Optional envelope fields include `deviceId` (1–128 characters), `appVersion` and
`appBuild` (up to 32 each), `osVersion` and `deviceModel` (up to 64 each),
`playSessionId` (up to 64), `attemptId` (1–64), `mediaId` (UUID), and `occurrences`
(integer 1–1,000,000). These identify or correlate the report; send only what is
needed. `deviceId` is client-asserted, not proof of device ownership.

This minimal Node.js example sends one API-failure event. Supply your server origin
and token through environment variables. It makes a real submission when run.

```js
import { randomUUID } from 'node:crypto';

const origin = process.env.LUMASTRA_ORIGIN;
const token = process.env.LUMASTRA_TOKEN;
if (!origin || !token) throw new Error('Set LUMASTRA_ORIGIN and LUMASTRA_TOKEN');

const now = Date.now();
const event = {
  eventId: randomUUID(),
  platform: 'other',
  occurredAt: now,
  kind: 'api_failures',
  payload: {
    windowStart: now,
    windowEnd: now,
    method: 'GET',
    route: '/api/v1/media/:id',
    outcome: 'status_5xx',
    status: 503,
  },
};
// Persist this event before sending; retries must reuse its eventId.
const response = await fetch(new URL('/api/v1/diagnostics/events', origin), {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ events: [event] }),
});
if (response.status !== 202) throw new Error(`Diagnostics returned ${response.status}`);
console.log(await response.json()); // { accepted, dropped }
```

`202` returns counts, not event ids. Already stored events are neither accepted
nor dropped, so the counts need not sum to the input length. Deduplication is per
account and `eventId`, including across kinds: mint a distinct id for each event.
Automatic reports can be dropped when disabled or over budget. Do not retry those
as new ids to evade the drop. Retry transient network/5xx failures with backoff and
the original event ids; honor `Retry-After` on `429`.

### Payload bounds and correlation

- `crash`/`hang`: at most 8 call stacks, 32 frames each; serialized payload at most
  64 KiB. A frame can carry binary name/UUID, offset, address and symbol.
  Optional `hangDurationMs` is milliseconds.
- `js_error`: `name` up to 128 characters, `message` up to 2000, `stack` up to 8192;
  serialized payload at most 16 KiB. Optional `toastKey` is a stable message key,
  not displayed text. Optional `errorId` can match a reference shown to the user.
- `api_failures`: serialized payload at most 2 KiB. `method` is GET, POST, PUT,
  PATCH or DELETE; `outcome` is `status_4xx`, `status_5xx`, `network`, `timeout` or
  `decode`. Window timestamps use epoch milliseconds. Use an operation id or
  templated path for `route`; omit queries, credentials and raw ids. Optional
  `problemCode` and `requestId` can correlate a server problem response.
- `playback_incident`: use the attempt's stable `attemptId` and, when available,
  `playSessionId` and `mediaId`. `triggerType` is `error`, `reconnect` or `terminal`.
  Use the instance schema for the error/stage enums, timeline bounds and allowed
  diagnostic codes. An `error` trigger requires `errorType`; `reconnect` requires
  `reconnectCause`. The payload cap is 296 KiB, with at most 200 timeline entries.
  The server trims the timeline to its newest 120 entries and 32 KiB before
  redaction. `clientInfo` permits at most 32 keys and a serialized JSON length of 4096.
  Do not invent codes or copy arbitrary response bodies into these fields.

An optional `logTail` has `{ lines, truncated, source }`, with at most 200 lines,
2000 characters per line, and 32 KiB serialized in total. `source` is
`current_run` or `previous_run`. The payload limits still apply; a JS report cannot
use the whole 32 KiB tail allowance inside its 16 KiB payload.

After a playback attempt recovers, send:

```http
PATCH /api/v1/diagnostics/events/resolve
Authorization: Bearer <token>
Content-Type: application/json

{"attemptId":"attempt-123"}
```

The server resolves that account's unresolved incidents for the attempt. Success
is `204` with no body, including when there is nothing to resolve. It cannot
resolve another user's incidents. Events and recovery share a limit of
60 requests per minute per user.

## Upload a user-submitted log bundle

Offer an explicit **Send diagnostics** action and explain that the server admin
will receive the logs. Redact locally before upload and minimize logs across
accounts on shared devices. Server feature flags are server controls; the API
does not verify that a user consented to a submission. Implement your integration's
user reporting preference and consent flow yourself.

`POST /api/v1/diagnostics/bundles` accepts a JSON envelope with the required
`eventId`, `platform`, and `occurredAt` fields above, plus:

| Field | Requirement |
| --- | --- |
| `contentGzipBase64` | Standard base64 encoding of gzipped UTF-8 log text; required |
| `trigger` | Required: `user`, `playback_prompt` or `admin_request` |
| `scope` | Required: `account` or `device` |
| `note` | Optional user note, up to 1000 characters |
| `accountIds` | Optional, at most 16 server account UUIDs whose log segments are included; normalized to lowercase and deduplicated |
| `requestId` | Optional UUID accepted by the schema but currently ignored |

Remote admin log requests are not implemented by this endpoint. An
`admin_request` trigger is stored as `user`, and `requestId` is not retained as a
request association. Do not build an admin log-request workflow around these fields.

This standalone Node.js example uploads a small invented log after a user chooses
to send it:

```js
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const origin = process.env.LUMASTRA_ORIGIN;
const token = process.env.LUMASTRA_TOKEN;
if (!origin || !token) throw new Error('Set LUMASTRA_ORIGIN and LUMASTRA_TOKEN');

const bundle = {
  eventId: randomUUID(),
  platform: 'other',
  occurredAt: Date.now(),
  trigger: 'user',
  scope: 'account',
  contentGzipBase64: gzipSync(Buffer.from('Player startup failed\n', 'utf8'))
    .toString('base64'),
};
// Persist the bundle and reuse eventId for retries.
const response = await fetch(new URL('/api/v1/diagnostics/bundles', origin), {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(bundle),
});
if (response.status !== 202) throw new Error(`Bundle upload returned ${response.status}`);
const { diagnosticId, eventId, shortId } = await response.json();
console.log({ diagnosticId, eventId, shortId });
```

Send JSON containing base64 gzip, not a raw gzip HTTP body, multipart upload, or
`Content-Encoding: gzip` request. Limits are 3 MiB for the JSON body, 2 MiB for
decoded compressed content, and 16 MiB inflated. Sanitized, recompressed content
must also fit the 2 MiB stored limit. Configure the reverse proxy to allow at
least the 3 MiB JSON limit; smaller proxy limits can reject an otherwise valid bundle.

A successful upload returns `202` with numeric `diagnosticId`, UUID `eventId`,
and human-readable `shortId` (the first eight hex characters of the event UUID,
formatted like `1234-5678`). Show the reference to the user. A retry with the same
account and event id returns the stored diagnostic id. Bundle uploads have a
separate limit of 10 requests per hour per user.

| Status | Meaning and handling |
| --- | --- |
| `401` | Missing or invalid sign-in |
| `403` | Insufficient token scope, or bundles disabled on this server |
| `413` | Request, compressed, inflated or stored bundle exceeds a size limit |
| `422` | Invalid fields, base64 or gzip; fix the submitted data |
| `429` | Request rate or daily byte budget exceeded; honor `Retry-After` |
| `503` | Database unavailable or bundle processing capacity busy; retry with backoff |

## Redaction and privacy

The ingestion endpoints redact known secret-shaped keys in structured payloads
and scrub credential patterns in string values. It also scrubs Authorization values,
e-mail addresses, user home-directory names and iOS application-container ids.
Bundle text is scrubbed line by line before being compressed and stored.

This is pattern-based redaction, not an anonymity guarantee. Reports can still
contain titles, names, paths, hosts or other free text your app included. Envelope
identifiers and the account association remain useful for investigation. Do not
submit secrets, full URLs, response bodies, or unrelated personal information on
the assumption that the server will remove everything sensitive.

The web reporter additionally templates paths from known route words and removes
query strings in the browser. It reports uncaught errors, failed API requests,
decode failures, and failures shown as error toasts or player errors. It uses
message keys rather than toast display text. Aborted, offline/background and
expired-sign-in failures are filtered as appropriate by the reporter/caller.
Repeated errors are grouped, with follow-ups at most every five minutes and at
most 20 API-failure reports and 20 error reports per ten minutes per tab. These
are web-client safeguards; other integrations must implement their own.

## Server controls and retention

The following server settings default to enabled:

| Setting | Effect |
| --- | --- |
| `FEATURE_CLIENT_DIAGNOSTICS` | Gates automatic crash, hang, JS/API-error and server-written compatibility reports; disabled client events count as dropped |
| `FEATURE_CLIENT_LOG_BUNDLES` | Gates log bundles separately; disabled uploads return `403` |
| `FEATURE_CLIENT_DIAGNOSTICS_LOG_TAIL` | Allows attached event log tails; disabling it strips tails from incoming events, including playback incidents |

Playback incidents remain enabled when automatic diagnostics are disabled. Their
schema permits log tails and free-text metadata; do not assume they are limited
to anonymous numeric measurements. Disabling a flag does not erase existing rows.
The web app stops its automatic reporter when diagnostics are disabled or the
user is signed out. Platform values in the ingestion schema do not imply that
every app or OS supports the same crash/hang collection capabilities.

| Setting | Default | Applies to |
| --- | --- | --- |
| `CLIENT_DIAGNOSTICS_DAILY_BYTES_PER_USER` | 50 MiB | Rolling 24-hour budget for stored automatic payloads and sanitized bundle gzip; excludes playback and server-written compatibility incidents |
| `CLIENT_DIAGNOSTICS_RETENTION_DAYS` | 30 days | Automatic kinds, including compatibility incidents, by server receipt time |
| `CLIENT_LOG_BUNDLE_RETENTION_DAYS` | 30 days | Bundle rows and their blobs, by receipt time |
| `CLIENT_DIAGNOSTICS_MAX_ROWS_PER_USER` | 1000 | Cleanup cap across non-playback kinds, including bundles and compatibility incidents |
| `PLAYBACK_INCIDENT_RETENTION_DAYS` | 30 days | Playback incidents, by incident time |
| `PLAYBACK_INCIDENT_MAX_ROWS_PER_USER` | 500 | Playback cleanup cap and new incidents accepted through the event endpoint per rolling 24 hours |

Budget checks are serialized per user across events and bundles. Over-budget
automatic events are dropped; bundle uploads return `429`. Retention and stored-row
caps are applied by database cleanup, so they are cleanup targets rather than an
exact deletion deadline. Reports can disappear earlier through row caps or admin
deletion. Do not use diagnostics as a durable audit log.

User data export includes diagnostic rows and bundle text where decompression
and export size/capacity limits allow it; unavailable text is marked as such.
Erasure deletes bundles associated with the subject, including another account's
bundle listing the subject in `accountIds`. It scrubs account links and the
implemented user-derived identifiers/payload fields from other diagnostic rows
while retaining a reduced forensic record. These controls do not make arbitrary
client-provided text safe to publish.

## Operator review and retrieval

Admins use **Admin → Users → Client Diagnostics** (`/admin/users/client-diagnostics`).
Search by the user's reference or note; filter by kind, platform, user, device,
app version, fingerprint, resolved state and time. Correlate `attemptId`,
`playSessionId`, event time and server request ids when investigating a failure.

The detailed operator API is internal: `GET /api/admin/diagnostics`,
`GET /api/admin/diagnostics/{id}`, and
`GET /api/admin/diagnostics/{id}/blob?format=text` (or `format=gzip`, the default).
These require administrator access and expose payloads or bundle contents. They
are not user-readable `/api/v1/diagnostics` retrieval endpoints. There is no
client endpoint to fetch a submission by its `shortId`.

For delegated investigation, the separate **beta**
`GET /api/v1/admin/debug-report` and
`GET /api/v1/admin/debug-report/client-diagnostics/{fingerprint}` accept an admin,
or a service token with `diagnostics:read` whose owner is still an admin. The
group route uses the fingerprint returned by the report, covers the last 24 hours,
and permits one request per two seconds per credential. It returns redacted group
samples and client-written summaries, without raw payloads or blobs. The
`diagnostics:read` grant does not authorize the internal detailed operator API.
Treat client-written summaries as untrusted text.

### Jellyfin-compatible apps

When Jellyfin compatibility is available, Lumastra can record `compat_incident`
when a client requests PlaybackInfo but never starts streaming: after repeated
misses on the same device, or a miss with a response-contract violation. It
records at most one per device/app version per day and keeps a bounded sample
of misses with technical media characteristics. This is a failure signal, not
proof that the app crashed. It is gated by `FEATURE_CLIENT_DIAGNOSTICS`.

Some Jellyfin clients upload logs through `/j` ClientLog. Lumastra stores these as
`log_bundle` with `source: jellyfin`, subject to bundle gating, scrubbing and the
user byte budget. Identical retries are deduplicated; when a device id is present,
it keeps the newest five uploads for that user/device. General bundle retention
and cleanup caps also apply. A third-party client's logging and consent controls
are managed by that client.

For these Jellyfin rows, the admin UI can preview a GitHub report when that
capability is available in the build. The preview adds redaction for ids, IPs,
hosts and credentials, but log excerpts can still hold titles, names and paths.
Review the complete preview before sharing. Opening a prefilled issue or
downloading the report does not submit it; the admin decides what to publish.

See [what Lumastra sends where](/reference/data-flows/) and
[building a player](/developers/building-a-player/) for related data and playback flows.
