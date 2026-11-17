import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Checkbox, Input, Label, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { useLocalizedMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { MAX_EVALUATION_SAMPLES, runSummarySchema } from '../../../domain/evaluation'
import { executeAction } from './bridge'
import { categoryLabel, promptSourceLabel } from './data'
import type { WorkbenchData } from './data'
import { i18n } from './i18n'

/** Sets up an acceptance run: the prompt in effect against a candidate, on cases a person has confirmed. */
export function ComparisonSetup({ data, created }: { data: WorkbenchData; created: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [promptA, setPromptA] = useState(data.activePrompt?.text ?? '')
  const [promptB, setPromptB] = useState(() => i18n.t('setup.defaultB'))
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useLocalizedMessage(i18n)
  const key = useRef<string | null>(null)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    key.current ??= crypto.randomUUID()
    setBusy(true); setError('')
    try {
      const run = runSummarySchema.parse(await executeAction('create_run', {
        requestKey: key.current, title, promptA, promptB, sampleIds: selected
      }))
      key.current = null
      created(run.id)
    } catch { setError(i18n.message('setup.failed')) } finally { setBusy(false) }
  }
  const confirmed = data.cases.filter(item => item.status === 'confirmed' && item.confirmedCategoryId)
  return (
    <form className="flex flex-col gap-4" onSubmit={event => void save(event)}>
      <h2>{i18n.t('setup.heading')}</h2><hr />
      <p>{i18n.t('setup.intro')}</p>
      {data.activePrompt ? <p>{i18n.t('prompt.current', {
        source: promptSourceLabel(data.activePrompt.source, data.activePrompt.runTitle)
      })}</p> : null}
      <Label htmlFor="run-title">{i18n.t('setup.title')}</Label>
      <Input id="run-title" maxLength={120} value={title} disabled={busy} onChange={event => { key.current = null; setTitle(event.target.value) }} />
      <div className="prompt-grid">
        <div className="flex flex-col gap-2">
          <Label htmlFor="prompt-a">{i18n.t('setup.promptA')}</Label>
          <Textarea id="prompt-a" rows={6} maxLength={6000} value={promptA} disabled={busy} onChange={event => { key.current = null; setPromptA(event.target.value) }} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prompt-b">{i18n.t('setup.promptB')}</Label>
          <Textarea id="prompt-b" rows={6} maxLength={6000} value={promptB} disabled={busy} onChange={event => { key.current = null; setPromptB(event.target.value) }} />
        </div>
      </div>
      <p>{i18n.t('setup.modelHint')}</p>
      <h3>{i18n.t('setup.samples', { count: selected.length, max: MAX_EVALUATION_SAMPLES })}</h3>
      {confirmed.length === 0 ? <p>{i18n.t('setup.noSamples')}</p> : confirmed.map(item => (
        <div className="flex items-center gap-3" key={item.id}>
          <Checkbox id={`pick-${item.id}`} checked={selected.includes(item.id)}
            disabled={busy || (!selected.includes(item.id) && selected.length >= MAX_EVALUATION_SAMPLES)}
            onCheckedChange={checked => {
              key.current = null
              setSelected(ids => checked === true ? [...ids, item.id] : ids.filter(id => id !== item.id))
            }} />
          <Label htmlFor={`pick-${item.id}`}>{i18n.t('setup.sample', {
            title: item.title, category: categoryLabel(data.categories, item.confirmedCategoryId!)
          })}</Label>
        </div>
      ))}
      <p>{i18n.t('setup.calls', { count: selected.length * 2 })}</p>
      <div><Button type="submit" disabled={busy || !title.trim() || !promptA.trim() || !promptB.trim() || selected.length === 0}>
        {i18n.t(busy ? 'common.saving' : 'setup.save')}
      </Button></div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  )
}
