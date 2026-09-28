# 简历初筛工作台 · UI 设计蓝图

| 项 | 值 |
| --- | --- |
| 版本 | **v4.3** |
| 日期 | 2026-09-27 |
| 修订记录 | v1.0（2026-09-26）初版蓝图；v2.0（2026-09-26）录入方式改为「文件上传为主、粘贴兜底」并新增文件级失败状态机；v3.0（2026-09-26）彻底移除「粘贴文本」入口（连单条兜底也删除），录入区改为纯文件上传，失败引导文案改为「重新上传可执行指引」，AI 抽取触发链路改为「解析落库→宿主对话聚合指令→用户确认触发」（用户决定）；**v4.0（2026-09-27）两项决策定稿：D1「新建岗位」= 工作台内表单 Dialog（新后端 action `create_job`，v3 的 clientCommand 对话引导方案作废）；D7 AI 解析 = 链路 B 插件服务端队列直调模型（文件解析落库即自动入队 managed-queue，worker 逐份「JD+单文本」直调 deepseek 回填，v3 的「聚合指令+用户对话确认」设计整体删除；重试=服务端直接重新入队），上游 spec 同步修订至 v2.2；D2–D6 采纳蓝图默认值（已确认）**。受影响章节（v4.0）：四维速览表、§0.2/§0.3、§3.2/§3.7/§3.8、§6.1/§6.3/§6.4/§6.6/§6.7/§6.8、§7（A12）、§10（P4 改写、P6 补记）、§11、§12、§13。总布局（方案 A）、候选人六态徽标、§5/§8/§9、乐观锁冲突（§6.5）、remixicon/shadcn-ui 铁律、§11 其余性能约束 不变；**v4.1（2026-09-27）文件通道平台事实修正（「建」阶段勘察回炉，非产品决策变更）**：v2–v4 所设「宿主渲染文件选择器、iframe 不接触字节、上传主按钮常驻宿主 toolbar」经平台源码核实为错误事实——`transport:'file'` 唯一形态是 iframe 自绘隐藏 `input[type=file]` 多选、逐文件经 bridge `executeFileAction` 携带 ArrayBuffer 字节、宿主 multipart 代理到 provider `executeViewFileAction`；且宿主对 remote_component 视图不渲染 toolbar（证据：`platform/packages/plugin-sdk/docs/view-extension-protocol.md` File Action Rules、`platform/apps/cloud/src/app/@shared/view-extension/view-renderer.component.ts:248-251`；先例 smart-maintenance `app.js:676-686` 与 knowledge-workbench `main.tsx:681` 均为 iframe 自绘选择器）。受影响节：四维速览表（交互行）、§0.3（L52/L54）、§3.7、§6.6、§8 选型表「文件选择器」行、§10 P6 补记。上传为唯一录入方式、六态徽标、链路 B、D1 Dialog 等用户决策与布局交互设计零变更，上游 spec 同步 v2.3；**v4.2（2026-09-27）上传队列校准源事实修正（建段二次勘察回炉，非产品决策变更）**：v2 蓝图所设 `intakeTasks` 文件级录入台账（§0.3「v2 服务端配套」）经全仓核实**从未落入后端**（无实体/无 getViewData 字段/spec 与计划亦无此要求，系蓝图幻影字段），且后端 `executeViewFileAction` 每文件回执 `data:{fileName, created[{id,status}], skipped, sourceFileName}` 已自带队列收敛全部事实——队列数据源改为**回执驱动的前端内存态**（§3.7/§6.6/§8/§11 同步），`上传中/解析中(服务端)` 因同属一个请求往返前端不可区分，合并为单一「上传中」进行态（文件级徽标收敛 5 态），失败文案=回执中文 message 直显（§6.6 映射表保留为文案基准），行持久化/页面刷新后台账消失属**已知限制**（候选人行 sourceFileName 保留来源可溯）；不新建后端台账任务（避免推翻已部署真机复验的冻结链路），上游 spec 无需改动。受影响节：§0.3、§3.7、§6.6、§7（A9/reduced-motion）、§8 v2 注、§10 P6、§11；**v4.3（2026-09-27 M10 真机冒烟回炉，槽位通道事实修正，非产品决策变更）**：v1–v4.2 所设「工作台= `agent.workbench.main` 槽 iframe」经平台源码与真机双重复核为**错误通道事实**——运行时对话（用户实际使用工作台的界面）只查询 `agent.workbench.fixed` 槽并以其 manifest 开远程组件 tab（`clawxpert-conversation-detail.component.ts:1784`；全 cloud 检索 main 槽唯一消费者=studio 工作流中间件面板 `middleware/middleware.component.ts:74`），先例 smart-maintenance 双槽注册且运行时靠 fixed 存活（带 `workbench:{fixed:true,menu}`，`smart-maintenance-view.provider.ts:57-107`）。宿主通道修正：视图注册改为 **main+fixed 双槽**（fixed 变体附加 menu 声明，activation 两槽都必须带——两槽 policy 均 requireFeatureActivation）。iframe 内部设计（§0.3 文件通道、回执驱动队列、六态徽标、D1 Dialog、§3–§9、§11 全部布局/交互/视觉）**零变更**——本修正只改「宿主在哪里挂载这个 iframe」，不改 iframe 里画什么；toolbar 不渲染等 v4.1 结论对 fixed 槽 remote_component 同样成立。取证 `plugins/md/operation/2026-09-27-m10-ui-smoke.md`。上游 spec 同步 v2.4。受影响节：§0.2、头部版本/上游依据行；§14 通道事实清单（如有） |
| 状态 | **已确认**（D1–D7 已于 2026-09-27 全部定稿，S4 可进入「建」阶段，spec §8.5.1 红线解除；**v4.1/v4.2/v4.3 为文件通道、队列校准源与视图槽位模型事实修正版，无新增待确认决策**） |
| 阶段 | 「谋 · 谋局定策」产出物（spec §8.5.1） |
| 上游依据 | `resume-screen-spec.md` **v2.4** §8.0 / §8.1 / §8.3 / §8.5（§7.6 视图槽位模型 v2.4 双槽） |
| 视觉基线 | `crm-workbench` 远程组件（主）+ `smart-maintenance` 远程组件（佐证） |
| 适用范围 | `plugins/community/apps/resume-screen/src/lib/remote-components/resume-screen/`（iframe 远程组件） |

## 四维决策速览表

| 维度 | 决策结论 | 详见 |
| --- | --- | --- |
| **布局** | 方案 A：双栏 master-detail（左列表 320px + 右详情常驻）+ 顶部岗位/统计条 + 底部可折叠录入区（**纯文件上传，v3 无粘贴入口**）；宿主容器 <720px 时右详情降级为 Sheet 抽屉（对齐 crm Inspector 模式） | §3 / §4 |
| **样式** | 全量对齐 crm token（面板 #ffffff、边框 #e5e7eb、正文 13px、圆角 5px、控件高 1.875rem），状态徽标采用 smart-maintenance「软底色 + 深文字」成对模式；组件只用 `@xpert-ai/plugin-shadcn-ui`，图标只用 remixicon 类名 | §5 / §8 / §9 |
| **交互** | 列表行点击即选中、处置后自动滑向下一条待审（初筛流水线节奏）；录入为**纯文件上传**（**v4.1**：iframe 录入面板自绘隐藏 `input[type=file]` 多选，逐文件经 `transport:'file'` 字节通道提交，宿主仅 multipart 代理；v3 删除粘贴入口），文件解析落库即自动入队服务端队列、worker 直调模型回填评分（**v4 链路 B，全程无对话确认步骤**）；「新建岗位」为工作台内表单 Dialog（**v4 D1**，提交走新 action `create_job`，不走宿主对话）；交互状态机覆盖 loading / empty / error / 乐观锁冲突 / 解析超 10 分钟 / 上传排队→解析→失败（按文件）；所有错误 `role=alert` + `notify()` 双通道 | §6 |
| **动画** | 统一 motion token（120/160/240ms 三档，entry 用 ease-out、exit 用 ease-in、进度用 linear infinite）；列表增删与结果回填有过渡但不闪屏；上传队列行进入 + 文件行状态推进 + 聚合计数数字变化；「新建岗位」Dialog 出入与 AlertDialog 同节奏（v4 A12）；`prefers-reduced-motion` 下全部禁用 | §7 |

---

## 0. 设计输入与边界（谋前必读）

### 0.1 铁律边界（spec §8.0，优先级最高）

- U1 组件只来自 `@xpert-ai/plugin-shadcn-ui`（workspace 包），该包实有导出已核对：alert-dialog / avatar / badge / button / card / checkbox / collapsible / command / context-menu / dialog / dropdown-menu / hover-card / input-group / input / popover / **progress** / resizable / scroll-area / select / separator / sheet / sidebar / **skeleton** / slider / switch / table / tabs / textarea / toggle-group / toggle / tooltip。本蓝图选型不超出此清单。
- U2 图标一律 remixicon 类名（`ri-refresh-line`、`ri-send-plane-line` 等，与 `resume-screen-view.provider.ts` manifest actions 已声明的完全一致；iframe 内以 `<i className="ri-xxx-line" aria-hidden="true" />` 形式使用）。
- U3 样式走「shadcn style.css + 组件前缀 CSS 注入」（同 crm `main.tsx` 的 `import '@xpert-ai/plugin-shadcn-ui/style.css'` + `injectStyles()` 模式），不写与平台冲突的全局 CSS，不覆盖平台主题变量；所有自定义选择器以 `rs-` 前缀隔离（对齐 crm 的 `crm20-` 做法）。
- U4 颜色/间距/圆角/字号/徽标全部取自 crm / smart-maintenance 实测值（见 §1、§9 对照表）。
- U5 字体用平台默认栈，不引入自定义字体文件。
- U6 偏离项集中列在 §10，须同步写入 `resume-screen-review-log.md`。

### 0.2 运行形态约束（宿主容器内自适应）

本视图是 agent 工作台宿主的 iframe 远程组件，不是独立站点。**v4.3 槽位修正**：运行时对话经 `agent.workbench.fixed` 槽呈现本视图（带 `workbench:{fixed:true,menu}` 的 manifest，宿主开为工作区 tab）；`agent.workbench.main` 槽的同一 manifest 保留供 studio 编辑器中间件特性入口。iframe 内渲染契约与下述全部约束对两槽完全一致：

- 尺寸上报：沿用 crm `main.tsx` 的 `ResizeObserver(root) → reportResize()` 模式，容器高度随内容自适应、随宿主伸缩。
- 宽度不可假设：宿主工作台主槽宽度不定（可能与对话面板并排），布局所有栅格列使用 `minmax(0, ·)` 防溢出，<720px 切换为「列表 + 抽屉」降级形态。
- 最小可用高度 640px（对齐 crm `.crm20-shell { min-height: 640px }`）；iframe 无全局滚动，滚动收敛到列表区与详情区内部（`overflow: auto`）。
- 不持 token、禁 `localStorage`（spec §8.2），数据一律走 `requestData` / 动作走 `executeAction` / 轻提示走 `notify(message, level)`。
- **v2 注**：spec §8.2 原「不支持文件上传 → 不实现 `executeViewFileAction`」的表述随本蓝图修订作废——上传经平台 `transport:'file'` 通道由宿主承载（§0.3），iframe 仍不持有文件字节。此为 spec 同步修订项（§10 P6），**v4 注：该修订已随 spec v2.2（2026-09-27）落地，P6 关闭**。

### 0.3 业务事实（决定界面呈现什么）

来自 `resume-screen/src/lib/types.ts` 与 `resume-screen-view.provider.ts`：

- 视图数据 `ResumeScreenViewData`：`jobs[]`（含 `jdText`）、当前 `job`、`candidates[]`（抽取字段 name/yearsOfExperience/education/currentCompany/skills[]/summary、评分 matchScore/matchReason、hitPoints[]/riskPoints[]、humanEditedFields[]、attemptCount/failureReason/reviewedAt/revision）、`stats{total,pendingReview,accepted,hold,rejected,failed,parsing}`、`page{number,size,total}`。
- 候选人状态机：`draft / parsing / pending_review / accepted / hold / rejected / failed`（`draft` 为服务端中间态，不进 UI；UI 呈现六态 = pending_review / accepted / hold / rejected / failed / parsing）。
- 前端可触发的 action（与 manifest 一致，UI 不得臆造其他后端动作）：`refresh`、`upload_resume_files`（**v3 唯一录入口**，manifest 声明 `transport: 'file'`，**v4.1：由 iframe 录入面板自绘选择器触发、iframe 携带字节经 `executeFileAction` 通道提交**，provider 侧写法参照 `smart-maintenance-view.provider.ts:130-137`）、`create_job`（**v4 D1 新增**：新建岗位，`executeViewAction` invoke 分支，提交 `title` + `jdText`）、`retry_candidate`（重试，**v4：服务端条件置 `parsing` 并直接重新入队，不再发对话指令**）、`update_candidate`（人工修正，携带 `expectedRevision` 乐观锁，成功回传最新 `revision`）、`accept_candidate / hold_candidate / reject_candidate / reset_candidate`（处置四动作）。
- **v4 录入与 AI 触发链路（链路 B：插件服务端队列直调模型，spec v2.2 §8.3 新时序）**：v3 的「文件 action 回执 `commandKey` 聚合指令 + 用户对话确认触发」方案**整体作废**；`prepare_parse_message` action 已从 manifest 删除（`sourceText` 唯一来源=服务端 docx/pdf 解析结果，此点沿用 v3）。新链路：`upload_resume_files` 逐文件回调 → 服务端校验 + 解析文本 + `prepareIntakeDraft` 落库候选人（`status=parsing`，写 `sourceFileName`，dedupeKey 幂等）→ **即自动入队 `managed-queue`**（payload 仅 `candidateId`，`jobId=resume-parse-{id}-{attempt}` 确定性幂等）→ 同进程 worker（`@PluginJobProcessor`，逻辑并发 3）组装「JD+单份文本」prompt，经 `XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN` **直调 deepseek provider** 做结构化抽取评分 → `saveCandidatesFromAgent` 回填 `pending_review`，模型失败 attempts 耗尽则置 `failed`+`failureReason`。**全程自动、零对话确认步骤**；宿主对话降级为可选查询旁路（三工具与 hostEvents 订阅保留，工作台 UI 不依赖）。UI 侧无文本录入框；队列/模型直调是**服务端事实**（勘察已定稿），UI 无新增视觉元素需求，仅文案、时序与组件清单变更。
- **文件通道事实（v4.1 修正，以平台源码勘察为准）**：`transport: 'file'` 的 action 唯一链路是 **iframe → bridge `executeFileAction` 消息（携带文件字节 ArrayBuffer + `targetId/input/parameters` JSON 字段）→ 宿主构建 FormData → multipart 代理 → provider `executeViewFileAction(context, viewKey, actionKey, request, file)`**（单文件签名，`file = { buffer, originalname?, mimetype?, size? }`，见 `@xpert-ai/plugin-sdk` `provider.interface.d.ts`；协议见 `view-extension-protocol.md` File Action Rules）。宿主**不渲染文件选择器**，宿主→iframe 消息表封闭（无「已选文件/上传进度」类通知消息），且宿主对 remote_component 视图**不渲染 toolbar 动作**（`view-renderer.component.ts:248-251`），故选择器必须由 iframe 自绘（隐藏 `input[type=file][multiple]`，先例：smart-maintenance `app.js:676-686`、knowledge-workbench `main.tsx:681`）；服务端（插件）负责 docx/pdf→文本解析后复用现有 `prepareIntakeDraft` 链路。批量感 = 选择即前端乐观入队（文件名=本地 `File.name` 事实）+ iframe 逐文件发送字节 + 每文件 provider 返回 `refresh:true` 校准（回执 `data:{fileName, created[{id,status}], skipped, sourceFileName}`，**v4.2：队列收敛唯一事实源**）。
- **v2 服务端配套（**v4.2 事实修正**：以已交付后端为准）**：候选人实体新增可选 `sourceFileName`（来源文件名，**已实现**：详情/Tooltip 可溯）；上传队列的校准事实源 = `executeViewFileAction` 每文件回执 `data:{ fileName, created[{id,status}], skipped, sourceFileName }`（**已实现**）；~~`getViewData` 文件级录入台账摘要 `intakeTasks`~~ **不存在且不再新增**（后端从未实现，无台账实体；建段二次勘察裁定，不为此开后端任务——避免推翻已部署真机复验的冻结链路）。队列行为**前端内存态**（刷新页面即丢，属已知限制；候选人列表 + parsing 心跳承接跨刷新呈现）。`dedupeKey` 仍为文本哈希，语义不变——同文件重复上传经文本解析后命中去重、回执 `skipped` 非空自然跳过。
- 查询口径：`jobId / status / sortBy(matchScore|createdAt|updatedAt) / sortDir` 走 parameters，`search / page / pageSize` 走宿主标准字段，默认 pageSize 20。
- 自动刷新（**v4 适配**）：队列 worker 回填为服务端 service 直写，**无 `assistant.tool.completed` hostEvent 主路径**（宿主订阅保留，仅覆盖对话旁路场景）。刷新依靠两柱：① 逐文件上传/重试等 action 回执 `{ refresh: true }` → `requestData`；② 存在 `parsing` 行时 30s 心跳静默轮询（§11）。服务端另有 sweep 每 5 分钟兜底 parsing 超时行重投/标失败（§6.4），对用户透明。
- 乐观锁：`update_candidate` 冲突时服务端抛错，provider 转为 `success:false` + 可读 message；前端须给恢复路径（§6.5）。

---

## 1. 既有设计基线勘察结论

### 1.1 crm-workbench（主基线，源码实测）

提取自 `crm/src/lib/remote-components/crm-workbench/src/styles.ts`（`injectStyles()` 注入）：

| 类别 | 实测值 |
| --- | --- |
| 面板/侧栏底色 | `--crm20-panel: #ffffff`、`--crm20-sidebar: #f4f5f7` |
| 文字三级 | 主 `#1f2937`、次 `--crm20-muted: #6b7280`、弱 `--crm20-soft: #9ca3af` |
| 边框两级 | `--crm20-border: #e5e7eb`、`--crm20-border-soft: #f0f1f3` |
| 交互底色 | hover `#f7f7f8`、行 hover `#fafafa`、选中 `--crm20-active: #f1f5ff`、勾选 `#f8fbff` |
| 主色 | `--crm20-primary: var(--primary, var(--xui-color-primary, #2563eb))`（读宿主 token，回退 #2563eb） |
| 状态色（对象色） | 蓝 `#4169e1/#e6edff`、靛 `#5b5fc7/#eef2ff`、红 `#e5484d/#ffe8e6`、绿 `#0f9f6e/#dcf7ef`、青 `#0f766e/#e8f7f4` |
| 告示条 | 边 `#f2c94c`、底 `#fffbeb`、字 `#7a4d00`（13px） |
| 错误强调 | `#dc2626`（必填星号等） |
| 圆角 | 控件/搜索框/告示 `5px`，头像 `8px`，胶囊 chip `12px`，控件变量 `--xui-radius-md: 0.375rem` |
| 控件规格 | 高 `1.875rem`(30px)/sm 28px/lg 34px，控件字号 `0.8125rem`(13px) |
| 字号阶梯 | 页题 16px / 正文·强调 13px / 次要 12px / 辅助 11px；行高 1.3–1.5 |
| 字体栈 | `Inter, "Plus Jakarta Sans", ui-sans-serif, system-ui, ...` |
| 布局骨架 | `grid: 260px minmax(0,1fr)`；主区行 `50px 48px auto 1fr`；断点 960px / 560px |
| 加载态 | 顶部 2px 扫描线（`.crm20-loading-line`，`1s ease-in-out infinite` 平移），**无骨架屏** |
| 空状态 | 居中竖排（icon 42px + 加粗文案 + CTA 按钮），`min-height: 280px`，gap 14px |
| 徽标 | shadcn `Badge`（`variant="secondary"`），定制高 18–20px、字号 10–12px |
| 动画 | 仅 1 个 keyframe（加载线）+ 选择条 `min-height 140ms ease` 过渡；`prefers-reduced-motion` 全量关闭 |
| 组件用法 | Button(default/outline/ghost, size=icon/sm)、Badge、Checkbox、Input、Select 族、Sheet(右侧 400px)、Tabs、Textarea、Table 族、DropdownMenu 族（含 RadioGroup/CheckboxItem） |

### 1.2 smart-maintenance（佐证基线，构建产物实测）

提取自 `smart-maintenance/src/lib/remote-components/smart-maintenance/app.js` 内联 CSS 与 `smart-maintenance-view.provider.ts`：

| 类别 | 实测值 |
| --- | --- |
| Token 体系 | `:root` 语义变量：bg `#f5f7fb`、card `#ffffff`、text `#142033`、muted `#64748b`、border `#dce4ef` |
| 状态色 | **「强色 + 软底」成对**：blue `#1769e0`/`#eaf2ff`、green `#16834a`/`#e8f7ee`、red `#d3382d`/`#fff0ee`、amber `#c77900`/`#fff6df` |
| 徽标 | `.sm-badge`：高 22px、圆角 5px、padding 2px 8px、字号 12px、字重 720、默认底 `#edf2f7` |
| 统计 pill | `.sm-stat-pill`：`999px` 胶囊、1px 边框、白底、padding 4px 9px、gap 6px、内部「加粗数值 + 弱色标签」 |
| 空状态 | `.sm-empty`：圆角 7px、底 `#f8fafc`、muted 字、padding 22px 14px、居中 13px |
| 图标方案 | manifest actions 全部 remixicon 类名（`ri-refresh-line`、`ri-send-plane-line`、`ri-restart-line`、`ri-save-line`、`ri-arrow-right-up-line`、`ri-pause-line`、`ri-close-circle-line`、`ri-arrow-go-back-line` 等） |

### 1.3 勘察结论

1. 两套基线同构：白面板 + 浅灰容器 + 三级灰字 + 5px 圆角控件 + 「软底/强字」状态徽标 + 居中空态 + 顶部扫描线加载。
2. 冲突裁决：crm 与 smart-maintenance 的蓝色（#4169e1 vs #1769e0）与绿色（#0f9f6e vs #16834a）取值不同。**主取 crm**（同为 grid 工作台、有完整源码、与本视图信息结构最接近），状态色语义化后优先读平台 token（`--info/--success/--warning/--destructive`，见 `packages/shadcn-ui/src/theme.ts`），回退值取两者中更接近平台语义 token 的 crm 系取值。逐项对照见 §9。
3. crm 用「扫描线」做加载、无骨架屏；但 shadcn-ui 包内已有 `Skeleton`，且本次首屏为双栏异步聚合数据（骨架能防 CLS）。裁决：**首屏用 Skeleton，增量刷新用扫描线**——两者都在平台语言内（Skeleton 是组件库原生件），并在 §9 对照表标注此差异。
4. ui-ux-pro-max 检索佐证（`--design-system --density 8` + ux 域）：数据密集仪表盘方向、行 hover 高亮、筛选平滑过渡、骨架 + `aria-busy`、错误 `role=alert`、entry 用 ease-out / 进度用 linear、无限动画仅限加载指示、`prefers-reduced-motion` 必须尊重。检索建议的配色/字体与本任务 U4/U5 冲突，**按铁律弃用**，仅采纳其交互与动效准则。

---

## 2. 候选方案与取舍

> 按 spec §8.5.1 要求，至少 3 个候选方案、逐一说明淘汰理由、拒绝第一直觉定案。

### 方案 A：双栏 master-detail + 底部录入条（✅ 最终选定）

```
┌─────────────────────────────────────────────────────────────────┐
│ [岗位 ▾ 前端工程师] [+新建]   | 共12 · 待审5 · 推进3 · 待定1 …   │
├──────────────────────┬──────────────────────────────────────────┤
│ 搜索…          筛选▾ │  张三            匹配 86   ● 待审        │
│ 状态: 全部▾  排序 ▾  │  ─── 5年 · 本科 · XX公司 · [人工修正×2]   │
│ ┌──────────────────┐ │  技能 React / TypeScript / NestJS         │
│ │张三  86 ▓▓▓ 待审 │ │  评分理由（区块）…                        │
│ │李四  72 ▓▓░ 待审 │ │  命中点(绿pill) / 风险点(红pill)          │
│ │王五  41 ▓░░ 淘汰 │ │  ┌──────────────────────────────────────┐│
│ │赵六   — ⚠ 失败   │ │  │ [推进] [待定] [淘汰] | [撤回][编辑][重试]││
│ └──────────────────┘ │  └──────────────────────────────────────┘│
│ 加载更多 (12/20)      │                                          │
├──────────────────────┴──────────────────────────────────────────┤
│ ▸ 上传队列（.docx/.pdf · 多文件，宿主通道）  [上传简历文件] │
└─────────────────────────────────────────────────────────────────┘
```

- 优点：与 spec §8.1 信息架构线框同构（零翻译成本）；「读详情 → 处置 → 看下一条」流水线零切换；crm 的 grid 工作台骨架与行样式可整体复用；处置动作条常驻右下，符合高频短路径操作。
- 缺点：宿主容器过窄时右栏拥挤，需 720px 断点降级为抽屉（成本可控，crm 已有 Sheet 先例）。

### 方案 B：全宽表格 + Sheet 抽屉详情（crm Inspector 同构）— 淘汰

- 形态：候选人列表用 shadcn Table 全宽铺开（姓名/年限/学历/公司/评分/状态六列），点行开 400px 右侧 Sheet 完成阅读与处置，底部录入条同 A。
- 淘汰理由：
  1. 初筛是「逐份深读评分理由/风险点后裁决」，不是「多行横向比对」——表格密度优势用不上，反而每次处置都要「开抽屉 → 关抽屉」，单条操作 +2 步，与高频处置场景相悖；
  2. 评分理由、命中/风险点等长文本在表格里只能截断，信息反而要二次进抽屉才能读全；
  3. 宿主 iframe 容器宽度不定，crm 表格 `min-width: 1040px` 的横滚体验在半宽容器里已经很难受，本视图若复制该形态会放大问题；
  4. 底部录入区（上传队列）与表格争夺纵向空间，列表可滚动高度被压缩。
- 保留价值：若未来出现「横向比对多人评分」的诉求，B 可作为 A 的「对比模式」扩展，不影响现骨架。

### 方案 C：状态泳道看板（待审/推进/待定/淘汰四列卡片）— 淘汰

- 形态：按状态分列的 mini kanban，卡片含姓名/分数/关键词，拖拽或按钮改状态。
- 淘汰理由：
  1. 本工作台状态流转由服务端评审 action 驱动（`accept/hold/reject/reset` 四个 invoke），**没有拖拽排序类 action**，看板的拖拽交互只能是伪交互；
  2. 四列分栏后宿主容器内每列不足 200px，评分理由/命中点/风险点完全放不下，卡片只能显示名字和分数，反而逼用户再开一层详情（比 B 多一层）；
  3. `failed / parsing` 两态无法归入四条泳道，需要额外溢出区，信息架构破碎；
  4. 与 §8.1 线框偏离最大，直接违反 U4「视觉基线参照」的忠实性要求。

### 列表形态子取舍（方案 A 内部）：表格行 vs 双行列表卡 — 选后者

- A1 表格行（复用 shadcn Table）：320px 左栏放不下「姓名+年限+学历+公司+分数+状态」六列，必然重度截断。
- A2 双行列表卡（选定）：第一行「姓名 + 匹配分徽标 + 状态徽标」，第二行「年限 · 学历 · 公司」弱色小字；匹配分下衬 4px Progress 细条。初筛关键三元组（人—分—状态）一眼可读，副行元数据低干扰，行高约 52px 在 320px 宽度下信息完整。
- 裁决依据：列表的信息职责是「排序定位 + 状态总览」，详情的职责才是「深读」。A2 把深读完全交给右栏，职责最干净。

**最终选定：方案 A（含列表形态 A2）。** 以下章节均基于方案 A 展开。

---

## 3. 布局详设（方案 A）

### 3.1 容器栅格

```
.rs-shell（grid，min-height 640px，高度随宿主 iframe）
├─ rs-header    48px   岗位切换区（含新建岗位入口）
├─ rs-statsbar  40px   统计条（可点击筛选）
├─ rs-content   1fr    grid: 320px minmax(0, 1fr)；gap 0，中缝 1px 边框
│  ├─ rs-list-panel    左列表（自身 overflow:auto）
│  │   ├─ rs-list-tools  auto  搜索 + 状态筛选 + 排序
│  │   ├─ rs-list        1fr   候选人双行列表卡 × N
│  │   └─ rs-list-foot   auto  加载更多 / 计数
│  └─ rs-detail-panel  右详情（自身 overflow:hidden，内部分区滚动）
│      ├─ rs-detail-head  auto  姓名 + 状态徽标 + 元信息
│      ├─ rs-detail-body  1fr   抽取字段 / 评分 / 命中 / 风险（ScrollArea）
│      └─ rs-detail-foot  auto  处置动作条
└─ rs-intake    auto   底部录入区（纯文件上传队列；Collapsible，收起时 44px 把手，把手挂上传队列计数）
```

- 栅格列一律 `minmax(0, ·)`，任何长文本（JD 名、评分理由、URL）只做省略号或换行，不撑破容器。
- 中缝、区块分隔全部使用 `--rs-border` 1px 实线（对齐 crm `.crm20-object-header` 的 50px 头 + 1px 边框节奏）。
- 间距节奏对齐 crm：区块内边距 10–14px，元素间 gap 8px（操作区）/ 10px（表单区）/ 4px（紧凑列表），列表行高 52px，工具条高 44px。

### 3.2 岗位切换区（rs-header，信息架构①）

- 左侧：`ri-briefcase-line` 图标 + `Select`（当前岗位，选项来自 `jobs[]`，显示 title；切换即以 `jobId` 参数重新 `requestData`，并清空选中与筛选）。Select 触发器样式对齐 crm 搜索框（高 30px、5px 圆角、1px 边框、focus 蓝圈 `box-shadow: 0 0 0 3px rgba(37,99,235,.12)`）。
- 右侧：`Button variant="outline" size="sm"`「新建岗位」（`ri-add-line`）+ `Button variant="ghost" size="icon"`「刷新」（`ri-refresh-line`，对应 manifest `refresh` action）。
- **新建岗位表单 Dialog（v4 D1 定稿：纯按钮/表单操作，v3 的 clientCommand 对话引导方案作废）**：点「新建岗位」弹 `Dialog`——字段「岗位名称」（`Input`，必填，≤200 字，超限截断并显弱色计数）+「职位描述」（`Textarea`，必填，≥30 字——过短无法有效匹配评分）+ 底部「取消」（ghost）与「保存」主按钮（default；提交期间 `disabled` + 文案「保存中…」防重，表单区 `aria-busy`）。
  - 校验与错误呈现沿用本蓝图既有状态机语言：未填/过短→字段下方红色错误行内文案（`aria-invalid` + `aria-describedby`，色取 §5 错误强调 `#dc2626`），提交时焦点移到首个无效字段；键盘：名称框 Enter 提交、Textarea Enter 换行、Esc 取消关闭（未提交内容直接丢弃，不做草稿持久化）；焦点环同 §6.8。
  - 提交走**新后端 action `create_job`**（`executeViewAction` invoke 分支，携带 `title` + `jdText`，spec v2.2 已声明）：成功 → `notify('岗位已创建')` → **自动切换到新岗位**（岗位 Select 置新岗位、清空选中与筛选、重新 `requestData`）；标题重复（服务端 jdHash 幂等语义）→ 回执 `success:false` → `notify` 提示「该岗位已存在」，Dialog 保持打开、焦点回名称字段；其他异常 → Dialog 内 notice 红变体 + `notify(message, 'error')`（§6.1 通用错误出口）。
- 岗位 JD 入口：详情区头部提供「查看 JD」`Tooltip` + `Popover`（展示 `job.jdText` 摘要），不占独立栏。

### 3.3 统计条（rs-statsbar，信息架构②）

- 形态复用 smart-maintenance `.sm-stat-pill`：`999px` 胶囊、1px 边框、白底、内部「加粗数值 + 12px 弱色标签」，横向排列，超出横向省略（不换行）。
- 内容：`共 N`、`待审 n1`（蓝）、`推进 n2`（绿）、`待定 n3`（琥珀）、`淘汰 n4`（红）、`失败 n5`（红描边）、`解析中 n6`（蓝 + 微型 loader）——数值取 `stats`。
- **统计 pill 即状态筛选器**：点击与左列表「状态筛选」同源联动（同一 state），选中 pill 反转填充（软底 → 强色底白字，160ms 过渡）。再次点击取消回到「全部」。
- 布局规则：`共 N` 固定在左侧，状态 pill 依 pendingReview 降序排列，为 0 的状态仍显示（数值置灰），保证位置记忆。

### 3.4 左列表（信息架构③：搜索 + 状态筛选 + 排序）

- 工具条（rs-list-tools，高 44px，上下两行不超出）：
  - 搜索：label 容器（18px `ri-search-line` + input）对齐 crm `.crm20-search`（高 30px、底 `#fbfbfc`、5px 圆角）；**Enter 提交**（对齐 crm `applySearch`），带 300ms debounce 的失焦提交；有生效关键字时在筛选行显示 `Badge variant="secondary"`「搜索中」+ 可清除 ×。
  - 状态筛选：`Select`（全部/待审/推进/待定/淘汰/失败/解析中），与统计条 pill 双向联动。
  - 排序：`DropdownMenu + DropdownMenuRadioGroup`（对齐 crm 排序菜单写法）：匹配分降序（默认）/ 匹分升序 / 创建时间降序 / 创建时间升序 / 更新时间降序，映射 `sortBy` + `sortDir`。触发按钮用 crm `.crm20-toolbar-button` 样式（生效时 `.is-active` 蓝底高亮）。
- 列表卡（rs-item，高约 52px，双行）：
  - 行结构：左 28px 圆角方形首字头像（复用 crm `.crm20-record-mark` 规格 5px 圆角、9px 加粗白字，底色随状态徽标强色）→ 主行「姓名(13px/650) + 匹配分 Badge + 状态徽标 Badge」→ 副行「5 年 · 本科 · XX 公司」(12px muted，逐段省略号)；parsing/failed 无分数时副行改为解析中说明或失败原因一行摘要。
  - 来源角标（v2 新增，可选）：`sourceFileName` 存在时在姓名右侧挂 10px `ri-file-line` 弱色小图标（`Tooltip` 显示完整文件名），点击不拦截行选中；无该字段不占位（v3 起所有候选人均经文件录入，理论上恒有来源；服务端未回传时按无角标处理）。
  - 匹配分 Badge：右侧固定 40px（`tabular-nums`，13px/750），下方 3px `Progress` 细条（0–100，颜色随分数档：≥70 蓝、40–69 琥珀、<40 红——与详情评分区同档）。
  - 交互：整行可点（选中态 `--rs-active: #f1f5ff`，120ms）；hover `#fafafa`；`aria-current="true"` 标记选中；键盘 ↑/↓ 在列表内移动选中并自动滚动到可见（`scrollIntoView({ block: 'nearest' })`）。
  - 解析中行：状态位显示旋转 loader + 「解析中」；解析超 10 分钟转「解析超时」琥珀徽标（§6.4）。
  - 失败行：状态位红描边「失败」+ `ri-error-warning-line`，副行显示 `failureReason` 单行省略。
- 列表脚（rs-list-foot）：`加载更多` ghost 按钮（追加下一页，`page.size=20`）+ 「已显示 m / 共 N」12px 弱色计数（对齐 crm footer 计算条的信息职责）。
- 加载态：首次加载列表区渲染 6 行 Skeleton（头像块 + 双行条），`aria-busy="true"`；增量刷新用顶部 2px 扫描线（§1.3 裁决）。
- 空态：分两种——无候选人（「暂无候选人，上传简历文件开始初筛」+ 唯一 CTA「上传简历文件」（触发 `upload_resume_files`）+ 副文案「支持 .docx / .pdf，可多选」）；筛选无结果（「没有符合条件的候选人」+ CTA「清除筛选」）。复用 crm `.crm20-empty-table` 居中竖排写法。

### 3.5 右详情（信息架构④：抽取字段 + 评分理由 + 命中点 + 风险点 + 人工修正标记）

- 头部（rs-detail-head）：
  - 首行：36×36 圆角 8px 首字头像（对齐 crm inspector avatar）+ 姓名 16px/650 + 状态徽标 + 「人工修正」标记。
  - 人工修正标记：`humanEditedFields` 非空时显示 `Badge`（软蓝底 + `ri-edit-2-line` + 「人工修正 n 项」），`Tooltip` 列出字段清单（服务端语义：修正字段不会被 AI 覆盖——保存文案「已保存（人工修正字段不会被 AI 覆盖）」与 provider 一致）；被修正字段行内再挂 12px 小徽标。
  - 次行元信息：`年限 · 学历 · 当前公司 · 创建于 MM-DD HH:mm · 第 k 次解析`（12px muted，对齐 crm inspector-meta）；来源行：`sourceFileName` 存在时追加「· 来源 `ri-file-line` 文件名」（弱色，`Tooltip` 全名），无来源不显示。
- 正文（rs-detail-body，ScrollArea，纵向依次四个区块，区块间 1px soft 边框分隔，区块标题 12px/700 弱色大写风格对齐 crm `.crm20-nav-section`）：
  1. **抽取字段**：两列 grid（<560px 单列），label 12px muted / 值 13px/650（复用 crm `.crm20-read-field` 双行模式）；字段：姓名、年限、学历、当前公司、技能（skills 用 `.rs-chip` 胶囊，复用 crm `.crm20-pill` 规格：高 22px、圆角 11px、底 `#f3f4f6`）。
  2. **匹配评分**：左侧大号分数（24px/750 + `tabular-nums`）+ 「/100」弱色；分数下 6px `Progress` 条（分档色同列表）；无分数（parsing/failed）时本区块显示占位说明。下方「评分理由」13px/1.6 正文块，最多 8 行折叠 + 「展开」（`Collapsible`）。
  3. **命中点**：绿色软底 pill 列表（`ri-checkbox-circle-line` + 文本，底 `--rs-green-soft`，字 `--rs-green`），`flex-wrap`；空时显示弱色「—」。
  4. **风险点**：红色软底 pill 列表（`ri-error-warning-line`，底 `--rs-red-soft`，字 `--rs-red`）；空时显示「未识别到风险」弱色文案。
- 失败覆盖态：`status=failed` 时正文顶部插入告示卡（复用 crm `.crm20-notice` 结构，红色变体：边 `--rs-red` 40% 透明、底 `--rs-red-soft`、字 `--rs-red`，`role="alert"`）：`ri-error-warning-line` + `failureReason` 全文 + 「重试」按钮（§6.3）。
- 解析中覆盖态：`status=parsing` 时正文显示骨架（字段/评分/命中三个区块的 Skeleton 条）+ 「AI 正在解析该简历…」弱色说明 + 已耗时计时；超 10 分钟转超时卡（§6.4）。
- 编辑态：「编辑」后字段区切换为表单（`Input` / 年限·学历用 `Input`、技能用 tag 输入（`Input` + chip 删除）、`matchScore` 用 `Input type=number`），label 带必填/类型说明（对齐 crm `.crm20-field`）；footer 变「取消 / 保存」。

### 3.6 处置动作条（rs-detail-foot，信息架构⑤）

- 高 56px、上边框 1px、右对齐、gap 8px（对齐 crm `.crm20-inspector-actions`）。
- 按钮编排（按状态显隐，全部来自 manifest actions）：

| 按钮 | action | variant | 图标 | 显隐 |
| --- | --- | --- | --- | --- |
| 推进 | `accept_candidate` | default（主色） | `ri-arrow-right-up-line` | pending_review / hold / rejected / failed |
| 待定 | `hold_candidate` | outline | `ri-pause-line` | pending_review |
| 淘汰 | `reject_candidate` | outline destructive | `ri-close-circle-line` | pending_review / hold |
| 撤回为待审 | `reset_candidate` | ghost | `ri-arrow-go-back-line` | accepted / hold / rejected（终态纠错） |
| 编辑 | 前端态切换（保存走 `update_candidate`） | ghost | `ri-edit-2-line` | pending_review |
| 重试 | `retry_candidate` | outline | `ri-restart-line` | failed（及解析超时） |

- 「淘汰」需二次确认（`AlertDialog`，红强调「该候选人将标记为淘汰，可撤回」）——不可逆感操作轻确认，防误触但不过度。
- 处置成功后：`notify('处置成功')` → 静默刷新 → **自动选中下一条 `pending_review` 候选人**（流水线节奏；仅当被处置者当前被选中时触发，`respectSorting` 沿列表顺序）。
- 执行中：被操作按钮 `disabled` + 文案变体（「提交中…」），操作区 `aria-busy`。

### 3.7 底部录入区（rs-intake，信息架构⑥：**纯文件上传**）【v3 重写：移除全部粘贴入口】

- **唯一入口·「上传简历文件」（v4.1：按钮落位 iframe 录入面板）**：manifest action `upload_resume_files` 声明保留（`placement: 'toolbar'`、图标 `ri-upload-cloud-line`、`transport: 'file'`、`actionType: 'invoke'`）——**v4.1 事实**：宿主对远程组件视图不渲染 toolbar，`placement` 在此仅作动作注册与合法 actionKey 白名单用途（服务端代码无需改动）；主按钮由 iframe 录入面板自绘（把手行左侧「上传简历文件」主按钮 + 空态 CTA 同一入口）。点击弹出 iframe 自绘隐藏 `input[type=file]`（`multiple`、`accept='.docx,.pdf'`，≤10MB 前端预检+服务端复校）；多选后前端**逐文件**经 bridge `executeFileAction` 发送字节（宿主通道为单文件粒度），provider 每文件回执 `{ success, refresh:true }`。**v3 删除**：v2 的「粘贴单条兜底」输入框与提交钮全部移除，录入区不再出现任何文本录入控件。
- **iframe 录入面板（rs-intake，收起态 44px 把手）**：把手行——`ri-upload-cloud-line` + 「上传队列」+ 右侧「展开」`ri-arrow-down-s-line`；存在进行中/失败批次时把手挂计数徽标（「上传中 x · 失败 z」，失败位红）。
- **展开态·上传队列（rs-intake-queue）**：数据源 = **回执驱动的前端内存态上传队列（v4.2，§0.3/§6.6）**；`ScrollArea` 限高 160px、行高 32px，新批次置顶：
  - 聚合条（队列顶部，12px；**v4.2 勘校**：随进行态合并删除「解析中」独立计数，5 态收敛）：「已提交 N 份 · 排队中 a · 上传中 b · 已创建 c · 跳过 d · 失败 e」（数字 `tabular-nums`；存在失败时右侧出现「清除失败记录」ghost 小按钮，纯前端隐藏该批次）。
  - 队列行：`ri-file-line` + 文件名（中段省略号，`Tooltip` 全名）+ 状态徽标 + 操作位——`排队中`（灰 `#edf2f7`/`#536174`，对齐 sm `.sm-badge` 默认态）、`上传中`（**v4.2：与「解析中(服务端)」合并的单一进行态**，蓝 + `ri-loader-4-line` 旋转，`title` 注明「上传并由服务端解析中」）、`已创建`（绿 + `ri-check-line`，右侧「查看」ghost 按钮：滚动定位并选中对应候选人，目标 id=回执 `data.created[0].id`）、`跳过(重复)`（弱色 + 「该简历内容已存在」）、`失败`（红 + `ri-error-warning-line`，行尾展开**可执行的重新上传指引**，§6.6 文案）。
  - 失败原因四类（服务端 failureReason 文案映射，§6.6）：无文本层扫描件 / 加密 PDF / 格式不支持或过大 / 解析异常；均**不产生候选人行**（与 §6.4 的候选人解析超时严格区分），恢复路径一律指向「修正后重新上传」（无粘贴退路）。
- **批量感的呈现**：上传后队列先以文件名**乐观插入 N 行「排队中」**（文件名=本地 `File.name`，v4.1），随逐文件字节回执收敛（v4.2：回执 `data.created/skipped` + 失败 message 即该行终态；刷新后列表按 `refresh:true` 校准候选人侧）；全部收敛前把手计数持续可见，呈现「已提交 N 份，解析中」的批量进度。
- **AI 抽取触发（v4 链路 B，全自动）**：文件文本解析落库后（候选人 `status=parsing`），服务端**即自动入队 `managed-queue`**（payload 仅 candidateId），worker 逐份组装「JD+单份文本」直调模型抽取评分并回填（§0.3 / §6.7）——**无任何对话确认步骤、无 commandKey**；录入区本身不含「触发解析」按钮，也不存在对话侧动作。UI 对该链路的全部呈现＝上传队列徽标推进（结构沿用 v3）+ 候选人列表/详情「AI 解析中」态与结果回填（刷新靠 action 回执 refresh + 存在 parsing 行时的 30s 心跳轮询，§11）。
- 空队列（v4.2：无进行中/未收敛的上传行即空态）：把手弱色提示「上传 .docx / .pdf 开始初筛（可多选）」，点把手展开后显示一句引导 + 上传指引，无输入框。
- 未选岗位时点上传（**v4.1：岗位校验前移到 iframe**）：点「上传简历文件」**不弹选择器**，直接 `notify('请先选择岗位', 'error')` + 岗位 Select 蓝圈脉冲一次（A13）；服务端对回执缺 jobId 的兜底错误仍照常呈现。

> 实现边界（**v4.1 修正**）：上传按钮本体与隐藏选择器都在 iframe 录入面板内（宿主 toolbar 对远程组件不可用），iframe 同时**呈现**队列与聚合进度；每文件**回执为该行终态事实源**（v4.2，无服务端台账），与乐观行按 §6.6 收敛。v3 起录入区**无文本控件**。

---

### 3.8 组件选型清单（区域 × shadcn-ui 组件，全部来自 `@xpert-ai/plugin-shadcn-ui`）

| 区域 | 组件（shadcn-ui 导出名） | 用途与关键 props |
| --- | --- | --- |
| 岗位切换区 | `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` | 岗位切换（`SelectValue` 显示当前岗位 title） |
| 岗位切换区 | `Button`（`variant="outline"` `size="sm"` / `variant="ghost"` `size="icon"`） | 「新建岗位」（v4 起 outline）「刷新」（对齐 crm header-actions 写法） |
| 岗位切换区 | `Dialog`（含 `DialogTrigger/DialogHeader/DialogContent/DialogFooter`） | **新建岗位表单弹窗（v4 D1）**：进出节奏同 A12，打开焦点入「岗位名称」、Esc 取消（详 §3.2） |
| 岗位切换区 | `Input`（岗位名称，必填 ≤200 字）+ `Textarea`（职位描述，必填 ≥30 字）+ `Button`（「保存」主按钮，提交 disabled 防重） | 新建岗位 Dialog 字段与提交；行内错误红字 + `aria-invalid`/`aria-describedby`（§3.2） |
| 岗位切换区 | `Popover`（含 `PopoverTrigger/PopoverContent`） | 查看 JD 原文摘要 |
| 统计条 | `Separator` | 「共 N」与状态 pill 群之间的分隔 |
| 统计条 / 列表 / 详情 / 上传队列 | `Badge`（`variant="secondary"` + `rs-` 定制类） | 候选人状态六态、搜索中、人工修正标记、**上传队列文件态（排队/上传中/解析中/已创建/跳过/失败）**（样式规格见 §8） |
| 左列表工具条 | `Input`（`data-slot="input"`，crm 搜索框同款容器） | 关键字搜索，Enter 提交 |
| 左列表工具条 | `Select` 族 | 状态筛选（与统计 pill 同源联动） |
| 左列表工具条 | `DropdownMenu` + `DropdownMenuTrigger` + `DropdownMenuContent` + `DropdownMenuLabel` + `DropdownMenuRadioGroup` + `DropdownMenuRadioItem` | 排序（完全复刻 crm 排序菜单结构） |
| 左列表 | `Progress` | 匹配分 3px 细条（列表）/ 6px（详情评分区） |
| 左列表 | `Skeleton` | 首屏骨架（列表行 / 统计条 / 详情三区块） |
| 左列表 | `Button`（`variant="ghost"`） | 加载更多、清除筛选、空态 CTA |
| 上传队列（录入区） | `Badge` + `Button`（`ghost` size=sm，「查看」「清除失败记录」） | 文件态徽标与行内动作；上传中/解析中徽标配 `ri-loader-4-line` 旋转（v3：无「改用粘贴」动作） |
| 上传队列（录入区） | notice 条（`rs-` 自绘，crm `.crm20-notice` 红/琥珀变体，`role=alert`） | 文件失败原因展开、聚合失败提示（§6.6） |
| 上传队列（录入区） | `ScrollArea`（限高 160px） | 队列行超出时内部滚动，不撑破录入把手区 |
| **文件选择器** | **（无 shadcn 组件）** | **v4.1**：iframe 自绘隐藏 `input[type=file][multiple]`（display:none，由按钮/程序 click 触发），字节经 `transport:'file'` 的 `executeFileAction` 通道提交——平台唯一可行形态，非组件缺口（先例 smart-maintenance/knowledge-workbench 同款） |
| 右详情头部 | `Tooltip` | 截断文本全文、人工修正字段清单、**来源文件全名** |
| 右详情正文 | `ScrollArea` | 详情纵向滚动（iframe 内滚动收敛） |
| 右详情正文 | `Collapsible`（含 `CollapsibleTrigger/CollapsibleContent`） | 评分理由展开/收起、底部上传队列展开/收起（v3：录入区无文本框） |
| 右详情正文 | `Input` / `Textarea` / `Select` 族 | 编辑态字段（对齐 crm FieldInput 分支：文本/数值/长文本/枚举） |
| 右详情正文 | `Checkbox` | 技能 tag 编辑场景的勾选辅助（如需要，crm 同款） |
| 处置动作条 | `Button`（`variant="default"/"outline"/"ghost"`，destructive 语义类） | 推进/待定/淘汰/撤回/编辑/重试（编排见 §3.6 表） |
| 反馈 | `AlertDialog`（`AlertDialogAction/AlertDialogCancel`） | 淘汰二次确认、乐观锁冲突（§6.5） |
| 反馈 | `Sheet`（`SheetContent side="right"`） | <720px 详情抽屉（宽 `min(400px, 100%-24px)`，对齐 crm Inspector） |
| 反馈 | 通知走 bridge `notify()` + `rs-` notice 条 | 成功/错误轻提示（crm `.crm20-notice` 同构，自绘非组件库项） |

> 说明：`Table` 族、`Tabs`、`Avatar`、`Command` 等导出在本设计中**未选用**——列表形态选了双行卡（§2 子取舍），详情采用分区滚动而非 Tabs。未选用的组件不是缺口，是信息架构裁决的结果。

## 4. 响应式与宿主容器自适应

| 容器宽 | 形态 |
| --- | --- |
| ≥720px | 双栏：左列表 320px + 右详情 |
| <720px | 单栏列表；点行开 `Sheet side="right"`（宽 `min(400px, 100% - 24px)`，对齐 crm `.crm20-inspector-content`）承载详情与处置条；底部录入区保持全宽 |
| <560px | 统计条横向滚动（不换行）；抽取字段单列；头部按钮收纳进 `DropdownMenu`「更多」（对齐 crm 560px 断点的头部折叠做法） |

- 断点用容器查询（`@container`）而非视口媒体查询——iframe 宽度 ≠ 视口宽度，宿主对话面板开合会改变 iframe 宽度；降级方案：不支持容器查询的环境用 `ResizeObserver` 写 `data-rs-width` 属性 + 属性选择器（crm 的 density 切换同思路）。
- 高度：内容区 `minmax(0, 1fr)` + 内部滚动，绝不依赖页面级滚动；`ResizeObserver` 上报 `resize`。

---

## 5. 样式决策（对齐基线，含 token 表）

### 5.1 `rs-` 设计 token（值全部溯源 §1，映射关系见 §9）

```css
:root {
  color-scheme: light;
  /* 结构 */
  --rs-panel: #ffffff;            /* = crm --crm20-panel */
  --rs-bg-soft: #fbfbfc;          /* = crm 搜索框/表头底 */
  --rs-border: #e5e7eb;           /* = crm --crm20-border */
  --rs-border-soft: #f0f1f3;      /* = crm --crm20-border-soft */
  --rs-hover: #fafafa;            /* = crm 行 hover */
  --rs-active: #f1f5ff;           /* = crm 选中底 */
  /* 文字 */
  --rs-text: #1f2937;             /* = crm --crm20-text */
  --rs-muted: #6b7280;            /* = crm --crm20-muted */
  --rs-soft: #9ca3af;             /* = crm --crm20-soft */
  /* 主色：读宿主主题，回退 crm 系蓝 */
  --rs-primary: var(--primary, var(--xui-color-primary, #2563eb));
  --rs-primary-soft: #eff3ff;     /* = crm 工具条激活底 #eff3ff */
  /* 状态色（软/强成对，源自 §1.1/§1.2，语义映射见 §8） */
  --rs-blue: var(--info, #2563eb);        --rs-blue-soft: #eff6ff;
  --rs-green: var(--success, #047857);    --rs-green-soft: #e8f7ee;
  --rs-amber: var(--warning, #b45309);    --rs-amber-soft: #fff6df;
  --rs-red: var(--destructive, #dc2626);  --rs-red-soft: #fff0ee;
  /* 规格 */
  --rs-radius: 5px;               /* 控件/徽标 = crm */
  --rs-radius-lg: 8px;            /* 头像/卡片 = crm avatar */
  --rs-pill: 11px;                /* chip = crm .crm20-pill */
  --rs-pill-round: 999px;         /* 统计 pill = sm .sm-stat-pill */
  --rs-control-h: 1.875rem;       /* 30px = crm --xui-control-height */
  --rs-font-control: 0.8125rem;   /* 13px = crm 控件字号 */
  /* 动画 token（§7） */
  --rs-motion-fast: 120ms;
  --rs-motion-base: 160ms;
  --rs-motion-slow: 240ms;
  --rs-ease-entry: cubic-bezier(0.2, 0, 0, 1);
  --rs-ease-exit: cubic-bezier(0.4, 0, 1, 1);
}
```

### 5.2 样式纪律

- 主题通道：`import '@xpert-ai/plugin-shadcn-ui/style.css'` + `injectStyles()` 注入 `rs-` 前缀 CSS（字符串模板，crm 同款实现）；不使用 Tailwind 原子类直接写 JSX（crm/smart-maintenance 均为前缀 CSS 注入形态，保持一致），不覆盖平台变量、不写全局选择器（`:root`/`body` 仅在注入样式的 `rs-shell` 作用域内定义变量）。
- 字体：平台默认栈（theme.ts `--font-sans` 同款 Inter 栈），不自引字体。
- 徽标统一样式：高 22px、圆角 5px、padding 2px 8px、字号 12px、字重 650–720（crm `[data-slot=badge]` 与 sm `.sm-badge` 的公共值）；软底 + 强字的成对配色见 §8。
- 数字一律 `font-variant-numeric: tabular-nums`（分数、计数、统计条），避免刷新时跳动。
- 明暗：宿主当前为 light（crm/smart-maintenance 均 `color-scheme: light`，shadcn theme 有 `.dark` 分支）；本版只承诺 light，token 走语义变量使未来深色接管成本最低。

---

## 6. 交互状态机

### 6.1 视图级状态机

```
boot（未收到 init）
  └─ 呈现：居中「加载中…」弱色文案（对齐 crm crm20-shell-loading）
init 到达 → loading
  └─ 呈现：骨架屏（统计条 4 段灰条 + 列表 6 行骨架 + 详情整块骨架），aria-busy=true
requestData 成功且 candidates 非空 → ready
requestData 成功但 jobs/candidates 为空 → empty（区分「无岗位/无候选人」两种文案与 CTA）
requestData 抛错 → error
  └─ 呈现：详情区错误卡（crm notice 红变体，role=alert）+ 「重试」按钮（重新 requestData）；
     列表若已有数据则保留旧数据 + 顶部 notice 条（对齐 crm .crm20-notice），不整页替换
ready 期间收到 hostEvent（v4：仅宿主对话旁路场景触发；队列回填改由 action 回执 refresh + parsing 心跳轮询驱动，§6.7/§11，三条路径殊途同归走同一 silentRefresh）→ silentRefresh
  └─ 不出骨架、不出扫描线以外的任何阻塞 UI；扫描线 1 次后消失；选中项按 id 保持
```

- 通用错误出口：所有 `executeAction` 失败 → 详情区/录入区顶部 notice 条（红色变体）+ `notify(message, 'error')`（`role=alert`），notice 可手动关闭，10s 自动消失；成功 → `notify(message)`（默认 success 级）。

### 6.2 候选人条目级状态呈现（列表 × 详情）

| status | 列表行 | 详情区 |
| --- | --- | --- |
| `parsing` | loader + 「解析中」徽标 | 字段/评分骨架 + 已耗时计时 |
| `pending_review` | 分数 + 蓝徽标「待审」 | 完整四区块 + 处置条（推进/待定/淘汰/编辑） |
| `accepted` | 分数 + 绿徽标「推进」 | 完整四区块 + 撤回；处置条收敛为「撤回为待审」 |
| `hold` | 分数 + 琥珀徽标「待定」 | 完整四区块 + 推进/淘汰/撤回 |
| `rejected` | 分数 + 红徽标「淘汰」 | 完整四区块 + 撤回 |
| `failed` | `⚠` + 红描边徽标「失败」+ 原因摘要 | 顶部失败告示卡（原因全文 + 重试），四区块隐藏 |
| `draft` | 不出现（服务端中间态；若因竞态出现按「解析中」呈现） | 同左 |

### 6.3 失败重试（failed）

- 详情告示卡：`ri-error-warning-line` + 「解析失败：{failureReason}」+ 「重试」按钮。
- 点重试 → `executeAction('retry_candidate', candidateId)`（**v4：服务端条件置 `parsing` 并直接重新入队 managed-queue，回执 `refresh:true`，不再涉及任何对话指令**，v3 的 commandKey 流程作废；前端按钮态不变）。前端：条目徽标立即转「解析中」（乐观更新）→ `notify('已重新开始解析')` → 结果刷新依靠 parsing 存在时的 30s 心跳静默轮询（§11 / §6.7）。`attemptCount` 在详情元信息中可见（「第 k 次解析」，服务端按 `resume-parse-{id}-{attempt}` 确定性续投 job），按钮文案在 attemptCount>2 时提示「多次失败，建议检查模型凭证；若原文抽取字段有误，可用『编辑』人工修正」。

### 6.4 解析超时提示（parsing > 10 分钟）

- 判定：`status === 'parsing'` 且 `Date.now() - updatedAt > 10 * 60 * 1000`；30s 心跳本地重算判定（v4：存在 parsing 行时心跳同时触发静默轮询 `requestData`，§11，判定基线随轮询回执自然校正）。
- 呈现变化（徽标从「解析中」平滑切换）：
  - 列表行：loader 停止，徽标转琥珀「解析超时」（`ri-timer-line`）；
  - 详情区：骨架替换为琥珀告示卡（crm notice 琥珀变体：边 `#f2c94c`/底 `#fffbeb`/字 `#7a4d00`，`role="alert"`）：「该简历解析已超过 10 分钟，系统会自动重投；若仍未完成，可点击重试。」+ 「重试」+ 「再等等」（关闭卡片 5 分钟内不再提示，纯前端记忆）。**v4 措辞定稿**：不再出现「回对话发送/到对话窗口查看进度」类引导（链路 B 无对话步骤，v3 文案作废）。
- **服务端兜底（v4，对用户透明）**：sweep 每 5 分钟捞「parsing 且 updatedAt 超阈值」的行，attempt 未超限则重新入队、超限则标 `failed`（崩溃恢复权威，spec v2.2 §7.7）。UI 不展示 sweep 机制本身、不要求用户干预；超时卡语义仅为「偏慢，可能已自动重投」。
- 统计条 `解析中` pill 在存在超时条目时数值旁加琥珀点提示。
- **区分（v2）**：本节仅处理**已创建候选人**在 AI 抽取阶段的解析超时（候选人行已存在）。**文件上传的「录入前失败」**（加密 PDF / 无文本层 / 不支持格式 / 文件过大）**不产生候选人行**，状态在上传队列内收敛，见 §6.6，二者路径与呈现完全独立。

### 6.5 乐观锁冲突（update_candidate 冲突）

- 触发：编辑保存返回 `success:false` 且 message 含冲突语义（服务端乐观锁异常文案透传）。
- 呈现：`AlertDialog`（防误关）——标题「该候选人已被其他人更新」，正文「为避免覆盖他人修改，本次保存未生效。请先查看最新内容，再决定是否重新修改。」，按钮：
  - 「查看最新」（primary）：`requestData({ recordId })` 刷新该候选人详情，编辑态退出，已填改动保留在剪贴板式暂存（编辑草稿不销毁，提示「你的修改已暂存，可点击编辑恢复」）；
  - 「放弃修改」（ghost）：关闭对话框并退出编辑态。
- 约束：冲突对话框不提供「强制覆盖」——服务端以 `expectedRevision` 拒绝，UI 不伪装能力。

### 6.6 文件上传录入状态机（v2 新增，v3 为唯一录入路径）

按**文件**为粒度推进（非候选人），状态收敛在上传队列内（§3.7）：

```
用户多选 N 个文件（iframe 自绘选择器，v4.1）→ 前端乐观入队 N 行「排队中」（按本地 File.name）
  → iframe 逐文件发 executeFileAction（ArrayBuffer 字节）→ 宿主 multipart 代理 → provider executeViewFileAction
  → 文件行「排队中 → 上传中」（**v4.2：单一进行态**——传输+服务端校验/解析/落库同属一个请求往返，前端不可区分，「解析中(服务端)」不再单列；徽标 loader）
  → provider 回执：成功 → 落库候选人（status=parsing，sourceText=解析文本）→ 行「已创建」（绿 + 「查看」跳选中，目标 id=回执 `data.created[0].id`）
  ├─ （上行已并入回执成功路径）dedupeKey 命中 → 行「跳过(重复)」弱色「该简历内容已存在」（回执 `data.skipped` 非空；不新增候选人）
  └─ 录入前失败 → 行「失败」（红）+ 重新上传指引，不产生候选人行
  → 文本落库即服务端自动入队 managed-queue（payload 仅 candidateId）→ worker 直调模型「JD+单文本」抽取评分 → saveCandidatesFromAgent 回填 / attempts 耗尽标 failed（v4 链路 B，无对话步骤，§0.3）
  → 候选人列表侧「解析中→待审」按 §6.2/§6.4 呈现（文件行与候选人行两套状态、互不混用）；回填校准靠 action 回执 refresh + parsing 心跳轮询（§6.7/§11）
```

| 文件态 | 徽标 | 触发 | 恢复路径 |
| --- | --- | --- | --- |
| `排队中` | 灰 `#edf2f7`/`#536174` | 乐观入队（选择即入队） | — |
| `上传中` | 蓝 + loader + `ri-loader-4-line` | **v4.2：合并态**——iframe 发送字节至收到回执（含服务端校验/解析/落库，同一请求往返不可区分），`title`「上传并由服务端解析中」 | 超 60s 无回执行尾浮现「仍在处理，可稍后查看」（不设重试） |
| `已创建` | 绿 + `ri-check-line` | 回执成功 `data.created` 非空（含 candidateId）+ refresh | 「查看」跳转候选人行（A15 高亮脉冲一次） |
| `跳过(重复)` | 弱色 | 文本哈希命中 dedupe | 无需处理（悬停说明「内容已存在」） |
| `失败` | 红 + `ri-error-warning-line` | 四类原因 | 行内展开「可执行的重新上传指引」（§6.6 下表，v3 无粘贴退路） |

失败原因文案映射（**v4.2：后端 `ResumeFileParseError` 的中文 message 随失败回执直显，本表即其文案基准**——逐条可读、均指向重新上传）：

| 服务端语义 | UI 文案 | 恢复指引（v3：一律重新上传，无粘贴兜底） |
| --- | --- | --- |
| 加密 PDF | 「文件已加密，请解除密码后重新上传」 | 解除密码 → 重新点「上传简历文件」 |
| 无文本层扫描件 | 「该 PDF 无法提取文字（可能为扫描件），请转存为 Word 后重新上传」 | 转存为 .docx → 重新上传 |
| 格式不支持 | 「仅支持 .docx / .pdf（≤10MB），请转换格式后重新上传」 | 转 .docx/.pdf → 重新上传 |
| 文件过大 | 「文件超过 10MB，请精简或拆分后重新上传」 | 压缩/拆分 → 重新上传 |

约束（**v4.2 校准源修正**）：文件行 `排队中/上传中` 为**纯前端乐观态**；每文件的**回执即该行终态事实源**（成功→已创建[含 candidateId]/跳过，失败→失败+指引文案），无服务端台账可对齐（`intakeTasks` 幻影字段已删，见 §0.3）；回执触发的列表刷新按 §7 A7 过渡；「上传中」超 60s 无回执的行尾浮现弱色「仍在处理，可稍后查看」（**不设重试**——该步仅指文本解析落库，模型回填已移交服务端队列，若模型失败会落为候选人行 `failed` 态按 §6.3 处理；此为**上传文件态**超时，与 §6.4 候选人 10 分钟超时是两个不同对象与阈值）；队列行仅存于 iframe 内存，刷新页面即丢（已知限制，候选人行 + sourceFileName 承接溯源）。

### 6.7 文件解析落库 → 服务端队列 → 自动回填时序（v4 链路 B，整体替代 v3「聚合指令+对话确认」时序）

```
文件上传队列推进（§6.6）→ 文本落库候选人 status=parsing
  → provider 逐文件回执 { success:true, refresh:true } → iframe requestData（上传队列与列表校准）
  → 服务端落库即自动入队 managed-queue（payload 仅 candidateId；jobId=resume-parse-{id}-{attempt} 确定性幂等）
  → 同进程 worker（@PluginJobProcessor，逻辑并发 3）取 job：按 candidateId 现取全文
    → 组装「JD+单份文本」prompt → 经 XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN 直调 deepseek
    → 结构化抽取评分（失败降级文本 JSON 容错）
  → saveCandidatesFromAgent service 直写回填 → pending_review；模型失败 attempts 耗尽 → failed + failureReason
  → iframe 呈现：action 回执 refresh + 存在 parsing 行时 30s 心跳静默轮询（§11）
    → 列表侧 parsing 候选人被真实评分替换（A7 交叉淡入，不闪屏/不丢选中/不重置筛选）
失败分支三分：① 录入前失败（文件校验/解析失败）→ 不产生候选人行，队列行失败+重新上传指引（§6.6）；
  ② 解析失败（模型异常/attempts 耗尽）→ 候选人行 failed + 原因 + 「重试」（=服务端重新入队，§6.3）；
  ③ 进程重启丢失在途 job → 服务端 sweep 每 5 分钟捞 parsing 超时行重投/标失败，UI 无感知（§6.4）
```

> v4 说明：v3 的「回执携带 commandKey 聚合指令 → 用户对话确认 → 模型逐条取原文 save → hostEvent 刷新」整段设计**已按用户决定（D7）删除**，本时序对齐 spec v2.2 §8.3。UI 侧无任何对话步骤：队列与模型直调均为服务端事实，界面上「上传→队列推进→评分出现」连续自动完成。宿主对话降级为可选查询旁路（三工具与 hostEvents 订阅保留，工作台不依赖、无对应视觉元素）。粘贴入口删除后 `prepareIntakeDraft` 的 `sourceText` 唯一来源=服务端 docx/pdf 解析结果，此点沿用 v3 不变。

### 6.8 键盘与可达性

- Tab 顺序：岗位 Select → 统计 pill 群 → 搜索 → 筛选 → 排序 → 列表 → 详情 → 处置条 → 录入把手 → 上传队列行（「查看」「清除失败记录」可聚焦）；列表内 ↑/↓ 移动选中。（v3：录入区无文本框，Tab 链止于队列行操作。）
- **新建岗位 Dialog（v4 D1）**：打开时焦点自动落「岗位名称」输入框并形成焦点陷阱（Tab 在 名称→描述→保存→取消 内循环，主界面暂不可达）；名称框 Enter 提交、Textarea Enter 换行、Esc 取消关闭；关闭后焦点回「新建岗位」触发按钮。提交校验失败的焦点行为见 §3.2。
- 所有图标按钮带 `title` + `aria-label`；状态徽标文字自述（不只靠颜色，满足对比与色弱要求）；错误用 `role="alert"`，刷新提示用 `aria-live="polite"`；上传队列计数条 `aria-live="polite"`（成功/失败数变化播报「已创建 c，失败 e」，字母随 v4.2 聚合条勘校）。
- 焦点环不删除：focus 时 `box-shadow: 0 0 0 3px rgba(37,99,235,.12)`（对齐 crm 搜索框 focus 圈）。

---

## 7. 动画清单

统一 token：`--rs-motion-fast: 120ms` / `--rs-motion-base: 160ms` / `--rs-motion-slow: 240ms`；入场 ease-out（`cubic-bezier(0.2,0,0,1)`）、退场 ease-in（`cubic-bezier(0.4,0,1,1)`）、持续型 linear；仅动 `transform / opacity / color / background-color`，不动 width/height/top/left（高度类展开用 `grid-template-rows` 或 Collapsible 的容器高度过渡一次性完成）。

| # | 动画 | 触发时机 | 属性 | 时长 | 缓动 | 循环 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 顶部扫描线 | 任意非首次 `requestData`（含静默刷新） | `transform: translateX` | 1s | `ease-in-out` | infinite（对齐 crm `crm20-loading`） |
| A2 | 首屏骨架脉冲 | init 后首载 | `opacity` | 1.5s | `ease-in-out` | infinite（shadcn Skeleton 原生） |
| A3 | 列表行 hover | 指针进入 | `background-color` | 120ms | ease-out | 否 |
| A4 | 选中行高亮 | 点击/键盘移动选中 | `background-color` | 120ms | ease-out | 否 |
| A5 | 状态徽标换色 | 处置/刷新后状态变化（候选人行与上传队列行同规则） | `color/background-color/border-color` | 160ms | ease-out | 否 |
| A6 | 详情内容切换 | 选中候选人变化 | `opacity + translateY(4px→0)` | 160ms | ease-out（entry） | 否 |
| A7 | 新结果行回填 | hostEvent/refresh 后新增/占位替换（候选人行与上传队列行同规则） | `opacity + translateY(6px→0)`，逐行 stagger 40ms（仅前 10 行） | 240ms | ease-out | 否 |
| A8 | 行移出淡出 | 筛选切换导致行移除 / 「清除失败记录」 | `opacity` | 160ms | ease-in（exit） | 否 |
| A9 | 进行中 loader | 候选人 `status=parsing`、文件行 `上传中`（**v4.2 合并态**） | `transform: rotate` | 1s | linear | infinite（加载指示唯一豁免） |
| A10 | 录入区展开/收起 | 把手点击/空态 CTA（v3：无文本框，仅队列展开） | 容器高度（grid-rows 0fr→1fr）+ `opacity` | 200ms | ease-out（展开）/ ease-in（收起） | 否 |
| A11 | Sheet 抽屉滑入 | <720px 打开详情 | `transform: translateX` | 240ms 入 / 200ms 出 | 入 ease-out / 出 ease-in | 否（shadcn Sheet 原生节奏） |
| A12 | AlertDialog / Dialog 出入 | 淘汰确认、乐观锁冲突、**新建岗位表单 Dialog（v4 D1，同节奏复用）** | `opacity + scale(0.96→1)` | 160ms 入 / 120ms 出 | 入 ease-out / 出 ease-in | 否 |
| A13 | 未选岗位脉冲 | 空岗位点上传（回执缺岗位时） | `box-shadow` 蓝圈一次 | 320ms | ease-out | 1 次 |
| A14 | 统计 pill 选中反转 | 点击筛选 | `color/background-color` | 160ms | ease-out | 否 |
| A15 | 已创建跳转高亮 | 队列行「查看」定位候选人行 | `background-color` 脉冲（`#eff3ff→transparent`） | 240ms×2 往复 | ease-in-out | 1 次 |

降级与纪律：

- `@media (prefers-reduced-motion: reduce)`：A1–A15 全部时长压到 0.01ms（对齐 crm 的全局 reduce 规则），loader 保留但静止（候选人「解析中」与文件行「上传中」（v4.2 合并态）均降级为静态文字）。
- 无限动画仅存在于加载指示（A1/A2/A9），无装饰性循环动画（检索准则：无限动画仅用于 loading）。
- 结果回填（A7）只在数据真实变化时触发（对比 prev/next id 集合），避免每轮 requestData 全列表重播动画。

---

## 8. 状态徽标色定义（六态）

统一规格：高 22px、圆角 5px、padding 2px 8px、字号 12px、字重 650、内含 10px 状态圆点或语义图标（成对取值模式对齐 smart-maintenance `.sm-badge` + tone 类，色值对齐 §5.1 token）。

| 状态 | 文案 | 图标/圆点 | 软底（bg） | 文字/边框（fg） | 取值溯源 |
| --- | --- | --- | --- | --- | --- |
| `pending_review` 待审 | 待审 | 蓝圆点 | `--rs-blue-soft: #eff6ff` | `--rs-blue: var(--info, #2563eb)` | crm 工具条激活蓝系 + 平台 `--info` |
| `accepted` 推进 | 推进 | `ri-arrow-right-up-line` | `--rs-green-soft: #e8f7ee` | `--rs-green: var(--success, #047857)` | sm green-soft + 平台 `--success` |
| `hold` 待定 | 待定 | `ri-pause-line` | `--rs-amber-soft: #fff6df` | `--rs-amber: var(--warning, #b45309)` | sm amber-soft + 平台 `--warning` |
| `rejected` 淘汰 | 淘汰 | `ri-close-circle-line` | `--rs-red-soft: #fff0ee` | `--rs-red: var(--destructive, #dc2626)` | sm red-soft + 平台 `--destructive` |
| `failed` 失败 | 失败 | `ri-error-warning-line` | `#fff5f5`（红软底的浅一档） | 字 `#b91c1c`、**1px 实线描边 `--rs-red` 40%** | crm 错误强调 `#dc2626` 系；描边使其与「淘汰」在色弱下仍可区分 |
| `parsing` 解析中 | 解析中 | `ri-loader-4-line`（A9 旋转） | `--rs-blue-soft: #eff6ff` | `--rs-blue`；超 10 分钟切换为琥珀对（同「待定」对 + `ri-timer-line`，文案「解析超时」） | 复用蓝对表达「进行中」，琥珀表达「迟滞」 |

辅助规则：

- 「失败」与「淘汰」同为红系但形态不同（描边 vs 软底平色），色盲用户可凭图标与文字区分；所有徽标文字即状态名，不依赖颜色单通道传达。
- 首字头像底色 = 当前状态强色（fg 值），白字（对齐 crm `.crm20-record-mark` 的「强色底白字」做法）。
- 徽标同时用于列表、详情头部、统计 pill 三处，保证同一状态跨区域视觉恒定。
- **v2 注（候选人六态不变）**：上表仅定义**候选人**六态徽标。上传队列的**文件级**徽标（`排队中/上传中/解析中(服务端)/已创建/跳过/失败`，§6.6；**v4.2 收敛为 5 态**：`解析中(服务端)` 并入 `上传中`）**复用同一徽标规格与色对**——上传中（含服务端解析）=蓝对、已创建=绿对、失败=红对、排队中/跳过=中性 `#edf2f7`/`#536174`（对齐 sm `.sm-badge` 默认态），不新增第六套颜色，也不改变候选人六态定义。

---

## 9. 与 crm / smart-maintenance 的一致性对照表

| Token / 规格 | crm 实测 | smart-maintenance 实测 | 本设计取值 | 一致性 |
| --- | --- | --- | --- | --- |
| 面板底色 | `#ffffff` | `#ffffff` | `--rs-panel: #ffffff` | 一致 |
| 容器/软底 | `#f4f5f7` / `#fbfbfc` | `#f5f7fb` / `#f8fafc` | `#fbfbfc`（取 crm） | 对齐 crm |
| 主文字 | `#1f2937` | `#142033` | `#1f2937` | 对齐 crm |
| 次要/弱文字 | `#6b7280` / `#9ca3af` | `#64748b`（单档） | `#6b7280` / `#9ca3af` | 对齐 crm |
| 边框 | `#e5e7eb` / `#f0f1f3` | `#dce4ef` / `#cbd7e6` | `#e5e7eb` / `#f0f1f3` | 对齐 crm |
| 行 hover / 选中 | `#fafafa` / `#f1f5ff` | —（卡片形态无行选中） | `#fafafa` / `#f1f5ff` | 对齐 crm |
| 主色 | `var(--primary, #2563eb)` | `#1769e0`（自持） | `var(--primary, var(--xui-color-primary, #2563eb))` | 对齐 crm（读宿主主题） |
| 状态色模式 | 对象色「软底/强字」5 组 | 「强色+软底」4 组（blue/green/red/amber） | 语义化 4 组软/强对 + 失败描边变体 | 模式对齐两者，色值向平台语义 token 收敛 |
| 徽标规格 | 高 18–20px、字号 10–12px | 高 22px、字号 12px、字重 720、圆角 5px | 高 22px、字号 12px、字重 650、圆角 5px | 对齐 sm（crm 徽标用于工具条内偏小，本设计主用列表/详情场景取 sm 规格） |
| 统计 pill | —（footer 计算条） | `999px` 胶囊、白底、1px 边框 | 同 sm `.sm-stat-pill` | 对齐 smart-maintenance |
| 圆角 | 控件 5px、头像 8px、chip 11–12px | 卡 7px、badge 5px | 5 / 8 / 11px | 对齐 crm |
| 控件高/字号 | 1.875rem / 0.8125rem | —（自绘按钮） | 同 crm | 对齐 crm |
| 字号阶梯 | 16 / 13 / 12 / 11px | 13px 正文、12px 徽标 | 16 / 13 / 12 / 11px | 对齐 crm |
| 字体栈 | Inter, Plus Jakarta Sans, system-ui… | 同 shadcn 默认 | 平台默认 `--font-sans`（同栈） | 对齐两者 |
| 空状态 | 居中竖排 icon+文案+CTA，280px | 居中 13px、软灰底、圆角 7px | crm 结构 + sm 底色变体（`#f8fafc` 圆角块内居中） | 融合两者 |
| 加载态 | 顶部 2px 扫描线 1s infinite | — | 首屏 Skeleton（组件库原生）+ 增量扫描线（同 crm） | 见 §1.3 裁决，非偏离 |
| 间距节奏 | 区块 10–14px、元素 gap 8px、行高 39px（表）/50px 头 | 22px 卡内边距、4–9px 元素 gap | 区块 10–14px、gap 8px、列表行 52px、详情头 76px | 对齐 crm（行高按双行卡形态放大） |
| 动画基线 | 140ms ease（选择条）+ 1s 扫描线 + reduced-motion 全关 | —（构建产物未见自定义动画） | 120/160/240ms 三档 + reduced-motion 全关 | 在 crm 基线上成档，不引入新风格 |
| 图标 | iframe 内自绘 SVG（历史实现） | manifest remixicon 类名 | **remixicon 类名**（U2 指定，含 iframe 内） | 对齐 smart-maintenance 方案，交付前提见 §10 |
| 布局骨架 | grid 260px+1fr、头 50px、断点 960/560 | 单列滚动卡流 | grid 320px+1fr、头 48px、容器查询 720/560 | 同构变体（左栏从「导航」变「列表」），断点改容器查询原因见 §4 |

---

## 10. 偏离项与实现前提（U6，须同步 `resume-screen-review-log.md`）

| # | 类型 | 内容 | 原因 | 替代方案 / 处理 | 是否影响视觉一致性 |
| --- | --- | --- | --- | --- | --- |
| P1 | 实现前提（非样式偏离） | iframe 壳 `renderRemoteReactIframeHtml` 不注入 remixicon 字体，而 U2 要求 remixicon 类名图标 | 字体缺失时 `<i class="ri-*">` 不渲染字形 | 构建/交付管道将 `remixicon.css`（含 woff2）随 `app.css` 经 `appCss` 参数或 build copy-assets 注入 iframe；若宿主禁止该通道，降级为「crm 式内联 SVG 图标组件 + remixicon 同名路径」并在此处升级为偏离声明 | 否（字形一致，仅交付通道差异） |
| P2 | 组件缺口替代 | shadcn-ui 无「分数环形图/评分星组件」 | 组件库不提供 | 用 `Badge`（tabular-nums 数字）+ `Progress` 细条呈现匹配分，不引入第三方图表库 | 否（信息等价、更贴平台语言） |
| P3 | 组件缺口替代 | shadcn-ui 无 Timeline 组件，「已耗时计时」「第 k 次解析」用纯文本呈现 | 同上 | 12px muted 文本 + 元信息行，不自绘复杂时间轴 | 否 |
| P4 | **D1 定稿方案（v4 改写：v3 的 clientCommand 对话引导方案作废）** | 「新建岗位」= iframe 顶部按钮（`Button variant="outline"` + `ri-add-line`）+ 表单 `Dialog`（`Input` 岗位名称 ≤200 字 / `Textarea` 职位描述 ≥30 字 / 「保存」主按钮 loading 防重），提交走**新后端 action `create_job`**（`executeViewAction` invoke 分支） | 用户 2026-09-27 拍板：纯按钮/表单操作，不走宿主对话引导 | 实现前提：服务端提供 `create_job`（title+jdText 建岗位，标题 jdHash 幂等——重复回执可读 message，前端 toast「该岗位已存在」并保持 Dialog 打开）；spec v2.2 已声明该 action，不再属 UI 侧未知项。表单校验/错误呈现/aria/键盘细则见 §3.2 / §6.8 | 否（Dialog/Input/Textarea 均为库内组件，表单语言对齐 crm 既有写法） |
| P5 | 检索兜底说明 | ui-ux-pro-max `--stack shadcn` 检索「badge status table row」无数据库匹配 | 技能数据源限制 | 已声明该条为无匹配，交互/动效准则改用 ux 域检索结果（§1.3 第 4 条），无未验证产出被默默采信 | 否 |
| **P6** | **范围扩张 + spec 同步（v2 提出，v3 升级，v4 关闭）** | 上传解析为**本期范围扩张项**，且 **v3 起「文件上传为唯一录入方式，粘贴录入整体作废」**；spec §8.2「不支持文件上传 → 不实现 `executeViewFileAction`」作废，spec 原文以粘贴为唯一录入的设定全部失效 | 用户 2026-09-26 决定：粘贴类交互别扭，批量的自然表达是文件多选，v3 进一步移除单条粘贴兜底 | **需 spec 同步修订（已逐处定位原文行）**：§2.2 L62（S2「粘贴文本，一次可提交多条」→「上传 .docx/.pdf 多文件」）与 L72（排除项「只支持粘贴文本」删除）、§3 用户故事 L96/L103（粘贴多条→上传多文件）、§4 状态机 L139（入口改「上传文件」）、§5.2 L202（`sourceText` 注释「用户粘贴」→「服务端文件解析落库，可追溯 `sourceFileName`」）、§8.1（信息架构⑥「底部批量粘贴区」→「底部录入区（纯上传队列）」）、§8.2（文件通道开放，iframe 仍不持字节）、§8.3（时序改为 上传→解析落库→队列自动回填；v3 的「对话确认」时序在 v2.2 中最终被链路 B 取代）、**§16 E2E L931（E2E-03 检查项「粘贴框」→「上传队列」；录入用例改写为「批量上传 N 文件→队列推进→已创建/失败呈现」，通过标准条数不变、语义换为上传）**、§18 清单 L1123/L1130/L1304（「粘贴」项同义替换）。§7.7 经查无粘贴措辞，不需修订；服务端新增：`executeViewFileAction`（docx/pdf→文本，复用 `prepareIntakeDraft`）、候选人 `sourceFileName` 列、`getViewData` 的 `intakeTasks` 摘要、manifest `upload_resume_files`（`transport:'file'`）；UI 不新增文件类组件、不手写 input file；`prepare_parse_message` 前端不再调用 → **最终从 manifest 删除（v2.2）**。**v4 补记：spec 已修订 v2.2（2026-09-27）——§7.7 新增链路 B 组件表（`ResumeScreenParseProcessor` / `XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN` 模型直调 / 重试重新入队 / sweep 兜底）、manifest actions 增 `upload_resume_files` 与 `create_job`、删 `prepare_parse_message`、`executeViewFileAction` 新增 `upload_resume_files` 分支（校验→解析→落库→入队→refresh 回执）；AI 触发不再依赖对话指令，UI 仅文案/时序/组件清单变更，零新增视觉元素（§0.3 / §6.7）**；**v4.1 补记（2026-09-27 建段勘察回炉）**：本节及 §0.3/§3.7 原「宿主弹出选择器、iframe 不持字节、主按钮常驻宿主 toolbar、UI 不手写 input file」的通道表述系**错误平台事实**，已按协议文档与宿主源码勘察改为「iframe 自绘隐藏选择器 + executeFileAction 字节通道 + 宿主 multipart 代理」（证据行号见修订记录 v4.1 与 §0.3）；产品决策（上传唯一录入、无粘贴、链路 B、D1 Dialog）不变，spec 同步 v2.3；**v4.2 补记（2026-09-27 建段二次勘察回炉）**：本清单原含「`getViewData` 的 `intakeTasks` 摘要」等「服务端新增」项，经全仓核实系**从未落入后端的幻影字段**（无实体、无视图字段，spec/计划全程零命中）；已交付后端每文件回执 `data:{fileName, created[{id,status}], skipped, sourceFileName}` 自带队列收敛全部事实——**裁定 A**：队列校准源改为**回执驱动的前端内存态**（§0.3/§3.7/§6.6/§8/§11 同步；`解析中(服务端)` 并入 `上传中` 单一进行态，文件级徽标收敛 5 态；失败文案=回执中文 message 直显，§6.6 映射表保留为文案基准），**不新建后端台账任务**（避免推翻已部署真机复验的冻结链路），刷新页面丢上传历史属已知限制；上游 spec 无需改动 | 否（复用既有徽标/队列语言，无新视觉体系；v4.1/v4.2 仅通道机制与校准源修正） |

---

## 11. 性能约束（「琢」阶段验收输入）

- 列表行组件 `memo`（props：候选人对象引用 + 选中/筛选派生布尔），避免 hostEvent 全量刷新时整列表重渲；`candidates` 以 id 为键做浅比较。
- `requestData` 返回按页追加（「加载更多」），单列表 DOM 上限约 200 行；超过则提示「请用筛选缩小范围」（本期数据量 ≤ 数百，不做虚拟滚动——避免为不存在的规模引入复杂度）。
- 动画仅 transform/opacity/color（合成器友好）；stagger 限前 10 行。
- 30s 心跳：无 parsing 行时仅重算超时判定、不触发网络请求；**存在 parsing 行时（v4 链路 B：队列回填无 hostEvent 主路径），心跳同时触发静默轮询 `requestData`（A1 扫描线一次、选中与筛选保持），parsing 行全部回填/失败即停轮**（spec v2.2 §8.3 第 5 步）；`parsing` 计时器仅在存在 parsing 条目时挂载。
- 上传队列行 `memo` + 上限 20 行（**v4.2：前端内存态**，已收敛的超出部分聚合为「更早上传 x 条」一行）；行状态推进**只 patch 状态字段**（浅比较行 id + status），不整队列重渲；文件行状态推进动画（A9）仅作用于进行中行。

---

## 12. 验收对照（spec §8.5.3 四维检查点 → 蓝图落点）

| 验收点 | 蓝图落点 |
| --- | --- |
| 状态徽标六态区分明确且与平台色系一致 | §8（软/强成对 + 平台语义 token） |
| 长文本不溢出、不挤压 | §3.1（minmax(0,·) + 省略号）+ §3.5（评分理由折叠、pill 换行） |
| 空状态与骨架屏有设计 | §3.4（双空态）、§6.1（三区骨架） |
| 上传后立即出现「排队中/解析中」（v3 唯一录入口） | §3.7 / §6.6（乐观入队「排队中→上传中→解析中」）+ §6.7（解析落库→自动入队→worker 直调模型回填，v4 无对话确认） |
| AI 回填全自动、无对话确认步骤（v4 D7） | §0.3 / §6.7（链路 B 时序）+ §11（parsing 心跳轮询校准）+ §6.4（sweep 对用户透明） |
| 新建岗位在工作台内完成（v4 D1：表单 Dialog，不走对话） | §3.2（Dialog 字段/校验/错误呈现/键盘）+ §3.8 + §6.8 + §10 P4 |
| 上传失败有文件名 + 可执行重新上传指引（v3） | §3.7 / §6.6（失败行四类原因，一律指向重新上传，无粘贴退路） |
| 录入前失败与候选人超时不混淆（v2） | §6.4 区分条款 + §6.6 |
| 筛选/搜索/排序即时响应 | §3.4（Enter/debounce + 同 state 联动） |
| 乐观锁冲突有提示与恢复路径 | §6.5（AlertDialog + 查看最新/放弃） |
| 失败态有可读原因 + 重试（v4：重试=服务端直接重新入队，不经对话） | §6.3 |
| 解析超 10 分钟提示 | §6.4 |
| 列表增删/状态切换过渡、回填不闪屏 | §7 A5/A7/A8（仅数据变化时触发） |
| 滚动与面板切换无抖动 | §4（内部滚动收敛）+ §7 A6/A11 |
| 动画时长与缓动统一 | §7 motion token 三档 |
| 列表 memo、大批量流畅 | §11 |

---

## 13. 决策确认记录（v4：全部已确认，原「待用户确认决策」）

| # | 决策 | 定稿结论（2026-09-27） | 落点与备注 |
| --- | --- | --- | --- |
| **D1** | 「新建岗位」入口形态（P4） | **已确认：表单 Dialog**（v4 定稿）——按钮（outline + `ri-add-line`）弹 Dialog（Input 名称 ≤200 字 / Textarea 描述 ≥30 字 / 保存主按钮防重），提交走新 action `create_job` | §3.2 / §3.8 / §6.8 / §10 P4；v3 的 clientCommand 对话引导方案作废 |
| D2 | <720px 降级为 Sheet 抽屉的断点 | **已确认（默认值采纳）**：容器查询 720px，不支持则 ResizeObserver 属性降级 | §4 |
| D3 | 「淘汰」二次确认 | **已确认（默认值采纳）**：AlertDialog 轻确认（可撤回语义） | §3.6 |
| D4 | 首屏 Skeleton + 增量扫描线的组合加载 | **已确认（默认值采纳）**：维持 §1.3 裁决 | §1.3 / §6.1 |
| D5 | 上传格式与大小上限 | **已确认（默认值采纳）**：UI 提示「仅支持 .docx / .pdf（≤10MB）」，超限即失败态呈现并指引压缩/拆分重传，MB 数以服务端校验回执为准 | §3.7 / §6.6 |
| D6 | 来源文件名是否脱敏 | **已确认（默认值采纳）**：原样展示 `originalname`（与正文信息同级） | §3.4 / §3.5 |
| **D7** | AI 解析触发链路 | **已确认：链路 B 队列直调**（v4 定稿）——文件解析落库即自动入队 managed-queue，worker 逐份「JD+单文本」直调模型回填，全程无对话确认；重试=服务端直接重新入队 | §0.3 / §6.3 / §6.6 / §6.7 / §11；v3 的「聚合指令+对话确认」设计整体删除（spec v2.2 §8.3 新时序） |

> 全部决策已确认：D1/D7 于 2026-09-27 由用户拍板按上表定稿，D2–D6 采纳蓝图默认值；「纯文件上传、粘贴入口移除」（v3 决定）沿用。本蓝图状态转为**已确认**，v3 中因 D1/D7 悬置而产生的对话类文案与指令链路已全部按 v4 清除。

> 蓝图确认后进入「建 · 依图营造」（spec §8.5.2）：以本文件为唯一依据施工，实现中发现问题须回「谋」修蓝图，不得在「建」中私自改设计。
