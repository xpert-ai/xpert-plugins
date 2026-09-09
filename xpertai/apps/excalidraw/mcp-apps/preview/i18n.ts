const en = {
  title: 'Excalidraw preview',
  loading: 'Loading preview…',
  empty: 'Run a drawing or preview tool to inspect a drawing.',
  failed: 'Unable to load the preview.',
  incomplete: 'The tool returned an incomplete result. Refresh to read the current state.',
  retry: 'Refresh current scene',
  fit: 'Fit canvas',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  quality: 'Quality results',
  scene: 'Scene revision',
  ir: 'DiagramIR quality preview · revision',
  version: 'Current version',
  stale: 'This preview is older than the current drawing.',
  ready: 'Preview ready',
  noQuality: 'No DiagramIR quality report is available.',
  cancelled: 'Render cancelled',
  conflict: 'The drawing changed during conversion. The converted result is retained.',
  instructions: 'Drag to pan. Scroll to zoom. Use Fit canvas to reset.',
  issues: 'issues',
  unknown: 'Not available'
} as const
export type MessageKey = keyof typeof en
export type Dictionary = { readonly [K in MessageKey]: string }
const zh: Dictionary = {
  title: 'Excalidraw 预览',
  loading: '正在加载预览…',
  empty: '调用绘图或预览工具后可在此查看图形。',
  failed: '无法加载预览。',
  incomplete: '工具结果不完整，请刷新读取当前状态。',
  retry: '刷新当前场景',
  fit: '适应画布',
  zoomIn: '放大',
  zoomOut: '缩小',
  quality: '质量结果',
  scene: '场景修订',
  ir: 'DiagramIR 质量预览 · 修订',
  version: '当前版本',
  stale: '此预览已落后于当前图形。',
  ready: '预览已就绪',
  noQuality: '暂无 DiagramIR 质量报告。',
  cancelled: '渲染已取消',
  conflict: '转换期间图形已变化，转换结果已保留。',
  instructions: '拖动画布平移，滚轮缩放。点击“适应画布”复位。',
  issues: '个问题',
  unknown: '暂无'
}
export function dictionary(locale?: string): Dictionary {
  return locale?.toLowerCase().startsWith('zh') ? zh : en
}
