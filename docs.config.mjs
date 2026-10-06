// @ts-check
// Starlight settings for the Lumastra docs. This file is the single source:
// the standalone docs site (astro.config.mjs in this repo) and the full
// lumastra.org site both read it, so a sidebar change made here shows up in
// both places.
//
// Paths are relative to the project root. The lumastra.org site keeps these
// files at the same paths, so they resolve there too.

// Set to true once github.com/Sapd/lumastra and github.com/Sapd/lumastra-docs
// are public. While false, the header GitHub link and the "Edit page" links are
// left out, because they would 404 for readers.
export const REPOS_PUBLIC = false;

/** @type {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} */
export const sidebar = [
	{
		label: 'Start Here',
		items: [
			{ label: 'Introduction', slug: 'start/introduction' },
			{ label: 'Quick Start', slug: 'start/quick-start' },
		],
	},
	{
		label: 'Using Lumastra',
		items: [{ autogenerate: { directory: 'using' } }],
	},
	{
		label: 'Guides',
		items: [
			{
				label: 'Configuration',
				items: [{ slug: 'guides/configuration' }, { slug: 'guides/integrations' }],
			},
			{
				label: 'Accounts & access',
				items: [
					{ label: 'Overview', slug: 'guides/authentication' },
					{ slug: 'guides/sso-authentik' },
					{ slug: 'guides/sso-oidc' },
					{ slug: 'guides/parental-controls' },
					{ slug: 'guides/sharing-privacy' },
				],
			},
			{
				label: 'Your media',
				items: [
					{ slug: 'guides/organizing-media' },
					{ slug: 'guides/organizing-music' },
					{ slug: 'guides/music-discovery' },
					{ slug: 'guides/audiobooks' },
					{ slug: 'guides/live-tv' },
					{ slug: 'guides/media-enrichment' },
					{ slug: 'guides/ai-assistant' },
					{ slug: 'guides/push-notifications' },
				],
			},
			{
				label: 'Deployment & operations',
				items: [
					{ slug: 'guides/deployment' },
					{ slug: 'guides/deploy-docker' },
					{ slug: 'guides/reverse-proxy' },
					{ slug: 'guides/deploy-kubernetes' },
						{ slug: 'guides/zero-downtime-updates' },
					{ slug: 'guides/gpu-transcoding' },
					{ slug: 'guides/performance-tuning' },
					{ slug: 'guides/windows-media-shares' },
					{ slug: 'guides/waf-ips-crowdsec' },
					{ slug: 'guides/backup-recovery' },
					{ slug: 'guides/master-key-rotation' },
				],
			},
			{
				label: 'Administration',
				items: [
					{ slug: 'guides/administration' },
					{ slug: 'guides/administration-operations' },
					{ slug: 'guides/plugins' },
					{ slug: 'guides/task-basics' },
					{ slug: 'guides/task-monitoring' },
					{ slug: 'guides/task-troubleshooting' },
					{ slug: 'guides/homepage-dashboard' },
					{ slug: 'guides/licensing' },
				],
			},
		],
	},
	{
		label: 'Architecture',
		items: [{ autogenerate: { directory: 'architecture' } }],
	},
	{
		label: 'Developers',
		items: [
			{ slug: 'developers/api' },
			{ slug: 'developers/api-routes' },
			{ slug: 'developers/oauth-clients' },
			{ slug: 'developers/plugins' },
			{ slug: 'developers/client-diagnostics' },
			{
				label: 'Building a player',
				items: [
					{ label: 'Overview', slug: 'developers/building-a-player' },
					{ slug: 'developers/building-a-player-streaming' },
					{ slug: 'developers/building-a-player-state' },
					{ slug: 'developers/live-tv-playback' },
					{ slug: 'developers/offline-downloads' },
					{ slug: 'developers/music-playback' },
					{ slug: 'developers/audiobook-playback' },
					{ slug: 'developers/watch-together' },
				],
			},
			{
				label: 'Contributing',
				items: [
					{ slug: 'developers/local-development' },
					{ slug: 'developers/architecture-decisions' },
				],
			},
		],
	},
	{
		label: 'Reference',
		items: [{ autogenerate: { directory: 'reference' } }],
	},
	{
		label: 'About',
		items: [{ label: 'The Lumastra story', slug: 'about/story' }, { label: 'Changelog', slug: 'about/changelog' }],
	},
];

/** Options shared by both sites. Spread into `starlight({ ... })`. */
export const starlightDocs = {
	title: 'Lumastra',
	description:
		'Self-hostable media aggregation with AI-powered recommendations. Built on SvelteKit.',
	components: { Footer: './src/components/DocsFooter.astro' },
	logo: {
		light: './src/assets/lumastra-logo-light.svg',
		dark: './src/assets/lumastra-logo-dark.svg',
		// The horizontal logo already includes the wordmark, so hide the
		// duplicate text title in the header.
		replacesTitle: true,
	},
	social: REPOS_PUBLIC
		? [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Sapd/lumastra' }]
		: [],
	editLink: REPOS_PUBLIC
		? { baseUrl: 'https://github.com/Sapd/lumastra-docs/edit/main/' }
		: undefined,
	// Pagefind site search is on by default.
	customCss: ['./src/styles/theme.css'],
	sidebar,
};

/** Options for starlight-links-validator, shared by both sites. */
export const linksValidatorOptions = {
	// /reference/ is the API reference page, /openapi/ the raw spec and /demo/
	// the landing page demo. All three are part of lumastra.org, not of the docs.
	exclude: ['/reference/', '/openapi/**', '/demo/**'],
};
