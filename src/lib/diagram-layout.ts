import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/svelte';

const elk = new ELK();

// SVG text uses a fixed-width font, so the layout engine reserves exactly the
// same space that the rendered labels occupy. Long tokens wrap as well.
export function wrap(text: string, columns: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (let word of text.split(/\s+/)) {
		if (line && line.length + word.length + 1 > columns) { lines.push(line); line = ''; }
		while (word.length > columns) { lines.push(word.slice(0, columns)); word = word.slice(columns); }
		if (word) line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push(line);
	return lines;
}

export async function layoutDiagram(nodes: Node[], edges: Edge[]) {
	const nodeText = new Map(nodes.map((node) => [node.id, {
		title: wrap(String(node.data.title), 24),
		sub: wrap(String(node.data.sub ?? ''), 28),
		kind: String(node.data.kind ?? 'default'),
	}]));
	const graph = await elk.layout({
		id: 'root',
		layoutOptions: {
			'elk.algorithm': 'layered',
			'elk.direction': 'DOWN',
			'elk.edgeRouting': 'ORTHOGONAL',
			'elk.padding': '[top=28,left=28,bottom=28,right=28]',
			'elk.spacing.nodeNode': '65',
			'elk.spacing.edgeNode': '25',
			'elk.spacing.edgeEdge': '20',
			'elk.layered.spacing.nodeNodeBetweenLayers': '35',
			'elk.layered.spacing.edgeNodeBetweenLayers': '25',
			'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
			'elk.edgeLabels.placement': 'CENTER',
			'elk.layered.mergeEdges': 'false',
		},
		children: nodes.map((node) => {
			const text = nodeText.get(node.id)!;
			return { id: node.id, width: 230, height: 28 + text.title.length * 20 + text.sub.length * 17 + (text.sub.length ? 6 : 0) };
		}),
		edges: edges.map((edge) => {
			const lines = wrap(String(edge.label ?? ''), 28);
			return { id: edge.id, sources: [edge.source], targets: [edge.target], labels: lines.length ? [{
				id: `${edge.id}-label`, text: lines.join('\n'),
				width: Math.max(...lines.map((line) => line.length)) * 7.8 + 16,
				height: lines.length * 18 + 12,
			}] : [] };
		}),
	});
	return {
		width: graph.width!, height: graph.height!,
		nodes: graph.children!.map((node) => ({ ...node, ...nodeText.get(node.id)! })),
		edges: graph.edges!.map((edge) => ({ ...edge,
			path: edge.sections!.map((section) => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
				.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')).join(' '),
		})),
	};
}
