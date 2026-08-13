import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Element, Root } from 'hast';

/** Turns fenced ```mermaid blocks into <pre class="mermaid"> placeholders for client-side rendering. */
const mermaidBlockPlugin: Plugin<[], Root> = () => (tree) => {
	visit(tree, 'element', (node: Element, index, parent) => {
		if (node.tagName !== 'pre' || !parent || index === undefined) {
			return;
		}
		const codeChild = node.children.find(
			(child): child is Element => child.type === 'element' && child.tagName === 'code'
		);
		if (!codeChild) {
			return;
		}
		const className = (codeChild.properties?.className as string[] | undefined) || [];
		if (!className.includes('language-mermaid')) {
			return;
		}
		const textChild = codeChild.children.find((child) => child.type === 'text');
		const source = textChild && textChild.type === 'text' ? textChild.value : '';
		const mermaidNode: Element = {
			type: 'element',
			tagName: 'pre',
			properties: { className: ['mermaid'] },
			children: [{ type: 'text', value: source }],
		};
		(parent as Element).children[index] = mermaidNode;
	});
};

/** Stamps each hast element with its Markdown source line range so the webview can map a DOM node back to `file.md:start-end`. */
const sourceLinePlugin: Plugin<[], Root> = () => (tree) => {
	visit(tree, 'element', (node: Element) => {
		if (node.position) {
			node.properties = {
				...node.properties,
				dataLineStart: node.position.start.line,
				dataLineEnd: node.position.end.line,
			};
		}
	});
};

/** Rewrites `<img src>` through the caller-supplied resolver, e.g. to a `webview.asWebviewUri` so relative images load under the webview's CSP. */
const imageSrcPlugin = (resolveImageSrc: (src: string) => string): Plugin<[], Root> => () => (tree) => {
	visit(tree, 'element', (node: Element) => {
		const src = node.tagName === 'img' && node.properties?.src;
		if (typeof src === 'string') {
			node.properties!.src = resolveImageSrc(src);
		}
	});
};

export async function renderMarkdownToHtml(
	source: string,
	resolveImageSrc: (src: string) => string = (src) => src
): Promise<string> {
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkMath)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(sourceLinePlugin)
		.use(rehypeRaw)
		.use(mermaidBlockPlugin)
		.use(imageSrcPlugin(resolveImageSrc))
		.use(rehypeKatex)
		.use(rehypeStringify, { allowDangerousHtml: true });
	const file = await processor.process(source);
	return String(file);
}
