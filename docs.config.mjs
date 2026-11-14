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
export const REPOS_PUBLIC = true;

/** @type {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} */
export const sidebar = [
	{
		label: 'Install',
		items: [
			{ label: 'Quick Start (Compose)', slug: 'start/quick-start' },
			{ label: 'Docker in production', slug: 'guides/deploy-docker' },
			{ label: 'Kubernetes', slug: 'guides/deploy-kubernetes' },
			{ label: 'Kubernetes advanced', slug: 'guides/deploy-kubernetes-advanced' },
			{ slug: 'guides/reverse-proxy' },
			{ label: 'Sign-in', slug: 'guides/authentication' },
			{ slug: 'guides/gpu-transcoding' },
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
			{ slug: 'guides/live-tv-simple-mode' },
			{ slug: 'guides/integrations' },
			{ slug: 'guides/media-enrichment' },
			{ slug: 'guides/ai-assistant' },
			{ slug: 'guides/homepage-dashboard' },
		],
	},
	{
		label: 'Using Lumastra',
		items: [{ autogenerate: { directory: 'using' } }, { slug: 'guides/push-notifications' }],
	},
	{
		label: 'Running it',
		items: [
			{ slug: 'guides/administration' },
			{ slug: 'guides/administration-operations' },
			{ slug: 'guides/parental-controls' },
			{ slug: 'guides/sharing-privacy' },
			{ slug: 'guides/backup-recovery' },
			{ slug: 'guides/master-key-rotation' },
			{ label: 'Upgrading', slug: 'guides/zero-downtime-updates' },
			{ slug: 'guides/task-basics' },
			{ slug: 'guides/task-monitoring' },
			{ slug: 'guides/task-troubleshooting' },
			{ slug: 'guides/library-troubleshooting' },
			{ slug: 'guides/debugging-with-ai' },
			{ slug: 'guides/performance-tuning' },
			{ slug: 'guides/windows-media-shares' },
			{ slug: 'guides/waf-ips-crowdsec' },
			{ slug: 'guides/configuration' },
		],
	},
	{
		label: 'Reference',
		items: [{ autogenerate: { directory: 'reference' } }],
	},
	{
		label: 'Developers & project',
		items: [
			{ label: 'The Lumastra story', slug: 'about/story' },
			{ label: 'Changelog', slug: 'about/changelog' },
			{ label: 'How it fits together', slug: 'architecture/overview' },
			{ slug: 'architecture/live-tv' },
			{ slug: 'architecture/playback-decisions' },
			{ slug: 'architecture/task-system' },
			{ slug: 'developers/api' },
			{ slug: 'developers/api-routes' },
			{ slug: 'developers/oauth-clients' },
			{ slug: 'developers/plugins' },
			{ slug: 'guides/plugins' },
			{ slug: 'developers/client-diagnostics' },
			{
				label: 'Building a player',
				items: [
					{ label: 'Overview', slug: 'developers/building-a-player' },
					{ slug: 'developers/building-a-player-streaming' },
					{ slug: 'developers/building-a-player-state' },
					{ slug: 'developers/live-tv-playback' },
					{ slug: 'developers/offline-downloads' },
					{ slug: 'developers/library-sync' },
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
];

/** Options shared by both sites. Spread into `starlight({ ... })`. */
export const starlightDocs = {
	title: 'Lumastra',
	description:
		'Self-hosted media server for Docker Compose or Kubernetes: movies, series, music, audiobooks and Live TV.',
	components: { Footer: './src/components/DocsFooter.astro' },
	logo: {
		light: './src/assets/lumastra-logo-light.svg',
		dark: './src/assets/lumastra-logo-dark.svg',
		// The horizontal logo already includes the wordmark, so hide the
		// duplicate text title in the header.
		replacesTitle: true,
	},
	social: [
		...(REPOS_PUBLIC
			? [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Sapd/lumastra' }]
			: []),
		{ icon: 'discord', label: 'Discord', href: 'https://discord.gg/ZhaFYkuqq9' },
	],
	editLink: REPOS_PUBLIC
		? { baseUrl: 'https://github.com/Sapd/lumastra-docs/edit/main/' }
		: undefined,
	// Pagefind site search is on by default.
	customCss: ['./src/styles/theme.css'],
	sidebar,
};

/**
 * Pages that were merged into others. Both sites must serve these paths, so lumastra.org
 * spreads this map into its own `redirects` (see astro.config.mjs in this repository).
 * Keep a path here for as long as outside links (blog posts, search results) may use it.
 */
export const redirects = {
	'/start/introduction/': '/start/quick-start/',
	'/guides/deployment/': '/start/quick-start/',
	'/guides/sso-oidc/': '/guides/authentication/#if-you-use-another-oidc-provider',
	'/guides/sso-authentik/': '/guides/authentication/#set-up-authentik',
	'/guides/licensing/': '/about/story/#licence',
};

/** Options for starlight-links-validator, shared by both sites. */
export const linksValidatorOptions = {
	// /reference/ is the API reference page, /openapi/ the raw spec and /demo/
	// the landing page demo. All three are part of lumastra.org, not of the docs.
	exclude: ['/reference/', '/openapi/**', '/demo/**'],
};
