import React, { useRef, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from '@xpert-ai/plugin-shadcn-ui'
import { action, type Host } from './bridge'
import { openPipeline } from './repository-pipeline'
import { i18n, errorMessage } from './i18n'
import { PipelineSetup, usePipelineConfiguration } from './pipeline-setup'
import type { ReviewPipelineChoice } from '../../../src/pipeline/setup-contract'

export function PipelineStart({ host, review, reload, instructions }: { host: Host | null;
  review: { id: string; revision: number; status: string; ref: { provider: 'github' | 'local_git' }; pipelineProjectId?: string | null; automationRunId?: string | null }; reload: () => void; instructions: string }) {
  const { t, locale } = i18n(host?.locale)
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [choice, setChoice] = useState<ReviewPipelineChoice | null>(null), [error, setError] = useState('')
  const configure = usePipelineConfiguration(host, review.ref.provider)
  const request = useRef<{ key: string; id: string } | null>(null)
  const openTasks = async () => {
    const projectId = review.pipelineProjectId ?? host?.runtimeScope?.projectId
    if (!projectId) throw new Error('project_required')
    await openPipeline(projectId)
  }
  const start = async () => {
    if (!choice || busy) return
    const key = JSON.stringify([host?.scopeRevision, host?.runtimeScope?.projectId, review.id, review.revision, choice, instructions])
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
    setBusy(true); setError('')
    try {
      const target = await configure(choice)
      z.object({ projectId: z.string().uuid(), instanceId: z.string().uuid() }).parse(await action('pipeline.start-saved', {
        id: review.id, revision: review.revision, bindingId: target.bindingId, instructions, requestId: request.current.id }))
      setOpen(false); reload()
    } catch (error) { setError(error instanceof Error ? error.message : 'operation_failed') }
    finally { setBusy(false) }
  }
  if (review.pipelineProjectId) return <div className="mt-3 flex items-center gap-3 text-sm"><span className="text-muted-foreground">{t('reviewManagedByPipeline')}</span>
    <Button size="sm" variant="outline" onClick={() => void openTasks().catch(() => setError('operation_failed'))}>{t('viewReviewPipeline')}</Button>
    {error && <span role="alert">{errorMessage(error, locale)}</span>}</div>
  if (review.status !== 'ready' || review.automationRunId) return null
  if (!host?.runtimeScope?.projectId) return <p className="mt-3 text-sm text-muted-foreground">{t('chooseProjectFirst')}</p>
  return <div className="mt-3">
    <Button variant="outline" size="sm" onClick={() => { setError(''); setChoice(null); setOpen(true) }}>{t('startReview')}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
      <div className="space-y-1 border-b p-4"><DialogTitle>{t('startReviewPipeline')}</DialogTitle>
        <DialogDescription>{t(review.ref.provider === 'local_git' ? 'startLocalTemplateHelp' : 'startReviewTemplateHelp')}</DialogDescription></div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">{error && <p role="alert" className="text-sm text-destructive">{errorMessage(error, locale)}</p>}
        <PipelineSetup key={`${host.scopeRevision}:${host.runtimeScope.projectId}:${review.id}`} host={host} sourceKind={review.ref.provider} disabled={busy} onChange={setChoice}/>
      </div>
      <div className="flex justify-end gap-2 border-t bg-muted/30 p-4"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t('cancel')}</Button>
        <Button disabled={!choice || busy} onClick={() => void start()}>{busy ? t('working') : t('startReview')}</Button></div>
    </DialogContent></Dialog>
  </div>
}
