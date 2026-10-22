import React, { useEffect, useRef, useState } from 'react'
import { Columns2 } from 'lucide-react'
import {
  buttonVariants,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@xpert-ai/plugin-shadcn-ui'
import { i18n } from './i18n'

const MIN_WIDTH = 240
const DETAIL_MIN_WIDTH = 360
const HANDLE_WIDTH = 6

/** Width is view-local UI state; shrinking the host never discards the user's preferred width. */
export function useQueueResize(enabled: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [preferred, setPreferred] = useState<number | null>(null)
  const [bounds, setBounds] = useState({ max: 640, initial: 360 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; x: number; width: number; previous: number | null } | null>(null)
  const clamp = (value: number) => Math.round(Math.max(MIN_WIDTH, Math.min(bounds.max, value)))
  const width = clamp(preferred ?? bounds.initial)
  useEffect(() => {
    const queue = ref.current,
      parent = queue?.parentElement,
      navigation = queue?.previousElementSibling
    if (!enabled || !parent) return
    const measure = () => {
      const available = parent.clientWidth - (navigation?.getBoundingClientRect().width ?? 0)
      setBounds({
        max: Math.max(MIN_WIDTH, Math.min(640, available - DETAIL_MIN_WIDTH - HANDLE_WIDTH)),
        initial: Math.max(266, Math.min(420, window.innerWidth * 0.27))
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    if (navigation) observer.observe(navigation)
    measure()
    return () => observer.disconnect()
  }, [enabled])
  useEffect(() => {
    if (!dragging) return
    const style = document.documentElement.style,
      cursor = style.cursor,
      select = style.userSelect
    style.cursor = 'col-resize'
    style.userSelect = 'none'
    return () => {
      style.cursor = cursor
      style.userSelect = select
    }
  }, [dragging])
  useEffect(() => {
    if (!enabled) {
      drag.current = null
      setDragging(false)
    }
  }, [enabled])
  const finish = (element: HTMLDivElement, cancel = false) => {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (cancel) setPreferred(current.previous)
    setDragging(false)
    if (element.hasPointerCapture(current.id)) element.releasePointerCapture(current.id)
  }
  return {
    ref,
    width,
    max: bounds.max,
    dragging,
    setWidth: (value: number | null) => setPreferred(value === null ? null : clamp(value)),
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': bounds.max,
      'aria-valuenow': width,
      'aria-controls': 'review-pr-queue',
      onDoubleClick: () => setPreferred(null),
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: event.pointerId, x: event.clientX, width, previous: preferred }
        setDragging(true)
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id === event.pointerId)
          setPreferred(clamp(drag.current.width + event.clientX - drag.current.x))
      },
      onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => finish(event.currentTarget),
      onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => finish(event.currentTarget, true),
      onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => finish(event.currentTarget),
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
          finish(event.currentTarget, true)
          return
        }
        const next =
          event.key === 'ArrowLeft'
            ? width - 24
            : event.key === 'ArrowRight'
            ? width + 24
            : event.key === 'Home'
            ? MIN_WIDTH
            : event.key === 'End'
            ? bounds.max
            : null
        if (next !== null) {
          event.preventDefault()
          setPreferred(clamp(next))
        }
      }
    }
  }
}

export function QueueWidthMenu({ locale, onWidth }: { locale: string; onWidth: (width: number | null) => void }) {
  const { t } = i18n(locale)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`${buttonVariants({ variant: 'ghost', size: 'icon' })} review-queue-width-menu shrink-0`}
          aria-label={t('queueWidth')}
          title={t('queueWidth')}
        >
          <Columns2 className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onWidth(280)}>{t('queueNarrow')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onWidth(400)}>{t('queueMedium')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onWidth(560)}>{t('queueWide')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onWidth(null)}>{t('queueReset')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
