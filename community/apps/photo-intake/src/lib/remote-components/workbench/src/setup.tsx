import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Button, Checkbox, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { useLocalizedMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { MAX_EVALUATION_SAMPLES, runSummarySchema } from '../../../domain/evaluation'
import { executeAction } from './bridge'
import { Choice } from './choices'
import { parseCreatedCase } from './data'
import type { WorkbenchData } from './data'
import { i18n } from './i18n'
import { downscalePhoto } from './photo'

export function SampleLibrary({ data, refresh, inspect }: {
  data: WorkbenchData; refresh: () => Promise<void>; inspect: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [reference, setReference] = useState('unclear')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useLocalizedMessage(i18n)
  const requestKey = useRef<string | null>(null)
  const photoSequence = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const sequence = ++photoSequence.current
    setPhoto(null)
    requestKey.current = null
    if (!file) { setReading(false); return }
    setReading(true)
    setError('')
    try {
      const url = await downscalePhoto(file)
      if (sequence === photoSequence.current) setPhoto(url)
    } catch {
      if (sequence === photoSequence.current) setError(i18n.message('create.photoInvalid'))
    } finally {
      if (sequence === photoSequence.current) setReading(false)
    }
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!photo || busy || !title.trim()) return
    requestKey.current ??= crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      parseCreatedCase(await executeAction('create_case', {
        requestKey: requestKey.current, title, referenceCategoryId: reference, photo: { dataUrl: photo }
      }))
      requestKey.current = null
      setPhoto(null)
      setTitle('')
      if (inputRef.current) inputRef.current.value = ''
      await refresh()
    } catch { setError(i18n.message('create.failed')) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={event => void save(event)} className="flex flex-col gap-3">
        <h2>{i18n.t('samples.add')}</h2>
        <hr />
        <Label htmlFor="sample-photo">{i18n.t('create.photoLabel')}</Label>
        <Input ref={inputRef} id="sample-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void pickPhoto(event)} />
        <p>{i18n.t('create.photoHint')}</p>
        {reading ? <p role="status">{i18n.t('create.photoReading')}</p> : null}
        {photo ? <img className="sample-preview" src={photo} alt={i18n.t('create.photoPreview')} /> : null}
        <Label htmlFor="sample-title">{i18n.t('samples.title')}</Label>
        <Input id="sample-title" value={title} maxLength={120} disabled={busy} onChange={event => {
          requestKey.current = null; setTitle(event.target.value)
        }} />
        <Label htmlFor="sample-reference">{i18n.t('samples.reference')}</Label>
        <Choice id="sample-reference" label={i18n.t('samples.reference')} value={reference} disabled={busy}
          onChange={value => { requestKey.current = null; setReference(value) }}
          options={data.categories.map(category => ({ value: category.id, label: i18n.label(category.label, category.id) }))} />
        <p>{i18n.t('samples.hint')}</p>
        <div><Button disabled={busy || reading || !photo || !title.trim()} type="submit">
          {i18n.t(busy ? 'common.saving' : 'samples.save')}
        </Button></div>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      <section className="flex flex-col gap-3">
        <h2>{i18n.t('samples.library')}</h2><hr />
        <p>{i18n.t('samples.limit')}</p>
        {data.cases.length === 0 ? <p>{i18n.t('samples.empty')}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>{i18n.t('samples.title')}</TableHead><TableHead>{i18n.t('samples.reference')}</TableHead></TableRow></TableHeader>
            <TableBody>{data.cases.map(sample => (
              <TableRow key={sample.id}>
                <TableCell><Button variant="link" onClick={() => inspect(sample.id)}>{sample.title}</Button></TableCell>
                <TableCell>{sample.referenceCategoryId
                  ? i18n.label(data.categories.find(item => item.id === sample.referenceCategoryId)?.label ?? sample.referenceCategoryId, sample.referenceCategoryId)
                  : i18n.t('samples.unlabelled')}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

export function ComparisonSetup({ data, created }: { data: WorkbenchData; created: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [promptA, setPromptA] = useState(() => i18n.t('setup.defaultA'))
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
  const labelled = data.cases.filter(sample => sample.referenceCategoryId)
  return (
    <form className="flex flex-col gap-4" onSubmit={event => void save(event)}>
      <h2>{i18n.t('setup.heading')}</h2><hr />
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
      {labelled.length === 0 ? <p>{i18n.t('setup.noSamples')}</p> : labelled.map(sample => (
        <div className="flex items-center gap-3" key={sample.id}>
          <Checkbox id={`pick-${sample.id}`} checked={selected.includes(sample.id)}
            disabled={busy || (!selected.includes(sample.id) && selected.length >= MAX_EVALUATION_SAMPLES)}
            onCheckedChange={checked => {
              key.current = null
              setSelected(ids => checked === true ? [...ids, sample.id] : ids.filter(id => id !== sample.id))
            }} />
          <Label htmlFor={`pick-${sample.id}`}>{sample.title}</Label>
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
