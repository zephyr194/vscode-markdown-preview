import * as vscode from 'vscode';
import type { FontConfig } from './config';
import type { Locale, WebviewMessages } from './i18nMessages';

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/** Quotes a user-supplied font name; falls back to an unquoted var()/keyword stack when empty. */
function fontFamilyValue(userValue: string | undefined, fallback: string): string {
	if (userValue) {
		return `"${userValue.replace(/"/g, '\\"')}"`;
	}
	return fallback;
}

export function buildWebviewHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	body: string,
	font: FontConfig,
	messages: WebviewMessages,
	locale: Locale
): string {
	const nonce = getNonce();
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'main.css'));
	const katexCssUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'katex', 'katex.min.css')
	);
	const codiconCssUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'codicons', 'codicon.css')
	);

	const fontFamily = fontFamilyValue(font.fontFamily, 'var(--vscode-font-family)');
	const chineseFontFamily = fontFamilyValue(
		font.chineseFontFamily,
		'system-ui, -apple-system, "Segoe UI", sans-serif'
	);
	const codeFontFamily = fontFamilyValue(font.codeFontFamily, 'var(--vscode-editor-font-family)');
	const fontSize = font.fontSize ? `${font.fontSize}px` : 'var(--vscode-editor-font-size)';
	const htmlLang = locale === 'zh-cn' ? 'zh-CN' : 'en';
	const initialHeader = messages.commentsPanelHeaderTemplate.replace('{count}', '0');

	return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<link rel="stylesheet" href="${codiconCssUri}">
	<link rel="stylesheet" href="${katexCssUri}">
	<link rel="stylesheet" href="${styleUri}">
	<style nonce="${nonce}">
		:root {
			--md-font-family: ${fontFamily};
			--md-font-family-cjk: ${chineseFontFamily};
			--md-font-family-code: ${codeFontFamily};
			--md-font-size: ${fontSize};
			--md-line-height: ${font.lineHeight};
		}
	</style>
</head>
<body>
	<div id="content">${body}</div>
	<div id="comment-toolbar" class="comment-toolbar" hidden>
		<button id="add-comment-btn" type="button" class="btn btn-primary"><span class="codicon codicon-comment"></span> ${messages.addCommentButton}</button>
	</div>
	<div id="comment-line-btn" class="comment-line-btn" hidden title="${messages.addLineCommentTitle}">
		<span class="codicon codicon-comment"></span>
	</div>
	<div id="comment-input" class="comment-input" hidden>
		<textarea id="comment-input-text" class="textarea-control" rows="2" placeholder="${messages.inputPlaceholder}"></textarea>
		<div class="comment-input-actions">
			<button id="comment-cancel-btn" type="button" class="btn btn-secondary">${messages.cancelButton}</button>
			<button id="comment-submit-btn" type="button" class="btn btn-primary">${messages.addCommentSubmitButton}</button>
		</div>
	</div>
	<div id="comments-panel" class="comments-panel">
		<div class="comments-panel-header">
			<span id="comments-panel-title">${initialHeader}</span>
		</div>
		<ul id="comments-list"></ul>
		<div class="comments-panel-footer">
			<button id="send-to-chat-btn" type="button" class="btn btn-primary"><span class="codicon codicon-comment-discussion"></span> ${messages.sendToChatButton}</button>
			<button id="clear-comments-btn" type="button" class="icon-button" title="${messages.clearAllTitle}"><span class="codicon codicon-clear-all"></span></button>
		</div>
	</div>
	<script nonce="${nonce}">window.__i18n = ${JSON.stringify(messages)};</script>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
