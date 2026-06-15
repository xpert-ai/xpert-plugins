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
      background: var(--xps-background);
      color: var(--xps-foreground);
      font-family: var(--xps-font-sans);
    }
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    .lw-shell {
      --lw-rail-width: var(--xps-sidebar-rail-width, 44px);
      --lw-panel-header-height: 2.5rem;
      --lw-left-width: minmax(var(--lw-rail-width), clamp(240px, 20vw, 300px));
      --lw-right-width: var(--lw-rail-width);
      --lw-right-panel-width: min(360px, calc(100vw - var(--lw-rail-width) - 96px));
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--lw-left-width) minmax(0, 1fr) var(--lw-right-width);
      background: var(--xps-background);
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
    .lw-inspector.xps-sidebar {
      position: relative;
      z-index: 30;
      overflow: visible;
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-header,
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      position: absolute;
      right: 0;
      width: var(--lw-right-panel-width);
      max-width: calc(100vw - 16px);
      z-index: 31;
      background: var(--xps-card);
      border-left: 1px solid var(--xps-border);
      border-right: 1px solid var(--xps-border);
      box-shadow: -12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-header {
      top: 0;
      min-height: var(--lw-panel-header-height);
      border-bottom: 1px solid var(--xps-border);
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      top: var(--lw-panel-header-height);
      bottom: 0;
      min-height: 0;
      overflow: hidden;
    }
    .lw-main {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--xps-background);
    }
    .lw-toolbar {
      display: grid;
      grid-template-columns: minmax(160px, 240px) minmax(0, 1fr);
      align-items: center;
      gap: 8px 10px;
      min-height: 48px;
      padding: 8px 12px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
      min-width: 0;
      overflow: visible;
    }
    .lw-toolbar-title { min-width: 0; }
    .lw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .lw-toolbar-actions .xps-button,
    .lw-toolbar-actions .xps-badge { flex: 0 0 auto; }
    .lw-title-input { width: 100%; }
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
      color: var(--xps-foreground);
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lw-item-meta, .lw-muted {
      color: var(--xps-muted-foreground);
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
      border-bottom: 1px solid var(--xps-border);
    }
    .lw-stage {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      background: var(--xps-background);
      overflow: hidden;
    }
    .lw-editor-pane {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(160px, 34vh) minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      overflow: hidden;
    }
    .lw-editor-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .lw-editor-header .xps-badge:last-child {
      margin-left: auto;
    }
    .lw-visual-frame {
      min-height: 0;
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: var(--xps-card);
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
      background: var(--xps-background);
    }
    .lw-embed-empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: var(--xps-muted-foreground);
      text-align: center;
    }
    .lw-standard-preview {
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: auto;
      background:
        linear-gradient(color-mix(in srgb, var(--xps-border) 36%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--xps-border) 36%, transparent) 1px, transparent 1px),
        var(--xps-background);
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
      filter: drop-shadow(0 5px 14px color-mix(in srgb, var(--xps-foreground) 10%, transparent));
    }
    .lw-preview-label {
      fill: var(--xps-foreground);
      font-family: var(--xps-font-sans);
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
    }
    .lw-preview-line-label {
      fill: var(--xps-muted-foreground);
      font-family: var(--xps-font-sans);
      font-size: 11px;
      font-weight: 600;
      paint-order: stroke;
      stroke: var(--xps-background);
      stroke-width: 4px;
      stroke-linejoin: round;
      pointer-events: none;
    }
    .lw-json-editor.xps-textarea {
      min-height: 0;
      height: 100%;
      resize: none;
      font-family: var(--xps-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: 12px;
      line-height: 1.55;
      tab-size: 2;
      white-space: pre;
      overflow: auto;
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
    .lw-inspector-actions .xps-button,
    .lw-inspector-actions .xps-badge {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .lw-inspector-scroll {
      min-height: 0;
      height: 100%;
      flex: 1 1 auto;
    }
    .lw-inspector-stack {
      padding: 10px 12px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
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
      color: var(--xps-foreground);
    }
    .lw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lw-version {
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: color-mix(in srgb, var(--xps-card) 94%, var(--xps-muted) 6%);
      padding: 8px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--xps-control-height);
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
    .lw-version-action.xps-button {
      width: var(--xps-control-height);
      height: var(--xps-control-height);
      padding: 0;
      justify-self: end;
    }
    .lw-inspector .xps-input,
    .lw-inspector .xps-textarea,
    .lw-inspector .xps-scroll-area,
    .lw-inspector .xps-scroll-area-viewport {
      min-width: 0;
      max-width: 100%;
    }
    .lw-inspector .xps-textarea {
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
      color: var(--xps-muted-foreground);
    }
    .lw-hidden-file { display: none; }
    @media (max-width: 1040px) {
      .lw-shell,
      .lw-shell.left-collapsed,
      .lw-shell.right-collapsed {
        --lw-left-width: var(--lw-rail-width);
        --lw-right-width: var(--lw-rail-width);
        --lw-right-panel-width: min(320px, calc(100vw - var(--lw-rail-width) - 32px));
        grid-template-columns: var(--lw-left-width) minmax(0, 1fr) var(--lw-right-width);
      }
      .lw-sidebar .xps-sidebar-content,
      .lw-inspector-scroll { display: none; }
      .lw-inspector[aria-expanded="true"] .lw-inspector-scroll { display: block; }
      .lw-sidebar .xps-sidebar-header .xps-sidebar-title,
      .lw-sidebar .xps-sidebar-header .xps-badge,
      .lw-sidebar .xps-sidebar-header .xps-button:not(.xps-sidebar-trigger),
      .lw-inspector[aria-expanded="false"] .xps-sidebar-header .xps-sidebar-title,
      .lw-inspector[aria-expanded="false"] .xps-sidebar-header .xps-badge,
      .lw-inspector[aria-expanded="false"] .xps-sidebar-header .xps-button:not(.xps-sidebar-trigger) {
        display: none;
      }
      .xps-sidebar-rail { display: flex; }
    }
    @media (max-width: 920px) {
      .lw-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }
      .lw-editor-pane {
        grid-template-rows: auto minmax(120px, 28vh) minmax(0, 1fr);
      }
      .lw-status { margin-left: 0; }
    }
  `
  document.head.appendChild(style)
}
