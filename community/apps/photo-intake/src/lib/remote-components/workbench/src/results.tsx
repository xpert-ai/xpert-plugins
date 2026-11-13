import { useEffect, useState } from 'react'
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Label,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { useLocalizedMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { ASK_ASSISTANT_COMMAND } from '../../../domain/case'
import {
  currentReview, evaluationMetrics, latestAttempt, MAX_ATTEMPTS, VARIANTS, verdictSchema
} from '../../../domain/evaluation'
import type { EvaluationAttempt, EvaluationRunDetail, Verdict } from '../../../domain/evaluation'
import { executeAction, invokeClientCommand, requestData } from './bridge'
import { Choice } from './choices'
import { parseWorkbenchData } from './data'
import type { CategoryView } from './data'
import { i18n } from './i18n'

const verdictOptions = () => ['a', 'b', 'tie', 'neither'].map(value => ({
  value, label: i18n.t(`verdict.${verdictSchema.parse(value)}`)
}))
const elapsed = (ms: number | null) => ms === null ? i18n.t('common.unavailable') : i18n.t('common.seconds', {
  value: i18n.number(ms / 1000, { maximumFractionDigits: 2 })
})
const categoryLabel = (categories: CategoryView[], id: string) =>
  i18n.label(categories.find(category => category.id === id)?.label ?? id, id)

function ResultLabel({ attempt, reference, categories }: { attempt: EvaluationAttempt; reference: string; categories: CategoryView[] }) {
  if (attempt.status === 'pending' || attempt.status === 'running') return <span>{i18n.t(`attempt.${attempt.status}`)}</span>
  if (attempt.status === 'failed') return <span>{i18n.t(`evalFailure.${attempt.failureCode ?? 'model_call_failed'}`)}</span>
  return <span>{categoryLabel(categories, attempt.output!.categoryId)} · {i18n.t(
    attempt.output!.categoryId === reference ? 'result.correct' : 'result.incorrect'
  )}</span>
}

function Evidence({ run, sampleId, categories, saved }: {
  run: EvaluationRunDetail; sampleId: string; categories: CategoryView[]; saved: () => Promise<void>
}) {
  const sample = run.snapshot.samples.find(item => item.id === sampleId)!
  const review = currentReview(run, sampleId)
  const [verdict, setVerdict] = useState<Verdict>(review?.verdict ?? 'tie')
  const [note, setNote] = useState(review?.note ?? '')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useLocalizedMessage(i18n)
  useEffect(() => {
    let active = true
    void requestData({ caseId: sampleId }).then(value => {
      if (active) setPhoto(parseWorkbenchData(value).selected?.photoDataUrl ?? null)
    }).catch(() => { if (active) setNotice(i18n.message('detail.noPhoto')) })
    return () => { active = false }
  }, [sampleId, setNotice])
  const save = async () => {
    setBusy(true); setNotice('')
    try {
      await executeAction('review_sample', { runId: run.id, revision: run.revision, sampleId, verdict, note })
      await saved()
      setNotice(i18n.message('review.saved'))
    } catch { setNotice(i18n.message('common.actionFailed')) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      {photo ? <img className="evidence-photo" src={photo} alt={sample.title} /> : null}
      <p>{i18n.t('result.reference', { category: categoryLabel(categories, sample.referenceCategoryId) })}</p>
      {VARIANTS.map(variant => (
        <section key={variant} className="flex flex-col gap-2">
          <h3>{i18n.t(`setup.prompt${variant === 'a' ? 'A' : 'B'}`)}</h3><hr />
          {run.cells.find(cell => cell.sampleId === sampleId && cell.variant === variant)!.attempts.map(attempt => (
            <article key={attempt.id} className="flex flex-col gap-2">
              <p>{i18n.t('result.attempt', { number: attempt.number })} · {i18n.t(`attempt.${attempt.status}`)} · {elapsed(attempt.latencyMs)}</p>
              {attempt.failureCode ? <p>{i18n.t(`evalFailure.${attempt.failureCode}`)}</p> : null}
              {attempt.rawOutput !== null ? <pre className="raw-output">{attempt.rawOutput}</pre> : null}
              {attempt.rawOutputTruncated ? <p>{i18n.t('result.truncated')}</p> : null}
              <p>{attempt.usage ? i18n.t('result.usage', {
                input: i18n.number(attempt.usage.inputTokens), output: i18n.number(attempt.usage.outputTokens),
                source: i18n.t(`usage.${attempt.usage.source}`)
              }) : i18n.t('result.noUsage')}</p>
            </article>
          ))}
        </section>
      ))}
      <Label htmlFor="review-verdict">{i18n.t('review.verdict')}</Label>
      <Choice id="review-verdict" label={i18n.t('review.verdict')} value={verdict} disabled={run.status !== 'completed' || busy}
        onChange={value => setVerdict(verdictSchema.parse(value))} options={verdictOptions()} />
      <Label htmlFor="review-note">{i18n.t('review.note')}</Label>
      <Textarea id="review-note" value={note} maxLength={1000} disabled={run.status !== 'completed' || busy} onChange={event => setNote(event.target.value)} />
      {run.status === 'completed' ? <Button disabled={busy} onClick={() => void save()}>{i18n.t('review.save')}</Button> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {run.reviews.some(item => item.sampleId === sampleId) ? <section className="flex flex-col gap-2">
        <h3>{i18n.t('review.history')}</h3>
        {run.reviews.filter(item => item.sampleId === sampleId).map((item, index) => <p key={index}>
          {i18n.date(item.reviewedAt, { dateStyle: 'medium', timeStyle: 'short' })} · {i18n.t(`verdict.${item.verdict}`)} · {item.note}
        </p>)}
      </section> : null}
    </div>
  )
}

export function RunResults({ run, categories, refresh, back }: {
  run: EvaluationRunDetail; categories: CategoryView[]; refresh: () => Promise<void>; back: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useLocalizedMessage(i18n)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [verdict, setVerdict] = useState<Verdict>('tie')
  const [note, setNote] = useState('')
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const pending = run.cells.filter(cell => latestAttempt(cell).status === 'pending').length
  const retryable = run.cells.filter(cell => latestAttempt(cell).status === 'failed' && cell.attempts.length < MAX_ATTEMPTS).length
  const perform = async (action: 'retry_failures' | 'recover_run' | 'decide_run') => {
    setBusy(true); setNotice('')
    try {
      await executeAction(action, {
        runId: run.id, revision: run.revision, ...(action === 'decide_run' ? { verdict, note } : {})
      })
      await refresh()
    } catch { setNotice(i18n.message('common.actionFailed')) } finally { setBusy(false) }
  }
  const runNext = async () => {
    setBusy(true); setNotice('')
    try {
      await invokeClientCommand(ASK_ASSISTANT_COMMAND, { text: i18n.t('run.message', { id: run.id, count: pending }) })
      setNotice(i18n.message('run.sent'))
      await refresh()
    } catch { setNotice(i18n.message('run.sendFailed', { id: run.id })) } finally { setBusy(false) }
  }
  const visibleSamples = run.snapshot.samples.filter(sample => {
    if (!onlyDifferences) return true
    const a = latestAttempt(run.cells.find(cell => cell.sampleId === sample.id && cell.variant === 'a')!)
    const b = latestAttempt(run.cells.find(cell => cell.sampleId === sample.id && cell.variant === 'b')!)
    return a.status === 'failed' || b.status === 'failed' || a.output?.categoryId !== b.output?.categoryId
      || (a.output !== null && a.output.categoryId !== sample.referenceCategoryId)
      || (b.output !== null && b.output.categoryId !== sample.referenceCategoryId)
  })
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={back}>{i18n.t('run.back')}</Button>
        <Button variant="outline" onClick={() => setConfigOpen(true)}>{i18n.t('run.config')}</Button>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3"><h2>{run.title}</h2><Badge variant="secondary">{i18n.t(`runStatus.${run.status}`)}</Badge></header>
      <p>{i18n.t('run.model', { model: run.snapshot.model?.model ?? i18n.t('run.modelPending') })}</p>
      <p>{i18n.t('run.progress', { completed: run.cells.filter(cell => ['succeeded', 'failed'].includes(latestAttempt(cell).status)).length, total: run.cells.length })}</p>
      <div className="flex flex-wrap gap-3">
        {run.status === 'ready' ? <Button disabled={busy} onClick={() => void runNext()}>{i18n.t('run.start', { count: pending })}</Button> : null}
        {run.status === 'running' ? <p role="status">{i18n.t('run.running')}</p> : null}
        {run.canRecover ? <Button disabled={busy} variant="outline" onClick={() => void perform('recover_run')}>{i18n.t('run.recover')}</Button> : null}
        {run.status === 'completed' && retryable > 0 ? <Button disabled={busy} variant="outline" onClick={() => void perform('retry_failures')}>{i18n.t('run.retry', { count: retryable })}</Button> : null}
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      <section className="flex flex-col gap-3">
        <h3>{i18n.t('metrics.heading')}</h3><hr />
        <Table>
          <TableHeader><TableRow>
            {(['version', 'correct', 'valid', 'failed', 'latency'] as const).map(key => <TableHead key={key}>{i18n.t(`metrics.${key}`)}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>{VARIANTS.map(variant => {
            const metrics = evaluationMetrics(run, variant)
            return <TableRow key={variant}>
              <TableCell>{i18n.t(`version.${variant}`)}</TableCell>
              <TableCell>{i18n.t('metrics.fraction', { value: metrics.correct, total: metrics.total })}</TableCell>
              <TableCell>{i18n.t('metrics.fraction', { value: metrics.valid, total: metrics.total })}</TableCell>
              <TableCell>{i18n.number(metrics.failed)}</TableCell><TableCell>{elapsed(metrics.meanLatencyMs)}</TableCell>
            </TableRow>
          })}</TableBody>
        </Table>
        <p>{i18n.t('metrics.note')}</p>
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>{i18n.t('result.heading')}</h3>
          <Button variant="outline" onClick={() => setOnlyDifferences(value => !value)}>{i18n.t(onlyDifferences ? 'result.showAll' : 'result.showDifferences')}</Button>
        </div><hr />
        {visibleSamples.length === 0 ? <p>{i18n.t('result.noDifferences')}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>{i18n.t('samples.title')}</TableHead>
              <TableHead>{i18n.t('version.a')}</TableHead><TableHead>{i18n.t('version.b')}</TableHead><TableHead>{i18n.t('review.heading')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{visibleSamples.map(sample => <TableRow key={sample.id}>
              <TableCell><Button variant="link" onClick={() => setEvidenceId(sample.id)}>{sample.title}</Button>
                <p>{categoryLabel(categories, sample.referenceCategoryId)}</p></TableCell>
              {VARIANTS.map(variant => <TableCell key={variant}><ResultLabel
                attempt={latestAttempt(run.cells.find(cell => cell.sampleId === sample.id && cell.variant === variant)!)}
                reference={sample.referenceCategoryId} categories={categories} /></TableCell>)}
              <TableCell>{currentReview(run, sample.id)
                ? i18n.t(`verdict.${currentReview(run, sample.id)!.verdict}`) : i18n.t('review.pending')}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h3>{i18n.t('decision.heading')}</h3><hr />
        {run.decision ? <>
          <p>{i18n.t(`verdict.${run.decision.verdict}`)} · {i18n.date(run.decision.decidedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <p className="raw-output">{run.decision.note}</p>
        </> : run.status === 'completed' ? <>
          <p>{i18n.t('decision.hint')}</p>
          <Choice label={i18n.t('decision.choice')} value={verdict} onChange={value => setVerdict(verdictSchema.parse(value))} options={verdictOptions()} disabled={busy} />
          <Label htmlFor="decision-note">{i18n.t('decision.note')}</Label>
          <Textarea id="decision-note" maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
          <div><Button disabled={busy || !note.trim() || ((verdict === 'a' || verdict === 'b') && evaluationMetrics(run, verdict).failed > 0)}
            onClick={() => void perform('decide_run')}>{i18n.t('decision.save')}</Button></div>
        </> : <p>{i18n.t('decision.wait')}</p>}
      </section>
      <Dialog open={configOpen} onOpenChange={setConfigOpen}><DialogContent className="evidence-dialog">
        <DialogHeader><DialogTitle>{i18n.t('run.config')}</DialogTitle><DialogDescription>{i18n.t('run.configHint')}</DialogDescription></DialogHeader>
        {VARIANTS.map(variant => <section key={variant}><h3>{i18n.t(`version.${variant}`)}</h3><pre className="raw-output">{run.snapshot.prompts[variant]}</pre></section>)}
        <p>{i18n.t('run.settings')}</p>
      </DialogContent></Dialog>
      <Dialog open={evidenceId !== null} onOpenChange={open => { if (!open) setEvidenceId(null) }}>
        <DialogContent className="evidence-dialog">
          <DialogHeader><DialogTitle>{run.snapshot.samples.find(sample => sample.id === evidenceId)?.title}</DialogTitle>
            <DialogDescription>{i18n.t('result.evidenceHint')}</DialogDescription></DialogHeader>
          {evidenceId ? <Evidence key={evidenceId} run={run} sampleId={evidenceId} categories={categories} saved={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
