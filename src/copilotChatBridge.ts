import * as vscode from 'vscode';
import type { Comment } from './commentStore';
import type { ExtensionMessages } from './i18nMessages';

/** Matches the shape VS Code's internal `workbench.action.chat.open` expects for a ranged file attachment (1-based). */
interface RangedFileAttachment {
	uri: vscode.Uri;
	range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
}

function formatComments(comments: Comment[], relPath: string, messages: ExtensionMessages): string {
	return comments
		.map((entry, index) => {
			const quoteLines = entry.quote
				.split('\n')
				.map((line) => `> ${line}`)
				.join('\n');
			const heading = entry.lineStart && entry.lineEnd
				? `${messages.modifyLineMention(relPath, entry.lineStart, entry.lineEnd)}：`
				: `${messages.quoteLabel}：`;
			return `${index + 1}. ${heading}\n${quoteLines}\n   ${messages.commentLabel}：${entry.comment}`;
		})
		.join('\n');
}

function buildAttachFiles(
	document: vscode.TextDocument,
	comments: Comment[]
): (vscode.Uri | RangedFileAttachment)[] {
	const attachFiles: (vscode.Uri | RangedFileAttachment)[] = [];
	const seenRanges = new Set<string>();
	let attachedWholeFile = false;

	for (const entry of comments) {
		if (entry.lineStart && entry.lineEnd) {
			const key = `${entry.lineStart}-${entry.lineEnd}`;
			if (seenRanges.has(key)) {
				continue;
			}
			seenRanges.add(key);
			const endLineText = document.lineAt(entry.lineEnd - 1).text;
			attachFiles.push({
				uri: document.uri,
				range: {
					startLineNumber: entry.lineStart,
					startColumn: 1,
					endLineNumber: entry.lineEnd,
					endColumn: endLineText.length + 1,
				},
			});
		} else if (!attachedWholeFile) {
			attachedWholeFile = true;
			attachFiles.push(document.uri);
		}
	}

	return attachFiles;
}

export async function sendCommentsToCopilotChat(
	document: vscode.TextDocument,
	comments: Comment[],
	messages: ExtensionMessages
): Promise<void> {
	const relPath = vscode.workspace.asRelativePath(document.uri, false);
	const query = `${messages.queryHeader}\n\n${formatComments(comments, relPath, messages)}`;
	try {
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query,
			isPartialQuery: true,
			attachFiles: buildAttachFiles(document, comments),
		});
	} catch {
		await vscode.env.clipboard.writeText(query);
		vscode.window.showInformationMessage(messages.clipboardFallbackNotice);
	}
}
