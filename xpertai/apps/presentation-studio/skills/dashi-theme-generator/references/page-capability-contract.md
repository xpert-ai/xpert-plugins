# 页面能力闭包

页面是最小复用单位，不是 JSX 外观片段。

```text
PageCapability = Component
               + defaultProps
               + controls
               + canvasContract / control effects
               + propShapes / countBindings / numericBounds
               + chart geometry / data semantics
               + mediaSlots / upload Context
               + scoped CSS / fonts / assets
               + browser lifecycle / animation cleanup
```

## 必须提取的字段

### 身份与结构

- `key`：主题内唯一页面键。
- `slot`：结构语义，不使用业务文案命名。
- `label`：作者可读名称。
- `roles`：cover、metrics、comparison、timeline、relationship、distribution、ranking、proportion、table、media、statement、closing。
- `Component`：真实 React 页面组件。
- `canvasContract`：声明 1920×1080 设计坐标、根节点填充方式和不透明画布责任。

### 内容契约

- `defaultProps`：必须能够单独渲染页面。
- `copyKeys` 和 `copyBudgets`：所有可见文本路径与长度预算。
- 复用页的自动主题化文案只允许改写 `copyKeys` 中的已知语义字段，且视觉宽度不得超过源默认值或显式 `copyBudgets`；未知字段视为装饰/运行时字段并保留原值。
- `propShapes`：对象和数组内部字段，禁止调用者自行猜测。
- `numericBounds`：数值范围、是否强制、是否为 0-1 归一化比例。
- `countBindings`：数量控件和数组字段必须同步。

### 控件契约

- range：数量、焦点、列数、阶段数、媒体数量。
- select/radio：布局方向、图表类型、强调方式、页面明暗。
- toggle：图例、注释、装饰、结论和媒体显隐。
- color：进入标准契约时转换为明确色板。
- media action：上传、替换、清空，不能只保留图片 URL 字段。

每个公开的视觉控件还必须声明 `effect`：

- `scope`：`global`、`section` 或 `component`。
- `targets`：canvas、surface、typography、chart、media、ornament、layout 中的一个或多个。
- `minChangedRatio`：改变控件前后至少发生变化的画布像素比例。
- `minRegions`：变化至少分布到 4×3 区域网格中的多少格。

主题色、强调色、背景色、palette 和 tone 一律按全局控件处理。只改变一个小角标或没有可见变化的控件不构成有效闭包。

### 图表契约

保留组件内部的几何和数据语义。主题桥接只能改变 palette、线宽、圆角、网格和强调，不得把雷达数据当柱状数据或破坏系列/分类绑定。

### 媒体契约

每个媒体槽必须明确：

- `fieldPath` / `presetProp`
- `acceptedKinds`
- `capacity` / `max`
- `countKey`
- `canPresetMedia`
- object-fit、裁切方向和默认占位行为

### 运行时契约

- CSS 必须作用域化。
- 动画必须在页面激活时启动并在卸载或失活时清理。
- 图片槽事件不得触发翻页。
- 全局监听、MutationObserver、requestAnimationFrame 和媒体播放必须有清理函数。
- 所有本地资源必须能被离线打包。
- 页面根节点不执行设计稿缩放。运行时负责把统一的 1920×1080 页面缩放到预览尺寸，页面组件只负责填满父级。

## 复用判断

- `reuse`：能力闭包不变，只增加主题 wrapper/profile。
- `modify`：复制完整闭包，保留字段和交互，调整构图或视觉 primitive。
- `new`：从零声明整个闭包。只写 JSX 而没有元数据、控件和媒体绑定不算完成。

## 反例

- 从 A 页拿图表 JSX、从 B 页拿 controls、再自造 defaults：闭包已被拆散。
- 根据截图猜 `items` 数组形状：无法保证 count binding。
- 只在外层包背景色：内部画布、SVG 和渐变仍泄漏源主题。
- 用 `*`、所有 `span` 或全部 SVG `path` 做严格配色：会把低透明背景字、描边字和装饰图形提升为正文，造成大字覆盖内容。
- 复制 HTML 后保留全局 `body` CSS：会污染编辑器与其他页面。
