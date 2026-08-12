import * as vscode from 'vscode';
import type { Comment } from './commentStore';

function formatComments(comments: Comment[]): string {
	return comments
		.map((entry, index) => {
			const quoteLines = entry.quote
				.split('\n')
				.map((line) => `> ${line}`)
				.join('\n');
			return `${index + 1}. 引用：\n${quoteLines}\n   批注：${entry.comment}`;
		})
		.join('\n');
}

export async function sendCommentsToCopilotChat(fileUri: vscode.Uri, comments: Comment[]): Promise<void> {
	const query = `请处理以下批注（已附加相关文件）：\n\n${formatComments(comments)}`;
	try {
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query,
			isPartialQuery: true,
			attachFiles: [fileUri],
		});
	} catch {
		await vscode.env.clipboard.writeText(query);
		vscode.window.showInformationMessage('已复制批注内容到剪贴板，请手动粘贴到 Copilot Chat 输入框。');
	}
}
