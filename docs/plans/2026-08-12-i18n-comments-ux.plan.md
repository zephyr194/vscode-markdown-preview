**Status**: implemented

# i18n + 评论功能重构 + 行内评论修复 + Copilot 附件优化

> 延续 `2026-08-11-markdown-rich-preview.plan.md`（已 `implemented`，冻结不再编辑）。
> 今天是新的一天、同一功能的深化改造，按协议新建本文件，先整体照抄昨天的 `Current state`
> 作为基线，再在其上层叠今天的变更。

## Current state
（Revision 1 落地后的最新事实，取代下方原有基线描述）

**i18n**：`src/i18nMessages.ts`（纯数据双语目录 en/zh-cn）+ `src/i18n.ts`（扩展宿主侧，
`vscode.env.language === 'zh-cn'` 才用中文，否则英文）。`package.json` 的命令标题/配置
标题描述/扩展描述全部改 `%key%`，由 `package.nls.json`（英文）/`package.nls.zh-cn.json`
（中文）提供。Webview 内文案通过 `buildWebviewHtml` 注入 `window.__i18n`（JSON），
`main.ts` 读取后用于动态生成内容（面板标题模板 `commentsPanelHeaderTemplate` 含
`{count}` 占位符、按钮/输入框/tooltip 文案）；静态按钮文案直接在 `htmlTemplate.ts`
生成时插值。UI 术语已全面从「批注」改为「评论」（含 README、package.json/nls、
webview）。

**行号定位基础设施**：`markdownRenderer.ts` 在 `remarkRehype` 之后、`rehypeRaw` 之前
插入 `sourceLinePlugin`，给每个有 `position` 的 hast 元素打 `data-line-start`/
`data-line-end`。Webview 侧 `findLineRange()`/`computeLineRangeForRange()`/
`findEligibleLineBlock()`（后者限定 `LINE_ELIGIBLE_TAGS = P/LI/H1-6/BLOCKQUOTE/TD/TH/PRE`）
把 DOM 节点或 Range 映射回源码行号。

**评论数据模型**：`Comment` 新增可选 `lineStart`/`lineEnd`；`CommentStore.add()` 同步
接收这两个可选参数；Webview 提交 `addComment` 消息时一并携带。

**行内交互**（3a/3b/3c/3d 已修复）：
- 选区触发的 `#comment-toolbar` 去掉外层容器背景/边框/阴影，只剩按钮本身（3a）。
- 新增悬浮行按钮 `#comment-line-btn`：`mousemove` 在 `#content` 上找最近的行级祖先
  （无选区时），显示一个贴在行右侧的小图标按钮，点击后以整行文本为 quote 发起评论（3b）。
- `#comment-input` 内操作区改为 `Cancel`（`.btn-secondary`）+ `Add Comment`
  （`.btn-primary`）文字按钮，取代原先的图标态提交/取消（3c）。
- 修复输入框弹出位置 bug：`showCommentInput()` 现在复用触发时保存的 `pendingRect`
  （选区或悬浮行的 `getBoundingClientRect()`）来定位 `#comment-input`，此前从未设置
  过输入框坐标（3d）。

**Copilot Chat 转发**：`sendCommentsToCopilotChat(document, comments, messages)`——
每条有行号的评论按 `${lineStart}-${lineEnd}` 去重后构造
`{uri: document.uri, range: {startLineNumber, startColumn:1, endLineNumber, endColumn}}`
形式的 `attachFiles` 条目（1-based，`endColumn` 取该行实际长度+1），产生
"file.md:start-end" 的精确行范围附件 chip；没有行号信息的评论退回整篇文件附件（防御性
兜底，最多一条）。查询文案里，每条有行号的评论用
`messages.modifyLineMention(relPath, start, end)`（如 `修改 #file:xxx.md:23-28 内容`）
起头，无行号的退回 `${quoteLabel}：`。

**已核实的 VS Code Chat 内部 API 限制**（沿用自 Revision 1 研究，未变）：`attachFiles`
支持 `{uri, range}` 产出附件区的 chip，但输入框文本里的 `#file:` 高亮 chip 需要
`ChatDynamicVariableModel` 里一条按精确 editor range 匹配的记录，只有用户从自动补全
选择或编辑历史消息时才会写入；通过 `query` 字符串预置的纯文本 `#file:xxx` **不会**被
渲染成高亮 chip，只会显示成普通文本——这是当前实现的已知限制，已写入 README。

**触发按钮/侧栏/Markdown 视觉/评论编辑（Revision 2 落地）**：
- 选区触发的 `#comment-toolbar` 默认弹在选区**右下角**（`positionBottomRightAt()`），
  按钮本身叠加边框+`--vscode-widget-shadow`阴影以提升可辨识度；`#comment-input`/
  `#comment-line-btn` 的定位逻辑不受影响（仍用原 `positionAt()`/自身定位代码）。
- 右侧评论侧栏头部只剩标题；`Send to Copilot Chat`/清空按钮移到面板底部
  `.comments-panel-footer`；`renderCommentsPanel()` 在 `comments.length === 0` 时把
  `#comments-panel` 整体 `hidden` 并给 `body` 加 `no-comments` 类收起 300px 栅格列。
- `#content code/pre/blockquote` 按 VS Code 内置 Markdown 预览
  （`extensions/markdown-language-features/media/markdown.css`）的真实数值对齐：
  行内 `code` 用 `--vscode-textPreformat-foreground`/`-background` + `padding:1px 3px` +
  `border-radius:4px`；`pre` 用 `padding:16px` + `border-radius:3px`；`blockquote` 用
  `border-left:5px solid` + `border-radius:2px`。
- 评论支持修改：`CommentStore.update(uri,id,comment)` + `editComment` 消息；Webview
  用模块级 `editingId` 控制某个 `.comment-item` 是否渲染成"内联 textarea + Save/Cancel"
  编辑态，取代原来的"引用+评论文本+删除按钮"展示态。
- `#comment-input` 视觉重做：`border-radius:6px`、`box-shadow: var(--vscode-widget-shadow,
  ...)`、`padding:10px`、textarea `min-height:48px` + 聚焦态 `outline`。

**扩展形态/命名空间/渲染管线/批注高亮/默认预览等其余事实**：与 2026-08-11 基线一致，
未受本次改动影响（不重复列出，详见该文件）。

**触发按钮定位修复/列表卡片化（Revision 4 落地）**：
- `mouseup` 处理里定位触发按钮时改用 `range.getClientRects()` 的最后一个矩形
  （对应选区实际结束的那一行），不再用 `getBoundingClientRect()` 的整体外包围盒
  （跨行/换行选区会偏右）。
- 评论列表不再展示引用原文（`<blockquote>` 已从 `renderCommentsPanel()` 删除，
  `Comment.quote` 数据本身仍保留用于正文高亮定位），只展示评论内容本身，点击仍跳转/
  高亮正文对应位置。
- 删除图标改为 `codicon-trash`（原 `codicon-close`）。
- `.comment-item` 改成纵向卡片（描边+圆角+背景 `--vscode-editor-background` +
  卡片间距 `margin-bottom:8px`），内容（`.comment-item-main`）在上、操作按钮
  （`.comment-item-tools`，贴右对齐）在下，取代 Revision 3 的左右并排布局。

**正文高亮可见度（Revision 5 落地）**：`.comment-highlight` 背景色 fallback 提高透明度，
另新增 `border-bottom: 2px solid var(--vscode-focusBorder, #007fd4);` 作为第二可见通道，
保证即使主题自带的 `--vscode-editor-findMatchHighlightBackground` 很淡，正文里被评论的文字
仍能看得出来（这是目前唯一能看到“评论对应哪段文字”的地方，列表里已不展示引用原文）。

**侧栏滚动/单条评论紧凑布局/输入框换皮（Revision 3 落地）**：
- `.comments-panel` 改 `overflow:hidden`，滚动职责交给 `#comments-list`
  （`flex:1 1 auto; min-height:0; overflow-y:auto;`）；`.comments-panel-footer`
  （`Send to Copilot Chat` + 清空）因此固定在可视区域底部，不随列表滚动。
- 单条评论展示态改横向紧凑布局：`.comment-item` 变 `flex-direction:row`，内容（quote+
  comment）包进 `.comment-item-main`，编辑/删除两个图标按钮并排包进
  `.comment-item-tools`（整行右侧）。
- 新增共享 `.textarea-control` 输入框皮肤类（背景/边框/圆角/聚焦态与 VS Code input 一致），
  同时用于弹出输入框 `#comment-input-text` 与列表内联编辑的 `<textarea>`，替代原来
  只作用于弹出框、内联编辑态没有任何皮肤的写法。

---

## Revision 1 — i18n / 评论改名 / 行内交互重做 / 行号定位 / Copilot 附件与文案优化

### 背景
用户提出 5 项调整：(1) 按 VS Code 语言环境（仅英文/简体中文两档，与 VS Code 自身
package.nls 解析规则一致：`vscode.env.language` 精确等于 `zh-cn` 才用中文，否则英文）
展示所有文案；(2) 「批注」全面改名「评论」；(3) 行内评论体验修复——3a 选区触发按钮去掉
外层容器装饰、只保留按钮本身；3b 新增按行悬浮的单行评论入口；3c 输入框操作按钮改成
VS Code 标准的 Cancel（次要按钮）+ Add Comment（主按钮）样式；3d 修复输入框弹出位置
不跟随选区/悬浮行的定位 bug；(4) 发送到 Copilot 时用精确 `file.md:startLine-endLine`
的行范围附件（而不是整篇文件）；(5) 查询文案里内联提及修改位置（`#file:` 语法，见上方
"已核实事实"，纯文本兜底、不强行伪装成高亮 chip）。

支撑 (3b)(4)(5) 需要新增"渲染出的 DOM 节点 → Markdown 源码行号"的映射，通过给
`remark-rehype` 输出的 hast 元素补 `data-line-start`/`data-line-end` 属性实现
（`mdast-util-to-hast` 默认保留每个节点的 `position`，只需要一个新 rehype 插件把它
写成 hast `properties`）。

### 实施清单

1. **`src/i18nMessages.ts`（新建，纯数据，不依赖 vscode）**
   - `export type Locale = 'en' | 'zh-cn'`
   - `export interface ExtensionMessages { clipboardFallbackNotice: string; queryHeader: string;
     quoteLabel: string; commentLabel: string; modifyLineMention(relPath: string, start: number,
     end: number): string; }`
   - `export interface WebviewMessages { addCommentButton: string; addLineCommentTitle: string;
     inputPlaceholder: string; cancelButton: string; addCommentSubmitButton: string;
     commentsPanelHeaderTemplate: string; /* 含 "{count}" 占位符 */ sendToChatButton: string;
     clearAllTitle: string; removeTitle: string; }`
   - `export const catalogs: Record<Locale, { extension: ExtensionMessages; webview: WebviewMessages }>`
     两套字面量（`en`、`zh-cn`），中文版把所有"批注"替换为"评论"；`modifyLineMention`
     的两种实现：
     - zh-cn: `` `修改 #file:${relPath}:${start}-${end} 内容` ``
     - en: `` `Modify #file:${relPath}:${start}-${end}` ``

2. **`src/i18n.ts`（新建，扩展宿主侧，依赖 vscode）**
   - `export function getLocale(): Locale`：`vscode.env.language === 'zh-cn' ? 'zh-cn' : 'en'`
   - `export function getExtensionMessages(): ExtensionMessages`
   - `export function getWebviewMessages(): WebviewMessages`
   （均从 `catalogs[getLocale()]` 取值）

3. **`src/markdownRenderer.ts`**：在 `.use(remarkRehype, ...)` 之后、`.use(rehypeRaw)` 之前
   插入新插件 `sourceLinePlugin`：`visit(tree, 'element', (node) => { if (node.position) {
   node.properties = { ...node.properties, dataLineStart: node.position.start.line,
   dataLineEnd: node.position.end.line }; } })`（hast 的 `data*` 驼峰属性会被
   `rehype-stringify` 序列化成 `data-line-start`/`data-line-end`）。

4. **`src/commentStore.ts`**：`Comment` 接口新增可选 `lineStart?: number; lineEnd?: number`；
   `add(uri, id, quote, comment, lineStart?, lineEnd?)` 签名同步增加两个可选参数并写入
   新建的 entry。

5. **`src/copilotChatBridge.ts`（重写）**：
   - 签名改为 `sendCommentsToCopilotChat(document: vscode.TextDocument, comments: Comment[],
     messages: ExtensionMessages): Promise<void>`
   - 遍历 `comments`：对有 `lineStart`/`lineEnd` 的条目，按 `${lineStart}-${lineEnd}` 去重后
     构造 `{ uri: document.uri, range: { startLineNumber: lineStart, startColumn: 1,
     endLineNumber: lineEnd, endColumn: document.lineAt(lineEnd - 1).text.length + 1 } }`
     加入 `attachFiles`；没有行号信息的条目（防御性兜底）改为整篇 `document.uri` 加入
     `attachFiles`（同样去重，最多一条）
   - 每条评论的文案：有行号时用
     `${index}. ${messages.modifyLineMention(relPath, lineStart, lineEnd)}：\n${quoteLines}\n
     \t${messages.commentLabel}：${entry.comment}`；无行号时退回旧版
     `${index}. ${messages.quoteLabel}：\n${quoteLines}\n\t${messages.commentLabel}：
     ${entry.comment}`（`relPath` 用 `vscode.workspace.asRelativePath(document.uri, false)`）
   - `query` 整体前缀用 `messages.queryHeader`
   - `workbench.action.chat.open` 调用不变（`query` + `isPartialQuery:true` +
     `attachFiles`）；catch 分支的提示语改用 `messages.clipboardFallbackNotice`

6. **`src/previewEditorProvider.ts`**：
   - `resolveCustomTextEditor` 里 `render()` 调用 `buildWebviewHtml` 时新增两个参数：
     `getWebviewMessages()` 与 `getLocale()`
   - `messageSub` 的 `addComment` 分支：`this.commentStore.add(uriKey, message.id, message.quote,
     message.comment, message.lineStart, message.lineEnd)`
   - `sendToChat` 分支改为 `await sendCommentsToCopilotChat(document, this.commentStore.list(uriKey),
     getExtensionMessages())`

7. **`src/htmlTemplate.ts`（重写）**：
   - 函数签名新增 `messages: WebviewMessages, locale: Locale` 两个参数
   - `<html lang="${locale === 'zh-cn' ? 'zh-CN' : 'en'}">`
   - 术语：面板标题不再拼接 `批注（<span id="comments-count">`，改成单一
     `<span id="comments-panel-title">${messages.commentsPanelHeaderTemplate.replace('{count}',
     '0')}</span>`（初始 0，后续由 `main.ts` 用同一模板重算并整体替换 textContent）
   - `#comment-toolbar` 内部按钮：`<button id="add-comment-btn" type="button"
     class="btn btn-primary"><span class="codicon codicon-comment"></span>
     ${messages.addCommentButton}</button>`（去掉外层容器装饰见第 8 步 CSS）
   - 新增单行评论入口：`<div id="comment-line-btn" class="comment-line-btn" hidden
     title="${messages.addLineCommentTitle}"><span class="codicon codicon-comment"></span></div>`
   - `#comment-input` 内的操作区：
     `<button id="comment-cancel-btn" type="button" class="btn btn-secondary">
     ${messages.cancelButton}</button><button id="comment-submit-btn" type="button"
     class="btn btn-primary">${messages.addCommentSubmitButton}</button>`（去掉纯图标按钮，
     改为文字按钮，Cancel 在前、Add Comment 在后）
   - `textarea` 的 `placeholder` 用 `messages.inputPlaceholder`
   - `send-to-chat-btn` 用 `class="btn btn-primary"` + `messages.sendToChatButton`；
     `clear-comments-btn` 的 `title` 用 `messages.clearAllTitle`
   - 在 `main.js` 的 `<script>` 标签之前插入
     `<script nonce="${nonce}">window.__i18n = ${JSON.stringify(messages)};</script>`

8. **`src/webview/main.css`**：
   - `.comment-toolbar` 去掉 `background-color/border/box-shadow/padding`，只保留
     `position:absolute; z-index:10;`（3a：去装饰，只剩按钮本身）
   - 新增通用按钮类替换原先分散的选择器：
     `.btn{display:inline-flex;align-items:center;gap:4px;border:none;border-radius:5px;
     padding:4px 12px;cursor:pointer;font-size:0.9em;}`
     `.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}`
     `.btn-primary:hover{background:var(--vscode-button-hoverBackground);}`
     `.btn-secondary{background:var(--vscode-button-secondaryBackground);
     color:var(--vscode-button-secondaryForeground);}`
     `.btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground);}`
   - 删除旧的 `.comment-toolbar button` / `.comment-input button` /
     `.comments-panel button.primary-btn` 选择器规则（被 `.btn/.btn-primary/.btn-secondary`
     取代）
   - `.comment-input` 保留现有边框/阴影/背景（弹出的输入框本身仍是一个 popover 容器，
     只是内部按钮换样式，不在 3a 的"去装饰"范围内）
   - 新增 `.comment-line-btn`（3b 的悬浮入口）：
     `position:absolute;z-index:9;width:22px;height:22px;display:flex;align-items:center;
     justify-content:center;border-radius:4px;cursor:pointer;
     color:var(--vscode-icon-foreground);background:var(--vscode-editorWidget-background);
     border:1px solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder,
     rgba(127,127,127,.35)));` + `:hover{background:var(--vscode-toolbar-hoverBackground);}`

9. **`src/webview/main.ts`（较大改动）**：
   - `import type { WebviewMessages } from '../i18nMessages';`（仅类型导入，不产生运行时
     `vscode` 依赖）；`const i18n = (window as unknown as { __i18n: WebviewMessages }).__i18n;`
   - 新增 `LINE_ELIGIBLE_TAGS = new Set(['P','LI','H1','H2','H3','H4','H5','H6',
     'BLOCKQUOTE','TD','TH','PRE'])`
   - 新增 `findLineRange(node: Node | null): {start:number; end:number} | null`：从
     `node`（或其 `parentElement`）向上找最近的带 `dataset.lineStart`/`lineEnd` 的元素
   - 新增 `computeLineRangeForRange(range: Range): {start:number; end:number} | null`：
     取 `range.startContainer`/`range.endContainer` 各自的 `findLineRange`，
     合并成 `{start: min(...), end: max(...)}`；两端都找不到时返回 `null`
   - 新增模块级状态 `let pendingRect: DOMRect | null = null;` 和
     `let pendingLineRange: {start:number; end:number} | null = null;`（替代/补充原
     `pendingQuote`，三者同生命周期一起设置/清空）
   - `mouseup` 监听器改为：选区非空时，`pendingQuote = selection.toString()`；
     `pendingLineRange = computeLineRangeForRange(range)`；`pendingRect =
     range.getBoundingClientRect()`；调用 `showToolbarAt(pendingRect)`（不再需要把 quote
     当参数传，从模块状态读）；同时隐藏 `#comment-line-btn`
   - 新增 `mousemove` 监听器（挂在 `#content` 上）：若当前有非空 selection 则直接返回
     （避免和选区按钮打架）；否则用 `event.target` 沿祖先链查找
     `LINE_ELIGIBLE_TAGS` 中且带 `dataset.lineStart` 的元素；找到且与上次不同则用其
     `getBoundingClientRect()` 定位显示 `#comment-line-btn`（贴右上角）；找不到则隐藏
     `#comment-line-btn`
   - `#comment-line-btn` 的 `click` 监听器：从当前高亮的行元素取 `textContent` 作为
     `pendingQuote`，`dataset.lineStart/lineEnd` 转数字作为 `pendingLineRange`，
     该元素 `getBoundingClientRect()` 作为 `pendingRect`，隐藏自身后调用
     `showCommentInput()`
   - `showCommentInput()`：改为用 `pendingRect` 设置 `#comment-input` 的
     `style.top/left`（修复 3d：之前从未设置输入框坐标）；沿用原逻辑清空/聚焦 textarea
   - `comment-submit-btn` 点击：`postMessage({type:'addComment', id, quote: pendingQuote,
     comment, lineStart: pendingLineRange?.start, lineEnd: pendingLineRange?.end})`；提交后
     一并清空 `pendingRect`/`pendingLineRange`/`pendingQuote`
   - `renderCommentsPanel()`：不再单独更新 `comments-count`，改为整体设置
     `document.getElementById('comments-panel-title').textContent =
     i18n.commentsPanelHeaderTemplate.replace('{count}', String(comments.length))`
   - `removeBtn.title` 用 `i18n.removeTitle`（原硬编码 `'删除'`）
   - `add-comment-btn` 内文案原本写死在 HTML 模板里（步骤 7 已处理），JS 侧无需改按钮文字，
     只保留原有 `click` 绑定

10. **`package.json`**：
    - `description` 改为 `%extension.description%`
    - `customEditors[0].displayName` 改为 `%customEditor.displayName%`
    - 三个命令 `title` 分别改为 `%command.showSource.title%` /
      `%command.showPreview.title%` / `%command.clearComments.title%`
    - `configuration.title` 改为 `%configuration.title%`；六个
      `configuration.properties.*.description` 分别改为对应
      `%configuration.<key>.description%`

11. **`package.nls.json`（新建，默认英文）** 与 **`package.nls.zh-cn.json`（新建，简体中文，
    "批注" 相关表述统一写成 "评论"）**：与第 10 步引用的 key 一一对应。

12. **`README.md`**：术语「批注」全部替换为「评论」；补充：多语言展示（英文默认 +
    简体中文，跟随 `vscode.env.language`）、单行评论入口、Cancel/Add Comment 按钮样式、
    Copilot 附件现在按精确行号范围（`file.md:start-end`）而不是整篇文件、以及第 5 项的
    已知限制（`#file:` 提及是纯文本兜底，不会像手动输入补全那样被高亮成 chip）。

13. **验证**：
    - `npm run compile` → `get_errors`（`src/**/*.ts`）→ `npx tsc --noEmit`
    - `grep -rn "批注"` 确认 `src/`、`README.md`、`package.json` 内无残留（`package.nls.json`
      的英文文件本身不含中文，`package.nls.zh-cn.json` 允许出现"评论"但不允许"批注"）
    - 手动核对 `src/webview/main.css` 里旧的 `.comment-toolbar button` /
      `.comments-panel button.primary-btn` 选择器已被删除，未残留死代码

---

## Revision 2 — 触发按钮可见性与定位 / 侧栏布局收敛 / Markdown 代码引用视觉对齐 / 评论可编辑 / 输入框重新设计

### 背景
用户实测后反馈 5 项调整：
1. 选中文字后弹出的 `#comment-toolbar` 触发按钮不够醒目（已与用户确认：指这个触发按钮，
   不是 `.comment-highlight` 高亮标记），且当前固定弹在选区左上方（`offsetTop:-36`），
   希望默认改为贴着鼠标/选区的右下角显示（已与用户确认：只改这一个按钮的定位，不动
   `#comment-input` 和 `#comment-line-btn`）。
2. 右侧评论侧栏头部因为标题+两个按钮挤在一行导致按钮文案换行；改为头部只放标题，
   `Send to Copilot Chat` 挪到面板底部；整个侧栏只在存在至少一条评论时才显示（否则连
   300px 的栅格列一起收起）。
3. Markdown 正文里的行内代码/代码块/引用块视觉与 VS Code 内置 Markdown 预览
   （`extensions/markdown-language-features/media/markdown.css`，已查阅确认）不一致，
   按其真实数值对齐背景/边框/圆角。
4. 评论支持修改已有内容（目前只能新增/删除）。
5. 悬浮评论输入框（`#comment-input`）视觉不符合 VS Code 悬浮部件设计，需要重新设计。

### 实施清单

1. **`src/webview/main.css`**：
   - `#comment-toolbar` 触发按钮（`.btn.btn-primary` 在 toolbar 内的实例）新增边框与阴影
     以提升可辨识度：新增选择器 `.comment-toolbar .btn { border: 1px solid
     var(--vscode-button-border, transparent); box-shadow: var(--vscode-widget-shadow, 0 1px
     4px rgba(0, 0, 0, 0.25)); opacity: 1; }`
   - `#content code`（行内代码）对齐 VS Code 内置预览的真实数值：
     `color: var(--vscode-textPreformat-foreground); background-color:
     var(--vscode-textPreformat-background); padding: 1px 3px; border-radius: 4px;`
     （删除原先的纯背景无前景色写法）
   - `#content pre`：`padding: 16px;`（原 `0.75em 1em`）、`border-radius: 3px;`（原 `4px`），
     `background-color`/`border` 变量不变
   - `#content pre code`：新增 `color: var(--vscode-editor-foreground); border-radius: 0;`
     （原有 `background:none; padding:0;` 保留）
   - `#content blockquote`：`border-left: 5px solid var(--vscode-textBlockQuote-border);`
     （原 `border-left: 3px solid ...`，改用 `border-left` 简写去掉单独的
     `border-left-width`）、新增 `border-radius: 2px;`；`background-color`/`margin` 不变
   - `.comments-panel` 新增 `display: flex; flex-direction: column;`
   - 新增 `.comments-panel-footer { display: flex; gap: 6px; margin-top: 0.5em; padding-top:
     0.5em; border-top: 1px solid var(--vscode-panel-border); }`；其中
     `#send-to-chat-btn { flex: 1; justify-content: center; }`
   - 新增 `body.no-comments { grid-template-columns: minmax(0, 1fr); }`（隐藏侧栏时收起
     300px 栅格列）
   - `#comment-input` 重新设计（保留 `position:absolute` 与 `width:260px`）：
     `border-radius: 6px;`（原 `3px`）、`box-shadow: var(--vscode-widget-shadow, 0 2px 8px
     rgba(0,0,0,.24));`（原硬编码 rgba）、`padding: 10px;`（原 `4px`）
   - `.comment-input textarea` 新增 `min-height: 48px;` 与 `outline: none;`；新增
     `.comment-input textarea:focus { outline: 1px solid var(--vscode-focusBorder);
     outline-offset: -1px; }`
   - 新增 `.comment-item-edit textarea`（复用 `.comment-input textarea` 的视觉，选择器
     并列）与 `.comment-item-actions { display:flex; gap:6px; margin-top:4px; }`（评论列表
     内编辑态的 Save/Cancel 按钮行，样式复用 `.btn/.btn-primary/.btn-secondary`）

2. **`src/webview/main.ts`**：
   - `positionAt()` 拆分默认值：新增第二个定位函数
     `positionBottomRightAt(el: HTMLElement, rect: DOMRect): void`（`top: rect.bottom +
     window.scrollY + 6`, `left: rect.right + window.scrollX`），`showToolbarAt()` 改调用它
     （原先固定在选区左上方 -36px 的 `positionAt` 调用点，只改这一处；`showCommentInput()`
     里给 `#comment-input` 定位仍继续用原 `positionAt()`（左上方），不受本次改动影响）
   - 新增模块级 `let editingId: string | null = null;`
   - `renderCommentsPanel()`：
     - 开头新增：`const panel = document.getElementById('comments-panel'); const hasComments
       = comments.length > 0; if (panel) { panel.hidden = !hasComments; }
       document.body.classList.toggle('no-comments', !hasComments);`
     - 每个 `.comment-item` 新增一个 `codicon-edit` 图标按钮（`.comment-edit-btn
       icon-button`，`title = i18n.editTitle`），插在 remove 按钮之前，点击时
       `editingId = entry.id; renderCommentsPanel();`
     - 当 `entry.id === editingId` 时，该 `<li>` 改渲染编辑态：一个预填当前
       `entry.comment` 的 `<textarea>`（复用 `.comment-input textarea` 视觉）+
       一行 `.comment-item-actions`（`Cancel` `.btn-secondary` / `Save`
       `.btn-primary`，文案用 `i18n.cancelButton`/`i18n.saveCommentButton`）替代原来的
       `quoteEl`+`commentEl` 展示；`Cancel` 点击：`editingId = null;
       renderCommentsPanel();`；`Save` 点击：读取 textarea 值（trim 非空才继续），
       `vscodeApi.postMessage({type:'editComment', id: entry.id, comment: newText});
       editingId = null;`（`postComments()` 的回执会驱动重新渲染，无需在此手动调用
       `renderCommentsPanel()`）

3. **`src/i18nMessages.ts`**：`WebviewMessages` 新增 `editTitle: string;
   saveCommentButton: string;`；`en` 目录补
   `editTitle: 'Edit', saveCommentButton: 'Save'`；`zh-cn` 目录补
   `editTitle: '编辑', saveCommentButton: '保存'`

4. **`src/commentStore.ts`**：新增方法 `update(uri: string, id: string, comment: string):
   void`——在 `byUri.get(uri)` 的列表里找到匹配 `id` 的条目，把它的 `comment` 字段替换为
   新值（找不到则忽略，不抛错）

5. **`src/previewEditorProvider.ts`**：`messageSub` 的 `switch` 新增一个 `case
   'editComment':`，调用 `this.commentStore.update(uriKey, message.id, message.comment);`
   后接 `postComments();`（与 `addComment`/`removeComment` 分支同构）

6. **`src/htmlTemplate.ts`**：`comments-panel-header` 内的 `<div>`（原本包着
   `send-to-chat-btn` 和 `clear-comments-btn`）整体删除，`comments-panel-header` 只剩
   `<span id="comments-panel-title">`；`send-to-chat-btn`/`clear-comments-btn` 两个按钮
   移动到 `</ul>` 之后新增的 `<div class="comments-panel-footer">` 内（顺序：主按钮在前，
   `clear-comments-btn` 图标按钮在后），按钮自身的 class/id/文案不变

7. **验证**：`npm run compile` → `get_errors` → `npx tsc --noEmit`；手动检查
   `src/htmlTemplate.ts` 里 `comments-panel-header` 与 `comments-panel-footer` 的分工，
   确认没有遗留重复的按钮标签；如实测后发现第 1 项（触发按钮可见性）仍不是用户预期的
   根因，回到 PLAN 重新定位问题（不在 EXECUTE 阶段自行加码猜测其他修法）。
    - 如验证中发现新问题回到本 PLAN 修正，不在 EXECUTE 阶段静默改动未列出内容

---

## Revision 3 — Send to Copilot Chat 固定底部 / 单条评论紧凑重排 / 编辑输入框换皮

### 背景
用户实测 Revision 2 后反馈 3 点：(1) `Send to Copilot Chat` 应该**固定**在侧栏底部，不
随评论列表滚动；(2) 单条评论展示态里编辑/删除两个按钮应并排放在一起，整体更紧凑；
(3) 内联编辑态的 `<textarea>` 没有套用任何输入框视觉（纯浏览器默认样式），必须换成和
`#comment-input` 一致的 VS Code 输入框皮肤。

### 实施清单

1. **`src/webview/main.css`**：
   - `.comments-panel`：`overflow-y: auto` 改成 `overflow: hidden`（滚动职责交给列表）
   - `#comments-list` 新增 `flex: 1 1 auto; min-height: 0; overflow-y: auto;`（使其成为
     面板内唯一可滚动区域，header 与 footer 保持在可视区域内不随之滚动）
   - `.comments-panel-footer` 新增 `flex: 0 0 auto;`（显式声明不参与收缩，纯防御性）
   - 新增共享输入框皮肤类 `.textarea-control`（从原 `.comment-input textarea` 的属性平移
     并追加 `padding: 6px 8px;`）：
     `width:100%; box-sizing:border-box; min-height:48px; background-color:
     var(--vscode-input-background); color:var(--vscode-input-foreground);
     border:1px solid var(--vscode-input-border); border-radius:3px; resize:vertical;
     font-family:inherit; outline:none; padding:6px 8px;`，配套
     `.textarea-control:focus { outline:1px solid var(--vscode-focusBorder);
     outline-offset:-1px; }`；删除原来仅作用于 `#comment-input-text` 的
     `.comment-input textarea` / `.comment-input textarea:focus` 选择器（改用共享类）
   - `.comment-item` 重排为横向紧凑布局：`display:flex; flex-direction:row;
     align-items:flex-start; gap:6px; padding:5px 4px;`（原先纵向 `flex-direction:column`）
   - 新增 `.comment-item-main { flex:1; min-width:0; display:flex; flex-direction:column;
     gap:2px; }`（包裹 quote + comment/编辑区，取代直接挂在 `li` 上）
   - 新增 `.comment-item-tools { display:flex; gap:2px; flex-shrink:0; }`（编辑+删除两个
     `icon-button` 并排放在一起，位于整行右侧）
   - `.comment-item blockquote` 的 `padding-left` 从 `8px` 收紧到 `6px`，其余不变
   - `.comment-item-actions` 新增 `justify-content: flex-end;`（内联编辑的 Save/Cancel
     对齐到右侧，呼应 `.comment-input-actions` 的现有写法）
   - 删除不再需要的 `.comment-remove-btn { align-self: flex-end; }`（纵向布局专用，横向
     布局下由 `.comment-item-tools` 统一管理对齐）

2. **`src/webview/main.ts`** `renderCommentsPanel()`：
   - 展示态：新增 `const main = document.createElement('div'); main.className =
     'comment-item-main';`，把 `quoteEl` 和（`commentEl` 或 编辑用的 `textarea`+`actions`）
     都塞进 `main` 而不是直接挂在 `li` 上；`li.appendChild(main)`
   - 非编辑态：新增 `const tools = document.createElement('div'); tools.className =
     'comment-item-tools'; tools.append(editBtn, removeBtn); li.appendChild(tools);`
     （取代原来把 `editBtn`/`removeBtn` 直接 `append` 到 `li` 的写法）
   - 编辑态：`textarea` 创建后追加 `textarea.className = 'textarea-control';`（其余取值/
     赋值逻辑不变），编辑态下不渲染 `.comment-item-tools`（维持 Revision 2 的行为，
     只是现在从"直接不 append 按钮"变成"整个 tools 容器都不创建/不 append"）

3. **`src/htmlTemplate.ts`**：`#comment-input-text` 的 `<textarea>` 追加
   `class="textarea-control"`（配合第 1 步新增的共享皮肤类，替代之前依赖
   `.comment-input textarea` 后代选择器的写法）

4. **验证**：`npm run compile` → `get_errors` → `npx tsc --noEmit`；手动确认
   `.comment-input textarea` 旧选择器已被 `.textarea-control` 完全取代（`grep` 检查
   `main.css`/`htmlTemplate.ts` 无遗留引用）。

---

## Revision 4 — 选区触发按钮定位修复 / 删除图标 / 列表去引用只显评论 / 卡片化 / 内容与按钮上下布局

### 背景
用户反馈 4 项：(1) 第一次选中文案时 `#comment-toolbar` 弹出位置会错——已定位到代码里的
真实缺陷：`showToolbarAt` 用的 `range.getBoundingClientRect()` 对**跨行（换行）选区**
返回的是从选区起点到终点的整体外包围盒（宽度等于最宽的那一行），并不是"最后一行末尾"
的位置，选区一旦跨行/换行，右下角定位就会显著偏右——本次改用 `range.getClientRects()`
的最后一个矩形（对应选区实际结束的那一行）来定位，从根源修掉这个偏移，而不是猜测性地
加时序补丁；(2) 删除按钮换成垃圾桶图标（`codicon-trash`，目前是 `codicon-close`）；
(3) 评论列表条目不再展示引用原文（`<blockquote>`），只展示评论内容本身，点击条目仍跳转/
高亮正文里对应位置（`focusHighlightInContent` 逻辑已存在，不用改）；(4) 列表改卡片式
展示（每条独立描边圆角卡片，卡片间有间距）；(5) 卡片内评论内容与操作按钮（编辑/删除）
改上下布局（内容在上，按钮行贴卡片底部靠右）。

### 实施清单

1. **`src/webview/main.ts`**：
   - `mouseup` 监听器：`const range = selection.getRangeAt(0);` 之后，改用
     `const rects = range.getClientRects(); const positionRect = rects.length > 0 ?
     rects[rects.length - 1] : range.getBoundingClientRect();`，`showToolbarAt(positionRect)`
     （原先直接传 `range.getBoundingClientRect()`）
   - `renderCommentsPanel()`：
     - 删除 `quoteEl`（`<blockquote>`）的创建与 `main.appendChild(quoteEl)`，`main` 不再
       包含引用内容，只保留 `commentEl`（或编辑态的 `textarea`+`actions`）
     - `removeBtn.innerHTML` 从 `'<span class="codicon codicon-close"></span>'` 改为
       `'<span class="codicon codicon-trash"></span>'`
     - 非编辑态下 `tools`（`.comment-item-tools`）现在渲染在 `main` **之后**、卡片底部
       （结构不变，只是配合新 CSS 变成上下堆叠而不是左右并排——DOM 顺序本来就是
       `li.append(main, tools)`，无需改动 append 顺序，只改 CSS）

2. **`src/webview/main.css`**：
   - `.comment-item` 改为纵向卡片：`display:flex; flex-direction:column; gap:6px;
     cursor:pointer; padding:8px 10px; margin-bottom:8px; border:1px solid
     var(--vscode-widget-border, var(--vscode-contrastBorder, rgba(127,127,127,.35)));
     border-radius:6px; background-color:var(--vscode-editor-background);`（删除原来的
     `flex-direction:row; align-items:flex-start; border-bottom:...` 那一版横向/分隔线写法）
   - 新增 `.comment-item:last-child { margin-bottom: 0; }`
   - `.comment-item-tools` 新增 `justify-content: flex-end;`（按钮行贴卡片右下）
   - 删除不再使用的 `.comment-item blockquote { ... }` 选择器（列表不再渲染引用块，
     避免遗留死代码）

3. **验证**：`npm run compile` → `get_errors` → `npx tsc --noEmit`；`grep` 确认
   `.comment-item blockquote` 与 `codicon-close`（在 `comment-remove-btn` 场景下）已不
   在 `main.ts`/`main.css` 中出现；如第 1 项修复后用户重测仍复现"位置错"，回到 PLAN
   重新定位（不在 EXECUTE 阶段自行加码猜测其他修法）。

---

## Revision 5 — 正文高亮可见度修复

### 背景
用户反馈：左侧（`#content`）里评论对应的高亮”丢了“；右侧（`.comments-panel`）点击评论
能 `scrollIntoView` 跳过去，但看不到具体高亮的位置和内容。已定位原因：`scrollIntoView`
能跑通说明 `<mark data-comment-id>` 元素确实存在（DOM 没丢），问题在于 `.comment-highlight`
单一依赖 `--vscode-editor-findMatchHighlightBackground`，这个变量在很多主题里本来就调得很淡
（设计给“查找匹配”这种低干扰场景用，不是为“持续标记这段文字有评论”设计的）。加上
 Revision 4 按要求去掉了列表里的引用原文展示，现在唯一能看到“评论对应哪段文字”的地方
就只剩正文里的高亮，所以它一旦太淡就等于整个定位线索都丢了。不重新引入引用文本展示
（尊重你上一轮的明确要求），只加强正文高亮本身的可见度。

### 实施清单

1. **`src/webview/main.css`** `.comment-highlight`：
   - `background-color` 改为 `var(--vscode-editor-findMatchHighlightBackground,
     rgba(255, 196, 0, 0.35))`（保留主题变量优先，但提高 fallback 透明度）
   - 新增 `border-bottom: 2px solid var(--vscode-focusBorder, #007fd4);`（第二通道：
     即使主题的背景色很淡，底部描边也能保证能看出这段文字被标记了）
   - 新增 `padding: 0 1px;`（给标记略微留一点水平呼吸空间，避免背景色紧贴字形）

2. **验证**：`npm run compile` → `get_errors` → `npx tsc --noEmit`。
