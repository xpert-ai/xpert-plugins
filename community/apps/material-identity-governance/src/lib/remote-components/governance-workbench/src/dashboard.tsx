import * as React from 'react'
import {
  Button,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@xpert-ai/plugin-shadcn-ui'
import {
  ArrowUpRight,
  FolderKanban,
  Clock3,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react'
import { init, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { WorkbenchData } from '../../../contracts'
import { useI18n } from './i18n'
import { Status } from './ui'
use([
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  SVGRenderer,
])
function Chart({
  option,
  onSelect,
}: {
  option: EChartsCoreOption
  onSelect?: (index: number) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!ref.current) return
    const chart = init(ref.current, undefined, { renderer: 'svg' })
    chart.setOption(option)
    chart.on('click', (p) => {
      if (typeof p.dataIndex === 'number') onSelect?.(p.dataIndex)
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [option, onSelect])
  return <div ref={ref} className="chart" />
}
export function Dashboard({
  data,
  onOpen,
}: {
  data: WorkbenchData
  onOpen: (id: string) => void
}) {
  const { t, number, currency, date } = useI18n()
  const d = data.dashboard
  const tokens = getComputedStyle(document.documentElement)
  const color = (key: string) => tokens.getPropertyValue(key).trim()
  const metrics = [
    { key: 'total' as const, value: d.total, icon: FolderKanban },
    { key: 'active' as const, value: d.active, icon: Clock3 },
    {
      key: 'reviewRequired' as const,
      value: d.reviewRequired,
      icon: ShieldAlert,
    },
    { key: 'completed' as const, value: d.completed, icon: CheckCircle2 },
  ]
  const options = React.useMemo<EChartsCoreOption>(
    () => ({
      animation: false,
      aria: {
        enabled: true,
        label: {
          description: d.categories
            .map((x) => `${t(x.key)} ${x.count}`)
            .join('；'),
        },
      },
      tooltip: { trigger: 'axis' },
      grid: { top: 12, left: 12, right: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: color('--border') } },
      },
      yAxis: {
        type: 'category',
        data: d.categories.map((x) => t(x.key)),
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: d.categories.map((x) => x.count),
          barWidth: 24,
          itemStyle: { color: color('--primary'), borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right' },
        },
      ],
      textStyle: { color: color('--muted-foreground') },
    }),
    [d, t],
  )
  const roleOption = React.useMemo<EChartsCoreOption>(
    () => ({
      animation: false,
      aria: {
        enabled: true,
        label: {
          description: d.roleQueues
            .map(
              (x) =>
                `${t(x.roleKey)} ${t('ready')} ${x.ready} ${t('running')} ${x.running} ${t('completed')} ${x.completed}`,
            )
            .join('；'),
        },
      },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: color('--muted-foreground') } },
      grid: { top: 8, left: 10, right: 16, bottom: 38, containLabel: true },
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: color('--border') } },
      },
      yAxis: {
        type: 'category',
        data: d.roleQueues.map((x) => t(x.roleKey)),
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: t('ready'),
          type: 'bar',
          stack: 'tasks',
          data: d.roleQueues.map((x) => x.ready),
          itemStyle: { color: color('--warning') },
        },
        {
          name: t('running'),
          type: 'bar',
          stack: 'tasks',
          data: d.roleQueues.map((x) => x.running),
          itemStyle: { color: color('--info') },
        },
        {
          name: t('completed'),
          type: 'bar',
          stack: 'tasks',
          data: d.roleQueues.map((x) => x.completed),
          itemStyle: { color: color('--success') },
        },
      ],
      textStyle: { color: color('--muted-foreground') },
    }),
    [d, t],
  )
  const choose = React.useCallback(
    (index: number) => {
      const id = d.categories[index]?.caseIds[0]
      if (id) onOpen(id)
    },
    [d, onOpen],
  )
  return (
    <div className="space-y-6">
      <div className="metrics-grid">
        {metrics.map((m) => (
          <section className="metric" key={m.key}>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t(m.key)}</span>
              <m.icon size={18} />
            </div>
            <strong>{number(m.value)}</strong>
          </section>
        ))}
      </div>
      <div className="dashboard-charts">
        <section className="chart-section">
          <div className="section-heading">
            <h2>{t('categoryChart')}</h2>
            <span>{t('chartHint')}</span>
          </div>
          <Chart option={options} onSelect={choose} />
          <div className="exposure">
            <span>{t('exposure')}</span>
            <strong>{currency(d.exposure)}</strong>
            <span>
              {t('conflicts')} {number(d.conflictCount)}
            </span>
          </div>
        </section>
        <section className="chart-section">
          <div className="section-heading">
            <h2>{t('roleChart')}</h2>
          </div>
          <Chart option={roleOption} />
        </section>
      </div>
      <section>
        <div className="section-heading">
          <h2>{t('attention')}</h2>
          <span>{date(d.generatedAt)}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('caseKey')}</TableHead>
              <TableHead>{t('subject')}</TableHead>
              <TableHead>{t('type')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('updated')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.table.items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.caseKey}</TableCell>
                <TableCell className="font-medium">{c.title}</TableCell>
                <TableCell>{t(c.kind)}</TableCell>
                <TableCell>
                  <Status value={c.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {date(c.updatedAt)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpen(c.id)}
                  >
                    {t('open')}
                    <ArrowUpRight size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
