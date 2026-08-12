**Status**: implemented

# Markdown Rich Preview VS Code 插件

> 本文件由 `2026-08-11-markdown-preview-extension` / `-adjustments` / `-fixes` 三份同日计划
> 合并而来（同日同功能 = 一个文件多个 Revision）。

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

**已知残留限制**
- `openAsDefault` 开启后，依赖标准文本编辑器上下文的第三方/内置命令（含内置 Markdown 预览）
  面对本插件的自定义编辑器 tab 可能行为异常——这是自定义编辑器接管默认打开方式这一架构选择
  的固有副作用，当前只做「减少无谓设置写入 + 文档说明」，不做无法验证效果的推测性修复。
- 批注高亮要求 `quote` 原文在重渲染后的文本节点中能被逐字符串匹配到；跨块级边界的选区、
  或原文被大幅编辑到 `quote` 不再存在时，批注保留但暂时不可高亮。

---

## Revision 1 — 首版实现

### 背景
仓库为全新空项目，仅有 LICENSE (Apache-2.0) 和一句话 README。目标：构建一个 VS Code
扩展，编辑复用原生 Markdown 编辑器，预览由本插件的 Webview 提供，支持主题跟随、
字体配置、编辑/预览切换、默认预览、批阅转发到 Copilot Chat、LaTeX/Mermaid 富预览。

### 实施清单

1. `package.json`（新建）— 扩展清单：`name/displayName/publisher(占位)/engines.vscode
   ^1.90.0/main=./dist/extension.js/activationEvents=[]`；
   `contributes.customEditors`（viewType `markdownPreview.editor`, selector
   `*.md`, priority `option`）；`contributes.commands`
   （`markdownPreview.showSource` / `markdownPreview.showPreview` /
   `markdownPreview.clearAnnotations`）；`contributes.menus."editor/title"`
   （两个切换命令 + when 子句）；`contributes.configuration`
   （`markdownPreview.fontFamily`/`fontSize`/`lineHeight`/`openAsDefault`）；
   `scripts`（compile/watch/vscode:prepublish 调 esbuild.js）；`dependencies`
   （unified, remark-parse, remark-gfm, remark-math, remark-rehype, rehype-katex,
   rehype-raw, rehype-stringify, katex, mermaid）；`devDependencies`
   （@types/vscode, @types/node, esbuild, typescript）。

2. `tsconfig.json`（新建）— target ES2020, module commonjs, strict true,
   moduleResolution node。

3. `esbuild.js`（新建）— build `src/extension.ts` → `dist/extension.js`
   (node/cjs, external vscode)；build `src/webview/main.ts` →
   `dist/webview/main.js`（browser/iife，bundle 含 mermaid）；用 `fs.cpSync`
   拷贝 `node_modules/katex/dist/{katex.min.css,fonts}` 到
   `dist/webview/katex/`；支持 `--watch`。

4. `.gitignore` / `.vscodeignore`（新建）— 忽略 `node_modules/`、`dist/`。

5. `.vscode/launch.json` / `.vscode/tasks.json`（新建）— 标准 Run Extension
   调试配置 + `npm: watch` 预启动任务。

6. `src/config.ts`（新建）— `getFontConfig()`、`isOpenAsDefaultEnabled()`、
   `syncEditorAssociation(enabled)`（读写全局 `workbench.editorAssociations`）、
   `registerConfigWatcher(context, onFontChange, onDefaultToggle)`。

7. `src/markdownRenderer.ts`（新建）— unified 渲染管线 + 自定义
   `mermaidBlockPlugin`（把 `<pre><code class="language-mermaid">` 转成
   `<pre class="mermaid">`）；导出 `renderMarkdownToHtml(source): Promise<string>`。

8. `src/annotationStore.ts`（新建）— `Annotation` 接口、`AnnotationStore` 类
   （`add/remove/clear/list/formatForChat`，按文档 uri 分组存储）。

9. `src/copilotChatBridge.ts`（新建）— `sendToCopilotChat(text)`：优先
   `workbench.action.chat.open` + `isPartialQuery: true`，失败降级剪贴板 + 提示。

10. `src/htmlTemplate.ts`（新建）— `buildWebviewHtml(webview, extensionUri, body,
    font)`：CSP + nonce，引入 katex.min.css / main.css / main.js，内联字体 CSS
    变量，渲染内容容器 + 批注面板容器。

11. `src/previewEditorProvider.ts`（新建）— `MarkdownPreviewEditorProvider`
    实现 `CustomTextEditorProvider`：初次渲染、监听文档变化重渲染并
    postMessage 更新、监听字体配置变化下发、处理 webview 消息
    （addAnnotation/removeAnnotation/sendToChat）、dispose 清理监听器。

12. `src/extension.ts`（新建）— `activate`：注册 CustomEditorProvider、注册
    `showSource`/`showPreview`/`clearAnnotations` 命令、调用
    `registerConfigWatcher` 并在激活时按当前设置同步一次 editorAssociations；
    `deactivate` 空实现。

13. `src/webview/main.ts`（新建）— `acquireVsCodeApi()`；mermaid 初始化与按需
    渲染；处理 `update`/`applyFont` 消息；`selectionchange` 显示批注悬浮按钮，
    提交后 postMessage `addAnnotation`；渲染批注列表面板（删除 + 发送到 Chat
    按钮）。

14. `src/webview/main.css`（新建）— 全部使用 `--vscode-*` CSS 变量；批注 UI、
    KaTeX/Mermaid 容器样式。

15. `README.md`（编辑现有文件）— 补充功能、配置项、命令说明。

16. 验证：终端 `npm install` → `npm run compile` → `get_errors` 检查
    `src/**/*.ts`；如有报错回 PLAN 修正，不在 EXECUTE 静默改动未列出内容。

---

## Revision 2 — 命名空间去重 / 字体扩展 / 批注定位高亮 / Chat 附件

### 背景
在首版实现基础上做 5 项调整：命令与配置命名空间去重、增加中文字体与代码字体设置、把残留的
英文 "annotation" 术语统一改成「批注/Comment」、批注需要对应并高亮具体原文位置（不再是贴底
浮层）、发送 Copilot Chat 时用 `#file:` 附件语法代替纯文本转储。

### 实施清单

1. `package.json` — 命名空间整体改为 `richMarkdownPreview.*`：
   - `customEditors[0].viewType` → `richMarkdownPreview.editor`
   - `commands`：`richMarkdownPreview.showSource`（标题 `Markdown Rich Preview: Edit Source`）、
     `richMarkdownPreview.showPreview`（`Markdown Rich Preview: Open Preview`）、
     `richMarkdownPreview.clearComments`（`Markdown Rich Preview: Clear Comments`）
   - `menus."editor/title"` 的 `when` 子句里 `activeCustomEditorId` 改成新 viewType
   - `configuration.properties` 前缀改为 `richMarkdownPreview.*`，新增
     `richMarkdownPreview.chineseFontFamily`（string, 默认空）、
     `richMarkdownPreview.codeFontFamily`（string, 默认空），原 `fontFamily` 保留作为
     "正文/UI 字体"

2. `src/config.ts` — `SECTION` 常量改 `richMarkdownPreview`；
   `CUSTOM_EDITOR_VIEW_TYPE` 改 `richMarkdownPreview.editor`；`FontConfig` 增加
   `chineseFontFamily?: string` 与 `codeFontFamily?: string`；`getFontConfig()` 读取
   三个字体设置；`registerConfigWatcher` 的 `affectsConfiguration` 增加新增的两个键。

3. `src/annotationStore.ts` → 用终端 `git mv` 重命名为 `src/commentStore.ts`：
   `Annotation`→`Comment`，`AnnotationStore`→`CommentStore`；`add(uri, quote, comment)`
   改成 `add(uri, id, quote, comment)`（id 由 Webview 端生成传入，而不是内部生成，
   使高亮包裹能在同一个 id 上即时完成，不等扩展回执）；`formatForChat` 方法整体删除
   （改由 `copilotChatBridge.ts` 内基于 `Comment[]` 直接组装文案）。

4. `src/copilotChatBridge.ts` — 函数改名/改签名为
   `sendCommentsToCopilotChat(relativeFilePath: string, comments: Comment[])`：拼接
   `请结合已附加的文件 #file:<relativeFilePath>，处理以下批注：` + 编号引用/批注列表，
   其余 `workbench.action.chat.open` + 剪贴板降级逻辑不变。

5. `src/htmlTemplate.ts`：
   - 修掉字体回退的引号 bug：新增 helper 区分"用户自定义值需要加引号"与
     "回退到 `var(...)` 不能加引号"
   - 新增 `--md-font-family-cjk`、`--md-font-family-code` 两个 CSS 变量的注入逻辑
   - 容器/按钮 id 从 `annotation-*`/`annotations-*` 改名为 `comment-*`/`comments-*`
     （`comment-toolbar`、`add-comment-btn`、`comment-input`、`comment-input-text`、
     `comment-submit-btn`、`comment-cancel-btn`、`comments-panel`、`comments-count`、
     `comments-list`、`clear-comments-btn`），文案仍是中文"批注"不变

6. `src/previewEditorProvider.ts` — 导入改 `CommentStore`；消息类型
   `addAnnotation/removeAnnotation/annotations/clearAnnotations` 改成
   `addComment/removeComment/comments/clearComments`；`addComment` 处理时把
   `message.id` 一并传给 `commentStore.add`；`sendToChat` 分支改为调用
   `sendCommentsToCopilotChat(vscode.workspace.asRelativePath(document.uri, false),
   this.commentStore.list(uriKey))`；类名内 `viewType` 静态字段改
   `richMarkdownPreview.editor`；方法 `clearAnnotationsForActive`→
   `clearCommentsForActive`。

7. `src/extension.ts` — `CUSTOM_EDITOR_VIEW_TYPE` 改新 viewType；命令 id 改
   `richMarkdownPreview.showSource`/`showPreview`/`clearComments`；
   `AnnotationStore`→`CommentStore`；调用改 `clearCommentsForActive`。

8. `src/webview/main.ts`（重点改动）：
   - `Annotation`→`Comment`；消息类型全部改名（同 #6）
   - 新增 `generateId()`（`crypto.randomUUID()`，带 `Date.now()+random` 兜底）
   - 新增 `wrapRangeWithHighlight(range, id)`：优先 `range.surroundContents(mark)`，
     失败则 `extractContents()`+`insertNode()`兜底；`mark` 绑定点击→
     `focusHighlightFromPanelClick` 反向逻辑（滚动+高亮对应列表项）
   - 新增 `findRangeForQuote(root, quote)`：`TreeWalker` 遍历文本节点做全文子串匹配，
     换算回节点内偏移，构建 `Range`；找不到返回 `null`
   - 新增 `reapplyHighlights()`：对当前 `comments` 数组里每条，若 DOM 内无对应
     `[data-comment-id]` 则用 `findRangeForQuote`+`wrapRangeWithHighlight` 补上
   - 新增 `pruneRemovedHighlights(current)`：删除 DOM 里已不在最新列表中的高亮
     （`unwrapHighlightElement`，把子节点提出来后移除包裹元素并 `normalize()`）
   - `mouseup` 处理里保存 `pendingRange`（`range.cloneRange()`）；点击"添加"时先
     `wrapRangeWithHighlight` 做即时反馈，再 `postMessage({type:'addComment', id,
     quote, comment})`
   - `updateContent(html)`：`innerHTML` 替换后依次调用 `renderMermaidBlocks()` 与
     `reapplyHighlights()`
   - `setComments(list)`：先 `pruneRemovedHighlights(list)` 再 `reapplyHighlights()`
     再重渲染面板列表；列表项新增 `data-comment-id` 与点击→滚动定位正文高亮块 +
     临时 `.comment-flash` 效果

9. `src/webview/main.css`：
   - `body` 改 `display:grid; grid-template-columns: minmax(0,1fr) 300px;`，正文
     padding 移到 `#content`
   - `.annotations-panel`→`.comments-panel` 改为 `grid-column:2; position:sticky;
     top:0; height:100vh; overflow-y:auto; border-left:...`（不再 `position:fixed;
     bottom:0`）
   - 新增 `.comment-highlight`（`background-color:
     var(--vscode-editor-findMatchHighlightBackground)`、`cursor:pointer`、
     `border-radius`）与 `.comment-flash`（`outline: 2px solid
     var(--vscode-focusBorder)`，短暂闪烁）
   - `body`/`#content pre,code` 的 `font-family` 改用新变量回退链
   - 其余 `.annotation-*` 类名同步改 `.comment-*`

10. `README.md` — 更新设置表（新增两个字体项）、命令名（新命名空间/标题）、批注
    定位高亮 + 右侧侧栏 + `#file:` 附件行为的说明。

11. 验证：`git mv` 完成重命名 → 全量修改后 `npm run compile` → `get_errors` →
    `npx tsc --noEmit`；如发现新的类型/引用错误回到本 PLAN 修正，不在 EXECUTE
    阶段静默改动未列出内容。

---

## Revision 3 — 原生视觉 / 批注高亮可靠性 / Chat 真附件 / 默认预览副作用

### 背景
用户实测后反馈 5 个问题：UI 不像原生 VS Code 风格、批注仍无法高亮定位、内置 Markdown
预览似乎被影响、发送 Copilot 只能是纯文本、文档编辑后批注失效。已通过代码审查 +
查阅 VS Code 源码（`microsoft/vscode` 的 `chatActions.ts`）定位到具体根因。

### 实施清单

1. `package.json` — 新增依赖 `@vscode/codicons`（官方图标字体包）。

2. `esbuild.js` — 新增拷贝步骤：`node_modules/@vscode/codicons/dist/{codicon.css,
   codicon.ttf}` → `dist/webview/codicons/`。

3. `src/htmlTemplate.ts`：
   - 新增 `<link>` 引入 `codicon.css`
   - CSP 的 `style-src` 增加 `'unsafe-inline'`（mermaid 动态注入样式所需，`script-src`
     不变仍仅 nonce）
   - 批注工具条/输入框/面板按钮改用 `<span class="codicon codicon-xxx"></span>`
     图标：触发批注 `codicon-comment`、提交 `codicon-check`、取消/删除
     `codicon-close`、发送到 Chat `codicon-comment-discussion`、清空
     `codicon-clear-all`

4. `src/webview/main.css` — 按 VS Code 内置 Markdown 预览的真实排版规则重写：
   - 标题 `h1~h6`（字号、`font-weight:600`、`margin`、`line-height:1.25`，h1/h2 加
     `border-bottom` 用 `var(--vscode-panel-border)`）
   - 列表/段落 `margin-bottom`、嵌套列表间距修正
   - `hr`（`border-bottom:1px solid var(--vscode-panel-border)`）
   - 表格（`th` 底部边框、`td/th` padding、行分隔线，用 `var(--vscode-panel-border)`）
   - `img`/`video` `max-width:100%`；`a` 悬浮下划线
   - `pre` 边框改用 `var(--vscode-widget-border, var(--vscode-contrastBorder, rgba(127,127,127,0.35)))`
   - 新增 `.icon-button` 幽灵按钮样式（`background:transparent` +
     `hover: var(--vscode-toolbar-hoverBackground)`，用于批注面板里的次要操作）
   - 工具条/悬浮输入框阴影改为 `0 2px 8px rgba(0,0,0,.2)` + 与内置预览一致的边框变量

5. `src/webview/main.ts`：
   - 删除 `pendingRange` 及提交批注时对实时 Selection Range 的直接
     `wrapRangeWithHighlight` 调用；批注高亮**只**通过 `reapplyHighlights()`
     （`findRangeForQuote` 检索 + 包裹）触发，在 `updateContent()` 和
     `setComments()` 两处统一生效
   - `renderMermaidBlocks()` 内的 `mermaid.run(...)` 包 `try/catch`，防止异常打断
     同一调用链里后续的 `reapplyHighlights()`
   - `pruneRemovedHighlights` 的查询范围从 `document` 改为
     `document.getElementById('content')`，避免影响 `#comments-list` 的 `<li>`
   - 按钮内部结构改成"图标 + 文案"（配合 htmlTemplate 里的 codicon span，不需要
     JS 逻辑变化，只需保留现有 `getElementById` 选择器不变）

6. `src/copilotChatBridge.ts` — `sendCommentsToCopilotChat` 签名改为
   `(fileUri: vscode.Uri, comments: Comment[])`；`workbench.action.chat.open` 调用
   增加 `attachFiles: [fileUri]`；查询文案去掉 `#file:` 字样，只保留"请处理以下批注：
   + 编号引用/批注列表"。

7. `src/previewEditorProvider.ts` — `sendToChat` 分支改为
   `sendCommentsToCopilotChat(document.uri, this.commentStore.list(uriKey))`
   （不再需要 `vscode.workspace.asRelativePath`）。

8. `src/config.ts` — `syncEditorAssociation` 增加前置判断：只有当
   `associations['*.md']` 的当前值与目标值（`enabled` 决定的期望值）不一致时才调用
   `config.update`，避免每次激活都无条件重写全局设置。

9. `README.md` — 更新"发送 Copilot"描述为真实附件 chip 机制；新增 `openAsDefault`
   已知交互限制说明；补充图标/排版改进说明。

10. 验证：`npm install`（引入 codicons）→ `npm run compile` → `npx tsc --noEmit` →
    `get_errors`；`grep` 检查 `pendingRange`/`#file:` 等旧代码确实已移除。如验证中
    发现新问题回到本 PLAN 修正，不在 EXECUTE 阶段静默改动未列出内容。
