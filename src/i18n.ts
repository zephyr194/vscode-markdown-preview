import * as vscode from 'vscode';
import { catalogs, type ExtensionMessages, type Locale, type WebviewMessages } from './i18nMessages';

export function getLocale(): Locale {
	return vscode.env.language === 'zh-cn' ? 'zh-cn' : 'en';
}

export function getExtensionMessages(): ExtensionMessages {
	return catalogs[getLocale()].extension;
}

export function getWebviewMessages(): WebviewMessages {
	return catalogs[getLocale()].webview;
}
