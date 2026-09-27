/**
 * 岗位切换区（蓝图 §3.2 / §6.8 / §10 P4，v4 D1 定稿）
 *
 * 左侧岗位 Select（切换即清选中与筛选并重新 requestData）+ 新建岗位表单 Dialog +
 * 当前岗位 JD Popover 摘要 + 刷新按钮。新建走 create_job action，全程不经宿主对话；
 * 校验口径：标题非空、JD ≥30 字（不足禁用保存），提交期 disabled + 「保存中…」防重。
 */
import React from '../react-shim'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import type { JobCreateOutcome, JobView } from '../types'

const { useEffect, useMemo, useRef, useState } = React

// JD 最短字数闸：与服务层 createJob/provider 视图层同口径（蓝图 §3.2）
const MIN_JD_LENGTH = 30
// 岗位名称长度上限：超限截断并显弱色计数（蓝图 §3.2）
const MAX_TITLE_LENGTH = 200

interface JobHeaderProps {
  jobs: JobView[]
  currentJobId: string | null
  busy: boolean
  // 静默刷新在途：刷新钮图标旋转（A9 语言）并在途防重点，让「手动刷新已受理」有即时反馈
  refreshing: boolean
  // 蓝圈脉冲序号：A13 未选岗位上传被拒时递增触发一次
  jobPulseSeq: number
  // 容器 <560px：头部动作收纳进「更多」下拉（蓝图 §4，对齐 crm 断点折叠做法）
  xsMode: boolean
  onSelectJob: (jobId: string) => void
  onCreateJob: (title: string, jdText: string) => Promise<JobCreateOutcome>
  onRefresh: () => void
}

export function JobHeader({ jobs, currentJobId, busy, refreshing, jobPulseSeq, xsMode, onSelectJob, onCreateJob, onRefresh }: JobHeaderProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const currentJob = useMemo(() => jobs.find((job) => job.id === currentJobId) ?? null, [jobs, currentJobId])
  const jobSelectRef = useRef<HTMLDivElement | null>(null)

  // 列表空态 CTA「新建岗位」跨组件复用本 Dialog：自定义事件打开（焦点陷阱不跨层）
  useEffect(() => {
    const openDialog = () => setCreateOpen(true)
    window.addEventListener('rs:open-create-job', openDialog)
    return () => window.removeEventListener('rs:open-create-job', openDialog)
  }, [])

  // A13：未选岗位点上传 → 岗位 Select 蓝圈脉冲一次（蓝图 §7）
  useEffect(() => {
    if (jobPulseSeq === 0) return
    const node = jobSelectRef.current?.querySelector('[data-slot="select-trigger"]') as HTMLElement | null
    if (!node) return
    node.classList.remove('rs-pulse-job')
    // 同帧移除后强制 reflow 再添加，保证重复触发也能重播一次动画
    void node.offsetWidth
    node.classList.add('rs-pulse-job')
  }, [jobPulseSeq])

  return (
    <header className="rs-header">
      <i className="ri-briefcase-line rs-job-icon" aria-hidden="true" />
      <div className="rs-job-select" ref={jobSelectRef}>
        <Select value={currentJobId ?? undefined} onValueChange={onSelectJob}>
          <SelectTrigger aria-label="选择岗位">
            <SelectValue placeholder="选择岗位" />
          </SelectTrigger>
          <SelectContent>
            {jobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {currentJob ? <JdPopover job={currentJob} /> : null}
      <span className="rs-header-spacer" />
      {xsMode ? (
        // 超窄容器：新建/刷新收纳进「更多」下拉（蓝图 §4 <560px 断点）
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title="更多操作" aria-label="更多操作">
              <i className="ri-more-line" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={busy} onSelect={() => setCreateOpen(true)}>
              <i className="ri-add-line" aria-hidden="true" />
              新建岗位
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy || refreshing} onSelect={onRefresh}>
              <i className="ri-refresh-line" aria-hidden="true" />
              刷新
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="rs-header-actions">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setCreateOpen(true)}>
            <i className="ri-add-line" aria-hidden="true" />
            <span className="rs-header-label">新建岗位</span>
          </Button>
          {/* 刷新在途：图标旋转（复用 A9 loader 语言）+ disabled 防重点，即时反馈「已受理」 */}
          <Button variant="ghost" size="icon" title="刷新" aria-label="刷新" disabled={busy || refreshing} onClick={onRefresh}>
            <i className={`ri-refresh-line${refreshing ? ' rs-spin' : ''}`} aria-hidden="true" />
          </Button>
        </div>
      )}
      <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={onCreateJob} />
    </header>
  )
}

// 岗位 JD 摘要弹层：不占独立栏（蓝图 §3.2）
function JdPopover({ job }: { job: JobView }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="查看岗位描述">
          <i className="ri-file-text-line" aria-hidden="true" />
          <span className="rs-header-label">JD</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="rs-jd-popover">
        <div className="rs-section-title">{job.title} · 职位描述</div>
        <div className="rs-jd-text">{job.jdText}</div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * 新建岗位表单 Dialog（v4 D1）
 *
 * 键盘：名称框 Enter 提交、Textarea Enter 换行、Esc 取消（未提交内容丢弃，不做草稿持久化）；
 * 打开焦点落名称输入框（Radix 焦点陷阱），关闭焦点回触发按钮（Dialog 原生行为）。
 * 提交失败（如「该岗位已存在」）保持打开并把焦点送回名称字段（§3.2）。
 */
function CreateJobDialog({
  open,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (title: string, jdText: string) => Promise<JobCreateOutcome>
}) {
  const [title, setTitle] = useState('')
  const [jdText, setJdText] = useState('')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  // 「其他异常」提交失败文案（M10 M-3）：渲染进 Dialog 内 notice 红变体，随下次提交/重开清除
  const [submitError, setSubmitError] = useState('')
  const titleRef = useRef<HTMLInputElement | null>(null)
  const jdRef = useRef<HTMLTextAreaElement | null>(null)

  const titleError = touched && !title.trim() ? '岗位名称必填' : ''
  const jdLength = jdText.trim().length
  const jdError = touched && jdLength > 0 && jdLength < MIN_JD_LENGTH ? `职位描述至少 ${MIN_JD_LENGTH} 字（当前 ${jdLength} 字）` : ''
  const canSave = Boolean(title.trim()) && jdLength >= MIN_JD_LENGTH && !saving

  // 每次打开重置表单：Dialog 内容不持久化（§3.2）
  useEffect(() => {
    if (open) {
      setTitle('')
      setJdText('')
      setTouched(false)
      setSaving(false)
      setSubmitError('')
    }
  }, [open])

  async function submit() {
    setTouched(true)
    setSubmitError('')
    if (!title.trim()) {
      titleRef.current?.focus()
      return
    }
    if (jdLength < MIN_JD_LENGTH) {
      jdRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const outcome = await onSubmit(title.trim(), jdText.trim())
      // 成功才关闭；失败（重复/异常）保持打开并回焦名称字段（§3.2 错误呈现）
      if (outcome.ok) {
        onOpenChange(false)
      } else {
        setSubmitError(outcome.notice ?? '')
        titleRef.current?.focus()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="rs-create-dialog" aria-busy={saving}>
        <DialogHeader>
          <DialogTitle>新建岗位</DialogTitle>
        </DialogHeader>
        <div className="rs-form">
          <label className="rs-form-field">
            <span>
              岗位名称<em>*</em>
              <small>不超过 {MAX_TITLE_LENGTH} 字</small>
            </span>
            <Input
              ref={titleRef}
              value={title}
              autoFocus
              maxLength={MAX_TITLE_LENGTH}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? 'rs-job-title-error' : undefined}
              placeholder="如：前端工程师"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTitle(event.currentTarget.value)}
              onKeyDown={(event: React.KeyboardEvent) => {
                // 名称框 Enter 提交；Textarea 内 Enter 保持换行不冒泡（§6.8）
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submit()
                }
              }}
            />
            <span className="rs-soft-count" style={{ color: 'var(--rs-soft)', fontSize: 11 }}>
              {title.length}/{MAX_TITLE_LENGTH}
            </span>
            {titleError ? (
              <span id="rs-job-title-error" className="rs-form-error" role="alert">
                {titleError}
              </span>
            ) : null}
          </label>
          <label className="rs-form-field">
            <span>
              职位描述<em>*</em>
              <small>至少 {MIN_JD_LENGTH} 字</small>
            </span>
            <Textarea
              ref={jdRef}
              value={jdText}
              aria-invalid={Boolean(jdError)}
              aria-describedby={jdError ? 'rs-job-jd-error' : undefined}
              placeholder="粘贴岗位 JD 原文，AI 将据此抽取评分"
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setJdText(event.currentTarget.value)}
            />
            {jdError ? (
              <span id="rs-job-jd-error" className="rs-form-error" role="alert">
                {jdError}
              </span>
            ) : null}
          </label>
        </div>
        {submitError ? (
          // M10 M-3（§3.2）：「其他异常」在表单语境呈现——Dialog 内 notice 红变体（复用 .rs-notice sm token、role=alert），
          // notify 轻提示由父编排双通道同步发出；Dialog 保持打开，文案给出失败事实
          <div className="rs-notice rs-notice-inline" role="alert" style={{ position: 'static', margin: '10px 0 0' }}>
            <i className="ri-error-warning-line" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>{submitError}</div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!canSave} onClick={() => void submit()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
