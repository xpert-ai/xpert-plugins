export function injectStyles() {
  if (document.getElementById('excalidraw-workbench-styles')) {
    return
  }
  const style = document.createElement('style')
  style.id = 'excalidraw-workbench-styles'
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
    * {
      box-sizing: border-box;
    }
    button, input, select, textarea {
      font: inherit;
    }
    .exw-shell {
      --exw-rail-width: var(--xps-sidebar-rail-width, 44px);
      --exw-panel-header-height: 2.5rem;
      --exw-left-panel-width: clamp(240px, 20vw, 300px);
      --exw-left-width: minmax(var(--exw-rail-width), var(--exw-left-panel-width));
      --exw-right-width: var(--exw-rail-width);
      --exw-right-panel-width: min(320px, calc(100vw - var(--exw-rail-width) - 96px));
      width: 100%;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-columns: var(--exw-left-width) minmax(0, 1fr) var(--exw-right-width);
      background: var(--xps-background);
      overflow: hidden;
      transition: grid-template-columns 160ms ease;
    }
    .exw-shell.left-collapsed {
      --exw-left-width: var(--exw-rail-width);
    }
    .exw-shell.right-collapsed {
      --exw-right-width: var(--exw-rail-width);
    }
    .exw-shell.left-collapsed.right-collapsed {
      --exw-left-width: var(--exw-rail-width);
      --exw-right-width: var(--exw-rail-width);
    }
    .exw-sidebar, .exw-inspector {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
    }
    .exw-sidebar.xps-sidebar {
      position: relative;
      z-index: 30;
      overflow: visible;
    }
    .exw-inspector.xps-sidebar {
      position: relative;
      z-index: 30;
      overflow: visible;
    }
    .exw-inspector[aria-expanded="true"] {
      background: color-mix(in srgb, var(--xps-card) 94%, var(--xps-muted) 6%);
    }
    .exw-inspector[aria-expanded="true"] > .xps-sidebar-header,
    .exw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      position: absolute;
      right: 0;
      width: var(--exw-right-panel-width);
      max-width: calc(100vw - 16px);
      z-index: 31;
      background: var(--xps-card);
      border-left: 1px solid var(--xps-border);
      border-right: 1px solid var(--xps-border);
      box-shadow: -12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
    }
    .exw-inspector[aria-expanded="true"] > .xps-sidebar-header {
      top: 0;
      min-height: var(--exw-panel-header-height);
      border-bottom: 1px solid var(--xps-border);
    }
    .exw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      top: var(--exw-panel-header-height);
      bottom: 0;
      min-height: 0;
      overflow: hidden;
    }
    .exw-sidebar-title-truncate {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-sidebar-trigger-right {
      margin-left: auto;
    }
    .exw-inspector-content {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .exw-inspector-panel-header {
      flex: 0 0 auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid var(--xps-border);
      background: var(--xps-card);
      min-width: 0;
      max-width: 100%;
    }
    .exw-inspector-actions {
      min-width: 0;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .exw-inspector-actions .xps-button,
    .exw-inspector-actions .xps-badge {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .exw-versions-toggle-icon {
      transition: transform 160ms ease;
    }
    .exw-versions-toggle-icon.is-open {
      transform: rotate(180deg);
    }
    .exw-sidebar-controls {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid var(--xps-border);
    }
    .exw-main {
      min-width: 0;
      height: 100vh;
      min-height: 720px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--xps-background);
    }
    .exw-toolbar {
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
    .exw-toolbar-title {
      min-width: 0;
    }
    .exw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .exw-toolbar-actions .xps-button,
    .exw-toolbar-actions .xps-badge {
      flex: 0 0 auto;
    }
    .exw-title-input {
      width: 100%;
    }
    .exw-button-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
    .exw-canvas {
      min-height: 0;
      height: 100%;
      background: var(--xps-background);
      position: relative;
      overflow: hidden;
    }
    .exw-canvas .excalidraw {
      --color-primary: var(--xps-primary);
    }
    .exw-list {
      flex: 1 1 auto;
      min-height: 0;
      padding: 6px;
    }
    .exw-item-title {
      display: block;
      width: 100%;
      color: var(--xps-foreground);
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-item-meta, .exw-muted {
      color: var(--xps-muted-foreground);
      font-size: 12px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-status {
      margin-left: auto;
      flex: 0 0 auto;
    }
    .exw-inspector-scroll {
      min-height: 0;
      height: 100%;
      flex: 1 1 auto;
    }
    .exw-inspector-stack {
      padding: 10px;
      padding-right: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
    }
    .exw-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    .exw-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--xps-foreground);
    }
    .exw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .exw-version {
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: color-mix(in srgb, var(--xps-card) 94%, var(--xps-muted) 6%);
      padding: 10px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--xps-control-height);
      align-items: start;
      gap: 8px;
      width: 100%;
      min-width: 0;
      overflow: hidden;
      min-height: 66px;
    }
    .exw-version-panel {
      max-height: min(360px, 42vh);
      overflow: auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: color-mix(in srgb, var(--xps-card) 88%, var(--xps-muted) 12%);
    }
    .exw-version.is-current {
      border-color: color-mix(in srgb, var(--xps-primary) 54%, var(--xps-border) 46%);
      background: color-mix(in srgb, var(--xps-primary) 9%, var(--xps-card) 91%);
    }
    .exw-version-main {
      min-width: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 2px;
      line-height: 1.24;
    }
    .exw-version-title {
      color: var(--xps-foreground);
      font-weight: 650;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-version-meta {
      color: var(--xps-muted-foreground);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-version-summary {
      color: var(--xps-muted-foreground);
      font-size: 12px;
      overflow: hidden;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    .exw-version-action.xps-button {
      width: var(--xps-control-height);
      height: var(--xps-control-height);
      padding: 0;
      justify-self: end;
      align-self: start;
    }
    .exw-inspector .xps-input,
    .exw-inspector .xps-textarea,
    .exw-inspector .xps-scroll-area,
    .exw-inspector .xps-scroll-area-viewport {
      min-width: 0;
      max-width: 100%;
    }
    .exw-inspector .xps-textarea {
      overflow-x: hidden;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .exw-inspector .exw-muted {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .exw-empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--xps-muted-foreground);
    }
    .exw-hidden-file {
      display: none;
    }
    @media (max-width: 1040px) {
      .exw-shell,
      .exw-shell.left-collapsed,
      .exw-shell.right-collapsed,
      .exw-shell.left-collapsed.right-collapsed {
        --exw-left-width: var(--exw-rail-width);
        --exw-right-width: var(--exw-rail-width);
        --exw-left-panel-width: min(300px, calc(100vw - var(--exw-rail-width) - 32px));
        --exw-right-panel-width: min(300px, calc(100vw - var(--exw-rail-width) - 32px));
        grid-template-columns: var(--exw-left-width) minmax(0, 1fr) var(--exw-right-width);
      }
      .exw-sidebar:not([aria-expanded="false"]),
      .exw-inspector:not([aria-expanded="false"]) {
        width: var(--exw-rail-width);
      }
      .exw-sidebar[aria-expanded="true"] {
        background: color-mix(in srgb, var(--xps-card) 94%, var(--xps-muted) 6%);
      }
      .exw-sidebar[aria-expanded="true"] > .xps-sidebar-header,
      .exw-sidebar[aria-expanded="true"] > .xps-sidebar-content {
        position: absolute;
        left: 0;
        width: var(--exw-left-panel-width);
        max-width: calc(100vw - 16px);
        z-index: 31;
        background: var(--xps-card);
        border-left: 1px solid var(--xps-border);
        border-right: 1px solid var(--xps-border);
        box-shadow: 12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
      }
      .exw-sidebar[aria-expanded="true"] > .xps-sidebar-header {
        top: 0;
        min-height: var(--exw-panel-header-height);
        border-bottom: 1px solid var(--xps-border);
      }
      .exw-sidebar[aria-expanded="true"] > .xps-sidebar-content {
        top: var(--exw-panel-header-height);
        bottom: 0;
        min-height: 0;
        overflow: hidden;
        display: flex;
      }
      .exw-sidebar[aria-expanded="false"] .xps-sidebar-content,
      .exw-inspector-scroll {
        display: none;
      }
      .exw-inspector[aria-expanded="true"] .exw-inspector-scroll {
        display: block;
      }
      .exw-sidebar[aria-expanded="false"] .xps-sidebar-header .xps-sidebar-title,
      .exw-sidebar[aria-expanded="false"] .xps-sidebar-header .xps-badge,
      .exw-sidebar[aria-expanded="false"] .xps-sidebar-header .xps-button:not(.xps-sidebar-trigger),
      .exw-inspector[aria-expanded="false"] .xps-sidebar-header .xps-sidebar-title,
      .exw-inspector[aria-expanded="false"] .xps-sidebar-header .xps-badge,
      .exw-inspector[aria-expanded="false"] .xps-sidebar-header .xps-button:not(.xps-sidebar-trigger) {
        display: none;
      }
      .xps-sidebar-rail {
        display: flex;
      }
    }
    @media (max-width: 920px) {
      .exw-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }
      .exw-status {
        margin-left: 0;
      }
    }
  `
  document.head.appendChild(style)
}
