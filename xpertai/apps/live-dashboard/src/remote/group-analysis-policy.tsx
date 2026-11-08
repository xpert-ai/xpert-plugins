import * as React from 'react'
import { z } from 'zod/v3'
import type { ResourceAnalysisPolicy, ResourceAnalysisFilter } from '@xpert-ai/contracts'
import { isResourceAnalysisFilterValue, resourceAnalysisPolicySchema } from '@xpert-ai/plugin-sdk/analytics'
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/plugin-shadcn-ui'
import { requestHost, captureViewScope } from './bridge'
import type { messages } from './i18n'

const optionsSchema = z.object({ success: z.literal(true), data: z.array(z.object({
  key: z.string(), title: z.string(), canShare: z.boolean(), fields: z.array(z.object({
    id: z.string(), label: z.string(), logicalType: z.enum(['string', 'boolean', 'int64', 'float64', 'decimal', 'date', 'timestamp'])
  }))
})) })
type Dataset = z.infer<typeof optionsSchema>['data'][number]
type Props = { artifactId: string; versionId: string; disabled: boolean; t: ReturnType<typeof messages>;
  onChange(policy: ResourceAnalysisPolicy | undefined, ready: boolean): void }

/** Each version owns its selection. No analysis consent is carried across version changes. */
export function GroupAnalysisPolicy({ artifactId, versionId, disabled, t, onChange }: Props) {
  const [mode, setMode] = React.useState<'view' | 'bindings' | 'explore'>('view')
  const [datasets, setDatasets] = React.useState<Dataset[]>([]), [selected, setSelected] = React.useState<ResourceAnalysisPolicy['datasets']>([])
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false), [details, setDetails] = React.useState(false), [limit, setLimit] = React.useState('50')
  React.useEffect(() => {
    let active = true
    setMode('view'); setSelected([]); setDatasets([]); setFailed(false); setBusy(true)
    const assertScope = captureViewScope()
    requestHost('invokeClientCommand', { commandKey: 'artifact.use-grants.manage', payload: {
      actionKey: 'group-grant-analysis-options', input: { artifactId, versionId }
    } }).then(response => { assertScope(); if (active) setDatasets(optionsSchema.parse(response).data) })
      .catch(() => { if (active) setFailed(true) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [artifactId, versionId])
  React.useEffect(() => {
    const policy = mode === 'view' ? undefined : { mode, datasets: selected, allowDetails: mode === 'bindings' || details, maxRows: Number(limit) }
    const validFilters = selected.every(scope => scope.filters.every(filter => {
      const field = datasets.find(dataset => dataset.key === scope.key)?.fields.find(field => field.id === filter.field)
      return field && filter.values.every(value => isResourceAnalysisFilterValue(field.logicalType, value))
    }))
    onChange(policy, mode === 'view' || (!busy && !failed && resourceAnalysisPolicySchema.safeParse(policy).success && validFilters))
  }, [mode, selected, datasets, details, limit, busy, failed, onChange])
  const update = (key: string, patch: Partial<ResourceAnalysisPolicy['datasets'][number]>) =>
    setSelected(items => items.map(item => item.key === key ? { ...item, ...patch } : item))
  return <section className="grid gap-3 border-t pt-3">
    <label className="grid gap-2 text-sm">{t.analysisPermission}<Select disabled={disabled} value={mode} onValueChange={value => setMode(z.enum(['view', 'bindings', 'explore']).parse(value))}>
      <SelectTrigger aria-label={t.analysisPermission}><SelectValue/></SelectTrigger><SelectContent>
        <SelectItem value="view">{t.analysisViewOnly}</SelectItem><SelectItem value="bindings">{t.analysisBindings}</SelectItem><SelectItem value="explore">{t.analysisExplore}</SelectItem>
      </SelectContent></Select></label>
    {mode !== 'view' && <>
      <p className="text-sm text-muted-foreground">{t.analysisAudienceHint}</p>
      {busy && <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>}
      {failed && <p role="alert" className="text-sm text-destructive">{t.analysisUnavailable}</p>}
      <div className="grid max-h-72 gap-3 overflow-y-auto">{datasets.map(dataset => {
        const scope = selected.find(item => item.key === dataset.key)
        return <div key={dataset.key} className="grid gap-2 border-b pb-3">
          <label className="flex items-center gap-2 text-sm"><Checkbox disabled={disabled || !dataset.canShare} checked={!!scope}
            onCheckedChange={checked => setSelected(items => checked === true ? [...items, { key: dataset.key, fields: dataset.fields.map(field => field.id), filters: [] }] : items.filter(item => item.key !== dataset.key))}/>{dataset.title}</label>
          {!dataset.canShare && <p className="text-sm text-muted-foreground">{t.analysisUnavailable}</p>}
          {scope && <><p className="text-sm text-muted-foreground">{t.analysisFields}</p><div className="flex flex-wrap gap-x-4 gap-y-2">{dataset.fields.map(field => <label key={field.id} className="flex items-center gap-2 text-sm"><Checkbox disabled={disabled} checked={scope.fields.includes(field.id)} onCheckedChange={checked => update(dataset.key, { fields: checked === true ? [...scope.fields, field.id] : scope.fields.filter(id => id !== field.id), filters: scope.filters.filter(filter => filter.field !== field.id) })}/>{field.label}</label>)}</div>
            <div className="grid gap-2">{scope.filters.map((filter, index) => <FixedFilter key={index} dataset={dataset} fields={scope.fields} value={filter} disabled={disabled} t={t}
              onChange={value => update(dataset.key, { filters: scope.filters.map((item, position) => position === index ? value : item) })}
              onRemove={() => update(dataset.key, { filters: scope.filters.filter((_, position) => position !== index) })}/>)}</div>
            <Button variant="outline" size="sm" disabled={disabled || !scope.fields.length || scope.filters.length >= 20} onClick={() => update(dataset.key, { filters: [...scope.filters, newFilter(dataset, scope.fields[0])] })}>{t.analysisAddFilter}</Button>
          </>}
        </div>
      })}</div>
      {mode === 'explore' && <label className="flex items-center gap-2 text-sm"><Checkbox disabled={disabled} checked={details} onCheckedChange={checked => setDetails(checked === true)}/>{t.analysisAllowDetails}</label>}
      <label className="grid gap-2 text-sm">{t.analysisRowLimit}<Select disabled={disabled} value={limit} onValueChange={setLimit}><SelectTrigger aria-label={t.analysisRowLimit}><SelectValue/></SelectTrigger><SelectContent>{['20', '50', '100'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>
    </>}
  </section>
}

function newFilter(dataset: Dataset, field: string): ResourceAnalysisFilter {
  return { field, operator: 'eq', values: [dataset.fields.find(item => item.id === field)?.logicalType === 'boolean' ? false : ''] }
}

function FixedFilter({ dataset, fields, value, disabled, t, onChange, onRemove }: { dataset: Dataset; fields: string[]; value: ResourceAnalysisFilter; disabled: boolean; t: ReturnType<typeof messages>; onChange(value: ResourceAnalysisFilter): void; onRemove(): void }) {
  const field = dataset.fields.find(field => field.id === value.field)
  return <div className="grid gap-2">
    <label className="grid gap-1 text-sm">{t.analysisFixedField}<Select disabled={disabled} value={value.field} onValueChange={field => onChange(newFilter(dataset, field))}><SelectTrigger aria-label={t.analysisFixedField}><SelectValue/></SelectTrigger><SelectContent>{dataset.fields.filter(field => fields.includes(field.id)).map(field => <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>)}</SelectContent></Select></label>
    <div className="flex items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-sm">{t.analysisEquals}
      {field?.logicalType === 'boolean' ? <Select disabled={disabled} value={String(value.values[0]) || 'true'} onValueChange={choice => onChange({ ...value, values: [choice === 'true'] })}><SelectTrigger aria-label={t.analysisEquals}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent></Select>
      : <Input disabled={disabled} aria-invalid={field ? !isResourceAnalysisFilterValue(field.logicalType, value.values[0]) : true} value={String(value.values[0] ?? '')} onChange={event => onChange({ ...value, values: [field?.logicalType === 'float64' && event.target.value.trim() ? Number(event.target.value) : event.target.value] })}/>}</label>
      <Button variant="ghost" disabled={disabled} onClick={onRemove}>{t.analysisRemoveFilter}</Button></div>
  </div>
}
