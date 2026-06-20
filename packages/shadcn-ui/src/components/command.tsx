import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { cn } from '../utils.js'

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) =>
  React.createElement(CommandPrimitive, {
    ref,
    className: cn('xps-command', className),
    ...props
  })
)
Command.displayName = CommandPrimitive.displayName

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) =>
  React.createElement(
    'div',
    { className: 'xps-command-input-wrapper', 'cmdk-input-wrapper': '' },
    React.createElement(Search, { className: 'xps-icon' }),
    React.createElement(CommandPrimitive.Input, {
      ref,
      className: cn('xps-command-input', className),
      ...props
    })
  )
)
CommandInput.displayName = CommandPrimitive.Input.displayName

export const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) =>
  React.createElement(CommandPrimitive.List, {
    ref,
    className: cn('xps-command-list', className),
    ...props
  })
)
CommandList.displayName = CommandPrimitive.List.displayName

export const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) =>
  React.createElement(CommandPrimitive.Empty, {
    ref,
    className: cn('xps-command-empty', className),
    ...props
  })
)
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) =>
  React.createElement(CommandPrimitive.Group, {
    ref,
    className: cn('xps-command-group', className),
    ...props
  })
)
CommandGroup.displayName = CommandPrimitive.Group.displayName

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) =>
  React.createElement(CommandPrimitive.Item, {
    ref,
    className: cn('xps-command-item', className),
    ...props
  })
)
CommandItem.displayName = CommandPrimitive.Item.displayName

export const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) =>
  React.createElement(CommandPrimitive.Separator, {
    ref,
    className: cn('xps-command-separator', className),
    ...props
  })
)
CommandSeparator.displayName = CommandPrimitive.Separator.displayName
