import * as React from 'react'
import { Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Label, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { Sparkles, RotateCcw } from 'lucide-react'
import type { IntakeRecord, Report } from '../shared/contracts'
import { i18n } from './i18n'

const { t } = i18n
export function AnalysisButton({ record, disabled, onAnalyze }: { record: IntakeRecord; disabled: boolean; onAnalyze: () => void }) {
  const active = ['queued', 'running'].includes(record.analysis?.status || '')
  const retry = record.analysis?.status === 'failed'
  return <Button size="sm" onClick={onAnalyze} disabled={disabled || active}>{retry ? <RotateCcw aria-hidden /> : <Sparkles aria-hidden />}{t(active ? 'analysis.running' : retry ? 'analysis.retry' : record.aiResult ? 'analysis.again' : 'analysis.start')}</Button>
}

export function AnalysisPanel({ record, answers, setAnswer, disabled }: { record: IntakeRecord; answers: Record<string, string>; setAnswer: (id: string, text: string) => void; disabled: boolean }) {
  const analysis = record.analysis
  const questions = record.aiResult?.questions || []
  const oldAnswers = record.answers.filter(answer => answer.text.trim() && !questions.some(question => question.id === answer.questionId))
  return <section className="intake-analysis rounded-md border">
    <div className="intake-report-title"><h3 className="text-sm font-semibold">{t('analysis.title')}</h3><Badge variant="secondary">{t(analysis ? `analysis.status.${analysis.status}` : 'analysis.status.none')}</Badge></div>
    <p className="text-xs text-muted-foreground">{t('analysis.scope')}</p>
    {analysis?.status === 'failed' && <p role="alert" className="text-sm text-destructive">{t(`analysis.error.${analysis.errorCode || 'interrupted'}`)}</p>}
    {analysis?.status === 'superseded' && <p className="text-sm text-muted-foreground">{t('analysis.superseded')}</p>}
    {record.aiResult && <p className="text-xs text-muted-foreground">{t('analysis.lastSuccess', { date: i18n.date(record.aiResult.completedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
    {questions.map(question => <div className="intake-question" key={question.id}>
      <Label htmlFor={`answer-${question.id}`}>{question.question}</Label><p className="text-xs text-muted-foreground">{question.reason}</p>
      <Textarea id={`answer-${question.id}`} rows={3} maxLength={4000} placeholder={t('analysis.answerPlaceholder')} value={answers[question.id] || ''} disabled={disabled} onChange={event => setAnswer(question.id, event.target.value)} />
    </div>)}
    {!!questions.length && <p className="text-xs text-muted-foreground">{t('analysis.answerHint')}</p>}
    {record.aiResult && !questions.length && <p className="text-sm text-muted-foreground">{t('analysis.noQuestions')}</p>}
    {!!oldAnswers.length && <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" size="sm">{t('analysis.previousAnswers')}</Button></CollapsibleTrigger><CollapsibleContent><dl className="intake-snapshot-fields">{oldAnswers.map(answer => <div key={answer.questionId}><dt className="text-sm font-medium">{answer.question}</dt><dd className="text-sm whitespace-pre-wrap text-muted-foreground">{answer.text}</dd></div>)}</dl></CollapsibleContent></Collapsible>}
  </section>
}

export function FieldEvidence({ record, field, value }: { record: IntakeRecord; field: keyof Report; value: string }) {
  const suggestion = record.aiResult?.fields.find(item => item.field === field)
  const human = record.protectedFields.includes(field) || value !== record.report[field]
  if (!suggestion) return human ? <span className="text-xs text-muted-foreground">{t('analysis.humanField')}</span> : null
  return <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" size="sm">{t(human ? 'analysis.humanSuggestion' : 'analysis.viewEvidence')}</Button></CollapsibleTrigger><CollapsibleContent className="intake-evidence">
    {human && <p className="text-xs text-muted-foreground">{t('analysis.suggestionKept')}</p>}
    <p className="text-sm whitespace-pre-wrap">{suggestion.value}</p>
    {suggestion.evidence.map((source, index) => <blockquote key={`${source.sourceId}-${index}`} className="text-xs text-muted-foreground">“{source.quote}”</blockquote>)}
    <p className="text-xs text-muted-foreground">{t('analysis.evidenceHint')}</p>
  </CollapsibleContent></Collapsible>
}
