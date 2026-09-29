/**
 * 简历预览弹窗（spec §5.4）
 *
 * docx：服务端 mammoth 转 HTML 并已消毒 → .rs-preview-doc 富文本呈现；
 * pdf：base64 → Blob URL → <iframe> 交浏览器原生查看器（不自建 pdf.js 渲染，
 * pdf 的 Content-Type 由 new Blob([bytes], { type: mime }) 承载，浏览器嗅探不靠 iframe type）。
 * Blob URL 生命周期（§5.8 泄漏红线）：pdf 分支用 createPdfBlobUrl 拿到 {url, release}，
 * release 挂 effect cleanup 与 payload 变更两条路径（release 幂等，两条路径同时命中也只释放一次）。
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
          <iframe className="rs-preview-pdf" src={blobUrl} title={`${fileName} 简历预览`} />
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
