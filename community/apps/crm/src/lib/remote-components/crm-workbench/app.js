"use strict";
var XpertCrmWorkbench = (() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // ../../../packages/shadcn-ui/src/theme.ts
  function installShadcnThemeVars(options2 = {}) {
    const styleId = options2.styleId ?? "xpert-plugin-shadcn-ui-vars";
    if (typeof document === "undefined" || document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement("style");
    style.id = styleId;
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
    .xps-command-input:focus,
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

    .xps-command {
      width: 100%;
      overflow: hidden;
      border-radius: var(--xps-radius);
      background: var(--xps-popover);
      color: var(--xps-popover-foreground);
    }
    .xps-command-input-wrapper {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid var(--xps-border);
      padding: 0 0.625rem;
      color: var(--xps-muted-foreground);
    }
    .xps-command-input {
      width: 100%;
      height: 2.25rem;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--xps-foreground);
      font-family: inherit;
      font-size: var(--xps-control-font-size);
    }
    .xps-command-input::placeholder {
      color: var(--xps-muted-foreground);
    }
    .xps-command-list {
      max-height: 18rem;
      overflow: auto;
      overscroll-behavior: contain;
      padding: 0.25rem;
    }
    .xps-command-empty {
      padding: 1.25rem 0.75rem;
      color: var(--xps-muted-foreground);
      text-align: center;
      font-size: var(--xps-control-font-size);
    }
    .xps-command-group {
      overflow: hidden;
      padding: 0.25rem;
    }
    .xps-command-group [cmdk-group-heading] {
      padding: 0.375rem 0.5rem;
      color: var(--xps-muted-foreground);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .xps-command-item {
      display: flex;
      min-height: var(--xps-control-height);
      cursor: pointer;
      user-select: none;
      align-items: center;
      gap: 0.5rem;
      border-radius: calc(var(--xps-radius) - 2px);
      padding: 0.375rem 0.5rem;
      color: var(--xps-foreground);
      font-size: var(--xps-control-font-size);
      outline: none;
    }
    .xps-command-item[data-selected="true"] {
      background: var(--xps-accent);
      color: var(--xps-accent-foreground);
    }
    .xps-command-item[data-disabled="true"] {
      pointer-events: none;
      opacity: 0.5;
    }
    .xps-command-separator {
      height: 1px;
      margin: 0.25rem -0.25rem;
      background: var(--xps-border);
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
  `;
    document.head.appendChild(style);
  }

  // ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }

  // ../../../node_modules/.pnpm/tailwind-merge@2.6.1/node_modules/tailwind-merge/dist/bundle-mjs.mjs
  var CLASS_PART_SEPARATOR = "-";
  var createClassGroupUtils = (config) => {
    const classMap = createClassMap(config);
    const {
      conflictingClassGroups,
      conflictingClassGroupModifiers
    } = config;
    const getClassGroupId = (className) => {
      const classParts = className.split(CLASS_PART_SEPARATOR);
      if (classParts[0] === "" && classParts.length !== 1) {
        classParts.shift();
      }
      return getGroupRecursive(classParts, classMap) || getGroupIdForArbitraryProperty(className);
    };
    const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
      const conflicts = conflictingClassGroups[classGroupId] || [];
      if (hasPostfixModifier && conflictingClassGroupModifiers[classGroupId]) {
        return [...conflicts, ...conflictingClassGroupModifiers[classGroupId]];
      }
      return conflicts;
    };
    return {
      getClassGroupId,
      getConflictingClassGroupIds
    };
  };
  var getGroupRecursive = (classParts, classPartObject) => {
    if (classParts.length === 0) {
      return classPartObject.classGroupId;
    }
    const currentClassPart = classParts[0];
    const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
    const classGroupFromNextClassPart = nextClassPartObject ? getGroupRecursive(classParts.slice(1), nextClassPartObject) : void 0;
    if (classGroupFromNextClassPart) {
      return classGroupFromNextClassPart;
    }
    if (classPartObject.validators.length === 0) {
      return void 0;
    }
    const classRest = classParts.join(CLASS_PART_SEPARATOR);
    return classPartObject.validators.find(({
      validator
    }) => validator(classRest))?.classGroupId;
  };
  var arbitraryPropertyRegex = /^\[(.+)\]$/;
  var getGroupIdForArbitraryProperty = (className) => {
    if (arbitraryPropertyRegex.test(className)) {
      const arbitraryPropertyClassName = arbitraryPropertyRegex.exec(className)[1];
      const property = arbitraryPropertyClassName?.substring(0, arbitraryPropertyClassName.indexOf(":"));
      if (property) {
        return "arbitrary.." + property;
      }
    }
  };
  var createClassMap = (config) => {
    const {
      theme,
      prefix
    } = config;
    const classMap = {
      nextPart: /* @__PURE__ */ new Map(),
      validators: []
    };
    const prefixedClassGroupEntries = getPrefixedClassGroupEntries(Object.entries(config.classGroups), prefix);
    prefixedClassGroupEntries.forEach(([classGroupId, classGroup]) => {
      processClassesRecursively(classGroup, classMap, classGroupId, theme);
    });
    return classMap;
  };
  var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
    classGroup.forEach((classDefinition) => {
      if (typeof classDefinition === "string") {
        const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
        classPartObjectToEdit.classGroupId = classGroupId;
        return;
      }
      if (typeof classDefinition === "function") {
        if (isThemeGetter(classDefinition)) {
          processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
          return;
        }
        classPartObject.validators.push({
          validator: classDefinition,
          classGroupId
        });
        return;
      }
      Object.entries(classDefinition).forEach(([key, classGroup2]) => {
        processClassesRecursively(classGroup2, getPart(classPartObject, key), classGroupId, theme);
      });
    });
  };
  var getPart = (classPartObject, path) => {
    let currentClassPartObject = classPartObject;
    path.split(CLASS_PART_SEPARATOR).forEach((pathPart) => {
      if (!currentClassPartObject.nextPart.has(pathPart)) {
        currentClassPartObject.nextPart.set(pathPart, {
          nextPart: /* @__PURE__ */ new Map(),
          validators: []
        });
      }
      currentClassPartObject = currentClassPartObject.nextPart.get(pathPart);
    });
    return currentClassPartObject;
  };
  var isThemeGetter = (func) => func.isThemeGetter;
  var getPrefixedClassGroupEntries = (classGroupEntries, prefix) => {
    if (!prefix) {
      return classGroupEntries;
    }
    return classGroupEntries.map(([classGroupId, classGroup]) => {
      const prefixedClassGroup = classGroup.map((classDefinition) => {
        if (typeof classDefinition === "string") {
          return prefix + classDefinition;
        }
        if (typeof classDefinition === "object") {
          return Object.fromEntries(Object.entries(classDefinition).map(([key, value]) => [prefix + key, value]));
        }
        return classDefinition;
      });
      return [classGroupId, prefixedClassGroup];
    });
  };
  var createLruCache = (maxCacheSize) => {
    if (maxCacheSize < 1) {
      return {
        get: () => void 0,
        set: () => {
        }
      };
    }
    let cacheSize = 0;
    let cache = /* @__PURE__ */ new Map();
    let previousCache = /* @__PURE__ */ new Map();
    const update = (key, value) => {
      cache.set(key, value);
      cacheSize++;
      if (cacheSize > maxCacheSize) {
        cacheSize = 0;
        previousCache = cache;
        cache = /* @__PURE__ */ new Map();
      }
    };
    return {
      get(key) {
        let value = cache.get(key);
        if (value !== void 0) {
          return value;
        }
        if ((value = previousCache.get(key)) !== void 0) {
          update(key, value);
          return value;
        }
      },
      set(key, value) {
        if (cache.has(key)) {
          cache.set(key, value);
        } else {
          update(key, value);
        }
      }
    };
  };
  var IMPORTANT_MODIFIER = "!";
  var createParseClassName = (config) => {
    const {
      separator,
      experimentalParseClassName
    } = config;
    const isSeparatorSingleCharacter = separator.length === 1;
    const firstSeparatorCharacter = separator[0];
    const separatorLength = separator.length;
    const parseClassName = (className) => {
      const modifiers = [];
      let bracketDepth = 0;
      let modifierStart = 0;
      let postfixModifierPosition;
      for (let index2 = 0; index2 < className.length; index2++) {
        let currentCharacter = className[index2];
        if (bracketDepth === 0) {
          if (currentCharacter === firstSeparatorCharacter && (isSeparatorSingleCharacter || className.slice(index2, index2 + separatorLength) === separator)) {
            modifiers.push(className.slice(modifierStart, index2));
            modifierStart = index2 + separatorLength;
            continue;
          }
          if (currentCharacter === "/") {
            postfixModifierPosition = index2;
            continue;
          }
        }
        if (currentCharacter === "[") {
          bracketDepth++;
        } else if (currentCharacter === "]") {
          bracketDepth--;
        }
      }
      const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.substring(modifierStart);
      const hasImportantModifier = baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER);
      const baseClassName = hasImportantModifier ? baseClassNameWithImportantModifier.substring(1) : baseClassNameWithImportantModifier;
      const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
      return {
        modifiers,
        hasImportantModifier,
        baseClassName,
        maybePostfixModifierPosition
      };
    };
    if (experimentalParseClassName) {
      return (className) => experimentalParseClassName({
        className,
        parseClassName
      });
    }
    return parseClassName;
  };
  var sortModifiers = (modifiers) => {
    if (modifiers.length <= 1) {
      return modifiers;
    }
    const sortedModifiers = [];
    let unsortedModifiers = [];
    modifiers.forEach((modifier) => {
      const isArbitraryVariant = modifier[0] === "[";
      if (isArbitraryVariant) {
        sortedModifiers.push(...unsortedModifiers.sort(), modifier);
        unsortedModifiers = [];
      } else {
        unsortedModifiers.push(modifier);
      }
    });
    sortedModifiers.push(...unsortedModifiers.sort());
    return sortedModifiers;
  };
  var createConfigUtils = (config) => ({
    cache: createLruCache(config.cacheSize),
    parseClassName: createParseClassName(config),
    ...createClassGroupUtils(config)
  });
  var SPLIT_CLASSES_REGEX = /\s+/;
  var mergeClassList = (classList, configUtils) => {
    const {
      parseClassName,
      getClassGroupId,
      getConflictingClassGroupIds
    } = configUtils;
    const classGroupsInConflict = [];
    const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
    let result = "";
    for (let index2 = classNames.length - 1; index2 >= 0; index2 -= 1) {
      const originalClassName = classNames[index2];
      const {
        modifiers,
        hasImportantModifier,
        baseClassName,
        maybePostfixModifierPosition
      } = parseClassName(originalClassName);
      let hasPostfixModifier = Boolean(maybePostfixModifierPosition);
      let classGroupId = getClassGroupId(hasPostfixModifier ? baseClassName.substring(0, maybePostfixModifierPosition) : baseClassName);
      if (!classGroupId) {
        if (!hasPostfixModifier) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        classGroupId = getClassGroupId(baseClassName);
        if (!classGroupId) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        hasPostfixModifier = false;
      }
      const variantModifier = sortModifiers(modifiers).join(":");
      const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
      const classId = modifierId + classGroupId;
      if (classGroupsInConflict.includes(classId)) {
        continue;
      }
      classGroupsInConflict.push(classId);
      const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
      for (let i = 0; i < conflictGroups.length; ++i) {
        const group = conflictGroups[i];
        classGroupsInConflict.push(modifierId + group);
      }
      result = originalClassName + (result.length > 0 ? " " + result : result);
    }
    return result;
  };
  function twJoin() {
    let index2 = 0;
    let argument;
    let resolvedValue;
    let string = "";
    while (index2 < arguments.length) {
      if (argument = arguments[index2++]) {
        if (resolvedValue = toValue(argument)) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  }
  var toValue = (mix) => {
    if (typeof mix === "string") {
      return mix;
    }
    let resolvedValue;
    let string = "";
    for (let k3 = 0; k3 < mix.length; k3++) {
      if (mix[k3]) {
        if (resolvedValue = toValue(mix[k3])) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  function createTailwindMerge(createConfigFirst, ...createConfigRest) {
    let configUtils;
    let cacheGet;
    let cacheSet;
    let functionToCall = initTailwindMerge;
    function initTailwindMerge(classList) {
      const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
      configUtils = createConfigUtils(config);
      cacheGet = configUtils.cache.get;
      cacheSet = configUtils.cache.set;
      functionToCall = tailwindMerge;
      return tailwindMerge(classList);
    }
    function tailwindMerge(classList) {
      const cachedResult = cacheGet(classList);
      if (cachedResult) {
        return cachedResult;
      }
      const result = mergeClassList(classList, configUtils);
      cacheSet(classList, result);
      return result;
    }
    return function callTailwindMerge() {
      return functionToCall(twJoin.apply(null, arguments));
    };
  }
  var fromTheme = (key) => {
    const themeGetter = (theme) => theme[key] || [];
    themeGetter.isThemeGetter = true;
    return themeGetter;
  };
  var arbitraryValueRegex = /^\[(?:([a-z-]+):)?(.+)\]$/i;
  var fractionRegex = /^\d+\/\d+$/;
  var stringLengths = /* @__PURE__ */ new Set(["px", "full", "screen"]);
  var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
  var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
  var isLength = (value) => isNumber(value) || stringLengths.has(value) || fractionRegex.test(value);
  var isArbitraryLength = (value) => getIsArbitraryValue(value, "length", isLengthOnly);
  var isNumber = (value) => Boolean(value) && !Number.isNaN(Number(value));
  var isArbitraryNumber = (value) => getIsArbitraryValue(value, "number", isNumber);
  var isInteger = (value) => Boolean(value) && Number.isInteger(Number(value));
  var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
  var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
  var isTshirtSize = (value) => tshirtUnitRegex.test(value);
  var sizeLabels = /* @__PURE__ */ new Set(["length", "size", "percentage"]);
  var isArbitrarySize = (value) => getIsArbitraryValue(value, sizeLabels, isNever);
  var isArbitraryPosition = (value) => getIsArbitraryValue(value, "position", isNever);
  var imageLabels = /* @__PURE__ */ new Set(["image", "url"]);
  var isArbitraryImage = (value) => getIsArbitraryValue(value, imageLabels, isImage);
  var isArbitraryShadow = (value) => getIsArbitraryValue(value, "", isShadow);
  var isAny = () => true;
  var getIsArbitraryValue = (value, label, testValue) => {
    const result = arbitraryValueRegex.exec(value);
    if (result) {
      if (result[1]) {
        return typeof label === "string" ? result[1] === label : label.has(result[1]);
      }
      return testValue(result[2]);
    }
    return false;
  };
  var isLengthOnly = (value) => (
    // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
    // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
    // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
    lengthUnitRegex.test(value) && !colorFunctionRegex.test(value)
  );
  var isNever = () => false;
  var isShadow = (value) => shadowRegex.test(value);
  var isImage = (value) => imageRegex.test(value);
  var getDefaultConfig = () => {
    const colors = fromTheme("colors");
    const spacing = fromTheme("spacing");
    const blur = fromTheme("blur");
    const brightness = fromTheme("brightness");
    const borderColor = fromTheme("borderColor");
    const borderRadius = fromTheme("borderRadius");
    const borderSpacing = fromTheme("borderSpacing");
    const borderWidth = fromTheme("borderWidth");
    const contrast = fromTheme("contrast");
    const grayscale = fromTheme("grayscale");
    const hueRotate = fromTheme("hueRotate");
    const invert = fromTheme("invert");
    const gap = fromTheme("gap");
    const gradientColorStops = fromTheme("gradientColorStops");
    const gradientColorStopPositions = fromTheme("gradientColorStopPositions");
    const inset = fromTheme("inset");
    const margin = fromTheme("margin");
    const opacity = fromTheme("opacity");
    const padding = fromTheme("padding");
    const saturate = fromTheme("saturate");
    const scale = fromTheme("scale");
    const sepia = fromTheme("sepia");
    const skew = fromTheme("skew");
    const space = fromTheme("space");
    const translate = fromTheme("translate");
    const getOverscroll = () => ["auto", "contain", "none"];
    const getOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
    const getSpacingWithAutoAndArbitrary = () => ["auto", isArbitraryValue, spacing];
    const getSpacingWithArbitrary = () => [isArbitraryValue, spacing];
    const getLengthWithEmptyAndArbitrary = () => ["", isLength, isArbitraryLength];
    const getNumberWithAutoAndArbitrary = () => ["auto", isNumber, isArbitraryValue];
    const getPositions = () => ["bottom", "center", "left", "left-bottom", "left-top", "right", "right-bottom", "right-top", "top"];
    const getLineStyles = () => ["solid", "dashed", "dotted", "double", "none"];
    const getBlendModes = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
    const getAlign = () => ["start", "end", "center", "between", "around", "evenly", "stretch"];
    const getZeroAndEmpty = () => ["", "0", isArbitraryValue];
    const getBreaks = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
    const getNumberAndArbitrary = () => [isNumber, isArbitraryValue];
    return {
      cacheSize: 500,
      separator: ":",
      theme: {
        colors: [isAny],
        spacing: [isLength, isArbitraryLength],
        blur: ["none", "", isTshirtSize, isArbitraryValue],
        brightness: getNumberAndArbitrary(),
        borderColor: [colors],
        borderRadius: ["none", "", "full", isTshirtSize, isArbitraryValue],
        borderSpacing: getSpacingWithArbitrary(),
        borderWidth: getLengthWithEmptyAndArbitrary(),
        contrast: getNumberAndArbitrary(),
        grayscale: getZeroAndEmpty(),
        hueRotate: getNumberAndArbitrary(),
        invert: getZeroAndEmpty(),
        gap: getSpacingWithArbitrary(),
        gradientColorStops: [colors],
        gradientColorStopPositions: [isPercent, isArbitraryLength],
        inset: getSpacingWithAutoAndArbitrary(),
        margin: getSpacingWithAutoAndArbitrary(),
        opacity: getNumberAndArbitrary(),
        padding: getSpacingWithArbitrary(),
        saturate: getNumberAndArbitrary(),
        scale: getNumberAndArbitrary(),
        sepia: getZeroAndEmpty(),
        skew: getNumberAndArbitrary(),
        space: getSpacingWithArbitrary(),
        translate: getSpacingWithArbitrary()
      },
      classGroups: {
        // Layout
        /**
         * Aspect Ratio
         * @see https://tailwindcss.com/docs/aspect-ratio
         */
        aspect: [{
          aspect: ["auto", "square", "video", isArbitraryValue]
        }],
        /**
         * Container
         * @see https://tailwindcss.com/docs/container
         */
        container: ["container"],
        /**
         * Columns
         * @see https://tailwindcss.com/docs/columns
         */
        columns: [{
          columns: [isTshirtSize]
        }],
        /**
         * Break After
         * @see https://tailwindcss.com/docs/break-after
         */
        "break-after": [{
          "break-after": getBreaks()
        }],
        /**
         * Break Before
         * @see https://tailwindcss.com/docs/break-before
         */
        "break-before": [{
          "break-before": getBreaks()
        }],
        /**
         * Break Inside
         * @see https://tailwindcss.com/docs/break-inside
         */
        "break-inside": [{
          "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
        }],
        /**
         * Box Decoration Break
         * @see https://tailwindcss.com/docs/box-decoration-break
         */
        "box-decoration": [{
          "box-decoration": ["slice", "clone"]
        }],
        /**
         * Box Sizing
         * @see https://tailwindcss.com/docs/box-sizing
         */
        box: [{
          box: ["border", "content"]
        }],
        /**
         * Display
         * @see https://tailwindcss.com/docs/display
         */
        display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
        /**
         * Floats
         * @see https://tailwindcss.com/docs/float
         */
        float: [{
          float: ["right", "left", "none", "start", "end"]
        }],
        /**
         * Clear
         * @see https://tailwindcss.com/docs/clear
         */
        clear: [{
          clear: ["left", "right", "both", "none", "start", "end"]
        }],
        /**
         * Isolation
         * @see https://tailwindcss.com/docs/isolation
         */
        isolation: ["isolate", "isolation-auto"],
        /**
         * Object Fit
         * @see https://tailwindcss.com/docs/object-fit
         */
        "object-fit": [{
          object: ["contain", "cover", "fill", "none", "scale-down"]
        }],
        /**
         * Object Position
         * @see https://tailwindcss.com/docs/object-position
         */
        "object-position": [{
          object: [...getPositions(), isArbitraryValue]
        }],
        /**
         * Overflow
         * @see https://tailwindcss.com/docs/overflow
         */
        overflow: [{
          overflow: getOverflow()
        }],
        /**
         * Overflow X
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-x": [{
          "overflow-x": getOverflow()
        }],
        /**
         * Overflow Y
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-y": [{
          "overflow-y": getOverflow()
        }],
        /**
         * Overscroll Behavior
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        overscroll: [{
          overscroll: getOverscroll()
        }],
        /**
         * Overscroll Behavior X
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-x": [{
          "overscroll-x": getOverscroll()
        }],
        /**
         * Overscroll Behavior Y
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-y": [{
          "overscroll-y": getOverscroll()
        }],
        /**
         * Position
         * @see https://tailwindcss.com/docs/position
         */
        position: ["static", "fixed", "absolute", "relative", "sticky"],
        /**
         * Top / Right / Bottom / Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        inset: [{
          inset: [inset]
        }],
        /**
         * Right / Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-x": [{
          "inset-x": [inset]
        }],
        /**
         * Top / Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-y": [{
          "inset-y": [inset]
        }],
        /**
         * Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        start: [{
          start: [inset]
        }],
        /**
         * End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        end: [{
          end: [inset]
        }],
        /**
         * Top
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        top: [{
          top: [inset]
        }],
        /**
         * Right
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        right: [{
          right: [inset]
        }],
        /**
         * Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        bottom: [{
          bottom: [inset]
        }],
        /**
         * Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        left: [{
          left: [inset]
        }],
        /**
         * Visibility
         * @see https://tailwindcss.com/docs/visibility
         */
        visibility: ["visible", "invisible", "collapse"],
        /**
         * Z-Index
         * @see https://tailwindcss.com/docs/z-index
         */
        z: [{
          z: ["auto", isInteger, isArbitraryValue]
        }],
        // Flexbox and Grid
        /**
         * Flex Basis
         * @see https://tailwindcss.com/docs/flex-basis
         */
        basis: [{
          basis: getSpacingWithAutoAndArbitrary()
        }],
        /**
         * Flex Direction
         * @see https://tailwindcss.com/docs/flex-direction
         */
        "flex-direction": [{
          flex: ["row", "row-reverse", "col", "col-reverse"]
        }],
        /**
         * Flex Wrap
         * @see https://tailwindcss.com/docs/flex-wrap
         */
        "flex-wrap": [{
          flex: ["wrap", "wrap-reverse", "nowrap"]
        }],
        /**
         * Flex
         * @see https://tailwindcss.com/docs/flex
         */
        flex: [{
          flex: ["1", "auto", "initial", "none", isArbitraryValue]
        }],
        /**
         * Flex Grow
         * @see https://tailwindcss.com/docs/flex-grow
         */
        grow: [{
          grow: getZeroAndEmpty()
        }],
        /**
         * Flex Shrink
         * @see https://tailwindcss.com/docs/flex-shrink
         */
        shrink: [{
          shrink: getZeroAndEmpty()
        }],
        /**
         * Order
         * @see https://tailwindcss.com/docs/order
         */
        order: [{
          order: ["first", "last", "none", isInteger, isArbitraryValue]
        }],
        /**
         * Grid Template Columns
         * @see https://tailwindcss.com/docs/grid-template-columns
         */
        "grid-cols": [{
          "grid-cols": [isAny]
        }],
        /**
         * Grid Column Start / End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start-end": [{
          col: ["auto", {
            span: ["full", isInteger, isArbitraryValue]
          }, isArbitraryValue]
        }],
        /**
         * Grid Column Start
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start": [{
          "col-start": getNumberWithAutoAndArbitrary()
        }],
        /**
         * Grid Column End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-end": [{
          "col-end": getNumberWithAutoAndArbitrary()
        }],
        /**
         * Grid Template Rows
         * @see https://tailwindcss.com/docs/grid-template-rows
         */
        "grid-rows": [{
          "grid-rows": [isAny]
        }],
        /**
         * Grid Row Start / End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start-end": [{
          row: ["auto", {
            span: [isInteger, isArbitraryValue]
          }, isArbitraryValue]
        }],
        /**
         * Grid Row Start
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start": [{
          "row-start": getNumberWithAutoAndArbitrary()
        }],
        /**
         * Grid Row End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-end": [{
          "row-end": getNumberWithAutoAndArbitrary()
        }],
        /**
         * Grid Auto Flow
         * @see https://tailwindcss.com/docs/grid-auto-flow
         */
        "grid-flow": [{
          "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
        }],
        /**
         * Grid Auto Columns
         * @see https://tailwindcss.com/docs/grid-auto-columns
         */
        "auto-cols": [{
          "auto-cols": ["auto", "min", "max", "fr", isArbitraryValue]
        }],
        /**
         * Grid Auto Rows
         * @see https://tailwindcss.com/docs/grid-auto-rows
         */
        "auto-rows": [{
          "auto-rows": ["auto", "min", "max", "fr", isArbitraryValue]
        }],
        /**
         * Gap
         * @see https://tailwindcss.com/docs/gap
         */
        gap: [{
          gap: [gap]
        }],
        /**
         * Gap X
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-x": [{
          "gap-x": [gap]
        }],
        /**
         * Gap Y
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-y": [{
          "gap-y": [gap]
        }],
        /**
         * Justify Content
         * @see https://tailwindcss.com/docs/justify-content
         */
        "justify-content": [{
          justify: ["normal", ...getAlign()]
        }],
        /**
         * Justify Items
         * @see https://tailwindcss.com/docs/justify-items
         */
        "justify-items": [{
          "justify-items": ["start", "end", "center", "stretch"]
        }],
        /**
         * Justify Self
         * @see https://tailwindcss.com/docs/justify-self
         */
        "justify-self": [{
          "justify-self": ["auto", "start", "end", "center", "stretch"]
        }],
        /**
         * Align Content
         * @see https://tailwindcss.com/docs/align-content
         */
        "align-content": [{
          content: ["normal", ...getAlign(), "baseline"]
        }],
        /**
         * Align Items
         * @see https://tailwindcss.com/docs/align-items
         */
        "align-items": [{
          items: ["start", "end", "center", "baseline", "stretch"]
        }],
        /**
         * Align Self
         * @see https://tailwindcss.com/docs/align-self
         */
        "align-self": [{
          self: ["auto", "start", "end", "center", "stretch", "baseline"]
        }],
        /**
         * Place Content
         * @see https://tailwindcss.com/docs/place-content
         */
        "place-content": [{
          "place-content": [...getAlign(), "baseline"]
        }],
        /**
         * Place Items
         * @see https://tailwindcss.com/docs/place-items
         */
        "place-items": [{
          "place-items": ["start", "end", "center", "baseline", "stretch"]
        }],
        /**
         * Place Self
         * @see https://tailwindcss.com/docs/place-self
         */
        "place-self": [{
          "place-self": ["auto", "start", "end", "center", "stretch"]
        }],
        // Spacing
        /**
         * Padding
         * @see https://tailwindcss.com/docs/padding
         */
        p: [{
          p: [padding]
        }],
        /**
         * Padding X
         * @see https://tailwindcss.com/docs/padding
         */
        px: [{
          px: [padding]
        }],
        /**
         * Padding Y
         * @see https://tailwindcss.com/docs/padding
         */
        py: [{
          py: [padding]
        }],
        /**
         * Padding Start
         * @see https://tailwindcss.com/docs/padding
         */
        ps: [{
          ps: [padding]
        }],
        /**
         * Padding End
         * @see https://tailwindcss.com/docs/padding
         */
        pe: [{
          pe: [padding]
        }],
        /**
         * Padding Top
         * @see https://tailwindcss.com/docs/padding
         */
        pt: [{
          pt: [padding]
        }],
        /**
         * Padding Right
         * @see https://tailwindcss.com/docs/padding
         */
        pr: [{
          pr: [padding]
        }],
        /**
         * Padding Bottom
         * @see https://tailwindcss.com/docs/padding
         */
        pb: [{
          pb: [padding]
        }],
        /**
         * Padding Left
         * @see https://tailwindcss.com/docs/padding
         */
        pl: [{
          pl: [padding]
        }],
        /**
         * Margin
         * @see https://tailwindcss.com/docs/margin
         */
        m: [{
          m: [margin]
        }],
        /**
         * Margin X
         * @see https://tailwindcss.com/docs/margin
         */
        mx: [{
          mx: [margin]
        }],
        /**
         * Margin Y
         * @see https://tailwindcss.com/docs/margin
         */
        my: [{
          my: [margin]
        }],
        /**
         * Margin Start
         * @see https://tailwindcss.com/docs/margin
         */
        ms: [{
          ms: [margin]
        }],
        /**
         * Margin End
         * @see https://tailwindcss.com/docs/margin
         */
        me: [{
          me: [margin]
        }],
        /**
         * Margin Top
         * @see https://tailwindcss.com/docs/margin
         */
        mt: [{
          mt: [margin]
        }],
        /**
         * Margin Right
         * @see https://tailwindcss.com/docs/margin
         */
        mr: [{
          mr: [margin]
        }],
        /**
         * Margin Bottom
         * @see https://tailwindcss.com/docs/margin
         */
        mb: [{
          mb: [margin]
        }],
        /**
         * Margin Left
         * @see https://tailwindcss.com/docs/margin
         */
        ml: [{
          ml: [margin]
        }],
        /**
         * Space Between X
         * @see https://tailwindcss.com/docs/space
         */
        "space-x": [{
          "space-x": [space]
        }],
        /**
         * Space Between X Reverse
         * @see https://tailwindcss.com/docs/space
         */
        "space-x-reverse": ["space-x-reverse"],
        /**
         * Space Between Y
         * @see https://tailwindcss.com/docs/space
         */
        "space-y": [{
          "space-y": [space]
        }],
        /**
         * Space Between Y Reverse
         * @see https://tailwindcss.com/docs/space
         */
        "space-y-reverse": ["space-y-reverse"],
        // Sizing
        /**
         * Width
         * @see https://tailwindcss.com/docs/width
         */
        w: [{
          w: ["auto", "min", "max", "fit", "svw", "lvw", "dvw", isArbitraryValue, spacing]
        }],
        /**
         * Min-Width
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-w": [{
          "min-w": [isArbitraryValue, spacing, "min", "max", "fit"]
        }],
        /**
         * Max-Width
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-w": [{
          "max-w": [isArbitraryValue, spacing, "none", "full", "min", "max", "fit", "prose", {
            screen: [isTshirtSize]
          }, isTshirtSize]
        }],
        /**
         * Height
         * @see https://tailwindcss.com/docs/height
         */
        h: [{
          h: [isArbitraryValue, spacing, "auto", "min", "max", "fit", "svh", "lvh", "dvh"]
        }],
        /**
         * Min-Height
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-h": [{
          "min-h": [isArbitraryValue, spacing, "min", "max", "fit", "svh", "lvh", "dvh"]
        }],
        /**
         * Max-Height
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-h": [{
          "max-h": [isArbitraryValue, spacing, "min", "max", "fit", "svh", "lvh", "dvh"]
        }],
        /**
         * Size
         * @see https://tailwindcss.com/docs/size
         */
        size: [{
          size: [isArbitraryValue, spacing, "auto", "min", "max", "fit"]
        }],
        // Typography
        /**
         * Font Size
         * @see https://tailwindcss.com/docs/font-size
         */
        "font-size": [{
          text: ["base", isTshirtSize, isArbitraryLength]
        }],
        /**
         * Font Smoothing
         * @see https://tailwindcss.com/docs/font-smoothing
         */
        "font-smoothing": ["antialiased", "subpixel-antialiased"],
        /**
         * Font Style
         * @see https://tailwindcss.com/docs/font-style
         */
        "font-style": ["italic", "not-italic"],
        /**
         * Font Weight
         * @see https://tailwindcss.com/docs/font-weight
         */
        "font-weight": [{
          font: ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black", isArbitraryNumber]
        }],
        /**
         * Font Family
         * @see https://tailwindcss.com/docs/font-family
         */
        "font-family": [{
          font: [isAny]
        }],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-normal": ["normal-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-ordinal": ["ordinal"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-slashed-zero": ["slashed-zero"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-figure": ["lining-nums", "oldstyle-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-spacing": ["proportional-nums", "tabular-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
        /**
         * Letter Spacing
         * @see https://tailwindcss.com/docs/letter-spacing
         */
        tracking: [{
          tracking: ["tighter", "tight", "normal", "wide", "wider", "widest", isArbitraryValue]
        }],
        /**
         * Line Clamp
         * @see https://tailwindcss.com/docs/line-clamp
         */
        "line-clamp": [{
          "line-clamp": ["none", isNumber, isArbitraryNumber]
        }],
        /**
         * Line Height
         * @see https://tailwindcss.com/docs/line-height
         */
        leading: [{
          leading: ["none", "tight", "snug", "normal", "relaxed", "loose", isLength, isArbitraryValue]
        }],
        /**
         * List Style Image
         * @see https://tailwindcss.com/docs/list-style-image
         */
        "list-image": [{
          "list-image": ["none", isArbitraryValue]
        }],
        /**
         * List Style Type
         * @see https://tailwindcss.com/docs/list-style-type
         */
        "list-style-type": [{
          list: ["none", "disc", "decimal", isArbitraryValue]
        }],
        /**
         * List Style Position
         * @see https://tailwindcss.com/docs/list-style-position
         */
        "list-style-position": [{
          list: ["inside", "outside"]
        }],
        /**
         * Placeholder Color
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/placeholder-color
         */
        "placeholder-color": [{
          placeholder: [colors]
        }],
        /**
         * Placeholder Opacity
         * @see https://tailwindcss.com/docs/placeholder-opacity
         */
        "placeholder-opacity": [{
          "placeholder-opacity": [opacity]
        }],
        /**
         * Text Alignment
         * @see https://tailwindcss.com/docs/text-align
         */
        "text-alignment": [{
          text: ["left", "center", "right", "justify", "start", "end"]
        }],
        /**
         * Text Color
         * @see https://tailwindcss.com/docs/text-color
         */
        "text-color": [{
          text: [colors]
        }],
        /**
         * Text Opacity
         * @see https://tailwindcss.com/docs/text-opacity
         */
        "text-opacity": [{
          "text-opacity": [opacity]
        }],
        /**
         * Text Decoration
         * @see https://tailwindcss.com/docs/text-decoration
         */
        "text-decoration": ["underline", "overline", "line-through", "no-underline"],
        /**
         * Text Decoration Style
         * @see https://tailwindcss.com/docs/text-decoration-style
         */
        "text-decoration-style": [{
          decoration: [...getLineStyles(), "wavy"]
        }],
        /**
         * Text Decoration Thickness
         * @see https://tailwindcss.com/docs/text-decoration-thickness
         */
        "text-decoration-thickness": [{
          decoration: ["auto", "from-font", isLength, isArbitraryLength]
        }],
        /**
         * Text Underline Offset
         * @see https://tailwindcss.com/docs/text-underline-offset
         */
        "underline-offset": [{
          "underline-offset": ["auto", isLength, isArbitraryValue]
        }],
        /**
         * Text Decoration Color
         * @see https://tailwindcss.com/docs/text-decoration-color
         */
        "text-decoration-color": [{
          decoration: [colors]
        }],
        /**
         * Text Transform
         * @see https://tailwindcss.com/docs/text-transform
         */
        "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
        /**
         * Text Overflow
         * @see https://tailwindcss.com/docs/text-overflow
         */
        "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
        /**
         * Text Wrap
         * @see https://tailwindcss.com/docs/text-wrap
         */
        "text-wrap": [{
          text: ["wrap", "nowrap", "balance", "pretty"]
        }],
        /**
         * Text Indent
         * @see https://tailwindcss.com/docs/text-indent
         */
        indent: [{
          indent: getSpacingWithArbitrary()
        }],
        /**
         * Vertical Alignment
         * @see https://tailwindcss.com/docs/vertical-align
         */
        "vertical-align": [{
          align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryValue]
        }],
        /**
         * Whitespace
         * @see https://tailwindcss.com/docs/whitespace
         */
        whitespace: [{
          whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
        }],
        /**
         * Word Break
         * @see https://tailwindcss.com/docs/word-break
         */
        break: [{
          break: ["normal", "words", "all", "keep"]
        }],
        /**
         * Hyphens
         * @see https://tailwindcss.com/docs/hyphens
         */
        hyphens: [{
          hyphens: ["none", "manual", "auto"]
        }],
        /**
         * Content
         * @see https://tailwindcss.com/docs/content
         */
        content: [{
          content: ["none", isArbitraryValue]
        }],
        // Backgrounds
        /**
         * Background Attachment
         * @see https://tailwindcss.com/docs/background-attachment
         */
        "bg-attachment": [{
          bg: ["fixed", "local", "scroll"]
        }],
        /**
         * Background Clip
         * @see https://tailwindcss.com/docs/background-clip
         */
        "bg-clip": [{
          "bg-clip": ["border", "padding", "content", "text"]
        }],
        /**
         * Background Opacity
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/background-opacity
         */
        "bg-opacity": [{
          "bg-opacity": [opacity]
        }],
        /**
         * Background Origin
         * @see https://tailwindcss.com/docs/background-origin
         */
        "bg-origin": [{
          "bg-origin": ["border", "padding", "content"]
        }],
        /**
         * Background Position
         * @see https://tailwindcss.com/docs/background-position
         */
        "bg-position": [{
          bg: [...getPositions(), isArbitraryPosition]
        }],
        /**
         * Background Repeat
         * @see https://tailwindcss.com/docs/background-repeat
         */
        "bg-repeat": [{
          bg: ["no-repeat", {
            repeat: ["", "x", "y", "round", "space"]
          }]
        }],
        /**
         * Background Size
         * @see https://tailwindcss.com/docs/background-size
         */
        "bg-size": [{
          bg: ["auto", "cover", "contain", isArbitrarySize]
        }],
        /**
         * Background Image
         * @see https://tailwindcss.com/docs/background-image
         */
        "bg-image": [{
          bg: ["none", {
            "gradient-to": ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, isArbitraryImage]
        }],
        /**
         * Background Color
         * @see https://tailwindcss.com/docs/background-color
         */
        "bg-color": [{
          bg: [colors]
        }],
        /**
         * Gradient Color Stops From Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from-pos": [{
          from: [gradientColorStopPositions]
        }],
        /**
         * Gradient Color Stops Via Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via-pos": [{
          via: [gradientColorStopPositions]
        }],
        /**
         * Gradient Color Stops To Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to-pos": [{
          to: [gradientColorStopPositions]
        }],
        /**
         * Gradient Color Stops From
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from": [{
          from: [gradientColorStops]
        }],
        /**
         * Gradient Color Stops Via
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via": [{
          via: [gradientColorStops]
        }],
        /**
         * Gradient Color Stops To
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to": [{
          to: [gradientColorStops]
        }],
        // Borders
        /**
         * Border Radius
         * @see https://tailwindcss.com/docs/border-radius
         */
        rounded: [{
          rounded: [borderRadius]
        }],
        /**
         * Border Radius Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-s": [{
          "rounded-s": [borderRadius]
        }],
        /**
         * Border Radius End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-e": [{
          "rounded-e": [borderRadius]
        }],
        /**
         * Border Radius Top
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-t": [{
          "rounded-t": [borderRadius]
        }],
        /**
         * Border Radius Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-r": [{
          "rounded-r": [borderRadius]
        }],
        /**
         * Border Radius Bottom
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-b": [{
          "rounded-b": [borderRadius]
        }],
        /**
         * Border Radius Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-l": [{
          "rounded-l": [borderRadius]
        }],
        /**
         * Border Radius Start Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ss": [{
          "rounded-ss": [borderRadius]
        }],
        /**
         * Border Radius Start End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-se": [{
          "rounded-se": [borderRadius]
        }],
        /**
         * Border Radius End End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ee": [{
          "rounded-ee": [borderRadius]
        }],
        /**
         * Border Radius End Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-es": [{
          "rounded-es": [borderRadius]
        }],
        /**
         * Border Radius Top Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tl": [{
          "rounded-tl": [borderRadius]
        }],
        /**
         * Border Radius Top Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tr": [{
          "rounded-tr": [borderRadius]
        }],
        /**
         * Border Radius Bottom Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-br": [{
          "rounded-br": [borderRadius]
        }],
        /**
         * Border Radius Bottom Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-bl": [{
          "rounded-bl": [borderRadius]
        }],
        /**
         * Border Width
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w": [{
          border: [borderWidth]
        }],
        /**
         * Border Width X
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-x": [{
          "border-x": [borderWidth]
        }],
        /**
         * Border Width Y
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-y": [{
          "border-y": [borderWidth]
        }],
        /**
         * Border Width Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-s": [{
          "border-s": [borderWidth]
        }],
        /**
         * Border Width End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-e": [{
          "border-e": [borderWidth]
        }],
        /**
         * Border Width Top
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-t": [{
          "border-t": [borderWidth]
        }],
        /**
         * Border Width Right
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-r": [{
          "border-r": [borderWidth]
        }],
        /**
         * Border Width Bottom
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-b": [{
          "border-b": [borderWidth]
        }],
        /**
         * Border Width Left
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-l": [{
          "border-l": [borderWidth]
        }],
        /**
         * Border Opacity
         * @see https://tailwindcss.com/docs/border-opacity
         */
        "border-opacity": [{
          "border-opacity": [opacity]
        }],
        /**
         * Border Style
         * @see https://tailwindcss.com/docs/border-style
         */
        "border-style": [{
          border: [...getLineStyles(), "hidden"]
        }],
        /**
         * Divide Width X
         * @see https://tailwindcss.com/docs/divide-width
         */
        "divide-x": [{
          "divide-x": [borderWidth]
        }],
        /**
         * Divide Width X Reverse
         * @see https://tailwindcss.com/docs/divide-width
         */
        "divide-x-reverse": ["divide-x-reverse"],
        /**
         * Divide Width Y
         * @see https://tailwindcss.com/docs/divide-width
         */
        "divide-y": [{
          "divide-y": [borderWidth]
        }],
        /**
         * Divide Width Y Reverse
         * @see https://tailwindcss.com/docs/divide-width
         */
        "divide-y-reverse": ["divide-y-reverse"],
        /**
         * Divide Opacity
         * @see https://tailwindcss.com/docs/divide-opacity
         */
        "divide-opacity": [{
          "divide-opacity": [opacity]
        }],
        /**
         * Divide Style
         * @see https://tailwindcss.com/docs/divide-style
         */
        "divide-style": [{
          divide: getLineStyles()
        }],
        /**
         * Border Color
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color": [{
          border: [borderColor]
        }],
        /**
         * Border Color X
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-x": [{
          "border-x": [borderColor]
        }],
        /**
         * Border Color Y
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-y": [{
          "border-y": [borderColor]
        }],
        /**
         * Border Color S
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-s": [{
          "border-s": [borderColor]
        }],
        /**
         * Border Color E
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-e": [{
          "border-e": [borderColor]
        }],
        /**
         * Border Color Top
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-t": [{
          "border-t": [borderColor]
        }],
        /**
         * Border Color Right
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-r": [{
          "border-r": [borderColor]
        }],
        /**
         * Border Color Bottom
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-b": [{
          "border-b": [borderColor]
        }],
        /**
         * Border Color Left
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-l": [{
          "border-l": [borderColor]
        }],
        /**
         * Divide Color
         * @see https://tailwindcss.com/docs/divide-color
         */
        "divide-color": [{
          divide: [borderColor]
        }],
        /**
         * Outline Style
         * @see https://tailwindcss.com/docs/outline-style
         */
        "outline-style": [{
          outline: ["", ...getLineStyles()]
        }],
        /**
         * Outline Offset
         * @see https://tailwindcss.com/docs/outline-offset
         */
        "outline-offset": [{
          "outline-offset": [isLength, isArbitraryValue]
        }],
        /**
         * Outline Width
         * @see https://tailwindcss.com/docs/outline-width
         */
        "outline-w": [{
          outline: [isLength, isArbitraryLength]
        }],
        /**
         * Outline Color
         * @see https://tailwindcss.com/docs/outline-color
         */
        "outline-color": [{
          outline: [colors]
        }],
        /**
         * Ring Width
         * @see https://tailwindcss.com/docs/ring-width
         */
        "ring-w": [{
          ring: getLengthWithEmptyAndArbitrary()
        }],
        /**
         * Ring Width Inset
         * @see https://tailwindcss.com/docs/ring-width
         */
        "ring-w-inset": ["ring-inset"],
        /**
         * Ring Color
         * @see https://tailwindcss.com/docs/ring-color
         */
        "ring-color": [{
          ring: [colors]
        }],
        /**
         * Ring Opacity
         * @see https://tailwindcss.com/docs/ring-opacity
         */
        "ring-opacity": [{
          "ring-opacity": [opacity]
        }],
        /**
         * Ring Offset Width
         * @see https://tailwindcss.com/docs/ring-offset-width
         */
        "ring-offset-w": [{
          "ring-offset": [isLength, isArbitraryLength]
        }],
        /**
         * Ring Offset Color
         * @see https://tailwindcss.com/docs/ring-offset-color
         */
        "ring-offset-color": [{
          "ring-offset": [colors]
        }],
        // Effects
        /**
         * Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow
         */
        shadow: [{
          shadow: ["", "inner", "none", isTshirtSize, isArbitraryShadow]
        }],
        /**
         * Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow-color
         */
        "shadow-color": [{
          shadow: [isAny]
        }],
        /**
         * Opacity
         * @see https://tailwindcss.com/docs/opacity
         */
        opacity: [{
          opacity: [opacity]
        }],
        /**
         * Mix Blend Mode
         * @see https://tailwindcss.com/docs/mix-blend-mode
         */
        "mix-blend": [{
          "mix-blend": [...getBlendModes(), "plus-lighter", "plus-darker"]
        }],
        /**
         * Background Blend Mode
         * @see https://tailwindcss.com/docs/background-blend-mode
         */
        "bg-blend": [{
          "bg-blend": getBlendModes()
        }],
        // Filters
        /**
         * Filter
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/filter
         */
        filter: [{
          filter: ["", "none"]
        }],
        /**
         * Blur
         * @see https://tailwindcss.com/docs/blur
         */
        blur: [{
          blur: [blur]
        }],
        /**
         * Brightness
         * @see https://tailwindcss.com/docs/brightness
         */
        brightness: [{
          brightness: [brightness]
        }],
        /**
         * Contrast
         * @see https://tailwindcss.com/docs/contrast
         */
        contrast: [{
          contrast: [contrast]
        }],
        /**
         * Drop Shadow
         * @see https://tailwindcss.com/docs/drop-shadow
         */
        "drop-shadow": [{
          "drop-shadow": ["", "none", isTshirtSize, isArbitraryValue]
        }],
        /**
         * Grayscale
         * @see https://tailwindcss.com/docs/grayscale
         */
        grayscale: [{
          grayscale: [grayscale]
        }],
        /**
         * Hue Rotate
         * @see https://tailwindcss.com/docs/hue-rotate
         */
        "hue-rotate": [{
          "hue-rotate": [hueRotate]
        }],
        /**
         * Invert
         * @see https://tailwindcss.com/docs/invert
         */
        invert: [{
          invert: [invert]
        }],
        /**
         * Saturate
         * @see https://tailwindcss.com/docs/saturate
         */
        saturate: [{
          saturate: [saturate]
        }],
        /**
         * Sepia
         * @see https://tailwindcss.com/docs/sepia
         */
        sepia: [{
          sepia: [sepia]
        }],
        /**
         * Backdrop Filter
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/backdrop-filter
         */
        "backdrop-filter": [{
          "backdrop-filter": ["", "none"]
        }],
        /**
         * Backdrop Blur
         * @see https://tailwindcss.com/docs/backdrop-blur
         */
        "backdrop-blur": [{
          "backdrop-blur": [blur]
        }],
        /**
         * Backdrop Brightness
         * @see https://tailwindcss.com/docs/backdrop-brightness
         */
        "backdrop-brightness": [{
          "backdrop-brightness": [brightness]
        }],
        /**
         * Backdrop Contrast
         * @see https://tailwindcss.com/docs/backdrop-contrast
         */
        "backdrop-contrast": [{
          "backdrop-contrast": [contrast]
        }],
        /**
         * Backdrop Grayscale
         * @see https://tailwindcss.com/docs/backdrop-grayscale
         */
        "backdrop-grayscale": [{
          "backdrop-grayscale": [grayscale]
        }],
        /**
         * Backdrop Hue Rotate
         * @see https://tailwindcss.com/docs/backdrop-hue-rotate
         */
        "backdrop-hue-rotate": [{
          "backdrop-hue-rotate": [hueRotate]
        }],
        /**
         * Backdrop Invert
         * @see https://tailwindcss.com/docs/backdrop-invert
         */
        "backdrop-invert": [{
          "backdrop-invert": [invert]
        }],
        /**
         * Backdrop Opacity
         * @see https://tailwindcss.com/docs/backdrop-opacity
         */
        "backdrop-opacity": [{
          "backdrop-opacity": [opacity]
        }],
        /**
         * Backdrop Saturate
         * @see https://tailwindcss.com/docs/backdrop-saturate
         */
        "backdrop-saturate": [{
          "backdrop-saturate": [saturate]
        }],
        /**
         * Backdrop Sepia
         * @see https://tailwindcss.com/docs/backdrop-sepia
         */
        "backdrop-sepia": [{
          "backdrop-sepia": [sepia]
        }],
        // Tables
        /**
         * Border Collapse
         * @see https://tailwindcss.com/docs/border-collapse
         */
        "border-collapse": [{
          border: ["collapse", "separate"]
        }],
        /**
         * Border Spacing
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing": [{
          "border-spacing": [borderSpacing]
        }],
        /**
         * Border Spacing X
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-x": [{
          "border-spacing-x": [borderSpacing]
        }],
        /**
         * Border Spacing Y
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-y": [{
          "border-spacing-y": [borderSpacing]
        }],
        /**
         * Table Layout
         * @see https://tailwindcss.com/docs/table-layout
         */
        "table-layout": [{
          table: ["auto", "fixed"]
        }],
        /**
         * Caption Side
         * @see https://tailwindcss.com/docs/caption-side
         */
        caption: [{
          caption: ["top", "bottom"]
        }],
        // Transitions and Animation
        /**
         * Tranisition Property
         * @see https://tailwindcss.com/docs/transition-property
         */
        transition: [{
          transition: ["none", "all", "", "colors", "opacity", "shadow", "transform", isArbitraryValue]
        }],
        /**
         * Transition Duration
         * @see https://tailwindcss.com/docs/transition-duration
         */
        duration: [{
          duration: getNumberAndArbitrary()
        }],
        /**
         * Transition Timing Function
         * @see https://tailwindcss.com/docs/transition-timing-function
         */
        ease: [{
          ease: ["linear", "in", "out", "in-out", isArbitraryValue]
        }],
        /**
         * Transition Delay
         * @see https://tailwindcss.com/docs/transition-delay
         */
        delay: [{
          delay: getNumberAndArbitrary()
        }],
        /**
         * Animation
         * @see https://tailwindcss.com/docs/animation
         */
        animate: [{
          animate: ["none", "spin", "ping", "pulse", "bounce", isArbitraryValue]
        }],
        // Transforms
        /**
         * Transform
         * @see https://tailwindcss.com/docs/transform
         */
        transform: [{
          transform: ["", "gpu", "none"]
        }],
        /**
         * Scale
         * @see https://tailwindcss.com/docs/scale
         */
        scale: [{
          scale: [scale]
        }],
        /**
         * Scale X
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-x": [{
          "scale-x": [scale]
        }],
        /**
         * Scale Y
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-y": [{
          "scale-y": [scale]
        }],
        /**
         * Rotate
         * @see https://tailwindcss.com/docs/rotate
         */
        rotate: [{
          rotate: [isInteger, isArbitraryValue]
        }],
        /**
         * Translate X
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-x": [{
          "translate-x": [translate]
        }],
        /**
         * Translate Y
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-y": [{
          "translate-y": [translate]
        }],
        /**
         * Skew X
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-x": [{
          "skew-x": [skew]
        }],
        /**
         * Skew Y
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-y": [{
          "skew-y": [skew]
        }],
        /**
         * Transform Origin
         * @see https://tailwindcss.com/docs/transform-origin
         */
        "transform-origin": [{
          origin: ["center", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left", isArbitraryValue]
        }],
        // Interactivity
        /**
         * Accent Color
         * @see https://tailwindcss.com/docs/accent-color
         */
        accent: [{
          accent: ["auto", colors]
        }],
        /**
         * Appearance
         * @see https://tailwindcss.com/docs/appearance
         */
        appearance: [{
          appearance: ["none", "auto"]
        }],
        /**
         * Cursor
         * @see https://tailwindcss.com/docs/cursor
         */
        cursor: [{
          cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryValue]
        }],
        /**
         * Caret Color
         * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
         */
        "caret-color": [{
          caret: [colors]
        }],
        /**
         * Pointer Events
         * @see https://tailwindcss.com/docs/pointer-events
         */
        "pointer-events": [{
          "pointer-events": ["none", "auto"]
        }],
        /**
         * Resize
         * @see https://tailwindcss.com/docs/resize
         */
        resize: [{
          resize: ["none", "y", "x", ""]
        }],
        /**
         * Scroll Behavior
         * @see https://tailwindcss.com/docs/scroll-behavior
         */
        "scroll-behavior": [{
          scroll: ["auto", "smooth"]
        }],
        /**
         * Scroll Margin
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-m": [{
          "scroll-m": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin X
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mx": [{
          "scroll-mx": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin Y
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-my": [{
          "scroll-my": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ms": [{
          "scroll-ms": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-me": [{
          "scroll-me": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin Top
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mt": [{
          "scroll-mt": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin Right
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mr": [{
          "scroll-mr": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin Bottom
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mb": [{
          "scroll-mb": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Margin Left
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ml": [{
          "scroll-ml": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-p": [{
          "scroll-p": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding X
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-px": [{
          "scroll-px": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding Y
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-py": [{
          "scroll-py": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-ps": [{
          "scroll-ps": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pe": [{
          "scroll-pe": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding Top
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pt": [{
          "scroll-pt": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding Right
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pr": [{
          "scroll-pr": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding Bottom
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pb": [{
          "scroll-pb": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Padding Left
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pl": [{
          "scroll-pl": getSpacingWithArbitrary()
        }],
        /**
         * Scroll Snap Align
         * @see https://tailwindcss.com/docs/scroll-snap-align
         */
        "snap-align": [{
          snap: ["start", "end", "center", "align-none"]
        }],
        /**
         * Scroll Snap Stop
         * @see https://tailwindcss.com/docs/scroll-snap-stop
         */
        "snap-stop": [{
          snap: ["normal", "always"]
        }],
        /**
         * Scroll Snap Type
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-type": [{
          snap: ["none", "x", "y", "both"]
        }],
        /**
         * Scroll Snap Type Strictness
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-strictness": [{
          snap: ["mandatory", "proximity"]
        }],
        /**
         * Touch Action
         * @see https://tailwindcss.com/docs/touch-action
         */
        touch: [{
          touch: ["auto", "none", "manipulation"]
        }],
        /**
         * Touch Action X
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-x": [{
          "touch-pan": ["x", "left", "right"]
        }],
        /**
         * Touch Action Y
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-y": [{
          "touch-pan": ["y", "up", "down"]
        }],
        /**
         * Touch Action Pinch Zoom
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-pz": ["touch-pinch-zoom"],
        /**
         * User Select
         * @see https://tailwindcss.com/docs/user-select
         */
        select: [{
          select: ["none", "text", "all", "auto"]
        }],
        /**
         * Will Change
         * @see https://tailwindcss.com/docs/will-change
         */
        "will-change": [{
          "will-change": ["auto", "scroll", "contents", "transform", isArbitraryValue]
        }],
        // SVG
        /**
         * Fill
         * @see https://tailwindcss.com/docs/fill
         */
        fill: [{
          fill: [colors, "none"]
        }],
        /**
         * Stroke Width
         * @see https://tailwindcss.com/docs/stroke-width
         */
        "stroke-w": [{
          stroke: [isLength, isArbitraryLength, isArbitraryNumber]
        }],
        /**
         * Stroke
         * @see https://tailwindcss.com/docs/stroke
         */
        stroke: [{
          stroke: [colors, "none"]
        }],
        // Accessibility
        /**
         * Screen Readers
         * @see https://tailwindcss.com/docs/screen-readers
         */
        sr: ["sr-only", "not-sr-only"],
        /**
         * Forced Color Adjust
         * @see https://tailwindcss.com/docs/forced-color-adjust
         */
        "forced-color-adjust": [{
          "forced-color-adjust": ["auto", "none"]
        }]
      },
      conflictingClassGroups: {
        overflow: ["overflow-x", "overflow-y"],
        overscroll: ["overscroll-x", "overscroll-y"],
        inset: ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"],
        "inset-x": ["right", "left"],
        "inset-y": ["top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
        px: ["pr", "pl"],
        py: ["pt", "pb"],
        m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
        mx: ["mr", "ml"],
        my: ["mt", "mb"],
        size: ["w", "h"],
        "font-size": ["leading"],
        "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
        "fvn-ordinal": ["fvn-normal"],
        "fvn-slashed-zero": ["fvn-normal"],
        "fvn-figure": ["fvn-normal"],
        "fvn-spacing": ["fvn-normal"],
        "fvn-fraction": ["fvn-normal"],
        "line-clamp": ["display", "overflow"],
        rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
        "rounded-s": ["rounded-ss", "rounded-es"],
        "rounded-e": ["rounded-se", "rounded-ee"],
        "rounded-t": ["rounded-tl", "rounded-tr"],
        "rounded-r": ["rounded-tr", "rounded-br"],
        "rounded-b": ["rounded-br", "rounded-bl"],
        "rounded-l": ["rounded-tl", "rounded-bl"],
        "border-spacing": ["border-spacing-x", "border-spacing-y"],
        "border-w": ["border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
        "border-w-x": ["border-w-r", "border-w-l"],
        "border-w-y": ["border-w-t", "border-w-b"],
        "border-color": ["border-color-s", "border-color-e", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
        "border-color-x": ["border-color-r", "border-color-l"],
        "border-color-y": ["border-color-t", "border-color-b"],
        "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
        "scroll-mx": ["scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mt", "scroll-mb"],
        "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
        "scroll-px": ["scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pt", "scroll-pb"],
        touch: ["touch-x", "touch-y", "touch-pz"],
        "touch-x": ["touch"],
        "touch-y": ["touch"],
        "touch-pz": ["touch"]
      },
      conflictingClassGroupModifiers: {
        "font-size": ["leading"]
      }
    };
  };
  var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

  // ../../../packages/shadcn-ui/src/utils.ts
  function cn(...inputs) {
    return twMerge(clsx(inputs));
  }

  // src/lib/remote-components/crm-workbench/src/react-shim.ts
  var react_shim_exports = {};
  __export(react_shim_exports, {
    Children: () => Children,
    Component: () => Component,
    Fragment: () => Fragment,
    Profiler: () => Profiler,
    PureComponent: () => PureComponent,
    StrictMode: () => StrictMode,
    Suspense: () => Suspense,
    cloneElement: () => cloneElement,
    createContext: () => createContext,
    createElement: () => createElement,
    createFactory: () => createFactory,
    createRef: () => createRef,
    default: () => react_shim_default,
    forwardRef: () => forwardRef,
    isValidElement: () => isValidElement,
    lazy: () => lazy,
    memo: () => memo,
    startTransition: () => startTransition,
    useCallback: () => useCallback,
    useContext: () => useContext,
    useDebugValue: () => useDebugValue,
    useDeferredValue: () => useDeferredValue,
    useEffect: () => useEffect,
    useId: () => useId,
    useImperativeHandle: () => useImperativeHandle,
    useInsertionEffect: () => useInsertionEffect,
    useLayoutEffect: () => useLayoutEffect,
    useMemo: () => useMemo,
    useReducer: () => useReducer,
    useRef: () => useRef,
    useState: () => useState,
    useSyncExternalStore: () => useSyncExternalStore,
    useTransition: () => useTransition,
    version: () => version
  });
  var ReactGlobal = window.React;
  var react_shim_default = ReactGlobal;
  var Children = ReactGlobal.Children;
  var Component = ReactGlobal.Component;
  var Fragment = ReactGlobal.Fragment;
  var Profiler = ReactGlobal.Profiler;
  var PureComponent = ReactGlobal.PureComponent;
  var StrictMode = ReactGlobal.StrictMode;
  var Suspense = ReactGlobal.Suspense;
  var cloneElement = ReactGlobal.cloneElement;
  var createContext = ReactGlobal.createContext;
  var createElement = ReactGlobal.createElement;
  var createFactory = ReactGlobal.createFactory;
  var createRef = ReactGlobal.createRef;
  var forwardRef = ReactGlobal.forwardRef;
  var isValidElement = ReactGlobal.isValidElement;
  var lazy = ReactGlobal.lazy;
  var memo = ReactGlobal.memo;
  var startTransition = ReactGlobal.startTransition;
  var useCallback = ReactGlobal.useCallback;
  var useContext = ReactGlobal.useContext;
  var useDebugValue = ReactGlobal.useDebugValue;
  var useDeferredValue = ReactGlobal.useDeferredValue;
  var useEffect = ReactGlobal.useEffect;
  var useId = ReactGlobal.useId;
  var useImperativeHandle = ReactGlobal.useImperativeHandle;
  var useInsertionEffect = ReactGlobal.useInsertionEffect;
  var useLayoutEffect = ReactGlobal.useLayoutEffect;
  var useMemo = ReactGlobal.useMemo;
  var useReducer = ReactGlobal.useReducer;
  var useRef = ReactGlobal.useRef;
  var useState = ReactGlobal.useState;
  var useSyncExternalStore = ReactGlobal.useSyncExternalStore;
  var useTransition = ReactGlobal.useTransition;
  var version = ReactGlobal.version;

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils.js
  var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  var mergeClasses = (...classes) => classes.filter((className, index2, array) => {
    return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index2;
  }).join(" ").trim();

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.js
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.js
  var Icon = forwardRef(
    ({
      color = "currentColor",
      size: size4 = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      className = "",
      children,
      iconNode,
      ...rest
    }, ref) => {
      return createElement(
        "svg",
        {
          ref,
          ...defaultAttributes,
          width: size4,
          height: size4,
          stroke: color,
          strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size4) : strokeWidth,
          className: mergeClasses("lucide", className),
          ...rest
        },
        [
          ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
          ...Array.isArray(children) ? children : [children]
        ]
      );
    }
  );

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.js
  var createLucideIcon = (iconName, iconNode) => {
    const Component2 = forwardRef(
      ({ className, ...props }, ref) => createElement(Icon, {
        ref,
        iconNode,
        className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
        ...props
      })
    );
    Component2.displayName = `${iconName}`;
    return Component2;
  };

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/check.js
  var __iconNode = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
  var Check = createLucideIcon("Check", __iconNode);

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-down.js
  var __iconNode2 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
  var ChevronDown = createLucideIcon("ChevronDown", __iconNode2);

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-right.js
  var __iconNode3 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]];
  var ChevronRight = createLucideIcon("ChevronRight", __iconNode3);

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-up.js
  var __iconNode4 = [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]];
  var ChevronUp = createLucideIcon("ChevronUp", __iconNode4);

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/circle.js
  var __iconNode5 = [["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }]];
  var Circle = createLucideIcon("Circle", __iconNode5);

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/search.js
  var __iconNode6 = [
    ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
    ["path", { d: "m21 21-4.3-4.3", key: "1qie3q" }]
  ];
  var Search = createLucideIcon("Search", __iconNode6);

  // ../../../node_modules/.pnpm/lucide-react@0.475.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.js
  var __iconNode7 = [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ];
  var X = createLucideIcon("X", __iconNode7);

  // ../../../node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
  var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
  var cx = clsx;
  var cva = (base, config) => (props) => {
    var _config_compoundVariants;
    if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
    const { variants, defaultVariants } = config;
    const getVariantClassNames = Object.keys(variants).map((variant) => {
      const variantProp = props === null || props === void 0 ? void 0 : props[variant];
      const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
      if (variantProp === null) return null;
      const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
      return variants[variant][variantKey];
    });
    const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
      let [key, value] = param;
      if (value === void 0) {
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
    const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
      let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
      return Object.entries(compoundVariantOptions).every((param2) => {
        let [key, value] = param2;
        return Array.isArray(value) ? value.includes({
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key]) : {
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key] === value;
      }) ? [
        ...acc,
        cvClass,
        cvClassName
      ] : acc;
    }, []);
    return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
  };

  // ../../../packages/shadcn-ui/src/components/badge.tsx
  var badgeVariants = cva("xps-badge", {
    variants: {
      variant: {
        default: "xps-badge--default",
        secondary: "xps-badge--secondary",
        success: "xps-badge--success",
        warning: "xps-badge--warning",
        destructive: "xps-badge--destructive"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  });
  function Badge({ className, variant, ...props }) {
    return createElement("span", {
      className: cn(badgeVariants({ variant }), className),
      ...props
    });
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
  function setRef(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  function composeRefs(...refs) {
    return (node) => {
      let hasCleanup = false;
      const cleanups = refs.map((ref) => {
        const cleanup = setRef(ref, node);
        if (!hasCleanup && typeof cleanup == "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup == "function") {
              cleanup();
            } else {
              setRef(refs[i], null);
            }
          }
        };
      }
    };
  }
  function useComposedRefs(...refs) {
    return useCallback(composeRefs(...refs), refs);
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-slot@1.2.5_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  // @__NO_SIDE_EFFECTS__
  function createSlot(ownerName) {
    const Slot22 = forwardRef((props, forwardedRef) => {
      let { children, ...slotProps } = props;
      let slottableElement = null;
      let hasSlottable = false;
      const newChildren = [];
      if (isLazyComponent(children) && typeof use === "function") {
        children = use(children._payload);
      }
      Children.forEach(children, (maybeSlottable) => {
        if (isSlottable(maybeSlottable)) {
          hasSlottable = true;
          const slottable = maybeSlottable;
          let child = "child" in slottable.props ? slottable.props.child : slottable.props.children;
          if (isLazyComponent(child) && typeof use === "function") {
            child = use(child._payload);
          }
          slottableElement = getSlottableElementFromSlottable(slottable, child);
          newChildren.push(slottableElement?.props?.children);
        } else {
          newChildren.push(maybeSlottable);
        }
      });
      if (slottableElement) {
        slottableElement = cloneElement(slottableElement, void 0, newChildren);
      } else if (
        // A `Slottable` was found but it didn't resolve to a single element (e.g.
        // it wrapped multiple elements, text, or a render-prop `child` that
        // wasn't an element). Don't fall back to treating the `Slottable` wrapper
        // itself as the slot target — throw a descriptive error below instead.
        !hasSlottable && Children.count(children) === 1 && isValidElement(children)
      ) {
        slottableElement = children;
      }
      const slottableElementRef = slottableElement ? getElementRef(slottableElement) : void 0;
      const composedRef = useComposedRefs(forwardedRef, slottableElementRef);
      if (!slottableElement) {
        if (children || children === 0) {
          throw new Error(
            hasSlottable ? createSlottableError(ownerName) : createSlotError(ownerName)
          );
        }
        return children;
      }
      const mergedProps = mergeProps(slotProps, slottableElement.props ?? {});
      if (slottableElement.type !== Fragment) {
        mergedProps.ref = forwardedRef ? composedRef : slottableElementRef;
      }
      return cloneElement(slottableElement, mergedProps);
    });
    Slot22.displayName = `${ownerName}.Slot`;
    return Slot22;
  }
  var Slot = /* @__PURE__ */ createSlot("Slot");
  var SLOTTABLE_IDENTIFIER = /* @__PURE__ */ Symbol.for("radix.slottable");
  // @__NO_SIDE_EFFECTS__
  function createSlottable(ownerName) {
    const Slottable2 = (props) => "child" in props ? props.children(props.child) : props.children;
    Slottable2.displayName = `${ownerName}.Slottable`;
    Slottable2.__radixId = SLOTTABLE_IDENTIFIER;
    return Slottable2;
  }
  var getSlottableElementFromSlottable = (slottable, child) => {
    if ("child" in slottable.props) {
      const child2 = slottable.props.child;
      if (!isValidElement(child2)) return null;
      return cloneElement(child2, void 0, slottable.props.children(child2.props.children));
    }
    return isValidElement(child) ? child : null;
  };
  function mergeProps(slotProps, childProps) {
    const overrideProps = { ...childProps };
    for (const propName in childProps) {
      const slotPropValue = slotProps[propName];
      const childPropValue = childProps[propName];
      const isHandler = /^on[A-Z]/.test(propName);
      if (isHandler) {
        if (slotPropValue && childPropValue) {
          overrideProps[propName] = (...args) => {
            const result = childPropValue(...args);
            slotPropValue(...args);
            return result;
          };
        } else if (slotPropValue) {
          overrideProps[propName] = slotPropValue;
        }
      } else if (propName === "style") {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue };
      } else if (propName === "className") {
        overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
      }
    }
    return { ...slotProps, ...overrideProps };
  }
  function getElementRef(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  function isSlottable(child) {
    return isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
  }
  var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
  function isLazyComponent(element) {
    return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
  }
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
  }
  var createSlotError = (ownerName) => {
    return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
  };
  var createSlottableError = (ownerName) => {
    return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
  };
  var use = react_shim_exports[" use ".trim().toString()];

  // ../../../packages/shadcn-ui/src/components/button.tsx
  var buttonVariants = cva("xps-button", {
    variants: {
      variant: {
        default: "xps-button--default",
        secondary: "xps-button--secondary",
        outline: "xps-button--outline",
        ghost: "xps-button--ghost",
        destructive: "xps-button--destructive",
        destructiveOutline: "xps-button--destructive-outline"
      },
      size: {
        default: "",
        sm: "xps-button--sm",
        lg: "xps-button--lg",
        icon: "xps-button--icon"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  });
  var Button = forwardRef(
    ({ className, variant, size: size4, asChild = false, type, ...props }, ref) => {
      const Comp = asChild ? Slot : "button";
      const elementProps = {
        className: cn(buttonVariants({ variant, size: size4 }), className),
        ref,
        ...props
      };
      if (!asChild) {
        elementProps.type = type ?? "button";
      }
      return createElement(Comp, elementProps);
    }
  );
  Button.displayName = "Button";

  // ../../../packages/shadcn-ui/src/components/card.tsx
  var Card = forwardRef(({ className, ...props }, ref) => createElement("div", {
    ref,
    className: cn("xps-card", className),
    ...props
  }));
  Card.displayName = "Card";
  var CardHeader = forwardRef(({ className, ...props }, ref) => createElement("div", {
    ref,
    className: cn("xps-card-header", className),
    ...props
  }));
  CardHeader.displayName = "CardHeader";
  var CardTitle = forwardRef(
    ({ className, ...props }, ref) => createElement("h3", {
      ref,
      className: cn("xps-card-title", className),
      ...props
    })
  );
  CardTitle.displayName = "CardTitle";
  var CardDescription = forwardRef(
    ({ className, ...props }, ref) => createElement("p", {
      ref,
      className: cn("xps-card-description", className),
      ...props
    })
  );
  CardDescription.displayName = "CardDescription";
  var CardContent = forwardRef(({ className, ...props }, ref) => createElement("div", {
    ref,
    className: cn("xps-card-content", className),
    ...props
  }));
  CardContent.displayName = "CardContent";

  // src/lib/remote-components/crm-workbench/src/react-jsx-runtime-shim.ts
  var ReactGlobal2 = window.React;
  var Fragment2 = ReactGlobal2.Fragment;
  function jsx(type, props, key) {
    return ReactGlobal2.createElement(type, key === void 0 ? props : { ...props, key });
  }
  var jsxs = jsx;

  // ../../../node_modules/.pnpm/@radix-ui+react-context@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-context/dist/index.mjs
  function createContext2(rootComponentName, defaultContext) {
    const Context = createContext(defaultContext);
    Context.displayName = rootComponentName + "Context";
    const Provider2 = (props) => {
      const { children, ...context } = props;
      const value = useMemo(() => context, Object.values(context));
      return /* @__PURE__ */ jsx(Context.Provider, { value, children });
    };
    Provider2.displayName = rootComponentName + "Provider";
    function useContext2(consumerName) {
      const context = useContext(Context);
      if (context) return context;
      if (defaultContext !== void 0) return defaultContext;
      throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
    }
    return [Provider2, useContext2];
  }
  function createContextScope(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext3(rootComponentName, defaultContext) {
      const BaseContext = createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index2 = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider2 = (props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const value = useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ jsx(Context.Provider, { value, children });
      };
      Provider2.displayName = rootComponentName + "Provider";
      function useContext2(consumerName, scope) {
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const context = useContext(Context);
        if (context) return context;
        if (defaultContext !== void 0) return defaultContext;
        throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
      }
      return [Provider2, useContext2];
    }
    const createScope = () => {
      const scopeContexts = defaultContexts.map((defaultContext) => {
        return createContext(defaultContext);
      });
      return function useScope(scope) {
        const contexts = scope?.[scopeName] || scopeContexts;
        return useMemo(
          () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
          [scope, contexts]
        );
      };
    };
    createScope.scopeName = scopeName;
    return [createContext3, composeContextScopes(createScope, ...createContextScopeDeps)];
  }
  function composeContextScopes(...scopes) {
    const baseScope = scopes[0];
    if (scopes.length === 1) return baseScope;
    const createScope = () => {
      const scopeHooks = scopes.map((createScope2) => ({
        useScope: createScope2(),
        scopeName: createScope2.scopeName
      }));
      return function useComposedScopes(overrideScopes) {
        const nextScopes = scopeHooks.reduce((nextScopes2, { useScope, scopeName }) => {
          const scopeProps = useScope(overrideScopes);
          const currentScope = scopeProps[`__scope${scopeName}`];
          return { ...nextScopes2, ...currentScope };
        }, {});
        return useMemo(() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }), [nextScopes]);
      };
    };
    createScope.scopeName = baseScope.scopeName;
    return createScope;
  }

  // ../../../node_modules/.pnpm/@radix-ui+primitive@1.1.4/node_modules/@radix-ui/primitive/dist/index.mjs
  var canUseDOM = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    };
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-use-layout-effect@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
  var useLayoutEffect2 = globalThis?.document ? useLayoutEffect : () => {
  };

  // ../../../node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  var useInsertionEffect2 = react_shim_exports[" useInsertionEffect ".trim().toString()] || useLayoutEffect2;
  function useControllableState({
    prop,
    defaultProp,
    onChange = () => {
    },
    caller
  }) {
    const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
      defaultProp,
      onChange
    });
    const isControlled = prop !== void 0;
    const value = isControlled ? prop : uncontrolledProp;
    if (true) {
      const isControlledRef = useRef(prop !== void 0);
      useEffect(() => {
        const wasControlled = isControlledRef.current;
        if (wasControlled !== isControlled) {
          const from = wasControlled ? "controlled" : "uncontrolled";
          const to = isControlled ? "controlled" : "uncontrolled";
          console.warn(
            `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
          );
        }
        isControlledRef.current = isControlled;
      }, [isControlled, caller]);
    }
    const setValue = useCallback(
      (nextValue) => {
        if (isControlled) {
          const value2 = isFunction(nextValue) ? nextValue(prop) : nextValue;
          if (value2 !== prop) {
            onChangeRef.current?.(value2);
          }
        } else {
          setUncontrolledProp(nextValue);
        }
      },
      [isControlled, prop, setUncontrolledProp, onChangeRef]
    );
    return [value, setValue];
  }
  function useUncontrolledState({
    defaultProp,
    onChange
  }) {
    const [value, setValue] = useState(defaultProp);
    const prevValueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    useInsertionEffect2(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    useEffect(() => {
      if (prevValueRef.current !== value) {
        onChangeRef.current?.(value);
        prevValueRef.current = value;
      }
    }, [value, prevValueRef]);
    return [value, setValue, onChangeRef];
  }
  function isFunction(value) {
    return typeof value === "function";
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-use-previous@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-previous/dist/index.mjs
  function usePrevious(value) {
    const ref = useRef({ value, previous: value });
    return useMemo(() => {
      if (ref.current.value !== value) {
        ref.current.previous = ref.current.value;
        ref.current.value = value;
      }
      return ref.current.previous;
    }, [value]);
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-use-size@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-size/dist/index.mjs
  function useSize(element) {
    const [size4, setSize] = useState(void 0);
    useLayoutEffect2(() => {
      if (element) {
        setSize({ width: element.offsetWidth, height: element.offsetHeight });
        const resizeObserver = new ResizeObserver((entries) => {
          if (!Array.isArray(entries)) {
            return;
          }
          if (!entries.length) {
            return;
          }
          const entry = entries[0];
          let width;
          let height;
          if ("borderBoxSize" in entry) {
            const borderSizeEntry = entry["borderBoxSize"];
            const borderSize = Array.isArray(borderSizeEntry) ? borderSizeEntry[0] : borderSizeEntry;
            width = borderSize["inlineSize"];
            height = borderSize["blockSize"];
          } else {
            width = element.offsetWidth;
            height = element.offsetHeight;
          }
          setSize({ width, height });
        });
        resizeObserver.observe(element, { box: "border-box" });
        return () => resizeObserver.unobserve(element);
      } else {
        setSize(void 0);
      }
    }, [element]);
    return size4;
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-presence@1.1.6_@types+react-dom@18.3.7_@types+react@18.3.31__@types+rea_dc6e30df35507eb8a116c12c3da26e18/node_modules/@radix-ui/react-presence/dist/index.mjs
  function useStateMachine(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  var Presence = (props) => {
    const { present, children } = props;
    const presence = usePresence(present);
    const child = typeof children === "function" ? children({ present: presence.isPresent }) : Children.only(children);
    const ref = useStableComposedRefs(presence.ref, getElementRef2(child));
    const forceMount = typeof children === "function";
    return forceMount || presence.isPresent ? cloneElement(child, { ref }) : null;
  };
  Presence.displayName = "Presence";
  function usePresence(present) {
    const [node, setNode] = useState();
    const stylesRef = useRef(null);
    const prevPresentRef = useRef(present);
    const prevAnimationNameRef = useRef("none");
    const initialState = present ? "mounted" : "unmounted";
    const [state, send] = useStateMachine(initialState, {
      mounted: {
        UNMOUNT: "unmounted",
        ANIMATION_OUT: "unmountSuspended"
      },
      unmountSuspended: {
        MOUNT: "mounted",
        ANIMATION_END: "unmounted"
      },
      unmounted: {
        MOUNT: "mounted"
      }
    });
    useEffect(() => {
      const currentAnimationName = getAnimationName(stylesRef.current);
      prevAnimationNameRef.current = state === "mounted" ? currentAnimationName : "none";
    }, [state]);
    useLayoutEffect2(() => {
      const styles = stylesRef.current;
      const wasPresent = prevPresentRef.current;
      const hasPresentChanged = wasPresent !== present;
      if (hasPresentChanged) {
        const prevAnimationName = prevAnimationNameRef.current;
        const currentAnimationName = getAnimationName(styles);
        if (present) {
          send("MOUNT");
        } else if (currentAnimationName === "none" || styles?.display === "none") {
          send("UNMOUNT");
        } else {
          const isAnimating = prevAnimationName !== currentAnimationName;
          if (wasPresent && isAnimating) {
            send("ANIMATION_OUT");
          } else {
            send("UNMOUNT");
          }
        }
        prevPresentRef.current = present;
      }
    }, [present, send]);
    useLayoutEffect2(() => {
      if (node) {
        let timeoutId;
        const ownerWindow = node.ownerDocument.defaultView ?? window;
        const handleAnimationEnd = (event) => {
          const currentAnimationName = getAnimationName(stylesRef.current);
          const isCurrentAnimation = currentAnimationName.includes(CSS.escape(event.animationName));
          if (event.target === node && isCurrentAnimation) {
            send("ANIMATION_END");
            if (!prevPresentRef.current) {
              const currentFillMode = node.style.animationFillMode;
              node.style.animationFillMode = "forwards";
              timeoutId = ownerWindow.setTimeout(() => {
                if (node.style.animationFillMode === "forwards") {
                  node.style.animationFillMode = currentFillMode;
                }
              });
            }
          }
        };
        const handleAnimationStart = (event) => {
          if (event.target === node) {
            prevAnimationNameRef.current = getAnimationName(stylesRef.current);
          }
        };
        node.addEventListener("animationstart", handleAnimationStart);
        node.addEventListener("animationcancel", handleAnimationEnd);
        node.addEventListener("animationend", handleAnimationEnd);
        return () => {
          ownerWindow.clearTimeout(timeoutId);
          node.removeEventListener("animationstart", handleAnimationStart);
          node.removeEventListener("animationcancel", handleAnimationEnd);
          node.removeEventListener("animationend", handleAnimationEnd);
        };
      } else {
        send("ANIMATION_END");
      }
    }, [node, send]);
    return {
      isPresent: ["mounted", "unmountSuspended"].includes(state),
      ref: useCallback((node2) => {
        stylesRef.current = node2 ? getComputedStyle(node2) : null;
        setNode(node2);
      }, [])
    };
  }
  function setRef2(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  function useStableComposedRefs(...refs) {
    const refsRef = useRef(refs);
    refsRef.current = refs;
    return useCallback((node) => {
      const currentRefs = refsRef.current;
      let hasCleanup = false;
      const cleanups = currentRefs.map((ref) => {
        const cleanup = setRef2(ref, node);
        if (!hasCleanup && typeof cleanup === "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup === "function") {
              cleanup();
            } else {
              setRef2(currentRefs[i], null);
            }
          }
        };
      }
    }, []);
  }
  function getAnimationName(styles) {
    return styles?.animationName || "none";
  }
  function getElementRef2(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }

  // src/lib/remote-components/crm-workbench/src/react-dom-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createPortal = ReactDOMGlobal.createPortal;
  var flushSync = ReactDOMGlobal.flushSync;
  var findDOMNode = ReactDOMGlobal.findDOMNode;
  var hydrate = ReactDOMGlobal.hydrate;
  var render = ReactDOMGlobal.render;
  var unstable_batchedUpdates = ReactDOMGlobal.unstable_batchedUpdates;
  var unmountComponentAtNode = ReactDOMGlobal.unmountComponentAtNode;
  var version2 = ReactDOMGlobal.version;

  // ../../../node_modules/.pnpm/@radix-ui+react-primitive@2.1.5_@types+react-dom@18.3.7_@types+react@18.3.31__@types+re_9b6ae4cdaf3918ddbf0b21069e38e2ef/node_modules/@radix-ui/react-primitive/dist/index.mjs
  var NODES = [
    "a",
    "button",
    "div",
    "form",
    "h2",
    "h3",
    "img",
    "input",
    "label",
    "li",
    "nav",
    "ol",
    "p",
    "select",
    "span",
    "svg",
    "ul"
  ];
  var Primitive = NODES.reduce((primitive, node) => {
    const Slot5 = createSlot(`Primitive.${node}`);
    const Node2 = forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot5 : node;
      if (typeof window !== "undefined") {
        window[/* @__PURE__ */ Symbol.for("radix-ui")] = true;
      }
      return /* @__PURE__ */ jsx(Comp, { ...primitiveProps, ref: forwardedRef });
    });
    Node2.displayName = `Primitive.${node}`;
    return { ...primitive, [node]: Node2 };
  }, {});
  function dispatchDiscreteCustomEvent(target, event) {
    if (target) flushSync(() => target.dispatchEvent(event));
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-checkbox@1.3.4_@types+react-dom@18.3.7_@types+react@18.3.31__@types+rea_e21be6412c310c083d6755285c4c1ad9/node_modules/@radix-ui/react-checkbox/dist/index.mjs
  var CHECKBOX_NAME = "Checkbox";
  var [createCheckboxContext, createCheckboxScope] = createContextScope(CHECKBOX_NAME);
  var [CheckboxProviderImpl, useCheckboxContext] = createCheckboxContext(CHECKBOX_NAME);
  function CheckboxProvider(props) {
    const {
      __scopeCheckbox,
      checked: checkedProp,
      children,
      defaultChecked,
      disabled,
      form,
      name,
      onCheckedChange,
      required,
      value = "on",
      // @ts-expect-error
      internal_do_not_use_render
    } = props;
    const [checked, setChecked] = useControllableState({
      prop: checkedProp,
      defaultProp: defaultChecked ?? false,
      onChange: onCheckedChange,
      caller: CHECKBOX_NAME
    });
    const [control, setControl] = useState(null);
    const [bubbleInput, setBubbleInput] = useState(null);
    const hasConsumerStoppedPropagationRef = useRef(false);
    const isFormControl = control ? !!form || !!control.closest("form") : (
      // We set this to true by default so that events bubble to forms without JS (SSR)
      true
    );
    const context = {
      checked,
      disabled,
      setChecked,
      control,
      setControl,
      name,
      form,
      value,
      hasConsumerStoppedPropagationRef,
      required,
      defaultChecked: isIndeterminate(defaultChecked) ? false : defaultChecked,
      isFormControl,
      bubbleInput,
      setBubbleInput
    };
    return /* @__PURE__ */ jsx(
      CheckboxProviderImpl,
      {
        scope: __scopeCheckbox,
        ...context,
        children: isFunction2(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    );
  }
  var TRIGGER_NAME = "CheckboxTrigger";
  var CheckboxTrigger = forwardRef(
    ({ __scopeCheckbox, onKeyDown, onClick, ...checkboxProps }, forwardedRef) => {
      const {
        control,
        value,
        disabled,
        checked,
        required,
        setControl,
        setChecked,
        hasConsumerStoppedPropagationRef,
        isFormControl,
        bubbleInput
      } = useCheckboxContext(TRIGGER_NAME, __scopeCheckbox);
      const composedRefs = useComposedRefs(forwardedRef, setControl);
      const initialCheckedStateRef = useRef(checked);
      useEffect(() => {
        const form = control?.form;
        if (form) {
          const reset = () => setChecked(initialCheckedStateRef.current);
          form.addEventListener("reset", reset);
          return () => form.removeEventListener("reset", reset);
        }
      }, [control, setChecked]);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          role: "checkbox",
          "aria-checked": isIndeterminate(checked) ? "mixed" : checked,
          "aria-required": required,
          "data-state": getState(checked),
          "data-disabled": disabled ? "" : void 0,
          disabled,
          value,
          ...checkboxProps,
          ref: composedRefs,
          onKeyDown: composeEventHandlers(onKeyDown, (event) => {
            if (event.key === "Enter") event.preventDefault();
          }),
          onClick: composeEventHandlers(onClick, (event) => {
            setChecked((prevChecked) => isIndeterminate(prevChecked) ? true : !prevChecked);
            if (bubbleInput && isFormControl) {
              hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
              if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
          })
        }
      );
    }
  );
  CheckboxTrigger.displayName = TRIGGER_NAME;
  var Checkbox = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeCheckbox,
        name,
        checked,
        defaultChecked,
        required,
        disabled,
        value,
        onCheckedChange,
        form,
        ...checkboxProps
      } = props;
      return /* @__PURE__ */ jsx(
        CheckboxProvider,
        {
          __scopeCheckbox,
          checked,
          defaultChecked,
          disabled,
          required,
          onCheckedChange,
          name,
          form,
          value,
          internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
            /* @__PURE__ */ jsx(
              CheckboxTrigger,
              {
                ...checkboxProps,
                ref: forwardedRef,
                __scopeCheckbox
              }
            ),
            isFormControl && /* @__PURE__ */ jsx(
              CheckboxBubbleInput,
              {
                __scopeCheckbox
              }
            )
          ] })
        }
      );
    }
  );
  Checkbox.displayName = CHECKBOX_NAME;
  var INDICATOR_NAME = "CheckboxIndicator";
  var CheckboxIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeCheckbox, forceMount, ...indicatorProps } = props;
      const context = useCheckboxContext(INDICATOR_NAME, __scopeCheckbox);
      return /* @__PURE__ */ jsx(
        Presence,
        {
          present: forceMount || isIndeterminate(context.checked) || context.checked === true,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              "data-state": getState(context.checked),
              "data-disabled": context.disabled ? "" : void 0,
              ...indicatorProps,
              ref: forwardedRef,
              style: { pointerEvents: "none", ...props.style }
            }
          )
        }
      );
    }
  );
  CheckboxIndicator.displayName = INDICATOR_NAME;
  var BUBBLE_INPUT_NAME = "CheckboxBubbleInput";
  var CheckboxBubbleInput = forwardRef(
    ({ __scopeCheckbox, ...props }, forwardedRef) => {
      const {
        control,
        hasConsumerStoppedPropagationRef,
        checked,
        defaultChecked,
        required,
        disabled,
        name,
        value,
        form,
        bubbleInput,
        setBubbleInput
      } = useCheckboxContext(BUBBLE_INPUT_NAME, __scopeCheckbox);
      const composedRefs = useComposedRefs(forwardedRef, setBubbleInput);
      const prevChecked = usePrevious(checked);
      const controlSize = useSize(control);
      useEffect(() => {
        const input = bubbleInput;
        if (!input) return;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          inputProto,
          "checked"
        );
        const setChecked = descriptor.set;
        const bubbles = !hasConsumerStoppedPropagationRef.current;
        if (prevChecked !== checked && setChecked) {
          const event = new Event("click", { bubbles });
          input.indeterminate = isIndeterminate(checked);
          setChecked.call(input, isIndeterminate(checked) ? false : checked);
          input.dispatchEvent(event);
        }
      }, [bubbleInput, prevChecked, checked, hasConsumerStoppedPropagationRef]);
      const defaultCheckedRef = useRef(isIndeterminate(checked) ? false : checked);
      return /* @__PURE__ */ jsx(
        Primitive.input,
        {
          type: "checkbox",
          "aria-hidden": true,
          defaultChecked: defaultChecked ?? defaultCheckedRef.current,
          required,
          disabled,
          name,
          value,
          form,
          ...props,
          tabIndex: -1,
          ref: composedRefs,
          style: {
            ...props.style,
            ...controlSize,
            position: "absolute",
            pointerEvents: "none",
            opacity: 0,
            margin: 0,
            // We transform because the input is absolutely positioned but we have
            // rendered it **after** the button. This pulls it back to sit on top
            // of the button.
            transform: "translateX(-100%)"
          }
        }
      );
    }
  );
  CheckboxBubbleInput.displayName = BUBBLE_INPUT_NAME;
  function isFunction2(value) {
    return typeof value === "function";
  }
  function isIndeterminate(checked) {
    return checked === "indeterminate";
  }
  function getState(checked) {
    return isIndeterminate(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }

  // ../../../packages/shadcn-ui/src/components/checkbox.tsx
  var Checkbox2 = forwardRef(
    ({ className, ...props }, ref) => createElement(
      Checkbox,
      {
        ref,
        className: cn("xps-checkbox", className),
        ...props
      },
      createElement(
        CheckboxIndicator,
        {
          className: "xps-checkbox-indicator"
        },
        createElement(Check, { className: "xps-icon" })
      )
    )
  );
  Checkbox2.displayName = Checkbox.displayName;

  // ../../../node_modules/.pnpm/cmdk@1.1.1_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react@18.3.31_react-dom_97e75a3ab323022d7998e58a36c32fb5/node_modules/cmdk/dist/chunk-NZJY6EH4.mjs
  var U = 1;
  var Y = 0.9;
  var H = 0.8;
  var J = 0.17;
  var p = 0.1;
  var u = 0.999;
  var $ = 0.9999;
  var k = 0.99;
  var m = /[\\\/_+.#"@\[\(\{&]/;
  var B = /[\\\/_+.#"@\[\(\{&]/g;
  var K = /[\s-]/;
  var X2 = /[\s-]/g;
  function G(_, C, h, P2, A, f, O) {
    if (f === C.length) return A === _.length ? U : k;
    var T2 = `${A},${f}`;
    if (O[T2] !== void 0) return O[T2];
    for (var L2 = P2.charAt(f), c = h.indexOf(L2, A), S = 0, E, N2, R, M; c >= 0; ) E = G(_, C, h, P2, c + 1, f + 1, O), E > S && (c === A ? E *= U : m.test(_.charAt(c - 1)) ? (E *= H, R = _.slice(A, c - 1).match(B), R && A > 0 && (E *= Math.pow(u, R.length))) : K.test(_.charAt(c - 1)) ? (E *= Y, M = _.slice(A, c - 1).match(X2), M && A > 0 && (E *= Math.pow(u, M.length))) : (E *= J, A > 0 && (E *= Math.pow(u, c - A))), _.charAt(c) !== C.charAt(f) && (E *= $)), (E < p && h.charAt(c - 1) === P2.charAt(f + 1) || P2.charAt(f + 1) === P2.charAt(f) && h.charAt(c - 1) !== P2.charAt(f)) && (N2 = G(_, C, h, P2, c + 1, f + 2, O), N2 * p > E && (E = N2 * p)), E > S && (S = E), c = h.indexOf(L2, c + 1);
    return O[T2] = S, S;
  }
  function D(_) {
    return _.toLowerCase().replace(X2, " ");
  }
  function W(_, C, h) {
    return _ = h && h.length > 0 ? `${_ + " " + h.join(" ")}` : _, G(_, C, D(_), D(C), 0, 0, {});
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-id@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-id/dist/index.mjs
  var useReactId = react_shim_exports[" useId ".trim().toString()] || (() => void 0);
  var count = 0;
  function useId2(deterministicId) {
    const [id, setId] = useState(useReactId());
    useLayoutEffect2(() => {
      if (!deterministicId) setId((reactId) => reactId ?? String(count++));
    }, [deterministicId]);
    return deterministicId || (id ? `radix-${id}` : "");
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-use-callback-ref@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
  function useCallbackRef(callback) {
    const callbackRef = useRef(callback);
    useEffect(() => {
      callbackRef.current = callback;
    });
    return useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-use-escape-keydown@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-escape-keydown/dist/index.mjs
  function useEscapeKeydown(onEscapeKeyDownProp, ownerDocument = globalThis?.document) {
    const onEscapeKeyDown = useCallbackRef(onEscapeKeyDownProp);
    useEffect(() => {
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          onEscapeKeyDown(event);
        }
      };
      ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => ownerDocument.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [onEscapeKeyDown, ownerDocument]);
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.12_@types+react-dom@18.3.7_@types+react@18.3.31___1202449cfd75d4d3d4e876187986c0d8/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  var DISMISSABLE_LAYER_NAME = "DismissableLayer";
  var CONTEXT_UPDATE = "dismissableLayer.update";
  var POINTER_DOWN_OUTSIDE = "dismissableLayer.pointerDownOutside";
  var FOCUS_OUTSIDE = "dismissableLayer.focusOutside";
  var originalBodyPointerEvents;
  var DismissableLayerContext = createContext({
    layers: /* @__PURE__ */ new Set(),
    layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
    branches: /* @__PURE__ */ new Set()
  });
  var DismissableLayer = forwardRef(
    (props, forwardedRef) => {
      const {
        disableOutsidePointerEvents = false,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        ...layerProps
      } = props;
      const context = useContext(DismissableLayerContext);
      const [node, setNode] = useState(null);
      const ownerDocument = node?.ownerDocument ?? globalThis?.document;
      const [, force] = useState({});
      const composedRefs = useComposedRefs(forwardedRef, (node2) => setNode(node2));
      const layers = Array.from(context.layers);
      const [highestLayerWithOutsidePointerEventsDisabled] = [...context.layersWithOutsidePointerEventsDisabled].slice(-1);
      const highestLayerWithOutsidePointerEventsDisabledIndex = layers.indexOf(highestLayerWithOutsidePointerEventsDisabled);
      const index2 = node ? layers.indexOf(node) : -1;
      const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
      const isPointerEventsEnabled = index2 >= highestLayerWithOutsidePointerEventsDisabledIndex;
      const pointerDownOutside = usePointerDownOutside((event) => {
        const target = event.target;
        const isPointerDownOnBranch = [...context.branches].some((branch) => branch.contains(target));
        if (!isPointerEventsEnabled || isPointerDownOnBranch) return;
        onPointerDownOutside?.(event);
        onInteractOutside?.(event);
        if (!event.defaultPrevented) onDismiss?.();
      }, ownerDocument);
      const focusOutside = useFocusOutside((event) => {
        const target = event.target;
        const isFocusInBranch = [...context.branches].some((branch) => branch.contains(target));
        if (isFocusInBranch) return;
        onFocusOutside?.(event);
        onInteractOutside?.(event);
        if (!event.defaultPrevented) onDismiss?.();
      }, ownerDocument);
      useEscapeKeydown((event) => {
        const isHighestLayer = index2 === context.layers.size - 1;
        if (!isHighestLayer) return;
        onEscapeKeyDown?.(event);
        if (!event.defaultPrevented && onDismiss) {
          event.preventDefault();
          onDismiss();
        }
      }, ownerDocument);
      useEffect(() => {
        if (!node) return;
        if (disableOutsidePointerEvents) {
          if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
            originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
            ownerDocument.body.style.pointerEvents = "none";
          }
          context.layersWithOutsidePointerEventsDisabled.add(node);
        }
        context.layers.add(node);
        dispatchUpdate();
        return () => {
          if (disableOutsidePointerEvents) {
            context.layersWithOutsidePointerEventsDisabled.delete(node);
            if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
              ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;
            }
          }
        };
      }, [node, ownerDocument, disableOutsidePointerEvents, context]);
      useEffect(() => {
        return () => {
          if (!node) return;
          context.layers.delete(node);
          context.layersWithOutsidePointerEventsDisabled.delete(node);
          dispatchUpdate();
        };
      }, [node, context]);
      useEffect(() => {
        const handleUpdate = () => force({});
        document.addEventListener(CONTEXT_UPDATE, handleUpdate);
        return () => document.removeEventListener(CONTEXT_UPDATE, handleUpdate);
      }, []);
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          ...layerProps,
          ref: composedRefs,
          style: {
            pointerEvents: isBodyPointerEventsDisabled ? isPointerEventsEnabled ? "auto" : "none" : void 0,
            ...props.style
          },
          onFocusCapture: composeEventHandlers(props.onFocusCapture, focusOutside.onFocusCapture),
          onBlurCapture: composeEventHandlers(props.onBlurCapture, focusOutside.onBlurCapture),
          onPointerDownCapture: composeEventHandlers(
            props.onPointerDownCapture,
            pointerDownOutside.onPointerDownCapture
          )
        }
      );
    }
  );
  DismissableLayer.displayName = DISMISSABLE_LAYER_NAME;
  var BRANCH_NAME = "DismissableLayerBranch";
  var DismissableLayerBranch = forwardRef((props, forwardedRef) => {
    const context = useContext(DismissableLayerContext);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        context.branches.add(node);
        return () => {
          context.branches.delete(node);
        };
      }
    }, [context.branches]);
    return /* @__PURE__ */ jsx(Primitive.div, { ...props, ref: composedRefs });
  });
  DismissableLayerBranch.displayName = BRANCH_NAME;
  function usePointerDownOutside(onPointerDownOutside, ownerDocument = globalThis?.document) {
    const handlePointerDownOutside = useCallbackRef(onPointerDownOutside);
    const isPointerInsideReactTreeRef = useRef(false);
    const handleClickRef = useRef(() => {
    });
    useEffect(() => {
      const handlePointerDown = (event) => {
        if (event.target && !isPointerInsideReactTreeRef.current) {
          let handleAndDispatchPointerDownOutsideEvent2 = function() {
            handleAndDispatchCustomEvent(
              POINTER_DOWN_OUTSIDE,
              handlePointerDownOutside,
              eventDetail,
              { discrete: true }
            );
          };
          var handleAndDispatchPointerDownOutsideEvent = handleAndDispatchPointerDownOutsideEvent2;
          const eventDetail = { originalEvent: event };
          if (event.pointerType === "touch") {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            handleClickRef.current = handleAndDispatchPointerDownOutsideEvent2;
            ownerDocument.addEventListener("click", handleClickRef.current, { once: true });
          } else {
            handleAndDispatchPointerDownOutsideEvent2();
          }
        } else {
          ownerDocument.removeEventListener("click", handleClickRef.current);
        }
        isPointerInsideReactTreeRef.current = false;
      };
      const timerId = window.setTimeout(() => {
        ownerDocument.addEventListener("pointerdown", handlePointerDown);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
        ownerDocument.removeEventListener("pointerdown", handlePointerDown);
        ownerDocument.removeEventListener("click", handleClickRef.current);
      };
    }, [ownerDocument, handlePointerDownOutside]);
    return {
      // ensures we check React component tree (not just DOM tree)
      onPointerDownCapture: () => isPointerInsideReactTreeRef.current = true
    };
  }
  function useFocusOutside(onFocusOutside, ownerDocument = globalThis?.document) {
    const handleFocusOutside = useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = useRef(false);
    useEffect(() => {
      const handleFocus = (event) => {
        if (event.target && !isFocusInsideReactTreeRef.current) {
          const eventDetail = { originalEvent: event };
          handleAndDispatchCustomEvent(FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
            discrete: false
          });
        }
      };
      ownerDocument.addEventListener("focusin", handleFocus);
      return () => ownerDocument.removeEventListener("focusin", handleFocus);
    }, [ownerDocument, handleFocusOutside]);
    return {
      onFocusCapture: () => isFocusInsideReactTreeRef.current = true,
      onBlurCapture: () => isFocusInsideReactTreeRef.current = false
    };
  }
  function dispatchUpdate() {
    const event = new CustomEvent(CONTEXT_UPDATE);
    document.dispatchEvent(event);
  }
  function handleAndDispatchCustomEvent(name, handler, detail, { discrete }) {
    const target = detail.originalEvent.target;
    const event = new CustomEvent(name, { bubbles: false, cancelable: true, detail });
    if (handler) target.addEventListener(name, handler, { once: true });
    if (discrete) {
      dispatchDiscreteCustomEvent(target, event);
    } else {
      target.dispatchEvent(event);
    }
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-focus-scope@1.1.9_@types+react-dom@18.3.7_@types+react@18.3.31__@types+_c97f9e7487f0abcea30d185973e4d237/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
  var AUTOFOCUS_ON_MOUNT = "focusScope.autoFocusOnMount";
  var AUTOFOCUS_ON_UNMOUNT = "focusScope.autoFocusOnUnmount";
  var EVENT_OPTIONS = { bubbles: false, cancelable: true };
  var FOCUS_SCOPE_NAME = "FocusScope";
  var FocusScope = forwardRef((props, forwardedRef) => {
    const {
      loop = false,
      trapped = false,
      onMountAutoFocus: onMountAutoFocusProp,
      onUnmountAutoFocus: onUnmountAutoFocusProp,
      ...scopeProps
    } = props;
    const [container, setContainer] = useState(null);
    const onMountAutoFocus = useCallbackRef(onMountAutoFocusProp);
    const onUnmountAutoFocus = useCallbackRef(onUnmountAutoFocusProp);
    const lastFocusedElementRef = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, (node) => setContainer(node));
    const focusScope = useRef({
      paused: false,
      pause() {
        this.paused = true;
      },
      resume() {
        this.paused = false;
      }
    }).current;
    useEffect(() => {
      if (trapped) {
        let handleFocusIn2 = function(event) {
          if (focusScope.paused || !container) return;
          const target = event.target;
          if (container.contains(target)) {
            lastFocusedElementRef.current = target;
          } else {
            focus(lastFocusedElementRef.current, { select: true });
          }
        }, handleFocusOut2 = function(event) {
          if (focusScope.paused || !container) return;
          const relatedTarget = event.relatedTarget;
          if (relatedTarget === null) return;
          if (!container.contains(relatedTarget)) {
            focus(lastFocusedElementRef.current, { select: true });
          }
        }, handleMutations2 = function(mutations) {
          const focusedElement = document.activeElement;
          if (focusedElement !== document.body) return;
          for (const mutation of mutations) {
            if (mutation.removedNodes.length > 0) focus(container);
          }
        };
        var handleFocusIn = handleFocusIn2, handleFocusOut = handleFocusOut2, handleMutations = handleMutations2;
        document.addEventListener("focusin", handleFocusIn2);
        document.addEventListener("focusout", handleFocusOut2);
        const mutationObserver = new MutationObserver(handleMutations2);
        if (container) mutationObserver.observe(container, { childList: true, subtree: true });
        return () => {
          document.removeEventListener("focusin", handleFocusIn2);
          document.removeEventListener("focusout", handleFocusOut2);
          mutationObserver.disconnect();
        };
      }
    }, [trapped, container, focusScope.paused]);
    useEffect(() => {
      if (container) {
        focusScopesStack.add(focusScope);
        const previouslyFocusedElement = document.activeElement;
        const hasFocusedCandidate = container.contains(previouslyFocusedElement);
        if (!hasFocusedCandidate) {
          const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);
          container.addEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
          container.dispatchEvent(mountEvent);
          if (!mountEvent.defaultPrevented) {
            focusFirst(removeLinks(getTabbableCandidates(container)), { select: true });
            if (document.activeElement === previouslyFocusedElement) {
              focus(container);
            }
          }
        }
        return () => {
          container.removeEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
          setTimeout(() => {
            const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, EVENT_OPTIONS);
            container.addEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
            container.dispatchEvent(unmountEvent);
            if (!unmountEvent.defaultPrevented) {
              focus(previouslyFocusedElement ?? document.body, { select: true });
            }
            container.removeEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
            focusScopesStack.remove(focusScope);
          }, 0);
        };
      }
    }, [container, onMountAutoFocus, onUnmountAutoFocus, focusScope]);
    const handleKeyDown = useCallback(
      (event) => {
        if (!loop && !trapped) return;
        if (focusScope.paused) return;
        const isTabKey = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
        const focusedElement = document.activeElement;
        if (isTabKey && focusedElement) {
          const container2 = event.currentTarget;
          const [first, last] = getTabbableEdges(container2);
          const hasTabbableElementsInside = first && last;
          if (!hasTabbableElementsInside) {
            if (focusedElement === container2) event.preventDefault();
          } else {
            if (!event.shiftKey && focusedElement === last) {
              event.preventDefault();
              if (loop) focus(first, { select: true });
            } else if (event.shiftKey && focusedElement === first) {
              event.preventDefault();
              if (loop) focus(last, { select: true });
            }
          }
        }
      },
      [loop, trapped, focusScope.paused]
    );
    return /* @__PURE__ */ jsx(Primitive.div, { tabIndex: -1, ...scopeProps, ref: composedRefs, onKeyDown: handleKeyDown });
  });
  FocusScope.displayName = FOCUS_SCOPE_NAME;
  function focusFirst(candidates, { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      focus(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
    }
  }
  function getTabbableEdges(container) {
    const candidates = getTabbableCandidates(container);
    const first = findVisible(candidates, container);
    const last = findVisible(candidates.reverse(), container);
    return [first, last];
  }
  function getTabbableCandidates(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
        if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
        return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function findVisible(elements, container) {
    for (const element of elements) {
      if (!isHidden(element, { upTo: container })) return element;
    }
  }
  function isHidden(node, { upTo }) {
    if (getComputedStyle(node).visibility === "hidden") return true;
    while (node) {
      if (upTo !== void 0 && node === upTo) return false;
      if (getComputedStyle(node).display === "none") return true;
      node = node.parentElement;
    }
    return false;
  }
  function isSelectableInput(element) {
    return element instanceof HTMLInputElement && "select" in element;
  }
  function focus(element, { select = false } = {}) {
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      element.focus({ preventScroll: true });
      if (element !== previouslyFocusedElement && isSelectableInput(element) && select)
        element.select();
    }
  }
  var focusScopesStack = createFocusScopesStack();
  function createFocusScopesStack() {
    let stack = [];
    return {
      add(focusScope) {
        const activeFocusScope = stack[0];
        if (focusScope !== activeFocusScope) {
          activeFocusScope?.pause();
        }
        stack = arrayRemove(stack, focusScope);
        stack.unshift(focusScope);
      },
      remove(focusScope) {
        stack = arrayRemove(stack, focusScope);
        stack[0]?.resume();
      }
    };
  }
  function arrayRemove(array, item) {
    const updatedArray = [...array];
    const index2 = updatedArray.indexOf(item);
    if (index2 !== -1) {
      updatedArray.splice(index2, 1);
    }
    return updatedArray;
  }
  function removeLinks(items) {
    return items.filter((item) => item.tagName !== "A");
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-portal@1.1.11_@types+react-dom@18.3.7_@types+react@18.3.31__@types+reac_32b1caf40ac61f8d30d412d28d60b4ca/node_modules/@radix-ui/react-portal/dist/index.mjs
  var PORTAL_NAME = "Portal";
  var Portal = forwardRef((props, forwardedRef) => {
    const { container: containerProp, ...portalProps } = props;
    const [mounted, setMounted] = useState(false);
    useLayoutEffect2(() => setMounted(true), []);
    const container = containerProp || mounted && globalThis?.document?.body;
    return container ? createPortal(/* @__PURE__ */ jsx(Primitive.div, { ...portalProps, ref: forwardedRef }), container) : null;
  });
  Portal.displayName = PORTAL_NAME;

  // ../../../node_modules/.pnpm/@radix-ui+react-focus-guards@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
  var count2 = 0;
  var guards = null;
  function useFocusGuards() {
    useEffect(() => {
      if (!guards) {
        guards = { start: createFocusGuard(), end: createFocusGuard() };
      }
      const { start, end } = guards;
      if (document.body.firstElementChild !== start) {
        document.body.insertAdjacentElement("afterbegin", start);
      }
      if (document.body.lastElementChild !== end) {
        document.body.insertAdjacentElement("beforeend", end);
      }
      count2++;
      return () => {
        if (count2 === 1) {
          guards?.start.remove();
          guards?.end.remove();
          guards = null;
        }
        count2 = Math.max(0, count2 - 1);
      };
    }, []);
  }
  function createFocusGuard() {
    const element = document.createElement("span");
    element.setAttribute("data-radix-focus-guard", "");
    element.tabIndex = 0;
    element.style.outline = "none";
    element.style.opacity = "0";
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    return element;
  }

  // ../../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
  var __assign = function() {
    __assign = Object.assign || function __assign2(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p2 in s) if (Object.prototype.hasOwnProperty.call(s, p2)) t[p2] = s[p2];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  function __rest(s, e) {
    var t = {};
    for (var p2 in s) if (Object.prototype.hasOwnProperty.call(s, p2) && e.indexOf(p2) < 0)
      t[p2] = s[p2];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p2 = Object.getOwnPropertySymbols(s); i < p2.length; i++) {
        if (e.indexOf(p2[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p2[i]))
          t[p2[i]] = s[p2[i]];
      }
    return t;
  }
  function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
        if (!ar) ar = Array.prototype.slice.call(from, 0, i);
        ar[i] = from[i];
      }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
  }

  // ../../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
  var zeroRightClassName = "right-scroll-bar-position";
  var fullWidthClassName = "width-before-scroll-bar";
  var noScrollbarsClassName = "with-scroll-bars-hidden";
  var removedBarSizeVariable = "--removed-body-scroll-bar-size";

  // ../../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/assignRef.js
  function assignRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
    return ref;
  }

  // ../../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useRef.js
  function useCallbackRef2(initialValue, callback) {
    var ref = useState(function() {
      return {
        // value
        value: initialValue,
        // last callback
        callback,
        // "memoized" public interface
        facade: {
          get current() {
            return ref.value;
          },
          set current(value) {
            var last = ref.value;
            if (last !== value) {
              ref.value = value;
              ref.callback(value, last);
            }
          }
        }
      };
    })[0];
    ref.callback = callback;
    return ref.facade;
  }

  // ../../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
  var useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  var currentValues = /* @__PURE__ */ new WeakMap();
  function useMergeRefs(refs, defaultValue) {
    var callbackRef = useCallbackRef2(defaultValue || null, function(newValue) {
      return refs.forEach(function(ref) {
        return assignRef(ref, newValue);
      });
    });
    useIsomorphicLayoutEffect(function() {
      var oldValue = currentValues.get(callbackRef);
      if (oldValue) {
        var prevRefs_1 = new Set(oldValue);
        var nextRefs_1 = new Set(refs);
        var current_1 = callbackRef.current;
        prevRefs_1.forEach(function(ref) {
          if (!nextRefs_1.has(ref)) {
            assignRef(ref, null);
          }
        });
        nextRefs_1.forEach(function(ref) {
          if (!prevRefs_1.has(ref)) {
            assignRef(ref, current_1);
          }
        });
      }
      currentValues.set(callbackRef, refs);
    }, [refs]);
    return callbackRef;
  }

  // ../../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/medium.js
  function ItoI(a) {
    return a;
  }
  function innerCreateMedium(defaults, middleware) {
    if (middleware === void 0) {
      middleware = ItoI;
    }
    var buffer = [];
    var assigned = false;
    var medium = {
      read: function() {
        if (assigned) {
          throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
        }
        if (buffer.length) {
          return buffer[buffer.length - 1];
        }
        return defaults;
      },
      useMedium: function(data) {
        var item = middleware(data, assigned);
        buffer.push(item);
        return function() {
          buffer = buffer.filter(function(x) {
            return x !== item;
          });
        };
      },
      assignSyncMedium: function(cb) {
        assigned = true;
        while (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
        }
        buffer = {
          push: function(x) {
            return cb(x);
          },
          filter: function() {
            return buffer;
          }
        };
      },
      assignMedium: function(cb) {
        assigned = true;
        var pendingQueue = [];
        if (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
          pendingQueue = buffer;
        }
        var executeQueue = function() {
          var cbs2 = pendingQueue;
          pendingQueue = [];
          cbs2.forEach(cb);
        };
        var cycle = function() {
          return Promise.resolve().then(executeQueue);
        };
        cycle();
        buffer = {
          push: function(x) {
            pendingQueue.push(x);
            cycle();
          },
          filter: function(filter) {
            pendingQueue = pendingQueue.filter(filter);
            return buffer;
          }
        };
      }
    };
    return medium;
  }
  function createSidecarMedium(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    var medium = innerCreateMedium(null);
    medium.options = __assign({ async: true, ssr: false }, options2);
    return medium;
  }

  // ../../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/exports.js
  var SideCar = function(_a) {
    var sideCar = _a.sideCar, rest = __rest(_a, ["sideCar"]);
    if (!sideCar) {
      throw new Error("Sidecar: please provide `sideCar` property to import the right car");
    }
    var Target = sideCar.read();
    if (!Target) {
      throw new Error("Sidecar medium not found");
    }
    return createElement(Target, __assign({}, rest));
  };
  SideCar.isSideCarExport = true;
  function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
  }

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/medium.js
  var effectCar = createSidecarMedium();

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/UI.js
  var nothing = function() {
    return;
  };
  var RemoveScroll = forwardRef(function(props, parentRef) {
    var ref = useRef(null);
    var _a = useState({
      onScrollCapture: nothing,
      onWheelCapture: nothing,
      onTouchMoveCapture: nothing
    }), callbacks = _a[0], setCallbacks = _a[1];
    var forwardProps = props.forwardProps, children = props.children, className = props.className, removeScrollBar = props.removeScrollBar, enabled = props.enabled, shards = props.shards, sideCar = props.sideCar, noRelative = props.noRelative, noIsolation = props.noIsolation, inert = props.inert, allowPinchZoom = props.allowPinchZoom, _b = props.as, Container = _b === void 0 ? "div" : _b, gapMode = props.gapMode, rest = __rest(props, ["forwardProps", "children", "className", "removeScrollBar", "enabled", "shards", "sideCar", "noRelative", "noIsolation", "inert", "allowPinchZoom", "as", "gapMode"]);
    var SideCar2 = sideCar;
    var containerRef = useMergeRefs([ref, parentRef]);
    var containerProps = __assign(__assign({}, rest), callbacks);
    return createElement(
      Fragment,
      null,
      enabled && createElement(SideCar2, { sideCar: effectCar, removeScrollBar, shards, noRelative, noIsolation, inert, setCallbacks, allowPinchZoom: !!allowPinchZoom, lockRef: ref, gapMode }),
      forwardProps ? cloneElement(Children.only(children), __assign(__assign({}, containerProps), { ref: containerRef })) : createElement(Container, __assign({}, containerProps, { className, ref: containerRef }), children)
    );
  });
  RemoveScroll.defaultProps = {
    enabled: true,
    removeScrollBar: true,
    inert: false
  };
  RemoveScroll.classNames = {
    fullWidth: fullWidthClassName,
    zeroRight: zeroRightClassName
  };

  // ../../../node_modules/.pnpm/get-nonce@1.0.1/node_modules/get-nonce/dist/es2015/index.js
  var currentNonce;
  var getNonce = function() {
    if (currentNonce) {
      return currentNonce;
    }
    if (typeof __webpack_nonce__ !== "undefined") {
      return __webpack_nonce__;
    }
    return void 0;
  };

  // ../../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/singleton.js
  function makeStyleTag() {
    if (!document)
      return null;
    var tag = document.createElement("style");
    tag.type = "text/css";
    var nonce = getNonce();
    if (nonce) {
      tag.setAttribute("nonce", nonce);
    }
    return tag;
  }
  function injectStyles(tag, css) {
    if (tag.styleSheet) {
      tag.styleSheet.cssText = css;
    } else {
      tag.appendChild(document.createTextNode(css));
    }
  }
  function insertStyleTag(tag) {
    var head = document.head || document.getElementsByTagName("head")[0];
    head.appendChild(tag);
  }
  var stylesheetSingleton = function() {
    var counter = 0;
    var stylesheet = null;
    return {
      add: function(style) {
        if (counter == 0) {
          if (stylesheet = makeStyleTag()) {
            injectStyles(stylesheet, style);
            insertStyleTag(stylesheet);
          }
        }
        counter++;
      },
      remove: function() {
        counter--;
        if (!counter && stylesheet) {
          stylesheet.parentNode && stylesheet.parentNode.removeChild(stylesheet);
          stylesheet = null;
        }
      }
    };
  };

  // ../../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/hook.js
  var styleHookSingleton = function() {
    var sheet = stylesheetSingleton();
    return function(styles, isDynamic) {
      useEffect(function() {
        sheet.add(styles);
        return function() {
          sheet.remove();
        };
      }, [styles && isDynamic]);
    };
  };

  // ../../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/component.js
  var styleSingleton = function() {
    var useStyle = styleHookSingleton();
    var Sheet2 = function(_a) {
      var styles = _a.styles, dynamic = _a.dynamic;
      useStyle(styles, dynamic);
      return null;
    };
    return Sheet2;
  };

  // ../../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/utils.js
  var zeroGap = {
    left: 0,
    top: 0,
    right: 0,
    gap: 0
  };
  var parse = function(x) {
    return parseInt(x || "", 10) || 0;
  };
  var getOffset = function(gapMode) {
    var cs = window.getComputedStyle(document.body);
    var left = cs[gapMode === "padding" ? "paddingLeft" : "marginLeft"];
    var top = cs[gapMode === "padding" ? "paddingTop" : "marginTop"];
    var right = cs[gapMode === "padding" ? "paddingRight" : "marginRight"];
    return [parse(left), parse(top), parse(right)];
  };
  var getGapWidth = function(gapMode) {
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    if (typeof window === "undefined") {
      return zeroGap;
    }
    var offsets = getOffset(gapMode);
    var documentWidth = document.documentElement.clientWidth;
    var windowWidth = window.innerWidth;
    return {
      left: offsets[0],
      top: offsets[1],
      right: offsets[2],
      gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0])
    };
  };

  // ../../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  var Style = styleSingleton();
  var lockAttribute = "data-scroll-locked";
  var getStyles = function(_a, allowRelative, gapMode, important) {
    var left = _a.left, top = _a.top, right = _a.right, gap = _a.gap;
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    return "\n  .".concat(noScrollbarsClassName, " {\n   overflow: hidden ").concat(important, ";\n   padding-right: ").concat(gap, "px ").concat(important, ";\n  }\n  body[").concat(lockAttribute, "] {\n    overflow: hidden ").concat(important, ";\n    overscroll-behavior: contain;\n    ").concat([
      allowRelative && "position: relative ".concat(important, ";"),
      gapMode === "margin" && "\n    padding-left: ".concat(left, "px;\n    padding-top: ").concat(top, "px;\n    padding-right: ").concat(right, "px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ").concat(gap, "px ").concat(important, ";\n    "),
      gapMode === "padding" && "padding-right: ".concat(gap, "px ").concat(important, ";")
    ].filter(Boolean).join(""), "\n  }\n  \n  .").concat(zeroRightClassName, " {\n    right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " {\n    margin-right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(zeroRightClassName, " .").concat(zeroRightClassName, " {\n    right: 0 ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " .").concat(fullWidthClassName, " {\n    margin-right: 0 ").concat(important, ";\n  }\n  \n  body[").concat(lockAttribute, "] {\n    ").concat(removedBarSizeVariable, ": ").concat(gap, "px;\n  }\n");
  };
  var getCurrentUseCounter = function() {
    var counter = parseInt(document.body.getAttribute(lockAttribute) || "0", 10);
    return isFinite(counter) ? counter : 0;
  };
  var useLockAttribute = function() {
    useEffect(function() {
      document.body.setAttribute(lockAttribute, (getCurrentUseCounter() + 1).toString());
      return function() {
        var newCounter = getCurrentUseCounter() - 1;
        if (newCounter <= 0) {
          document.body.removeAttribute(lockAttribute);
        } else {
          document.body.setAttribute(lockAttribute, newCounter.toString());
        }
      };
    }, []);
  };
  var RemoveScrollBar = function(_a) {
    var noRelative = _a.noRelative, noImportant = _a.noImportant, _b = _a.gapMode, gapMode = _b === void 0 ? "margin" : _b;
    useLockAttribute();
    var gap = useMemo(function() {
      return getGapWidth(gapMode);
    }, [gapMode]);
    return createElement(Style, { styles: getStyles(gap, !noRelative, gapMode, !noImportant ? "!important" : "") });
  };

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/aggresiveCapture.js
  var passiveSupported = false;
  if (typeof window !== "undefined") {
    try {
      options = Object.defineProperty({}, "passive", {
        get: function() {
          passiveSupported = true;
          return true;
        }
      });
      window.addEventListener("test", options, options);
      window.removeEventListener("test", options, options);
    } catch (err) {
      passiveSupported = false;
    }
  }
  var options;
  var nonPassive = passiveSupported ? { passive: false } : false;

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/handleScroll.js
  var alwaysContainsScroll = function(node) {
    return node.tagName === "TEXTAREA";
  };
  var elementCanBeScrolled = function(node, overflow) {
    if (!(node instanceof Element)) {
      return false;
    }
    var styles = window.getComputedStyle(node);
    return (
      // not-not-scrollable
      styles[overflow] !== "hidden" && // contains scroll inside self
      !(styles.overflowY === styles.overflowX && !alwaysContainsScroll(node) && styles[overflow] === "visible")
    );
  };
  var elementCouldBeVScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowY");
  };
  var elementCouldBeHScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowX");
  };
  var locationCouldBeScrolled = function(axis, node) {
    var ownerDocument = node.ownerDocument;
    var current = node;
    do {
      if (typeof ShadowRoot !== "undefined" && current instanceof ShadowRoot) {
        current = current.host;
      }
      var isScrollable = elementCouldBeScrolled(axis, current);
      if (isScrollable) {
        var _a = getScrollVariables(axis, current), scrollHeight = _a[1], clientHeight = _a[2];
        if (scrollHeight > clientHeight) {
          return true;
        }
      }
      current = current.parentNode;
    } while (current && current !== ownerDocument.body);
    return false;
  };
  var getVScrollVariables = function(_a) {
    var scrollTop = _a.scrollTop, scrollHeight = _a.scrollHeight, clientHeight = _a.clientHeight;
    return [
      scrollTop,
      scrollHeight,
      clientHeight
    ];
  };
  var getHScrollVariables = function(_a) {
    var scrollLeft = _a.scrollLeft, scrollWidth = _a.scrollWidth, clientWidth = _a.clientWidth;
    return [
      scrollLeft,
      scrollWidth,
      clientWidth
    ];
  };
  var elementCouldBeScrolled = function(axis, node) {
    return axis === "v" ? elementCouldBeVScrolled(node) : elementCouldBeHScrolled(node);
  };
  var getScrollVariables = function(axis, node) {
    return axis === "v" ? getVScrollVariables(node) : getHScrollVariables(node);
  };
  var getDirectionFactor = function(axis, direction) {
    return axis === "h" && direction === "rtl" ? -1 : 1;
  };
  var handleScroll = function(axis, endTarget, event, sourceDelta, noOverscroll) {
    var directionFactor = getDirectionFactor(axis, window.getComputedStyle(endTarget).direction);
    var delta = directionFactor * sourceDelta;
    var target = event.target;
    var targetInLock = endTarget.contains(target);
    var shouldCancelScroll = false;
    var isDeltaPositive = delta > 0;
    var availableScroll = 0;
    var availableScrollTop = 0;
    do {
      if (!target) {
        break;
      }
      var _a = getScrollVariables(axis, target), position = _a[0], scroll_1 = _a[1], capacity = _a[2];
      var elementScroll = scroll_1 - capacity - directionFactor * position;
      if (position || elementScroll) {
        if (elementCouldBeScrolled(axis, target)) {
          availableScroll += elementScroll;
          availableScrollTop += position;
        }
      }
      var parent_1 = target.parentNode;
      target = parent_1 && parent_1.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent_1.host : parent_1;
    } while (
      // portaled content
      !targetInLock && target !== document.body || // self content
      targetInLock && (endTarget.contains(target) || endTarget === target)
    );
    if (isDeltaPositive && (noOverscroll && Math.abs(availableScroll) < 1 || !noOverscroll && delta > availableScroll)) {
      shouldCancelScroll = true;
    } else if (!isDeltaPositive && (noOverscroll && Math.abs(availableScrollTop) < 1 || !noOverscroll && -delta > availableScrollTop)) {
      shouldCancelScroll = true;
    }
    return shouldCancelScroll;
  };

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
  var getTouchXY = function(event) {
    return "changedTouches" in event ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
  };
  var getDeltaXY = function(event) {
    return [event.deltaX, event.deltaY];
  };
  var extractRef = function(ref) {
    return ref && "current" in ref ? ref.current : ref;
  };
  var deltaCompare = function(x, y) {
    return x[0] === y[0] && x[1] === y[1];
  };
  var generateStyle = function(id) {
    return "\n  .block-interactivity-".concat(id, " {pointer-events: none;}\n  .allow-interactivity-").concat(id, " {pointer-events: all;}\n");
  };
  var idCounter = 0;
  var lockStack = [];
  function RemoveScrollSideCar(props) {
    var shouldPreventQueue = useRef([]);
    var touchStartRef = useRef([0, 0]);
    var activeAxis = useRef();
    var id = useState(idCounter++)[0];
    var Style2 = useState(styleSingleton)[0];
    var lastProps = useRef(props);
    useEffect(function() {
      lastProps.current = props;
    }, [props]);
    useEffect(function() {
      if (props.inert) {
        document.body.classList.add("block-interactivity-".concat(id));
        var allow_1 = __spreadArray([props.lockRef.current], (props.shards || []).map(extractRef), true).filter(Boolean);
        allow_1.forEach(function(el) {
          return el.classList.add("allow-interactivity-".concat(id));
        });
        return function() {
          document.body.classList.remove("block-interactivity-".concat(id));
          allow_1.forEach(function(el) {
            return el.classList.remove("allow-interactivity-".concat(id));
          });
        };
      }
      return;
    }, [props.inert, props.lockRef.current, props.shards]);
    var shouldCancelEvent = useCallback(function(event, parent) {
      if ("touches" in event && event.touches.length === 2 || event.type === "wheel" && event.ctrlKey) {
        return !lastProps.current.allowPinchZoom;
      }
      var touch = getTouchXY(event);
      var touchStart = touchStartRef.current;
      var deltaX = "deltaX" in event ? event.deltaX : touchStart[0] - touch[0];
      var deltaY = "deltaY" in event ? event.deltaY : touchStart[1] - touch[1];
      var currentAxis;
      var target = event.target;
      var moveDirection = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      if ("touches" in event && moveDirection === "h" && target.type === "range") {
        return false;
      }
      var selection = window.getSelection();
      var anchorNode = selection && selection.anchorNode;
      var isTouchingSelection = anchorNode ? anchorNode === target || anchorNode.contains(target) : false;
      if (isTouchingSelection) {
        return false;
      }
      var canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      if (!canBeScrolledInMainDirection) {
        return true;
      }
      if (canBeScrolledInMainDirection) {
        currentAxis = moveDirection;
      } else {
        currentAxis = moveDirection === "v" ? "h" : "v";
        canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      }
      if (!canBeScrolledInMainDirection) {
        return false;
      }
      if (!activeAxis.current && "changedTouches" in event && (deltaX || deltaY)) {
        activeAxis.current = currentAxis;
      }
      if (!currentAxis) {
        return true;
      }
      var cancelingAxis = activeAxis.current || currentAxis;
      return handleScroll(cancelingAxis, parent, event, cancelingAxis === "h" ? deltaX : deltaY, true);
    }, []);
    var shouldPrevent = useCallback(function(_event) {
      var event = _event;
      if (!lockStack.length || lockStack[lockStack.length - 1] !== Style2) {
        return;
      }
      var delta = "deltaY" in event ? getDeltaXY(event) : getTouchXY(event);
      var sourceEvent = shouldPreventQueue.current.filter(function(e) {
        return e.name === event.type && (e.target === event.target || event.target === e.shadowParent) && deltaCompare(e.delta, delta);
      })[0];
      if (sourceEvent && sourceEvent.should) {
        if (event.cancelable) {
          event.preventDefault();
        }
        return;
      }
      if (!sourceEvent) {
        var shardNodes = (lastProps.current.shards || []).map(extractRef).filter(Boolean).filter(function(node) {
          return node.contains(event.target);
        });
        var shouldStop = shardNodes.length > 0 ? shouldCancelEvent(event, shardNodes[0]) : !lastProps.current.noIsolation;
        if (shouldStop) {
          if (event.cancelable) {
            event.preventDefault();
          }
        }
      }
    }, []);
    var shouldCancel = useCallback(function(name, delta, target, should) {
      var event = { name, delta, target, should, shadowParent: getOutermostShadowParent(target) };
      shouldPreventQueue.current.push(event);
      setTimeout(function() {
        shouldPreventQueue.current = shouldPreventQueue.current.filter(function(e) {
          return e !== event;
        });
      }, 1);
    }, []);
    var scrollTouchStart = useCallback(function(event) {
      touchStartRef.current = getTouchXY(event);
      activeAxis.current = void 0;
    }, []);
    var scrollWheel = useCallback(function(event) {
      shouldCancel(event.type, getDeltaXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    var scrollTouchMove = useCallback(function(event) {
      shouldCancel(event.type, getTouchXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    useEffect(function() {
      lockStack.push(Style2);
      props.setCallbacks({
        onScrollCapture: scrollWheel,
        onWheelCapture: scrollWheel,
        onTouchMoveCapture: scrollTouchMove
      });
      document.addEventListener("wheel", shouldPrevent, nonPassive);
      document.addEventListener("touchmove", shouldPrevent, nonPassive);
      document.addEventListener("touchstart", scrollTouchStart, nonPassive);
      return function() {
        lockStack = lockStack.filter(function(inst) {
          return inst !== Style2;
        });
        document.removeEventListener("wheel", shouldPrevent, nonPassive);
        document.removeEventListener("touchmove", shouldPrevent, nonPassive);
        document.removeEventListener("touchstart", scrollTouchStart, nonPassive);
      };
    }, []);
    var removeScrollBar = props.removeScrollBar, inert = props.inert;
    return createElement(
      Fragment,
      null,
      inert ? createElement(Style2, { styles: generateStyle(id) }) : null,
      removeScrollBar ? createElement(RemoveScrollBar, { noRelative: props.noRelative, gapMode: props.gapMode }) : null
    );
  }
  function getOutermostShadowParent(node) {
    var shadowParent = null;
    while (node !== null) {
      if (node instanceof ShadowRoot) {
        shadowParent = node.host;
        node = node.host;
      }
      node = node.parentNode;
    }
    return shadowParent;
  }

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  var sidecar_default = exportSidecar(effectCar, RemoveScrollSideCar);

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var ReactRemoveScroll = forwardRef(function(props, ref) {
    return createElement(RemoveScroll, __assign({}, props, { ref, sideCar: sidecar_default }));
  });
  ReactRemoveScroll.classNames = RemoveScroll.classNames;
  var Combination_default = ReactRemoveScroll;

  // ../../../node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js
  var getDefaultParent = function(originalTarget) {
    if (typeof document === "undefined") {
      return null;
    }
    var sampleTarget = Array.isArray(originalTarget) ? originalTarget[0] : originalTarget;
    return sampleTarget.ownerDocument.body;
  };
  var counterMap = /* @__PURE__ */ new WeakMap();
  var uncontrolledNodes = /* @__PURE__ */ new WeakMap();
  var markerMap = {};
  var lockCount = 0;
  var unwrapHost = function(node) {
    return node && (node.host || unwrapHost(node.parentNode));
  };
  var correctTargets = function(parent, targets) {
    return targets.map(function(target) {
      if (parent.contains(target)) {
        return target;
      }
      var correctedTarget = unwrapHost(target);
      if (correctedTarget && parent.contains(correctedTarget)) {
        return correctedTarget;
      }
      console.error("aria-hidden", target, "in not contained inside", parent, ". Doing nothing");
      return null;
    }).filter(function(x) {
      return Boolean(x);
    });
  };
  var applyAttributeToOthers = function(originalTarget, parentNode, markerName, controlAttribute) {
    var targets = correctTargets(parentNode, Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    if (!markerMap[markerName]) {
      markerMap[markerName] = /* @__PURE__ */ new WeakMap();
    }
    var markerCounter = markerMap[markerName];
    var hiddenNodes = [];
    var elementsToKeep = /* @__PURE__ */ new Set();
    var elementsToStop = new Set(targets);
    var keep = function(el) {
      if (!el || elementsToKeep.has(el)) {
        return;
      }
      elementsToKeep.add(el);
      keep(el.parentNode);
    };
    targets.forEach(keep);
    var deep = function(parent) {
      if (!parent || elementsToStop.has(parent)) {
        return;
      }
      Array.prototype.forEach.call(parent.children, function(node) {
        if (elementsToKeep.has(node)) {
          deep(node);
        } else {
          try {
            var attr = node.getAttribute(controlAttribute);
            var alreadyHidden = attr !== null && attr !== "false";
            var counterValue = (counterMap.get(node) || 0) + 1;
            var markerValue = (markerCounter.get(node) || 0) + 1;
            counterMap.set(node, counterValue);
            markerCounter.set(node, markerValue);
            hiddenNodes.push(node);
            if (counterValue === 1 && alreadyHidden) {
              uncontrolledNodes.set(node, true);
            }
            if (markerValue === 1) {
              node.setAttribute(markerName, "true");
            }
            if (!alreadyHidden) {
              node.setAttribute(controlAttribute, "true");
            }
          } catch (e) {
            console.error("aria-hidden: cannot operate on ", node, e);
          }
        }
      });
    };
    deep(parentNode);
    elementsToKeep.clear();
    lockCount++;
    return function() {
      hiddenNodes.forEach(function(node) {
        var counterValue = counterMap.get(node) - 1;
        var markerValue = markerCounter.get(node) - 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        if (!counterValue) {
          if (!uncontrolledNodes.has(node)) {
            node.removeAttribute(controlAttribute);
          }
          uncontrolledNodes.delete(node);
        }
        if (!markerValue) {
          node.removeAttribute(markerName);
        }
      });
      lockCount--;
      if (!lockCount) {
        counterMap = /* @__PURE__ */ new WeakMap();
        counterMap = /* @__PURE__ */ new WeakMap();
        uncontrolledNodes = /* @__PURE__ */ new WeakMap();
        markerMap = {};
      }
    };
  };
  var hideOthers = function(originalTarget, parentNode, markerName) {
    if (markerName === void 0) {
      markerName = "data-aria-hidden";
    }
    var targets = Array.from(Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    var activeParentNode = parentNode || getDefaultParent(originalTarget);
    if (!activeParentNode) {
      return function() {
        return null;
      };
    }
    targets.push.apply(targets, Array.from(activeParentNode.querySelectorAll("[aria-live], script")));
    return applyAttributeToOthers(targets, activeParentNode, markerName, "aria-hidden");
  };

  // ../../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.16_@types+react-dom@18.3.7_@types+react@18.3.31__@types+reac_ef5419b1d5914b6ed85fc377af02cd8c/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var DIALOG_NAME = "Dialog";
  var [createDialogContext, createDialogScope] = createContextScope(DIALOG_NAME);
  var [DialogProvider, useDialogContext] = createDialogContext(DIALOG_NAME);
  var Dialog = (props) => {
    const {
      __scopeDialog,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const triggerRef = useRef(null);
    const contentRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DIALOG_NAME
    });
    return /* @__PURE__ */ jsx(
      DialogProvider,
      {
        scope: __scopeDialog,
        triggerRef,
        contentRef,
        contentId: useId2(),
        titleId: useId2(),
        descriptionId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children
      }
    );
  };
  Dialog.displayName = DIALOG_NAME;
  var TRIGGER_NAME2 = "DialogTrigger";
  var DialogTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...triggerProps } = props;
      const context = useDialogContext(TRIGGER_NAME2, __scopeDialog);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState2(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
    }
  );
  DialogTrigger.displayName = TRIGGER_NAME2;
  var PORTAL_NAME2 = "DialogPortal";
  var [PortalProvider, usePortalContext] = createDialogContext(PORTAL_NAME2, {
    forceMount: void 0
  });
  var DialogPortal = (props) => {
    const { __scopeDialog, forceMount, children, container } = props;
    const context = useDialogContext(PORTAL_NAME2, __scopeDialog);
    return /* @__PURE__ */ jsx(PortalProvider, { scope: __scopeDialog, forceMount, children: Children.map(children, (child) => /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children: child }) })) });
  };
  DialogPortal.displayName = PORTAL_NAME2;
  var OVERLAY_NAME = "DialogOverlay";
  var DialogOverlay = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext(OVERLAY_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, props.__scopeDialog);
      return context.modal ? /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(DialogOverlayImpl, { ...overlayProps, ref: forwardedRef }) }) : null;
    }
  );
  DialogOverlay.displayName = OVERLAY_NAME;
  var Slot2 = createSlot("DialogOverlay.RemoveScroll");
  var DialogOverlayImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, __scopeDialog);
      return (
        // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
        // ie. when `Overlay` and `Content` are siblings
        /* @__PURE__ */ jsx(Combination_default, { as: Slot2, allowPinchZoom: true, shards: [context.contentRef], children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-state": getState2(context.open),
            ...overlayProps,
            ref: forwardedRef,
            style: { pointerEvents: "auto", ...overlayProps.style }
          }
        ) })
      );
    }
  );
  var CONTENT_NAME = "DialogContent";
  var DialogContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext(CONTENT_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ jsx(DialogContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(DialogContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }
  );
  DialogContent.displayName = CONTENT_NAME;
  var DialogContentModal = forwardRef(
    (props, forwardedRef) => {
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, context.contentRef, contentRef);
      useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        DialogContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers(props.onPointerDownOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (isRightClick) event.preventDefault();
          }),
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault()
          )
        }
      );
    }
  );
  var DialogContentNonModal = forwardRef(
    (props, forwardedRef) => {
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      const hasInteractedOutsideRef = useRef(false);
      const hasPointerDownOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        DialogContentImpl,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }
  );
  var DialogContentImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME, __scopeDialog);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef);
      useFocusGuards();
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          FocusScope,
          {
            asChild: true,
            loop: true,
            trapped: trapFocus,
            onMountAutoFocus: onOpenAutoFocus,
            onUnmountAutoFocus: onCloseAutoFocus,
            children: /* @__PURE__ */ jsx(
              DismissableLayer,
              {
                role: "dialog",
                id: context.contentId,
                "aria-describedby": context.descriptionId,
                "aria-labelledby": context.titleId,
                "data-state": getState2(context.open),
                ...contentProps,
                ref: composedRefs,
                onDismiss: () => context.onOpenChange(false)
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs(Fragment2, { children: [
          /* @__PURE__ */ jsx(TitleWarning, { titleId: context.titleId }),
          /* @__PURE__ */ jsx(DescriptionWarning, { contentRef, descriptionId: context.descriptionId })
        ] })
      ] });
    }
  );
  var TITLE_NAME = "DialogTitle";
  var DialogTitle = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...titleProps } = props;
      const context = useDialogContext(TITLE_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive.h2, { id: context.titleId, ...titleProps, ref: forwardedRef });
    }
  );
  DialogTitle.displayName = TITLE_NAME;
  var DESCRIPTION_NAME = "DialogDescription";
  var DialogDescription = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...descriptionProps } = props;
      const context = useDialogContext(DESCRIPTION_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive.p, { id: context.descriptionId, ...descriptionProps, ref: forwardedRef });
    }
  );
  DialogDescription.displayName = DESCRIPTION_NAME;
  var CLOSE_NAME = "DialogClose";
  var DialogClose = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...closeProps } = props;
      const context = useDialogContext(CLOSE_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, () => context.onOpenChange(false))
        }
      );
    }
  );
  DialogClose.displayName = CLOSE_NAME;
  function getState2(open) {
    return open ? "open" : "closed";
  }
  var TITLE_WARNING_NAME = "DialogTitleWarning";
  var [WarningProvider, useWarningContext] = createContext2(TITLE_WARNING_NAME, {
    contentName: CONTENT_NAME,
    titleName: TITLE_NAME,
    docsSlug: "dialog"
  });
  var TitleWarning = ({ titleId }) => {
    const titleWarningContext = useWarningContext(TITLE_WARNING_NAME);
    const MESSAGE = `\`${titleWarningContext.contentName}\` requires a \`${titleWarningContext.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${titleWarningContext.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${titleWarningContext.docsSlug}`;
    useEffect(() => {
      if (titleId) {
        const hasTitle = document.getElementById(titleId);
        if (!hasTitle) console.error(MESSAGE);
      }
    }, [MESSAGE, titleId]);
    return null;
  };
  var DESCRIPTION_WARNING_NAME = "DialogDescriptionWarning";
  var DescriptionWarning = ({ contentRef, descriptionId }) => {
    const descriptionWarningContext = useWarningContext(DESCRIPTION_WARNING_NAME);
    const MESSAGE = `Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${descriptionWarningContext.contentName}}.`;
    useEffect(() => {
      const describedById = contentRef.current?.getAttribute("aria-describedby");
      if (descriptionId && describedById) {
        const hasDescription = document.getElementById(descriptionId);
        if (!hasDescription) console.warn(MESSAGE);
      }
    }, [MESSAGE, contentRef, descriptionId]);
    return null;
  };
  var Root = Dialog;
  var Portal2 = DialogPortal;
  var Overlay = DialogOverlay;
  var Content = DialogContent;
  var Title = DialogTitle;
  var Description = DialogDescription;
  var Close = DialogClose;

  // ../../../node_modules/.pnpm/cmdk@1.1.1_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react@18.3.31_react-dom_97e75a3ab323022d7998e58a36c32fb5/node_modules/cmdk/dist/index.mjs
  var N = '[cmdk-group=""]';
  var Y2 = '[cmdk-group-items=""]';
  var be = '[cmdk-group-heading=""]';
  var le = '[cmdk-item=""]';
  var ce = `${le}:not([aria-disabled="true"])`;
  var Z = "cmdk-item-select";
  var T = "data-value";
  var Re = (r2, o, n) => W(r2, o, n);
  var ue = createContext(void 0);
  var K2 = () => useContext(ue);
  var de = createContext(void 0);
  var ee = () => useContext(de);
  var fe = createContext(void 0);
  var me = forwardRef((r2, o) => {
    let n = L(() => {
      var e, a;
      return { search: "", value: (a = (e = r2.value) != null ? e : r2.defaultValue) != null ? a : "", selectedItemId: void 0, filtered: { count: 0, items: /* @__PURE__ */ new Map(), groups: /* @__PURE__ */ new Set() } };
    }), u2 = L(() => /* @__PURE__ */ new Set()), c = L(() => /* @__PURE__ */ new Map()), d = L(() => /* @__PURE__ */ new Map()), f = L(() => /* @__PURE__ */ new Set()), p2 = pe(r2), { label: b, children: m2, value: R, onValueChange: x, filter: C, shouldFilter: S, loop: A, disablePointerSelection: ge = false, vimBindings: j = true, ...O } = r2, $2 = useId2(), q = useId2(), _ = useId2(), I = useRef(null), v = ke();
    k2(() => {
      if (R !== void 0) {
        let e = R.trim();
        n.current.value = e, E.emit();
      }
    }, [R]), k2(() => {
      v(6, ne);
    }, []);
    let E = useMemo(() => ({ subscribe: (e) => (f.current.add(e), () => f.current.delete(e)), snapshot: () => n.current, setState: (e, a, s) => {
      var i, l, g, y;
      if (!Object.is(n.current[e], a)) {
        if (n.current[e] = a, e === "search") J2(), z(), v(1, W2);
        else if (e === "value") {
          if (document.activeElement.hasAttribute("cmdk-input") || document.activeElement.hasAttribute("cmdk-root")) {
            let h = document.getElementById(_);
            h ? h.focus() : (i = document.getElementById($2)) == null || i.focus();
          }
          if (v(7, () => {
            var h;
            n.current.selectedItemId = (h = M()) == null ? void 0 : h.id, E.emit();
          }), s || v(5, ne), ((l = p2.current) == null ? void 0 : l.value) !== void 0) {
            let h = a != null ? a : "";
            (y = (g = p2.current).onValueChange) == null || y.call(g, h);
            return;
          }
        }
        E.emit();
      }
    }, emit: () => {
      f.current.forEach((e) => e());
    } }), []), U2 = useMemo(() => ({ value: (e, a, s) => {
      var i;
      a !== ((i = d.current.get(e)) == null ? void 0 : i.value) && (d.current.set(e, { value: a, keywords: s }), n.current.filtered.items.set(e, te(a, s)), v(2, () => {
        z(), E.emit();
      }));
    }, item: (e, a) => (u2.current.add(e), a && (c.current.has(a) ? c.current.get(a).add(e) : c.current.set(a, /* @__PURE__ */ new Set([e]))), v(3, () => {
      J2(), z(), n.current.value || W2(), E.emit();
    }), () => {
      d.current.delete(e), u2.current.delete(e), n.current.filtered.items.delete(e);
      let s = M();
      v(4, () => {
        J2(), (s == null ? void 0 : s.getAttribute("id")) === e && W2(), E.emit();
      });
    }), group: (e) => (c.current.has(e) || c.current.set(e, /* @__PURE__ */ new Set()), () => {
      d.current.delete(e), c.current.delete(e);
    }), filter: () => p2.current.shouldFilter, label: b || r2["aria-label"], getDisablePointerSelection: () => p2.current.disablePointerSelection, listId: $2, inputId: _, labelId: q, listInnerRef: I }), []);
    function te(e, a) {
      var i, l;
      let s = (l = (i = p2.current) == null ? void 0 : i.filter) != null ? l : Re;
      return e ? s(e, n.current.search, a) : 0;
    }
    function z() {
      if (!n.current.search || p2.current.shouldFilter === false) return;
      let e = n.current.filtered.items, a = [];
      n.current.filtered.groups.forEach((i) => {
        let l = c.current.get(i), g = 0;
        l.forEach((y) => {
          let h = e.get(y);
          g = Math.max(h, g);
        }), a.push([i, g]);
      });
      let s = I.current;
      V().sort((i, l) => {
        var h, F;
        let g = i.getAttribute("id"), y = l.getAttribute("id");
        return ((h = e.get(y)) != null ? h : 0) - ((F = e.get(g)) != null ? F : 0);
      }).forEach((i) => {
        let l = i.closest(Y2);
        l ? l.appendChild(i.parentElement === l ? i : i.closest(`${Y2} > *`)) : s.appendChild(i.parentElement === s ? i : i.closest(`${Y2} > *`));
      }), a.sort((i, l) => l[1] - i[1]).forEach((i) => {
        var g;
        let l = (g = I.current) == null ? void 0 : g.querySelector(`${N}[${T}="${encodeURIComponent(i[0])}"]`);
        l == null || l.parentElement.appendChild(l);
      });
    }
    function W2() {
      let e = V().find((s) => s.getAttribute("aria-disabled") !== "true"), a = e == null ? void 0 : e.getAttribute(T);
      E.setState("value", a || void 0);
    }
    function J2() {
      var a, s, i, l;
      if (!n.current.search || p2.current.shouldFilter === false) {
        n.current.filtered.count = u2.current.size;
        return;
      }
      n.current.filtered.groups = /* @__PURE__ */ new Set();
      let e = 0;
      for (let g of u2.current) {
        let y = (s = (a = d.current.get(g)) == null ? void 0 : a.value) != null ? s : "", h = (l = (i = d.current.get(g)) == null ? void 0 : i.keywords) != null ? l : [], F = te(y, h);
        n.current.filtered.items.set(g, F), F > 0 && e++;
      }
      for (let [g, y] of c.current) for (let h of y) if (n.current.filtered.items.get(h) > 0) {
        n.current.filtered.groups.add(g);
        break;
      }
      n.current.filtered.count = e;
    }
    function ne() {
      var a, s, i;
      let e = M();
      e && (((a = e.parentElement) == null ? void 0 : a.firstChild) === e && ((i = (s = e.closest(N)) == null ? void 0 : s.querySelector(be)) == null || i.scrollIntoView({ block: "nearest" })), e.scrollIntoView({ block: "nearest" }));
    }
    function M() {
      var e;
      return (e = I.current) == null ? void 0 : e.querySelector(`${le}[aria-selected="true"]`);
    }
    function V() {
      var e;
      return Array.from(((e = I.current) == null ? void 0 : e.querySelectorAll(ce)) || []);
    }
    function X3(e) {
      let s = V()[e];
      s && E.setState("value", s.getAttribute(T));
    }
    function Q(e) {
      var g;
      let a = M(), s = V(), i = s.findIndex((y) => y === a), l = s[i + e];
      (g = p2.current) != null && g.loop && (l = i + e < 0 ? s[s.length - 1] : i + e === s.length ? s[0] : s[i + e]), l && E.setState("value", l.getAttribute(T));
    }
    function re(e) {
      let a = M(), s = a == null ? void 0 : a.closest(N), i;
      for (; s && !i; ) s = e > 0 ? we(s, N) : De(s, N), i = s == null ? void 0 : s.querySelector(ce);
      i ? E.setState("value", i.getAttribute(T)) : Q(e);
    }
    let oe = () => X3(V().length - 1), ie = (e) => {
      e.preventDefault(), e.metaKey ? oe() : e.altKey ? re(1) : Q(1);
    }, se = (e) => {
      e.preventDefault(), e.metaKey ? X3(0) : e.altKey ? re(-1) : Q(-1);
    };
    return createElement(Primitive.div, { ref: o, tabIndex: -1, ...O, "cmdk-root": "", onKeyDown: (e) => {
      var s;
      (s = O.onKeyDown) == null || s.call(O, e);
      let a = e.nativeEvent.isComposing || e.keyCode === 229;
      if (!(e.defaultPrevented || a)) switch (e.key) {
        case "n":
        case "j": {
          j && e.ctrlKey && ie(e);
          break;
        }
        case "ArrowDown": {
          ie(e);
          break;
        }
        case "p":
        case "k": {
          j && e.ctrlKey && se(e);
          break;
        }
        case "ArrowUp": {
          se(e);
          break;
        }
        case "Home": {
          e.preventDefault(), X3(0);
          break;
        }
        case "End": {
          e.preventDefault(), oe();
          break;
        }
        case "Enter": {
          e.preventDefault();
          let i = M();
          if (i) {
            let l = new Event(Z);
            i.dispatchEvent(l);
          }
        }
      }
    } }, createElement("label", { "cmdk-label": "", htmlFor: U2.inputId, id: U2.labelId, style: Te }, b), B2(r2, (e) => createElement(de.Provider, { value: E }, createElement(ue.Provider, { value: U2 }, e))));
  });
  var he = forwardRef((r2, o) => {
    var _, I;
    let n = useId2(), u2 = useRef(null), c = useContext(fe), d = K2(), f = pe(r2), p2 = (I = (_ = f.current) == null ? void 0 : _.forceMount) != null ? I : c == null ? void 0 : c.forceMount;
    k2(() => {
      if (!p2) return d.item(n, c == null ? void 0 : c.id);
    }, [p2]);
    let b = ve(n, u2, [r2.value, r2.children, u2], r2.keywords), m2 = ee(), R = P((v) => v.value && v.value === b.current), x = P((v) => p2 || d.filter() === false ? true : v.search ? v.filtered.items.get(n) > 0 : true);
    useEffect(() => {
      let v = u2.current;
      if (!(!v || r2.disabled)) return v.addEventListener(Z, C), () => v.removeEventListener(Z, C);
    }, [x, r2.onSelect, r2.disabled]);
    function C() {
      var v, E;
      S(), (E = (v = f.current).onSelect) == null || E.call(v, b.current);
    }
    function S() {
      m2.setState("value", b.current, true);
    }
    if (!x) return null;
    let { disabled: A, value: ge, onSelect: j, forceMount: O, keywords: $2, ...q } = r2;
    return createElement(Primitive.div, { ref: composeRefs(u2, o), ...q, id: n, "cmdk-item": "", role: "option", "aria-disabled": !!A, "aria-selected": !!R, "data-disabled": !!A, "data-selected": !!R, onPointerMove: A || d.getDisablePointerSelection() ? void 0 : S, onClick: A ? void 0 : C }, r2.children);
  });
  var Ee = forwardRef((r2, o) => {
    let { heading: n, children: u2, forceMount: c, ...d } = r2, f = useId2(), p2 = useRef(null), b = useRef(null), m2 = useId2(), R = K2(), x = P((S) => c || R.filter() === false ? true : S.search ? S.filtered.groups.has(f) : true);
    k2(() => R.group(f), []), ve(f, p2, [r2.value, r2.heading, b]);
    let C = useMemo(() => ({ id: f, forceMount: c }), [c]);
    return createElement(Primitive.div, { ref: composeRefs(p2, o), ...d, "cmdk-group": "", role: "presentation", hidden: x ? void 0 : true }, n && createElement("div", { ref: b, "cmdk-group-heading": "", "aria-hidden": true, id: m2 }, n), B2(r2, (S) => createElement("div", { "cmdk-group-items": "", role: "group", "aria-labelledby": n ? m2 : void 0 }, createElement(fe.Provider, { value: C }, S))));
  });
  var ye = forwardRef((r2, o) => {
    let { alwaysRender: n, ...u2 } = r2, c = useRef(null), d = P((f) => !f.search);
    return !n && !d ? null : createElement(Primitive.div, { ref: composeRefs(c, o), ...u2, "cmdk-separator": "", role: "separator" });
  });
  var Se = forwardRef((r2, o) => {
    let { onValueChange: n, ...u2 } = r2, c = r2.value != null, d = ee(), f = P((m2) => m2.search), p2 = P((m2) => m2.selectedItemId), b = K2();
    return useEffect(() => {
      r2.value != null && d.setState("search", r2.value);
    }, [r2.value]), createElement(Primitive.input, { ref: o, ...u2, "cmdk-input": "", autoComplete: "off", autoCorrect: "off", spellCheck: false, "aria-autocomplete": "list", role: "combobox", "aria-expanded": true, "aria-controls": b.listId, "aria-labelledby": b.labelId, "aria-activedescendant": p2, id: b.inputId, type: "text", value: c ? r2.value : f, onChange: (m2) => {
      c || d.setState("search", m2.target.value), n == null || n(m2.target.value);
    } });
  });
  var Ce = forwardRef((r2, o) => {
    let { children: n, label: u2 = "Suggestions", ...c } = r2, d = useRef(null), f = useRef(null), p2 = P((m2) => m2.selectedItemId), b = K2();
    return useEffect(() => {
      if (f.current && d.current) {
        let m2 = f.current, R = d.current, x, C = new ResizeObserver(() => {
          x = requestAnimationFrame(() => {
            let S = m2.offsetHeight;
            R.style.setProperty("--cmdk-list-height", S.toFixed(1) + "px");
          });
        });
        return C.observe(m2), () => {
          cancelAnimationFrame(x), C.unobserve(m2);
        };
      }
    }, []), createElement(Primitive.div, { ref: composeRefs(d, o), ...c, "cmdk-list": "", role: "listbox", tabIndex: -1, "aria-activedescendant": p2, "aria-label": u2, id: b.listId }, B2(r2, (m2) => createElement("div", { ref: composeRefs(f, b.listInnerRef), "cmdk-list-sizer": "" }, m2)));
  });
  var xe = forwardRef((r2, o) => {
    let { open: n, onOpenChange: u2, overlayClassName: c, contentClassName: d, container: f, ...p2 } = r2;
    return createElement(Root, { open: n, onOpenChange: u2 }, createElement(Portal2, { container: f }, createElement(Overlay, { "cmdk-overlay": "", className: c }), createElement(Content, { "aria-label": r2.label, "cmdk-dialog": "", className: d }, createElement(me, { ref: o, ...p2 }))));
  });
  var Ie = forwardRef((r2, o) => P((u2) => u2.filtered.count === 0) ? createElement(Primitive.div, { ref: o, ...r2, "cmdk-empty": "", role: "presentation" }) : null);
  var Pe = forwardRef((r2, o) => {
    let { progress: n, children: u2, label: c = "Loading...", ...d } = r2;
    return createElement(Primitive.div, { ref: o, ...d, "cmdk-loading": "", role: "progressbar", "aria-valuenow": n, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": c }, B2(r2, (f) => createElement("div", { "aria-hidden": true }, f)));
  });
  var _e = Object.assign(me, { List: Ce, Item: he, Input: Se, Group: Ee, Separator: ye, Dialog: xe, Empty: Ie, Loading: Pe });
  function we(r2, o) {
    let n = r2.nextElementSibling;
    for (; n; ) {
      if (n.matches(o)) return n;
      n = n.nextElementSibling;
    }
  }
  function De(r2, o) {
    let n = r2.previousElementSibling;
    for (; n; ) {
      if (n.matches(o)) return n;
      n = n.previousElementSibling;
    }
  }
  function pe(r2) {
    let o = useRef(r2);
    return k2(() => {
      o.current = r2;
    }), o;
  }
  var k2 = typeof window == "undefined" ? useEffect : useLayoutEffect;
  function L(r2) {
    let o = useRef();
    return o.current === void 0 && (o.current = r2()), o;
  }
  function P(r2) {
    let o = ee(), n = () => r2(o.snapshot());
    return useSyncExternalStore(o.subscribe, n, n);
  }
  function ve(r2, o, n, u2 = []) {
    let c = useRef(), d = K2();
    return k2(() => {
      var b;
      let f = (() => {
        var m2;
        for (let R of n) {
          if (typeof R == "string") return R.trim();
          if (typeof R == "object" && "current" in R) return R.current ? (m2 = R.current.textContent) == null ? void 0 : m2.trim() : c.current;
        }
      })(), p2 = u2.map((m2) => m2.trim());
      d.value(r2, f, p2), (b = o.current) == null || b.setAttribute(T, f), c.current = f;
    }), c;
  }
  var ke = () => {
    let [r2, o] = useState(), n = L(() => /* @__PURE__ */ new Map());
    return k2(() => {
      n.current.forEach((u2) => u2()), n.current = /* @__PURE__ */ new Map();
    }, [r2]), (u2, c) => {
      n.current.set(u2, c), o({});
    };
  };
  function Me(r2) {
    let o = r2.type;
    return typeof o == "function" ? o(r2.props) : "render" in o ? o.render(r2.props) : r2;
  }
  function B2({ asChild: r2, children: o }, n) {
    return r2 && isValidElement(o) ? cloneElement(Me(o), { ref: o.ref }, n(o.props.children)) : n(o);
  }
  var Te = { position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: "0" };

  // ../../../packages/shadcn-ui/src/components/command.tsx
  var Command = forwardRef(
    ({ className, ...props }, ref) => createElement(_e, {
      ref,
      className: cn("xps-command", className),
      ...props
    })
  );
  Command.displayName = _e.displayName;
  var CommandInput = forwardRef(
    ({ className, ...props }, ref) => createElement(
      "div",
      { className: "xps-command-input-wrapper", "cmdk-input-wrapper": "" },
      createElement(Search, { className: "xps-icon" }),
      createElement(_e.Input, {
        ref,
        className: cn("xps-command-input", className),
        ...props
      })
    )
  );
  CommandInput.displayName = _e.Input.displayName;
  var CommandList = forwardRef(
    ({ className, ...props }, ref) => createElement(_e.List, {
      ref,
      className: cn("xps-command-list", className),
      ...props
    })
  );
  CommandList.displayName = _e.List.displayName;
  var CommandEmpty = forwardRef(
    ({ className, ...props }, ref) => createElement(_e.Empty, {
      ref,
      className: cn("xps-command-empty", className),
      ...props
    })
  );
  CommandEmpty.displayName = _e.Empty.displayName;
  var CommandGroup = forwardRef(
    ({ className, ...props }, ref) => createElement(_e.Group, {
      ref,
      className: cn("xps-command-group", className),
      ...props
    })
  );
  CommandGroup.displayName = _e.Group.displayName;
  var CommandItem = forwardRef(
    ({ className, ...props }, ref) => createElement(_e.Item, {
      ref,
      className: cn("xps-command-item", className),
      ...props
    })
  );
  CommandItem.displayName = _e.Item.displayName;
  var CommandSeparator = forwardRef(
    ({ className, ...props }, ref) => createElement(_e.Separator, {
      ref,
      className: cn("xps-command-separator", className),
      ...props
    })
  );
  CommandSeparator.displayName = _e.Separator.displayName;

  // ../../../packages/shadcn-ui/src/components/dialog.tsx
  var DialogPortal2 = Portal2;
  var DialogOverlay2 = forwardRef(
    ({ className, ...props }, ref) => createElement(Overlay, {
      ref,
      className: cn("xps-dialog-overlay", className),
      ...props
    })
  );
  DialogOverlay2.displayName = Overlay.displayName;
  var DialogContent2 = forwardRef(
    ({ className, children, showClose = true, ...props }, ref) => createElement(
      DialogPortal2,
      null,
      createElement(DialogOverlay2, null),
      createElement(
        Content,
        {
          ref,
          className: cn("xps-dialog-content", className),
          ...props
        },
        children,
        showClose ? createElement(
          Close,
          {
            className: "xps-dialog-close"
          },
          createElement(X, {
            className: "xps-icon",
            "aria-hidden": "true"
          }),
          createElement("span", { className: "xps-sr-only" }, "Close")
        ) : null
      )
    )
  );
  DialogContent2.displayName = Content.displayName;
  var DialogHeader = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-dialog-header", className),
      ...props
    })
  );
  DialogHeader.displayName = "DialogHeader";
  var DialogFooter = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-dialog-footer", className),
      ...props
    })
  );
  DialogFooter.displayName = "DialogFooter";
  var DialogTitle2 = forwardRef(
    ({ className, ...props }, ref) => createElement(Title, {
      ref,
      className: cn("xps-dialog-title", className),
      ...props
    })
  );
  DialogTitle2.displayName = Title.displayName;
  var DialogDescription2 = forwardRef(
    ({ className, ...props }, ref) => createElement(Description, {
      ref,
      className: cn("xps-dialog-description", className),
      ...props
    })
  );
  DialogDescription2.displayName = Description.displayName;

  // ../../../node_modules/.pnpm/@radix-ui+react-collection@1.1.9_@types+react-dom@18.3.7_@types+react@18.3.31__@types+r_9d7b7379fb7a1e56af9d4a8d107ecba8/node_modules/@radix-ui/react-collection/dist/index.mjs
  function createCollection(name) {
    const PROVIDER_NAME3 = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope5] = createContextScope(PROVIDER_NAME3);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME3,
      { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
    );
    const CollectionProvider = (props) => {
      const { scope, children } = props;
      const ref = useRef(null);
      const itemMap = useRef(/* @__PURE__ */ new Map()).current;
      return /* @__PURE__ */ jsx(CollectionProviderImpl, { scope, itemMap, collectionRef: ref, children });
    };
    CollectionProvider.displayName = PROVIDER_NAME3;
    const COLLECTION_SLOT_NAME = name + "CollectionSlot";
    const CollectionSlotImpl = createSlot(COLLECTION_SLOT_NAME);
    const CollectionSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = useComposedRefs(forwardedRef, context.collectionRef);
        return /* @__PURE__ */ jsx(CollectionSlotImpl, { ref: composedRefs, children });
      }
    );
    CollectionSlot.displayName = COLLECTION_SLOT_NAME;
    const ITEM_SLOT_NAME = name + "CollectionItemSlot";
    const ITEM_DATA_ATTR = "data-radix-collection-item";
    const CollectionItemSlotImpl = createSlot(ITEM_SLOT_NAME);
    const CollectionItemSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children, ...itemData } = props;
        const ref = useRef(null);
        const composedRefs = useComposedRefs(forwardedRef, ref);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        useEffect(() => {
          context.itemMap.set(ref, { ref, ...itemData });
          return () => void context.itemMap.delete(ref);
        });
        return /* @__PURE__ */ jsx(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
      }
    );
    CollectionItemSlot.displayName = ITEM_SLOT_NAME;
    function useCollection5(scope) {
      const context = useCollectionContext(name + "CollectionConsumer", scope);
      const getItems = useCallback(() => {
        const collectionNode = context.collectionRef.current;
        if (!collectionNode) return [];
        const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
        const items = Array.from(context.itemMap.values());
        const orderedItems = items.sort(
          (a, b) => orderedNodes.indexOf(a.ref.current) - orderedNodes.indexOf(b.ref.current)
        );
        return orderedItems;
      }, [context.collectionRef, context.itemMap]);
      return getItems;
    }
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      useCollection5,
      createCollectionScope5
    ];
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-direction@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-direction/dist/index.mjs
  var DirectionContext = createContext(void 0);
  function useDirection(localDir) {
    const globalDir = useContext(DirectionContext);
    return localDir || globalDir || "ltr";
  }

  // ../../../node_modules/.pnpm/@floating-ui+utils@0.2.11/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  var sides = ["top", "right", "bottom", "left"];
  var min = Math.min;
  var max = Math.max;
  var round = Math.round;
  var floor = Math.floor;
  var createCoords = (v) => ({
    x: v,
    y: v
  });
  var oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value === "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    const firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    if (rtl === void 0) {
      rtl = false;
    }
    const alignment = getAlignment(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const length = getAxisLength(alignmentAxis);
    let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    if (rects.reference[length] > rects.floating[length]) {
      mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
    }
    return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    const oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"];
  var rlPlacement = ["right", "left"];
  var tbPlacement = ["top", "bottom"];
  var btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        if (rtl) return isStart ? rlPlacement : lrPlacement;
        return isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    const alignment = getAlignment(placement);
    let list = getSideList(getSide(placement), direction === "start", rtl);
    if (alignment) {
      list = list.map((side) => side + "-" + alignment);
      if (flipAlignment) {
        list = list.concat(list.map(getOppositeAlignmentPlacement));
      }
    }
    return list;
  }
  function getOppositePlacement(placement) {
    const side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...padding
    };
  }
  function getPaddingObject(padding) {
    return typeof padding !== "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    const {
      x,
      y,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      x,
      y
    };
  }

  // ../../../node_modules/.pnpm/@floating-ui+core@1.7.5/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref;
    const sideAxis = getSideAxis(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const alignLength = getAxisLength(alignmentAxis);
    const side = getSide(placement);
    const isVertical = sideAxis === "y";
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    switch (getAlignment(placement)) {
      case "start":
        coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
        break;
      case "end":
        coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
        break;
    }
    return coords;
  }
  async function detectOverflow(state, options2) {
    var _await$platform$isEle;
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      x,
      y,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state;
    const {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = false,
      padding = 0
    } = evaluate(options2, state);
    const paddingObject = getPaddingObject(padding);
    const altContext = elementContext === "floating" ? "reference" : "floating";
    const element = elements[altBoundary ? altContext : elementContext];
    const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    }));
    const rect = elementContext === "floating" ? {
      x,
      y,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference;
    const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    } : {
      x: 1,
      y: 1
    };
    const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50;
  var computePosition = async (reference, floating, config) => {
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config;
    const platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    };
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
    let rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    });
    let {
      x,
      y
    } = computeCoordsFromPlacement(rects, placement, rtl);
    let statefulPlacement = placement;
    let resetCount = 0;
    const middlewareData = {};
    for (let i = 0; i < middleware.length; i++) {
      const currentMiddleware = middleware[i];
      if (!currentMiddleware) {
        continue;
      }
      const {
        name,
        fn
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
        x,
        y,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x = nextX != null ? nextX : x;
      y = nextY != null ? nextY : y;
      middlewareData[name] = {
        ...middlewareData[name],
        ...data
      };
      if (reset && resetCount < MAX_RESET_COUNT) {
        resetCount++;
        if (typeof reset === "object") {
          if (reset.placement) {
            statefulPlacement = reset.placement;
          }
          if (reset.rects) {
            rects = reset.rects === true ? await platform2.getElementRects({
              reference,
              floating,
              strategy
            }) : reset.rects;
          }
          ({
            x,
            y
          } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
        }
        i = -1;
      }
    }
    return {
      x,
      y,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var arrow = (options2) => ({
    name: "arrow",
    options: options2,
    async fn(state) {
      const {
        x,
        y,
        placement,
        rects,
        platform: platform2,
        elements,
        middlewareData
      } = state;
      const {
        element,
        padding = 0
      } = evaluate(options2, state) || {};
      if (element == null) {
        return {};
      }
      const paddingObject = getPaddingObject(padding);
      const coords = {
        x,
        y
      };
      const axis = getAlignmentAxis(placement);
      const length = getAxisLength(axis);
      const arrowDimensions = await platform2.getDimensions(element);
      const isYAxis = axis === "y";
      const minProp = isYAxis ? "top" : "left";
      const maxProp = isYAxis ? "bottom" : "right";
      const clientProp = isYAxis ? "clientHeight" : "clientWidth";
      const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
      const startDiff = coords[axis] - rects.reference[axis];
      const arrowOffsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(element));
      let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
      if (!clientSize || !await (platform2.isElement == null ? void 0 : platform2.isElement(arrowOffsetParent))) {
        clientSize = elements.floating[clientProp] || rects.floating[length];
      }
      const centerToReference = endDiff / 2 - startDiff / 2;
      const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
      const minPadding = min(paddingObject[minProp], largestPossiblePadding);
      const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
      const min$1 = minPadding;
      const max2 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset4 = clamp(min$1, center, max2);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset4 && rects.reference[length] / 2 - (center < min$1 ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < min$1 ? center - min$1 : center - max2 : 0;
      return {
        [axis]: coords[axis] + alignmentOffset,
        data: {
          [axis]: offset4,
          centerOffset: center - offset4 - alignmentOffset,
          ...shouldAddOffset && {
            alignmentOffset
          }
        },
        reset: shouldAddOffset
      };
    }
  });
  var flip = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "flip",
      options: options2,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        const {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = true,
          ...detectOverflowOptions
        } = evaluate(options2, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        const side = getSide(placement);
        const initialSideAxis = getSideAxis(initialPlacement);
        const isBasePlacement = getSide(initialPlacement) === initialPlacement;
        const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
        const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
        const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
          fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        }
        const placements2 = [initialPlacement, ...fallbackPlacements];
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const overflows = [];
        let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis) {
          overflows.push(overflow[side]);
        }
        if (checkCrossAxis) {
          const sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        overflowsData = [...overflowsData, {
          placement,
          overflows
        }];
        if (!overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
          const nextPlacement = placements2[nextIndex];
          if (nextPlacement) {
            const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
            if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
            // overflows the main axis.
            overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
              return {
                data: {
                  index: nextIndex,
                  overflows: overflowsData
                },
                reset: {
                  placement: nextPlacement
                }
              };
            }
          }
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement) {
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return true;
                }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement2) {
                  resetPlacement = placement2;
                }
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          }
          if (placement !== resetPlacement) {
            return {
              reset: {
                placement: resetPlacement
              }
            };
          }
        }
        return {};
      }
    };
  };
  function getSideOffsets(overflow, rect) {
    return {
      top: overflow.top - rect.height,
      right: overflow.right - rect.width,
      bottom: overflow.bottom - rect.height,
      left: overflow.left - rect.width
    };
  }
  function isAnySideFullyClipped(overflow) {
    return sides.some((side) => overflow[side] >= 0);
  }
  var hide = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "hide",
      options: options2,
      async fn(state) {
        const {
          rects,
          platform: platform2
        } = state;
        const {
          strategy = "referenceHidden",
          ...detectOverflowOptions
        } = evaluate(options2, state);
        switch (strategy) {
          case "referenceHidden": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              elementContext: "reference"
            });
            const offsets = getSideOffsets(overflow, rects.reference);
            return {
              data: {
                referenceHiddenOffsets: offsets,
                referenceHidden: isAnySideFullyClipped(offsets)
              }
            };
          }
          case "escaped": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              altBoundary: true
            });
            const offsets = getSideOffsets(overflow, rects.floating);
            return {
              data: {
                escapedOffsets: offsets,
                escaped: isAnySideFullyClipped(offsets)
              }
            };
          }
          default: {
            return {};
          }
        }
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options2) {
    const {
      placement,
      platform: platform2,
      elements
    } = state;
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const isVertical = getSideAxis(placement) === "y";
    const mainAxisMulti = originSides.has(side) ? -1 : 1;
    const crossAxisMulti = rtl && isVertical ? -1 : 1;
    const rawValue = evaluate(options2, state);
    let {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue === "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    if (alignment && typeof alignmentAxis === "number") {
      crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
    }
    return isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options2) {
    if (options2 === void 0) {
      options2 = 0;
    }
    return {
      name: "offset",
      options: options2,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        const {
          x,
          y,
          placement,
          middlewareData
        } = state;
        const diffCoords = await convertValueToCoords(state, options2);
        if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        return {
          x: x + diffCoords.x,
          y: y + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  };
  var shift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "shift",
      options: options2,
      async fn(state) {
        const {
          x,
          y,
          placement,
          platform: platform2
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = false,
          limiter = {
            fn: (_ref) => {
              let {
                x: x2,
                y: y2
              } = _ref;
              return {
                x: x2,
                y: y2
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const crossAxis = getSideAxis(getSide(placement));
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        if (checkMainAxis) {
          const minSide = mainAxis === "y" ? "top" : "left";
          const maxSide = mainAxis === "y" ? "bottom" : "right";
          const min2 = mainAxisCoord + overflow[minSide];
          const max2 = mainAxisCoord - overflow[maxSide];
          mainAxisCoord = clamp(min2, mainAxisCoord, max2);
        }
        if (checkCrossAxis) {
          const minSide = crossAxis === "y" ? "top" : "left";
          const maxSide = crossAxis === "y" ? "bottom" : "right";
          const min2 = crossAxisCoord + overflow[minSide];
          const max2 = crossAxisCoord - overflow[maxSide];
          crossAxisCoord = clamp(min2, crossAxisCoord, max2);
        }
        const limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x,
            y: limitedCoords.y - y,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };
  var limitShift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      options: options2,
      fn(state) {
        const {
          x,
          y,
          placement,
          rects,
          middlewareData
        } = state;
        const {
          offset: offset4 = 0,
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const rawOffset = evaluate(offset4, state);
        const computedOffset = typeof rawOffset === "number" ? {
          mainAxis: rawOffset,
          crossAxis: 0
        } : {
          mainAxis: 0,
          crossAxis: 0,
          ...rawOffset
        };
        if (checkMainAxis) {
          const len = mainAxis === "y" ? "height" : "width";
          const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
          const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
          if (mainAxisCoord < limitMin) {
            mainAxisCoord = limitMin;
          } else if (mainAxisCoord > limitMax) {
            mainAxisCoord = limitMax;
          }
        }
        if (checkCrossAxis) {
          var _middlewareData$offse, _middlewareData$offse2;
          const len = mainAxis === "y" ? "width" : "height";
          const isOriginSide = originSides.has(getSide(placement));
          const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
          const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
          if (crossAxisCoord < limitMin) {
            crossAxisCoord = limitMin;
          } else if (crossAxisCoord > limitMax) {
            crossAxisCoord = limitMax;
          }
        }
        return {
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        };
      }
    };
  };
  var size = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "size",
      options: options2,
      async fn(state) {
        var _state$middlewareData, _state$middlewareData2;
        const {
          placement,
          rects,
          platform: platform2,
          elements
        } = state;
        const {
          apply = () => {
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const side = getSide(placement);
        const alignment = getAlignment(placement);
        const isYAxis = getSideAxis(placement) === "y";
        const {
          width,
          height
        } = rects.floating;
        let heightSide;
        let widthSide;
        if (side === "top" || side === "bottom") {
          heightSide = side;
          widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
        } else {
          widthSide = side;
          heightSide = alignment === "end" ? "top" : "bottom";
        }
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        const maximumClippingWidth = width - overflow.left - overflow.right;
        const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
        const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
        const noShift = !state.middlewareData.shift;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if ((_state$middlewareData = state.middlewareData.shift) != null && _state$middlewareData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if ((_state$middlewareData2 = state.middlewareData.shift) != null && _state$middlewareData2.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          const xMin = max(overflow.left, 0);
          const xMax = max(overflow.right, 0);
          const yMin = max(overflow.top, 0);
          const yMax = max(overflow.bottom, 0);
          if (isYAxis) {
            availableWidth = width - 2 * (xMin !== 0 || xMax !== 0 ? xMin + xMax : max(overflow.left, overflow.right));
          } else {
            availableHeight = height - 2 * (yMin !== 0 || yMax !== 0 ? yMin + yMax : max(overflow.top, overflow.bottom));
          }
        }
        await apply({
          ...state,
          availableWidth,
          availableHeight
        });
        const nextDimensions = await platform2.getDimensions(elements.floating);
        if (width !== nextDimensions.width || height !== nextDimensions.height) {
          return {
            reset: {
              rects: true
            }
          };
        }
        return {};
      }
    };
  };

  // ../../../node_modules/.pnpm/@floating-ui+utils@0.2.11/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  function hasWindow() {
    return typeof window !== "undefined";
  }
  function getNodeName(node) {
    if (isNode(node)) {
      return (node.nodeName || "").toLowerCase();
    }
    return "#document";
  }
  function getWindow(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement(node) {
    var _ref;
    return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Node || value instanceof getWindow(value).Node;
  }
  function isElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Element || value instanceof getWindow(value).Element;
  }
  function isHTMLElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
  }
  function isShadowRoot(value) {
    if (!hasWindow() || typeof ShadowRoot === "undefined") {
      return false;
    }
    return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
  }
  function isOverflowElement(element) {
    const {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle2(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open")) {
        return true;
      }
    } catch (_e2) {
    }
    try {
      return element.matches(":modal");
    } catch (_e2) {
      return false;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
  var containRe = /paint|layout|strict|content/;
  var isNotNone = (value) => !!value && value !== "none";
  var isWebKitValue;
  function isContainingBlock(elementOrCss) {
    const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode(element);
    while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
      if (isContainingBlock(currentNode)) {
        return currentNode;
      } else if (isTopLayer(currentNode)) {
        return null;
      }
      currentNode = getParentNode(currentNode);
    }
    return null;
  }
  function isWebKit() {
    if (isWebKitValue == null) {
      isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
    }
    return isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName(node));
  }
  function getComputedStyle2(element) {
    return getWindow(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    if (isElement(element)) {
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop
      };
    }
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html") {
      return node;
    }
    const result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot(node) && node.host || // Fallback.
      getDocumentElement(node)
    );
    return isShadowRoot(result) ? result.host : result;
  }
  function getNearestOverflowAncestor(node) {
    const parentNode = getParentNode(node);
    if (isLastTraversableNode(parentNode)) {
      return node.ownerDocument ? node.ownerDocument.body : node.body;
    }
    if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
      return parentNode;
    }
    return getNearestOverflowAncestor(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    if (list === void 0) {
      list = [];
    }
    if (traverseIframes === void 0) {
      traverseIframes = true;
    }
    const scrollableAncestor = getNearestOverflowAncestor(node);
    const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
    const win = getWindow(scrollableAncestor);
    if (isBody) {
      const frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else {
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
    }
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // ../../../node_modules/.pnpm/@floating-ui+dom@1.7.6/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    const css = getComputedStyle2(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const hasOffset = isHTMLElement(element);
    const offsetWidth = hasOffset ? element.offsetWidth : width;
    const offsetHeight = hasOffset ? element.offsetHeight : height;
    const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    if (shouldFallback) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return !isElement(element) ? element.contextElement : element;
  }
  function getScale(element) {
    const domElement = unwrapElement(element);
    if (!isHTMLElement(domElement)) {
      return createCoords(1);
    }
    const rect = domElement.getBoundingClientRect();
    const {
      width,
      height,
      $: $2
    } = getCssDimensions(domElement);
    let x = ($2 ? round(rect.width) : rect.width) / width;
    let y = ($2 ? round(rect.height) : rect.height) / height;
    if (!x || !Number.isFinite(x)) {
      x = 1;
    }
    if (!y || !Number.isFinite(y)) {
      y = 1;
    }
    return {
      x,
      y
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    const win = getWindow(element);
    if (!isWebKit() || !win.visualViewport) {
      return noOffsets;
    }
    return {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    if (isFixed === void 0) {
      isFixed = false;
    }
    if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element)) {
      return false;
    }
    return isFixed;
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    if (includeScale === void 0) {
      includeScale = false;
    }
    if (isFixedStrategy === void 0) {
      isFixedStrategy = false;
    }
    const clientRect = element.getBoundingClientRect();
    const domElement = unwrapElement(element);
    let scale = createCoords(1);
    if (includeScale) {
      if (offsetParent) {
        if (isElement(offsetParent)) {
          scale = getScale(offsetParent);
        }
      } else {
        scale = getScale(element);
      }
    }
    const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
    let x = (clientRect.left + visualOffsets.x) / scale.x;
    let y = (clientRect.top + visualOffsets.y) / scale.y;
    let width = clientRect.width / scale.x;
    let height = clientRect.height / scale.y;
    if (domElement) {
      const win = getWindow(domElement);
      const offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetParent && offsetWin !== currentWin) {
        const iframeScale = getScale(currentIFrame);
        const iframeRect = currentIFrame.getBoundingClientRect();
        const css = getComputedStyle2(currentIFrame);
        const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
        const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x *= iframeScale.x;
        y *= iframeScale.y;
        width *= iframeScale.x;
        height *= iframeScale.y;
        x += left;
        y += top;
        currentWin = getWindow(currentIFrame);
        currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x,
      y
    });
  }
  function getWindowScrollBarX(element, rect) {
    const leftScroll = getNodeScroll(element).scrollLeft;
    if (!rect) {
      return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
    }
    return rect.left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    const htmlRect = documentElement.getBoundingClientRect();
    const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
    const y = htmlRect.top + scroll.scrollTop;
    return {
      x,
      y
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref;
    const isFixed = strategy === "fixed";
    const documentElement = getDocumentElement(offsetParent);
    const topLayer = elements ? isTopLayer(elements.floating) : false;
    if (offsetParent === documentElement || topLayer && isFixed) {
      return rect;
    }
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    let scale = createCoords(1);
    const offsets = createCoords(0);
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent);
        scale = getScale(offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return Array.from(element.getClientRects());
  }
  function getDocumentRect(element) {
    const html = getDocumentElement(element);
    const scroll = getNodeScroll(element);
    const body = element.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x = -scroll.scrollLeft + getWindowScrollBarX(element);
    const y = -scroll.scrollTop;
    if (getComputedStyle2(body).direction === "rtl") {
      x += max(html.clientWidth, body.clientWidth) - width;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy) {
    const win = getWindow(element);
    const html = getDocumentElement(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x = 0;
    let y = 0;
    if (visualViewport) {
      width = visualViewport.width;
      height = visualViewport.height;
      const visualViewportBased = isWebKit();
      if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
        x = visualViewport.offsetLeft;
        y = visualViewport.offsetTop;
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      if (clippingStableScrollbarWidth <= SCROLLBAR_MAX) {
        width -= clippingStableScrollbarWidth;
      }
    } else if (windowScrollbarX <= SCROLLBAR_MAX) {
      width += windowScrollbarX;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
    const top = clientRect.top + element.clientTop;
    const left = clientRect.left + element.clientLeft;
    const scale = isHTMLElement(element) ? getScale(element) : createCoords(1);
    const width = element.clientWidth * scale.x;
    const height = element.clientHeight * scale.y;
    const x = left * scale.x;
    const y = top * scale.y;
    return {
      width,
      height,
      x,
      y
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport") {
      rect = getViewportRect(element, strategy);
    } else if (clippingAncestor === "document") {
      rect = getDocumentRect(getDocumentElement(element));
    } else if (isElement(clippingAncestor)) {
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    } else {
      const visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function hasFixedPositionAncestor(element, stopNode) {
    const parentNode = getParentNode(element);
    if (parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode)) {
      return false;
    }
    return getComputedStyle2(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
    let currentContainingBlockComputedStyle = null;
    const elementIsFixed = getComputedStyle2(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode(element) : element;
    while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle2(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      if (!currentNodeIsContaining && computedStyle.position === "fixed") {
        currentContainingBlockComputedStyle = null;
      }
      const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && (currentContainingBlockComputedStyle.position === "absolute" || currentContainingBlockComputedStyle.position === "fixed") || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        currentContainingBlockComputedStyle = computedStyle;
      }
      currentNode = getParentNode(currentNode);
    }
    cache.set(element, result);
    return result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref;
    const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
    const clippingAncestors = [...elementClippingAncestors, rootBoundary];
    const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;
    let left = firstRect.left;
    for (let i = 1; i < clippingAncestors.length; i++) {
      const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
      top = max(rect.top, top);
      right = min(rect.right, right);
      bottom = min(rect.bottom, bottom);
      left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    const {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    const documentElement = getDocumentElement(offsetParent);
    const isFixed = strategy === "fixed";
    const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    const offsets = createCoords(0);
    function setLeftRTLScrollbarOffset() {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      } else if (documentElement) {
        setLeftRTLScrollbarOffset();
      }
    }
    if (isFixed && !isOffsetParentAnElement && documentElement) {
      setLeftRTLScrollbarOffset();
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
    const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle2(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
      return null;
    }
    if (polyfill) {
      return polyfill(element);
    }
    let rawOffsetParent = element.offsetParent;
    if (getDocumentElement(element) === rawOffsetParent) {
      rawOffsetParent = rawOffsetParent.ownerDocument.body;
    }
    return rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    const win = getWindow(element);
    if (isTopLayer(element)) {
      return win;
    }
    if (!isHTMLElement(element)) {
      let svgOffsetParent = getParentNode(element);
      while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
        if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
          return svgOffsetParent;
        }
        svgOffsetParent = getParentNode(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    }
    if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
      return win;
    }
    return offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
    const getDimensionsFn = this.getDimensions;
    const floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle2(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement,
    isRTL
  };
  function rectsAreEqual(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  function observeMove(element, onMove) {
    let io = null;
    let timeoutId;
    const root2 = getDocumentElement(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId);
      (_io = io) == null || _io.disconnect();
      io = null;
    }
    function refresh(skip, threshold) {
      if (skip === void 0) {
        skip = false;
      }
      if (threshold === void 0) {
        threshold = 1;
      }
      cleanup();
      const elementRectForRootMargin = element.getBoundingClientRect();
      const {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (!skip) {
        onMove();
      }
      if (!width || !height) {
        return;
      }
      const insetTop = floor(top);
      const insetRight = floor(root2.clientWidth - (left + width));
      const insetBottom = floor(root2.clientHeight - (top + height));
      const insetLeft = floor(left);
      const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
      const options2 = {
        rootMargin,
        threshold: max(0, min(1, threshold)) || 1
      };
      let isFirstUpdate = true;
      function handleObserve(entries) {
        const ratio = entries[0].intersectionRatio;
        if (ratio !== threshold) {
          if (!isFirstUpdate) {
            return refresh();
          }
          if (!ratio) {
            timeoutId = setTimeout(() => {
              refresh(false, 1e-7);
            }, 1e3);
          } else {
            refresh(false, ratio);
          }
        }
        if (ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          refresh();
        }
        isFirstUpdate = false;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options2,
          // Handle <iframe>s
          root: root2.ownerDocument
        });
      } catch (_e2) {
        io = new IntersectionObserver(handleObserve, options2);
      }
      io.observe(element);
    }
    refresh(true);
    return cleanup;
  }
  function autoUpdate(reference, floating, update, options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      ancestorScroll = true,
      ancestorResize = true,
      elementResize = typeof ResizeObserver === "function",
      layoutShift = typeof IntersectionObserver === "function",
      animationFrame = false
    } = options2;
    const referenceEl = unwrapElement(reference);
    const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update, {
        passive: true
      });
      ancestorResize && ancestor.addEventListener("resize", update);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
    let reobserveFrame = -1;
    let resizeObserver = null;
    if (elementResize) {
      resizeObserver = new ResizeObserver((_ref) => {
        let [firstEntry] = _ref;
        if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
          resizeObserver.unobserve(floating);
          cancelAnimationFrame(reobserveFrame);
          reobserveFrame = requestAnimationFrame(() => {
            var _resizeObserver;
            (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
          });
        }
        update();
      });
      if (referenceEl && !animationFrame) {
        resizeObserver.observe(referenceEl);
      }
      if (floating) {
        resizeObserver.observe(floating);
      }
    }
    let frameId;
    let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    if (animationFrame) {
      frameLoop();
    }
    function frameLoop() {
      const nextRefRect = getBoundingClientRect(reference);
      if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
        update();
      }
      prevRefRect = nextRefRect;
      frameId = requestAnimationFrame(frameLoop);
    }
    update();
    return () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update);
        ancestorResize && ancestor.removeEventListener("resize", update);
      });
      cleanupIo == null || cleanupIo();
      (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
      resizeObserver = null;
      if (animationFrame) {
        cancelAnimationFrame(frameId);
      }
    };
  }
  var offset2 = offset;
  var shift2 = shift;
  var flip2 = flip;
  var size2 = size;
  var hide2 = hide;
  var arrow2 = arrow;
  var limitShift2 = limitShift;
  var computePosition2 = (reference, floating, options2) => {
    const cache = /* @__PURE__ */ new Map();
    const mergedOptions = {
      platform,
      ...options2
    };
    const platformWithCache = {
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // ../../../node_modules/.pnpm/@floating-ui+react-dom@2.1.8_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
  var isClient = typeof document !== "undefined";
  var noop = function noop2() {
  };
  var index = isClient ? useLayoutEffect : noop;
  function deepEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (typeof a !== typeof b) {
      return false;
    }
    if (typeof a === "function" && a.toString() === b.toString()) {
      return true;
    }
    let length;
    let i;
    let keys;
    if (a && b && typeof a === "object") {
      if (Array.isArray(a)) {
        length = a.length;
        if (length !== b.length) return false;
        for (i = length; i-- !== 0; ) {
          if (!deepEqual(a[i], b[i])) {
            return false;
          }
        }
        return true;
      }
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length) {
        return false;
      }
      for (i = length; i-- !== 0; ) {
        if (!{}.hasOwnProperty.call(b, keys[i])) {
          return false;
        }
      }
      for (i = length; i-- !== 0; ) {
        const key = keys[i];
        if (key === "_owner" && a.$$typeof) {
          continue;
        }
        if (!deepEqual(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }
    return a !== a && b !== b;
  }
  function getDPR(element) {
    if (typeof window === "undefined") {
      return 1;
    }
    const win = element.ownerDocument.defaultView || window;
    return win.devicePixelRatio || 1;
  }
  function roundByDPR(element, value) {
    const dpr = getDPR(element);
    return Math.round(value * dpr) / dpr;
  }
  function useLatestRef(value) {
    const ref = useRef(value);
    index(() => {
      ref.current = value;
    });
    return ref;
  }
  function useFloating(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2,
      elements: {
        reference: externalReference,
        floating: externalFloating
      } = {},
      transform = true,
      whileElementsMounted,
      open
    } = options2;
    const [data, setData] = useState({
      x: 0,
      y: 0,
      strategy,
      placement,
      middlewareData: {},
      isPositioned: false
    });
    const [latestMiddleware, setLatestMiddleware] = useState(middleware);
    if (!deepEqual(latestMiddleware, middleware)) {
      setLatestMiddleware(middleware);
    }
    const [_reference, _setReference] = useState(null);
    const [_floating, _setFloating] = useState(null);
    const setReference = useCallback((node) => {
      if (node !== referenceRef.current) {
        referenceRef.current = node;
        _setReference(node);
      }
    }, []);
    const setFloating = useCallback((node) => {
      if (node !== floatingRef.current) {
        floatingRef.current = node;
        _setFloating(node);
      }
    }, []);
    const referenceEl = externalReference || _reference;
    const floatingEl = externalFloating || _floating;
    const referenceRef = useRef(null);
    const floatingRef = useRef(null);
    const dataRef = useRef(data);
    const hasWhileElementsMounted = whileElementsMounted != null;
    const whileElementsMountedRef = useLatestRef(whileElementsMounted);
    const platformRef = useLatestRef(platform2);
    const openRef = useLatestRef(open);
    const update = useCallback(() => {
      if (!referenceRef.current || !floatingRef.current) {
        return;
      }
      const config = {
        placement,
        strategy,
        middleware: latestMiddleware
      };
      if (platformRef.current) {
        config.platform = platformRef.current;
      }
      computePosition2(referenceRef.current, floatingRef.current, config).then((data2) => {
        const fullData = {
          ...data2,
          // The floating element's position may be recomputed while it's closed
          // but still mounted (such as when transitioning out). To ensure
          // `isPositioned` will be `false` initially on the next open, avoid
          // setting it to `true` when `open === false` (must be specified).
          isPositioned: openRef.current !== false
        };
        if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
          dataRef.current = fullData;
          flushSync(() => {
            setData(fullData);
          });
        }
      });
    }, [latestMiddleware, placement, strategy, platformRef, openRef]);
    index(() => {
      if (open === false && dataRef.current.isPositioned) {
        dataRef.current.isPositioned = false;
        setData((data2) => ({
          ...data2,
          isPositioned: false
        }));
      }
    }, [open]);
    const isMountedRef = useRef(false);
    index(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);
    index(() => {
      if (referenceEl) referenceRef.current = referenceEl;
      if (floatingEl) floatingRef.current = floatingEl;
      if (referenceEl && floatingEl) {
        if (whileElementsMountedRef.current) {
          return whileElementsMountedRef.current(referenceEl, floatingEl, update);
        }
        update();
      }
    }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);
    const refs = useMemo(() => ({
      reference: referenceRef,
      floating: floatingRef,
      setReference,
      setFloating
    }), [setReference, setFloating]);
    const elements = useMemo(() => ({
      reference: referenceEl,
      floating: floatingEl
    }), [referenceEl, floatingEl]);
    const floatingStyles = useMemo(() => {
      const initialStyles = {
        position: strategy,
        left: 0,
        top: 0
      };
      if (!elements.floating) {
        return initialStyles;
      }
      const x = roundByDPR(elements.floating, data.x);
      const y = roundByDPR(elements.floating, data.y);
      if (transform) {
        return {
          ...initialStyles,
          transform: "translate(" + x + "px, " + y + "px)",
          ...getDPR(elements.floating) >= 1.5 && {
            willChange: "transform"
          }
        };
      }
      return {
        position: strategy,
        left: x,
        top: y
      };
    }, [strategy, transform, elements.floating, data.x, data.y]);
    return useMemo(() => ({
      ...data,
      update,
      refs,
      elements,
      floatingStyles
    }), [data, update, refs, elements, floatingStyles]);
  }
  var arrow$1 = (options2) => {
    function isRef(value) {
      return {}.hasOwnProperty.call(value, "current");
    }
    return {
      name: "arrow",
      options: options2,
      fn(state) {
        const {
          element,
          padding
        } = typeof options2 === "function" ? options2(state) : options2;
        if (element && isRef(element)) {
          if (element.current != null) {
            return arrow2({
              element: element.current,
              padding
            }).fn(state);
          }
          return {};
        }
        if (element) {
          return arrow2({
            element,
            padding
          }).fn(state);
        }
        return {};
      }
    };
  };
  var offset3 = (options2, deps) => {
    const result = offset2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var shift3 = (options2, deps) => {
    const result = shift2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var limitShift3 = (options2, deps) => {
    const result = limitShift2(options2);
    return {
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var flip3 = (options2, deps) => {
    const result = flip2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var size3 = (options2, deps) => {
    const result = size2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var hide3 = (options2, deps) => {
    const result = hide2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var arrow3 = (options2, deps) => {
    const result = arrow$1(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };

  // ../../../node_modules/.pnpm/@radix-ui+react-arrow@1.1.9_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react@_b34b7156178de4198a23e93f83c57da5/node_modules/@radix-ui/react-arrow/dist/index.mjs
  var NAME = "Arrow";
  var Arrow = forwardRef((props, forwardedRef) => {
    const { children, width = 10, height = 5, ...arrowProps } = props;
    return /* @__PURE__ */ jsx(
      Primitive.svg,
      {
        ...arrowProps,
        ref: forwardedRef,
        width,
        height,
        viewBox: "0 0 30 10",
        preserveAspectRatio: "none",
        children: props.asChild ? children : /* @__PURE__ */ jsx("polygon", { points: "0,0 30,0 15,10" })
      }
    );
  });
  Arrow.displayName = NAME;
  var Root2 = Arrow;

  // ../../../node_modules/.pnpm/@radix-ui+react-popper@1.3.0_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react_bd7668c1d3a757f9e8c97f0d7e635b5d/node_modules/@radix-ui/react-popper/dist/index.mjs
  var POPPER_NAME = "Popper";
  var [createPopperContext, createPopperScope] = createContextScope(POPPER_NAME);
  var [PopperProvider, usePopperContext] = createPopperContext(POPPER_NAME);
  var Popper = (props) => {
    const { __scopePopper, children } = props;
    const [anchor, setAnchor] = useState(null);
    const [placementState, setPlacementState] = useState(void 0);
    return /* @__PURE__ */ jsx(
      PopperProvider,
      {
        scope: __scopePopper,
        anchor,
        onAnchorChange: setAnchor,
        placementState,
        setPlacementState,
        children
      }
    );
  };
  Popper.displayName = POPPER_NAME;
  var ANCHOR_NAME = "PopperAnchor";
  var PopperAnchor = forwardRef(
    (props, forwardedRef) => {
      const { __scopePopper, virtualRef, ...anchorProps } = props;
      const context = usePopperContext(ANCHOR_NAME, __scopePopper);
      const ref = useRef(null);
      const onAnchorChange = context.onAnchorChange;
      const callbackRef = useCallback(
        (node) => {
          ref.current = node;
          if (node) {
            onAnchorChange(node);
          }
        },
        [onAnchorChange]
      );
      const composedRefs = useComposedRefs(forwardedRef, callbackRef);
      const anchorRef = useRef(null);
      useEffect(() => {
        if (!virtualRef) {
          return;
        }
        const previousAnchor = anchorRef.current;
        anchorRef.current = virtualRef.current;
        if (previousAnchor !== anchorRef.current) {
          onAnchorChange(anchorRef.current);
        }
      });
      const sideAndAlign = context.placementState && getSideAndAlignFromPlacement(context.placementState);
      const placedSide = sideAndAlign?.[0];
      const placedAlign = sideAndAlign?.[1];
      return virtualRef ? null : /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-radix-popper-side": placedSide,
          "data-radix-popper-align": placedAlign,
          ...anchorProps,
          ref: composedRefs
        }
      );
    }
  );
  PopperAnchor.displayName = ANCHOR_NAME;
  var CONTENT_NAME2 = "PopperContent";
  var [PopperContentProvider, useContentContext] = createPopperContext(CONTENT_NAME2);
  var PopperContent = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopePopper,
        side = "bottom",
        sideOffset = 0,
        align = "center",
        alignOffset = 0,
        arrowPadding = 0,
        avoidCollisions = true,
        collisionBoundary,
        collisionPadding: collisionPaddingProp = 0,
        sticky = "partial",
        hideWhenDetached = false,
        updatePositionStrategy = "optimized",
        onPlaced,
        ...contentProps
      } = props;
      const context = usePopperContext(CONTENT_NAME2, __scopePopper);
      const [content, setContent] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, (node) => setContent(node));
      const [arrow4, setArrow] = useState(null);
      const arrowSize = useSize(arrow4);
      const arrowWidth = arrowSize?.width ?? 0;
      const arrowHeight = arrowSize?.height ?? 0;
      const desiredPlacement = side + (align !== "center" ? "-" + align : "");
      const collisionPadding = typeof collisionPaddingProp === "number" ? collisionPaddingProp : { top: 0, right: 0, bottom: 0, left: 0, ...collisionPaddingProp };
      const boundary = collisionBoundary ? Array.isArray(collisionBoundary) ? collisionBoundary : [collisionBoundary] : void 0;
      const hasExplicitBoundaries = boundary !== void 0 && boundary.length > 0;
      const detectOverflowOptions = {
        padding: collisionPadding,
        boundary: boundary?.filter(isNotNull),
        // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
        altBoundary: hasExplicitBoundaries
      };
      const { refs, floatingStyles, placement, isPositioned, middlewareData } = useFloating({
        // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
        strategy: "fixed",
        placement: desiredPlacement,
        whileElementsMounted: (...args) => {
          const cleanup = autoUpdate(...args, {
            animationFrame: updatePositionStrategy === "always"
          });
          return cleanup;
        },
        elements: {
          reference: context.anchor
        },
        middleware: [
          offset3({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
          avoidCollisions && shift3({
            mainAxis: true,
            crossAxis: false,
            limiter: sticky === "partial" ? limitShift3() : void 0,
            ...detectOverflowOptions
          }),
          avoidCollisions && flip3({ ...detectOverflowOptions }),
          size3({
            ...detectOverflowOptions,
            apply: ({ elements, rects, availableWidth, availableHeight }) => {
              const { width: anchorWidth, height: anchorHeight } = rects.reference;
              const contentStyle = elements.floating.style;
              contentStyle.setProperty("--radix-popper-available-width", `${availableWidth}px`);
              contentStyle.setProperty("--radix-popper-available-height", `${availableHeight}px`);
              contentStyle.setProperty("--radix-popper-anchor-width", `${anchorWidth}px`);
              contentStyle.setProperty("--radix-popper-anchor-height", `${anchorHeight}px`);
            }
          }),
          arrow4 && arrow3({ element: arrow4, padding: arrowPadding }),
          transformOrigin({ arrowWidth, arrowHeight }),
          hideWhenDetached && hide3({ strategy: "referenceHidden", ...detectOverflowOptions })
        ]
      });
      const setPlacementState = context.setPlacementState;
      useLayoutEffect2(() => {
        setPlacementState(placement);
        return () => {
          setPlacementState(void 0);
        };
      }, [placement, setPlacementState]);
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const handlePlaced = useCallbackRef(onPlaced);
      useLayoutEffect2(() => {
        if (isPositioned) {
          handlePlaced?.();
        }
      }, [isPositioned, handlePlaced]);
      const arrowX = middlewareData.arrow?.x;
      const arrowY = middlewareData.arrow?.y;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const [contentZIndex, setContentZIndex] = useState();
      useLayoutEffect2(() => {
        if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
      }, [content]);
      return /* @__PURE__ */ jsx(
        "div",
        {
          ref: refs.setFloating,
          "data-radix-popper-content-wrapper": "",
          style: {
            ...floatingStyles,
            transform: isPositioned ? floatingStyles.transform : "translate(0, -200%)",
            // keep off the page when measuring
            minWidth: "max-content",
            zIndex: contentZIndex,
            "--radix-popper-transform-origin": [
              middlewareData.transformOrigin?.x,
              middlewareData.transformOrigin?.y
            ].join(" "),
            // hide the content if using the hide middleware and should be hidden
            // set visibility to hidden and disable pointer events so the UI behaves
            // as if the PopperContent isn't there at all
            ...middlewareData.hide?.referenceHidden && {
              visibility: "hidden",
              pointerEvents: "none"
            }
          },
          dir: props.dir,
          children: /* @__PURE__ */ jsx(
            PopperContentProvider,
            {
              scope: __scopePopper,
              placedSide,
              placedAlign,
              onArrowChange: setArrow,
              arrowX,
              arrowY,
              shouldHideArrow: cannotCenterArrow,
              children: /* @__PURE__ */ jsx(
                Primitive.div,
                {
                  "data-side": placedSide,
                  "data-align": placedAlign,
                  ...contentProps,
                  ref: composedRefs,
                  style: {
                    ...contentProps.style,
                    // if the PopperContent hasn't been placed yet (not all measurements done)
                    // we prevent animations so that users's animation don't kick in too early referring wrong sides
                    animation: !isPositioned ? "none" : void 0
                  }
                }
              )
            }
          )
        }
      );
    }
  );
  PopperContent.displayName = CONTENT_NAME2;
  var ARROW_NAME = "PopperArrow";
  var OPPOSITE_SIDE = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right"
  };
  var PopperArrow = forwardRef(function PopperArrow2(props, forwardedRef) {
    const { __scopePopper, ...arrowProps } = props;
    const contentContext = useContentContext(ARROW_NAME, __scopePopper);
    const baseSide = OPPOSITE_SIDE[contentContext.placedSide];
    return (
      // we have to use an extra wrapper because `ResizeObserver` (used by `useSize`)
      // doesn't report size as we'd expect on SVG elements.
      // it reports their bounding box which is effectively the largest path inside the SVG.
      /* @__PURE__ */ jsx(
        "span",
        {
          ref: contentContext.onArrowChange,
          style: {
            position: "absolute",
            left: contentContext.arrowX,
            top: contentContext.arrowY,
            [baseSide]: 0,
            transformOrigin: {
              top: "",
              right: "0 0",
              bottom: "center 0",
              left: "100% 0"
            }[contentContext.placedSide],
            transform: {
              top: "translateY(100%)",
              right: "translateY(50%) rotate(90deg) translateX(-50%)",
              bottom: `rotate(180deg)`,
              left: "translateY(50%) rotate(-90deg) translateX(50%)"
            }[contentContext.placedSide],
            visibility: contentContext.shouldHideArrow ? "hidden" : void 0
          },
          children: /* @__PURE__ */ jsx(
            Root2,
            {
              ...arrowProps,
              ref: forwardedRef,
              style: {
                ...arrowProps.style,
                // ensures the element can be measured correctly (mostly for if SVG)
                display: "block"
              }
            }
          )
        }
      )
    );
  });
  PopperArrow.displayName = ARROW_NAME;
  function isNotNull(value) {
    return value !== null;
  }
  var transformOrigin = (options2) => ({
    name: "transformOrigin",
    options: options2,
    fn(data) {
      const { placement, rects, middlewareData } = data;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options2.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options2.arrowHeight;
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: "0%", center: "50%", end: "100%" }[placedAlign];
      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
      let x = "";
      let y = "";
      if (placedSide === "bottom") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === "top") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === "right") {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === "left") {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    }
  });
  function getSideAndAlignFromPlacement(placement) {
    const [side, align = "center"] = placement.split("-");
    return [side, align];
  }
  var Root22 = Popper;
  var Anchor = PopperAnchor;
  var Content2 = PopperContent;
  var Arrow2 = PopperArrow;

  // ../../../node_modules/.pnpm/@radix-ui+react-roving-focus@1.1.12_@types+react-dom@18.3.7_@types+react@18.3.31__@type_d783d3abe701a7f2fb2c68867b8f1f65/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
  var ENTRY_FOCUS = "rovingFocusGroup.onEntryFocus";
  var EVENT_OPTIONS2 = { bubbles: false, cancelable: true };
  var GROUP_NAME = "RovingFocusGroup";
  var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);
  var [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(
    GROUP_NAME,
    [createCollectionScope]
  );
  var [RovingFocusProvider, useRovingFocusContext] = createRovingFocusGroupContext(GROUP_NAME);
  var RovingFocusGroup = forwardRef(
    (props, forwardedRef) => {
      return /* @__PURE__ */ jsx(Collection.Provider, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(Collection.Slot, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(RovingFocusGroupImpl, { ...props, ref: forwardedRef }) }) });
    }
  );
  RovingFocusGroup.displayName = GROUP_NAME;
  var RovingFocusGroupImpl = forwardRef((props, forwardedRef) => {
    const {
      __scopeRovingFocusGroup,
      orientation,
      loop = false,
      dir,
      currentTabStopId: currentTabStopIdProp,
      defaultCurrentTabStopId,
      onCurrentTabStopIdChange,
      onEntryFocus,
      preventScrollOnEntryFocus = false,
      ...groupProps
    } = props;
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const direction = useDirection(dir);
    const [currentTabStopId, setCurrentTabStopId] = useControllableState({
      prop: currentTabStopIdProp,
      defaultProp: defaultCurrentTabStopId ?? null,
      onChange: onCurrentTabStopIdChange,
      caller: GROUP_NAME
    });
    const [isTabbingBackOut, setIsTabbingBackOut] = useState(false);
    const handleEntryFocus = useCallbackRef(onEntryFocus);
    const getItems = useCollection(__scopeRovingFocusGroup);
    const isClickFocusRef = useRef(false);
    const [focusableItemsCount, setFocusableItemsCount] = useState(0);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        node.addEventListener(ENTRY_FOCUS, handleEntryFocus);
        return () => node.removeEventListener(ENTRY_FOCUS, handleEntryFocus);
      }
    }, [handleEntryFocus]);
    return /* @__PURE__ */ jsx(
      RovingFocusProvider,
      {
        scope: __scopeRovingFocusGroup,
        orientation,
        dir: direction,
        loop,
        currentTabStopId,
        onItemFocus: useCallback(
          (tabStopId) => setCurrentTabStopId(tabStopId),
          [setCurrentTabStopId]
        ),
        onItemShiftTab: useCallback(() => setIsTabbingBackOut(true), []),
        onFocusableItemAdd: useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount + 1),
          []
        ),
        onFocusableItemRemove: useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount - 1),
          []
        ),
        children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
            "data-orientation": orientation,
            ...groupProps,
            ref: composedRefs,
            style: { outline: "none", ...props.style },
            onMouseDown: composeEventHandlers(props.onMouseDown, () => {
              isClickFocusRef.current = true;
            }),
            onFocus: composeEventHandlers(props.onFocus, (event) => {
              const isKeyboardFocus = !isClickFocusRef.current;
              if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
                const entryFocusEvent = new CustomEvent(ENTRY_FOCUS, EVENT_OPTIONS2);
                event.currentTarget.dispatchEvent(entryFocusEvent);
                if (!entryFocusEvent.defaultPrevented) {
                  const items = getItems().filter((item) => item.focusable);
                  const activeItem = items.find((item) => item.active);
                  const currentItem = items.find((item) => item.id === currentTabStopId);
                  const candidateItems = [activeItem, currentItem, ...items].filter(
                    Boolean
                  );
                  const candidateNodes = candidateItems.map((item) => item.ref.current);
                  focusFirst2(candidateNodes, preventScrollOnEntryFocus);
                }
              }
              isClickFocusRef.current = false;
            }),
            onBlur: composeEventHandlers(props.onBlur, () => setIsTabbingBackOut(false))
          }
        )
      }
    );
  });
  var ITEM_NAME = "RovingFocusGroupItem";
  var RovingFocusGroupItem = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeRovingFocusGroup,
        focusable = true,
        active = false,
        tabStopId,
        children,
        ...itemProps
      } = props;
      const autoId = useId2();
      const id = tabStopId || autoId;
      const context = useRovingFocusContext(ITEM_NAME, __scopeRovingFocusGroup);
      const isCurrentTabStop = context.currentTabStopId === id;
      const getItems = useCollection(__scopeRovingFocusGroup);
      const { onFocusableItemAdd, onFocusableItemRemove, currentTabStopId } = context;
      useEffect(() => {
        if (focusable) {
          onFocusableItemAdd();
          return () => onFocusableItemRemove();
        }
      }, [focusable, onFocusableItemAdd, onFocusableItemRemove]);
      return /* @__PURE__ */ jsx(
        Collection.ItemSlot,
        {
          scope: __scopeRovingFocusGroup,
          id,
          focusable,
          active,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              tabIndex: isCurrentTabStop ? 0 : -1,
              "data-orientation": context.orientation,
              ...itemProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!focusable) event.preventDefault();
                else context.onItemFocus(id);
              }),
              onFocus: composeEventHandlers(props.onFocus, () => context.onItemFocus(id)),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if (event.key === "Tab" && event.shiftKey) {
                  context.onItemShiftTab();
                  return;
                }
                if (event.target !== event.currentTarget) return;
                const focusIntent = getFocusIntent(event, context.orientation, context.dir);
                if (focusIntent !== void 0) {
                  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                  event.preventDefault();
                  const items = getItems().filter((item) => item.focusable);
                  let candidateNodes = items.map((item) => item.ref.current);
                  if (focusIntent === "last") candidateNodes.reverse();
                  else if (focusIntent === "prev" || focusIntent === "next") {
                    if (focusIntent === "prev") candidateNodes.reverse();
                    const currentIndex = candidateNodes.indexOf(event.currentTarget);
                    candidateNodes = context.loop ? wrapArray(candidateNodes, currentIndex + 1) : candidateNodes.slice(currentIndex + 1);
                  }
                  setTimeout(() => focusFirst2(candidateNodes));
                }
              }),
              children: typeof children === "function" ? children({ isCurrentTabStop, hasTabStop: currentTabStopId != null }) : children
            }
          )
        }
      );
    }
  );
  RovingFocusGroupItem.displayName = ITEM_NAME;
  var MAP_KEY_TO_FOCUS_INTENT = {
    ArrowLeft: "prev",
    ArrowUp: "prev",
    ArrowRight: "next",
    ArrowDown: "next",
    PageUp: "first",
    Home: "first",
    PageDown: "last",
    End: "last"
  };
  function getDirectionAwareKey(key, dir) {
    if (dir !== "rtl") return key;
    return key === "ArrowLeft" ? "ArrowRight" : key === "ArrowRight" ? "ArrowLeft" : key;
  }
  function getFocusIntent(event, orientation, dir) {
    const key = getDirectionAwareKey(event.key, dir);
    if (orientation === "vertical" && ["ArrowLeft", "ArrowRight"].includes(key)) return void 0;
    if (orientation === "horizontal" && ["ArrowUp", "ArrowDown"].includes(key)) return void 0;
    return MAP_KEY_TO_FOCUS_INTENT[key];
  }
  function focusFirst2(candidates, preventScroll = false) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus({ preventScroll });
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  function wrapArray(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  var Root3 = RovingFocusGroup;
  var Item = RovingFocusGroupItem;

  // ../../../node_modules/.pnpm/@radix-ui+react-menu@2.1.17_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react@_cc73edd868dbfc82392e3731b66f2e59/node_modules/@radix-ui/react-menu/dist/index.mjs
  var SELECTION_KEYS = ["Enter", " "];
  var FIRST_KEYS = ["ArrowDown", "PageUp", "Home"];
  var LAST_KEYS = ["ArrowUp", "PageDown", "End"];
  var FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
  var SUB_OPEN_KEYS = {
    ltr: [...SELECTION_KEYS, "ArrowRight"],
    rtl: [...SELECTION_KEYS, "ArrowLeft"]
  };
  var SUB_CLOSE_KEYS = {
    ltr: ["ArrowLeft"],
    rtl: ["ArrowRight"]
  };
  var MENU_NAME = "Menu";
  var [Collection2, useCollection2, createCollectionScope2] = createCollection(MENU_NAME);
  var [createMenuContext, createMenuScope] = createContextScope(MENU_NAME, [
    createCollectionScope2,
    createPopperScope,
    createRovingFocusGroupScope
  ]);
  var usePopperScope = createPopperScope();
  var useRovingFocusGroupScope = createRovingFocusGroupScope();
  var [MenuProvider, useMenuContext] = createMenuContext(MENU_NAME);
  var [MenuRootProvider, useMenuRootContext] = createMenuContext(MENU_NAME);
  var Menu = (props) => {
    const { __scopeMenu, open = false, children, dir, onOpenChange, modal = true } = props;
    const popperScope = usePopperScope(__scopeMenu);
    const [content, setContent] = useState(null);
    const isUsingKeyboardRef = useRef(false);
    const handleOpenChange = useCallbackRef(onOpenChange);
    const direction = useDirection(dir);
    useEffect(() => {
      const handleKeyDown = () => {
        isUsingKeyboardRef.current = true;
        document.addEventListener("pointerdown", handlePointer, { capture: true, once: true });
        document.addEventListener("pointermove", handlePointer, { capture: true, once: true });
      };
      const handlePointer = () => isUsingKeyboardRef.current = false;
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => {
        document.removeEventListener("keydown", handleKeyDown, { capture: true });
        document.removeEventListener("pointerdown", handlePointer, { capture: true });
        document.removeEventListener("pointermove", handlePointer, { capture: true });
      };
    }, []);
    return /* @__PURE__ */ jsx(Root22, { ...popperScope, children: /* @__PURE__ */ jsx(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ jsx(
          MenuRootProvider,
          {
            scope: __scopeMenu,
            onClose: useCallback(() => handleOpenChange(false), [handleOpenChange]),
            isUsingKeyboardRef,
            dir: direction,
            modal,
            children
          }
        )
      }
    ) });
  };
  Menu.displayName = MENU_NAME;
  var ANCHOR_NAME2 = "MenuAnchor";
  var MenuAnchor = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...anchorProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }
  );
  MenuAnchor.displayName = ANCHOR_NAME2;
  var PORTAL_NAME3 = "MenuPortal";
  var [PortalProvider2, usePortalContext2] = createMenuContext(PORTAL_NAME3, {
    forceMount: void 0
  });
  var MenuPortal = (props) => {
    const { __scopeMenu, forceMount, children, container } = props;
    const context = useMenuContext(PORTAL_NAME3, __scopeMenu);
    return /* @__PURE__ */ jsx(PortalProvider2, { scope: __scopeMenu, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  };
  MenuPortal.displayName = PORTAL_NAME3;
  var CONTENT_NAME3 = "MenuContent";
  var [MenuContentProvider, useMenuContentContext] = createMenuContext(CONTENT_NAME3);
  var MenuContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext2(CONTENT_NAME3, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, props.__scopeMenu);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: rootContext.modal ? /* @__PURE__ */ jsx(MenuRootContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(MenuRootContentNonModal, { ...contentProps, ref: forwardedRef }) }) }) });
    }
  );
  var MenuRootContentModal = forwardRef(
    (props, forwardedRef) => {
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      useEffect(() => {
        const content = ref.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        MenuContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          disableOutsideScroll: true,
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault(),
            { checkForDefaultPrevented: false }
          ),
          onDismiss: () => context.onOpenChange(false)
        }
      );
    }
  );
  var MenuRootContentNonModal = forwardRef((props, forwardedRef) => {
    const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
    return /* @__PURE__ */ jsx(
      MenuContentImpl,
      {
        ...props,
        ref: forwardedRef,
        trapFocus: false,
        disableOutsidePointerEvents: false,
        disableOutsideScroll: false,
        onDismiss: () => context.onOpenChange(false)
      }
    );
  });
  var Slot3 = createSlot("MenuContent.ScrollLock");
  var MenuContentImpl = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeMenu,
        loop = false,
        trapFocus,
        onOpenAutoFocus,
        onCloseAutoFocus,
        disableOutsidePointerEvents,
        onEntryFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        disableOutsideScroll,
        ...contentProps
      } = props;
      const context = useMenuContext(CONTENT_NAME3, __scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, __scopeMenu);
      const popperScope = usePopperScope(__scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const getItems = useCollection2(__scopeMenu);
      const [currentItemId, setCurrentItemId] = useState(null);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef, context.onContentChange);
      const timerRef = useRef(0);
      const searchRef = useRef("");
      const pointerGraceTimerRef = useRef(0);
      const pointerGraceIntentRef = useRef(null);
      const pointerDirRef = useRef("right");
      const lastPointerXRef = useRef(0);
      const ScrollLockWrapper = disableOutsideScroll ? Combination_default : Fragment;
      const scrollLockWrapperProps = disableOutsideScroll ? { as: Slot3, allowPinchZoom: true } : void 0;
      const handleTypeaheadSearch = (key) => {
        const search = searchRef.current + key;
        const items = getItems().filter((item) => !item.disabled);
        const currentItem = document.activeElement;
        const currentMatch = items.find((item) => item.ref.current === currentItem)?.textValue;
        const values = items.map((item) => item.textValue);
        const nextMatch = getNextMatch(values, search, currentMatch);
        const newItem = items.find((item) => item.textValue === nextMatch)?.ref.current;
        (function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        })(search);
        if (newItem) {
          setTimeout(() => newItem.focus());
        }
      };
      useEffect(() => {
        return () => window.clearTimeout(timerRef.current);
      }, []);
      useFocusGuards();
      const isPointerMovingToSubmenu = useCallback((event) => {
        const isMovingTowards = pointerDirRef.current === pointerGraceIntentRef.current?.side;
        return isMovingTowards && isPointerInGraceArea(event, pointerGraceIntentRef.current?.area);
      }, []);
      return /* @__PURE__ */ jsx(
        MenuContentProvider,
        {
          scope: __scopeMenu,
          searchRef,
          onItemEnter: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          onItemLeave: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) return;
              contentRef.current?.focus();
              setCurrentItemId(null);
            },
            [isPointerMovingToSubmenu]
          ),
          onTriggerLeave: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          pointerGraceTimerRef,
          onPointerGraceIntentChange: useCallback((intent) => {
            pointerGraceIntentRef.current = intent;
          }, []),
          children: /* @__PURE__ */ jsx(ScrollLockWrapper, { ...scrollLockWrapperProps, children: /* @__PURE__ */ jsx(
            FocusScope,
            {
              asChild: true,
              trapped: trapFocus,
              onMountAutoFocus: composeEventHandlers(onOpenAutoFocus, (event) => {
                event.preventDefault();
                contentRef.current?.focus({ preventScroll: true });
              }),
              onUnmountAutoFocus: onCloseAutoFocus,
              children: /* @__PURE__ */ jsx(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside,
                  onInteractOutside,
                  onDismiss,
                  children: /* @__PURE__ */ jsx(
                    Root3,
                    {
                      asChild: true,
                      ...rovingFocusGroupScope,
                      dir: rootContext.dir,
                      orientation: "vertical",
                      loop,
                      currentTabStopId: currentItemId,
                      onCurrentTabStopIdChange: setCurrentItemId,
                      onEntryFocus: composeEventHandlers(onEntryFocus, (event) => {
                        if (!rootContext.isUsingKeyboardRef.current) event.preventDefault();
                      }),
                      preventScrollOnEntryFocus: true,
                      children: /* @__PURE__ */ jsx(
                        Content2,
                        {
                          role: "menu",
                          "aria-orientation": "vertical",
                          "data-state": getOpenState(context.open),
                          "data-radix-menu-content": "",
                          dir: rootContext.dir,
                          ...popperScope,
                          ...contentProps,
                          ref: composedRefs,
                          style: { outline: "none", ...contentProps.style },
                          onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                            const target = event.target;
                            const isKeyDownInside = target.closest("[data-radix-menu-content]") === event.currentTarget;
                            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                            const isCharacterKey = event.key.length === 1;
                            if (isKeyDownInside) {
                              if (event.key === "Tab") event.preventDefault();
                              if (!isModifierKey && isCharacterKey) handleTypeaheadSearch(event.key);
                            }
                            const content = contentRef.current;
                            if (event.target !== content) return;
                            if (!FIRST_LAST_KEYS.includes(event.key)) return;
                            event.preventDefault();
                            const items = getItems().filter((item) => !item.disabled);
                            const candidateNodes = items.map((item) => item.ref.current);
                            if (LAST_KEYS.includes(event.key)) candidateNodes.reverse();
                            focusFirst3(candidateNodes);
                          }),
                          onBlur: composeEventHandlers(props.onBlur, (event) => {
                            if (!event.currentTarget.contains(event.target)) {
                              window.clearTimeout(timerRef.current);
                              searchRef.current = "";
                            }
                          }),
                          onPointerMove: composeEventHandlers(
                            props.onPointerMove,
                            whenMouse((event) => {
                              const target = event.target;
                              const pointerXHasChanged = lastPointerXRef.current !== event.clientX;
                              if (event.currentTarget.contains(target) && pointerXHasChanged) {
                                const newDir = event.clientX > lastPointerXRef.current ? "right" : "left";
                                pointerDirRef.current = newDir;
                                lastPointerXRef.current = event.clientX;
                              }
                            })
                          )
                        }
                      )
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }
  );
  MenuContent.displayName = CONTENT_NAME3;
  var GROUP_NAME2 = "MenuGroup";
  var MenuGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...groupProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { role: "group", ...groupProps, ref: forwardedRef });
    }
  );
  MenuGroup.displayName = GROUP_NAME2;
  var LABEL_NAME = "MenuLabel";
  var MenuLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...labelProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { ...labelProps, ref: forwardedRef });
    }
  );
  MenuLabel.displayName = LABEL_NAME;
  var ITEM_NAME2 = "MenuItem";
  var ITEM_SELECT = "menu.itemSelect";
  var MenuItem = forwardRef(
    (props, forwardedRef) => {
      const { disabled = false, onSelect, ...itemProps } = props;
      const ref = useRef(null);
      const rootContext = useMenuRootContext(ITEM_NAME2, props.__scopeMenu);
      const contentContext = useMenuContentContext(ITEM_NAME2, props.__scopeMenu);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const isPointerDownRef = useRef(false);
      const handleSelect = () => {
        const menuItem = ref.current;
        if (!disabled && menuItem) {
          const itemSelectEvent = new CustomEvent(ITEM_SELECT, { bubbles: true, cancelable: true });
          menuItem.addEventListener(ITEM_SELECT, (event) => onSelect?.(event), { once: true });
          dispatchDiscreteCustomEvent(menuItem, itemSelectEvent);
          if (itemSelectEvent.defaultPrevented) {
            isPointerDownRef.current = false;
          } else {
            rootContext.onClose();
          }
        }
      };
      return /* @__PURE__ */ jsx(
        MenuItemImpl,
        {
          ...itemProps,
          ref: composedRefs,
          disabled,
          onClick: composeEventHandlers(props.onClick, handleSelect),
          onPointerDown: (event) => {
            props.onPointerDown?.(event);
            isPointerDownRef.current = true;
          },
          onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
            if (!isPointerDownRef.current) event.currentTarget?.click();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (disabled || isTypingAhead && event.key === " ") return;
            if (SELECTION_KEYS.includes(event.key)) {
              event.currentTarget.click();
              event.preventDefault();
            }
          })
        }
      );
    }
  );
  MenuItem.displayName = ITEM_NAME2;
  var MenuItemImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, disabled = false, textValue, ...itemProps } = props;
      const contentContext = useMenuContentContext(ITEM_NAME2, __scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const [isFocused, setIsFocused] = useState(false);
      const [textContent, setTextContent] = useState("");
      useEffect(() => {
        const menuItem = ref.current;
        if (menuItem) {
          setTextContent((menuItem.textContent ?? "").trim());
        }
      }, [itemProps.children]);
      return /* @__PURE__ */ jsx(
        Collection2.ItemSlot,
        {
          scope: __scopeMenu,
          disabled,
          textValue: textValue ?? textContent,
          children: /* @__PURE__ */ jsx(Item, { asChild: true, ...rovingFocusGroupScope, focusable: !disabled, children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              role: "menuitem",
              "data-highlighted": isFocused ? "" : void 0,
              "aria-disabled": disabled || void 0,
              "data-disabled": disabled ? "" : void 0,
              ...itemProps,
              ref: composedRefs,
              onPointerMove: composeEventHandlers(
                props.onPointerMove,
                whenMouse((event) => {
                  if (disabled) {
                    contentContext.onItemLeave(event);
                  } else {
                    contentContext.onItemEnter(event);
                    if (!event.defaultPrevented) {
                      const item = event.currentTarget;
                      item.focus({ preventScroll: true });
                    }
                  }
                })
              ),
              onPointerLeave: composeEventHandlers(
                props.onPointerLeave,
                whenMouse((event) => contentContext.onItemLeave(event))
              ),
              onFocus: composeEventHandlers(props.onFocus, () => setIsFocused(true)),
              onBlur: composeEventHandlers(props.onBlur, () => setIsFocused(false))
            }
          ) })
        }
      );
    }
  );
  var CHECKBOX_ITEM_NAME = "MenuCheckboxItem";
  var MenuCheckboxItem = forwardRef(
    (props, forwardedRef) => {
      const { checked = false, onCheckedChange, ...checkboxItemProps } = props;
      return /* @__PURE__ */ jsx(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ jsx(
        MenuItem,
        {
          role: "menuitemcheckbox",
          "aria-checked": isIndeterminate2(checked) ? "mixed" : checked,
          ...checkboxItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            checkboxItemProps.onSelect,
            () => onCheckedChange?.(isIndeterminate2(checked) ? true : !checked),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }
  );
  MenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME;
  var RADIO_GROUP_NAME = "MenuRadioGroup";
  var [RadioGroupProvider, useRadioGroupContext] = createMenuContext(
    RADIO_GROUP_NAME,
    { value: void 0, onValueChange: () => {
    } }
  );
  var MenuRadioGroup = forwardRef(
    (props, forwardedRef) => {
      const { value, onValueChange, ...groupProps } = props;
      const handleValueChange = useCallbackRef(onValueChange);
      return /* @__PURE__ */ jsx(RadioGroupProvider, { scope: props.__scopeMenu, value, onValueChange: handleValueChange, children: /* @__PURE__ */ jsx(MenuGroup, { ...groupProps, ref: forwardedRef }) });
    }
  );
  MenuRadioGroup.displayName = RADIO_GROUP_NAME;
  var RADIO_ITEM_NAME = "MenuRadioItem";
  var MenuRadioItem = forwardRef(
    (props, forwardedRef) => {
      const { value, ...radioItemProps } = props;
      const context = useRadioGroupContext(RADIO_ITEM_NAME, props.__scopeMenu);
      const checked = value === context.value;
      return /* @__PURE__ */ jsx(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ jsx(
        MenuItem,
        {
          role: "menuitemradio",
          "aria-checked": checked,
          ...radioItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            radioItemProps.onSelect,
            () => context.onValueChange?.(value),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }
  );
  MenuRadioItem.displayName = RADIO_ITEM_NAME;
  var ITEM_INDICATOR_NAME = "MenuItemIndicator";
  var [ItemIndicatorProvider, useItemIndicatorContext] = createMenuContext(
    ITEM_INDICATOR_NAME,
    { checked: false }
  );
  var MenuItemIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, forceMount, ...itemIndicatorProps } = props;
      const indicatorContext = useItemIndicatorContext(ITEM_INDICATOR_NAME, __scopeMenu);
      return /* @__PURE__ */ jsx(
        Presence,
        {
          present: forceMount || isIndeterminate2(indicatorContext.checked) || indicatorContext.checked === true,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              ...itemIndicatorProps,
              ref: forwardedRef,
              "data-state": getCheckedState(indicatorContext.checked)
            }
          )
        }
      );
    }
  );
  MenuItemIndicator.displayName = ITEM_INDICATOR_NAME;
  var SEPARATOR_NAME = "MenuSeparator";
  var MenuSeparator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          role: "separator",
          "aria-orientation": "horizontal",
          ...separatorProps,
          ref: forwardedRef
        }
      );
    }
  );
  MenuSeparator.displayName = SEPARATOR_NAME;
  var ARROW_NAME2 = "MenuArrow";
  var MenuArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...arrowProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }
  );
  MenuArrow.displayName = ARROW_NAME2;
  var SUB_NAME = "MenuSub";
  var [MenuSubProvider, useMenuSubContext] = createMenuContext(SUB_NAME);
  var MenuSub = (props) => {
    const { __scopeMenu, children, open = false, onOpenChange } = props;
    const parentMenuContext = useMenuContext(SUB_NAME, __scopeMenu);
    const popperScope = usePopperScope(__scopeMenu);
    const [trigger, setTrigger] = useState(null);
    const [content, setContent] = useState(null);
    const handleOpenChange = useCallbackRef(onOpenChange);
    useEffect(() => {
      if (parentMenuContext.open === false) handleOpenChange(false);
      return () => handleOpenChange(false);
    }, [parentMenuContext.open, handleOpenChange]);
    return /* @__PURE__ */ jsx(Root22, { ...popperScope, children: /* @__PURE__ */ jsx(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ jsx(
          MenuSubProvider,
          {
            scope: __scopeMenu,
            contentId: useId2(),
            triggerId: useId2(),
            trigger,
            onTriggerChange: setTrigger,
            children
          }
        )
      }
    ) });
  };
  MenuSub.displayName = SUB_NAME;
  var SUB_TRIGGER_NAME = "MenuSubTrigger";
  var MenuSubTrigger = forwardRef(
    (props, forwardedRef) => {
      const context = useMenuContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const rootContext = useMenuRootContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const contentContext = useMenuContentContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const openTimerRef = useRef(null);
      const { pointerGraceTimerRef, onPointerGraceIntentChange } = contentContext;
      const scope = { __scopeMenu: props.__scopeMenu };
      const clearOpenTimer = useCallback(() => {
        if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }, []);
      useEffect(() => clearOpenTimer, [clearOpenTimer]);
      useEffect(() => {
        const pointerGraceTimer = pointerGraceTimerRef.current;
        return () => {
          window.clearTimeout(pointerGraceTimer);
          onPointerGraceIntentChange(null);
        };
      }, [pointerGraceTimerRef, onPointerGraceIntentChange]);
      return /* @__PURE__ */ jsx(MenuAnchor, { asChild: true, ...scope, children: /* @__PURE__ */ jsx(
        MenuItemImpl,
        {
          id: subContext.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? subContext.contentId : void 0,
          "data-state": getOpenState(context.open),
          ...props,
          ref: composeRefs(forwardedRef, subContext.onTriggerChange),
          onClick: (event) => {
            props.onClick?.(event);
            if (props.disabled || event.defaultPrevented) return;
            event.currentTarget.focus();
            if (!context.open) context.onOpenChange(true);
          },
          onPointerMove: composeEventHandlers(
            props.onPointerMove,
            whenMouse((event) => {
              contentContext.onItemEnter(event);
              if (event.defaultPrevented) return;
              if (!props.disabled && !context.open && !openTimerRef.current) {
                contentContext.onPointerGraceIntentChange(null);
                openTimerRef.current = window.setTimeout(() => {
                  context.onOpenChange(true);
                  clearOpenTimer();
                }, 100);
              }
            })
          ),
          onPointerLeave: composeEventHandlers(
            props.onPointerLeave,
            whenMouse((event) => {
              clearOpenTimer();
              const contentRect = context.content?.getBoundingClientRect();
              if (contentRect) {
                const side = context.content?.dataset.side;
                const rightSide = side === "right";
                const bleed = rightSide ? -5 : 5;
                const contentNearEdge = contentRect[rightSide ? "left" : "right"];
                const contentFarEdge = contentRect[rightSide ? "right" : "left"];
                contentContext.onPointerGraceIntentChange({
                  area: [
                    // Apply a bleed on clientX to ensure that our exit point is
                    // consistently within polygon bounds
                    { x: event.clientX + bleed, y: event.clientY },
                    { x: contentNearEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.bottom },
                    { x: contentNearEdge, y: contentRect.bottom }
                  ],
                  side
                });
                window.clearTimeout(pointerGraceTimerRef.current);
                pointerGraceTimerRef.current = window.setTimeout(
                  () => contentContext.onPointerGraceIntentChange(null),
                  300
                );
              } else {
                contentContext.onTriggerLeave(event);
                if (event.defaultPrevented) return;
                contentContext.onPointerGraceIntentChange(null);
              }
            })
          ),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (props.disabled || isTypingAhead && event.key === " ") return;
            if (SUB_OPEN_KEYS[rootContext.dir].includes(event.key)) {
              context.onOpenChange(true);
              context.content?.focus();
              event.preventDefault();
            }
          })
        }
      ) });
    }
  );
  MenuSubTrigger.displayName = SUB_TRIGGER_NAME;
  var SUB_CONTENT_NAME = "MenuSubContent";
  var MenuSubContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext2(CONTENT_NAME3, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, align = "start", ...subContentProps } = props;
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_CONTENT_NAME, props.__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(
        MenuContentImpl,
        {
          id: subContext.contentId,
          "aria-labelledby": subContext.triggerId,
          ...subContentProps,
          ref: composedRefs,
          align,
          side: rootContext.dir === "rtl" ? "left" : "right",
          disableOutsidePointerEvents: false,
          disableOutsideScroll: false,
          trapFocus: false,
          onOpenAutoFocus: (event) => {
            if (rootContext.isUsingKeyboardRef.current) ref.current?.focus();
            event.preventDefault();
          },
          onCloseAutoFocus: (event) => event.preventDefault(),
          onFocusOutside: composeEventHandlers(props.onFocusOutside, (event) => {
            if (event.target !== subContext.trigger) context.onOpenChange(false);
          }),
          onEscapeKeyDown: composeEventHandlers(props.onEscapeKeyDown, (event) => {
            rootContext.onClose();
            event.preventDefault();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            const isKeyDownInside = event.currentTarget.contains(event.target);
            const isCloseKey = SUB_CLOSE_KEYS[rootContext.dir].includes(event.key);
            if (isKeyDownInside && isCloseKey) {
              context.onOpenChange(false);
              subContext.trigger?.focus();
              event.preventDefault();
            }
          })
        }
      ) }) }) });
    }
  );
  MenuSubContent.displayName = SUB_CONTENT_NAME;
  function getOpenState(open) {
    return open ? "open" : "closed";
  }
  function isIndeterminate2(checked) {
    return checked === "indeterminate";
  }
  function getCheckedState(checked) {
    return isIndeterminate2(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }
  function focusFirst3(candidates) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus();
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  function wrapArray2(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  function getNextMatch(values, search, currentMatch) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
    let wrappedValues = wrapArray2(values, Math.max(currentMatchIndex, 0));
    const excludeCurrentMatch = normalizedSearch.length === 1;
    if (excludeCurrentMatch) wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
    const nextMatch = wrappedValues.find(
      (value) => value.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextMatch !== currentMatch ? nextMatch : void 0;
  }
  function isPointInPolygon(point, polygon) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const ii = polygon[i];
      const jj = polygon[j];
      const xi = ii.x;
      const yi = ii.y;
      const xj = jj.x;
      const yj = jj.y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function isPointerInGraceArea(event, area) {
    if (!area) return false;
    const cursorPos = { x: event.clientX, y: event.clientY };
    return isPointInPolygon(cursorPos, area);
  }
  function whenMouse(handler) {
    return (event) => event.pointerType === "mouse" ? handler(event) : void 0;
  }
  var Root32 = Menu;
  var Anchor2 = MenuAnchor;
  var Portal3 = MenuPortal;
  var Content22 = MenuContent;
  var Group = MenuGroup;
  var Label = MenuLabel;
  var Item2 = MenuItem;
  var CheckboxItem = MenuCheckboxItem;
  var RadioGroup = MenuRadioGroup;
  var RadioItem = MenuRadioItem;
  var ItemIndicator = MenuItemIndicator;
  var Separator = MenuSeparator;
  var Arrow22 = MenuArrow;
  var SubTrigger = MenuSubTrigger;
  var SubContent = MenuSubContent;

  // ../../../node_modules/.pnpm/@radix-ui+react-dropdown-menu@2.1.17_@types+react-dom@18.3.7_@types+react@18.3.31__@typ_9dd0889a66ea847559fd572aaa20379b/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs
  var DROPDOWN_MENU_NAME = "DropdownMenu";
  var [createDropdownMenuContext, createDropdownMenuScope] = createContextScope(
    DROPDOWN_MENU_NAME,
    [createMenuScope]
  );
  var useMenuScope = createMenuScope();
  var [DropdownMenuProvider, useDropdownMenuContext] = createDropdownMenuContext(DROPDOWN_MENU_NAME);
  var DropdownMenu = (props) => {
    const {
      __scopeDropdownMenu,
      children,
      dir,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const triggerRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DROPDOWN_MENU_NAME
    });
    return /* @__PURE__ */ jsx(
      DropdownMenuProvider,
      {
        scope: __scopeDropdownMenu,
        triggerId: useId2(),
        triggerRef,
        contentId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children: /* @__PURE__ */ jsx(Root32, { ...menuScope, open, onOpenChange: setOpen, dir, modal, children })
      }
    );
  };
  DropdownMenu.displayName = DROPDOWN_MENU_NAME;
  var TRIGGER_NAME3 = "DropdownMenuTrigger";
  var DropdownMenuTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, disabled = false, ...triggerProps } = props;
      const context = useDropdownMenuContext(TRIGGER_NAME3, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Anchor2, { asChild: true, ...menuScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          id: context.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": context.open ? "open" : "closed",
          "data-disabled": disabled ? "" : void 0,
          disabled,
          ...triggerProps,
          ref: composeRefs(forwardedRef, context.triggerRef),
          onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
            if (!disabled && event.button === 0 && event.ctrlKey === false) {
              context.onOpenToggle();
              if (!context.open) event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled) return;
            if (["Enter", " "].includes(event.key)) context.onOpenToggle();
            if (event.key === "ArrowDown") context.onOpenChange(true);
            if (["Enter", " ", "ArrowDown"].includes(event.key)) event.preventDefault();
          })
        }
      ) });
    }
  );
  DropdownMenuTrigger.displayName = TRIGGER_NAME3;
  var PORTAL_NAME4 = "DropdownMenuPortal";
  var DropdownMenuPortal = (props) => {
    const { __scopeDropdownMenu, ...portalProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Portal3, { ...menuScope, ...portalProps });
  };
  DropdownMenuPortal.displayName = PORTAL_NAME4;
  var CONTENT_NAME4 = "DropdownMenuContent";
  var DropdownMenuContent = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...contentProps } = props;
      const context = useDropdownMenuContext(CONTENT_NAME4, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const hasInteractedOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        Content22,
        {
          id: context.contentId,
          "aria-labelledby": context.triggerId,
          ...menuScope,
          ...contentProps,
          ref: forwardedRef,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
            hasInteractedOutsideRef.current = false;
            event.preventDefault();
          }),
          onInteractOutside: composeEventHandlers(props.onInteractOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (!context.modal || isRightClick) hasInteractedOutsideRef.current = true;
          }),
          style: {
            ...props.style,
            // re-namespace exposed content custom properties
            ...{
              "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
              "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
              "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
              "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
              "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
            }
          }
        }
      );
    }
  );
  DropdownMenuContent.displayName = CONTENT_NAME4;
  var GROUP_NAME3 = "DropdownMenuGroup";
  var DropdownMenuGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...groupProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Group, { ...menuScope, ...groupProps, ref: forwardedRef });
    }
  );
  DropdownMenuGroup.displayName = GROUP_NAME3;
  var LABEL_NAME2 = "DropdownMenuLabel";
  var DropdownMenuLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...labelProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Label, { ...menuScope, ...labelProps, ref: forwardedRef });
    }
  );
  DropdownMenuLabel.displayName = LABEL_NAME2;
  var ITEM_NAME3 = "DropdownMenuItem";
  var DropdownMenuItem = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...itemProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Item2, { ...menuScope, ...itemProps, ref: forwardedRef });
    }
  );
  DropdownMenuItem.displayName = ITEM_NAME3;
  var CHECKBOX_ITEM_NAME2 = "DropdownMenuCheckboxItem";
  var DropdownMenuCheckboxItem = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...checkboxItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(CheckboxItem, { ...menuScope, ...checkboxItemProps, ref: forwardedRef });
  });
  DropdownMenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME2;
  var RADIO_GROUP_NAME2 = "DropdownMenuRadioGroup";
  var DropdownMenuRadioGroup = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...radioGroupProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioGroup, { ...menuScope, ...radioGroupProps, ref: forwardedRef });
  });
  DropdownMenuRadioGroup.displayName = RADIO_GROUP_NAME2;
  var RADIO_ITEM_NAME2 = "DropdownMenuRadioItem";
  var DropdownMenuRadioItem = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...radioItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioItem, { ...menuScope, ...radioItemProps, ref: forwardedRef });
  });
  DropdownMenuRadioItem.displayName = RADIO_ITEM_NAME2;
  var INDICATOR_NAME2 = "DropdownMenuItemIndicator";
  var DropdownMenuItemIndicator = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...itemIndicatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(ItemIndicator, { ...menuScope, ...itemIndicatorProps, ref: forwardedRef });
  });
  DropdownMenuItemIndicator.displayName = INDICATOR_NAME2;
  var SEPARATOR_NAME2 = "DropdownMenuSeparator";
  var DropdownMenuSeparator = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...separatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Separator, { ...menuScope, ...separatorProps, ref: forwardedRef });
  });
  DropdownMenuSeparator.displayName = SEPARATOR_NAME2;
  var ARROW_NAME3 = "DropdownMenuArrow";
  var DropdownMenuArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...arrowProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Arrow22, { ...menuScope, ...arrowProps, ref: forwardedRef });
    }
  );
  DropdownMenuArrow.displayName = ARROW_NAME3;
  var SUB_TRIGGER_NAME2 = "DropdownMenuSubTrigger";
  var DropdownMenuSubTrigger = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...subTriggerProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(SubTrigger, { ...menuScope, ...subTriggerProps, ref: forwardedRef });
  });
  DropdownMenuSubTrigger.displayName = SUB_TRIGGER_NAME2;
  var SUB_CONTENT_NAME2 = "DropdownMenuSubContent";
  var DropdownMenuSubContent = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...subContentProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(
      SubContent,
      {
        ...menuScope,
        ...subContentProps,
        ref: forwardedRef,
        style: {
          ...props.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
            "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
            "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  });
  DropdownMenuSubContent.displayName = SUB_CONTENT_NAME2;
  var Root23 = DropdownMenu;
  var Trigger2 = DropdownMenuTrigger;
  var Portal22 = DropdownMenuPortal;
  var Content23 = DropdownMenuContent;
  var Label2 = DropdownMenuLabel;
  var Item22 = DropdownMenuItem;
  var CheckboxItem2 = DropdownMenuCheckboxItem;
  var RadioGroup2 = DropdownMenuRadioGroup;
  var RadioItem2 = DropdownMenuRadioItem;
  var ItemIndicator2 = DropdownMenuItemIndicator;
  var Separator2 = DropdownMenuSeparator;
  var SubTrigger2 = DropdownMenuSubTrigger;
  var SubContent2 = DropdownMenuSubContent;

  // ../../../packages/shadcn-ui/src/components/dropdown-menu.tsx
  var DropdownMenu2 = Root23;
  var DropdownMenuTrigger2 = Trigger2;
  var DropdownMenuRadioGroup2 = RadioGroup2;
  var DropdownMenuSubTrigger2 = forwardRef(
    ({ className, inset, children, ...props }, ref) => createElement(
      SubTrigger2,
      {
        ref,
        className: cn("xps-dropdown-menu-sub-trigger", inset && "xps-dropdown-menu-item--inset", className),
        ...props
      },
      children,
      createElement(ChevronRight, { className: "xps-icon" })
    )
  );
  DropdownMenuSubTrigger2.displayName = SubTrigger2.displayName;
  var DropdownMenuSubContent2 = forwardRef(
    ({ className, ...props }, ref) => createElement(SubContent2, {
      ref,
      className: cn("xps-dropdown-menu-content", className),
      ...props
    })
  );
  DropdownMenuSubContent2.displayName = SubContent2.displayName;
  var DropdownMenuContent2 = forwardRef(
    ({ className, sideOffset = 4, ...props }, ref) => createElement(
      Portal22,
      null,
      createElement(Content23, {
        ref,
        sideOffset,
        className: cn("xps-dropdown-menu-content", className),
        ...props
      })
    )
  );
  DropdownMenuContent2.displayName = Content23.displayName;
  var DropdownMenuItem2 = forwardRef(
    ({ className, inset, ...props }, ref) => createElement(Item22, {
      ref,
      className: cn("xps-dropdown-menu-item", inset && "xps-dropdown-menu-item--inset", className),
      ...props
    })
  );
  DropdownMenuItem2.displayName = Item22.displayName;
  var DropdownMenuCheckboxItem2 = forwardRef(
    ({ className, children, checked, ...props }, ref) => createElement(
      CheckboxItem2,
      {
        ref,
        className: cn("xps-dropdown-menu-item xps-dropdown-menu-check-item", className),
        checked,
        ...props
      },
      createElement(
        "span",
        { className: "xps-dropdown-menu-item-indicator" },
        createElement(
          ItemIndicator2,
          null,
          createElement(Check, { className: "xps-icon" })
        )
      ),
      children
    )
  );
  DropdownMenuCheckboxItem2.displayName = CheckboxItem2.displayName;
  var DropdownMenuRadioItem2 = forwardRef(
    ({ className, children, ...props }, ref) => createElement(
      RadioItem2,
      {
        ref,
        className: cn("xps-dropdown-menu-item xps-dropdown-menu-check-item", className),
        ...props
      },
      createElement(
        "span",
        { className: "xps-dropdown-menu-item-indicator" },
        createElement(
          ItemIndicator2,
          null,
          createElement(Circle, { className: "xps-icon xps-icon--filled" })
        )
      ),
      children
    )
  );
  DropdownMenuRadioItem2.displayName = RadioItem2.displayName;
  var DropdownMenuLabel2 = forwardRef(
    ({ className, inset, ...props }, ref) => createElement(Label2, {
      ref,
      className: cn("xps-dropdown-menu-label", inset && "xps-dropdown-menu-item--inset", className),
      ...props
    })
  );
  DropdownMenuLabel2.displayName = Label2.displayName;
  var DropdownMenuSeparator2 = forwardRef(
    ({ className, ...props }, ref) => createElement(Separator2, {
      ref,
      className: cn("xps-dropdown-menu-separator", className),
      ...props
    })
  );
  DropdownMenuSeparator2.displayName = Separator2.displayName;
  var DropdownMenuShortcut = forwardRef(
    ({ className, ...props }, ref) => createElement("span", {
      ref,
      className: cn("xps-dropdown-menu-shortcut", className),
      ...props
    })
  );
  DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

  // ../../../packages/shadcn-ui/src/components/input.tsx
  var Input = forwardRef(({ className, type, ...props }, ref) => createElement("input", {
    ref,
    type,
    className: cn("xps-input", className),
    ...props
  }));
  Input.displayName = "Input";

  // ../../../node_modules/.pnpm/@radix-ui+number@1.1.2/node_modules/@radix-ui/number/dist/index.mjs
  function clamp2(value, [min2, max2]) {
    return Math.min(max2, Math.max(min2, value));
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-scroll-area@1.2.11_@types+react-dom@18.3.7_@types+react@18.3.31__@types_11143bec678d1605a26ae97f1f701c82/node_modules/@radix-ui/react-scroll-area/dist/index.mjs
  function useStateMachine2(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  var SCROLL_AREA_NAME = "ScrollArea";
  var [createScrollAreaContext, createScrollAreaScope] = createContextScope(SCROLL_AREA_NAME);
  var [ScrollAreaProvider, useScrollAreaContext] = createScrollAreaContext(SCROLL_AREA_NAME);
  var ScrollArea = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeScrollArea,
        type = "hover",
        dir,
        scrollHideDelay = 600,
        ...scrollAreaProps
      } = props;
      const [scrollArea, setScrollArea] = useState(null);
      const [viewport, setViewport] = useState(null);
      const [content, setContent] = useState(null);
      const [scrollbarX, setScrollbarX] = useState(null);
      const [scrollbarY, setScrollbarY] = useState(null);
      const [cornerWidth, setCornerWidth] = useState(0);
      const [cornerHeight, setCornerHeight] = useState(0);
      const [scrollbarXEnabled, setScrollbarXEnabled] = useState(false);
      const [scrollbarYEnabled, setScrollbarYEnabled] = useState(false);
      const composedRefs = useComposedRefs(forwardedRef, (node) => setScrollArea(node));
      const direction = useDirection(dir);
      return /* @__PURE__ */ jsx(
        ScrollAreaProvider,
        {
          scope: __scopeScrollArea,
          type,
          dir: direction,
          scrollHideDelay,
          scrollArea,
          viewport,
          onViewportChange: setViewport,
          content,
          onContentChange: setContent,
          scrollbarX,
          onScrollbarXChange: setScrollbarX,
          scrollbarXEnabled,
          onScrollbarXEnabledChange: setScrollbarXEnabled,
          scrollbarY,
          onScrollbarYChange: setScrollbarY,
          scrollbarYEnabled,
          onScrollbarYEnabledChange: setScrollbarYEnabled,
          onCornerWidthChange: setCornerWidth,
          onCornerHeightChange: setCornerHeight,
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              dir: direction,
              ...scrollAreaProps,
              ref: composedRefs,
              style: {
                position: "relative",
                // Pass corner sizes as CSS vars to reduce re-renders of context consumers
                "--radix-scroll-area-corner-width": cornerWidth + "px",
                "--radix-scroll-area-corner-height": cornerHeight + "px",
                ...props.style
              }
            }
          )
        }
      );
    }
  );
  ScrollArea.displayName = SCROLL_AREA_NAME;
  var VIEWPORT_NAME = "ScrollAreaViewport";
  var ScrollAreaViewport = forwardRef(
    (props, forwardedRef) => {
      const { __scopeScrollArea, children, nonce, ...viewportProps } = props;
      const context = useScrollAreaContext(VIEWPORT_NAME, __scopeScrollArea);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref, context.onViewportChange);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: `[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`
            },
            nonce
          }
        ),
        /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-radix-scroll-area-viewport": "",
            ...viewportProps,
            ref: composedRefs,
            style: {
              /**
               * We don't support `visible` because the intention is to have at least one scrollbar
               * if this component is used and `visible` will behave like `auto` in that case
               * https://developer.mozilla.org/en-US/docs/Web/CSS/overflow#description
               *
               * We don't handle `auto` because the intention is for the native implementation
               * to be hidden if using this component. We just want to ensure the node is scrollable
               * so could have used either `scroll` or `auto` here. We picked `scroll` to prevent
               * the browser from having to work out whether to render native scrollbars or not,
               * we tell it to with the intention of hiding them in CSS.
               */
              overflowX: context.scrollbarXEnabled ? "scroll" : "hidden",
              overflowY: context.scrollbarYEnabled ? "scroll" : "hidden",
              ...props.style
            },
            children: /* @__PURE__ */ jsx("div", { ref: context.onContentChange, style: { minWidth: "100%", display: "table" }, children })
          }
        )
      ] });
    }
  );
  ScrollAreaViewport.displayName = VIEWPORT_NAME;
  var SCROLLBAR_NAME = "ScrollAreaScrollbar";
  var ScrollAreaScrollbar = forwardRef(
    (props, forwardedRef) => {
      const { forceMount, ...scrollbarProps } = props;
      const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
      const { onScrollbarXEnabledChange, onScrollbarYEnabledChange } = context;
      const isHorizontal = props.orientation === "horizontal";
      useEffect(() => {
        isHorizontal ? onScrollbarXEnabledChange(true) : onScrollbarYEnabledChange(true);
        return () => {
          isHorizontal ? onScrollbarXEnabledChange(false) : onScrollbarYEnabledChange(false);
        };
      }, [isHorizontal, onScrollbarXEnabledChange, onScrollbarYEnabledChange]);
      return context.type === "hover" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarHover, { ...scrollbarProps, ref: forwardedRef, forceMount }) : context.type === "scroll" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarScroll, { ...scrollbarProps, ref: forwardedRef, forceMount }) : context.type === "auto" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarAuto, { ...scrollbarProps, ref: forwardedRef, forceMount }) : context.type === "always" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarVisible, { ...scrollbarProps, ref: forwardedRef, "data-state": "visible" }) : null;
    }
  );
  ScrollAreaScrollbar.displayName = SCROLLBAR_NAME;
  var ScrollAreaScrollbarHover = forwardRef((props, forwardedRef) => {
    const { forceMount, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
      const scrollArea = context.scrollArea;
      let hideTimer = 0;
      if (scrollArea) {
        const handlePointerEnter = () => {
          window.clearTimeout(hideTimer);
          setVisible(true);
        };
        const handlePointerLeave = () => {
          hideTimer = window.setTimeout(() => setVisible(false), context.scrollHideDelay);
        };
        scrollArea.addEventListener("pointerenter", handlePointerEnter);
        scrollArea.addEventListener("pointerleave", handlePointerLeave);
        return () => {
          window.clearTimeout(hideTimer);
          scrollArea.removeEventListener("pointerenter", handlePointerEnter);
          scrollArea.removeEventListener("pointerleave", handlePointerLeave);
        };
      }
    }, [context.scrollArea, context.scrollHideDelay]);
    return /* @__PURE__ */ jsx(Presence, { present: forceMount || visible, children: /* @__PURE__ */ jsx(
      ScrollAreaScrollbarAuto,
      {
        "data-state": visible ? "visible" : "hidden",
        ...scrollbarProps,
        ref: forwardedRef
      }
    ) });
  });
  var ScrollAreaScrollbarScroll = forwardRef((props, forwardedRef) => {
    const { forceMount, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const isHorizontal = props.orientation === "horizontal";
    const debounceScrollEnd = useDebounceCallback(() => send("SCROLL_END"), 100);
    const [state, send] = useStateMachine2("hidden", {
      hidden: {
        SCROLL: "scrolling"
      },
      scrolling: {
        SCROLL_END: "idle",
        POINTER_ENTER: "interacting"
      },
      interacting: {
        SCROLL: "interacting",
        POINTER_LEAVE: "idle"
      },
      idle: {
        HIDE: "hidden",
        SCROLL: "scrolling",
        POINTER_ENTER: "interacting"
      }
    });
    useEffect(() => {
      if (state === "idle") {
        const hideTimer = window.setTimeout(() => send("HIDE"), context.scrollHideDelay);
        return () => window.clearTimeout(hideTimer);
      }
    }, [state, context.scrollHideDelay, send]);
    useEffect(() => {
      const viewport = context.viewport;
      const scrollDirection = isHorizontal ? "scrollLeft" : "scrollTop";
      if (viewport) {
        let prevScrollPos = viewport[scrollDirection];
        const handleScroll2 = () => {
          const scrollPos = viewport[scrollDirection];
          const hasScrollInDirectionChanged = prevScrollPos !== scrollPos;
          if (hasScrollInDirectionChanged) {
            send("SCROLL");
            debounceScrollEnd();
          }
          prevScrollPos = scrollPos;
        };
        viewport.addEventListener("scroll", handleScroll2);
        return () => viewport.removeEventListener("scroll", handleScroll2);
      }
    }, [context.viewport, isHorizontal, send, debounceScrollEnd]);
    return /* @__PURE__ */ jsx(Presence, { present: forceMount || state !== "hidden", children: /* @__PURE__ */ jsx(
      ScrollAreaScrollbarVisible,
      {
        "data-state": state === "hidden" ? "hidden" : "visible",
        ...scrollbarProps,
        ref: forwardedRef,
        onPointerEnter: composeEventHandlers(props.onPointerEnter, () => send("POINTER_ENTER")),
        onPointerLeave: composeEventHandlers(props.onPointerLeave, () => send("POINTER_LEAVE"))
      }
    ) });
  });
  var ScrollAreaScrollbarAuto = forwardRef((props, forwardedRef) => {
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const { forceMount, ...scrollbarProps } = props;
    const [visible, setVisible] = useState(false);
    const isHorizontal = props.orientation === "horizontal";
    const handleResize = useDebounceCallback(() => {
      if (context.viewport) {
        const isOverflowX = context.viewport.offsetWidth < context.viewport.scrollWidth;
        const isOverflowY = context.viewport.offsetHeight < context.viewport.scrollHeight;
        setVisible(isHorizontal ? isOverflowX : isOverflowY);
      }
    }, 10);
    useResizeObserver(context.viewport, handleResize);
    useResizeObserver(context.content, handleResize);
    return /* @__PURE__ */ jsx(Presence, { present: forceMount || visible, children: /* @__PURE__ */ jsx(
      ScrollAreaScrollbarVisible,
      {
        "data-state": visible ? "visible" : "hidden",
        ...scrollbarProps,
        ref: forwardedRef
      }
    ) });
  });
  var ScrollAreaScrollbarVisible = forwardRef((props, forwardedRef) => {
    const { orientation = "vertical", ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const thumbRef = useRef(null);
    const pointerOffsetRef = useRef(0);
    const [sizes, setSizes] = useState({
      content: 0,
      viewport: 0,
      scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 }
    });
    const thumbRatio = getThumbRatio(sizes.viewport, sizes.content);
    const commonProps = {
      ...scrollbarProps,
      sizes,
      onSizesChange: setSizes,
      hasThumb: Boolean(thumbRatio > 0 && thumbRatio < 1),
      onThumbChange: (thumb) => thumbRef.current = thumb,
      onThumbPointerUp: () => pointerOffsetRef.current = 0,
      onThumbPointerDown: (pointerPos) => pointerOffsetRef.current = pointerPos
    };
    function getScrollPosition(pointerPos, dir) {
      return getScrollPositionFromPointer(pointerPos, pointerOffsetRef.current, sizes, dir);
    }
    if (orientation === "horizontal") {
      return /* @__PURE__ */ jsx(
        ScrollAreaScrollbarX,
        {
          ...commonProps,
          ref: forwardedRef,
          onThumbPositionChange: () => {
            if (context.viewport && thumbRef.current) {
              const scrollPos = context.viewport.scrollLeft;
              const offset4 = getThumbOffsetFromScroll(scrollPos, sizes, context.dir);
              thumbRef.current.style.transform = `translate3d(${offset4}px, 0, 0)`;
            }
          },
          onWheelScroll: (scrollPos) => {
            if (context.viewport) context.viewport.scrollLeft = scrollPos;
          },
          onDragScroll: (pointerPos) => {
            if (context.viewport) {
              context.viewport.scrollLeft = getScrollPosition(pointerPos, context.dir);
            }
          }
        }
      );
    }
    if (orientation === "vertical") {
      return /* @__PURE__ */ jsx(
        ScrollAreaScrollbarY,
        {
          ...commonProps,
          ref: forwardedRef,
          onThumbPositionChange: () => {
            if (context.viewport && thumbRef.current) {
              const scrollPos = context.viewport.scrollTop;
              const offset4 = getThumbOffsetFromScroll(scrollPos, sizes);
              thumbRef.current.style.transform = `translate3d(0, ${offset4}px, 0)`;
            }
          },
          onWheelScroll: (scrollPos) => {
            if (context.viewport) context.viewport.scrollTop = scrollPos;
          },
          onDragScroll: (pointerPos) => {
            if (context.viewport) context.viewport.scrollTop = getScrollPosition(pointerPos);
          }
        }
      );
    }
    return null;
  });
  var ScrollAreaScrollbarX = forwardRef((props, forwardedRef) => {
    const { sizes, onSizesChange, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [computedStyle, setComputedStyle] = useState();
    const ref = useRef(null);
    const composeRefs2 = useComposedRefs(forwardedRef, ref, context.onScrollbarXChange);
    useEffect(() => {
      if (ref.current) setComputedStyle(getComputedStyle(ref.current));
    }, [ref]);
    return /* @__PURE__ */ jsx(
      ScrollAreaScrollbarImpl,
      {
        "data-orientation": "horizontal",
        ...scrollbarProps,
        ref: composeRefs2,
        sizes,
        style: {
          bottom: 0,
          left: context.dir === "rtl" ? "var(--radix-scroll-area-corner-width)" : 0,
          right: context.dir === "ltr" ? "var(--radix-scroll-area-corner-width)" : 0,
          "--radix-scroll-area-thumb-width": getThumbSize(sizes) + "px",
          ...props.style
        },
        onThumbPointerDown: (pointerPos) => props.onThumbPointerDown(pointerPos.x),
        onDragScroll: (pointerPos) => props.onDragScroll(pointerPos.x),
        onWheelScroll: (event, maxScrollPos) => {
          if (context.viewport) {
            const scrollPos = context.viewport.scrollLeft + event.deltaX;
            props.onWheelScroll(scrollPos);
            if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
              event.preventDefault();
            }
          }
        },
        onResize: () => {
          if (ref.current && context.viewport && computedStyle) {
            onSizesChange({
              content: context.viewport.scrollWidth,
              viewport: context.viewport.offsetWidth,
              scrollbar: {
                size: ref.current.clientWidth,
                paddingStart: toInt(computedStyle.paddingLeft),
                paddingEnd: toInt(computedStyle.paddingRight)
              }
            });
          }
        }
      }
    );
  });
  var ScrollAreaScrollbarY = forwardRef((props, forwardedRef) => {
    const { sizes, onSizesChange, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [computedStyle, setComputedStyle] = useState();
    const ref = useRef(null);
    const composeRefs2 = useComposedRefs(forwardedRef, ref, context.onScrollbarYChange);
    useEffect(() => {
      if (ref.current) setComputedStyle(getComputedStyle(ref.current));
    }, [ref]);
    return /* @__PURE__ */ jsx(
      ScrollAreaScrollbarImpl,
      {
        "data-orientation": "vertical",
        ...scrollbarProps,
        ref: composeRefs2,
        sizes,
        style: {
          top: 0,
          right: context.dir === "ltr" ? 0 : void 0,
          left: context.dir === "rtl" ? 0 : void 0,
          bottom: "var(--radix-scroll-area-corner-height)",
          "--radix-scroll-area-thumb-height": getThumbSize(sizes) + "px",
          ...props.style
        },
        onThumbPointerDown: (pointerPos) => props.onThumbPointerDown(pointerPos.y),
        onDragScroll: (pointerPos) => props.onDragScroll(pointerPos.y),
        onWheelScroll: (event, maxScrollPos) => {
          if (context.viewport) {
            const scrollPos = context.viewport.scrollTop + event.deltaY;
            props.onWheelScroll(scrollPos);
            if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
              event.preventDefault();
            }
          }
        },
        onResize: () => {
          if (ref.current && context.viewport && computedStyle) {
            onSizesChange({
              content: context.viewport.scrollHeight,
              viewport: context.viewport.offsetHeight,
              scrollbar: {
                size: ref.current.clientHeight,
                paddingStart: toInt(computedStyle.paddingTop),
                paddingEnd: toInt(computedStyle.paddingBottom)
              }
            });
          }
        }
      }
    );
  });
  var [ScrollbarProvider, useScrollbarContext] = createScrollAreaContext(SCROLLBAR_NAME);
  var ScrollAreaScrollbarImpl = forwardRef((props, forwardedRef) => {
    const {
      __scopeScrollArea,
      sizes,
      hasThumb,
      onThumbChange,
      onThumbPointerUp,
      onThumbPointerDown,
      onThumbPositionChange,
      onDragScroll,
      onWheelScroll,
      onResize,
      ...scrollbarProps
    } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, __scopeScrollArea);
    const [scrollbar, setScrollbar] = useState(null);
    const composeRefs2 = useComposedRefs(forwardedRef, (node) => setScrollbar(node));
    const rectRef = useRef(null);
    const prevWebkitUserSelectRef = useRef("");
    const viewport = context.viewport;
    const maxScrollPos = sizes.content - sizes.viewport;
    const handleWheelScroll = useCallbackRef(onWheelScroll);
    const handleThumbPositionChange = useCallbackRef(onThumbPositionChange);
    const handleResize = useDebounceCallback(onResize, 10);
    function handleDragScroll(event) {
      if (rectRef.current) {
        const x = event.clientX - rectRef.current.left;
        const y = event.clientY - rectRef.current.top;
        onDragScroll({ x, y });
      }
    }
    useEffect(() => {
      const handleWheel = (event) => {
        const element = event.target;
        const isScrollbarWheel = scrollbar?.contains(element);
        if (isScrollbarWheel) handleWheelScroll(event, maxScrollPos);
      };
      document.addEventListener("wheel", handleWheel, { passive: false });
      return () => document.removeEventListener("wheel", handleWheel, { passive: false });
    }, [viewport, scrollbar, maxScrollPos, handleWheelScroll]);
    useEffect(handleThumbPositionChange, [sizes, handleThumbPositionChange]);
    useResizeObserver(scrollbar, handleResize);
    useResizeObserver(context.content, handleResize);
    return /* @__PURE__ */ jsx(
      ScrollbarProvider,
      {
        scope: __scopeScrollArea,
        scrollbar,
        hasThumb,
        onThumbChange: useCallbackRef(onThumbChange),
        onThumbPointerUp: useCallbackRef(onThumbPointerUp),
        onThumbPositionChange: handleThumbPositionChange,
        onThumbPointerDown: useCallbackRef(onThumbPointerDown),
        children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            ...scrollbarProps,
            ref: composeRefs2,
            style: { position: "absolute", ...scrollbarProps.style },
            onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
              const mainPointer = 0;
              if (event.button === mainPointer) {
                const element = event.target;
                element.setPointerCapture(event.pointerId);
                rectRef.current = scrollbar.getBoundingClientRect();
                prevWebkitUserSelectRef.current = document.body.style.webkitUserSelect;
                document.body.style.webkitUserSelect = "none";
                if (context.viewport) context.viewport.style.scrollBehavior = "auto";
                handleDragScroll(event);
              }
            }),
            onPointerMove: composeEventHandlers(props.onPointerMove, handleDragScroll),
            onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
              const element = event.target;
              if (element.hasPointerCapture(event.pointerId)) {
                element.releasePointerCapture(event.pointerId);
              }
              document.body.style.webkitUserSelect = prevWebkitUserSelectRef.current;
              if (context.viewport) context.viewport.style.scrollBehavior = "";
              rectRef.current = null;
            })
          }
        )
      }
    );
  });
  var THUMB_NAME = "ScrollAreaThumb";
  var ScrollAreaThumb = forwardRef(
    (props, forwardedRef) => {
      const { forceMount, ...thumbProps } = props;
      const scrollbarContext = useScrollbarContext(THUMB_NAME, props.__scopeScrollArea);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || scrollbarContext.hasThumb, children: /* @__PURE__ */ jsx(ScrollAreaThumbImpl, { ref: forwardedRef, ...thumbProps }) });
    }
  );
  var ScrollAreaThumbImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeScrollArea, style, ...thumbProps } = props;
      const scrollAreaContext = useScrollAreaContext(THUMB_NAME, __scopeScrollArea);
      const scrollbarContext = useScrollbarContext(THUMB_NAME, __scopeScrollArea);
      const { onThumbPositionChange } = scrollbarContext;
      const composedRef = useComposedRefs(
        forwardedRef,
        (node) => scrollbarContext.onThumbChange(node)
      );
      const removeUnlinkedScrollListenerRef = useRef(void 0);
      const debounceScrollEnd = useDebounceCallback(() => {
        if (removeUnlinkedScrollListenerRef.current) {
          removeUnlinkedScrollListenerRef.current();
          removeUnlinkedScrollListenerRef.current = void 0;
        }
      }, 100);
      useEffect(() => {
        const viewport = scrollAreaContext.viewport;
        if (viewport) {
          const handleScroll2 = () => {
            debounceScrollEnd();
            if (!removeUnlinkedScrollListenerRef.current) {
              const listener = addUnlinkedScrollListener(viewport, onThumbPositionChange);
              removeUnlinkedScrollListenerRef.current = listener;
              onThumbPositionChange();
            }
          };
          onThumbPositionChange();
          viewport.addEventListener("scroll", handleScroll2);
          return () => viewport.removeEventListener("scroll", handleScroll2);
        }
      }, [scrollAreaContext.viewport, debounceScrollEnd, onThumbPositionChange]);
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-state": scrollbarContext.hasThumb ? "visible" : "hidden",
          ...thumbProps,
          ref: composedRef,
          style: {
            width: "var(--radix-scroll-area-thumb-width)",
            height: "var(--radix-scroll-area-thumb-height)",
            ...style
          },
          onPointerDownCapture: composeEventHandlers(props.onPointerDownCapture, (event) => {
            const thumb = event.target;
            const thumbRect = thumb.getBoundingClientRect();
            const x = event.clientX - thumbRect.left;
            const y = event.clientY - thumbRect.top;
            scrollbarContext.onThumbPointerDown({ x, y });
          }),
          onPointerUp: composeEventHandlers(props.onPointerUp, scrollbarContext.onThumbPointerUp)
        }
      );
    }
  );
  ScrollAreaThumb.displayName = THUMB_NAME;
  var CORNER_NAME = "ScrollAreaCorner";
  var ScrollAreaCorner = forwardRef(
    (props, forwardedRef) => {
      const context = useScrollAreaContext(CORNER_NAME, props.__scopeScrollArea);
      const hasBothScrollbarsVisible = Boolean(context.scrollbarX && context.scrollbarY);
      const hasCorner = context.type !== "scroll" && hasBothScrollbarsVisible;
      return hasCorner ? /* @__PURE__ */ jsx(ScrollAreaCornerImpl, { ...props, ref: forwardedRef }) : null;
    }
  );
  ScrollAreaCorner.displayName = CORNER_NAME;
  var ScrollAreaCornerImpl = forwardRef((props, forwardedRef) => {
    const { __scopeScrollArea, ...cornerProps } = props;
    const context = useScrollAreaContext(CORNER_NAME, __scopeScrollArea);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const hasSize = Boolean(width && height);
    useResizeObserver(context.scrollbarX, () => {
      const height2 = context.scrollbarX?.offsetHeight || 0;
      context.onCornerHeightChange(height2);
      setHeight(height2);
    });
    useResizeObserver(context.scrollbarY, () => {
      const width2 = context.scrollbarY?.offsetWidth || 0;
      context.onCornerWidthChange(width2);
      setWidth(width2);
    });
    return hasSize ? /* @__PURE__ */ jsx(
      Primitive.div,
      {
        ...cornerProps,
        ref: forwardedRef,
        style: {
          width,
          height,
          position: "absolute",
          right: context.dir === "ltr" ? 0 : void 0,
          left: context.dir === "rtl" ? 0 : void 0,
          bottom: 0,
          ...props.style
        }
      }
    ) : null;
  });
  function toInt(value) {
    return value ? parseInt(value, 10) : 0;
  }
  function getThumbRatio(viewportSize, contentSize) {
    const ratio = viewportSize / contentSize;
    return isNaN(ratio) ? 0 : ratio;
  }
  function getThumbSize(sizes) {
    const ratio = getThumbRatio(sizes.viewport, sizes.content);
    const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
    const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;
    return Math.max(thumbSize, 18);
  }
  function getScrollPositionFromPointer(pointerPos, pointerOffset, sizes, dir = "ltr") {
    const thumbSizePx = getThumbSize(sizes);
    const thumbCenter = thumbSizePx / 2;
    const offset4 = pointerOffset || thumbCenter;
    const thumbOffsetFromEnd = thumbSizePx - offset4;
    const minPointerPos = sizes.scrollbar.paddingStart + offset4;
    const maxPointerPos = sizes.scrollbar.size - sizes.scrollbar.paddingEnd - thumbOffsetFromEnd;
    const maxScrollPos = sizes.content - sizes.viewport;
    const scrollRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
    const interpolate = linearScale([minPointerPos, maxPointerPos], scrollRange);
    return interpolate(pointerPos);
  }
  function getThumbOffsetFromScroll(scrollPos, sizes, dir = "ltr") {
    const thumbSizePx = getThumbSize(sizes);
    const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
    const scrollbar = sizes.scrollbar.size - scrollbarPadding;
    const maxScrollPos = sizes.content - sizes.viewport;
    const maxThumbPos = scrollbar - thumbSizePx;
    const scrollClampRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
    const scrollWithoutMomentum = clamp2(scrollPos, scrollClampRange);
    const interpolate = linearScale([0, maxScrollPos], [0, maxThumbPos]);
    return interpolate(scrollWithoutMomentum);
  }
  function linearScale(input, output) {
    return (value) => {
      if (input[0] === input[1] || output[0] === output[1]) return output[0];
      const ratio = (output[1] - output[0]) / (input[1] - input[0]);
      return output[0] + ratio * (value - input[0]);
    };
  }
  function isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos) {
    return scrollPos > 0 && scrollPos < maxScrollPos;
  }
  var addUnlinkedScrollListener = (node, handler = () => {
  }) => {
    let prevPosition = { left: node.scrollLeft, top: node.scrollTop };
    let rAF = 0;
    (function loop() {
      const position = { left: node.scrollLeft, top: node.scrollTop };
      const isHorizontalScroll = prevPosition.left !== position.left;
      const isVerticalScroll = prevPosition.top !== position.top;
      if (isHorizontalScroll || isVerticalScroll) handler();
      prevPosition = position;
      rAF = window.requestAnimationFrame(loop);
    })();
    return () => window.cancelAnimationFrame(rAF);
  };
  function useDebounceCallback(callback, delay) {
    const handleCallback = useCallbackRef(callback);
    const debounceTimerRef = useRef(0);
    useEffect(() => () => window.clearTimeout(debounceTimerRef.current), []);
    return useCallback(() => {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(handleCallback, delay);
    }, [handleCallback, delay]);
  }
  function useResizeObserver(element, onResize) {
    const handleResize = useCallbackRef(onResize);
    useLayoutEffect2(() => {
      let rAF = 0;
      if (element) {
        const resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(rAF);
          rAF = window.requestAnimationFrame(handleResize);
        });
        resizeObserver.observe(element);
        return () => {
          window.cancelAnimationFrame(rAF);
          resizeObserver.unobserve(element);
        };
      }
    }, [element, handleResize]);
  }
  var Root4 = ScrollArea;
  var Viewport = ScrollAreaViewport;
  var Corner = ScrollAreaCorner;

  // ../../../packages/shadcn-ui/src/components/scroll-area.tsx
  var ScrollArea2 = forwardRef(
    ({ className, children, ...props }, ref) => createElement(
      Root4,
      {
        ref,
        className: cn("xps-scroll-area", className),
        ...props
      },
      createElement(
        Viewport,
        { className: "xps-scroll-area-viewport" },
        children
      ),
      createElement(ScrollBar, null),
      createElement(Corner, null)
    )
  );
  ScrollArea2.displayName = Root4.displayName;
  var ScrollBar = forwardRef(
    ({ className, orientation = "vertical", ...props }, ref) => createElement(
      ScrollAreaScrollbar,
      {
        ref,
        orientation,
        className: cn("xps-scroll-bar", orientation === "vertical" ? "xps-scroll-bar-vertical" : "xps-scroll-bar-horizontal", className),
        ...props
      },
      createElement(ScrollAreaThumb, {
        className: "xps-scroll-thumb"
      })
    )
  );
  ScrollBar.displayName = ScrollAreaScrollbar.displayName;

  // ../../../node_modules/.pnpm/@radix-ui+react-visually-hidden@1.2.5_@types+react-dom@18.3.7_@types+react@18.3.31__@ty_fbf0dd0d68bb58b2410fc7a153ed1d9c/node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
  var VISUALLY_HIDDEN_STYLES = Object.freeze({
    // See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
    position: "absolute",
    border: 0,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    wordWrap: "normal"
  });
  var NAME2 = "VisuallyHidden";
  var VisuallyHidden = forwardRef(
    (props, forwardedRef) => {
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...props,
          ref: forwardedRef,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style }
        }
      );
    }
  );
  VisuallyHidden.displayName = NAME2;
  var Root5 = VisuallyHidden;

  // ../../../node_modules/.pnpm/@radix-ui+react-select@2.3.0_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react_b9232b5aa23e604443839e7a081b7527/node_modules/@radix-ui/react-select/dist/index.mjs
  var OPEN_KEYS = [" ", "Enter", "ArrowUp", "ArrowDown"];
  var SELECTION_KEYS2 = [" ", "Enter"];
  var SELECT_NAME = "Select";
  var [Collection3, useCollection3, createCollectionScope3] = createCollection(SELECT_NAME);
  var [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
    createCollectionScope3,
    createPopperScope
  ]);
  var usePopperScope2 = createPopperScope();
  var [SelectProviderImpl, useSelectContext] = createSelectContext(SELECT_NAME);
  var [SelectNativeOptionsProvider, useSelectNativeOptionsContext] = createSelectContext(SELECT_NAME);
  var PROVIDER_NAME = "SelectProvider";
  function SelectProvider(props) {
    const {
      __scopeSelect,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      value: valueProp,
      defaultValue,
      onValueChange,
      dir,
      name,
      autoComplete,
      disabled,
      required,
      form,
      // @ts-expect-error internal render prop used by `Select` to compose its default parts
      internal_do_not_use_render
    } = props;
    const popperScope = usePopperScope2(__scopeSelect);
    const [trigger, setTrigger] = useState(null);
    const [valueNode, setValueNode] = useState(null);
    const [valueNodeHasChildren, setValueNodeHasChildren] = useState(false);
    const direction = useDirection(dir);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: SELECT_NAME
    });
    const [value, setValue] = useControllableState({
      prop: valueProp,
      defaultProp: defaultValue,
      onChange: onValueChange,
      caller: SELECT_NAME
    });
    const triggerPointerDownPosRef = useRef(null);
    const isFormControl = trigger ? !!form || !!trigger.closest("form") : true;
    const [nativeOptionsSet, setNativeOptionsSet] = useState(/* @__PURE__ */ new Set());
    const contentId = useId2();
    const nativeSelectKey = Array.from(nativeOptionsSet).map((option) => option.props.value).join(";");
    const handleNativeOptionAdd = useCallback((option) => {
      setNativeOptionsSet((prev) => new Set(prev).add(option));
    }, []);
    const handleNativeOptionRemove = useCallback((option) => {
      setNativeOptionsSet((prev) => {
        const optionsSet = new Set(prev);
        optionsSet.delete(option);
        return optionsSet;
      });
    }, []);
    const context = {
      required,
      trigger,
      onTriggerChange: setTrigger,
      valueNode,
      onValueNodeChange: setValueNode,
      valueNodeHasChildren,
      onValueNodeHasChildrenChange: setValueNodeHasChildren,
      contentId,
      value,
      onValueChange: setValue,
      open,
      onOpenChange: setOpen,
      dir: direction,
      triggerPointerDownPosRef,
      disabled,
      name,
      autoComplete,
      form,
      nativeOptions: nativeOptionsSet,
      nativeSelectKey,
      isFormControl
    };
    return /* @__PURE__ */ jsx(Root22, { ...popperScope, children: /* @__PURE__ */ jsx(SelectProviderImpl, { scope: __scopeSelect, ...context, children: /* @__PURE__ */ jsx(Collection3.Provider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(
      SelectNativeOptionsProvider,
      {
        scope: __scopeSelect,
        onNativeOptionAdd: handleNativeOptionAdd,
        onNativeOptionRemove: handleNativeOptionRemove,
        children: isFunction3(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    ) }) }) });
  }
  SelectProvider.displayName = PROVIDER_NAME;
  var Select = (props) => {
    const { __scopeSelect, children, ...providerProps } = props;
    return /* @__PURE__ */ jsx(
      SelectProvider,
      {
        __scopeSelect,
        ...providerProps,
        internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
          children,
          isFormControl ? /* @__PURE__ */ jsx(
            SelectBubbleInput,
            {
              __scopeSelect
            }
          ) : null
        ] })
      }
    );
  };
  Select.displayName = SELECT_NAME;
  var TRIGGER_NAME4 = "SelectTrigger";
  var SelectTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, disabled = false, ...triggerProps } = props;
      const popperScope = usePopperScope2(__scopeSelect);
      const context = useSelectContext(TRIGGER_NAME4, __scopeSelect);
      const isDisabled = context.disabled || disabled;
      const composedRefs = useComposedRefs(forwardedRef, context.onTriggerChange);
      const getItems = useCollection3(__scopeSelect);
      const pointerTypeRef = useRef("touch");
      const [searchRef, handleTypeaheadSearch, resetTypeahead] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.value === context.value);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem !== void 0) {
          context.onValueChange(nextItem.value);
        }
      });
      const handleOpen = (pointerEvent) => {
        if (!isDisabled) {
          context.onOpenChange(true);
          resetTypeahead();
        }
        if (pointerEvent) {
          context.triggerPointerDownPosRef.current = {
            x: Math.round(pointerEvent.pageX),
            y: Math.round(pointerEvent.pageY)
          };
        }
      };
      return /* @__PURE__ */ jsx(Anchor, { asChild: true, ...popperScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          role: "combobox",
          "aria-controls": context.open ? context.contentId : void 0,
          "aria-expanded": context.open,
          "aria-required": context.required,
          "aria-autocomplete": "none",
          dir: context.dir,
          "data-state": context.open ? "open" : "closed",
          disabled: isDisabled,
          "data-disabled": isDisabled ? "" : void 0,
          "data-placeholder": shouldShowPlaceholder(context.value) ? "" : void 0,
          ...triggerProps,
          ref: composedRefs,
          onClick: composeEventHandlers(triggerProps.onClick, (event) => {
            event.currentTarget.focus();
            if (pointerTypeRef.current !== "mouse") {
              handleOpen(event);
            }
          }),
          onPointerDown: composeEventHandlers(triggerProps.onPointerDown, (event) => {
            pointerTypeRef.current = event.pointerType;
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) {
              target.releasePointerCapture(event.pointerId);
            }
            if (event.button === 0 && event.ctrlKey === false && event.pointerType === "mouse") {
              handleOpen(event);
              event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(triggerProps.onKeyDown, (event) => {
            const isTypingAhead = searchRef.current !== "";
            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
            if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
            if (isTypingAhead && event.key === " ") return;
            if (OPEN_KEYS.includes(event.key)) {
              handleOpen();
              event.preventDefault();
            }
          })
        }
      ) });
    }
  );
  SelectTrigger.displayName = TRIGGER_NAME4;
  var VALUE_NAME = "SelectValue";
  var SelectValue = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, className, style, children, placeholder = "", ...valueProps } = props;
      const context = useSelectContext(VALUE_NAME, __scopeSelect);
      const { onValueNodeHasChildrenChange } = context;
      const hasChildren = children !== void 0;
      const composedRefs = useComposedRefs(forwardedRef, context.onValueNodeChange);
      useLayoutEffect2(() => {
        onValueNodeHasChildrenChange(hasChildren);
      }, [onValueNodeHasChildrenChange, hasChildren]);
      const showPlaceholder = shouldShowPlaceholder(context.value);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...valueProps,
          asChild: showPlaceholder ? false : valueProps.asChild,
          ref: composedRefs,
          style: { pointerEvents: "none" },
          children: /* @__PURE__ */ jsx(Fragment, { children: showPlaceholder ? placeholder : children }, showPlaceholder ? "placeholder" : "value")
        }
      );
    }
  );
  SelectValue.displayName = VALUE_NAME;
  var ICON_NAME = "SelectIcon";
  var SelectIcon = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, children, ...iconProps } = props;
      return /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...iconProps, ref: forwardedRef, children: children || "\u25BC" });
    }
  );
  SelectIcon.displayName = ICON_NAME;
  var PORTAL_NAME5 = "SelectPortal";
  var [PortalProvider3, usePortalContext3] = createSelectContext(PORTAL_NAME5, {
    forceMount: void 0
  });
  var SelectPortal = (props) => {
    const { __scopeSelect, forceMount, ...portalProps } = props;
    return /* @__PURE__ */ jsx(PortalProvider3, { scope: props.__scopeSelect, forceMount, children: /* @__PURE__ */ jsx(Portal, { asChild: true, ...portalProps }) });
  };
  SelectPortal.displayName = PORTAL_NAME5;
  var CONTENT_NAME5 = "SelectContent";
  var SelectContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext3(CONTENT_NAME5, props.__scopeSelect);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useSelectContext(CONTENT_NAME5, props.__scopeSelect);
      const [fragment, setFragment] = useState();
      useLayoutEffect2(() => {
        setFragment(new DocumentFragment());
      }, []);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: ({ present }) => present ? /* @__PURE__ */ jsx(SelectContentImpl, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(SelectContentFragment, { ...contentProps, fragment }) });
    }
  );
  SelectContent.displayName = CONTENT_NAME5;
  var SelectContentFragment = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, children, fragment } = props;
    if (!fragment) return null;
    return createPortal(
      /* @__PURE__ */ jsx(SelectContentProvider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx("div", { ref: forwardedRef, children }) }) }),
      fragment
    );
  });
  SelectContentFragment.displayName = "SelectContentFragment";
  var CONTENT_MARGIN = 10;
  var [SelectContentProvider, useSelectContentContext] = createSelectContext(CONTENT_NAME5);
  var CONTENT_IMPL_NAME = "SelectContentImpl";
  var Slot4 = createSlot("SelectContent.RemoveScroll");
  var SelectContentImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect } = props;
      const {
        position = "item-aligned",
        onCloseAutoFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        //
        // PopperContent props
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions,
        //
        ...contentProps
      } = props;
      const context = useSelectContext(CONTENT_NAME5, __scopeSelect);
      const [content, setContent] = useState(null);
      const [viewport, setViewport] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, (node) => setContent(node));
      const [selectedItem, setSelectedItem] = useState(null);
      const [selectedItemText, setSelectedItemText] = useState(
        null
      );
      const getItems = useCollection3(__scopeSelect);
      const [isPositioned, setIsPositioned] = useState(false);
      const firstValidItemFoundRef = useRef(false);
      useEffect(() => {
        if (content) return hideOthers(content);
      }, [content]);
      useFocusGuards();
      const focusFirst4 = useCallback(
        (candidates) => {
          const [firstItem, ...restItems] = getItems().map((item) => item.ref.current);
          const [lastItem] = restItems.slice(-1);
          const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
          for (const candidate of candidates) {
            if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
            candidate?.scrollIntoView({ block: "nearest" });
            if (candidate === firstItem && viewport) viewport.scrollTop = 0;
            if (candidate === lastItem && viewport) viewport.scrollTop = viewport.scrollHeight;
            candidate?.focus();
            if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
          }
        },
        [getItems, viewport]
      );
      const focusSelectedItem = useCallback(
        () => focusFirst4([selectedItem, content]),
        [focusFirst4, selectedItem, content]
      );
      useEffect(() => {
        if (isPositioned) {
          focusSelectedItem();
        }
      }, [isPositioned, focusSelectedItem]);
      const { onOpenChange, triggerPointerDownPosRef } = context;
      useEffect(() => {
        if (content) {
          let pointerMoveDelta = { x: 0, y: 0 };
          const handlePointerMove = (event) => {
            pointerMoveDelta = {
              x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
              y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0))
            };
          };
          const handlePointerUp = (event) => {
            if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
              event.preventDefault();
            } else {
              if (!event.composedPath().includes(content)) {
                onOpenChange(false);
              }
            }
            document.removeEventListener("pointermove", handlePointerMove);
            triggerPointerDownPosRef.current = null;
          };
          if (triggerPointerDownPosRef.current !== null) {
            document.addEventListener("pointermove", handlePointerMove);
            document.addEventListener("pointerup", handlePointerUp, { capture: true, once: true });
          }
          return () => {
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp, { capture: true });
          };
        }
      }, [content, onOpenChange, triggerPointerDownPosRef]);
      useEffect(() => {
        const close = () => onOpenChange(false);
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
        return () => {
          window.removeEventListener("blur", close);
          window.removeEventListener("resize", close);
        };
      }, [onOpenChange]);
      const [searchRef, handleTypeaheadSearch] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.ref.current === document.activeElement);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem) {
          setTimeout(() => nextItem.ref.current.focus());
        }
      });
      const itemRefCallback = useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItem(node);
            if (isFirstValidItem) firstValidItemFoundRef.current = true;
          }
        },
        [context.value]
      );
      const handleItemLeave = useCallback(() => content?.focus(), [content]);
      const itemTextRefCallback = useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItemText(node);
          }
        },
        [context.value]
      );
      const SelectPosition = position === "popper" ? SelectPopperPosition : SelectItemAlignedPosition;
      const popperContentProps = SelectPosition === SelectPopperPosition ? {
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions
      } : {};
      return /* @__PURE__ */ jsx(
        SelectContentProvider,
        {
          scope: __scopeSelect,
          content,
          viewport,
          onViewportChange: setViewport,
          itemRefCallback,
          selectedItem,
          onItemLeave: handleItemLeave,
          itemTextRefCallback,
          focusSelectedItem,
          selectedItemText,
          position,
          isPositioned,
          searchRef,
          children: /* @__PURE__ */ jsx(Combination_default, { as: Slot4, allowPinchZoom: true, children: /* @__PURE__ */ jsx(
            FocusScope,
            {
              asChild: true,
              trapped: context.open,
              onMountAutoFocus: (event) => {
                event.preventDefault();
              },
              onUnmountAutoFocus: composeEventHandlers(onCloseAutoFocus, (event) => {
                context.trigger?.focus({ preventScroll: true });
                event.preventDefault();
              }),
              children: /* @__PURE__ */ jsx(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents: true,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside: (event) => event.preventDefault(),
                  onDismiss: () => context.onOpenChange(false),
                  children: /* @__PURE__ */ jsx(
                    SelectPosition,
                    {
                      role: "listbox",
                      id: context.contentId,
                      "data-state": context.open ? "open" : "closed",
                      dir: context.dir,
                      onContextMenu: (event) => event.preventDefault(),
                      ...contentProps,
                      ...popperContentProps,
                      onPlaced: () => setIsPositioned(true),
                      ref: composedRefs,
                      style: {
                        // flex layout so we can place the scroll buttons properly
                        display: "flex",
                        flexDirection: "column",
                        // reset the outline by default as the content MAY get focused
                        outline: "none",
                        ...contentProps.style
                      },
                      onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                        const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                        if (event.key === "Tab") event.preventDefault();
                        if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
                        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                          const items = getItems().filter((item) => !item.disabled);
                          let candidateNodes = items.map((item) => item.ref.current);
                          if (["ArrowUp", "End"].includes(event.key)) {
                            candidateNodes = candidateNodes.slice().reverse();
                          }
                          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                            const currentElement = event.target;
                            const currentIndex = candidateNodes.indexOf(currentElement);
                            candidateNodes = candidateNodes.slice(currentIndex + 1);
                          }
                          setTimeout(() => focusFirst4(candidateNodes));
                          event.preventDefault();
                        }
                      })
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }
  );
  SelectContentImpl.displayName = CONTENT_IMPL_NAME;
  var ITEM_ALIGNED_POSITION_NAME = "SelectItemAlignedPosition";
  var SelectItemAlignedPosition = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, onPlaced, ...popperProps } = props;
    const context = useSelectContext(CONTENT_NAME5, __scopeSelect);
    const contentContext = useSelectContentContext(CONTENT_NAME5, __scopeSelect);
    const [contentWrapper, setContentWrapper] = useState(null);
    const [content, setContent] = useState(null);
    const composedRefs = useComposedRefs(forwardedRef, (node) => setContent(node));
    const getItems = useCollection3(__scopeSelect);
    const shouldExpandOnScrollRef = useRef(false);
    const shouldRepositionRef = useRef(true);
    const { viewport, selectedItem, selectedItemText, focusSelectedItem } = contentContext;
    const position = useCallback(() => {
      if (context.trigger && context.valueNode && contentWrapper && content && viewport && selectedItem && selectedItemText) {
        const triggerRect = context.trigger.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const valueNodeRect = context.valueNode.getBoundingClientRect();
        const itemTextRect = selectedItemText.getBoundingClientRect();
        if (context.dir !== "rtl") {
          const itemTextOffset = itemTextRect.left - contentRect.left;
          const left = valueNodeRect.left - itemTextOffset;
          const leftDelta = triggerRect.left - left;
          const minContentWidth = triggerRect.width + leftDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const rightEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedLeft = clamp2(left, [
            CONTENT_MARGIN,
            // Prevents the content from going off the starting edge of the
            // viewport. It may still go off the ending edge, but this can be
            // controlled by the user since they may want to manage overflow in a
            // specific way.
            // https://github.com/radix-ui/primitives/issues/2049
            Math.max(CONTENT_MARGIN, rightEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.left = clampedLeft + "px";
        } else {
          const itemTextOffset = contentRect.right - itemTextRect.right;
          const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
          const rightDelta = window.innerWidth - triggerRect.right - right;
          const minContentWidth = triggerRect.width + rightDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const leftEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedRight = clamp2(right, [
            CONTENT_MARGIN,
            Math.max(CONTENT_MARGIN, leftEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.right = clampedRight + "px";
        }
        const items = getItems();
        const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
        const itemsHeight = viewport.scrollHeight;
        const contentStyles = window.getComputedStyle(content);
        const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
        const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
        const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
        const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
        const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth;
        const minContentHeight = Math.min(selectedItem.offsetHeight * 5, fullContentHeight);
        const viewportStyles = window.getComputedStyle(viewport);
        const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
        const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);
        const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
        const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;
        const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
        const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
        const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
        const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;
        const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;
        if (willAlignWithoutTopOverflow) {
          const isLastItem = items.length > 0 && selectedItem === items[items.length - 1].ref.current;
          contentWrapper.style.bottom = "0px";
          const viewportOffsetBottom = content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
          const clampedTriggerMiddleToBottomEdge = Math.max(
            triggerMiddleToBottomEdge,
            selectedItemHalfHeight + // viewport might have padding bottom, include it to avoid a scrollable viewport
            (isLastItem ? viewportPaddingBottom : 0) + viewportOffsetBottom + contentBorderBottomWidth
          );
          const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
          contentWrapper.style.height = height + "px";
        } else {
          const isFirstItem = items.length > 0 && selectedItem === items[0].ref.current;
          contentWrapper.style.top = "0px";
          const clampedTopEdgeToTriggerMiddle = Math.max(
            topEdgeToTriggerMiddle,
            contentBorderTopWidth + viewport.offsetTop + // viewport might have padding top, include it to avoid a scrollable viewport
            (isFirstItem ? viewportPaddingTop : 0) + selectedItemHalfHeight
          );
          const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
          contentWrapper.style.height = height + "px";
          viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
        }
        contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
        contentWrapper.style.minHeight = minContentHeight + "px";
        contentWrapper.style.maxHeight = availableHeight + "px";
        onPlaced?.();
        requestAnimationFrame(() => shouldExpandOnScrollRef.current = true);
      }
    }, [
      getItems,
      context.trigger,
      context.valueNode,
      contentWrapper,
      content,
      viewport,
      selectedItem,
      selectedItemText,
      context.dir,
      onPlaced
    ]);
    useLayoutEffect2(() => position(), [position]);
    const [contentZIndex, setContentZIndex] = useState();
    useLayoutEffect2(() => {
      if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
    }, [content]);
    const handleScrollButtonChange = useCallback(
      (node) => {
        if (node && shouldRepositionRef.current === true) {
          position();
          focusSelectedItem?.();
          shouldRepositionRef.current = false;
        }
      },
      [position, focusSelectedItem]
    );
    return /* @__PURE__ */ jsx(
      SelectViewportProvider,
      {
        scope: __scopeSelect,
        contentWrapper,
        shouldExpandOnScrollRef,
        onScrollButtonChange: handleScrollButtonChange,
        children: /* @__PURE__ */ jsx(
          "div",
          {
            ref: setContentWrapper,
            style: {
              display: "flex",
              flexDirection: "column",
              position: "fixed",
              zIndex: contentZIndex
            },
            children: /* @__PURE__ */ jsx(
              Primitive.div,
              {
                ...popperProps,
                ref: composedRefs,
                style: {
                  // When we get the height of the content, it includes borders. If we were to set
                  // the height without having `boxSizing: 'border-box'` it would be too big.
                  boxSizing: "border-box",
                  // We need to ensure the content doesn't get taller than the wrapper
                  maxHeight: "100%",
                  ...popperProps.style
                }
              }
            )
          }
        )
      }
    );
  });
  SelectItemAlignedPosition.displayName = ITEM_ALIGNED_POSITION_NAME;
  var POPPER_POSITION_NAME = "SelectPopperPosition";
  var SelectPopperPosition = forwardRef((props, forwardedRef) => {
    const {
      __scopeSelect,
      align = "start",
      collisionPadding = CONTENT_MARGIN,
      ...popperProps
    } = props;
    const popperScope = usePopperScope2(__scopeSelect);
    return /* @__PURE__ */ jsx(
      Content2,
      {
        ...popperScope,
        ...popperProps,
        ref: forwardedRef,
        align,
        collisionPadding,
        style: {
          // Ensure border-box for floating-ui calculations
          boxSizing: "border-box",
          ...popperProps.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-select-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-select-content-available-width": "var(--radix-popper-available-width)",
            "--radix-select-content-available-height": "var(--radix-popper-available-height)",
            "--radix-select-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-select-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  });
  SelectPopperPosition.displayName = POPPER_POSITION_NAME;
  var [SelectViewportProvider, useSelectViewportContext] = createSelectContext(CONTENT_NAME5, {});
  var VIEWPORT_NAME2 = "SelectViewport";
  var SelectViewport = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, nonce, ...viewportProps } = props;
      const contentContext = useSelectContentContext(VIEWPORT_NAME2, __scopeSelect);
      const viewportContext = useSelectViewportContext(VIEWPORT_NAME2, __scopeSelect);
      const composedRefs = useComposedRefs(forwardedRef, contentContext.onViewportChange);
      const prevScrollTopRef = useRef(0);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`
            },
            nonce
          }
        ),
        /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-radix-select-viewport": "",
            role: "presentation",
            ...viewportProps,
            ref: composedRefs,
            style: {
              // we use position: 'relative' here on the `viewport` so that when we call
              // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
              // (independent of the scrollUpButton).
              position: "relative",
              flex: 1,
              // Viewport should only be scrollable in the vertical direction.
              // This won't work in vertical writing modes, so we'll need to
              // revisit this if/when that is supported
              // https://developer.chrome.com/blog/vertical-form-controls
              overflow: "hidden auto",
              ...viewportProps.style
            },
            onScroll: composeEventHandlers(viewportProps.onScroll, (event) => {
              const viewport = event.currentTarget;
              const { contentWrapper, shouldExpandOnScrollRef } = viewportContext;
              if (shouldExpandOnScrollRef?.current && contentWrapper) {
                const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
                if (scrolledBy > 0) {
                  const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
                  const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
                  const cssHeight = parseFloat(contentWrapper.style.height);
                  const prevHeight = Math.max(cssMinHeight, cssHeight);
                  if (prevHeight < availableHeight) {
                    const nextHeight = prevHeight + scrolledBy;
                    const clampedNextHeight = Math.min(availableHeight, nextHeight);
                    const heightDiff = nextHeight - clampedNextHeight;
                    contentWrapper.style.height = clampedNextHeight + "px";
                    if (contentWrapper.style.bottom === "0px") {
                      viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
                      contentWrapper.style.justifyContent = "flex-end";
                    }
                  }
                }
              }
              prevScrollTopRef.current = viewport.scrollTop;
            })
          }
        ) })
      ] });
    }
  );
  SelectViewport.displayName = VIEWPORT_NAME2;
  var GROUP_NAME4 = "SelectGroup";
  var [SelectGroupContextProvider, useSelectGroupContext] = createSelectContext(GROUP_NAME4);
  var SelectGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...groupProps } = props;
      const groupId = useId2();
      return /* @__PURE__ */ jsx(SelectGroupContextProvider, { scope: __scopeSelect, id: groupId, children: /* @__PURE__ */ jsx(Primitive.div, { role: "group", "aria-labelledby": groupId, ...groupProps, ref: forwardedRef }) });
    }
  );
  SelectGroup.displayName = GROUP_NAME4;
  var LABEL_NAME3 = "SelectLabel";
  var SelectLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...labelProps } = props;
      const groupContext = useSelectGroupContext(LABEL_NAME3, __scopeSelect);
      return /* @__PURE__ */ jsx(Primitive.div, { id: groupContext.id, ...labelProps, ref: forwardedRef });
    }
  );
  SelectLabel.displayName = LABEL_NAME3;
  var ITEM_NAME4 = "SelectItem";
  var [SelectItemContextProvider, useSelectItemContext] = createSelectContext(ITEM_NAME4);
  var SelectItem = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeSelect,
        value,
        disabled = false,
        textValue: textValueProp,
        ...itemProps
      } = props;
      const context = useSelectContext(ITEM_NAME4, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_NAME4, __scopeSelect);
      const isSelected = context.value === value;
      const [textValue, setTextValue] = useState(textValueProp ?? "");
      const [isFocused, setIsFocused] = useState(false);
      const composedRefs = useComposedRefs(
        forwardedRef,
        (node) => contentContext.itemRefCallback?.(node, value, disabled)
      );
      const textId = useId2();
      const pointerTypeRef = useRef("touch");
      const handleSelect = () => {
        if (!disabled) {
          context.onValueChange(value);
          context.onOpenChange(false);
        }
      };
      if (value === "") {
        throw new Error(
          "A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder."
        );
      }
      return /* @__PURE__ */ jsx(
        SelectItemContextProvider,
        {
          scope: __scopeSelect,
          value,
          disabled,
          textId,
          isSelected,
          onItemTextChange: useCallback((node) => {
            setTextValue((prevTextValue) => prevTextValue || (node?.textContent ?? "").trim());
          }, []),
          children: /* @__PURE__ */ jsx(
            Collection3.ItemSlot,
            {
              scope: __scopeSelect,
              value,
              disabled,
              textValue,
              children: /* @__PURE__ */ jsx(
                Primitive.div,
                {
                  role: "option",
                  "aria-labelledby": textId,
                  "data-highlighted": isFocused ? "" : void 0,
                  "aria-selected": isSelected && isFocused,
                  "data-state": isSelected ? "checked" : "unchecked",
                  "aria-disabled": disabled || void 0,
                  "data-disabled": disabled ? "" : void 0,
                  tabIndex: disabled ? void 0 : -1,
                  ...itemProps,
                  ref: composedRefs,
                  onFocus: composeEventHandlers(itemProps.onFocus, () => setIsFocused(true)),
                  onBlur: composeEventHandlers(itemProps.onBlur, () => setIsFocused(false)),
                  onClick: composeEventHandlers(itemProps.onClick, () => {
                    if (pointerTypeRef.current !== "mouse") handleSelect();
                  }),
                  onPointerUp: composeEventHandlers(itemProps.onPointerUp, () => {
                    if (pointerTypeRef.current === "mouse") handleSelect();
                  }),
                  onPointerDown: composeEventHandlers(itemProps.onPointerDown, (event) => {
                    pointerTypeRef.current = event.pointerType;
                  }),
                  onPointerMove: composeEventHandlers(itemProps.onPointerMove, (event) => {
                    pointerTypeRef.current = event.pointerType;
                    if (disabled) {
                      contentContext.onItemLeave?.();
                    } else if (pointerTypeRef.current === "mouse") {
                      event.currentTarget.focus({ preventScroll: true });
                    }
                  }),
                  onPointerLeave: composeEventHandlers(itemProps.onPointerLeave, (event) => {
                    if (event.currentTarget === document.activeElement) {
                      contentContext.onItemLeave?.();
                    }
                  }),
                  onKeyDown: composeEventHandlers(itemProps.onKeyDown, (event) => {
                    const isTypingAhead = contentContext.searchRef?.current !== "";
                    if (isTypingAhead && event.key === " ") return;
                    if (SELECTION_KEYS2.includes(event.key)) handleSelect();
                    if (event.key === " ") event.preventDefault();
                  })
                }
              )
            }
          )
        }
      );
    }
  );
  SelectItem.displayName = ITEM_NAME4;
  var ITEM_TEXT_NAME = "SelectItemText";
  var SelectItemText = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, className, style, ...itemTextProps } = props;
      const context = useSelectContext(ITEM_TEXT_NAME, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_TEXT_NAME, __scopeSelect);
      const itemContext = useSelectItemContext(ITEM_TEXT_NAME, __scopeSelect);
      const nativeOptionsContext = useSelectNativeOptionsContext(ITEM_TEXT_NAME, __scopeSelect);
      const [itemTextNode, setItemTextNode] = useState(null);
      const composedRefs = useComposedRefs(
        forwardedRef,
        (node) => setItemTextNode(node),
        itemContext.onItemTextChange,
        (node) => contentContext.itemTextRefCallback?.(node, itemContext.value, itemContext.disabled)
      );
      const textContent = itemTextNode?.textContent;
      const nativeOption = useMemo(
        () => /* @__PURE__ */ jsx("option", { value: itemContext.value, disabled: itemContext.disabled, children: textContent }, itemContext.value),
        [itemContext.disabled, itemContext.value, textContent]
      );
      const { onNativeOptionAdd, onNativeOptionRemove } = nativeOptionsContext;
      useLayoutEffect2(() => {
        onNativeOptionAdd(nativeOption);
        return () => onNativeOptionRemove(nativeOption);
      }, [onNativeOptionAdd, onNativeOptionRemove, nativeOption]);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(Primitive.span, { id: itemContext.textId, ...itemTextProps, ref: composedRefs }),
        itemContext.isSelected && context.valueNode && !context.valueNodeHasChildren ? createPortal(itemTextProps.children, context.valueNode) : null
      ] });
    }
  );
  SelectItemText.displayName = ITEM_TEXT_NAME;
  var ITEM_INDICATOR_NAME2 = "SelectItemIndicator";
  var SelectItemIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...itemIndicatorProps } = props;
      const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME2, __scopeSelect);
      return itemContext.isSelected ? /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...itemIndicatorProps, ref: forwardedRef }) : null;
    }
  );
  SelectItemIndicator.displayName = ITEM_INDICATOR_NAME2;
  var SCROLL_UP_BUTTON_NAME = "SelectScrollUpButton";
  var SelectScrollUpButton = forwardRef((props, forwardedRef) => {
    const contentContext = useSelectContentContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const canScrollUp2 = viewport.scrollTop > 0;
          setCanScrollUp(canScrollUp2);
        };
        var handleScroll2 = handleScroll22;
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollUp ? /* @__PURE__ */ jsx(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  });
  SelectScrollUpButton.displayName = SCROLL_UP_BUTTON_NAME;
  var SCROLL_DOWN_BUTTON_NAME = "SelectScrollDownButton";
  var SelectScrollDownButton = forwardRef((props, forwardedRef) => {
    const contentContext = useSelectContentContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const [canScrollDown, setCanScrollDown] = useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const maxScroll = viewport.scrollHeight - viewport.clientHeight;
          const canScrollDown2 = Math.ceil(viewport.scrollTop) < maxScroll;
          setCanScrollDown(canScrollDown2);
        };
        var handleScroll2 = handleScroll22;
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollDown ? /* @__PURE__ */ jsx(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  });
  SelectScrollDownButton.displayName = SCROLL_DOWN_BUTTON_NAME;
  var SelectScrollButtonImpl = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, onAutoScroll, ...scrollIndicatorProps } = props;
    const contentContext = useSelectContentContext("SelectScrollButton", __scopeSelect);
    const autoScrollTimerRef = useRef(null);
    const getItems = useCollection3(__scopeSelect);
    const clearAutoScrollTimer = useCallback(() => {
      if (autoScrollTimerRef.current !== null) {
        window.clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    }, []);
    useEffect(() => {
      return () => clearAutoScrollTimer();
    }, [clearAutoScrollTimer]);
    useLayoutEffect2(() => {
      const activeItem = getItems().find((item) => item.ref.current === document.activeElement);
      activeItem?.ref.current?.scrollIntoView({ block: "nearest" });
    }, [getItems]);
    return /* @__PURE__ */ jsx(
      Primitive.div,
      {
        "aria-hidden": true,
        ...scrollIndicatorProps,
        ref: forwardedRef,
        style: { flexShrink: 0, ...scrollIndicatorProps.style },
        onPointerDown: composeEventHandlers(scrollIndicatorProps.onPointerDown, () => {
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerMove: composeEventHandlers(scrollIndicatorProps.onPointerMove, () => {
          contentContext.onItemLeave?.();
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerLeave: composeEventHandlers(scrollIndicatorProps.onPointerLeave, () => {
          clearAutoScrollTimer();
        })
      }
    );
  });
  var SEPARATOR_NAME3 = "SelectSeparator";
  var SelectSeparator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { "aria-hidden": true, ...separatorProps, ref: forwardedRef });
    }
  );
  SelectSeparator.displayName = SEPARATOR_NAME3;
  var ARROW_NAME4 = "SelectArrow";
  var SelectArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...arrowProps } = props;
      const popperScope = usePopperScope2(__scopeSelect);
      const contentContext = useSelectContentContext(ARROW_NAME4, __scopeSelect);
      return contentContext.position === "popper" ? /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef }) : null;
    }
  );
  SelectArrow.displayName = ARROW_NAME4;
  var BUBBLE_INPUT_NAME2 = "SelectBubbleInput";
  var SelectBubbleInput = forwardRef(
    ({ __scopeSelect, ...props }, forwardedRef) => {
      const context = useSelectContext(BUBBLE_INPUT_NAME2, __scopeSelect);
      const { value, onValueChange, required, disabled, name, autoComplete, form } = context;
      const { nativeOptions, nativeSelectKey } = context;
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const selectValue = value ?? "";
      const prevValue = usePrevious(selectValue);
      useEffect(() => {
        const select = ref.current;
        if (!select) return;
        const selectProto = window.HTMLSelectElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          selectProto,
          "value"
        );
        const setValue = descriptor.set;
        if (prevValue !== selectValue && setValue) {
          const event = new Event("change", { bubbles: true });
          setValue.call(select, selectValue);
          select.dispatchEvent(event);
        }
      }, [prevValue, selectValue]);
      return /* @__PURE__ */ jsxs(
        Primitive.select,
        {
          "aria-hidden": true,
          required,
          tabIndex: -1,
          name,
          autoComplete,
          disabled,
          form,
          onChange: (event) => onValueChange(event.target.value),
          ...props,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style },
          ref: composedRefs,
          defaultValue: selectValue,
          children: [
            shouldShowPlaceholder(value) ? /* @__PURE__ */ jsx("option", { value: "" }) : null,
            Array.from(nativeOptions)
          ]
        },
        nativeSelectKey
      );
    }
  );
  SelectBubbleInput.displayName = BUBBLE_INPUT_NAME2;
  function isFunction3(value) {
    return typeof value === "function";
  }
  function shouldShowPlaceholder(value) {
    return value === "" || value === void 0;
  }
  function useTypeaheadSearch(onSearchChange) {
    const handleSearchChange = useCallbackRef(onSearchChange);
    const searchRef = useRef("");
    const timerRef = useRef(0);
    const handleTypeaheadSearch = useCallback(
      (key) => {
        const search = searchRef.current + key;
        handleSearchChange(search);
        (function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        })(search);
      },
      [handleSearchChange]
    );
    const resetTypeahead = useCallback(() => {
      searchRef.current = "";
      window.clearTimeout(timerRef.current);
    }, []);
    useEffect(() => {
      return () => window.clearTimeout(timerRef.current);
    }, []);
    return [searchRef, handleTypeaheadSearch, resetTypeahead];
  }
  function findNextItem(items, search, currentItem) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
    let wrappedItems = wrapArray3(items, Math.max(currentItemIndex, 0));
    const excludeCurrentItem = normalizedSearch.length === 1;
    if (excludeCurrentItem) wrappedItems = wrappedItems.filter((v) => v !== currentItem);
    const nextItem = wrappedItems.find(
      (item) => item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextItem !== currentItem ? nextItem : void 0;
  }
  function wrapArray3(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }

  // ../../../packages/shadcn-ui/src/components/select.tsx
  var Select2 = Select;
  var SelectValue2 = SelectValue;
  var SelectTrigger2 = forwardRef(
    ({ className, children, ...props }, ref) => createElement(
      SelectTrigger,
      {
        ref,
        className: cn("xps-select-trigger", className),
        ...props
      },
      children,
      createElement(
        SelectIcon,
        { asChild: true },
        createElement(ChevronDown, {
          className: "xps-icon"
        })
      )
    )
  );
  SelectTrigger2.displayName = SelectTrigger.displayName;
  var SelectScrollUpButton2 = forwardRef(
    ({ className, ...props }, ref) => createElement(
      SelectScrollUpButton,
      {
        ref,
        className: cn("xps-select-scroll-button", className),
        ...props
      },
      createElement(ChevronUp, {
        className: "xps-icon"
      })
    )
  );
  SelectScrollUpButton2.displayName = SelectScrollUpButton.displayName;
  var SelectScrollDownButton2 = forwardRef(
    ({ className, ...props }, ref) => createElement(
      SelectScrollDownButton,
      {
        ref,
        className: cn("xps-select-scroll-button", className),
        ...props
      },
      createElement(ChevronDown, {
        className: "xps-icon"
      })
    )
  );
  SelectScrollDownButton2.displayName = SelectScrollDownButton.displayName;
  var SelectContent2 = forwardRef(
    ({ className, children, position = "popper", ...props }, ref) => createElement(
      SelectPortal,
      null,
      createElement(
        SelectContent,
        {
          ref,
          className: cn("xps-select-content", position === "popper" && "xps-select-content-popper", className),
          position,
          ...props
        },
        createElement(SelectScrollUpButton2, null),
        createElement(
          SelectViewport,
          {
            className: cn("xps-select-viewport", position === "popper" && "xps-select-viewport-popper")
          },
          children
        ),
        createElement(SelectScrollDownButton2, null)
      )
    )
  );
  SelectContent2.displayName = SelectContent.displayName;
  var SelectLabel2 = forwardRef(
    ({ className, ...props }, ref) => createElement(SelectLabel, {
      ref,
      className: cn("xps-select-label", className),
      ...props
    })
  );
  SelectLabel2.displayName = SelectLabel.displayName;
  var SelectItem2 = forwardRef(
    ({ className, children, ...props }, ref) => createElement(
      SelectItem,
      {
        ref,
        className: cn("xps-select-item", className),
        ...props
      },
      createElement(
        "span",
        { className: "xps-select-item-indicator" },
        createElement(
          SelectItemIndicator,
          null,
          createElement(Check, {
            className: "xps-icon"
          })
        )
      ),
      createElement(SelectItemText, null, children)
    )
  );
  SelectItem2.displayName = SelectItem.displayName;
  var SelectSeparator2 = forwardRef(
    ({ className, ...props }, ref) => createElement(SelectSeparator, {
      ref,
      className: cn("xps-select-separator", className),
      ...props
    })
  );
  SelectSeparator2.displayName = SelectSeparator.displayName;

  // ../../../packages/shadcn-ui/src/components/separator.tsx
  var Separator3 = forwardRef(
    ({ className, orientation = "horizontal", ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-separator", orientation === "vertical" ? "xps-separator--vertical" : "xps-separator--horizontal", className),
      role: "separator",
      "aria-orientation": orientation,
      ...props
    })
  );
  Separator3.displayName = "Separator";

  // ../../../packages/shadcn-ui/src/components/sheet.tsx
  var Sheet = Root;
  var SheetPortal = Portal2;
  var SheetOverlay = forwardRef(
    ({ className, ...props }, ref) => createElement(Overlay, {
      ref,
      className: cn("xps-dialog-overlay", className),
      ...props
    })
  );
  SheetOverlay.displayName = Overlay.displayName;
  var SheetContent = forwardRef(
    ({ className, children, side = "right", showClose = true, ...props }, ref) => createElement(
      SheetPortal,
      null,
      createElement(SheetOverlay, null),
      createElement(
        Content,
        {
          ref,
          className: cn("xps-sheet-content", `xps-sheet-content--${side}`, className),
          ...props
        },
        children,
        showClose ? createElement(
          Close,
          {
            className: "xps-dialog-close"
          },
          createElement(X, {
            className: "xps-icon",
            "aria-hidden": "true"
          }),
          createElement("span", { className: "xps-sr-only" }, "Close")
        ) : null
      )
    )
  );
  SheetContent.displayName = Content.displayName;
  var SheetHeader = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-dialog-header", className),
      ...props
    })
  );
  SheetHeader.displayName = "SheetHeader";
  var SheetFooter = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-dialog-footer", className),
      ...props
    })
  );
  SheetFooter.displayName = "SheetFooter";
  var SheetTitle = forwardRef(
    ({ className, ...props }, ref) => createElement(Title, {
      ref,
      className: cn("xps-dialog-title", className),
      ...props
    })
  );
  SheetTitle.displayName = Title.displayName;
  var SheetDescription = forwardRef(
    ({ className, ...props }, ref) => createElement(Description, {
      ref,
      className: cn("xps-dialog-description", className),
      ...props
    })
  );
  SheetDescription.displayName = Description.displayName;

  // ../../../packages/shadcn-ui/src/components/sidebar.tsx
  var Sidebar = forwardRef(
    ({ className, side = "left", collapsed = false, ...props }, ref) => createElement("aside", {
      ref,
      className: cn("xps-sidebar", `xps-sidebar--${side}`, collapsed && "xps-sidebar--collapsed", className),
      "data-side": side,
      "data-state": collapsed ? "collapsed" : "expanded",
      "aria-expanded": !collapsed,
      ...props
    })
  );
  Sidebar.displayName = "Sidebar";
  var SidebarHeader = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-header", className),
      ...props
    })
  );
  SidebarHeader.displayName = "SidebarHeader";
  var SidebarContent = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-content", className),
      ...props
    })
  );
  SidebarContent.displayName = "SidebarContent";
  var SidebarFooter = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-footer", className),
      ...props
    })
  );
  SidebarFooter.displayName = "SidebarFooter";
  var SidebarTitle = forwardRef(
    ({ className, ...props }, ref) => createElement("span", {
      ref,
      className: cn("xps-sidebar-title", className),
      ...props
    })
  );
  SidebarTitle.displayName = "SidebarTitle";
  var SidebarRail = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-rail", className),
      ...props
    })
  );
  SidebarRail.displayName = "SidebarRail";
  var SidebarTrigger = forwardRef(
    ({ className, variant = "ghost", size: size4 = "icon", ...props }, ref) => createElement(Button, {
      ref,
      className: cn("xps-sidebar-trigger", className),
      variant,
      size: size4,
      ...props
    })
  );
  SidebarTrigger.displayName = "SidebarTrigger";
  var SidebarGroup = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-group", className),
      ...props
    })
  );
  SidebarGroup.displayName = "SidebarGroup";
  var SidebarGroupLabel = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-group-label", className),
      ...props
    })
  );
  SidebarGroupLabel.displayName = "SidebarGroupLabel";
  var SidebarMenu = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-menu", className),
      ...props
    })
  );
  SidebarMenu.displayName = "SidebarMenu";
  var SidebarMenuItem = forwardRef(
    ({ className, ...props }, ref) => createElement("div", {
      ref,
      className: cn("xps-sidebar-menu-item", className),
      ...props
    })
  );
  SidebarMenuItem.displayName = "SidebarMenuItem";
  var SidebarMenuButton = forwardRef(
    ({ className, active = false, variant = "ghost", ...props }, ref) => createElement(Button, {
      ref,
      variant,
      className: cn("xps-sidebar-menu-button", active && "xps-sidebar-menu-button--active", className),
      ...props
    })
  );
  SidebarMenuButton.displayName = "SidebarMenuButton";

  // ../../../node_modules/.pnpm/@radix-ui+react-slider@1.4.0_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react_cfb70bb4d45c3eedb16b2d4d4cf80f46/node_modules/@radix-ui/react-slider/dist/index.mjs
  var PAGE_KEYS = ["PageUp", "PageDown"];
  var ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  var BACK_KEYS = {
    "from-left": ["Home", "PageDown", "ArrowDown", "ArrowLeft"],
    "from-right": ["Home", "PageDown", "ArrowDown", "ArrowRight"],
    "from-bottom": ["Home", "PageDown", "ArrowDown", "ArrowLeft"],
    "from-top": ["Home", "PageDown", "ArrowUp", "ArrowLeft"]
  };
  var SLIDER_NAME = "Slider";
  var [Collection4, useCollection4, createCollectionScope4] = createCollection(SLIDER_NAME);
  var [createSliderContext, createSliderScope] = createContextScope(SLIDER_NAME, [
    createCollectionScope4
  ]);
  var [SliderProvider, useSliderContext] = createSliderContext(SLIDER_NAME);
  var Slider = forwardRef(
    (props, forwardedRef) => {
      const {
        name,
        min: min2 = 0,
        max: max2 = 100,
        step = 1,
        orientation = "horizontal",
        disabled = false,
        minStepsBetweenThumbs = 0,
        defaultValue = [min2],
        value,
        onValueChange = () => {
        },
        onValueCommit = () => {
        },
        inverted = false,
        form,
        ...sliderProps
      } = props;
      const thumbRefs = useRef(/* @__PURE__ */ new Set());
      const valueIndexToChangeRef = useRef(0);
      const isKeyboardInteractionRef = useRef(false);
      const isHorizontal = orientation === "horizontal";
      const SliderOrientation = isHorizontal ? SliderHorizontal : SliderVertical;
      const [values = [], setValues] = useControllableState({
        prop: value,
        defaultProp: defaultValue,
        onChange: (value2) => {
          const thumbs = [...thumbRefs.current];
          thumbs[valueIndexToChangeRef.current]?.focus({
            preventScroll: true,
            focusVisible: isKeyboardInteractionRef.current
          });
          isKeyboardInteractionRef.current = false;
          onValueChange(value2);
        }
      });
      const valuesBeforeSlideStartRef = useRef(values);
      function handleSlideStart(value2) {
        const closestIndex = getClosestValueIndex(values, value2);
        updateValues(value2, closestIndex);
      }
      function handleSlideMove(value2) {
        updateValues(value2, valueIndexToChangeRef.current);
      }
      function handleSlideEnd() {
        const prevValue = valuesBeforeSlideStartRef.current[valueIndexToChangeRef.current];
        const nextValue = values[valueIndexToChangeRef.current];
        const hasChanged = nextValue !== prevValue;
        if (hasChanged) onValueCommit(values);
      }
      function updateValues(value2, atIndex, { commit } = { commit: false }) {
        const decimalCount = getDecimalCount(step);
        const snapToStep = roundValue(Math.round((value2 - min2) / step) * step + min2, decimalCount);
        const nextValue = clamp2(snapToStep, [min2, max2]);
        setValues((prevValues = []) => {
          const nextValues = getNextSortedValues(prevValues, nextValue, atIndex);
          if (hasMinStepsBetweenValues(nextValues, minStepsBetweenThumbs * step)) {
            valueIndexToChangeRef.current = nextValues.indexOf(nextValue);
            const hasChanged = String(nextValues) !== String(prevValues);
            if (hasChanged && commit) onValueCommit(nextValues);
            return hasChanged ? nextValues : prevValues;
          } else {
            return prevValues;
          }
        });
      }
      return /* @__PURE__ */ jsx(
        SliderProvider,
        {
          scope: props.__scopeSlider,
          name,
          disabled,
          min: min2,
          max: max2,
          valueIndexToChangeRef,
          thumbs: thumbRefs.current,
          values,
          orientation,
          form,
          children: /* @__PURE__ */ jsx(Collection4.Provider, { scope: props.__scopeSlider, children: /* @__PURE__ */ jsx(Collection4.Slot, { scope: props.__scopeSlider, children: /* @__PURE__ */ jsx(
            SliderOrientation,
            {
              "aria-disabled": disabled,
              "data-disabled": disabled ? "" : void 0,
              ...sliderProps,
              ref: forwardedRef,
              onPointerDown: composeEventHandlers(sliderProps.onPointerDown, () => {
                if (!disabled) {
                  valuesBeforeSlideStartRef.current = values;
                  isKeyboardInteractionRef.current = false;
                }
              }),
              min: min2,
              max: max2,
              inverted,
              onSlideStart: disabled ? void 0 : handleSlideStart,
              onSlideMove: disabled ? void 0 : handleSlideMove,
              onSlideEnd: disabled ? void 0 : handleSlideEnd,
              onHomeKeyDown: () => {
                if (!disabled) {
                  isKeyboardInteractionRef.current = true;
                  updateValues(min2, 0, { commit: true });
                }
              },
              onEndKeyDown: () => {
                if (!disabled) {
                  isKeyboardInteractionRef.current = true;
                  updateValues(max2, values.length - 1, { commit: true });
                }
              },
              onStepKeyDown: ({ event, direction: stepDirection }) => {
                if (!disabled) {
                  isKeyboardInteractionRef.current = true;
                  const isPageKey = PAGE_KEYS.includes(event.key);
                  const isSkipKey = isPageKey || event.shiftKey && ARROW_KEYS.includes(event.key);
                  const multiplier = isSkipKey ? 10 : 1;
                  const atIndex = valueIndexToChangeRef.current;
                  const value2 = values[atIndex];
                  const stepInDirection = step * multiplier * stepDirection;
                  updateValues(value2 + stepInDirection, atIndex, { commit: true });
                }
              }
            }
          ) }) })
        }
      );
    }
  );
  Slider.displayName = SLIDER_NAME;
  var [SliderOrientationProvider, useSliderOrientationContext] = createSliderContext(SLIDER_NAME, {
    startEdge: "left",
    endEdge: "right",
    size: "width",
    direction: 1
  });
  var SliderHorizontal = forwardRef(
    (props, forwardedRef) => {
      const {
        min: min2,
        max: max2,
        dir,
        inverted,
        onSlideStart,
        onSlideMove,
        onSlideEnd,
        onStepKeyDown,
        ...sliderProps
      } = props;
      const [slider, setSlider] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, (node) => setSlider(node));
      const rectRef = useRef(void 0);
      const direction = useDirection(dir);
      const isDirectionLTR = direction === "ltr";
      const isSlidingFromLeft = isDirectionLTR && !inverted || !isDirectionLTR && inverted;
      function getValueFromPointer(pointerPosition) {
        const rect = rectRef.current || slider.getBoundingClientRect();
        const input = [0, rect.width];
        const output = isSlidingFromLeft ? [min2, max2] : [max2, min2];
        const value = linearScale2(input, output);
        rectRef.current = rect;
        return value(pointerPosition - rect.left);
      }
      return /* @__PURE__ */ jsx(
        SliderOrientationProvider,
        {
          scope: props.__scopeSlider,
          startEdge: isSlidingFromLeft ? "left" : "right",
          endEdge: isSlidingFromLeft ? "right" : "left",
          direction: isSlidingFromLeft ? 1 : -1,
          size: "width",
          children: /* @__PURE__ */ jsx(
            SliderImpl,
            {
              dir: direction,
              "data-orientation": "horizontal",
              ...sliderProps,
              ref: composedRefs,
              style: {
                ...sliderProps.style,
                "--radix-slider-thumb-transform": "translateX(-50%)"
              },
              onSlideStart: (event) => {
                const value = getValueFromPointer(event.clientX);
                onSlideStart?.(value);
              },
              onSlideMove: (event) => {
                const value = getValueFromPointer(event.clientX);
                onSlideMove?.(value);
              },
              onSlideEnd: () => {
                rectRef.current = void 0;
                onSlideEnd?.();
              },
              onStepKeyDown: (event) => {
                const slideDirection = isSlidingFromLeft ? "from-left" : "from-right";
                const isBackKey = BACK_KEYS[slideDirection].includes(event.key);
                onStepKeyDown?.({ event, direction: isBackKey ? -1 : 1 });
              }
            }
          )
        }
      );
    }
  );
  var SliderVertical = forwardRef(
    (props, forwardedRef) => {
      const {
        min: min2,
        max: max2,
        inverted,
        onSlideStart,
        onSlideMove,
        onSlideEnd,
        onStepKeyDown,
        ...sliderProps
      } = props;
      const sliderRef = useRef(null);
      const ref = useComposedRefs(forwardedRef, sliderRef);
      const rectRef = useRef(void 0);
      const isSlidingFromBottom = !inverted;
      function getValueFromPointer(pointerPosition) {
        const rect = rectRef.current || sliderRef.current.getBoundingClientRect();
        const input = [0, rect.height];
        const output = isSlidingFromBottom ? [max2, min2] : [min2, max2];
        const value = linearScale2(input, output);
        rectRef.current = rect;
        return value(pointerPosition - rect.top);
      }
      return /* @__PURE__ */ jsx(
        SliderOrientationProvider,
        {
          scope: props.__scopeSlider,
          startEdge: isSlidingFromBottom ? "bottom" : "top",
          endEdge: isSlidingFromBottom ? "top" : "bottom",
          size: "height",
          direction: isSlidingFromBottom ? 1 : -1,
          children: /* @__PURE__ */ jsx(
            SliderImpl,
            {
              "data-orientation": "vertical",
              ...sliderProps,
              ref,
              style: {
                ...sliderProps.style,
                "--radix-slider-thumb-transform": "translateY(50%)"
              },
              onSlideStart: (event) => {
                const value = getValueFromPointer(event.clientY);
                onSlideStart?.(value);
              },
              onSlideMove: (event) => {
                const value = getValueFromPointer(event.clientY);
                onSlideMove?.(value);
              },
              onSlideEnd: () => {
                rectRef.current = void 0;
                onSlideEnd?.();
              },
              onStepKeyDown: (event) => {
                const slideDirection = isSlidingFromBottom ? "from-bottom" : "from-top";
                const isBackKey = BACK_KEYS[slideDirection].includes(event.key);
                onStepKeyDown?.({ event, direction: isBackKey ? -1 : 1 });
              }
            }
          )
        }
      );
    }
  );
  var SliderImpl = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeSlider,
        onSlideStart,
        onSlideMove,
        onSlideEnd,
        onHomeKeyDown,
        onEndKeyDown,
        onStepKeyDown,
        ...sliderProps
      } = props;
      const context = useSliderContext(SLIDER_NAME, __scopeSlider);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...sliderProps,
          ref: forwardedRef,
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (event.key === "Home") {
              onHomeKeyDown(event);
              event.preventDefault();
            } else if (event.key === "End") {
              onEndKeyDown(event);
              event.preventDefault();
            } else if (PAGE_KEYS.concat(ARROW_KEYS).includes(event.key)) {
              onStepKeyDown(event);
              event.preventDefault();
            }
          }),
          onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
            const target = event.target;
            target.setPointerCapture(event.pointerId);
            event.preventDefault();
            if (context.thumbs.has(target)) {
              target.focus({ preventScroll: true, focusVisible: false });
            } else {
              onSlideStart(event);
            }
          }),
          onPointerMove: composeEventHandlers(props.onPointerMove, (event) => {
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) onSlideMove(event);
          }),
          onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) {
              target.releasePointerCapture(event.pointerId);
              onSlideEnd(event);
            }
          })
        }
      );
    }
  );
  var TRACK_NAME = "SliderTrack";
  var SliderTrack = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSlider, ...trackProps } = props;
      const context = useSliderContext(TRACK_NAME, __scopeSlider);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          "data-disabled": context.disabled ? "" : void 0,
          "data-orientation": context.orientation,
          ...trackProps,
          ref: forwardedRef
        }
      );
    }
  );
  SliderTrack.displayName = TRACK_NAME;
  var RANGE_NAME = "SliderRange";
  var SliderRange = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSlider, ...rangeProps } = props;
      const context = useSliderContext(RANGE_NAME, __scopeSlider);
      const orientation = useSliderOrientationContext(RANGE_NAME, __scopeSlider);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const valuesCount = context.values.length;
      const percentages = context.values.map(
        (value) => convertValueToPercentage(value, context.min, context.max)
      );
      const offsetStart = valuesCount > 1 ? Math.min(...percentages) : 0;
      const offsetEnd = 100 - Math.max(...percentages);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          "data-orientation": context.orientation,
          "data-disabled": context.disabled ? "" : void 0,
          ...rangeProps,
          ref: composedRefs,
          style: {
            ...props.style,
            [orientation.startEdge]: offsetStart + "%",
            [orientation.endEdge]: offsetEnd + "%"
          }
        }
      );
    }
  );
  SliderRange.displayName = RANGE_NAME;
  var THUMB_NAME2 = "SliderThumb";
  var [SliderThumbContextProvider, useSliderThumbContext] = createSliderContext(THUMB_NAME2);
  var THUMB_PROVIDER_NAME = "SliderThumbProvider";
  function SliderThumbProvider(props) {
    const {
      __scopeSlider,
      name,
      children,
      // @ts-expect-error internal render prop
      internal_do_not_use_render
    } = props;
    const context = useSliderContext(THUMB_PROVIDER_NAME, __scopeSlider);
    const getItems = useCollection4(__scopeSlider);
    const [thumb, setThumb] = useState(null);
    const index2 = useMemo(
      () => thumb ? getItems().findIndex((item) => item.ref.current === thumb) : -1,
      [getItems, thumb]
    );
    const size4 = useSize(thumb);
    const isFormControl = thumb ? !!context.form || !!thumb.closest("form") : true;
    const value = context.values[index2];
    const resolvedName = name ?? (context.name ? context.name + (context.values.length > 1 ? "[]" : "") : void 0);
    const percent = value === void 0 ? 0 : convertValueToPercentage(value, context.min, context.max);
    useEffect(() => {
      if (thumb) {
        context.thumbs.add(thumb);
        return () => {
          context.thumbs.delete(thumb);
        };
      }
    }, [thumb, context.thumbs]);
    const thumbContext = {
      value,
      name: resolvedName,
      form: context.form,
      isFormControl,
      index: index2,
      thumb,
      onThumbChange: setThumb,
      percent,
      size: size4
    };
    return /* @__PURE__ */ jsx(SliderThumbContextProvider, { scope: __scopeSlider, ...thumbContext, children: isFunction4(internal_do_not_use_render) ? internal_do_not_use_render(thumbContext) : children });
  }
  SliderThumbProvider.displayName = THUMB_PROVIDER_NAME;
  var THUMB_TRIGGER_NAME = "SliderThumbTrigger";
  var SliderThumbTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSlider, ...thumbProps } = props;
      const context = useSliderContext(THUMB_TRIGGER_NAME, __scopeSlider);
      const orientation = useSliderOrientationContext(THUMB_TRIGGER_NAME, __scopeSlider);
      const { index: index2, value, percent, size: size4, onThumbChange } = useSliderThumbContext(
        THUMB_TRIGGER_NAME,
        __scopeSlider
      );
      const composedRefs = useComposedRefs(forwardedRef, (node) => onThumbChange(node));
      const label = getLabel(index2, context.values.length);
      const orientationSize = size4?.[orientation.size];
      const thumbInBoundsOffset = orientationSize ? getThumbInBoundsOffset(orientationSize, percent, orientation.direction) : 0;
      return /* @__PURE__ */ jsx(
        "span",
        {
          style: {
            transform: "var(--radix-slider-thumb-transform)",
            position: "absolute",
            [orientation.startEdge]: `calc(${percent}% + ${thumbInBoundsOffset}px)`
          },
          children: /* @__PURE__ */ jsx(Collection4.ItemSlot, { scope: __scopeSlider, children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              role: "slider",
              "aria-label": props["aria-label"] || label,
              "aria-valuemin": context.min,
              "aria-valuenow": value,
              "aria-valuemax": context.max,
              "aria-orientation": context.orientation,
              "data-orientation": context.orientation,
              "data-disabled": context.disabled ? "" : void 0,
              tabIndex: context.disabled ? void 0 : 0,
              ...thumbProps,
              ref: composedRefs,
              style: value === void 0 ? { display: "none" } : props.style,
              onFocus: composeEventHandlers(props.onFocus, () => {
                context.valueIndexToChangeRef.current = index2;
              })
            }
          ) })
        }
      );
    }
  );
  SliderThumbTrigger.displayName = THUMB_TRIGGER_NAME;
  var SliderThumb = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSlider, name, ...thumbProps } = props;
      return /* @__PURE__ */ jsx(
        SliderThumbProvider,
        {
          __scopeSlider,
          name,
          internal_do_not_use_render: ({ index: index2, isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
            /* @__PURE__ */ jsx(
              SliderThumbTrigger,
              {
                ...thumbProps,
                ref: forwardedRef,
                __scopeSlider
              }
            ),
            isFormControl ? /* @__PURE__ */ jsx(
              SliderBubbleInput,
              {
                __scopeSlider
              },
              index2
            ) : null
          ] })
        }
      );
    }
  );
  SliderThumb.displayName = THUMB_NAME2;
  var BUBBLE_INPUT_NAME3 = "SliderBubbleInput";
  var SliderBubbleInput = forwardRef(
    ({ __scopeSlider, ...props }, forwardedRef) => {
      const { value, name, form } = useSliderThumbContext(BUBBLE_INPUT_NAME3, __scopeSlider);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(ref, forwardedRef);
      const prevValue = usePrevious(value);
      useEffect(() => {
        const input = ref.current;
        if (!input) return;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(inputProto, "value");
        const setValue = descriptor.set;
        if (prevValue !== value && setValue) {
          const event = new Event("input", { bubbles: true });
          setValue.call(input, value);
          input.dispatchEvent(event);
        }
      }, [prevValue, value]);
      return /* @__PURE__ */ jsx(
        Primitive.input,
        {
          style: { display: "none" },
          name,
          form,
          ...props,
          ref: composedRefs,
          defaultValue: value
        }
      );
    }
  );
  SliderBubbleInput.displayName = BUBBLE_INPUT_NAME3;
  function getNextSortedValues(prevValues = [], nextValue, atIndex) {
    const nextValues = [...prevValues];
    nextValues[atIndex] = nextValue;
    return nextValues.sort((a, b) => a - b);
  }
  function convertValueToPercentage(value, min2, max2) {
    const maxSteps = max2 - min2;
    const percentPerStep = 100 / maxSteps;
    const percentage = percentPerStep * (value - min2);
    return clamp2(percentage, [0, 100]);
  }
  function getLabel(index2, totalValues) {
    if (totalValues > 2) {
      return `Value ${index2 + 1} of ${totalValues}`;
    } else if (totalValues === 2) {
      return ["Minimum", "Maximum"][index2];
    } else {
      return void 0;
    }
  }
  function getClosestValueIndex(values, nextValue) {
    if (values.length === 1) return 0;
    const distances = values.map((value) => Math.abs(value - nextValue));
    const closestDistance = Math.min(...distances);
    return distances.indexOf(closestDistance);
  }
  function getThumbInBoundsOffset(width, left, direction) {
    const halfWidth = width / 2;
    const halfPercent = 50;
    const offset4 = linearScale2([0, halfPercent], [0, halfWidth]);
    return (halfWidth - offset4(left) * direction) * direction;
  }
  function getStepsBetweenValues(values) {
    return values.slice(0, -1).map((value, index2) => values[index2 + 1] - value);
  }
  function hasMinStepsBetweenValues(values, minStepsBetweenValues) {
    if (minStepsBetweenValues > 0) {
      const stepsBetweenValues = getStepsBetweenValues(values);
      const actualMinStepsBetweenValues = Math.min(...stepsBetweenValues);
      return actualMinStepsBetweenValues >= minStepsBetweenValues;
    }
    return true;
  }
  function linearScale2(input, output) {
    return (value) => {
      if (input[0] === input[1] || output[0] === output[1]) return output[0];
      const ratio = (output[1] - output[0]) / (input[1] - input[0]);
      return output[0] + ratio * (value - input[0]);
    };
  }
  function getDecimalCount(value) {
    if (!Number.isFinite(value)) return 0;
    const str = value.toString();
    if (str.includes("e")) {
      const [coefficient, exponent] = str.split("e");
      const decimalPart2 = coefficient.split(".")[1] || "";
      const exponentNum = Number(exponent);
      return Math.max(0, decimalPart2.length - exponentNum);
    }
    const decimalPart = str.split(".")[1];
    return decimalPart ? decimalPart.length : 0;
  }
  function roundValue(value, decimalCount) {
    const rounder = Math.pow(10, decimalCount);
    return Math.round(value * rounder) / rounder;
  }
  function isFunction4(value) {
    return typeof value === "function";
  }

  // ../../../packages/shadcn-ui/src/components/slider.tsx
  var Slider2 = forwardRef(
    ({ className, ...props }, ref) => createElement(
      Slider,
      {
        ref,
        className: cn("xps-slider", className),
        ...props
      },
      createElement(SliderTrack, { className: "xps-slider-track" }, createElement(SliderRange, { className: "xps-slider-range" })),
      createElement(SliderThumb, { className: "xps-slider-thumb" })
    )
  );
  Slider2.displayName = Slider.displayName;

  // ../../../node_modules/.pnpm/@radix-ui+react-switch@1.3.0_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react_d2f9574497ecbe08e0e7c2298fb35dc1/node_modules/@radix-ui/react-switch/dist/index.mjs
  var SWITCH_NAME = "Switch";
  var [createSwitchContext, createSwitchScope] = createContextScope(SWITCH_NAME);
  var [SwitchProviderImpl, useSwitchContext] = createSwitchContext(SWITCH_NAME);
  function SwitchProvider(props) {
    const {
      __scopeSwitch,
      checked: checkedProp,
      children,
      defaultChecked,
      disabled,
      form,
      name,
      onCheckedChange,
      required,
      value = "on",
      // @ts-expect-error
      internal_do_not_use_render
    } = props;
    const [checked, setChecked] = useControllableState({
      prop: checkedProp,
      defaultProp: defaultChecked ?? false,
      onChange: onCheckedChange,
      caller: SWITCH_NAME
    });
    const [control, setControl] = useState(null);
    const [bubbleInput, setBubbleInput] = useState(null);
    const hasConsumerStoppedPropagationRef = useRef(false);
    const isFormControl = control ? !!form || !!control.closest("form") : (
      // We set this to true by default so that events bubble to forms without JS (SSR)
      true
    );
    const context = {
      checked,
      setChecked,
      disabled,
      control,
      setControl,
      name,
      form,
      value,
      hasConsumerStoppedPropagationRef,
      required,
      defaultChecked,
      isFormControl,
      bubbleInput,
      setBubbleInput
    };
    return /* @__PURE__ */ jsx(SwitchProviderImpl, { scope: __scopeSwitch, ...context, children: isFunction5(internal_do_not_use_render) ? internal_do_not_use_render(context) : children });
  }
  var TRIGGER_NAME5 = "SwitchTrigger";
  var SwitchTrigger = forwardRef(
    ({ __scopeSwitch, onClick, ...switchProps }, forwardedRef) => {
      const {
        value,
        disabled,
        checked,
        required,
        setControl,
        setChecked,
        hasConsumerStoppedPropagationRef,
        isFormControl,
        bubbleInput
      } = useSwitchContext(TRIGGER_NAME5, __scopeSwitch);
      const composedRefs = useComposedRefs(forwardedRef, setControl);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          role: "switch",
          "aria-checked": checked,
          "aria-required": required,
          "data-state": getState3(checked),
          "data-disabled": disabled ? "" : void 0,
          disabled,
          value,
          ...switchProps,
          ref: composedRefs,
          onClick: composeEventHandlers(onClick, (event) => {
            setChecked((prevChecked) => !prevChecked);
            if (bubbleInput && isFormControl) {
              hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
              if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
          })
        }
      );
    }
  );
  SwitchTrigger.displayName = TRIGGER_NAME5;
  var Switch = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeSwitch,
        name,
        checked,
        defaultChecked,
        required,
        disabled,
        value,
        onCheckedChange,
        form,
        ...switchProps
      } = props;
      return /* @__PURE__ */ jsx(
        SwitchProvider,
        {
          __scopeSwitch,
          checked,
          defaultChecked,
          disabled,
          required,
          onCheckedChange,
          name,
          form,
          value,
          internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
            /* @__PURE__ */ jsx(
              SwitchTrigger,
              {
                ...switchProps,
                ref: forwardedRef,
                __scopeSwitch
              }
            ),
            isFormControl && /* @__PURE__ */ jsx(
              SwitchBubbleInput,
              {
                __scopeSwitch
              }
            )
          ] })
        }
      );
    }
  );
  Switch.displayName = SWITCH_NAME;
  var THUMB_NAME3 = "SwitchThumb";
  var SwitchThumb = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSwitch, ...thumbProps } = props;
      const context = useSwitchContext(THUMB_NAME3, __scopeSwitch);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          "data-state": getState3(context.checked),
          "data-disabled": context.disabled ? "" : void 0,
          ...thumbProps,
          ref: forwardedRef
        }
      );
    }
  );
  SwitchThumb.displayName = THUMB_NAME3;
  var BUBBLE_INPUT_NAME4 = "SwitchBubbleInput";
  var SwitchBubbleInput = forwardRef(
    ({ __scopeSwitch, ...props }, forwardedRef) => {
      const {
        control,
        hasConsumerStoppedPropagationRef,
        checked,
        defaultChecked,
        required,
        disabled,
        name,
        value,
        form,
        bubbleInput,
        setBubbleInput
      } = useSwitchContext(BUBBLE_INPUT_NAME4, __scopeSwitch);
      const composedRefs = useComposedRefs(forwardedRef, setBubbleInput);
      const prevChecked = usePrevious(checked);
      const controlSize = useSize(control);
      useEffect(() => {
        const input = bubbleInput;
        if (!input) return;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          inputProto,
          "checked"
        );
        const setChecked = descriptor.set;
        const bubbles = !hasConsumerStoppedPropagationRef.current;
        if (prevChecked !== checked && setChecked) {
          const event = new Event("click", { bubbles });
          setChecked.call(input, checked);
          input.dispatchEvent(event);
        }
      }, [bubbleInput, prevChecked, checked, hasConsumerStoppedPropagationRef]);
      const defaultCheckedRef = useRef(checked);
      return /* @__PURE__ */ jsx(
        Primitive.input,
        {
          type: "checkbox",
          "aria-hidden": true,
          defaultChecked: defaultChecked ?? defaultCheckedRef.current,
          required,
          disabled,
          name,
          value,
          form,
          ...props,
          tabIndex: -1,
          ref: composedRefs,
          style: {
            ...props.style,
            ...controlSize,
            position: "absolute",
            pointerEvents: "none",
            opacity: 0,
            margin: 0,
            // We transform because the input is absolutely positioned but we have
            // rendered it **after** the button. This pulls it back to sit on top
            // of the button.
            transform: "translateX(-100%)"
          }
        }
      );
    }
  );
  SwitchBubbleInput.displayName = BUBBLE_INPUT_NAME4;
  function isFunction5(value) {
    return typeof value === "function";
  }
  function getState3(checked) {
    return checked ? "checked" : "unchecked";
  }

  // ../../../packages/shadcn-ui/src/components/switch.tsx
  var Switch2 = forwardRef(
    ({ className, ...props }, ref) => createElement(
      Switch,
      {
        ref,
        className: cn("xps-switch", className),
        ...props
      },
      createElement(SwitchThumb, {
        className: "xps-switch-thumb"
      })
    )
  );
  Switch2.displayName = Switch.displayName;

  // ../../../packages/shadcn-ui/src/components/table.tsx
  var Table = forwardRef(
    ({ className, ...props }, ref) => createElement("table", {
      ref,
      className: cn("xps-table", className),
      ...props
    })
  );
  Table.displayName = "Table";
  var TableHeader = forwardRef(
    ({ className, ...props }, ref) => createElement("thead", {
      ref,
      className: cn("xps-table-header", className),
      ...props
    })
  );
  TableHeader.displayName = "TableHeader";
  var TableBody = forwardRef(
    ({ className, ...props }, ref) => createElement("tbody", {
      ref,
      className: cn("xps-table-body", className),
      ...props
    })
  );
  TableBody.displayName = "TableBody";
  var TableFooter = forwardRef(
    ({ className, ...props }, ref) => createElement("tfoot", {
      ref,
      className: cn("xps-table-footer", className),
      ...props
    })
  );
  TableFooter.displayName = "TableFooter";
  var TableRow = forwardRef(
    ({ className, ...props }, ref) => createElement("tr", {
      ref,
      className: cn("xps-table-row", className),
      ...props
    })
  );
  TableRow.displayName = "TableRow";
  var TableHead = forwardRef(
    ({ className, ...props }, ref) => createElement("th", {
      ref,
      className: cn("xps-table-head", className),
      ...props
    })
  );
  TableHead.displayName = "TableHead";
  var TableCell = forwardRef(
    ({ className, ...props }, ref) => createElement("td", {
      ref,
      className: cn("xps-table-cell", className),
      ...props
    })
  );
  TableCell.displayName = "TableCell";
  var TableCaption = forwardRef(
    ({ className, ...props }, ref) => createElement("caption", {
      ref,
      className: cn("xps-table-caption", className),
      ...props
    })
  );
  TableCaption.displayName = "TableCaption";

  // ../../../node_modules/.pnpm/@radix-ui+react-tabs@1.1.14_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react@_769bbb0130198553b196f258bd99ab92/node_modules/@radix-ui/react-tabs/dist/index.mjs
  var TABS_NAME = "Tabs";
  var [createTabsContext, createTabsScope] = createContextScope(TABS_NAME, [
    createRovingFocusGroupScope
  ]);
  var useRovingFocusGroupScope2 = createRovingFocusGroupScope();
  var [TabsProvider, useTabsContext] = createTabsContext(TABS_NAME);
  var Tabs = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeTabs,
        value: valueProp,
        onValueChange,
        defaultValue,
        orientation = "horizontal",
        dir,
        activationMode = "automatic",
        ...tabsProps
      } = props;
      const direction = useDirection(dir);
      const [value, setValue] = useControllableState({
        prop: valueProp,
        onChange: onValueChange,
        defaultProp: defaultValue ?? "",
        caller: TABS_NAME
      });
      return /* @__PURE__ */ jsx(
        TabsProvider,
        {
          scope: __scopeTabs,
          baseId: useId2(),
          value,
          onValueChange: setValue,
          orientation,
          dir: direction,
          activationMode,
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              dir: direction,
              "data-orientation": orientation,
              ...tabsProps,
              ref: forwardedRef
            }
          )
        }
      );
    }
  );
  Tabs.displayName = TABS_NAME;
  var TAB_LIST_NAME = "TabsList";
  var TabsList = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTabs, loop = true, ...listProps } = props;
      const context = useTabsContext(TAB_LIST_NAME, __scopeTabs);
      const rovingFocusGroupScope = useRovingFocusGroupScope2(__scopeTabs);
      return /* @__PURE__ */ jsx(
        Root3,
        {
          asChild: true,
          ...rovingFocusGroupScope,
          orientation: context.orientation,
          dir: context.dir,
          loop,
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              role: "tablist",
              "aria-orientation": context.orientation,
              ...listProps,
              ref: forwardedRef
            }
          )
        }
      );
    }
  );
  TabsList.displayName = TAB_LIST_NAME;
  var TRIGGER_NAME6 = "TabsTrigger";
  var TabsTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTabs, value, disabled = false, ...triggerProps } = props;
      const context = useTabsContext(TRIGGER_NAME6, __scopeTabs);
      const rovingFocusGroupScope = useRovingFocusGroupScope2(__scopeTabs);
      const triggerId = makeTriggerId(context.baseId, value);
      const contentId = makeContentId(context.baseId, value);
      const isSelected = value === context.value;
      return /* @__PURE__ */ jsx(
        Item,
        {
          asChild: true,
          ...rovingFocusGroupScope,
          focusable: !disabled,
          active: isSelected,
          children: /* @__PURE__ */ jsx(
            Primitive.button,
            {
              type: "button",
              role: "tab",
              "aria-selected": isSelected,
              "aria-controls": contentId,
              "data-state": isSelected ? "active" : "inactive",
              "data-disabled": disabled ? "" : void 0,
              disabled,
              id: triggerId,
              ...triggerProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!disabled && event.button === 0 && event.ctrlKey === false) {
                  context.onValueChange(value);
                } else {
                  event.preventDefault();
                }
              }),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if ([" ", "Enter"].includes(event.key)) context.onValueChange(value);
              }),
              onFocus: composeEventHandlers(props.onFocus, () => {
                const isAutomaticActivation = context.activationMode !== "manual";
                if (!isSelected && !disabled && isAutomaticActivation) {
                  context.onValueChange(value);
                }
              })
            }
          )
        }
      );
    }
  );
  TabsTrigger.displayName = TRIGGER_NAME6;
  var CONTENT_NAME6 = "TabsContent";
  var TabsContent = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTabs, value, forceMount, children, ...contentProps } = props;
      const context = useTabsContext(CONTENT_NAME6, __scopeTabs);
      const triggerId = makeTriggerId(context.baseId, value);
      const contentId = makeContentId(context.baseId, value);
      const isSelected = value === context.value;
      const isMountAnimationPreventedRef = useRef(isSelected);
      useEffect(() => {
        const rAF = requestAnimationFrame(() => isMountAnimationPreventedRef.current = false);
        return () => cancelAnimationFrame(rAF);
      }, []);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || isSelected, children: ({ present }) => /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-state": isSelected ? "active" : "inactive",
          "data-orientation": context.orientation,
          role: "tabpanel",
          "aria-labelledby": triggerId,
          hidden: !present,
          id: contentId,
          tabIndex: 0,
          ...contentProps,
          ref: forwardedRef,
          style: {
            ...props.style,
            animationDuration: isMountAnimationPreventedRef.current ? "0s" : void 0
          },
          children: present && children
        }
      ) });
    }
  );
  TabsContent.displayName = CONTENT_NAME6;
  function makeTriggerId(baseId, value) {
    return `${baseId}-trigger-${value}`;
  }
  function makeContentId(baseId, value) {
    return `${baseId}-content-${value}`;
  }
  var Root24 = Tabs;
  var List = TabsList;
  var Trigger3 = TabsTrigger;
  var Content3 = TabsContent;

  // ../../../packages/shadcn-ui/src/components/tabs.tsx
  var Tabs2 = Root24;
  var TabsList2 = forwardRef(
    ({ className, ...props }, ref) => createElement(List, {
      ref,
      className: cn("xps-tabs-list", className),
      ...props
    })
  );
  TabsList2.displayName = List.displayName;
  var TabsTrigger2 = forwardRef(
    ({ className, ...props }, ref) => createElement(Trigger3, {
      ref,
      className: cn("xps-tabs-trigger", className),
      ...props
    })
  );
  TabsTrigger2.displayName = Trigger3.displayName;
  var TabsContent2 = forwardRef(
    ({ className, ...props }, ref) => createElement(Content3, {
      ref,
      className: cn("xps-tabs-content", className),
      ...props
    })
  );
  TabsContent2.displayName = Content3.displayName;

  // ../../../packages/shadcn-ui/src/components/textarea.tsx
  var Textarea = forwardRef(({ className, ...props }, ref) => createElement("textarea", {
    ref,
    className: cn("xps-textarea", className),
    ...props
  }));
  Textarea.displayName = "Textarea";

  // ../../../node_modules/.pnpm/@radix-ui+react-tooltip@1.2.9_@types+react-dom@18.3.7_@types+react@18.3.31__@types+reac_02a5bba0cb45f3ddbe548efab47eabcc/node_modules/@radix-ui/react-tooltip/dist/index.mjs
  var [createTooltipContext, createTooltipScope] = createContextScope("Tooltip", [
    createPopperScope
  ]);
  var usePopperScope3 = createPopperScope();
  var PROVIDER_NAME2 = "TooltipProvider";
  var DEFAULT_DELAY_DURATION = 700;
  var TOOLTIP_OPEN = "tooltip.open";
  var [TooltipProviderContextProvider, useTooltipProviderContext] = createTooltipContext(PROVIDER_NAME2);
  var TooltipProvider = (props) => {
    const {
      __scopeTooltip,
      delayDuration = DEFAULT_DELAY_DURATION,
      skipDelayDuration = 300,
      disableHoverableContent = false,
      children
    } = props;
    const isOpenDelayedRef = useRef(true);
    const isPointerInTransitRef = useRef(false);
    const skipDelayTimerRef = useRef(0);
    useEffect(() => {
      const skipDelayTimer = skipDelayTimerRef.current;
      return () => window.clearTimeout(skipDelayTimer);
    }, []);
    return /* @__PURE__ */ jsx(
      TooltipProviderContextProvider,
      {
        scope: __scopeTooltip,
        isOpenDelayedRef,
        delayDuration,
        onOpen: useCallback(() => {
          if (skipDelayDuration <= 0) return;
          window.clearTimeout(skipDelayTimerRef.current);
          isOpenDelayedRef.current = false;
        }, [skipDelayDuration]),
        onClose: useCallback(() => {
          if (skipDelayDuration <= 0) return;
          window.clearTimeout(skipDelayTimerRef.current);
          skipDelayTimerRef.current = window.setTimeout(
            () => isOpenDelayedRef.current = true,
            skipDelayDuration
          );
        }, [skipDelayDuration]),
        isPointerInTransitRef,
        onPointerInTransitChange: useCallback((inTransit) => {
          isPointerInTransitRef.current = inTransit;
        }, []),
        disableHoverableContent,
        children
      }
    );
  };
  TooltipProvider.displayName = PROVIDER_NAME2;
  var TOOLTIP_NAME = "Tooltip";
  var [TooltipContextProvider, useTooltipContext] = createTooltipContext(TOOLTIP_NAME);
  var Tooltip = (props) => {
    const {
      __scopeTooltip,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      disableHoverableContent: disableHoverableContentProp,
      delayDuration: delayDurationProp
    } = props;
    const providerContext = useTooltipProviderContext(TOOLTIP_NAME, props.__scopeTooltip);
    const popperScope = usePopperScope3(__scopeTooltip);
    const [trigger, setTrigger] = useState(null);
    const contentId = useId2();
    const openTimerRef = useRef(0);
    const disableHoverableContent = disableHoverableContentProp ?? providerContext.disableHoverableContent;
    const delayDuration = delayDurationProp ?? providerContext.delayDuration;
    const wasOpenDelayedRef = useRef(false);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: (open2) => {
        if (open2) {
          providerContext.onOpen();
          document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN));
        } else {
          providerContext.onClose();
        }
        onOpenChange?.(open2);
      },
      caller: TOOLTIP_NAME
    });
    const stateAttribute = useMemo(() => {
      return open ? wasOpenDelayedRef.current ? "delayed-open" : "instant-open" : "closed";
    }, [open]);
    const handleOpen = useCallback(() => {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = 0;
      wasOpenDelayedRef.current = false;
      setOpen(true);
    }, [setOpen]);
    const handleClose = useCallback(() => {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = 0;
      setOpen(false);
    }, [setOpen]);
    const handleDelayedOpen = useCallback(() => {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = window.setTimeout(() => {
        wasOpenDelayedRef.current = true;
        setOpen(true);
        openTimerRef.current = 0;
      }, delayDuration);
    }, [delayDuration, setOpen]);
    useEffect(() => {
      return () => {
        if (openTimerRef.current) {
          window.clearTimeout(openTimerRef.current);
          openTimerRef.current = 0;
        }
      };
    }, []);
    return /* @__PURE__ */ jsx(Root22, { ...popperScope, children: /* @__PURE__ */ jsx(
      TooltipContextProvider,
      {
        scope: __scopeTooltip,
        contentId,
        open,
        stateAttribute,
        trigger,
        onTriggerChange: setTrigger,
        onTriggerEnter: useCallback(() => {
          if (providerContext.isOpenDelayedRef.current) handleDelayedOpen();
          else handleOpen();
        }, [providerContext.isOpenDelayedRef, handleDelayedOpen, handleOpen]),
        onTriggerLeave: useCallback(() => {
          if (disableHoverableContent) {
            handleClose();
          } else {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = 0;
          }
        }, [handleClose, disableHoverableContent]),
        onOpen: handleOpen,
        onClose: handleClose,
        disableHoverableContent,
        children
      }
    ) });
  };
  Tooltip.displayName = TOOLTIP_NAME;
  var TRIGGER_NAME7 = "TooltipTrigger";
  var TooltipTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTooltip, ...triggerProps } = props;
      const context = useTooltipContext(TRIGGER_NAME7, __scopeTooltip);
      const providerContext = useTooltipProviderContext(TRIGGER_NAME7, __scopeTooltip);
      const popperScope = usePopperScope3(__scopeTooltip);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref, context.onTriggerChange);
      const isPointerDownRef = useRef(false);
      const hasPointerMoveOpenedRef = useRef(false);
      const handlePointerUp = useCallback(() => isPointerDownRef.current = false, []);
      useEffect(() => {
        return () => document.removeEventListener("pointerup", handlePointerUp);
      }, [handlePointerUp]);
      return /* @__PURE__ */ jsx(Anchor, { asChild: true, ...popperScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          "aria-describedby": context.open ? context.contentId : void 0,
          "data-state": context.stateAttribute,
          ...triggerProps,
          ref: composedRefs,
          onPointerMove: composeEventHandlers(props.onPointerMove, (event) => {
            if (event.pointerType === "touch") return;
            if (!hasPointerMoveOpenedRef.current && !providerContext.isPointerInTransitRef.current) {
              context.onTriggerEnter();
              hasPointerMoveOpenedRef.current = true;
            }
          }),
          onPointerLeave: composeEventHandlers(props.onPointerLeave, () => {
            context.onTriggerLeave();
            hasPointerMoveOpenedRef.current = false;
          }),
          onPointerDown: composeEventHandlers(props.onPointerDown, () => {
            if (context.open) {
              context.onClose();
            }
            isPointerDownRef.current = true;
            document.addEventListener("pointerup", handlePointerUp, { once: true });
          }),
          onFocus: composeEventHandlers(props.onFocus, () => {
            if (!isPointerDownRef.current) context.onOpen();
          }),
          onBlur: composeEventHandlers(props.onBlur, context.onClose),
          onClick: composeEventHandlers(props.onClick, context.onClose)
        }
      ) });
    }
  );
  TooltipTrigger.displayName = TRIGGER_NAME7;
  var PORTAL_NAME6 = "TooltipPortal";
  var [PortalProvider4, usePortalContext4] = createTooltipContext(PORTAL_NAME6, {
    forceMount: void 0
  });
  var TooltipPortal = (props) => {
    const { __scopeTooltip, forceMount, children, container } = props;
    const context = useTooltipContext(PORTAL_NAME6, __scopeTooltip);
    return /* @__PURE__ */ jsx(PortalProvider4, { scope: __scopeTooltip, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  };
  TooltipPortal.displayName = PORTAL_NAME6;
  var CONTENT_NAME7 = "TooltipContent";
  var TooltipContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext4(CONTENT_NAME7, props.__scopeTooltip);
      const { forceMount = portalContext.forceMount, side = "top", ...contentProps } = props;
      const context = useTooltipContext(CONTENT_NAME7, props.__scopeTooltip);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.disableHoverableContent ? /* @__PURE__ */ jsx(TooltipContentImpl, { side, ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(TooltipContentHoverable, { side, ...contentProps, ref: forwardedRef }) });
    }
  );
  var TooltipContentHoverable = forwardRef((props, forwardedRef) => {
    const context = useTooltipContext(CONTENT_NAME7, props.__scopeTooltip);
    const providerContext = useTooltipProviderContext(CONTENT_NAME7, props.__scopeTooltip);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const [pointerGraceArea, setPointerGraceArea] = useState(null);
    const { trigger, onClose } = context;
    const content = ref.current;
    const { onPointerInTransitChange } = providerContext;
    const handleRemoveGraceArea = useCallback(() => {
      setPointerGraceArea(null);
      onPointerInTransitChange(false);
    }, [onPointerInTransitChange]);
    const handleCreateGraceArea = useCallback(
      (event, hoverTarget) => {
        const currentTarget = event.currentTarget;
        const exitPoint = { x: event.clientX, y: event.clientY };
        const exitSide = getExitSideFromRect(exitPoint, currentTarget.getBoundingClientRect());
        const paddedExitPoints = getPaddedExitPoints(exitPoint, exitSide);
        const hoverTargetPoints = getPointsFromRect(hoverTarget.getBoundingClientRect());
        const graceArea = getHull([...paddedExitPoints, ...hoverTargetPoints]);
        setPointerGraceArea(graceArea);
        onPointerInTransitChange(true);
      },
      [onPointerInTransitChange]
    );
    useEffect(() => {
      return () => handleRemoveGraceArea();
    }, [handleRemoveGraceArea]);
    useEffect(() => {
      if (trigger && content) {
        const handleTriggerLeave = (event) => handleCreateGraceArea(event, content);
        const handleContentLeave = (event) => handleCreateGraceArea(event, trigger);
        trigger.addEventListener("pointerleave", handleTriggerLeave);
        content.addEventListener("pointerleave", handleContentLeave);
        return () => {
          trigger.removeEventListener("pointerleave", handleTriggerLeave);
          content.removeEventListener("pointerleave", handleContentLeave);
        };
      }
    }, [trigger, content, handleCreateGraceArea, handleRemoveGraceArea]);
    useEffect(() => {
      if (pointerGraceArea) {
        const handleTrackPointerGrace = (event) => {
          const target = event.target;
          const pointerPosition = { x: event.clientX, y: event.clientY };
          const hasEnteredTarget = trigger?.contains(target) || content?.contains(target);
          const isPointerOutsideGraceArea = !isPointInPolygon2(pointerPosition, pointerGraceArea);
          if (hasEnteredTarget) {
            handleRemoveGraceArea();
          } else if (isPointerOutsideGraceArea) {
            handleRemoveGraceArea();
            onClose();
          }
        };
        document.addEventListener("pointermove", handleTrackPointerGrace);
        return () => document.removeEventListener("pointermove", handleTrackPointerGrace);
      }
    }, [trigger, content, pointerGraceArea, onClose, handleRemoveGraceArea]);
    return /* @__PURE__ */ jsx(TooltipContentImpl, { ...props, ref: composedRefs });
  });
  var [VisuallyHiddenContentContextProvider, useVisuallyHiddenContentContext] = createTooltipContext(TOOLTIP_NAME, { isInside: false });
  var Slottable = createSlottable("TooltipContent");
  var TooltipContentImpl = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeTooltip,
        children,
        "aria-label": ariaLabel,
        onEscapeKeyDown,
        onPointerDownOutside,
        ...contentProps
      } = props;
      const context = useTooltipContext(CONTENT_NAME7, __scopeTooltip);
      const popperScope = usePopperScope3(__scopeTooltip);
      const { onClose } = context;
      useEffect(() => {
        document.addEventListener(TOOLTIP_OPEN, onClose);
        return () => document.removeEventListener(TOOLTIP_OPEN, onClose);
      }, [onClose]);
      useEffect(() => {
        if (context.trigger) {
          const handleScroll2 = (event) => {
            if (event.target instanceof Node && event.target.contains(context.trigger)) {
              onClose();
            }
          };
          window.addEventListener("scroll", handleScroll2, { capture: true });
          return () => window.removeEventListener("scroll", handleScroll2, { capture: true });
        }
      }, [context.trigger, onClose]);
      return /* @__PURE__ */ jsx(
        DismissableLayer,
        {
          asChild: true,
          disableOutsidePointerEvents: false,
          onEscapeKeyDown,
          onPointerDownOutside,
          onFocusOutside: (event) => event.preventDefault(),
          onDismiss: onClose,
          children: /* @__PURE__ */ jsxs(
            Content2,
            {
              "data-state": context.stateAttribute,
              ...popperScope,
              ...contentProps,
              ref: forwardedRef,
              style: {
                ...contentProps.style,
                // re-namespace exposed content custom properties
                ...{
                  "--radix-tooltip-content-transform-origin": "var(--radix-popper-transform-origin)",
                  "--radix-tooltip-content-available-width": "var(--radix-popper-available-width)",
                  "--radix-tooltip-content-available-height": "var(--radix-popper-available-height)",
                  "--radix-tooltip-trigger-width": "var(--radix-popper-anchor-width)",
                  "--radix-tooltip-trigger-height": "var(--radix-popper-anchor-height)"
                }
              },
              children: [
                /* @__PURE__ */ jsx(Slottable, { children }),
                /* @__PURE__ */ jsx(VisuallyHiddenContentContextProvider, { scope: __scopeTooltip, isInside: true, children: /* @__PURE__ */ jsx(Root5, { id: context.contentId, role: "tooltip", children: ariaLabel || children }) })
              ]
            }
          )
        }
      );
    }
  );
  TooltipContent.displayName = CONTENT_NAME7;
  var ARROW_NAME5 = "TooltipArrow";
  var TooltipArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTooltip, ...arrowProps } = props;
      const popperScope = usePopperScope3(__scopeTooltip);
      const visuallyHiddenContentContext = useVisuallyHiddenContentContext(
        ARROW_NAME5,
        __scopeTooltip
      );
      return visuallyHiddenContentContext.isInside ? null : /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }
  );
  TooltipArrow.displayName = ARROW_NAME5;
  function getExitSideFromRect(point, rect) {
    const top = Math.abs(rect.top - point.y);
    const bottom = Math.abs(rect.bottom - point.y);
    const right = Math.abs(rect.right - point.x);
    const left = Math.abs(rect.left - point.x);
    switch (Math.min(top, bottom, right, left)) {
      case left:
        return "left";
      case right:
        return "right";
      case top:
        return "top";
      case bottom:
        return "bottom";
      default:
        throw new Error("unreachable");
    }
  }
  function getPaddedExitPoints(exitPoint, exitSide, padding = 5) {
    const paddedExitPoints = [];
    switch (exitSide) {
      case "top":
        paddedExitPoints.push(
          { x: exitPoint.x - padding, y: exitPoint.y + padding },
          { x: exitPoint.x + padding, y: exitPoint.y + padding }
        );
        break;
      case "bottom":
        paddedExitPoints.push(
          { x: exitPoint.x - padding, y: exitPoint.y - padding },
          { x: exitPoint.x + padding, y: exitPoint.y - padding }
        );
        break;
      case "left":
        paddedExitPoints.push(
          { x: exitPoint.x + padding, y: exitPoint.y - padding },
          { x: exitPoint.x + padding, y: exitPoint.y + padding }
        );
        break;
      case "right":
        paddedExitPoints.push(
          { x: exitPoint.x - padding, y: exitPoint.y - padding },
          { x: exitPoint.x - padding, y: exitPoint.y + padding }
        );
        break;
    }
    return paddedExitPoints;
  }
  function getPointsFromRect(rect) {
    const { top, right, bottom, left } = rect;
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ];
  }
  function isPointInPolygon2(point, polygon) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const ii = polygon[i];
      const jj = polygon[j];
      const xi = ii.x;
      const yi = ii.y;
      const xj = jj.x;
      const yj = jj.y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function getHull(points) {
    const newPoints = points.slice();
    newPoints.sort((a, b) => {
      if (a.x < b.x) return -1;
      else if (a.x > b.x) return 1;
      else if (a.y < b.y) return -1;
      else if (a.y > b.y) return 1;
      else return 0;
    });
    return getHullPresorted(newPoints);
  }
  function getHullPresorted(points) {
    if (points.length <= 1) return points.slice();
    const upperHull = [];
    for (let i = 0; i < points.length; i++) {
      const p2 = points[i];
      while (upperHull.length >= 2) {
        const q = upperHull[upperHull.length - 1];
        const r2 = upperHull[upperHull.length - 2];
        if ((q.x - r2.x) * (p2.y - r2.y) >= (q.y - r2.y) * (p2.x - r2.x)) upperHull.pop();
        else break;
      }
      upperHull.push(p2);
    }
    upperHull.pop();
    const lowerHull = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p2 = points[i];
      while (lowerHull.length >= 2) {
        const q = lowerHull[lowerHull.length - 1];
        const r2 = lowerHull[lowerHull.length - 2];
        if ((q.x - r2.x) * (p2.y - r2.y) >= (q.y - r2.y) * (p2.x - r2.x)) lowerHull.pop();
        else break;
      }
      lowerHull.push(p2);
    }
    lowerHull.pop();
    if (upperHull.length === 1 && lowerHull.length === 1 && upperHull[0].x === lowerHull[0].x && upperHull[0].y === lowerHull[0].y) {
      return upperHull;
    } else {
      return upperHull.concat(lowerHull);
    }
  }
  var Portal4 = TooltipPortal;
  var Content24 = TooltipContent;

  // ../../../packages/shadcn-ui/src/components/tooltip.tsx
  var TooltipContent2 = forwardRef(
    ({ className, sideOffset = 4, ...props }, ref) => createElement(
      Portal4,
      null,
      createElement(Content24, {
        ref,
        sideOffset,
        className: cn("xps-tooltip-content", className),
        ...props
      })
    )
  );
  TooltipContent2.displayName = Content24.displayName;

  // src/lib/remote-components/crm-workbench/src/utils.ts
  var PAGE_SIZE = 25;
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function unwrap(response) {
    if (!isObject(response)) return {};
    if (Object.prototype.hasOwnProperty.call(response, "data")) return response.data;
    if (Object.prototype.hasOwnProperty.call(response, "result")) return response.result;
    if (Object.prototype.hasOwnProperty.call(response, "payload")) return response.payload;
    return response;
  }
  function buildQuery(context, objectKey, search, recordId) {
    const payload = context.payload ?? {};
    const initialQuery = context.initialQuery ?? {};
    const parameters = {
      ...payload.parameters ?? {},
      ...initialQuery.parameters ?? {},
      objectKey: objectKey || void 0,
      recordId: recordId || void 0
    };
    return {
      page: 1,
      pageSize: PAGE_SIZE,
      ...initialQuery,
      search: search || void 0,
      parameters
    };
  }
  function normalizeData(raw) {
    const value = isObject(raw) ? raw : {};
    const table = isObject(value.table) ? value.table : {};
    return {
      summary: isObject(value.summary) ? value.summary : {},
      objects: Array.isArray(value.objects) ? value.objects : [],
      selectedObject: isObject(value.selectedObject) ? value.selectedObject : null,
      fields: Array.isArray(value.fields) ? value.fields : [],
      views: Array.isArray(value.views) ? value.views : [],
      table: {
        key: typeof table.key === "string" ? table.key : "records",
        items: Array.isArray(table.items) ? table.items : [],
        total: typeof table.total === "number" ? table.total : 0,
        page: typeof table.page === "number" ? table.page : 1,
        pageSize: typeof table.pageSize === "number" ? table.pageSize : PAGE_SIZE
      },
      selectedRecord: isObject(value.selectedRecord) ? value.selectedRecord : null,
      meta: isObject(value.meta) ? value.meta : {}
    };
  }
  function resolveNextSelection(result, options2) {
    if (options2.recordId) {
      return result.table.items.find((item) => item.id === options2.recordId) ?? result.selectedRecord ?? null;
    }
    if (options2.keepSelection && options2.selected) {
      return result.table.items.find((item) => item.id === options2.selected?.id) ?? result.selectedRecord ?? options2.selected;
    }
    return null;
  }
  function getInitialObjectKey(context) {
    const fromInitial = context.initialQuery?.parameters?.objectKey;
    const fromPayload = context.payload?.parameters?.objectKey;
    const value = Array.isArray(fromInitial) ? fromInitial[0] : fromInitial || fromPayload;
    return typeof value === "string" && value.trim() ? value.trim() : "company";
  }
  function getColumnsFromKeys(fields, columnKeys) {
    const normalized = columnKeys.map((key) => fields.find((field) => field.fieldKey === key)).filter((field) => Boolean(field)).slice(0, 7);
    return normalized.length ? normalized : fields.slice(0, 7);
  }
  function getDefaultColumnKeys(data, fields) {
    const view = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0];
    const keys = Array.isArray(view?.columns) && view.columns.length ? view.columns : fields.slice(0, 6).map((field) => field.fieldKey);
    return getColumnsFromKeys(fields, keys).map((field) => field.fieldKey);
  }
  function getRelationLabels(data) {
    const value = data?.meta?.relationLabels;
    if (!isObject(value)) return {};
    const relationLabels = {};
    Object.entries(value).forEach(([fieldKey, labels]) => {
      if (!isObject(labels)) return;
      relationLabels[fieldKey] = Object.fromEntries(Object.entries(labels).map(([recordId, label]) => [recordId, String(label)]));
    });
    return relationLabels;
  }
  function getRelatedRecordSections(data) {
    const value = data?.meta?.relatedRecords;
    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map((section) => ({
      objectKey: typeof section.objectKey === "string" ? section.objectKey : "",
      objectLabel: typeof section.objectLabel === "string" ? section.objectLabel : void 0,
      objectPluralLabel: typeof section.objectPluralLabel === "string" ? section.objectPluralLabel : void 0,
      relationFieldKey: typeof section.relationFieldKey === "string" ? section.relationFieldKey : "",
      relationFieldLabel: typeof section.relationFieldLabel === "string" ? section.relationFieldLabel : void 0,
      fields: Array.isArray(section.fields) ? section.fields : [],
      items: Array.isArray(section.items) ? section.items : [],
      total: typeof section.total === "number" ? section.total : 0
    })).filter((section) => section.objectKey && section.relationFieldKey && section.total > 0);
  }
  function getTimelineItems(data) {
    const value = data?.meta?.timeline;
    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      type: normalizeTimelineType(item.type),
      objectKey: typeof item.objectKey === "string" ? item.objectKey : null,
      recordId: typeof item.recordId === "string" ? item.recordId : null,
      title: typeof item.title === "string" && item.title.trim() ? item.title : "Activity",
      body: typeof item.body === "string" && item.body.trim() ? item.body : void 0,
      status: typeof item.status === "string" && item.status.trim() ? item.status : void 0,
      occurredAt: stringifyDate(item.occurredAt),
      createdAt: stringifyDate(item.createdAt),
      updatedAt: stringifyDate(item.updatedAt)
    })).filter((item) => item.id);
  }
  function toFormValues(fields, values, includeDefaults = false) {
    const form = {};
    fields.forEach((field) => {
      if (!field.fieldKey) return;
      if (Object.prototype.hasOwnProperty.call(values, field.fieldKey)) {
        form[field.fieldKey] = values[field.fieldKey];
      } else if (includeDefaults && field.defaultValue !== void 0) {
        form[field.fieldKey] = field.defaultValue;
      } else {
        form[field.fieldKey] = field.type === "boolean" ? false : "";
      }
    });
    return form;
  }
  function normalizeFormValues(fields, form) {
    const values = {};
    fields.forEach((field) => {
      const value = form[field.fieldKey];
      if (field.type === "boolean") {
        values[field.fieldKey] = Boolean(value);
        return;
      }
      if (value === void 0 || value === null) return;
      if (typeof value === "string" && value.trim() === "") return;
      values[field.fieldKey] = value;
    });
    return values;
  }
  function displayRecordTitle(record, fields, t) {
    const values = record.values ?? {};
    const title = values.name || [values.firstName, values.lastName].filter(Boolean).join(" ") || values.title || fields.map((field) => values[field.fieldKey]).find(Boolean);
    return title ? String(title) : record.id || t.untitled;
  }
  function formatText(value, field, _fields, t) {
    if (value === void 0 || value === null || value === "") return t.noValue;
    const text = String(value);
    if (field.type === "rich_text" && text.length > 96) return `${text.slice(0, 96)}...`;
    if (text.length > 64) return `${text.slice(0, 64)}...`;
    return text;
  }
  function formatCurrency(value, locale) {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numberValue)) return String(value);
    return numberValue.toLocaleString(locale === "zh_Hans" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: 0
    });
  }
  function formatDate(value, locale) {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(locale === "zh_Hans" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  function resolveText(value, locale) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (isObject(value)) {
      const preferred = locale === "zh_Hans" ? value.zh_Hans : value.en_US;
      const fallback = locale === "zh_Hans" ? value.en_US : value.zh_Hans;
      return String(preferred || fallback || "");
    }
    return String(value);
  }
  function objectIcon(object) {
    const key = object.objectKey || "";
    const icon = object.icon || "";
    if (key === "company" || icon.includes("building")) return "building";
    if (key === "person" || icon.includes("contacts")) return "person";
    if (key === "opportunity" || icon.includes("line-chart")) return "target";
    if (key === "task" || icon.includes("checkbox")) return "check";
    if (key === "note" || icon.includes("note")) return "note";
    if (key === "workflow") return "workflow";
    return "grid";
  }
  function fieldIcon(field) {
    if (field.type === "url") return "link";
    if (field.type === "email") return "mail";
    if (field.type === "phone") return "phone";
    if (field.type === "date" || field.type === "datetime") return "calendar";
    if (field.type === "currency" || field.type === "number") return "money";
    if (field.type === "relation") return "link";
    if (field.type === "select" || field.type === "multi_select") return "list";
    if (field.fieldKey?.toLowerCase().includes("owner")) return "person";
    return "hash";
  }
  function columnWidth(field, index2) {
    if (index2 === 0) return 240;
    if (field.type === "url" || field.type === "email") return 220;
    if (field.type === "phone") return 170;
    if (field.type === "select" || field.type === "multi_select") return 180;
    if (field.type === "currency" || field.type === "number") return 150;
    if (field.type === "date" || field.type === "datetime") return 160;
    if (field.type === "boolean") return 130;
    if (field.type === "relation") return 210;
    if (field.type === "rich_text") return 280;
    return 220;
  }
  function sortRecords(records, field, sortMode) {
    if (!field || sortMode === "server") return records;
    return [...records].sort((a, b) => {
      const left = String(a.values?.[field.fieldKey] ?? "");
      const right = String(b.values?.[field.fieldKey] ?? "");
      return sortMode === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
  }
  function countNonEmpty(records, fieldKey) {
    return records.filter((record) => {
      const value = record.values?.[fieldKey];
      return value !== void 0 && value !== null && String(value).trim() !== "";
    }).length;
  }
  function recordInitial(title) {
    const trimmed = title.trim();
    if (!trimmed) return "#";
    const firstTwo = trimmed.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
    return firstTwo.slice(0, 2).toUpperCase();
  }
  function isUrlLike(value) {
    return /^https?:\/\//i.test(value) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(value);
  }
  function shortUrl(value) {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      return url.hostname.replace(/^www\./, "");
    } catch {
      return value.replace(/^https?:\/\//, "").replace(/^www\./, "");
    }
  }
  function stringifyDate(value) {
    if (value === void 0 || value === null || value === "") return void 0;
    return String(value);
  }
  function normalizeTimelineType(value) {
    if (value === "note" || value === "task") return value;
    return "activity";
  }

  // src/lib/remote-components/crm-workbench/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var instanceId = null;
  var requestSequence = 0;
  var pending = /* @__PURE__ */ new Map();
  function installBridgeListener(handlers) {
    const listener = (event) => {
      const rawMessage = event.data;
      if (!isObject(rawMessage) || rawMessage.channel !== CHANNEL || rawMessage.protocolVersion !== VERSION) return;
      const message = rawMessage;
      if (message.type === "init") {
        instanceId = typeof message.instanceId === "string" ? message.instanceId : null;
        handlers.onInit({
          manifest: message.manifest,
          payload: message.payload,
          initialQuery: message.initialQuery ?? {},
          locale: message.locale,
          theme: message.theme
        });
        setTimeout(reportResize, 0);
        return;
      }
      if (message.instanceId !== instanceId) return;
      if (message.type === "hostEvent") {
        handlers.onHostEvent();
        return;
      }
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      if (requestId && pending.has(requestId)) {
        const item = pending.get(requestId);
        pending.delete(requestId);
        if (!item) return;
        if (message.type === "error") {
          item.reject(new Error(typeof message.message === "string" ? message.message : "Remote CRM request failed"));
        } else {
          item.resolve(message);
        }
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  function post(type, body) {
    if (!instanceId && type !== "ready") return;
    window.parent.postMessage(
      {
        channel: CHANNEL,
        protocolVersion: VERSION,
        instanceId,
        type,
        ...body ?? {}
      },
      "*"
    );
  }
  function request(type, body) {
    const requestId = String(++requestSequence);
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        post(type, { requestId, ...body ?? {} });
      } catch (error) {
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  function requestData(query) {
    return request("requestData", { query });
  }
  function executeAction(actionKey, targetId, input, parameters) {
    return request("executeAction", { actionKey, targetId, input, parameters });
  }
  function notify(message, level = "success") {
    post("notify", { message, level });
  }
  function reportResize() {
    const root2 = document.getElementById("root");
    const shell = root2?.firstElementChild;
    const height = Math.max(shell?.scrollHeight ?? 0, 640);
    post("resize", { height: Math.ceil(height), viewportBound: false });
  }

  // src/lib/remote-components/crm-workbench/src/vendor.ts
  var React2 = window.React;
  var ReactDOM = window.ReactDOM;

  // src/lib/remote-components/crm-workbench/src/icons.tsx
  function Icon2({ name }) {
    const path = iconPath(name);
    return /* @__PURE__ */ React.createElement("svg", { className: "crm20-icon", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, path);
  }
  function iconPath(name) {
    switch (name) {
      case "home":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 11.4 12 5l8 6.4v7.1a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V20H5.5A1.5 1.5 0 0 1 4 18.5v-7.1Z" });
      case "message":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.2 3v-3.4A2.5 2.5 0 0 1 5 12.5v-6Z" });
      case "message-plus":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.2 3v-3.4A2.5 2.5 0 0 1 5 12.5v-6Z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7.5v4M10 9.5h4" }));
      case "building":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20M4.5 20h15M9 8h2M13 8h2M9 11h2M13 11h2M9 14h2M13 14h2" });
      case "person":
        return /* @__PURE__ */ React.createElement("path", { d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" });
      case "target":
        return /* @__PURE__ */ React.createElement("path", { d: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h8" });
      case "check":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 12.5 9.2 17 19 7" });
      case "note":
        return /* @__PURE__ */ React.createElement("path", { d: "M7 4h7l3 3v13H7V4ZM14 4v4h4M9.5 12h5M9.5 15h5" });
      case "grid":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h5v5h-5v-5Z" });
      case "workflow":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 7h5M13 7h5M6 17h5M13 17h5M11 7v10M13 7v10" });
      case "search":
        return /* @__PURE__ */ React.createElement("path", { d: "m16.5 16.5 3.5 3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" });
      case "list":
        return /* @__PURE__ */ React.createElement("path", { d: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" });
      case "plus":
        return /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14" });
      case "refresh":
        return /* @__PURE__ */ React.createElement("path", { d: "M19 8a7 7 0 0 0-12.1-2.8L5 7M5 4v3h3M5 16a7 7 0 0 0 12.1 2.8L19 17M19 20v-3h-3" });
      case "more":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 12h.01M12 12h.01M18 12h.01" });
      case "chevron":
        return /* @__PURE__ */ React.createElement("path", { d: "m8 10 4 4 4-4" });
      case "close":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 6 18 18M18 6 6 18" });
      case "save":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 4h10l2 2v14H6V4ZM9 4v6h6V4M9 17h6" });
      case "edit":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 19h4l10-10-4-4L5 15v4ZM13.5 6.5l4 4" });
      case "table":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 6h16v12H4V6ZM4 10h16M9 6v12M15 6v12" });
      case "link":
        return /* @__PURE__ */ React.createElement("path", { d: "M10 14a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7L11 7.3M14 10a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7L13 16.7" });
      case "mail":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 6h16v12H4V6ZM5 7l7 6 7-6" });
      case "phone":
        return /* @__PURE__ */ React.createElement("path", { d: "M8 5h3l1 4-2 1a9 9 0 0 0 4 4l1-2 4 1v3a2 2 0 0 1-2 2A11 11 0 0 1 6 7a2 2 0 0 1 2-2Z" });
      case "calendar":
        return /* @__PURE__ */ React.createElement("path", { d: "M7 4v3M17 4v3M5 8h14M6 6h12a1 1 0 0 1 1 1v12H5V7a1 1 0 0 1 1-1Z" });
      case "money":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 7h16v10H4V7ZM7 10h.01M17 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" });
      case "hash":
        return /* @__PURE__ */ React.createElement("path", { d: "M9 4 7 20M17 4l-2 16M5 9h14M4 15h14" });
      default:
        return /* @__PURE__ */ React.createElement("path", { d: "M5 5h14v14H5V5Z" });
    }
  }

  // src/lib/remote-components/crm-workbench/src/i18n.ts
  var TEXT = {
    zh_Hans: {
      loading: "\u6B63\u5728\u521D\u59CB\u5316 CRM \u5DE5\u4F5C\u53F0...",
      workspace: "Xpert CRM",
      nativeCrm: "\u539F\u751F CRM",
      newChat: "New chat",
      allRecords: "\u5168\u90E8",
      records: "\u8BB0\u5F55",
      record: "\u8BB0\u5F55",
      objects: "\u5BF9\u8C61",
      searchPlaceholder: "\u641C\u7D22\u5F53\u524D\u5BF9\u8C61",
      filter: "\u7B5B\u9009",
      sort: "\u6392\u5E8F",
      options: "\u9009\u9879",
      refresh: "\u5237\u65B0",
      addNew: "Add New",
      newRecord: "\u65B0\u5EFA\u8BB0\u5F55",
      create: "\u65B0\u5EFA",
      edit: "\u7F16\u8F91",
      save: "\u4FDD\u5B58",
      saving: "\u4FDD\u5B58\u4E2D...",
      cancel: "\u53D6\u6D88",
      close: "\u5173\u95ED",
      details: "\u8BE6\u60C5",
      empty: "\u6682\u65E0\u8BB0\u5F55",
      noValue: "-",
      countAll: "\u603B\u8BA1",
      calculate: "\u8BA1\u7B97",
      notEmpty: "\u975E\u7A7A",
      updated: "\u66F4\u65B0",
      created: "\u521B\u5EFA",
      fields: "\u5B57\u6BB5",
      required: "\u5FC5\u586B",
      untitled: "\u672A\u547D\u540D",
      saved: "CRM \u8BB0\u5F55\u5DF2\u4FDD\u5B58",
      loadFailed: "CRM \u6570\u636E\u52A0\u8F7D\u5931\u8D25",
      saveFailed: "\u4FDD\u5B58\u5931\u8D25",
      showCompact: "\u7D27\u51D1\u5BC6\u5EA6",
      showComfortable: "\u8212\u9002\u5BC6\u5EA6",
      viewMode: "\u89C6\u56FE",
      selectedCount: "\u5DF2\u9009\u62E9",
      clearSelection: "\u6E05\u9664\u9009\u62E9",
      selectAll: "\u5168\u9009\u5F53\u524D\u9875",
      sortBy: "\u6392\u5E8F\u5B57\u6BB5",
      noSorting: "\u9ED8\u8BA4\u987A\u5E8F",
      ascending: "\u5347\u5E8F",
      descending: "\u964D\u5E8F",
      tableDensity: "\u8868\u683C\u5BC6\u5EA6",
      compactDensity: "\u7D27\u51D1",
      comfortableDensity: "\u8212\u9002",
      visibleRows: "\u5F53\u524D\u53EF\u89C1",
      relationReference: "\u5173\u8054\u8BB0\u5F55 ID",
      searchActive: "\u641C\u7D22\u4E2D",
      fieldsMenu: "\u5B57\u6BB5",
      visibleFields: "\u663E\u793A\u5B57\u6BB5",
      viewSaved: "\u89C6\u56FE\u5DF2\u4FDD\u5B58",
      atLeastOneColumn: "\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u663E\u793A\u5B57\u6BB5",
      searchRelation: "\u641C\u7D22\u5173\u8054\u8BB0\u5F55",
      relatedRecords: "\u5173\u8054\u8BB0\u5F55",
      relationNoResults: "\u6CA1\u6709\u627E\u5230\u5173\u8054\u8BB0\u5F55",
      clearRelation: "\u6E05\u9664\u5173\u8054",
      loadingRelatedRecords: "\u6B63\u5728\u52A0\u8F7D\u5173\u8054\u8BB0\u5F55...",
      linkedBy: "\u901A\u8FC7",
      openRelatedRecord: "\u6253\u5F00\u5173\u8054\u8BB0\u5F55",
      moreRelatedRecords: "\u66F4\u591A\u5173\u8054\u8BB0\u5F55",
      timeline: "\u65F6\u95F4\u7EBF",
      properties: "\u5B57\u6BB5",
      noTimelineItems: "\u6682\u65E0\u65F6\u95F4\u7EBF",
      activity: "\u6D3B\u52A8",
      note: "\u5907\u6CE8",
      task: "\u4EFB\u52A1",
      due: "\u622A\u6B62"
    },
    en_US: {
      loading: "Initializing CRM workbench...",
      workspace: "Xpert CRM",
      nativeCrm: "Native CRM",
      newChat: "New chat",
      allRecords: "All",
      records: "records",
      record: "Record",
      objects: "Objects",
      searchPlaceholder: "Search this object",
      filter: "Filter",
      sort: "Sort",
      options: "Options",
      refresh: "Refresh",
      addNew: "Add New",
      newRecord: "New record",
      create: "Create",
      edit: "Edit",
      save: "Save",
      saving: "Saving...",
      cancel: "Cancel",
      close: "Close",
      details: "Details",
      empty: "No records yet",
      noValue: "-",
      countAll: "Count all",
      calculate: "Calculate",
      notEmpty: "Not empty",
      updated: "Updated",
      created: "Created",
      fields: "Fields",
      required: "Required",
      untitled: "Untitled",
      saved: "CRM record saved",
      loadFailed: "CRM data failed to load",
      saveFailed: "Save failed",
      showCompact: "Compact density",
      showComfortable: "Comfortable density",
      viewMode: "View",
      selectedCount: "selected",
      clearSelection: "Clear selection",
      selectAll: "Select visible",
      sortBy: "Sort by",
      noSorting: "Default order",
      ascending: "Ascending",
      descending: "Descending",
      tableDensity: "Table density",
      compactDensity: "Compact",
      comfortableDensity: "Comfortable",
      visibleRows: "Visible",
      relationReference: "Related record ID",
      searchActive: "Search active",
      fieldsMenu: "Fields",
      visibleFields: "Visible fields",
      viewSaved: "View saved",
      atLeastOneColumn: "Keep at least one visible field",
      searchRelation: "Search related records",
      relatedRecords: "Related records",
      relationNoResults: "No related records found",
      clearRelation: "Clear relation",
      loadingRelatedRecords: "Loading related records...",
      linkedBy: "Linked by",
      openRelatedRecord: "Open related record",
      moreRelatedRecords: "more related records",
      timeline: "Timeline",
      properties: "Properties",
      noTimelineItems: "No timeline items",
      activity: "Activity",
      note: "Note",
      task: "Task",
      due: "Due"
    }
  };
  function resolveLocale(locale) {
    return locale && locale.toLowerCase().startsWith("zh") ? "zh_Hans" : "en_US";
  }

  // src/lib/remote-components/crm-workbench/src/components/field-value.tsx
  function NameCell({
    field,
    fields,
    record,
    objectKey,
    locale,
    relationLabels,
    t
  }) {
    const title = displayRecordTitle(record, fields, t);
    return /* @__PURE__ */ React2.createElement("span", { className: "crm20-name-cell" }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${objectKey}` }, recordInitial(title)), /* @__PURE__ */ React2.createElement("span", { className: "crm20-name-text" }, /* @__PURE__ */ React2.createElement(FieldValue, { value: record.values?.[field.fieldKey] ?? title, field, fields, locale, relationLabels, t })));
  }
  function FieldValue({
    value,
    field,
    fields,
    locale,
    t,
    relationLabels
  }) {
    if (value === void 0 || value === null || value === "") {
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-muted-value" }, t.noValue);
    }
    if (field.type === "currency") {
      return /* @__PURE__ */ React2.createElement("span", null, formatCurrency(value, locale));
    }
    if (field.type === "boolean") {
      return /* @__PURE__ */ React2.createElement("span", null, value ? locale === "zh_Hans" ? "\u662F" : "Yes" : locale === "zh_Hans" ? "\u5426" : "No");
    }
    if (field.type === "select" && Array.isArray(field.options)) {
      const option = field.options.find((item) => item.value === String(value));
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-chip", style: { "--chip-color": option?.color || "#64748b" } }, /* @__PURE__ */ React2.createElement("span", null), option?.label || String(value));
    }
    if (field.type === "multi_select") {
      const items = Array.isArray(value) ? value : String(value).split(/[,，、;；\n]+/).filter(Boolean);
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-multi-value" }, items.slice(0, 2).map((item) => /* @__PURE__ */ React2.createElement("span", { className: "crm20-pill", key: String(item) }, String(item))), items.length > 2 ? /* @__PURE__ */ React2.createElement("span", { className: "crm20-muted-value" }, "+", items.length - 2) : null);
    }
    if (field.type === "url" || isUrlLike(String(value))) {
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-link-pill" }, shortUrl(String(value)));
    }
    if (field.type === "email") {
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-link-value" }, String(value));
    }
    if (field.type === "date" || field.type === "datetime") {
      return /* @__PURE__ */ React2.createElement("span", null, formatDate(value, locale));
    }
    if (field.type === "relation") {
      const relationId = String(value);
      const relationLabel = relationLabels?.[field.fieldKey]?.[relationId];
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-relation-value" }, relationLabel || `#${relationId.slice(0, 8)}`);
    }
    return /* @__PURE__ */ React2.createElement("span", null, formatText(value, field, fields, t));
  }

  // src/lib/remote-components/crm-workbench/src/components/relation-picker.tsx
  var { useCallback: useCallback2, useEffect: useEffect2, useMemo: useMemo2, useState: useState2 } = React2;
  var RELATION_PAGE_SIZE = 8;
  function RelationPicker({
    field,
    value,
    locale,
    t,
    onChange
  }) {
    const targetObjectKey = field.relationObjectKey || "";
    const valueText = value === void 0 || value === null ? "" : String(value);
    const [open, setOpen] = useState2(false);
    const [query, setQuery] = useState2("");
    const [busy, setBusy] = useState2(false);
    const [targetFields, setTargetFields] = useState2([]);
    const [records, setRecords] = useState2([]);
    const [selectedRecord, setSelectedRecord] = useState2(null);
    const selectedTitle = useMemo2(() => {
      if (selectedRecord) return displayRecordTitle(selectedRecord, targetFields, t);
      if (valueText) return `#${valueText.slice(0, 8)}`;
      return t.noValue;
    }, [selectedRecord, t, targetFields, valueText]);
    const loadRecords = useCallback2(
      async (search, recordId) => {
        if (!targetObjectKey) return;
        setBusy(true);
        try {
          const response = await requestData({
            page: 1,
            pageSize: RELATION_PAGE_SIZE,
            search: search.trim() || void 0,
            parameters: {
              objectKey: targetObjectKey,
              recordId: recordId || void 0
            }
          });
          const result = normalizeData(unwrap(response));
          const items = [...result.table.items];
          if (result.selectedRecord && !items.some((item) => item.id === result.selectedRecord?.id)) {
            items.unshift(result.selectedRecord);
          }
          setTargetFields(result.fields);
          setRecords(items);
          if (valueText) {
            const selected = items.find((item) => item.id === valueText) ?? null;
            setSelectedRecord(selected);
          }
        } finally {
          setBusy(false);
        }
      },
      [targetObjectKey, valueText]
    );
    useEffect2(() => {
      if (!targetObjectKey) return;
      loadRecords("", valueText || void 0);
    }, [loadRecords, targetObjectKey, valueText]);
    useEffect2(() => {
      if (!open) return;
      const timeout = window.setTimeout(() => {
        loadRecords(query, valueText || void 0);
      }, 220);
      return () => window.clearTimeout(timeout);
    }, [loadRecords, open, query, valueText]);
    function selectRecord(record) {
      setSelectedRecord(record);
      onChange(record.id);
      setOpen(false);
      setQuery("");
    }
    function clearRelation() {
      setSelectedRecord(null);
      onChange("");
      setOpen(false);
      setQuery("");
    }
    if (!targetObjectKey) {
      return /* @__PURE__ */ React2.createElement(Button, { variant: "outline", className: "crm20-relation-trigger", disabled: true }, t.relationReference);
    }
    return /* @__PURE__ */ React2.createElement("div", { className: "crm20-relation-picker" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-relation-row" }, /* @__PURE__ */ React2.createElement(Button, { variant: "outline", className: "crm20-relation-trigger", onClick: () => setOpen((current) => !current) }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${targetObjectKey}` }, selectedRecord ? recordInitial(selectedTitle) : "#"), /* @__PURE__ */ React2.createElement("span", { className: "crm20-relation-title" }, selectedTitle), /* @__PURE__ */ React2.createElement(Badge, { variant: "secondary" }, targetObjectKey)), valueText ? /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "icon", title: t.clearRelation, onClick: clearRelation }, /* @__PURE__ */ React2.createElement(Icon2, { name: "close" })) : null), open ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-relation-command" }, /* @__PURE__ */ React2.createElement(Command, { shouldFilter: false }, /* @__PURE__ */ React2.createElement(CommandInput, { value: query, onValueChange: setQuery, placeholder: t.searchRelation }), /* @__PURE__ */ React2.createElement(CommandList, null, /* @__PURE__ */ React2.createElement(CommandEmpty, null, busy ? t.loadingRelatedRecords : t.relationNoResults), /* @__PURE__ */ React2.createElement(CommandGroup, { heading: t.relatedRecords }, records.map((record) => {
      const title = displayRecordTitle(record, targetFields, t);
      return /* @__PURE__ */ React2.createElement(CommandItem, { key: record.id, value: `${record.id} ${title}`, onSelect: () => selectRecord(record) }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${record.objectKey || targetObjectKey}` }, recordInitial(title)), /* @__PURE__ */ React2.createElement("span", { className: "crm20-relation-option-text" }, /* @__PURE__ */ React2.createElement("strong", null, title), /* @__PURE__ */ React2.createElement("small", null, locale === "zh_Hans" ? "\u8BB0\u5F55" : "Record", " #", record.id.slice(0, 8))));
    }))))) : null);
  }

  // src/lib/remote-components/crm-workbench/src/components/related-records-panel.tsx
  function RelatedRecordsPanel({
    sections,
    locale,
    t,
    onOpenRecord
  }) {
    if (!sections.length) return null;
    return /* @__PURE__ */ React2.createElement("section", { className: "crm20-related-panel" }, /* @__PURE__ */ React2.createElement("header", { className: "crm20-related-heading" }, /* @__PURE__ */ React2.createElement("strong", null, t.relatedRecords)), sections.map((section, index2) => /* @__PURE__ */ React2.createElement("div", { className: "crm20-related-section", key: `${section.objectKey}-${section.relationFieldKey}` }, index2 > 0 ? /* @__PURE__ */ React2.createElement(Separator3, null) : null, /* @__PURE__ */ React2.createElement("div", { className: "crm20-related-section-header" }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-object-icon crm20-object-${section.objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: objectIcon({ objectKey: section.objectKey }) })), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("strong", null, section.objectPluralLabel || section.objectLabel || section.objectKey), /* @__PURE__ */ React2.createElement("small", null, t.linkedBy, " ", section.relationFieldLabel || section.relationFieldKey)), /* @__PURE__ */ React2.createElement(Badge, { variant: "secondary" }, section.total)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-related-list" }, section.items.map((record) => {
      const title = displayRecordTitle(record, section.fields, t);
      const subtitle = relatedSubtitle(record, section.fields, section.relationFieldKey, locale, t);
      return /* @__PURE__ */ React2.createElement(
        Button,
        {
          variant: "ghost",
          className: "crm20-related-record",
          key: record.id,
          title: t.openRelatedRecord,
          onClick: () => onOpenRecord(section.objectKey, record.id)
        },
        /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${section.objectKey}` }, recordInitial(title)),
        /* @__PURE__ */ React2.createElement("span", null, /* @__PURE__ */ React2.createElement("strong", null, title), subtitle ? /* @__PURE__ */ React2.createElement("small", null, subtitle) : null),
        /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })
      );
    }), section.total > section.items.length ? /* @__PURE__ */ React2.createElement("span", { className: "crm20-related-more" }, "+", section.total - section.items.length, " ", t.moreRelatedRecords) : null))));
  }
  function relatedSubtitle(record, fields, relationFieldKey, locale, t) {
    const values = record.values ?? {};
    const skipped = /* @__PURE__ */ new Set(["name", "firstName", "lastName", "title", relationFieldKey]);
    const field = fields.find((item) => {
      const value2 = values[item.fieldKey];
      return !skipped.has(item.fieldKey) && value2 !== void 0 && value2 !== null && String(value2).trim() !== "";
    });
    if (!field) return "";
    const value = values[field.fieldKey];
    if (field.type === "date" || field.type === "datetime") return formatDate(value, locale);
    return formatText(resolveOptionLabel(value, field), field, fields, t);
  }
  function resolveOptionLabel(value, field) {
    if ((field.type === "select" || field.type === "multi_select") && Array.isArray(field.options)) {
      if (Array.isArray(value)) {
        return value.map((item) => field.options?.find((option) => option.value === String(item))?.label || String(item)).join(", ");
      }
      return field.options.find((option) => option.value === String(value))?.label || value;
    }
    return value;
  }

  // src/lib/remote-components/crm-workbench/src/components/timeline-panel.tsx
  function TimelinePanel({
    items,
    locale,
    t,
    onOpenRecord
  }) {
    if (!items.length) {
      return /* @__PURE__ */ React2.createElement("section", { className: "crm20-timeline-empty" }, /* @__PURE__ */ React2.createElement("span", { className: "crm20-timeline-dot" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "workflow" })), /* @__PURE__ */ React2.createElement("strong", null, t.noTimelineItems));
    }
    return /* @__PURE__ */ React2.createElement("section", { className: "crm20-timeline-panel" }, items.map((item, index2) => /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-item", key: `${item.type}-${item.id}` }, index2 > 0 ? /* @__PURE__ */ React2.createElement(Separator3, null) : null, /* @__PURE__ */ React2.createElement("div", { className: `crm20-timeline-dot crm20-timeline-${item.type}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: timelineIcon(item.type) })), /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-content" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-meta" }, /* @__PURE__ */ React2.createElement(Badge, { variant: "secondary" }, timelineLabel(item.type, t)), item.status ? /* @__PURE__ */ React2.createElement(Badge, { variant: "secondary" }, item.status) : null, /* @__PURE__ */ React2.createElement("time", null, formatDate(item.occurredAt || item.updatedAt || item.createdAt, locale))), item.type === "note" || item.type === "task" ? /* @__PURE__ */ React2.createElement(
      Button,
      {
        variant: "ghost",
        className: "crm20-timeline-record",
        onClick: () => onOpenRecord(item.objectKey || item.type, item.id)
      },
      /* @__PURE__ */ React2.createElement("span", null, /* @__PURE__ */ React2.createElement("strong", null, item.title), item.body ? /* @__PURE__ */ React2.createElement("small", null, itemBody(item, t)) : null),
      /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })
    ) : /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-activity-body" }, /* @__PURE__ */ React2.createElement("strong", null, item.title), item.body ? /* @__PURE__ */ React2.createElement("small", null, item.body) : null)))));
  }
  function timelineIcon(type) {
    if (type === "note") return "note";
    if (type === "task") return "check";
    return "edit";
  }
  function timelineLabel(type, t) {
    if (type === "note") return t.note;
    if (type === "task") return t.task;
    return t.activity;
  }
  function itemBody(item, t) {
    if (item.type === "task" && item.body?.startsWith("Due ")) {
      return `${t.due} ${item.body.slice(4)}`;
    }
    return item.body;
  }

  // src/lib/remote-components/crm-workbench/src/components/inspector.tsx
  var EMPTY_SELECT_VALUE = "__empty__";
  function Inspector({
    mode,
    record,
    fields,
    draft,
    locale,
    t,
    objectLabel,
    objectKey,
    relationLabels,
    relatedSections,
    timelineItems,
    busy,
    onChange,
    onEdit,
    onClose,
    onCancel,
    onOpenRelatedRecord,
    onSave
  }) {
    const isEditing = mode === "edit" || mode === "create";
    const title = mode === "create" ? t.newRecord : record ? displayRecordTitle(record, fields, t) : t.details;
    return /* @__PURE__ */ React2.createElement(Sheet, { open: mode !== "closed", onOpenChange: (open) => !open && onClose() }, /* @__PURE__ */ React2.createElement(SheetContent, { className: "crm20-inspector-content", side: "right", showClose: false }, /* @__PURE__ */ React2.createElement("header", { className: "crm20-inspector-header" }, /* @__PURE__ */ React2.createElement("div", { className: `crm20-inspector-avatar crm20-object-${objectKey}` }, mode === "create" ? /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }) : /* @__PURE__ */ React2.createElement("span", null, recordInitial(title))), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("span", null, objectLabel), /* @__PURE__ */ React2.createElement("strong", null, title)), /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "icon", title: t.close, onClick: onClose }, /* @__PURE__ */ React2.createElement(Icon2, { name: "close" }))), /* @__PURE__ */ React2.createElement("div", { className: "crm20-inspector-meta" }, /* @__PURE__ */ React2.createElement("span", null, t.created, ": ", record?.createdAt ? formatDate(record.createdAt, locale) : t.noValue), /* @__PURE__ */ React2.createElement("span", null, t.updated, ": ", record?.updatedAt ? formatDate(record.updatedAt, locale) : t.noValue)), isEditing ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-form" }, fields.map((field) => /* @__PURE__ */ React2.createElement("label", { className: "crm20-field", key: field.fieldKey }, /* @__PURE__ */ React2.createElement("span", null, field.label || field.fieldKey, field.required ? /* @__PURE__ */ React2.createElement("em", null, t.required) : null, /* @__PURE__ */ React2.createElement("small", null, field.type || "text")), /* @__PURE__ */ React2.createElement(FieldInput, { field, value: draft[field.fieldKey], locale, t, onChange: (value) => onChange(field.fieldKey, value) })))) : /* @__PURE__ */ React2.createElement(Tabs2, { className: "crm20-inspector-tabs", defaultValue: "properties" }, /* @__PURE__ */ React2.createElement(TabsList2, null, /* @__PURE__ */ React2.createElement(TabsTrigger2, { value: "properties" }, t.properties), /* @__PURE__ */ React2.createElement(TabsTrigger2, { value: "timeline" }, t.timeline)), /* @__PURE__ */ React2.createElement(TabsContent2, { value: "properties" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-read-fields" }, fields.map((field) => /* @__PURE__ */ React2.createElement("div", { className: "crm20-read-field", key: field.fieldKey }, /* @__PURE__ */ React2.createElement("span", null, field.label || field.fieldKey), /* @__PURE__ */ React2.createElement("strong", null, /* @__PURE__ */ React2.createElement(FieldValue, { value: record?.values?.[field.fieldKey], field, fields, locale, relationLabels, t })))), /* @__PURE__ */ React2.createElement(RelatedRecordsPanel, { sections: relatedSections, locale, t, onOpenRecord: onOpenRelatedRecord }))), /* @__PURE__ */ React2.createElement(TabsContent2, { value: "timeline" }, /* @__PURE__ */ React2.createElement(TimelinePanel, { items: timelineItems, locale, t, onOpenRecord: onOpenRelatedRecord }))), /* @__PURE__ */ React2.createElement("footer", { className: "crm20-inspector-actions" }, isEditing ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Button, { variant: "outline", onClick: onCancel, disabled: busy }, t.cancel), /* @__PURE__ */ React2.createElement(Button, { onClick: onSave, disabled: busy }, /* @__PURE__ */ React2.createElement(Icon2, { name: "save" }), /* @__PURE__ */ React2.createElement("span", null, busy ? t.saving : t.save))) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Button, { variant: "outline", onClick: onClose }, t.close), /* @__PURE__ */ React2.createElement(Button, { onClick: onEdit }, /* @__PURE__ */ React2.createElement(Icon2, { name: "edit" }), /* @__PURE__ */ React2.createElement("span", null, t.edit))))));
  }
  function FieldInput({
    field,
    value,
    locale,
    t,
    onChange
  }) {
    if (field.type === "select" && Array.isArray(field.options)) {
      const selectedValue = value === void 0 || value === null || value === "" ? EMPTY_SELECT_VALUE : String(value);
      return /* @__PURE__ */ React2.createElement(Select2, { value: selectedValue, onValueChange: (next) => onChange(next === EMPTY_SELECT_VALUE ? "" : next) }, /* @__PURE__ */ React2.createElement(SelectTrigger2, null, /* @__PURE__ */ React2.createElement(SelectValue2, { placeholder: "-" })), /* @__PURE__ */ React2.createElement(SelectContent2, null, /* @__PURE__ */ React2.createElement(SelectItem2, { value: EMPTY_SELECT_VALUE }, "-"), field.options.map((option) => /* @__PURE__ */ React2.createElement(SelectItem2, { key: option.value, value: option.value }, option.label || option.value))));
    }
    if (field.type === "boolean") {
      return /* @__PURE__ */ React2.createElement("label", { className: "crm20-checkbox-field" }, /* @__PURE__ */ React2.createElement(Checkbox2, { checked: Boolean(value), onCheckedChange: (checked) => onChange(checked === true) }));
    }
    if (field.type === "rich_text") {
      return /* @__PURE__ */ React2.createElement(Textarea, { rows: 5, value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "date") {
      return /* @__PURE__ */ React2.createElement(Input, { type: "date", value: value === void 0 || value === null ? "" : String(value).slice(0, 10), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "datetime") {
      return /* @__PURE__ */ React2.createElement(Input, { type: "datetime-local", value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "number" || field.type === "currency") {
      return /* @__PURE__ */ React2.createElement(Input, { type: "number", value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "relation") {
      return /* @__PURE__ */ React2.createElement(RelationPicker, { field, value, locale, t, onChange });
    }
    return /* @__PURE__ */ React2.createElement(Input, { value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
  }

  // src/lib/remote-components/crm-workbench/src/components/record-grid.tsx
  function RecordGrid({
    columns,
    fields,
    records,
    selectedId,
    checkedIds,
    objectKey,
    locale,
    relationLabels,
    t,
    busy,
    onSelect,
    onToggleRecord,
    onToggleAll,
    onCreate
  }) {
    const allVisibleChecked = records.length > 0 && records.every((record) => checkedIds.has(record.id));
    if (!records.length && !busy) {
      return /* @__PURE__ */ React2.createElement("div", { className: "crm20-empty-table" }, /* @__PURE__ */ React2.createElement("div", { className: `crm20-empty-icon crm20-object-${objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: "table" })), /* @__PURE__ */ React2.createElement("strong", null, t.empty), /* @__PURE__ */ React2.createElement(Button, { onClick: onCreate }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }), /* @__PURE__ */ React2.createElement("span", null, t.newRecord)));
    }
    return /* @__PURE__ */ React2.createElement("div", { className: "crm20-grid-scroll" }, /* @__PURE__ */ React2.createElement(Table, { className: "crm20-grid" }, /* @__PURE__ */ React2.createElement("colgroup", null, /* @__PURE__ */ React2.createElement("col", { className: "crm20-check-col" }), columns.map((field, index2) => /* @__PURE__ */ React2.createElement("col", { key: field.fieldKey, style: { width: `${columnWidth(field, index2)}px` } })), /* @__PURE__ */ React2.createElement("col", { className: "crm20-extra-col" })), /* @__PURE__ */ React2.createElement(TableHeader, null, /* @__PURE__ */ React2.createElement(TableRow, null, /* @__PURE__ */ React2.createElement(TableHead, { className: "crm20-check-cell" }, /* @__PURE__ */ React2.createElement(
      Checkbox2,
      {
        "aria-label": t.selectAll,
        checked: allVisibleChecked,
        onClick: (event) => event.stopPropagation(),
        onCheckedChange: (checked) => onToggleAll(checked === true)
      }
    )), columns.map((field) => /* @__PURE__ */ React2.createElement(TableHead, { key: field.fieldKey, title: field.label || field.fieldKey }, /* @__PURE__ */ React2.createElement("span", { className: "crm20-th-content" }, /* @__PURE__ */ React2.createElement(Icon2, { name: fieldIcon(field) }), /* @__PURE__ */ React2.createElement("span", null, field.label || field.fieldKey)))), /* @__PURE__ */ React2.createElement(TableHead, { className: "crm20-extra-cell" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" })))), /* @__PURE__ */ React2.createElement(TableBody, null, records.map((record) => {
      const isChecked = checkedIds.has(record.id);
      const className = [record.id === selectedId ? "is-selected" : "", isChecked ? "is-checked" : ""].filter(Boolean).join(" ");
      return /* @__PURE__ */ React2.createElement(TableRow, { key: record.id, className, onClick: () => onSelect(record), onDoubleClick: () => onSelect(record) }, /* @__PURE__ */ React2.createElement(TableCell, { className: "crm20-check-cell" }, /* @__PURE__ */ React2.createElement(
        Checkbox2,
        {
          "aria-label": "Select row",
          checked: isChecked,
          onClick: (event) => event.stopPropagation(),
          onCheckedChange: (checked) => onToggleRecord(record.id, checked === true)
        }
      )), columns.map((field, index2) => /* @__PURE__ */ React2.createElement(TableCell, { key: field.fieldKey }, index2 === 0 ? /* @__PURE__ */ React2.createElement(
        NameCell,
        {
          field,
          fields,
          record,
          objectKey: record.objectKey || objectKey,
          locale,
          relationLabels,
          t
        }
      ) : /* @__PURE__ */ React2.createElement(FieldValue, { value: record.values?.[field.fieldKey], field, fields, locale, relationLabels, t }))), /* @__PURE__ */ React2.createElement(TableCell, { className: "crm20-extra-cell" }));
    }))), busy ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-loading-line" }) : null);
  }

  // src/lib/remote-components/crm-workbench/src/components/workbench.tsx
  var { useCallback: useCallback3, useEffect: useEffect3, useMemo: useMemo3, useRef: useRef2, useState: useState3 } = React2;
  function CrmWorkbench({ context }) {
    const locale = resolveLocale(context.locale);
    const t = TEXT[locale];
    const searchRef = useRef2(null);
    const initialObjectKey = getInitialObjectKey(context);
    const [objectKey, setObjectKey] = useState3(initialObjectKey);
    const [searchDraft, setSearchDraft] = useState3(context.initialQuery?.search ?? "");
    const [searchQuery, setSearchQuery] = useState3(context.initialQuery?.search ?? "");
    const [data, setData] = useState3(null);
    const [selected, setSelected] = useState3(null);
    const [draft, setDraft] = useState3({});
    const [mode, setMode] = useState3("closed");
    const [busy, setBusy] = useState3(false);
    const [notice, setNotice] = useState3("");
    const [sortMode, setSortMode] = useState3("server");
    const [density, setDensity] = useState3("comfortable");
    const [checkedIds, setCheckedIds] = useState3(() => /* @__PURE__ */ new Set());
    const [visibleColumnKeys, setVisibleColumnKeys] = useState3([]);
    const selectedRef = useRef2(null);
    const skipNextAutoLoadRef = useRef2(false);
    useEffect3(() => {
      selectedRef.current = selected;
    }, [selected]);
    const loadData = useCallback3(
      async (options2) => {
        if (!options2?.silent) setBusy(true);
        setNotice("");
        try {
          const nextObjectKey = options2?.objectKey ?? objectKey;
          const nextSearchQuery = options2?.searchQuery ?? searchQuery;
          const response = await requestData(buildQuery(context, nextObjectKey, nextSearchQuery, options2?.recordId));
          const result = normalizeData(unwrap(response));
          setData(result);
          const visibleIds = new Set(result.table.items.map((record) => record.id));
          setCheckedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
          const currentSelected = selectedRef.current;
          const nextSelected = resolveNextSelection(result, {
            recordId: options2?.recordId,
            keepSelection: options2?.keepSelection,
            selected: currentSelected
          });
          if (nextSelected && options2?.recordId) {
            openRecord(nextSelected, result.fields, "view");
          } else if (!options2?.keepSelection && !options2?.recordId) {
            setSelected(null);
            setDraft({});
            setMode("closed");
          } else if (nextSelected && currentSelected) {
            setSelected(nextSelected);
            setDraft(toFormValues(result.fields, nextSelected.values ?? {}));
          }
        } catch (error) {
          setNotice(error instanceof Error && error.message ? error.message : t.loadFailed);
        } finally {
          setBusy(false);
        }
      },
      [context, objectKey, searchQuery, t.loadFailed]
    );
    useEffect3(() => {
      window.__crmReload = () => loadData({ keepSelection: true, silent: true });
      return () => {
        delete window.__crmReload;
      };
    }, [loadData]);
    useEffect3(() => {
      if (skipNextAutoLoadRef.current) {
        skipNextAutoLoadRef.current = false;
        return;
      }
      loadData();
    }, [loadData]);
    const objects = data?.objects ?? [];
    const currentObject = objects.find((object) => object.objectKey === objectKey) ?? data?.selectedObject ?? objects[0] ?? null;
    const fields = data?.fields ?? currentObject?.fields ?? [];
    const table = data?.table ?? { key: "records", items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
    const defaultColumnKeys = useMemo3(() => getDefaultColumnKeys(data, fields), [data, fields]);
    const columns = useMemo3(
      () => getColumnsFromKeys(fields, visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys),
      [defaultColumnKeys, fields, visibleColumnKeys]
    );
    const sortedItems = useMemo3(() => sortRecords(table.items, columns[0], sortMode), [table.items, columns, sortMode]);
    const relationLabels = useMemo3(() => getRelationLabels(data), [data]);
    const relatedSections = useMemo3(() => getRelatedRecordSections(data), [data]);
    const timelineItems = useMemo3(() => getTimelineItems(data), [data]);
    const firstMeasureColumn = columns.find((field) => field.type !== "relation") ?? columns[0];
    const objectTitle = currentObject?.pluralLabel || currentObject?.label || objectKey;
    const objectLabel = currentObject?.label || objectKey;
    const activeView = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0] ?? null;
    useEffect3(() => {
      setVisibleColumnKeys(defaultColumnKeys);
    }, [defaultColumnKeys, objectKey]);
    function selectObject(nextObjectKey) {
      setObjectKey(nextObjectKey);
      setSelected(null);
      setDraft({});
      setMode("closed");
      setSearchDraft("");
      setSearchQuery("");
      setSortMode("server");
      setCheckedIds(/* @__PURE__ */ new Set());
      setVisibleColumnKeys([]);
    }
    function openRecord(record, nextFields = fields, nextMode = "view") {
      setSelected(record);
      setDraft(toFormValues(nextFields, record?.values ?? {}));
      setMode(record ? nextMode : "closed");
      setNotice("");
    }
    async function openRelatedRecord(nextObjectKey, recordId) {
      if (!nextObjectKey || !recordId) return;
      if (nextObjectKey !== objectKey || searchQuery) {
        skipNextAutoLoadRef.current = true;
      }
      setObjectKey(nextObjectKey);
      setSearchDraft("");
      setSearchQuery("");
      setSortMode("server");
      setCheckedIds(/* @__PURE__ */ new Set());
      setVisibleColumnKeys([]);
      await loadData({
        objectKey: nextObjectKey,
        searchQuery: "",
        recordId,
        keepSelection: true
      });
    }
    function startCreate() {
      setSelected(null);
      setDraft(toFormValues(fields, {}, true));
      setMode("create");
      setNotice("");
    }
    function updateDraft(fieldKey, value) {
      setDraft((current) => ({ ...current, [fieldKey]: value }));
    }
    async function saveDraft() {
      const values = normalizeFormValues(fields, draft);
      setBusy(true);
      setNotice("");
      try {
        const actionKey = selected?.id ? "update_record" : "create_record";
        const response = await executeAction(
          actionKey,
          selected?.id ?? null,
          selected?.id ? { recordId: selected.id, objectKey, values } : { objectKey, values },
          { objectKey }
        );
        const result = unwrap(response);
        if (result.success === false) throw new Error(resolveText(result.message, locale) || t.saveFailed);
        const savedRecord = result.data && isObject(result.data) ? result.data : result;
        const message = resolveText(result.message, locale) || t.saved;
        notify(message);
        setNotice(message);
        await loadData({ recordId: typeof savedRecord.id === "string" ? savedRecord.id : void 0, keepSelection: true, silent: true });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : t.saveFailed;
        setNotice(message);
        notify(message, "error");
      } finally {
        setBusy(false);
      }
    }
    function applySearch() {
      setSearchQuery(searchDraft.trim());
      setCheckedIds(/* @__PURE__ */ new Set());
    }
    function toggleDensity() {
      setDensity((current) => current === "compact" ? "comfortable" : "compact");
    }
    function toggleRecordChecked(recordId, checked) {
      setCheckedIds((current) => {
        const next = new Set(current);
        if (checked) {
          next.add(recordId);
        } else {
          next.delete(recordId);
        }
        return next;
      });
    }
    function toggleAllVisible(checked) {
      setCheckedIds((current) => {
        const next = new Set(current);
        sortedItems.forEach((record) => {
          if (checked) {
            next.add(record.id);
          } else {
            next.delete(record.id);
          }
        });
        return next;
      });
    }
    async function updateVisibleColumns(fieldKey, checked) {
      const currentKeys = visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys;
      const nextKeys = checked ? [...currentKeys, fieldKey] : currentKeys.filter((key) => key !== fieldKey);
      const uniqueKeys = [...new Set(nextKeys)].filter((key) => fields.some((field) => field.fieldKey === key));
      if (!uniqueKeys.length) {
        setNotice(t.atLeastOneColumn);
        notify(t.atLeastOneColumn, "error");
        return;
      }
      setVisibleColumnKeys(uniqueKeys);
      setNotice("");
      try {
        const response = await executeAction(
          "update_view_columns",
          activeView?.viewKey ?? null,
          {
            objectKey,
            viewKey: activeView?.viewKey || "all",
            columns: uniqueKeys
          },
          { objectKey }
        );
        const result = unwrap(response);
        if (result.success === false) throw new Error(resolveText(result.message, locale) || t.saveFailed);
        const message = resolveText(result.message, locale) || t.viewSaved;
        setNotice(message);
        notify(message);
        await loadData({ keepSelection: true, silent: true });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : t.saveFailed;
        setNotice(message);
        notify(message, "error");
        setVisibleColumnKeys(currentKeys);
      }
    }
    const selectedCount = checkedIds.size;
    const sortTarget = columns[0]?.label || columns[0]?.fieldKey || objectLabel;
    const sortLabel = sortMode === "asc" ? t.ascending : sortMode === "desc" ? t.descending : t.noSorting;
    return /* @__PURE__ */ React2.createElement("main", { className: `crm20-shell crm20-${density}` }, /* @__PURE__ */ React2.createElement("aside", { className: "crm20-sidebar", "aria-label": t.objects }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-workspace" }, /* @__PURE__ */ React2.createElement("span", { className: "crm20-workspace-mark" }, "X"), /* @__PURE__ */ React2.createElement("span", { className: "crm20-workspace-name" }, t.workspace), /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })), /* @__PURE__ */ React2.createElement("div", { className: "crm20-sidebar-switcher", "aria-label": t.viewMode }, /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "icon", className: "crm20-switcher-active", title: "Home" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "home" })), /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "icon", title: t.searchPlaceholder, onClick: () => searchRef.current?.focus() }, /* @__PURE__ */ React2.createElement(Icon2, { name: "message" }))), /* @__PURE__ */ React2.createElement(Button, { variant: "outline", className: "crm20-chat-button" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "message-plus" }), /* @__PURE__ */ React2.createElement("span", null, t.newChat)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-nav-section" }, t.nativeCrm), /* @__PURE__ */ React2.createElement("nav", { className: "crm20-object-nav" }, objects.map((object) => /* @__PURE__ */ React2.createElement(
      Button,
      {
        variant: "ghost",
        key: object.objectKey,
        className: object.objectKey === objectKey ? "is-active" : "",
        onClick: () => selectObject(object.objectKey)
      },
      /* @__PURE__ */ React2.createElement("span", { className: `crm20-object-icon crm20-object-${object.objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: objectIcon(object) })),
      /* @__PURE__ */ React2.createElement("span", null, object.pluralLabel || object.label || object.objectKey)
    )))), /* @__PURE__ */ React2.createElement("section", { className: "crm20-main" }, /* @__PURE__ */ React2.createElement("header", { className: "crm20-object-header" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-object-title" }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-title-icon crm20-object-${objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: currentObject ? objectIcon(currentObject) : "grid" })), /* @__PURE__ */ React2.createElement("strong", null, objectTitle)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-header-actions" }, /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "icon", title: t.refresh, onClick: () => loadData({ keepSelection: true }), disabled: busy }, /* @__PURE__ */ React2.createElement(Icon2, { name: "refresh" })), /* @__PURE__ */ React2.createElement(Button, { onClick: startCreate, disabled: busy }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }), /* @__PURE__ */ React2.createElement("span", null, locale === "zh_Hans" ? `${t.create} ${objectLabel}` : `New ${objectLabel}`)), /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "icon", title: t.options, onClick: toggleDensity }, /* @__PURE__ */ React2.createElement(Icon2, { name: "more" })))), /* @__PURE__ */ React2.createElement("div", { className: "crm20-viewbar" }, /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", className: "crm20-view-name" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "list" }), /* @__PURE__ */ React2.createElement("span", null, data?.views?.[0]?.name || `${t.allRecords} ${objectTitle}`), /* @__PURE__ */ React2.createElement("span", { className: "crm20-view-count" }, table.total || 0), /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })), /* @__PURE__ */ React2.createElement("div", { className: "crm20-view-actions" }, /* @__PURE__ */ React2.createElement("label", { className: "crm20-search" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "search" }), /* @__PURE__ */ React2.createElement(
      Input,
      {
        ref: searchRef,
        value: searchDraft,
        placeholder: t.searchPlaceholder,
        onChange: (event) => setSearchDraft(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") applySearch();
        }
      }
    )), /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", className: "crm20-toolbar-button", onClick: () => searchRef.current?.focus() }, t.filter, searchQuery ? /* @__PURE__ */ React2.createElement(Badge, { variant: "secondary" }, t.searchActive) : null), /* @__PURE__ */ React2.createElement(DropdownMenu2, null, /* @__PURE__ */ React2.createElement(DropdownMenuTrigger2, { asChild: true }, /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", className: sortMode === "server" ? "crm20-toolbar-button" : "crm20-toolbar-button is-active" }, t.sort, /* @__PURE__ */ React2.createElement("span", { className: "crm20-toolbar-meta" }, sortLabel))), /* @__PURE__ */ React2.createElement(DropdownMenuContent2, { align: "end", className: "crm20-dropdown" }, /* @__PURE__ */ React2.createElement(DropdownMenuLabel2, null, t.sortBy, " ", sortTarget), /* @__PURE__ */ React2.createElement(DropdownMenuRadioGroup2, { value: sortMode, onValueChange: (value) => setSortMode(value) }, /* @__PURE__ */ React2.createElement(DropdownMenuRadioItem2, { value: "server" }, t.noSorting), /* @__PURE__ */ React2.createElement(DropdownMenuRadioItem2, { value: "asc" }, t.ascending), /* @__PURE__ */ React2.createElement(DropdownMenuRadioItem2, { value: "desc" }, t.descending)))), /* @__PURE__ */ React2.createElement(DropdownMenu2, null, /* @__PURE__ */ React2.createElement(DropdownMenuTrigger2, { asChild: true }, /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", className: density === "compact" ? "crm20-toolbar-button is-active" : "crm20-toolbar-button" }, t.options)), /* @__PURE__ */ React2.createElement(DropdownMenuContent2, { align: "end", className: "crm20-dropdown" }, /* @__PURE__ */ React2.createElement(DropdownMenuLabel2, null, t.tableDensity), /* @__PURE__ */ React2.createElement(DropdownMenuItem2, { onSelect: () => setDensity("comfortable") }, t.comfortableDensity), /* @__PURE__ */ React2.createElement(DropdownMenuItem2, { onSelect: () => setDensity("compact") }, t.compactDensity), /* @__PURE__ */ React2.createElement(DropdownMenuSeparator2, null), /* @__PURE__ */ React2.createElement(DropdownMenuLabel2, null, t.visibleFields), fields.map((field) => /* @__PURE__ */ React2.createElement(
      DropdownMenuCheckboxItem2,
      {
        key: field.fieldKey,
        checked: (visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys).includes(field.fieldKey),
        onSelect: (event) => event.preventDefault(),
        onCheckedChange: (checked) => updateVisibleColumns(field.fieldKey, checked === true)
      },
      field.label || field.fieldKey
    )), /* @__PURE__ */ React2.createElement(DropdownMenuSeparator2, null), /* @__PURE__ */ React2.createElement(DropdownMenuItem2, { onSelect: () => loadData({ keepSelection: true }) }, t.refresh))))), notice ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-notice" }, notice) : null, /* @__PURE__ */ React2.createElement("section", { className: "crm20-content" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-table-panel" }, /* @__PURE__ */ React2.createElement("div", { className: selectedCount ? "crm20-selection-slot is-visible" : "crm20-selection-slot" }, selectedCount ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-selection-bar" }, /* @__PURE__ */ React2.createElement(Badge, { variant: "secondary" }, selectedCount), /* @__PURE__ */ React2.createElement("strong", null, selectedCount, " ", t.selectedCount), /* @__PURE__ */ React2.createElement("span", null, t.visibleRows, " ", sortedItems.length), /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", size: "sm", onClick: () => setCheckedIds(/* @__PURE__ */ new Set()) }, t.clearSelection)) : null), /* @__PURE__ */ React2.createElement(
      RecordGrid,
      {
        columns,
        fields,
        records: sortedItems,
        selectedId: selected?.id,
        checkedIds,
        objectKey,
        locale,
        relationLabels,
        t,
        busy,
        onSelect: (record) => openRecord(record),
        onToggleRecord: toggleRecordChecked,
        onToggleAll: toggleAllVisible,
        onCreate: startCreate
      }
    ), /* @__PURE__ */ React2.createElement("footer", { className: "crm20-table-footer" }, /* @__PURE__ */ React2.createElement(Button, { variant: "ghost", className: "crm20-add-row", onClick: startCreate }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }), /* @__PURE__ */ React2.createElement("span", null, t.addNew)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-calculation" }, /* @__PURE__ */ React2.createElement("span", null, t.calculate), /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" }), /* @__PURE__ */ React2.createElement("strong", null, t.countAll, " ", table.total || sortedItems.length), firstMeasureColumn ? /* @__PURE__ */ React2.createElement("strong", null, t.notEmpty, " ", firstMeasureColumn.label || firstMeasureColumn.fieldKey, " ", countNonEmpty(sortedItems, firstMeasureColumn.fieldKey)) : null))), /* @__PURE__ */ React2.createElement(
      Inspector,
      {
        mode,
        record: selected,
        fields,
        draft,
        locale,
        t,
        objectLabel,
        objectKey,
        relationLabels,
        relatedSections,
        timelineItems,
        busy,
        onChange: updateDraft,
        onEdit: () => setMode("edit"),
        onClose: () => setMode("closed"),
        onCancel: () => {
          if (selected) {
            openRecord(selected, fields, "view");
          } else {
            setMode("closed");
          }
        },
        onOpenRelatedRecord: openRelatedRecord,
        onSave: saveDraft
      }
    ))));
  }

  // src/lib/remote-components/crm-workbench/src/styles.ts
  function injectStyles2() {
    if (document.getElementById("crm-workbench-styles")) return;
    const style = document.createElement("style");
    style.id = "crm-workbench-styles";
    style.textContent = `
    :root {
      color-scheme: light;
      --crm20-sidebar: #f4f5f7;
      --crm20-panel: #ffffff;
      --crm20-text: #1f2937;
      --crm20-muted: #6b7280;
      --crm20-soft: #9ca3af;
      --crm20-border: #e5e7eb;
      --crm20-border-soft: #f0f1f3;
      --crm20-hover: #f7f7f8;
      --crm20-active: #f1f5ff;
	      --crm20-primary: var(--xps-primary, var(--xui-color-primary, #2563eb));
	      --xui-radius-md: 0.375rem;
      --xui-control-height: 1.875rem;
      --xui-control-height-sm: 1.75rem;
      --xui-control-height-lg: 2.125rem;
      --xui-control-font-size: 0.8125rem;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--crm20-panel); color: var(--crm20-text); }
    body, button, input, select, textarea { font-family: Inter, "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
    .crm20-icon { width: 16px; height: 16px; display: inline-block; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .crm20-shell { min-height: 640px; display: grid; grid-template-columns: 260px minmax(0, 1fr); overflow: hidden; background: var(--crm20-panel); }
    .crm20-shell-loading { display: flex; align-items: center; justify-content: center; background: #f8fafc; }
    .crm20-sidebar { min-height: 640px; border-right: 1px solid var(--crm20-border); background: var(--crm20-sidebar); padding: 10px; display: flex; flex-direction: column; gap: 10px; }
    .crm20-workspace { height: 38px; display: grid; grid-template-columns: 26px minmax(0, 1fr) 18px; align-items: center; gap: 8px; padding: 0 4px; color: #374151; font-weight: 650; }
    .crm20-workspace-mark { width: 22px; height: 22px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; background: #9de0e4; color: #1f4b53; font-size: 12px; font-weight: 800; }
    .crm20-workspace-name, .crm20-object-title strong, .crm20-view-name span:first-of-type, .crm20-object-nav button span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-sidebar-switcher { width: 84px; height: 36px; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 3px; padding: 3px; border: 1px solid var(--crm20-border); background: var(--crm20-panel); border-radius: 18px; }
    .crm20-sidebar-switcher .xps-button { height: 28px; min-width: 0; border-radius: 14px; color: var(--crm20-muted); }
    .crm20-sidebar-switcher .crm20-switcher-active, .crm20-sidebar-switcher .xps-button:hover { background: #f3f4f6; color: #111827; }
    .crm20-chat-button { align-self: flex-end; border-radius: 18px; color: #4b5563; }
    .crm20-nav-section { color: var(--crm20-soft); font-size: 12px; font-weight: 700; padding: 8px 2px 0; }
    .crm20-object-nav { display: grid; gap: 2px; }
    .crm20-object-nav .xps-button { height: 36px; justify-content: flex-start; border: 0; color: #5f6368; font-weight: 600; padding: 0 8px; }
    .crm20-object-nav .xps-button:hover, .crm20-object-nav .xps-button.is-active { background: #e9eaec; color: #2f3337; }
    .crm20-object-icon, .crm20-title-icon, .crm20-record-mark, .crm20-empty-icon { display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; background: #e5e7eb; color: #4b5563; }
    .crm20-object-icon { width: 20px; height: 20px; }
    .crm20-title-icon { width: 24px; height: 24px; }
    .crm20-record-mark { width: 20px; height: 20px; color: #fff; font-size: 9px; font-weight: 800; }
    .crm20-object-company { background: #e6edff; color: #4169e1; }
    .crm20-object-person { background: #eef2ff; color: #5b5fc7; }
    .crm20-object-opportunity { background: #ffe8e6; color: #e5484d; }
    .crm20-object-task { background: #dcf7ef; color: #0f9f6e; }
    .crm20-object-note { background: #e8f7f4; color: #0f766e; }
    .crm20-record-mark.crm20-object-company { background: #4169e1; color: #fff; }
    .crm20-record-mark.crm20-object-person { background: #5b5fc7; color: #fff; }
    .crm20-record-mark.crm20-object-opportunity { background: #e5484d; color: #fff; }
    .crm20-record-mark.crm20-object-task { background: #0f9f6e; color: #fff; }
    .crm20-record-mark.crm20-object-note { background: #0f766e; color: #fff; }
	    .crm20-main { min-width: 0; min-height: 640px; display: grid; grid-template-rows: 50px 48px auto 1fr; background: var(--crm20-panel); }
	    .crm20-object-header { height: 50px; border-bottom: 1px solid var(--crm20-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px 0 14px; }
	    .crm20-object-title { min-width: 0; display: flex; align-items: center; gap: 9px; font-size: 16px; color: #374151; }
	    .crm20-header-actions, .crm20-view-actions, .crm20-inspector-actions { display: flex; align-items: center; gap: 8px; }
	    .crm20-viewbar { min-width: 0; height: 48px; border-bottom: 1px solid var(--crm20-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px 0 18px; }
	    .crm20-view-name { min-width: 0; border: 0; background: transparent; color: var(--crm20-muted); display: inline-flex; align-items: center; gap: 7px; padding: 0; font-weight: 700; }
	    .crm20-view-name span:first-of-type { max-width: 280px; }
	    .crm20-view-count { color: #a1a1aa; font-weight: 600; }
	    .crm20-search { height: 32px; min-width: 240px; display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 6px; border: 1px solid var(--crm20-border); background: #fbfbfc; border-radius: 5px; padding: 0 8px; color: var(--crm20-soft); }
	    .crm20-search:focus-within { border-color: #a9bdf7; box-shadow: 0 0 0 3px rgba(65, 105, 225, 0.12); }
	    .crm20-search .xps-input { height: 28px; border: 0; padding: 0; background: transparent; box-shadow: none; }
	    .crm20-toolbar-button { color: #5f6368; gap: 6px; }
	    .crm20-toolbar-button.is-active { color: #1f2937; background: #eff3ff; border-color: #ccd8ff; }
	    .crm20-toolbar-meta { color: var(--crm20-soft); font-weight: 600; }
	    .crm20-dropdown.xps-dropdown-menu-content { min-width: 178px; z-index: 30; }
	    .crm20-toolbar-button .xps-badge { height: 18px; padding: 0 6px; font-size: 10px; }
	    .crm20-notice { margin: 8px 12px 0; border: 1px solid #f2c94c; background: #fffbeb; color: #7a4d00; padding: 8px 10px; border-radius: 5px; font-size: 13px; }
	    .crm20-content { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch; position: relative; overflow: hidden; }
	    .crm20-table-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) 78px; }
	    .crm20-selection-slot { min-height: 0; overflow: hidden; border-bottom: 0 solid transparent; transition: min-height 140ms ease, border-color 140ms ease; }
	    .crm20-selection-slot.is-visible { min-height: 38px; border-bottom-color: var(--crm20-border-soft); }
	    .crm20-selection-bar { height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: #f8fbff; color: #64748b; }
	    .crm20-selection-bar strong { color: #334155; font-weight: 700; }
	    .crm20-selection-bar .xps-badge { height: 20px; min-width: 24px; justify-content: center; }
	    .crm20-selection-bar .xps-button { margin-left: auto; color: #4169e1; }
	    .crm20-grid-scroll { min-width: 0; min-height: 0; overflow: auto; position: relative; background: var(--crm20-panel); }
	    .crm20-grid { width: 100%; min-width: 1040px; table-layout: fixed; }
	    .crm20-grid .xps-table-head, .crm20-grid .xps-table-cell { height: 39px; border-right: 1px solid var(--crm20-border-soft); border-bottom: 1px solid #eeeeef; text-align: left; vertical-align: middle; padding: 0 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #4b5563; }
	    .crm20-compact .crm20-grid .xps-table-head, .crm20-compact .crm20-grid .xps-table-cell { height: 34px; padding: 0 10px; }
	    .crm20-grid .xps-table-head { position: sticky; top: 0; z-index: 2; background: #fbfbfc; color: var(--crm20-soft); font-weight: 650; }
	    .crm20-grid .xps-table-row:hover .xps-table-cell { background: #fafafa; }
	    .crm20-grid .xps-table-row.is-selected .xps-table-cell { background: var(--crm20-active); }
	    .crm20-grid .xps-table-row.is-checked .xps-table-cell { background: #f8fbff; }
	    .crm20-grid .xps-table-row.is-selected.is-checked .xps-table-cell { background: #ecf3ff; }
    .crm20-check-col { width: 44px; }
    .crm20-extra-col { width: 52px; }
    .crm20-check-cell, .crm20-extra-cell { width: 44px; text-align: center !important; padding: 0 !important; color: var(--crm20-soft); }
    .crm20-grid .xps-checkbox { vertical-align: middle; }
    .crm20-th-content, .crm20-name-cell, .crm20-multi-value { min-width: 0; display: inline-flex; align-items: center; gap: 7px; max-width: 100%; }
    .crm20-th-content span, .crm20-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-name-text { color: #374151; font-weight: 650; }
    .crm20-muted-value { color: #a1a1aa; font-weight: 500; }
    .crm20-link-value { color: #3158c9; }
    .crm20-relation-value { color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
    .crm20-link-pill, .crm20-pill, .crm20-chip { max-width: 100%; min-height: 23px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--crm20-border); border-radius: 12px; background: #fff; color: #4b5563; padding: 0 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-chip span { width: 7px; height: 7px; border-radius: 50%; background: var(--chip-color); flex: 0 0 auto; }
    .crm20-pill { background: #f3f4f6; border-color: var(--crm20-border); min-height: 22px; padding: 0 7px; }
    .crm20-loading-line { position: absolute; top: 0; left: 0; height: 2px; width: 35%; background: var(--crm20-primary); animation: crm20-loading 1s ease-in-out infinite; }
    .crm20-table-footer { min-height: 78px; border-top: 1px solid var(--crm20-border); display: grid; grid-template-rows: 38px 40px; color: var(--crm20-soft); background: #fff; }
    .crm20-add-row { height: 38px; border: 0; border-bottom: 1px solid var(--crm20-border-soft); background: #fff; color: var(--crm20-soft); justify-content: flex-start; padding: 0 18px; }
    .crm20-add-row:hover { color: #4b5563; background: #fafafa; }
    .crm20-calculation { display: flex; align-items: center; gap: 16px; padding: 0 18px; min-width: 0; overflow: hidden; }
    .crm20-calculation strong { color: #71717a; font-weight: 650; white-space: nowrap; }
    .crm20-empty-table, .crm20-empty { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--crm20-muted); padding: 28px; text-align: center; }
    .crm20-empty-icon { width: 42px; height: 42px; }
	    .crm20-inspector-content.xps-sheet-content { width: min(400px, calc(100vw - 24px)); max-width: calc(100vw - 24px); padding: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; }
	    .crm20-inspector-header { min-height: 76px; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: flex-start; gap: 12px; padding: 14px; }
	    .crm20-inspector-avatar { width: 36px; height: 36px; border-radius: 8px; color: #fff; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
	    .crm20-inspector-avatar span { display: inline; color: inherit; font-size: 12px; margin: 0; }
	    .crm20-inspector-header div { min-width: 0; }
	    .crm20-inspector-header span { display: block; color: var(--crm20-soft); font-size: 12px; margin-bottom: 4px; }
	    .crm20-inspector-header strong { display: block; color: #1f2937; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
    .crm20-inspector-meta { min-height: 42px; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 14px; color: var(--crm20-muted); font-size: 12px; }
    .crm20-inspector-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-inspector-tabs { min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .crm20-inspector-tabs .xps-tabs-list { margin: 10px 14px 0; width: calc(100% - 28px); }
    .crm20-inspector-tabs .xps-tabs-trigger { flex: 1 1 0; }
    .crm20-inspector-tabs .xps-tabs-content { min-height: 0; overflow: hidden; margin: 0; }
    .crm20-read-fields, .crm20-form { min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 10px; }
    .crm20-read-field { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--crm20-border-soft); }
	    .crm20-read-field span, .crm20-field > span { color: var(--crm20-muted); font-size: 12px; font-weight: 650; }
	    .crm20-read-field strong { min-width: 0; color: #1f2937; font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
	    .crm20-related-panel { display: grid; gap: 10px; padding-top: 2px; }
	    .crm20-related-heading { min-height: 24px; display: flex; align-items: center; justify-content: space-between; color: #1f2937; }
	    .crm20-related-heading strong { font-size: 13px; font-weight: 750; }
	    .crm20-related-section { display: grid; gap: 8px; }
	    .crm20-related-section .xps-separator { background: var(--crm20-border-soft); }
	    .crm20-related-section-header { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
	    .crm20-related-section-header > div { min-width: 0; display: grid; gap: 2px; }
	    .crm20-related-section-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; font-size: 12px; font-weight: 750; }
	    .crm20-related-section-header small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-soft); font-size: 11px; font-weight: 600; }
	    .crm20-related-list { display: grid; gap: 4px; }
	    .crm20-related-record.xps-button { width: 100%; height: auto; min-height: 44px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 8px; justify-content: stretch; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; color: #374151; }
	    .crm20-related-record.xps-button:hover { border-color: var(--crm20-border); background: var(--crm20-hover); }
	    .crm20-related-record > span:not(.crm20-record-mark) { min-width: 0; display: grid; gap: 2px; text-align: left; }
	    .crm20-related-record strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
	    .crm20-related-record small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-muted); font-size: 11px; font-weight: 600; }
	    .crm20-related-record .crm20-icon { color: var(--crm20-soft); }
	    .crm20-related-more { min-height: 24px; display: inline-flex; align-items: center; color: var(--crm20-muted); font-size: 12px; font-weight: 600; padding: 0 8px; }
	    .crm20-timeline-panel { min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 0; }
	    .crm20-timeline-item { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; padding: 8px 0; }
	    .crm20-timeline-item .xps-separator { grid-column: 1 / -1; margin-bottom: 8px; background: var(--crm20-border-soft); }
	    .crm20-timeline-dot { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #64748b; }
	    .crm20-timeline-note { background: #e8f7f4; color: #0f766e; }
	    .crm20-timeline-task { background: #dcf7ef; color: #0f9f6e; }
	    .crm20-timeline-activity { background: #eef2ff; color: #5b5fc7; }
	    .crm20-timeline-content { min-width: 0; display: grid; gap: 6px; }
	    .crm20-timeline-meta { min-width: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--crm20-soft); font-size: 11px; font-weight: 600; }
	    .crm20-timeline-record.xps-button { width: 100%; height: auto; min-height: 42px; justify-content: stretch; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 8px; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; color: #374151; }
	    .crm20-timeline-record.xps-button:hover { border-color: var(--crm20-border); background: var(--crm20-hover); }
	    .crm20-timeline-record span, .crm20-timeline-activity-body { min-width: 0; display: grid; gap: 2px; text-align: left; }
	    .crm20-timeline-record strong, .crm20-timeline-activity-body strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1f2937; font-size: 12px; font-weight: 720; }
	    .crm20-timeline-record small, .crm20-timeline-activity-body small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-muted); font-size: 11px; font-weight: 600; }
	    .crm20-timeline-record .crm20-icon { color: var(--crm20-soft); }
	    .crm20-timeline-empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--crm20-muted); padding: 20px; }
	    .crm20-timeline-empty strong { font-size: 13px; font-weight: 700; }
	    .crm20-field { display: grid; gap: 5px; }
	    .crm20-field em { margin-left: 6px; color: #dc2626; font-style: normal; font-weight: 600; }
	    .crm20-field small { margin-left: 8px; color: var(--crm20-soft); font-size: 11px; font-weight: 600; text-transform: uppercase; }
	    .crm20-field .xps-textarea { min-height: 88px; resize: vertical; }
	    .crm20-checkbox-field { justify-content: flex-start; }
	    .crm20-relation-picker { display: grid; gap: 6px; position: relative; }
	    .crm20-relation-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
	    .crm20-relation-trigger.xps-button { width: 100%; justify-content: flex-start; min-width: 0; }
	    .crm20-relation-title { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
	    .crm20-relation-command { border: 1px solid var(--crm20-border); border-radius: var(--xps-radius, 6px); background: var(--xps-popover, #fff); box-shadow: 0 14px 34px color-mix(in srgb, var(--crm20-text) 12%, transparent); overflow: hidden; }
	    .crm20-relation-option-text { min-width: 0; display: grid; gap: 2px; }
	    .crm20-relation-option-text strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-text); font-size: 13px; }
	    .crm20-relation-option-text small { color: var(--crm20-soft); font-size: 11px; font-weight: 600; text-transform: none; }
	    .crm20-inspector-actions { min-height: 58px; border-top: 1px solid var(--crm20-border); justify-content: flex-end; padding: 12px 14px; background: #fff; }
    @keyframes crm20-loading { 0% { transform: translateX(-100%); } 50% { transform: translateX(160%); } 100% { transform: translateX(360%); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }
    @media (max-width: 960px) {
      .crm20-shell { grid-template-columns: 1fr; }
      .crm20-sidebar { min-height: auto; border-right: 0; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: minmax(160px, 1fr) auto; align-items: center; }
      .crm20-sidebar-switcher, .crm20-chat-button, .crm20-nav-section { display: none; }
      .crm20-object-nav { grid-column: 1 / -1; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
      .crm20-main { min-height: 620px; }
      .crm20-viewbar { height: auto; min-height: 48px; align-items: stretch; flex-direction: column; padding: 8px 12px; }
      .crm20-view-actions { flex-wrap: wrap; }
      .crm20-search { min-width: min(100%, 320px); flex: 1 1 220px; }
      .crm20-table-panel { grid-template-rows: minmax(0, 1fr) auto; }
      .crm20-calculation { flex-wrap: wrap; gap: 8px 14px; padding: 10px 18px; }
      .crm20-table-footer { grid-template-rows: 38px auto; }
    }
    @media (max-width: 560px) {
      .crm20-object-header { height: auto; min-height: 50px; align-items: stretch; flex-direction: column; padding: 10px; }
      .crm20-header-actions { justify-content: flex-end; }
      .crm20-grid { min-width: 760px; }
    }
  `;
    document.head.appendChild(style);
  }

  // src/lib/remote-components/crm-workbench/src/main.tsx
  var { useEffect: useEffect4, useState: useState4 } = React2;
  installShadcnThemeVars({ styleId: "crm-workbench-shadcn-ui-vars" });
  injectStyles2();
  function App() {
    const [context, setContext] = useState4(null);
    useEffect4(() => {
      const disposeBridge = installBridgeListener({
        onInit: setContext,
        onHostEvent: () => window.__crmReload?.()
      });
      post("ready");
      return disposeBridge;
    }, []);
    useEffect4(() => {
      const root2 = document.getElementById("root");
      if (!root2 || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root2);
      return () => observer.disconnect();
    }, []);
    useEffect4(() => {
      setTimeout(reportResize, 0);
    });
    if (!context) {
      return /* @__PURE__ */ React2.createElement("main", { className: "crm20-shell crm20-shell-loading" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-empty" }, TEXT.zh_Hans.loading));
    }
    return /* @__PURE__ */ React2.createElement(CrmWorkbench, { context });
  }
  var rootElement = document.getElementById("root");
  var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null;
  if (root) {
    root.render(/* @__PURE__ */ React2.createElement(App, null));
  } else {
    ReactDOM.render?.(/* @__PURE__ */ React2.createElement(App, null), rootElement);
  }
})();
