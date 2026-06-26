export function injectStyles() {
  if (document.getElementById('canvas-workbench-styles')) {
    return
  }
  const style = document.createElement('style')
  style.id = 'canvas-workbench-styles'
  style.textContent = `
    * { box-sizing: border-box; }
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
    button, input, textarea { font: inherit; }
    .cw-root {
      --cw-rail-width: var(--xps-sidebar-rail-width, 2.75rem);
      --cw-left-width: clamp(230px, 20vw, 300px);
      --cw-right-width: clamp(300px, 24vw, 380px);
      width: 100vw;
      height: 100vh;
      min-height: 640px;
      display: grid;
      grid-template-columns: var(--cw-left-width) minmax(0, 1fr) var(--cw-right-width);
      background: var(--xps-background);
      overflow: hidden;
      transition: grid-template-columns 160ms ease;
    }
    .cw-root.left-collapsed { --cw-left-width: var(--cw-rail-width); }
    .cw-root.right-collapsed { --cw-right-width: var(--cw-rail-width); }
    .cw-sidebar,
    .cw-inspector {
      position: relative;
      z-index: 110;
      min-width: 0;
      height: 100vh;
      min-height: 640px;
    }
    .cw-sidebar.xps-sidebar--collapsed,
    .cw-inspector.xps-sidebar--collapsed {
      grid-template-rows: minmax(0, 1fr);
      align-items: start;
      justify-items: stretch;
    }
    .cw-sidebar .xps-sidebar-content,
    .cw-inspector .xps-sidebar-content {
      min-height: 0;
      overflow: hidden;
    }
    .cw-inspector-content {
      flex: 1 1 auto;
      height: calc(100vh - 46px);
      align-items: stretch;
      justify-content: flex-start;
    }
    .cw-rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      min-height: 100%;
      height: 100%;
      padding-top: 6px;
    }
    .cw-workspace {
      min-width: 0;
      height: 100vh;
      min-height: 640px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--xps-background);
      overflow: hidden;
    }
    .cw-toolbar {
      position: relative;
      z-index: 80;
      min-width: 0;
      min-height: 46px;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 7px 10px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
      overflow: hidden;
    }
    .cw-toolbar-title {
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .cw-toolbar-actions {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .cw-toolbar-actions::-webkit-scrollbar { display: none; }
    .cw-title,
    .xps-sidebar-title {
      min-width: 0;
      color: var(--xps-foreground);
      font-size: 0.875rem;
      font-weight: 750;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-item-title {
      min-width: 0;
      width: 100%;
      color: var(--xps-foreground);
      font-size: 0.8125rem;
      font-weight: 650;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-item-meta {
      min-width: 0;
      color: var(--xps-muted-foreground);
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-sidebar-header {
      min-height: 46px;
      gap: 8px;
      padding: 7px 8px;
    }
    .cw-sidebar-header .xps-sidebar-title {
      flex: 1 1 auto;
    }
    .cw-sidebar-header .xps-button {
      flex: 0 0 auto;
    }
    .cw-search {
      padding: 8px;
      border-bottom: 1px solid var(--xps-border);
    }
    .cw-list-scroll,
    .cw-inspector-scroll {
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .cw-document-list {
      min-width: 0;
      padding: 6px;
      gap: 5px;
    }
    .cw-document-button.xps-button {
      width: 100%;
      height: auto;
      min-height: 46px;
      display: grid;
      justify-content: stretch;
      align-items: center;
      gap: 3px;
      padding: 7px 8px;
      text-align: left;
    }
    .cw-canvas {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--xps-muted);
    }
    .cw-canvas .tl-container {
      --color-background: var(--xps-background);
      --color-low: var(--xps-muted);
      --color-muted-1: var(--xps-muted);
      --color-text-1: var(--xps-foreground);
    }
    .cw-empty {
      display: grid;
      width: 100%;
      height: 100%;
      place-items: center;
      color: var(--xps-muted-foreground);
      font-size: 0.875rem;
    }
    .cw-presets {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 2px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .cw-presets::-webkit-scrollbar { display: none; }
    .cw-button-icon,
    .cw-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
    .cw-status {
      min-width: 64px;
      justify-content: center;
    }
    .cw-separator.xps-separator--vertical {
      height: 24px;
      margin: 0 2px;
    }
    .cw-hidden-file { display: none; }
    .cw-tabs {
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      align-items: stretch;
      overflow: hidden;
    }
    .cw-tabs-list {
      margin: 8px;
      width: calc(100% - 16px);
    }
    .cw-tab-content {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      gap: 8px;
      padding: 0 8px 8px;
      margin: 0;
      overflow: hidden;
    }
    .cw-section {
      min-width: 0;
      display: grid;
      gap: 5px;
      padding: 8px;
      border: 1px solid var(--xps-border);
      border-radius: calc(var(--xps-radius) - 2px);
      background: var(--xps-card);
    }
    .cw-section-title {
      color: var(--xps-muted-foreground);
      font-size: 0.6875rem;
      font-weight: 750;
      line-height: 1.2;
    }
    .cw-assistant-textarea {
      min-height: 96px;
      resize: vertical;
    }
    .cw-action-row {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .cw-inspector-scroll {
      flex: 1 1 auto;
      align-self: stretch;
    }
    .cw-inspector-scroll .xps-scroll-area-viewport {
      display: block;
      height: 100%;
    }
    .cw-inspector-scroll .xps-scroll-area-viewport > div {
      display: block !important;
      min-height: 0 !important;
    }
    .cw-inspector-list {
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
    }
    .cw-version,
    .cw-log {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 0;
      color: var(--xps-foreground);
      font-size: 0.8125rem;
      border-bottom: 1px solid var(--xps-border);
    }
    .cw-log {
      display: grid;
      justify-content: stretch;
      color: var(--xps-muted-foreground);
      line-height: 1.35;
    }
    .cw-version strong,
    .cw-log strong {
      color: var(--xps-foreground);
      font-weight: 700;
    }
    @media (max-width: 940px) {
      .cw-root {
        --cw-left-width: var(--cw-rail-width);
        --cw-right-width: var(--cw-rail-width);
      }
      .cw-toolbar {
        grid-template-columns: minmax(120px, 1fr);
      }
      .cw-toolbar-title {
        display: none;
      }
      .cw-toolbar-actions {
        justify-content: flex-start;
      }
    }
  `
  document.head.appendChild(style)
}
