/**
 * pdf.js 渲染支持层的纯函数契约（第 13 套，R-P104）
 *
 * 覆盖两类断言：fit-width 缩放计算的业务口径（正常路径 + 0/负防御 + 极窄容器 + 放大上限）
 * 与 fake worker 挂载（R-P102：单文件 iife bundle 的成立前提，挂载缺失则弹窗内渲染必然崩）。
 * 刻意不 mock canvas 做编排断言——canvas/DOM 编排归 preview-dialog，真机行为由 E2E 兜底。
 */
import { PDF_PAGE_SCALE_CAP, computePageScale, isPdfRenderCancelled } from './pdf-render'

describe('computePageScale · pdf 页 fit-width 缩放', () => {
  it('A4 页在宽容器内按容器宽适配（简历主阅读形态）', () => {
    // A4 页宽 595pt、渲染列 1050px：scale = 1050/595 ≈ 1.7647，恰好铺满不溢出
    expect(computePageScale(595, 1050)).toBeCloseTo(1.7647, 4)
  })

  it('容器宽为 0 或负数时回落自然尺寸 1（防 scale≤0 令 getViewport 抛错）', () => {
    expect(computePageScale(595, 0)).toBe(1)
    expect(computePageScale(595, -100)).toBe(1)
  })

  it('页宽为 0、负数或非有限数时回落自然尺寸 1（畸形页防御）', () => {
    expect(computePageScale(0, 1050)).toBe(1)
    expect(computePageScale(-595, 1050)).toBe(1)
    expect(computePageScale(Number.NaN, 1050)).toBe(1)
    expect(computePageScale(Number.POSITIVE_INFINITY, 1050)).toBe(1)
  })

  it('极窄容器等比缩小适配且不设下限（页面完整可见优先于字号）', () => {
    expect(computePageScale(595, 300)).toBeCloseTo(0.5042, 4)
  })

  it(`窄页放大受 ${PDF_PAGE_SCALE_CAP} 倍上限保护（防字形发虚与页高失控）`, () => {
    // 200pt 窄页配 1000px 容器自然放大 5 倍，须被 cap 截住；贴上限值不误伤
    expect(computePageScale(200, 1000)).toBe(PDF_PAGE_SCALE_CAP)
    expect(computePageScale(595, 595 * PDF_PAGE_SCALE_CAP)).toBe(PDF_PAGE_SCALE_CAP)
  })
})

describe('isPdfRenderCancelled · 渲染取消态识别', () => {
  it('RenderingCancelledException 按 name 命中（关闭弹窗/换文件触发的清理属正常路径）', () => {
    const cancelled = Object.assign(new Error('Rendering cancelled, page 1'), { name: 'RenderingCancelledException' })
    expect(isPdfRenderCancelled(cancelled)).toBe(true)
  })

  it('普通错误与空值不误判为取消（真实故障必须走失败红条）', () => {
    expect(isPdfRenderCancelled(new Error('Invalid PDF structure'))).toBe(false)
    expect(isPdfRenderCancelled(undefined)).toBe(false)
    expect(isPdfRenderCancelled('boom')).toBe(false)
  })
})

describe('fake worker 挂载 · 单文件 bundle 的成立前提（R-P102）', () => {
  it('模块加载即挂载 globalThis.pdfjsWorker 并暴露函数形态的 WorkerMessageHandler', () => {
    // pdf.js 的 PDFWorker._initialize 只认 globalThis.pdfjsWorker.WorkerMessageHandler；
    // 缺失时它会退回 Worker(workerSrc) 路径，在单文件 iife 里必然崩溃
    const mounted = (globalThis as Record<string, unknown>).pdfjsWorker as { WorkerMessageHandler?: unknown }
    expect(typeof mounted?.WorkerMessageHandler).toBe('function')
  })
})
