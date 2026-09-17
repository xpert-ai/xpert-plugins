import { Button, ControlInput, SelectField, SelectOption } from './controls'
import { translate } from './i18n'
import { useEffect, useRef, useState } from 'react'
import type { DatabaseResult } from '@xpert-ai/plugin-sdk/data-workbench'
import { ChartPanel, type ChartConfig } from './analysis-panels'
import { action, data } from './bridge'
import { mergeRecords, type RecordPage, type SavedRecord } from './model'
import { latestRequest } from './request-state'
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
    [error, setError] = useState(''),
    [chartPage, setChartPage] = useState(0), [boardPage, setBoardPage] = useState(0),
    [moreCharts, setMoreCharts] = useState(false), [moreBoards, setMoreBoards] = useState(false),
    [loadingCharts, setLoadingCharts] = useState(false), [loadingBoards, setLoadingBoards] = useState(false)
  const boardSelection = useRef(latestRequest())
  const loadCharts = async (page = 1) => {
    setLoadingCharts(true)
    try {
      const response = await data<RecordPage<ChartRecord>>('chart', {}, page)
      setCharts((previous) => mergeRecords(previous, response.items))
      setChartPage(page)
      setMoreCharts(response.hasMore ?? response.items.length === 50)
    } catch (error) { setError(error instanceof Error ? error.message : 'operation_failed') }
    finally { setLoadingCharts(false) }
  }
  const loadBoards = async (page = 1) => {
    setLoadingBoards(true)
    try {
      const response = await data<RecordPage<BoardRecord>>('dashboard', {}, page)
      setBoards((previous) => mergeRecords(previous, response.items))
      setBoardPage(page)
      setMoreBoards(response.hasMore ?? response.items.length === 50)
    } catch (error) { setError(error instanceof Error ? error.message : 'operation_failed') }
    finally { setLoadingBoards(false) }
  }
  const refresh = () => Promise.all([loadCharts(), loadBoards()])
  const openBoard = async (id: string) => {
    const request = boardSelection.current.begin()
    const board = boards.find((item) => item.id === id)
    if (!board) return
    setError('')
    try {
      const ids = JSON.parse(board.summary.content) as string[]
      // A saved dashboard can reference charts outside the currently loaded selector page.
      const missing = await Promise.all(ids.filter((id) => !charts.some((chart) => chart.id === id)).map(async (id) => {
        const { item } = await data<{ item: SavedRecord }>('record', { id })
        if (item.kind !== 'chart') throw new Error('record_kind_mismatch')
        return { id: item.id, title: item.title, summary: { content: String(item.payload.content) } }
      }))
      if (!boardSelection.current.isCurrent(request)) return
      setCharts((previous) => mergeRecords(previous, missing))
      setSelection(ids)
      setTitle(board.title)
    } catch (error) {
      if (boardSelection.current.isCurrent(request)) setError(error instanceof Error ? error.message : 'operation_failed')
    }
  }
  useEffect(() => {
    void refresh()
    return () => { boardSelection.current.begin() }
  }, [])
  return (
    <div className="analysis-panel">
      <div className="section-title">
        <h3>{translate(zh, 'm_8a5b6c6f')}</h3>
        <SelectField
          aria-label="Saved dashboard"
          disabled={!boards.length}
          onChange={(event) => void openBoard(event.target.value)}
        >
          <SelectOption value="">{translate(zh, boards.length ? 'm_dc52906b' : 'dashboard_empty')}</SelectOption>
          {boards.map((board) => (
            <SelectOption value={board.id} key={board.id}>
              {board.title}
            </SelectOption>
          ))}
        </SelectField>
        {moreBoards && <Button disabled={loadingBoards} onClick={() => void loadBoards(boardPage + 1)}>{translate(zh, 'dashboard_more')}</Button>}
        <ControlInput aria-label="Dashboard title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button
          disabled={!selection.length || !title.trim() || loadingCharts || loadingBoards}
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
      {moreCharts && <Button disabled={loadingCharts} onClick={() => void loadCharts(chartPage + 1)}>{translate(zh, 'charts_more')}</Button>}
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
