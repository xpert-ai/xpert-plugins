export function injectStyles() {
  if (document.getElementById('docx-editor-workbench-styles')) {
    return
  }
  const style = document.createElement('style')
  style.id = 'docx-editor-workbench-styles'
  style.textContent = `
    html, body, #root {
      width: 100%;
      height: 100%;
      min-height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--xps-background);
      color: var(--xps-foreground);
      font-family: var(--xps-font-sans);
    }
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    .docx-shell {
      --docx-rail-width: var(--xps-sidebar-rail-width, 44px);
      --docx-left-width: clamp(240px, 20vw, 300px);
      --docx-right-width: clamp(280px, 24vw, 360px);
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--docx-left-width) minmax(0, 1fr) var(--docx-right-width);
      background: var(--xps-background);
      overflow: hidden;
      transition: grid-template-columns 160ms ease;
    }
    .docx-shell.left-collapsed { --docx-left-width: var(--docx-rail-width); }
    .docx-shell.right-collapsed { --docx-right-width: var(--docx-rail-width); }
    .docx-sidebar,
    .docx-inspector {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
    }
    .docx-main {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--xps-background);
    }
    .docx-toolbar {
      min-width: 0;
      min-height: 48px;
      display: grid;
      grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
      align-items: center;
      gap: 8px 10px;
      padding: 8px 12px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
      overflow: visible;
    }
    .docx-toolbar-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .docx-brand {
      min-width: 0;
      color: var(--xps-foreground);
      font-weight: 750;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .docx-toolbar-actions .xps-button,
    .docx-toolbar-actions .xps-badge,
    .docx-toolbar-actions .xps-select-trigger {
      flex: 0 0 auto;
    }
    .docx-toolbar-push { margin-left: auto; }
    .docx-mode-select {
      width: 132px;
    }
    .docx-button-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
    .docx-status {
      min-width: 72px;
      justify-content: center;
    }
    .docx-hidden { display: none; }
    .docx-list-scroll {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }
    .docx-list-stack {
      min-width: 0;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .docx-section {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .docx-section-title {
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      font-weight: 800;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .docx-row-title {
      display: block;
      min-width: 0;
      width: 100%;
      color: var(--xps-foreground);
      font-size: 0.8125rem;
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-row-meta {
      display: block;
      min-width: 0;
      width: 100%;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-version-line {
      min-width: 0;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .docx-version-line .docx-button-icon {
      color: var(--xps-success);
    }
    .docx-editor-host {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background:
        linear-gradient(color-mix(in srgb, var(--xps-border) 42%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--xps-border) 42%, transparent) 1px, transparent 1px),
        color-mix(in srgb, var(--xps-background) 82%, var(--xps-muted) 18%);
      background-size: 24px 24px;
      overflow: hidden;
    }
    .docx-editor-frame {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }
    .docx-empty {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      place-items: center;
      color: var(--xps-muted-foreground);
      text-align: center;
      padding: 24px;
    }
    .docx-empty h1 {
      margin: 0 0 12px;
      color: var(--xps-foreground);
      font-size: 1rem;
      line-height: 1.35;
    }
    .docx-inspector .xps-sidebar-header {
      gap: 8px;
    }
    .docx-sidebar-title-truncate {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-sidebar-trigger-right { margin-left: auto; }
    .docx-inspector-scroll {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }
    .docx-inspector-stack {
      min-width: 0;
      padding: 10px 12px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .docx-stat {
      min-width: 0;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--xps-border) 72%, transparent);
      color: var(--xps-foreground);
      font-size: 0.8125rem;
    }
    .docx-stat span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-field.xps-textarea {
      min-height: 96px;
      max-width: 100%;
      resize: vertical;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .docx-inspector .xps-textarea,
    .docx-inspector .xps-scroll-area,
    .docx-inspector .xps-scroll-area-viewport {
      min-width: 0;
      max-width: 100%;
    }

    .docx-editor-frame .ep-root {
      --doc-bg: var(--xps-background);
      --doc-primary: var(--xps-primary);
      --doc-primary-hover: color-mix(in srgb, var(--xps-primary) 86%, #000000 14%);
      --doc-primary-light: color-mix(in srgb, var(--xps-primary) 12%, transparent);
      --doc-text: var(--xps-foreground);
      --doc-text-muted: var(--xps-muted-foreground);
      --doc-text-subtle: color-mix(in srgb, var(--xps-muted-foreground) 72%, transparent);
      --doc-border: var(--xps-border);
      --doc-border-light: var(--xps-border);
      --doc-border-dark: color-mix(in srgb, var(--xps-border) 84%, var(--xps-foreground) 16%);
      --doc-border-input: var(--xps-input);
      --doc-bg-subtle: var(--xps-muted);
      --doc-bg-hover: color-mix(in srgb, var(--xps-muted) 78%, var(--xps-foreground) 6%);
      --doc-bg-input: var(--xps-card);
      --radius: var(--xps-radius);
      background: var(--xps-background);
      color: var(--xps-foreground);
      font-family: var(--xps-font-sans);
    }
    .docx-editor-frame .ep-root *,
    .docx-editor-frame .ep-root *::before,
    .docx-editor-frame .ep-root *::after {
      box-sizing: border-box;
    }
    .docx-editor-frame .ep-root button,
    .docx-editor-frame .ep-root input,
    .docx-editor-frame .ep-root select,
    .docx-editor-frame .ep-root textarea {
      font-family: var(--xps-font-sans);
    }
    .docx-editor-frame .ep-root button {
      appearance: none;
      border-style: solid;
      box-shadow: none;
    }
    .docx-editor-frame .ep-root [data-testid="editor-toolbar"] {
      background: var(--xps-card) !important;
      border-bottom: 1px solid var(--xps-border);
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] {
      min-height: 50px;
      align-items: center;
      background: var(--xps-card) !important;
      border-bottom: 1px solid color-mix(in srgb, var(--xps-border) 72%, transparent);
      padding-top: 6px !important;
      padding-bottom: 4px !important;
    }
    .docx-editor-logo {
      width: 42px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid color-mix(in srgb, var(--xps-primary) 20%, var(--xps-border));
      border-radius: 6px;
      background: color-mix(in srgb, var(--xps-primary) 8%, var(--xps-card));
      color: var(--xps-primary);
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] input {
      height: 28px !important;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      color: var(--xps-foreground) !important;
      font-size: 14px !important;
      font-weight: 650 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] input:hover,
    .docx-editor-frame .ep-root [data-testid="title-bar"] input:focus {
      border-color: var(--xps-border) !important;
      background: var(--xps-card) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--xps-ring) 12%, transparent) !important;
    }
    .docx-editor-frame .ep-root [role="menubar"] {
      min-height: 26px;
      gap: 2px;
    }
    .docx-editor-frame .ep-root [role="menubar"] button {
      height: 26px;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      padding: 0 9px !important;
      background: transparent !important;
      color: var(--xps-muted-foreground) !important;
      font-size: 13px !important;
      font-weight: 600;
    }
    .docx-editor-frame .ep-root [role="menubar"] button:hover,
    .docx-editor-frame .ep-root [role="menubar"] button[data-state="open"] {
      background: var(--xps-muted) !important;
      color: var(--xps-foreground) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] {
      min-height: 38px !important;
      margin: 0 10px 8px !important;
      padding: 4px 6px !important;
      border: 1px solid var(--xps-border);
      border-radius: 8px !important;
      background: color-mix(in srgb, var(--xps-card) 88%, var(--xps-muted) 12%) !important;
      box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 62%, transparent);
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--xps-muted-foreground) 34%, transparent) transparent;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"]::-webkit-scrollbar {
      height: 6px;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"]::-webkit-scrollbar-track {
      background: transparent;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"]::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: color-mix(in srgb, var(--xps-muted-foreground) 28%, transparent);
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] [role="group"] {
      border-color: color-mix(in srgb, var(--xps-border) 58%, transparent) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button {
      min-height: 28px;
      border-color: transparent !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: var(--xps-muted-foreground) !important;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button:hover:not(:disabled),
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button:focus-visible:not(:disabled) {
      background: var(--xps-muted) !important;
      color: var(--xps-foreground) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--xps-ring) 12%, transparent) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[aria-pressed="true"],
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] .docx-list-button-active {
      border-color: color-mix(in srgb, var(--xps-primary) 24%, var(--xps-border)) !important;
      background: color-mix(in srgb, var(--xps-primary) 12%, transparent) !important;
      color: var(--xps-primary) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] input,
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[aria-haspopup="listbox"],
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[data-testid="font-size-display"] {
      height: 28px !important;
      border: 1px solid var(--xps-border) !important;
      border-radius: 6px !important;
      background: var(--xps-card) !important;
      color: var(--xps-foreground) !important;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] input:focus,
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[aria-haspopup="listbox"]:focus {
      border-color: var(--xps-ring) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--xps-ring) 14%, transparent) !important;
    }
    .docx-editor-frame .ep-root [data-testid="toolbar-undo"],
    .docx-editor-frame .ep-root [data-testid="toolbar-redo"] {
      opacity: 0.85;
    }
    .docx-editor-frame .ep-root .docx-list-button {
      border: 1px solid transparent !important;
      border-radius: 6px !important;
    }
    .docx-editor-frame .ep-root .docx-horizontal-ruler {
      height: 20px !important;
      background: var(--xps-card) !important;
      border-top: 1px solid var(--xps-border);
      border-bottom: 1px solid var(--xps-border);
    }
    .docx-editor-frame .ep-root .paged-editor__pages,
    .docx-editor-frame .ep-root .paged-editor__viewport,
    .docx-editor-frame .ep-root [style*="overflow: auto"] {
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--xps-muted-foreground) 36%, transparent) transparent;
    }
    .docx-editor-frame .ep-root .paged-editor__pages::-webkit-scrollbar,
    .docx-editor-frame .ep-root .paged-editor__viewport::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .docx-editor-frame .ep-root .paged-editor__pages::-webkit-scrollbar-thumb,
    .docx-editor-frame .ep-root .paged-editor__viewport::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: color-mix(in srgb, var(--xps-muted-foreground) 32%, transparent);
    }
    @media (max-width: 1120px) {
      .docx-shell,
      .docx-shell.left-collapsed,
      .docx-shell.right-collapsed {
        --docx-left-width: var(--docx-rail-width);
        --docx-right-width: var(--docx-rail-width);
      }
      .docx-sidebar .xps-sidebar-content,
      .docx-inspector .xps-sidebar-content {
        display: none;
      }
      .docx-sidebar[aria-expanded="true"] .xps-sidebar-content,
      .docx-inspector[aria-expanded="true"] .xps-sidebar-content {
        position: absolute;
        top: 2.5rem;
        bottom: 0;
        display: flex;
        width: min(320px, calc(100vw - 64px));
        z-index: 40;
        background: var(--xps-card);
        border: 1px solid var(--xps-border);
        box-shadow: 0 18px 54px color-mix(in srgb, var(--xps-foreground) 18%, transparent);
      }
      .docx-sidebar[aria-expanded="true"] .xps-sidebar-content {
        left: var(--docx-rail-width);
      }
      .docx-inspector[aria-expanded="true"] .xps-sidebar-content {
        right: var(--docx-rail-width);
      }
      .docx-sidebar .xps-sidebar-header .xps-sidebar-title,
      .docx-sidebar .xps-sidebar-header .xps-badge,
      .docx-inspector[aria-expanded="false"] .xps-sidebar-header .xps-sidebar-title,
      .docx-inspector[aria-expanded="false"] .xps-sidebar-header .xps-badge {
        display: none;
      }
    }
    @media (max-width: 920px) {
      .docx-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }
      .docx-toolbar-push { margin-left: 0; }
      .docx-mode-select {
        width: 120px;
      }
    }
  `
  document.head.appendChild(style)
}
