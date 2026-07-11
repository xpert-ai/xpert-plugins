import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '../utils.js'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 6, ...props }, ref) =>
  React.createElement(PopoverPrimitive.Portal, null,
    React.createElement(PopoverPrimitive.Content, { ref, align, sideOffset, className: cn('xps-popover-content', className), ...props })))
PopoverContent.displayName = PopoverPrimitive.Content.displayName
