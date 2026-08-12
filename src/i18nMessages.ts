export type Locale = 'en' | 'zh-cn';

export interface ExtensionMessages {
	clipboardFallbackNotice: string;
	queryHeader: string;
	quoteLabel: string;
	commentLabel: string;
	modifyLineMention(relPath: string, start: number, end: number): string;
}

export interface WebviewMessages {
	addCommentButton: string;
	addLineCommentTitle: string;
	inputPlaceholder: string;
	cancelButton: string;
	addCommentSubmitButton: string;
	/** Contains the literal placeholder "{count}" to be substituted at render time. */
	commentsPanelHeaderTemplate: string;
	sendToChatButton: string;
	clearAllTitle: string;
	removeTitle: string;
	editTitle: string;
	saveCommentButton: string;
}

const en: { extension: ExtensionMessages; webview: WebviewMessages } = {
	extension: {
		clipboardFallbackNotice: 'Comments have been copied to the clipboard. Please paste them into the Copilot Chat input box.',
		queryHeader: 'Please address the following comments (the related file is attached):',
		quoteLabel: 'Quote',
		commentLabel: 'Comment',
		modifyLineMention: (relPath, start, end) => `Modify #file:${relPath}:${start}-${end}`,
	},
	webview: {
		addCommentButton: 'Comment',
		addLineCommentTitle: 'Comment on this line',
		inputPlaceholder: 'Add a comment...',
		cancelButton: 'Cancel',
		addCommentSubmitButton: 'Add Comment',
		commentsPanelHeaderTemplate: 'Comments ({count})',
		sendToChatButton: 'Send to Copilot Chat',
		clearAllTitle: 'Clear All',
		removeTitle: 'Remove',
		editTitle: 'Edit',
		saveCommentButton: 'Save',
	},
};

const zhCN: { extension: ExtensionMessages; webview: WebviewMessages } = {
	extension: {
		clipboardFallbackNotice: '已复制评论内容到剪贴板，请手动粘贴到 Copilot Chat 输入框。',
		queryHeader: '请处理以下评论（已附加相关文件）：',
		quoteLabel: '引用',
		commentLabel: '评论',
		modifyLineMention: (relPath, start, end) => `修改 #file:${relPath}:${start}-${end} 内容`,
	},
	webview: {
		addCommentButton: '评论',
		addLineCommentTitle: '评论此行',
		inputPlaceholder: '输入评论...',
		cancelButton: '取消',
		addCommentSubmitButton: '添加评论',
		commentsPanelHeaderTemplate: '评论（{count}）',
		sendToChatButton: '发送到 Copilot Chat',
		clearAllTitle: '清空',
		removeTitle: '删除',
		editTitle: '编辑',
		saveCommentButton: '保存',
	},
};

export const catalogs: Record<Locale, { extension: ExtensionMessages; webview: WebviewMessages }> = {
	en,
	'zh-cn': zhCN,
};
