/**
 * 简历预览弹窗（spec §5.4）
 *
 * docx：服务端 mammoth 转 HTML 并已消毒 → .rs-preview-doc 富文本呈现；
 * pdf：base64 → pdf.js（legacy CJS 构建 + 主线程 fake worker，见 pdf-render.ts）在弹窗内
 * 逐页 canvas 直渲。T22 偏差 9 曾因 Chromium 对父文档内嵌 PDF 的插件门禁退到「新标签页
 * 打开」；本形态改用 pdf.js 自绘绕开该门禁，正片直接在弹窗内呈现，原 Blob URL 与新标签
 * 页通道随之废除。渲染生命周期：effect 持有 loadingTask 与在途 RenderTask，payload 变更/
 * 弹窗关闭/组件卸载三条清理路径统一 cancel + destroy；取消异常静默吞掉，其余错误落失败
 * 红条（不静默白屏）。
 */
import React from '../react-shim'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ScrollArea } from '@xpert-ai/plugin-shadcn-ui'
import type { PreviewPayload } from '../types'
import { decodeBase64ToBytes } from '../utils'
import { computePageScale, isPdfRenderCancelled, loadPdfDocument } from '../pdf-render'

const { useEffect, useRef, useState } = React

// 由 loadPdfDocument 推导 pdf.js 类型：不直接引 pdfjs 子路径类型，避免与内部类型布局耦合
type PdfLoadingTask = ReturnType<typeof loadPdfDocument>
type PdfDocument = Awaited<PdfLoadingTask['promise']>
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>
type PdfRenderTask = ReturnType<PdfPage['render']>

// 清晰度封顶：按设备像素比超采样位图，2 倍以上肉眼无益且高 dpr 设备渲染成本陡增
const MAX_DEVICE_PIXEL_RATIO = 2

// pdf 分支相位：渲染中（含逐页上屏过程）→ 完成 / 失败
type PdfPhase = 'rendering' | 'ready' | 'failed'

interface PreviewDialogProps {
  open: boolean
  fileName: string
  payload: PreviewPayload
  onClose: (next: boolean) => void
}

export function PreviewDialog({ open, fileName, payload, onClose }: PreviewDialogProps) {
  // pdf canvas 的命令式挂载宿主：canvas 不走 React 协调（pdf.js 要求持有真实节点渲染），
  // 宿主 div 是 React 树内该分支的唯一子节点，增删全由下方 effect 管束，不与调和互相踩
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<PdfPhase>('rendering')

  useEffect(() => {
    if (!open || payload.kind !== 'pdf') return undefined

    setPhase('rendering')
    let cancelled = false
    let loadingTask: PdfLoadingTask | null = null
    let activeRenderTask: PdfRenderTask | null = null

    const render = async () => {
      try {
        // 服务端 preview_candidate 回执的 base64 → 字节（与服务端 T10 编码通道对应）
        const data = decodeBase64ToBytes(payload.base64)
        loadingTask = loadPdfDocument(data)
        const doc = await loadingTask.promise
        if (cancelled) return
        // fit-width 基准 = 渲染列内容盒宽：clientWidth 含 padding，按 computed 实测扣除，
        // 不与样式里的 padding 值硬编码对账（样式改动不会造成缩放基准漂移）
        const host = pagesRef.current
        let available = 0
        if (host) {
          const style = window.getComputedStyle(host)
          available = host.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
        }
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
          if (cancelled) return
          const page = await doc.getPage(pageNo)
          if (cancelled) return
          // 阅读视口（css 尺寸，决定版面）与位图视口（×dpr，决定清晰度）分离：
          // canvas 位图按 dpr 超采样，CSS 宽高钉在阅读尺寸上，高屏不糊、版面不缩
          const baseViewport = page.getViewport({ scale: 1 })
          const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
          const cssScale = computePageScale(baseViewport.width, available)
          const cssViewport = page.getViewport({ scale: cssScale })
          const bitmapViewport = page.getViewport({ scale: cssScale * dpr })
          const canvas = document.createElement('canvas')
          canvas.className = 'rs-preview-pdf-page'
          canvas.width = Math.floor(bitmapViewport.width)
          canvas.height = Math.floor(bitmapViewport.height)
          canvas.style.width = `${Math.floor(cssViewport.width)}px`
          canvas.style.height = `${Math.floor(cssViewport.height)}px`
          const context = canvas.getContext('2d')
          if (!context) throw new Error('canvas 2d 上下文创建失败')
          // 串行逐页：渲染完成才上屏，加载态持续可见、整页出现不闪空白框
          const renderTask = page.render({ canvasContext: context, viewport: bitmapViewport })
          activeRenderTask = renderTask
          await renderTask.promise
          activeRenderTask = null
          if (cancelled) return
          host.appendChild(canvas)
        }
        setPhase('ready')
      } catch (error) {
        // 关闭弹窗/切换 payload 触发的取消是清理路径的正常产物，静默吞掉；其余落失败红条
        if (cancelled || isPdfRenderCancelled(error)) return
        setPhase('failed')
      }
    }
    void render()

    // 清理三路径（payload 变更/弹窗关闭/组件卸载）共用本回调：先取消在途渲染，
    // 再销毁文档与 fake worker 会话，最后摘除已上屏 canvas（节点不归 React 管）
    return () => {
      cancelled = true
      activeRenderTask?.cancel()
      void loadingTask?.destroy()
      pagesRef.current?.replaceChildren()
    }
  }, [open, payload])

  const failed = payload.kind === 'pdf' && phase === 'failed'

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose(false))}>
      <DialogContent className="rs-preview-dialog">
        <DialogHeader>
          <DialogTitle>预览简历</DialogTitle>
          <DialogDescription>{fileName}</DialogDescription>
        </DialogHeader>
        {failed ? (
          // 与首载失败卡同构的红变体 notice（§6.1），文案给可执行下一步
          <div className="rs-notice rs-notice-inline" role="alert" style={{ position: 'static' }}>
            <i className="ri-error-warning-line" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>简历预览加载失败，可关闭窗口后重新打开；若反复失败，请重新上传该简历。</div>
          </div>
        ) : payload.kind === 'html' ? (
          // 内容已在服务端 sanitizePreviewHtml 消毒（T10），此处 dangerouslySetInnerHTML 是受控用法
          <ScrollArea className="rs-preview-scroll">
            <article className="rs-preview-doc" dangerouslySetInnerHTML={{ __html: payload.html }} />
          </ScrollArea>
        ) : (
          // pdf 正片：pdf.js 逐页 canvas 直渲，滚动沿用 html 分支同款 ScrollArea
          <ScrollArea className="rs-preview-scroll">
            <div className="rs-preview-pdf-pages">
              {phase === 'rendering' ? (
                // 加载态沿用 A9 loader（.rs-spin），文案给「进行中」预期
                <div className="rs-preview-pdf-state">
                  <i className="ri-loader-2-line rs-spin" aria-hidden="true" />
                  正在渲染简历…
                </div>
              ) : null}
              <div ref={pagesRef} className="rs-preview-pdf-canvas-host" />
            </div>
          </ScrollArea>
        )}
        <footer className="rs-preview-foot">
          <Button variant="outline" size="sm" onClick={() => onClose(false)}>
            关闭
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
