export type InstallShadcnThemeVarsOptions = {
  styleId?: string
}

export function installShadcnThemeVars(options: InstallShadcnThemeVarsOptions = {}) {
  const styleId = options.styleId ?? 'xpert-plugin-shadcn-ui-vars'
  if (typeof document === 'undefined' || document.getElementById(styleId)) {
    return
  }

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    :root {
      --xps-background: var(--xui-color-background, #f8fafc);
      --xps-foreground: var(--xui-color-foreground, #0f172a);
      --xps-card: var(--xui-color-card, #ffffff);
      --xps-card-foreground: var(--xui-color-card-foreground, var(--xps-foreground));
      --xps-popover: var(--xui-color-popover, var(--xps-card));
      --xps-popover-foreground: var(--xui-color-popover-foreground, var(--xps-foreground));
      --xps-primary: var(--xui-color-primary, #2563eb);
      --xps-primary-foreground: var(--xui-color-primary-foreground, #ffffff);
      --xps-secondary: var(--xui-color-secondary, #f1f5f9);
      --xps-secondary-foreground: var(--xui-color-secondary-foreground, #0f172a);
      --xps-muted: var(--xui-color-muted, #f1f5f9);
      --xps-muted-foreground: var(--xui-color-muted-foreground, #64748b);
      --xps-accent: var(--xui-color-accent, #e0f2fe);
      --xps-accent-foreground: var(--xui-color-accent-foreground, #0f172a);
      --xps-destructive: var(--xui-color-destructive, #dc2626);
      --xps-destructive-foreground: var(--xui-color-destructive-foreground, #ffffff);
      --xps-destructive-background: var(--xui-color-destructive-background, #fee2e2);
      --xps-warning: var(--xui-color-warning, #b45309);
      --xps-warning-background: var(--xui-color-warning-background, #fffbeb);
      --xps-success: var(--xui-color-success, #047857);
      --xps-success-background: var(--xui-color-success-background, #ecfdf5);
      --xps-border: var(--xui-color-border, #e2e8f0);
      --xps-input: var(--xui-color-input, var(--xps-border));
      --xps-ring: var(--xui-color-ring, var(--xps-primary));
      --xps-radius: var(--xui-radius-md, 0.5rem);
      --xps-font-sans: var(--xui-font-sans, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      --xps-control-height: var(--xui-control-height, 2rem);
      --xps-control-height-sm: var(--xui-control-height-sm, 1.75rem);
      --xps-control-height-lg: var(--xui-control-height-lg, 2.25rem);
      --xps-control-padding-x: var(--xui-control-padding-x, 0.625rem);
      --xps-control-padding-x-sm: var(--xui-control-padding-x-sm, 0.625rem);
      --xps-control-padding-x-lg: var(--xui-control-padding-x-lg, 0.875rem);
      --xps-control-font-size: var(--xui-control-font-size, 0.8125rem);
      --xps-control-font-size-sm: var(--xui-control-font-size-sm, 0.75rem);
      --xps-sidebar-rail-width: var(--xui-sidebar-rail-width, 2.75rem);
    }

    .xps-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      height: var(--xps-control-height);
      border-radius: calc(var(--xps-radius) - 1px);
      border: 1px solid transparent;
      padding: 0 var(--xps-control-padding-x);
      font-family: inherit;
      font-size: var(--xps-control-font-size);
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
    }
    .xps-button:focus-visible,
    .xps-checkbox:focus-visible,
    .xps-dropdown-menu-item:focus,
    .xps-input:focus,
    .xps-select-trigger:focus,
    .xps-slider-thumb:focus-visible,
    .xps-switch:focus-visible,
    .xps-tabs-trigger:focus-visible,
    .xps-textarea:focus {
      outline: none;
      border-color: var(--xps-ring);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--xps-ring) 18%, transparent);
    }
    .xps-button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      pointer-events: none;
    }
    .xps-button--default {
      background: var(--xps-primary);
      color: var(--xps-primary-foreground);
      border-color: var(--xps-primary);
    }
    .xps-button--default:hover {
      background: color-mix(in srgb, var(--xps-primary) 90%, #000000 10%);
      border-color: color-mix(in srgb, var(--xps-primary) 90%, #000000 10%);
    }
    .xps-button--secondary {
      background: var(--xps-secondary);
      color: var(--xps-secondary-foreground);
      border-color: var(--xps-secondary);
    }
    .xps-button--secondary:hover,
    .xps-button--ghost:hover {
      background: color-mix(in srgb, var(--xps-muted) 82%, var(--xps-foreground) 6%);
    }
    .xps-button--outline {
      background: var(--xps-card);
      color: var(--xps-foreground);
      border-color: var(--xps-border);
    }
    .xps-button--outline:hover {
      background: var(--xps-muted);
    }
    .xps-button--ghost {
      background: transparent;
      color: var(--xps-foreground);
      border-color: transparent;
    }
    .xps-button--destructive {
      background: var(--xps-destructive);
      color: var(--xps-destructive-foreground);
      border-color: var(--xps-destructive);
    }
    .xps-button--destructive-outline {
      background: var(--xps-card);
      color: var(--xps-destructive);
      border-color: color-mix(in srgb, var(--xps-destructive) 24%, var(--xps-border));
    }
    .xps-button--sm {
      height: var(--xps-control-height-sm);
      padding: 0 var(--xps-control-padding-x-sm);
      font-size: var(--xps-control-font-size-sm);
    }
    .xps-button--lg {
      height: var(--xps-control-height-lg);
      padding: 0 var(--xps-control-padding-x-lg);
    }
    .xps-button--icon {
      width: var(--xps-control-height);
      padding: 0;
    }

    .xps-input,
    .xps-select-trigger,
    .xps-textarea {
      width: 100%;
      border: 1px solid var(--xps-input);
      border-radius: calc(var(--xps-radius) - 1px);
      background: var(--xps-card);
      color: var(--xps-foreground);
      box-sizing: border-box;
      font-family: inherit;
      font-size: var(--xps-control-font-size);
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .xps-input,
    .xps-select-trigger {
      height: var(--xps-control-height);
      padding: 0 var(--xps-control-padding-x);
    }
    .xps-select-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      cursor: pointer;
      line-height: 1;
    }
    .xps-select-trigger[data-placeholder] {
      color: var(--xps-muted-foreground);
    }
    .xps-select-content {
      z-index: 2147483647;
      max-height: min(320px, var(--radix-select-content-available-height));
      min-width: 8rem;
      overflow: hidden;
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: var(--xps-popover);
      color: var(--xps-popover-foreground);
      box-shadow: 0 10px 30px color-mix(in srgb, var(--xps-foreground) 12%, transparent);
    }
    .xps-select-content-popper {
      transform-origin: var(--radix-select-content-transform-origin);
    }
    .xps-select-viewport {
      padding: 0.25rem;
    }
    .xps-select-viewport-popper {
      min-width: var(--radix-select-trigger-width);
    }
    .xps-select-label {
      padding: 0.3125rem 1.75rem 0.3125rem 0.5rem;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .xps-select-item {
      position: relative;
      display: flex;
      min-height: var(--xps-control-height);
      width: 100%;
      cursor: pointer;
      user-select: none;
      align-items: center;
      border-radius: calc(var(--xps-radius) - 2px);
      padding: 0.3125rem 1.75rem 0.3125rem 0.5rem;
      font-size: var(--xps-control-font-size);
      line-height: 1.2;
      outline: none;
    }
    .xps-select-item[data-highlighted] {
      background: var(--xps-accent);
      color: var(--xps-accent-foreground);
    }
    .xps-select-item[data-disabled] {
      pointer-events: none;
      opacity: 0.5;
    }
    .xps-select-item-indicator {
      position: absolute;
      right: 0.5rem;
      display: inline-flex;
      width: 1rem;
      align-items: center;
      justify-content: center;
    }
    .xps-select-scroll-button {
      display: flex;
      height: 1.5rem;
      align-items: center;
      justify-content: center;
      color: var(--xps-muted-foreground);
    }
    .xps-select-separator {
      height: 1px;
      margin: 0.25rem -0.25rem;
      background: var(--xps-border);
    }
    .xps-textarea {
      min-height: 5rem;
      padding: 0.5rem var(--xps-control-padding-x);
      resize: vertical;
      line-height: 1.45;
    }
    .xps-input::placeholder,
    .xps-textarea::placeholder {
      color: var(--xps-muted-foreground);
    }

    .xps-card {
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: var(--xps-card);
      color: var(--xps-card-foreground);
    }
    .xps-card-header {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      padding: 1rem;
    }
    .xps-card-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .xps-card-description {
      margin: 0;
      color: var(--xps-muted-foreground);
      font-size: 0.8125rem;
      line-height: 1.35;
    }
    .xps-card-content {
      padding: 0 1rem 1rem;
    }

    .xps-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      color: var(--xps-foreground);
      font-size: var(--xps-control-font-size);
      line-height: 1.45;
    }
    .xps-table-header {
      background: color-mix(in srgb, var(--xps-muted) 72%, var(--xps-card) 28%);
    }
    .xps-table-row {
      transition: background-color 120ms ease;
    }
    .xps-table-body .xps-table-row:hover {
      background: color-mix(in srgb, var(--xps-muted) 56%, transparent);
    }
    .xps-table-head,
    .xps-table-cell {
      border-bottom: 1px solid var(--xps-border);
      padding: 0.625rem 0.75rem;
      text-align: left;
      vertical-align: middle;
    }
    .xps-table-head {
      color: var(--xps-muted-foreground);
      font-weight: 700;
      white-space: nowrap;
    }
    .xps-table-cell {
      color: var(--xps-foreground);
    }
    .xps-table-caption {
      margin-top: 0.625rem;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
    }
    .xps-table-footer {
      background: var(--xps-muted);
      font-weight: 700;
    }

    .xps-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      border-radius: 999px;
      border: 1px solid transparent;
      padding: 0.0625rem 0.4375rem;
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1.25;
      white-space: nowrap;
    }
    .xps-badge--default {
      background: color-mix(in srgb, var(--xps-primary) 12%, transparent);
      color: var(--xps-primary);
      border-color: color-mix(in srgb, var(--xps-primary) 18%, transparent);
    }
    .xps-badge--secondary {
      background: var(--xps-muted);
      color: var(--xps-muted-foreground);
      border-color: var(--xps-border);
    }
    .xps-badge--success {
      background: var(--xps-success-background);
      color: var(--xps-success);
      border-color: color-mix(in srgb, var(--xps-success) 16%, transparent);
    }
    .xps-badge--warning {
      background: var(--xps-warning-background);
      color: var(--xps-warning);
      border-color: color-mix(in srgb, var(--xps-warning) 18%, transparent);
    }
    .xps-badge--destructive {
      background: var(--xps-destructive-background);
      color: var(--xps-destructive);
      border-color: color-mix(in srgb, var(--xps-destructive) 18%, transparent);
    }
    .xps-separator {
      flex-shrink: 0;
      background: var(--xps-border);
    }
    .xps-separator--horizontal {
      width: 100%;
      height: 1px;
    }
    .xps-separator--vertical {
      width: 1px;
      height: 100%;
    }
    .xps-sidebar {
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--xps-card);
      color: var(--xps-card-foreground);
      border-color: var(--xps-border);
      border-style: solid;
    }
    .xps-sidebar--left {
      border-width: 0 1px 0 0;
    }
    .xps-sidebar--right {
      border-width: 0 0 0 1px;
    }
    .xps-sidebar-header {
      min-height: 2.5rem;
      padding: 0.375rem;
      display: flex;
      gap: 0.5rem;
      align-items: center;
      border-bottom: 1px solid var(--xps-border);
      min-width: 0;
    }
    .xps-sidebar-title {
      min-width: 0;
      color: var(--xps-foreground);
      font-size: var(--xps-control-font-size);
      font-weight: 750;
      line-height: 1.2;
    }
    .xps-sidebar-content {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .xps-sidebar-footer {
      padding: 0.5rem;
      border-top: 1px solid var(--xps-border);
    }
    .xps-sidebar-trigger.xps-button {
      flex: 0 0 auto;
      color: var(--xps-muted-foreground);
    }
    .xps-sidebar-rail {
      min-height: 0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 0.625rem;
      color: var(--xps-muted-foreground);
      background: color-mix(in srgb, var(--xps-card) 94%, var(--xps-muted) 6%);
    }
    .xps-sidebar-rail > span {
      writing-mode: vertical-rl;
      letter-spacing: 0;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .xps-sidebar-group {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 0.5rem;
    }
    .xps-sidebar-group-label {
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .xps-sidebar-menu {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 0.375rem;
    }
    .xps-sidebar-menu-item {
      min-width: 0;
    }
    .xps-sidebar-menu-button.xps-button {
      width: 100%;
      height: auto;
      min-height: 3.25rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 0.25rem;
      border: 1px solid transparent;
      border-radius: var(--xps-radius);
      padding: 0.5rem;
      text-align: left;
      white-space: normal;
    }
    .xps-sidebar-menu-button.xps-button:hover {
      background: var(--xps-muted);
    }
    .xps-sidebar-menu-button--active.xps-button {
      background: color-mix(in srgb, var(--xps-primary) 10%, transparent);
      border-color: color-mix(in srgb, var(--xps-primary) 26%, var(--xps-border));
      color: var(--xps-foreground);
    }
    .xps-scroll-area {
      position: relative;
      min-height: 0;
      overflow: hidden;
    }
    .xps-scroll-area-viewport {
      width: 100%;
      height: 100%;
      min-height: inherit;
      border-radius: inherit;
    }
    .xps-scroll-bar {
      display: flex;
      touch-action: none;
      user-select: none;
      transition: background-color 120ms ease;
    }
    .xps-scroll-bar-vertical {
      width: 0.5rem;
      border-left: 1px solid transparent;
      padding: 1px;
    }
    .xps-scroll-bar-horizontal {
      height: 0.5rem;
      flex-direction: column;
      border-top: 1px solid transparent;
      padding: 1px;
    }
    .xps-scroll-thumb {
      position: relative;
      flex: 1;
      border-radius: 999px;
      background: color-mix(in srgb, var(--xps-muted-foreground) 36%, transparent);
    }
    .xps-dialog-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: color-mix(in srgb, var(--xps-foreground) 42%, transparent);
    }
    .xps-dialog-content,
    .xps-sheet-content {
      position: fixed;
      z-index: 2147483647;
      border: 1px solid var(--xps-border);
      background: var(--xps-card);
      color: var(--xps-card-foreground);
      box-shadow: 0 18px 54px color-mix(in srgb, var(--xps-foreground) 20%, transparent);
    }
    .xps-dialog-content {
      left: 50%;
      top: 50%;
      width: min(520px, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      transform: translate(-50%, -50%);
      border-radius: var(--xps-radius);
      padding: 1rem;
      overflow: auto;
    }
    .xps-sheet-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
    }
    .xps-sheet-content--right,
    .xps-sheet-content--left {
      top: 0;
      bottom: 0;
      width: min(380px, calc(100vw - 2rem));
    }
    .xps-sheet-content--right { right: 0; border-radius: var(--xps-radius) 0 0 var(--xps-radius); }
    .xps-sheet-content--left { left: 0; border-radius: 0 var(--xps-radius) var(--xps-radius) 0; }
    .xps-sheet-content--top,
    .xps-sheet-content--bottom {
      left: 0;
      right: 0;
      max-height: min(420px, calc(100vh - 2rem));
    }
    .xps-sheet-content--top { top: 0; border-radius: 0 0 var(--xps-radius) var(--xps-radius); }
    .xps-sheet-content--bottom { bottom: 0; border-radius: var(--xps-radius) var(--xps-radius) 0 0; }
    .xps-dialog-close {
      position: absolute;
      right: 0.625rem;
      top: 0.625rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--xps-control-height-sm);
      height: var(--xps-control-height-sm);
      border: 0;
      border-radius: calc(var(--xps-radius) - 2px);
      background: transparent;
      color: var(--xps-muted-foreground);
      cursor: pointer;
    }
    .xps-dialog-close:hover {
      background: var(--xps-muted);
      color: var(--xps-foreground);
    }
    .xps-dialog-header,
    .xps-dialog-footer {
      display: flex;
      gap: 0.5rem;
    }
    .xps-dialog-header {
      flex-direction: column;
      padding-right: 2rem;
    }
    .xps-dialog-footer {
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .xps-dialog-title {
      margin: 0;
      color: var(--xps-foreground);
      font-size: 1rem;
      font-weight: 750;
      line-height: 1.2;
    }
    .xps-dialog-description {
      margin: 0;
      color: var(--xps-muted-foreground);
      font-size: var(--xps-control-font-size);
      line-height: 1.45;
    }
    .xps-dropdown-menu-content {
      z-index: 2147483647;
      min-width: 10rem;
      overflow: hidden;
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: var(--xps-popover);
      color: var(--xps-popover-foreground);
      padding: 0.25rem;
      box-shadow: 0 10px 30px color-mix(in srgb, var(--xps-foreground) 12%, transparent);
    }
    .xps-dropdown-menu-item,
    .xps-dropdown-menu-sub-trigger {
      position: relative;
      display: flex;
      min-height: var(--xps-control-height);
      align-items: center;
      gap: 0.5rem;
      border-radius: calc(var(--xps-radius) - 2px);
      padding: 0.3125rem 0.5rem;
      color: var(--xps-foreground);
      cursor: pointer;
      font-size: var(--xps-control-font-size);
      line-height: 1.2;
      outline: none;
      user-select: none;
    }
    .xps-dropdown-menu-item[data-highlighted],
    .xps-dropdown-menu-sub-trigger[data-highlighted] {
      background: var(--xps-accent);
      color: var(--xps-accent-foreground);
    }
    .xps-dropdown-menu-item[data-disabled],
    .xps-dropdown-menu-sub-trigger[data-disabled] {
      pointer-events: none;
      opacity: 0.5;
    }
    .xps-dropdown-menu-item--inset {
      padding-left: 1.75rem;
    }
    .xps-dropdown-menu-check-item {
      padding-left: 1.75rem;
    }
    .xps-dropdown-menu-item-indicator {
      position: absolute;
      left: 0.5rem;
      display: inline-flex;
      width: 1rem;
      align-items: center;
      justify-content: center;
    }
    .xps-dropdown-menu-label {
      padding: 0.3125rem 0.5rem;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .xps-dropdown-menu-separator {
      height: 1px;
      margin: 0.25rem -0.25rem;
      background: var(--xps-border);
    }
    .xps-dropdown-menu-shortcut {
      margin-left: auto;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
    }
    .xps-tabs-list {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
      min-height: var(--xps-control-height);
      border-radius: var(--xps-radius);
      background: var(--xps-muted);
      padding: 0.1875rem;
    }
    .xps-tabs-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: calc(var(--xps-control-height) - 0.375rem);
      border: 0;
      border-radius: calc(var(--xps-radius) - 2px);
      background: transparent;
      color: var(--xps-muted-foreground);
      cursor: pointer;
      font-family: inherit;
      font-size: var(--xps-control-font-size);
      font-weight: 650;
      padding: 0 0.625rem;
      white-space: nowrap;
    }
    .xps-tabs-trigger[data-state='active'] {
      background: var(--xps-card);
      color: var(--xps-foreground);
      box-shadow: 0 1px 2px color-mix(in srgb, var(--xps-foreground) 10%, transparent);
    }
    .xps-tabs-trigger:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .xps-tabs-content {
      min-width: 0;
      outline: none;
    }
    .xps-tooltip-content {
      z-index: 2147483647;
      max-width: min(320px, calc(100vw - 2rem));
      border-radius: calc(var(--xps-radius) - 2px);
      background: var(--xps-foreground);
      color: var(--xps-background);
      padding: 0.375rem 0.625rem;
      font-size: 0.75rem;
      line-height: 1.3;
      box-shadow: 0 10px 30px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
    }
    .xps-checkbox {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      border: 1px solid var(--xps-input);
      border-radius: calc(var(--xps-radius) - 3px);
      background: var(--xps-card);
      color: var(--xps-primary-foreground);
      cursor: pointer;
    }
    .xps-checkbox[data-state='checked'] {
      background: var(--xps-primary);
      border-color: var(--xps-primary);
    }
    .xps-checkbox:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .xps-checkbox-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .xps-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 2.25rem;
      height: 1.25rem;
      border: 1px solid transparent;
      border-radius: 999px;
      background: color-mix(in srgb, var(--xps-muted-foreground) 34%, transparent);
      cursor: pointer;
      transition: background-color 120ms ease, box-shadow 120ms ease;
    }
    .xps-switch[data-state='checked'] {
      background: var(--xps-primary);
    }
    .xps-switch:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .xps-switch-thumb {
      display: block;
      width: 1rem;
      height: 1rem;
      border-radius: 999px;
      background: #ffffff;
      box-shadow: 0 1px 3px color-mix(in srgb, #000000 20%, transparent);
      transform: translateX(0.125rem);
      transition: transform 120ms ease;
    }
    .xps-switch[data-state='checked'] .xps-switch-thumb {
      transform: translateX(1rem);
    }
    .xps-slider {
      position: relative;
      display: flex;
      width: 100%;
      touch-action: none;
      user-select: none;
      align-items: center;
    }
    .xps-slider-track {
      position: relative;
      height: 0.375rem;
      width: 100%;
      flex: 1;
      overflow: hidden;
      border-radius: 999px;
      background: var(--xps-muted);
    }
    .xps-slider-range {
      position: absolute;
      height: 100%;
      background: var(--xps-primary);
    }
    .xps-slider-thumb {
      display: block;
      width: 1rem;
      height: 1rem;
      border: 2px solid var(--xps-primary);
      border-radius: 999px;
      background: var(--xps-card);
      box-shadow: 0 1px 3px color-mix(in srgb, var(--xps-foreground) 12%, transparent);
      transition: box-shadow 120ms ease;
    }
    .xps-slider-thumb:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .xps-icon--filled {
      fill: currentColor;
    }
    .xps-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .xps-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      stroke-width: 2;
    }
  `
  document.head.appendChild(style)
}
