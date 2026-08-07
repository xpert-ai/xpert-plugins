import * as React from 'react'

const h: typeof React.createElement = React.createElement

type PanelSide = 'left' | 'right'

export function StudioPanelLayout(props: {
  children: React.ReactNode
  storageKey: string
  leftLabel: string
  rightLabel: string
  leftDefault?: number
  rightDefault?: number
  className?: string
  testId?: string
}) {
  const leftDefault = props.leftDefault ?? 270
  const rightDefault = props.rightDefault ?? 330
  const [sizes, setSizes] = React.useState(() =>
    readPanelSizes(props.storageKey, leftDefault, rightDefault)
  )
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setSizes(readPanelSizes(props.storageKey, leftDefault, rightDefault))
  }, [props.storageKey, leftDefault, rightDefault])

  function update(side: PanelSide, value: number) {
    const width = containerRef.current?.getBoundingClientRect().width ?? 1200
    const next = clampPanelSizes(
      side === 'left' ? { ...sizes, left: value } : { ...sizes, right: value },
      width
    )
    setSizes(next)
    writePanelSizes(props.storageKey, next)
  }

  function beginResize(side: PanelSide, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const startX = event.clientX
    const start = sizes[side]
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)
    const move = (nextEvent: PointerEvent) => {
      const delta = nextEvent.clientX - startX
      update(side, start + (side === 'left' ? delta : -delta))
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  function handleKey(side: PanelSide, event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    update(side, sizes[side] + direction * (side === 'left' ? 16 : -16))
  }

  function reset(side: PanelSide) {
    update(side, side === 'left' ? leftDefault : rightDefault)
  }

  return (
    <div
      ref={containerRef}
      className={`studio-panel-layout ${props.className ?? ''}`}
      data-testid={props.testId}
      style={{
        '--studio-left-panel': `${sizes.left}px`,
        '--studio-right-panel': `${sizes.right}px`
      } as React.CSSProperties}
    >
      {props.children}
      <PanelHandle
        side="left"
        label={props.leftLabel}
        value={sizes.left}
        onPointerDown={(event) => beginResize('left', event)}
        onKeyDown={(event) => handleKey('left', event)}
        onDoubleClick={() => reset('left')}
      />
      <PanelHandle
        side="right"
        label={props.rightLabel}
        value={sizes.right}
        onPointerDown={(event) => beginResize('right', event)}
        onKeyDown={(event) => handleKey('right', event)}
        onDoubleClick={() => reset('right')}
      />
    </div>
  )
}

function PanelHandle(props: {
  side: PanelSide
  label: string
  value: number
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>
  onDoubleClick: React.MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <button
      type="button"
      className={`studio-panel-resize-handle is-${props.side}`}
      role="separator"
      aria-label={props.label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(props.value)}
      aria-valuemin={props.side === 'left' ? 210 : 260}
      aria-valuemax={props.side === 'left' ? 520 : 560}
      title={props.label}
      onPointerDown={props.onPointerDown}
      onKeyDown={props.onKeyDown}
      onDoubleClick={props.onDoubleClick}
    >
      <span aria-hidden="true" />
    </button>
  )
}

function readPanelSizes(storageKey: string, left: number, right: number) {
  try {
    const raw = localStorage.getItem(`story-studio:panels:${storageKey}`)
    if (!raw) return { left, right }
    const parsed = JSON.parse(raw) as { left?: number; right?: number }
    return {
      left: typeof parsed.left === 'number' ? parsed.left : left,
      right: typeof parsed.right === 'number' ? parsed.right : right
    }
  } catch {
    return { left, right }
  }
}

function writePanelSizes(storageKey: string, sizes: { left: number; right: number }) {
  try {
    localStorage.setItem(`story-studio:panels:${storageKey}`, JSON.stringify(sizes))
  } catch {
    // The layout remains resizable when storage is unavailable.
  }
}

function clampPanelSizes(
  sizes: { left: number; right: number },
  containerWidth: number
) {
  const left = Math.max(210, Math.min(520, sizes.left))
  const right = Math.max(260, Math.min(560, sizes.right))
  const centerMinimum = Math.min(620, Math.max(420, containerWidth * 0.42))
  const available = Math.max(470, containerWidth - centerMinimum)
  if (left + right <= available) return { left, right }
  const overflow = left + right - available
  const leftShare = left / (left + right)
  return {
    left: Math.max(210, left - overflow * leftShare),
    right: Math.max(260, right - overflow * (1 - leftShare))
  }
}
