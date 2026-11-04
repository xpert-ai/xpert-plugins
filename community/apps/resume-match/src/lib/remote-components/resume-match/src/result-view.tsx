import * as React from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Info,
  Layers3,
  LoaderCircle,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Quote,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserCheck
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import type {
  AnalysisDetail,
  HumanDecision,
  MatchResult,
  SkillScore
} from '../../../types.js'
import {
  CandidateAvatar,
  ContactLine,
  FlowSteps,
  LevelBadge,
  ScoreBar,
  ScoreRing,
  SectionHeading
} from './ui.js'
import { formatDateTime, formatFullDate, scoreTone } from './format.js'

const DECISIONS: HumanDecision[] = ['进入面试', '进入人才库', '暂不匹配']

export function ResultView({
  analysis,
  busy,
  onConfirm,
  onRetry,
  onRefresh
}: {
  analysis: AnalysisDetail
  busy: boolean
  onConfirm: (input: { decision: HumanDecision; score: number; conclusion: string }) => Promise<void>
  onRetry: () => void
  onRefresh: () => void
}) {
  const result = analysis.result
  const confirmed = analysis.status === 'confirmed'
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [resumeOpen, setResumeOpen] = React.useState(false)
  const [jobOpen, setJobOpen] = React.useState(false)
  if (!result) return null
  const finalScore = analysis.humanScore ?? result.overallScore
  const finalLevel = analysis.humanScore ? undefined : result.level
  return (
    <div className="rm-detail-stack rm-result-stack">
      <FlowSteps status={analysis.status} />
      {confirmed && (
        <div className="rm-confirmed-banner">
          <span className="rm-confirmed-icon"><BadgeCheck /></span>
          <div>
            <strong>人工结论已保存，刷新页面仍能找到这条结果</strong>
            <span>
              {analysis.humanDecision || '已确认'}
              {analysis.reviewedAt ? ` · 确认于 ${formatFullDate(analysis.reviewedAt)}` : ''}
              {analysis.humanConclusion ? ` · ${analysis.humanConclusion}` : ''}
            </span>
          </div>
          <span className="rm-badge rm-badge-green">已写入工作台</span>
        </div>
      )}
      <div className="rm-result-grid">
        <div className="rm-result-column">
          <CandidateCard analysis={analysis} onOpenResume={() => setResumeOpen(true)} />
          <JobCard analysis={analysis} onOpenJob={() => setJobOpen(true)} />
          <MatchMeta analysis={analysis} />
        </div>

        <div className="rm-result-column rm-center-column">
          <section className="rm-card rm-score-card">
            <div className="rm-score-card-top">
              <div>
                <span className="rm-eyebrow">综合匹配度</span>
                <h2>{finalScore} 分<span className="rm-score-denom"> / 100</span></h2>
              </div>
              <div className="rm-score-badges">
                <LevelBadge level={confirmed ? levelFromScore(finalScore) : result.level} />
                {confirmed && <span className="rm-badge rm-badge-green">人工确认</span>}
              </div>
            </div>
            <div className="rm-score-main">
              <ScoreRing score={finalScore} level={confirmed ? levelFromScore(finalScore) : result.level} />
              <div className="rm-dimension-bars">
                {result.dimensions.map((dimension) => (
                  <ScoreBar
                    key={dimension.key}
                    label={dimension.label}
                    score={dimension.score}
                    hint={dimensionHint(dimension.key)}
                    tone={dimension.key === 'experience' ? 'blue' : dimension.key === 'domain' ? 'green' : 'purple'}
                  />
                ))}
              </div>
            </div>
            <div className="rm-score-note">
              <ShieldCheck />
              <span>评分来自岗位说明与简历原文的语义对照。最终结论以人工确认为准。</span>
            </div>
          </section>

          <section className="rm-card rm-breakdown-card">
            <SectionHeading
              icon={<Layers3 />}
              title="分维度依据"
              extra={<span className="rm-muted">每一项都可回到简历原文核对</span>}
            />
            <div className="rm-breakdown-head">
              <span>维度</span>
              <span>判断依据</span>
              <span>简历证据</span>
              <span>得分</span>
            </div>
            <div className="rm-breakdown-list">
              {result.dimensions.map((dimension) => (
                <div className="rm-breakdown-row" key={dimension.key}>
                  <div className="rm-breakdown-dimension">
                    <span className={`rm-dimension-icon is-${dimension.key}`}>
                      {dimensionIcon(dimension.key)}
                    </span>
                    <span>
                      <strong>{dimension.label}</strong>
                      <small>{dimensionHint(dimension.key)}</small>
                    </span>
                  </div>
                  <p>{dimension.summary}</p>
                  <div className="rm-evidence-tags">
                    {evidenceTags(analysis, dimension.key).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="rm-breakdown-score">
                    <strong className={`is-${scoreTone(dimension.score)}`}>{dimension.score}</strong>
                    <span>分</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="rm-breakdown-foot">
              <Info />
              <span>综合分按专业技能 45%、工作经验 30%、行业领域 20%、教育背景 5% 加权计算。</span>
            </div>
          </section>

          <section className="rm-card rm-insight-card">
            <SectionHeading icon={<Quote />} title="综合判断" />
            <p className="rm-insight-summary">{result.summary}</p>
            <div className="rm-recommendation">
              <Sparkles />
              <div>
                <strong>建议下一步</strong>
                <span>{result.recommendation}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="rm-result-column">
          {confirmed && (
            <section className="rm-card rm-human-card">
              <SectionHeading icon={<UserCheck />} title="人工结论" />
              <div className="rm-human-decision">
                <span className="rm-human-score">{analysis.humanScore ?? result.overallScore}<small>分</small></span>
                <span className="rm-badge rm-badge-green">{analysis.humanDecision}</span>
              </div>
              <p>{analysis.humanConclusion}</p>
              <span className="rm-muted">{formatFullDate(analysis.reviewedAt)} 由当前账号确认</span>
            </section>
          )}

          <section className="rm-card rm-why-card">
            <SectionHeading
              icon={<Target />}
              title="为什么匹配"
              extra={<span className="rm-muted">共 {result.highlights.length} 条</span>}
            />
            <ul className="rm-why-list">
              {result.highlights.map((highlight) => (
                <li key={highlight}>
                  <span className="rm-check"><Check /></span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rm-card rm-skills-card">
            <SectionHeading
              icon={<TrendingUp />}
              title="技能与能力覆盖"
              extra={<span className="rm-muted">对照岗位要求</span>}
            />
            <div className="rm-skill-list">
              {result.matchedSkills.slice(0, 8).map((skill: SkillScore) => (
                <div className="rm-skill" key={skill.name}>
                  <div>
                    <span>{skill.name}</span>
                    <b>{skill.score}%</b>
                  </div>
                  <div className="rm-skill-track">
                    <span style={{ width: `${skill.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {result.missingSkills.length > 0 && (
              <div className="rm-missing">
                <div className="rm-missing-head">
                  <span>待补足</span>
                  <span>{result.missingSkills.length} 项</span>
                </div>
                <div className="rm-missing-tags">
                  {result.missingSkills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rm-card rm-risk-card">
            <SectionHeading
              icon={<AlertTriangle />}
              title="需要人工核实"
              extra={<span className="rm-muted">{result.risks.length} 条</span>}
            />
            {result.risks.length === 0 ? (
              <p className="rm-muted">本轮没有发现需要额外核实的风险，仍建议在面试中确认关键经历。</p>
            ) : (
              <ul className="rm-risk-list">
                {result.risks.map((risk) => (
                  <li key={risk}>
                    <CircleAlert />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="rm-actionbar">
        <div className="rm-actionbar-copy">
          <span className="rm-actionbar-icon"><Sparkles /></span>
          <div>
            <strong>{confirmed ? '人工结论已生效' : '智能建议，等你确认'}</strong>
            <span>
              {confirmed
                ? `${analysis.humanDecision} · ${analysis.humanScore ?? result.overallScore} 分。可以修改人工结论；保存后以最新人工结论为准，智能分析原文保留。`
                : result.recommendation}
            </span>
          </div>
        </div>
        <div className="rm-actionbar-buttons">
          <Button variant="outline" className="rm-header-btn" onClick={onRefresh} disabled={busy}>
            {busy ? <LoaderCircle className="rm-spin" /> : <RefreshCwIcon />}
            刷新
          </Button>
          {!confirmed && (
            <Button variant="outline" className="rm-header-btn" onClick={onRetry} disabled={busy}>
              重新分析
            </Button>
          )}
          <Button
            className="rm-primary-button rm-btn-lg"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
          >
            {confirmed ? <PencilLine /> : <ClipboardCheck />}
            {confirmed ? '修改人工结论' : '确认并保存'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        analysis={analysis}
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onSubmit={async (input) => {
          await onConfirm(input)
          setConfirmOpen(false)
        }}
      />
      <TextDialog
        open={resumeOpen}
        title={`${analysis.candidateName}的完整简历`}
        text={analysis.resumeText}
        onClose={() => setResumeOpen(false)}
      />
      <TextDialog
        open={jobOpen}
        title={`${analysis.jobTitle}的完整岗位说明`}
        text={analysis.jobText}
        onClose={() => setJobOpen(false)}
      />
    </div>
  )
}

function CandidateCard({
  analysis,
  onOpenResume
}: {
  analysis: AnalysisDetail
  onOpenResume: () => void
}) {
  return (
    <section className="rm-card rm-candidate-card">
      <div className="rm-candidate-top">
        <CandidateAvatar name={analysis.candidateName} />
        <div className="rm-candidate-id">
          <div>
            <h2>{analysis.candidateName}</h2>
            <span className="rm-badge rm-badge-green-soft"><CheckCircle2 /> 已解析</span>
          </div>
          <p>
            {analysis.candidateTitle || '职位未填写'}
            {analysis.candidateYears ? ` · ${analysis.candidateYears} 年经验` : ''}
          </p>
          {analysis.candidateCity && <small>{analysis.candidateCity} · 在职，考虑机会</small>}
        </div>
      </div>
      <div className="rm-contact-list">
        {analysis.candidatePhone && <ContactLine icon="phone" text={analysis.candidatePhone} />}
        {analysis.candidateEmail && <ContactLine icon="mail" text={analysis.candidateEmail} />}
        {analysis.candidateCity && <ContactLine icon="location" text={analysis.candidateCity} />}
      </div>
      <Button variant="outline" className="rm-wide-button" onClick={onOpenResume}>
        <FileText />
        查看完整简历
        <ArrowUpRight />
      </Button>
    </section>
  )
}

function JobCard({ analysis, onOpenJob }: { analysis: AnalysisDetail; onOpenJob: () => void }) {
  const lines = analysis.jobText
    .split(/\n+/)
    .map((line) => line.replace(/^[0-9]+[.、]\s*/, '').trim())
    .filter(Boolean)
  const blocks: Array<{ title?: string; items: string[] }> = []
  for (const line of lines) {
    if (isJobHeading(line)) {
      blocks.push({ title: line, items: [] })
    } else {
      if (blocks.length === 0) blocks.push({ items: [] })
      blocks[blocks.length - 1].items.push(line)
      if (blocks.reduce((count, block) => count + block.items.length, 0) >= 6) break
    }
  }
  return (
    <section className="rm-card rm-job-card">
      <SectionHeading icon={<BriefcaseBusiness />} title="岗位说明" />
      <div className="rm-job-title">
        <h3>{analysis.jobTitle}</h3>
        <span>{analysis.company || '公司未填写'}{analysis.jobCity ? ` · ${analysis.jobCity}` : ''}</span>
        {analysis.salary && <strong>{analysis.salary}</strong>}
      </div>
      <div className="rm-job-blocks">
        {blocks.map((block, index) => (
          <div className="rm-job-block" key={`${block.title ?? 'block'}-${index}`}>
            {block.title && <h4>{block.title}</h4>}
            <ul className="rm-job-lines">
              {block.items.slice(0, 4).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" className="rm-text-button" onClick={onOpenJob}>
        查看完整岗位说明
        <ArrowUpRight />
      </button>
    </section>
  )
}

function MatchMeta({ analysis }: { analysis: AnalysisDetail }) {
  return (
    <section className="rm-card rm-match-meta">
      <SectionHeading icon={<Info />} title="分析记录" />
      <dl>
        <div><dt>分析时间</dt><dd>{formatDateTime(analysis.updatedAt)}</dd></div>
        <div><dt>分析方式</dt><dd>平台智能助理</dd></div>
        <div><dt>分析轮次</dt><dd>第 {analysis.attempt} 轮</dd></div>
        <div><dt>记录编号</dt><dd className="rm-mono">{analysis.id.slice(0, 8)}</dd></div>
        <div><dt>当前状态</dt><dd>{analysis.status === 'confirmed' ? '已保存' : '待人工确认'}</dd></div>
      </dl>
    </section>
  )
}

function ConfirmDialog({
  open,
  analysis,
  busy,
  onClose,
  onSubmit
}: {
  open: boolean
  analysis: AnalysisDetail
  busy: boolean
  onClose: () => void
  onSubmit: (input: { decision: HumanDecision; score: number; conclusion: string }) => Promise<void>
}) {
  const [decision, setDecision] = React.useState<HumanDecision>(
    analysis.humanDecision || '进入面试'
  )
  const [score, setScore] = React.useState(String(analysis.humanScore ?? analysis.result?.overallScore ?? 0))
  const [conclusion, setConclusion] = React.useState(
    analysis.humanConclusion || analysis.result?.summary || ''
  )
  const [error, setError] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setDecision(analysis.humanDecision || '进入面试')
    setScore(String(analysis.humanScore ?? analysis.result?.overallScore ?? 0))
    setConclusion(analysis.humanConclusion || analysis.result?.summary || '')
    setError('')
  }, [open, analysis])
  const submit = async () => {
    const numeric = Number(score)
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      setError('人工评分需要在 0 到 100 之间。')
      return
    }
    if (!conclusion.trim()) {
      setError('请写一句人工结论，便于后续回溯。')
      return
    }
    try {
      setSubmitting(true)
      setError('')
      await onSubmit({
        decision,
        score: Math.round(numeric),
        conclusion: conclusion.trim()
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '保存失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="rm-dialog">
        <DialogHeader>
          <DialogTitle>人工确认匹配结论</DialogTitle>
          <DialogDescription>
            智能分析给出 {analysis.result?.overallScore} 分。你可以接受、调整分数，或改写结论后再保存。
          </DialogDescription>
        </DialogHeader>
        <div className="rm-dialog-ai">
          <Sparkles />
          <div>
            <strong>智能建议：{analysis.result?.recommendation}</strong>
            <span>{analysis.result?.summary}</span>
          </div>
        </div>
        <div className="rm-dialog-grid">
          <div className="rm-field">
            <Label>下一步决定</Label>
            <Select value={decision} onValueChange={(value) => setDecision(value as HumanDecision)}>
              <SelectTrigger className="rm-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECISIONS.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rm-field">
            <Label>人工确认分数</Label>
            <div className="rm-score-input">
              <Input
                value={score}
                inputMode="numeric"
                onChange={(event) => setScore(event.target.value.replace(/[^0-9]/g, ''))}
              />
              <span>分</span>
            </div>
          </div>
        </div>
        <div className="rm-field">
          <Label>人工结论</Label>
          <Textarea
            className="rm-textarea-md"
            value={conclusion}
            onChange={(event) => setConclusion(event.target.value)}
            placeholder="写清你的判断依据、后续动作或需要补充的信息。"
          />
        </div>
        {error && <div className="rm-dialog-error"><CircleAlert /> {error}</div>}
        <div className="rm-dialog-note">
          <ShieldCheck />
          保存后会写入工作台，刷新或重新进入仍可找回。智能分析原文不会被覆盖。
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting || busy}>取消</Button>
          <Button className="rm-primary-button" onClick={submit} disabled={submitting || busy}>
            {submitting ? <LoaderCircle className="rm-spin" /> : <Save />}
            {submitting ? '正在保存' : '确认并保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TextDialog({
  open,
  title,
  text,
  onClose
}: {
  open: boolean
  title: string
  text: string
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rm-dialog rm-text-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>以下为分析时使用的原文快照。</DialogDescription>
        </DialogHeader>
        <pre className="rm-full-text">{text}</pre>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RefreshCwIcon() {
  return <RefreshCw />
}

function isJobHeading(line: string) {
  return /^(岗位职责|工作职责|职位描述|任职要求|任职资格|岗位要求|我们希望你|加分项)$/.test(line)
}

function dimensionHint(key: string) {
  if (key === 'skills') return '技术栈与岗位要求'
  if (key === 'experience') return '年限、深度与复杂度'
  if (key === 'domain') return '行业与业务场景'
  return '学历与专业相关性'
}

function dimensionIcon(key: string) {
  if (key === 'skills') return <Target />
  if (key === 'experience') return <BriefcaseBusiness />
  if (key === 'domain') return <Layers3 />
  return <GraduationCap />
}

function evidenceTags(analysis: AnalysisDetail, key: string) {
  const result = analysis.result
  if (!result) return []
  if (key === 'skills') return result.matchedSkills.slice(0, 3).map((skill) => skill.name)
  if (key === 'experience') {
    return [
      analysis.candidateYears ? `${analysis.candidateYears} 年经验` : '工作经历',
      '项目深度'
    ]
  }
  if (key === 'domain') {
    return [analysis.company || '行业经历', '业务场景']
  }
  return ['教育背景', '专业相关性']
}

function levelFromScore(score: number): MatchResult['level'] {
  if (score >= 85) return '高度匹配'
  if (score >= 70) return '较好匹配'
  if (score >= 55) return '基本匹配'
  return '匹配度较低'
}
