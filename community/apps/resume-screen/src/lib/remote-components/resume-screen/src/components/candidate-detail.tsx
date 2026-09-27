/**
 * 右详情区（蓝图 §3.5：头部 + 抽取字段/评分/命中/风险四区块 + 失败/解析中覆盖态 + 编辑态）
 *
 * 失败态：正文顶部红色告示卡（原因全文 + 重试），四区块隐藏（§6.2）；
 * 解析中：骨架 + 已耗时说明，超 10 分钟转琥珀超时卡（§6.4，「再等等」5 分钟不再提示）；
 * 编辑态：字段区切表单，保存带 expectedRevision 乐观锁，冲突走 AlertDialog 恢复路径（§6.5）。
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
  Input,
  Progress,
  ScrollArea,
  Skeleton,
  Textarea,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import { ActionBar, type DispositionKey } from './action-bar'
import { CandidateBadge, statusAccent } from './badges'
import type { CandidateView, ResumeScreenCandidatePatchMirror } from '../types'
import { elapsedLabel, formatMonthDay, scoreTier } from '../utils'

const { useState } = React

// 人工修正字段的服务端语义说明：修正字段不会被 AI 覆盖（§3.5 与 provider 文案一致）
const HUMAN_EDIT_NOTE = '已保存（人工修正字段不会被 AI 覆盖）'

// 字段中文名映射：人工修正标记 Tooltip 清单与表单 label 共用
const FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  yearsOfExperience: '年限',
  education: '学历',
  currentCompany: '当前公司',
  skills: '技能',
  summary: '摘要',
  matchScore: '匹配分'
}

export interface SaveOutcome {
  success: boolean
  conflict: boolean
  message: string
}

interface DetailProps {
  candidate: CandidateView | null
  timedOut: boolean
  // 超时提示卡是否展示：timedOut 且未被「再等等」抑制（§6.4 前端记忆在上层维护）
  showTimeoutCard: boolean
  // 心跳 tick 时间戳：解析耗时展示随 30s 轮询刷新
  now: number
  busyKey: string | null
  onDispose: (key: DispositionKey) => Promise<void>
  onWaitMore: (candidateId: string) => void
  onSave: (candidate: CandidateView, patch: ResumeScreenCandidatePatchMirror, expectedRevision: number) => Promise<SaveOutcome>
  onConflictRefresh: () => void
}

/**
 * 详情内容（无容器语义）：宽栏 rs-detail-panel 与 <720px Sheet 抽屉两处复用同一渲染，
 * 保证「详情+处置条」跨区域视觉恒定（§4）。容器骨架由上层（workbench）负责。
 */
export function DetailContent(props: DetailProps) {
  const { candidate } = props
  if (!candidate) {
    return (
      <div className="rs-detail-empty">
        <i className="ri-inbox-line" aria-hidden="true" style={{ fontSize: 28 }} />
        从左侧选择候选人查看详情
      </div>
    )
  }
  // A6：选中变化重播详情进入动画（key 变化强制重挂载子树，编辑态随之复位）；
  // rs-detail-stack 自带三行栅格（头/正文/处置条），在宽栏面板与 Sheet 内均撑满
  return (
    <div key={candidate.id} className="rs-detail-stack rs-detail-anim">
      <DetailBody {...props} candidate={candidate} />
    </div>
  )
}

function DetailBody({ candidate, timedOut, showTimeoutCard, now, busyKey, onDispose, onWaitMore, onSave, onConflictRefresh }: DetailProps & { candidate: CandidateView }) {
  // 编辑态与草稿暂存：冲突「查看最新」后草稿保留、可点编辑恢复（§6.5）
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ResumeScreenCandidatePatchMirror>({})
  const [skillDraft, setSkillDraft] = useState('')
  const [conflict, setConflict] = useState<{ open: boolean; message: string }>({ open: false, message: '' })
  const [saving, setSaving] = useState(false)
  // 冲突「查看最新」退出编辑后的暂存提示位：编辑恢复或放弃修改时清除（§6.5 提示「你的修改已暂存」）
  const [stashed, setStashed] = useState(false)

  const isParsing = candidate.status === 'parsing' || candidate.status === 'draft'
  const isFailed = candidate.status === 'failed'
  const editedFields = candidate.humanEditedFields ?? []

  function startEdit() {
    // 恢复暂存草稿或从当前值初始化
    setDraft(
      draft.name !== undefined || draft.matchScore !== undefined || draft.skills?.length
        ? draft
        : {
            name: candidate.name ?? '',
            yearsOfExperience: candidate.yearsOfExperience ?? '',
            education: candidate.education ?? '',
            currentCompany: candidate.currentCompany ?? '',
            skills: candidate.skills ?? [],
            matchScore: candidate.matchScore
          }
    )
    // 进入编辑即恢复草稿，暂存提示随之消失（§6.5）
    setStashed(false)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setStashed(false)
  }

  async function submitSave() {
    if (saving) return
    setSaving(true)
    try {
      const outcome = await onSave(candidate, draft, candidate.revision)
      if (outcome.success) {
        setEditing(false)
        setDraft({})
      } else if (outcome.conflict) {
        // 冲突：对话框防误关，草稿保留在组件态（查看最新不销毁）
        setConflict({ open: true, message: outcome.message })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="rs-detail-head">
        <span className="rs-detail-avatar" style={{ background: statusAccent(candidate.status, timedOut) }} aria-hidden="true">
          {(candidate.name || candidate.sourceFileName || '?').slice(0, 1)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="rs-detail-title">
            <strong>{candidate.name || candidate.sourceFileName || '未命名候选人'}</strong>
            <CandidateBadge status={candidate.status} timedOut={timedOut} />
            {editedFields.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="rs-badge rs-badge-edit">
                    <i className="ri-edit-2-line" aria-hidden="true" />
                    人工修正 {editedFields.length} 项
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {editedFields.map((field) => FIELD_LABELS[field] ?? field).join('、')} 已被人工修正，AI 重新解析不会覆盖
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div className="rs-detail-meta">
            <span>{candidate.yearsOfExperience ? `${candidate.yearsOfExperience} · ` : ''}{candidate.education || ''}{candidate.education ? ' · ' : ''}{candidate.currentCompany || ''}</span>
            <span>创建于 {formatMonthDay(candidate.createdAt) || '—'}</span>
            <span>第 {candidate.attemptCount || 1} 次解析</span>
            {candidate.sourceFileName ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <i className="ri-file-line" aria-hidden="true" />
                    来源 {candidate.sourceFileName}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{candidate.sourceFileName}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </header>

      <div className="rs-detail-body">
        {/* ScrollArea 纵向滚动（§3.8）；内层 pad 容器负责边距（viewport 不吃 root padding） */}
        <ScrollArea className="rs-detail-scroll">
          <div className="rs-detail-pad">
          {/* §6.5 乐观锁冲突「查看最新」后的暂存提示：不销毁草稿，点「编辑」恢复即消失 */}
          {stashed && !editing ? (
            <div className="rs-notice rs-notice-inline tone-amber" role="status" style={{ position: 'static', marginTop: 0 }}>
              <i className="ri-edit-2-line" aria-hidden="true" />
              <div style={{ minWidth: 0 }}>你的修改已暂存，可点击「编辑」恢复</div>
            </div>
          ) : null}
          {isFailed ? (
            // 失败覆盖态：告示卡（红变体 role=alert）+ 原因全文 + 重试；四区块隐藏（§3.5/§6.3）
            <div className="rs-notice rs-notice-inline" role="alert" style={{ position: 'static' }}>
              <i className="ri-error-warning-line" aria-hidden="true" />
              <div style={{ minWidth: 0 }}>
                <div>解析失败：{candidate.failureReason || '未知原因'}</div>
                {(candidate.attemptCount ?? 0) > 2 ? (
                  <div style={{ marginTop: 4, fontSize: 12 }}>多次失败，建议检查模型凭证；若原文抽取字段有误，可用「编辑」人工修正</div>
                ) : null}
                <Button variant="outline" size="sm" style={{ marginTop: 8 }} disabled={busyKey !== null} onClick={() => void onDispose('retry_candidate')}>
                  <i className="ri-restart-line" aria-hidden="true" />
                  重试
                </Button>
              </div>
            </div>
          ) : isParsing ? (
            <ParsingBody candidate={candidate} timedOut={timedOut} showTimeoutCard={showTimeoutCard} now={now} busyKey={busyKey} onDispose={onDispose} onWaitMore={onWaitMore} />
          ) : editing ? (
            <EditForm
              draft={draft}
              skillDraft={skillDraft}
              onSkillDraft={setSkillDraft}
              onField={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
              onAddSkill={() => {
                const skill = skillDraft.trim()
                if (!skill) return
                setDraft((current) => ({ ...current, skills: [...(current.skills ?? []).filter((item) => item !== skill), skill] }))
                setSkillDraft('')
              }}
              onRemoveSkill={(skill) => setDraft((current) => ({ ...current, skills: (current.skills ?? []).filter((item) => item !== skill) }))}
            />
          ) : (
            <ViewBody candidate={candidate} />
          )}
          </div>
        </ScrollArea>
      </div>

      {editing ? (
        <footer className="rs-detail-foot" aria-busy={saving}>
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            取消
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void submitSave()}>
            <i className="ri-save-line" aria-hidden="true" />
            {saving ? '提交中…' : '保存'}
          </Button>
        </footer>
      ) : isParsing || isFailed ? null : (
        <ActionBar
          candidate={candidate}
          timedOut={timedOut}
          busyKey={busyKey}
          onDispose={onDispose}
          onEdit={startEdit}
        />
      )}

      {/* 乐观锁冲突（§6.5）：不提供「强制覆盖」——服务端以 expectedRevision 拒绝，UI 不伪装能力 */}
      <AlertDialog
        open={conflict.open}
        onOpenChange={(open) => {
          if (!open) setConflict({ open: false, message: '' })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>该候选人已被其他人更新</AlertDialogTitle>
            <AlertDialogDescription>为避免覆盖他人修改，本次保存未生效。请先查看最新内容，再决定是否重新修改。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* 组件库类型要求显式 variant/size（包内 Pick 约束）；查看最新=primary 在前（§6.5） */}
            <AlertDialogAction
              variant="default"
              size="sm"
              onClick={() => {
                // 查看最新：刷新该候选人详情、退出编辑态，草稿保留在组件态并给「已暂存」提示（编辑按钮可恢复，§6.5）
                setEditing(false)
                setStashed(true)
                onConflictRefresh()
                setConflict({ open: false, message: '' })
              }}
            >
              查看最新
            </AlertDialogAction>
            <AlertDialogCancel
              variant="ghost"
              size="sm"
              onClick={() => {
                // 放弃修改：关闭并退出编辑态，草稿与暂存提示一并销毁
                setEditing(false)
                setDraft({})
                setStashed(false)
                setConflict({ open: false, message: '' })
              }}
            >
              放弃修改
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * 解析中覆盖态（§3.5/§6.4）：三区块骨架 + 说明 + 已耗时；
 * 超 10 分钟「骨架替换为」琥珀告示卡（「再等等」关闭后 5 分钟回骨架、不再提示）
 */
function ParsingBody({
  candidate,
  showTimeoutCard,
  now,
  busyKey,
  onDispose,
  onWaitMore
}: {
  candidate: CandidateView
  timedOut: boolean
  showTimeoutCard: boolean
  now: number
  busyKey: string | null
  onDispose: (key: DispositionKey) => Promise<void>
  onWaitMore: (candidateId: string) => void
}) {
  return (
    <div>
      {showTimeoutCard ? (
        <div className="rs-notice rs-notice-inline tone-amber" role="alert" style={{ position: 'static', marginTop: 0 }}>
          <i className="ri-timer-line" aria-hidden="true" />
          <div>
            <div>该简历解析已超过 10 分钟，系统会自动重投；若仍未完成，可点击重试。</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button variant="outline" size="sm" disabled={busyKey !== null} onClick={() => void onDispose('retry_candidate')}>
                <i className="ri-restart-line" aria-hidden="true" />
                重试
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onWaitMore(candidate.id)}>
                再等等
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // 未超时：区块骨架（超时卡出现时按 §6.4 替换骨架）
        <div>
          <div className="rs-section">
            <div className="rs-section-title">抽取字段</div>
            <div className="rs-sk-stack" aria-hidden="true">
              <Skeleton className="rs-sk-line rs-sk-third" />
              <Skeleton className="rs-sk-line rs-sk-half" />
              <Skeleton className="rs-sk-line rs-sk-two-thirds" />
            </div>
          </div>
          <div className="rs-section">
            <div className="rs-section-title">匹配评分</div>
            <div className="rs-sk-score-row" aria-hidden="true">
              <Skeleton className="rs-sk-score" />
              <Skeleton className="rs-sk-bar" />
            </div>
          </div>
          <div className="rs-section">
            <div className="rs-section-title">命中点 / 风险点</div>
            <div className="rs-sk-pill-row" aria-hidden="true">
              <Skeleton className="rs-sk-pill" />
              <Skeleton className="rs-sk-pill rs-sk-pill-sm" />
            </div>
          </div>
        </div>
      )}
      <div style={{ color: 'var(--rs-muted)', fontSize: 12 }}>
        <span className={`rs-badge ${showTimeoutCard ? 'tone-amber' : 'tone-blue'}`} style={{ marginRight: 6 }}>
          {showTimeoutCard ? <i className="ri-timer-line" aria-hidden="true" /> : <i className="ri-loader-4-line rs-spin" aria-hidden="true" />}
          {showTimeoutCard ? '解析超时' : 'AI 正在解析该简历…'}
        </span>
        已耗时 {elapsedLabel(candidate.updatedAt || candidate.createdAt, now) || '—'}
      </div>
    </div>
  )
}

// 浏览态四区块（§3.5 正文）：抽取字段 → 匹配评分 → 命中点 → 风险点
function ViewBody({ candidate }: { candidate: CandidateView }) {
  const [reasonExpanded, setReasonExpanded] = useState(false)
  const tier = scoreTier(candidate.matchScore)
  const hasScore = candidate.matchScore !== undefined && candidate.matchScore !== null
  const editedFields = candidate.humanEditedFields ?? []
  return (
    <>
      <section className="rs-section">
        <div className="rs-section-title">抽取字段</div>
        <div className="rs-fields">
          <Field label="姓名" fieldKey="name" value={candidate.name} editedFields={editedFields} />
          <Field label="年限" fieldKey="yearsOfExperience" value={candidate.yearsOfExperience} editedFields={editedFields} />
          <Field label="学历" fieldKey="education" value={candidate.education} editedFields={editedFields} />
          <Field label="当前公司" fieldKey="currentCompany" value={candidate.currentCompany} editedFields={editedFields} />
          <div className="rs-field" style={{ gridColumn: '1 / -1' }}>
            <span>技能</span>
            <div className="rs-chip-row">
              {(candidate.skills ?? []).length ? (
                (candidate.skills ?? []).map((skill) => <SkillChip key={skill} skill={skill} />)
              ) : (
                <strong style={{ fontWeight: 650, color: 'var(--rs-text)' }}>—</strong>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rs-section">
        <div className="rs-section-title">匹配评分</div>
        {hasScore ? (
          <>
            <div className="rs-score-big">
              <strong style={{ color: tier === 'red' ? 'var(--rs-red)' : tier === 'amber' ? 'var(--rs-amber)' : 'var(--rs-blue)' }}>{candidate.matchScore}</strong>
              <span>/100</span>
            </div>
            {/* 评分 6px Progress 细条，分档色同列表（§3.5/§3.8） */}
            <Progress
              value={Math.max(0, Math.min(100, candidate.matchScore ?? 0))}
              className={`rs-score-detail${tier === 'amber' ? ' tier-amber' : tier === 'red' ? ' tier-red' : ''}`}
              aria-label={`匹配分 ${candidate.matchScore ?? 0}`}
            />
          </>
        ) : (
          <div style={{ color: 'var(--rs-soft)', fontSize: 12 }}>暂无评分（等待 AI 解析回填）</div>
        )}
        {candidate.matchReason ? (
          // 评分理由最多 8 行折叠 + 展开（§3.5/§3.8 Collapsible；hidden 关闭态保留 clamp 预览故 forceMount）
          <Collapsible open={reasonExpanded} onOpenChange={setReasonExpanded} style={{ marginTop: 10 }}>
            <CollapsibleContent forceMount hidden={false}>
              <div className={`rs-reason${reasonExpanded ? '' : ' is-collapsed'}`}>{candidate.matchReason}</div>
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
              <button type="button" className="rs-expand">
                {reasonExpanded ? '收起' : '展开'}
              </button>
            </CollapsibleTrigger>
          </Collapsible>
        ) : null}
      </section>

      <section className="rs-section">
        <div className="rs-section-title">命中点</div>
        <div className="rs-hit">
          {(candidate.hitPoints ?? []).length ? (
            (candidate.hitPoints ?? []).map((point, index) => (
              <span key={`${point}-${index}`} className="hit-good">
                <i className="ri-checkbox-circle-line" aria-hidden="true" />
                {point}
              </span>
            ))
          ) : (
            <span style={{ color: 'var(--rs-soft)', fontSize: 12 }}>—</span>
          )}
        </div>
      </section>

      <section className="rs-section">
        <div className="rs-section-title">风险点</div>
        <div className="rs-hit">
          {(candidate.riskPoints ?? []).length ? (
            (candidate.riskPoints ?? []).map((point, index) => (
              <span key={`${point}-${index}`} className="hit-risk">
                <i className="ri-error-warning-line" aria-hidden="true" />
                {point}
              </span>
            ))
          ) : (
            <span style={{ color: 'var(--rs-soft)', fontSize: 12 }}>未识别到风险</span>
          )}
        </div>
      </section>
    </>
  )
}

// 抽取字段行：被修正的字段 label 旁挂 12px 小徽标（§3.5 人工修正标记行内化）
function Field({ label, fieldKey, value, editedFields }: { label: string; fieldKey: string; value: string | undefined; editedFields: string[] }) {
  return (
    <div className="rs-field">
      <span>
        {label}
        {editedFields.includes(fieldKey) ? (
          <i className="ri-edit-2-line" title="已人工修正" style={{ fontSize: 10, marginLeft: 4, color: 'var(--rs-blue)' }} aria-label="已人工修正" />
        ) : null}
      </span>
      <strong>{value || '—'}</strong>
    </div>
  )
}

function SkillChip({ skill }: { skill: string }) {
  return <span className="rs-chip">{skill}</span>
}

interface EditFormProps {
  draft: ResumeScreenCandidatePatchMirror
  skillDraft: string
  onSkillDraft: (value: string) => void
  onField: (key: keyof ResumeScreenCandidatePatchMirror, value: unknown) => void
  onAddSkill: () => void
  onRemoveSkill: (skill: string) => void
}

// 编辑态表单（§3.5：文本/数值/长文本；技能 tag 输入；label 带说明）
function EditForm({ draft, skillDraft, onSkillDraft, onField, onAddSkill, onRemoveSkill }: EditFormProps) {
  const scoreInvalid = draft.matchScore !== undefined && (Number.isNaN(draft.matchScore) || draft.matchScore < 0 || draft.matchScore > 100)
  return (
    <div className="rs-form">
      <label className="rs-form-field">
        <span>
          姓名<small>文本</small>
        </span>
        <Input value={draft.name ?? ''} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onField('name', event.currentTarget.value)} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <label className="rs-form-field">
          <span>
            年限<small>如 5年</small>
          </span>
          <Input value={draft.yearsOfExperience ?? ''} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onField('yearsOfExperience', event.currentTarget.value)} />
        </label>
        <label className="rs-form-field">
          <span>学历</span>
          <Input value={draft.education ?? ''} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onField('education', event.currentTarget.value)} />
        </label>
      </div>
      <label className="rs-form-field">
        <span>当前公司</span>
        <Input value={draft.currentCompany ?? ''} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onField('currentCompany', event.currentTarget.value)} />
      </label>
      <label className="rs-form-field">
        <span>
          技能<small>输入后 Enter 或点「添加」</small>
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
          <Input
            value={skillDraft}
            placeholder="如 React"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onSkillDraft(event.currentTarget.value)}
            onKeyDown={(event: React.KeyboardEvent) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onAddSkill()
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={onAddSkill}>
            添加
          </Button>
        </div>
        <div className="rs-chip-row">
          {(draft.skills ?? []).map((skill) => (
            <span key={skill} className="rs-chip rs-chip-edit">
              {skill}
              <button type="button" aria-label={`删除技能 ${skill}`} onClick={() => onRemoveSkill(skill)}>
                ×
              </button>
            </span>
          ))}
        </div>
      </label>
      <label className="rs-form-field">
        <span>
          匹配分<small>0–100</small>
        </span>
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={draft.matchScore ?? ''}
          aria-invalid={scoreInvalid}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const raw = event.currentTarget.value
            onField('matchScore', raw === '' ? undefined : Number(raw))
          }}
        />
        {scoreInvalid ? (
          <span className="rs-form-error" role="alert">
            匹配分需为 0–100 的数字
          </span>
        ) : null}
      </label>
      <div style={{ fontSize: 12, color: 'var(--rs-soft)' }}>{HUMAN_EDIT_NOTE}</div>
    </div>
  )
}

