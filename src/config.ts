import * as vscode from 'vscode';

export interface FontConfig {
	fontFamily?: string;
	chineseFontFamily?: string;
	codeFontFamily?: string;
	fontSize?: number;
	lineHeight: number;
}

const SECTION = 'richMarkdownPreview';
const EDITOR_ASSOCIATION_KEY = '*.md';
const CUSTOM_EDITOR_VIEW_TYPE = 'richMarkdownPreview.editor';

export function getFontConfig(): FontConfig {
	const config = vscode.workspace.getConfiguration(SECTION);
	const fontFamily = config.get<string>('fontFamily', '');
	const chineseFontFamily = config.get<string>('chineseFontFamily', '');
	const codeFontFamily = config.get<string>('codeFontFamily', '');
	const fontSize = config.get<number>('fontSize', 0);
	const lineHeight = config.get<number>('lineHeight', 1.6);
	return {
		fontFamily: fontFamily ? fontFamily : undefined,
		chineseFontFamily: chineseFontFamily ? chineseFontFamily : undefined,
		codeFontFamily: codeFontFamily ? codeFontFamily : undefined,
		fontSize: fontSize > 0 ? fontSize : undefined,
		lineHeight,
	};
}

export function isOpenAsDefaultEnabled(): boolean {
	return vscode.workspace.getConfiguration(SECTION).get<boolean>('openAsDefault', false);
}

export async function syncEditorAssociation(enabled: boolean): Promise<void> {
	const config = vscode.workspace.getConfiguration('workbench');
	const current = config.get<Record<string, string>>('editorAssociations') || {};
	const currentlyOurs = current[EDITOR_ASSOCIATION_KEY] === CUSTOM_EDITOR_VIEW_TYPE;

	if (enabled === currentlyOurs) {
		return;
	}

	const associations = { ...current };
	if (enabled) {
		associations[EDITOR_ASSOCIATION_KEY] = CUSTOM_EDITOR_VIEW_TYPE;
	} else {
		delete associations[EDITOR_ASSOCIATION_KEY];
	}

	await config.update('editorAssociations', associations, vscode.ConfigurationTarget.Global);
}

export function registerConfigWatcher(
	context: vscode.ExtensionContext,
	onFontChange: (font: FontConfig) => void,
	onDefaultToggle: (enabled: boolean) => void
): void {
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(`${SECTION}.fontFamily`) ||
				event.affectsConfiguration(`${SECTION}.chineseFontFamily`) ||
				event.affectsConfiguration(`${SECTION}.codeFontFamily`) ||
				event.affectsConfiguration(`${SECTION}.fontSize`) ||
				event.affectsConfiguration(`${SECTION}.lineHeight`)) {
				onFontChange(getFontConfig());
			}
			if (event.affectsConfiguration(`${SECTION}.openAsDefault`)) {
				onDefaultToggle(isOpenAsDefaultEnabled());
			}
		})
	);
}
