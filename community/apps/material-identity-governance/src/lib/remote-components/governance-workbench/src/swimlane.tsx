import * as React from 'react'
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  Button,
} from '@xpert-ai/plugin-shadcn-ui'
import { GitBranch, Flag, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type {
  ExecutionRecord,
  FlowNode,
  FlowProjection,
  RoleKey,
} from '../../../contracts'
import { useI18n } from './i18n'
import { Status, ExecutionMarkers, ContextDisclosure } from './ui'
export function Swimlane({
  flow,
  onNode,
  onError,
  coordinatorExecutions,
}: {
  flow: FlowProjection
  onNode: (node: FlowNode) => void
  onError: (error: Error) => void
  coordinatorExecutions: ExecutionRecord[]
}) {
  const { t } = useI18n()
  const [selected, setSelected] = React.useState<RoleKey | null>(null)
  const [zoom, setZoom] = React.useState(0.85)
  const scroller = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{
    x: number
    y: number
    left: number
    top: number
    id: number
  } | null>(null)
  const laneWidth = 210,
    stageWidth = 228,
    headerHeight = 44,
    cardHeight = 82
  const layout = React.useMemo(() => {
    let y = headerHeight
    const rows = flow.lanes.map((lane) => {
      const max = Math.max(
        1,
        ...flow.stages.map(
          (stage) =>
            flow.nodes.filter(
              (n) => n.laneKey === lane.key && n.stageKey === stage.key,
            ).length,
        ),
      )
      const height = Math.max(118, max * (cardHeight + 16) + 20)
      const row = { ...lane, y, height }
      y += height
      return row
    })
    const nodes = flow.nodes.map((node) => {
      const lane =
        rows.find((l) => l.key === node.laneKey) ?? rows[rows.length - 1]!
      const si = flow.stages.findIndex((s) => s.key === node.stageKey)
      const cell = flow.nodes.filter(
        (n) => n.laneKey === node.laneKey && n.stageKey === node.stageKey,
      )
      return {
        ...node,
        x: laneWidth + si * stageWidth + 18,
        y:
          lane.y +
          18 +
          cell.findIndex((n) => n.key === node.key) * (cardHeight + 16),
        w: stageWidth - 36,
        h: cardHeight,
      }
    })
    return {
      rows,
      nodes,
      width: laneWidth + flow.stages.length * stageWidth,
      height: y,
    }
  }, [flow])
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      e.button !== 0 ||
      (e.target instanceof Element &&
        e.target.closest('button,a,input,[data-node]'))
    )
      return
    const el = scroller.current
    if (!el) return
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      id: e.pointerId,
    }
    el.setPointerCapture(e.pointerId)
  }
  const release = () => {
    if (drag.current && scroller.current?.hasPointerCapture(drag.current.id))
      scroller.current.releasePointerCapture(drag.current.id)
    drag.current = null
  }
  return (
    <section className="swimlane-section">
      <div className="canvas-toolbar">
        <div className="coordinator-records">
          <span>{t('coordinator')}</span>
          {coordinatorExecutions.length ? (
            <ExecutionMarkers
              records={coordinatorExecutions}
              onError={onError}
            />
          ) : (
            <span className="text-muted-foreground">{t('noExecution')}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ContextDisclosure label={t('canvasHelp')}>
            <p>{t('panHint')}</p>
          </ContextDisclosure>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('zoomOut')}
            onClick={() => setZoom((z) => Math.max(0.55, z - 0.1))}
          >
            <ZoomOut size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('zoomIn')}
            onClick={() => setZoom((z) => Math.min(1.35, z + 0.1))}
          >
            <ZoomIn size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('resetZoom')}
            onClick={() => setZoom(0.85)}
          >
            <Maximize2 size={16} />
          </Button>
        </div>
      </div>
      <div
        className="pipeline-scroll"
        role="region"
        aria-label={t('pipeline')}
        ref={scroller}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setSelected(null)
        }}
        onPointerDown={onDown}
        onPointerMove={(e) => {
          const d = drag.current
          const el = scroller.current
          if (!d || !el) return
          el.scrollLeft = d.left - (e.clientX - d.x)
          el.scrollTop = d.top - (e.clientY - d.y)
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onBlur={release}
      >
        <div
          className="pipeline-surface"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          {/* Keep sticky coordinates outside the transformed task canvas. */}
          <div
            className="pipeline-header"
            style={
              {
                height: headerHeight * zoom,
                '--pipeline-zoom': zoom,
              } as React.CSSProperties
            }
          >
            <div className="stage-corner" style={{ width: laneWidth * zoom }}>
              {t('pipeline')}
            </div>
            {flow.stages.map((s, i) => (
              <div
                className="stage-header"
                key={s.key}
                style={{ width: stageWidth * zoom }}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </div>
            ))}
          </div>
          <div
            className="pipeline-canvas"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            {layout.rows.map((l) => (
              <div
                key={l.key}
                className={`lane-row ${selected === l.key ? 'lane-selected' : ''}`}
                style={{ top: l.y, height: l.height, width: layout.width }}
              >
                <div
                  className="lane-identity"
                  style={{ width: laneWidth, height: l.height }}
                >
                  <Button
                    variant="ghost"
                    className="assistant-select"
                    aria-pressed={selected === l.key}
                    onClick={() =>
                      setSelected((s) => (s === l.key ? null : l.key))
                    }
                  >
                    <Avatar>
                      <AvatarImage
                        src={l.assistant.avatarUrl ?? undefined}
                        alt={l.assistant.displayName}
                      />
                      <AvatarFallback>
                        {l.assistant.avatarEmoji ??
                          l.assistant.displayName.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <strong>{l.title}</strong>
                      <p>{l.assistant.displayName}</p>
                      {!l.assistant.available && (
                        <span>{t('unavailable')}</span>
                      )}
                    </div>
                  </Button>
                  <ExecutionMarkers records={l.executions} onError={onError} />
                </div>
                {flow.stages.map((s, i) => (
                  <div
                    key={s.key}
                    className="lane-cell"
                    style={{
                      left: laneWidth + i * stageWidth,
                      width: stageWidth,
                      height: l.height,
                    }}
                  />
                ))}
              </div>
            ))}
            <svg
              className="edge-layer"
              width={layout.width}
              height={layout.height}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {flow.edges.map((e, i) => {
                const a = layout.nodes.find((n) => n.key === e.from),
                  b = layout.nodes.find((n) => n.key === e.to)
                if (!a || !b) return null
                const same = a.x === b.x
                const x1 = same ? a.x + a.w / 2 : a.x + a.w,
                  y1 = same ? a.y + a.h : a.y + a.h / 2,
                  x2 = same ? b.x + b.w / 2 : b.x,
                  y2 = same ? b.y : b.y + b.h / 2
                const mid = (x1 + x2) / 2
                const path = same
                  ? `M${x1},${y1} L${x2},${y2}`
                  : `M${x1},${y1} H${mid} V${y2} H${x2}`
                return (
                  <g key={`${e.from}-${e.to}`} className={`edge-${e.state}`}>
                    <path d={path} fill="none" markerEnd="url(#arrow)" />
                    {e.outcome && (
                      <text
                        x={same ? x1 + 10 : mid + 4}
                        y={same ? (y1 + y2) / 2 : y2 - 7}
                      >
                        {e.outcome === 'conflict'
                          ? t('conflictBranch')
                          : t('clearBranch')}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            {layout.nodes.map((n) =>
              n.kind === 'router' ? (
                <div
                  className={`logic-node ${selected && selected !== n.laneKey ? 'lane-dimmed' : ''}`}
                  key={n.key}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                >
                  <Button
                    variant="outline"
                    className={`diamond status-${n.status}`}
                    aria-label={n.title}
                    onClick={() => onNode(n)}
                  >
                    <GitBranch size={18} />
                  </Button>
                  <span>{n.title}</span>
                </div>
              ) : n.kind === 'terminal' ? (
                <div
                  className="terminal-node"
                  key={n.key}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                >
                  <Flag size={18} />
                  <span>{n.title}</span>
                  <Status value={n.status} />
                </div>
              ) : (
                <div
                  key={n.key}
                  data-node={n.key}
                  className={`task-card status-border-${n.status} ${selected && selected !== n.laneKey ? 'lane-dimmed' : ''}`}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                >
                  <Button
                    variant="ghost"
                    className="task-open"
                    onClick={() => onNode(n)}
                  >
                    <span>{n.title}</span>
                    <Status value={n.status} />
                  </Button>
                  <ExecutionMarkers records={n.executions} onError={onError} />
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
