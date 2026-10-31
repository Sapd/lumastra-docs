---
title: Local development
description: How to set up a Lumastra development environment, run tests, and follow the core code conventions.
sidebar:
  order: 1
---

Build, run, and test Lumastra from source. You'll need Node.js 22 or newer,
Docker with Compose, Git, and a Rust toolchain installed with `rustup`.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| **Node.js** | 22.0.0 | The codebase uses Svelte 5 / Vitest 5 APIs that require Node 22+. Use `.nvmrc` (pin: 24) or any Node ≥ 22. |
| **npm** | 10.x | Bundled with Node 22+ |
| **Docker + Compose** | Docker ≥ 24, Compose ≥ 2.20 | Runs PostgreSQL 18 + pgvector and two Valkeys locally |
| **Git** | any recent | — |
| **Rust** | Pinned in `native/rust-toolchain.toml` | Install with `rustup`; required to build the worker's Rust watcher from source. |

Jellyfin is **not required** for development. The app starts in setup mode and
most UI can be exercised without it.

## Set up and start the dev server

1. **Clone and install.**

   ```bash
   git clone https://github.com/Sapd/lumastra.git
   cd lumastra
   npm install
   ```

2. **Start the infrastructure.** The repo ships a `docker-compose.dev.yml` that
   starts PostgreSQL 18 + pgvector and two Valkeys (the plain `docker-compose.yml`
   name is reserved for an operator's own copy of the example, and is
   gitignored):

   ```bash
   # from the repo root
   cp .env.example .env
   # Edit .env — set POSTGRES_PASSWORD and CACHE_PASSWORD at minimum (see below)
   docker compose -f docker-compose.dev.yml up -d
   ```

   The compose file exposes PostgreSQL on `127.0.0.1:5432` (database
   `lumastra`, user `lumastra`), persistent task/shared-coordination Valkey on
   `127.0.0.1:6379`, and disposable cache Valkey on `127.0.0.1:6380`.

3. **Set environment variables.** Copy `.env.example` to `.env`. The minimum
   set to start a dev server (replace password placeholders with actual values):

   ```bash
   DATABASE_URL=postgresql://lumastra:<POSTGRES_PASSWORD>@localhost:5432/lumastra
   CACHE_URL=redis://default:<CACHE_PASSWORD>@localhost:6380/0
   TASK_CACHE_URL=redis://default:<CACHE_PASSWORD>@localhost:6379/0
   TMDB_API_KEY=<your_tmdb_key>          # required for metadata enrichment

   # --- Dev auth bypass ---
   # Identity headers are FAIL-CLOSED by default. For local dev (no proxy),
   # enable trust-any-proxy so the self-signed DEFAULT_USER identity is accepted:
   LUMASTRA_TRUST_ANY_PROXY=true
   DEFAULT_USER=admin                     # username used when no auth header arrives
   ```

   :::caution
   `LUMASTRA_TRUST_ANY_PROXY=true` is only safe on localhost. Never set it in
   production: use `TRUSTED_PROXY_IPS` with your reverse-proxy CIDR instead
   (see [Authentication](/guides/authentication/)).
   :::

   Key optional vars for richer local testing:

   ```bash
   OPENAI_API_KEY=sk-...                 # embeddings for AI recommendations
   OPENAI_CHAT_API_KEY=sk-...            # the assistant's chat backend
   VOYAGE_API_KEY=...                    # alternative embedding provider
   LUMASTRA_MASTER_KEY=$(openssl rand -hex 32)  # encrypts stored secrets
   LOG_LEVEL=debug                       # verbose server logs
   ```

   Every variable is listed in the
   [environment variables reference](/reference/environment-variables/).

4. **Run migrations and check config.**

   ```bash
   npm run startup-migration
   npm run doctor
   ```

   `npm run doctor` validates your environment (embedding dimensions, DB/cache
   connectivity, proxy posture). A misconfiguration causes a loud startup
   error, so check the output before starting the dev server.

5. **Start the web server and dedicated worker.**

   ```bash
   npm run dev
   ```

   The web server starts on `http://localhost:5173` (Vite default). Hot Module
   Replacement is enabled for `.svelte`, `.ts`, and `.css` files. In a second
   terminal, start exactly one worker:

   ```bash
   npm run dev:worker
   ```

   This builds and runs the lean TypeScript task host, existing tasks/plugins and
   one Rust watcher child. Rust is the only file watcher, including for bare-metal
   and development installs. Web remains separate from task execution.

## Code quality

```bash
npm run check           # svelte-check (type errors)
npm run lint            # ESLint — zero-warning policy (--max-warnings=0)
npm run lint -- --fix   # auto-fixable issues
npm run format          # Prettier
```

:::caution
`npm run lint` is RAM-intensive. **Never run it in parallel** (multiple
terminals or sub-agents simultaneously): it exhausts memory. Always run it
sequentially.
:::

The pre-commit hook (Husky + lint-staged) runs Prettier and ESLint on staged
files automatically.

## Testing

### Unit tests

```bash
npm test                          # all unit tests (excludes *.integration.test.ts)
npm test -- --watch               # watch mode
npm test -- src/lib/utils/...     # single file
npm test -- --coverage
```

Unit tests use Vitest in the Node environment. Component tests use happy-dom
through `vitest.config.components.ts`; `npm test` runs both suites. Tests are
co-located with their source files.

### Integration tests

Integration tests run Vitest against a **real PostgreSQL database**
(`lumastra_tests`). They live next to the services they test and are named
`*.integration.test.ts`.

Bootstrap the test database first (one-time):

```bash
npm run db:test:create     # creates lumastra_tests on localhost:5432
npm run db:test:migrate    # runs all migrations against it
```

Then:

```bash
npm run test:integration                    # all integration tests
npm run test:integration -- <file-path>    # single test file

# Override the target database:
TEST_DATABASE_URL=postgres://user:pass@host:port/lumastra_tests \
  npm run test:integration
```

:::caution[Never point at production]
`TEST_DATABASE_URL` must never point at the live `lumastra` database. The tests
write and truncate rows.
:::

### E2E / API tests

```bash
npm run dev               # start the dev server first
npm run test:e2e:api      # Playwright API tests
```

## Build

```bash
npm run build     # production build → build/
npm run preview   # preview the production build locally
```

The build pipeline: compiles plugins and the stream proxy, runs
`paraglide:compile` for i18n, increments the service-worker version, then runs
Vite. It requires Node ≥ 22 and approximately 4 GB of heap
(`NODE_OPTIONS='--max-old-space-size=4096'` is set automatically).

## The stack

| Layer | Technology |
| --- | --- |
| Framework | SvelteKit + TypeScript (Svelte 5), `@sveltejs/adapter-node` |
| UI | TailwindCSS 4, Skeleton UI |
| Database | PostgreSQL 18 + pgvector |
| Cache / queues | Valkey 9 (Redis-compatible), BullMQ |
| Background jobs | Separate BullMQ worker process |
| AI | OpenAI or Voyage AI embeddings, pgvector similarity, RAG chat |
| Testing | Vitest 5 (unit + integration), Playwright (E2E) |
| Build | Vite 8 |

## Code conventions

These conventions are enforced by ESLint and TypeScript and must be followed in
all contributions.

### Three-tier database pattern

New database code belongs in one of three layers. Do **not** add methods to
the `Database` class (`src/lib/server/database/connection.ts`); it's legacy.

| Tier | Location | Use for |
| --- | --- | --- |
| **Query modules** | `src/lib/server/database/queries/` | Pure SQL functions. First parameter is `sql: postgres.Sql`. No side effects. |
| **Services** | `src/lib/server/services/` | Transactions, race conditions, multi-table writes, external coordination. |
| **Service managers** | `src/lib/server/services/*-manager.ts` | Business logic, write orchestration. Used by routes. |

Routes must call service managers for writes. Direct write queries in route
files are a linted warning.

### Database migrations: two-step registration

Creating a file in `migrations/` is not enough. You must **also** import and
register it in `src/lib/server/database/migrate-schema.ts` in the `MIGRATIONS`
array, or the migration will never run.

### Zod schemas as single source of truth

All API response types are defined as Zod schemas in `src/lib/schemas/`. The
files in `src/lib/types/` re-export types via `z.infer<>`. When adding a new
field:

1. Add to the Zod schema with `.describe('...')` for OpenAPI.
2. Run `npm run openapi:generate`: types update automatically.
3. Prefer `.optional()` over `.nullable()` (Swift client compatibility). Use
   `.nullable()` only when the database or external API returns `null`.
   At service boundaries: `row.field ?? undefined`.

### TypeScript discipline

| Rule | Requirement |
| --- | --- |
| No `any` | Use `unknown` with type guards |
| Explicit return types | Required on all functions, especially `async` |
| Generic collections | `Map<string, MediaItem>`, not `Map<any, any>` |

### ESLint zero-warning policy

`npm run lint` runs with `--max-warnings=0`. All rules must pass before a commit
lands. Key enforced rules:

| Rule | Severity | What it prevents |
| --- | --- | --- |
| No direct `external_ids` writes | ERROR | Bypasses composite-key integrity: use `CatalogService.upsertExternalId()` |
| No `throw error()` in API routes | ERROR | Use `ApiResponses.unauthorized()`, `.notFound()`, `.badRequest()`, `.error()` |
| No direct SQL in route files | WARNING | Use query modules from `src/lib/server/database/queries/` |
| No `sql.unsafe()` | WARNING | Use parameterized template literals: `` sql`...${value}` `` |
| No unscoped `media_items` queries | WARNING | Queries must apply library/age filter or be admin-scoped |
| `has_files = true` filter required | WARNING | Prevents catalog ghost items leaking as playable cards |

See `docs/dev/eslint-exceptions.md` in the repo for documented exceptions.

### Provider-agnostic composite keys

External provider IDs (TMDB, IMDB) are **not unique across media types**. TMDB
ID 1429 maps to both a movie and a TV series. Always identify media by the
composite key `(provider_id, media_type)`:

```typescript
import { ExternalIdMap } from '$lib/server/utils/tmdb-composite-key';
const map = new ExternalIdMap<string>();
map.set(tmdbId, mediaType, internalId);

// SQL — always include media_type
WHERE ei.provider = 'tmdb'
  AND ei.external_id = ${tmdbId}
  AND mi.media_type = ${mediaType}
```

All `CatalogService` methods and embedding functions require a `mediaType`
parameter.

### Media type case handling

Three case conventions coexist. Never string-compare media types directly;
use the comparison helpers:

| Convention | Examples | Used by |
| --- | --- | --- |
| UPPERCASE | `'MOVIE'`, `'SERIES'` | Database, `MediaItem` |
| PascalCase | `'Movie'`, `'Series'` | Jellyfin API |
| lowercase | `'movie'`, `'tv'` | TMDB, playlist items |

```typescript
import { isEpisode, isMovie, isSeries, isSeason } from '$lib/server/utils/media-types';
if (isMovie(item.media_type)) { ... }   // handles any case convention
```

### UUID-first media IDs

The internal UUID (`media_items.id`) is the canonical identifier end-to-end.
Routes use the `withIdResolution` middleware, which resolves any incoming format
(bare UUID, `tmdb:550:movie`, Jellyfin UUID) to `locals.resolvedIds.internalId`.
User-data queries (ratings, watch history, watchlist) use `internalId`
directly, with no `external_ids` join needed in those handlers.

## Next

- [Architecture overview](/architecture/overview/)
- [Architecture decisions](/developers/architecture-decisions/)
- [Authentication](/guides/authentication/)
- [Configuration](/guides/configuration/)
