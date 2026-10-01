import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, SelectField, SelectOption } from './controls'
import { translate } from './i18n'
import { action } from './bridge'
import { cleanTarget, jsonContent, type SavedRecord, type Target } from './model'
import { compareSnapshots, type Snapshot } from './schema-tools'
import { canCompareSnapshots, snapshotTarget } from './snapshot-selection'
import type { StudioState } from './controller'

export function CaptureSnapshotButton({ studio }: { studio: StudioState }) {
  const { zh, busy, caps, target, connection, list, protect, setBusy, setTask, setNotice } = studio
  return <Button disabled={busy || !caps} onClick={() => void protect(async () => {
    setBusy(true)
    try {
      const queued = await action<SavedRecord>('snapshot', {
        target: cleanTarget(target),
        title: `${[connection?.name, target.database, target.schema].filter(Boolean).join(' / ')} · ${new Date().toLocaleString()}`,
      })
      setTask(queued)
      setNotice(translate(zh, 'm_afa20c27'))
    } finally { setBusy(false) }
  })}>
    <Plus size={14} />{translate(zh, list.length ? 'm_b62f5da1' : 'snapshot_first')}
  </Button>
}

export function SnapshotComparison({ studio }: { studio: StudioState }) {
  const { zh, list, sources, protect, requestItem, addDraft } = studio
  const [beforeId, setBeforeId] = useState(''), [afterId, setAfterId] = useState('')
  const [pending, setPending] = useState(false)
  const [comparison, setComparison] = useState<{ beforeId: string; afterId: string; report: string; sql: string; target: Target } | null>(null)
  const before = list.find((item) => item.id === beforeId), after = list.find((item) => item.id === afterId)
  const comparable = canCompareSnapshots(before, after)
  const visible = comparable && comparison?.beforeId === beforeId && comparison.afterId === afterId ? comparison : null
  const label = (item: SavedRecord) => {
    const target = snapshotTarget(item)
    const source = sources.find((source) => source.id === target?.dataSourceId)
    return [item.title, source?.name ?? target?.dataSourceId, target?.database, target?.schema,
      new Date(item.updatedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')].filter(Boolean).join(' · ')
  }
  return <>
    <p className="muted">{translate(zh, 'snapshot_description')}</p>
    {list.length < 2 ? <p className="empty">{translate(zh, list.length ? 'snapshot_one' : 'snapshot_empty')}</p> : <>
      <p className="muted">{translate(zh, 'snapshot_scope')}</p>
      <div className="compare-controls">
        <label>{translate(zh, 'snapshot_before')}
          <SelectField aria-label={translate(zh, 'snapshot_before')} value={beforeId} onChange={(event) => {
            setBeforeId(event.target.value); setAfterId(''); setComparison(null)
          }}>
            <SelectOption value="">{translate(zh, 'm_2e6987e8')}</SelectOption>
            {list.map((item) => <SelectOption key={item.id} value={item.id}>{label(item)}</SelectOption>)}
          </SelectField>
        </label>
        <label>{translate(zh, 'snapshot_after')}
          <SelectField aria-label={translate(zh, 'snapshot_after')} value={afterId} disabled={!before} onChange={(event) => {
            setAfterId(event.target.value); setComparison(null)
          }}>
            <SelectOption value="">{translate(zh, 'm_06f996be')}</SelectOption>
            {list.filter((item) => canCompareSnapshots(before, item)).map((item) => <SelectOption key={item.id} value={item.id}>{label(item)}</SelectOption>)}
          </SelectField>
        </label>
        <Button disabled={!comparable || pending} onClick={() => void protect(async () => {
          setPending(true)
          try {
            const [a, b] = await Promise.all([
              requestItem<SavedRecord>('record', { id: beforeId }), requestItem<SavedRecord>('record', { id: afterId }),
            ])
            if (!canCompareSnapshots(a, b)) throw new Error(translate(zh, 'snapshot_scope'))
            const target = snapshotTarget(b)!
            const before = JSON.parse(jsonContent(a)) as Snapshot, after = JSON.parse(jsonContent(b)) as Snapshot
            if (before.engine !== after.engine) throw new Error(translate(zh, 'snapshot_scope'))
            const compared = compareSnapshots(before, after)
            setComparison({ beforeId, afterId, report: compared.report, sql: compared.sql, target })
          } finally { setPending(false) }
        })}>{translate(zh, 'm_f0749908')}</Button>
      </div>
    </>}
    {visible && <>
      <p className="muted">{translate(zh, 'snapshot_legend')}</p>
      <pre>{visible.report}</pre>
      {visible.sql && <><pre>{visible.sql}</pre><Button onClick={() => addDraft(visible.sql, visible.target, translate(zh, 'm_3fcbd735'))}>
        {translate(zh, 'm_ebb4bba1')}
      </Button></>}
    </>}
  </>
}
