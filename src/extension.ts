import * as vscode from 'vscode';
import { MarkdownPreviewEditorProvider } from './previewEditorProvider';
import { CommentStore } from './commentStore';
import { registerConfigWatcher, isOpenAsDefaultEnabled, syncEditorAssociation } from './config';

const CUSTOM_EDITOR_VIEW_TYPE = 'richMarkdownPreview.editor';

function getActiveResourceUri(): vscode.Uri | undefined {
	const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
	const input = tab?.input;
	if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) {
		return input.uri;
	}
	return vscode.window.activeTextEditor?.document.uri;
}

export function activate(context: vscode.ExtensionContext): void {
	const commentStore = new CommentStore();
	const provider = new MarkdownPreviewEditorProvider(context, commentStore);

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(CUSTOM_EDITOR_VIEW_TYPE, provider, {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: false,
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('richMarkdownPreview.showSource', async () => {
			const uri = getActiveResourceUri();
			if (!uri) {
				return;
			}
			const viewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
			await vscode.commands.executeCommand('vscode.openWith', uri, 'default', viewColumn);
		}),
		vscode.commands.registerCommand('richMarkdownPreview.showPreview', async () => {
			const uri = getActiveResourceUri();
			if (!uri) {
				return;
			}
			const viewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
			await vscode.commands.executeCommand('vscode.openWith', uri, CUSTOM_EDITOR_VIEW_TYPE, viewColumn);
		}),
		vscode.commands.registerCommand('richMarkdownPreview.clearComments', () => {
			const uri = getActiveResourceUri();
			if (!uri) {
				return;
			}
			provider.clearCommentsForActive(uri);
		})
	);

	registerConfigWatcher(
		context,
		(font) => provider.notifyFontChange(font),
		(enabled) => {
			void syncEditorAssociation(enabled);
		}
	);

	void syncEditorAssociation(isOpenAsDefaultEnabled());
}

export function deactivate(): void {}
