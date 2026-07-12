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
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans);
    }
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    .dw-shell {
      --dw-rail-width: var(--xpert-sidebar-rail-width, 44px);
      --dw-panel-header-height: 2.5rem;
      --dw-left-width: minmax(var(--dw-rail-width), clamp(240px, 20vw, 300px));
      --dw-right-width: var(--dw-rail-width);
      --dw-right-panel-width: min(340px, calc(100vw - var(--dw-rail-width) - 96px));
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--dw-left-width) minmax(0, 1fr) var(--dw-right-width);
      background: var(--background);
      overflow: hidden;
    }
    .dw-shell.left-collapsed { --dw-left-width: var(--dw-rail-width); }
    .dw-shell.right-collapsed { --dw-right-width: var(--dw-rail-width); }
    .dw-sidebar, .dw-inspector {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
    }
    .dw-inspector[data-sidebar-slot="sidebar"] {
      position: relative;
      z-index: 30;
      overflow: visible;
    }
    .dw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"],
    .dw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
      position: absolute;
      right: 0;
      width: var(--dw-right-panel-width);
      max-width: calc(100vw - 16px);
      z-index: 31;
      background: var(--card);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      box-shadow: -12px 0 28px color-mix(in srgb, var(--foreground) 14%, transparent);
    }
    .dw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"] {
      top: 0;
      min-height: var(--dw-panel-header-height);
      border-bottom: 1px solid var(--border);
    }
    .dw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
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
    .dw-inspector-actions [data-slot="button"],
    .dw-inspector-actions [data-slot="badge"] {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .dw-sidebar-controls {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid var(--border);
    }
    .dw-main {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--background);
    }
    .dw-toolbar {
      display: grid;
      grid-template-columns: minmax(150px, 220px) minmax(0, 1fr);
      align-items: center;
      gap: 8px 10px;
      min-height: 48px;
      padding: 8px 12px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
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
    .dw-toolbar-actions [data-slot="button"],
    .dw-toolbar-actions [data-slot="badge"] { flex: 0 0 auto; }
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
      background: var(--background);
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
      color: var(--muted-foreground);
      pointer-events: none;
      background: color-mix(in srgb, var(--background) 88%, transparent);
    }
    .dw-list {
      flex: 1 1 auto;
      min-height: 0;
      padding: 6px;
    }
    .dw-item-title {
      display: block;
      width: 100%;
      color: var(--foreground);
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dw-item-meta, .dw-muted {
      color: var(--muted-foreground);
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
      color: var(--foreground);
    }
    .dw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .dw-version {
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
    .dw-version-action[data-slot="button"] {
      width: var(--xpert-control-height);
      height: var(--xpert-control-height);
      padding: 0;
      justify-self: end;
    }
    .dw-inspector [data-slot="input"],
    .dw-inspector [data-slot="textarea"],
    .dw-inspector [data-slot="scroll-area"],
    .dw-inspector [data-slot="scroll-area-viewport"] {
      min-width: 0;
      max-width: 100%;
    }
    .dw-inspector [data-slot="textarea"] {
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
      color: var(--muted-foreground);
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
      .dw-sidebar [data-sidebar-slot="content"],
      .dw-inspector-scroll { display: none; }
      .dw-inspector[aria-expanded="true"] .dw-inspector-scroll { display: block; }
      [data-sidebar-slot="rail"] { display: flex; }
    }
    @media (max-width: 920px) {
      .dw-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }
      .dw-status { margin-left: 0; }
    }
    [data-slot="badge"][data-status="success"] { border-color: color-mix(in srgb, var(--status-success) 30%, var(--border)); background: var(--status-success-background); color: var(--status-success); }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
