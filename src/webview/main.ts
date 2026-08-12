import mermaid from 'mermaid';
import type { WebviewMessages } from '../i18nMessages';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
declare const crypto: { randomUUID?: () => string };

interface Comment {
	id: string;
	quote: string;
	comment: string;
	createdAt: number;
	lineStart?: number;
	lineEnd?: number;
}

interface FontMessage {
	fontFamily?: string;
	fontSize?: number;
	lineHeight?: number;
}

const vscodeApi = acquireVsCodeApi();
const i18n = (window as unknown as { __i18n: WebviewMessages }).__i18n;

const LINE_ELIGIBLE_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'TH', 'PRE']);

interface LineRange {
	start: number;
	end: number;
}

let comments: Comment[] = [];
let pendingQuote = '';
let pendingRect: DOMRect | null = null;
let pendingLineRange: LineRange | null = null;
let hoveredLineBlock: HTMLElement | null = null;
let editingId: string | null = null;

function generateId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickMermaidTheme(): 'dark' | 'default' {
	const isDark = document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast');
	return isDark ? 'dark' : 'default';
}

mermaid.initialize({ startOnLoad: false, theme: pickMermaidTheme(), securityLevel: 'strict' });

function renderMermaidBlocks(): void {
	const nodes = Array.from(document.querySelectorAll<HTMLElement>('pre.mermaid'));
	if (nodes.length > 0) {
		// A rendering failure here must not abort the caller's subsequent reapplyHighlights().
		try {
			mermaid.run({ nodes });
		} catch (err) {
			console.error('mermaid render failed', err);
		}
	}
}

/** Wraps a Range in a clickable highlight mark; falls back to extract+insert for ranges spanning element boundaries. */
function wrapRangeWithHighlight(range: Range, id: string): void {
	const mark = document.createElement('mark');
	mark.className = 'comment-highlight';
	mark.dataset.commentId = id;
	mark.addEventListener('click', () => focusCommentInPanel(id));
	try {
		range.surroundContents(mark);
	} catch {
		const fragment = range.extractContents();
		mark.appendChild(fragment);
		range.insertNode(mark);
	}
}

function unwrapHighlightElement(mark: Element): void {
	const parent = mark.parentNode;
	if (!parent) {
		return;
	}
	while (mark.firstChild) {
		parent.insertBefore(mark.firstChild, mark);
	}
	parent.removeChild(mark);
	parent.normalize();
}

/** Walks up from a node to the nearest ancestor element stamped with source line data. */
function findLineRange(node: Node | null): LineRange | null {
	let el: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
	while (el) {
		const startAttr = (el as HTMLElement).dataset?.lineStart;
		const endAttr = (el as HTMLElement).dataset?.lineEnd;
		if (startAttr && endAttr) {
			return { start: Number(startAttr), end: Number(endAttr) };
		}
		el = el.parentElement;
	}
	return null;
}

/** Merges the line ranges found at both ends of a selection Range into a single covering range. */
function computeLineRangeForRange(range: Range): LineRange | null {
	const startInfo = findLineRange(range.startContainer);
	const endInfo = findLineRange(range.endContainer);
	if (!startInfo && !endInfo) {
		return null;
	}
	return {
		start: Math.min(startInfo?.start ?? Infinity, endInfo?.start ?? Infinity),
		end: Math.max(startInfo?.end ?? -Infinity, endInfo?.end ?? -Infinity),
	};
}

/** Finds the nearest line-eligible block ancestor (paragraph, list item, heading, etc.) for the hover-to-comment affordance. */
function findEligibleLineBlock(target: EventTarget | null): HTMLElement | null {
	let el = target instanceof Element ? target : null;
	while (el && el.id !== 'content') {
		if (LINE_ELIGIBLE_TAGS.has(el.tagName) && (el as HTMLElement).dataset.lineStart) {
			return el as HTMLElement;
		}
		el = el.parentElement;
	}
	return null;
}

/** Locates the first occurrence of `quote` among #content's text nodes and returns a Range spanning it. */
function findRangeForQuote(root: HTMLElement, quote: string): Range | null {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	let fullText = '';
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const textNode = node as Text;
		textNodes.push(textNode);
		fullText += textNode.data;
	}

	const startIndex = fullText.indexOf(quote);
	if (startIndex === -1) {
		return null;
	}
	const endIndex = startIndex + quote.length;

	let runningLength = 0;
	let startNode: Text | null = null;
	let startOffset = 0;
	let endNode: Text | null = null;
	let endOffset = 0;

	for (const textNode of textNodes) {
		const nodeStart = runningLength;
		const nodeEnd = runningLength + textNode.data.length;
		if (startNode === null && startIndex >= nodeStart && startIndex < nodeEnd) {
			startNode = textNode;
			startOffset = startIndex - nodeStart;
		}
		if (endNode === null && endIndex > nodeStart && endIndex <= nodeEnd) {
			endNode = textNode;
			endOffset = endIndex - nodeStart;
		}
		runningLength = nodeEnd;
		if (startNode && endNode) {
			break;
		}
	}

	if (!startNode || !endNode) {
		return null;
	}

	const range = document.createRange();
	range.setStart(startNode, startOffset);
	range.setEnd(endNode, endOffset);
	return range;
}

function reapplyHighlights(): void {
	const content = document.getElementById('content');
	if (!content) {
		return;
	}
	for (const entry of comments) {
		if (content.querySelector(`[data-comment-id="${entry.id}"]`)) {
			continue;
		}
		const range = findRangeForQuote(content, entry.quote);
		if (range) {
			wrapRangeWithHighlight(range, entry.id);
		}
	}
}

function pruneRemovedHighlights(current: Comment[]): void {
	const content = document.getElementById('content');
	if (!content) {
		return;
	}
	const ids = new Set(current.map((entry) => entry.id));
	content.querySelectorAll<HTMLElement>('[data-comment-id]').forEach((el) => {
		if (!ids.has(el.dataset.commentId ?? '')) {
			unwrapHighlightElement(el);
		}
	});
}

function flash(el: Element): void {
	el.classList.add('comment-flash');
	setTimeout(() => el.classList.remove('comment-flash'), 800);
}

function focusCommentInPanel(id: string): void {
	const item = document.querySelector(`#comments-list [data-comment-id="${id}"]`);
	if (item) {
		item.scrollIntoView({ behavior: 'smooth', block: 'center' });
		flash(item);
	}
}

function focusHighlightInContent(id: string): void {
	const mark = document.querySelector(`#content [data-comment-id="${id}"]`);
	if (mark) {
		mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
		flash(mark);
	}
}

function updateContent(html: string): void {
	const content = document.getElementById('content');
	if (content) {
		content.innerHTML = html;
		renderMermaidBlocks();
		reapplyHighlights();
	}
}

function applyFont(font: FontMessage): void {
	const root = document.documentElement;
	if (font.fontFamily) {
		root.style.setProperty('--md-font-family', font.fontFamily);
	}
	if (font.fontSize) {
		root.style.setProperty('--md-font-size', `${font.fontSize}px`);
	}
	if (font.lineHeight) {
		root.style.setProperty('--md-line-height', String(font.lineHeight));
	}
}

function hideToolbar(): void {
	const toolbar = document.getElementById('comment-toolbar');
	if (toolbar) {
		toolbar.hidden = true;
	}
}

function hideLineButton(): void {
	const lineBtn = document.getElementById('comment-line-btn');
	if (lineBtn) {
		lineBtn.hidden = true;
	}
	hoveredLineBlock = null;
}

function positionAt(el: HTMLElement, rect: DOMRect, offsetTop = -36): void {
	el.style.top = `${window.scrollY + rect.top + offsetTop}px`;
	el.style.left = `${window.scrollX + rect.left}px`;
}

/** Positions an element at the bottom-right of a rect, e.g. the selection-triggered comment toolbar. */
function positionBottomRightAt(el: HTMLElement, rect: DOMRect): void {
	el.style.top = `${window.scrollY + rect.bottom + 6}px`;
	el.style.left = `${window.scrollX + rect.right}px`;
}

function showToolbarAt(rect: DOMRect): void {
	const toolbar = document.getElementById('comment-toolbar');
	if (!toolbar) {
		return;
	}
	pendingRect = rect;
	toolbar.hidden = false;
	positionBottomRightAt(toolbar, rect);
}

function showCommentInput(): void {
	hideToolbar();
	hideLineButton();
	const inputBox = document.getElementById('comment-input');
	const textarea = document.getElementById('comment-input-text') as HTMLTextAreaElement | null;
	if (!inputBox || !textarea || !pendingRect) {
		return;
	}
	// Fixes the input popover not tracking the selected text / hovered line: it now reuses the same rect the trigger button was shown at.
	positionAt(inputBox, pendingRect);
	inputBox.hidden = false;
	textarea.value = '';
	textarea.focus();
}

function renderCommentsPanel(): void {
	const listEl = document.getElementById('comments-list');
	const titleEl = document.getElementById('comments-panel-title');
	const panelEl = document.getElementById('comments-panel');
	if (!listEl || !titleEl || !panelEl) {
		return;
	}
	const hasComments = comments.length > 0;
	panelEl.hidden = !hasComments;
	document.body.classList.toggle('no-comments', !hasComments);

	titleEl.textContent = i18n.commentsPanelHeaderTemplate.replace('{count}', String(comments.length));
	listEl.innerHTML = '';
	for (const entry of comments) {
		const li = document.createElement('li');
		li.className = 'comment-item';
		li.dataset.commentId = entry.id;
		li.addEventListener('click', (event) => {
			if ((event.target as HTMLElement).closest('button, textarea')) {
				return;
			}
			focusHighlightInContent(entry.id);
		});

		const editBtn = document.createElement('button');
		editBtn.type = 'button';
		editBtn.className = 'comment-edit-btn icon-button';
		editBtn.title = i18n.editTitle;
		editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
		editBtn.addEventListener('click', () => {
			editingId = entry.id;
			renderCommentsPanel();
		});

		const removeBtn = document.createElement('button');
		removeBtn.type = 'button';
		removeBtn.className = 'comment-remove-btn icon-button';
		removeBtn.title = i18n.removeTitle;
		removeBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		removeBtn.addEventListener('click', () => {
			vscodeApi.postMessage({ type: 'removeComment', id: entry.id });
		});

		const main = document.createElement('div');
		main.className = 'comment-item-main';

		if (entry.id === editingId) {
			const textarea = document.createElement('textarea');
			textarea.className = 'textarea-control';
			textarea.rows = 2;
			textarea.value = entry.comment;

			const cancelBtn = document.createElement('button');
			cancelBtn.type = 'button';
			cancelBtn.className = 'btn btn-secondary';
			cancelBtn.textContent = i18n.cancelButton;
			cancelBtn.addEventListener('click', () => {
				editingId = null;
				renderCommentsPanel();
			});

			const saveBtn = document.createElement('button');
			saveBtn.type = 'button';
			saveBtn.className = 'btn btn-primary';
			saveBtn.textContent = i18n.saveCommentButton;
			saveBtn.addEventListener('click', () => {
				const newComment = textarea.value.trim();
				if (!newComment) {
					return;
				}
				vscodeApi.postMessage({ type: 'editComment', id: entry.id, comment: newComment });
				editingId = null;
			});

			const actions = document.createElement('div');
			actions.className = 'comment-item-actions';
			actions.append(cancelBtn, saveBtn);

			main.append(textarea, actions);
			li.appendChild(main);
		} else {
			const commentEl = document.createElement('div');
			commentEl.className = 'comment-comment';
			commentEl.textContent = entry.comment;
			main.appendChild(commentEl);

			const tools = document.createElement('div');
			tools.className = 'comment-item-tools';
			tools.append(editBtn, removeBtn);

			li.append(main, tools);
		}

		listEl.appendChild(li);
	}
}

function setComments(list: Comment[]): void {
	comments = list;
	pruneRemovedHighlights(comments);
	reapplyHighlights();
	renderCommentsPanel();
}

window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.type) {
		case 'update':
			updateContent(message.html);
			break;
		case 'applyFont':
			applyFont(message.font);
			break;
		case 'comments':
			setComments(message.comments);
			break;
	}
});

document.getElementById('content')?.addEventListener('mouseup', () => {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
		hideToolbar();
		return;
	}
	const range = selection.getRangeAt(0);
	pendingQuote = selection.toString();
	pendingLineRange = computeLineRangeForRange(range);
	hideLineButton();
	// getBoundingClientRect() on a multi-line/wrapped range spans the whole block, so use the last line's own rect instead.
	const rects = range.getClientRects();
	const positionRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
	showToolbarAt(positionRect);
});

document.getElementById('content')?.addEventListener('mousemove', (event) => {
	const selection = window.getSelection();
	if (selection && !selection.isCollapsed && selection.toString().trim() !== '') {
		return;
	}
	const block = findEligibleLineBlock(event.target);
	if (block === hoveredLineBlock) {
		return;
	}
	hoveredLineBlock = block;
	const lineBtn = document.getElementById('comment-line-btn');
	if (!lineBtn) {
		return;
	}
	if (!block) {
		lineBtn.hidden = true;
		return;
	}
	const rect = block.getBoundingClientRect();
	lineBtn.hidden = false;
	lineBtn.style.top = `${window.scrollY + rect.top}px`;
	lineBtn.style.left = `${window.scrollX + rect.right - 22}px`;
});

document.getElementById('comment-line-btn')?.addEventListener('click', () => {
	if (!hoveredLineBlock) {
		return;
	}
	pendingQuote = hoveredLineBlock.textContent?.trim() ?? '';
	const startAttr = hoveredLineBlock.dataset.lineStart;
	const endAttr = hoveredLineBlock.dataset.lineEnd;
	pendingLineRange = startAttr && endAttr ? { start: Number(startAttr), end: Number(endAttr) } : null;
	pendingRect = hoveredLineBlock.getBoundingClientRect();
	showCommentInput();
});

document.getElementById('add-comment-btn')?.addEventListener('click', showCommentInput);

document.getElementById('comment-cancel-btn')?.addEventListener('click', () => {
	const inputBox = document.getElementById('comment-input');
	if (inputBox) {
		inputBox.hidden = true;
	}
});

document.getElementById('comment-submit-btn')?.addEventListener('click', () => {
	const textarea = document.getElementById('comment-input-text') as HTMLTextAreaElement | null;
	const comment = textarea?.value.trim();
	if (!comment) {
		return;
	}
	const id = generateId();
	vscodeApi.postMessage({
		type: 'addComment',
		id,
		quote: pendingQuote,
		comment,
		lineStart: pendingLineRange?.start,
		lineEnd: pendingLineRange?.end,
	});
	const inputBox = document.getElementById('comment-input');
	if (inputBox) {
		inputBox.hidden = true;
	}
	pendingQuote = '';
	pendingRect = null;
	pendingLineRange = null;
});

document.getElementById('send-to-chat-btn')?.addEventListener('click', () => {
	vscodeApi.postMessage({ type: 'sendToChat' });
});

document.getElementById('clear-comments-btn')?.addEventListener('click', () => {
	vscodeApi.postMessage({ type: 'clearComments' });
});

renderMermaidBlocks();
