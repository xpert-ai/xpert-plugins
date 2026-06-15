import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../utils.js'

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) =>
  React.createElement(TabsPrimitive.List, {
    ref,
    className: cn('xps-tabs-list', className),
    ...props
  })
)
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) =>
  React.createElement(TabsPrimitive.Trigger, {
    ref,
    className: cn('xps-tabs-trigger', className),
    ...props
  })
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) =>
  React.createElement(TabsPrimitive.Content, {
    ref,
    className: cn('xps-tabs-content', className),
    ...props
  })
)
TabsContent.displayName = TabsPrimitive.Content.displayName
