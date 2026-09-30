/**
 * pdf.js 弹窗渲染支持层（spec §5.4，T22 偏差 9 改写：pdf 正片改弹窗内 canvas 直渲）
 *
 * 职责切分：本模块只承载两类可在 node 测试环境验证的东西——
 * 1. pdfjs 初始化：单文件 iife bundle 下的 fake worker 挂载（机理见下）；
 * 2. 纯函数：页适配缩放、渲染取消态识别。
 * canvas/DOM 编排留在 preview-dialog.tsx，避免 DOM 依赖混进可测层。
 *
 * worker 方案（单文件 bundle 唯一可行路径）：远端组件由 esbuild 打成单文件 iife，
 * iframe 壳只内联 app.js——pdf.js 默认起 Worker(workerSrc)，单文件下既无第二个 chunk
 * 也无 workerSrc 可用，运行时动态 import 必然失败。pdf.js 的 PDFWorker._initialize 在
 * `globalThis.pdfjsWorker.WorkerMessageHandler` 已挂载时直接走主线程 fake worker，
 * 永不触达 workerSrc（也就永不触发动态 import），故模块顶层完成挂载，保证任何
 * getDocument 调用发生前挂载已就绪。legacy CJS 构建经 esbuild/SWC 的命名空间 interop
 * 后 WorkerMessageHandler 一般已在顶层；若日后 interop 形态变化导致其只落在 default
 * 上（CJS 整体作为 default 导出），用 `?? default` 兜底，两种形态都覆盖。
 */
import * as pdfjsLibrary from 'pdfjs-dist/legacy/build/pdf.js'
import * as pdfjsWorkerModule from 'pdfjs-dist/legacy/build/pdf.worker.js'

// 服务端解析走同一 deep path 的 legacy CJS 构建（v4 纯 ESM 无法进单文件 iife，决策 F6 同源）
const workerNamespace = pdfjsWorkerModule as {
  WorkerMessageHandler?: unknown
  default?: { WorkerMessageHandler?: unknown }
}
const workerMessageHandler = workerNamespace.WorkerMessageHandler ?? workerNamespace.default?.WorkerMessageHandler
if (typeof workerMessageHandler !== 'function') {
  // 挂载失败说明 legacy 构建 interop 形态变了：宁可加载期快速失败（CI 会红），
  // 也不能留到用户点开预览时才在浏览器里炸出难排查的 worker 错误
  throw new Error('pdf.js fake worker 挂载失败：WorkerMessageHandler 缺失（检查 pdfjs-dist legacy 构建的 interop 形态）')
}
;(globalThis as Record<string, unknown>).pdfjsWorker = { WorkerMessageHandler: workerMessageHandler }

/** fit-width 放大上限：窄页等比放大超过 2 倍后字形发虚且页高失控，宁可两侧留白 */
export const PDF_PAGE_SCALE_CAP = 2

/**
 * 计算单页适配缩放（业务口径 fit-width：页面宽度铺满渲染列）
 *
 * @param pageWidth pdf 页在 scale=1 下的视口宽（pt），来源 page.getViewport({scale:1}).width
 * @param containerWidth 渲染列可用宽度（px，须已扣除容器左右内边距），必须为正数
 * @returns 缩放倍数（正数）；页宽/容器宽为 0、负数或非有限数时回落 1（自然尺寸，
 *          防止 scale≤0 令 getViewport 抛错）；放大受 PDF_PAGE_SCALE_CAP 封顶
 */
export function computePageScale(pageWidth: number, containerWidth: number): number {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return 1
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1
  return Math.min(containerWidth / pageWidth, PDF_PAGE_SCALE_CAP)
}

/**
 * 加载 pdf 文档（getDocument 的统一参数口）
 *
 * 参数与服务端 resume-file-parser 同款：verbosity 0 压掉 pdf.js 的控制台噪音，
 * isEvalSupported false 关闭字体渲染的 eval 通道（CSP 安全，宿主文档禁 eval）。
 *
 * @param data pdf 文件原始字节（来源 decodeBase64ToBytes），函数内会被 pdf.js 转移使用
 * @returns PDFDocumentLoadingTask（.promise 取文档，.destroy() 释放全部资源）
 */
export function loadPdfDocument(data: Uint8Array) {
  return pdfjsLibrary.getDocument({ data, verbosity: 0, isEvalSupported: false })
}

/**
 * 识别 pdf.js 的渲染取消异常（清理竞态的静默通道）
 *
 * pdf.js 取消渲染时以 RenderingCancelledException 拒绝 RenderTask.promise，该异常
 * 带专有 name 而不可 new（构造签名不公开），按 name 识别即可，无需引类依赖。
 *
 * @param error 待判定的异常（允许为空/任意值）
 * @returns true 表示「主动取消」而非真实故障，调用方应静默吞掉
 */
export function isPdfRenderCancelled(error: unknown): boolean {
  return Boolean(error) && (error as { name?: string }).name === 'RenderingCancelledException'
}
