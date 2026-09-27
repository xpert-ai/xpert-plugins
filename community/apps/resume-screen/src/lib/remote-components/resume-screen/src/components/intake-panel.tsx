/**
 * 底部录入区（蓝图 §3.7 v4.1：纯文件上传队列，无文本控件）
 *
 * v4.1 通道事实：宿主对远程组件视图不渲染 toolbar/文件选择器，「上传简历文件」
 * 主按钮由本面板把手行自绘（左侧，图标 ri-upload-cloud-line），与列表空态 CTA
 * 同一入口；点击弹出本组件自绘隐藏 input[type=file][multiple]（accept .docx/.pdf）。
 * 多选后由父层逐文件经 bridge executeFileAction 携带 ArrayBuffer 字节，宿主构建
 * FormData multipart 代理到 provider.executeViewFileAction（先例 smart-maintenance/
 * knowledge-workbench 同款；iframe 不解析文件内容、不本地持久化字节）。
 * 收起态 44px 把手挂进行中/失败计数徽标；展开态 ScrollArea 队列（限高 160px）+
 * 聚合条 + 行操作；队列行 memo，乐观入队与回执校准只 patch 状态字段（§11）。
 */
import React from '../react-shim'
import { Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger, ScrollArea } from '@xpert-ai/plugin-shadcn-ui'
import { QueueBadge } from './badges'
import type { QueueRow } from '../types'
import { UPLOAD_STILL_WORKING_MS, summarizeQueue } from '../utils'

const { memo, useEffect, useRef } = React

// 队列可见行上限 20：已收敛的超出部分聚合「更早上传 x 条」（§11）
const QUEUE_VISIBLE_CAP = 20
// 队列单行高 32px + 2px gap（ScrollArea 需显式高度，按行数收敛到 160px 上限）
const QUEUE_ROW_H = 34

interface IntakePanelProps {
  rows: QueueRow[]
  now: number
  // 批量上传进行中：把手计数与选择按钮防重
  busy: boolean
  expanded: boolean
  // 空态 CTA「上传简历文件」信号：递增即直接弹出文件选择器（§3.4）
  uploadRequestSeq: number
  onExpandedChange: (open: boolean) => void
  // 上传入口统一走父层：父层做岗位前置校验（AC2.1/§3.7）后驱动 bridge
  onPickFiles: (files: File[]) => void
  onClearFailed: () => void
  onJumpToCandidate: (candidateId: string) => void
  canUpload: () => boolean
}

export function IntakePanel({ rows, now, busy, expanded, uploadRequestSeq, onExpandedChange, onPickFiles, onClearFailed, onJumpToCandidate, canUpload }: IntakePanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const summary = summarizeQueue(rows)
  const earlyCount = Math.max(0, rows.length - QUEUE_VISIBLE_CAP)
  const visible = earlyCount > 0 ? rows.slice(0, QUEUE_VISIBLE_CAP) : rows

  function requestUpload() {
    // 未选岗位：前置拦截（不发宿主请求），父层负责 notify + A13 岗位蓝圈脉冲
    if (!canUpload()) return
    inputRef.current?.click()
  }

  // 空态 CTA 联动：seq 变化即弹选择器（初始 0 跳过）
  useEffect(() => {
    if (uploadRequestSeq > 0) inputRef.current?.click()
  }, [uploadRequestSeq])

  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange} className="rs-intake">
      {/* v4.1 §3.7：主按钮落位把手行左侧（宿主 toolbar 对远程组件不可用），触发器与按钮为同级避免嵌套 button */}
      <div className="rs-intake-row">
        <Button variant="default" size="sm" disabled={busy} onClick={requestUpload}>
          <i className="ri-upload-cloud-line" aria-hidden="true" />
          上传简历文件
        </Button>
        {/* 隐藏选择器：iframe 自绘（平台唯一可行形态）；字节由 bridge 转 ArrayBuffer 经 executeFileAction 出桥 */}
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          hidden
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.currentTarget.files ?? [])
            // 清空 value：同名文件连续重选也能触发 change（重新上传指引路径 §6.6）
            event.currentTarget.value = ''
            if (files.length) onPickFiles(files)
          }}
        />
        <CollapsibleTrigger asChild>
          <button type="button" className="rs-intake-handle" aria-label="展开或收起上传队列">
            <i className="ri-upload-cloud-line rs-handle-icon" aria-hidden="true" />
            上传队列
            {summary.active > 0 ? (
              <Badge variant="secondary" className="rs-handle-badge">
                上传中 {summary.active}
              </Badge>
            ) : null}
            {summary.failed > 0 ? (
              <Badge variant="secondary" className="rs-handle-badge rs-handle-badge-fail">
                失败 {summary.failed}
              </Badge>
            ) : null}
            {rows.length === 0 ? <span className="rs-intake-hint">上传 .docx / .pdf 开始初筛（可多选）</span> : null}
            <i className="ri-arrow-down-s-line rs-chevron" aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
      </div>
      {/* forceMount + 自管 grid-rows 0fr→1fr 高度过渡（A10）：不能用 Radix 默认 display:none，否则动画失效 */}
      <CollapsibleContent forceMount hidden={false}>
        <div className={`rs-intake-collapse${expanded ? ' is-open' : ''}`}>
          <div>
            <div className="rs-intake-body">
              <div className="rs-queue-summary" aria-live="polite">
                <span>
                  已提交 <b>{summary.total}</b> 份 · 排队中 <b>{summary.queued}</b> · 上传中 <b>{summary.uploading}</b> · 已创建 <b>{summary.created}</b> · 跳过{' '}
                  <b>{summary.skipped}</b> ·<span className={summary.failed ? 'is-fail' : undefined}> 失败 <b>{summary.failed}</b></span>
                </span>
                {summary.failed > 0 ? (
                  // 「清除失败记录」仅在存在失败时出现（§3.7 聚合条）；上传入口固定在把手行主按钮
                  <Button variant="ghost" size="sm" className="rs-queue-clear" onClick={onClearFailed}>
                    清除失败记录
                  </Button>
                ) : null}
              </div>

              {rows.length === 0 ? (
                <div className="rs-queue-guidance">
                  上传 .docx / .pdf 简历（可多选）：文件按当前岗位解析入库，AI 自动抽取评分，结果回填后出现在左侧列表。
                </div>
              ) : null}
              {earlyCount > 0 ? <div className="rs-queue-hint">更早上传 {earlyCount} 条</div> : null}

              <ScrollArea className="rs-queue-scroll" style={{ height: Math.min(160, Math.max(34, visible.length * QUEUE_ROW_H)) }}>
                <div className="rs-queue-list" role="list" aria-label="上传队列">
                  {visible.map((row, index) => (
                    <QueueRowItem
                      key={row.localId}
                      row={row}
                      elapsedLong={now - row.startedAt > UPLOAD_STILL_WORKING_MS}
                      enter={index < 10}
                      // A7 节拍对齐候选人列表：仅前 10 行 ×40ms 级联，数值型 prop 不破坏行 memo
                      enterDelay={index < 10 ? Math.min(index, 9) * 40 : null}
                      onJumpToCandidate={onJumpToCandidate}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// 队列行（§3.7 行结构：文件图标+文件名(省略号+title 全名)+状态徽标+操作位）
const QueueRowItem = memo(function QueueRowItem({
  row,
  elapsedLong,
  enter,
  enterDelay,
  onJumpToCandidate
}: {
  row: QueueRow
  elapsedLong: boolean
  enter: boolean
  enterDelay: number | null
  onJumpToCandidate: (candidateId: string) => void
}) {
  const working = row.status === 'queued' || row.status === 'uploading'
  return (
    <div
      className={`rs-queue-row${enter ? ' rs-enter' : ''}${row.leaving ? ' rs-leaving' : ''}`}
      style={enter && enterDelay !== null ? ({ '--rs-stagger': `${enterDelay}ms` } as React.CSSProperties) : undefined}
      role="listitem"
    >
      <i className="ri-file-line" aria-hidden="true" />
      <span className="rs-queue-name" title={row.fileName}>
        {row.fileName}
      </span>
      <QueueBadge status={row.status} />
      <span className="rs-queue-actions">
        {row.status === 'created' && row.candidateId ? (
          <Button variant="ghost" size="sm" onClick={() => onJumpToCandidate(row.candidateId as string)}>
            查看
          </Button>
        ) : null}
        {/* 进行中行超 60s 无回执：行尾弱色提醒（徽标标签不变，v4.2 单一进行态），不设重试 */}
        {working && elapsedLong ? <span className="rs-queue-hint">仍在处理，可稍后查看</span> : null}
      </span>
      {row.status === 'skipped' ? <span className="rs-queue-hint rs-queue-span">该简历内容已存在</span> : null}
      {row.status === 'failed' && row.failureReason ? (
        // 行尾展开可执行重新上传指引（role=alert，四类原因文案在入队时已映射，§6.6）
        <span className="rs-queue-fail" role="alert">
          <i className="ri-error-warning-line" aria-hidden="true" />
          {row.failureReason}
        </span>
      ) : null}
    </div>
  )
})
