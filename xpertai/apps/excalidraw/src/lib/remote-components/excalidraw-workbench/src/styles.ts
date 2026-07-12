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
      min-height: 0;
      margin: 0;
      overflow: hidden;
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans);
    }
    * {
      box-sizing: border-box;
    }
    button, input, select, textarea {
      font: inherit;
    }
    .exw-shell {
      --exw-rail-width: var(--xpert-sidebar-rail-width, 44px);
      --exw-panel-header-height: 2.5rem;
      --exw-left-panel-width: clamp(240px, 20vw, 300px);
      --exw-left-width: minmax(var(--exw-rail-width), var(--exw-left-panel-width));
      --exw-right-width: var(--exw-rail-width);
      --exw-right-panel-width: min(320px, calc(100vw - var(--exw-rail-width) - 96px));
      width: 100%;
      height: 100vh;
      min-height: 0;
      display: grid;
      grid-template-columns: var(--exw-left-width) minmax(0, 1fr) var(--exw-right-width);
      background: var(--background);
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
      min-height: 0;
      color: var(--foreground);
    }
    .exw-sidebar[data-sidebar-slot="sidebar"] {
      position: relative;
      z-index: 30;
      overflow: hidden;
    }
    .exw-sidebar > [data-sidebar-slot="header"],
    .exw-sidebar > [data-sidebar-slot="content"],
    .exw-inspector > [data-sidebar-slot="header"],
    .exw-inspector > [data-sidebar-slot="content"] {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }
    .exw-sidebar > [data-sidebar-slot="header"],
    .exw-inspector > [data-sidebar-slot="header"] {
      height: var(--exw-panel-header-height);
      padding: 4px 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1px solid var(--border);
      background: var(--card);
    }
    .exw-sidebar > [data-sidebar-slot="content"],
    .exw-inspector > [data-sidebar-slot="content"] {
      height: calc(100% - var(--exw-panel-header-height));
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .exw-sidebar [data-sidebar-slot="title"],
    .exw-inspector [data-sidebar-slot="title"] {
      min-width: 0;
      color: var(--foreground);
      font-size: 13px;
      line-height: 1.25;
      font-weight: 650;
    }
    .exw-sidebar [data-sidebar-slot="trigger"],
    .exw-inspector [data-sidebar-slot="trigger"] {
      width: 30px;
      height: 30px;
      padding: 0;
      flex: 0 0 30px;
      border-radius: calc(var(--radius) - 2px);
    }
    .exw-sidebar [data-sidebar-slot="rail"],
    .exw-inspector [data-sidebar-slot="rail"] {
      width: 100%;
      min-height: 0;
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      color: var(--muted-foreground);
      font-size: 11px;
      line-height: 1;
      font-weight: 650;
      letter-spacing: 0.12em;
      writing-mode: vertical-rl;
    }
    .exw-inspector[data-sidebar-slot="sidebar"] {
      position: relative;
      z-index: 30;
      overflow: visible;
    }
    .exw-inspector[aria-expanded="true"] {
      background: color-mix(in srgb, var(--card) 94%, var(--muted) 6%);
    }
    .exw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"],
    .exw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
      position: absolute;
      right: 0;
      width: var(--exw-right-panel-width);
      max-width: calc(100vw - 16px);
      z-index: 31;
      background: var(--card);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      box-shadow: -12px 0 28px color-mix(in srgb, var(--foreground) 14%, transparent);
    }
    .exw-inspector[aria-expanded="true"] > [data-sidebar-slot="header"] {
      top: 0;
      min-height: var(--exw-panel-header-height);
      border-bottom: 1px solid var(--border);
    }
    .exw-inspector[aria-expanded="true"] > [data-sidebar-slot="content"] {
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
      border-bottom: 1px solid var(--border);
      background: var(--card);
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
    .exw-inspector-actions [data-slot="button"],
    .exw-inspector-actions [data-slot="badge"] {
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
      border-bottom: 1px solid var(--border);
      min-width: 0;
      max-width: 100%;
    }
    .exw-sidebar [data-slot="input"],
    .exw-sidebar [data-slot="select-trigger"],
    .exw-sidebar [data-slot="scroll-area"],
    .exw-sidebar [data-slot="scroll-area-viewport"],
    .exw-sidebar [data-sidebar-slot="menu"],
    .exw-sidebar [data-sidebar-slot="menu-item"] {
      min-width: 0;
      max-width: 100%;
    }
    .exw-sidebar [data-slot="scroll-area-viewport"] > div,
    .exw-inspector [data-slot="scroll-area-viewport"] > div {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }
    .exw-main {
      min-width: 0;
      height: 100vh;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--background);
    }
    .exw-toolbar {
      display: grid;
      grid-template-columns: minmax(140px, 200px) minmax(0, 1fr);
      align-items: center;
      gap: 6px 8px;
      min-height: 48px;
      padding: 7px 10px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      min-width: 0;
      overflow: visible;
    }
    .exw-toolbar-title {
      min-width: 0;
    }
    .exw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
    }
    .exw-toolbar-actions::-webkit-scrollbar {
      display: none;
    }
    .exw-toolbar-actions [data-slot="button"],
    .exw-toolbar-actions [data-slot="badge"] {
      flex: 0 0 auto;
    }
    .exw-collaboration-status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .exw-presence-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: currentColor;
    }
    .exw-collaborators {
      display: flex;
      align-items: center;
      padding-left: 5px;
    }
    .exw-collaborator {
      width: 26px;
      height: 26px;
      margin-left: -5px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--card);
      border-radius: 999px;
      background: var(--exw-collaborator-color, var(--primary));
      color: white;
      font-size: 10px;
      font-weight: 700;
      box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 16%, transparent);
    }
    .exw-title-input {
      width: 100%;
      height: 32px;
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
      background: var(--background);
      position: relative;
      overflow: hidden;
    }
    .exw-canvas .excalidraw {
      --color-primary: var(--primary);
    }
    .exw-list {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      max-width: 100%;
      padding: 6px;
      overflow-x: hidden;
    }
    .exw-sidebar [data-sidebar-slot="menu"] {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .exw-sidebar [data-sidebar-slot="menu-item"] {
      width: 100%;
      display: block;
    }
    .exw-list-row {
      position: relative;
      display: block;
      min-width: 0;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
    }
    .exw-list-select[data-sidebar-slot="menu-button"] {
      min-width: 0;
      width: 100%;
      height: 34px;
      padding: 0 calc(var(--xpert-control-height) + 6px) 0 8px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      justify-content: initial;
      align-items: center;
      gap: 8px;
      border-radius: calc(var(--radius) - 2px);
      text-align: left;
    }
    .exw-list-select[data-sidebar-slot="menu-button"][data-active="true"] {
      background: var(--sidebar-accent);
      color: var(--sidebar-accent-foreground);
    }
    .exw-list-delete[data-slot="button"] {
      position: absolute;
      top: 50%;
      right: 4px;
      transform: translateY(-50%);
      width: var(--xpert-control-height);
      height: var(--xpert-control-height);
      padding: 0;
      color: var(--muted-foreground);
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease, color 120ms ease;
    }
    .exw-list-row:hover .exw-list-delete[data-slot="button"],
    .exw-list-row:focus-within .exw-list-delete[data-slot="button"] {
      opacity: 1;
      pointer-events: auto;
    }
    .exw-list-delete[data-slot="button"]:hover {
      color: var(--destructive);
    }
    .exw-item-title {
      display: block;
      width: 100%;
      color: var(--foreground);
      font-size: 13px;
      line-height: 1.25;
      font-weight: 550;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-item-meta, .exw-muted {
      color: var(--muted-foreground);
      font-size: 11px;
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
      color: var(--foreground);
    }
    .exw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .exw-template-panel,
    .exw-quality-panel {
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--card) 94%, var(--muted) 6%);
    }
    .exw-template-filters {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 6px;
    }
    .exw-template-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 180px;
      overflow: auto;
    }
    .exw-template-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
      background: var(--background);
      color: var(--foreground);
      text-align: left;
      cursor: pointer;
    }
    .exw-template-card:hover,
    .exw-template-card.is-selected {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 8%, var(--background) 92%);
    }
    .exw-template-card-title {
      font-size: 12px;
      font-weight: 650;
    }
    .exw-template-thumbnail {
      width: 100%;
      height: 72px;
      object-fit: cover;
      border-radius: calc(var(--radius) - 4px);
      background: #fff;
    }
    .exw-template-card-meta {
      color: var(--muted-foreground);
      font-size: 11px;
    }
    .exw-template-form {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .exw-quality-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 7px 12px;
      font-size: 12px;
      color: var(--muted-foreground);
    }
    .exw-quality-grid strong {
      color: var(--foreground);
    }
    .exw-version {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--card) 94%, var(--muted) 6%);
      padding: 10px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
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
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%);
    }
    .exw-version.is-current {
      border-color: color-mix(in srgb, var(--primary) 54%, var(--border) 46%);
      background: color-mix(in srgb, var(--primary) 9%, var(--card) 91%);
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
      color: var(--foreground);
      font-weight: 650;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-version-meta {
      color: var(--muted-foreground);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exw-version-summary {
      color: var(--muted-foreground);
      font-size: 12px;
      overflow: hidden;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    .exw-version-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      flex-shrink: 0;
    }
    .exw-version-action[data-slot="button"] {
      width: var(--xpert-control-height);
      height: var(--xpert-control-height);
      padding: 0;
      justify-self: end;
      align-self: start;
    }
    .exw-confirm-dialog[data-slot="alert-dialog-content"] {
      width: min(420px, calc(100vw - 32px));
      max-width: 420px;
    }
    .exw-share-dialog {
      width: min(600px, calc(100vw - 32px));
      max-width: 600px;
      padding: 0;
      gap: 0;
      overflow: hidden;
      border-radius: calc(var(--radius) + 6px);
      box-shadow: 0 24px 72px color-mix(in srgb, var(--foreground) 22%, transparent);
    }
    .exw-share-header {
      padding: 22px 24px 18px;
      border-bottom: 1px solid var(--border);
    }
    .exw-share-header [data-slot="dialog-title"] {
      font-size: 20px;
      line-height: 1.25;
    }
    .exw-share-header [data-slot="dialog-description"] {
      margin-top: 5px;
      font-size: 13px;
      color: var(--muted-foreground);
    }
    .exw-share-version-section {
      padding: 4px 24px;
      border-bottom: 1px solid var(--border);
    }
    .exw-share-setting-row,
    .exw-share-version-row {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    .exw-share-setting-row {
      border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    }
    .exw-share-setting-copy,
    .exw-share-export-heading {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .exw-share-setting-copy strong,
    .exw-share-export-heading strong {
      color: var(--foreground);
      font-size: 14px;
      font-weight: 650;
    }
    .exw-share-setting-copy span,
    .exw-share-export-heading span,
    .exw-share-version-row,
    .exw-share-link-status {
      color: var(--muted-foreground);
      font-size: 12px;
    }
    .exw-share-access-row {
      padding: 18px 24px 10px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }
    .exw-share-access-select {
      width: 100%;
      min-width: 0;
      height: 42px;
    }
    .exw-share-primary-action[data-slot="button"] {
      min-width: 136px;
      height: 42px;
      font-weight: 650;
    }
    .exw-share-link-status {
      min-height: 40px;
      padding: 0 24px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .exw-share-link-field {
      padding: 0 24px 16px;
    }
    .exw-share-link-field [data-slot="input"] {
      width: 100%;
      height: 38px;
      color: var(--muted-foreground);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
    }
    .exw-share-export-section {
      padding: 18px 24px 22px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: color-mix(in srgb, var(--muted) 24%, var(--card) 76%);
    }
    .exw-share-export-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .exw-share-export-actions [data-slot="button"] {
      width: 100%;
      height: 40px;
    }
    .exw-inspector [data-slot="input"],
    .exw-inspector [data-slot="textarea"],
    .exw-inspector [data-slot="scroll-area"],
    .exw-inspector [data-slot="scroll-area-viewport"] {
      min-width: 0;
      max-width: 100%;
    }
    .exw-inspector [data-slot="textarea"] {
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
      color: var(--muted-foreground);
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
        --exw-left-panel-width: min(280px, calc(100vw - var(--exw-rail-width) - 24px));
        --exw-right-panel-width: min(300px, calc(100vw - var(--exw-rail-width) - 24px));
        grid-template-columns: var(--exw-left-width) minmax(0, 1fr) var(--exw-right-width);
      }
      .exw-sidebar:not([aria-expanded="false"]),
      .exw-inspector:not([aria-expanded="false"]) {
        width: var(--exw-rail-width);
      }
      .exw-sidebar[data-sidebar-slot="sidebar"] {
        overflow: visible;
      }
      .exw-sidebar[aria-expanded="true"] {
        background: color-mix(in srgb, var(--card) 94%, var(--muted) 6%);
      }
      .exw-sidebar[aria-expanded="true"] > [data-sidebar-slot="header"],
      .exw-sidebar[aria-expanded="true"] > [data-sidebar-slot="content"] {
        position: absolute;
        left: 0;
        width: var(--exw-left-panel-width);
        max-width: calc(100vw - 16px);
        z-index: 31;
        background: var(--card);
        border-left: 1px solid var(--border);
        border-right: 1px solid var(--border);
        box-shadow: 12px 0 28px color-mix(in srgb, var(--foreground) 14%, transparent);
      }
      .exw-sidebar[aria-expanded="true"] > [data-sidebar-slot="header"] {
        top: 0;
        min-height: var(--exw-panel-header-height);
        border-bottom: 1px solid var(--border);
      }
      .exw-sidebar[aria-expanded="true"] > [data-sidebar-slot="content"] {
        top: var(--exw-panel-header-height);
        bottom: 0;
        min-height: 0;
        overflow: hidden;
        display: flex;
      }
      .exw-sidebar[aria-expanded="false"] [data-sidebar-slot="content"],
      .exw-inspector-scroll {
        display: none;
      }
      .exw-inspector[aria-expanded="true"] .exw-inspector-scroll {
        display: block;
      }
      .exw-sidebar[aria-expanded="false"] [data-sidebar-slot="header"] [data-sidebar-slot="title"],
      .exw-sidebar[aria-expanded="false"] [data-sidebar-slot="header"] [data-slot="badge"],
      .exw-sidebar[aria-expanded="false"] [data-sidebar-slot="header"] [data-slot="button"]:not([data-sidebar-slot="trigger"]),
      .exw-inspector[aria-expanded="false"] [data-sidebar-slot="header"] [data-sidebar-slot="title"],
      .exw-inspector[aria-expanded="false"] [data-sidebar-slot="header"] [data-slot="badge"],
      .exw-inspector[aria-expanded="false"] [data-sidebar-slot="header"] [data-slot="button"]:not([data-sidebar-slot="trigger"]) {
        display: none;
      }
    }
    @media (max-width: 620px) {
      .exw-share-access-row {
        grid-template-columns: minmax(0, 1fr);
      }
      .exw-share-primary-action[data-slot="button"] {
        width: 100%;
      }
      .exw-share-export-actions {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 760px) {
      .exw-toolbar {
        grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
        padding-inline: 8px;
      }
    }
    [data-slot="badge"][data-status="success"] { border-color: color-mix(in srgb, var(--status-success) 30%, var(--border)); background: var(--status-success-background); color: var(--status-success); }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
