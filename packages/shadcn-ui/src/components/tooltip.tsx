import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../utils.js'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) =>
  React.createElement(
    TooltipPrimitive.Portal,
    null,
    React.createElement(TooltipPrimitive.Content, {
      ref,
      sideOffset,
      className: cn('xps-tooltip-content', className),
      ...props
    })
  )
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName
