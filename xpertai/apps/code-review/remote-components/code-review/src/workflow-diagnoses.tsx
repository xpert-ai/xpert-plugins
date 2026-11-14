import React, { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Badge, Button } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { data, type Host } from './bridge'
import { workflowRefSchema, workflowResultSchema } from '../../../src/workflow-contract'
import { statusLabel } from './workbench-model'
import { eventI18n, eventMessage } from './event-i18n'

const response = z.object({ items: z.array(z.object({ id: z.string(), ref: workflowRefSchema, status: z.string(),
  reason: z.string().nullable(), result: workflowResultSchema.nullable(), createdAt: z.string() })), total: z.number() })
export function WorkflowDiagnoses({ host }: { host: Host | null }) {
  const t = eventI18n.t
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<z.infer<typeof response> | null>(null), [error, setError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => {
    if (!host) return
    let active = true
    const load = () => void data({ page, parameters: { workflows: true } }).then(value => {
      if (active) { setResult(response.parse(value)); setError(false) }
    }).catch(() => { if (active) setError(true) })
    load(); const timer = setInterval(load, 10000)
    return () => { active = false; clearInterval(timer) }
  }, [host?.scopeRevision, page, refresh])
  return <RemoteI18nProvider i18n={eventI18n}><section className="h-full min-h-0 min-w-0 overflow-auto p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t('diagnoses')}</h2><Button variant="outline" onClick={() => setRefresh(v => v + 1)}>{t('refresh')}</Button></div>
    <div className="my-4 border-t"/>
    {error && <p role="alert">{t('unknownError')}</p>}
    {!result ? <p>{t('loading')}</p> : !result.items.length ? <p className="text-muted-foreground">{t('empty')}</p> : <div className="space-y-4">
      {result.items.map(run => <article key={run.id} className="border-b pb-4">
        <Button variant="ghost" aria-expanded={expanded === run.id} onClick={() => setExpanded(expanded === run.id ? null : run.id)}><span className="flex flex-wrap items-center gap-3">{run.ref.name} · #{run.ref.runId} · {t('attempt', { attempt: run.ref.attempt })}<Badge variant="secondary">{statusLabel(run.status, host?.locale)}</Badge></span></Button>
        {expanded === run.id && <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{eventI18n.date(run.createdAt)} · {run.ref.headSha.slice(0, 12)}</p>
          {run.reason && <p>{eventMessage(run.reason) ?? run.reason}</p>}
          {run.result && <><p className="whitespace-pre-wrap">{run.result.summary}</p>{run.result.findings.map((finding, i) => <article key={i} className="space-y-2 border-t pt-3">
            <p><strong>{t('cause')}</strong> · {finding.cause}</p><p className="whitespace-pre-wrap"><strong>{t('evidence')}</strong> · {finding.evidence}</p><p><strong>{t('suggestion')}</strong> · {finding.suggestion}</p>
            {finding.citations && <div className="space-y-1">
              {finding.citations.steps.map(step => <p key={step.number}><strong>{t('jobStep')}</strong> · {step.number} · {step.name}</p>)}
              {finding.citations.source.map((ref, j) => <p key={j}><strong>{t('sourceLine')}</strong> · {ref.path}#L{ref.line} · <code>{ref.quote}</code></p>)}
              {finding.citations.log.map((ref, j) => <p key={j}><strong>{t('rawLogLine')}</strong> · L{ref.line} · <code>{ref.quote}</code></p>)}
              {finding.citations.limitation && <p>{finding.citations.limitation}</p>}
            </div>}
            {finding.repair && <div className="space-y-1">
              {finding.repair.files.length > 0 && <p><strong>{t('repairFiles')}</strong> · {finding.repair.files.join(', ')}</p>}
              <p><strong>{t('workingDirectory')}</strong> · {finding.repair.workingDirectory}</p>
              {finding.repair.update.length > 0 && <p className="whitespace-pre-wrap"><strong>{t('repairCommands')}</strong> · {finding.repair.update.join('\n')}</p>}
              {finding.repair.verify.length > 0 && <p className="whitespace-pre-wrap"><strong>{t('verifyCommands')}</strong> · {finding.repair.verify.join('\n')}</p>}
              <p><strong>{t('sourceBasis')}</strong> · {finding.repair.basis}</p>
            </div>}
          </article>)}</>}
        </div>}
      </article>)}
    </div>}
    <div className="mt-4 flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('previous')}</Button><Button variant="outline" disabled={!result || page * 20 >= result.total} onClick={() => setPage(p => p + 1)}>{t('next')}</Button></div>
  </section></RemoteI18nProvider>
}
