**Status**: implemented

# Markdown Rich Preview VS Code 插件

## Current state
当前生效的事实。每次修订就地重写本节，被推翻的内容直接删除。

**扩展形态**
- `CustomTextEditorProvider`，`viewType: richMarkdownPreview.editor`，`priority: "option"`。
- 自定义编辑器内部只做只读预览 Webview，不含任何编辑 UI；真正编辑永远走
  `vscode.openWith(uri, 'default')` 打开的原生文本编辑器。
- 编辑/预览切换：两个互斥的 `editor/title` 按钮命令，靠 `when` 子句
  （`activeCustomEditorId == richMarkdownPreview.editor` / `resourceLangId == markdown`）互斥显示。

**命名空间**
- 命令：`richMarkdownPreview.showSource` / `.showPreview` / `.clearComments`。
- 配置：`richMarkdownPreview.fontFamily`（正文/UI）/ `.chineseFontFamily` / `.codeFontFamily` /
  `.fontSize` / `.lineHeight` / `.openAsDefault`。
- 术语统一为「批注 / Comment」，代码与 UI 中不再出现 annotation。

**默认预览**
- `openAsDefault` 驱动全局 `workbench.editorAssociations["*.md"]`；`syncEditorAssociation`
  只在当前值与期望值不一致时才调用 `config.update`，避免每次激活无条件重写全局设置。

**渲染管线**（Node 侧，扩展宿主内）
- `unified` + `remark-parse` → `remark-gfm` → `remark-math` → `remark-rehype` → `rehype-raw`
  → `rehype-katex` → `rehype-stringify`。
- Mermaid 代码块转为 `<pre class="mermaid">` 占位符，在 Webview 内用打包的 `mermaid` 客户端库
  延迟渲染（按 body class 是否 `vscode-dark` 选主题），不做服务端渲染。
- `renderMermaidBlocks()` 内的 `mermaid.run(...)` 包 `try/catch`，防止异常打断同一调用链里
  后续的 `reapplyHighlights()`。

**批注存储**
- `src/commentStore.ts`：`Comment` / `CommentStore`，`add(uri, id, quote, comment)` —— id 由
  Webview 端生成后传入，使高亮包裹能就地完成，不等扩展回执。无 `formatForChat`（文案在
  `copilotChatBridge.ts` 内基于 `Comment[]` 组装）。

**批注高亮定位**
- 高亮**只**通过 `reapplyHighlights()`（`findRangeForQuote` 文本节点检索 +
  `wrapRangeWithHighlight` 包裹）产生，统一在 `updateContent()` 与 `setComments()` 两处触发；
  不存在基于实时 Selection Range 的即时包裹路径。
- `pruneRemovedHighlights` 的查询范围限定在 `#content`，不波及 `#comments-list`。

**Copilot Chat 转发**
- `sendCommentsToCopilotChat(fileUri: vscode.Uri, comments: Comment[])`：
  `workbench.action.chat.open` + `attachFiles: [fileUri]` + `isPartialQuery: true`（不自动提交），
  文案为「请处理以下批注：」+ 编号引用/批注列表。该命令为 VS Code 内部命令，`try/catch`
  失败时降级为写入剪贴板 + 提示。

**视觉**
- 完全依赖 Webview 注入的 `--vscode-*` CSS 变量与 `vscode-light`/`vscode-dark`/
  `vscode-high-contrast` body class，不引入自定义主题。
- 排版按 VS Code 内置 Markdown 预览的规则实现（标题字号/`font-weight:600`/h1-h2 底边框、
  列表与段落间距、`hr`、表格边框、`img/video` `max-width:100%`、`pre` 边框变量回退链）。
- 图标用 `@vscode/codicons`，由 esbuild 拷贝到 `dist/webview/codicons/`。
- 布局：`body` 为 grid，`minmax(0,1fr) 300px`；批注面板 `grid-column:2; position:sticky;
  top:0; height:100vh; overflow-y:auto`（非底部浮层）。
- CSP：`script-src` 仅 nonce；`style-src` 含 `'unsafe-inline'`（mermaid 动态注入样式所需）。

**技术栈与产物**
- TypeScript + esbuild：`src/extension.ts` → `dist/extension.js`（node/cjs，external vscode）；
  `src/webview/main.ts` → `dist/webview/main.js`（browser/iife，含 mermaid）；
  katex 与 codicons 资源由 `fs.cpSync` 拷入 `dist/webview/`。
- 源文件：`src/{config,markdownRenderer,commentStore,copilotChatBridge,htmlTemplate,
  previewEditorProvider,extension}.ts`、`src/webview/{main.ts,main.css}`。
- 依赖：unified、remark-parse/gfm/math、remark-rehype、rehype-raw/katex/stringify、katex、
  mermaid、@vscode/codicons；devDeps：@types/vscode、@types/node、esbuild、typescript。
- 调试：`.vscode/launch.json` + `.vscode/tasks.json`（Run Extension + `npm: watch` 预启动）。

**已知残留限制**
- `openAsDefault` 开启后，依赖标准文本编辑器上下文的第三方/内置命令（含内置 Markdown 预览）
  面对本插件的自定义编辑器 tab 可能行为异常——这是自定义编辑器接管默认打开方式这一架构选择
  的固有副作用，当前只做「减少无谓设置写入 + 文档说明」，不做无法验证效果的推测性修复。
- 批注高亮要求 `quote` 原文在重渲染后的文本节点中能被逐字符串匹配到；跨块级边界的选区、
  或原文被大幅编辑到 `quote` 不再存在时，批注保留但暂时不可高亮。

## History
- R1 (2026-08-11) 首版实现 —— 扩展骨架、unified 富预览管线、批注面板与 Copilot Chat 转发落地。
- R2 (2026-08-11) 命名空间去重 / 字体扩展 / 批注定位高亮 / Chat 附件 —— 迁至
  `richMarkdownPreview.*`，annotation 全面改名 comment，批注由贴底浮层改为原文高亮 + 右侧侧栏。
- R3 (2026-08-11) 原生视觉 / 高亮可靠性 / Chat 真附件 / 默认预览副作用 —— 引入 codicons 并对齐
  内置预览排版，高亮统一走 `reapplyHighlights`，Chat 改用 `attachFiles` 真附件，
  `syncEditorAssociation` 加幂等判断。
