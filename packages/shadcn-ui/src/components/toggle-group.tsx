import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cn } from '../utils.js'

export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) =>
  React.createElement(ToggleGroupPrimitive.Root, { ref, className: cn('xps-toggle-group', className), ...props }))
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) =>
  React.createElement(ToggleGroupPrimitive.Item, { ref, className: cn('xps-toggle-group-item', className), ...props }))
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName
