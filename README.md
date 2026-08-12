<p align="center">
  <img src="icon.png" width="96" height="96" alt="Copilot Markdown Preview icon" />
</p>

<h1 align="center">Copilot Markdown Preview</h1>

<p align="center">
  Rich Markdown preview for VS Code — theme-aware rendering, LaTeX/Mermaid support,
  and inline comments you send straight to Copilot Chat as real file attachments.
</p>

![license](https://img.shields.io/badge/license-Apache--2.0-blue)
![vscode](https://img.shields.io/badge/VS%20Code-%5E1.90.0-007ACC)

## Features

- Editing stays entirely in VS Code's native Markdown text editor; this extension only
  provides the preview.
- Preview follows the current VS Code color theme automatically (no custom theme).
- UI text follows VS Code's display language: English by default, Simplified Chinese
  when `vscode.env.language` is `zh-cn` (covers both the manifest strings — command/
  setting titles — and everything shown inside the preview webview).
- Configurable preview font: general/UI font, Chinese (CJK) font (defaults to the OS
  system font), and code-block font (defaults to the editor's monospace font).
- One-click toggle between "Edit Source" and "Open Preview" from the editor title bar.
- Optional default preview: open `.md` files straight into the rich preview.
- Select text — or hover a line and use the button that appears at its end — to add an
  inline-highlighted comment; a right-side panel lists all comments for the file, click
  either the highlight or the list entry to scroll to and flash the other. The comment
  popover uses standard "Cancel" (secondary) / "Add Comment" (primary) buttons and
  always follows the selection or hovered line.
- Send all comments to Copilot Chat in one click. Each comment that resolves to a
  source line range is attached as its own `file.md:start-end` ranged attachment (via
  `attachFiles`), and the query text mentions the same range inline using the real
  `#file:relPath:start-end` chat variable syntax. Note: VS Code only renders `#file:`
  mentions as a highlighted chip when picked from its own autocomplete; text seeded
  through the extension API shows up as plain text (still correct/readable), not a
  colored chip — this is a VS Code platform limitation, not a bug in this extension.
- Rich rendering: GitHub-flavored Markdown, LaTeX math (KaTeX), and Mermaid diagrams,
  styled to match VS Code's native look (codicon icons, native typography/spacing).

## Installation

- **From the Marketplace**: search for `Copilot Markdown Preview` in the Extensions
  view (`⇧⌘X` / `Ctrl+Shift+X`), or install directly:
  `ext install zephyr14.copilot-markdown-preview`.
- **From a `.vsix` file**: download/build a package (see [Development](#development))
  and run `code --install-extension copilot-markdown-preview-<version>.vsix`, or use
  "Install from VSIX..." in the Extensions view's `...` menu.

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

Package a `.vsix` locally with `npx @vscode/vsce package` (requires the
`vscode:prepublish` build to succeed, i.e. `npm run compile` with no errors).

## License

[Apache-2.0](LICENSE)