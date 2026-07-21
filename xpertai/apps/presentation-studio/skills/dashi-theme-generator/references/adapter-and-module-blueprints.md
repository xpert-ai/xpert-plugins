# 适配器与页面代码蓝图

这些蓝图展示契约边界。根据外部工程字段调整，不要原样伪造不存在的字段。

## Registry 适配器

```jsx
import { normalizeRuntimePages } from '../runtime-helpers.jsx';
import { slides as rawPages } from './source/slides/index.jsx';

export const runtimePages = normalizeRuntimePages(rawPages, {
  themeKey: 'themeXX',
  layoutPrefix: 'THEMEXX',
});
```

适用于 registry 已提供 Component/defaultProps/controls 的输入。

## Preview Array 适配器

```jsx
const rawPages = sourcePages.map((entry, index) => ({
  id: entry.id,
  label: entry.label ?? entry.Component?.META?.title,
  Component: withScopedTheme(entry.Component),
  defaultProps: {
    ...(entry.Component?.META?.defaults ?? {}),
    ...(entry.defaults ?? {}),
  },
  controls: [
    ...deckControls,
    ...(entry.Component?.META?.controls ?? entry.controls ?? []),
  ],
}));
```

先从源码解析数组和 import。只有数组不是可静态 literal 时才在受控构建环境执行模块。

## CSS Wrapper

```jsx
function withScopedTheme(Component) {
  return function ScopedPage(props) {
    return (
      <div className="themeXX-source-root">
        <style>{SCOPED_THEME_CSS}</style>
        <Component {...props} />
      </div>
    );
  };
}
```

`SCOPED_THEME_CSS` 必须已处理 body/:root、keyframes 和资源 URL。

## 静态 HTML 封面转换

```jsx
const defaults = {
  eyebrow: 'SECTION 01',
  title: 'Editable title',
  subtitle: 'Editable subtitle',
};

function StaticCover({ eyebrow, title, subtitle }) {
  return (
    <section className="themeXX-static-cover">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </section>
  );
}

export const page = {
  id: 'cover-static',
  Component: StaticCover,
  defaultProps: defaults,
  controls: [],
};
```

不要用 `dangerouslySetInnerHTML` 保留不可编辑正文。

## Modify 页面

```jsx
export const provenance = {
  strategy: 'modify',
  sourceTheme: 'theme09',
  sourcePageKey: 'theme09_page042',
  preserved: ['defaultProps', 'controls', 'mediaSlots'],
  changed: ['grid', 'titlePlacement', 'surfaceCss'],
};

export function ModifiedEditorialPage(props) {
  // 使用原字段和媒体槽，只重构区域布局与视觉 primitive。
}
```

如果修改后需要删除或改变字段，必须同时更新契约和迁移说明，不能让旧 controls 指向不存在的 props。

## New 页面

```jsx
export const defaults = {
  kicker: '01 / TOPIC',
  title: 'Primary statement',
  items: [
    { label: 'A', body: 'Evidence A' },
    { label: 'B', body: 'Evidence B' },
  ],
  images: [],
  itemCount: 2,
  imageCount: 0,
};

export const controls = [
  { key: 'itemCount', type: 'range', min: 2, max: 4, default: 2,
    effect: { scope: 'section', targets: ['layout', 'surface'], minChangedRatio: 0.01, minRegions: 2 } },
  { key: 'imageCount', type: 'range', min: 0, max: 2, default: 0,
    effect: { scope: 'section', targets: ['media', 'layout'], minChangedRatio: 0.01, minRegions: 2 } },
  { key: 'showNotes', type: 'toggle', default: true,
    effect: { scope: 'component', targets: ['typography'], minChangedRatio: 0.005, minRegions: 1 } },
];

export const mediaSlots = [{
  field: 'images',
  presetProp: 'props.images',
  countKey: 'imageCount',
  acceptedKinds: ['image'],
  max: 2,
  canPresetMedia: true,
}];
```

New 页面必须通过同一序列化器生成 copyKeys、propShapes 和 countBindings，不手写一份与组件脱节的 metadata。

## 完整画布根节点

工作台设计坐标固定为 1920×1080。页面根组件使用父级尺寸，不使用 1280×720 等独立设计稿尺寸，也不自行执行缩放：

```jsx
export const canvasContract = {
  designWidth: 1920,
  designHeight: 1080,
  rootMode: 'fill-parent',
  backgroundMode: 'opaque',
};

export function FullCanvas({ background, color, children }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
      background,
      color,
    }}>
      {children}
    </div>
  );
}
```

预览缩放只能由工作台外层完成。禁止在 `FullCanvas`、主题 Provider 或页面 wrapper 上设置 `transform: scale(...)`、固定 1280×720 根尺寸或依赖黑色父背景补齐画布。

## 激活动画

```jsx
React.useEffect(() => {
  const host = rootRef.current?.closest('[data-deck-slide]');
  if (!host) return;
  const sync = () => setActive(host.hasAttribute('data-deck-active'));
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(host, { attributes: true, attributeFilter: ['data-deck-active'] });
  return () => observer.disconnect();
}, []);
```

timer、RAF、window listener 和媒体播放也必须在 cleanup 中释放。

## 媒体事件隔离

上传、拖放、点击替换和清除动作应阻止 pointer/mouse/click 事件冒泡，避免触发幻灯片翻页。拖放必须 preventDefault，并只把文件交给媒体 Context。
