import { Button, ControlInput, SelectField, Table, SelectOption } from './controls'
import { translate } from './i18n'
import { useMemo, useState } from 'react'
import type { DatabaseObjectDetail, DatabaseResult } from '@xpert-ai/plugin-sdk/data-workbench'
export interface ChartConfig {
  x: number
  y: number
  kind: 'bar' | 'line'
  title: string
}
export function ChartPanel({
  result,
  onSave,
  initial,
  zh,
  readOnly = false,
}: {
  result: DatabaseResult
  onSave: (config: ChartConfig) => void
  initial?: ChartConfig
  zh: boolean
  readOnly?: boolean
}) {
  const [config, setConfig] = useState<ChartConfig>(
    initial ?? { x: 0, y: Math.min(1, result.columns.length - 1), kind: 'bar', title: translate(zh, 'm_a4b52cc7') }
  )
  const points = result.rows
      .slice(0, 100)
      .map((row, index) => ({ label: String(row[config.x] ?? ''), value: Number(row[config.y]), index }))
      .filter((item) => Number.isFinite(item.value)),
    min = Math.min(0, ...points.map((point) => point.value)),
    max = Math.max(1, ...points.map((point) => point.value)),
    width = 900,
    height = 280,
    bar = (width - 80) / Math.max(result.rows.slice(0, 100).length, 1),
    y = (value: number) => height - 20 - ((value - min) / (max - min)) * (height - 45),
    zero = y(0)
  if (!result.columns.length) return <div className="empty">{translate(zh, 'm_0b310cb5')}</div>
  return (
    <div className="analysis-panel">
      <div className="toolbar">
        <ControlInput
          aria-label="Chart title"
          value={config.title}
          onChange={(e) => setConfig({ ...config, title: e.target.value })}
        />
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis} className="labeled-select">
            {axis.toUpperCase()}{' '}
            <SelectField value={config[axis]} onChange={(e) => setConfig({ ...config, [axis]: Number(e.target.value) })}>
              {result.columns.map((column, i) => (
                <SelectOption key={column.id} value={i}>
                  {column.name}
                </SelectOption>
              ))}
            </SelectField>
          </label>
        ))}
        <SelectField
          aria-label="Chart type"
          value={config.kind}
          onChange={(e) => setConfig({ ...config, kind: e.target.value as 'bar' | 'line' })}
        >
          <SelectOption value="bar">{translate(zh, 'm_01f78a67')}</SelectOption>
          <SelectOption value="line">{translate(zh, 'm_3b6a0fef')}</SelectOption>
        </SelectField>
        <Button hidden={readOnly} onClick={() => onSave(config)}>
          {translate(zh, 'm_5d5ab793')}
        </Button>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 55}`} role="img" aria-label={config.title}>
        <line x1="40" y1={zero} x2={width - 20} y2={zero} stroke="var(--border)" />
        {config.kind === 'line' && (
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            points={points.map((point) => `${40 + bar * (point.index + 0.5)},${y(point.value)}`).join(' ')}
          />
        )}
        {points.map((point) => (
          <g key={point.index}>
            {config.kind === 'bar' ? (
              <rect
                x={40 + bar * point.index + 3}
                y={Math.min(zero, y(point.value))}
                width={Math.max(1, bar - 6)}
                height={Math.abs(y(point.value) - zero)}
                fill="var(--primary)"
              />
            ) : (
              <circle cx={40 + bar * (point.index + 0.5)} cy={y(point.value)} r="3" fill="var(--primary)" />
            )}
            <title>
              {point.label}: {point.value}
            </title>
            {point.index % Math.max(1, Math.ceil(points.length / 12)) === 0 && (
              <text
                x={40 + bar * (point.index + 0.5)}
                y={height + 18}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="10"
              >
                {point.label.slice(0, 14)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <small>{translate(zh, 'm_5aa4b5b5')}</small>
    </div>
  )
}
export function PivotPanel({ result, zh }: { result: DatabaseResult; zh: boolean }) {
  const [group, setGroup] = useState(0),
    [measure, setMeasure] = useState(Math.min(1, result.columns.length - 1)),
    [mode, setMode] = useState('count')
  const rows = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; numericCount: number }>()
    for (const row of result.rows) {
      const key = String(row[group] ?? 'NULL'),
        value = map.get(key) ?? { count: 0, sum: 0, numericCount: 0 }
      value.count++
      if (row[measure] != null && Number.isFinite(Number(row[measure]))) {
        value.sum += Number(row[measure])
        value.numericCount++
      }
      map.set(key, value)
    }
    return [...map.entries()]
  }, [result, group, measure])
  return (
    <div className="analysis-panel">
      <div className="toolbar">
        <label className="labeled-select">
          {translate(zh, 'm_f403f7b9')}{' '}
          <SelectField value={group} onChange={(e) => setGroup(Number(e.target.value))}>
            {result.columns.map((c, i) => (
              <SelectOption value={i} key={c.id}>
                {c.name}
              </SelectOption>
            ))}
          </SelectField>
        </label>
        <SelectField aria-label="Aggregation" value={mode} onChange={(e) => setMode(e.target.value)}>
          <SelectOption value="count">COUNT</SelectOption>
          <SelectOption value="sum">SUM</SelectOption>
          <SelectOption value="avg">AVG</SelectOption>
        </SelectField>
        <SelectField aria-label="Measure" value={measure} onChange={(e) => setMeasure(Number(e.target.value))}>
          {result.columns.map((c, i) => (
            <SelectOption value={i} key={c.id}>
              {c.name}
            </SelectOption>
          ))}
        </SelectField>
      </div>
      <Table>
        <thead>
          <tr>
            <th>{result.columns[group]?.name}</th>
            <th>{mode}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>
                {mode === 'count'
                  ? value.count
                  : mode === 'sum'
                  ? value.sum
                  : value.numericCount
                  ? value.sum / value.numericCount
                  : 'NULL'}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <small>{translate(zh, 'm_debfceb6')}</small>
    </div>
  )
}
export function ErPanel({ objects, zh }: { objects: DatabaseObjectDetail[]; zh: boolean }) {
  const width = 1000,
    nodeW = 250,
    nodeH = 185,
    positions = new Map(
      objects.map((item, i) => [item.object.name, { x: 25 + (i % 3) * 325, y: 30 + Math.floor(i / 3) * 225 }])
    )
  return (
    <div className="analysis-panel er-panel">
      <p>{translate(zh, 'm_46fe2261')}</p>
      <svg
        viewBox={`0 0 ${width} ${Math.max(250, Math.ceil(objects.length / 3) * 225)}`}
        role="img"
        aria-label="Entity relationships"
      >
        {objects.flatMap((object) =>
          object.keys
            .filter((key) => key.kind === 'foreign' && key.referencedTable)
            .map((key) => {
              const start = positions.get(object.object.name),
                end = positions.get(key.referencedTable!.name)
              return start && end ? (
                <path
                  key={`${object.object.name}-${key.name}`}
                  d={`M${start.x + nodeW},${start.y + 35} C${start.x + nodeW + 35},${start.y + 35} ${end.x - 35},${
                    end.y + 35
                  } ${end.x},${end.y + 35}`}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2"
                >
                  <title>
                    {key.name}: {key.columns.join(',')} → {key.referencedColumns?.join(',')}
                  </title>
                </path>
              ) : null
            })
        )}
        {objects.map((object) => {
          const pos = positions.get(object.object.name)!
          return (
            <g key={object.object.name} transform={`translate(${pos.x},${pos.y})`}>
              <rect width={nodeW} height={nodeH} rx="7" fill="var(--card)" stroke="var(--border)" />
              <text x="14" y="26" fill="var(--foreground)" fontSize="13" fontWeight="600">
                {object.object.name}
              </text>
              <line x1="0" x2={nodeW} y1="39" y2="39" stroke="var(--border)" />
              {object.columns.slice(0, 7).map((column, i) => (
                <text x="14" y={59 + i * 16} fill="var(--muted-foreground)" fontSize="11" key={column.id}>
                  {object.keys.some(
                    (key) => ['primary', 'unique'].includes(key.kind) && key.columns.includes(column.name)
                  )
                    ? '◆ '
                    : ''}
                  {column.name.slice(0, 22)} · {column.dataType.slice(0, 16)}
                </text>
              ))}
              {object.columns.length > 7 && (
                <text x="14" y="177" fontSize="10" fill="var(--muted-foreground)">
                  +{object.columns.length - 7}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
