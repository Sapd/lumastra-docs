# Contributing to the Lumastra docs

Thanks for helping. Small fixes (a typo, a wrong default, a broken command) can go
straight to a pull request. For a new page or a larger rewrite, open an issue first so we
can agree on the scope.

## Preview your change

```bash
npm install
npm run dev
```

Open <http://localhost:4321> and check the page you changed. Before you open the pull
request, run:

```bash
npm run build
```

The build fails on a broken internal link. CI runs the same build on every pull request.

## Where things go

- Pages live in `src/content/docs/<section>/`. The path is the URL:
  `guides/backup-recovery.md` becomes `/guides/backup-recovery/`.
- Don't rename or move a page without a good reason. Other sites, the Lumastra server and
  the apps link to these URLs.
- New pages need an entry in the sidebar in `docs.config.mjs`, unless the section uses
  `autogenerate` (`using`, `architecture`, `reference`). There, set `sidebar.order` in
  the frontmatter.
- Every page needs `title` and `description` in its frontmatter.
- Use `.md` for plain text. Use `.mdx` when the page imports a component, such as a
  diagram or Starlight's `Steps`, `Tabs` and `TabItem`.
- Callouts (`:::note`, `:::tip`, `:::caution`, `:::danger`) work in `.md` without an
  import.
- Link to other pages with a root-relative path and a trailing slash:
  `[Backup and recovery](/guides/backup-recovery/)`.

### Diagrams

The diagrams in `src/components/diagrams/` are generated at build time from the nodes and
edges in each file. After you change one, run `npm run diagrams` (the `dev` and `build`
scripts do this too) and commit the updated `layouts.json`. Embed a diagram from an
`.mdx` page like this:

```mdx
import AuthFlowDiagram from '../../../components/diagrams/AuthFlowDiagram.astro';

<AuthFlowDiagram />
```

## Style

- Write plain, short sentences. One idea per sentence.
- Describe what the software does. Don't contrast it with what it doesn't do
  ("X, not Y"), unless a reader would otherwise get it wrong.
- No marketing words: no "powerful", "seamless", "blazing fast", "effortless" and the
  like.
- No emojis.
- Use only public-domain or openly licensed titles in examples, for example
  *Nosferatu* (1922).
- Don't name prices.
- Don't add hostnames, IP addresses, user names or other details from your own setup.
  Use `example.com`, `192.168.1.50` and similar placeholders.
- The request feature gets a short, neutral mention only: a user can ask the server's
  admin to add a title. We don't accept guides or example setups for request services or
  download tools.
- Wrap prose at about 90 characters, and match the formatting of the page you edit.
  Don't run Prettier or another formatter over `.mdx` files; it breaks them.
- Facts have to match the software. If you aren't sure how something behaves, say so in
  the pull request, and we'll check it against the code.
- If an AI tool helped you write the change, check every statement against the software
  yourself and say so in the pull request.

## Licensing and the CLA

Merged contributions are published under the [MIT No Attribution License](LICENSE) (MIT-0),
like the rest of this repository (except the logo files, see the README). You keep your
copyright.

Contributions need the
[Lumastra Contributor License Agreement](https://github.com/Sapd/lumastra/blob/main/.github/CLA.md).
It is one agreement for all Lumastra repositories, including this one. On your first pull
request a bot asks you to sign it by posting one sentence as a comment. If you have already
signed on another Lumastra repository, you won't be asked again.

Screenshots, images and quoted text have to be your own, or their license has to allow
publishing them under MIT-0 (public domain, CC0, MIT-0, 0BSD); name the source in the pull
request. Material that needs attribution is accepted only if the page keeps its notice and the
pull request says so. Screenshots must not show
real user names, hostnames, e-mail addresses or other people's media. Use the demo data or
public-domain titles.

## Code of conduct

The [Lumastra Code of Conduct](https://github.com/Sapd/lumastra/blob/main/.github/CODE_OF_CONDUCT.md)
applies here.

## Questions

Ask in the [Q&A discussions](https://github.com/Sapd/lumastra/discussions/categories/q-a)
of the main repository.
