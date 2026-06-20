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
      --docx-left-width: clamp(220px, 18vw, 280px);
      --docx-right-width: clamp(300px, 22vw, 340px);
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
      min-height: 44px;
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
      overflow: hidden;
    }
    .docx-toolbar-title {
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .docx-brand {
      min-width: 0;
      color: var(--xps-foreground);
      font-weight: 750;
      line-height: 1.2;
      font-size: 0.875rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-toolbar-meta {
      min-width: 0;
      color: var(--xps-muted-foreground);
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
    }
    .docx-toolbar-primary,
    .docx-toolbar-secondary {
      min-width: 0;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .docx-toolbar-actions .xps-button,
    .docx-toolbar-actions .xps-badge,
    .docx-toolbar-actions .xps-select-trigger,
    .docx-toolbar-divider {
      flex: 0 0 auto;
    }
    .docx-toolbar-divider {
      width: 1px;
      height: 20px;
      background: color-mix(in srgb, var(--xps-border) 82%, transparent);
    }
    .docx-danger-action.xps-button {
      width: var(--xps-control-height-sm);
      height: var(--xps-control-height-sm);
      padding: 0;
      color: color-mix(in srgb, var(--xps-destructive) 76%, var(--xps-muted-foreground));
    }
    .docx-mode-select {
      width: 112px;
    }
    .docx-button-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
    .docx-status {
      min-width: 64px;
      justify-content: center;
    }
    .docx-hidden { display: none; }
    .docx-upload-dialog {
      max-width: min(440px, calc(100vw - 32px));
    }
    .docx-upload-dialog-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 4px 0;
    }
    .docx-upload-dialog-row {
      min-width: 0;
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      color: var(--xps-muted-foreground);
      font-size: 0.8125rem;
      line-height: 1.35;
    }
    .docx-upload-dialog-row strong {
      min-width: 0;
      color: var(--xps-foreground);
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-upload-dialog-footer {
      flex-wrap: wrap;
      gap: 8px;
    }
    .docx-list-scroll {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }
    .docx-sidebar,
    .docx-sidebar .xps-sidebar-content,
    .docx-sidebar .xps-sidebar-menu,
    .docx-sidebar .xps-scroll-area,
    .docx-sidebar .xps-scroll-area-viewport,
    .docx-list-scroll,
    .docx-list-stack,
    .docx-section,
    .docx-document-menu,
    .docx-document-item,
    .docx-document-button,
    .docx-version-nest,
    .docx-version-menu,
    .docx-version-button {
      min-width: 0;
      max-width: 100%;
    }
    .docx-sidebar .xps-scroll-area-viewport > div,
    .docx-inspector .xps-scroll-area-viewport > div {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }
    .docx-list-stack {
      min-width: 0;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .docx-section {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .docx-section-title {
      color: var(--xps-muted-foreground);
      font-size: 0.6875rem;
      font-weight: 750;
      line-height: 1.2;
      text-transform: none;
      letter-spacing: 0;
    }
    .docx-row-title {
      display: block;
      min-width: 0;
      width: 100%;
      max-width: 100%;
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
      max-width: 100%;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-sidebar .xps-sidebar-menu,
    .docx-document-menu.xps-sidebar-menu {
      gap: 4px;
    }
    .docx-sidebar .xps-sidebar-menu-button.xps-button {
      min-height: 48px;
      border-radius: 6px;
      padding: 6px 8px;
      background: transparent;
      border-color: transparent;
    }
    .docx-sidebar .xps-sidebar-menu-button.xps-button:hover {
      background: color-mix(in srgb, var(--xps-muted) 72%, transparent);
    }
    .docx-sidebar .xps-sidebar-menu-button--active.xps-button {
      background: color-mix(in srgb, var(--xps-primary) 7%, var(--xps-card));
      border-color: color-mix(in srgb, var(--xps-primary) 18%, var(--xps-border));
    }
    .docx-document-item {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      border-radius: 8px;
      padding: 2px;
    }
    .docx-document-item.is-active {
      background: color-mix(in srgb, var(--xps-primary) 5%, var(--xps-card));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--xps-primary) 16%, var(--xps-border));
    }
    .docx-sidebar .docx-document-button.xps-sidebar-menu-button.xps-button {
      width: 100%;
      max-width: 100%;
      min-height: 44px;
      padding: 6px 8px;
      border-color: transparent;
      background: transparent;
      overflow: hidden;
    }
    .docx-sidebar .docx-document-button.xps-sidebar-menu-button--active.xps-button {
      background: transparent;
      border-color: transparent;
    }
    .docx-version-nest {
      min-width: 0;
      margin: 1px 4px 4px 14px;
      padding: 3px 0 2px 10px;
      display: grid;
      gap: 2px;
      border-left: 1px solid color-mix(in srgb, var(--xps-border) 78%, transparent);
    }
    .docx-version-toggle {
      width: 100%;
      min-width: 0;
      min-height: 26px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 5px;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 3px 6px;
      background: transparent;
      color: var(--xps-muted-foreground);
      font-size: 0.625rem;
      font-weight: 750;
      line-height: 1.2;
      cursor: pointer;
      text-align: left;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .docx-version-toggle:hover,
    .docx-version-toggle:focus-visible {
      border-color: color-mix(in srgb, var(--xps-border) 78%, transparent);
      background: color-mix(in srgb, var(--xps-muted) 62%, transparent);
      color: var(--xps-foreground);
      outline: none;
    }
    .docx-version-toggle span:nth-child(2) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-version-toggle .docx-button-icon {
      width: 0.8125rem;
      height: 0.8125rem;
      color: currentColor;
    }
    .docx-version-count {
      min-width: 1.25rem;
      height: 1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: color-mix(in srgb, var(--xps-muted) 82%, transparent);
      color: var(--xps-muted-foreground);
      font-size: 0.625rem;
      font-weight: 750;
    }
    .docx-version-menu {
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .docx-version-button {
      width: 100%;
      min-width: 0;
      min-height: 30px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 4px 6px;
      background: transparent;
      color: var(--xps-foreground);
      cursor: pointer;
      text-align: left;
      transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }
    .docx-version-button:hover,
    .docx-version-button:focus-visible {
      border-color: color-mix(in srgb, var(--xps-primary) 16%, var(--xps-border));
      background: color-mix(in srgb, var(--xps-muted) 78%, var(--xps-card));
      box-shadow: 0 1px 0 color-mix(in srgb, var(--xps-foreground) 8%, transparent);
      outline: none;
      transform: translateY(-1px);
    }
    .docx-version-button.is-active {
      border-color: color-mix(in srgb, var(--xps-primary) 14%, var(--xps-border));
      background: color-mix(in srgb, var(--xps-primary) 7%, transparent);
    }
    .docx-version-button.is-active:hover,
    .docx-version-button.is-active:focus-visible {
      border-color: color-mix(in srgb, var(--xps-primary) 24%, var(--xps-border));
      background: color-mix(in srgb, var(--xps-primary) 10%, var(--xps-card));
    }
    .docx-version-button .docx-button-icon {
      width: 0.875rem;
      height: 0.875rem;
      color: var(--xps-success);
    }
    .docx-version-text,
    .docx-version-title,
    .docx-version-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-version-text {
      display: grid;
      max-width: 100%;
      gap: 1px;
    }
    .docx-version-title {
      color: var(--xps-foreground);
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1.15;
    }
    .docx-version-meta {
      color: var(--xps-muted-foreground);
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1.15;
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
      padding: 8px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .docx-review-summary {
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .docx-review-metric {
      min-width: 0;
      min-height: 48px;
      display: grid;
      align-content: center;
      gap: 4px;
      padding: 6px;
      border: 1px solid color-mix(in srgb, var(--xps-border) 72%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--xps-muted) 38%, transparent);
    }
    .docx-review-metric span,
    .docx-review-metric strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-review-metric span {
      color: var(--xps-muted-foreground);
      font-size: 0.6875rem;
      font-weight: 650;
      line-height: 1.2;
    }
    .docx-review-metric strong {
      color: var(--xps-foreground);
      font-size: 0.875rem;
      font-weight: 800;
      line-height: 1;
    }
    .docx-stat {
      min-width: 0;
      min-height: 28px;
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
      min-height: 104px;
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
      min-height: 28px;
      align-items: center;
      background: var(--xps-card) !important;
      border-bottom: 1px solid color-mix(in srgb, var(--xps-border) 72%, transparent);
      padding-top: 2px !important;
      padding-bottom: 2px !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] > div:first-child,
    .docx-editor-frame .ep-root [data-testid="title-bar"] > div:nth-child(2) > div:first-child {
      display: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] > div:nth-child(2) {
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] > div:nth-child(2) > div:nth-child(2) {
      padding-left: 4px !important;
      padding-right: 4px !important;
    }
    .docx-editor-logo {
      width: 36px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid color-mix(in srgb, var(--xps-primary) 20%, var(--xps-border));
      border-radius: 6px;
      background: color-mix(in srgb, var(--xps-primary) 8%, var(--xps-card));
      color: var(--xps-primary);
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] input {
      height: 24px !important;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      color: var(--xps-foreground) !important;
      font-size: 13px !important;
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
      min-height: 22px;
      gap: 2px;
    }
    .docx-editor-frame .ep-root [role="menubar"] button {
      height: 22px;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      padding: 0 8px !important;
      background: transparent !important;
      color: var(--xps-muted-foreground) !important;
      font-size: 12px !important;
      font-weight: 600;
    }
    .docx-editor-frame .ep-root [role="menubar"] button:hover,
    .docx-editor-frame .ep-root [role="menubar"] button[data-state="open"] {
      background: var(--xps-muted) !important;
      color: var(--xps-foreground) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] > div:has(> button[title*="Ctrl+Shift+E"]),
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] > div:has(+ div > button[title*="Ctrl+Shift+E"]) {
      display: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] {
      min-height: 34px !important;
      margin: 0 8px 6px !important;
      padding: 3px 6px !important;
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
      min-height: 26px;
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
      height: 26px !important;
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
      height: 18px !important;
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
    @media (max-width: 1280px) {
      .docx-toolbar .docx-action-label {
        display: none;
      }
      .docx-toolbar-actions .xps-button {
        width: var(--xps-control-height-sm);
        padding: 0;
      }
      .docx-mode-select {
        width: 104px;
      }
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
        width: min(300px, calc(100vw - 64px));
      }
      .docx-inspector[aria-expanded="true"] .xps-sidebar-content {
        width: min(340px, calc(100vw - 64px));
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
    @media (max-width: 760px) {
      .docx-toolbar {
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
      }
      .docx-toolbar-actions {
        justify-content: flex-start;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .docx-toolbar-actions::-webkit-scrollbar {
        display: none;
      }
      .docx-mode-select {
        width: 120px;
      }
    }
  `
  document.head.appendChild(style)
}
