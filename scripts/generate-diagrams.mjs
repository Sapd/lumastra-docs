import { readdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { layoutDiagram } from '../src/lib/diagram-layout.ts';

const directory = new URL('../src/components/diagrams/', import.meta.url);
const layouts = {};
for (const file of (await readdir(directory)).sort()) {
	if (file === 'ArchDiagram.astro' || !file.endsWith('Diagram.astro')) continue;
	const source = await readFile(new URL(file, directory), 'utf8');
	const title = source.match(/title="([^"]+)"/)[1];
	// These frontmatters contain only the checked-in node/edge literals. Keep
	// layout work in Node at build time, outside the Cloudflare renderer.
	const frontmatter = source.split('---')[1].replace(/^\s*import .*$/gm, '');
	const js = ts.transpile(frontmatter, { target: ts.ScriptTarget.ES2022 });
	const { nodes, edges } = Function(`${js}; return { nodes, edges };`)();
	if (layouts[title]) throw new Error(`Duplicate diagram title: ${title}`);
	layouts[title] = await layoutDiagram(nodes, edges);
}
await writeFile(new URL('layouts.json', directory), JSON.stringify(layouts, null, 2) + '\n');
console.log(`Laid out ${Object.keys(layouts).length} connected diagrams.`);
