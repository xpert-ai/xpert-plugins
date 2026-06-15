import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '../utils.js'

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) =>
  React.createElement(
    ScrollAreaPrimitive.Root,
    {
      ref,
      className: cn('xps-scroll-area', className),
      ...props
    },
    React.createElement(
      ScrollAreaPrimitive.Viewport,
      { className: 'xps-scroll-area-viewport' },
      children
    ),
    React.createElement(ScrollBar, null),
    React.createElement(ScrollAreaPrimitive.Corner, null)
  )
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

export const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) =>
  React.createElement(
    ScrollAreaPrimitive.ScrollAreaScrollbar,
    {
      ref,
      orientation,
      className: cn('xps-scroll-bar', orientation === 'vertical' ? 'xps-scroll-bar-vertical' : 'xps-scroll-bar-horizontal', className),
      ...props
    },
    React.createElement(ScrollAreaPrimitive.ScrollAreaThumb, {
      className: 'xps-scroll-thumb'
    })
  )
)
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName
