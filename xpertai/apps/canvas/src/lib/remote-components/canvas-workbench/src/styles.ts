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
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans, -apple-system), "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif;
    }
    button, input, textarea { font: inherit; }
    .cw-root {
      --cw-rail-width: var(--xpert-sidebar-rail-width, 2.75rem);
      --cw-left-width: clamp(252px, 19vw, 292px);
      --cw-right-width: clamp(320px, 23vw, 368px);
      width: 100vw;
      height: 100vh;
      min-height: 640px;
      display: grid;
      grid-template-columns: var(--cw-left-width) minmax(0, 1fr) var(--cw-right-width);
      grid-template-areas: "left workspace right";
      background: var(--muted);
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
      display: flex;
      flex-direction: column;
      background: var(--card);
      overflow: hidden;
      isolation: isolate;
    }
    .cw-sidebar {
      grid-area: left;
      border-right: 1px solid var(--border);
    }
    .cw-inspector {
      grid-area: right;
      border-left: 1px solid var(--border);
    }
    .cw-sidebar[data-sidebar-slot="sidebar"][data-collapsed="true"],
    .cw-inspector[data-sidebar-slot="sidebar"][data-collapsed="true"] {
      grid-template-rows: minmax(0, 1fr);
      align-items: start;
      justify-items: stretch;
    }
    .cw-sidebar [data-sidebar-slot="content"],
    .cw-inspector [data-sidebar-slot="content"] {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .cw-inspector-content {
      flex: 1 1 auto;
      height: calc(100vh - 58px);
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
      padding: 8px 0;
      background: var(--card);
    }
    .cw-workspace {
      grid-area: workspace;
      min-width: 0;
      height: 100vh;
      min-height: 640px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--background);
      overflow: hidden;
    }
    .cw-toolbar {
      position: relative;
      z-index: 80;
      min-width: 0;
      min-height: 56px;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
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
    [data-sidebar-slot="title"] {
      min-width: 0;
      color: var(--foreground);
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
      color: var(--foreground);
      font-size: 0.8125rem;
      font-weight: 650;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-item-meta {
      min-width: 0;
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-sidebar-header {
      min-height: 58px;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: var(--card);
    }
    .cw-sidebar-header [data-sidebar-slot="title"] {
      flex: 1 1 auto;
    }
    .cw-sidebar-header [data-slot="button"] {
      flex: 0 0 auto;
    }
    .cw-panel-heading {
      min-width: 0;
      flex: 1 1 auto;
      display: grid;
      gap: 3px;
    }
    .cw-panel-subtitle {
      min-width: 0;
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      font-weight: 550;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-search {
      padding: 10px 10px 8px;
    }
    .cw-panel-section-label {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 12px 6px;
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .cw-list-scroll,
    .cw-inspector-scroll {
      width: 100%;
      height: auto;
      flex: 1 1 auto;
      min-height: 0;
    }
    .cw-document-list {
      min-width: 0;
      padding: 4px 8px 12px;
      gap: 4px;
    }
    .cw-document-button[data-slot="button"] {
      width: 100%;
      height: auto;
      min-height: 46px;
      display: grid;
      justify-content: stretch;
      align-items: center;
      gap: 3px;
      position: relative;
      padding: 9px 10px;
      text-align: left;
      border: 1px solid transparent;
      border-radius: calc(var(--radius) - 2px);
      transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
    }
    .cw-document-button[data-slot="button"]:hover {
      background: var(--accent);
    }
    .cw-document-button[data-slot="button"][data-active="true"] {
      border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
      background: color-mix(in srgb, var(--primary) 9%, var(--card));
      box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
    }
    .cw-document-heading {
      min-width: 0;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cw-document-current {
      flex: 0 0 auto;
      height: 18px;
      padding-inline: 6px;
      font-size: 0.625rem;
    }
    [data-slot="button"][data-slot="button"][data-variant="destructive"][data-slot="button"][data-size="icon"] {
      flex-shrink: 0;
    }
    .cw-canvas {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--muted);
    }
	    .cw-canvas .tl-container {
	      --color-background: var(--background);
	      --color-low: var(--muted);
	      --color-muted-1: var(--muted);
	      --color-text-1: var(--foreground);
	    }
	    .cw-theme-dark .cw-canvas .tl-container {
	      color-scheme: dark;
	    }
    .cw-theme-light .cw-canvas .tl-container {
      color-scheme: light;
    }
    .cw-root[data-tldraw-license="missing"] .cw-canvas [data-testid="tl-watermark-unlicensed"],
    .cw-root[data-tldraw-license="missing"] .cw-canvas .tl-watermark_SEE-LICENSE {
      display: none !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }
    .cw-empty {
      display: grid;
      width: 100%;
      height: 100%;
      place-items: center;
      color: var(--muted-foreground);
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
    .cw-toolbar-presence {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cw-collaborators {
      min-width: 0;
      display: flex;
      align-items: center;
      padding-left: 2px;
    }
    .cw-collaborator {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 2px solid var(--card);
      outline: 2px solid var(--cw-collaborator-color, #0f766e);
      background: color-mix(in srgb, var(--cw-collaborator-color, #0f766e) 16%, var(--card));
      color: var(--foreground);
      font-size: 11px;
      font-weight: 750;
      overflow: hidden;
      cursor: default;
      transition: transform 120ms ease, z-index 120ms ease;
    }
    .cw-collaborator + .cw-collaborator {
      margin-left: -8px;
    }
    .cw-collaborator:hover,
    .cw-collaborator:focus-visible {
      z-index: 10;
      transform: translateY(-1px);
    }
    .cw-collaborator img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .cw-collaborator[data-actor='agent'] {
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cw-collaborator-color, #0f766e) 24%, transparent);
    }
    .cw-collaborator-overflow {
      outline-color: var(--border);
      background: var(--muted);
      color: var(--muted-foreground);
    }
    .cw-collaborator-tooltip {
      display: grid;
      gap: 2px;
    }
    .cw-collaborator-tooltip span {
      color: var(--muted-foreground);
      font-size: 0.6875rem;
    }
    .cw-separator[data-slot="separator"][data-orientation="vertical"] {
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
      margin: 10px;
      width: calc(100% - 20px);
    }
    .cw-tab-content {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      gap: 10px;
      padding: 0 10px 10px;
      margin: 0;
      overflow: hidden;
    }
    .cw-tab-content[data-state="inactive"] {
      display: none;
    }
    .cw-tab-content[data-state="active"] {
      display: flex;
    }
    .cw-section {
      min-width: 0;
      display: grid;
      gap: 5px;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
      background: var(--card);
    }
    .cw-section-title {
      color: var(--muted-foreground);
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
    .cw-inspector-scroll [data-slot="scroll-area-viewport"] {
      display: block;
      height: 100%;
    }
    .cw-inspector-scroll [data-slot="scroll-area-viewport"] > div {
      display: block !important;
      min-height: 0 !important;
    }
    .cw-inspector-list {
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      gap: 6px;
      padding-bottom: 8px;
    }
    .cw-version-panel-header {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--muted) 56%, var(--card));
    }
    .cw-version-panel-copy {
      min-width: 0;
      flex: 1 1 auto;
      display: grid;
      gap: 3px;
    }
    .cw-version-panel-copy strong {
      font-size: 0.8125rem;
    }
    .cw-version-panel-copy span {
      min-width: 0;
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cw-version,
    .cw-log {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px;
      color: var(--foreground);
      font-size: 0.8125rem;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
      background: var(--card);
    }
    .cw-version[data-current="true"] {
      border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
      background: color-mix(in srgb, var(--primary) 6%, var(--card));
    }
    .cw-version > div:first-child {
      min-width: 0;
      flex: 1 1 auto;
    }
    .cw-version-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      flex: 0 0 auto;
    }
    .cw-log {
      display: grid;
      justify-content: stretch;
      color: var(--muted-foreground);
      line-height: 1.35;
    }
    .cw-version strong,
    .cw-log strong {
      color: var(--foreground);
      font-weight: 700;
    }
    .cw-share-dialog {
      width: min(560px, calc(100vw - 32px));
      max-width: 560px;
      gap: 16px;
      z-index: 5100;
    }
    [data-slot="dialog-overlay"],
    [data-slot="alert-dialog-overlay"] { z-index: 5000; }
    [data-slot="dialog-content"],
    [data-slot="alert-dialog-content"] { z-index: 5100; }
    .cw-share-setting-row,
    .cw-share-version-row,
    .cw-share-access-row,
    .cw-share-link-status,
    .cw-share-link-field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .cw-share-setting-row {
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--muted) 72%, var(--card));
    }
    .cw-share-setting-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }
    .cw-share-setting-copy strong {
      color: var(--foreground);
      font-size: 0.875rem;
    }
    .cw-share-setting-copy span,
    .cw-share-version-row,
    .cw-share-link-status,
    .cw-share-note {
      color: var(--muted-foreground);
      font-size: 0.75rem;
      line-height: 1.45;
    }
    .cw-share-version-row {
      min-height: 28px;
      padding: 0 2px;
    }
    .cw-share-access-row {
      align-items: stretch;
    }
    .cw-share-access-select {
      min-width: 0;
      flex: 1 1 auto;
    }
    .cw-share-link-status {
      min-height: 34px;
      padding-top: 2px;
      border-top: 1px solid var(--border);
    }
    .cw-share-link-field input {
      min-width: 0;
      flex: 1 1 auto;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.75rem;
    }
    .cw-share-note {
      margin: 0;
      padding: 10px 12px;
      border-radius: calc(var(--radius) - 2px);
      background: color-mix(in srgb, var(--primary) 6%, var(--card));
    }
    .cw-panel-empty {
      min-height: 112px;
      display: grid;
      place-items: center;
      padding: 16px;
      color: var(--muted-foreground);
      font-size: 0.75rem;
      text-align: center;
    }
    @media (max-width: 1320px) {
      .cw-root {
        --cw-left-width: clamp(236px, 20vw, 260px);
        --cw-right-width: clamp(300px, 25vw, 332px);
      }
    }
    @media (max-width: 1040px) {
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
    @media (max-width: 900px) {
      .cw-root {
        --cw-left-width: var(--cw-rail-width);
        --cw-right-width: var(--cw-rail-width);
      }
      .cw-root:not(.left-collapsed) .cw-sidebar,
      .cw-root:not(.right-collapsed) .cw-inspector {
        position: absolute;
        top: 0;
        bottom: 0;
        width: min(320px, calc(100vw - 72px));
        box-shadow: 0 16px 40px color-mix(in srgb, var(--foreground) 18%, transparent);
      }
      .cw-root:not(.left-collapsed) .cw-sidebar { left: 0; }
      .cw-root:not(.right-collapsed) .cw-inspector { right: 0; }
    }
    [data-slot="badge"][data-status="success"] { border-color: color-mix(in srgb, var(--status-success) 30%, var(--border)); background: var(--status-success-background); color: var(--status-success); }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
