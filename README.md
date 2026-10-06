# Lumastra documentation

This repository holds the documentation for [Lumastra](https://github.com/Sapd/lumastra),
a self-hostable media server. The pages are published at
[lumastra.org](https://lumastra.org/start/introduction/).

Every page on the site has an "Edit page" link that opens the file here. Fixes,
clarifications and new pages are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Preview locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:4321>. The dev server reloads when you save a file.

`npm run build` builds the site into `dist/` and checks every internal link. CI runs the
same command on each pull request.

## Layout

| Path                         | What it is                                                     |
| ---------------------------- | -------------------------------------------------------------- |
| `src/content/docs/<section>/` | The pages, as Markdown (`.md`) or MDX (`.mdx`)                |
| `docs.config.mjs`            | Sidebar and other Starlight settings                           |
| `src/components/diagrams/`   | The diagrams embedded in some pages                            |
| `src/styles/theme.css`       | Colors and fonts                                               |
| `public/install.md`          | Install instructions for AI agents, served at `/install.md`    |
| `site-files.txt`             | The files that lumastra.org takes from this repository        |

The URL of a page follows its path: `src/content/docs/guides/backup-recovery.md` is
`/guides/backup-recovery/`.

## How changes reach lumastra.org

lumastra.org is built from a separate repository that contains the landing page and the
API reference. It copies the files listed in `site-files.txt` from the `main` branch of
this repository. After a pull request is merged, the site picks up the change and
redeploys, usually within a few minutes and at most about an hour later. Nobody has to do
anything by hand.

## License

Everything in this repository is licensed under the [MIT No Attribution License](LICENSE)
(MIT-0): the documentation text, images, code samples and the site's source files. You can
copy, adapt and republish it, and paste the samples into your own setup, without keeping a
notice. A link back to the page you used is appreciated, not required.

Two exceptions:

- The Lumastra logo files in `src/assets/` and `public/favicon.svg` are brand assets, all
  rights reserved
  ([LicenseRef-Lumastra-Branding](https://github.com/Sapd/lumastra/blob/main/LICENSES/LicenseRef-Lumastra-Branding.txt)).
  They are here only so the preview looks like the real site. The Lumastra name and logos
  are trademarks of Denis Arnst.
- Material that a page marks as third-party keeps its own license.

Contributions are accepted under the
[Lumastra Contributor License Agreement](https://github.com/Sapd/lumastra/blob/main/.github/CLA.md),
and the project publishes them under the license above. The Lumastra software itself is
licensed separately; see its [repository](https://github.com/Sapd/lumastra).
