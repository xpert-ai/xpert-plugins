import React, { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import { Button, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { action, type Host } from './bridge'
import { errorMessage, i18n, platformText } from './i18n'
import { reviewPipelineCatalogSchema, reviewPipelineSetupSchema, savedReviewPipelinesSchema,
  type ReviewPipelineCatalog, type ReviewPipelineChoice, type ReviewPipelineSetup, type ReviewSource } from '../../../src/pipeline/setup-contract'
import type { PipelineTarget } from '../../../src/automation-contract'

/** Keep one configure request across retries; changing scope or values starts a new immutable configuration. */
export function usePipelineConfiguration(host: Host | null, sourceKind: ReviewSource) {
  const pending = useRef<{ key: string; requestId: string; target?: PipelineTarget } | null>(null)
  return async (choice: ReviewPipelineChoice): Promise<PipelineTarget> => {
    if (choice.kind === 'saved') return { projectId: choice.projectId, bindingId: choice.bindingId }
    const projectId = host?.runtimeScope?.projectId
    if (!projectId) throw new Error('project_required')
    const key = JSON.stringify([host?.scopeRevision, projectId, sourceKind, choice.setup])
    if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() }
    const request = pending.current
    if (!request.target) request.target = z.object({ projectId: z.string().uuid(), bindingId: z.string().uuid() }).parse(
      await action('pipeline.configure', { ...choice.setup, sourceKind, requestId: request.requestId }))
    return request.target
  }
}

export function PipelineSetup({ host, sourceKind, initialTarget, disabled, onChange }: {
  host: Host | null; sourceKind: ReviewSource; initialTarget?: PipelineTarget | null; disabled: boolean;
  onChange: (choice: ReviewPipelineChoice | null) => void
}) {
  const { t, locale } = i18n(host?.locale), fieldId = useId(), projectId = host?.runtimeScope?.projectId
  const [mode, setMode] = useState<'current' | 'template' | 'saved'>(initialTarget ? 'current' : 'template')
  const [catalog, setCatalog] = useState<ReviewPipelineCatalog | null>(null), [setup, setSetup] = useState<ReviewPipelineSetup | null>(null)
  const [saved, setSaved] = useState<z.infer<typeof savedReviewPipelinesSchema>['items']>([]), [selected, setSelected] = useState('')
  const [next, setNext] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const template = catalog?.templates.find(item => item.templateRef === setup?.templateRef && item.contributionKey === setup.contributionKey)
  const checks = setup?.parameters.requiredChecks.map(value => value.trim()).filter(Boolean) ?? []
  const invalidChecks = checks.length > 100 || checks.some(value => value.length > 200)
  useEffect(() => {
    let active = true
    setError(''); setCatalog(null); setSetup(null); setSaved([]); setSelected(''); setNext(null)
    if (mode === 'current' || !projectId) { setBusy(false); return }
    setBusy(true)
    const read = mode === 'template' ? action('pipeline.catalog', { sourceKind }) : action('pipeline.configurations', {})
    void read.then(value => {
      if (!active) return
      if (mode === 'template') {
        const result = reviewPipelineCatalogSchema.parse(value)
        setCatalog(result)
        const first = result.templates[0]
        if (first) setSetup({ contributionKey: first.contributionKey, templateRef: first.templateRef,
          assistants: Object.fromEntries(first.assistantSlots.map(slot => [slot.slot, result.defaultAssistantId ?? ''])), parameters: first.parameters })
      } else {
        const page = savedReviewPipelinesSchema.parse(value)
        setSaved(page.items.filter(item => item.sourceKind === sourceKind)); setNext(page.next)
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'operation_failed') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [projectId, host?.scopeRevision, sourceKind, mode, reload])
  useEffect(() => {
    if (mode === 'current' && initialTarget) onChange({ kind: 'saved', ...initialTarget })
    else if (!projectId || busy || error) onChange(null)
    else if (mode === 'saved') onChange(selected ? { kind: 'saved', projectId, bindingId: selected } : null)
    else {
      const parsed = reviewPipelineSetupSchema.safeParse(setup && { ...setup, parameters: { ...setup.parameters,
        requiredChecks: setup.parameters.requiredChecks.map(value => value.trim()).filter(Boolean) } })
      onChange(parsed.success ? { kind: 'template', setup: parsed.data } : null)
    }
  }, [mode, initialTarget, projectId, busy, error, selected, setup, onChange])
  const switchTemplate = (ref: string) => {
    const item = catalog?.templates.find(item => item.templateRef === ref)
    if (!item) return
    setSetup({ contributionKey: item.contributionKey, templateRef: item.templateRef, parameters: item.parameters,
      assistants: Object.fromEntries(item.assistantSlots.map(slot => [slot.slot, setup?.assistants[slot.slot] || catalog?.defaultAssistantId || ''])) })
  }
  const updateParameters = (parameters: Partial<ReviewPipelineSetup['parameters']>) => setSetup(value => value ? { ...value, parameters: { ...value.parameters, ...parameters } } : value)
  return <fieldset className="min-w-0 space-y-4" disabled={disabled}>
    {mode === 'current' && initialTarget ? <div className="space-y-2">
      <p className="text-sm font-medium">{t('keepCurrentPipeline')}</p>
      <p className="text-xs text-muted-foreground">{t(initialTarget.projectId === projectId ? 'keepCurrentPipelineHelp' : 'differentProjectBinding')}</p>
    </div> : <>
      {!projectId && <p role="status" className="text-sm text-muted-foreground">{t('chooseProjectFirst')}</p>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>{t('loadingPipelineOptions')}</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{errorMessage(error, locale)}</p><Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>{t('reload')}</Button></div>}
      {mode === 'template' && catalog && <>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${fieldId}-template`}>{t('reviewTemplate')}</label>
          <Select value={setup?.templateRef ?? ''} disabled={disabled || busy} onValueChange={switchTemplate}>
            <SelectTrigger id={`${fieldId}-template`}><SelectValue placeholder={t('chooseReviewTemplate')}/></SelectTrigger>
            <SelectContent>{catalog.templates.map(item => <SelectItem key={item.templateRef} value={item.templateRef}>{item.title} · {item.version}</SelectItem>)}</SelectContent>
          </Select>
          {template && <p className="text-xs leading-5 text-muted-foreground">{platformText(template.description, locale)}</p>}
          {!catalog.templates.length && <p role="status" className="text-sm text-muted-foreground">{t('noReviewTemplates')}</p>}
        </div>
        {template && setup && <>
          <div className="grid gap-3 sm:grid-cols-2">{template.assistantSlots.map(slot => <div key={slot.slot} className="min-w-0 space-y-2">
            <label className="text-sm" htmlFor={`${fieldId}-${slot.slot}`}>{platformText(slot.label, locale)}</label>
            <Select value={setup.assistants[slot.slot] ?? ''} disabled={disabled || busy} onValueChange={id => setSetup(value => value ? { ...value, assistants: { ...value.assistants, [slot.slot]: id } } : value)}>
              <SelectTrigger id={`${fieldId}-${slot.slot}`}><SelectValue placeholder={t('chooseReviewAssistant')}/></SelectTrigger>
              <SelectContent>{catalog.assistants.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.publishedVersion}</SelectItem>)}</SelectContent>
            </Select>
          </div>)}</div>
          {!catalog.assistants.length && <p role="status" className="text-sm text-muted-foreground">{t('noReviewAssistants')}</p>}
          <Collapsible className="border-t pt-3"><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="gap-2"><ChevronDown className="size-4"/>{t('reviewParameters')}</Button></CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={setup.parameters.requireChecks} onCheckedChange={checked => updateParameters({ requireChecks: checked === true })}/>{t('reviewRequireChecks')}</label>
              <div className="space-y-2"><label className="text-sm" htmlFor={`${fieldId}-checks`}>{t('reviewRequiredChecks')}</label>
                <Textarea id={`${fieldId}-checks`} rows={3} aria-invalid={invalidChecks} aria-describedby={`${fieldId}-checks-help`} value={setup.parameters.requiredChecks.join('\n')} onChange={event => updateParameters({ requiredChecks: event.target.value.split('\n') })} onBlur={() => updateParameters({ requiredChecks: checks })}/>
                <p id={`${fieldId}-checks-help`} className="text-xs text-muted-foreground">{t('reviewRequiredChecksHelp')}</p>
                {invalidChecks && <p role="alert" className="text-xs text-destructive">{t('reviewChecksLimit')}</p>}
              </div>
              <fieldset className="space-y-2"><legend className="text-sm">{t('reviewBlockingPriorities')}</legend><div className="flex flex-wrap gap-4">{(['P0', 'P1', 'P2', 'P3'] as const).map(priority => <label key={priority} className="flex items-center gap-2 text-sm"><Checkbox checked={setup.parameters.blockingPriorities.includes(priority)} onCheckedChange={checked => updateParameters({ blockingPriorities: checked ? [...setup.parameters.blockingPriorities, priority] : setup.parameters.blockingPriorities.filter(value => value !== priority) })}/>{priority}</label>)}</div>
                {!setup.parameters.blockingPriorities.length && <p role="alert" className="text-xs text-destructive">{t('reviewPriorityRequired')}</p>}
              </fieldset>
            </CollapsibleContent>
          </Collapsible>
        </>}
      </>}
      {mode === 'saved' && !busy && !error && projectId && <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${fieldId}-saved`}>{t('chooseSavedPipeline')}</label>
        <Select value={selected} disabled={disabled} onValueChange={setSelected}><SelectTrigger id={`${fieldId}-saved`}><SelectValue placeholder={t('chooseSavedPipeline')}/></SelectTrigger>
          <SelectContent>{saved.map(item => <SelectItem key={item.id} value={item.id}>{item.title} · {item.version} · {new Date(item.createdAt).toLocaleString(locale)}</SelectItem>)}</SelectContent>
        </Select>
        {!saved.length && <p role="status" className="text-sm text-muted-foreground">{t('noSavedReviewPipelines')}</p>}
        {next && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => {
          setBusy(true)
          void action('pipeline.configurations', { after: next }).then(value => { const page = savedReviewPipelinesSchema.parse(value); setSaved(items => [...items, ...page.items.filter(item => item.sourceKind === sourceKind)]); setNext(page.next) })
            .catch(e => setError(e instanceof Error ? e.message : 'operation_failed')).finally(() => setBusy(false))
        }}>{t('loadMorePipelines')}</Button>}
      </div>}
    </>}
    <div className="flex flex-wrap gap-2">
      {mode !== 'template' && <Button variant="link" size="sm" disabled={disabled || !projectId} onClick={() => setMode('template')}>{t(mode === 'current' ? 'changeReviewTemplate' : 'chooseReviewTemplate')}</Button>}
      {mode !== 'saved' && <Button variant="link" size="sm" disabled={disabled || !projectId} onClick={() => setMode('saved')}>{t('reuseReviewConfiguration')}</Button>}
      {mode !== 'current' && initialTarget && <Button variant="link" size="sm" disabled={disabled} onClick={() => setMode('current')}>{t('keepCurrentPipeline')}</Button>}
    </div>
  </fieldset>
}
