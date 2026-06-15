import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { cn } from '../utils.js'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) =>
  React.createElement(
    DropdownMenuPrimitive.SubTrigger,
    {
      ref,
      className: cn('xps-dropdown-menu-sub-trigger', inset && 'xps-dropdown-menu-item--inset', className),
      ...props
    },
    children,
    React.createElement(ChevronRight, { className: 'xps-icon' })
  )
)
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) =>
  React.createElement(DropdownMenuPrimitive.SubContent, {
    ref,
    className: cn('xps-dropdown-menu-content', className),
    ...props
  })
)
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) =>
  React.createElement(
    DropdownMenuPrimitive.Portal,
    null,
    React.createElement(DropdownMenuPrimitive.Content, {
      ref,
      sideOffset,
      className: cn('xps-dropdown-menu-content', className),
      ...props
    })
  )
)
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) =>
  React.createElement(DropdownMenuPrimitive.Item, {
    ref,
    className: cn('xps-dropdown-menu-item', inset && 'xps-dropdown-menu-item--inset', className),
    ...props
  })
)
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) =>
  React.createElement(
    DropdownMenuPrimitive.CheckboxItem,
    {
      ref,
      className: cn('xps-dropdown-menu-item xps-dropdown-menu-check-item', className),
      checked,
      ...props
    },
    React.createElement(
      'span',
      { className: 'xps-dropdown-menu-item-indicator' },
      React.createElement(
        DropdownMenuPrimitive.ItemIndicator,
        null,
        React.createElement(Check, { className: 'xps-icon' })
      )
    ),
    children
  )
)
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) =>
  React.createElement(
    DropdownMenuPrimitive.RadioItem,
    {
      ref,
      className: cn('xps-dropdown-menu-item xps-dropdown-menu-check-item', className),
      ...props
    },
    React.createElement(
      'span',
      { className: 'xps-dropdown-menu-item-indicator' },
      React.createElement(
        DropdownMenuPrimitive.ItemIndicator,
        null,
        React.createElement(Circle, { className: 'xps-icon xps-icon--filled' })
      )
    ),
    children
  )
)
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) =>
  React.createElement(DropdownMenuPrimitive.Label, {
    ref,
    className: cn('xps-dropdown-menu-label', inset && 'xps-dropdown-menu-item--inset', className),
    ...props
  })
)
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) =>
  React.createElement(DropdownMenuPrimitive.Separator, {
    ref,
    className: cn('xps-dropdown-menu-separator', className),
    ...props
  })
)
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export const DropdownMenuShortcut = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('span', {
      ref,
      className: cn('xps-dropdown-menu-shortcut', className),
      ...props
    })
)
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'
