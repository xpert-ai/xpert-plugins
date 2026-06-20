import * as React from 'react'
import { cn } from '../utils.js'
import { Button, type ButtonProps } from './button.js'

export type SidebarProps = React.HTMLAttributes<HTMLElement> & {
  side?: 'left' | 'right'
  collapsed?: boolean
}

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, side = 'left', collapsed = false, ...props }, ref) =>
    React.createElement('aside', {
      ref,
      className: cn('xps-sidebar', `xps-sidebar--${side}`, collapsed && 'xps-sidebar--collapsed', className),
      'data-side': side,
      'data-state': collapsed ? 'collapsed' : 'expanded',
      'aria-expanded': !collapsed,
      ...props
    })
)
Sidebar.displayName = 'Sidebar'

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-header', className),
      ...props
    })
)
SidebarHeader.displayName = 'SidebarHeader'

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-content', className),
      ...props
    })
)
SidebarContent.displayName = 'SidebarContent'

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-footer', className),
      ...props
    })
)
SidebarFooter.displayName = 'SidebarFooter'

export const SidebarTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('span', {
      ref,
      className: cn('xps-sidebar-title', className),
      ...props
    })
)
SidebarTitle.displayName = 'SidebarTitle'

export const SidebarRail = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-rail', className),
      ...props
    })
)
SidebarRail.displayName = 'SidebarRail'

export type SidebarTriggerProps = ButtonProps

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, SidebarTriggerProps>(
  ({ className, variant = 'ghost', size = 'icon', ...props }, ref) =>
    React.createElement(Button, {
      ref,
      className: cn('xps-sidebar-trigger', className),
      variant,
      size,
      ...props
    })
)
SidebarTrigger.displayName = 'SidebarTrigger'

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-group', className),
      ...props
    })
)
SidebarGroup.displayName = 'SidebarGroup'

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-group-label', className),
      ...props
    })
)
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

export const SidebarMenu = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-menu', className),
      ...props
    })
)
SidebarMenu.displayName = 'SidebarMenu'

export const SidebarMenuItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-sidebar-menu-item', className),
      ...props
    })
)
SidebarMenuItem.displayName = 'SidebarMenuItem'

export type SidebarMenuButtonProps = ButtonProps & {
  active?: boolean
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, active = false, variant = 'ghost', ...props }, ref) =>
    React.createElement(Button, {
      ref,
      variant,
      className: cn('xps-sidebar-menu-button', active && 'xps-sidebar-menu-button--active', className),
      ...props
    })
)
SidebarMenuButton.displayName = 'SidebarMenuButton'
