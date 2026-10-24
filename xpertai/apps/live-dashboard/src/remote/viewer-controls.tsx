import * as React from 'react'
import { Button, buttonVariants, cn, ChevronUp, MoreHorizontal, Popover, PopoverContent, PopoverTrigger, RefreshCw } from '@xpert-ai/plugin-shadcn-ui'
import type { messages } from './i18n'

/** Viewing controls overlay the canvas; opening them never resizes the dashboard. */
export function ViewerControls({ children, busy, t }: { children: React.ReactNode; busy: boolean; t: ReturnType<typeof messages> }) {
  const [open, setOpen] = React.useState(false)
  const pinned = React.useRef(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const restoreFocus = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()
  const cancelClose = () => { clearTimeout(timer.current) }
  const changeOpen = (next: boolean) => { cancelClose(); if (!next) pinned.current = false; setOpen(next) }
  const enter = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    cancelClose(); setOpen(true)
  }
  const leave = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse' || pinned.current) return
    cancelClose()
    // Bridge the gap between the button and its portaled panel.
    timer.current = setTimeout(() => { if (!pinned.current) setOpen(false) }, 180)
  }
  React.useEffect(() => () => clearTimeout(timer.current), [])
  React.useEffect(() => {
    if (!open) return
    let check: ReturnType<typeof setTimeout>
    // Clicks inside the dashboard iframe do not bubble to Radix's outside-click listener.
    const blur = () => { check = setTimeout(() => {
      if (document.activeElement instanceof HTMLIFrameElement) changeOpen(false)
    }, 0) }
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('blur', blur); clearTimeout(check) }
  }, [open])
  return <Popover open={open} onOpenChange={changeOpen}>
    <div className="viewer-controls-trigger">
      <PopoverTrigger asChild>
        <button ref={trigger} type="button" className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'viewer-controls-button')} aria-label={t.viewerControls}
          title={t.viewerControls} onPointerEnter={enter} onPointerLeave={leave} onClick={event => {
            event.preventDefault()
            cancelClose()
            if (pinned.current) changeOpen(false)
            else { pinned.current = true; setOpen(true) }
          }}>
          {busy ? <RefreshCw className="motion-safe:animate-spin" aria-hidden="true"/> : <MoreHorizontal aria-hidden="true"/>}
          {busy && <span role="status" className="sr-only">{t.loading}</span>}
        </button>
      </PopoverTrigger>
    </div>
    <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={12} aria-label={t.viewerControls}
      className="viewer-controls-panel w-[min(44rem,calc(100vw-24px))] gap-0 p-0"
      onPointerEnter={enter} onPointerLeave={leave} onPointerDownCapture={() => { pinned.current = true }}
      onFocusCapture={() => { pinned.current = true }}
      onOpenAutoFocus={event => { if (!pinned.current) event.preventDefault() }}
      onEscapeKeyDown={() => { restoreFocus.current = true }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        if (restoreFocus.current) trigger.current?.focus({ preventScroll: true })
        restoreFocus.current = false
      }}>
      {children}
      <Button variant="ghost" size="icon" className="viewer-controls-close" aria-label={t.hideViewerControls}
        title={t.hideViewerControls} onClick={() => { restoreFocus.current = true; changeOpen(false) }}><ChevronUp aria-hidden="true"/></Button>
    </PopoverContent>
  </Popover>
}
