export type RenderPencilRemoteVueIframeHtmlOptions = {
  title: string
  appScript: string
  appCss?: string
  lang?: string
}

// Runs before the Vue module so host theme tokens are available during first paint.
const PENCIL_REMOTE_UI_BOOTSTRAP = `
(function () {
  var CHANNEL = 'xpertai.remote_component'
  var VERSION = 1
  var TOKEN_MAP = {
    fontFamily: '--xui-font-family',
    colorBackground: '--xui-color-background',
    colorForeground: '--xui-color-foreground',
    colorCard: '--xui-color-card',
    colorCardForeground: '--xui-color-card-foreground',
    colorMuted: '--xui-color-muted',
    colorMutedForeground: '--xui-color-muted-foreground',
    colorBorder: '--xui-color-border',
    colorInput: '--xui-color-input',
    colorPrimary: '--xui-color-primary',
    colorPrimaryForeground: '--xui-color-primary-foreground',
    colorSecondary: '--xui-color-secondary',
    colorSecondaryForeground: '--xui-color-secondary-foreground',
    colorAccent: '--xui-color-accent',
    colorAccentForeground: '--xui-color-accent-foreground',
    colorPopover: '--xui-color-popover',
    colorPopoverForeground: '--xui-color-popover-foreground',
    colorRing: '--xui-color-ring',
    colorDestructive: '--xui-color-destructive',
    colorDestructiveBackground: '--xui-color-destructive-background',
    colorSuccess: '--xui-color-success',
    colorSuccessBackground: '--xui-color-success-background',
    colorWarning: '--xui-color-warning',
    colorWarningBackground: '--xui-color-warning-background',
    radiusSm: '--xui-radius-sm',
    radiusMd: '--xui-radius-md',
    radiusLg: '--xui-radius-lg',
    fontSizeXs: '--xui-font-size-xs',
    fontSizeSm: '--xui-font-size-sm',
    fontSizeMd: '--xui-font-size-md',
    fontSizeLg: '--xui-font-size-lg',
    fontSizeControl: '--xui-font-size-control',
    fontSizeButton: '--xui-font-size-button',
    fontSizeTable: '--xui-font-size-table',
    controlHeight: '--xui-control-height',
    buttonHeight: '--xui-button-height',
    buttonHeightSm: '--xui-button-height-sm'
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function applyTheme(theme) {
    var mode = typeof theme === 'string' ? theme : isObject(theme) ? theme.mode : null
    var tokens = isObject(theme) && isObject(theme.tokens) ? theme.tokens : {}
    document.documentElement.dataset.theme = mode === 'dark' ? 'dark' : 'light'
    document.documentElement.style.colorScheme = mode === 'dark' ? 'dark' : 'light'
    Object.keys(TOKEN_MAP).forEach(function (key) {
      var value = tokens[key]
      if (typeof value === 'string' && value.trim()) {
        document.documentElement.style.setProperty(TOKEN_MAP[key], value.trim())
      }
    })
  }

  window.XpertRemoteUI = {
    applyTheme: applyTheme
  }

  window.addEventListener('message', function (event) {
    var message = event.data
    if (
      !isObject(message) ||
      message.channel !== CHANNEL ||
      message.protocolVersion !== VERSION ||
      message.type !== 'init'
    ) {
      return
    }
    applyTheme(message.theme)
  })
})()
`

/** Builds the isolated ESM iframe document served by the Workbench view provider. */
export function renderPencilRemoteVueIframeHtml(options: RenderPencilRemoteVueIframeHtmlOptions) {
  return `<!doctype html>
<html lang="${escapeHtmlAttribute(options.lang ?? 'en')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>
${options.appCss ?? ''}
    </style>
    <script>
${PENCIL_REMOTE_UI_BOOTSTRAP}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${escapeInlineScript(options.appScript)}
    </script>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function escapeInlineScript(value: string) {
  // Prevent bundled source text from terminating the containing module script element.
  return value.replace(/<\/script/gi, '<\\/script')
}
