import * as React from 'react'
import { BarChart, LineChart } from 'echarts/charts'
import {
  AriaComponent, DatasetComponent, GridComponent, LegendComponent,
  TooltipComponent, TransformComponent
} from 'echarts/components'
import { init, use, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

const h: typeof React.createElement = React.createElement
const { useEffect, useRef } = React

use([
  BarChart, LineChart, AriaComponent, DatasetComponent, GridComponent,
  LegendComponent, TooltipComponent, TransformComponent, CanvasRenderer
])

export function EChart({ option, ariaLabel }: { option: EChartsCoreOption; ariaLabel: string }) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const dark = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    const chart = init(element, dark ? 'dark' : undefined, { renderer: 'canvas' })
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    chart.setOption({ ...option, animation: !reducedMotion }, true)
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => chart.resize())
    observer?.observe(element)
    return () => { observer?.disconnect(); chart.dispose() }
  }, [option])
  return <div ref={elementRef} className="fod-chart" role="img" aria-label={ariaLabel} />
}
