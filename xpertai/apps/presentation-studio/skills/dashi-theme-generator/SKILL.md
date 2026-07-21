---
name: dashi-theme-generator
description: 从外部 HTML、React、PPTX、PDF 或模板图片提取视觉语法、页面结构、字段、控件、图表、媒体和运行时能力，基于 Style DNA 推导模板未展示的风格模块，并生成、登记、验证 Dashi PPT 新主题。用户要求新增主题、倒推模板生成方式、扩展主题页库、增强主题风格、修复新主题与参考模板不一致、画布缩放留黑、控件无效或控件变化过小时使用。
---

# Dashi Theme Generator

把外部模板转换为可编辑、可组合、可验证的 Dashi PPT 主题。不要把截图铺成页面背景，也不要把原组件只换一层颜色后称为新主题。

## 根目录

本技能由 Presentation Studio 插件直接提供，不依赖 `skillsMiddleware`。先从成功的准备结果或 `presentation_list_themes` 取得 `themeId`，再用该 `themeId` 调用一次 `presentation_open_dashi_theme_generator`；禁止传空对象。工具结果会直接给出完整 `SKILL.md`、精确 `sourcePath`，并把包含作者工程、references、scripts 和 tests 的 ZIP 放入当前 Workspace。把 ZIP 解压到工具返回的 `extractDirectory`，解压后的 `dashi-theme-generator` 目录记为 `<skill-root>`。在 `<skill-root>/project` 中安装依赖和生成主题，不要修改插件安装目录。

## Presentation Studio 集成契约

### 完成条件

主题生成是一个连续的代理作者流程，不是“脚手架生成服务”。`themes:scaffold-owned` 成功只表示可以开始编写主题自有模块；它既不是成功交付，也不是需要用户手工编码的阻塞。执行本技能的代理必须在同一次主题生成流程中继续修改 `signature-pages.jsx` 和 `signature-modules.json`，直到所有 proposal 都成为真实实现，或遇到一个可以具体报告的工具/输入错误。

允许向用户报告的终态只有：

- `ready`：完整验证、打包和 `presentation_register_theme` 均成功，新主题能够用于后续 PPT 生成。
- `failed`：已经调用 `presentation_report_theme_failure`，并记录一个具体且可操作的生成或验证错误。

禁止把 `scaffold`、`proposed`、生成了若干模块骨架、需要“手动实现 JSX”或等待后台任务描述为最终结果。这里的“实现 JSX”是当前代理自己的工作，不是用户的后续任务。模块数量必须遵循 external spec 中显式声明的 `generationMode`，不能在发生错误后临时改数字绕过契约。

### 生成模式

外部规格必须显式选择一种模式；老规格未声明时只为兼容而按 `fidelity` 处理：

- `reuse-first`：图片/PDF 的默认建议。至少 4 个证据原型、默认 2 个且最多 4 个 observed 主题签名模块，不要求 inferred 模块；规划器会把超出 `target.observedModuleCount` 的 `modify/new` 建议自动转换为带能力说明的 `recipe.pinnedModules`，固定复用 theme01-theme12 的完整页面闭包。完整主题仍为 76-96 页、至少两个原主题来源、至少九个结构家族，并继续运行画布、控件、排版和运行时验证。
- `fidelity`：用户明确要求更深的结构还原时使用。保留 8 个 observed、8 个 inferred、9 个主题自有家族等原质量门槛。

降低的是截图到自有 JSX 的作者工作量，不降低正确性契约。`manifest family` 必须与 runtime family 一致，inferred 声明的字段必须真实存在，公开控件必须有效，完整页面库必须可渲染。不要用静态占位 JSX 冒充可复用组件。

用户从工作台上传模板后，会产生一个 `prepared` 主题；也可以对已有 Workspace 文件调用 `presentation_prepare_theme`。准备操作只登记或打包素材，不会启动后台任务。两种入口都必须返回 `theme.id`、大于 `theme14` 的数值 `theme.key`、显式 `sourceType` 和源文件路径。必须原样使用这些字段：不要另造 theme key，也不要根据扩展名猜 `sourceType`。

调用 `presentation_prepare_theme` 时，`source` 始终是数组，`sourceType` 和 `sourceMode` 都必须显式传入。单个源码文件或图片 ZIP 使用 `sourceMode=single_file`，数组内正好放一个 Workspace locator；8-30 张独立图片使用 `sourceMode=image_files`、`sourceType=images`，数组内逐项放 locator。优先使用附件或解析工具返回的 `/workspace/...` 路径。为了兼容旧版文件分析输出，只接受当前会话 `sessions/<conversationId>/files` 下的宿主机路径，工具会把它归一化为 `/workspace/sessions/<conversationId>/files/...`；任意本地路径和跨会话路径仍然禁止。不要拼接多个路径，也不要再包私有的 `kind/file/files` 协议。

1. 调用 `presentation_list_themes`，确认目标主题是 `prepared`。不要轮询它，也不要声称生成会在后台继续。
2. 使用目标主题的真实 `themeId` 调用一次 `presentation_open_dashi_theme_generator`，把返回的 ZIP 解压到 `$PWD/.theme-work`，确认 `$PWD/.theme-work/dashi-theme-generator/SKILL.md` 和 `project/package.json` 存在。该工具就是插件内建 Skill 的入口；不要再调用或要求安装 `skillsMiddleware`。直接使用返回的 `sourcePath`，不要猜测、构造或搜索 `themes/<id>/source` 目录，也不要依赖固定的 `/work` 路径。
3. 调用 `presentation_update_theme_progress` 把状态推进到 `analyzing`，按本技能的完整流水线生成主题；开始写入主题代码前推进到 `generating`，开始完整验证前推进到 `validating`。主题 key 必须等于准备阶段返回的 `theme.key`。
4. 运行插件交付命令；`source-type` 必须等于准备阶段的显式类型，`adapter-mode` 必须来自盘点与适配报告：

```bash
npm --prefix "$PWD/.theme-work/dashi-theme-generator/project" ci --ignore-scripts --no-audit --no-fund
node "$PWD/.theme-work/dashi-theme-generator/scripts/finalize-plugin-theme.mjs" \
  --project "$PWD/.theme-work/dashi-theme-generator/project" \
  --theme themeNN \
  --source-type pptx \
  --adapter-mode pptx-slide-tree \
  --out "$PWD/.theme-work/themeNN.xpert-theme.zip"
```

5. 把 ZIP 保存到 Workspace Files，然后用该文件和准备阶段的 `theme.id` 调用 `presentation_register_theme`。只有处于 `validating` 且注册成功，主题才是 `ready` 并可用于新建、预览、HTML、PDF 和 PPTX。
6. 任一生成或验证步骤失败时，调用 `presentation_report_theme_failure` 写入具体错误；不要跳过门槛、伪造验证报告或原样重复已经确定失败的工具调用。

路径参数必须作为一个 shell 参数传递，统一使用双引号，例如 `--input "$SOURCE_PATH"`。不要把含空格的文件名直接拼进命令。不得猜测系统包管理器：macOS 没有 `apt-get`；缺少 PDF 渲染器时优先改用 Xpert 已解析的 8-30 张页面图片，不要在生成循环中安装系统依赖。

## 必读资源

按输入类型读取：

- 所有任务先读 [完整生成流水线](references/extraction-and-generation-pipeline.md)。
- 写入 `/tmp/external-spec.json` 前必须读 [外部主题规格契约](references/external-theme-spec-contract.md)，并以其中指向的完整示例为结构基线；不要凭记忆拼接 JSON。
- 有 HTML/React/PPTX 源码时再读 [适配器模式目录](references/adapter-patterns.md)。
- 复制字体、图片、视频、SVG 和 CSS 时读 [素材与依赖提取](references/asset-extraction.md)。
- 编写 registry、wrapper、modify/new 页面时复用 [适配器与页面代码蓝图](references/adapter-and-module-blueprints.md)。
- 选择、修改或组合原主题模块时读 [模块复用与组合](references/module-reuse-and-composition.md)，并用机器目录 `references/baseline-module-catalog.json` 查询。
- 从外部 archetype 提出并实现主题特有页面时读 [主题自有模块](references/theme-owned-modules.md)。
- 需要理解字段、控件、图表、媒体或浏览器契约时读 [页面能力闭包](references/page-capability-contract.md)。
- 实现任何新主题页面和工作台控件前读 [画布与控件效果门槛](references/render-and-control-quality-gates.md)。
- 只有图片/PDF 时读 [图片证据提取规范](references/image-evidence-workflow.md)。

不要凭记忆复述原 12 主题。机器可读事实以 `baseline-module-catalog.json` 为准，适配方式以 `baseline-adapter-catalog.json` 为准。

原主题页面发生变化后刷新目录：

```bash
node <skill-root>/scripts/refresh-baseline-catalog.mjs --project /path/to/dashi-ppt/project
```

## 标准工作流

1. `sourceType=images` 或 `pdf` 时，先把证据标准化为 8-30 张图片。每个主题只使用一个确定的证据目录，不要创建 `v2`、`v3` 等重试目录，也禁止把该命令的输出再次作为下一次输入。脚本是幂等的，并返回 `prepared`、`reused` 或 `already-prepared`；后两种状态都表示必须直接进入下一步，不能再次运行提取：

```bash
THEME_EVIDENCE_DIR="$PWD/.theme-work/$THEME_KEY/evidence"
node "$PWD/.theme-work/dashi-theme-generator/scripts/extract-theme-source.mjs" \
  --project "$PWD/.theme-work/dashi-theme-generator/project" \
  --input "$SOURCE_PATH" \
  --source-type images \
  --out "$THEME_EVIDENCE_DIR"
```

   PDF 同级若存在 Xpert 生成的 `pages/page-NNNN.png`，脚本会直接复用，不再调用 `pdftoppm`。只有没有这些预解析页图的裸 PDF 才需要已有的 `pdftoppm`。若脚本报告它缺失，不得尝试 `apt-get` 等猜测命令；使用 `presentation_prepare_theme` 的 `sourceMode=image_files` 把 Xpert 已解析的页面图片打包为图片证据，或者报告明确阻塞。

   图片输入应传完整目录或 ZIP，不能只选择第一页。为兼容 Xpert 返回的页面成员路径，若 `--input` 是图片文件且其所在目录明确包含 8-30 张图片，脚本会把该目录作为完整集合。写入使用临时目录并原子提交；若上次中断留下的目录只包含与当前来源逐字节一致的部分图片，脚本会安全重建该目录。

   `evidence-index.json.analysis.batches` 是强制分析计划和调用预算。每张图片只做一次主视觉分析，每批最多 3 张；把结果直接写入 `/tmp/external-spec.json`。当所有批次均已覆盖且 external spec 满足契约后，图片分析阶段立即结束，后续规划和生成只读取该规格。只有最终视觉验证明确指出某一页的具体差异时，才允许额外复查该页一次；禁止为了“再确认”重新查看全部 8-30 张图片。若在预算内无法完成规格，报告失败，不能从第一批重新开始。

2. 运行外部模板盘点；图片/PDF 使用上一步的证据目录作为输入：

```bash
node <skill-root>/scripts/inspect-external-template.mjs \
  --input /path/to/template \
  --out /tmp/template-inventory.json
```

3. 根据盘点结果生成适配建议：

```bash
node <skill-root>/scripts/recommend-adapter.mjs \
  --inventory /tmp/template-inventory.json \
  --out /tmp/adapter-plan.json
```

4. 按 `references/external-theme-spec-contract.md` 建立完整外部证据规格。它既是分析结果，也是“图片主分析已完成”的持久检查点，不是 inventory 或 adapter plan：必须同时包含显式 `generationMode`、字符串形式的 `visualEvidence`、`visualImplementation` 和该模式要求的 `archetypes`，再运行 `themes:external-plan`。图片/PDF 通常选择 `reuse-first`，从已经检查的页面中保留至少 4 个不同结构原型；`fidelity` 仍要求至少 8 个。每个原型记录真实页面结构；有源码时还记录入口、页面注册方式、CSS、字体、素材、控件和媒体 Context。把 typography、composition、surface、media、motif、signature 和 forbidden 描述编译成可引用的 Style DNA 规则。规格一旦通过 planner 契约检查，后续步骤不得重新启动截图分析。
5. 查询原主题模块，不从截图猜字段：

```bash
node <skill-root>/scripts/query-baseline-modules.mjs \
  --family media --needs-media --min-media 3 --limit 12
```

6. 对每个参考结构原型提出 `reuse`、`modify` 或 `new`。最终策略由规划器依据机器目录和自有模块预算确定：优先选择字段、控件、图表和媒体闭包均匹配的 `reuse`；`reuse-first` 默认只保留 2 个、最多 4 个最有辨识度的 `modify/new`，其余自动转为 `recipe.pinnedModules`。`fidelity` 再生成 8-16 个 inferred proposals；`reuse-first` 默认不生成 inferred，最多按明确需要生成 4 个。
7. 生成主题自有模块清单与代码骨架；骨架状态为 `scaffold`。规划器会为 `modify` 自动快照来源 defaults、controls、count bindings、mediaSlots，并生成 `preservedCapabilities`、`changedStructure` 和结构 patch；脚手架会为 new/inferred 自动生成 typed contentShape、控件和需要的媒体槽。读取命令返回的非终态 `nextAction`，立即继续视觉作者工作。Codex 必须把 observed 和 inferred 两类骨架完成为具体 JSX 后才能改为 `implemented`，不能把通用占位卡片交付为推导模块，也不能把实现工作转交给用户。
8. 实现当前模式要求的主题自有模块：`reuse-first` 至少 2 个 observed 签名模块、0 个 inferred；`fidelity` 至少 8 个 observed 和 8 个 inferred。只要声明 inferred，它仍必须引用至少 4 条 Style DNA 规则、2 个 observed 锚点和 1 个签名 primitive，并真实提供 `contentShape` 中的字段。所有自有模块统一使用 1920×1080 设计坐标和填满父级的页面根节点。
9. 调用 `themes:new` 时同时传入 `--plan /tmp/theme-plan.json`；命令会从计划中物化 `generationMode`、`policyVersion`、`planDigest`、`recipe.ownModuleMinimum`、`recipe.pinnedModules` 和能力目标，并拒绝规格中的冲突值，禁止靠人工复制这些字段。`themes:new --write` 会登记 `signature-pages.jsx` 和 `signature-modules.json`。将主题自有模块库和固定复用页置于普通原主题候选之前组合，再扩展至 76-96 页完整库。组合器会在同 family 内自动替换更丰富的原页面，未达到目标时在完整验证前给出确定性的系统错误。默认约 84 页，按场景密度浮动；至少使用两个原主题来源并覆盖九个结构家族。
10. 运行 Dashi 工程中的生成、元数据、运行时、结构、配色、自有模块、最终画布、控件像素差和完整组合页库排版验证。排版验证必须覆盖所有 76-96 页，检查文字越界、裁切、异常超大字号和严重重叠。
11. 全部验证成功后运行上面的 `finalize-plugin-theme.mjs`。该命令串行运行门槛并生成 Presentation Studio 可注册的自包含 ZIP；不要写入 `~/.codex/skills`。

## 强制门槛

- 外部证据决定视觉，原 12 主题决定可复用能力，运行时契约决定可编辑性。
- 颜色、字体、圆角、摄影和禁用项只写在当前主题证据规格中，不能写成全局默认模板结论。
- `paletteMode` 必须明确：`adaptive` 允许保留源模块色阶；`strict` 必须清除源主题画布、渐变、发光、文字色和 SVG 色后重建。
- 结构验证通过不代表视觉通过。严格配色主题必须运行真实浏览器配色审计。
- `modify` 必须记录来源页面、保留的字段和控件、改变的 JSX/CSS；`new` 必须声明完整 defaults、controls、mediaSlots 和运行时依赖。
- `modify` 的 `preservedCapabilities`、`changedStructure` 和来源能力快照由规划器生成，禁止要求用户或后续代理从错误日志手填；`writableMedia` 只能由显式媒体蓝图或真实来源槽位产生，不能按 cover/media 名称猜测。
- 质量版本 3 的 definition、recipe、manifest 和交付 ZIP 必须携带一致的 `generationMode` 与 `policyVersion`；存在 `planDigest` 时还必须一致。缺失或漂移必须停止，不得静默回退到 fidelity。
- 每个 `modify/new` 外部 archetype 至少对应一个 `moduleOrigin: owned` observed 页面；`reuse` 才允许直接由原主题模块承担。
- observed 模块必须声明真实 `evidenceRefs`；inferred 模块不得伪造直接参考页，必须声明 `derivedFromRules`、`anchorModuleRefs`、`stylePrimitiveRefs` 和 `derivationReason`。生成后清单与运行时必须逐项一致。
- 每个外部结构原型至少有一张真实审计页；不能只抽查封面。
- 工作台真实画布固定为 1920×1080。页面根节点必须填满父级且自己绘制完整画布；禁止把 1280×720 等较小设计稿直接作为根尺寸，也禁止在页面根节点执行 `scale()`。
- 每个主题自有页面必须声明 `canvasContract`；每个公开的 toggle/select/range/color 控件必须声明 `effect`。控件改变后必须达到对应像素变化和空间分布门槛，否则扩大作用范围或删除控件。
- 主题色、强调色、背景色和明暗控件属于全局视觉控制，必须同时影响画布、表面、图表、文字强调或装饰中的多个区域，不能只改变短线、角标或单个小图形。
- 主题桥接不得用通配选择器强制重写所有文字和全部 SVG 路径；这会把原本低显著度的背景字、描边字或装饰图形变成正文。严格配色只能作用于明确的语义选择器。
- 复用页默认文案只能改写已知内容字段，改写后的视觉宽度不得超过源字段默认值；未知装饰字段必须原样保留。
- 新主题质量版本 3 的数量门槛由显式 `generationMode` 决定：`reuse-first` 至少 2 个 observed、0 个 inferred、2 个自有家族；`fidelity` 至少 8 个 observed、8 个 inferred、9 个自有家族。两种模式的完整组合库都必须覆盖至少 9 个结构家族。

## 交付前命令

```bash
npm --prefix "$PWD/.theme-work/dashi-theme-generator/project" run themes:external-plan -- --spec /path/to/external-spec.json --out /tmp/theme-plan.json
npm --prefix "$PWD/.theme-work/dashi-theme-generator/project" run themes:scaffold-owned -- --plan /tmp/theme-plan.json --theme-dir src/components/themes/themeXX
npm --prefix "$PWD/.theme-work/dashi-theme-generator/project" run themes:new -- --spec /tmp/theme-definition.json --plan /tmp/theme-plan.json --write
node "$PWD/.theme-work/dashi-theme-generator/scripts/finalize-plugin-theme.mjs" --project "$PWD/.theme-work/dashi-theme-generator/project" --theme themeXX --source-type <explicit-type> --adapter-mode <verified-mode> --out "$PWD/.theme-work/themeXX.xpert-theme.zip"
```

若 `themes:external-plan` 报告 spec contract 问题，必须按一次性列出的全部问题修改 spec 后再重试；禁止原样重跑失败命令。可以在首次建立规格时按任务取舍选择 `reuse-first`，但禁止在失败后删字段、复制 archetype 或私改阈值绕过同一模式的证据要求。

`finalize-plugin-theme.mjs` 的 `--adapter-mode` 必须使用适配报告中的 `adapterMode` 字段，不要直接使用盘点模式 `selected`。例如图片证据的 `selected` 是 `image-evidence`，而可登记的 `adapterMode` 是 `visual-archetype`。该命令串行执行生成、manifest、运行时构建、能力/配色/自有模块/画布控件/完整页库排版验证和风格总览图更新。只有全部成功才会生成带运行时、元数据、manifest、素材与验证摘要的 ZIP；插件注册器会再次校验身份、来源类型、页数、模块、结构家族和全部门槛。

最终必须报告：外部输入类型、适配模式、observed/inferred 模块数量、Style DNA 规则与锚点来源、页数、结构家族覆盖、媒体能力、配色模式、验证结果和未覆盖风险。
