import * as React from 'react'
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  FileSearch,
  FileText,
  LayoutDashboard,
  MapPin,
  Phone,
  Mail,
  Sparkles,
  UserRound,
  UsersRound
} from 'lucide-react'
import { Badge, Button } from '@xpert-ai/plugin-shadcn-ui'
import type { AnalysisStatus, AnalysisSummary, MatchLevel } from '../../../types.js'
import { STATUS_CLASS, STATUS_LABEL, formatDateTime, formatFullDate, levelClass } from './format.js'

export interface ToastState {
  id: number
  message: string
  tone: 'success' | 'warning' | 'error'
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'rm-brand rm-brand-compact' : 'rm-brand'}>
      <span className="rm-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
          <path d="M10 6.5h8.2L23 11v14.5H10z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M18 6.5V11h5" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M13.5 16.2h6M13.5 20h4.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="22.4" cy="22.4" r="3.9" fill="currentColor" />
          <path d="m20.8 22.4 1.1 1.1 2.1-2.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="rm-brand-text">
        <strong>聘智</strong>
        {!compact && <small>简历智能匹配</small>}
      </span>
    </div>
  )
}

export function AppSidebar({
  items,
  selectedId,
  onSelect,
  onNew
}: {
  items: AnalysisSummary[]
  selectedId?: string
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <aside className="rm-sidebar">
      <BrandMark />
      <Button className="rm-new-button" onClick={onNew}>
        <Sparkles />
        新建分析
      </Button>
      <nav className="rm-nav" aria-label="主导航">
        <button type="button" className="rm-nav-item is-active" onClick={onNew}>
          <LayoutDashboard />
          <span>匹配工作台</span>
          <ChevronRight className="rm-nav-arrow" />
        </button>
        <div className="rm-nav-section">
          <div className="rm-nav-section-title">
            <span>最近分析</span>
            <span className="rm-count">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <div className="rm-nav-empty">还没有分析记录</div>
          ) : (
            <div className="rm-recent-list">
              {items.slice(0, 7).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={
                    item.id === selectedId ? 'rm-recent-item is-active' : 'rm-recent-item'
                  }
                  onClick={() => onSelect(item.id)}
                >
                  <span className="rm-recent-avatar">{item.candidateName.slice(0, 1)}</span>
                  <span className="rm-recent-copy">
                    <strong>{item.candidateName}</strong>
                    <small>{item.jobTitle}</small>
                  </span>
                  <span className="rm-recent-score">
                    {item.status === 'confirmed'
                      ? item.score
                        ? `${item.score}分`
                        : '已确认'
                      : item.status === 'failed'
                        ? '失败'
                        : item.status === 'waiting_ai'
                          ? '分析中'
                          : item.score
                            ? `${item.score}分`
                            : '待确认'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
      <div className="rm-sidebar-footer">
        <div className="rm-user-card">
          <span className="rm-user-avatar">我</span>
          <span>
            <strong>当前用户</strong>
            <small>招聘负责人</small>
          </span>
        </div>
      </div>
    </aside>
  )
}

export function PageHeader({
  candidateName,
  jobTitle,
  company,
  jobCity,
  salary,
  status,
  screen,
  onBack,
  onNew,
  onCopy
}: {
  candidateName?: string
  jobTitle?: string
  company?: string
  jobCity?: string
  salary?: string
  status?: AnalysisStatus
  screen: 'detail' | 'new'
  onBack: () => void
  onNew: () => void
  onCopy: () => void
}) {
  const crumb = screen === 'new' ? '新建分析' : candidateName || '分析详情'
  return (
    <header className="rm-page-header">
      <div className="rm-header-top">
        <div className="rm-breadcrumb" aria-label="面包屑">
          <button type="button" onClick={onBack}>候选人</button>
          <ChevronRight aria-hidden="true" />
          <span>{crumb}</span>
          <ChevronRight aria-hidden="true" />
          <span className="is-current">{screen === 'new' ? '输入材料' : '匹配详情'}</span>
        </div>
        <div className="rm-header-actions">
          {screen === 'detail' && (
            <Button variant="outline" className="rm-header-btn" onClick={onCopy}>
              <Copy />
              复制摘要
            </Button>
          )}
          <Button variant="outline" className="rm-header-btn" onClick={screen === 'new' ? onBack : onNew}>
            {screen === 'new' ? <ArrowLeft /> : <Sparkles />}
            {screen === 'new' ? '返回工作台' : '新建分析'}
          </Button>
        </div>
      </div>
      <div className="rm-title-row">
        <div>
          <h1>{screen === 'new' ? '新建简历分析' : '简历智能分析与岗位匹配'}</h1>
          <div className="rm-title-meta">
            {screen === 'new' ? (
              <span>粘贴岗位说明与简历，智能助理会给出可解释、可复核的匹配依据。</span>
            ) : (
              <>
                <span>岗位：{jobTitle || '待补充'}</span>
                <span className="rm-dot" />
                <span>{company || '未填写公司'}</span>
                {jobCity && (
                  <>
                    <span className="rm-dot" />
                    <span>{jobCity}</span>
                  </>
                )}
                {salary && (
                  <>
                    <span className="rm-dot" />
                    <span>{salary}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {screen === 'detail' && status && (
          <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>
        )}
      </div>
    </header>
  )
}

export function FlowSteps({ status }: { status?: AnalysisStatus }) {
  const stepState = (index: number) => {
    if (!status) return index === 0 ? 'active' : 'pending'
    if (status === 'confirmed') return 'done'
    if (status === 'failed') {
      if (index === 0) return 'done'
      if (index === 1) return 'error'
      return 'pending'
    }
    if (status === 'waiting_ai') return index === 0 ? 'done' : index === 1 ? 'active' : 'pending'
    return index < 2 ? 'done' : index === 2 ? 'active' : 'pending'
  }
  const steps = [
    { title: '输入材料', text: '岗位与简历' },
    { title: '智能分析', text: '提取依据与评分' },
    { title: '人工确认', text: '接受或修改结论' },
    { title: '保存结果', text: '刷新后仍可找回' }
  ]
  return (
    <section className="rm-flow" aria-label="业务流程">
      {steps.map((step, index) => {
        const state = stepState(index)
        return (
          <React.Fragment key={step.title}>
            <div className={`rm-flow-step is-${state}`}>
              <span className="rm-flow-index">
                {state === 'done' ? <Check /> : index === 1 && state === 'error' ? <CircleAlert /> : index + 1}
              </span>
              <span className="rm-flow-copy">
                <strong>{step.title}</strong>
                <small>{step.text}</small>
              </span>
            </div>
            {index < steps.length - 1 && <span className={`rm-flow-line is-${state}`} aria-hidden="true" />}
          </React.Fragment>
        )
      })}
    </section>
  )
}

export function ScoreRing({
  score,
  level,
  size = 146
}: {
  score: number
  level: MatchLevel
  size?: number
}) {
  const radius = 62
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference
  return (
    <div className="rm-score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 148 148" width={size} height={size} role="img" aria-label={`综合匹配度 ${score} 分，${level}`}>
        <defs>
          <linearGradient id="rm-score-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c6cf6" />
            <stop offset="100%" stopColor="#5b5bd6" />
          </linearGradient>
        </defs>
        <circle cx="74" cy="74" r={radius} fill="none" stroke="#eceef6" strokeWidth="11" />
        <circle
          cx="74"
          cy="74"
          r={radius}
          fill="none"
          stroke="url(#rm-score-gradient)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 74 74)"
        />
      </svg>
      <div className="rm-score-center">
        <strong>{score}%</strong>
        <span>{level}</span>
      </div>
    </div>
  )
}

export function ScoreBar({
  label,
  score,
  hint,
  tone = 'purple'
}: {
  label: string
  score: number
  hint?: string
  tone?: 'purple' | 'green' | 'blue' | 'amber'
}) {
  return (
    <div className="rm-score-bar">
      <div className="rm-score-bar-head">
        <span>
          <strong>{label}</strong>
          {hint && <small>{hint}</small>}
        </span>
        <b>{score}%</b>
      </div>
      <div className="rm-bar-track">
        <span className={`rm-bar-fill is-${tone}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>
}

export function LevelBadge({ level }: { level?: MatchLevel }) {
  if (!level) return null
  return <span className={levelClass(level)}>{level}</span>
}

export function CandidateMeta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rm-meta-row">
      <span className="rm-meta-icon">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

export function Toast({
  toast,
  onClose
}: {
  toast: ToastState | null
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onClose, 4200)
    return () => clearTimeout(timer)
  }, [toast, onClose])
  if (!toast) return null
  return (
    <div className={`rm-toast is-${toast.tone}`} role="status">
      {toast.tone === 'success' ? <Check /> : toast.tone === 'warning' ? <Clock3 /> : <CircleAlert />}
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="关闭提示">×</button>
    </div>
  )
}

export function SectionHeading({
  icon,
  title,
  extra
}: {
  icon: React.ReactNode
  title: string
  extra?: React.ReactNode
}) {
  return (
    <div className="rm-section-heading">
      <span className="rm-section-icon">{icon}</span>
      <h3>{title}</h3>
      {extra && <div className="rm-section-extra">{extra}</div>}
    </div>
  )
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rm-empty">
      <div className="rm-empty-art">
        <FileSearch />
      </div>
      <h2>还没有简历分析记录</h2>
      <p>从一份岗位说明和一份简历开始，智能助理会给出可解释的匹配结论，并由你最终确认。</p>
      <Button className="rm-primary-button" onClick={onCreate}>
        <Sparkles />
        新建第一条分析
      </Button>
    </div>
  )
}

export function SkeletonScreen() {
  return (
    <div className="rm-skeleton-layout" aria-label="正在加载工作台">
      <div className="rm-skeleton rm-skeleton-card" />
      <div className="rm-skeleton-main">
        <div className="rm-skeleton rm-skeleton-hero" />
        <div className="rm-skeleton rm-skeleton-table" />
      </div>
      <div className="rm-skeleton rm-skeleton-card" />
    </div>
  )
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 85 ? 'green' : score >= 70 ? 'blue' : 'amber'
  return <span className={`rm-score-pill is-${tone}`}>{score} 分</span>
}

export function MiniDate({ value }: { value?: string }) {
  return <span title={formatFullDate(value)}>{formatDateTime(value)}</span>
}

export function ContactLine({ icon, text }: { icon: 'phone' | 'mail' | 'location'; text: string }) {
  const iconNode = icon === 'phone' ? <Phone /> : icon === 'mail' ? <Mail /> : <MapPin />
  return <CandidateMeta icon={iconNode}>{text}</CandidateMeta>
}

export function CandidateAvatar({ name, size = 52 }: { name: string; size?: number }) {
  return (
    <span className="rm-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name.slice(0, 1)}
    </span>
  )
}

export function JobIcon() {
  return <BriefcaseBusiness />
}

export function UsersIcon() {
  return <UsersRound />
}

export function ResumeIcon() {
  return <FileText />
}

export function UserIcon() {
  return <UserRound />
}
