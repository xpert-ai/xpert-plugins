export function injectStyles() {
  if (document.getElementById('lucidchart-workbench-styles')) {
    return
  }
  const style = document.createElement('style')
  style.id = 'lucidchart-workbench-styles'
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
    .lw-shell {
      --lw-rail-width: var(--xpert-sidebar-rail-width, 44px);
      --lw-panel-header-height: 2.5rem;
      --lw-left-width: minmax(var(--lw-rail-width), clamp(240px, 20vw, 300px));
      --lw-right-panel-width: clamp(300px, 24vw, 380px);
      --lw-right-width: var(--lw-right-panel-width);
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--lw-left-width) minmax(0, 1fr) var(--lw-right-width);
      background: var(--background);
      overflow: hidden;
      transition: grid-template-columns 160ms ease;
    }
    .lw-shell.left-collapsed { --lw-left-width: var(--lw-rail-width); }
    .lw-shell.right-collapsed { --lw-right-width: var(--lw-rail-width); }
    .lw-sidebar, .lw-inspector {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
    }
    .lw-inspector[data-sidebar-slot="sidebar"] {
      position: relative;
      z-index: 30;
      overflow: hidden;
    }
    .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"],
    .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
      position: relative;
      width: 100%;
      max-width: 100%;
      z-index: 1;
      background: var(--card);
      border-left: 1px solid var(--border);
    }
    .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"] {
      min-height: var(--lw-panel-header-height);
      border-bottom: 1px solid var(--border);
    }
    .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
      min-height: 0;
      overflow: hidden;
    }
    .lw-main {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--background);
    }
    .lw-toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      align-items: center;
      gap: 8px 10px;
      min-height: 48px;
      padding: 8px 12px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      min-width: 0;
      overflow: visible;
    }
    .lw-toolbar-title {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .lw-title-text {
      min-width: 0;
      color: var(--foreground);
      font-size: 16px;
      font-weight: 750;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-title-meta {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      color: var(--muted-foreground);
      font-size: 12px;
    }
    .lw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .lw-toolbar-actions [data-slot="button"],
    .lw-toolbar-actions [data-slot="badge"] { flex: 0 0 auto; }
    .lw-dialog-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .lw-dialog [data-slot="textarea"] {
      min-height: 96px;
      resize: vertical;
    }
    .lw-button-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
    .lw-list {
      flex: 1 1 auto;
      min-height: 0;
      padding: 6px;
    }
    .lw-item-title {
      display: block;
      width: 100%;
      color: var(--foreground);
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-item-meta, .lw-muted {
      color: var(--muted-foreground);
      font-size: 12px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-sidebar-controls {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid var(--border);
    }
    .lw-stage {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      background: var(--background);
      overflow: hidden;
    }
    .lw-editor-pane {
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 12px;
      overflow: hidden;
    }
    .lw-tabs {
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .lw-editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
    }
    .lw-editor-header [data-slot="tabs-list"] {
      min-width: 0;
      flex: 1 1 auto;
      overflow-x: auto;
      justify-content: flex-start;
    }
    .lw-editor-header [data-slot="tabs-trigger"] {
      flex: 0 0 auto;
      gap: 6px;
      white-space: nowrap;
    }
    .lw-tab-content {
      min-height: 0;
      flex: 1 1 auto;
      margin-top: 0;
      overflow: hidden;
    }
    .lw-tab-content[data-state="inactive"] {
      display: none;
    }
    .lw-json-tab {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lw-form-tab {
      overflow: auto;
      padding: 2px;
    }
    .lw-tab-toolbar {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .lw-inline-badges {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .lw-visual-frame {
      height: 100%;
      min-height: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
      overflow: hidden;
      position: relative;
    }
    .lw-visual-frame iframe,
    .lw-visual-frame img {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: #fff;
    }
    .lw-visual-frame img {
      object-fit: contain;
      background: var(--background);
    }
    .lw-embed-empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: var(--muted-foreground);
      text-align: center;
    }
    .lw-standard-preview {
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: auto;
      background:
        linear-gradient(color-mix(in srgb, var(--border) 36%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--border) 36%, transparent) 1px, transparent 1px),
        var(--background);
      background-size: 24px 24px;
    }
    .lw-standard-preview svg {
      display: block;
      width: 100%;
      min-width: 680px;
      height: 100%;
      min-height: 260px;
    }
    .lw-preview-shape {
      filter: drop-shadow(0 5px 14px color-mix(in srgb, var(--foreground) 10%, transparent));
    }
    .lw-preview-label {
      fill: var(--foreground);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
    }
    .lw-preview-line-label {
      fill: var(--muted-foreground);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      paint-order: stroke;
      stroke: var(--background);
      stroke-width: 4px;
      stroke-linejoin: round;
      pointer-events: none;
    }
    .lw-json-editor[data-slot="textarea"] {
      min-height: 0;
      height: 100%;
      resize: none;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: 12px;
      line-height: 1.55;
      tab-size: 2;
      white-space: pre;
      overflow: auto;
    }
    .lw-tall-textarea[data-slot="textarea"] {
      min-height: 240px;
      resize: vertical;
    }
    .lw-status {
      margin-left: auto;
      flex: 0 0 auto;
    }
    .lw-sidebar-title-truncate {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-sidebar-trigger-right { margin-left: auto; }
    .lw-inspector-actions {
      min-width: 0;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lw-inspector-actions [data-slot="button"],
    .lw-inspector-actions [data-slot="badge"] {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .lw-inspector-scroll {
      min-height: 0;
      height: 100%;
      flex: 1 1 auto;
    }
    .lw-inspector-tabs {
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .lw-inspector-tabs-list {
      position: sticky;
      top: 0;
      z-index: 2;
      margin: 10px 10px 0;
      width: calc(100% - 20px);
      overflow-x: auto;
      justify-content: flex-start;
      background: var(--card);
    }
    .lw-inspector-tabs-list [data-slot="tabs-trigger"] {
      flex: 1 0 auto;
      min-width: 0;
      white-space: nowrap;
    }
    .lw-inspector-stack {
      padding: 10px 12px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
      margin-top: 0;
    }
    .lw-inspector-stack[data-state="inactive"] {
      display: none;
    }
    .lw-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    .lw-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--foreground);
    }
    .lw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lw-inline-actions [data-slot="button"] {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .lw-version {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--card) 94%, var(--muted) 6%);
      padding: 8px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--xpert-control-height);
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .lw-version > div {
      min-width: 0;
      overflow: hidden;
    }
    .lw-version > div > div {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-version-action[data-slot="button"] {
      width: var(--xpert-control-height);
      height: var(--xpert-control-height);
      padding: 0;
      justify-self: end;
    }
    .lw-log {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--card) 96%, var(--muted) 4%);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .lw-log-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-log-message,
    .lw-log-error {
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .lw-log-error {
      color: var(--destructive, #dc2626);
    }
    .lw-inspector [data-slot="input"],
    .lw-inspector [data-slot="textarea"],
    .lw-inspector [data-slot="scroll-area"],
    .lw-inspector [data-slot="scroll-area-viewport"] {
      min-width: 0;
      max-width: 100%;
    }
    .lw-inspector [data-slot="textarea"] {
      overflow-x: hidden;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .lw-inspector .lw-muted {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .lw-empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted-foreground);
    }
    .lw-empty-state {
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted-foreground);
      text-align: center;
      padding: 16px;
    }
    .lw-hidden-file { display: none; }
    @media (max-width: 1040px) {
      .lw-shell,
      .lw-shell.left-collapsed,
      .lw-shell.right-collapsed {
        --lw-left-panel-width: min(320px, calc(100vw - var(--lw-rail-width) - 32px));
        --lw-left-width: var(--lw-rail-width);
        --lw-right-width: var(--lw-rail-width);
        --lw-right-panel-width: min(320px, calc(100vw - var(--lw-rail-width) - 32px));
        grid-template-columns: var(--lw-left-width) minmax(0, 1fr) var(--lw-right-width);
      }
      .lw-sidebar[data-sidebar-slot="sidebar"],
      .lw-inspector[data-sidebar-slot="sidebar"] {
        overflow: visible;
        z-index: 40;
      }
      .lw-sidebar[aria-expanded="true"] > [data-sidebar-slot="header"],
      .lw-sidebar[aria-expanded="true"] > [data-sidebar-slot="content"] {
        position: absolute;
        left: 0;
        width: var(--lw-left-panel-width);
        max-width: calc(100vw - 16px);
        z-index: 41;
        background: var(--card);
        border-right: 1px solid var(--border);
        box-shadow: 12px 0 28px color-mix(in srgb, var(--foreground) 14%, transparent);
      }
      .lw-sidebar[aria-expanded="true"] > [data-sidebar-slot="header"] {
        top: 0;
      }
      .lw-sidebar[aria-expanded="true"] > [data-sidebar-slot="content"] {
        top: var(--lw-panel-header-height);
        bottom: 0;
        min-height: 0;
        overflow: hidden;
      }
      .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"],
      .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
        position: absolute;
        right: 0;
        width: var(--lw-right-panel-width);
        max-width: calc(100vw - 16px);
        z-index: 41;
        background: var(--card);
        border-left: 1px solid var(--border);
        box-shadow: -12px 0 28px color-mix(in srgb, var(--foreground) 14%, transparent);
      }
      .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"] {
        top: 0;
      }
      .lw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
        top: var(--lw-panel-header-height);
        bottom: 0;
        min-height: 0;
        overflow: hidden;
      }
      .lw-sidebar [data-sidebar-slot="content"],
      .lw-inspector-scroll { display: none; }
      .lw-sidebar[aria-expanded="true"] [data-sidebar-slot="content"],
      .lw-inspector[aria-expanded="true"] .lw-inspector-scroll { display: block; }
      .lw-sidebar [data-sidebar-slot="header"] [data-sidebar-slot="title"],
      .lw-sidebar [data-sidebar-slot="header"] [data-slot="badge"],
      .lw-sidebar [data-sidebar-slot="header"] [data-slot="button"]:not([data-sidebar-slot="trigger"]),
      .lw-inspector[aria-expanded="false"] [data-sidebar-slot="header"] [data-sidebar-slot="title"],
      .lw-inspector[aria-expanded="false"] [data-sidebar-slot="header"] [data-slot="badge"],
      .lw-inspector[aria-expanded="false"] [data-sidebar-slot="header"] [data-slot="button"]:not([data-sidebar-slot="trigger"]) {
        display: none;
      }
      [data-sidebar-slot="rail"] { display: flex; }
    }
    @media (max-width: 920px) {
      .lw-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }
      .lw-status { margin-left: 0; }
    }
    [data-slot="badge"][data-status="success"] { border-color: color-mix(in srgb, var(--status-success) 30%, var(--border)); background: var(--status-success-background); color: var(--status-success); }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
