import { useRef, useState } from 'react'
import { z } from 'zod'
import { Button, Input, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { action, command } from './bridge'
import { t, useLocale } from './i18n'
const inspection = z.object({ revision: z.string(), slots: z.array(z.object({ tag: z.string(), title: z.string(), type: z.string(), lock: z.string() })) })
const saved = z.object({ navigation: z.object({ viewKey: z.string(), selectionId: z.string(), parameters: z.object({}).passthrough() }) })
export function TemplateLibrary() {
  useLocale()
  const [selected, setSelected] = useState<'report' | 'proposal' | 'minutes'>('report')
  const [title, setTitle] = useState(''), [summary, setSummary] = useState(''), [path, setPath] = useState('')
  const [template, setTemplate] = useState<z.infer<typeof inspection>>(), [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const request = useRef<{ signature: string; id: string }>()
  async function create(fill: boolean) {
    const input = fill ? { filePath: path, expectedRevision: template?.revision, title,
      slots: Object.entries(values).map(([tag, text]) => ({ tag, text })) } : { templateId: selected, title,
      blocks: [...summary.split(/\r?\n/).map(text => ({ kind: 'paragraph', text })), ...(['templates.section1', 'templates.section2', 'templates.section3'] as const).flatMap(key => [
        { kind: 'heading', level: 1, text: t(key) }, { kind: 'paragraph', text: t('templates.placeholder') }
      ])] }
    const signature = JSON.stringify(input)
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() }
    setBusy(true); setError(false)
    try {
      const result = saved.parse(await action(fill ? 'templates.fill' : 'templates.create', { ...input, operationId: request.current.id }))
      await command('workbench.navigation.open', { target: 'workbench.view', ...result.navigation })
    } catch { setError(true) } finally { setBusy(false) }
  }
  async function inspect() {
    setBusy(true); setError(false); setTemplate(undefined)
    try {
      const result = inspection.parse(await action('templates.inspect', { filePath: path, offset: 0, limit: 1 }))
      setTemplate(result)
      setValues(Object.fromEntries(result.slots.filter(slot => slot.tag && slot.lock === 'unlocked' && ['plainText', 'richText'].includes(slot.type)).map(slot => [slot.tag, ''])))
    } catch { setError(true) } finally { setBusy(false) }
  }
  return <main className="document-root overflow-auto p-6 gap-5">
    <header><h1>{t('templates.title')}</h1><p className="text-muted-foreground">{t('templates.intro')}</p></header>
    {error && <p role="alert">{t('document.failed')}</p>}
    <section className="flex flex-wrap gap-3">{(['report', 'proposal', 'minutes'] as const).map(id => <Button key={id} variant={selected === id ? 'secondary' : 'outline'} aria-pressed={selected === id} disabled={busy} onClick={() => setSelected(id)}>{t(`templates.${id}`)}</Button>)}</section>
    <label>{t('templates.name')}<Input value={title} maxLength={200} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
    <label>{t('templates.summary')}<Textarea value={summary} maxLength={12000} disabled={busy} onChange={e => setSummary(e.target.value)} /></label>
    <div><Button disabled={busy || !title.trim()} onClick={() => void create(false)}>{t('templates.create')}</Button></div>
    <section className="border-t pt-5 flex flex-col gap-3">
      <h2>{t('templates.enterprise')}</h2>
      <label>{t('templates.path')}<Input value={path} disabled={busy} onChange={e => { setPath(e.target.value); setTemplate(undefined); setValues({}) }} /></label>
      <div><Button variant="outline" disabled={busy || !path} onClick={() => void inspect()}>{t('templates.inspect')}</Button></div>
      {template && !Object.keys(values).length && <p>{t('templates.noSlots')}</p>}
      {Object.entries(values).map(([tag, value]) => <label key={tag}>{t('templates.slot', { tag })}<Input value={value} maxLength={12000} disabled={busy} onChange={e => setValues({ ...values, [tag]: e.target.value })} /></label>)}
      <div><Button disabled={busy || !title.trim() || !template || !Object.keys(values).length} onClick={() => void create(true)}>{t('templates.fill')}</Button></div>
    </section>
  </main>
}
