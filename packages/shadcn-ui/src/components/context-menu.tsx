import * as React from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '../utils.js'

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger
export const ContextMenuPortal = ContextMenuPrimitive.Portal
export const ContextMenuGroup = ContextMenuPrimitive.Group
export const ContextMenuSub = ContextMenuPrimitive.Sub
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup

export const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.Portal, null,
    React.createElement(ContextMenuPrimitive.Content, { ref, className: cn('xps-context-menu-content', className), ...props }))
)
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

export const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.Item, {
    ref,
    className: cn('xps-context-menu-item', inset && 'xps-context-menu-item--inset', className),
    ...props
  })
)
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName

export const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.CheckboxItem, { ref, checked, className: cn('xps-context-menu-item xps-context-menu-item--checked', className), ...props },
    React.createElement('span', { className: 'xps-context-menu-indicator' },
      React.createElement(ContextMenuPrimitive.ItemIndicator, null, React.createElement(Check, { className: 'xps-icon' }))),
    children))
ContextMenuCheckboxItem.displayName = ContextMenuPrimitive.CheckboxItem.displayName

export const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.Label, { ref, className: cn('xps-context-menu-label', inset && 'xps-context-menu-item--inset', className), ...props }))
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName

export const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.Separator, { ref, className: cn('xps-context-menu-separator', className), ...props }))
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName

export const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.SubTrigger, { ref, className: cn('xps-context-menu-item', inset && 'xps-context-menu-item--inset', className), ...props },
    children, React.createElement(ChevronRight, { className: 'xps-icon xps-context-menu-chevron' })))
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName

export const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) =>
  React.createElement(ContextMenuPrimitive.SubContent, { ref, className: cn('xps-context-menu-content', className), ...props }))
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName
