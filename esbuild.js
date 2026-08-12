const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

function copyKatexAssets() {
	const srcDir = path.join(__dirname, 'node_modules', 'katex', 'dist');
	const destDir = path.join(__dirname, 'dist', 'webview', 'katex');
	fs.mkdirSync(destDir, { recursive: true });
	fs.cpSync(path.join(srcDir, 'katex.min.css'), path.join(destDir, 'katex.min.css'));
	fs.cpSync(path.join(srcDir, 'fonts'), path.join(destDir, 'fonts'), { recursive: true });
}

function copyCodiconAssets() {
	const srcDir = path.join(__dirname, 'node_modules', '@vscode/codicons', 'dist');
	const destDir = path.join(__dirname, 'dist', 'webview', 'codicons');
	fs.mkdirSync(destDir, { recursive: true });
	fs.cpSync(path.join(srcDir, 'codicon.css'), path.join(destDir, 'codicon.css'));
	fs.cpSync(path.join(srcDir, 'codicon.ttf'), path.join(destDir, 'codicon.ttf'));
}

async function main() {
	const extensionCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		outfile: 'dist/extension.js',
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		external: ['vscode'],
		sourcemap: !production,
		minify: production,
	});

	const webviewCtx = await esbuild.context({
		entryPoints: ['src/webview/main.ts'],
		bundle: true,
		outfile: 'dist/webview/main.js',
		platform: 'browser',
		format: 'iife',
		target: 'es2020',
		sourcemap: !production,
		minify: production,
	});

	copyKatexAssets();
	copyCodiconAssets();

	if (watch) {
		await extensionCtx.watch();
		await webviewCtx.watch();
		console.log('watching for changes...');
	} else {
		await extensionCtx.rebuild();
		await webviewCtx.rebuild();
		await extensionCtx.dispose();
		await webviewCtx.dispose();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
