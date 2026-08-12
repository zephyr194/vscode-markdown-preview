# vscode-markdown-preview

Rich Markdown preview extension for VS Code.

## Features

- Editing stays entirely in VS Code's native Markdown text editor; this extension only
  provides the preview.
- Preview follows the current VS Code color theme automatically (no custom theme).
- Configurable preview font: general/UI font, Chinese (CJK) font (defaults to the OS
  system font), and code-block font (defaults to the editor's monospace font).
- One-click toggle between "Edit Source" and "Open Preview" from the editor title bar.
- Optional default preview: open `.md` files straight into the rich preview.
- Select text in the preview to add inline-highlighted comments (批注); a right-side
  panel lists all comments for the file, click either the highlight or the list entry
  to scroll to and flash the other. Send all comments to Copilot Chat in one click —
  the file is attached to the chat request as a real attachment (via `attachFiles`),
  together with a written summary of each comment.
- Rich rendering: GitHub-flavored Markdown, LaTeX math (KaTeX), and Mermaid diagrams,
  styled to match VS Code's native look (codicon icons, native typography/spacing).

## Settings

| Setting | Description |
| --- | --- |
| `richMarkdownPreview.fontFamily` | General/UI text font family. Empty follows the editor font. |
| `richMarkdownPreview.chineseFontFamily` | Font family for Chinese (CJK) text. Empty follows the OS system font. |
| `richMarkdownPreview.codeFontFamily` | Font family for code blocks. Empty follows the editor's (monospace) font. |
| `richMarkdownPreview.fontSize` | Preview font size in px. `0` follows the editor font size. |
| `richMarkdownPreview.lineHeight` | Preview line height. |
| `richMarkdownPreview.openAsDefault` | Open `.md` files with this preview by default. |

> **Known limitation**: enabling `openAsDefault` makes `.md` files open in this
> extension's custom editor instead of VS Code's native text editor. Commands that
> expect the active editor to be a standard text editor — including VS Code's
> built-in `Markdown: Open Preview` — may not behave as expected while such a tab is
> focused. If you need those commands, switch back to the source editor first using
> the editor title bar toggle.

## Commands

- `Markdown Rich Preview: Edit Source` / `Markdown Rich Preview: Open Preview` —
  editor title bar toggle.
- `Markdown Rich Preview: Clear Comments` — clears comments collected for the active file.

## Development

```bash
npm install
npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host.