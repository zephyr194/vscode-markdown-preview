import * as vscode from 'vscode';
import { renderMarkdownToHtml } from './markdownRenderer';
import { buildWebviewHtml } from './htmlTemplate';
import { getFontConfig, type FontConfig } from './config';
import { CommentStore } from './commentStore';
import { sendCommentsToCopilotChat } from './copilotChatBridge';
import { getExtensionMessages, getLocale, getWebviewMessages } from './i18n';

export class MarkdownPreviewEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'copilot.markdown.preview.editor';

	private readonly panels = new Set<vscode.WebviewPanel>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly commentStore: CommentStore
	) {}

	public notifyFontChange(font: FontConfig): void {
		for (const panel of this.panels) {
			panel.webview.postMessage({ type: 'applyFont', font });
		}
	}

	public clearCommentsForActive(uri: vscode.Uri): void {
		const uriKey = uri.toString();
		this.commentStore.clear(uriKey);
		for (const panel of this.panels) {
			panel.webview.postMessage({ type: 'comments', comments: [] });
		}
	}

	async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};
		this.panels.add(webviewPanel);

		const uriKey = document.uri.toString();

		const postComments = () => {
			webviewPanel.webview.postMessage({
				type: 'comments',
				comments: this.commentStore.list(uriKey),
			});
		};

		const render = async (text: string) => {
			const html = await renderMarkdownToHtml(text);
			webviewPanel.webview.html = buildWebviewHtml(
				webviewPanel.webview,
				this.context.extensionUri,
				html,
				getFontConfig(),
				getWebviewMessages(),
				getLocale()
			);
			postComments();
		};

		await render(document.getText());

		const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() === uriKey) {
				renderMarkdownToHtml(event.document.getText()).then((html) => {
					webviewPanel.webview.postMessage({ type: 'update', html });
				});
			}
		});

		const messageSub = webviewPanel.webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'addComment':
					this.commentStore.add(uriKey, message.id, message.quote, message.comment, message.lineStart, message.lineEnd);
					postComments();
					break;
				case 'removeComment':
					this.commentStore.remove(uriKey, message.id);
					postComments();
					break;
				case 'editComment':
					this.commentStore.update(uriKey, message.id, message.comment);
					postComments();
					break;
				case 'clearComments':
					this.commentStore.clear(uriKey);
					postComments();
					break;
				case 'sendToChat': {
					await sendCommentsToCopilotChat(document, this.commentStore.list(uriKey), getExtensionMessages());
					break;
				}
			}
		});

		webviewPanel.onDidDispose(() => {
			changeSub.dispose();
			messageSub.dispose();
			this.panels.delete(webviewPanel);
		});
	}
}
