import * as React from 'react'
import { FileText, LoaderCircle, Sparkles, UserRound, WandSparkles } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { EMPTY_FORM, SAMPLE_FORM, type AnalysisFormValues } from './sample.js'

export interface PreparedAnalysisInput {
  candidateName: string
  candidateTitle?: string
  candidateYears?: number
  candidateCity?: string
  candidatePhone?: string
  candidateEmail?: string
  jobTitle: string
  company?: string
  jobCity?: string
  salary?: string
  jobText: string
  resumeText: string
}

export function NewAnalysis({
  busy,
  onStart
}: {
  busy: boolean
  onStart: (input: PreparedAnalysisInput) => Promise<void>
}) {
  const [form, setForm] = React.useState<AnalysisFormValues>(EMPTY_FORM)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitError, setSubmitError] = React.useState('')
  const update = (key: keyof AnalysisFormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
    setSubmitError('')
  }
  const loadSample = () => {
    setForm(SAMPLE_FORM)
    setErrors({})
    setSubmitError('')
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!form.candidateName.trim()) nextErrors.candidateName = '请填写候选人姓名'
    if (!form.jobTitle.trim()) nextErrors.jobTitle = '请填写岗位名称'
    if (form.jobText.trim().length < 40) nextErrors.jobText = '岗位说明至少需要 40 个字'
    if (form.resumeText.trim().length < 40) nextErrors.resumeText = '简历内容至少需要 40 个字'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    try {
      setSubmitError('')
      await onStart({
        candidateName: form.candidateName.trim(),
        candidateTitle: optional(form.candidateTitle),
        candidateYears: form.candidateYears ? Number(form.candidateYears) : undefined,
        candidateCity: optional(form.candidateCity),
        candidatePhone: optional(form.candidatePhone),
        candidateEmail: optional(form.candidateEmail),
        jobTitle: form.jobTitle.trim(),
        company: optional(form.company),
        jobCity: optional(form.jobCity),
        salary: optional(form.salary),
        jobText: form.jobText.trim(),
        resumeText: form.resumeText.trim()
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '分析任务创建失败，请稍后重试。')
    }
  }
  return (
    <form className="rm-new-form" onSubmit={submit}>
      <div className="rm-form-intro">
        <div>
          <h2>准备一份可复核的匹配分析</h2>
          <p>岗位说明越具体，匹配依据越可靠。提交后由智能助理读取材料并生成四维分析，你可以在工作台人工调整最终结论。</p>
        </div>
        <Button type="button" variant="outline" className="rm-header-btn" onClick={loadSample}>
          <WandSparkles />
          载入示例
        </Button>
      </div>

      <div className="rm-form-grid">
        <section className="rm-card rm-form-card">
          <div className="rm-form-card-head">
            <span className="rm-section-icon is-purple"><FileText /></span>
            <div>
              <h3>岗位说明</h3>
              <p>填写真实岗位职责与任职要求，作为判断标尺。</p>
            </div>
          </div>
          <div className="rm-field-grid two">
            <Field label="岗位名称" required error={errors.jobTitle}>
              <Input
                value={form.jobTitle}
                onChange={(event) => update('jobTitle', event.target.value)}
                placeholder="例如：高级后端工程师"
                aria-invalid={Boolean(errors.jobTitle)}
              />
            </Field>
            <Field label="公司名称">
              <Input
                value={form.company}
                onChange={(event) => update('company', event.target.value)}
                placeholder="例如：云帆科技"
              />
            </Field>
            <Field label="工作城市">
              <Input
                value={form.jobCity}
                onChange={(event) => update('jobCity', event.target.value)}
                placeholder="例如：杭州"
              />
            </Field>
            <Field label="薪资范围">
              <Input
                value={form.salary}
                onChange={(event) => update('salary', event.target.value)}
                placeholder="例如：25-40K·14薪"
              />
            </Field>
          </div>
          <Field
            label="岗位说明"
            required
            hint={`${form.jobText.trim().length} 字`}
            error={errors.jobText}
          >
            <Textarea
              className="rm-textarea-lg"
              value={form.jobText}
              onChange={(event) => update('jobText', event.target.value)}
              placeholder="粘贴岗位职责、任职要求、技术栈和业务背景。"
              aria-invalid={Boolean(errors.jobText)}
            />
          </Field>
        </section>

        <section className="rm-card rm-form-card">
          <div className="rm-form-card-head">
            <span className="rm-section-icon is-blue"><UserRound /></span>
            <div>
              <h3>候选人简历</h3>
              <p>保留真实项目、年限和技能描述，避免只粘贴关键词。</p>
            </div>
          </div>
          <div className="rm-field-grid two">
            <Field label="候选人姓名" required error={errors.candidateName}>
              <Input
                value={form.candidateName}
                onChange={(event) => update('candidateName', event.target.value)}
                placeholder="例如：林晓雯"
                aria-invalid={Boolean(errors.candidateName)}
              />
            </Field>
            <Field label="当前职位">
              <Input
                value={form.candidateTitle}
                onChange={(event) => update('candidateTitle', event.target.value)}
                placeholder="例如：高级后端工程师"
              />
            </Field>
            <Field label="工作年限">
              <Input
                value={form.candidateYears}
                onChange={(event) => update('candidateYears', event.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="例如：6"
              />
            </Field>
            <Field label="所在城市">
              <Input
                value={form.candidateCity}
                onChange={(event) => update('candidateCity', event.target.value)}
                placeholder="例如：杭州"
              />
            </Field>
            <Field label="联系电话">
              <Input
                value={form.candidatePhone}
                onChange={(event) => update('candidatePhone', event.target.value)}
                placeholder="选填"
              />
            </Field>
            <Field label="邮箱">
              <Input
                value={form.candidateEmail}
                onChange={(event) => update('candidateEmail', event.target.value)}
                placeholder="选填"
              />
            </Field>
          </div>
          <Field
            label="简历内容"
            required
            hint={`${form.resumeText.trim().length} 字`}
            error={errors.resumeText}
          >
            <Textarea
              className="rm-textarea-lg rm-textarea-resume"
              value={form.resumeText}
              onChange={(event) => update('resumeText', event.target.value)}
              placeholder="粘贴教育背景、工作经历、项目经历和技能。"
              aria-invalid={Boolean(errors.resumeText)}
            />
          </Field>
        </section>
      </div>

      <div className="rm-form-footer">
        <div className="rm-form-note">
          <Sparkles />
          <span>提交后会自动打开智能助理。分析只生成待确认结论，不会自动淘汰候选人。</span>
        </div>
        <div className="rm-form-actions">
          {submitError && <span className="rm-inline-error">{submitError}</span>}
          <Button type="submit" className="rm-primary-button rm-btn-lg" disabled={busy}>
            {busy ? <LoaderCircle className="rm-spin" /> : <Sparkles />}
            {busy ? '正在创建分析任务' : '开始智能分析'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  hint,
  error,
  children
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="rm-field">
      <div className="rm-field-label">
        <Label>
          {label}
          {required && <span className="rm-required">必填</span>}
        </Label>
        {hint && <span>{hint}</span>}
      </div>
      {children}
      {error && <span className="rm-field-error">{error}</span>}
    </div>
  )
}

function optional(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}
