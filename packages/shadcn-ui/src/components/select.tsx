import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../utils.js'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) =>
  React.createElement(
    SelectPrimitive.Trigger,
    {
      ref,
      className: cn('xps-select-trigger', className),
      ...props
    },
    children,
    React.createElement(
      SelectPrimitive.Icon,
      { asChild: true },
      React.createElement(ChevronDown, {
        className: 'xps-icon'
      })
    )
  )
)
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) =>
  React.createElement(
    SelectPrimitive.ScrollUpButton,
    {
      ref,
      className: cn('xps-select-scroll-button', className),
      ...props
    },
    React.createElement(ChevronUp, {
      className: 'xps-icon'
    })
  )
)
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

export const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) =>
  React.createElement(
    SelectPrimitive.ScrollDownButton,
    {
      ref,
      className: cn('xps-select-scroll-button', className),
      ...props
    },
    React.createElement(ChevronDown, {
      className: 'xps-icon'
    })
  )
)
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) =>
  React.createElement(
    SelectPrimitive.Portal,
    null,
    React.createElement(
      SelectPrimitive.Content,
      {
        ref,
        className: cn('xps-select-content', position === 'popper' && 'xps-select-content-popper', className),
        position,
        ...props
      },
      React.createElement(SelectScrollUpButton, null),
      React.createElement(
        SelectPrimitive.Viewport,
        {
          className: cn('xps-select-viewport', position === 'popper' && 'xps-select-viewport-popper')
        },
        children
      ),
      React.createElement(SelectScrollDownButton, null)
    )
  )
)
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) =>
  React.createElement(SelectPrimitive.Label, {
    ref,
    className: cn('xps-select-label', className),
    ...props
  })
)
SelectLabel.displayName = SelectPrimitive.Label.displayName

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) =>
  React.createElement(
    SelectPrimitive.Item,
    {
      ref,
      className: cn('xps-select-item', className),
      ...props
    },
    React.createElement(
      'span',
      { className: 'xps-select-item-indicator' },
      React.createElement(
        SelectPrimitive.ItemIndicator,
        null,
        React.createElement(Check, {
          className: 'xps-icon'
        })
      )
    ),
    React.createElement(SelectPrimitive.ItemText, null, children)
  )
)
SelectItem.displayName = SelectPrimitive.Item.displayName

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) =>
  React.createElement(SelectPrimitive.Separator, {
    ref,
    className: cn('xps-select-separator', className),
    ...props
  })
)
SelectSeparator.displayName = SelectPrimitive.Separator.displayName
