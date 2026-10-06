// @ts-check
// Standalone build of the Lumastra docs, for previewing changes locally and for
// CI. lumastra.org itself is built from a separate site that pulls in this
// repository; it reads the same docs.config.mjs.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { starlightDocs, linksValidatorOptions } from './docs.config.mjs';

export default defineConfig({
	site: 'https://lumastra.org',
	// The landing page is not part of this repository; open the docs instead.
	redirects: { '/': '/start/introduction/' },
	integrations: [
		starlight({
			...starlightDocs,
			plugins: [starlightLinksValidator(linksValidatorOptions)],
		}),
	],
});
