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
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans);
    }
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    .docx-shell {
      --docx-rail-width: var(--xpert-sidebar-rail-width, 44px);
      --docx-left-width: clamp(220px, 18vw, 280px);
      --docx-right-width: clamp(300px, 22vw, 340px);
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--docx-left-width) minmax(0, 1fr) var(--docx-right-width);
      background: var(--background);
      overflow: hidden;
      transition: grid-template-columns 160ms ease;
    }
    .docx-shell.left-collapsed { --docx-left-width: var(--docx-rail-width); }
    .docx-shell.right-collapsed { --docx-right-width: var(--docx-rail-width); }
    .docx-sidebar,
    .docx-inspector {
      position: relative;
      z-index: 100;
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
      background: var(--background);
    }
    .docx-toolbar {
      position: relative;
      z-index: 70;
      min-width: 0;
      min-height: 44px;
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 6px 10px;
      background: var(--card);
      border-bottom: 0;
      overflow: hidden;
    }
    .docx-toolbar-title {
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .docx-brand {
      min-width: 0;
      color: var(--foreground);
      font-weight: 750;
      line-height: 1.2;
      font-size: 0.875rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-toolbar-meta {
      min-width: 0;
      color: var(--muted-foreground);
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
    .docx-toolbar-actions [data-slot="button"],
    .docx-toolbar-actions [data-slot="badge"],
    .docx-toolbar-actions [data-slot="select-trigger"] {
      flex: 0 0 auto;
    }
    .docx-danger-action[data-slot="button"] {
      width: var(--xpert-control-height-sm);
      height: var(--xpert-control-height-sm);
      padding: 0;
      color: color-mix(in srgb, var(--destructive) 76%, var(--muted-foreground));
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
      color: var(--muted-foreground);
      font-size: 0.8125rem;
      line-height: 1.35;
    }
    .docx-upload-dialog-row strong {
      min-width: 0;
      color: var(--foreground);
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
    .docx-sidebar [data-sidebar-slot="content"],
    .docx-sidebar [data-sidebar-slot="menu"],
    .docx-sidebar [data-slot="scroll-area"],
    .docx-sidebar [data-slot="scroll-area-viewport"],
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
    .docx-sidebar [data-slot="scroll-area-viewport"] > div,
    .docx-inspector [data-slot="scroll-area-viewport"] > div {
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
      color: var(--muted-foreground);
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
      color: var(--foreground);
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
      color: var(--muted-foreground);
      font-size: 0.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-sidebar [data-sidebar-slot="menu"],
    .docx-document-menu[data-sidebar-slot="menu"] {
      gap: 4px;
    }
    .docx-sidebar [data-sidebar-slot="menu-button"][data-slot="button"] {
      min-height: 48px;
      border-radius: 6px;
      padding: 6px 8px;
      background: transparent;
      border-color: transparent;
    }
    .docx-sidebar [data-sidebar-slot="menu-button"][data-slot="button"]:hover {
      background: color-mix(in srgb, var(--muted) 72%, transparent);
    }
    .docx-sidebar [data-sidebar-slot="menu-button"][data-active="true"][data-slot="button"] {
      background: color-mix(in srgb, var(--primary) 7%, var(--card));
      border-color: color-mix(in srgb, var(--primary) 18%, var(--border));
    }
    .docx-document-item {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      border-radius: 8px;
      padding: 2px;
    }
    .docx-document-item.is-active {
      background: color-mix(in srgb, var(--primary) 5%, var(--card));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 16%, var(--border));
    }
    .docx-sidebar .docx-document-button[data-sidebar-slot="menu-button"][data-slot="button"] {
      width: 100%;
      max-width: 100%;
      min-height: 44px;
      padding: 6px 8px;
      border-color: transparent;
      background: transparent;
      overflow: hidden;
    }
    .docx-sidebar .docx-document-button[data-sidebar-slot="menu-button"][data-active="true"][data-slot="button"] {
      background: transparent;
      border-color: transparent;
    }
    .docx-version-nest {
      min-width: 0;
      margin: 1px 4px 4px 14px;
      padding: 3px 0 2px 10px;
      display: grid;
      gap: 2px;
      border-left: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
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
      color: var(--muted-foreground);
      font-size: 0.625rem;
      font-weight: 750;
      line-height: 1.2;
      cursor: pointer;
      text-align: left;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .docx-version-toggle:hover,
    .docx-version-toggle:focus-visible {
      border-color: color-mix(in srgb, var(--border) 78%, transparent);
      background: color-mix(in srgb, var(--muted) 62%, transparent);
      color: var(--foreground);
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
      background: color-mix(in srgb, var(--muted) 82%, transparent);
      color: var(--muted-foreground);
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
      color: var(--foreground);
      cursor: pointer;
      text-align: left;
      transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }
    .docx-version-button:hover,
    .docx-version-button:focus-visible {
      border-color: color-mix(in srgb, var(--primary) 16%, var(--border));
      background: color-mix(in srgb, var(--muted) 78%, var(--card));
      box-shadow: 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
      outline: none;
      transform: translateY(-1px);
    }
    .docx-version-button.is-active {
      border-color: color-mix(in srgb, var(--primary) 14%, var(--border));
      background: color-mix(in srgb, var(--primary) 7%, transparent);
    }
    .docx-version-button.is-active:hover,
    .docx-version-button.is-active:focus-visible {
      border-color: color-mix(in srgb, var(--primary) 24%, var(--border));
      background: color-mix(in srgb, var(--primary) 10%, var(--card));
    }
    .docx-version-button .docx-button-icon {
      width: 0.875rem;
      height: 0.875rem;
      color: var(--status-success);
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
      color: var(--foreground);
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1.15;
    }
    .docx-version-meta {
      color: var(--muted-foreground);
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
        linear-gradient(color-mix(in srgb, var(--border) 42%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--border) 42%, transparent) 1px, transparent 1px),
        color-mix(in srgb, var(--background) 82%, var(--muted) 18%);
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
      color: var(--muted-foreground);
      text-align: center;
      padding: 24px;
    }
    .docx-empty h1 {
      margin: 0 0 12px;
      color: var(--foreground);
      font-size: 1rem;
      line-height: 1.35;
    }
    .docx-inspector [data-sidebar-slot="header"] {
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
      border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--muted) 38%, transparent);
    }
    .docx-review-metric span,
    .docx-review-metric strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-review-metric span {
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      font-weight: 650;
      line-height: 1.2;
    }
    .docx-review-metric strong {
      color: var(--foreground);
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
      border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
      color: var(--foreground);
      font-size: 0.8125rem;
    }
    .docx-stat span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .docx-field[data-slot="textarea"] {
      min-height: 104px;
      max-width: 100%;
      resize: vertical;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .docx-inspector [data-slot="textarea"],
    .docx-inspector [data-slot="scroll-area"],
    .docx-inspector [data-slot="scroll-area-viewport"] {
      min-width: 0;
      max-width: 100%;
    }

    .docx-editor-frame .ep-root {
      --doc-bg: var(--background);
      --doc-primary: var(--primary);
      --doc-primary-hover: color-mix(in srgb, var(--primary) 86%, #000000 14%);
      --doc-primary-light: color-mix(in srgb, var(--primary) 12%, transparent);
      --doc-text: var(--foreground);
      --doc-text-muted: var(--muted-foreground);
      --doc-text-subtle: color-mix(in srgb, var(--muted-foreground) 72%, transparent);
      --doc-border: var(--border);
      --doc-border-light: var(--border);
      --doc-border-dark: color-mix(in srgb, var(--border) 84%, var(--foreground) 16%);
      --doc-border-input: var(--input);
      --doc-bg-subtle: var(--muted);
      --doc-bg-hover: color-mix(in srgb, var(--muted) 78%, var(--foreground) 6%);
      --doc-bg-input: var(--card);
      --radius: var(--radius);
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans);
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
      font-family: var(--font-sans);
    }
    .docx-editor-frame .ep-root button {
      appearance: none;
      border-style: solid;
      box-shadow: none;
    }
    .docx-editor-frame .ep-root [data-testid="editor-toolbar"] {
      position: relative;
      z-index: 80;
      background: var(--card) !important;
      border-bottom: 0;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] {
      position: relative;
      z-index: 80;
      min-height: 28px;
      align-items: center;
      background: var(--card) !important;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
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
      border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
      border-radius: 6px;
      background: color-mix(in srgb, var(--primary) 8%, var(--card));
      color: var(--primary);
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] input {
      height: 24px !important;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      color: var(--foreground) !important;
      font-size: 13px !important;
      font-weight: 650 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="title-bar"] input:hover,
    .docx-editor-frame .ep-root [data-testid="title-bar"] input:focus {
      border-color: var(--border) !important;
      background: var(--card) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 12%, transparent) !important;
    }
    .docx-editor-frame .ep-root [role="menubar"] {
      position: relative;
      z-index: 90;
      min-height: 22px;
      gap: 2px;
      background: var(--card);
    }
    .docx-editor-frame .ep-root [role="menubar"] button {
      height: 22px;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      padding: 0 8px !important;
      background: transparent !important;
      color: var(--muted-foreground) !important;
      font-size: 12px !important;
      font-weight: 600;
    }
    .docx-editor-frame .ep-root [role="menubar"] button:hover,
    .docx-editor-frame .ep-root [role="menubar"] button[data-state="open"] {
      background: var(--muted) !important;
      color: var(--foreground) !important;
    }
    .docx-editor-frame .ep-root [data-radix-popper-content-wrapper],
    .docx-editor-frame .ep-root [role="menu"],
    .docx-editor-frame .ep-root [role="listbox"] {
      z-index: 100 !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] > div:has(> button[title*="Ctrl+Shift+E"]),
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] > div:has(+ div > button[title*="Ctrl+Shift+E"]) {
      display: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] {
      position: relative;
      z-index: 90;
      min-height: 34px !important;
      margin: 0 !important;
      padding: 3px 6px !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%) !important;
      box-shadow: none !important;
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--muted-foreground) 34%, transparent) transparent;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"]::-webkit-scrollbar {
      height: 6px;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"]::-webkit-scrollbar-track {
      background: transparent;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"]::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: color-mix(in srgb, var(--muted-foreground) 28%, transparent);
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] [role="group"] {
      border-color: color-mix(in srgb, var(--border) 58%, transparent) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button {
      min-height: 26px;
      border-color: transparent !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: var(--muted-foreground) !important;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button:hover:not(:disabled),
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button:focus-visible:not(:disabled) {
      background: var(--muted) !important;
      color: var(--foreground) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 12%, transparent) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[aria-pressed="true"],
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] .docx-list-button-active {
      border-color: color-mix(in srgb, var(--primary) 24%, var(--border)) !important;
      background: color-mix(in srgb, var(--primary) 12%, transparent) !important;
      color: var(--primary) !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] input,
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[aria-haspopup="listbox"],
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[data-testid="font-size-display"] {
      height: 26px !important;
      border: 1px solid var(--border) !important;
      border-radius: 6px !important;
      background: var(--card) !important;
      color: var(--foreground) !important;
      box-shadow: none !important;
    }
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] input:focus,
    .docx-editor-frame .ep-root [data-testid="formatting-bar"] button[aria-haspopup="listbox"]:focus {
      border-color: var(--ring) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 14%, transparent) !important;
    }
    .docx-editor-frame .ep-root [data-testid="toolbar-undo"],
    .docx-editor-frame .ep-root [data-testid="toolbar-redo"] {
      opacity: 0.85;
    }
    .docx-editor-frame .ep-root .docx-list-button {
      border: 1px solid transparent !important;
      border-radius: 6px !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) {
      padding: 10px !important;
      border: 1px solid var(--border) !important;
      border-radius: 8px !important;
      background: var(--popover, var(--card)) !important;
      color: var(--popover-foreground, var(--foreground)) !important;
      box-shadow:
        0 12px 36px color-mix(in srgb, var(--foreground) 18%, transparent),
        0 2px 8px color-mix(in srgb, var(--foreground) 10%, transparent) !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) textarea {
      min-height: 88px !important;
      width: 100% !important;
      padding: 10px 12px !important;
      border: 1px solid var(--input) !important;
      border-radius: 8px !important;
      background: var(--background) !important;
      color: var(--foreground) !important;
      box-shadow: none !important;
      font-size: var(--xpert-control-font-size) !important;
      line-height: 1.45 !important;
      resize: vertical !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) textarea::placeholder {
      color: var(--muted-foreground) !important;
      opacity: 1 !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) textarea:focus {
      border-color: var(--ring) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 18%, transparent) !important;
      outline: none !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) > div {
      align-items: center !important;
      gap: 8px !important;
      margin-top: 10px !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button {
      height: var(--xpert-control-height-sm) !important;
      min-width: var(--xpert-control-height-sm) !important;
      padding: 0 12px !important;
      border-radius: 6px !important;
      border: 1px solid transparent !important;
      font-size: var(--xpert-control-font-size) !important;
      font-weight: 600 !important;
      line-height: 1 !important;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:first-child {
      background: transparent !important;
      color: var(--primary) !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:first-child:hover:not(:disabled),
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:first-child:focus-visible:not(:disabled) {
      background: color-mix(in srgb, var(--primary) 9%, transparent) !important;
      color: var(--primary) !important;
      outline: none !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:last-child {
      border-color: var(--primary) !important;
      background: var(--primary) !important;
      color: var(--primary-foreground) !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:last-child:hover:not(:disabled),
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:last-child:focus-visible:not(:disabled) {
      border-color: color-mix(in srgb, var(--primary) 88%, var(--foreground) 12%) !important;
      background: color-mix(in srgb, var(--primary) 88%, var(--foreground) 12%) !important;
      outline: none !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar :is(div[style*="z-index: 50"], div[style*="z-index:50"]):has(> textarea) button:disabled {
      border-color: color-mix(in srgb, var(--border) 70%, transparent) !important;
      background: var(--muted) !important;
      color: var(--muted-foreground) !important;
      cursor: not-allowed !important;
      opacity: 0.55 !important;
    }
    .docx-editor-frame .ep-root .docx-unified-sidebar {
      color: var(--foreground) !important;
      font-family: var(--font-sans) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card,
    .docx-editor-frame .ep-root .docx-tracked-change-card {
      border: 1px solid var(--border) !important;
      border-radius: 8px !important;
      background: var(--card) !important;
      color: var(--card-foreground, var(--foreground)) !important;
      box-shadow:
        0 1px 2px color-mix(in srgb, var(--foreground) 7%, transparent),
        0 6px 18px color-mix(in srgb, var(--foreground) 8%, transparent) !important;
      transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card:hover,
    .docx-editor-frame .ep-root .docx-tracked-change-card:hover {
      border-color: color-mix(in srgb, var(--primary) 18%, var(--border)) !important;
      background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card[style*="box-shadow"],
    .docx-editor-frame .ep-root .docx-tracked-change-card[style*="box-shadow"] {
      border-color: color-mix(in srgb, var(--primary) 28%, var(--border)) !important;
      box-shadow:
        0 0 0 2px color-mix(in srgb, var(--ring) 14%, transparent),
        0 8px 24px color-mix(in srgb, var(--foreground) 10%, transparent) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card [style*="#202124"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="#202124"] {
      color: var(--foreground) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card [style*="#5f6368"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="#5f6368"],
    .docx-editor-frame .ep-root .docx-comment-card [style*="#80868b"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="#80868b"] {
      color: var(--muted-foreground) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card [style*="#1a73e8"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="#1a73e8"] {
      color: var(--primary) !important;
      border-color: var(--primary) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card [style*="#137333"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="#137333"] {
      color: var(--status-success) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card [style*="#c5221f"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="#c5221f"] {
      color: var(--destructive) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card > div[style*="inline-flex"][style*="#188038"] {
      border: 1px solid color-mix(in srgb, var(--status-success) 20%, transparent) !important;
      border-radius: 999px !important;
      background: color-mix(in srgb, var(--status-success) 11%, var(--card)) !important;
      color: var(--status-success) !important;
      font-weight: 650 !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card [style*="border-top"],
    .docx-editor-frame .ep-root .docx-tracked-change-card [style*="border-top"] {
      border-top-color: var(--border) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card input,
    .docx-editor-frame .ep-root .docx-tracked-change-card input {
      width: 100% !important;
      height: var(--xpert-control-height) !important;
      border: 1px solid var(--input) !important;
      border-radius: 8px !important;
      padding: 0 12px !important;
      background: var(--background) !important;
      color: var(--foreground) !important;
      font-size: var(--xpert-control-font-size) !important;
      line-height: 1 !important;
      box-shadow: none !important;
      outline: none !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card input::placeholder,
    .docx-editor-frame .ep-root .docx-tracked-change-card input::placeholder {
      color: var(--muted-foreground) !important;
      opacity: 1 !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card input:focus,
    .docx-editor-frame .ep-root .docx-tracked-change-card input:focus {
      border-color: var(--ring) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 18%, transparent) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button,
    .docx-editor-frame .ep-root .docx-tracked-change-card button {
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: var(--muted-foreground) !important;
      font-family: var(--font-sans) !important;
      font-size: var(--xpert-control-font-size) !important;
      font-weight: 600 !important;
      line-height: 1 !important;
      cursor: pointer !important;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button:hover:not(:disabled),
    .docx-editor-frame .ep-root .docx-comment-card button:focus-visible:not(:disabled),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:hover:not(:disabled),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:focus-visible:not(:disabled) {
      border-color: color-mix(in srgb, var(--border) 78%, transparent) !important;
      background: var(--muted) !important;
      color: var(--foreground) !important;
      outline: none !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button[title],
    .docx-editor-frame .ep-root .docx-comment-card button:has(svg),
    .docx-editor-frame .ep-root .docx-tracked-change-card button[title],
    .docx-editor-frame .ep-root .docx-tracked-change-card button:has(svg) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: var(--xpert-control-height-sm) !important;
      height: var(--xpert-control-height-sm) !important;
      min-width: var(--xpert-control-height-sm) !important;
      padding: 0 !important;
      line-height: 1 !important;
      vertical-align: middle !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button[title] :is(svg, span, i),
    .docx-editor-frame .ep-root .docx-comment-card button:has(svg) :is(svg, span, i),
    .docx-editor-frame .ep-root .docx-tracked-change-card button[title] :is(svg, span, i),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:has(svg) :is(svg, span, i) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 1.25rem !important;
      height: 1.25rem !important;
      margin: 0 !important;
      line-height: 1 !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button:not([title]):not(:has(svg)),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:not([title]):not(:has(svg)) {
      height: var(--xpert-control-height-sm) !important;
      min-width: var(--xpert-control-height-sm) !important;
      padding: 0 12px !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button:not([title]):not(:has(svg)):last-child:not(:only-child):not(:disabled),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:not([title]):not(:has(svg)):last-child:not(:only-child):not(:disabled) {
      border-color: var(--primary) !important;
      background: var(--primary) !important;
      color: var(--primary-foreground) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button:not([title]):not(:has(svg)):last-child:not(:only-child):hover:not(:disabled),
    .docx-editor-frame .ep-root .docx-comment-card button:not([title]):not(:has(svg)):last-child:not(:only-child):focus-visible:not(:disabled),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:not([title]):not(:has(svg)):last-child:not(:only-child):hover:not(:disabled),
    .docx-editor-frame .ep-root .docx-tracked-change-card button:not([title]):not(:has(svg)):last-child:not(:only-child):focus-visible:not(:disabled) {
      border-color: color-mix(in srgb, var(--primary) 84%, var(--foreground) 16%) !important;
      background: color-mix(in srgb, var(--primary) 84%, var(--foreground) 16%) !important;
      color: var(--primary-foreground) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card button:disabled,
    .docx-editor-frame .ep-root .docx-tracked-change-card button:disabled {
      border-color: transparent !important;
      background: var(--muted) !important;
      color: var(--muted-foreground) !important;
      cursor: not-allowed !important;
      opacity: 0.55 !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card div[style*="position: absolute"][style*="min-width: 120px"],
    .docx-editor-frame .ep-root .docx-tracked-change-card div[style*="position: absolute"][style*="min-width: 120px"] {
      min-width: 132px !important;
      padding: 4px !important;
      border: 1px solid var(--border) !important;
      border-radius: 8px !important;
      background: var(--popover, var(--card)) !important;
      color: var(--popover-foreground, var(--foreground)) !important;
      box-shadow:
        0 10px 30px color-mix(in srgb, var(--foreground) 16%, transparent),
        0 2px 8px color-mix(in srgb, var(--foreground) 10%, transparent) !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card div[style*="position: absolute"][style*="min-width: 120px"] button,
    .docx-editor-frame .ep-root .docx-tracked-change-card div[style*="position: absolute"][style*="min-width: 120px"] button {
      width: 100% !important;
      height: var(--xpert-control-height-sm) !important;
      justify-content: flex-start !important;
      padding: 0 10px !important;
      background: transparent !important;
      color: var(--foreground) !important;
      text-align: left !important;
    }
    .docx-editor-frame .ep-root .docx-comment-card div[style*="position: absolute"][style*="min-width: 120px"] button:hover,
    .docx-editor-frame .ep-root .docx-comment-card div[style*="position: absolute"][style*="min-width: 120px"] button:focus-visible,
    .docx-editor-frame .ep-root .docx-tracked-change-card div[style*="position: absolute"][style*="min-width: 120px"] button:hover,
    .docx-editor-frame .ep-root .docx-tracked-change-card div[style*="position: absolute"][style*="min-width: 120px"] button:focus-visible {
      background: var(--muted) !important;
      color: var(--foreground) !important;
    }
    .docx-editor-frame .ep-root .docx-horizontal-ruler {
      height: 18px !important;
      background: var(--card) !important;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .docx-editor-frame .ep-root .paged-editor__pages,
    .docx-editor-frame .ep-root .paged-editor__viewport,
    .docx-editor-frame .ep-root [style*="overflow: auto"] {
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--muted-foreground) 36%, transparent) transparent;
    }
    .docx-editor-frame .ep-root .paged-editor__pages::-webkit-scrollbar,
    .docx-editor-frame .ep-root .paged-editor__viewport::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .docx-editor-frame .ep-root .paged-editor__pages::-webkit-scrollbar-thumb,
    .docx-editor-frame .ep-root .paged-editor__viewport::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: color-mix(in srgb, var(--muted-foreground) 32%, transparent);
    }
    @media (max-width: 1280px) {
      .docx-toolbar .docx-action-label {
        display: none;
      }
      .docx-toolbar-actions [data-slot="button"] {
        width: var(--xpert-control-height-sm);
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
      .docx-sidebar [data-sidebar-slot="content"],
      .docx-inspector [data-sidebar-slot="content"] {
        display: none;
      }
      .docx-sidebar[aria-expanded="true"] [data-sidebar-slot="content"],
      .docx-inspector[aria-expanded="true"] [data-sidebar-slot="content"] {
        position: fixed;
        top: 2.5rem;
        bottom: 0;
        display: flex;
        width: min(320px, calc(100vw - 64px));
        z-index: 40;
        background: var(--card);
        border: 1px solid var(--border);
        box-shadow: 0 18px 54px color-mix(in srgb, var(--foreground) 18%, transparent);
      }
      .docx-sidebar[aria-expanded="true"] [data-sidebar-slot="content"] {
        width: min(300px, calc(100vw - 64px));
      }
      .docx-inspector[aria-expanded="true"] [data-sidebar-slot="content"] {
        width: min(340px, calc(100vw - 64px));
      }
      .docx-sidebar[aria-expanded="true"] [data-sidebar-slot="content"] {
        left: 0;
        right: auto;
      }
      .docx-inspector[aria-expanded="true"] [data-sidebar-slot="content"] {
        right: 0;
        left: auto;
      }
      .docx-sidebar [data-sidebar-slot="header"] [data-sidebar-slot="title"],
      .docx-sidebar [data-sidebar-slot="header"] [data-slot="badge"],
      .docx-inspector [data-sidebar-slot="header"] [data-sidebar-slot="title"],
      .docx-inspector [data-sidebar-slot="header"] [data-slot="badge"] {
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
    [data-slot="badge"][data-status="success"] { border-color: color-mix(in srgb, var(--status-success) 30%, var(--border)); background: var(--status-success-background); color: var(--status-success); }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
