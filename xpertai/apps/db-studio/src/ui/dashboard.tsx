import { Button, ControlInput, SelectField, SelectOption } from './controls'
import { translate } from './i18n'
import { useEffect, useState } from 'react'
import type { DatabaseResult } from '@xpert-ai/plugin-sdk/data-workbench'
import { ChartPanel, type ChartConfig } from './analysis-panels'
import { action, data } from './bridge'
interface ChartRecord {
  id: string
  title: string
  summary: { content: string }
}
interface BoardRecord {
  id: string
  title: string
  summary: { content: string }
}
export function Dashboard({ zh }: { zh: boolean }) {
  const [charts, setCharts] = useState<ChartRecord[]>([]),
    [boards, setBoards] = useState<BoardRecord[]>([]),
    [selection, setSelection] = useState<string[]>([]),
    [title, setTitle] = useState(zh ? '看板' : 'Dashboard'),
    [error, setError] = useState('')
  const refresh = async () => {
    try {
      const [c, b] = await Promise.all([
        data<{ items: ChartRecord[] }>('chart'),
        data<{ items: BoardRecord[] }>('dashboard'),
      ])
      setCharts(c.items)
      setBoards(b.items)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'operation_failed')
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  return (
    <div className="analysis-panel">
      <div className="section-title">
        <h3>{translate(zh, 'm_8a5b6c6f')}</h3>
        <SelectField
          aria-label="Saved dashboard"
          onChange={(event) => {
            const board = boards.find((item) => item.id === event.target.value)
            if (board) {
              const ids = JSON.parse(board.summary.content) as string[]
              setSelection(ids.filter((id) => charts.some((chart) => chart.id === id)))
              setTitle(board.title)
            }
          }}
        >
          <SelectOption value="">{translate(zh, 'm_dc52906b')}</SelectOption>
          {boards.map((board) => (
            <SelectOption value={board.id} key={board.id}>
              {board.title}
            </SelectOption>
          ))}
        </SelectField>
        <ControlInput aria-label="Dashboard title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button
          disabled={!selection.length || !title.trim()}
          onClick={() => {
            void action('save_artifact', { kind: 'dashboard', title, content: JSON.stringify(selection) })
              .then(refresh)
              .catch((error: Error) => setError(error.message))
          }}
        >
          {translate(zh, 'm_15563943')}
        </Button>
      </div>
      <p className="muted">{translate(zh, 'm_3366065c')}</p>
      <div className="toolbar">
        {charts.map((chart) => (
          <label className="chart-check" key={chart.id}>
            <ControlInput
              type="checkbox"
              checked={selection.includes(chart.id)}
              onChange={(event) =>
                setSelection(
                  event.target.checked ? [...selection, chart.id] : selection.filter((id) => id !== chart.id)
                )
              }
            />
            {chart.title}
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="dashboard-grid">
        {charts
          .filter((chart) => selection.includes(chart.id))
          .map((chart) => {
            const saved = JSON.parse(chart.summary.content) as {
              result: DatabaseResult
              config: ChartConfig
              executionId: string
            }
            return (
              <section className="dashboard-chart" key={chart.id}>
                <h4>{chart.title}</h4>
                <small>{saved.executionId}</small>
                <ChartPanel result={saved.result} initial={saved.config} zh={zh} onSave={() => {}} readOnly />
              </section>
            )
          })}
      </div>
    </div>
  )
}
