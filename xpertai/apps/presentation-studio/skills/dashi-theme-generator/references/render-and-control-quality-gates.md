# 画布与控件效果门槛

本规范防止新主题在工作台出现缩小画布、右侧或底部留黑，以及控件存在但几乎没有可见作用的问题。

## 统一画布

- 工作台设计坐标固定为 1920×1080，比例为 16:9。
- 页面根节点必须 `width: 100%`、`height: 100%`，并绘制不透明画布。
- 页面、主题 Provider 和根 wrapper 不得执行 `transform: scale()`；预览器负责缩放整张 1920×1080 页面。
- 不得把 1280×720、960×540 或参考图片像素尺寸直接写成页面根尺寸。
- 图片和局部卡片可以使用任意尺寸，但不能承担补齐页面背景的职责。

每个主题自有页面声明：

```js
canvasContract: {
  designWidth: 1920,
  designHeight: 1080,
  rootMode: 'fill-parent',
  backgroundMode: 'opaque',
}
```

验证必须走构建后的主题 runtime，并把页面放进真实 1920×1080 外层。使用两种不同哨兵背景分别截图；如果截图随哨兵背景变化，说明页面仍有透明或未覆盖区域。

## 控件效果声明

公开的 toggle、select、radio、range、slider、number、color 和 palette 控件必须声明：

```js
effect: {
  scope: 'global' | 'section' | 'component',
  targets: ['canvas' | 'surface' | 'typography' | 'chart' | 'media' | 'ornament' | 'layout'],
  minChangedRatio: 0.05,
  minRegions: 4,
}
```

`targets` 写实际改变的语义层，不写实现选择器。控件效果应由 token、Context 或组件 props 传播，禁止按页面 key 写临时 CSS。

## 最低门槛

| 控件语义 | 最低像素变化 | 4×3 区域分布 | 说明 |
|---|---:|---:|---|
| 背景色、明暗、tone、canvas | 15% | 8 | 必须改变主要画布或大面积表面 |
| 主题色、强调色、palette | 5% | 4 | 至少影响多个表面、图表、强调文字或装饰区域 |
| 布局、方向、密度、数量 | 1% | 2 | 必须产生清晰结构变化 |
| 普通组件显隐和局部强调 | 0.5% | 1 | 小于此值通常不值得成为公开控件 |

声明值可以高于默认门槛，不能低于对应语义的默认门槛。像素差阈值用于排除字体抗锯齿和轻微渲染噪声。

## 设计规则

- 主题色和强调色使用语义 token 传播到至少三类目标，例如 surface、chart、typography、ornament。
- 全局颜色控件不能只改变短线、单个圆点、页码或角标。
- 控件默认分支必须可达；依赖另一个 toggle 时，验证器先启用依赖条件再比较。
- count 控件必须同时改变数组可见数量与布局，不能只更新控制台数值。
- 控件发生零像素变化时，视为断开的 prop 或无效运行时绑定。
- 低于门槛时只有两种处理：扩大实际作用，或删除公开控件。不要降低阈值掩盖问题。

## 执行验证

先构建新主题 runtime，再运行：

```bash
node <skill-root>/scripts/validate-theme-render-contract.mjs \
  --project /path/to/dashi-ppt/project \
  --theme themeXX \
  --out /tmp/themeXX-render-contract.json
```

验证覆盖每个 `moduleOrigin: owned` 的 observed 与 inferred 页面，并输出 evidenceMode；inferred 页面同时输出 Style DNA rule 和 observed anchor 来源：

- `canvasLeakRatio`：两种哨兵背景造成的像素差比例。
- `largestRootWidthRatio` / `largestRootHeightRatio`：最大可见根元素占最终画布的比例。
- 每个控件的 `changedRatio`、`changedRegions`、声明门槛和实际结果。

以下任一情况必须停止主题登记：

- 缺少 canvasContract 或 effect。
- 根尺寸不是 1920×1080 父级填充。
- 未覆盖区域超过 1%。
- 控件无可替代值、零视觉变化、变化比例不足或区域过度集中。

## 完整页库排版门槛

画布与控件验证只覆盖主题自有模块，不能代替完整组合库排版验证。构建运行时后必须运行：

```bash
node <skill-root>/scripts/validate-generated-layout-quality.mjs \
  --project /path/to/dashi-ppt/project \
  --theme themeXX \
  --out /tmp/themeXX-layout-quality.json
```

验证器真实挂载当前主题的全部 76-96 页，并检查非装饰文字的画布越界、容器裁切、危险行高、超过 220px 的长文本和大字号文字覆盖正文。任何一页失败都停止安装，不能以“签名页正常”代替完整页库通过。
