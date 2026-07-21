# 外部模板主题自有模块

## 为什么需要这一层

原 `theme01-theme12` 页面适合提供成熟字段、控件、图表、媒体和运行时能力，但仅靠换色与 CSS 桥接无法复现外部模板特有的分栏、标题关系、图片拼贴和重复符号。新主题因此包含两个并列模块库：

```text
external archetypes
  -> reuse --------------------------> original module library
  -> modify/new -> observed proposals -> theme-owned React modules
style grammar + capability gaps
  -> inferred proposals ------------> theme-owned React modules
                                      + original module library
                                                |
                                     deterministic composition
```

## 规划输出

运行：

```bash
npm run themes:external-plan -- --spec /path/to/external-spec.json --out /tmp/theme-plan.json
```

`fidelity` 为每个 `modify/new` archetype 生成 observed proposals，并根据 Style DNA 和结构家族缺口生成 8-16 个 inferred proposals。`reuse-first` 使用 2-4 个 observed 预算，默认 2 个；超过预算的 `modify/new` 建议由规划器转换为固定复用，不进入主题自有 JSX。`reuse-first` 默认不生成 inferred，最多按明确需要生成 4 个。两类提案合并为 `ownedModuleProposals`，`reuse` archetype 则进入 `recipe.pinnedModules`。

observed proposal 包含：

- `archetypeId` 与结构 `family`。
- `strategy` 和 `evidenceRefs`。
- 从参考页提取的 `visualRequirements`。
- `modify` 对应的原页面 `sourceContract`。
- `modify` 由机器目录生成的 `preservedCapabilities`、`changedStructure`、结构 patch，以及来源 defaults、controls、bindings、prop shapes 和 mediaSlots 快照。
- 字段、控件、可写媒体和运行时能力要求。

inferred proposal 不声称对应某张参考页，包含：

- `evidenceMode: inferred` 和空的 `evidenceRefs`。
- 至少 4 个 `derivedFromRules`，覆盖字体、构图、表面/媒体和 motif/signature。
- 至少 2 个 `anchorModuleRefs`，指向 observed 模块。
- 至少 1 个 `stylePrimitiveRefs` 和明确的 `derivationReason`。
- 页面家族、内容形状、字段、控件、媒体和运行时能力要求。

`requiredCapabilities.contentShape` 是硬契约，不是提示文本。实现后的 `defaultProps` 必须包含这些字段；声明 controls 或 writableMedia 时，运行时必须真的暴露控件或可写媒体槽。这样单标题占位页不能冒充丰富的推导模块。

不要把外部模板某一次的颜色、摄影题材或禁用项写进全局生成方法；它们只属于该次 external spec。

## 建立代码骨架

```bash
npm run themes:scaffold-owned -- \
  --plan /tmp/theme-plan.json \
  --theme-dir src/components/themes/themeXX
```

命令生成：

- `signature-modules.json`：证据与实现清单。
- `signature-pages.jsx`：每个 proposal 的独立组件入口。

脚手架故意标为 `implementationStatus: scaffold`。它已经物化 typed defaults、controls 和需要的 mediaSlots；`modify` 还会继承来源数据闭包。代理只需要继续完成证据特定的真实构图，并确认所有字段在 JSX 中实际消费后，才能改为 `implemented`。inferred 页面必须把锚点模块共同使用的 Style DNA 转译成新结构，不能把 family 名称换成标题后交付占位卡片。

## 页面闭包

每个自有页面至少包含：

```js
{
  key: 'themeXX_signature_archetype',
  slot: 'signature-family-archetype',
  label: '主题名 · 结构名',
  roles: ['family'],
  moduleFamily: 'family',
  archetypeId: 'archetype-id',
  moduleStrategy: 'modify' | 'new',
  evidenceMode: 'observed' | 'inferred',
  evidenceRefs: ['reference-page'], // inferred 必须为空
  derivedFromRules: [],
  anchorModuleRefs: [],
  stylePrimitiveRefs: [],
  derivationReason: null,
  sourceContract: null | { sourceTheme, sourcePageKey, migration },
  canvasContract: {
    designWidth: 1920,
    designHeight: 1080,
    rootMode: 'fill-parent',
    backgroundMode: 'opaque',
  },
  defaultProps,
  controls,
  Component,
}
```

`modify` 可复制原页面的完整闭包后改变 JSX/CSS，但必须记录迁移；`new` 必须自己提供完整闭包。两者都属于新主题，不再通过旧模块的样式 wrapper 渲染。

controls 中的每个公开视觉控件必须带 `effect`。全局主题色、强调色、背景色和 tone 至少作用到多个语义目标；只控制短下划线、单个圆点或不可见默认分支的控件应移除，不要为了控件数量保留低价值交互。

## 数量与风格覆盖

质量版本 3 使用显式模式策略。`reuse-first` 至少包含 2 个 observed `modify/new` 签名模块、0 个 inferred，覆盖至少 2 个自有结构家族；其余成熟能力由固定复用页和完整原主题库提供。`fidelity` 至少包含 8 个 observed 和 8 个 inferred，覆盖至少 9 个自有结构家族。`fidelity` 的 observed 模块仍要求封面、常规正文、指标/图表、媒体和复杂结构覆盖，每个 observed 模块至少 3 条外部证据；`reuse-first` 每个 observed 至少记录 1 条页面特有证据。

inferred 模块由规划器优先分配给 observed 模块未覆盖的 family，再按外部 archetype 权重补充高价值变体。每个 inferred 模块至少使用字体、构图、表面/媒体和 motif/signature 四类 Style DNA 规则；结构可以创新，但字体、颜色、表面材质和签名 primitive 不能脱离 Style DNA。

`reuse` 仅用于参考结构与原页面的栅格、字号层级、媒体几何和重复 primitive 有明确一致证据的情况。`reuse-first` 至少填写 1 条具体 `reuseJustification`，`fidelity` 至少 3 条。原主题通用页继续作为 76-96 页能力补充；固定复用页必须实际进入最终组合库。

## 注册和组合

在 `generated-theme-definitions.mjs` 注册：

```js
export const GENERATED_THEME_OWN_MODULES = {
  themeXX: {
    module: './signature-pages.jsx',
    manifest: './signature-modules.json',
    minimum: 5,
  },
};
```

生成器会在 `layouts.jsx` 中把自有库放在原主题库之前：

```js
[
  { themeKey: definition.key, pages: signaturePages, kind: 'owned' },
  { themeKey: 'theme02', pages: sourcePages0, kind: 'original' },
]
```

组合器先把每个 family 的 owned 数量设为不可降低的配额下限，再把剩余名额按 familyWeights 分给 theme01-12 通用模块；结束时逐个检查所有 owned key 都已入库。这样即使某个 family 同时有多个外部特有结构，也不会被普通权重挤掉，同时仍保留原主题的成熟图表、关系、表格和媒体能力。

## 验证

```bash
npm run themes:generate
npm run themes:build-generated
npm run themes:validate-generated
npm run themes:validate-palette -- --theme themeXX
npm run themes:render-owned -- --theme themeXX
node /path/to/dashi-theme-generator/scripts/validate-theme-render-contract.mjs --project . --theme themeXX
node /path/to/dashi-theme-generator/scripts/validate-generated-layout-quality.mjs --project . --theme themeXX
```

验证器检查：

- 自有模块数量达到 `minimum`。
- 清单没有 scaffold/unimplemented。
- 每个清单模块实际进入页面库。
- moduleOrigin、strategy、archetype 和 evidence 未丢失。
- inferred 模块不伪造 evidenceRefs，Style DNA 规则、observed 锚点、签名 primitive 和推导理由完整进入运行时。
- inferred 模块实现了 proposal 声明的 contentShape、controls 和 writableMedia 能力。
- 清单 family 与运行时 family 一致。
- 原主题来源仍至少两个，完整库仍覆盖九个以上页面族。
- 每个自有 archetype 都进入浏览器审计页。
- 每个页面在 1920×1080 最终画布中的透明/未覆盖区域不超过 1%。
- 每个公开视觉控件的像素变化比例和空间分布达到其 effect 门槛。
- 完整组合页库中没有文字越界、裁切、异常超大字号或大字覆盖正文。
