export function injectStyles() {
  if (document.getElementById('drawio-workbench-styles')) {
    return
  }
  const style = document.createElement('style')
  style.id = 'drawio-workbench-styles'
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
    .dw-shell {
      --dw-rail-width: var(--xps-sidebar-rail-width, 44px);
      --dw-panel-header-height: 2.5rem;
      --dw-left-width: minmax(var(--dw-rail-width), clamp(240px, 20vw, 300px));
      --dw-right-width: var(--dw-rail-width);
      --dw-right-panel-width: min(340px, calc(100vw - var(--dw-rail-width) - 96px));
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--dw-left-width) minmax(0, 1fr) var(--dw-right-width);
      background: var(--xps-background);
      overflow: hidden;
    }
    .dw-shell.left-collapsed { --dw-left-width: var(--dw-rail-width); }
    .dw-shell.right-collapsed { --dw-right-width: var(--dw-rail-width); }
    .dw-sidebar, .dw-inspector {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
    }
    .dw-inspector.xps-sidebar {
      position: relative;
      z-index: 30;
      overflow: visible;
    }
    .dw-inspector[aria-expanded="true"] > .xps-sidebar-header,
    .dw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      position: absolute;
      right: 0;
      width: var(--dw-right-panel-width);
      max-width: calc(100vw - 16px);
      z-index: 31;
      background: var(--xps-card);
      border-left: 1px solid var(--xps-border);
      border-right: 1px solid var(--xps-border);
      box-shadow: -12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
    }
    .dw-inspector[aria-expanded="true"] > .xps-sidebar-header {
      top: 0;
      min-height: var(--dw-panel-header-height);
      border-bottom: 1px solid var(--xps-border);
    }
    .dw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      top: var(--dw-panel-header-height);
      bottom: 0;
      min-height: 0;
      overflow: hidden;
    }
    .dw-sidebar-title-truncate {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dw-sidebar-trigger-right { margin-left: auto; }
    .dw-inspector-actions {
      min-width: 0;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dw-inspector-actions .xps-button,
    .dw-inspector-actions .xps-badge {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .dw-sidebar-controls {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid var(--xps-border);
    }
    .dw-main {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--xps-background);
    }
    .dw-toolbar {
      display: grid;
      grid-template-columns: minmax(150px, 220px) minmax(0, 1fr);
      align-items: center;
      gap: 8px 10px;
      min-height: 48px;
      padding: 8px 12px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
      min-width: 0;
      overflow: visible;
    }
    .dw-toolbar-title { min-width: 0; }
    .dw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .dw-toolbar-actions .xps-button,
    .dw-toolbar-actions .xps-badge { flex: 0 0 auto; }
    .dw-title-input { width: 100%; }
    .dw-button-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
    .dw-editor {
      min-height: 0;
      height: 100%;
      background: var(--xps-background);
      position: relative;
      overflow: hidden;
    }
    .dw-editor iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: #fff;
    }
    .dw-editor-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--xps-muted-foreground);
      pointer-events: none;
      background: color-mix(in srgb, var(--xps-background) 88%, transparent);
    }
    .dw-list {
      flex: 1 1 auto;
      min-height: 0;
      padding: 6px;
    }
    .dw-item-title {
      display: block;
      width: 100%;
      color: var(--xps-foreground);
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dw-item-meta, .dw-muted {
      color: var(--xps-muted-foreground);
      font-size: 12px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dw-status {
      margin-left: auto;
      flex: 0 0 auto;
    }
    .dw-inspector-scroll {
      min-height: 0;
      height: 100%;
      flex: 1 1 auto;
    }
    .dw-inspector-stack {
      padding: 10px 12px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
    }
    .dw-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    .dw-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--xps-foreground);
    }
    .dw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .dw-version {
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
    .dw-version > div {
      min-width: 0;
      overflow: hidden;
    }
    .dw-version > div > div {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dw-version-action.xps-button {
      width: var(--xps-control-height);
      height: var(--xps-control-height);
      padding: 0;
      justify-self: end;
    }
    .dw-inspector .xps-input,
    .dw-inspector .xps-textarea,
    .dw-inspector .xps-scroll-area,
    .dw-inspector .xps-scroll-area-viewport {
      min-width: 0;
      max-width: 100%;
    }
    .dw-inspector .xps-textarea {
      overflow-x: hidden;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .dw-inspector .dw-muted {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .dw-empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--xps-muted-foreground);
    }
    .dw-hidden-file { display: none; }
    @media (max-width: 1040px) {
      .dw-shell,
      .dw-shell.left-collapsed,
      .dw-shell.right-collapsed {
        --dw-left-width: var(--dw-rail-width);
        --dw-right-width: var(--dw-rail-width);
        --dw-right-panel-width: min(320px, calc(100vw - var(--dw-rail-width) - 32px));
        grid-template-columns: var(--dw-left-width) minmax(0, 1fr) var(--dw-right-width);
      }
      .dw-sidebar .xps-sidebar-content,
      .dw-inspector-scroll { display: none; }
      .dw-inspector[aria-expanded="true"] .dw-inspector-scroll { display: block; }
      .xps-sidebar-rail { display: flex; }
    }
    @media (max-width: 920px) {
      .dw-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }
      .dw-status { margin-left: 0; }
    }
  `
  document.head.appendChild(style)
}
