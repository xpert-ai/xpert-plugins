/**
 * 简历预览弹窗（spec §5.4）
 *
 * docx：服务端 mammoth 转 HTML 并已消毒 → .rs-preview-doc 富文本呈现；
 * pdf：base64 → Blob URL，弹窗内呈现说明面板 +「在新标签页打开」按钮。Chromium 对
 * 「blob 父文档内嵌 iframe 再嵌 blob PDF」不启用 PDF 插件（T20 E2E 项 11 实测：同一 blob
 * 字节顶层渲染正常），原生内嵌正片不可达，故新标签页由浏览器原生查看器承载（T22 偏差 9）。
 * Blob URL 生命周期（§5.8 泄漏红线）：pdf 分支用 createPdfBlobUrl 拿到 {url, release}，
 * release 挂 effect cleanup 与 payload 变更两条路径（release 幂等，两条路径同时命中也只释放一次）；
 * window.open 直接消费该 blobUrl，标签页持有期间 URL 仍存活（关闭弹窗即释放，行为可接受）。
 */
import React from '../react-shim'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ScrollArea } from '@xpert-ai/plugin-shadcn-ui'
import type { PreviewPayload } from '../types'
import { createPdfBlobUrl, decodeBase64ToBytes } from '../utils'

const { useEffect, useState } = React

interface PreviewDialogProps {
  open: boolean
  fileName: string
  payload: PreviewPayload
  onClose: (next: boolean) => void
}

export function PreviewDialog({ open, fileName, payload, onClose }: PreviewDialogProps) {
  // pdf 分支的长期 Blob URL：仅在 kind 与 base64 变化时重建，关闭/卸载必释放（§5.8）
  const [blobUrl, setBlobUrl] = useState('')

  useEffect(() => {
    if (payload.kind !== 'pdf') {
      setBlobUrl('')
      return undefined
    }
    let handle: { url: string; release: () => void } | null = null
    try {
      handle = createPdfBlobUrl(decodeBase64ToBytes(payload.base64), 'application/pdf')
    } catch {
      // 解码/建 URL 失败（回执被截断等）：交给下面 notice 呈现，不静默白屏
      setBlobUrl('')
      return undefined
    }
    setBlobUrl(handle.url)
    const current = handle
    return () => current.release()
  }, [payload])

  const failed = payload.kind === 'pdf' && !blobUrl

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
          // 浏览器 PDF 插件门禁（T20 项 11）：弹窗内呈现说明面板，正片引导到新标签页原生查看
          <div className="rs-preview-pdf-bridge">
            <i className="ri-file-pdf-2-line" aria-hidden="true" />
            <p>浏览器限制：内嵌预览在新标签页打开「{fileName}」</p>
            <Button
              variant="outline"
              size="sm"
              title={`在新标签页打开 ${fileName} 的 PDF 预览`}
              aria-label={`在新标签页打开 ${fileName} 的 PDF 预览`}
              // blobUrl 由上方 effect 创建/释放；noopener 防新标签页拿到 opener 引用
              onClick={() => window.open(blobUrl, '_blank', 'noopener')}
            >
              <i className="ri-external-link-line" aria-hidden="true" />
              在新标签页打开
            </Button>
          </div>
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
