# 素材与依赖提取

素材提取的目标是复制“真实运行需要的最小闭包”，不是复制整个外部工程。

## 1. 建立依赖图

从权威入口和所有已选页面组件开始递归遍历：

```text
entry/registry
  -> component imports
  -> shared primitives/context/hooks
  -> CSS imports
  -> CSS url()
  -> JS media constants/defaultProps
  -> font-face src
```

每个资源记录：原路径、目标路径、类型、引用者、是否远程、是否需要转换、许可状态。

## 2. 图片

提取位置：

- JS/JSX import 和 `new URL(..., import.meta.url)`。
- defaults 中的 src/poster/image/images。
- CSS `background-image` 和 mask。
- HTML img/source/picture/meta preload。

处理：

- 保留原始像素，除非浏览器不支持格式。
- HEIC/AVIF 在交付链路不稳定时转换为 PNG/JPEG/WebP。
- 用内容 hash 去重，不用文件名去重。
- 记录宽高、alpha、色彩空间和用途。
- 装饰纹理与可替换媒体分开；只有后者进入 mediaSlots。

## 3. SVG

- 作为 img 使用的 SVG 可直接复制。
- JSX 内联 SVG 保留 viewBox、path、mask、clipPath 和 filter。
- id 必须主题/页面作用域化，避免多个页面的 gradient/clipPath 冲突。
- 需要主题调色的 SVG 不写死源颜色，改用 CSS variable 或 profile palette。
- 数据图形 SVG 属于图表闭包，不能作为普通装饰图片替换。

## 4. 视频和音频

- 复制 video/audio、poster、字幕和字体。
- 记录 MIME、autoplay、loop、muted、controls、playsInline。
- 页面失活或卸载时 pause；重新激活时按控件状态恢复。
- 预览器的全局播放控制不复制到主题组件。
- 媒体槽明确 acceptedKinds 和最大数量。

## 5. 字体

- 解析所有 `@font-face` 的 family/style/weight/src/format。
- 下载远程字体前核对许可；否则替换为可用字体栈并记录推断。
- 只复制实际使用 weight，避免整套字体包膨胀。
- font URL 改为主题相对路径。
- 浏览器审计时等待 `document.fonts.ready`，避免用 fallback 截图误判。

## 6. CSS

### 提取

- 保留页面组件、primitive 和主题 token 使用的规则。
- 删除 preview shell、编辑器面板、截图模式和开发调试 CSS。
- 展开或保留 import 时确保离线可解析。

### 作用域化

- 给主题根加唯一 class。
- `body/html/:root` token 移到主题根。
- keyframes 名称加主题前缀。
- CSS variables 按主题根声明。
- portal/tooltip 如果必须出根节点，使用主题 data attribute 而不是全局选择器。

### 禁止

- 不允许覆盖编辑器 body。
- 不允许远程 CSS 在运行时加载。
- 不允许把源主题整页画布隐藏在新主题外层背景下面。

## 7. 3D、Canvas 和动态资源

- 确认 WebGL/canvas 是否可用于 PDF/PPTX 截图导出。
- 3D 模型、HDR、纹理、worker 和 wasm 全部进入依赖图。
- 无法稳定导出的动态模块提供静态 poster，但保留运行时交互时必须记录降级差异。
- 动画帧在页面失活时停止。

## 8. 路径重写

统一目标：

```text
themeXX/source/assets/<type>/<hash-or-stable-name>.<ext>
```

重写范围包括 JS import、CSS url、HTML src、poster、字体 src、默认 props 和 JSON spec。完成后搜索 `/Users/`、`/Volumes/`、`file://`、`http://`、`https://`，逐项解释或清除。

## 9. 完整性验证

- 构建时无 unresolved import。
- 浏览器 Network 无 404。
- 离线 HTML 包含或复制所有资源。
- 每个 mediaSlots 默认资源能显示，替换动作可用。
- PDF/PPTX 导出不出现空白图片、跨域字体或未加载视频 poster。
- 未使用素材不进入交付包。
