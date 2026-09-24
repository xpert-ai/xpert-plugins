// Explicit mapping from Xpert's remote UI token contract to the local shadcn surface.
const tokens = {
 fontFamily: '--xui-font-family', colorBackground: '--xui-color-background', colorForeground: '--xui-color-foreground',
 colorPrimary: '--xui-color-primary', colorPrimaryForeground: '--xui-color-primary-foreground',
 colorMuted: '--xui-color-muted', colorMutedForeground: '--xui-color-muted-foreground', colorBorder: '--xui-color-border',
 colorInput: '--xui-color-input', colorRing: '--xui-color-ring', colorDestructive: '--xui-color-destructive',
 colorSecondary: '--xui-color-secondary', colorSecondaryForeground: '--xui-color-secondary-foreground',
 colorAccent: '--xui-color-accent', colorAccentForeground: '--xui-color-accent-foreground',
 colorPopover: '--xui-color-popover', colorPopoverForeground: '--xui-color-popover-foreground',
 radiusLg: '--xui-radius', controlHeight: '--xui-control-height', fontSizeControl: '--xui-font-size-control'
} as const
export function applyHostTheme(theme?: { mode?: string; density?: string; tokens?: Record<string, string> }) {
 const root = document.documentElement
 for (const [key, variable] of Object.entries(tokens)) {
  const value = theme?.tokens?.[key]
  if (value?.trim()) root.style.setProperty(variable, value.trim())
 }
 root.style.colorScheme = theme?.mode === 'dark' ? 'dark' : 'light'
 root.dataset.theme = theme?.mode === 'dark' ? 'dark' : 'light'
 root.dataset.density = theme?.density === 'compact' ? 'compact' : 'default'
}
