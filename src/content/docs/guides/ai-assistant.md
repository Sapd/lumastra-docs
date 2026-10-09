---
title: The AI assistant
description: What Lumastra's AI chat assistant does, the key it needs, its usage limits, and where to tune its behavior.
sidebar:
  order: 3.75
---

The AI chat assistant needs an OpenAI or Anthropic API key of your own. Lumastra
doesn't supply one.

The assistant is a chat interface built on your library's metadata and AI
embeddings. It answers questions about your catalog and makes recommendations in
conversation, for example "something like *Metropolis* but shorter" or "what have
I not finished from last month". It's one of Lumastra's two **supporter modules**
(source-available, free during early access), next to the Jellyfin-compatible `/j`
API.

:::note[Bring your own key]
Lumastra is **bring-your-own-key** for AI: it proxies your own OpenAI or
Anthropic account and has no model access of its own. The chat assistant's key is
separate from the embedding key used for recommendations and semantic search. See
[Optional integrations → AI](/guides/integrations/#ai) for both.
:::

## What it can do

By default the assistant only **reads**. It answers questions from your library's
metadata and embeddings, and it can suggest what to request, but only for people an
admin has given request permission. Two capabilities are opt-in and off by default:

- **Write actions**: the assistant can change *your own* data when you ask it to.
  It can add to or remove from your watchlist, set or clear a rating, mark something
  watched or unwatched, or submit a media request. It only acts on the data of the
  person asking.
- **Shared watch history**: the assistant can use another person's watch history
  for a joint recommendation ("something we'd both like"). This is limited by the
  same **listening/watching audience** used elsewhere for activity sharing.

Tool-calling (the assistant picks a typed, scoped action instead of doing a single
retrieval pass) is on by default. For chat models that don't support it, the
assistant falls back automatically.

## Usage limits

Daily token budgets and informational message counts have separate user and admin
settings. The per-user rate limit and concurrency cap use the same settings for
everyone:

- **A daily token budget.** This is the limit that stops a reply. A tool-calling
  reply can cost several times as much as a simple one, so the cap is on AI tokens
  used per day, not on the number of messages.
- **A per-user rate limit and concurrency cap**: requests per minute, and how many
  requests one person can have running at once.

The admin UI also shows a daily *message* count as a rough sense of usage. It
doesn't limit anything.

## Where to configure it

All of the above is in **Admin → Settings → AI**: the assistant's display name,
persona and tone, the daily token budgets, rate limits, write actions, shared
history, and conversation-history length. Each setting can also be set through an
environment variable of the same name (for example `ASSISTANT_NAME`,
`ASSISTANT_DAILY_TOKEN_LIMIT_USER`). An environment variable wins over a value saved
in Settings. Most self-hosters use the UI and only set an environment variable when
they want to pin a value regardless of what's saved.

The chat API keys (`OPENAI_CHAT_API_KEY`, `ANTHROPIC_API_KEY`) follow the same rule.
They are sensitive, so setting them as environment variables is safer than typing
them into the UI. See [Optional integrations](/guides/integrations/#ai).

The defaults suit a small household. Raise the token budgets if replies get cut
off, or lower them if one heavy user uses up the daily allowance for everyone else.
A few advanced settings (forcing tool-calling on for custom endpoints, the
conversation-history compaction strategy) sit behind an "advanced" toggle and aren't
documented key by key here.

:::tip[Restart required]
Most assistant settings apply live. A few need a server restart: turning the
assistant on or off, and turning tool-calling or write actions on or off.
:::

## Next

- [Optional integrations](/guides/integrations/): the OpenAI, Anthropic and Voyage
  keys the assistant and embeddings need
- [Chapters, skip intro & trickplay](/guides/media-enrichment/): the AI embeddings
  the assistant reads from
- [Sharing & privacy](/guides/sharing-privacy/): the audience that limits shared
  watch history
- [Administering Lumastra](/guides/administration/): the rest of the admin Settings
