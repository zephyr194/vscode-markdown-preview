import mermaid from 'mermaid';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
declare const crypto: { randomUUID?: () => string };

interface Comment {
	id: string;
	quote: string;
	comment: string;
	createdAt: number;
}

interface FontMessage {
	fontFamily?: string;
	fontSize?: number;
	lineHeight?: number;
}

const vscodeApi = acquireVsCodeApi();

let comments: Comment[] = [];
let pendingQuote = '';

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

function showToolbarAt(rect: DOMRect, quote: string): void {
	pendingQuote = quote;
	const toolbar = document.getElementById('comment-toolbar');
	if (!toolbar) {
		return;
	}
	toolbar.hidden = false;
	toolbar.style.top = `${window.scrollY + rect.top - 36}px`;
	toolbar.style.left = `${window.scrollX + rect.left}px`;
}

function showCommentInput(): void {
	hideToolbar();
	const inputBox = document.getElementById('comment-input');
	const textarea = document.getElementById('comment-input-text') as HTMLTextAreaElement | null;
	if (!inputBox || !textarea) {
		return;
	}
	inputBox.hidden = false;
	textarea.value = '';
	textarea.focus();
}

function renderCommentsPanel(): void {
	const listEl = document.getElementById('comments-list');
	const countEl = document.getElementById('comments-count');
	if (!listEl || !countEl) {
		return;
	}
	countEl.textContent = String(comments.length);
	listEl.innerHTML = '';
	for (const entry of comments) {
		const li = document.createElement('li');
		li.className = 'comment-item';
		li.dataset.commentId = entry.id;
		li.addEventListener('click', (event) => {
			if ((event.target as HTMLElement).closest('.comment-remove-btn')) {
				return;
			}
			focusHighlightInContent(entry.id);
		});

		const quoteEl = document.createElement('blockquote');
		quoteEl.textContent = entry.quote;

		const commentEl = document.createElement('div');
		commentEl.className = 'comment-comment';
		commentEl.textContent = entry.comment;

		const removeBtn = document.createElement('button');
		removeBtn.type = 'button';
		removeBtn.className = 'comment-remove-btn icon-button';
		removeBtn.title = '删除';
		removeBtn.innerHTML = '<span class="codicon codicon-close"></span>';
		removeBtn.addEventListener('click', () => {
			vscodeApi.postMessage({ type: 'removeComment', id: entry.id });
		});

		li.append(quoteEl, commentEl, removeBtn);
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
	showToolbarAt(range.getBoundingClientRect(), selection.toString());
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
	vscodeApi.postMessage({ type: 'addComment', id, quote: pendingQuote, comment });
	const inputBox = document.getElementById('comment-input');
	if (inputBox) {
		inputBox.hidden = true;
	}
});

document.getElementById('send-to-chat-btn')?.addEventListener('click', () => {
	vscodeApi.postMessage({ type: 'sendToChat' });
});

document.getElementById('clear-comments-btn')?.addEventListener('click', () => {
	vscodeApi.postMessage({ type: 'clearComments' });
});

renderMermaidBlocks();
