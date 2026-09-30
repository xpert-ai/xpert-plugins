/**
 * 上传简历弹窗（spec §5.3 建段：入口在列表工具条，进度与指引在弹窗内）
 *
 * 通道事实：远程组件里宿主不渲染文件选择器，隐藏 input[type=file] 必须自绘（沿用 v4.1 唯一可行形态）；
 * 字节经 bridge executeFileAction 出桥，本组件只管行态呈现。拖拽区是对话式补充——drop 与 click
 * 走同一 onPickFiles，不额外开第二条上传路径。
 * 关闭纪律：有在途行时必须经 AlertDialog 轻确认（防「以为传完了」），全终态才允许直接关；
 * closable 判定单一真源在 utils.summarizeUploadRows（单测钉死）。
 * 焦点：全部交给 Dialog 原生焦点陷阱与 autoFocus，禁止手写 focus()（跨浮层会抢走宿主焦点）。
 */
import React from '../react-shim'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea
} from '@xpert-ai/plugin-shadcn-ui'
import { UploadBadge } from './badges'
import type { UploadRow } from '../types'
import { UPLOAD_STILL_WORKING_MS, summarizeUploadRows } from '../utils'

const { memo, useEffect, useRef, useState } = React

// 弹窗内可见行上限：超出部分聚合为「更早 x 条」，与 §11 渲染成本约束同源
const ROW_CAP = 24

interface UploadDialogProps {
  open: boolean
  rows: UploadRow[]
  // 批量提交进行中（父层 busy）：防重复选择、防「完成」按钮二次点击
  busy: boolean
  // 空态 CTA 信号：递增即直接弹出文件选择器（弹窗已由父层打开）
  uploadRequestSeq: number
  onClose: (next: boolean) => void
  onPickFiles: (files: File[]) => void
  onClearFailed: () => void
  onJumpToCandidate: (candidateId: string) => void
}

export function UploadDialog({ open, rows, busy, uploadRequestSeq, onClose, onPickFiles, onClearFailed, onJumpToCandidate }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const summary = summarizeUploadRows(rows)
  const earlyCount = Math.max(0, rows.length - ROW_CAP)
  const visible = earlyCount > 0 ? rows.slice(0, ROW_CAP) : rows

  // 空态 CTA：seq 变化（初值 0 跳过）即弹选择器，用户少一次点击
  useEffect(() => {
    if (open && uploadRequestSeq > 0) inputRef.current?.click()
  }, [open, uploadRequestSeq])

  function accept(files: File[]) {
    setDragging(false)
    if (files.length) onPickFiles(files)
  }

  function requestClose() {
    // 在途行存在：关窗必须确认（字节还在走，关了就没有回执呈现）
    if (summary.closable) {
      onClose(false)
      return
    }
    setConfirmClose(true)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : requestClose())}>
      <DialogContent className="rs-upload-dialog">
        <DialogHeader>
          <DialogTitle>上传简历</DialogTitle>
          {/* 限制说明常驻（不用 tooltip 藏起来），失败回执再叠加行内指引 */}
          <DialogDescription>支持 .docx / .pdf，单文件 ≤ 10MB，可一次选择多个文件。</DialogDescription>
        </DialogHeader>

        <div
          className={`rs-upload-drop${dragging ? ' is-drag' : ''}`}
          onDragOver={(event: React.DragEvent) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(event: React.DragEvent) => {
            // 指针移入区内子元素（图标/文案/按钮）时 dragleave 也会在容器上触发：
            // relatedTarget 仍在拖拽区内则不灭高亮，防「进入反馈」逐元素闪烁（A14 跟手）
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
            setDragging(false)
          }}
          onDrop={(event: React.DragEvent) => {
            event.preventDefault()
            accept(Array.from(event.dataTransfer.files ?? []))
          }}
        >
          <i className="ri-upload-cloud-2-line" aria-hidden="true" />
          <div className="rs-upload-drop-text">把简历文件拖到这里，或</div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <i className="ri-file-add-line" aria-hidden="true" />
            选择文件
          </Button>
          {/* 隐藏选择器：accept 与拖拽区双通道共用 onPickFiles；value 复位让同名文件可重选 */}
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            hidden
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const files = Array.from(event.currentTarget.files ?? [])
              event.currentTarget.value = ''
              accept(files)
            }}
          />
        </div>

        {rows.length > 0 ? (
          <>
            {/* 汇总条：role=status + polite，逐文件回执落地时读屏播报一次 */}
            <div className="rs-upload-summary" role="status" aria-live="polite">
              <span>
                已选 <b>{summary.selected}</b> · 完成 <b>{summary.done}</b> · 跳过 <b>{summary.skipped}</b>
                <span className={summary.failed ? ' is-fail' : undefined}> · 失败 <b>{summary.failed}</b></span>
              </span>
              {summary.failed > 0 ? (
                <Button variant="ghost" size="sm" className="rs-upload-clear" onClick={onClearFailed}>
                  清除失败记录
                </Button>
              ) : null}
            </div>
            {earlyCount > 0 ? <div className="rs-upload-hint">更早 {earlyCount} 条</div> : null}
            <ScrollArea className="rs-upload-scroll">
              <div className="rs-upload-list" role="list" aria-label="上传进度">
                {visible.map((row, index) => (
                  <UploadRowItem
                    key={row.localId}
                    row={row}
                    // 行入场只给前 10 行 stagger（与列表同节拍，数值型 prop 不击穿 memo）
                    enterDelay={index < 10 ? Math.min(index, 9) * 40 : null}
                    elapsedLong={Date.now() - row.startedAt > UPLOAD_STILL_WORKING_MS}
                    onJumpToCandidate={onJumpToCandidate}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="rs-upload-guidance">还没有选择文件。选择后会逐个上传，服务端解析完成后自动出现在左侧列表。</div>
        )}

        <footer className="rs-upload-foot">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <i className="ri-add-line" aria-hidden="true" />
            继续上传
          </Button>
          <Button variant="default" size="sm" onClick={requestClose}>
            完成
          </Button>
        </footer>

        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>还有 {summary.inFlight} 个文件正在上传</AlertDialogTitle>
              <AlertDialogDescription>关闭窗口不会取消上传，文件仍会在服务端解析入库；可稍后在列表中查看结果。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="outline" size="sm">
                继续等待
              </AlertDialogCancel>
              <AlertDialogAction
                variant="default"
                size="sm"
                onClick={() => {
                  setConfirmClose(false)
                  onClose(false)
                }}
              >
                仍要关闭
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

// 单行 memo：批量上传只 patch 行状态字段，其余行不重渲（§11）
const UploadRowItem = memo(function UploadRowItem({
  row,
  enterDelay,
  elapsedLong,
  onJumpToCandidate
}: {
  row: UploadRow
  enterDelay: number | null
  elapsedLong: boolean
  onJumpToCandidate: (candidateId: string) => void
}) {
  const working = row.status === 'queued' || row.status === 'uploading'
  return (
    <div
      className={`rs-upload-row${enterDelay !== null ? ' rs-enter' : ''}${row.leaving ? ' rs-leaving' : ''}`}
      style={enterDelay !== null ? ({ '--rs-stagger': `${enterDelay}ms` } as React.CSSProperties) : undefined}
      role="listitem"
    >
      <i className="ri-file-line" aria-hidden="true" />
      <span className="rs-upload-name" title={row.fileName}>
        {row.fileName}
      </span>
      <UploadBadge status={row.status} />
      <span className="rs-upload-actions">
        {row.status === 'created' && row.candidateId ? (
          <Button variant="ghost" size="sm" onClick={() => onJumpToCandidate(row.candidateId as string)}>
            查看
          </Button>
        ) : null}
        {/* 进行中超 60s 无回执：行尾弱色提醒，不改徽标标签、不设重试（v4.2 单一进行态纪律） */}
        {working && elapsedLong ? <span className="rs-upload-hint">仍在处理，可稍后查看</span> : null}
      </span>
      {row.status === 'skipped' ? <span className="rs-upload-hint">该简历内容已存在</span> : null}
      {row.status === 'failed' && row.failureReason ? (
        <span className="rs-upload-fail" role="alert">
          <i className="ri-error-warning-line" aria-hidden="true" />
          {row.failureReason}
        </span>
      ) : null}
    </div>
  )
})
