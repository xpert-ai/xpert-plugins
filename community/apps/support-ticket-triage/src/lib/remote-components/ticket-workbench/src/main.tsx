import React from 'react'
import { createRoot } from 'react-dom/client'
import { Badge, Button, Input, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import zh from './locales/zh_Hans.json'
import en from './locales/en_US.json'
import { bridge, type TicketItem } from './bridge.js'

type Copy = typeof zh
const copy: Record<string, Copy> = { zh_Hans: zh, en_US: en }

function App() {
  const [locale, setLocale] = React.useState('zh_Hans')
  const t = copy[locale] ?? zh
  const [items, setItems] = React.useState<TicketItem[]>([])
  const [selected, setSelected] = React.useState<TicketItem>()
  const [search, setSearch] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [notice, setNotice] = React.useState('')
  const [form, setForm] = React.useState({ customerName: '', customerEmail: '', subject: '', description: '' })

  const load = React.useCallback(async () => {
    setLoading(true)
    try { const data = await bridge.load(search); setItems(data.items ?? []); setSelected((old) => (data.items ?? []).find((item) => item.id === old?.id) ?? data.items?.[0]) }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setLoading(false) }
  }, [search])

  React.useEffect(() => { bridge.ready((message) => { setLocale(String(message.locale ?? 'zh_Hans').replace('-', '_')); void load() }, () => void load()) }, [load])
  async function run(action: string, input: Record<string, unknown> = {}, id?: string) { setNotice(''); try { await bridge.action(action, input, id); await load() } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } }
  async function createTicket() { await run('create_ticket', form); setForm({ customerName: '', customerEmail: '', subject: '', description: '' }) }

  return <main style={{ padding: 16, display: 'grid', gap: 16, fontFamily: 'system-ui' }}>
    <header><h1 style={{ margin: 0 }}>{t.title}</h1><p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{t.subtitle}</p></header>
    <section aria-labelledby="new-ticket"><h2 id="new-ticket">{t.newTicket}</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Input aria-label={t.customerName} placeholder={t.customerName} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
      <Input aria-label={t.email} placeholder={t.email} value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
      <Input aria-label={t.subject} placeholder={t.subject} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      <div />
      <Textarea aria-label={t.description} placeholder={t.description} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ gridColumn: '1 / -1' }} />
    </div><Button onClick={createTicket} disabled={!form.customerName || !form.subject || form.description.length < 10} style={{ marginTop: 8 }}>{t.create}</Button></section>
    <section style={{ display: 'flex', gap: 8 }}><Input aria-label={t.search} placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} /><Button variant="outline" onClick={load}>{t.refresh}</Button></section>
    {notice && <p role="alert">{notice}</p>}
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(360px, 1.2fr)', gap: 16, minHeight: 360 }}>
      <div style={{ borderRight: '1px solid var(--border)', paddingRight: 12, overflow: 'auto' }}>{loading ? t.loading : items.length === 0 ? t.empty : items.map((item) => <Button key={item.id} variant={selected?.id === item.id ? 'secondary' : 'ghost'} onClick={() => setSelected(item)} style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}><span>{item.subject}</span><Badge>{item.status}</Badge></Button>)}</div>
      <div>{selected && <><h2>{selected.subject}</h2><p>{selected.description}</p><p><Badge>{selected.priority ?? selected.status}</Badge> {selected.category}</p>{selected.summary && <p>{selected.summary}</p>}{selected.suggestedReply && <><h3>{t.reply}</h3><p>{selected.suggestedReply}</p></>}{selected.evidence?.length ? <><h3>{t.evidence}</h3><ul>{selected.evidence.map((item) => <li key={item}>{item}</li>)}</ul></> : null}{selected.failureReason && <p role="alert"><strong>{t.failure}:</strong> {selected.failureReason}</p>}<p>{t.attempts}: {selected.attemptCount}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {selected.status === 'pending_ai' && <Button onClick={() => bridge.analyse(selected)}>{t.analyse}</Button>}
        {selected.status === 'awaiting_review' && <><Button onClick={() => run('approve', {}, selected.id)}>{t.approve}</Button><Button variant="outline" onClick={() => run('reject', {}, selected.id)}>{t.reject}</Button><Button variant="destructive" onClick={() => run('simulate_failure', {}, selected.id)}>{t.simulateFailure}</Button></>}
        {selected.status === 'failed' && <Button onClick={() => run('retry', {}, selected.id)}>{t.retry}</Button>}
      </div></>}</div>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
