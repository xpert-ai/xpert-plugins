import * as React from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  LoaderCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
import type { AnalysisDetail } from '../../../types.js'
import { CandidateAvatar, ContactLine, FlowSteps, SectionHeading } from './ui.js'

export function ProcessingView({
  analysis,
  busy,
  onRetry,
  onRefresh,
  onNew
}: {
  analysis: AnalysisDetail
  busy: boolean
  onRetry: () => void
  onRefresh: () => void
  onNew: () => void
}) {
  return (
    <div className="rm-detail-stack">
      <FlowSteps status={analysis.status} />
      <section className="rm-processing-card">
        <div className="rm-processing-visual" aria-hidden="true">
          <span className="rm-orbit rm-orbit-one" />
          <span className="rm-orbit rm-orbit-two" />
          <span className="rm-orbit-core"><Sparkles /></span>
        </div>
        <div className="rm-processing-copy">
          <span className="rm-eyebrow"><Clock3 /> 智能分析进行中</span>
          <h2>正在读懂岗位，也在读懂这份简历</h2>
          <p>
            智能助理正在读取岗位说明与简历，逐项比对专业技能、工作经验、行业领域和教育背景。
            结果写入工作台后，会先进入“待人工确认”，不会自动改变候选人状态。
          </p>
          <div className="rm-progress-steps">
            <span className="is-done"><Check /> 材料已保存</span>
            <span className="is-active"><LoaderCircle className="rm-spin" /> 四维匹配分析</span>
            <span>等待结果写入</span>
          </div>
          <div className="rm-processing-actions">
            <Button variant="outline" className="rm-header-btn" onClick={onRefresh} disabled={busy}>
              <RefreshCw />
              刷新结果
            </Button>
            <Button className="rm-primary-button" onClick={onRetry} disabled={busy}>
              {busy ? <LoaderCircle className="rm-spin" /> : <Sparkles />}
              重新发起分析
            </Button>
          </div>
          <p className="rm-fineprint">
            通常需要 20 到 60 秒。重新发起会复用当前记录并生成新轮次，不会重复创建分析。
          </p>
        </div>
      </section>
      <MaterialPreview analysis={analysis} />
      <div className="rm-processing-footnote">
        <span>暂时没有结果？</span>
        <button type="button" onClick={onNew}>先新建另一份分析<ArrowRight /></button>
      </div>
    </div>
  )
}

export function FailureView({
  analysis,
  busy,
  onRetry,
  onNew
}: {
  analysis: AnalysisDetail
  busy: boolean
  onRetry: () => void
  onNew: () => void
}) {
  return (
    <div className="rm-detail-stack">
      <FlowSteps status={analysis.status} />
      <section className="rm-failure-card">
        <div className="rm-failure-icon"><CircleAlert /></div>
        <div>
          <span className="rm-eyebrow is-red">本轮分析未完成</span>
          <h2>没有拿到可靠的匹配结论</h2>
          <p>
            本轮未形成可复核的结论。已有记录和材料仍然保留，重新分析会复用这条记录，
            不会产生重复结果，也不会覆盖上一次的人工结论。
          </p>
          <div className="rm-failure-reason">
            <strong>失败原因</strong>
            <span>{analysis.errorMessage || '模型或网络暂时不可用，请稍后重试。'}</span>
          </div>
          <div className="rm-processing-actions">
            <Button className="rm-primary-button" onClick={onRetry} disabled={busy}>
              {busy ? <LoaderCircle className="rm-spin" /> : <RefreshCw />}
              使用同一记录重新分析
            </Button>
            <Button variant="outline" className="rm-header-btn" onClick={onNew}>
              新建另一份分析
            </Button>
          </div>
          <p className="rm-fineprint">当前为第 {analysis.attempt} 轮分析。重试后，旧轮次的迟到结果会被拒绝。</p>
        </div>
      </section>
      <MaterialPreview analysis={analysis} />
    </div>
  )
}

function MaterialPreview({ analysis }: { analysis: AnalysisDetail }) {
  return (
    <section className="rm-card rm-material-card">
      <SectionHeading icon={<FileText />} title="本轮分析材料" extra={<span className="rm-muted">只读快照</span>} />
      <div className="rm-material-grid">
        <div className="rm-material-person">
          <CandidateAvatar name={analysis.candidateName} size={44} />
          <div>
            <strong>{analysis.candidateName}</strong>
            <span>{analysis.candidateTitle || '职位未填写'}{analysis.candidateYears ? ` · ${analysis.candidateYears} 年经验` : ''}</span>
          </div>
        </div>
        <div className="rm-material-contacts">
          {analysis.candidateCity && <ContactLine icon="location" text={analysis.candidateCity} />}
          {analysis.candidatePhone && <ContactLine icon="phone" text={analysis.candidatePhone} />}
        </div>
      </div>
      <details className="rm-details">
        <summary>
          查看岗位说明与简历原文
          <ChevronDown />
        </summary>
        <div className="rm-material-texts">
          <div>
            <h4>岗位说明</h4>
            <pre>{analysis.jobText}</pre>
          </div>
          <div>
            <h4>简历内容</h4>
            <pre>{analysis.resumeText}</pre>
          </div>
        </div>
      </details>
    </section>
  )
}
