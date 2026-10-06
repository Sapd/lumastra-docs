---
title: The Lumastra story
description: How Lumastra grew from a small dashboard into a self-hosted media server, and how it is built.
---

Lumastra started as a dashboard, not as a media server. It could recommend movies before
it could play them, and for a long time it ran on top of Jellyfin. Here is how it got
from there to where it is now.

## 2023: a dashboard

I made the first commit in June 2023. It was a private project, my own replacement for
Organizr: one page that showed what my other self-hosted services were doing. Streaming
sessions, a series calendar, trailers, and links into Jellyfin and Audiobookshelf. To
watch something you clicked through to Jellyfin. There was no AI and no streaming of its
own.

I never planned to replace Jellyfin. Writing a whole media server just to do what
Jellyfin already does didn't seem worth it. AI changed that for me. I wanted something
that doesn't only play my library but understands what is in it.

## 2025: a rewrite, with AI

In August 2025 I picked the project up again and rewrote it from scratch in SvelteKit.
The AI part started small. I created embeddings for my library and used similarity
search to find titles that are alike. Then I added swipe-to-rate for movies (left for
no, right for yes), and those ratings went straight into the recommendations. The AI
chat assistant followed in November 2025.

So for a few months the project could tell you what to watch, but not play it.

## Late 2025: a player, still powered by Jellyfin

The video player came in December 2025. At first it didn't stream anything itself. It
proxied and rewrote Jellyfin's streams: Jellyfin did the streaming, and my project added
the player and Watch Together on top.

## Early 2026: streaming on its own

This happened step by step. First it ran its own FFmpeg for audio. In January 2026 it
got full transcoding with GPU acceleration. In February 2026 it could finally stream
files directly from disk, without Jellyfin. A file scanner and a proper library model
followed a few days later.

From then on Jellyfin was only an optional sync source, which is the opposite of how the
project started.

## Spring 2026: more kinds of media

With its own libraries in place, a lot got added quickly:

- Music, with audio analysis and MusicBrainz metadata
- Audiobooks and books through Audiobookshelf and Kavita
- A Jellyfin-compatible API (`/j`), so Jellyfin and Streamyfin apps can connect directly
- An OpenSubsonic API for Subsonic music apps

That was the busiest time so far, with thousands of commits a month.

## 2026: native Apple apps

In January 2026 a friend started a native tvOS app for Lumastra. It has two playback
engines (MPV and AVPlayer), trickplay scrubbing, and its own HLS playlists that handle
several audio and subtitle languages properly. Watch Together works in it.

It has since grown into native apps for iPhone, iPad and Apple TV, with offline downloads
on iPhone and iPad and Top Shelf on Apple TV. The apps sign in with the standard OAuth
device flow, so they also work when your server sits behind single sign-on. They go into
public TestFlight together with the open-source release.

## 2026: a name and a license

The project was internal at first, then called Stellar in early 2026, and in June 2026
it became Lumastra. At the same time I chose the AGPL-3.0 license and an open-core model:
a free open-source core plus two source-available supporter modules, the `/j` API and the
AI chat assistant, which are free during early access.

## October 2026: v0.1

In October 2026 the code goes public at
[github.com/Sapd/lumastra](https://github.com/Sapd/lumastra) as v0.1. I use it for my
own library every day, but it hasn't seen most hardware and setups yet. Expect bugs, and please [report them](https://github.com/Sapd/lumastra/issues).

## How I use AI

About me: I'm Denis ([@Sapd](https://github.com/Sapd) on GitHub). I have a master's in
computer science and have been doing open source for years. I wrote
[HeadsetControl](https://github.com/Sapd/HeadsetControl), a tool for controlling gaming
headsets on Linux, Windows and macOS, and I implemented OIDC login in
[Audiobookshelf](https://audiobookshelf.org).

I started using LLMs in December 2024, mostly for code review or a second opinion on a
design. From April 2025 I used Claude, through Claude Code, more and more, and by 2026
it's a big reason one person could build this much.

Mostly I use it for scaffolding, refactoring, finding my way around old code, tests,
documentation and first drafts. I also talk designs through with it and ask it to argue
against my idea and hunt for edge cases. That usually makes the design better. But it's
wrong often enough, and sounds confident when it is, so I keep the decisions: the data
model, the critical code paths, what gets merged. I review what lands and don't ship code
I don't understand myself.

It's also not quick or cheap. A real feature goes through several rounds. For bigger ones
I often plan with the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD), where I
sit with a panel of AI roles (product, architecture, testing) and still make the calls
myself. Other times I just talk a feature through and hand it to separate sessions, say
one for the frontend and one for the backend, and let them talk to each other. For the
biggest jobs I run a full workflow spread across many agents. Then it gets built, then
reviewed. The edge-case reviews eat the most tokens, and I also run them through a second
model (OpenAI's Codex), so one model isn't just grading its own work. A big feature can
burn through the weekly limit on Claude's largest plan twice.

None of this replaces being a developer. The AI proposes. Someone still has to catch a bad
design and push back with something better. Small features, and a lot of frontend work,
could in theory be vibe-coded. The parts holding the whole thing together need someone who
actually understands them. And every change, however small, gets tested end to end before
it ships, same as before I used AI at all. What changed is that writing those extra tests
got a lot cheaper, so there's less excuse to skip them. I don't take the AI's word for
anything. If it says a feature works, the architecture is sound or a review is complete,
I check it myself.

Bugs still get through, like in any project. Testing is what catches most of them. There
are more than 2,500 test files in the repo, from unit tests to browser tests, and AI
helped write a lot of them. Automated tests only catch so much, so my friends and I also
test a lot by hand. It's tedious, and it's where the real problems turn up.

Security got extra rounds. Before the public release the code went through several
security reviews, and I checked every finding against the code myself instead of taking it
on faith. Then I tested on a pre-production server what those reviews could only read from
the source: race conditions, what happens when someone gets removed from the identity
provider, what a reverse proxy actually forwards. Everything the reviews found got fixed,
though a couple of the fixes needed a fix of their own, which is exactly why I measured
instead of just trusting the review.

Contributions made with AI are welcome under the same rule: you're the author, so you need
to understand and have actually run what you submit. See
[CONTRIBUTING-AI.md](https://github.com/Sapd/lumastra/blob/main/.github/CONTRIBUTING-AI.md).

## Next

- [Quick start](/start/quick-start/)
- [Editions & licensing](/guides/licensing/)
- [Architecture overview](/architecture/overview/)
