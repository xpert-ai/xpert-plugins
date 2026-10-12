import type { McpUiStyles } from '@modelcontextprotocol/ext-apps'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type { MapsTheme } from './transports/types'

// Public Remote View token names. Components consume shadcn semantic variables.
const remoteTokens = {
  fontFamily: 'font-family', densityRootFontSize: 'density-root-font-size',
  colorBackground: 'color-background', colorForeground: 'color-foreground',
  colorCard: 'color-card', colorCardForeground: 'color-card-foreground',
  colorPopover: 'color-popover', colorPopoverForeground: 'color-popover-foreground',
  colorPrimary: 'color-primary', colorPrimaryForeground: 'color-primary-foreground',
  colorSecondary: 'color-secondary', colorSecondaryForeground: 'color-secondary-foreground',
  colorMuted: 'color-muted', colorMutedForeground: 'color-muted-foreground',
  colorAccent: 'color-accent', colorAccentForeground: 'color-accent-foreground',
  colorBorder: 'color-border', colorInput: 'color-input', colorRing: 'color-ring',
  colorDestructive: 'color-destructive', colorDestructiveForeground: 'color-destructive-foreground',
  colorDestructiveBackground: 'color-destructive-background',
  colorSuccess: 'color-success', colorSuccessBackground: 'color-success-background',
  colorWarning: 'color-warning', colorInfo: 'color-info',
  colorChart1: 'color-chart-1', colorChart2: 'color-chart-2', colorChart3: 'color-chart-3',
  colorChart4: 'color-chart-4', colorChart5: 'color-chart-5',
  radiusSm: 'radius-sm', radiusMd: 'radius-md', radiusLg: 'radius-lg',
  fontSize: 'font-size', fontSizeXs: 'font-size-xs', fontSizeSm: 'font-size-sm',
  fontSizeMd: 'font-size-md', fontSizeLg: 'font-size-lg', fontSizeControl: 'font-size-control',
  fontSizeButton: 'font-size-button', fontSizeTable: 'font-size-table',
  controlHeight: 'control-height', buttonHeight: 'button-height', buttonHeightSm: 'button-height-sm'
} as const

const mcpTokens = {
  '--color-background-primary': 'color-background', '--color-text-primary': 'color-foreground',
  '--color-background-secondary': 'color-card', '--color-background-tertiary': 'color-muted',
  '--color-text-secondary': 'color-muted-foreground',
  '--color-background-inverse': 'color-primary', '--color-text-inverse': 'color-primary-foreground',
  '--color-text-danger': 'color-destructive', '--color-background-danger': 'color-destructive-background',
  '--color-text-success': 'color-success', '--color-background-success': 'color-success-background',
  '--color-text-warning': 'color-warning', '--color-text-info': 'color-info',
  '--color-border-primary': 'color-border', '--color-ring-primary': 'color-ring',
  '--font-sans': 'font-family', '--font-text-md-size': 'density-root-font-size',
  '--font-text-xs-size': 'font-size-xs', '--font-text-sm-size': 'font-size-sm', '--font-text-lg-size': 'font-size-lg',
  '--border-radius-sm': 'radius-sm', '--border-radius-md': 'radius-md', '--border-radius-lg': 'radius-lg'
} as const satisfies Partial<Record<keyof McpUiStyles, string>>

export function normalizeWorkbenchTheme(tokens: MapsTheme['tokens'] = {}): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, suffix] of Object.entries(remoteTokens)) {
    const value = tokens[name] ?? tokens[`--xui-${suffix}`]
    if (value?.trim()) result[`--xui-${suffix}`] = value.trim()
  }
  return result
}

export function normalizeMcpTheme(styles: Partial<McpUiStyles> = {}): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, suffix] of Object.entries(mcpTokens)) {
    const value = styles[name as keyof typeof mcpTokens]
    if (value?.trim()) result[`--xui-${suffix}`] = value.trim()
  }
  // MCP has fewer semantic roles than shadcn. Derive the missing roles from
  // the current standard snapshot before falling back to the host's legacy
  // CSS, which may have been injected only once when the iframe was created.
  const derived = {
    'color-input': styles['--color-border-primary'],
    'color-card-foreground': styles['--color-text-primary'],
    'color-popover': styles['--color-background-secondary'] ?? styles['--color-background-primary'],
    'color-popover-foreground': styles['--color-text-primary'],
    'color-secondary': styles['--color-background-tertiary'] ?? styles['--color-background-secondary'],
    'color-secondary-foreground': styles['--color-text-primary'],
    'color-accent': styles['--color-background-tertiary'] ?? styles['--color-background-secondary'],
    'color-accent-foreground': styles['--color-text-primary'],
    'color-destructive-foreground': styles['--color-text-inverse']
  }
  for (const [suffix, value] of Object.entries(derived)) {
    if (value?.trim()) result[`--xui-${suffix}`] = value.trim()
  }
  return result
}

let installedTokens = new Set<string>()
let installedMcpVariables = new Set<string>()

export function installMapsTheme(theme: MapsTheme) {
  const root = document.documentElement
  root.dataset.theme = theme.scheme
  root.dataset.mapsThemeSource = theme.source ?? 'workbench'
  root.classList.toggle('dark', theme.scheme === 'dark')
  root.style.colorScheme = theme.scheme

  // Token snapshots replace the variables owned by this adapter. Removed values
  // reveal the new scheme's fallback without disturbing unrelated host styles.
  const variables = theme.source === 'mcp' ? theme.styles?.variables : undefined
  for (const key of installedMcpVariables) root.style.removeProperty(key)
  for (const [key, value] of Object.entries(variables ?? {})) {
    if (value?.trim()) root.style.setProperty(key, value.trim())
  }
  installedMcpVariables = new Set(Object.keys(variables ?? {}))
  const tokens = theme.source === 'mcp' ? normalizeMcpTheme(variables) : normalizeWorkbenchTheme(theme.tokens)
  for (const key of installedTokens) if (!(key in tokens)) root.style.removeProperty(key)
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(key, value)
  installedTokens = new Set(Object.keys(tokens))

  // The SDK font helper is first-install-only; host font snapshots can change.
  let fonts = document.getElementById('maps-host-fonts')
  const fontCss = theme.source === 'mcp' ? theme.styles?.css?.fonts : undefined
  if (fontCss) {
    if (!fonts) { fonts = document.createElement('style'); fonts.id = 'maps-host-fonts'; document.head.appendChild(fonts) }
    fonts.textContent = fontCss
  } else fonts?.remove()
  installShadcnThemeVars({ density: theme.density ?? 'default' })
}
