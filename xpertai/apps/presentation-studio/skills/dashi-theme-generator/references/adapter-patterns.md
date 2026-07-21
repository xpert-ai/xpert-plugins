# 外部主题适配器模式

原 12 主题并非 12 个孤立特例，而是覆盖了常见外部模板组织方式。先用探测器识别模式，再选择最薄的适配器。

## 决策树

```text
是否有可导入 React/JS 组件？
├─ 否
│  ├─ PPTX -> 解析 slide tree / master / media，按重复版式重建组件
│  └─ HTML/PDF/图片 -> 静态 section 或视觉 archetype 重建
└─ 是
   ├─ 是否有导出的页面 registry？ -> registry adapter
   ├─ 是否有 SLIDES/PAGES 预览数组？ -> preview-array adapter
   ├─ 是否每个模块导出 defaults/controls？ -> module-list adapter
   ├─ 是否组件带 META？ -> meta adapter
   ├─ 是否由 HTML data-page 排序？ -> html-order adapter
   ├─ 是否有 PAGE_FILES？ -> page-files adapter
   └─ 是否有 slideSpec + HTML slot？ -> spec-slot adapter
```

混合静态封面时，把静态页转换为具体 React 组件并与动态页合并，不要把整份 HTML 当 iframe。

## Pattern A：导出 Registry

探测：入口导出 `slides`/`pages` 数组，元素已有 id、Component、defaults、controls。

提取：直接 import registry，交给 `normalizeRuntimePages`。保留原顺序；补 themeKey、layoutPrefix 和稳定 key。

对应基准：theme01、theme12。theme01 使用 `slides/index.jsx`；theme12 使用 `src/index.js` 的 `swSlides`。

适用：结构最完整、风险最低的 React 主题。

## Pattern B：Preview Array

探测：preview/app/ignDemo 中存在 `SLIDES` 或 `PAGES`，元素引用组件但字段命名不统一。

提取：解析 import 和数组 literal；识别 Component/Comp/C；合并 entry defaults、component defaults 和 controls。

对应基准：theme02、theme11。theme02 还在 wrapper 增加 deck 级 scheme/emphasis/animation controls。

风险：preview 文件可能含编辑器、全局监听和仅演示用默认值。只提取注册信息，不复制 preview shell。

## Pattern C：模块清单

探测：每个页面文件导出 default component、`defaults`、`controls`，入口只维护模块列表。

提取：逐模块 import，构建 `{id,label,Component,defaultProps,controls}`。共享 CSS 在 wrapper 注入一次并作用域化。

对应基准：theme05。

风险：构建产物与 ESM 源码并存时只保留一种；重复导出的 defaults/controls 需要修复。

## Pattern D：组件 META

探测：组件静态属性或模块导出 `META`，包含 id/title/defaults/controls。

提取：从 app 的 SLIDES 获取顺序，从 `Component.META` 获取契约；entry content 覆盖 defaults，但不能覆盖枚举和控制字段。

对应基准：theme04、theme10。theme10 额外合并 HTML 标签、tone 默认值和内嵌 CSS。

风险：META 可能只为预览，必须验证 visible props 是否真的进入组件。

## Pattern E：HTML data-page 顺序

探测：HTML section 带 `data-page`、`data-slide` 或文件名，JSX 文件独立存在。

提取：按 HTML 顺序匹配文件；读取组件 META/defaults/controls；HTML 中没有 React 对应项的封面转换为静态 React 组件。

对应基准：theme07。

风险：HTML 顺序是权威，文件名排序不是；静态 CSS 只提取封面实际使用的规则。

## Pattern F：PAGE_FILES

探测：HTML/JS 中有 `PAGE_FILES = [...]` 或同类字符串数组。

提取：解析文件列表，逐个 import；读取各模块默认导出和元数据；包装统一主题 primitive。

对应基准：theme08。

风险：数组可能由字符串拼接或动态生成，无法静态解析时应执行受控模块而不是用正则猜顺序。

## Pattern G：slideSpec + slot order

探测：源码中 `slideSpec` 描述组件/fields，HTML slot 或 section 决定页面顺序。

提取：建立 spec 注册表，再按 HTML slot 顺序连接；defaults 从 spec 的 copy/data/props 分层合并。

对应基准：theme09。

风险：slot 和组件可能一对多；必须用唯一 id 连接，不用标题文本连接。

## Pattern H：静态 HTML + React 混合

探测：部分封面/章节只有 HTML section，正文为 React。

提取：解析静态 section 的 DOM、class、style；转换为具体 React component；抽取最小 CSS；与动态 runtimePages 合并。

对应基准：theme06、theme07。

风险：不要复制整份 HTML、全局脚本或 iframe；静态页也必须生成可编辑 defaults。

## Pattern I：PPTX Slide Tree

探测：输入为 PPTX。

提取顺序：

1. unzip OOXML。
2. 解析 presentation 顺序、slide relationships、layout 和 master。
3. 提取 theme colors、fonts、background、shape/text/image/chart。
4. 按 master/layout 和几何相似度聚类 archetype。
5. 重复元素提升为 header/footer/primitive。
6. 文本和图片占位符转换为 defaults/mediaSlots。
7. 图表有 workbook 时保留数据语义；只有图片时按媒体处理。

风险：PPTX 不提供 Dashi controls，必须依据重复结构和编辑需求人工声明。

## 原 12 主题映射表

| 主题 | 模式 | 权威顺序来源 | 契约来源 | 特殊 wrapper |
|---|---|---|---|---|
| theme01 | Registry | slides/index.jsx | entry defaults/controls | 媒体事件修补 |
| theme02 | Preview Array | app.jsx SLIDES | entry + deck controls | scheme、glow、pointer lifecycle |
| theme03 | Registry + global theme | registry.js | entry controls | CSS、icons、全局深浅切换 |
| theme04 | META Array | app.jsx SLIDES | Component.META | image slot + base CSS |
| theme05 | Module List | pulse-app list | module exports | shared stylesheet |
| theme06 | Mixed | preview array + HTML | module + static DOM | 静态封面合并 |
| theme07 | HTML Order | data-page | module META | 静态封面合并 |
| theme08 | PAGE_FILES | HTML array | module metadata | theme primitives |
| theme09 | Spec + Slot | HTML slot | slideSpec | slot registry |
| theme10 | META + HTML CSS | SLIDES + HTML | META + content | tone + scoped CSS |
| theme11 | Preview Array | ignDemo PAGES | entry/component | 去 preview shell |
| theme12 | Registry | src/index.js | entry defaults/controls | 激活动画与媒体生命周期 |

机器可读版本见 `baseline-adapter-catalog.json`。

## 通用适配器输出

不论输入模式，最终都输出：

```js
export const runtimePages = normalizeRuntimePages(rawPages, {
  themeKey,
  layoutPrefix,
});
```

rawPages 的每项至少包含 Component、defaultProps 和 controls。适配器通过契约测试后再生成 metadata，不手抄 metadata。
