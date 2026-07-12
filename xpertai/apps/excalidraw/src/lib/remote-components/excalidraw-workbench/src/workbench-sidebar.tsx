import { React, h } from './vendor'
import { Button } from '@xpert-ai/plugin-shadcn-ui'

type SidebarProps = React.HTMLAttributes<HTMLElement> & {
  side?: 'left' | 'right'
  collapsed?: boolean
}

export function Sidebar({ side = 'left', collapsed = false, ...props }: SidebarProps) {
  return (
    <aside
      data-sidebar-slot="sidebar"
      data-side={side}
      data-collapsed={collapsed}
      aria-expanded={!collapsed}
      {...props}
    />
  )
}

export function SidebarHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="header" {...props} />
}

export function SidebarContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="content" {...props} />
}

export function SidebarFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="footer" {...props} />
}

export function SidebarTitle(props: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-sidebar-slot="title" {...props} />
}

export function SidebarRail(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="rail" {...props} />
}

export function SidebarTrigger({
  variant = 'ghost',
  size = 'icon',
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button data-sidebar-slot="trigger" variant={variant} size={size} {...props} />
}

export function SidebarGroup(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="group" {...props} />
}

export function SidebarGroupLabel(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="group-label" {...props} />
}

export function SidebarMenu(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="menu" {...props} />
}

export function SidebarMenuItem(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar-slot="menu-item" {...props} />
}

export function SidebarMenuButton({
  isActive = false,
  variant = 'ghost',
  ...props
}: React.ComponentProps<typeof Button> & { isActive?: boolean }) {
  return (
    <Button
      data-sidebar-slot="menu-button"
      data-active={isActive}
      variant={variant}
      {...props}
    />
  )
}

