;
"use strict";(()=>{var vp=Object.defineProperty;var wp=(e,t)=>{for(var a in t)vp(e,a,{get:t[a],enumerable:!0})};function Ml(e={}){let t=e.styleId??"xpert-plugin-shadcn-ui-vars";if(typeof document>"u"||document.getElementById(t))return;let a=document.createElement("style");a.id=t,a.textContent=`
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
  `,document.head.appendChild(a)}function Al(e){var t,a,o="";if(typeof e=="string"||typeof e=="number")o+=e;else if(typeof e=="object")if(Array.isArray(e)){var r=e.length;for(t=0;t<r;t++)e[t]&&(a=Al(e[t]))&&(o&&(o+=" "),o+=a)}else for(a in e)e[a]&&(o&&(o+=" "),o+=a);return o}function Ho(){for(var e,t,a=0,o="",r=arguments.length;a<r;a++)(e=arguments[a])&&(t=Al(e))&&(o&&(o+=" "),o+=t);return o}var Cp=e=>{let t=Lp(e),{conflictingClassGroups:a,conflictingClassGroupModifiers:o}=e;return{getClassGroupId:s=>{let l=s.split("-");return l[0]===""&&l.length!==1&&l.shift(),Ol(l,t)||bp(s)},getConflictingClassGroupIds:(s,l)=>{let i=a[s]||[];return l&&o[s]?[...i,...o[s]]:i}}},Ol=(e,t)=>{if(e.length===0)return t.classGroupId;let a=e[0],o=t.nextPart.get(a),r=o?Ol(e.slice(1),o):void 0;if(r)return r;if(t.validators.length===0)return;let n=e.join("-");return t.validators.find(({validator:s})=>s(n))?.classGroupId},Dl=/^\[(.+)\]$/,bp=e=>{if(Dl.test(e)){let t=Dl.exec(e)[1],a=t?.substring(0,t.indexOf(":"));if(a)return"arbitrary.."+a}},Lp=e=>{let{theme:t,prefix:a}=e,o={nextPart:new Map,validators:[]};return Sp(Object.entries(e.classGroups),a).forEach(([n,s])=>{xn(s,o,n,t)}),o},xn=(e,t,a,o)=>{e.forEach(r=>{if(typeof r=="string"){let n=r===""?t:El(t,r);n.classGroupId=a;return}if(typeof r=="function"){if(Ip(r)){xn(r(o),t,a,o);return}t.validators.push({validator:r,classGroupId:a});return}Object.entries(r).forEach(([n,s])=>{xn(s,El(t,n),a,o)})})},El=(e,t)=>{let a=e;return t.split("-").forEach(o=>{a.nextPart.has(o)||a.nextPart.set(o,{nextPart:new Map,validators:[]}),a=a.nextPart.get(o)}),a},Ip=e=>e.isThemeGetter,Sp=(e,t)=>t?e.map(([a,o])=>{let r=o.map(n=>typeof n=="string"?t+n:typeof n=="object"?Object.fromEntries(Object.entries(n).map(([s,l])=>[t+s,l])):n);return[a,r]}):e,yp=e=>{if(e<1)return{get:()=>{},set:()=>{}};let t=0,a=new Map,o=new Map,r=(n,s)=>{a.set(n,s),t++,t>e&&(t=0,o=a,a=new Map)};return{get(n){let s=a.get(n);if(s!==void 0)return s;if((s=o.get(n))!==void 0)return r(n,s),s},set(n,s){a.has(n)?a.set(n,s):r(n,s)}}};var Rp=e=>{let{separator:t,experimentalParseClassName:a}=e,o=t.length===1,r=t[0],n=t.length,s=l=>{let i=[],c=0,d=0,u;for(let v=0;v<l.length;v++){let w=l[v];if(c===0){if(w===r&&(o||l.slice(v,v+n)===t)){i.push(l.slice(d,v)),d=v+n;continue}if(w==="/"){u=v;continue}}w==="["?c++:w==="]"&&c--}let f=i.length===0?l:l.substring(d),m=f.startsWith("!"),g=m?f.substring(1):f,p=u&&u>d?u-d:void 0;return{modifiers:i,hasImportantModifier:m,baseClassName:g,maybePostfixModifierPosition:p}};return a?l=>a({className:l,parseClassName:s}):s},Pp=e=>{if(e.length<=1)return e;let t=[],a=[];return e.forEach(o=>{o[0]==="["?(t.push(...a.sort(),o),a=[]):a.push(o)}),t.push(...a.sort()),t},Tp=e=>({cache:yp(e.cacheSize),parseClassName:Rp(e),...Cp(e)}),kp=/\s+/,Mp=(e,t)=>{let{parseClassName:a,getClassGroupId:o,getConflictingClassGroupIds:r}=t,n=[],s=e.trim().split(kp),l="";for(let i=s.length-1;i>=0;i-=1){let c=s[i],{modifiers:d,hasImportantModifier:u,baseClassName:f,maybePostfixModifierPosition:m}=a(c),g=!!m,p=o(g?f.substring(0,m):f);if(!p){if(!g){l=c+(l.length>0?" "+l:l);continue}if(p=o(f),!p){l=c+(l.length>0?" "+l:l);continue}g=!1}let v=Pp(d).join(":"),w=u?v+"!":v,L=w+p;if(n.includes(L))continue;n.push(L);let I=r(p,g);for(let y=0;y<I.length;++y){let T=I[y];n.push(w+T)}l=c+(l.length>0?" "+l:l)}return l};function Ap(){let e=0,t,a,o="";for(;e<arguments.length;)(t=arguments[e++])&&(a=Nl(t))&&(o&&(o+=" "),o+=a);return o}var Nl=e=>{if(typeof e=="string")return e;let t,a="";for(let o=0;o<e.length;o++)e[o]&&(t=Nl(e[o]))&&(a&&(a+=" "),a+=t);return a};function Dp(e,...t){let a,o,r,n=s;function s(i){let c=t.reduce((d,u)=>u(d),e());return a=Tp(c),o=a.cache.get,r=a.cache.set,n=l,l(i)}function l(i){let c=o(i);if(c)return c;let d=Mp(i,a);return r(i,d),d}return function(){return n(Ap.apply(null,arguments))}}var me=e=>{let t=a=>a[e]||[];return t.isThemeGetter=!0,t},Fl=/^\[(?:([a-z-]+):)?(.+)\]$/i,Ep=/^\d+\/\d+$/,Op=new Set(["px","full","screen"]),Np=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Fp=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Bp=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,_p=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,Hp=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,xt=e=>wa(e)||Op.has(e)||Ep.test(e),At=e=>Ca(e,"length",Kp),wa=e=>!!e&&!Number.isNaN(Number(e)),hn=e=>Ca(e,"number",wa),oo=e=>!!e&&Number.isInteger(Number(e)),Up=e=>e.endsWith("%")&&wa(e.slice(0,-1)),te=e=>Fl.test(e),Dt=e=>Np.test(e),qp=new Set(["length","size","percentage"]),Vp=e=>Ca(e,qp,Bl),zp=e=>Ca(e,"position",Bl),Wp=new Set(["image","url"]),Gp=e=>Ca(e,Wp,$p),jp=e=>Ca(e,"",Xp),ro=()=>!0,Ca=(e,t,a)=>{let o=Fl.exec(e);return o?o[1]?typeof t=="string"?o[1]===t:t.has(o[1]):a(o[2]):!1},Kp=e=>Fp.test(e)&&!Bp.test(e),Bl=()=>!1,Xp=e=>_p.test(e),$p=e=>Hp.test(e);var Yp=()=>{let e=me("colors"),t=me("spacing"),a=me("blur"),o=me("brightness"),r=me("borderColor"),n=me("borderRadius"),s=me("borderSpacing"),l=me("borderWidth"),i=me("contrast"),c=me("grayscale"),d=me("hueRotate"),u=me("invert"),f=me("gap"),m=me("gradientColorStops"),g=me("gradientColorStopPositions"),p=me("inset"),v=me("margin"),w=me("opacity"),L=me("padding"),I=me("saturate"),y=me("scale"),T=me("sepia"),E=me("skew"),k=me("space"),_=me("translate"),V=()=>["auto","contain","none"],W=()=>["auto","hidden","clip","visible","scroll"],K=()=>["auto",te,t],F=()=>[te,t],Z=()=>["",xt,At],$=()=>["auto",wa,te],ae=()=>["bottom","center","left","left-bottom","left-top","right","right-bottom","right-top","top"],X=()=>["solid","dashed","dotted","double","none"],Y=()=>["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"],q=()=>["start","end","center","between","around","evenly","stretch"],O=()=>["","0",te],ee=()=>["auto","avoid","all","avoid-page","page","left","right","column"],ne=()=>[wa,te];return{cacheSize:500,separator:":",theme:{colors:[ro],spacing:[xt,At],blur:["none","",Dt,te],brightness:ne(),borderColor:[e],borderRadius:["none","","full",Dt,te],borderSpacing:F(),borderWidth:Z(),contrast:ne(),grayscale:O(),hueRotate:ne(),invert:O(),gap:F(),gradientColorStops:[e],gradientColorStopPositions:[Up,At],inset:K(),margin:K(),opacity:ne(),padding:F(),saturate:ne(),scale:ne(),sepia:O(),skew:ne(),space:F(),translate:F()},classGroups:{aspect:[{aspect:["auto","square","video",te]}],container:["container"],columns:[{columns:[Dt]}],"break-after":[{"break-after":ee()}],"break-before":[{"break-before":ee()}],"break-inside":[{"break-inside":["auto","avoid","avoid-page","avoid-column"]}],"box-decoration":[{"box-decoration":["slice","clone"]}],box:[{box:["border","content"]}],display:["block","inline-block","inline","flex","inline-flex","table","inline-table","table-caption","table-cell","table-column","table-column-group","table-footer-group","table-header-group","table-row-group","table-row","flow-root","grid","inline-grid","contents","list-item","hidden"],float:[{float:["right","left","none","start","end"]}],clear:[{clear:["left","right","both","none","start","end"]}],isolation:["isolate","isolation-auto"],"object-fit":[{object:["contain","cover","fill","none","scale-down"]}],"object-position":[{object:[...ae(),te]}],overflow:[{overflow:W()}],"overflow-x":[{"overflow-x":W()}],"overflow-y":[{"overflow-y":W()}],overscroll:[{overscroll:V()}],"overscroll-x":[{"overscroll-x":V()}],"overscroll-y":[{"overscroll-y":V()}],position:["static","fixed","absolute","relative","sticky"],inset:[{inset:[p]}],"inset-x":[{"inset-x":[p]}],"inset-y":[{"inset-y":[p]}],start:[{start:[p]}],end:[{end:[p]}],top:[{top:[p]}],right:[{right:[p]}],bottom:[{bottom:[p]}],left:[{left:[p]}],visibility:["visible","invisible","collapse"],z:[{z:["auto",oo,te]}],basis:[{basis:K()}],"flex-direction":[{flex:["row","row-reverse","col","col-reverse"]}],"flex-wrap":[{flex:["wrap","wrap-reverse","nowrap"]}],flex:[{flex:["1","auto","initial","none",te]}],grow:[{grow:O()}],shrink:[{shrink:O()}],order:[{order:["first","last","none",oo,te]}],"grid-cols":[{"grid-cols":[ro]}],"col-start-end":[{col:["auto",{span:["full",oo,te]},te]}],"col-start":[{"col-start":$()}],"col-end":[{"col-end":$()}],"grid-rows":[{"grid-rows":[ro]}],"row-start-end":[{row:["auto",{span:[oo,te]},te]}],"row-start":[{"row-start":$()}],"row-end":[{"row-end":$()}],"grid-flow":[{"grid-flow":["row","col","dense","row-dense","col-dense"]}],"auto-cols":[{"auto-cols":["auto","min","max","fr",te]}],"auto-rows":[{"auto-rows":["auto","min","max","fr",te]}],gap:[{gap:[f]}],"gap-x":[{"gap-x":[f]}],"gap-y":[{"gap-y":[f]}],"justify-content":[{justify:["normal",...q()]}],"justify-items":[{"justify-items":["start","end","center","stretch"]}],"justify-self":[{"justify-self":["auto","start","end","center","stretch"]}],"align-content":[{content:["normal",...q(),"baseline"]}],"align-items":[{items:["start","end","center","baseline","stretch"]}],"align-self":[{self:["auto","start","end","center","stretch","baseline"]}],"place-content":[{"place-content":[...q(),"baseline"]}],"place-items":[{"place-items":["start","end","center","baseline","stretch"]}],"place-self":[{"place-self":["auto","start","end","center","stretch"]}],p:[{p:[L]}],px:[{px:[L]}],py:[{py:[L]}],ps:[{ps:[L]}],pe:[{pe:[L]}],pt:[{pt:[L]}],pr:[{pr:[L]}],pb:[{pb:[L]}],pl:[{pl:[L]}],m:[{m:[v]}],mx:[{mx:[v]}],my:[{my:[v]}],ms:[{ms:[v]}],me:[{me:[v]}],mt:[{mt:[v]}],mr:[{mr:[v]}],mb:[{mb:[v]}],ml:[{ml:[v]}],"space-x":[{"space-x":[k]}],"space-x-reverse":["space-x-reverse"],"space-y":[{"space-y":[k]}],"space-y-reverse":["space-y-reverse"],w:[{w:["auto","min","max","fit","svw","lvw","dvw",te,t]}],"min-w":[{"min-w":[te,t,"min","max","fit"]}],"max-w":[{"max-w":[te,t,"none","full","min","max","fit","prose",{screen:[Dt]},Dt]}],h:[{h:[te,t,"auto","min","max","fit","svh","lvh","dvh"]}],"min-h":[{"min-h":[te,t,"min","max","fit","svh","lvh","dvh"]}],"max-h":[{"max-h":[te,t,"min","max","fit","svh","lvh","dvh"]}],size:[{size:[te,t,"auto","min","max","fit"]}],"font-size":[{text:["base",Dt,At]}],"font-smoothing":["antialiased","subpixel-antialiased"],"font-style":["italic","not-italic"],"font-weight":[{font:["thin","extralight","light","normal","medium","semibold","bold","extrabold","black",hn]}],"font-family":[{font:[ro]}],"fvn-normal":["normal-nums"],"fvn-ordinal":["ordinal"],"fvn-slashed-zero":["slashed-zero"],"fvn-figure":["lining-nums","oldstyle-nums"],"fvn-spacing":["proportional-nums","tabular-nums"],"fvn-fraction":["diagonal-fractions","stacked-fractions"],tracking:[{tracking:["tighter","tight","normal","wide","wider","widest",te]}],"line-clamp":[{"line-clamp":["none",wa,hn]}],leading:[{leading:["none","tight","snug","normal","relaxed","loose",xt,te]}],"list-image":[{"list-image":["none",te]}],"list-style-type":[{list:["none","disc","decimal",te]}],"list-style-position":[{list:["inside","outside"]}],"placeholder-color":[{placeholder:[e]}],"placeholder-opacity":[{"placeholder-opacity":[w]}],"text-alignment":[{text:["left","center","right","justify","start","end"]}],"text-color":[{text:[e]}],"text-opacity":[{"text-opacity":[w]}],"text-decoration":["underline","overline","line-through","no-underline"],"text-decoration-style":[{decoration:[...X(),"wavy"]}],"text-decoration-thickness":[{decoration:["auto","from-font",xt,At]}],"underline-offset":[{"underline-offset":["auto",xt,te]}],"text-decoration-color":[{decoration:[e]}],"text-transform":["uppercase","lowercase","capitalize","normal-case"],"text-overflow":["truncate","text-ellipsis","text-clip"],"text-wrap":[{text:["wrap","nowrap","balance","pretty"]}],indent:[{indent:F()}],"vertical-align":[{align:["baseline","top","middle","bottom","text-top","text-bottom","sub","super",te]}],whitespace:[{whitespace:["normal","nowrap","pre","pre-line","pre-wrap","break-spaces"]}],break:[{break:["normal","words","all","keep"]}],hyphens:[{hyphens:["none","manual","auto"]}],content:[{content:["none",te]}],"bg-attachment":[{bg:["fixed","local","scroll"]}],"bg-clip":[{"bg-clip":["border","padding","content","text"]}],"bg-opacity":[{"bg-opacity":[w]}],"bg-origin":[{"bg-origin":["border","padding","content"]}],"bg-position":[{bg:[...ae(),zp]}],"bg-repeat":[{bg:["no-repeat",{repeat:["","x","y","round","space"]}]}],"bg-size":[{bg:["auto","cover","contain",Vp]}],"bg-image":[{bg:["none",{"gradient-to":["t","tr","r","br","b","bl","l","tl"]},Gp]}],"bg-color":[{bg:[e]}],"gradient-from-pos":[{from:[g]}],"gradient-via-pos":[{via:[g]}],"gradient-to-pos":[{to:[g]}],"gradient-from":[{from:[m]}],"gradient-via":[{via:[m]}],"gradient-to":[{to:[m]}],rounded:[{rounded:[n]}],"rounded-s":[{"rounded-s":[n]}],"rounded-e":[{"rounded-e":[n]}],"rounded-t":[{"rounded-t":[n]}],"rounded-r":[{"rounded-r":[n]}],"rounded-b":[{"rounded-b":[n]}],"rounded-l":[{"rounded-l":[n]}],"rounded-ss":[{"rounded-ss":[n]}],"rounded-se":[{"rounded-se":[n]}],"rounded-ee":[{"rounded-ee":[n]}],"rounded-es":[{"rounded-es":[n]}],"rounded-tl":[{"rounded-tl":[n]}],"rounded-tr":[{"rounded-tr":[n]}],"rounded-br":[{"rounded-br":[n]}],"rounded-bl":[{"rounded-bl":[n]}],"border-w":[{border:[l]}],"border-w-x":[{"border-x":[l]}],"border-w-y":[{"border-y":[l]}],"border-w-s":[{"border-s":[l]}],"border-w-e":[{"border-e":[l]}],"border-w-t":[{"border-t":[l]}],"border-w-r":[{"border-r":[l]}],"border-w-b":[{"border-b":[l]}],"border-w-l":[{"border-l":[l]}],"border-opacity":[{"border-opacity":[w]}],"border-style":[{border:[...X(),"hidden"]}],"divide-x":[{"divide-x":[l]}],"divide-x-reverse":["divide-x-reverse"],"divide-y":[{"divide-y":[l]}],"divide-y-reverse":["divide-y-reverse"],"divide-opacity":[{"divide-opacity":[w]}],"divide-style":[{divide:X()}],"border-color":[{border:[r]}],"border-color-x":[{"border-x":[r]}],"border-color-y":[{"border-y":[r]}],"border-color-s":[{"border-s":[r]}],"border-color-e":[{"border-e":[r]}],"border-color-t":[{"border-t":[r]}],"border-color-r":[{"border-r":[r]}],"border-color-b":[{"border-b":[r]}],"border-color-l":[{"border-l":[r]}],"divide-color":[{divide:[r]}],"outline-style":[{outline:["",...X()]}],"outline-offset":[{"outline-offset":[xt,te]}],"outline-w":[{outline:[xt,At]}],"outline-color":[{outline:[e]}],"ring-w":[{ring:Z()}],"ring-w-inset":["ring-inset"],"ring-color":[{ring:[e]}],"ring-opacity":[{"ring-opacity":[w]}],"ring-offset-w":[{"ring-offset":[xt,At]}],"ring-offset-color":[{"ring-offset":[e]}],shadow:[{shadow:["","inner","none",Dt,jp]}],"shadow-color":[{shadow:[ro]}],opacity:[{opacity:[w]}],"mix-blend":[{"mix-blend":[...Y(),"plus-lighter","plus-darker"]}],"bg-blend":[{"bg-blend":Y()}],filter:[{filter:["","none"]}],blur:[{blur:[a]}],brightness:[{brightness:[o]}],contrast:[{contrast:[i]}],"drop-shadow":[{"drop-shadow":["","none",Dt,te]}],grayscale:[{grayscale:[c]}],"hue-rotate":[{"hue-rotate":[d]}],invert:[{invert:[u]}],saturate:[{saturate:[I]}],sepia:[{sepia:[T]}],"backdrop-filter":[{"backdrop-filter":["","none"]}],"backdrop-blur":[{"backdrop-blur":[a]}],"backdrop-brightness":[{"backdrop-brightness":[o]}],"backdrop-contrast":[{"backdrop-contrast":[i]}],"backdrop-grayscale":[{"backdrop-grayscale":[c]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[d]}],"backdrop-invert":[{"backdrop-invert":[u]}],"backdrop-opacity":[{"backdrop-opacity":[w]}],"backdrop-saturate":[{"backdrop-saturate":[I]}],"backdrop-sepia":[{"backdrop-sepia":[T]}],"border-collapse":[{border:["collapse","separate"]}],"border-spacing":[{"border-spacing":[s]}],"border-spacing-x":[{"border-spacing-x":[s]}],"border-spacing-y":[{"border-spacing-y":[s]}],"table-layout":[{table:["auto","fixed"]}],caption:[{caption:["top","bottom"]}],transition:[{transition:["none","all","","colors","opacity","shadow","transform",te]}],duration:[{duration:ne()}],ease:[{ease:["linear","in","out","in-out",te]}],delay:[{delay:ne()}],animate:[{animate:["none","spin","ping","pulse","bounce",te]}],transform:[{transform:["","gpu","none"]}],scale:[{scale:[y]}],"scale-x":[{"scale-x":[y]}],"scale-y":[{"scale-y":[y]}],rotate:[{rotate:[oo,te]}],"translate-x":[{"translate-x":[_]}],"translate-y":[{"translate-y":[_]}],"skew-x":[{"skew-x":[E]}],"skew-y":[{"skew-y":[E]}],"transform-origin":[{origin:["center","top","top-right","right","bottom-right","bottom","bottom-left","left","top-left",te]}],accent:[{accent:["auto",e]}],appearance:[{appearance:["none","auto"]}],cursor:[{cursor:["auto","default","pointer","wait","text","move","help","not-allowed","none","context-menu","progress","cell","crosshair","vertical-text","alias","copy","no-drop","grab","grabbing","all-scroll","col-resize","row-resize","n-resize","e-resize","s-resize","w-resize","ne-resize","nw-resize","se-resize","sw-resize","ew-resize","ns-resize","nesw-resize","nwse-resize","zoom-in","zoom-out",te]}],"caret-color":[{caret:[e]}],"pointer-events":[{"pointer-events":["none","auto"]}],resize:[{resize:["none","y","x",""]}],"scroll-behavior":[{scroll:["auto","smooth"]}],"scroll-m":[{"scroll-m":F()}],"scroll-mx":[{"scroll-mx":F()}],"scroll-my":[{"scroll-my":F()}],"scroll-ms":[{"scroll-ms":F()}],"scroll-me":[{"scroll-me":F()}],"scroll-mt":[{"scroll-mt":F()}],"scroll-mr":[{"scroll-mr":F()}],"scroll-mb":[{"scroll-mb":F()}],"scroll-ml":[{"scroll-ml":F()}],"scroll-p":[{"scroll-p":F()}],"scroll-px":[{"scroll-px":F()}],"scroll-py":[{"scroll-py":F()}],"scroll-ps":[{"scroll-ps":F()}],"scroll-pe":[{"scroll-pe":F()}],"scroll-pt":[{"scroll-pt":F()}],"scroll-pr":[{"scroll-pr":F()}],"scroll-pb":[{"scroll-pb":F()}],"scroll-pl":[{"scroll-pl":F()}],"snap-align":[{snap:["start","end","center","align-none"]}],"snap-stop":[{snap:["normal","always"]}],"snap-type":[{snap:["none","x","y","both"]}],"snap-strictness":[{snap:["mandatory","proximity"]}],touch:[{touch:["auto","none","manipulation"]}],"touch-x":[{"touch-pan":["x","left","right"]}],"touch-y":[{"touch-pan":["y","up","down"]}],"touch-pz":["touch-pinch-zoom"],select:[{select:["none","text","all","auto"]}],"will-change":[{"will-change":["auto","scroll","contents","transform",te]}],fill:[{fill:[e,"none"]}],"stroke-w":[{stroke:[xt,At,hn]}],stroke:[{stroke:[e,"none"]}],sr:["sr-only","not-sr-only"],"forced-color-adjust":[{"forced-color-adjust":["auto","none"]}]},conflictingClassGroups:{overflow:["overflow-x","overflow-y"],overscroll:["overscroll-x","overscroll-y"],inset:["inset-x","inset-y","start","end","top","right","bottom","left"],"inset-x":["right","left"],"inset-y":["top","bottom"],flex:["basis","grow","shrink"],gap:["gap-x","gap-y"],p:["px","py","ps","pe","pt","pr","pb","pl"],px:["pr","pl"],py:["pt","pb"],m:["mx","my","ms","me","mt","mr","mb","ml"],mx:["mr","ml"],my:["mt","mb"],size:["w","h"],"font-size":["leading"],"fvn-normal":["fvn-ordinal","fvn-slashed-zero","fvn-figure","fvn-spacing","fvn-fraction"],"fvn-ordinal":["fvn-normal"],"fvn-slashed-zero":["fvn-normal"],"fvn-figure":["fvn-normal"],"fvn-spacing":["fvn-normal"],"fvn-fraction":["fvn-normal"],"line-clamp":["display","overflow"],rounded:["rounded-s","rounded-e","rounded-t","rounded-r","rounded-b","rounded-l","rounded-ss","rounded-se","rounded-ee","rounded-es","rounded-tl","rounded-tr","rounded-br","rounded-bl"],"rounded-s":["rounded-ss","rounded-es"],"rounded-e":["rounded-se","rounded-ee"],"rounded-t":["rounded-tl","rounded-tr"],"rounded-r":["rounded-tr","rounded-br"],"rounded-b":["rounded-br","rounded-bl"],"rounded-l":["rounded-tl","rounded-bl"],"border-spacing":["border-spacing-x","border-spacing-y"],"border-w":["border-w-s","border-w-e","border-w-t","border-w-r","border-w-b","border-w-l"],"border-w-x":["border-w-r","border-w-l"],"border-w-y":["border-w-t","border-w-b"],"border-color":["border-color-s","border-color-e","border-color-t","border-color-r","border-color-b","border-color-l"],"border-color-x":["border-color-r","border-color-l"],"border-color-y":["border-color-t","border-color-b"],"scroll-m":["scroll-mx","scroll-my","scroll-ms","scroll-me","scroll-mt","scroll-mr","scroll-mb","scroll-ml"],"scroll-mx":["scroll-mr","scroll-ml"],"scroll-my":["scroll-mt","scroll-mb"],"scroll-p":["scroll-px","scroll-py","scroll-ps","scroll-pe","scroll-pt","scroll-pr","scroll-pb","scroll-pl"],"scroll-px":["scroll-pr","scroll-pl"],"scroll-py":["scroll-pt","scroll-pb"],touch:["touch-x","touch-y","touch-pz"],"touch-x":["touch"],"touch-y":["touch"],"touch-pz":["touch"]},conflictingClassGroupModifiers:{"font-size":["leading"]}}};var _l=Dp(Yp);function N(...e){return _l(Ho(e))}var U={};wp(U,{Children:()=>nt,Component:()=>Zp,Fragment:()=>Ye,Profiler:()=>Qp,PureComponent:()=>em,StrictMode:()=>tm,Suspense:()=>am,cloneElement:()=>gt,createContext:()=>vt,createElement:()=>S,createFactory:()=>om,createRef:()=>rm,default:()=>Jp,forwardRef:()=>x,isValidElement:()=>ba,lazy:()=>nm,memo:()=>sm,startTransition:()=>lm,useCallback:()=>H,useContext:()=>wt,useDebugValue:()=>im,useDeferredValue:()=>cm,useEffect:()=>D,useId:()=>um,useImperativeHandle:()=>dm,useInsertionEffect:()=>fm,useLayoutEffect:()=>Kt,useMemo:()=>he,useReducer:()=>La,useRef:()=>R,useState:()=>M,useSyncExternalStore:()=>pm,useTransition:()=>mm,version:()=>hm});var se=window.React,Jp=se,nt=se.Children,Zp=se.Component,Ye=se.Fragment,Qp=se.Profiler,em=se.PureComponent,tm=se.StrictMode,am=se.Suspense,gt=se.cloneElement,vt=se.createContext,S=se.createElement,om=se.createFactory,rm=se.createRef,x=se.forwardRef,ba=se.isValidElement,nm=se.lazy,sm=se.memo,lm=se.startTransition,H=se.useCallback,wt=se.useContext,im=se.useDebugValue,cm=se.useDeferredValue,D=se.useEffect,um=se.useId,dm=se.useImperativeHandle,fm=se.useInsertionEffect,Kt=se.useLayoutEffect,he=se.useMemo,La=se.useReducer,R=se.useRef,M=se.useState,pm=se.useSyncExternalStore,mm=se.useTransition,hm=se.version;var Hl=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),Uo=(...e)=>e.filter((t,a,o)=>!!t&&t.trim()!==""&&o.indexOf(t)===a).join(" ").trim();var Ul={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};var ql=x(({color:e="currentColor",size:t=24,strokeWidth:a=2,absoluteStrokeWidth:o,className:r="",children:n,iconNode:s,...l},i)=>S("svg",{ref:i,...Ul,width:t,height:t,stroke:e,strokeWidth:o?Number(a)*24/Number(t):a,className:Uo("lucide",r),...l},[...s.map(([c,d])=>S(c,d)),...Array.isArray(n)?n:[n]]));var oe=(e,t)=>{let a=x(({className:o,...r},n)=>S(ql,{ref:n,iconNode:t,className:Uo(`lucide-${Hl(e)}`,o),...r}));return a.displayName=`${e}`,a};var xm=[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]],Ia=oe("Archive",xm);var gm=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],qe=oe("Check",gm);var vm=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],Xt=oe("ChevronDown",vm);var wm=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],Sa=oe("ChevronRight",wm);var Cm=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],ya=oe("ChevronUp",Cm);var bm=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],no=oe("Circle",bm);var Lm=[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]],Ra=oe("Download",Lm);var Im=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1",key:"1oajmo"}],["path",{d:"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",key:"mpwhp6"}]],$t=oe("FileJson",Im);var Sm=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}],["circle",{cx:"9",cy:"9",r:"2",key:"af1f0g"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",key:"1xmnt7"}]],Pa=oe("Image",Sm);var ym=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],Ct=oe("PanelLeftClose",ym);var Rm=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m14 9 3 3-3 3",key:"8010ee"}]],bt=oe("PanelLeftOpen",Rm);var Pm=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m8 9 3 3-3 3",key:"12hl5m"}]],Ta=oe("PanelRightClose",Pm);var Tm=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m10 15-3-3 3-3",key:"1pgupc"}]],ka=oe("PanelRightOpen",Tm);var km=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],Yt=oe("Plus",km);var Mm=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],Et=oe("RotateCcw",Mm);var Am=[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",key:"1c8476"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",key:"1ydtos"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7",key:"t51u73"}]],Ot=oe("Save",Am);var Dm=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],Ma=oe("Send",Dm);var Em=[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"17 8 12 3 7 8",key:"t8dd8p"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15",key:"widbto"}]],Aa=oe("Upload",Em);var Om=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],Jt=oe("X",Om);var Vl=e=>typeof e=="boolean"?`${e}`:e===0?"0":e,zl=Ho,qo=(e,t)=>a=>{var o;if(t?.variants==null)return zl(e,a?.class,a?.className);let{variants:r,defaultVariants:n}=t,s=Object.keys(r).map(c=>{let d=a?.[c],u=n?.[c];if(d===null)return null;let f=Vl(d)||Vl(u);return r[c][f]}),l=a&&Object.entries(a).reduce((c,d)=>{let[u,f]=d;return f===void 0||(c[u]=f),c},{}),i=t==null||(o=t.compoundVariants)===null||o===void 0?void 0:o.reduce((c,d)=>{let{class:u,className:f,...m}=d;return Object.entries(m).every(g=>{let[p,v]=g;return Array.isArray(v)?v.includes({...n,...l}[p]):{...n,...l}[p]===v})?[...c,u,f]:c},[]);return zl(e,s,i,a?.class,a?.className)};var Nm=qo("xps-badge",{variants:{variant:{default:"xps-badge--default",secondary:"xps-badge--secondary",success:"xps-badge--success",warning:"xps-badge--warning",destructive:"xps-badge--destructive"}},defaultVariants:{variant:"default"}});function st({className:e,variant:t,...a}){return S("span",{className:N(Nm({variant:t}),e),...a})}function Wl(e,t){if(typeof e=="function")return e(t);e!=null&&(e.current=t)}function so(...e){return t=>{let a=!1,o=e.map(r=>{let n=Wl(r,t);return!a&&typeof n=="function"&&(a=!0),n});if(a)return()=>{for(let r=0;r<o.length;r++){let n=o[r];typeof n=="function"?n():Wl(e[r],null)}}}}function j(...e){return H(so(...e),e)}function Ve(e){let t=x((a,o)=>{let{children:r,...n}=a,s=null,l=!1,i=[];Gl(r)&&typeof Vo=="function"&&(r=Vo(r._payload)),nt.forEach(r,f=>{if(Hm(f)){l=!0;let m=f,g="child"in m.props?m.props.child:m.props.children;Gl(g)&&typeof Vo=="function"&&(g=Vo(g._payload)),s=Fm(m,g),i.push(s?.props?.children)}else i.push(f)}),s?s=gt(s,void 0,i):!l&&nt.count(r)===1&&ba(r)&&(s=r);let c=s?_m(s):void 0,d=j(o,c);if(!s){if(r||r===0)throw new Error(l?zm(e):Vm(e));return r}let u=Bm(n,s.props??{});return s.type!==Ye&&(u.ref=o?d:c),gt(s,u)});return t.displayName=`${e}.Slot`,t}var jl=Ve("Slot"),Kl=Symbol.for("radix.slottable");function Xl(e){let t=a=>"child"in a?a.children(a.child):a.children;return t.displayName=`${e}.Slottable`,t.__radixId=Kl,t}var Fm=(e,t)=>{if("child"in e.props){let a=e.props.child;return ba(a)?gt(a,void 0,e.props.children(a.props.children)):null}return ba(t)?t:null};function Bm(e,t){let a={...t};for(let o in t){let r=e[o],n=t[o];/^on[A-Z]/.test(o)?r&&n?a[o]=(...l)=>{let i=n(...l);return r(...l),i}:r&&(a[o]=r):o==="style"?a[o]={...r,...n}:o==="className"&&(a[o]=[r,n].filter(Boolean).join(" "))}return{...e,...a}}function _m(e){let t=Object.getOwnPropertyDescriptor(e.props,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning;return a?e.ref:(t=Object.getOwnPropertyDescriptor(e,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning,a?e.props.ref:e.props.ref||e.ref)}function Hm(e){return ba(e)&&typeof e.type=="function"&&"__radixId"in e.type&&e.type.__radixId===Kl}var Um=Symbol.for("react.lazy");function Gl(e){return e!=null&&typeof e=="object"&&"$$typeof"in e&&e.$$typeof===Um&&"_payload"in e&&qm(e._payload)}function qm(e){return typeof e=="object"&&e!==null&&"then"in e}var Vm=e=>`${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`,zm=e=>`${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`,Vo=U[" use ".trim().toString()];var Wm=qo("xps-button",{variants:{variant:{default:"xps-button--default",secondary:"xps-button--secondary",outline:"xps-button--outline",ghost:"xps-button--ghost",destructive:"xps-button--destructive",destructiveOutline:"xps-button--destructive-outline"},size:{default:"",sm:"xps-button--sm",lg:"xps-button--lg",icon:"xps-button--icon"}},defaultVariants:{variant:"default",size:"default"}}),Ce=x(({className:e,variant:t,size:a,asChild:o=!1,type:r,...n},s)=>{let l=o?jl:"button",i={className:N(Wm({variant:t,size:a}),e),ref:s,...n};return o||(i.type=r??"button"),S(l,i)});Ce.displayName="Button";var Gm=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-card",e),...t}));Gm.displayName="Card";var jm=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-card-header",e),...t}));jm.displayName="CardHeader";var Km=x(({className:e,...t},a)=>S("h3",{ref:a,className:N("xps-card-title",e),...t}));Km.displayName="CardTitle";var Xm=x(({className:e,...t},a)=>S("p",{ref:a,className:N("xps-card-description",e),...t}));Xm.displayName="CardDescription";var $m=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-card-content",e),...t}));$m.displayName="CardContent";var $l=window.React,Ae=$l.Fragment;function h(e,t,a){return $l.createElement(e,a===void 0?t:{...t,key:a})}var Pe=h;function Yl(e,t){let a=vt(t);a.displayName=e+"Context";let o=n=>{let{children:s,...l}=n,i=he(()=>l,Object.values(l));return h(a.Provider,{value:i,children:s})};o.displayName=e+"Provider";function r(n){let s=wt(a);if(s)return s;if(t!==void 0)return t;throw new Error(`\`${n}\` must be used within \`${e}\``)}return[o,r]}function de(e,t=[]){let a=[];function o(n,s){let l=vt(s);l.displayName=n+"Context";let i=a.length;a=[...a,s];let c=u=>{let{scope:f,children:m,...g}=u,p=f?.[e]?.[i]||l,v=he(()=>g,Object.values(g));return h(p.Provider,{value:v,children:m})};c.displayName=n+"Provider";function d(u,f){let m=f?.[e]?.[i]||l,g=wt(m);if(g)return g;if(s!==void 0)return s;throw new Error(`\`${u}\` must be used within \`${n}\``)}return[c,d]}let r=()=>{let n=a.map(s=>vt(s));return function(l){let i=l?.[e]||n;return he(()=>({[`__scope${e}`]:{...l,[e]:i}}),[l,i])}};return r.scopeName=e,[o,Ym(r,...t)]}function Ym(...e){let t=e[0];if(e.length===1)return t;let a=()=>{let o=e.map(r=>({useScope:r(),scopeName:r.scopeName}));return function(n){let s=o.reduce((l,{useScope:i,scopeName:c})=>{let u=i(n)[`__scope${c}`];return{...l,...u}},{});return he(()=>({[`__scope${t.scopeName}`]:s}),[s])}};return a.scopeName=t.scopeName,a}var mL=!!(typeof window<"u"&&window.document&&window.document.createElement);function A(e,t,{checkForDefaultPrevented:a=!0}={}){return function(r){if(e?.(r),a===!1||!r.defaultPrevented)return t?.(r)}}var fe=globalThis?.document?Kt:()=>{};var Jm=U[" useInsertionEffect ".trim().toString()]||fe;function ye({prop:e,defaultProp:t,onChange:a=()=>{},caller:o}){let[r,n,s]=Zm({defaultProp:t,onChange:a}),l=e!==void 0,i=l?e:r;{let d=R(e!==void 0);D(()=>{let u=d.current;u!==l&&console.warn(`${o} is changing from ${u?"controlled":"uncontrolled"} to ${l?"controlled":"uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`),d.current=l},[l,o])}let c=H(d=>{if(l){let u=Qm(d)?d(e):d;u!==e&&s.current?.(u)}else n(d)},[l,e,n,s]);return[i,c]}function Zm({defaultProp:e,onChange:t}){let[a,o]=M(e),r=R(a),n=R(t);return Jm(()=>{n.current=t},[t]),D(()=>{r.current!==a&&(n.current?.(a),r.current=a)},[a,r]),[a,o,n]}function Qm(e){return typeof e=="function"}function Nt(e){let t=R({value:e,previous:e});return he(()=>(t.current.value!==e&&(t.current.previous=t.current.value,t.current.value=e),t.current.previous),[e])}function Ft(e){let[t,a]=M(void 0);return fe(()=>{if(e){a({width:e.offsetWidth,height:e.offsetHeight});let o=new ResizeObserver(r=>{if(!Array.isArray(r)||!r.length)return;let n=r[0],s,l;if("borderBoxSize"in n){let i=n.borderBoxSize,c=Array.isArray(i)?i[0]:i;s=c.inlineSize,l=c.blockSize}else s=e.offsetWidth,l=e.offsetHeight;a({width:s,height:l})});return o.observe(e,{box:"border-box"}),()=>o.unobserve(e)}else a(void 0)},[e]),t}function eh(e,t){return La((a,o)=>t[a][o]??a,e)}var xe=e=>{let{present:t,children:a}=e,o=th(t),r=typeof a=="function"?a({present:o.isPresent}):nt.only(a),n=ah(o.ref,oh(r));return typeof a=="function"||o.isPresent?gt(r,{ref:n}):null};xe.displayName="Presence";function th(e){let[t,a]=M(),o=R(null),r=R(e),n=R("none"),s=e?"mounted":"unmounted",[l,i]=eh(s,{mounted:{UNMOUNT:"unmounted",ANIMATION_OUT:"unmountSuspended"},unmountSuspended:{MOUNT:"mounted",ANIMATION_END:"unmounted"},unmounted:{MOUNT:"mounted"}});return D(()=>{let c=zo(o.current);n.current=l==="mounted"?c:"none"},[l]),fe(()=>{let c=o.current,d=r.current;if(d!==e){let f=n.current,m=zo(c);e?i("MOUNT"):m==="none"||c?.display==="none"?i("UNMOUNT"):i(d&&f!==m?"ANIMATION_OUT":"UNMOUNT"),r.current=e}},[e,i]),fe(()=>{if(t){let c,d=t.ownerDocument.defaultView??window,u=m=>{let p=zo(o.current).includes(CSS.escape(m.animationName));if(m.target===t&&p&&(i("ANIMATION_END"),!r.current)){let v=t.style.animationFillMode;t.style.animationFillMode="forwards",c=d.setTimeout(()=>{t.style.animationFillMode==="forwards"&&(t.style.animationFillMode=v)})}},f=m=>{m.target===t&&(n.current=zo(o.current))};return t.addEventListener("animationstart",f),t.addEventListener("animationcancel",u),t.addEventListener("animationend",u),()=>{d.clearTimeout(c),t.removeEventListener("animationstart",f),t.removeEventListener("animationcancel",u),t.removeEventListener("animationend",u)}}else i("ANIMATION_END")},[t,i]),{isPresent:["mounted","unmountSuspended"].includes(l),ref:H(c=>{o.current=c?getComputedStyle(c):null,a(c)},[])}}function Jl(e,t){if(typeof e=="function")return e(t);e!=null&&(e.current=t)}function ah(...e){let t=R(e);return t.current=e,H(a=>{let o=t.current,r=!1,n=o.map(s=>{let l=Jl(s,a);return!r&&typeof l=="function"&&(r=!0),l});if(r)return()=>{for(let s=0;s<n.length;s++){let l=n[s];typeof l=="function"?l():Jl(o[s],null)}}},[])}function zo(e){return e?.animationName||"none"}function oh(e){let t=Object.getOwnPropertyDescriptor(e.props,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning;return a?e.ref:(t=Object.getOwnPropertyDescriptor(e,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning,a?e.props.ref:e.props.ref||e.ref)}var Bt=window.ReactDOM;var lo=Bt.createPortal,Wo=Bt.flushSync,SL=Bt.findDOMNode,yL=Bt.hydrate,RL=Bt.render,PL=Bt.unstable_batchedUpdates,TL=Bt.unmountComponentAtNode,kL=Bt.version;var rh=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","select","span","svg","ul"],B=rh.reduce((e,t)=>{let a=Ve(`Primitive.${t}`),o=x((r,n)=>{let{asChild:s,...l}=r,i=s?a:t;return typeof window<"u"&&(window[Symbol.for("radix-ui")]=!0),h(i,{...l,ref:n})});return o.displayName=`Primitive.${t}`,{...e,[t]:o}},{});function jo(e,t){e&&Wo(()=>e.dispatchEvent(t))}var Ko="Checkbox",[nh,VL]=de(Ko),[sh,gn]=nh(Ko);function lh(e){let{__scopeCheckbox:t,checked:a,children:o,defaultChecked:r,disabled:n,form:s,name:l,onCheckedChange:i,required:c,value:d="on",internal_do_not_use_render:u}=e,[f,m]=ye({prop:a,defaultProp:r??!1,onChange:i,caller:Ko}),[g,p]=M(null),[v,w]=M(null),L=R(!1),I=g?!!s||!!g.closest("form"):!0,y={checked:f,disabled:n,setChecked:m,control:g,setControl:p,name:l,form:s,value:d,hasConsumerStoppedPropagationRef:L,required:c,defaultChecked:_t(r)?!1:r,isFormControl:I,bubbleInput:v,setBubbleInput:w};return h(sh,{scope:t,...y,children:ih(u)?u(y):o})}var Zl="CheckboxTrigger",Ql=x(({__scopeCheckbox:e,onKeyDown:t,onClick:a,...o},r)=>{let{control:n,value:s,disabled:l,checked:i,required:c,setControl:d,setChecked:u,hasConsumerStoppedPropagationRef:f,isFormControl:m,bubbleInput:g}=gn(Zl,e),p=j(r,d),v=R(i);return D(()=>{let w=n?.form;if(w){let L=()=>u(v.current);return w.addEventListener("reset",L),()=>w.removeEventListener("reset",L)}},[n,u]),h(B.button,{type:"button",role:"checkbox","aria-checked":_t(i)?"mixed":i,"aria-required":c,"data-state":oi(i),"data-disabled":l?"":void 0,disabled:l,value:s,...o,ref:p,onKeyDown:A(t,w=>{w.key==="Enter"&&w.preventDefault()}),onClick:A(a,w=>{u(L=>_t(L)?!0:!L),g&&m&&(f.current=w.isPropagationStopped(),f.current||w.stopPropagation())})})});Ql.displayName=Zl;var Xo=x((e,t)=>{let{__scopeCheckbox:a,name:o,checked:r,defaultChecked:n,required:s,disabled:l,value:i,onCheckedChange:c,form:d,...u}=e;return h(lh,{__scopeCheckbox:a,checked:r,defaultChecked:n,disabled:l,required:s,onCheckedChange:c,name:o,form:d,value:i,internal_do_not_use_render:({isFormControl:f})=>Pe(Ae,{children:[h(Ql,{...u,ref:t,__scopeCheckbox:a}),f&&h(ai,{__scopeCheckbox:a})]})})});Xo.displayName=Ko;var ei="CheckboxIndicator",vn=x((e,t)=>{let{__scopeCheckbox:a,forceMount:o,...r}=e,n=gn(ei,a);return h(xe,{present:o||_t(n.checked)||n.checked===!0,children:h(B.span,{"data-state":oi(n.checked),"data-disabled":n.disabled?"":void 0,...r,ref:t,style:{pointerEvents:"none",...e.style}})})});vn.displayName=ei;var ti="CheckboxBubbleInput",ai=x(({__scopeCheckbox:e,...t},a)=>{let{control:o,hasConsumerStoppedPropagationRef:r,checked:n,defaultChecked:s,required:l,disabled:i,name:c,value:d,form:u,bubbleInput:f,setBubbleInput:m}=gn(ti,e),g=j(a,m),p=Nt(n),v=Ft(o);D(()=>{let L=f;if(!L)return;let I=window.HTMLInputElement.prototype,T=Object.getOwnPropertyDescriptor(I,"checked").set,E=!r.current;if(p!==n&&T){let k=new Event("click",{bubbles:E});L.indeterminate=_t(n),T.call(L,_t(n)?!1:n),L.dispatchEvent(k)}},[f,p,n,r]);let w=R(_t(n)?!1:n);return h(B.input,{type:"checkbox","aria-hidden":!0,defaultChecked:s??w.current,required:l,disabled:i,name:c,value:d,form:u,...t,tabIndex:-1,ref:g,style:{...t.style,...v,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});ai.displayName=ti;function ih(e){return typeof e=="function"}function _t(e){return e==="indeterminate"}function oi(e){return _t(e)?"indeterminate":e?"checked":"unchecked"}var uh=x(({className:e,...t},a)=>S(Xo,{ref:a,className:N("xps-checkbox",e),...t},S(vn,{className:"xps-checkbox-indicator"},S(qe,{className:"xps-icon"}))));uh.displayName=Xo.displayName;var dh=U[" useId ".trim().toString()]||(()=>{}),fh=0;function Ie(e){let[t,a]=M(dh());return fe(()=>{e||a(o=>o??String(fh++))},[e]),e||(t?`radix-${t}`:"")}function pe(e){let t=R(e);return D(()=>{t.current=e}),he(()=>((...a)=>t.current?.(...a)),[])}function ri(e,t=globalThis?.document){let a=pe(e);D(()=>{let o=r=>{r.key==="Escape"&&a(r)};return t.addEventListener("keydown",o,{capture:!0}),()=>t.removeEventListener("keydown",o,{capture:!0})},[a,t])}var ph="DismissableLayer",wn="dismissableLayer.update",mh="dismissableLayer.pointerDownOutside",hh="dismissableLayer.focusOutside",ni,li=vt({layers:new Set,layersWithOutsidePointerEventsDisabled:new Set,branches:new Set}),Lt=x((e,t)=>{let{disableOutsidePointerEvents:a=!1,onEscapeKeyDown:o,onPointerDownOutside:r,onFocusOutside:n,onInteractOutside:s,onDismiss:l,...i}=e,c=wt(li),[d,u]=M(null),f=d?.ownerDocument??globalThis?.document,[,m]=M({}),g=j(t,k=>u(k)),p=Array.from(c.layers),[v]=[...c.layersWithOutsidePointerEventsDisabled].slice(-1),w=p.indexOf(v),L=d?p.indexOf(d):-1,I=c.layersWithOutsidePointerEventsDisabled.size>0,y=L>=w,T=vh(k=>{let _=k.target,V=[...c.branches].some(W=>W.contains(_));!y||V||(r?.(k),s?.(k),k.defaultPrevented||l?.())},f),E=wh(k=>{let _=k.target;[...c.branches].some(W=>W.contains(_))||(n?.(k),s?.(k),k.defaultPrevented||l?.())},f);return ri(k=>{L===c.layers.size-1&&(o?.(k),!k.defaultPrevented&&l&&(k.preventDefault(),l()))},f),D(()=>{if(d)return a&&(c.layersWithOutsidePointerEventsDisabled.size===0&&(ni=f.body.style.pointerEvents,f.body.style.pointerEvents="none"),c.layersWithOutsidePointerEventsDisabled.add(d)),c.layers.add(d),si(),()=>{a&&(c.layersWithOutsidePointerEventsDisabled.delete(d),c.layersWithOutsidePointerEventsDisabled.size===0&&(f.body.style.pointerEvents=ni))}},[d,f,a,c]),D(()=>()=>{d&&(c.layers.delete(d),c.layersWithOutsidePointerEventsDisabled.delete(d),si())},[d,c]),D(()=>{let k=()=>m({});return document.addEventListener(wn,k),()=>document.removeEventListener(wn,k)},[]),h(B.div,{...i,ref:g,style:{pointerEvents:I?y?"auto":"none":void 0,...e.style},onFocusCapture:A(e.onFocusCapture,E.onFocusCapture),onBlurCapture:A(e.onBlurCapture,E.onBlurCapture),onPointerDownCapture:A(e.onPointerDownCapture,T.onPointerDownCapture)})});Lt.displayName=ph;var xh="DismissableLayerBranch",gh=x((e,t)=>{let a=wt(li),o=R(null),r=j(t,o);return D(()=>{let n=o.current;if(n)return a.branches.add(n),()=>{a.branches.delete(n)}},[a.branches]),h(B.div,{...e,ref:r})});gh.displayName=xh;function vh(e,t=globalThis?.document){let a=pe(e),o=R(!1),r=R(()=>{});return D(()=>{let n=l=>{if(l.target&&!o.current){let c=function(){ii(mh,a,d,{discrete:!0})};var i=c;let d={originalEvent:l};l.pointerType==="touch"?(t.removeEventListener("click",r.current),r.current=c,t.addEventListener("click",r.current,{once:!0})):c()}else t.removeEventListener("click",r.current);o.current=!1},s=window.setTimeout(()=>{t.addEventListener("pointerdown",n)},0);return()=>{window.clearTimeout(s),t.removeEventListener("pointerdown",n),t.removeEventListener("click",r.current)}},[t,a]),{onPointerDownCapture:()=>o.current=!0}}function wh(e,t=globalThis?.document){let a=pe(e),o=R(!1);return D(()=>{let r=n=>{n.target&&!o.current&&ii(hh,a,{originalEvent:n},{discrete:!1})};return t.addEventListener("focusin",r),()=>t.removeEventListener("focusin",r)},[t,a]),{onFocusCapture:()=>o.current=!0,onBlurCapture:()=>o.current=!1}}function si(){let e=new CustomEvent(wn);document.dispatchEvent(e)}function ii(e,t,a,{discrete:o}){let r=a.originalEvent.target,n=new CustomEvent(e,{bubbles:!1,cancelable:!0,detail:a});t&&r.addEventListener(e,t,{once:!0}),o?jo(r,n):r.dispatchEvent(n)}var Cn="focusScope.autoFocusOnMount",bn="focusScope.autoFocusOnUnmount",ci={bubbles:!1,cancelable:!0},Ch="FocusScope",Zt=x((e,t)=>{let{loop:a=!1,trapped:o=!1,onMountAutoFocus:r,onUnmountAutoFocus:n,...s}=e,[l,i]=M(null),c=pe(r),d=pe(n),u=R(null),f=j(t,p=>i(p)),m=R({paused:!1,pause(){this.paused=!0},resume(){this.paused=!1}}).current;D(()=>{if(o){let L=function(E){if(m.paused||!l)return;let k=E.target;l.contains(k)?u.current=k:Ht(u.current,{select:!0})},I=function(E){if(m.paused||!l)return;let k=E.relatedTarget;k!==null&&(l.contains(k)||Ht(u.current,{select:!0}))},y=function(E){if(document.activeElement===document.body)for(let _ of E)_.removedNodes.length>0&&Ht(l)};var p=L,v=I,w=y;document.addEventListener("focusin",L),document.addEventListener("focusout",I);let T=new MutationObserver(y);return l&&T.observe(l,{childList:!0,subtree:!0}),()=>{document.removeEventListener("focusin",L),document.removeEventListener("focusout",I),T.disconnect()}}},[o,l,m.paused]),D(()=>{if(l){di.add(m);let p=document.activeElement;if(!l.contains(p)){let w=new CustomEvent(Cn,ci);l.addEventListener(Cn,c),l.dispatchEvent(w),w.defaultPrevented||(bh(Rh(pi(l)),{select:!0}),document.activeElement===p&&Ht(l))}return()=>{l.removeEventListener(Cn,c),setTimeout(()=>{let w=new CustomEvent(bn,ci);l.addEventListener(bn,d),l.dispatchEvent(w),w.defaultPrevented||Ht(p??document.body,{select:!0}),l.removeEventListener(bn,d),di.remove(m)},0)}}},[l,c,d,m]);let g=H(p=>{if(!a&&!o||m.paused)return;let v=p.key==="Tab"&&!p.altKey&&!p.ctrlKey&&!p.metaKey,w=document.activeElement;if(v&&w){let L=p.currentTarget,[I,y]=Lh(L);I&&y?!p.shiftKey&&w===y?(p.preventDefault(),a&&Ht(I,{select:!0})):p.shiftKey&&w===I&&(p.preventDefault(),a&&Ht(y,{select:!0})):w===L&&p.preventDefault()}},[a,o,m.paused]);return h(B.div,{tabIndex:-1,...s,ref:f,onKeyDown:g})});Zt.displayName=Ch;function bh(e,{select:t=!1}={}){let a=document.activeElement;for(let o of e)if(Ht(o,{select:t}),document.activeElement!==a)return}function Lh(e){let t=pi(e),a=ui(t,e),o=ui(t.reverse(),e);return[a,o]}function pi(e){let t=[],a=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:o=>{let r=o.tagName==="INPUT"&&o.type==="hidden";return o.disabled||o.hidden||r?NodeFilter.FILTER_SKIP:o.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}});for(;a.nextNode();)t.push(a.currentNode);return t}function ui(e,t){for(let a of e)if(!Ih(a,{upTo:t}))return a}function Ih(e,{upTo:t}){if(getComputedStyle(e).visibility==="hidden")return!0;for(;e;){if(t!==void 0&&e===t)return!1;if(getComputedStyle(e).display==="none")return!0;e=e.parentElement}return!1}function Sh(e){return e instanceof HTMLInputElement&&"select"in e}function Ht(e,{select:t=!1}={}){if(e&&e.focus){let a=document.activeElement;e.focus({preventScroll:!0}),e!==a&&Sh(e)&&t&&e.select()}}var di=yh();function yh(){let e=[];return{add(t){let a=e[0];t!==a&&a?.pause(),e=fi(e,t),e.unshift(t)},remove(t){e=fi(e,t),e[0]?.resume()}}}function fi(e,t){let a=[...e],o=a.indexOf(t);return o!==-1&&a.splice(o,1),a}function Rh(e){return e.filter(t=>t.tagName!=="A")}var Ph="Portal",It=x((e,t)=>{let{container:a,...o}=e,[r,n]=M(!1);fe(()=>n(!0),[]);let s=a||r&&globalThis?.document?.body;return s?lo(h(B.div,{...o,ref:t}),s):null});It.displayName=Ph;var $o=0,Da=null;function Ea(){D(()=>{Da||(Da={start:mi(),end:mi()});let{start:e,end:t}=Da;return document.body.firstElementChild!==e&&document.body.insertAdjacentElement("afterbegin",e),document.body.lastElementChild!==t&&document.body.insertAdjacentElement("beforeend",t),$o++,()=>{$o===1&&(Da?.start.remove(),Da?.end.remove(),Da=null),$o=Math.max(0,$o-1)}},[])}function mi(){let e=document.createElement("span");return e.setAttribute("data-radix-focus-guard",""),e.tabIndex=0,e.style.outline="none",e.style.opacity="0",e.style.position="fixed",e.style.pointerEvents="none",e}var Ne=function(){return Ne=Object.assign||function(t){for(var a,o=1,r=arguments.length;o<r;o++){a=arguments[o];for(var n in a)Object.prototype.hasOwnProperty.call(a,n)&&(t[n]=a[n])}return t},Ne.apply(this,arguments)};function Yo(e,t){var a={};for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&t.indexOf(o)<0&&(a[o]=e[o]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var r=0,o=Object.getOwnPropertySymbols(e);r<o.length;r++)t.indexOf(o[r])<0&&Object.prototype.propertyIsEnumerable.call(e,o[r])&&(a[o[r]]=e[o[r]]);return a}function hi(e,t,a){if(a||arguments.length===2)for(var o=0,r=t.length,n;o<r;o++)(n||!(o in t))&&(n||(n=Array.prototype.slice.call(t,0,o)),n[o]=t[o]);return e.concat(n||Array.prototype.slice.call(t))}var Qt="right-scroll-bar-position",ea="width-before-scroll-bar",Ln="with-scroll-bars-hidden",In="--removed-body-scroll-bar-size";function Jo(e,t){return typeof e=="function"?e(t):e&&(e.current=t),e}function xi(e,t){var a=M(function(){return{value:e,callback:t,facade:{get current(){return a.value},set current(o){var r=a.value;r!==o&&(a.value=o,a.callback(o,r))}}}})[0];return a.callback=t,a.facade}var Th=typeof window<"u"?Kt:D,gi=new WeakMap;function Sn(e,t){var a=xi(t||null,function(o){return e.forEach(function(r){return Jo(r,o)})});return Th(function(){var o=gi.get(a);if(o){var r=new Set(o),n=new Set(e),s=a.current;r.forEach(function(l){n.has(l)||Jo(l,null)}),n.forEach(function(l){r.has(l)||Jo(l,s)})}gi.set(a,e)},[e]),a}function kh(e){return e}function Mh(e,t){t===void 0&&(t=kh);var a=[],o=!1,r={read:function(){if(o)throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");return a.length?a[a.length-1]:e},useMedium:function(n){var s=t(n,o);return a.push(s),function(){a=a.filter(function(l){return l!==s})}},assignSyncMedium:function(n){for(o=!0;a.length;){var s=a;a=[],s.forEach(n)}a={push:function(l){return n(l)},filter:function(){return a}}},assignMedium:function(n){o=!0;var s=[];if(a.length){var l=a;a=[],l.forEach(n),s=a}var i=function(){var d=s;s=[],d.forEach(n)},c=function(){return Promise.resolve().then(i)};c(),a={push:function(d){s.push(d),c()},filter:function(d){return s=s.filter(d),a}}}};return r}function yn(e){e===void 0&&(e={});var t=Mh(null);return t.options=Ne({async:!0,ssr:!1},e),t}var vi=function(e){var t=e.sideCar,a=Yo(e,["sideCar"]);if(!t)throw new Error("Sidecar: please provide `sideCar` property to import the right car");var o=t.read();if(!o)throw new Error("Sidecar medium not found");return S(o,Ne({},a))};vi.isSideCarExport=!0;function Rn(e,t){return e.useMedium(t),vi}var Zo=yn();var Pn=function(){},io=x(function(e,t){var a=R(null),o=M({onScrollCapture:Pn,onWheelCapture:Pn,onTouchMoveCapture:Pn}),r=o[0],n=o[1],s=e.forwardProps,l=e.children,i=e.className,c=e.removeScrollBar,d=e.enabled,u=e.shards,f=e.sideCar,m=e.noRelative,g=e.noIsolation,p=e.inert,v=e.allowPinchZoom,w=e.as,L=w===void 0?"div":w,I=e.gapMode,y=Yo(e,["forwardProps","children","className","removeScrollBar","enabled","shards","sideCar","noRelative","noIsolation","inert","allowPinchZoom","as","gapMode"]),T=f,E=Sn([a,t]),k=Ne(Ne({},y),r);return S(Ye,null,d&&S(T,{sideCar:Zo,removeScrollBar:c,shards:u,noRelative:m,noIsolation:g,inert:p,setCallbacks:n,allowPinchZoom:!!v,lockRef:a,gapMode:I}),s?gt(nt.only(l),Ne(Ne({},k),{ref:E})):S(L,Ne({},k,{className:i,ref:E}),l))});io.defaultProps={enabled:!0,removeScrollBar:!0,inert:!1};io.classNames={fullWidth:ea,zeroRight:Qt};var wi;var Ci=function(){if(wi)return wi;if(typeof __webpack_nonce__<"u")return __webpack_nonce__};function Ah(){if(!document)return null;var e=document.createElement("style");e.type="text/css";var t=Ci();return t&&e.setAttribute("nonce",t),e}function Dh(e,t){e.styleSheet?e.styleSheet.cssText=t:e.appendChild(document.createTextNode(t))}function Eh(e){var t=document.head||document.getElementsByTagName("head")[0];t.appendChild(e)}var Tn=function(){var e=0,t=null;return{add:function(a){e==0&&(t=Ah())&&(Dh(t,a),Eh(t)),e++},remove:function(){e--,!e&&t&&(t.parentNode&&t.parentNode.removeChild(t),t=null)}}};var kn=function(){var e=Tn();return function(t,a){D(function(){return e.add(t),function(){e.remove()}},[t&&a])}};var co=function(){var e=kn(),t=function(a){var o=a.styles,r=a.dynamic;return e(o,r),null};return t};var Oh={left:0,top:0,right:0,gap:0},Mn=function(e){return parseInt(e||"",10)||0},Nh=function(e){var t=window.getComputedStyle(document.body),a=t[e==="padding"?"paddingLeft":"marginLeft"],o=t[e==="padding"?"paddingTop":"marginTop"],r=t[e==="padding"?"paddingRight":"marginRight"];return[Mn(a),Mn(o),Mn(r)]},An=function(e){if(e===void 0&&(e="margin"),typeof window>"u")return Oh;var t=Nh(e),a=document.documentElement.clientWidth,o=window.innerWidth;return{left:t[0],top:t[1],right:t[2],gap:Math.max(0,o-a+t[2]-t[0])}};var Fh=co(),Oa="data-scroll-locked",Bh=function(e,t,a,o){var r=e.left,n=e.top,s=e.right,l=e.gap;return a===void 0&&(a="margin"),`
  .`.concat(Ln,` {
   overflow: hidden `).concat(o,`;
   padding-right: `).concat(l,"px ").concat(o,`;
  }
  body[`).concat(Oa,`] {
    overflow: hidden `).concat(o,`;
    overscroll-behavior: contain;
    `).concat([t&&"position: relative ".concat(o,";"),a==="margin"&&`
    padding-left: `.concat(r,`px;
    padding-top: `).concat(n,`px;
    padding-right: `).concat(s,`px;
    margin-left:0;
    margin-top:0;
    margin-right: `).concat(l,"px ").concat(o,`;
    `),a==="padding"&&"padding-right: ".concat(l,"px ").concat(o,";")].filter(Boolean).join(""),`
  }
  
  .`).concat(Qt,` {
    right: `).concat(l,"px ").concat(o,`;
  }
  
  .`).concat(ea,` {
    margin-right: `).concat(l,"px ").concat(o,`;
  }
  
  .`).concat(Qt," .").concat(Qt,` {
    right: 0 `).concat(o,`;
  }
  
  .`).concat(ea," .").concat(ea,` {
    margin-right: 0 `).concat(o,`;
  }
  
  body[`).concat(Oa,`] {
    `).concat(In,": ").concat(l,`px;
  }
`)},bi=function(){var e=parseInt(document.body.getAttribute(Oa)||"0",10);return isFinite(e)?e:0},_h=function(){D(function(){return document.body.setAttribute(Oa,(bi()+1).toString()),function(){var e=bi()-1;e<=0?document.body.removeAttribute(Oa):document.body.setAttribute(Oa,e.toString())}},[])},Dn=function(e){var t=e.noRelative,a=e.noImportant,o=e.gapMode,r=o===void 0?"margin":o;_h();var n=he(function(){return An(r)},[r]);return S(Fh,{styles:Bh(n,!t,r,a?"":"!important")})};var En=!1;if(typeof window<"u")try{uo=Object.defineProperty({},"passive",{get:function(){return En=!0,!0}}),window.addEventListener("test",uo,uo),window.removeEventListener("test",uo,uo)}catch{En=!1}var uo,ta=En?{passive:!1}:!1;var Hh=function(e){return e.tagName==="TEXTAREA"},Li=function(e,t){if(!(e instanceof Element))return!1;var a=window.getComputedStyle(e);return a[t]!=="hidden"&&!(a.overflowY===a.overflowX&&!Hh(e)&&a[t]==="visible")},Uh=function(e){return Li(e,"overflowY")},qh=function(e){return Li(e,"overflowX")},On=function(e,t){var a=t.ownerDocument,o=t;do{typeof ShadowRoot<"u"&&o instanceof ShadowRoot&&(o=o.host);var r=Ii(e,o);if(r){var n=Si(e,o),s=n[1],l=n[2];if(s>l)return!0}o=o.parentNode}while(o&&o!==a.body);return!1},Vh=function(e){var t=e.scrollTop,a=e.scrollHeight,o=e.clientHeight;return[t,a,o]},zh=function(e){var t=e.scrollLeft,a=e.scrollWidth,o=e.clientWidth;return[t,a,o]},Ii=function(e,t){return e==="v"?Uh(t):qh(t)},Si=function(e,t){return e==="v"?Vh(t):zh(t)},Wh=function(e,t){return e==="h"&&t==="rtl"?-1:1},yi=function(e,t,a,o,r){var n=Wh(e,window.getComputedStyle(t).direction),s=n*o,l=a.target,i=t.contains(l),c=!1,d=s>0,u=0,f=0;do{if(!l)break;var m=Si(e,l),g=m[0],p=m[1],v=m[2],w=p-v-n*g;(g||w)&&Ii(e,l)&&(u+=w,f+=g);var L=l.parentNode;l=L&&L.nodeType===Node.DOCUMENT_FRAGMENT_NODE?L.host:L}while(!i&&l!==document.body||i&&(t.contains(l)||t===l));return(d&&(r&&Math.abs(u)<1||!r&&s>u)||!d&&(r&&Math.abs(f)<1||!r&&-s>f))&&(c=!0),c};var Qo=function(e){return"changedTouches"in e?[e.changedTouches[0].clientX,e.changedTouches[0].clientY]:[0,0]},Ri=function(e){return[e.deltaX,e.deltaY]},Pi=function(e){return e&&"current"in e?e.current:e},Gh=function(e,t){return e[0]===t[0]&&e[1]===t[1]},jh=function(e){return`
  .block-interactivity-`.concat(e,` {pointer-events: none;}
  .allow-interactivity-`).concat(e,` {pointer-events: all;}
`)},Kh=0,Na=[];function Ti(e){var t=R([]),a=R([0,0]),o=R(),r=M(Kh++)[0],n=M(co)[0],s=R(e);D(function(){s.current=e},[e]),D(function(){if(e.inert){document.body.classList.add("block-interactivity-".concat(r));var p=hi([e.lockRef.current],(e.shards||[]).map(Pi),!0).filter(Boolean);return p.forEach(function(v){return v.classList.add("allow-interactivity-".concat(r))}),function(){document.body.classList.remove("block-interactivity-".concat(r)),p.forEach(function(v){return v.classList.remove("allow-interactivity-".concat(r))})}}},[e.inert,e.lockRef.current,e.shards]);var l=H(function(p,v){if("touches"in p&&p.touches.length===2||p.type==="wheel"&&p.ctrlKey)return!s.current.allowPinchZoom;var w=Qo(p),L=a.current,I="deltaX"in p?p.deltaX:L[0]-w[0],y="deltaY"in p?p.deltaY:L[1]-w[1],T,E=p.target,k=Math.abs(I)>Math.abs(y)?"h":"v";if("touches"in p&&k==="h"&&E.type==="range")return!1;var _=window.getSelection(),V=_&&_.anchorNode,W=V?V===E||V.contains(E):!1;if(W)return!1;var K=On(k,E);if(!K)return!0;if(K?T=k:(T=k==="v"?"h":"v",K=On(k,E)),!K)return!1;if(!o.current&&"changedTouches"in p&&(I||y)&&(o.current=T),!T)return!0;var F=o.current||T;return yi(F,v,p,F==="h"?I:y,!0)},[]),i=H(function(p){var v=p;if(!(!Na.length||Na[Na.length-1]!==n)){var w="deltaY"in v?Ri(v):Qo(v),L=t.current.filter(function(T){return T.name===v.type&&(T.target===v.target||v.target===T.shadowParent)&&Gh(T.delta,w)})[0];if(L&&L.should){v.cancelable&&v.preventDefault();return}if(!L){var I=(s.current.shards||[]).map(Pi).filter(Boolean).filter(function(T){return T.contains(v.target)}),y=I.length>0?l(v,I[0]):!s.current.noIsolation;y&&v.cancelable&&v.preventDefault()}}},[]),c=H(function(p,v,w,L){var I={name:p,delta:v,target:w,should:L,shadowParent:Xh(w)};t.current.push(I),setTimeout(function(){t.current=t.current.filter(function(y){return y!==I})},1)},[]),d=H(function(p){a.current=Qo(p),o.current=void 0},[]),u=H(function(p){c(p.type,Ri(p),p.target,l(p,e.lockRef.current))},[]),f=H(function(p){c(p.type,Qo(p),p.target,l(p,e.lockRef.current))},[]);D(function(){return Na.push(n),e.setCallbacks({onScrollCapture:u,onWheelCapture:u,onTouchMoveCapture:f}),document.addEventListener("wheel",i,ta),document.addEventListener("touchmove",i,ta),document.addEventListener("touchstart",d,ta),function(){Na=Na.filter(function(p){return p!==n}),document.removeEventListener("wheel",i,ta),document.removeEventListener("touchmove",i,ta),document.removeEventListener("touchstart",d,ta)}},[]);var m=e.removeScrollBar,g=e.inert;return S(Ye,null,g?S(n,{styles:jh(r)}):null,m?S(Dn,{noRelative:e.noRelative,gapMode:e.gapMode}):null)}function Xh(e){for(var t=null;e!==null;)e instanceof ShadowRoot&&(t=e.host,e=e.host),e=e.parentNode;return t}var ki=Rn(Zo,Ti);var Mi=x(function(e,t){return S(io,Ne({},e,{ref:t,sideCar:ki}))});Mi.classNames=io.classNames;var aa=Mi;var $h=function(e){if(typeof document>"u")return null;var t=Array.isArray(e)?e[0]:e;return t.ownerDocument.body},Fa=new WeakMap,er=new WeakMap,tr={},Nn=0,Ai=function(e){return e&&(e.host||Ai(e.parentNode))},Yh=function(e,t){return t.map(function(a){if(e.contains(a))return a;var o=Ai(a);return o&&e.contains(o)?o:(console.error("aria-hidden",a,"in not contained inside",e,". Doing nothing"),null)}).filter(function(a){return!!a})},Jh=function(e,t,a,o){var r=Yh(t,Array.isArray(e)?e:[e]);tr[a]||(tr[a]=new WeakMap);var n=tr[a],s=[],l=new Set,i=new Set(r),c=function(u){!u||l.has(u)||(l.add(u),c(u.parentNode))};r.forEach(c);var d=function(u){!u||i.has(u)||Array.prototype.forEach.call(u.children,function(f){if(l.has(f))d(f);else try{var m=f.getAttribute(o),g=m!==null&&m!=="false",p=(Fa.get(f)||0)+1,v=(n.get(f)||0)+1;Fa.set(f,p),n.set(f,v),s.push(f),p===1&&g&&er.set(f,!0),v===1&&f.setAttribute(a,"true"),g||f.setAttribute(o,"true")}catch(w){console.error("aria-hidden: cannot operate on ",f,w)}})};return d(t),l.clear(),Nn++,function(){s.forEach(function(u){var f=Fa.get(u)-1,m=n.get(u)-1;Fa.set(u,f),n.set(u,m),f||(er.has(u)||u.removeAttribute(o),er.delete(u)),m||u.removeAttribute(a)}),Nn--,Nn||(Fa=new WeakMap,Fa=new WeakMap,er=new WeakMap,tr={})}},Ba=function(e,t,a){a===void 0&&(a="data-aria-hidden");var o=Array.from(Array.isArray(e)?e:[e]),r=t||$h(e);return r?(o.push.apply(o,Array.from(r.querySelectorAll("[aria-live], script"))),Jh(o,r,a,"aria-hidden")):function(){return null}};var or="Dialog",[Di,HS]=de(or),[Zh,Je]=Di(or),Ei=e=>{let{__scopeDialog:t,children:a,open:o,defaultOpen:r,onOpenChange:n,modal:s=!0}=e,l=R(null),i=R(null),[c,d]=ye({prop:o,defaultProp:r??!1,onChange:n,caller:or});return h(Zh,{scope:t,triggerRef:l,contentRef:i,contentId:Ie(),titleId:Ie(),descriptionId:Ie(),open:c,onOpenChange:d,onOpenToggle:H(()=>d(u=>!u),[d]),modal:s,children:a})};Ei.displayName=or;var Oi="DialogTrigger",Qh=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=Je(Oi,a),n=j(t,r.triggerRef);return h(B.button,{type:"button","aria-haspopup":"dialog","aria-expanded":r.open,"aria-controls":r.open?r.contentId:void 0,"data-state":_n(r.open),...o,ref:n,onClick:A(e.onClick,r.onOpenToggle)})});Qh.displayName=Oi;var Fn="DialogPortal",[ex,Ni]=Di(Fn,{forceMount:void 0}),Fi=e=>{let{__scopeDialog:t,forceMount:a,children:o,container:r}=e,n=Je(Fn,t);return h(ex,{scope:t,forceMount:a,children:nt.map(o,s=>h(xe,{present:a||n.open,children:h(It,{asChild:!0,container:r,children:s})}))})};Fi.displayName=Fn;var ar="DialogOverlay",Bi=x((e,t)=>{let a=Ni(ar,e.__scopeDialog),{forceMount:o=a.forceMount,...r}=e,n=Je(ar,e.__scopeDialog);return n.modal?h(xe,{present:o||n.open,children:h(ax,{...r,ref:t})}):null});Bi.displayName=ar;var tx=Ve("DialogOverlay.RemoveScroll"),ax=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=Je(ar,a);return h(aa,{as:tx,allowPinchZoom:!0,shards:[r.contentRef],children:h(B.div,{"data-state":_n(r.open),...o,ref:t,style:{pointerEvents:"auto",...o.style}})})}),oa="DialogContent",_i=x((e,t)=>{let a=Ni(oa,e.__scopeDialog),{forceMount:o=a.forceMount,...r}=e,n=Je(oa,e.__scopeDialog);return h(xe,{present:o||n.open,children:n.modal?h(ox,{...r,ref:t}):h(rx,{...r,ref:t})})});_i.displayName=oa;var ox=x((e,t)=>{let a=Je(oa,e.__scopeDialog),o=R(null),r=j(t,a.contentRef,o);return D(()=>{let n=o.current;if(n)return Ba(n)},[]),h(Hi,{...e,ref:r,trapFocus:a.open,disableOutsidePointerEvents:a.open,onCloseAutoFocus:A(e.onCloseAutoFocus,n=>{n.preventDefault(),a.triggerRef.current?.focus()}),onPointerDownOutside:A(e.onPointerDownOutside,n=>{let s=n.detail.originalEvent,l=s.button===0&&s.ctrlKey===!0;(s.button===2||l)&&n.preventDefault()}),onFocusOutside:A(e.onFocusOutside,n=>n.preventDefault())})}),rx=x((e,t)=>{let a=Je(oa,e.__scopeDialog),o=R(!1),r=R(!1);return h(Hi,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,onCloseAutoFocus:n=>{e.onCloseAutoFocus?.(n),n.defaultPrevented||(o.current||a.triggerRef.current?.focus(),n.preventDefault()),o.current=!1,r.current=!1},onInteractOutside:n=>{e.onInteractOutside?.(n),n.defaultPrevented||(o.current=!0,n.detail.originalEvent.type==="pointerdown"&&(r.current=!0));let s=n.target;a.triggerRef.current?.contains(s)&&n.preventDefault(),n.detail.originalEvent.type==="focusin"&&r.current&&n.preventDefault()}})}),Hi=x((e,t)=>{let{__scopeDialog:a,trapFocus:o,onOpenAutoFocus:r,onCloseAutoFocus:n,...s}=e,l=Je(oa,a),i=R(null),c=j(t,i);return Ea(),Pe(Ae,{children:[h(Zt,{asChild:!0,loop:!0,trapped:o,onMountAutoFocus:r,onUnmountAutoFocus:n,children:h(Lt,{role:"dialog",id:l.contentId,"aria-describedby":l.descriptionId,"aria-labelledby":l.titleId,"data-state":_n(l.open),...s,ref:c,onDismiss:()=>l.onOpenChange(!1)})}),Pe(Ae,{children:[h(nx,{titleId:l.titleId}),h(lx,{contentRef:i,descriptionId:l.descriptionId})]})]})}),Bn="DialogTitle",Ui=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=Je(Bn,a);return h(B.h2,{id:r.titleId,...o,ref:t})});Ui.displayName=Bn;var qi="DialogDescription",Vi=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=Je(qi,a);return h(B.p,{id:r.descriptionId,...o,ref:t})});Vi.displayName=qi;var zi="DialogClose",Wi=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=Je(zi,a);return h(B.button,{type:"button",...o,ref:t,onClick:A(e.onClick,()=>r.onOpenChange(!1))})});Wi.displayName=zi;function _n(e){return e?"open":"closed"}var Gi="DialogTitleWarning",[US,ji]=Yl(Gi,{contentName:oa,titleName:Bn,docsSlug:"dialog"}),nx=({titleId:e})=>{let t=ji(Gi),a=`\`${t.contentName}\` requires a \`${t.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${t.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${t.docsSlug}`;return D(()=>{e&&(document.getElementById(e)||console.error(a))},[a,e]),null},sx="DialogDescriptionWarning",lx=({contentRef:e,descriptionId:t})=>{let o=`Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${ji(sx).contentName}}.`;return D(()=>{let r=e.current?.getAttribute("aria-describedby");t&&r&&(document.getElementById(t)||console.warn(o))},[o,e,t]),null},Hn=Ei;var rr=Fi,_a=Bi,Ha=_i,Ua=Ui,qa=Vi,nr=Wi;var Xi=Hn;var cx=rr;var $i=x(({className:e,...t},a)=>S(_a,{ref:a,className:N("xps-dialog-overlay",e),...t}));$i.displayName=_a.displayName;var Un=x(({className:e,children:t,showClose:a=!0,...o},r)=>S(cx,null,S($i,null),S(Ha,{ref:r,className:N("xps-dialog-content",e),...o},t,a?S(nr,{className:"xps-dialog-close"},S(Jt,{className:"xps-icon","aria-hidden":"true"}),S("span",{className:"xps-sr-only"},"Close")):null)));Un.displayName=Ha.displayName;var qn=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-dialog-header",e),...t}));qn.displayName="DialogHeader";var Vn=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-dialog-footer",e),...t}));Vn.displayName="DialogFooter";var zn=x(({className:e,...t},a)=>S(Ua,{ref:a,className:N("xps-dialog-title",e),...t}));zn.displayName=Ua.displayName;var ux=x(({className:e,...t},a)=>S(qa,{ref:a,className:N("xps-dialog-description",e),...t}));ux.displayName=qa.displayName;function Ut(e){let t=e+"CollectionProvider",[a,o]=de(t),[r,n]=a(t,{collectionRef:{current:null},itemMap:new Map}),s=p=>{let{scope:v,children:w}=p,L=R(null),I=R(new Map).current;return h(r,{scope:v,itemMap:I,collectionRef:L,children:w})};s.displayName=t;let l=e+"CollectionSlot",i=Ve(l),c=x((p,v)=>{let{scope:w,children:L}=p,I=n(l,w),y=j(v,I.collectionRef);return h(i,{ref:y,children:L})});c.displayName=l;let d=e+"CollectionItemSlot",u="data-radix-collection-item",f=Ve(d),m=x((p,v)=>{let{scope:w,children:L,...I}=p,y=R(null),T=j(v,y),E=n(d,w);return D(()=>(E.itemMap.set(y,{ref:y,...I}),()=>{E.itemMap.delete(y)})),h(f,{[u]:"",ref:T,children:L})});m.displayName=d;function g(p){let v=n(e+"CollectionConsumer",p);return H(()=>{let L=v.collectionRef.current;if(!L)return[];let I=Array.from(L.querySelectorAll(`[${u}]`));return Array.from(v.itemMap.values()).sort((E,k)=>I.indexOf(E.ref.current)-I.indexOf(k.ref.current))},[v.collectionRef,v.itemMap])}return[{Provider:s,Slot:c,ItemSlot:m},g,o]}var dx=vt(void 0);function ze(e){let t=wt(dx);return e||t||"ltr"}var Zi=["top","right","bottom","left"];var lt=Math.min,De=Math.max,po=Math.round,mo=Math.floor,Ze=e=>({x:e,y:e}),fx={left:"right",right:"left",bottom:"top",top:"bottom"};function lr(e,t,a){return De(e,lt(t,a))}function it(e,t){return typeof e=="function"?e(t):e}function ct(e){return e.split("-")[0]}function ra(e){return e.split("-")[1]}function ir(e){return e==="x"?"y":"x"}function cr(e){return e==="y"?"height":"width"}function Qe(e){let t=e[0];return t==="t"||t==="b"?"y":"x"}function ur(e){return ir(Qe(e))}function Qi(e,t,a){a===void 0&&(a=!1);let o=ra(e),r=ur(e),n=cr(r),s=r==="x"?o===(a?"end":"start")?"right":"left":o==="start"?"bottom":"top";return t.reference[n]>t.floating[n]&&(s=fo(s)),[s,fo(s)]}function ec(e){let t=fo(e);return[sr(e),t,sr(t)]}function sr(e){return e.includes("start")?e.replace("start","end"):e.replace("end","start")}var Yi=["left","right"],Ji=["right","left"],px=["top","bottom"],mx=["bottom","top"];function hx(e,t,a){switch(e){case"top":case"bottom":return a?t?Ji:Yi:t?Yi:Ji;case"left":case"right":return t?px:mx;default:return[]}}function tc(e,t,a,o){let r=ra(e),n=hx(ct(e),a==="start",o);return r&&(n=n.map(s=>s+"-"+r),t&&(n=n.concat(n.map(sr)))),n}function fo(e){let t=ct(e);return fx[t]+e.slice(t.length)}function xx(e){return{top:0,right:0,bottom:0,left:0,...e}}function Wn(e){return typeof e!="number"?xx(e):{top:e,right:e,bottom:e,left:e}}function na(e){let{x:t,y:a,width:o,height:r}=e;return{width:o,height:r,top:a,left:t,right:t+o,bottom:a+r,x:t,y:a}}function ac(e,t,a){let{reference:o,floating:r}=e,n=Qe(t),s=ur(t),l=cr(s),i=ct(t),c=n==="y",d=o.x+o.width/2-r.width/2,u=o.y+o.height/2-r.height/2,f=o[l]/2-r[l]/2,m;switch(i){case"top":m={x:d,y:o.y-r.height};break;case"bottom":m={x:d,y:o.y+o.height};break;case"right":m={x:o.x+o.width,y:u};break;case"left":m={x:o.x-r.width,y:u};break;default:m={x:o.x,y:o.y}}switch(ra(t)){case"start":m[s]-=f*(a&&c?-1:1);break;case"end":m[s]+=f*(a&&c?-1:1);break}return m}async function nc(e,t){var a;t===void 0&&(t={});let{x:o,y:r,platform:n,rects:s,elements:l,strategy:i}=e,{boundary:c="clippingAncestors",rootBoundary:d="viewport",elementContext:u="floating",altBoundary:f=!1,padding:m=0}=it(t,e),g=Wn(m),v=l[f?u==="floating"?"reference":"floating":u],w=na(await n.getClippingRect({element:(a=await(n.isElement==null?void 0:n.isElement(v)))==null||a?v:v.contextElement||await(n.getDocumentElement==null?void 0:n.getDocumentElement(l.floating)),boundary:c,rootBoundary:d,strategy:i})),L=u==="floating"?{x:o,y:r,width:s.floating.width,height:s.floating.height}:s.reference,I=await(n.getOffsetParent==null?void 0:n.getOffsetParent(l.floating)),y=await(n.isElement==null?void 0:n.isElement(I))?await(n.getScale==null?void 0:n.getScale(I))||{x:1,y:1}:{x:1,y:1},T=na(n.convertOffsetParentRelativeRectToViewportRelativeRect?await n.convertOffsetParentRelativeRectToViewportRelativeRect({elements:l,rect:L,offsetParent:I,strategy:i}):L);return{top:(w.top-T.top+g.top)/y.y,bottom:(T.bottom-w.bottom+g.bottom)/y.y,left:(w.left-T.left+g.left)/y.x,right:(T.right-w.right+g.right)/y.x}}var gx=50,sc=async(e,t,a)=>{let{placement:o="bottom",strategy:r="absolute",middleware:n=[],platform:s}=a,l=s.detectOverflow?s:{...s,detectOverflow:nc},i=await(s.isRTL==null?void 0:s.isRTL(t)),c=await s.getElementRects({reference:e,floating:t,strategy:r}),{x:d,y:u}=ac(c,o,i),f=o,m=0,g={};for(let p=0;p<n.length;p++){let v=n[p];if(!v)continue;let{name:w,fn:L}=v,{x:I,y,data:T,reset:E}=await L({x:d,y:u,initialPlacement:o,placement:f,strategy:r,middlewareData:g,rects:c,platform:l,elements:{reference:e,floating:t}});d=I??d,u=y??u,g[w]={...g[w],...T},E&&m<gx&&(m++,typeof E=="object"&&(E.placement&&(f=E.placement),E.rects&&(c=E.rects===!0?await s.getElementRects({reference:e,floating:t,strategy:r}):E.rects),{x:d,y:u}=ac(c,f,i)),p=-1)}return{x:d,y:u,placement:f,strategy:r,middlewareData:g}},lc=e=>({name:"arrow",options:e,async fn(t){let{x:a,y:o,placement:r,rects:n,platform:s,elements:l,middlewareData:i}=t,{element:c,padding:d=0}=it(e,t)||{};if(c==null)return{};let u=Wn(d),f={x:a,y:o},m=ur(r),g=cr(m),p=await s.getDimensions(c),v=m==="y",w=v?"top":"left",L=v?"bottom":"right",I=v?"clientHeight":"clientWidth",y=n.reference[g]+n.reference[m]-f[m]-n.floating[g],T=f[m]-n.reference[m],E=await(s.getOffsetParent==null?void 0:s.getOffsetParent(c)),k=E?E[I]:0;(!k||!await(s.isElement==null?void 0:s.isElement(E)))&&(k=l.floating[I]||n.floating[g]);let _=y/2-T/2,V=k/2-p[g]/2-1,W=lt(u[w],V),K=lt(u[L],V),F=W,Z=k-p[g]-K,$=k/2-p[g]/2+_,ae=lr(F,$,Z),X=!i.arrow&&ra(r)!=null&&$!==ae&&n.reference[g]/2-($<F?W:K)-p[g]/2<0,Y=X?$<F?$-F:$-Z:0;return{[m]:f[m]+Y,data:{[m]:ae,centerOffset:$-ae-Y,...X&&{alignmentOffset:Y}},reset:X}}});var ic=function(e){return e===void 0&&(e={}),{name:"flip",options:e,async fn(t){var a,o;let{placement:r,middlewareData:n,rects:s,initialPlacement:l,platform:i,elements:c}=t,{mainAxis:d=!0,crossAxis:u=!0,fallbackPlacements:f,fallbackStrategy:m="bestFit",fallbackAxisSideDirection:g="none",flipAlignment:p=!0,...v}=it(e,t);if((a=n.arrow)!=null&&a.alignmentOffset)return{};let w=ct(r),L=Qe(l),I=ct(l)===l,y=await(i.isRTL==null?void 0:i.isRTL(c.floating)),T=f||(I||!p?[fo(l)]:ec(l)),E=g!=="none";!f&&E&&T.push(...tc(l,p,g,y));let k=[l,...T],_=await i.detectOverflow(t,v),V=[],W=((o=n.flip)==null?void 0:o.overflows)||[];if(d&&V.push(_[w]),u){let $=Qi(r,s,y);V.push(_[$[0]],_[$[1]])}if(W=[...W,{placement:r,overflows:V}],!V.every($=>$<=0)){var K,F;let $=(((K=n.flip)==null?void 0:K.index)||0)+1,ae=k[$];if(ae&&(!(u==="alignment"?L!==Qe(ae):!1)||W.every(q=>Qe(q.placement)===L?q.overflows[0]>0:!0)))return{data:{index:$,overflows:W},reset:{placement:ae}};let X=(F=W.filter(Y=>Y.overflows[0]<=0).sort((Y,q)=>Y.overflows[1]-q.overflows[1])[0])==null?void 0:F.placement;if(!X)switch(m){case"bestFit":{var Z;let Y=(Z=W.filter(q=>{if(E){let O=Qe(q.placement);return O===L||O==="y"}return!0}).map(q=>[q.placement,q.overflows.filter(O=>O>0).reduce((O,ee)=>O+ee,0)]).sort((q,O)=>q[1]-O[1])[0])==null?void 0:Z[0];Y&&(X=Y);break}case"initialPlacement":X=l;break}if(r!==X)return{reset:{placement:X}}}return{}}}};function oc(e,t){return{top:e.top-t.height,right:e.right-t.width,bottom:e.bottom-t.height,left:e.left-t.width}}function rc(e){return Zi.some(t=>e[t]>=0)}var cc=function(e){return e===void 0&&(e={}),{name:"hide",options:e,async fn(t){let{rects:a,platform:o}=t,{strategy:r="referenceHidden",...n}=it(e,t);switch(r){case"referenceHidden":{let s=await o.detectOverflow(t,{...n,elementContext:"reference"}),l=oc(s,a.reference);return{data:{referenceHiddenOffsets:l,referenceHidden:rc(l)}}}case"escaped":{let s=await o.detectOverflow(t,{...n,altBoundary:!0}),l=oc(s,a.floating);return{data:{escapedOffsets:l,escaped:rc(l)}}}default:return{}}}}};var uc=new Set(["left","top"]);async function vx(e,t){let{placement:a,platform:o,elements:r}=e,n=await(o.isRTL==null?void 0:o.isRTL(r.floating)),s=ct(a),l=ra(a),i=Qe(a)==="y",c=uc.has(s)?-1:1,d=n&&i?-1:1,u=it(t,e),{mainAxis:f,crossAxis:m,alignmentAxis:g}=typeof u=="number"?{mainAxis:u,crossAxis:0,alignmentAxis:null}:{mainAxis:u.mainAxis||0,crossAxis:u.crossAxis||0,alignmentAxis:u.alignmentAxis};return l&&typeof g=="number"&&(m=l==="end"?g*-1:g),i?{x:m*d,y:f*c}:{x:f*c,y:m*d}}var dc=function(e){return e===void 0&&(e=0),{name:"offset",options:e,async fn(t){var a,o;let{x:r,y:n,placement:s,middlewareData:l}=t,i=await vx(t,e);return s===((a=l.offset)==null?void 0:a.placement)&&(o=l.arrow)!=null&&o.alignmentOffset?{}:{x:r+i.x,y:n+i.y,data:{...i,placement:s}}}}},fc=function(e){return e===void 0&&(e={}),{name:"shift",options:e,async fn(t){let{x:a,y:o,placement:r,platform:n}=t,{mainAxis:s=!0,crossAxis:l=!1,limiter:i={fn:w=>{let{x:L,y:I}=w;return{x:L,y:I}}},...c}=it(e,t),d={x:a,y:o},u=await n.detectOverflow(t,c),f=Qe(ct(r)),m=ir(f),g=d[m],p=d[f];if(s){let w=m==="y"?"top":"left",L=m==="y"?"bottom":"right",I=g+u[w],y=g-u[L];g=lr(I,g,y)}if(l){let w=f==="y"?"top":"left",L=f==="y"?"bottom":"right",I=p+u[w],y=p-u[L];p=lr(I,p,y)}let v=i.fn({...t,[m]:g,[f]:p});return{...v,data:{x:v.x-a,y:v.y-o,enabled:{[m]:s,[f]:l}}}}}},pc=function(e){return e===void 0&&(e={}),{options:e,fn(t){let{x:a,y:o,placement:r,rects:n,middlewareData:s}=t,{offset:l=0,mainAxis:i=!0,crossAxis:c=!0}=it(e,t),d={x:a,y:o},u=Qe(r),f=ir(u),m=d[f],g=d[u],p=it(l,t),v=typeof p=="number"?{mainAxis:p,crossAxis:0}:{mainAxis:0,crossAxis:0,...p};if(i){let I=f==="y"?"height":"width",y=n.reference[f]-n.floating[I]+v.mainAxis,T=n.reference[f]+n.reference[I]-v.mainAxis;m<y?m=y:m>T&&(m=T)}if(c){var w,L;let I=f==="y"?"width":"height",y=uc.has(ct(r)),T=n.reference[u]-n.floating[I]+(y&&((w=s.offset)==null?void 0:w[u])||0)+(y?0:v.crossAxis),E=n.reference[u]+n.reference[I]+(y?0:((L=s.offset)==null?void 0:L[u])||0)-(y?v.crossAxis:0);g<T?g=T:g>E&&(g=E)}return{[f]:m,[u]:g}}}},mc=function(e){return e===void 0&&(e={}),{name:"size",options:e,async fn(t){var a,o;let{placement:r,rects:n,platform:s,elements:l}=t,{apply:i=()=>{},...c}=it(e,t),d=await s.detectOverflow(t,c),u=ct(r),f=ra(r),m=Qe(r)==="y",{width:g,height:p}=n.floating,v,w;u==="top"||u==="bottom"?(v=u,w=f===(await(s.isRTL==null?void 0:s.isRTL(l.floating))?"start":"end")?"left":"right"):(w=u,v=f==="end"?"top":"bottom");let L=p-d.top-d.bottom,I=g-d.left-d.right,y=lt(p-d[v],L),T=lt(g-d[w],I),E=!t.middlewareData.shift,k=y,_=T;if((a=t.middlewareData.shift)!=null&&a.enabled.x&&(_=I),(o=t.middlewareData.shift)!=null&&o.enabled.y&&(k=L),E&&!f){let W=De(d.left,0),K=De(d.right,0),F=De(d.top,0),Z=De(d.bottom,0);m?_=g-2*(W!==0||K!==0?W+K:De(d.left,d.right)):k=p-2*(F!==0||Z!==0?F+Z:De(d.top,d.bottom))}await i({...t,availableWidth:_,availableHeight:k});let V=await s.getDimensions(l.floating);return g!==V.width||p!==V.height?{reset:{rects:!0}}:{}}}};function dr(){return typeof window<"u"}function ia(e){return xc(e)?(e.nodeName||"").toLowerCase():"#document"}function Fe(e){var t;return(e==null||(t=e.ownerDocument)==null?void 0:t.defaultView)||window}function et(e){var t;return(t=(xc(e)?e.ownerDocument:e.document)||window.document)==null?void 0:t.documentElement}function xc(e){return dr()?e instanceof Node||e instanceof Fe(e).Node:!1}function We(e){return dr()?e instanceof Element||e instanceof Fe(e).Element:!1}function ut(e){return dr()?e instanceof HTMLElement||e instanceof Fe(e).HTMLElement:!1}function hc(e){return!dr()||typeof ShadowRoot>"u"?!1:e instanceof ShadowRoot||e instanceof Fe(e).ShadowRoot}function Va(e){let{overflow:t,overflowX:a,overflowY:o,display:r}=Ge(e);return/auto|scroll|overlay|hidden|clip/.test(t+o+a)&&r!=="inline"&&r!=="contents"}function gc(e){return/^(table|td|th)$/.test(ia(e))}function ho(e){try{if(e.matches(":popover-open"))return!0}catch{}try{return e.matches(":modal")}catch{return!1}}var wx=/transform|translate|scale|rotate|perspective|filter/,Cx=/paint|layout|strict|content/,sa=e=>!!e&&e!=="none",Gn;function fr(e){let t=We(e)?Ge(e):e;return sa(t.transform)||sa(t.translate)||sa(t.scale)||sa(t.rotate)||sa(t.perspective)||!pr()&&(sa(t.backdropFilter)||sa(t.filter))||wx.test(t.willChange||"")||Cx.test(t.contain||"")}function vc(e){let t=St(e);for(;ut(t)&&!ca(t);){if(fr(t))return t;if(ho(t))return null;t=St(t)}return null}function pr(){return Gn==null&&(Gn=typeof CSS<"u"&&CSS.supports&&CSS.supports("-webkit-backdrop-filter","none")),Gn}function ca(e){return/^(html|body|#document)$/.test(ia(e))}function Ge(e){return Fe(e).getComputedStyle(e)}function xo(e){return We(e)?{scrollLeft:e.scrollLeft,scrollTop:e.scrollTop}:{scrollLeft:e.scrollX,scrollTop:e.scrollY}}function St(e){if(ia(e)==="html")return e;let t=e.assignedSlot||e.parentNode||hc(e)&&e.host||et(e);return hc(t)?t.host:t}function wc(e){let t=St(e);return ca(t)?e.ownerDocument?e.ownerDocument.body:e.body:ut(t)&&Va(t)?t:wc(t)}function la(e,t,a){var o;t===void 0&&(t=[]),a===void 0&&(a=!0);let r=wc(e),n=r===((o=e.ownerDocument)==null?void 0:o.body),s=Fe(r);if(n){let l=mr(s);return t.concat(s,s.visualViewport||[],Va(r)?r:[],l&&a?la(l):[])}else return t.concat(r,la(r,[],a))}function mr(e){return e.parent&&Object.getPrototypeOf(e.parent)?e.frameElement:null}function Ic(e){let t=Ge(e),a=parseFloat(t.width)||0,o=parseFloat(t.height)||0,r=ut(e),n=r?e.offsetWidth:a,s=r?e.offsetHeight:o,l=po(a)!==n||po(o)!==s;return l&&(a=n,o=s),{width:a,height:o,$:l}}function Kn(e){return We(e)?e:e.contextElement}function za(e){let t=Kn(e);if(!ut(t))return Ze(1);let a=t.getBoundingClientRect(),{width:o,height:r,$:n}=Ic(t),s=(n?po(a.width):a.width)/o,l=(n?po(a.height):a.height)/r;return(!s||!Number.isFinite(s))&&(s=1),(!l||!Number.isFinite(l))&&(l=1),{x:s,y:l}}var bx=Ze(0);function Sc(e){let t=Fe(e);return!pr()||!t.visualViewport?bx:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}function Lx(e,t,a){return t===void 0&&(t=!1),!a||t&&a!==Fe(e)?!1:t}function ua(e,t,a,o){t===void 0&&(t=!1),a===void 0&&(a=!1);let r=e.getBoundingClientRect(),n=Kn(e),s=Ze(1);t&&(o?We(o)&&(s=za(o)):s=za(e));let l=Lx(n,a,o)?Sc(n):Ze(0),i=(r.left+l.x)/s.x,c=(r.top+l.y)/s.y,d=r.width/s.x,u=r.height/s.y;if(n){let f=Fe(n),m=o&&We(o)?Fe(o):o,g=f,p=mr(g);for(;p&&o&&m!==g;){let v=za(p),w=p.getBoundingClientRect(),L=Ge(p),I=w.left+(p.clientLeft+parseFloat(L.paddingLeft))*v.x,y=w.top+(p.clientTop+parseFloat(L.paddingTop))*v.y;i*=v.x,c*=v.y,d*=v.x,u*=v.y,i+=I,c+=y,g=Fe(p),p=mr(g)}}return na({width:d,height:u,x:i,y:c})}function hr(e,t){let a=xo(e).scrollLeft;return t?t.left+a:ua(et(e)).left+a}function yc(e,t){let a=e.getBoundingClientRect(),o=a.left+t.scrollLeft-hr(e,a),r=a.top+t.scrollTop;return{x:o,y:r}}function Ix(e){let{elements:t,rect:a,offsetParent:o,strategy:r}=e,n=r==="fixed",s=et(o),l=t?ho(t.floating):!1;if(o===s||l&&n)return a;let i={scrollLeft:0,scrollTop:0},c=Ze(1),d=Ze(0),u=ut(o);if((u||!u&&!n)&&((ia(o)!=="body"||Va(s))&&(i=xo(o)),u)){let m=ua(o);c=za(o),d.x=m.x+o.clientLeft,d.y=m.y+o.clientTop}let f=s&&!u&&!n?yc(s,i):Ze(0);return{width:a.width*c.x,height:a.height*c.y,x:a.x*c.x-i.scrollLeft*c.x+d.x+f.x,y:a.y*c.y-i.scrollTop*c.y+d.y+f.y}}function Sx(e){return Array.from(e.getClientRects())}function yx(e){let t=et(e),a=xo(e),o=e.ownerDocument.body,r=De(t.scrollWidth,t.clientWidth,o.scrollWidth,o.clientWidth),n=De(t.scrollHeight,t.clientHeight,o.scrollHeight,o.clientHeight),s=-a.scrollLeft+hr(e),l=-a.scrollTop;return Ge(o).direction==="rtl"&&(s+=De(t.clientWidth,o.clientWidth)-r),{width:r,height:n,x:s,y:l}}var Cc=25;function Rx(e,t){let a=Fe(e),o=et(e),r=a.visualViewport,n=o.clientWidth,s=o.clientHeight,l=0,i=0;if(r){n=r.width,s=r.height;let d=pr();(!d||d&&t==="fixed")&&(l=r.offsetLeft,i=r.offsetTop)}let c=hr(o);if(c<=0){let d=o.ownerDocument,u=d.body,f=getComputedStyle(u),m=d.compatMode==="CSS1Compat"&&parseFloat(f.marginLeft)+parseFloat(f.marginRight)||0,g=Math.abs(o.clientWidth-u.clientWidth-m);g<=Cc&&(n-=g)}else c<=Cc&&(n+=c);return{width:n,height:s,x:l,y:i}}function Px(e,t){let a=ua(e,!0,t==="fixed"),o=a.top+e.clientTop,r=a.left+e.clientLeft,n=ut(e)?za(e):Ze(1),s=e.clientWidth*n.x,l=e.clientHeight*n.y,i=r*n.x,c=o*n.y;return{width:s,height:l,x:i,y:c}}function bc(e,t,a){let o;if(t==="viewport")o=Rx(e,a);else if(t==="document")o=yx(et(e));else if(We(t))o=Px(t,a);else{let r=Sc(e);o={x:t.x-r.x,y:t.y-r.y,width:t.width,height:t.height}}return na(o)}function Rc(e,t){let a=St(e);return a===t||!We(a)||ca(a)?!1:Ge(a).position==="fixed"||Rc(a,t)}function Tx(e,t){let a=t.get(e);if(a)return a;let o=la(e,[],!1).filter(l=>We(l)&&ia(l)!=="body"),r=null,n=Ge(e).position==="fixed",s=n?St(e):e;for(;We(s)&&!ca(s);){let l=Ge(s),i=fr(s);!i&&l.position==="fixed"&&(r=null),(n?!i&&!r:!i&&l.position==="static"&&!!r&&(r.position==="absolute"||r.position==="fixed")||Va(s)&&!i&&Rc(e,s))?o=o.filter(d=>d!==s):r=l,s=St(s)}return t.set(e,o),o}function kx(e){let{element:t,boundary:a,rootBoundary:o,strategy:r}=e,s=[...a==="clippingAncestors"?ho(t)?[]:Tx(t,this._c):[].concat(a),o],l=bc(t,s[0],r),i=l.top,c=l.right,d=l.bottom,u=l.left;for(let f=1;f<s.length;f++){let m=bc(t,s[f],r);i=De(m.top,i),c=lt(m.right,c),d=lt(m.bottom,d),u=De(m.left,u)}return{width:c-u,height:d-i,x:u,y:i}}function Mx(e){let{width:t,height:a}=Ic(e);return{width:t,height:a}}function Ax(e,t,a){let o=ut(t),r=et(t),n=a==="fixed",s=ua(e,!0,n,t),l={scrollLeft:0,scrollTop:0},i=Ze(0);function c(){i.x=hr(r)}if(o||!o&&!n)if((ia(t)!=="body"||Va(r))&&(l=xo(t)),o){let m=ua(t,!0,n,t);i.x=m.x+t.clientLeft,i.y=m.y+t.clientTop}else r&&c();n&&!o&&r&&c();let d=r&&!o&&!n?yc(r,l):Ze(0),u=s.left+l.scrollLeft-i.x-d.x,f=s.top+l.scrollTop-i.y-d.y;return{x:u,y:f,width:s.width,height:s.height}}function jn(e){return Ge(e).position==="static"}function Lc(e,t){if(!ut(e)||Ge(e).position==="fixed")return null;if(t)return t(e);let a=e.offsetParent;return et(e)===a&&(a=a.ownerDocument.body),a}function Pc(e,t){let a=Fe(e);if(ho(e))return a;if(!ut(e)){let r=St(e);for(;r&&!ca(r);){if(We(r)&&!jn(r))return r;r=St(r)}return a}let o=Lc(e,t);for(;o&&gc(o)&&jn(o);)o=Lc(o,t);return o&&ca(o)&&jn(o)&&!fr(o)?a:o||vc(e)||a}var Dx=async function(e){let t=this.getOffsetParent||Pc,a=this.getDimensions,o=await a(e.floating);return{reference:Ax(e.reference,await t(e.floating),e.strategy),floating:{x:0,y:0,width:o.width,height:o.height}}};function Ex(e){return Ge(e).direction==="rtl"}var Tc={convertOffsetParentRelativeRectToViewportRelativeRect:Ix,getDocumentElement:et,getClippingRect:kx,getOffsetParent:Pc,getElementRects:Dx,getClientRects:Sx,getDimensions:Mx,getScale:za,isElement:We,isRTL:Ex};function kc(e,t){return e.x===t.x&&e.y===t.y&&e.width===t.width&&e.height===t.height}function Ox(e,t){let a=null,o,r=et(e);function n(){var l;clearTimeout(o),(l=a)==null||l.disconnect(),a=null}function s(l,i){l===void 0&&(l=!1),i===void 0&&(i=1),n();let c=e.getBoundingClientRect(),{left:d,top:u,width:f,height:m}=c;if(l||t(),!f||!m)return;let g=mo(u),p=mo(r.clientWidth-(d+f)),v=mo(r.clientHeight-(u+m)),w=mo(d),I={rootMargin:-g+"px "+-p+"px "+-v+"px "+-w+"px",threshold:De(0,lt(1,i))||1},y=!0;function T(E){let k=E[0].intersectionRatio;if(k!==i){if(!y)return s();k?s(!1,k):o=setTimeout(()=>{s(!1,1e-7)},1e3)}k===1&&!kc(c,e.getBoundingClientRect())&&s(),y=!1}try{a=new IntersectionObserver(T,{...I,root:r.ownerDocument})}catch{a=new IntersectionObserver(T,I)}a.observe(e)}return s(!0),n}function Xn(e,t,a,o){o===void 0&&(o={});let{ancestorScroll:r=!0,ancestorResize:n=!0,elementResize:s=typeof ResizeObserver=="function",layoutShift:l=typeof IntersectionObserver=="function",animationFrame:i=!1}=o,c=Kn(e),d=r||n?[...c?la(c):[],...t?la(t):[]]:[];d.forEach(w=>{r&&w.addEventListener("scroll",a,{passive:!0}),n&&w.addEventListener("resize",a)});let u=c&&l?Ox(c,a):null,f=-1,m=null;s&&(m=new ResizeObserver(w=>{let[L]=w;L&&L.target===c&&m&&t&&(m.unobserve(t),cancelAnimationFrame(f),f=requestAnimationFrame(()=>{var I;(I=m)==null||I.observe(t)})),a()}),c&&!i&&m.observe(c),t&&m.observe(t));let g,p=i?ua(e):null;i&&v();function v(){let w=ua(e);p&&!kc(p,w)&&a(),p=w,g=requestAnimationFrame(v)}return a(),()=>{var w;d.forEach(L=>{r&&L.removeEventListener("scroll",a),n&&L.removeEventListener("resize",a)}),u?.(),(w=m)==null||w.disconnect(),m=null,i&&cancelAnimationFrame(g)}}var Mc=dc;var Ac=fc,Dc=ic,Ec=mc,Oc=cc,$n=lc;var Nc=pc,Yn=(e,t,a)=>{let o=new Map,r={platform:Tc,...a},n={...r.platform,_c:o};return sc(e,t,{...r,platform:n})};var Nx=typeof document<"u",Fx=function(){},xr=Nx?Kt:Fx;function gr(e,t){if(e===t)return!0;if(typeof e!=typeof t)return!1;if(typeof e=="function"&&e.toString()===t.toString())return!0;let a,o,r;if(e&&t&&typeof e=="object"){if(Array.isArray(e)){if(a=e.length,a!==t.length)return!1;for(o=a;o--!==0;)if(!gr(e[o],t[o]))return!1;return!0}if(r=Object.keys(e),a=r.length,a!==Object.keys(t).length)return!1;for(o=a;o--!==0;)if(!{}.hasOwnProperty.call(t,r[o]))return!1;for(o=a;o--!==0;){let n=r[o];if(!(n==="_owner"&&e.$$typeof)&&!gr(e[n],t[n]))return!1}return!0}return e!==e&&t!==t}function Bc(e){return typeof window>"u"?1:(e.ownerDocument.defaultView||window).devicePixelRatio||1}function Fc(e,t){let a=Bc(e);return Math.round(t*a)/a}function Jn(e){let t=R(e);return xr(()=>{t.current=e}),t}function _c(e){e===void 0&&(e={});let{placement:t="bottom",strategy:a="absolute",middleware:o=[],platform:r,elements:{reference:n,floating:s}={},transform:l=!0,whileElementsMounted:i,open:c}=e,[d,u]=M({x:0,y:0,strategy:a,placement:t,middlewareData:{},isPositioned:!1}),[f,m]=M(o);gr(f,o)||m(o);let[g,p]=M(null),[v,w]=M(null),L=H(q=>{q!==E.current&&(E.current=q,p(q))},[]),I=H(q=>{q!==k.current&&(k.current=q,w(q))},[]),y=n||g,T=s||v,E=R(null),k=R(null),_=R(d),V=i!=null,W=Jn(i),K=Jn(r),F=Jn(c),Z=H(()=>{if(!E.current||!k.current)return;let q={placement:t,strategy:a,middleware:f};K.current&&(q.platform=K.current),Yn(E.current,k.current,q).then(O=>{let ee={...O,isPositioned:F.current!==!1};$.current&&!gr(_.current,ee)&&(_.current=ee,Wo(()=>{u(ee)}))})},[f,t,a,K,F]);xr(()=>{c===!1&&_.current.isPositioned&&(_.current.isPositioned=!1,u(q=>({...q,isPositioned:!1})))},[c]);let $=R(!1);xr(()=>($.current=!0,()=>{$.current=!1}),[]),xr(()=>{if(y&&(E.current=y),T&&(k.current=T),y&&T){if(W.current)return W.current(y,T,Z);Z()}},[y,T,Z,W,V]);let ae=he(()=>({reference:E,floating:k,setReference:L,setFloating:I}),[L,I]),X=he(()=>({reference:y,floating:T}),[y,T]),Y=he(()=>{let q={position:a,left:0,top:0};if(!X.floating)return q;let O=Fc(X.floating,d.x),ee=Fc(X.floating,d.y);return l?{...q,transform:"translate("+O+"px, "+ee+"px)",...Bc(X.floating)>=1.5&&{willChange:"transform"}}:{position:a,left:O,top:ee}},[a,l,X.floating,d.x,d.y]);return he(()=>({...d,update:Z,refs:ae,elements:X,floatingStyles:Y}),[d,Z,ae,X,Y])}var Bx=e=>{function t(a){return{}.hasOwnProperty.call(a,"current")}return{name:"arrow",options:e,fn(a){let{element:o,padding:r}=typeof e=="function"?e(a):e;return o&&t(o)?o.current!=null?$n({element:o.current,padding:r}).fn(a):{}:o?$n({element:o,padding:r}).fn(a):{}}}},Hc=(e,t)=>{let a=Mc(e);return{name:a.name,fn:a.fn,options:[e,t]}},Uc=(e,t)=>{let a=Ac(e);return{name:a.name,fn:a.fn,options:[e,t]}},qc=(e,t)=>({fn:Nc(e).fn,options:[e,t]}),Vc=(e,t)=>{let a=Dc(e);return{name:a.name,fn:a.fn,options:[e,t]}},zc=(e,t)=>{let a=Ec(e);return{name:a.name,fn:a.fn,options:[e,t]}};var Wc=(e,t)=>{let a=Oc(e);return{name:a.name,fn:a.fn,options:[e,t]}};var Gc=(e,t)=>{let a=Bx(e);return{name:a.name,fn:a.fn,options:[e,t]}};var _x="Arrow",jc=x((e,t)=>{let{children:a,width:o=10,height:r=5,...n}=e;return h(B.svg,{...n,ref:t,width:o,height:r,viewBox:"0 0 30 10",preserveAspectRatio:"none",children:e.asChild?a:h("polygon",{points:"0,0 30,0 15,10"})})});jc.displayName=_x;var Kc=jc;var Zn="Popper",[Xc,yt]=de(Zn),[Ux,$c]=Xc(Zn),Yc=e=>{let{__scopePopper:t,children:a}=e,[o,r]=M(null),[n,s]=M(void 0);return h(Ux,{scope:t,anchor:o,onAnchorChange:r,placementState:n,setPlacementState:s,children:a})};Yc.displayName=Zn;var Jc="PopperAnchor",Zc=x((e,t)=>{let{__scopePopper:a,virtualRef:o,...r}=e,n=$c(Jc,a),s=R(null),l=n.onAnchorChange,i=H(g=>{s.current=g,g&&l(g)},[l]),c=j(t,i),d=R(null);D(()=>{if(!o)return;let g=d.current;d.current=o.current,g!==d.current&&l(d.current)});let u=n.placementState&&es(n.placementState),f=u?.[0],m=u?.[1];return o?null:h(B.div,{"data-radix-popper-side":f,"data-radix-popper-align":m,...r,ref:c})});Zc.displayName=Jc;var Qn="PopperContent",[qx,Vx]=Xc(Qn),Qc=x((e,t)=>{let{__scopePopper:a,side:o="bottom",sideOffset:r=0,align:n="center",alignOffset:s=0,arrowPadding:l=0,avoidCollisions:i=!0,collisionBoundary:c,collisionPadding:d=0,sticky:u="partial",hideWhenDetached:f=!1,updatePositionStrategy:m="optimized",onPlaced:g,...p}=e,v=$c(Qn,a),[w,L]=M(null),I=j(t,re=>L(re)),[y,T]=M(null),E=Ft(y),k=E?.width??0,_=E?.height??0,V=o+(n!=="center"?"-"+n:""),W=typeof d=="number"?d:{top:0,right:0,bottom:0,left:0,...d},K=c?Array.isArray(c)?c:[c]:void 0,F=K!==void 0&&K.length>0,Z={padding:W,boundary:K?.filter(Wx),altBoundary:F},{refs:$,floatingStyles:ae,placement:X,isPositioned:Y,middlewareData:q}=_c({strategy:"fixed",placement:V,whileElementsMounted:(...re)=>Xn(...re,{animationFrame:m==="always"}),elements:{reference:v.anchor},middleware:[Hc({mainAxis:r+_,alignmentAxis:s}),i&&Uc({mainAxis:!0,crossAxis:!1,limiter:u==="partial"?qc():void 0,...Z}),i&&Vc({...Z}),zc({...Z,apply:({elements:re,rects:Se,availableWidth:le,availableHeight:ue})=>{let{width:ge,height:$e}=Se.reference,Me=re.floating.style;Me.setProperty("--radix-popper-available-width",`${le}px`),Me.setProperty("--radix-popper-available-height",`${ue}px`),Me.setProperty("--radix-popper-anchor-width",`${ge}px`),Me.setProperty("--radix-popper-anchor-height",`${$e}px`)}}),y&&Gc({element:y,padding:l}),Gx({arrowWidth:k,arrowHeight:_}),f&&Wc({strategy:"referenceHidden",...Z})]}),O=v.setPlacementState;fe(()=>(O(X),()=>{O(void 0)}),[X,O]);let[ee,ne]=es(X),we=pe(g);fe(()=>{Y&&we?.()},[Y,we]);let ke=q.arrow?.x,Re=q.arrow?.y,_e=q.arrow?.centerOffset!==0,[Le,G]=M();return fe(()=>{w&&G(window.getComputedStyle(w).zIndex)},[w]),h("div",{ref:$.setFloating,"data-radix-popper-content-wrapper":"",style:{...ae,transform:Y?ae.transform:"translate(0, -200%)",minWidth:"max-content",zIndex:Le,"--radix-popper-transform-origin":[q.transformOrigin?.x,q.transformOrigin?.y].join(" "),...q.hide?.referenceHidden&&{visibility:"hidden",pointerEvents:"none"}},dir:e.dir,children:h(qx,{scope:a,placedSide:ee,placedAlign:ne,onArrowChange:T,arrowX:ke,arrowY:Re,shouldHideArrow:_e,children:h(B.div,{"data-side":ee,"data-align":ne,...p,ref:I,style:{...p.style,animation:Y?void 0:"none"}})})})});Qc.displayName=Qn;var eu="PopperArrow",zx={top:"bottom",right:"left",bottom:"top",left:"right"},tu=x(function(t,a){let{__scopePopper:o,...r}=t,n=Vx(eu,o),s=zx[n.placedSide];return h("span",{ref:n.onArrowChange,style:{position:"absolute",left:n.arrowX,top:n.arrowY,[s]:0,transformOrigin:{top:"",right:"0 0",bottom:"center 0",left:"100% 0"}[n.placedSide],transform:{top:"translateY(100%)",right:"translateY(50%) rotate(90deg) translateX(-50%)",bottom:"rotate(180deg)",left:"translateY(50%) rotate(-90deg) translateX(50%)"}[n.placedSide],visibility:n.shouldHideArrow?"hidden":void 0},children:h(Kc,{...r,ref:a,style:{...r.style,display:"block"}})})});tu.displayName=eu;function Wx(e){return e!==null}var Gx=e=>({name:"transformOrigin",options:e,fn(t){let{placement:a,rects:o,middlewareData:r}=t,s=r.arrow?.centerOffset!==0,l=s?0:e.arrowWidth,i=s?0:e.arrowHeight,[c,d]=es(a),u={start:"0%",center:"50%",end:"100%"}[d],f=(r.arrow?.x??0)+l/2,m=(r.arrow?.y??0)+i/2,g="",p="";return c==="bottom"?(g=s?u:`${f}px`,p=`${-i}px`):c==="top"?(g=s?u:`${f}px`,p=`${o.floating.height+i}px`):c==="right"?(g=`${-i}px`,p=s?u:`${m}px`):c==="left"&&(g=`${o.floating.width+i}px`,p=s?u:`${m}px`),{data:{x:g,y:p}}}});function es(e){let[t,a="center"]=e.split("-");return[t,a]}var da=Yc,Wa=Zc,Ga=Qc,ja=tu;var as="rovingFocusGroup.onEntryFocus",jx={bubbles:!1,cancelable:!0},go="RovingFocusGroup",[os,au,Kx]=Ut(go),[Xx,Ka]=de(go,[Kx]),[$x,Yx]=Xx(go),ou=x((e,t)=>h(os.Provider,{scope:e.__scopeRovingFocusGroup,children:h(os.Slot,{scope:e.__scopeRovingFocusGroup,children:h(Jx,{...e,ref:t})})}));ou.displayName=go;var Jx=x((e,t)=>{let{__scopeRovingFocusGroup:a,orientation:o,loop:r=!1,dir:n,currentTabStopId:s,defaultCurrentTabStopId:l,onCurrentTabStopIdChange:i,onEntryFocus:c,preventScrollOnEntryFocus:d=!1,...u}=e,f=R(null),m=j(t,f),g=ze(n),[p,v]=ye({prop:s,defaultProp:l??null,onChange:i,caller:go}),[w,L]=M(!1),I=pe(c),y=au(a),T=R(!1),[E,k]=M(0);return D(()=>{let _=f.current;if(_)return _.addEventListener(as,I),()=>_.removeEventListener(as,I)},[I]),h($x,{scope:a,orientation:o,dir:g,loop:r,currentTabStopId:p,onItemFocus:H(_=>v(_),[v]),onItemShiftTab:H(()=>L(!0),[]),onFocusableItemAdd:H(()=>k(_=>_+1),[]),onFocusableItemRemove:H(()=>k(_=>_-1),[]),children:h(B.div,{tabIndex:w||E===0?-1:0,"data-orientation":o,...u,ref:m,style:{outline:"none",...e.style},onMouseDown:A(e.onMouseDown,()=>{T.current=!0}),onFocus:A(e.onFocus,_=>{let V=!T.current;if(_.target===_.currentTarget&&V&&!w){let W=new CustomEvent(as,jx);if(_.currentTarget.dispatchEvent(W),!W.defaultPrevented){let K=y().filter(X=>X.focusable),F=K.find(X=>X.active),Z=K.find(X=>X.id===p),ae=[F,Z,...K].filter(Boolean).map(X=>X.ref.current);su(ae,d)}}T.current=!1}),onBlur:A(e.onBlur,()=>L(!1))})})}),ru="RovingFocusGroupItem",nu=x((e,t)=>{let{__scopeRovingFocusGroup:a,focusable:o=!0,active:r=!1,tabStopId:n,children:s,...l}=e,i=Ie(),c=n||i,d=Yx(ru,a),u=d.currentTabStopId===c,f=au(a),{onFocusableItemAdd:m,onFocusableItemRemove:g,currentTabStopId:p}=d;return D(()=>{if(o)return m(),()=>g()},[o,m,g]),h(os.ItemSlot,{scope:a,id:c,focusable:o,active:r,children:h(B.span,{tabIndex:u?0:-1,"data-orientation":d.orientation,...l,ref:t,onMouseDown:A(e.onMouseDown,v=>{o?d.onItemFocus(c):v.preventDefault()}),onFocus:A(e.onFocus,()=>d.onItemFocus(c)),onKeyDown:A(e.onKeyDown,v=>{if(v.key==="Tab"&&v.shiftKey){d.onItemShiftTab();return}if(v.target!==v.currentTarget)return;let w=eg(v,d.orientation,d.dir);if(w!==void 0){if(v.metaKey||v.ctrlKey||v.altKey||v.shiftKey)return;v.preventDefault();let I=f().filter(y=>y.focusable).map(y=>y.ref.current);if(w==="last")I.reverse();else if(w==="prev"||w==="next"){w==="prev"&&I.reverse();let y=I.indexOf(v.currentTarget);I=d.loop?tg(I,y+1):I.slice(y+1)}setTimeout(()=>su(I))}}),children:typeof s=="function"?s({isCurrentTabStop:u,hasTabStop:p!=null}):s})})});nu.displayName=ru;var Zx={ArrowLeft:"prev",ArrowUp:"prev",ArrowRight:"next",ArrowDown:"next",PageUp:"first",Home:"first",PageDown:"last",End:"last"};function Qx(e,t){return t!=="rtl"?e:e==="ArrowLeft"?"ArrowRight":e==="ArrowRight"?"ArrowLeft":e}function eg(e,t,a){let o=Qx(e.key,a);if(!(t==="vertical"&&["ArrowLeft","ArrowRight"].includes(o))&&!(t==="horizontal"&&["ArrowUp","ArrowDown"].includes(o)))return Zx[o]}function su(e,t=!1){let a=document.activeElement;for(let o of e)if(o===a||(o.focus({preventScroll:t}),document.activeElement!==a))return}function tg(e,t){return e.map((a,o)=>e[(t+o)%e.length])}var vr=ou,wr=nu;var rs=["Enter"," "],ag=["ArrowDown","PageUp","Home"],cu=["ArrowUp","PageDown","End"],og=[...ag,...cu],rg={ltr:[...rs,"ArrowRight"],rtl:[...rs,"ArrowLeft"]},ng={ltr:["ArrowLeft"],rtl:["ArrowRight"]},bo="Menu",[wo,sg,lg]=Ut(bo),[fa,ns]=de(bo,[lg,yt,Ka]),Lo=yt(),uu=Ka(),[du,qt]=fa(bo),[ig,Io]=fa(bo),fu=e=>{let{__scopeMenu:t,open:a=!1,children:o,dir:r,onOpenChange:n,modal:s=!0}=e,l=Lo(t),[i,c]=M(null),d=R(!1),u=pe(n),f=ze(r);return D(()=>{let m=()=>{d.current=!0,document.addEventListener("pointerdown",g,{capture:!0,once:!0}),document.addEventListener("pointermove",g,{capture:!0,once:!0})},g=()=>d.current=!1;return document.addEventListener("keydown",m,{capture:!0}),()=>{document.removeEventListener("keydown",m,{capture:!0}),document.removeEventListener("pointerdown",g,{capture:!0}),document.removeEventListener("pointermove",g,{capture:!0})}},[]),h(da,{...l,children:h(du,{scope:t,open:a,onOpenChange:u,content:i,onContentChange:c,children:h(ig,{scope:t,onClose:H(()=>u(!1),[u]),isUsingKeyboardRef:d,dir:f,modal:s,children:o})})})};fu.displayName=bo;var cg="MenuAnchor",ss=x((e,t)=>{let{__scopeMenu:a,...o}=e,r=Lo(a);return h(Wa,{...r,...o,ref:t})});ss.displayName=cg;var ls="MenuPortal",[ug,pu]=fa(ls,{forceMount:void 0}),mu=e=>{let{__scopeMenu:t,forceMount:a,children:o,container:r}=e,n=qt(ls,t);return h(ug,{scope:t,forceMount:a,children:h(xe,{present:a||n.open,children:h(It,{asChild:!0,container:r,children:o})})})};mu.displayName=ls;var je="MenuContent",[dg,is]=fa(je),hu=x((e,t)=>{let a=pu(je,e.__scopeMenu),{forceMount:o=a.forceMount,...r}=e,n=qt(je,e.__scopeMenu),s=Io(je,e.__scopeMenu);return h(wo.Provider,{scope:e.__scopeMenu,children:h(xe,{present:o||n.open,children:h(wo.Slot,{scope:e.__scopeMenu,children:s.modal?h(fg,{...r,ref:t}):h(pg,{...r,ref:t})})})})}),fg=x((e,t)=>{let a=qt(je,e.__scopeMenu),o=R(null),r=j(t,o);return D(()=>{let n=o.current;if(n)return Ba(n)},[]),h(cs,{...e,ref:r,trapFocus:a.open,disableOutsidePointerEvents:a.open,disableOutsideScroll:!0,onFocusOutside:A(e.onFocusOutside,n=>n.preventDefault(),{checkForDefaultPrevented:!1}),onDismiss:()=>a.onOpenChange(!1)})}),pg=x((e,t)=>{let a=qt(je,e.__scopeMenu);return h(cs,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,disableOutsideScroll:!1,onDismiss:()=>a.onOpenChange(!1)})}),mg=Ve("MenuContent.ScrollLock"),cs=x((e,t)=>{let{__scopeMenu:a,loop:o=!1,trapFocus:r,onOpenAutoFocus:n,onCloseAutoFocus:s,disableOutsidePointerEvents:l,onEntryFocus:i,onEscapeKeyDown:c,onPointerDownOutside:d,onFocusOutside:u,onInteractOutside:f,onDismiss:m,disableOutsideScroll:g,...p}=e,v=qt(je,a),w=Io(je,a),L=Lo(a),I=uu(a),y=sg(a),[T,E]=M(null),k=R(null),_=j(t,k,v.onContentChange),V=R(0),W=R(""),K=R(0),F=R(null),Z=R("right"),$=R(0),ae=g?aa:Ye,X=g?{as:mg,allowPinchZoom:!0}:void 0,Y=O=>{let ee=W.current+O,ne=y().filter(G=>!G.disabled),we=document.activeElement,ke=ne.find(G=>G.ref.current===we)?.textValue,Re=ne.map(G=>G.textValue),_e=Pg(Re,ee,ke),Le=ne.find(G=>G.textValue===_e)?.ref.current;(function G(re){W.current=re,window.clearTimeout(V.current),re!==""&&(V.current=window.setTimeout(()=>G(""),1e3))})(ee),Le&&setTimeout(()=>Le.focus())};D(()=>()=>window.clearTimeout(V.current),[]),Ea();let q=H(O=>Z.current===F.current?.side&&kg(O,F.current?.area),[]);return h(dg,{scope:a,searchRef:W,onItemEnter:H(O=>{q(O)&&O.preventDefault()},[q]),onItemLeave:H(O=>{q(O)||(k.current?.focus(),E(null))},[q]),onTriggerLeave:H(O=>{q(O)&&O.preventDefault()},[q]),pointerGraceTimerRef:K,onPointerGraceIntentChange:H(O=>{F.current=O},[]),children:h(ae,{...X,children:h(Zt,{asChild:!0,trapped:r,onMountAutoFocus:A(n,O=>{O.preventDefault(),k.current?.focus({preventScroll:!0})}),onUnmountAutoFocus:s,children:h(Lt,{asChild:!0,disableOutsidePointerEvents:l,onEscapeKeyDown:c,onPointerDownOutside:d,onFocusOutside:u,onInteractOutside:f,onDismiss:m,children:h(vr,{asChild:!0,...I,dir:w.dir,orientation:"vertical",loop:o,currentTabStopId:T,onCurrentTabStopIdChange:E,onEntryFocus:A(i,O=>{w.isUsingKeyboardRef.current||O.preventDefault()}),preventScrollOnEntryFocus:!0,children:h(Ga,{role:"menu","aria-orientation":"vertical","data-state":Au(v.open),"data-radix-menu-content":"",dir:w.dir,...L,...p,ref:_,style:{outline:"none",...p.style},onKeyDown:A(p.onKeyDown,O=>{let ne=O.target.closest("[data-radix-menu-content]")===O.currentTarget,we=O.ctrlKey||O.altKey||O.metaKey,ke=O.key.length===1;ne&&(O.key==="Tab"&&O.preventDefault(),!we&&ke&&Y(O.key));let Re=k.current;if(O.target!==Re||!og.includes(O.key))return;O.preventDefault();let Le=y().filter(G=>!G.disabled).map(G=>G.ref.current);cu.includes(O.key)&&Le.reverse(),yg(Le)}),onBlur:A(e.onBlur,O=>{O.currentTarget.contains(O.target)||(window.clearTimeout(V.current),W.current="")}),onPointerMove:A(e.onPointerMove,Co(O=>{let ee=O.target,ne=$.current!==O.clientX;if(O.currentTarget.contains(ee)&&ne){let we=O.clientX>$.current?"right":"left";Z.current=we,$.current=O.clientX}}))})})})})})})});hu.displayName=je;var hg="MenuGroup",us=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(B.div,{role:"group",...o,ref:t})});us.displayName=hg;var xg="MenuLabel",xu=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(B.div,{...o,ref:t})});xu.displayName=xg;var Cr="MenuItem",iu="menu.itemSelect",Lr=x((e,t)=>{let{disabled:a=!1,onSelect:o,...r}=e,n=R(null),s=Io(Cr,e.__scopeMenu),l=is(Cr,e.__scopeMenu),i=j(t,n),c=R(!1),d=()=>{let u=n.current;if(!a&&u){let f=new CustomEvent(iu,{bubbles:!0,cancelable:!0});u.addEventListener(iu,m=>o?.(m),{once:!0}),jo(u,f),f.defaultPrevented?c.current=!1:s.onClose()}};return h(gu,{...r,ref:i,disabled:a,onClick:A(e.onClick,d),onPointerDown:u=>{e.onPointerDown?.(u),c.current=!0},onPointerUp:A(e.onPointerUp,u=>{c.current||u.currentTarget?.click()}),onKeyDown:A(e.onKeyDown,u=>{let f=l.searchRef.current!=="";a||f&&u.key===" "||rs.includes(u.key)&&(u.currentTarget.click(),u.preventDefault())})})});Lr.displayName=Cr;var gu=x((e,t)=>{let{__scopeMenu:a,disabled:o=!1,textValue:r,...n}=e,s=is(Cr,a),l=uu(a),i=R(null),c=j(t,i),[d,u]=M(!1),[f,m]=M("");return D(()=>{let g=i.current;g&&m((g.textContent??"").trim())},[n.children]),h(wo.ItemSlot,{scope:a,disabled:o,textValue:r??f,children:h(wr,{asChild:!0,...l,focusable:!o,children:h(B.div,{role:"menuitem","data-highlighted":d?"":void 0,"aria-disabled":o||void 0,"data-disabled":o?"":void 0,...n,ref:c,onPointerMove:A(e.onPointerMove,Co(g=>{o?s.onItemLeave(g):(s.onItemEnter(g),g.defaultPrevented||g.currentTarget.focus({preventScroll:!0}))})),onPointerLeave:A(e.onPointerLeave,Co(g=>s.onItemLeave(g))),onFocus:A(e.onFocus,()=>u(!0)),onBlur:A(e.onBlur,()=>u(!1))})})})}),gg="MenuCheckboxItem",vu=x((e,t)=>{let{checked:a=!1,onCheckedChange:o,...r}=e;return h(Iu,{scope:e.__scopeMenu,checked:a,children:h(Lr,{role:"menuitemcheckbox","aria-checked":br(a)?"mixed":a,...r,ref:t,"data-state":ps(a),onSelect:A(r.onSelect,()=>o?.(br(a)?!0:!a),{checkForDefaultPrevented:!1})})})});vu.displayName=gg;var wu="MenuRadioGroup",[vg,wg]=fa(wu,{value:void 0,onValueChange:()=>{}}),Cu=x((e,t)=>{let{value:a,onValueChange:o,...r}=e,n=pe(o);return h(vg,{scope:e.__scopeMenu,value:a,onValueChange:n,children:h(us,{...r,ref:t})})});Cu.displayName=wu;var bu="MenuRadioItem",Lu=x((e,t)=>{let{value:a,...o}=e,r=wg(bu,e.__scopeMenu),n=a===r.value;return h(Iu,{scope:e.__scopeMenu,checked:n,children:h(Lr,{role:"menuitemradio","aria-checked":n,...o,ref:t,"data-state":ps(n),onSelect:A(o.onSelect,()=>r.onValueChange?.(a),{checkForDefaultPrevented:!1})})})});Lu.displayName=bu;var ds="MenuItemIndicator",[Iu,Cg]=fa(ds,{checked:!1}),Su=x((e,t)=>{let{__scopeMenu:a,forceMount:o,...r}=e,n=Cg(ds,a);return h(xe,{present:o||br(n.checked)||n.checked===!0,children:h(B.span,{...r,ref:t,"data-state":ps(n.checked)})})});Su.displayName=ds;var bg="MenuSeparator",yu=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(B.div,{role:"separator","aria-orientation":"horizontal",...o,ref:t})});yu.displayName=bg;var Lg="MenuArrow",Ru=x((e,t)=>{let{__scopeMenu:a,...o}=e,r=Lo(a);return h(ja,{...r,...o,ref:t})});Ru.displayName=Lg;var fs="MenuSub",[Ig,Pu]=fa(fs),Sg=e=>{let{__scopeMenu:t,children:a,open:o=!1,onOpenChange:r}=e,n=qt(fs,t),s=Lo(t),[l,i]=M(null),[c,d]=M(null),u=pe(r);return D(()=>(n.open===!1&&u(!1),()=>u(!1)),[n.open,u]),h(da,{...s,children:h(du,{scope:t,open:o,onOpenChange:u,content:c,onContentChange:d,children:h(Ig,{scope:t,contentId:Ie(),triggerId:Ie(),trigger:l,onTriggerChange:i,children:a})})})};Sg.displayName=fs;var vo="MenuSubTrigger",Tu=x((e,t)=>{let a=qt(vo,e.__scopeMenu),o=Io(vo,e.__scopeMenu),r=Pu(vo,e.__scopeMenu),n=is(vo,e.__scopeMenu),s=R(null),{pointerGraceTimerRef:l,onPointerGraceIntentChange:i}=n,c={__scopeMenu:e.__scopeMenu},d=H(()=>{s.current&&window.clearTimeout(s.current),s.current=null},[]);return D(()=>d,[d]),D(()=>{let u=l.current;return()=>{window.clearTimeout(u),i(null)}},[l,i]),h(ss,{asChild:!0,...c,children:h(gu,{id:r.triggerId,"aria-haspopup":"menu","aria-expanded":a.open,"aria-controls":a.open?r.contentId:void 0,"data-state":Au(a.open),...e,ref:so(t,r.onTriggerChange),onClick:u=>{e.onClick?.(u),!(e.disabled||u.defaultPrevented)&&(u.currentTarget.focus(),a.open||a.onOpenChange(!0))},onPointerMove:A(e.onPointerMove,Co(u=>{n.onItemEnter(u),!u.defaultPrevented&&!e.disabled&&!a.open&&!s.current&&(n.onPointerGraceIntentChange(null),s.current=window.setTimeout(()=>{a.onOpenChange(!0),d()},100))})),onPointerLeave:A(e.onPointerLeave,Co(u=>{d();let f=a.content?.getBoundingClientRect();if(f){let m=a.content?.dataset.side,g=m==="right",p=g?-5:5,v=f[g?"left":"right"],w=f[g?"right":"left"];n.onPointerGraceIntentChange({area:[{x:u.clientX+p,y:u.clientY},{x:v,y:f.top},{x:w,y:f.top},{x:w,y:f.bottom},{x:v,y:f.bottom}],side:m}),window.clearTimeout(l.current),l.current=window.setTimeout(()=>n.onPointerGraceIntentChange(null),300)}else{if(n.onTriggerLeave(u),u.defaultPrevented)return;n.onPointerGraceIntentChange(null)}})),onKeyDown:A(e.onKeyDown,u=>{let f=n.searchRef.current!=="";e.disabled||f&&u.key===" "||rg[o.dir].includes(u.key)&&(a.onOpenChange(!0),a.content?.focus(),u.preventDefault())})})})});Tu.displayName=vo;var ku="MenuSubContent",Mu=x((e,t)=>{let a=pu(je,e.__scopeMenu),{forceMount:o=a.forceMount,align:r="start",...n}=e,s=qt(je,e.__scopeMenu),l=Io(je,e.__scopeMenu),i=Pu(ku,e.__scopeMenu),c=R(null),d=j(t,c);return h(wo.Provider,{scope:e.__scopeMenu,children:h(xe,{present:o||s.open,children:h(wo.Slot,{scope:e.__scopeMenu,children:h(cs,{id:i.contentId,"aria-labelledby":i.triggerId,...n,ref:d,align:r,side:l.dir==="rtl"?"left":"right",disableOutsidePointerEvents:!1,disableOutsideScroll:!1,trapFocus:!1,onOpenAutoFocus:u=>{l.isUsingKeyboardRef.current&&c.current?.focus(),u.preventDefault()},onCloseAutoFocus:u=>u.preventDefault(),onFocusOutside:A(e.onFocusOutside,u=>{u.target!==i.trigger&&s.onOpenChange(!1)}),onEscapeKeyDown:A(e.onEscapeKeyDown,u=>{l.onClose(),u.preventDefault()}),onKeyDown:A(e.onKeyDown,u=>{let f=u.currentTarget.contains(u.target),m=ng[l.dir].includes(u.key);f&&m&&(s.onOpenChange(!1),i.trigger?.focus(),u.preventDefault())})})})})})});Mu.displayName=ku;function Au(e){return e?"open":"closed"}function br(e){return e==="indeterminate"}function ps(e){return br(e)?"indeterminate":e?"checked":"unchecked"}function yg(e){let t=document.activeElement;for(let a of e)if(a===t||(a.focus(),document.activeElement!==t))return}function Rg(e,t){return e.map((a,o)=>e[(t+o)%e.length])}function Pg(e,t,a){let r=t.length>1&&Array.from(t).every(c=>c===t[0])?t[0]:t,n=a?e.indexOf(a):-1,s=Rg(e,Math.max(n,0));r.length===1&&(s=s.filter(c=>c!==a));let i=s.find(c=>c.toLowerCase().startsWith(r.toLowerCase()));return i!==a?i:void 0}function Tg(e,t){let{x:a,y:o}=e,r=!1;for(let n=0,s=t.length-1;n<t.length;s=n++){let l=t[n],i=t[s],c=l.x,d=l.y,u=i.x,f=i.y;d>o!=f>o&&a<(u-c)*(o-d)/(f-d)+c&&(r=!r)}return r}function kg(e,t){if(!t)return!1;let a={x:e.clientX,y:e.clientY};return Tg(a,t)}function Co(e){return t=>t.pointerType==="mouse"?e(t):void 0}var Du=fu,Eu=ss,Ou=mu,Nu=hu,Fu=us,Bu=xu,_u=Lr,Hu=vu,Uu=Cu,qu=Lu,Vu=Su,zu=yu,Wu=Ru;var Gu=Tu,ju=Mu;var Ir="DropdownMenu",[Ag,hR]=de(Ir,[ns]),Ee=ns(),[Dg,Ku]=Ag(Ir),Eg=e=>{let{__scopeDropdownMenu:t,children:a,dir:o,open:r,defaultOpen:n,onOpenChange:s,modal:l=!0}=e,i=Ee(t),c=R(null),[d,u]=ye({prop:r,defaultProp:n??!1,onChange:s,caller:Ir});return h(Dg,{scope:t,triggerId:Ie(),triggerRef:c,contentId:Ie(),open:d,onOpenChange:u,onOpenToggle:H(()=>u(f=>!f),[u]),modal:l,children:h(Du,{...i,open:d,onOpenChange:u,dir:o,modal:l,children:a})})};Eg.displayName=Ir;var Xu="DropdownMenuTrigger",Og=x((e,t)=>{let{__scopeDropdownMenu:a,disabled:o=!1,...r}=e,n=Ku(Xu,a),s=Ee(a);return h(Eu,{asChild:!0,...s,children:h(B.button,{type:"button",id:n.triggerId,"aria-haspopup":"menu","aria-expanded":n.open,"aria-controls":n.open?n.contentId:void 0,"data-state":n.open?"open":"closed","data-disabled":o?"":void 0,disabled:o,...r,ref:so(t,n.triggerRef),onPointerDown:A(e.onPointerDown,l=>{!o&&l.button===0&&l.ctrlKey===!1&&(n.onOpenToggle(),n.open||l.preventDefault())}),onKeyDown:A(e.onKeyDown,l=>{o||(["Enter"," "].includes(l.key)&&n.onOpenToggle(),l.key==="ArrowDown"&&n.onOpenChange(!0),["Enter"," ","ArrowDown"].includes(l.key)&&l.preventDefault())})})})});Og.displayName=Xu;var Ng="DropdownMenuPortal",$u=e=>{let{__scopeDropdownMenu:t,...a}=e,o=Ee(t);return h(Ou,{...o,...a})};$u.displayName=Ng;var Yu="DropdownMenuContent",Ju=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ku(Yu,a),n=Ee(a),s=R(!1);return h(Nu,{id:r.contentId,"aria-labelledby":r.triggerId,...n,...o,ref:t,onCloseAutoFocus:A(e.onCloseAutoFocus,l=>{s.current||r.triggerRef.current?.focus(),s.current=!1,l.preventDefault()}),onInteractOutside:A(e.onInteractOutside,l=>{let i=l.detail.originalEvent,c=i.button===0&&i.ctrlKey===!0,d=i.button===2||c;(!r.modal||d)&&(s.current=!0)}),style:{...e.style,"--radix-dropdown-menu-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-dropdown-menu-content-available-width":"var(--radix-popper-available-width)","--radix-dropdown-menu-content-available-height":"var(--radix-popper-available-height)","--radix-dropdown-menu-trigger-width":"var(--radix-popper-anchor-width)","--radix-dropdown-menu-trigger-height":"var(--radix-popper-anchor-height)"}})});Ju.displayName=Yu;var Fg="DropdownMenuGroup",Bg=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Fu,{...r,...o,ref:t})});Bg.displayName=Fg;var _g="DropdownMenuLabel",Zu=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Bu,{...r,...o,ref:t})});Zu.displayName=_g;var Hg="DropdownMenuItem",Qu=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(_u,{...r,...o,ref:t})});Qu.displayName=Hg;var Ug="DropdownMenuCheckboxItem",ed=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Hu,{...r,...o,ref:t})});ed.displayName=Ug;var qg="DropdownMenuRadioGroup",Vg=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Uu,{...r,...o,ref:t})});Vg.displayName=qg;var zg="DropdownMenuRadioItem",td=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(qu,{...r,...o,ref:t})});td.displayName=zg;var Wg="DropdownMenuItemIndicator",ad=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Vu,{...r,...o,ref:t})});ad.displayName=Wg;var Gg="DropdownMenuSeparator",od=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(zu,{...r,...o,ref:t})});od.displayName=Gg;var jg="DropdownMenuArrow",Kg=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Wu,{...r,...o,ref:t})});Kg.displayName=jg;var Xg="DropdownMenuSubTrigger",rd=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Gu,{...r,...o,ref:t})});rd.displayName=Xg;var $g="DropdownMenuSubContent",nd=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(ju,{...r,...o,ref:t,style:{...e.style,"--radix-dropdown-menu-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-dropdown-menu-content-available-width":"var(--radix-popper-available-width)","--radix-dropdown-menu-content-available-height":"var(--radix-popper-available-height)","--radix-dropdown-menu-trigger-width":"var(--radix-popper-anchor-width)","--radix-dropdown-menu-trigger-height":"var(--radix-popper-anchor-height)"}})});nd.displayName=$g;var sd=$u,ms=Ju;var hs=Zu,xs=Qu,gs=ed;var vs=td,ws=ad,Cs=od;var bs=rd,Ls=nd;var Jg=x(({className:e,inset:t,children:a,...o},r)=>S(bs,{ref:r,className:N("xps-dropdown-menu-sub-trigger",t&&"xps-dropdown-menu-item--inset",e),...o},a,S(Sa,{className:"xps-icon"})));Jg.displayName=bs.displayName;var Zg=x(({className:e,...t},a)=>S(Ls,{ref:a,className:N("xps-dropdown-menu-content",e),...t}));Zg.displayName=Ls.displayName;var Qg=x(({className:e,sideOffset:t=4,...a},o)=>S(sd,null,S(ms,{ref:o,sideOffset:t,className:N("xps-dropdown-menu-content",e),...a})));Qg.displayName=ms.displayName;var ev=x(({className:e,inset:t,...a},o)=>S(xs,{ref:o,className:N("xps-dropdown-menu-item",t&&"xps-dropdown-menu-item--inset",e),...a}));ev.displayName=xs.displayName;var tv=x(({className:e,children:t,checked:a,...o},r)=>S(gs,{ref:r,className:N("xps-dropdown-menu-item xps-dropdown-menu-check-item",e),checked:a,...o},S("span",{className:"xps-dropdown-menu-item-indicator"},S(ws,null,S(qe,{className:"xps-icon"}))),t));tv.displayName=gs.displayName;var av=x(({className:e,children:t,...a},o)=>S(vs,{ref:o,className:N("xps-dropdown-menu-item xps-dropdown-menu-check-item",e),...a},S("span",{className:"xps-dropdown-menu-item-indicator"},S(ws,null,S(no,{className:"xps-icon xps-icon--filled"}))),t));av.displayName=vs.displayName;var ov=x(({className:e,inset:t,...a},o)=>S(hs,{ref:o,className:N("xps-dropdown-menu-label",t&&"xps-dropdown-menu-item--inset",e),...a}));ov.displayName=hs.displayName;var rv=x(({className:e,...t},a)=>S(Cs,{ref:a,className:N("xps-dropdown-menu-separator",e),...t}));rv.displayName=Cs.displayName;var nv=x(({className:e,...t},a)=>S("span",{ref:a,className:N("xps-dropdown-menu-shortcut",e),...t}));nv.displayName="DropdownMenuShortcut";var dt=x(({className:e,type:t,...a},o)=>S("input",{ref:o,type:t,className:N("xps-input",e),...a}));dt.displayName="Input";function Vt(e,[t,a]){return Math.min(a,Math.max(t,e))}function sv(e,t){return La((a,o)=>t[a][o]??a,e)}var Is="ScrollArea",[id,BR]=de(Is),[lv,Ke]=id(Is),cd=x((e,t)=>{let{__scopeScrollArea:a,type:o="hover",dir:r,scrollHideDelay:n=600,...s}=e,[l,i]=M(null),[c,d]=M(null),[u,f]=M(null),[m,g]=M(null),[p,v]=M(null),[w,L]=M(0),[I,y]=M(0),[T,E]=M(!1),[k,_]=M(!1),V=j(t,K=>i(K)),W=ze(r);return h(lv,{scope:a,type:o,dir:W,scrollHideDelay:n,scrollArea:l,viewport:c,onViewportChange:d,content:u,onContentChange:f,scrollbarX:m,onScrollbarXChange:g,scrollbarXEnabled:T,onScrollbarXEnabledChange:E,scrollbarY:p,onScrollbarYChange:v,scrollbarYEnabled:k,onScrollbarYEnabledChange:_,onCornerWidthChange:L,onCornerHeightChange:y,children:h(B.div,{dir:W,...s,ref:V,style:{position:"relative","--radix-scroll-area-corner-width":w+"px","--radix-scroll-area-corner-height":I+"px",...e.style}})})});cd.displayName=Is;var ud="ScrollAreaViewport",dd=x((e,t)=>{let{__scopeScrollArea:a,children:o,nonce:r,...n}=e,s=Ke(ud,a),l=R(null),i=j(t,l,s.onViewportChange);return Pe(Ae,{children:[h("style",{dangerouslySetInnerHTML:{__html:"[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}"},nonce:r}),h(B.div,{"data-radix-scroll-area-viewport":"",...n,ref:i,style:{overflowX:s.scrollbarXEnabled?"scroll":"hidden",overflowY:s.scrollbarYEnabled?"scroll":"hidden",...e.style},children:h("div",{ref:s.onContentChange,style:{minWidth:"100%",display:"table"},children:o})})]})});dd.displayName=ud;var ft="ScrollAreaScrollbar",Rr=x((e,t)=>{let{forceMount:a,...o}=e,r=Ke(ft,e.__scopeScrollArea),{onScrollbarXEnabledChange:n,onScrollbarYEnabledChange:s}=r,l=e.orientation==="horizontal";return D(()=>(l?n(!0):s(!0),()=>{l?n(!1):s(!1)}),[l,n,s]),r.type==="hover"?h(iv,{...o,ref:t,forceMount:a}):r.type==="scroll"?h(cv,{...o,ref:t,forceMount:a}):r.type==="auto"?h(fd,{...o,ref:t,forceMount:a}):r.type==="always"?h(Ss,{...o,ref:t,"data-state":"visible"}):null});Rr.displayName=ft;var iv=x((e,t)=>{let{forceMount:a,...o}=e,r=Ke(ft,e.__scopeScrollArea),[n,s]=M(!1);return D(()=>{let l=r.scrollArea,i=0;if(l){let c=()=>{window.clearTimeout(i),s(!0)},d=()=>{i=window.setTimeout(()=>s(!1),r.scrollHideDelay)};return l.addEventListener("pointerenter",c),l.addEventListener("pointerleave",d),()=>{window.clearTimeout(i),l.removeEventListener("pointerenter",c),l.removeEventListener("pointerleave",d)}}},[r.scrollArea,r.scrollHideDelay]),h(xe,{present:a||n,children:h(fd,{"data-state":n?"visible":"hidden",...o,ref:t})})}),cv=x((e,t)=>{let{forceMount:a,...o}=e,r=Ke(ft,e.__scopeScrollArea),n=e.orientation==="horizontal",s=Tr(()=>i("SCROLL_END"),100),[l,i]=sv("hidden",{hidden:{SCROLL:"scrolling"},scrolling:{SCROLL_END:"idle",POINTER_ENTER:"interacting"},interacting:{SCROLL:"interacting",POINTER_LEAVE:"idle"},idle:{HIDE:"hidden",SCROLL:"scrolling",POINTER_ENTER:"interacting"}});return D(()=>{if(l==="idle"){let c=window.setTimeout(()=>i("HIDE"),r.scrollHideDelay);return()=>window.clearTimeout(c)}},[l,r.scrollHideDelay,i]),D(()=>{let c=r.viewport,d=n?"scrollLeft":"scrollTop";if(c){let u=c[d],f=()=>{let m=c[d];u!==m&&(i("SCROLL"),s()),u=m};return c.addEventListener("scroll",f),()=>c.removeEventListener("scroll",f)}},[r.viewport,n,i,s]),h(xe,{present:a||l!=="hidden",children:h(Ss,{"data-state":l==="hidden"?"hidden":"visible",...o,ref:t,onPointerEnter:A(e.onPointerEnter,()=>i("POINTER_ENTER")),onPointerLeave:A(e.onPointerLeave,()=>i("POINTER_LEAVE"))})})}),fd=x((e,t)=>{let a=Ke(ft,e.__scopeScrollArea),{forceMount:o,...r}=e,[n,s]=M(!1),l=e.orientation==="horizontal",i=Tr(()=>{if(a.viewport){let c=a.viewport.offsetWidth<a.viewport.scrollWidth,d=a.viewport.offsetHeight<a.viewport.scrollHeight;s(l?c:d)}},10);return Xa(a.viewport,i),Xa(a.content,i),h(xe,{present:o||n,children:h(Ss,{"data-state":n?"visible":"hidden",...r,ref:t})})}),Ss=x((e,t)=>{let{orientation:a="vertical",...o}=e,r=Ke(ft,e.__scopeScrollArea),n=R(null),s=R(0),[l,i]=M({content:0,viewport:0,scrollbar:{size:0,paddingStart:0,paddingEnd:0}}),c=xd(l.viewport,l.content),d={...o,sizes:l,onSizesChange:i,hasThumb:c>0&&c<1,onThumbChange:f=>n.current=f,onThumbPointerUp:()=>s.current=0,onThumbPointerDown:f=>s.current=f};function u(f,m){return hv(f,s.current,l,m)}return a==="horizontal"?h(uv,{...d,ref:t,onThumbPositionChange:()=>{if(r.viewport&&n.current){let f=r.viewport.scrollLeft,m=ld(f,l,r.dir);n.current.style.transform=`translate3d(${m}px, 0, 0)`}},onWheelScroll:f=>{r.viewport&&(r.viewport.scrollLeft=f)},onDragScroll:f=>{r.viewport&&(r.viewport.scrollLeft=u(f,r.dir))}}):a==="vertical"?h(dv,{...d,ref:t,onThumbPositionChange:()=>{if(r.viewport&&n.current){let f=r.viewport.scrollTop,m=ld(f,l);n.current.style.transform=`translate3d(0, ${m}px, 0)`}},onWheelScroll:f=>{r.viewport&&(r.viewport.scrollTop=f)},onDragScroll:f=>{r.viewport&&(r.viewport.scrollTop=u(f))}}):null}),uv=x((e,t)=>{let{sizes:a,onSizesChange:o,...r}=e,n=Ke(ft,e.__scopeScrollArea),[s,l]=M(),i=R(null),c=j(t,i,n.onScrollbarXChange);return D(()=>{i.current&&l(getComputedStyle(i.current))},[i]),h(md,{"data-orientation":"horizontal",...r,ref:c,sizes:a,style:{bottom:0,left:n.dir==="rtl"?"var(--radix-scroll-area-corner-width)":0,right:n.dir==="ltr"?"var(--radix-scroll-area-corner-width)":0,"--radix-scroll-area-thumb-width":Pr(a)+"px",...e.style},onThumbPointerDown:d=>e.onThumbPointerDown(d.x),onDragScroll:d=>e.onDragScroll(d.x),onWheelScroll:(d,u)=>{if(n.viewport){let f=n.viewport.scrollLeft+d.deltaX;e.onWheelScroll(f),vd(f,u)&&d.preventDefault()}},onResize:()=>{i.current&&n.viewport&&s&&o({content:n.viewport.scrollWidth,viewport:n.viewport.offsetWidth,scrollbar:{size:i.current.clientWidth,paddingStart:yr(s.paddingLeft),paddingEnd:yr(s.paddingRight)}})}})}),dv=x((e,t)=>{let{sizes:a,onSizesChange:o,...r}=e,n=Ke(ft,e.__scopeScrollArea),[s,l]=M(),i=R(null),c=j(t,i,n.onScrollbarYChange);return D(()=>{i.current&&l(getComputedStyle(i.current))},[i]),h(md,{"data-orientation":"vertical",...r,ref:c,sizes:a,style:{top:0,right:n.dir==="ltr"?0:void 0,left:n.dir==="rtl"?0:void 0,bottom:"var(--radix-scroll-area-corner-height)","--radix-scroll-area-thumb-height":Pr(a)+"px",...e.style},onThumbPointerDown:d=>e.onThumbPointerDown(d.y),onDragScroll:d=>e.onDragScroll(d.y),onWheelScroll:(d,u)=>{if(n.viewport){let f=n.viewport.scrollTop+d.deltaY;e.onWheelScroll(f),vd(f,u)&&d.preventDefault()}},onResize:()=>{i.current&&n.viewport&&s&&o({content:n.viewport.scrollHeight,viewport:n.viewport.offsetHeight,scrollbar:{size:i.current.clientHeight,paddingStart:yr(s.paddingTop),paddingEnd:yr(s.paddingBottom)}})}})}),[fv,pd]=id(ft),md=x((e,t)=>{let{__scopeScrollArea:a,sizes:o,hasThumb:r,onThumbChange:n,onThumbPointerUp:s,onThumbPointerDown:l,onThumbPositionChange:i,onDragScroll:c,onWheelScroll:d,onResize:u,...f}=e,m=Ke(ft,a),[g,p]=M(null),v=j(t,V=>p(V)),w=R(null),L=R(""),I=m.viewport,y=o.content-o.viewport,T=pe(d),E=pe(i),k=Tr(u,10);function _(V){if(w.current){let W=V.clientX-w.current.left,K=V.clientY-w.current.top;c({x:W,y:K})}}return D(()=>{let V=W=>{let K=W.target;g?.contains(K)&&T(W,y)};return document.addEventListener("wheel",V,{passive:!1}),()=>document.removeEventListener("wheel",V,{passive:!1})},[I,g,y,T]),D(E,[o,E]),Xa(g,k),Xa(m.content,k),h(fv,{scope:a,scrollbar:g,hasThumb:r,onThumbChange:pe(n),onThumbPointerUp:pe(s),onThumbPositionChange:E,onThumbPointerDown:pe(l),children:h(B.div,{...f,ref:v,style:{position:"absolute",...f.style},onPointerDown:A(e.onPointerDown,V=>{V.button===0&&(V.target.setPointerCapture(V.pointerId),w.current=g.getBoundingClientRect(),L.current=document.body.style.webkitUserSelect,document.body.style.webkitUserSelect="none",m.viewport&&(m.viewport.style.scrollBehavior="auto"),_(V))}),onPointerMove:A(e.onPointerMove,_),onPointerUp:A(e.onPointerUp,V=>{let W=V.target;W.hasPointerCapture(V.pointerId)&&W.releasePointerCapture(V.pointerId),document.body.style.webkitUserSelect=L.current,m.viewport&&(m.viewport.style.scrollBehavior=""),w.current=null})})})}),Sr="ScrollAreaThumb",ys=x((e,t)=>{let{forceMount:a,...o}=e,r=pd(Sr,e.__scopeScrollArea);return h(xe,{present:a||r.hasThumb,children:h(pv,{ref:t,...o})})}),pv=x((e,t)=>{let{__scopeScrollArea:a,style:o,...r}=e,n=Ke(Sr,a),s=pd(Sr,a),{onThumbPositionChange:l}=s,i=j(t,u=>s.onThumbChange(u)),c=R(void 0),d=Tr(()=>{c.current&&(c.current(),c.current=void 0)},100);return D(()=>{let u=n.viewport;if(u){let f=()=>{if(d(),!c.current){let m=xv(u,l);c.current=m,l()}};return l(),u.addEventListener("scroll",f),()=>u.removeEventListener("scroll",f)}},[n.viewport,d,l]),h(B.div,{"data-state":s.hasThumb?"visible":"hidden",...r,ref:i,style:{width:"var(--radix-scroll-area-thumb-width)",height:"var(--radix-scroll-area-thumb-height)",...o},onPointerDownCapture:A(e.onPointerDownCapture,u=>{let m=u.target.getBoundingClientRect(),g=u.clientX-m.left,p=u.clientY-m.top;s.onThumbPointerDown({x:g,y:p})}),onPointerUp:A(e.onPointerUp,s.onThumbPointerUp)})});ys.displayName=Sr;var Rs="ScrollAreaCorner",hd=x((e,t)=>{let a=Ke(Rs,e.__scopeScrollArea),o=!!(a.scrollbarX&&a.scrollbarY);return a.type!=="scroll"&&o?h(mv,{...e,ref:t}):null});hd.displayName=Rs;var mv=x((e,t)=>{let{__scopeScrollArea:a,...o}=e,r=Ke(Rs,a),[n,s]=M(0),[l,i]=M(0),c=!!(n&&l);return Xa(r.scrollbarX,()=>{let d=r.scrollbarX?.offsetHeight||0;r.onCornerHeightChange(d),i(d)}),Xa(r.scrollbarY,()=>{let d=r.scrollbarY?.offsetWidth||0;r.onCornerWidthChange(d),s(d)}),c?h(B.div,{...o,ref:t,style:{width:n,height:l,position:"absolute",right:r.dir==="ltr"?0:void 0,left:r.dir==="rtl"?0:void 0,bottom:0,...e.style}}):null});function yr(e){return e?parseInt(e,10):0}function xd(e,t){let a=e/t;return isNaN(a)?0:a}function Pr(e){let t=xd(e.viewport,e.content),a=e.scrollbar.paddingStart+e.scrollbar.paddingEnd,o=(e.scrollbar.size-a)*t;return Math.max(o,18)}function hv(e,t,a,o="ltr"){let r=Pr(a),n=r/2,s=t||n,l=r-s,i=a.scrollbar.paddingStart+s,c=a.scrollbar.size-a.scrollbar.paddingEnd-l,d=a.content-a.viewport,u=o==="ltr"?[0,d]:[d*-1,0];return gd([i,c],u)(e)}function ld(e,t,a="ltr"){let o=Pr(t),r=t.scrollbar.paddingStart+t.scrollbar.paddingEnd,n=t.scrollbar.size-r,s=t.content-t.viewport,l=n-o,i=a==="ltr"?[0,s]:[s*-1,0],c=Vt(e,i);return gd([0,s],[0,l])(c)}function gd(e,t){return a=>{if(e[0]===e[1]||t[0]===t[1])return t[0];let o=(t[1]-t[0])/(e[1]-e[0]);return t[0]+o*(a-e[0])}}function vd(e,t){return e>0&&e<t}var xv=(e,t=()=>{})=>{let a={left:e.scrollLeft,top:e.scrollTop},o=0;return(function r(){let n={left:e.scrollLeft,top:e.scrollTop},s=a.left!==n.left,l=a.top!==n.top;(s||l)&&t(),a=n,o=window.requestAnimationFrame(r)})(),()=>window.cancelAnimationFrame(o)};function Tr(e,t){let a=pe(e),o=R(0);return D(()=>()=>window.clearTimeout(o.current),[]),H(()=>{window.clearTimeout(o.current),o.current=window.setTimeout(a,t)},[a,t])}function Xa(e,t){let a=pe(t);fe(()=>{let o=0;if(e){let r=new ResizeObserver(()=>{cancelAnimationFrame(o),o=window.requestAnimationFrame(a)});return r.observe(e),()=>{window.cancelAnimationFrame(o),r.unobserve(e)}}},[e,a])}var Ps=cd,wd=dd;var Cd=hd;var kr=x(({className:e,children:t,...a},o)=>S(Ps,{ref:o,className:N("xps-scroll-area",e),...a},S(wd,{className:"xps-scroll-area-viewport"},t),S(bd,null),S(Cd,null)));kr.displayName=Ps.displayName;var bd=x(({className:e,orientation:t="vertical",...a},o)=>S(Rr,{ref:o,orientation:t,className:N("xps-scroll-bar",t==="vertical"?"xps-scroll-bar-vertical":"xps-scroll-bar-horizontal",e),...a},S(ys,{className:"xps-scroll-thumb"})));bd.displayName=Rr.displayName;var Ts=Object.freeze({position:"absolute",border:0,width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0, 0, 0, 0)",whiteSpace:"nowrap",wordWrap:"normal"}),vv="VisuallyHidden",Ld=x((e,t)=>h(B.span,{...e,ref:t,style:{...Ts,...e.style}}));Ld.displayName=vv;var Id=Ld;var Cv=[" ","Enter","ArrowUp","ArrowDown"],bv=[" ","Enter"],pa="Select",[Ar,Dr,Lv]=Ut(pa),[ma,dP]=de(pa,[Lv,yt]),Er=yt(),[Iv,Wt]=ma(pa),[Sv,yv]=ma(pa),Rv="SelectProvider";function Sd(e){let{__scopeSelect:t,children:a,open:o,defaultOpen:r,onOpenChange:n,value:s,defaultValue:l,onValueChange:i,dir:c,name:d,autoComplete:u,disabled:f,required:m,form:g,internal_do_not_use_render:p}=e,v=Er(t),[w,L]=M(null),[I,y]=M(null),[T,E]=M(!1),k=ze(c),[_,V]=ye({prop:o,defaultProp:r??!1,onChange:n,caller:pa}),[W,K]=ye({prop:s,defaultProp:l,onChange:i,caller:pa}),F=R(null),Z=w?!!g||!!w.closest("form"):!0,[$,ae]=M(new Set),X=Ie(),Y=Array.from($).map(ne=>ne.props.value).join(";"),q=H(ne=>{ae(we=>new Set(we).add(ne))},[]),O=H(ne=>{ae(we=>{let ke=new Set(we);return ke.delete(ne),ke})},[]),ee={required:m,trigger:w,onTriggerChange:L,valueNode:I,onValueNodeChange:y,valueNodeHasChildren:T,onValueNodeHasChildrenChange:E,contentId:X,value:W,onValueChange:K,open:_,onOpenChange:V,dir:k,triggerPointerDownPosRef:F,disabled:f,name:d,autoComplete:u,form:g,nativeOptions:$,nativeSelectKey:Y,isFormControl:Z};return h(da,{...v,children:h(Iv,{scope:t,...ee,children:h(Ar.Provider,{scope:t,children:h(Sv,{scope:t,onNativeOptionAdd:q,onNativeOptionRemove:O,children:Uv(p)?p(ee):a})})})})}Sd.displayName=Rv;var Es=e=>{let{__scopeSelect:t,children:a,...o}=e;return h(Sd,{__scopeSelect:t,...o,internal_do_not_use_render:({isFormControl:r})=>Pe(Ae,{children:[a,r?h(Ud,{__scopeSelect:t}):null]})})};Es.displayName=pa;var yd="SelectTrigger",Or=x((e,t)=>{let{__scopeSelect:a,disabled:o=!1,...r}=e,n=Er(a),s=Wt(yd,a),l=s.disabled||o,i=j(t,s.onTriggerChange),c=Dr(a),d=R("touch"),[u,f,m]=qd(p=>{let v=c().filter(I=>!I.disabled),w=v.find(I=>I.value===s.value),L=Vd(v,p,w);L!==void 0&&s.onValueChange(L.value)}),g=p=>{l||(s.onOpenChange(!0),m()),p&&(s.triggerPointerDownPosRef.current={x:Math.round(p.pageX),y:Math.round(p.pageY)})};return h(Wa,{asChild:!0,...n,children:h(B.button,{type:"button",role:"combobox","aria-controls":s.open?s.contentId:void 0,"aria-expanded":s.open,"aria-required":s.required,"aria-autocomplete":"none",dir:s.dir,"data-state":s.open?"open":"closed",disabled:l,"data-disabled":l?"":void 0,"data-placeholder":qs(s.value)?"":void 0,...r,ref:i,onClick:A(r.onClick,p=>{p.currentTarget.focus(),d.current!=="mouse"&&g(p)}),onPointerDown:A(r.onPointerDown,p=>{d.current=p.pointerType;let v=p.target;v.hasPointerCapture(p.pointerId)&&v.releasePointerCapture(p.pointerId),p.button===0&&p.ctrlKey===!1&&p.pointerType==="mouse"&&(g(p),p.preventDefault())}),onKeyDown:A(r.onKeyDown,p=>{let v=u.current!=="";!(p.ctrlKey||p.altKey||p.metaKey)&&p.key.length===1&&f(p.key),!(v&&p.key===" ")&&Cv.includes(p.key)&&(g(),p.preventDefault())})})})});Or.displayName=yd;var Rd="SelectValue",Os=x((e,t)=>{let{__scopeSelect:a,className:o,style:r,children:n,placeholder:s="",...l}=e,i=Wt(Rd,a),{onValueNodeHasChildrenChange:c}=i,d=n!==void 0,u=j(t,i.onValueNodeChange);fe(()=>{c(d)},[c,d]);let f=qs(i.value);return h(B.span,{...l,asChild:f?!1:l.asChild,ref:u,style:{pointerEvents:"none"},children:h(Ye,{children:f?s:n},f?"placeholder":"value")})});Os.displayName=Rd;var Pv="SelectIcon",Ns=x((e,t)=>{let{__scopeSelect:a,children:o,...r}=e;return h(B.span,{"aria-hidden":!0,...r,ref:t,children:o||"\u25BC"})});Ns.displayName=Pv;var Pd="SelectPortal",[Tv,kv]=ma(Pd,{forceMount:void 0}),Fs=e=>{let{__scopeSelect:t,forceMount:a,...o}=e;return h(Tv,{scope:e.__scopeSelect,forceMount:a,children:h(It,{asChild:!0,...o})})};Fs.displayName=Pd;var zt="SelectContent",Nr=x((e,t)=>{let a=kv(zt,e.__scopeSelect),{forceMount:o=a.forceMount,...r}=e,n=Wt(zt,e.__scopeSelect),[s,l]=M();return fe(()=>{l(new DocumentFragment)},[]),h(xe,{present:o||n.open,children:({present:i})=>i?h(Md,{...r,ref:t}):h(Td,{...r,fragment:s})})});Nr.displayName=zt;var Td=x((e,t)=>{let{__scopeSelect:a,children:o,fragment:r}=e;return r?lo(h(kd,{scope:a,children:h(Ar.Slot,{scope:a,children:h("div",{ref:t,children:o})})}),r):null});Td.displayName="SelectContentFragment";var tt=10,[kd,Gt]=ma(zt),Mv="SelectContentImpl",Av=Ve("SelectContent.RemoveScroll"),Md=x((e,t)=>{let{__scopeSelect:a}=e,{position:o="item-aligned",onCloseAutoFocus:r,onEscapeKeyDown:n,onPointerDownOutside:s,side:l,sideOffset:i,align:c,alignOffset:d,arrowPadding:u,collisionBoundary:f,collisionPadding:m,sticky:g,hideWhenDetached:p,avoidCollisions:v,...w}=e,L=Wt(zt,a),[I,y]=M(null),[T,E]=M(null),k=j(t,G=>y(G)),[_,V]=M(null),[W,K]=M(null),F=Dr(a),[Z,$]=M(!1),ae=R(!1);D(()=>{if(I)return Ba(I)},[I]),Ea();let X=H(G=>{let[re,...Se]=F().map(ge=>ge.ref.current),[le]=Se.slice(-1),ue=document.activeElement;for(let ge of G)if(ge===ue||(ge?.scrollIntoView({block:"nearest"}),ge===re&&T&&(T.scrollTop=0),ge===le&&T&&(T.scrollTop=T.scrollHeight),ge?.focus(),document.activeElement!==ue))return},[F,T]),Y=H(()=>X([_,I]),[X,_,I]);D(()=>{Z&&Y()},[Z,Y]);let{onOpenChange:q,triggerPointerDownPosRef:O}=L;D(()=>{if(I){let G={x:0,y:0},re=le=>{G={x:Math.abs(Math.round(le.pageX)-(O.current?.x??0)),y:Math.abs(Math.round(le.pageY)-(O.current?.y??0))}},Se=le=>{G.x<=10&&G.y<=10?le.preventDefault():le.composedPath().includes(I)||q(!1),document.removeEventListener("pointermove",re),O.current=null};return O.current!==null&&(document.addEventListener("pointermove",re),document.addEventListener("pointerup",Se,{capture:!0,once:!0})),()=>{document.removeEventListener("pointermove",re),document.removeEventListener("pointerup",Se,{capture:!0})}}},[I,q,O]),D(()=>{let G=()=>q(!1);return window.addEventListener("blur",G),window.addEventListener("resize",G),()=>{window.removeEventListener("blur",G),window.removeEventListener("resize",G)}},[q]);let[ee,ne]=qd(G=>{let re=F().filter(ue=>!ue.disabled),Se=re.find(ue=>ue.ref.current===document.activeElement),le=Vd(re,G,Se);le&&setTimeout(()=>le.ref.current.focus())}),we=H((G,re,Se)=>{let le=!ae.current&&!Se;(L.value!==void 0&&L.value===re||le)&&(V(G),le&&(ae.current=!0))},[L.value]),ke=H(()=>I?.focus(),[I]),Re=H((G,re,Se)=>{let le=!ae.current&&!Se;(L.value!==void 0&&L.value===re||le)&&K(G)},[L.value]),_e=o==="popper"?ks:Ad,Le=_e===ks?{side:l,sideOffset:i,align:c,alignOffset:d,arrowPadding:u,collisionBoundary:f,collisionPadding:m,sticky:g,hideWhenDetached:p,avoidCollisions:v}:{};return h(kd,{scope:a,content:I,viewport:T,onViewportChange:E,itemRefCallback:we,selectedItem:_,onItemLeave:ke,itemTextRefCallback:Re,focusSelectedItem:Y,selectedItemText:W,position:o,isPositioned:Z,searchRef:ee,children:h(aa,{as:Av,allowPinchZoom:!0,children:h(Zt,{asChild:!0,trapped:L.open,onMountAutoFocus:G=>{G.preventDefault()},onUnmountAutoFocus:A(r,G=>{L.trigger?.focus({preventScroll:!0}),G.preventDefault()}),children:h(Lt,{asChild:!0,disableOutsidePointerEvents:!0,onEscapeKeyDown:n,onPointerDownOutside:s,onFocusOutside:G=>G.preventDefault(),onDismiss:()=>L.onOpenChange(!1),children:h(_e,{role:"listbox",id:L.contentId,"data-state":L.open?"open":"closed",dir:L.dir,onContextMenu:G=>G.preventDefault(),...w,...Le,onPlaced:()=>$(!0),ref:k,style:{display:"flex",flexDirection:"column",outline:"none",...w.style},onKeyDown:A(w.onKeyDown,G=>{let re=G.ctrlKey||G.altKey||G.metaKey;if(G.key==="Tab"&&G.preventDefault(),!re&&G.key.length===1&&ne(G.key),["ArrowUp","ArrowDown","Home","End"].includes(G.key)){let le=F().filter(ue=>!ue.disabled).map(ue=>ue.ref.current);if(["ArrowUp","End"].includes(G.key)&&(le=le.slice().reverse()),["ArrowUp","ArrowDown"].includes(G.key)){let ue=G.target,ge=le.indexOf(ue);le=le.slice(ge+1)}setTimeout(()=>X(le)),G.preventDefault()}})})})})})})});Md.displayName=Mv;var Dv="SelectItemAlignedPosition",Ad=x((e,t)=>{let{__scopeSelect:a,onPlaced:o,...r}=e,n=Wt(zt,a),s=Gt(zt,a),[l,i]=M(null),[c,d]=M(null),u=j(t,k=>d(k)),f=Dr(a),m=R(!1),g=R(!0),{viewport:p,selectedItem:v,selectedItemText:w,focusSelectedItem:L}=s,I=H(()=>{if(n.trigger&&n.valueNode&&l&&c&&p&&v&&w){let k=n.trigger.getBoundingClientRect(),_=c.getBoundingClientRect(),V=n.valueNode.getBoundingClientRect(),W=w.getBoundingClientRect();if(n.dir!=="rtl"){let ue=W.left-_.left,ge=V.left-ue,$e=k.left-ge,Me=k.width+$e,Za=Math.max(Me,_.width),He=window.innerWidth-tt,Qa=Vt(ge,[tt,Math.max(tt,He-Za)]);l.style.minWidth=Me+"px",l.style.left=Qa+"px"}else{let ue=_.right-W.right,ge=window.innerWidth-V.right-ue,$e=window.innerWidth-k.right-ge,Me=k.width+$e,Za=Math.max(Me,_.width),He=window.innerWidth-tt,Qa=Vt(ge,[tt,Math.max(tt,He-Za)]);l.style.minWidth=Me+"px",l.style.right=Qa+"px"}let K=f(),F=window.innerHeight-tt*2,Z=p.scrollHeight,$=window.getComputedStyle(c),ae=parseInt($.borderTopWidth,10),X=parseInt($.paddingTop,10),Y=parseInt($.borderBottomWidth,10),q=parseInt($.paddingBottom,10),O=ae+X+Z+q+Y,ee=Math.min(v.offsetHeight*5,O),ne=window.getComputedStyle(p),we=parseInt(ne.paddingTop,10),ke=parseInt(ne.paddingBottom,10),Re=k.top+k.height/2-tt,_e=F-Re,Le=v.offsetHeight/2,G=v.offsetTop+Le,re=ae+X+G,Se=O-re;if(re<=Re){let ue=K.length>0&&v===K[K.length-1].ref.current;l.style.bottom="0px";let ge=c.clientHeight-p.offsetTop-p.offsetHeight,$e=Math.max(_e,Le+(ue?ke:0)+ge+Y),Me=re+$e;l.style.height=Me+"px"}else{let ue=K.length>0&&v===K[0].ref.current;l.style.top="0px";let $e=Math.max(Re,ae+p.offsetTop+(ue?we:0)+Le)+Se;l.style.height=$e+"px",p.scrollTop=re-Re+p.offsetTop}l.style.margin=`${tt}px 0`,l.style.minHeight=ee+"px",l.style.maxHeight=F+"px",o?.(),requestAnimationFrame(()=>m.current=!0)}},[f,n.trigger,n.valueNode,l,c,p,v,w,n.dir,o]);fe(()=>I(),[I]);let[y,T]=M();fe(()=>{c&&T(window.getComputedStyle(c).zIndex)},[c]);let E=H(k=>{k&&g.current===!0&&(I(),L?.(),g.current=!1)},[I,L]);return h(Ov,{scope:a,contentWrapper:l,shouldExpandOnScrollRef:m,onScrollButtonChange:E,children:h("div",{ref:i,style:{display:"flex",flexDirection:"column",position:"fixed",zIndex:y},children:h(B.div,{...r,ref:u,style:{boxSizing:"border-box",maxHeight:"100%",...r.style}})})})});Ad.displayName=Dv;var Ev="SelectPopperPosition",ks=x((e,t)=>{let{__scopeSelect:a,align:o="start",collisionPadding:r=tt,...n}=e,s=Er(a);return h(Ga,{...s,...n,ref:t,align:o,collisionPadding:r,style:{boxSizing:"border-box",...n.style,"--radix-select-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-select-content-available-width":"var(--radix-popper-available-width)","--radix-select-content-available-height":"var(--radix-popper-available-height)","--radix-select-trigger-width":"var(--radix-popper-anchor-width)","--radix-select-trigger-height":"var(--radix-popper-anchor-height)"}})});ks.displayName=Ev;var[Ov,Bs]=ma(zt,{}),Ms="SelectViewport",_s=x((e,t)=>{let{__scopeSelect:a,nonce:o,...r}=e,n=Gt(Ms,a),s=Bs(Ms,a),l=j(t,n.onViewportChange),i=R(0);return Pe(Ae,{children:[h("style",{dangerouslySetInnerHTML:{__html:"[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}"},nonce:o}),h(Ar.Slot,{scope:a,children:h(B.div,{"data-radix-select-viewport":"",role:"presentation",...r,ref:l,style:{position:"relative",flex:1,overflow:"hidden auto",...r.style},onScroll:A(r.onScroll,c=>{let d=c.currentTarget,{contentWrapper:u,shouldExpandOnScrollRef:f}=s;if(f?.current&&u){let m=Math.abs(i.current-d.scrollTop);if(m>0){let g=window.innerHeight-tt*2,p=parseFloat(u.style.minHeight),v=parseFloat(u.style.height),w=Math.max(p,v);if(w<g){let L=w+m,I=Math.min(g,L),y=L-I;u.style.height=I+"px",u.style.bottom==="0px"&&(d.scrollTop=y>0?y:0,u.style.justifyContent="flex-end")}}}i.current=d.scrollTop})})})]})});_s.displayName=Ms;var Dd="SelectGroup",[Nv,Fv]=ma(Dd),Ed=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=Ie();return h(Nv,{scope:a,id:r,children:h(B.div,{role:"group","aria-labelledby":r,...o,ref:t})})});Ed.displayName=Dd;var Od="SelectLabel",Fr=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=Fv(Od,a);return h(B.div,{id:r.id,...o,ref:t})});Fr.displayName=Od;var Mr="SelectItem",[Bv,Nd]=ma(Mr),Br=x((e,t)=>{let{__scopeSelect:a,value:o,disabled:r=!1,textValue:n,...s}=e,l=Wt(Mr,a),i=Gt(Mr,a),c=l.value===o,[d,u]=M(n??""),[f,m]=M(!1),g=j(t,L=>i.itemRefCallback?.(L,o,r)),p=Ie(),v=R("touch"),w=()=>{r||(l.onValueChange(o),l.onOpenChange(!1))};if(o==="")throw new Error("A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.");return h(Bv,{scope:a,value:o,disabled:r,textId:p,isSelected:c,onItemTextChange:H(L=>{u(I=>I||(L?.textContent??"").trim())},[]),children:h(Ar.ItemSlot,{scope:a,value:o,disabled:r,textValue:d,children:h(B.div,{role:"option","aria-labelledby":p,"data-highlighted":f?"":void 0,"aria-selected":c&&f,"data-state":c?"checked":"unchecked","aria-disabled":r||void 0,"data-disabled":r?"":void 0,tabIndex:r?void 0:-1,...s,ref:g,onFocus:A(s.onFocus,()=>m(!0)),onBlur:A(s.onBlur,()=>m(!1)),onClick:A(s.onClick,()=>{v.current!=="mouse"&&w()}),onPointerUp:A(s.onPointerUp,()=>{v.current==="mouse"&&w()}),onPointerDown:A(s.onPointerDown,L=>{v.current=L.pointerType}),onPointerMove:A(s.onPointerMove,L=>{v.current=L.pointerType,r?i.onItemLeave?.():v.current==="mouse"&&L.currentTarget.focus({preventScroll:!0})}),onPointerLeave:A(s.onPointerLeave,L=>{L.currentTarget===document.activeElement&&i.onItemLeave?.()}),onKeyDown:A(s.onKeyDown,L=>{i.searchRef?.current!==""&&L.key===" "||(bv.includes(L.key)&&w(),L.key===" "&&L.preventDefault())})})})})});Br.displayName=Mr;var So="SelectItemText",Hs=x((e,t)=>{let{__scopeSelect:a,className:o,style:r,...n}=e,s=Wt(So,a),l=Gt(So,a),i=Nd(So,a),c=yv(So,a),[d,u]=M(null),f=j(t,w=>u(w),i.onItemTextChange,w=>l.itemTextRefCallback?.(w,i.value,i.disabled)),m=d?.textContent,g=he(()=>h("option",{value:i.value,disabled:i.disabled,children:m},i.value),[i.disabled,i.value,m]),{onNativeOptionAdd:p,onNativeOptionRemove:v}=c;return fe(()=>(p(g),()=>v(g)),[p,v,g]),Pe(Ae,{children:[h(B.span,{id:i.textId,...n,ref:f}),i.isSelected&&s.valueNode&&!s.valueNodeHasChildren?lo(n.children,s.valueNode):null]})});Hs.displayName=So;var Fd="SelectItemIndicator",Us=x((e,t)=>{let{__scopeSelect:a,...o}=e;return Nd(Fd,a).isSelected?h(B.span,{"aria-hidden":!0,...o,ref:t}):null});Us.displayName=Fd;var As="SelectScrollUpButton",_r=x((e,t)=>{let a=Gt(As,e.__scopeSelect),o=Bs(As,e.__scopeSelect),[r,n]=M(!1),s=j(t,o.onScrollButtonChange);return fe(()=>{if(a.viewport&&a.isPositioned){let i=function(){let d=c.scrollTop>0;n(d)};var l=i;let c=a.viewport;return i(),c.addEventListener("scroll",i),()=>c.removeEventListener("scroll",i)}},[a.viewport,a.isPositioned]),r?h(Bd,{...e,ref:s,onAutoScroll:()=>{let{viewport:l,selectedItem:i}=a;l&&i&&(l.scrollTop=l.scrollTop-i.offsetHeight)}}):null});_r.displayName=As;var Ds="SelectScrollDownButton",Hr=x((e,t)=>{let a=Gt(Ds,e.__scopeSelect),o=Bs(Ds,e.__scopeSelect),[r,n]=M(!1),s=j(t,o.onScrollButtonChange);return fe(()=>{if(a.viewport&&a.isPositioned){let i=function(){let d=c.scrollHeight-c.clientHeight,u=Math.ceil(c.scrollTop)<d;n(u)};var l=i;let c=a.viewport;return i(),c.addEventListener("scroll",i),()=>c.removeEventListener("scroll",i)}},[a.viewport,a.isPositioned]),r?h(Bd,{...e,ref:s,onAutoScroll:()=>{let{viewport:l,selectedItem:i}=a;l&&i&&(l.scrollTop=l.scrollTop+i.offsetHeight)}}):null});Hr.displayName=Ds;var Bd=x((e,t)=>{let{__scopeSelect:a,onAutoScroll:o,...r}=e,n=Gt("SelectScrollButton",a),s=R(null),l=Dr(a),i=H(()=>{s.current!==null&&(window.clearInterval(s.current),s.current=null)},[]);return D(()=>()=>i(),[i]),fe(()=>{l().find(d=>d.ref.current===document.activeElement)?.ref.current?.scrollIntoView({block:"nearest"})},[l]),h(B.div,{"aria-hidden":!0,...r,ref:t,style:{flexShrink:0,...r.style},onPointerDown:A(r.onPointerDown,()=>{s.current===null&&(s.current=window.setInterval(o,50))}),onPointerMove:A(r.onPointerMove,()=>{n.onItemLeave?.(),s.current===null&&(s.current=window.setInterval(o,50))}),onPointerLeave:A(r.onPointerLeave,()=>{i()})})}),_v="SelectSeparator",Ur=x((e,t)=>{let{__scopeSelect:a,...o}=e;return h(B.div,{"aria-hidden":!0,...o,ref:t})});Ur.displayName=_v;var _d="SelectArrow",Hv=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=Er(a);return Gt(_d,a).position==="popper"?h(ja,{...r,...o,ref:t}):null});Hv.displayName=_d;var Hd="SelectBubbleInput",Ud=x(({__scopeSelect:e,...t},a)=>{let o=Wt(Hd,e),{value:r,onValueChange:n,required:s,disabled:l,name:i,autoComplete:c,form:d}=o,{nativeOptions:u,nativeSelectKey:f}=o,m=R(null),g=j(a,m),p=r??"",v=Nt(p);return D(()=>{let w=m.current;if(!w)return;let L=window.HTMLSelectElement.prototype,y=Object.getOwnPropertyDescriptor(L,"value").set;if(v!==p&&y){let T=new Event("change",{bubbles:!0});y.call(w,p),w.dispatchEvent(T)}},[v,p]),Pe(B.select,{"aria-hidden":!0,required:s,tabIndex:-1,name:i,autoComplete:c,disabled:l,form:d,onChange:w=>n(w.target.value),...t,style:{...Ts,...t.style},ref:g,defaultValue:p,children:[qs(r)?h("option",{value:""}):null,Array.from(u)]},f)});Ud.displayName=Hd;function Uv(e){return typeof e=="function"}function qs(e){return e===""||e===void 0}function qd(e){let t=pe(e),a=R(""),o=R(0),r=H(s=>{let l=a.current+s;t(l),(function i(c){a.current=c,window.clearTimeout(o.current),c!==""&&(o.current=window.setTimeout(()=>i(""),1e3))})(l)},[t]),n=H(()=>{a.current="",window.clearTimeout(o.current)},[]);return D(()=>()=>window.clearTimeout(o.current),[]),[a,r,n]}function Vd(e,t,a){let r=t.length>1&&Array.from(t).every(c=>c===t[0])?t[0]:t,n=a?e.indexOf(a):-1,s=qv(e,Math.max(n,0));r.length===1&&(s=s.filter(c=>c!==a));let i=s.find(c=>c.textValue.toLowerCase().startsWith(r.toLowerCase()));return i!==a?i:void 0}function qv(e,t){return e.map((a,o)=>e[(t+o)%e.length])}var qr=Es;var Vr=Os,yo=x(({className:e,children:t,...a},o)=>S(Or,{ref:o,className:N("xps-select-trigger",e),...a},t,S(Ns,{asChild:!0},S(Xt,{className:"xps-icon"}))));yo.displayName=Or.displayName;var zd=x(({className:e,...t},a)=>S(_r,{ref:a,className:N("xps-select-scroll-button",e),...t},S(ya,{className:"xps-icon"})));zd.displayName=_r.displayName;var Wd=x(({className:e,...t},a)=>S(Hr,{ref:a,className:N("xps-select-scroll-button",e),...t},S(Xt,{className:"xps-icon"})));Wd.displayName=Hr.displayName;var Ro=x(({className:e,children:t,position:a="popper",...o},r)=>S(Fs,null,S(Nr,{ref:r,className:N("xps-select-content",a==="popper"&&"xps-select-content-popper",e),position:a,...o},S(zd,null),S(_s,{className:N("xps-select-viewport",a==="popper"&&"xps-select-viewport-popper")},t),S(Wd,null))));Ro.displayName=Nr.displayName;var zv=x(({className:e,...t},a)=>S(Fr,{ref:a,className:N("xps-select-label",e),...t}));zv.displayName=Fr.displayName;var jt=x(({className:e,children:t,...a},o)=>S(Br,{ref:o,className:N("xps-select-item",e),...a},S("span",{className:"xps-select-item-indicator"},S(Us,null,S(qe,{className:"xps-icon"}))),S(Hs,null,t)));jt.displayName=Br.displayName;var Wv=x(({className:e,...t},a)=>S(Ur,{ref:a,className:N("xps-select-separator",e),...t}));Wv.displayName=Ur.displayName;var Gv=x(({className:e,orientation:t="horizontal",...a},o)=>S("div",{ref:o,className:N("xps-separator",t==="vertical"?"xps-separator--vertical":"xps-separator--horizontal",e),role:"separator","aria-orientation":t,...a}));Gv.displayName="Separator";var jv=rr;var Gd=x(({className:e,...t},a)=>S(_a,{ref:a,className:N("xps-dialog-overlay",e),...t}));Gd.displayName=_a.displayName;var Kv=x(({className:e,children:t,side:a="right",showClose:o=!0,...r},n)=>S(jv,null,S(Gd,null),S(Ha,{ref:n,className:N("xps-sheet-content",`xps-sheet-content--${a}`,e),...r},t,o?S(nr,{className:"xps-dialog-close"},S(Jt,{className:"xps-icon","aria-hidden":"true"}),S("span",{className:"xps-sr-only"},"Close")):null)));Kv.displayName=Ha.displayName;var Xv=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-dialog-header",e),...t}));Xv.displayName="SheetHeader";var $v=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-dialog-footer",e),...t}));$v.displayName="SheetFooter";var Yv=x(({className:e,...t},a)=>S(Ua,{ref:a,className:N("xps-dialog-title",e),...t}));Yv.displayName=Ua.displayName;var Jv=x(({className:e,...t},a)=>S(qa,{ref:a,className:N("xps-dialog-description",e),...t}));Jv.displayName=qa.displayName;var zr=x(({className:e,side:t="left",collapsed:a=!1,...o},r)=>S("aside",{ref:r,className:N("xps-sidebar",`xps-sidebar--${t}`,a&&"xps-sidebar--collapsed",e),"data-side":t,"data-state":a?"collapsed":"expanded","aria-expanded":!a,...o}));zr.displayName="Sidebar";var Wr=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-header",e),...t}));Wr.displayName="SidebarHeader";var Gr=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-content",e),...t}));Gr.displayName="SidebarContent";var Zv=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-footer",e),...t}));Zv.displayName="SidebarFooter";var jr=x(({className:e,...t},a)=>S("span",{ref:a,className:N("xps-sidebar-title",e),...t}));jr.displayName="SidebarTitle";var Kr=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-rail",e),...t}));Kr.displayName="SidebarRail";var Xr=x(({className:e,variant:t="ghost",size:a="icon",...o},r)=>S(Ce,{ref:r,className:N("xps-sidebar-trigger",e),variant:t,size:a,...o}));Xr.displayName="SidebarTrigger";var Qv=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-group",e),...t}));Qv.displayName="SidebarGroup";var ew=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-group-label",e),...t}));ew.displayName="SidebarGroupLabel";var Vs=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-menu",e),...t}));Vs.displayName="SidebarMenu";var zs=x(({className:e,...t},a)=>S("div",{ref:a,className:N("xps-sidebar-menu-item",e),...t}));zs.displayName="SidebarMenuItem";var Ws=x(({className:e,active:t=!1,variant:a="ghost",...o},r)=>S(Ce,{ref:r,variant:a,className:N("xps-sidebar-menu-button",t&&"xps-sidebar-menu-button--active",e),...o}));Ws.displayName="SidebarMenuButton";var jd=["PageUp","PageDown"],Kd=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],Xd={"from-left":["Home","PageDown","ArrowDown","ArrowLeft"],"from-right":["Home","PageDown","ArrowDown","ArrowRight"],"from-bottom":["Home","PageDown","ArrowDown","ArrowLeft"],"from-top":["Home","PageDown","ArrowUp","ArrowLeft"]},$a="Slider",[Gs,tw,aw]=Ut($a),[Ks,OP]=de($a,[aw]),[ow,Po]=Ks($a),Yr=x((e,t)=>{let{name:a,min:o=0,max:r=100,step:n=1,orientation:s="horizontal",disabled:l=!1,minStepsBetweenThumbs:i=0,defaultValue:c=[o],value:d,onValueChange:u=()=>{},onValueCommit:f=()=>{},inverted:m=!1,form:g,...p}=e,v=R(new Set),w=R(0),L=R(!1),y=s==="horizontal"?rw:nw,[T=[],E]=ye({prop:d,defaultProp:c,onChange:F=>{[...v.current][w.current]?.focus({preventScroll:!0,focusVisible:L.current}),L.current=!1,u(F)}}),k=R(T);function _(F){let Z=cw(T,F);K(F,Z)}function V(F){K(F,w.current)}function W(){let F=k.current[w.current];T[w.current]!==F&&f(T)}function K(F,Z,{commit:$}={commit:!1}){let ae=pw(n),X=mw(Math.round((F-o)/n)*n+o,ae),Y=Vt(X,[o,r]);E((q=[])=>{let O=lw(q,Y,Z);if(fw(O,i*n)){w.current=O.indexOf(Y);let ee=String(O)!==String(q);return ee&&$&&f(O),ee?O:q}else return q})}return h(ow,{scope:e.__scopeSlider,name:a,disabled:l,min:o,max:r,valueIndexToChangeRef:w,thumbs:v.current,values:T,orientation:s,form:g,children:h(Gs.Provider,{scope:e.__scopeSlider,children:h(Gs.Slot,{scope:e.__scopeSlider,children:h(y,{"aria-disabled":l,"data-disabled":l?"":void 0,...p,ref:t,onPointerDown:A(p.onPointerDown,()=>{l||(k.current=T,L.current=!1)}),min:o,max:r,inverted:m,onSlideStart:l?void 0:_,onSlideMove:l?void 0:V,onSlideEnd:l?void 0:W,onHomeKeyDown:()=>{l||(L.current=!0,K(o,0,{commit:!0}))},onEndKeyDown:()=>{l||(L.current=!0,K(r,T.length-1,{commit:!0}))},onStepKeyDown:({event:F,direction:Z})=>{if(!l){L.current=!0;let X=jd.includes(F.key)||F.shiftKey&&Kd.includes(F.key)?10:1,Y=w.current,q=T[Y],O=n*X*Z;K(q+O,Y,{commit:!0})}}})})})})});Yr.displayName=$a;var[$d,Yd]=Ks($a,{startEdge:"left",endEdge:"right",size:"width",direction:1}),rw=x((e,t)=>{let{min:a,max:o,dir:r,inverted:n,onSlideStart:s,onSlideMove:l,onSlideEnd:i,onStepKeyDown:c,...d}=e,[u,f]=M(null),m=j(t,I=>f(I)),g=R(void 0),p=ze(r),v=p==="ltr",w=v&&!n||!v&&n;function L(I){let y=g.current||u.getBoundingClientRect(),T=[0,y.width],k=Js(T,w?[a,o]:[o,a]);return g.current=y,k(I-y.left)}return h($d,{scope:e.__scopeSlider,startEdge:w?"left":"right",endEdge:w?"right":"left",direction:w?1:-1,size:"width",children:h(Jd,{dir:p,"data-orientation":"horizontal",...d,ref:m,style:{...d.style,"--radix-slider-thumb-transform":"translateX(-50%)"},onSlideStart:I=>{let y=L(I.clientX);s?.(y)},onSlideMove:I=>{let y=L(I.clientX);l?.(y)},onSlideEnd:()=>{g.current=void 0,i?.()},onStepKeyDown:I=>{let T=Xd[w?"from-left":"from-right"].includes(I.key);c?.({event:I,direction:T?-1:1})}})})}),nw=x((e,t)=>{let{min:a,max:o,inverted:r,onSlideStart:n,onSlideMove:s,onSlideEnd:l,onStepKeyDown:i,...c}=e,d=R(null),u=j(t,d),f=R(void 0),m=!r;function g(p){let v=f.current||d.current.getBoundingClientRect(),w=[0,v.height],I=Js(w,m?[o,a]:[a,o]);return f.current=v,I(p-v.top)}return h($d,{scope:e.__scopeSlider,startEdge:m?"bottom":"top",endEdge:m?"top":"bottom",size:"height",direction:m?1:-1,children:h(Jd,{"data-orientation":"vertical",...c,ref:u,style:{...c.style,"--radix-slider-thumb-transform":"translateY(50%)"},onSlideStart:p=>{let v=g(p.clientY);n?.(v)},onSlideMove:p=>{let v=g(p.clientY);s?.(v)},onSlideEnd:()=>{f.current=void 0,l?.()},onStepKeyDown:p=>{let w=Xd[m?"from-bottom":"from-top"].includes(p.key);i?.({event:p,direction:w?-1:1})}})})}),Jd=x((e,t)=>{let{__scopeSlider:a,onSlideStart:o,onSlideMove:r,onSlideEnd:n,onHomeKeyDown:s,onEndKeyDown:l,onStepKeyDown:i,...c}=e,d=Po($a,a);return h(B.span,{...c,ref:t,onKeyDown:A(e.onKeyDown,u=>{u.key==="Home"?(s(u),u.preventDefault()):u.key==="End"?(l(u),u.preventDefault()):jd.concat(Kd).includes(u.key)&&(i(u),u.preventDefault())}),onPointerDown:A(e.onPointerDown,u=>{let f=u.target;f.setPointerCapture(u.pointerId),u.preventDefault(),d.thumbs.has(f)?f.focus({preventScroll:!0,focusVisible:!1}):o(u)}),onPointerMove:A(e.onPointerMove,u=>{u.target.hasPointerCapture(u.pointerId)&&r(u)}),onPointerUp:A(e.onPointerUp,u=>{let f=u.target;f.hasPointerCapture(u.pointerId)&&(f.releasePointerCapture(u.pointerId),n(u))})})}),Zd="SliderTrack",Xs=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=Po(Zd,a);return h(B.span,{"data-disabled":r.disabled?"":void 0,"data-orientation":r.orientation,...o,ref:t})});Xs.displayName=Zd;var js="SliderRange",$s=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=Po(js,a),n=Yd(js,a),s=R(null),l=j(t,s),i=r.values.length,c=r.values.map(f=>sf(f,r.min,r.max)),d=i>1?Math.min(...c):0,u=100-Math.max(...c);return h(B.span,{"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,...o,ref:l,style:{...e.style,[n.startEdge]:d+"%",[n.endEdge]:u+"%"}})});$s.displayName=js;var Qd="SliderThumb",[sw,ef]=Ks(Qd),tf="SliderThumbProvider";function af(e){let{__scopeSlider:t,name:a,children:o,internal_do_not_use_render:r}=e,n=Po(tf,t),s=tw(t),[l,i]=M(null),c=he(()=>l?s().findIndex(v=>v.ref.current===l):-1,[s,l]),d=Ft(l),u=l?!!n.form||!!l.closest("form"):!0,f=n.values[c],m=a??(n.name?n.name+(n.values.length>1?"[]":""):void 0),g=f===void 0?0:sf(f,n.min,n.max);D(()=>{if(l)return n.thumbs.add(l),()=>{n.thumbs.delete(l)}},[l,n.thumbs]);let p={value:f,name:m,form:n.form,isFormControl:u,index:c,thumb:l,onThumbChange:i,percent:g,size:d};return h(sw,{scope:t,...p,children:hw(r)?r(p):o})}af.displayName=tf;var $r="SliderThumbTrigger",of=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=Po($r,a),n=Yd($r,a),{index:s,value:l,percent:i,size:c,onThumbChange:d}=ef($r,a),u=j(t,p=>d(p)),f=iw(s,r.values.length),m=c?.[n.size],g=m?uw(m,i,n.direction):0;return h("span",{style:{transform:"var(--radix-slider-thumb-transform)",position:"absolute",[n.startEdge]:`calc(${i}% + ${g}px)`},children:h(Gs.ItemSlot,{scope:a,children:h(B.span,{role:"slider","aria-label":e["aria-label"]||f,"aria-valuemin":r.min,"aria-valuenow":l,"aria-valuemax":r.max,"aria-orientation":r.orientation,"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,tabIndex:r.disabled?void 0:0,...o,ref:u,style:l===void 0?{display:"none"}:e.style,onFocus:A(e.onFocus,()=>{r.valueIndexToChangeRef.current=s})})})})});of.displayName=$r;var Ys=x((e,t)=>{let{__scopeSlider:a,name:o,...r}=e;return h(af,{__scopeSlider:a,name:o,internal_do_not_use_render:({index:n,isFormControl:s})=>Pe(Ae,{children:[h(of,{...r,ref:t,__scopeSlider:a}),s?h(nf,{__scopeSlider:a},n):null]})})});Ys.displayName=Qd;var rf="SliderBubbleInput",nf=x(({__scopeSlider:e,...t},a)=>{let{value:o,name:r,form:n}=ef(rf,e),s=R(null),l=j(s,a),i=Nt(o);return D(()=>{let c=s.current;if(!c)return;let d=window.HTMLInputElement.prototype,f=Object.getOwnPropertyDescriptor(d,"value").set;if(i!==o&&f){let m=new Event("input",{bubbles:!0});f.call(c,o),c.dispatchEvent(m)}},[i,o]),h(B.input,{style:{display:"none"},name:r,form:n,...t,ref:l,defaultValue:o})});nf.displayName=rf;function lw(e=[],t,a){let o=[...e];return o[a]=t,o.sort((r,n)=>r-n)}function sf(e,t,a){let n=100/(a-t)*(e-t);return Vt(n,[0,100])}function iw(e,t){return t>2?`Value ${e+1} of ${t}`:t===2?["Minimum","Maximum"][e]:void 0}function cw(e,t){if(e.length===1)return 0;let a=e.map(r=>Math.abs(r-t)),o=Math.min(...a);return a.indexOf(o)}function uw(e,t,a){let o=e/2,n=Js([0,50],[0,o]);return(o-n(t)*a)*a}function dw(e){return e.slice(0,-1).map((t,a)=>e[a+1]-t)}function fw(e,t){if(t>0){let a=dw(e);return Math.min(...a)>=t}return!0}function Js(e,t){return a=>{if(e[0]===e[1]||t[0]===t[1])return t[0];let o=(t[1]-t[0])/(e[1]-e[0]);return t[0]+o*(a-e[0])}}function pw(e){if(!Number.isFinite(e))return 0;let t=e.toString();if(t.includes("e")){let[o,r]=t.split("e"),n=o.split(".")[1]||"",s=Number(r);return Math.max(0,n.length-s)}let a=t.split(".")[1];return a?a.length:0}function mw(e,t){let a=Math.pow(10,t);return Math.round(e*a)/a}function hw(e){return typeof e=="function"}var gw=x(({className:e,...t},a)=>S(Yr,{ref:a,className:N("xps-slider",e),...t},S(Xs,{className:"xps-slider-track"},S($s,{className:"xps-slider-range"})),S(Ys,{className:"xps-slider-thumb"})));gw.displayName=Yr.displayName;var Jr="Switch",[vw,GP]=de(Jr),[ww,Zs]=vw(Jr);function Cw(e){let{__scopeSwitch:t,checked:a,children:o,defaultChecked:r,disabled:n,form:s,name:l,onCheckedChange:i,required:c,value:d="on",internal_do_not_use_render:u}=e,[f,m]=ye({prop:a,defaultProp:r??!1,onChange:i,caller:Jr}),[g,p]=M(null),[v,w]=M(null),L=R(!1),I=g?!!s||!!g.closest("form"):!0,y={checked:f,setChecked:m,disabled:n,control:g,setControl:p,name:l,form:s,value:d,hasConsumerStoppedPropagationRef:L,required:c,defaultChecked:r,isFormControl:I,bubbleInput:v,setBubbleInput:w};return h(ww,{scope:t,...y,children:bw(u)?u(y):o})}var lf="SwitchTrigger",cf=x(({__scopeSwitch:e,onClick:t,...a},o)=>{let{value:r,disabled:n,checked:s,required:l,setControl:i,setChecked:c,hasConsumerStoppedPropagationRef:d,isFormControl:u,bubbleInput:f}=Zs(lf,e),m=j(o,i);return h(B.button,{type:"button",role:"switch","aria-checked":s,"aria-required":l,"data-state":pf(s),"data-disabled":n?"":void 0,disabled:n,value:r,...a,ref:m,onClick:A(t,g=>{c(p=>!p),f&&u&&(d.current=g.isPropagationStopped(),d.current||g.stopPropagation())})})});cf.displayName=lf;var Zr=x((e,t)=>{let{__scopeSwitch:a,name:o,checked:r,defaultChecked:n,required:s,disabled:l,value:i,onCheckedChange:c,form:d,...u}=e;return h(Cw,{__scopeSwitch:a,checked:r,defaultChecked:n,disabled:l,required:s,onCheckedChange:c,name:o,form:d,value:i,internal_do_not_use_render:({isFormControl:f})=>Pe(Ae,{children:[h(cf,{...u,ref:t,__scopeSwitch:a}),f&&h(ff,{__scopeSwitch:a})]})})});Zr.displayName=Jr;var uf="SwitchThumb",Qs=x((e,t)=>{let{__scopeSwitch:a,...o}=e,r=Zs(uf,a);return h(B.span,{"data-state":pf(r.checked),"data-disabled":r.disabled?"":void 0,...o,ref:t})});Qs.displayName=uf;var df="SwitchBubbleInput",ff=x(({__scopeSwitch:e,...t},a)=>{let{control:o,hasConsumerStoppedPropagationRef:r,checked:n,defaultChecked:s,required:l,disabled:i,name:c,value:d,form:u,bubbleInput:f,setBubbleInput:m}=Zs(df,e),g=j(a,m),p=Nt(n),v=Ft(o);D(()=>{let L=f;if(!L)return;let I=window.HTMLInputElement.prototype,T=Object.getOwnPropertyDescriptor(I,"checked").set,E=!r.current;if(p!==n&&T){let k=new Event("click",{bubbles:E});T.call(L,n),L.dispatchEvent(k)}},[f,p,n,r]);let w=R(n);return h(B.input,{type:"checkbox","aria-hidden":!0,defaultChecked:s??w.current,required:l,disabled:i,name:c,value:d,form:u,...t,tabIndex:-1,ref:g,style:{...t.style,...v,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});ff.displayName=df;function bw(e){return typeof e=="function"}function pf(e){return e?"checked":"unchecked"}var Iw=x(({className:e,...t},a)=>S(Zr,{ref:a,className:N("xps-switch",e),...t},S(Qs,{className:"xps-switch-thumb"})));Iw.displayName=Zr.displayName;var Sw=x(({className:e,...t},a)=>S("table",{ref:a,className:N("xps-table",e),...t}));Sw.displayName="Table";var yw=x(({className:e,...t},a)=>S("thead",{ref:a,className:N("xps-table-header",e),...t}));yw.displayName="TableHeader";var Rw=x(({className:e,...t},a)=>S("tbody",{ref:a,className:N("xps-table-body",e),...t}));Rw.displayName="TableBody";var Pw=x(({className:e,...t},a)=>S("tfoot",{ref:a,className:N("xps-table-footer",e),...t}));Pw.displayName="TableFooter";var Tw=x(({className:e,...t},a)=>S("tr",{ref:a,className:N("xps-table-row",e),...t}));Tw.displayName="TableRow";var kw=x(({className:e,...t},a)=>S("th",{ref:a,className:N("xps-table-head",e),...t}));kw.displayName="TableHead";var Mw=x(({className:e,...t},a)=>S("td",{ref:a,className:N("xps-table-cell",e),...t}));Mw.displayName="TableCell";var Aw=x(({className:e,...t},a)=>S("caption",{ref:a,className:N("xps-table-caption",e),...t}));Aw.displayName="TableCaption";var Qr="Tabs",[Dw,nT]=de(Qr,[Ka]),mf=Ka(),[Ew,el]=Dw(Qr),hf=x((e,t)=>{let{__scopeTabs:a,value:o,onValueChange:r,defaultValue:n,orientation:s="horizontal",dir:l,activationMode:i="automatic",...c}=e,d=ze(l),[u,f]=ye({prop:o,onChange:r,defaultProp:n??"",caller:Qr});return h(Ew,{scope:a,baseId:Ie(),value:u,onValueChange:f,orientation:s,dir:d,activationMode:i,children:h(B.div,{dir:d,"data-orientation":s,...c,ref:t})})});hf.displayName=Qr;var xf="TabsList",gf=x((e,t)=>{let{__scopeTabs:a,loop:o=!0,...r}=e,n=el(xf,a),s=mf(a);return h(vr,{asChild:!0,...s,orientation:n.orientation,dir:n.dir,loop:o,children:h(B.div,{role:"tablist","aria-orientation":n.orientation,...r,ref:t})})});gf.displayName=xf;var vf="TabsTrigger",wf=x((e,t)=>{let{__scopeTabs:a,value:o,disabled:r=!1,...n}=e,s=el(vf,a),l=mf(a),i=Lf(s.baseId,o),c=If(s.baseId,o),d=o===s.value;return h(wr,{asChild:!0,...l,focusable:!r,active:d,children:h(B.button,{type:"button",role:"tab","aria-selected":d,"aria-controls":c,"data-state":d?"active":"inactive","data-disabled":r?"":void 0,disabled:r,id:i,...n,ref:t,onMouseDown:A(e.onMouseDown,u=>{!r&&u.button===0&&u.ctrlKey===!1?s.onValueChange(o):u.preventDefault()}),onKeyDown:A(e.onKeyDown,u=>{[" ","Enter"].includes(u.key)&&s.onValueChange(o)}),onFocus:A(e.onFocus,()=>{let u=s.activationMode!=="manual";!d&&!r&&u&&s.onValueChange(o)})})})});wf.displayName=vf;var Cf="TabsContent",bf=x((e,t)=>{let{__scopeTabs:a,value:o,forceMount:r,children:n,...s}=e,l=el(Cf,a),i=Lf(l.baseId,o),c=If(l.baseId,o),d=o===l.value,u=R(d);return D(()=>{let f=requestAnimationFrame(()=>u.current=!1);return()=>cancelAnimationFrame(f)},[]),h(xe,{present:r||d,children:({present:f})=>h(B.div,{"data-state":d?"active":"inactive","data-orientation":l.orientation,role:"tabpanel","aria-labelledby":i,hidden:!f,id:c,tabIndex:0,...s,ref:t,style:{...e.style,animationDuration:u.current?"0s":void 0},children:f&&n})})});bf.displayName=Cf;function Lf(e,t){return`${e}-trigger-${t}`}function If(e,t){return`${e}-content-${t}`}var Sf=hf,tl=gf,al=wf,ol=bf;var rl=Sf,en=x(({className:e,...t},a)=>S(tl,{ref:a,className:N("xps-tabs-list",e),...t}));en.displayName=tl.displayName;var pt=x(({className:e,...t},a)=>S(al,{ref:a,className:N("xps-tabs-trigger",e),...t}));pt.displayName=al.displayName;var mt=x(({className:e,...t},a)=>S(ol,{ref:a,className:N("xps-tabs-content",e),...t}));mt.displayName=ol.displayName;var ha=x(({className:e,...t},a)=>S("textarea",{ref:a,className:N("xps-textarea",e),...t}));ha.displayName="Textarea";var[tn,LT]=de("Tooltip",[yt]),an=yt(),yf="TooltipProvider",Nw=700,nl="tooltip.open",[Fw,ll]=tn(yf),Bw=e=>{let{__scopeTooltip:t,delayDuration:a=Nw,skipDelayDuration:o=300,disableHoverableContent:r=!1,children:n}=e,s=R(!0),l=R(!1),i=R(0);return D(()=>{let c=i.current;return()=>window.clearTimeout(c)},[]),h(Fw,{scope:t,isOpenDelayedRef:s,delayDuration:a,onOpen:H(()=>{o<=0||(window.clearTimeout(i.current),s.current=!1)},[o]),onClose:H(()=>{o<=0||(window.clearTimeout(i.current),i.current=window.setTimeout(()=>s.current=!0,o))},[o]),isPointerInTransitRef:l,onPointerInTransitChange:H(c=>{l.current=c},[]),disableHoverableContent:r,children:n})};Bw.displayName=yf;var To="Tooltip",[_w,ko]=tn(To),Hw=e=>{let{__scopeTooltip:t,children:a,open:o,defaultOpen:r,onOpenChange:n,disableHoverableContent:s,delayDuration:l}=e,i=ll(To,e.__scopeTooltip),c=an(t),[d,u]=M(null),f=Ie(),m=R(0),g=s??i.disableHoverableContent,p=l??i.delayDuration,v=R(!1),[w,L]=ye({prop:o,defaultProp:r??!1,onChange:k=>{k?(i.onOpen(),document.dispatchEvent(new CustomEvent(nl))):i.onClose(),n?.(k)},caller:To}),I=he(()=>w?v.current?"delayed-open":"instant-open":"closed",[w]),y=H(()=>{window.clearTimeout(m.current),m.current=0,v.current=!1,L(!0)},[L]),T=H(()=>{window.clearTimeout(m.current),m.current=0,L(!1)},[L]),E=H(()=>{window.clearTimeout(m.current),m.current=window.setTimeout(()=>{v.current=!0,L(!0),m.current=0},p)},[p,L]);return D(()=>()=>{m.current&&(window.clearTimeout(m.current),m.current=0)},[]),h(da,{...c,children:h(_w,{scope:t,contentId:f,open:w,stateAttribute:I,trigger:d,onTriggerChange:u,onTriggerEnter:H(()=>{i.isOpenDelayedRef.current?E():y()},[i.isOpenDelayedRef,E,y]),onTriggerLeave:H(()=>{g?T():(window.clearTimeout(m.current),m.current=0)},[T,g]),onOpen:y,onClose:T,disableHoverableContent:g,children:a})})};Hw.displayName=To;var sl="TooltipTrigger",Uw=x((e,t)=>{let{__scopeTooltip:a,...o}=e,r=ko(sl,a),n=ll(sl,a),s=an(a),l=R(null),i=j(t,l,r.onTriggerChange),c=R(!1),d=R(!1),u=H(()=>c.current=!1,[]);return D(()=>()=>document.removeEventListener("pointerup",u),[u]),h(Wa,{asChild:!0,...s,children:h(B.button,{"aria-describedby":r.open?r.contentId:void 0,"data-state":r.stateAttribute,...o,ref:i,onPointerMove:A(e.onPointerMove,f=>{f.pointerType!=="touch"&&!d.current&&!n.isPointerInTransitRef.current&&(r.onTriggerEnter(),d.current=!0)}),onPointerLeave:A(e.onPointerLeave,()=>{r.onTriggerLeave(),d.current=!1}),onPointerDown:A(e.onPointerDown,()=>{r.open&&r.onClose(),c.current=!0,document.addEventListener("pointerup",u,{once:!0})}),onFocus:A(e.onFocus,()=>{c.current||r.onOpen()}),onBlur:A(e.onBlur,r.onClose),onClick:A(e.onClick,r.onClose)})})});Uw.displayName=sl;var il="TooltipPortal",[qw,Vw]=tn(il,{forceMount:void 0}),Rf=e=>{let{__scopeTooltip:t,forceMount:a,children:o,container:r}=e,n=ko(il,t);return h(qw,{scope:t,forceMount:a,children:h(xe,{present:a||n.open,children:h(It,{asChild:!0,container:r,children:o})})})};Rf.displayName=il;var Ya="TooltipContent",Pf=x((e,t)=>{let a=Vw(Ya,e.__scopeTooltip),{forceMount:o=a.forceMount,side:r="top",...n}=e,s=ko(Ya,e.__scopeTooltip);return h(xe,{present:o||s.open,children:s.disableHoverableContent?h(Tf,{side:r,...n,ref:t}):h(zw,{side:r,...n,ref:t})})}),zw=x((e,t)=>{let a=ko(Ya,e.__scopeTooltip),o=ll(Ya,e.__scopeTooltip),r=R(null),n=j(t,r),[s,l]=M(null),{trigger:i,onClose:c}=a,d=r.current,{onPointerInTransitChange:u}=o,f=H(()=>{l(null),u(!1)},[u]),m=H((g,p)=>{let v=g.currentTarget,w={x:g.clientX,y:g.clientY},L=Xw(w,v.getBoundingClientRect()),I=$w(w,L),y=Yw(p.getBoundingClientRect()),T=Zw([...I,...y]);l(T),u(!0)},[u]);return D(()=>()=>f(),[f]),D(()=>{if(i&&d){let g=v=>m(v,d),p=v=>m(v,i);return i.addEventListener("pointerleave",g),d.addEventListener("pointerleave",p),()=>{i.removeEventListener("pointerleave",g),d.removeEventListener("pointerleave",p)}}},[i,d,m,f]),D(()=>{if(s){let g=p=>{let v=p.target,w={x:p.clientX,y:p.clientY},L=i?.contains(v)||d?.contains(v),I=!Jw(w,s);L?f():I&&(f(),c())};return document.addEventListener("pointermove",g),()=>document.removeEventListener("pointermove",g)}},[i,d,s,c,f]),h(Tf,{...e,ref:n})}),[Ww,Gw]=tn(To,{isInside:!1}),jw=Xl("TooltipContent"),Tf=x((e,t)=>{let{__scopeTooltip:a,children:o,"aria-label":r,onEscapeKeyDown:n,onPointerDownOutside:s,...l}=e,i=ko(Ya,a),c=an(a),{onClose:d}=i;return D(()=>(document.addEventListener(nl,d),()=>document.removeEventListener(nl,d)),[d]),D(()=>{if(i.trigger){let u=f=>{f.target instanceof Node&&f.target.contains(i.trigger)&&d()};return window.addEventListener("scroll",u,{capture:!0}),()=>window.removeEventListener("scroll",u,{capture:!0})}},[i.trigger,d]),h(Lt,{asChild:!0,disableOutsidePointerEvents:!1,onEscapeKeyDown:n,onPointerDownOutside:s,onFocusOutside:u=>u.preventDefault(),onDismiss:d,children:Pe(Ga,{"data-state":i.stateAttribute,...c,...l,ref:t,style:{...l.style,"--radix-tooltip-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-tooltip-content-available-width":"var(--radix-popper-available-width)","--radix-tooltip-content-available-height":"var(--radix-popper-available-height)","--radix-tooltip-trigger-width":"var(--radix-popper-anchor-width)","--radix-tooltip-trigger-height":"var(--radix-popper-anchor-height)"},children:[h(jw,{children:o}),h(Ww,{scope:a,isInside:!0,children:h(Id,{id:i.contentId,role:"tooltip",children:r||o})})]})})});Pf.displayName=Ya;var kf="TooltipArrow",Kw=x((e,t)=>{let{__scopeTooltip:a,...o}=e,r=an(a);return Gw(kf,a).isInside?null:h(ja,{...r,...o,ref:t})});Kw.displayName=kf;function Xw(e,t){let a=Math.abs(t.top-e.y),o=Math.abs(t.bottom-e.y),r=Math.abs(t.right-e.x),n=Math.abs(t.left-e.x);switch(Math.min(a,o,r,n)){case n:return"left";case r:return"right";case a:return"top";case o:return"bottom";default:throw new Error("unreachable")}}function $w(e,t,a=5){let o=[];switch(t){case"top":o.push({x:e.x-a,y:e.y+a},{x:e.x+a,y:e.y+a});break;case"bottom":o.push({x:e.x-a,y:e.y-a},{x:e.x+a,y:e.y-a});break;case"left":o.push({x:e.x+a,y:e.y-a},{x:e.x+a,y:e.y+a});break;case"right":o.push({x:e.x-a,y:e.y-a},{x:e.x-a,y:e.y+a});break}return o}function Yw(e){let{top:t,right:a,bottom:o,left:r}=e;return[{x:r,y:t},{x:a,y:t},{x:a,y:o},{x:r,y:o}]}function Jw(e,t){let{x:a,y:o}=e,r=!1;for(let n=0,s=t.length-1;n<t.length;s=n++){let l=t[n],i=t[s],c=l.x,d=l.y,u=i.x,f=i.y;d>o!=f>o&&a<(u-c)*(o-d)/(f-d)+c&&(r=!r)}return r}function Zw(e){let t=e.slice();return t.sort((a,o)=>a.x<o.x?-1:a.x>o.x?1:a.y<o.y?-1:a.y>o.y?1:0),Qw(t)}function Qw(e){if(e.length<=1)return e.slice();let t=[];for(let o=0;o<e.length;o++){let r=e[o];for(;t.length>=2;){let n=t[t.length-1],s=t[t.length-2];if((n.x-s.x)*(r.y-s.y)>=(n.y-s.y)*(r.x-s.x))t.pop();else break}t.push(r)}t.pop();let a=[];for(let o=e.length-1;o>=0;o--){let r=e[o];for(;a.length>=2;){let n=a[a.length-1],s=a[a.length-2];if((n.x-s.x)*(r.y-s.y)>=(n.y-s.y)*(r.x-s.x))a.pop();else break}a.push(r)}return a.pop(),t.length===1&&a.length===1&&t[0].x===a[0].x&&t[0].y===a[0].y?t:t.concat(a)}var Mf=Rf,cl=Pf;var tC=x(({className:e,sideOffset:t=4,...a},o)=>S(Mf,null,S(cl,{ref:o,sideOffset:t,className:N("xps-tooltip-content",e),...a})));tC.displayName=cl.displayName;var J=window.React,Af=window.ReactDOM,C=J.createElement;var ul={zh_Hans:{newDocument:"\u65B0\u5EFA",save:"\u4FDD\u5B58",cancel:"\u53D6\u6D88",create:"\u521B\u5EFA",import:"\u5BFC\u5165",exportJson:"JSON",openLucid:"\u6253\u5F00",askAssistant:"\u53D1\u9001",search:"\u641C\u7D22\u6587\u6863",allStatuses:"\u5168\u90E8\u72B6\u6001",draft:"\u8349\u7A3F",reviewed:"\u5DF2\u5BA1\u6838",archived:"\u5DF2\u5F52\u6863",versions:"\u7248\u672C",restore:"\u6062\u590D",archive:"\u5F52\u6863",markReviewed:"\u6807\u8BB0\u5DF2\u5BA1\u6838",backToDraft:"\u9000\u56DE\u8349\u7A3F",mermaid:"Mermaid",saveMermaid:"\u4FDD\u5B58\u8349\u7A3F",title:"\u6807\u9898",titleRequired:"\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A",description:"\u63CF\u8FF0",kind:"\u7C7B\u578B",diagram:"\u56FE\u8868",flowchart:"\u6D41\u7A0B\u56FE",architecture:"\u67B6\u6784\u56FE",process:"\u6D41\u7A0B",wireframe:"\u7EBF\u6846\u56FE",orgchart:"\u7EC4\u7EC7\u67B6\u6784",network:"\u7F51\u7EDC\u56FE",other:"\u5176\u4ED6",drawingRequest:"\u7ED8\u56FE\u9700\u6C42",changeSummary:"\u53D8\u66F4\u6458\u8981",standardImport:"Standard Import",preview:"\u9884\u89C8",json:"JSON",links:"\u94FE\u63A5",jsonValid:"JSON \u6709\u6548",jsonInvalid:"JSON \u65E0\u6548",formatJson:"\u683C\u5F0F\u5316",revertJson:"\u56DE\u9000",externalDocument:"Lucid \u6587\u6863",lucidDocumentUrl:"Lucid \u6587\u6863 URL",lucidDocumentId:"Lucid \u6587\u6863 ID",embedUrl:"Embed URL",previewUrl:"\u9884\u89C8 URL",registerExternal:"\u767B\u8BB0\u94FE\u63A5",operationCompleted:"\u64CD\u4F5C\u5DF2\u5B8C\u6210",metadataSaved:"\u6587\u6863\u4FE1\u606F\u5DF2\u4FDD\u5B58",requestTimeout:"\u8BF7\u6C42\u8D85\u65F6",remoteRequestFailed:"\u8FDC\u7A0B\u8BF7\u6C42\u5931\u8D25",unknownError:"\u672A\u77E5\u9519\u8BEF",noDocument:"\u8BF7\u9009\u62E9\u6216\u65B0\u5EFA Lucidchart \u6587\u6863",dirty:"\u672A\u4FDD\u5B58",saved:"\u5DF2\u4FDD\u5B58",untitled:"\u672A\u547D\u540D Lucidchart \u6587\u6863",documentCreated:"Lucidchart \u6587\u6863\u5DF2\u521B\u5EFA",agentDocumentUpdated:"Agent Lucidchart \u7ED3\u679C\u5DF2\u5237\u65B0",documents:"\u6587\u6863",inspector:"\u8BE6\u60C5",info:"\u4FE1\u606F",activity:"\u6D3B\u52A8",assistant:"Assistant",documentInfo:"\u6587\u6863\u4FE1\u606F",saveMetadata:"\u4FDD\u5B58\u4FE1\u606F",workbenchTitle:"Lucidchart \u5DE5\u4F5C\u53F0",discardUnsavedChanges:"\u5F53\u524D\u6709\u672A\u4FDD\u5B58\u53D8\u66F4\uFF0C\u7EE7\u7EED\u4F1A\u4E22\u5F03\u8FD9\u4E9B\u53D8\u66F4\u3002\u662F\u5426\u7EE7\u7EED\uFF1F",confirmArchive:"\u786E\u8BA4\u5F52\u6863\u5F53\u524D\u6587\u6863\uFF1F",noVersions:"\u6682\u65E0\u7248\u672C",noActivity:"\u6682\u65E0\u6D3B\u52A8",collapseDocuments:"\u6536\u8D77\u6587\u6863\u4FA7\u680F",expandDocuments:"\u5C55\u5F00\u6587\u6863\u4FA7\u680F",collapseInspector:"\u6536\u8D77\u8BE6\u60C5\u4FA7\u680F",expandInspector:"\u5C55\u5F00\u8BE6\u60C5\u4FA7\u680F",invalidJson:"Standard Import JSON \u65E0\u6548",standardImportNotice:"\u4FDD\u5B58\u7684\u662F Lucid Standard Import \u7684 document.json \u5185\u5BB9\uFF1B.lucid ZIP \u53EF\u7531\u5916\u90E8 Lucid REST \u5BFC\u5165\u6D41\u7A0B\u751F\u6210\u3002",embedNotice:"Lucid Embed \u662F\u5426\u53EF\u663E\u793A\u53D6\u51B3\u4E8E Lucid \u6587\u6863\u6743\u9650\u3001Cookie \u6216 token-based embed \u914D\u7F6E\u3002",embedPreview:"Lucid Embed",imagePreview:"\u9884\u89C8\u56FE",standardImportPreview:"\u7ED3\u6784\u9884\u89C8",previewUnavailable:"\u5F53\u524D Standard Import \u6682\u65E0\u53EF\u9884\u89C8\u56FE\u5F62\uFF0C\u8BF7\u68C0\u67E5 pages/shapes/lines \u6570\u636E\u3002"},en_US:{newDocument:"New",save:"Save",cancel:"Cancel",create:"Create",import:"Import",exportJson:"JSON",openLucid:"Open",askAssistant:"Send",search:"Search documents",allStatuses:"All statuses",draft:"Draft",reviewed:"Reviewed",archived:"Archived",versions:"Versions",restore:"Restore",archive:"Archive",markReviewed:"Mark reviewed",backToDraft:"Back to draft",mermaid:"Mermaid",saveMermaid:"Save draft",title:"Title",titleRequired:"Title is required",description:"Description",kind:"Kind",diagram:"Diagram",flowchart:"Flowchart",architecture:"Architecture",process:"Process",wireframe:"Wireframe",orgchart:"Org chart",network:"Network",other:"Other",drawingRequest:"Drawing request",changeSummary:"Change summary",standardImport:"Standard Import",preview:"Preview",json:"JSON",links:"Links",jsonValid:"JSON valid",jsonInvalid:"JSON invalid",formatJson:"Format",revertJson:"Revert",externalDocument:"Lucid document",lucidDocumentUrl:"Lucid document URL",lucidDocumentId:"Lucid document ID",embedUrl:"Embed URL",previewUrl:"Preview URL",registerExternal:"Register link",operationCompleted:"Operation completed",metadataSaved:"Document info saved",requestTimeout:"Request timed out",remoteRequestFailed:"Remote request failed",unknownError:"Unknown error",noDocument:"Select or create a Lucidchart document",dirty:"Unsaved",saved:"Saved",untitled:"Untitled Lucidchart document",documentCreated:"Lucidchart document created",agentDocumentUpdated:"Agent Lucidchart result refreshed",documents:"Documents",inspector:"Inspector",info:"Info",activity:"Activity",assistant:"Assistant",documentInfo:"Document info",saveMetadata:"Save info",workbenchTitle:"Lucidchart Workbench",discardUnsavedChanges:"There are unsaved changes. Continue and discard them?",confirmArchive:"Archive the current document?",noVersions:"No versions yet",noActivity:"No activity yet",collapseDocuments:"Collapse documents sidebar",expandDocuments:"Expand documents sidebar",collapseInspector:"Collapse inspector",expandInspector:"Expand inspector",invalidJson:"Invalid Standard Import JSON",standardImportNotice:"This stores Lucid Standard Import document.json content. A .lucid ZIP can be produced by an external Lucid REST import flow.",embedNotice:"Lucid Embed rendering depends on document permissions, cookies, or token-based embed configuration.",embedPreview:"Lucid Embed",imagePreview:"Preview image",standardImportPreview:"Structure preview",previewUnavailable:"No previewable shapes were found in the current Standard Import. Check pages/shapes/lines data."}};function dl(e){let t=String(e||"").toLowerCase().startsWith("en")?ul.en_US:ul.zh_Hans;return a=>t[a]||ul.en_US[a]||a}function Df(){if(document.getElementById("lucidchart-workbench-styles"))return;let e=document.createElement("style");e.id="lucidchart-workbench-styles",e.textContent=`
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
      --lw-right-panel-width: clamp(300px, 24vw, 380px);
      --lw-right-width: var(--lw-right-panel-width);
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
      overflow: hidden;
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-header,
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      position: relative;
      width: 100%;
      max-width: 100%;
      z-index: 1;
      background: var(--xps-card);
      border-left: 1px solid var(--xps-border);
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-header {
      min-height: var(--lw-panel-header-height);
      border-bottom: 1px solid var(--xps-border);
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
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
      grid-template-columns: minmax(220px, 1fr) auto;
      align-items: center;
      gap: 8px 10px;
      min-height: 48px;
      padding: 8px 12px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
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
      color: var(--xps-foreground);
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
      color: var(--xps-muted-foreground);
      font-size: 12px;
    }
    .lw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .lw-toolbar-actions .xps-button,
    .lw-toolbar-actions .xps-badge { flex: 0 0 auto; }
    .lw-dialog-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .lw-dialog .xps-textarea {
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
    .lw-editor-header .xps-tabs-list {
      min-width: 0;
      flex: 1 1 auto;
      overflow-x: auto;
      justify-content: flex-start;
    }
    .lw-editor-header .xps-tabs-trigger {
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
    .lw-tall-textarea.xps-textarea {
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
      background: var(--xps-card);
    }
    .lw-inspector-tabs-list .xps-tabs-trigger {
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
      color: var(--xps-foreground);
    }
    .lw-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lw-inline-actions .xps-button {
      flex: 0 0 auto;
      white-space: nowrap;
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
    .lw-log {
      border: 1px solid var(--xps-border);
      border-radius: var(--xps-radius);
      background: color-mix(in srgb, var(--xps-card) 96%, var(--xps-muted) 4%);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .lw-log-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--xps-foreground);
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
      color: var(--xps-destructive, #dc2626);
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
    .lw-empty-state {
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--xps-muted-foreground);
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
      .lw-sidebar.xps-sidebar,
      .lw-inspector.xps-sidebar {
        overflow: visible;
        z-index: 40;
      }
      .lw-sidebar[aria-expanded="true"] > .xps-sidebar-header,
      .lw-sidebar[aria-expanded="true"] > .xps-sidebar-content {
        position: absolute;
        left: 0;
        width: var(--lw-left-panel-width);
        max-width: calc(100vw - 16px);
        z-index: 41;
        background: var(--xps-card);
        border-right: 1px solid var(--xps-border);
        box-shadow: 12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
      }
      .lw-sidebar[aria-expanded="true"] > .xps-sidebar-header {
        top: 0;
      }
      .lw-sidebar[aria-expanded="true"] > .xps-sidebar-content {
        top: var(--lw-panel-header-height);
        bottom: 0;
        min-height: 0;
        overflow: hidden;
      }
      .lw-inspector[aria-expanded="true"] > .xps-sidebar-header,
      .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
        position: absolute;
        right: 0;
        width: var(--lw-right-panel-width);
        max-width: calc(100vw - 16px);
        z-index: 41;
        background: var(--xps-card);
        border-left: 1px solid var(--xps-border);
        box-shadow: -12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
      }
      .lw-inspector[aria-expanded="true"] > .xps-sidebar-header {
        top: 0;
      }
      .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
        top: var(--lw-panel-header-height);
        bottom: 0;
        min-height: 0;
        overflow: hidden;
      }
      .lw-sidebar .xps-sidebar-content,
      .lw-inspector-scroll { display: none; }
      .lw-sidebar[aria-expanded="true"] .xps-sidebar-content,
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
      .lw-status { margin-left: 0; }
    }
  `,document.head.appendChild(e)}var Ef="xpertai.remote_component";var xa=new Map,on=null,aC=0,Ja={requestTimeout:"Request timed out",remoteRequestFailed:"Remote request failed",unknownError:"Unknown error"};function fl(e){return!!(e&&typeof e=="object"&&!Array.isArray(e))}function Mo(e,t,a){!on&&e!=="ready"||parent.postMessage(Object.assign({channel:Ef,protocolVersion:1,instanceId:on,type:e},t||{}),"*",a||[])}function nn(e,t,a){let o=String(++aC);return new Promise((r,n)=>{xa.set(o,{resolve:r,reject:n});try{Mo(e,Object.assign({requestId:o},t||{}),a)}catch(s){xa.delete(o),n(s instanceof Error?s:new Error(Ja.remoteRequestFailed));return}setTimeout(()=>{xa.has(o)&&(xa.delete(o),n(new Error(Ja.requestTimeout)))},3e4)})}function pl(e){return nn("requestData",{query:e||{}})}function ht(e,t,a,o){return nn("executeAction",{actionKey:e,targetId:t,input:a,parameters:o})}async function Of(e,t,a,o,r){let n=await r.arrayBuffer();return nn("executeFileAction",{actionKey:e,targetId:t,input:a,parameters:o,file:{name:r.name,type:r.type,size:r.size,buffer:n}},[n])}function Nf(e,t){return nn("invokeClientCommand",{commandKey:e,payload:t})}function ie(e,t){Mo("notify",{level:e,message:t})}function rn(){let e=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,window.innerHeight||0,720);Mo("resize",{height:e,viewportBound:!0})}function Xe(e){return e?e.payload!==void 0?e.payload:e.data!==void 0?e.data:e.result!==void 0?e.result:e:null}function Rt(e,t){return e?typeof e=="string"?e:String(t||"").toLowerCase().startsWith("en")?e.en_US||e.en||e.zh_Hans||e.zh_CN||"":e.zh_Hans||e.zh_CN||e.en_US||e.en||"":""}function Be(e){return e?.message?e.message:String(e||Ja.unknownError)}function Ff(e){Ja={...Ja,...e}}function Bf(e,t){let a=null;function o(r){window.XpertRemoteUI&&typeof window.XpertRemoteUI.applyTheme=="function"&&window.XpertRemoteUI.applyTheme(r),a={...a||{},theme:r},e(a),setTimeout(rn,0)}window.addEventListener("message",r=>{let n=r.data;if(!(!fl(n)||n.channel!==Ef||n.protocolVersion!==1)){if(n.type==="init"){on=typeof n.instanceId=="string"?n.instanceId:null,a={manifest:n.manifest,payload:n.payload,initialQuery:n.initialQuery||{},locale:n.locale,theme:n.theme},window.XpertRemoteUI&&typeof window.XpertRemoteUI.applyTheme=="function"&&window.XpertRemoteUI.applyTheme(n.theme),e(a),setTimeout(rn,0);return}if(n.instanceId===on){if(oC(n)){o(rC(n));return}if(n.type==="hostEvent"){t(n.event);return}if(n.requestId&&xa.has(String(n.requestId))){let s=xa.get(String(n.requestId));if(xa.delete(String(n.requestId)),!s)return;n.type==="error"?s.reject(new Error(String(n.message||Ja.remoteRequestFailed))):s.resolve(n)}}}})}function oC(e){return["theme","themeChanged","theme-change","hostThemeChanged","host-theme-changed"].includes(String(e.type||""))}function rC(e){return e.theme!==void 0?e.theme:fl(e.payload)&&e.payload.theme!==void 0?e.payload.theme:fl(e.data)&&e.data.theme!==void 0?e.data.theme:e.payload??e.data??null}var nC=`flowchart TD
  A[User Request] --> B[Agent Plans Lucidchart Draft]
  B --> C{Best Path?}
  C -->|Structured import| D[Save Standard Import]
  C -->|Still exploring| E[Save Mermaid Draft]
  C -->|Already in Lucid| F[Register Lucid URL]`,Do=new Set(["lucidchart_create_document","lucidchart_save_standard_import_version","lucidchart_patch_standard_import","lucidchart_save_mermaid_draft","lucidchart_register_external_document","lucidchart_search_documents","lucidchart_get_document","lucidchart_update_document_status","lucidchart_report_failure"]),sC=new Set(["lucidchart_create_document","lucidchart_save_standard_import_version","lucidchart_patch_standard_import","lucidchart_save_mermaid_draft","lucidchart_register_external_document","lucidchart_update_document_status","lucidchart_report_failure"]),hl=["diagram","flowchart","architecture","process","wireframe","orgchart","network","other"];Ml({styleId:"lucidchart-workbench-shadcn-ui-vars"});Df();function lC(){let[e,t]=J.useState(null),[a,o]=J.useState([]),[r,n]=J.useState(null),[s,l]=J.useState(""),[i,c]=J.useState(""),[d,u]=J.useState(""),[f,m]=J.useState(!1),[g,p]=J.useState(!1),[v,w]=J.useState(!1),[L,I]=J.useState(""),[y,T]=J.useState(""),[E,k]=J.useState("diagram"),[_,V]=J.useState(""),[W,K]=J.useState(""),[F,Z]=J.useState("diagram"),[$,ae]=J.useState(!1),[X,Y]=J.useState(""),[q,O]=J.useState(""),[ee,ne]=J.useState(()=>sn(ml("Untitled"))),[we,ke]=J.useState(nC),[Re,_e]=J.useState(""),[Le,G]=J.useState(""),[re,Se]=J.useState(""),[le,ue]=J.useState(""),[ge,$e]=J.useState("preview"),[Me,Za]=J.useState("info"),[He,Qa]=J.useState(()=>Hf()),[Pt,zf]=J.useState(()=>Hf()),ga=J.useRef(null),ot=J.useRef(null),Tt=J.useRef(""),fn=J.useRef(""),kt=J.useRef(""),Cl=J.useRef(0),bl=J.useRef(""),P=dl(e?.locale);J.useEffect(()=>{Ff({requestTimeout:P("requestTimeout"),remoteRequestFailed:P("remoteRequestFailed"),unknownError:P("unknownError")})},[e?.locale]),J.useEffect(()=>{Tt.current=s},[s]),J.useEffect(()=>{fn.current=i},[i]),J.useEffect(()=>{kt.current=d},[d]),J.useEffect(()=>{Bf(b=>{ot.current=b,t(b),Wf(b.payload||null),setTimeout(()=>Oe(),0)},b=>{Gf(b)}),Mo("ready")},[]),J.useEffect(rn,[a,r,f,g,$,ge,Me,He,Pt]);function Wf(b){if(b){if(Array.isArray(b.items)){o(b.items),!Tt.current&&b.items[0]?.id&&Ue(b.items[0].id);return}b.item&&Ll(b)}}function Ll(b){n(b);let z=b.item?.id||"";Tt.current=z,l(z),Y("");let Q=b.currentVersion||null,be=b.item?.title||P("untitled"),rt=Ao(b.item?.kind);V(be),K(typeof b.item?.description=="string"?b.item.description:""),Z(rt),ae(!1);let Mt=ve(Q?.standardImport)?Q?.standardImport:ml(be),ao=sn(Mt);ne(ao);let yl=typeof Q?.mermaidSource=="string"?Q.mermaidSource:"",Rl=ln(Q?.lucidDocumentId,b.item?.lucidDocumentId),Pl=ln(Q?.lucidDocumentUrl,b.item?.lucidDocumentUrl),Tl=ln(Q?.embedUrl,b.item?.embedUrl),kl=ln(Q?.previewUrl,b.item?.previewUrl);ke(yl),_e(Rl),G(Pl),Se(Tl),ue(kl),bl.current=_f(ao,yl,Rl,Pl,Tl,kl),p(!1)}async function Gf(b){let z=bC(b);if(z&&!Do.has(z))return;let Q=++Cl.current,be=LC(b),rt=await Oe();if(Q!==Cl.current)return;let Mt=!be&&(z==="lucidchart_create_document"||z==="lucidchart_save_mermaid_draft"&&!Tt.current),ao=be??(Mt?rt[0]?.id:Tt.current)??rt[0]?.id;ao&&await Ue(ao),(!z||sC.has(z))&&ie("info",dl(ot.current?.locale)("agentDocumentUpdated"))}async function Oe(b={}){let z=b.search??fn.current,Q=b.status??kt.current;m(!0);try{let be=await pl({page:1,pageSize:50,search:z,parameters:{...Q?{status:Q}:{}}}),rt=Xe(be)||{},Mt=Array.isArray(rt.items)?rt.items:[];return o(Mt),!Tt.current&&Mt[0]?.id&&await Ue(Mt[0].id),Mt}catch(be){return ie("error",Be(be)),[]}finally{m(!1)}}async function Ue(b){if(!b)return null;m(!0);try{let z=await pl({parameters:{documentId:b}}),Q=Xe(z)||{};return Ll(Q),Q}catch(z){return ie("error",Be(z)),null}finally{m(!1)}}function pn(){return g||$}function Eo(){return!pn()||window.confirm(P("discardUnsavedChanges"))}async function jf(b){b!==Tt.current&&Eo()&&await Ue(b)}async function Kf(){let b=L.trim()||P("untitled");m(!0);try{let z=await ht("create_document",null,{title:b,description:y,kind:E}),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("documentCreated"));let be=Q?.item?.id||Q?.data?.item?.id;I(""),T(""),k("diagram"),w(!1),Y(""),be?(await Oe(),await Ue(be)):await Oe()}catch(z){ie("error",Be(z))}finally{m(!1)}}async function Xf(){if(!s){ie("warning",P("noDocument"));return}let b=_.trim();if(!b){ie("warning",P("titleRequired"));return}m(!0);try{let z=await ht("update_document_metadata",s,{documentId:s,title:b,description:W,kind:F,changeSummary:X.trim()||void 0}),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("metadataSaved")),ae(!1),Y(""),await Ue(s),await Oe()}catch(z){ie("error",Be(z))}finally{m(!1)}}async function $f(){if(!s){ie("warning",P("noDocument"));return}let b=cn(ee);if(b.error||!b.value){ie("error",`${P("invalidJson")}: ${b.error||P("unknownError")}`);return}m(!0);try{let z=await ht("save_standard_import_version",s,{documentId:s,standardImport:b.value,mermaidSource:we.trim()||void 0,lucidDocumentId:Re.trim()||void 0,lucidDocumentUrl:Le.trim()||void 0,embedUrl:re.trim()||void 0,previewUrl:le.trim()||void 0,product:"lucidchart",importFileName:`${r?.item?.title||"document"}.json`,changeSummary:X.trim()||void 0}),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("operationCompleted")),Y(""),await Ue(s),await Oe()}catch(z){ie("error",Be(z))}finally{m(!1)}}async function Yf(){let b=we.trim();if(b){m(!0);try{let z=await ht("save_mermaid_draft",s||null,{documentId:s||void 0,title:_.trim()||r?.item?.title||P("untitled"),description:W,kind:F,mermaidSource:b,changeSummary:X.trim()||void 0}),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("operationCompleted"));let be=Q?.document?.item?.id||Q?.data?.document?.item?.id||s;Y(""),await Oe(),be&&await Ue(be)}catch(z){ie("error",Be(z))}finally{m(!1)}}}async function Jf(){if(!s&&!_.trim()){ie("warning",P("noDocument"));return}m(!0);try{let b=await ht("register_external_document",s||null,{documentId:s||void 0,title:_.trim()||r?.item?.title||P("untitled"),description:W,kind:F,lucidDocumentId:Re.trim()||void 0,lucidDocumentUrl:Le.trim()||void 0,embedUrl:re.trim()||void 0,previewUrl:le.trim()||void 0,product:"lucidchart",changeSummary:X.trim()||void 0}),z=Xe(b);ie("success",Rt(z?.message,ot.current?.locale)||P("operationCompleted"));let Q=z?.document?.item?.id||z?.data?.document?.item?.id||s;Y(""),await Oe(),Q&&await Ue(Q)}catch(b){ie("error",Be(b))}finally{m(!1)}}async function Zf(b){if(!(!s||!b)&&Eo()){m(!0);try{let z=await ht("restore_version",s,{documentId:s,versionId:b,changeSummary:X.trim()||void 0}),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("operationCompleted")),await Ue(s),await Oe()}catch(z){ie("error",Be(z))}finally{m(!1)}}}async function Qf(){if(s&&!(!Eo()||!window.confirm(P("confirmArchive")))){m(!0);try{await ht("archive_document",s,{documentId:s}),ie("success",P("operationCompleted")),n(null),l(""),await Oe()}catch(b){ie("error",Be(b))}finally{m(!1)}}}async function Il(b){if(s){m(!0);try{let z=await ht(b==="reviewed"?"mark_reviewed":"mark_draft",s,{documentId:s,reason:X.trim()||void 0}),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("operationCompleted")),Y(""),await Ue(s),await Oe(kt.current&&kt.current!==b?{status:""}:{}),kt.current&&kt.current!==b&&(kt.current="",u(""))}catch(z){ie("error",Be(z))}finally{m(!1)}}}async function ep(){let b=q.trim();if(b){m(!0);try{let z=await ht("prepare_agent_draw_message",s||null,{documentId:s||void 0,prompt:b}),Q=Xe(z),be=Q?.data?.commandKey||Q?.commandKey,rt=Q?.data?.payload||Q?.payload;be&&rt&&await Nf(be,rt),O(""),ie("success",P("operationCompleted"))}catch(z){ie("error",Be(z))}finally{m(!1)}}}async function tp(b){if(b){if(pn()&&!window.confirm(P("discardUnsavedChanges"))){ga.current&&(ga.current.value="");return}m(!0);try{let z=await Of("import_standard_import_file",s||null,{documentId:s||void 0,title:IC(b.name)},{documentId:s||void 0},b),Q=Xe(z);ie("success",Rt(Q?.message,ot.current?.locale)||P("operationCompleted"));let be=Q?.data?.item?.id||Q?.item?.id||s;await Oe(),be&&await Ue(be)}catch(z){ie("error",Be(z))}finally{m(!1),ga.current&&(ga.current.value="")}}}function mn(b){ne(b),va({standardImportText:b})}function ap(b){ke(b),va({mermaidSource:b})}function op(b){G(b),va({lucidDocumentUrl:b})}function rp(b){Se(b),va({embedUrl:b})}function np(b){_e(b),va({lucidDocumentId:b})}function sp(b){ue(b),va({previewUrl:b})}function va(b={}){if(!Tt.current){p(!1);return}let z=_f(b.standardImportText??ee,b.mermaidSource??we,b.lucidDocumentId??Re,b.lucidDocumentUrl??Le,b.embedUrl??re,b.previewUrl??le);p(z!==bl.current)}function lp(){let b=cn(ee);if(b.error||!b.value){ie("error",`${P("invalidJson")}: ${b.error||P("unknownError")}`);return}SC(new Blob([JSON.stringify(b.value,null,2)],{type:"application/json"}),`${r?.item?.title||"document"}.json`)}function ip(){let b=cn(ee);if(b.error||!b.value){ie("error",`${P("invalidJson")}: ${b.error||P("unknownError")}`);return}mn(sn(b.value))}function cp(){let b=r?.item?.title||P("untitled"),z=ve(Oo?.standardImport)?Oo.standardImport:ml(b);mn(sn(z))}function up(b){V(b),ae(!0)}function dp(b){K(b),ae(!0)}function fp(b){Z(b),ae(!0)}function pp(){Eo()&&w(!0)}let Oo=r?.currentVersion||null,No=r?.item?.status||"draft",eo=re.trim(),Fo=le.trim(),Sl=eo||Le.trim(),Bo=J.useMemo(()=>cn(ee),[ee]),_o=J.useMemo(()=>pC(ee),[ee]),to=!!(Bo.value&&!Bo.error),mp=!!(s&&g&&!f&&to),hp=r?.item?.title||P("untitled"),xp=`lw-shell ${He?"left-collapsed":""} ${Pt?"right-collapsed":""}`,gp=P(eo?"embedPreview":Fo?"imagePreview":_o?"standardImportPreview":"saved");return C("div",{className:xp},C(Xi,{open:v,onOpenChange:w},C(Un,{className:"lw-dialog"},C(qn,null,C(zn,null,P("newDocument"))),C("div",{className:"lw-dialog-stack"},C(dt,{value:L,placeholder:P("title"),onChange:b=>I(b.target.value)}),C(ha,{value:y,placeholder:P("description"),onChange:b=>T(b.target.value)}),C(qr,{value:E,onValueChange:b=>k(Ao(b))},C(yo,{"aria-label":P("kind")},C(Vr,{placeholder:P("kind")})),C(Ro,null,hl.map(b=>C(jt,{value:b,key:b},P(b)))))),C(Vn,null,C(Ce,{type:"button",variant:"outline",disabled:f,onClick:()=>w(!1)},P("cancel")),C(Ce,{type:"button",disabled:f,onClick:Kf},C(Yt,{className:"lw-button-icon","aria-hidden":"true"}),P("create"))))),C(zr,{className:"lw-sidebar",side:"left",collapsed:He},C(Wr,null,C(Xr,{variant:"ghost",size:"icon","aria-label":P(He?"expandDocuments":"collapseDocuments"),title:P(He?"expandDocuments":"collapseDocuments"),onClick:()=>Qa(b=>!b)},He?C(bt,{className:"lw-button-icon","aria-hidden":"true"}):C(Ct,{className:"lw-button-icon","aria-hidden":"true"})),He?null:C(J.Fragment,null,C(jr,null,P("documents")),C(st,{variant:"secondary"},a.length))),He?C(Kr,null,C("span",null,P("documents"))):C(Gr,null,C("div",{className:"lw-sidebar-controls"},C(dt,{value:i,placeholder:P("search"),onChange:b=>{let z=b.target.value;fn.current=z,c(z),Oe({search:z})}}),C(qr,{value:d||"all",onValueChange:b=>{let z=b==="all"?"":b;kt.current=z,u(z),Oe({status:z})}},C(yo,{"aria-label":P("allStatuses")},C(Vr,{placeholder:P("allStatuses")})),C(Ro,null,C(jt,{value:"all"},P("allStatuses")),C(jt,{value:"draft"},P("draft")),C(jt,{value:"reviewed"},P("reviewed")),C(jt,{value:"archived"},P("archived"))))),C(kr,{className:"lw-list"},C(Vs,null,a.map(b=>C(zs,{key:b.id},C(Ws,{type:"button",active:b.id===s,onClick:()=>jf(b.id)},C("span",{className:"lw-item-title"},b.title||P("untitled")),C("span",{className:"lw-item-meta"},"v",b.currentVersionNumber||0," \xB7 ",P(b.status||"draft")," \xB7 ",P(Ao(b.kind)))))))))),C("main",{className:"lw-main"},C("div",{className:"lw-toolbar"},C("div",{className:"lw-toolbar-title"},C("div",{className:"lw-title-text"},s?hp:P("workbenchTitle")),C("div",{className:"lw-title-meta"},s?C(J.Fragment,null,C(st,{variant:"secondary"},P(No)),C(st,{variant:"secondary"},"v",r?.item?.currentVersionNumber||0),C(st,{variant:"secondary"},P(Ao(r?.item?.kind))),Oo?.sourceType?C(st,{variant:"secondary"},Oo.sourceType):null):C("span",null,P("noDocument")))),C("div",{className:"lw-toolbar-actions"},C(Ce,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:pp},C(Yt,{className:"lw-button-icon","aria-hidden":"true"}),P("newDocument")),C(Ce,{type:"button",size:"sm",disabled:!mp,onClick:$f},C(Ot,{className:"lw-button-icon","aria-hidden":"true"}),P("save")),C(Ce,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:()=>ga.current?.click()},C(Aa,{className:"lw-button-icon","aria-hidden":"true"}),P("import")),C(Ce,{type:"button",variant:"outline",size:"sm",disabled:!s||!to,onClick:lp},C(Ra,{className:"lw-button-icon","aria-hidden":"true"}),P("exportJson")),C(Ce,{type:"button",variant:"outline",size:"sm",disabled:!Sl,onClick:()=>window.open(Sl,"_blank","noopener,noreferrer")},C($t,{className:"lw-button-icon","aria-hidden":"true"}),P("openLucid")),C(st,{className:"lw-status",variant:g?"warning":"secondary"},pn()?P("dirty"):P("saved"))),C("input",{ref:ga,className:"lw-hidden-file",type:"file",accept:".json,application/json",onChange:b=>tp(b.target.files?.[0]||null)})),C("div",{className:"lw-stage"},s||r?.item?C("div",{className:"lw-editor-pane"},C(rl,{className:"lw-tabs",value:ge,onValueChange:b=>$e(b)},C("div",{className:"lw-editor-header"},C(en,null,C(pt,{value:"preview"},C(Pa,{className:"lw-button-icon","aria-hidden":"true"}),P("preview")),C(pt,{value:"json"},C($t,{className:"lw-button-icon","aria-hidden":"true"}),P("json")),C(pt,{value:"mermaid"},P("mermaid")),C(pt,{value:"links"},P("links"))),C(st,{variant:eo||Fo||_o?"success":"secondary"},gp)),C(mt,{className:"lw-tab-content",value:"preview"},C("div",{className:"lw-visual-frame"},eo?C("iframe",{title:"Lucidchart embed",src:eo}):Fo?C("img",{src:Fo,alt:P("imagePreview")}):_o?C(dC,{model:_o}):C("div",{className:"lw-embed-empty"},P("previewUnavailable")))),C(mt,{className:"lw-tab-content lw-json-tab",value:"json"},C("div",{className:"lw-tab-toolbar"},C("div",{className:"lw-inline-badges"},C(st,{variant:to?"success":"warning"},P(to?"jsonValid":"jsonInvalid")),Bo.error?C("span",{className:"lw-muted"},Bo.error):null),C("div",{className:"lw-inline-actions"},C(Ce,{type:"button",variant:"outline",size:"sm",disabled:!to,onClick:ip},P("formatJson")),C(Ce,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:cp},C(Et,{className:"lw-button-icon","aria-hidden":"true"}),P("revertJson")))),C(ha,{className:"lw-json-editor",value:ee,onChange:b=>mn(b.target.value)})),C(mt,{className:"lw-tab-content lw-form-tab",value:"mermaid"},C("section",{className:"lw-section"},C("div",{className:"lw-section-title"},P("mermaid")),C(ha,{className:"lw-tall-textarea",value:we,onChange:b=>ap(b.target.value)}),C("div",{className:"lw-muted"},P("standardImportNotice")),C("div",{className:"lw-inline-actions"},C(Ce,{type:"button",disabled:f||!we.trim(),onClick:Yf},C(Ot,{className:"lw-button-icon","aria-hidden":"true"}),P("saveMermaid"))))),C(mt,{className:"lw-tab-content lw-form-tab",value:"links"},C("section",{className:"lw-section"},C("div",{className:"lw-section-title"},P("externalDocument")),C(dt,{value:Le,placeholder:P("lucidDocumentUrl"),onChange:b=>op(b.target.value)}),C(dt,{value:re,placeholder:P("embedUrl"),onChange:b=>rp(b.target.value)}),C(dt,{value:Re,placeholder:P("lucidDocumentId"),onChange:b=>np(b.target.value)}),C(dt,{value:le,placeholder:P("previewUrl"),onChange:b=>sp(b.target.value)}),C("div",{className:"lw-inline-actions"},C(Ce,{type:"button",disabled:f||!Re.trim()&&!Le.trim()&&!re.trim(),onClick:Jf},P("registerExternal"))))))):C("div",{className:"lw-empty"},P("noDocument")))),C(zr,{className:"lw-inspector",side:"right",collapsed:Pt},C(Wr,null,Pt?null:C(jr,{className:"lw-sidebar-title-truncate"},r?.item?.title||P("inspector")),C(Xr,{className:"lw-sidebar-trigger-right",variant:"ghost",size:"icon","aria-label":P(Pt?"expandInspector":"collapseInspector"),title:P(Pt?"expandInspector":"collapseInspector"),onClick:()=>zf(b=>!b)},Pt?C(ka,{className:"lw-button-icon","aria-hidden":"true"}):C(Ta,{className:"lw-button-icon","aria-hidden":"true"}))),Pt?C(Kr,null,C("span",null,P("inspector"))):C(Gr,null,C(kr,{className:"lw-inspector-scroll"},C(rl,{className:"lw-inspector-tabs",value:Me,onValueChange:b=>Za(b)},C(en,{className:"lw-inspector-tabs-list"},C(pt,{value:"info"},P("info")),C(pt,{value:"versions"},P("versions")),C(pt,{value:"activity"},P("activity")),C(pt,{value:"assistant"},P("assistant"))),C(mt,{className:"lw-inspector-stack",value:"info"},C("section",{className:"lw-section"},C("div",{className:"lw-section-title"},P("documentInfo")),C(dt,{value:_,placeholder:P("title"),onChange:b=>up(b.target.value)}),C(ha,{value:W,placeholder:P("description"),onChange:b=>dp(b.target.value)}),C(qr,{value:F,onValueChange:b=>fp(Ao(b))},C(yo,{"aria-label":P("kind")},C(Vr,{placeholder:P("kind")})),C(Ro,null,hl.map(b=>C(jt,{value:b,key:b},P(b)))))),C("section",{className:"lw-section"},C("div",{className:"lw-section-title"},P("changeSummary")),C(dt,{value:X,placeholder:P("changeSummary"),onChange:b=>Y(b.target.value)})),C("div",{className:"lw-inline-actions"},C(Ce,{type:"button",disabled:f||!s||!$,onClick:Xf},C(Ot,{className:"lw-button-icon","aria-hidden":"true"}),P("saveMetadata")),No==="archived"?C(st,{variant:"secondary"},P("archived")):No==="reviewed"?C(Ce,{type:"button",variant:"outline",disabled:f||!s,onClick:()=>Il("draft")},C(Et,{className:"lw-button-icon","aria-hidden":"true"}),P("backToDraft")):C(Ce,{type:"button",variant:"outline",disabled:f||!s,onClick:()=>Il("reviewed")},C(qe,{className:"lw-button-icon","aria-hidden":"true"}),P("markReviewed")),C(Ce,{type:"button",variant:"destructiveOutline",disabled:f||!s||No==="archived",onClick:Qf},C(Ia,{className:"lw-button-icon","aria-hidden":"true"}),P("archive")))),C(mt,{className:"lw-inspector-stack",value:"versions"},(r?.versions||[]).length?(r?.versions||[]).map(b=>C("div",{className:"lw-version",key:b.id},C("div",null,C("div",null,"v",b.versionNumber),C("div",{className:"lw-muted"},b.sourceType||"workbench"),b.changeSummary?C("div",{className:"lw-muted"},b.changeSummary):null),C(Ce,{className:"lw-version-action",type:"button",variant:"outline",size:"icon",title:P("restore"),"aria-label":`${P("restore")} v${b.versionNumber}`,disabled:f,onClick:()=>Zf(b.id)},C(Et,{className:"lw-button-icon","aria-hidden":"true"})))):C("div",{className:"lw-empty-state"},P("noVersions"))),C(mt,{className:"lw-inspector-stack",value:"activity"},(r?.logs||[]).length?(r?.logs||[]).map(b=>C("div",{className:"lw-log",key:b.id||`${b.action}-${b.createdAt}`},C("div",{className:"lw-log-title"},uC(b)),C("div",{className:"lw-muted"},cC(b.createdAt)),b.message?C("div",{className:"lw-log-message"},b.message):null,b.errorMessage?C("div",{className:"lw-log-error"},b.errorMessage):null)):C("div",{className:"lw-empty-state"},P("noActivity"))),C(mt,{className:"lw-inspector-stack",value:"assistant"},C("section",{className:"lw-section"},C("div",{className:"lw-section-title"},P("drawingRequest")),C(ha,{className:"lw-tall-textarea",value:q,placeholder:P("drawingRequest"),onChange:b=>O(b.target.value)}),C(Ce,{type:"button",disabled:f||!q.trim(),onClick:ep},C(Ma,{className:"lw-button-icon","aria-hidden":"true"}),P("askAssistant")))))))))}function ml(e){return{title:e,product:"lucidchart",pages:[{id:"page-1",title:"Page 1",shapes:[],lines:[]}]}}function sn(e){return JSON.stringify(e,null,2)}function _f(e,t,a,o,r,n){return JSON.stringify({standardImportText:iC(e),mermaidSource:t.replace(/\r\n/g,`
`),lucidDocumentId:a,lucidDocumentUrl:o,embedUrl:r,previewUrl:n})}function iC(e){try{return JSON.stringify(JSON.parse(e))}catch{return e}}function ln(...e){for(let t of e)if(typeof t=="string"&&t.trim())return t.trim();return""}function ve(e){return!!(e&&typeof e=="object"&&!Array.isArray(e))}function cn(e){try{let t=JSON.parse(e);return ve(t)?{value:t,error:null}:{value:null,error:"Expected a JSON object."}}catch(t){return{value:null,error:t instanceof Error&&t.message?t.message:"Invalid JSON."}}}function Ao(e){return hl.includes(e)?e:"diagram"}function cC(e){if(!e)return"";let t=new Date(String(e));return Number.isNaN(t.getTime())?String(e):t.toLocaleString()}function uC(e){let t=typeof e.action=="string"&&e.action.trim()?e.action.trim():"activity",a=typeof e.actorType=="string"&&e.actorType.trim()?e.actorType.trim():"";return a?`${t} \xB7 ${a}`:t}function Hf(){return typeof window<"u"&&window.innerWidth<1040}function dC({model:e}){return C("div",{className:"lw-standard-preview"},C("svg",{viewBox:e.viewBox,role:"img","aria-label":"Lucidchart Standard Import preview"},C("defs",null,C("marker",{id:"lw-standard-preview-arrow",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth"},C("path",{d:"M 0 0 L 8 4 L 0 8 z",fill:"var(--xps-muted-foreground)"}))),e.lines.map(t=>C("g",{key:t.id},C("line",{x1:t.x1,y1:t.y1,x2:t.x2,y2:t.y2,stroke:t.strokeColor,strokeWidth:t.strokeWidth,strokeLinecap:"round",markerEnd:"url(#lw-standard-preview-arrow)"}),t.text?C("text",{className:"lw-preview-line-label",x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2-8,textAnchor:"middle"},CC(t.text,32)):null)),e.shapes.map(t=>{let a=vC(t.text||t.id),o=t.y+t.h/2-(a.length-1)*15/2;return C("g",{key:t.id},fC(t),C("text",{className:"lw-preview-label",textAnchor:"middle",dominantBaseline:"middle"},a.map((r,n)=>C("tspan",{key:`${t.id}-${n}`,x:t.x+t.w/2,y:o+n*15},r))))})))}function fC(e){let t=e.type.toLowerCase();if(t.includes("diamond")||t.includes("rhombus")||t.includes("decision")){let a=[`${e.x+e.w/2},${e.y}`,`${e.x+e.w},${e.y+e.h/2}`,`${e.x+e.w/2},${e.y+e.h}`,`${e.x},${e.y+e.h/2}`].join(" ");return C("polygon",{className:"lw-preview-shape",points:a,fill:e.fillColor,stroke:e.strokeColor,strokeWidth:e.strokeWidth})}return t.includes("circle")||t.includes("ellipse")||t.includes("terminator")?C("ellipse",{className:"lw-preview-shape",cx:e.x+e.w/2,cy:e.y+e.h/2,rx:e.w/2,ry:e.h/2,fill:e.fillColor,stroke:e.strokeColor,strokeWidth:e.strokeWidth}):C("rect",{className:"lw-preview-shape",x:e.x,y:e.y,width:e.w,height:e.h,rx:e.cornerRadius,fill:e.fillColor,stroke:e.strokeColor,strokeWidth:e.strokeWidth})}function pC(e){let t=Vf(e);if(!ve(t))return null;let a=ve(t.standardImport)?t.standardImport:t,o=[],r=[];xl(a,o,r,0,new WeakSet);let n=o.map((c,d)=>mC(c,d)).filter(c=>!!c),s=new Map(n.map(c=>[c.id,c])),l=r.map((c,d)=>hC(c,d,s)).filter(c=>!!c);if(!n.length&&!l.length)return null;let i=gC(n,l);return{shapes:n,lines:l,viewBox:`${i.x} ${i.y} ${i.w} ${i.h}`}}function xl(e,t,a,o,r){if(!(o>7||e==null)){if(Array.isArray(e)){e.forEach(n=>xl(n,t,a,o+1,r));return}if(ve(e)&&!r.has(e)){if(r.add(e),xC(e)){a.push(e);return}if(vl(e)){t.push(e);return}["pages","layers","groups","children","items","objects","blocks","shapes","lines","connectors"].forEach(n=>xl(e[n],t,a,o+1,r))}}}function mC(e,t){let a=vl(e);if(!a)return null;let o=wl(e.format,e.style,e.styles,e.properties),r=at(e.id,e.uuid,e.shapeId,e.name)||`shape-${t+1}`,n=at(e.text,e.label,e.name,e.title)||r;return{id:r,x:a.x,y:a.y,w:a.w,h:a.h,text:n,type:at(e.type,e.shape,e.shapeType,e.class,e.name)||"rect",fillColor:at(e.fillColor,o?.fillColor,o?.fill,o?.backgroundColor,e.backgroundColor)||"#eff6ff",strokeColor:at(e.strokeColor,o?.strokeColor,o?.stroke,o?.borderColor,e.borderColor)||"#2563eb",strokeWidth:Te(e.strokeWidth,o?.strokeWidth,o?.borderWidth)??1.5,cornerRadius:Te(e.cornerRadius,o?.cornerRadius,e.radius,o?.radius)??8}}function hC(e,t,a){let o=dn(e,["fromId","sourceId","startShapeId","startId","from","source","start"]),r=dn(e,["toId","targetId","endShapeId","endId","to","target","end"]),n=o?a.get(o):null,s=r?a.get(r):null,l=n?Uf(n):un(e,["start","fromPoint","sourcePoint","p1","endpoint1"]),i=s?Uf(s):un(e,["end","toPoint","targetPoint","p2","endpoint2"]),c=vl(e),d=l?.x??Te(e.x1,e.startX,e.fromX)??c?.x,u=l?.y??Te(e.y1,e.startY,e.fromY)??c?.y,f=i?.x??Te(e.x2,e.endX,e.toX)??(c?c.x+c.w:null),m=i?.y??Te(e.y2,e.endY,e.toY)??(c?c.y+c.h:null);if(![d,u,f,m].every(p=>typeof p=="number"&&Number.isFinite(p)))return null;let g=wl(e.format,e.style,e.styles,e.properties);return{id:at(e.id,e.uuid,e.lineId,e.name)||`line-${t+1}`,x1:d,y1:u,x2:f,y2:m,text:at(e.text,e.label,e.name,e.title)||"",strokeColor:at(e.strokeColor,g?.strokeColor,g?.stroke,e.color)||"#64748b",strokeWidth:Te(e.strokeWidth,g?.strokeWidth,e.width)??1.5}}function xC(e){let t=(at(e.type,e.shape,e.shapeType,e.class)||"").toLowerCase(),a=["line","arrow","connector","straightline","elbowline"].includes(t)||t.includes("connector")||t.includes("arrow")||t.includes("straight_line")||t.includes("elbow_line"),o=!!dn(e,["fromId","sourceId","startShapeId","startId","from","source","start"])&&!!dn(e,["toId","targetId","endShapeId","endId","to","target","end"]),r=Te(e.x1,e.startX,e.fromX)!=null&&Te(e.y1,e.startY,e.fromY)!=null&&Te(e.x2,e.endX,e.toX)!=null&&Te(e.y2,e.endY,e.toY)!=null,n=!!un(e,["start","fromPoint","sourcePoint","p1","endpoint1"])&&!!un(e,["end","toPoint","targetPoint","p2","endpoint2"]);return o||r||n||a}function vl(e){let t=wl(e.bounds,e.boundingBox,e.box,e.geometry,e.position),a=Te(e.x,e.left,t?.x,t?.left),o=Te(e.y,e.top,t?.y,t?.top),r=Te(e.w,e.width,t?.w,t?.width),n=Te(e.h,e.height,t?.h,t?.height);return[a,o,r,n].every(s=>typeof s=="number"&&Number.isFinite(s))&&r>0&&n>0?{x:a,y:o,w:r,h:n}:null}function un(e,t){for(let a of t){let o=e[a];if(ve(o)){let r=Te(o.x,o.left),n=Te(o.y,o.top);if(typeof r=="number"&&typeof n=="number")return{x:r,y:n}}}return null}function dn(e,t){for(let a of t){let o=e[a],r=at(o);if(r)return r;if(ve(o)){let n=at(o.id,o.shapeId,o.nodeId,o.ref,o.reference);if(n)return n}}return null}function Uf(e){return{x:e.x+e.w/2,y:e.y+e.h/2}}function gC(e,t){let a=Number.POSITIVE_INFINITY,o=Number.POSITIVE_INFINITY,r=Number.NEGATIVE_INFINITY,n=Number.NEGATIVE_INFINITY;if(e.forEach(l=>{a=Math.min(a,l.x),o=Math.min(o,l.y),r=Math.max(r,l.x+l.w),n=Math.max(n,l.y+l.h)}),t.forEach(l=>{a=Math.min(a,l.x1,l.x2),o=Math.min(o,l.y1,l.y2),r=Math.max(r,l.x1,l.x2),n=Math.max(n,l.y1,l.y2)}),![a,o,r,n].every(Number.isFinite))return{x:0,y:0,w:800,h:360};let s=48;return{x:a-s,y:o-s,w:Math.max(360,r-a+s*2),h:Math.max(220,n-o+s*2)}}function wl(...e){return e.find(ve)||null}function at(...e){for(let t of e){if(typeof t=="string"&&t.trim())return t.trim();if(typeof t=="number"&&Number.isFinite(t))return String(t)}return""}function Te(...e){for(let t of e){if(typeof t=="number"&&Number.isFinite(t))return t;if(typeof t=="string"&&t.trim()){let a=Number(t);if(Number.isFinite(a))return a}}return null}function vC(e){return e.replace(/\r\n/g,`
`).split(`
`).flatMap(t=>wC(t.trim(),18)).filter(Boolean).slice(0,5)}function wC(e,t){if(!e)return[];let a=[];for(let o=0;o<e.length;o+=t)a.push(e.slice(o,o+t));return a}function CC(e,t){return e.length>t?`${e.slice(0,t-1)}...`:e}function bC(e){for(let t of qf(e)){if(!ve(t))continue;let a=ce(t,"toolName")??ce(t,"tool_name")??ce(t,"name");if(a&&Do.has(a))return a;let o=t.tool;if(ve(o)){let n=ce(o,"name")??ce(o,"toolName")??ce(o,"tool_name");if(n&&Do.has(n))return n}if(ve(t.function)){let n=ce(t.function,"name")??ce(t.function,"toolName")??ce(t.function,"tool_name");if(n&&Do.has(n))return n}let r=t.toolCall??t.tool_call;if(ve(r)){let n=ce(r,"name")??ce(r,"toolName")??ce(r,"tool_name")??(ve(r.function)?ce(r.function,"name"):null);if(n&&Do.has(n))return n}}return null}function LC(e){for(let t of qf(e)){if(!ve(t))continue;let a=ce(t,"documentId")??ce(t,"document_id")??ce(t,"lucidchartDocumentId")??ce(t,"lucidchart_document_id")??ce(t,"drawingId");if(a)return a;if(ve(t.item)){let o=ce(t.item,"id");if(o)return o}if(ve(t.document)){let o=ce(t.document,"documentId")??ce(t.document,"document_id")??ce(t.document,"id")??(ve(t.document.item)?ce(t.document.item,"id"):null);if(o)return o}if(ve(t.version)){let o=ce(t.version,"documentId")??ce(t.version,"document_id");if(o)return o}if(Array.isArray(t.items)){let o=t.items.find(ve);if(o){let r=ce(o,"id")??ce(o,"documentId")??ce(o,"document_id");if(r)return r}}}return null}function qf(e){let t=[];return gl(e,t,0,new WeakSet),t}function gl(e,t,a,o){if(a>5||e==null)return;let r=Vf(e);if(!((ve(r)||Array.isArray(r))&&o.has(r))){if((ve(r)||Array.isArray(r))&&o.add(r),t.push(r),Array.isArray(r)){r.forEach(n=>gl(n,t,a+1,o));return}ve(r)&&["payload","metadata","data","result","output","content","message","detail","response","document","documents","item","items","version","versions","toolResult","tool_result","toolResponse","tool_response","resultText","text","tool","toolCall","tool_call","function","arguments","args","input"].forEach(n=>gl(r[n],t,a+1,o))}}function Vf(e){if(typeof e!="string")return e;let t=e.trim();if(!t||!t.startsWith("{")&&!t.startsWith("["))return e;try{return JSON.parse(t)}catch{return e}}function ce(e,t){let a=e[t];return typeof a=="string"&&a.trim()?a.trim():null}function IC(e){return e.replace(/\.(lucid|lucidchart|json)(?:\.json)?$/i,"").replace(/document$/i,"Lucidchart Document")||e}function SC(e,t){let a=URL.createObjectURL(e),o=document.createElement("a");o.href=a,o.download=t,document.body.appendChild(o),o.click(),o.remove(),URL.revokeObjectURL(a)}var yC=Af.createRoot(document.getElementById("root"));yC.render(C(lC,null));})();
