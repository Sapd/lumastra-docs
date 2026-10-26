---
title: Multipart episodes
description: Review several physical files as one continuous episode while keeping complete alternate releases separate.
---

A multipart version joins two or more physical files into one episode playback clock.
The episode keeps its existing identity, watch history and saved progress. A complete
alternate release remains a separate version; it is never appended to the parts.

This requires multipart support in both the server and the player. Current support uses
HLS with full transcoding, so FFmpeg and permission to transcode are required.

## Compose and review a version

1. Open the series in **Admin → Library → Media**, then open **Files** and
   **Reviewed multipart playback**.
2. Choose the canonical destination episode. Inspect the actual audiovisual content of
   every proposed part and select the files in playback order. File names and part-number
   metadata alone do not establish the episode identity or order.
3. Record the inspected content and the reason for each part's position. If a file belongs
   to a different episode, explicitly choose whether to replace its current episode links.
   Review the displayed removed and added links. Files with existing bounded windows
   cannot be reassigned as whole files through this action.
4. Choose whether to activate the version, and separately whether to make it the default.
   An inactive draft does not replace ordinary playback.
5. Choose **Review mapping**. Check the ordered parts, effective duration, canonical
   identities, current associations and defaults. Activation over existing nonzero resume
   positions also requires an explicit reviewed position on the new aggregate clock for
   each affected user, with a rationale.
6. Choose **Apply reviewed mapping**. The operation rechecks the review and applies the
   association and version changes together. If files or mappings changed after review,
   refresh the review before applying again; the draft remains available.

Applying a version preserves the source files. It does not merge or delete canonical
episodes, infer provider identities, or guess a season-wide mapping.

## Playback and compatibility

Supported web, iOS and tvOS players select the logical version and use one aggregate
duration and progress clock. Seeking or resuming in a later part uses that same clock.

Players without multipart support use an independent complete release when one exists.
If the episode has only multipart content, an unsupported player receives an explicit
refusal rather than the first part alone. Deactivating an already activated group does
not turn its known parts into complete alternate releases.

Initial multipart support requires complete, compatible files with one matching audio
stream in every part. Trimmed or nonzero part windows cannot be activated. Part-local
subtitles, chapter markers and seek-preview images are omitted until an aggregate
delivery exists. The multipart version itself is not downloadable; an independent
complete release can still be downloaded. Watch Together currently uses complete
physical releases and does not negotiate multipart playback.
