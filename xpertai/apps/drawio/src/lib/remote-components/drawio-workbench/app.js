;
"use strict";(()=>{var Xd=Object.defineProperty;var Kd=(e,t)=>{for(var a in t)Xd(e,a,{get:t[a],enumerable:!0})};function ks(e={}){let t=e.styleId??"xpert-plugin-shadcn-ui-vars";if(typeof document>"u"||document.getElementById(t))return;let a=document.createElement("style");a.id=t,a.textContent=`
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
  `,document.head.appendChild(a)}function Ds(e){var t,a,o="";if(typeof e=="string"||typeof e=="number")o+=e;else if(typeof e=="object")if(Array.isArray(e)){var r=e.length;for(t=0;t<r;t++)e[t]&&(a=Ds(e[t]))&&(o&&(o+=" "),o+=a)}else for(a in e)e[a]&&(o&&(o+=" "),o+=a);return o}function po(){for(var e,t,a=0,o="",r=arguments.length;a<r;a++)(e=arguments[a])&&(t=Ds(e))&&(o&&(o+=" "),o+=t);return o}var jd=e=>{let t=Yd(e),{conflictingClassGroups:a,conflictingClassGroupModifiers:o}=e;return{getClassGroupId:s=>{let l=s.split("-");return l[0]===""&&l.length!==1&&l.shift(),Fs(l,t)||$d(s)},getConflictingClassGroupIds:(s,l)=>{let i=a[s]||[];return l&&o[s]?[...i,...o[s]]:i}}},Fs=(e,t)=>{if(e.length===0)return t.classGroupId;let a=e[0],o=t.nextPart.get(a),r=o?Fs(e.slice(1),o):void 0;if(r)return r;if(t.validators.length===0)return;let n=e.join("-");return t.validators.find(({validator:s})=>s(n))?.classGroupId},Es=/^\[(.+)\]$/,$d=e=>{if(Es.test(e)){let t=Es.exec(e)[1],a=t?.substring(0,t.indexOf(":"));if(a)return"arbitrary.."+a}},Yd=e=>{let{theme:t,prefix:a}=e,o={nextPart:new Map,validators:[]};return Jd(Object.entries(e.classGroups),a).forEach(([n,s])=>{Er(s,o,n,t)}),o},Er=(e,t,a,o)=>{e.forEach(r=>{if(typeof r=="string"){let n=r===""?t:Os(t,r);n.classGroupId=a;return}if(typeof r=="function"){if(Zd(r)){Er(r(o),t,a,o);return}t.validators.push({validator:r,classGroupId:a});return}Object.entries(r).forEach(([n,s])=>{Er(s,Os(t,n),a,o)})})},Os=(e,t)=>{let a=e;return t.split("-").forEach(o=>{a.nextPart.has(o)||a.nextPart.set(o,{nextPart:new Map,validators:[]}),a=a.nextPart.get(o)}),a},Zd=e=>e.isThemeGetter,Jd=(e,t)=>t?e.map(([a,o])=>{let r=o.map(n=>typeof n=="string"?t+n:typeof n=="object"?Object.fromEntries(Object.entries(n).map(([s,l])=>[t+s,l])):n);return[a,r]}):e,Qd=e=>{if(e<1)return{get:()=>{},set:()=>{}};let t=0,a=new Map,o=new Map,r=(n,s)=>{a.set(n,s),t++,t>e&&(t=0,o=a,a=new Map)};return{get(n){let s=a.get(n);if(s!==void 0)return s;if((s=o.get(n))!==void 0)return r(n,s),s},set(n,s){a.has(n)?a.set(n,s):r(n,s)}}};var ef=e=>{let{separator:t,experimentalParseClassName:a}=e,o=t.length===1,r=t[0],n=t.length,s=l=>{let i=[],c=0,d=0,u;for(let g=0;g<l.length;g++){let w=l[g];if(c===0){if(w===r&&(o||l.slice(g,g+n)===t)){i.push(l.slice(d,g)),d=g+n;continue}if(w==="/"){u=g;continue}}w==="["?c++:w==="]"&&c--}let f=i.length===0?l:l.substring(d),m=f.startsWith("!"),v=m?f.substring(1):f,p=u&&u>d?u-d:void 0;return{modifiers:i,hasImportantModifier:m,baseClassName:v,maybePostfixModifierPosition:p}};return a?l=>a({className:l,parseClassName:s}):s},tf=e=>{if(e.length<=1)return e;let t=[],a=[];return e.forEach(o=>{o[0]==="["?(t.push(...a.sort(),o),a=[]):a.push(o)}),t.push(...a.sort()),t},af=e=>({cache:Qd(e.cacheSize),parseClassName:ef(e),...jd(e)}),of=/\s+/,rf=(e,t)=>{let{parseClassName:a,getClassGroupId:o,getConflictingClassGroupIds:r}=t,n=[],s=e.trim().split(of),l="";for(let i=s.length-1;i>=0;i-=1){let c=s[i],{modifiers:d,hasImportantModifier:u,baseClassName:f,maybePostfixModifierPosition:m}=a(c),v=!!m,p=o(v?f.substring(0,m):f);if(!p){if(!v){l=c+(l.length>0?" "+l:l);continue}if(p=o(f),!p){l=c+(l.length>0?" "+l:l);continue}v=!1}let g=tf(d).join(":"),w=u?g+"!":g,C=w+p;if(n.includes(C))continue;n.push(C);let L=r(p,v);for(let I=0;I<L.length;++I){let R=L[I];n.push(w+R)}l=c+(l.length>0?" "+l:l)}return l};function nf(){let e=0,t,a,o="";for(;e<arguments.length;)(t=arguments[e++])&&(a=Bs(t))&&(o&&(o+=" "),o+=a);return o}var Bs=e=>{if(typeof e=="string")return e;let t,a="";for(let o=0;o<e.length;o++)e[o]&&(t=Bs(e[o]))&&(a&&(a+=" "),a+=t);return a};function sf(e,...t){let a,o,r,n=s;function s(i){let c=t.reduce((d,u)=>u(d),e());return a=af(c),o=a.cache.get,r=a.cache.set,n=l,l(i)}function l(i){let c=o(i);if(c)return c;let d=rf(i,a);return r(i,d),d}return function(){return n(nf.apply(null,arguments))}}var pe=e=>{let t=a=>a[e]||[];return t.isThemeGetter=!0,t},Ns=/^\[(?:([a-z-]+):)?(.+)\]$/i,lf=/^\d+\/\d+$/,uf=new Set(["px","full","screen"]),cf=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,df=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,ff=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,pf=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,mf=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,at=e=>Qt(e)||uf.has(e)||lf.test(e),pt=e=>ea(e,"length",Sf),Qt=e=>!!e&&!Number.isNaN(Number(e)),Dr=e=>ea(e,"number",Qt),_a=e=>!!e&&Number.isInteger(Number(e)),hf=e=>e.endsWith("%")&&Qt(e.slice(0,-1)),ee=e=>Ns.test(e),mt=e=>cf.test(e),xf=new Set(["length","size","percentage"]),gf=e=>ea(e,xf,_s),vf=e=>ea(e,"position",_s),wf=new Set(["image","url"]),Cf=e=>ea(e,wf,bf),Lf=e=>ea(e,"",If),Ha=()=>!0,ea=(e,t,a)=>{let o=Ns.exec(e);return o?o[1]?typeof t=="string"?o[1]===t:t.has(o[1]):a(o[2]):!1},Sf=e=>df.test(e)&&!ff.test(e),_s=()=>!1,If=e=>pf.test(e),bf=e=>mf.test(e);var Rf=()=>{let e=pe("colors"),t=pe("spacing"),a=pe("blur"),o=pe("brightness"),r=pe("borderColor"),n=pe("borderRadius"),s=pe("borderSpacing"),l=pe("borderWidth"),i=pe("contrast"),c=pe("grayscale"),d=pe("hueRotate"),u=pe("invert"),f=pe("gap"),m=pe("gradientColorStops"),v=pe("gradientColorStopPositions"),p=pe("inset"),g=pe("margin"),w=pe("opacity"),C=pe("padding"),L=pe("saturate"),I=pe("scale"),R=pe("sepia"),D=pe("skew"),y=pe("space"),H=pe("translate"),z=()=>["auto","contain","none"],V=()=>["auto","hidden","clip","visible","scroll"],G=()=>["auto",ee,t],F=()=>[ee,t],$=()=>["",at,pt],j=()=>["auto",Qt,ee],re=()=>["bottom","center","left","left-bottom","left-top","right","right-bottom","right-top","top"],X=()=>["solid","dashed","dotted","double","none"],J=()=>["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"],U=()=>["start","end","center","between","around","evenly","stretch"],E=()=>["","0",ee],Q=()=>["auto","avoid","all","avoid-page","page","left","right","column"],te=()=>[Qt,ee];return{cacheSize:500,separator:":",theme:{colors:[Ha],spacing:[at,pt],blur:["none","",mt,ee],brightness:te(),borderColor:[e],borderRadius:["none","","full",mt,ee],borderSpacing:F(),borderWidth:$(),contrast:te(),grayscale:E(),hueRotate:te(),invert:E(),gap:F(),gradientColorStops:[e],gradientColorStopPositions:[hf,pt],inset:G(),margin:G(),opacity:te(),padding:F(),saturate:te(),scale:te(),sepia:E(),skew:te(),space:F(),translate:F()},classGroups:{aspect:[{aspect:["auto","square","video",ee]}],container:["container"],columns:[{columns:[mt]}],"break-after":[{"break-after":Q()}],"break-before":[{"break-before":Q()}],"break-inside":[{"break-inside":["auto","avoid","avoid-page","avoid-column"]}],"box-decoration":[{"box-decoration":["slice","clone"]}],box:[{box:["border","content"]}],display:["block","inline-block","inline","flex","inline-flex","table","inline-table","table-caption","table-cell","table-column","table-column-group","table-footer-group","table-header-group","table-row-group","table-row","flow-root","grid","inline-grid","contents","list-item","hidden"],float:[{float:["right","left","none","start","end"]}],clear:[{clear:["left","right","both","none","start","end"]}],isolation:["isolate","isolation-auto"],"object-fit":[{object:["contain","cover","fill","none","scale-down"]}],"object-position":[{object:[...re(),ee]}],overflow:[{overflow:V()}],"overflow-x":[{"overflow-x":V()}],"overflow-y":[{"overflow-y":V()}],overscroll:[{overscroll:z()}],"overscroll-x":[{"overscroll-x":z()}],"overscroll-y":[{"overscroll-y":z()}],position:["static","fixed","absolute","relative","sticky"],inset:[{inset:[p]}],"inset-x":[{"inset-x":[p]}],"inset-y":[{"inset-y":[p]}],start:[{start:[p]}],end:[{end:[p]}],top:[{top:[p]}],right:[{right:[p]}],bottom:[{bottom:[p]}],left:[{left:[p]}],visibility:["visible","invisible","collapse"],z:[{z:["auto",_a,ee]}],basis:[{basis:G()}],"flex-direction":[{flex:["row","row-reverse","col","col-reverse"]}],"flex-wrap":[{flex:["wrap","wrap-reverse","nowrap"]}],flex:[{flex:["1","auto","initial","none",ee]}],grow:[{grow:E()}],shrink:[{shrink:E()}],order:[{order:["first","last","none",_a,ee]}],"grid-cols":[{"grid-cols":[Ha]}],"col-start-end":[{col:["auto",{span:["full",_a,ee]},ee]}],"col-start":[{"col-start":j()}],"col-end":[{"col-end":j()}],"grid-rows":[{"grid-rows":[Ha]}],"row-start-end":[{row:["auto",{span:[_a,ee]},ee]}],"row-start":[{"row-start":j()}],"row-end":[{"row-end":j()}],"grid-flow":[{"grid-flow":["row","col","dense","row-dense","col-dense"]}],"auto-cols":[{"auto-cols":["auto","min","max","fr",ee]}],"auto-rows":[{"auto-rows":["auto","min","max","fr",ee]}],gap:[{gap:[f]}],"gap-x":[{"gap-x":[f]}],"gap-y":[{"gap-y":[f]}],"justify-content":[{justify:["normal",...U()]}],"justify-items":[{"justify-items":["start","end","center","stretch"]}],"justify-self":[{"justify-self":["auto","start","end","center","stretch"]}],"align-content":[{content:["normal",...U(),"baseline"]}],"align-items":[{items:["start","end","center","baseline","stretch"]}],"align-self":[{self:["auto","start","end","center","stretch","baseline"]}],"place-content":[{"place-content":[...U(),"baseline"]}],"place-items":[{"place-items":["start","end","center","baseline","stretch"]}],"place-self":[{"place-self":["auto","start","end","center","stretch"]}],p:[{p:[C]}],px:[{px:[C]}],py:[{py:[C]}],ps:[{ps:[C]}],pe:[{pe:[C]}],pt:[{pt:[C]}],pr:[{pr:[C]}],pb:[{pb:[C]}],pl:[{pl:[C]}],m:[{m:[g]}],mx:[{mx:[g]}],my:[{my:[g]}],ms:[{ms:[g]}],me:[{me:[g]}],mt:[{mt:[g]}],mr:[{mr:[g]}],mb:[{mb:[g]}],ml:[{ml:[g]}],"space-x":[{"space-x":[y]}],"space-x-reverse":["space-x-reverse"],"space-y":[{"space-y":[y]}],"space-y-reverse":["space-y-reverse"],w:[{w:["auto","min","max","fit","svw","lvw","dvw",ee,t]}],"min-w":[{"min-w":[ee,t,"min","max","fit"]}],"max-w":[{"max-w":[ee,t,"none","full","min","max","fit","prose",{screen:[mt]},mt]}],h:[{h:[ee,t,"auto","min","max","fit","svh","lvh","dvh"]}],"min-h":[{"min-h":[ee,t,"min","max","fit","svh","lvh","dvh"]}],"max-h":[{"max-h":[ee,t,"min","max","fit","svh","lvh","dvh"]}],size:[{size:[ee,t,"auto","min","max","fit"]}],"font-size":[{text:["base",mt,pt]}],"font-smoothing":["antialiased","subpixel-antialiased"],"font-style":["italic","not-italic"],"font-weight":[{font:["thin","extralight","light","normal","medium","semibold","bold","extrabold","black",Dr]}],"font-family":[{font:[Ha]}],"fvn-normal":["normal-nums"],"fvn-ordinal":["ordinal"],"fvn-slashed-zero":["slashed-zero"],"fvn-figure":["lining-nums","oldstyle-nums"],"fvn-spacing":["proportional-nums","tabular-nums"],"fvn-fraction":["diagonal-fractions","stacked-fractions"],tracking:[{tracking:["tighter","tight","normal","wide","wider","widest",ee]}],"line-clamp":[{"line-clamp":["none",Qt,Dr]}],leading:[{leading:["none","tight","snug","normal","relaxed","loose",at,ee]}],"list-image":[{"list-image":["none",ee]}],"list-style-type":[{list:["none","disc","decimal",ee]}],"list-style-position":[{list:["inside","outside"]}],"placeholder-color":[{placeholder:[e]}],"placeholder-opacity":[{"placeholder-opacity":[w]}],"text-alignment":[{text:["left","center","right","justify","start","end"]}],"text-color":[{text:[e]}],"text-opacity":[{"text-opacity":[w]}],"text-decoration":["underline","overline","line-through","no-underline"],"text-decoration-style":[{decoration:[...X(),"wavy"]}],"text-decoration-thickness":[{decoration:["auto","from-font",at,pt]}],"underline-offset":[{"underline-offset":["auto",at,ee]}],"text-decoration-color":[{decoration:[e]}],"text-transform":["uppercase","lowercase","capitalize","normal-case"],"text-overflow":["truncate","text-ellipsis","text-clip"],"text-wrap":[{text:["wrap","nowrap","balance","pretty"]}],indent:[{indent:F()}],"vertical-align":[{align:["baseline","top","middle","bottom","text-top","text-bottom","sub","super",ee]}],whitespace:[{whitespace:["normal","nowrap","pre","pre-line","pre-wrap","break-spaces"]}],break:[{break:["normal","words","all","keep"]}],hyphens:[{hyphens:["none","manual","auto"]}],content:[{content:["none",ee]}],"bg-attachment":[{bg:["fixed","local","scroll"]}],"bg-clip":[{"bg-clip":["border","padding","content","text"]}],"bg-opacity":[{"bg-opacity":[w]}],"bg-origin":[{"bg-origin":["border","padding","content"]}],"bg-position":[{bg:[...re(),vf]}],"bg-repeat":[{bg:["no-repeat",{repeat:["","x","y","round","space"]}]}],"bg-size":[{bg:["auto","cover","contain",gf]}],"bg-image":[{bg:["none",{"gradient-to":["t","tr","r","br","b","bl","l","tl"]},Cf]}],"bg-color":[{bg:[e]}],"gradient-from-pos":[{from:[v]}],"gradient-via-pos":[{via:[v]}],"gradient-to-pos":[{to:[v]}],"gradient-from":[{from:[m]}],"gradient-via":[{via:[m]}],"gradient-to":[{to:[m]}],rounded:[{rounded:[n]}],"rounded-s":[{"rounded-s":[n]}],"rounded-e":[{"rounded-e":[n]}],"rounded-t":[{"rounded-t":[n]}],"rounded-r":[{"rounded-r":[n]}],"rounded-b":[{"rounded-b":[n]}],"rounded-l":[{"rounded-l":[n]}],"rounded-ss":[{"rounded-ss":[n]}],"rounded-se":[{"rounded-se":[n]}],"rounded-ee":[{"rounded-ee":[n]}],"rounded-es":[{"rounded-es":[n]}],"rounded-tl":[{"rounded-tl":[n]}],"rounded-tr":[{"rounded-tr":[n]}],"rounded-br":[{"rounded-br":[n]}],"rounded-bl":[{"rounded-bl":[n]}],"border-w":[{border:[l]}],"border-w-x":[{"border-x":[l]}],"border-w-y":[{"border-y":[l]}],"border-w-s":[{"border-s":[l]}],"border-w-e":[{"border-e":[l]}],"border-w-t":[{"border-t":[l]}],"border-w-r":[{"border-r":[l]}],"border-w-b":[{"border-b":[l]}],"border-w-l":[{"border-l":[l]}],"border-opacity":[{"border-opacity":[w]}],"border-style":[{border:[...X(),"hidden"]}],"divide-x":[{"divide-x":[l]}],"divide-x-reverse":["divide-x-reverse"],"divide-y":[{"divide-y":[l]}],"divide-y-reverse":["divide-y-reverse"],"divide-opacity":[{"divide-opacity":[w]}],"divide-style":[{divide:X()}],"border-color":[{border:[r]}],"border-color-x":[{"border-x":[r]}],"border-color-y":[{"border-y":[r]}],"border-color-s":[{"border-s":[r]}],"border-color-e":[{"border-e":[r]}],"border-color-t":[{"border-t":[r]}],"border-color-r":[{"border-r":[r]}],"border-color-b":[{"border-b":[r]}],"border-color-l":[{"border-l":[r]}],"divide-color":[{divide:[r]}],"outline-style":[{outline:["",...X()]}],"outline-offset":[{"outline-offset":[at,ee]}],"outline-w":[{outline:[at,pt]}],"outline-color":[{outline:[e]}],"ring-w":[{ring:$()}],"ring-w-inset":["ring-inset"],"ring-color":[{ring:[e]}],"ring-opacity":[{"ring-opacity":[w]}],"ring-offset-w":[{"ring-offset":[at,pt]}],"ring-offset-color":[{"ring-offset":[e]}],shadow:[{shadow:["","inner","none",mt,Lf]}],"shadow-color":[{shadow:[Ha]}],opacity:[{opacity:[w]}],"mix-blend":[{"mix-blend":[...J(),"plus-lighter","plus-darker"]}],"bg-blend":[{"bg-blend":J()}],filter:[{filter:["","none"]}],blur:[{blur:[a]}],brightness:[{brightness:[o]}],contrast:[{contrast:[i]}],"drop-shadow":[{"drop-shadow":["","none",mt,ee]}],grayscale:[{grayscale:[c]}],"hue-rotate":[{"hue-rotate":[d]}],invert:[{invert:[u]}],saturate:[{saturate:[L]}],sepia:[{sepia:[R]}],"backdrop-filter":[{"backdrop-filter":["","none"]}],"backdrop-blur":[{"backdrop-blur":[a]}],"backdrop-brightness":[{"backdrop-brightness":[o]}],"backdrop-contrast":[{"backdrop-contrast":[i]}],"backdrop-grayscale":[{"backdrop-grayscale":[c]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[d]}],"backdrop-invert":[{"backdrop-invert":[u]}],"backdrop-opacity":[{"backdrop-opacity":[w]}],"backdrop-saturate":[{"backdrop-saturate":[L]}],"backdrop-sepia":[{"backdrop-sepia":[R]}],"border-collapse":[{border:["collapse","separate"]}],"border-spacing":[{"border-spacing":[s]}],"border-spacing-x":[{"border-spacing-x":[s]}],"border-spacing-y":[{"border-spacing-y":[s]}],"table-layout":[{table:["auto","fixed"]}],caption:[{caption:["top","bottom"]}],transition:[{transition:["none","all","","colors","opacity","shadow","transform",ee]}],duration:[{duration:te()}],ease:[{ease:["linear","in","out","in-out",ee]}],delay:[{delay:te()}],animate:[{animate:["none","spin","ping","pulse","bounce",ee]}],transform:[{transform:["","gpu","none"]}],scale:[{scale:[I]}],"scale-x":[{"scale-x":[I]}],"scale-y":[{"scale-y":[I]}],rotate:[{rotate:[_a,ee]}],"translate-x":[{"translate-x":[H]}],"translate-y":[{"translate-y":[H]}],"skew-x":[{"skew-x":[D]}],"skew-y":[{"skew-y":[D]}],"transform-origin":[{origin:["center","top","top-right","right","bottom-right","bottom","bottom-left","left","top-left",ee]}],accent:[{accent:["auto",e]}],appearance:[{appearance:["none","auto"]}],cursor:[{cursor:["auto","default","pointer","wait","text","move","help","not-allowed","none","context-menu","progress","cell","crosshair","vertical-text","alias","copy","no-drop","grab","grabbing","all-scroll","col-resize","row-resize","n-resize","e-resize","s-resize","w-resize","ne-resize","nw-resize","se-resize","sw-resize","ew-resize","ns-resize","nesw-resize","nwse-resize","zoom-in","zoom-out",ee]}],"caret-color":[{caret:[e]}],"pointer-events":[{"pointer-events":["none","auto"]}],resize:[{resize:["none","y","x",""]}],"scroll-behavior":[{scroll:["auto","smooth"]}],"scroll-m":[{"scroll-m":F()}],"scroll-mx":[{"scroll-mx":F()}],"scroll-my":[{"scroll-my":F()}],"scroll-ms":[{"scroll-ms":F()}],"scroll-me":[{"scroll-me":F()}],"scroll-mt":[{"scroll-mt":F()}],"scroll-mr":[{"scroll-mr":F()}],"scroll-mb":[{"scroll-mb":F()}],"scroll-ml":[{"scroll-ml":F()}],"scroll-p":[{"scroll-p":F()}],"scroll-px":[{"scroll-px":F()}],"scroll-py":[{"scroll-py":F()}],"scroll-ps":[{"scroll-ps":F()}],"scroll-pe":[{"scroll-pe":F()}],"scroll-pt":[{"scroll-pt":F()}],"scroll-pr":[{"scroll-pr":F()}],"scroll-pb":[{"scroll-pb":F()}],"scroll-pl":[{"scroll-pl":F()}],"snap-align":[{snap:["start","end","center","align-none"]}],"snap-stop":[{snap:["normal","always"]}],"snap-type":[{snap:["none","x","y","both"]}],"snap-strictness":[{snap:["mandatory","proximity"]}],touch:[{touch:["auto","none","manipulation"]}],"touch-x":[{"touch-pan":["x","left","right"]}],"touch-y":[{"touch-pan":["y","up","down"]}],"touch-pz":["touch-pinch-zoom"],select:[{select:["none","text","all","auto"]}],"will-change":[{"will-change":["auto","scroll","contents","transform",ee]}],fill:[{fill:[e,"none"]}],"stroke-w":[{stroke:[at,pt,Dr]}],stroke:[{stroke:[e,"none"]}],sr:["sr-only","not-sr-only"],"forced-color-adjust":[{"forced-color-adjust":["auto","none"]}]},conflictingClassGroups:{overflow:["overflow-x","overflow-y"],overscroll:["overscroll-x","overscroll-y"],inset:["inset-x","inset-y","start","end","top","right","bottom","left"],"inset-x":["right","left"],"inset-y":["top","bottom"],flex:["basis","grow","shrink"],gap:["gap-x","gap-y"],p:["px","py","ps","pe","pt","pr","pb","pl"],px:["pr","pl"],py:["pt","pb"],m:["mx","my","ms","me","mt","mr","mb","ml"],mx:["mr","ml"],my:["mt","mb"],size:["w","h"],"font-size":["leading"],"fvn-normal":["fvn-ordinal","fvn-slashed-zero","fvn-figure","fvn-spacing","fvn-fraction"],"fvn-ordinal":["fvn-normal"],"fvn-slashed-zero":["fvn-normal"],"fvn-figure":["fvn-normal"],"fvn-spacing":["fvn-normal"],"fvn-fraction":["fvn-normal"],"line-clamp":["display","overflow"],rounded:["rounded-s","rounded-e","rounded-t","rounded-r","rounded-b","rounded-l","rounded-ss","rounded-se","rounded-ee","rounded-es","rounded-tl","rounded-tr","rounded-br","rounded-bl"],"rounded-s":["rounded-ss","rounded-es"],"rounded-e":["rounded-se","rounded-ee"],"rounded-t":["rounded-tl","rounded-tr"],"rounded-r":["rounded-tr","rounded-br"],"rounded-b":["rounded-br","rounded-bl"],"rounded-l":["rounded-tl","rounded-bl"],"border-spacing":["border-spacing-x","border-spacing-y"],"border-w":["border-w-s","border-w-e","border-w-t","border-w-r","border-w-b","border-w-l"],"border-w-x":["border-w-r","border-w-l"],"border-w-y":["border-w-t","border-w-b"],"border-color":["border-color-s","border-color-e","border-color-t","border-color-r","border-color-b","border-color-l"],"border-color-x":["border-color-r","border-color-l"],"border-color-y":["border-color-t","border-color-b"],"scroll-m":["scroll-mx","scroll-my","scroll-ms","scroll-me","scroll-mt","scroll-mr","scroll-mb","scroll-ml"],"scroll-mx":["scroll-mr","scroll-ml"],"scroll-my":["scroll-mt","scroll-mb"],"scroll-p":["scroll-px","scroll-py","scroll-ps","scroll-pe","scroll-pt","scroll-pr","scroll-pb","scroll-pl"],"scroll-px":["scroll-pr","scroll-pl"],"scroll-py":["scroll-pt","scroll-pb"],touch:["touch-x","touch-y","touch-pz"],"touch-x":["touch"],"touch-y":["touch"],"touch-pz":["touch"]},conflictingClassGroupModifiers:{"font-size":["leading"]}}};var Hs=sf(Rf);function O(...e){return Hs(po(e))}var q={};Kd(q,{Children:()=>$e,Component:()=>Pf,Fragment:()=>ze,Profiler:()=>Mf,PureComponent:()=>Tf,StrictMode:()=>Af,Suspense:()=>kf,cloneElement:()=>ot,createContext:()=>rt,createElement:()=>S,createFactory:()=>Df,createRef:()=>Ef,default:()=>yf,forwardRef:()=>x,isValidElement:()=>ta,lazy:()=>Of,memo:()=>Ff,startTransition:()=>Bf,useCallback:()=>_,useContext:()=>nt,useDebugValue:()=>Nf,useDeferredValue:()=>_f,useEffect:()=>k,useId:()=>Hf,useImperativeHandle:()=>Uf,useInsertionEffect:()=>qf,useLayoutEffect:()=>Pt,useMemo:()=>me,useReducer:()=>aa,useRef:()=>b,useState:()=>T,useSyncExternalStore:()=>Vf,useTransition:()=>zf,version:()=>Wf});var se=window.React,yf=se,$e=se.Children,Pf=se.Component,ze=se.Fragment,Mf=se.Profiler,Tf=se.PureComponent,Af=se.StrictMode,kf=se.Suspense,ot=se.cloneElement,rt=se.createContext,S=se.createElement,Df=se.createFactory,Ef=se.createRef,x=se.forwardRef,ta=se.isValidElement,Of=se.lazy,Ff=se.memo,Bf=se.startTransition,_=se.useCallback,nt=se.useContext,Nf=se.useDebugValue,_f=se.useDeferredValue,k=se.useEffect,Hf=se.useId,Uf=se.useImperativeHandle,qf=se.useInsertionEffect,Pt=se.useLayoutEffect,me=se.useMemo,aa=se.useReducer,b=se.useRef,T=se.useState,Vf=se.useSyncExternalStore,zf=se.useTransition,Wf=se.version;var Us=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),mo=(...e)=>e.filter((t,a,o)=>!!t&&t.trim()!==""&&o.indexOf(t)===a).join(" ").trim();var qs={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};var Vs=x(({color:e="currentColor",size:t=24,strokeWidth:a=2,absoluteStrokeWidth:o,className:r="",children:n,iconNode:s,...l},i)=>S("svg",{ref:i,...qs,width:t,height:t,stroke:e,strokeWidth:o?Number(a)*24/Number(t):a,className:mo("lucide",r),...l},[...s.map(([c,d])=>S(c,d)),...Array.isArray(n)?n:[n]]));var le=(e,t)=>{let a=x(({className:o,...r},n)=>S(Vs,{ref:n,iconNode:t,className:mo(`lucide-${Us(e)}`,o),...r}));return a.displayName=`${e}`,a};var Gf=[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]],oa=le("Archive",Gf);var Xf=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Be=le("Check",Xf);var Kf=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],Mt=le("ChevronDown",Kf);var jf=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],ra=le("ChevronRight",jf);var $f=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],na=le("ChevronUp",$f);var Yf=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],Ua=le("Circle",Yf);var Zf=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1",key:"1oajmo"}],["path",{d:"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",key:"mpwhp6"}]],Tt=le("FileJson",Zf);var Jf=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],st=le("PanelLeftClose",Jf);var Qf=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m14 9 3 3-3 3",key:"8010ee"}]],lt=le("PanelLeftOpen",Qf);var ep=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m8 9 3 3-3 3",key:"12hl5m"}]],sa=le("PanelRightClose",ep);var tp=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m10 15-3-3 3-3",key:"1pgupc"}]],la=le("PanelRightOpen",tp);var ap=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],ia=le("Plus",ap);var op=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],At=le("RotateCcw",op);var rp=[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",key:"1c8476"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",key:"1ydtos"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7",key:"t51u73"}]],ua=le("Save",rp);var np=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],ca=le("Send",np);var sp=[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"17 8 12 3 7 8",key:"t8dd8p"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15",key:"widbto"}]],da=le("Upload",sp);var lp=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],kt=le("X",lp);var zs=e=>typeof e=="boolean"?`${e}`:e===0?"0":e,Ws=po,ho=(e,t)=>a=>{var o;if(t?.variants==null)return Ws(e,a?.class,a?.className);let{variants:r,defaultVariants:n}=t,s=Object.keys(r).map(c=>{let d=a?.[c],u=n?.[c];if(d===null)return null;let f=zs(d)||zs(u);return r[c][f]}),l=a&&Object.entries(a).reduce((c,d)=>{let[u,f]=d;return f===void 0||(c[u]=f),c},{}),i=t==null||(o=t.compoundVariants)===null||o===void 0?void 0:o.reduce((c,d)=>{let{class:u,className:f,...m}=d;return Object.entries(m).every(v=>{let[p,g]=v;return Array.isArray(g)?g.includes({...n,...l}[p]):{...n,...l}[p]===g})?[...c,u,f]:c},[]);return Ws(e,s,i,a?.class,a?.className)};var ip=ho("xps-badge",{variants:{variant:{default:"xps-badge--default",secondary:"xps-badge--secondary",success:"xps-badge--success",warning:"xps-badge--warning",destructive:"xps-badge--destructive"}},defaultVariants:{variant:"default"}});function qa({className:e,variant:t,...a}){return S("span",{className:O(ip({variant:t}),e),...a})}function Gs(e,t){if(typeof e=="function")return e(t);e!=null&&(e.current=t)}function Va(...e){return t=>{let a=!1,o=e.map(r=>{let n=Gs(r,t);return!a&&typeof n=="function"&&(a=!0),n});if(a)return()=>{for(let r=0;r<o.length;r++){let n=o[r];typeof n=="function"?n():Gs(e[r],null)}}}}function K(...e){return _(Va(...e),e)}function Ne(e){let t=x((a,o)=>{let{children:r,...n}=a,s=null,l=!1,i=[];Xs(r)&&typeof xo=="function"&&(r=xo(r._payload)),$e.forEach(r,f=>{if(fp(f)){l=!0;let m=f,v="child"in m.props?m.props.child:m.props.children;Xs(v)&&typeof xo=="function"&&(v=xo(v._payload)),s=up(m,v),i.push(s?.props?.children)}else i.push(f)}),s?s=ot(s,void 0,i):!l&&$e.count(r)===1&&ta(r)&&(s=r);let c=s?dp(s):void 0,d=K(o,c);if(!s){if(r||r===0)throw new Error(l?xp(e):hp(e));return r}let u=cp(n,s.props??{});return s.type!==ze&&(u.ref=o?d:c),ot(s,u)});return t.displayName=`${e}.Slot`,t}var Ks=Ne("Slot"),js=Symbol.for("radix.slottable");function $s(e){let t=a=>"child"in a?a.children(a.child):a.children;return t.displayName=`${e}.Slottable`,t.__radixId=js,t}var up=(e,t)=>{if("child"in e.props){let a=e.props.child;return ta(a)?ot(a,void 0,e.props.children(a.props.children)):null}return ta(t)?t:null};function cp(e,t){let a={...t};for(let o in t){let r=e[o],n=t[o];/^on[A-Z]/.test(o)?r&&n?a[o]=(...l)=>{let i=n(...l);return r(...l),i}:r&&(a[o]=r):o==="style"?a[o]={...r,...n}:o==="className"&&(a[o]=[r,n].filter(Boolean).join(" "))}return{...e,...a}}function dp(e){let t=Object.getOwnPropertyDescriptor(e.props,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning;return a?e.ref:(t=Object.getOwnPropertyDescriptor(e,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning,a?e.props.ref:e.props.ref||e.ref)}function fp(e){return ta(e)&&typeof e.type=="function"&&"__radixId"in e.type&&e.type.__radixId===js}var pp=Symbol.for("react.lazy");function Xs(e){return e!=null&&typeof e=="object"&&"$$typeof"in e&&e.$$typeof===pp&&"_payload"in e&&mp(e._payload)}function mp(e){return typeof e=="object"&&e!==null&&"then"in e}var hp=e=>`${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`,xp=e=>`${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`,xo=q[" use ".trim().toString()];var gp=ho("xps-button",{variants:{variant:{default:"xps-button--default",secondary:"xps-button--secondary",outline:"xps-button--outline",ghost:"xps-button--ghost",destructive:"xps-button--destructive",destructiveOutline:"xps-button--destructive-outline"},size:{default:"",sm:"xps-button--sm",lg:"xps-button--lg",icon:"xps-button--icon"}},defaultVariants:{variant:"default",size:"default"}}),Re=x(({className:e,variant:t,size:a,asChild:o=!1,type:r,...n},s)=>{let l=o?Ks:"button",i={className:O(gp({variant:t,size:a}),e),ref:s,...n};return o||(i.type=r??"button"),S(l,i)});Re.displayName="Button";var vp=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-card",e),...t}));vp.displayName="Card";var wp=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-card-header",e),...t}));wp.displayName="CardHeader";var Cp=x(({className:e,...t},a)=>S("h3",{ref:a,className:O("xps-card-title",e),...t}));Cp.displayName="CardTitle";var Lp=x(({className:e,...t},a)=>S("p",{ref:a,className:O("xps-card-description",e),...t}));Lp.displayName="CardDescription";var Sp=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-card-content",e),...t}));Sp.displayName="CardContent";var Ys=window.React,Me=Ys.Fragment;function h(e,t,a){return Ys.createElement(e,a===void 0?t:{...t,key:a})}var Ie=h;function Zs(e,t){let a=rt(t);a.displayName=e+"Context";let o=n=>{let{children:s,...l}=n,i=me(()=>l,Object.values(l));return h(a.Provider,{value:i,children:s})};o.displayName=e+"Provider";function r(n){let s=nt(a);if(s)return s;if(t!==void 0)return t;throw new Error(`\`${n}\` must be used within \`${e}\``)}return[o,r]}function ue(e,t=[]){let a=[];function o(n,s){let l=rt(s);l.displayName=n+"Context";let i=a.length;a=[...a,s];let c=u=>{let{scope:f,children:m,...v}=u,p=f?.[e]?.[i]||l,g=me(()=>v,Object.values(v));return h(p.Provider,{value:g,children:m})};c.displayName=n+"Provider";function d(u,f){let m=f?.[e]?.[i]||l,v=nt(m);if(v)return v;if(s!==void 0)return s;throw new Error(`\`${u}\` must be used within \`${n}\``)}return[c,d]}let r=()=>{let n=a.map(s=>rt(s));return function(l){let i=l?.[e]||n;return me(()=>({[`__scope${e}`]:{...l,[e]:i}}),[l,i])}};return r.scopeName=e,[o,Ip(r,...t)]}function Ip(...e){let t=e[0];if(e.length===1)return t;let a=()=>{let o=e.map(r=>({useScope:r(),scopeName:r.scopeName}));return function(n){let s=o.reduce((l,{useScope:i,scopeName:c})=>{let u=i(n)[`__scope${c}`];return{...l,...u}},{});return me(()=>({[`__scope${t.scopeName}`]:s}),[s])}};return a.scopeName=t.scopeName,a}var _C=!!(typeof window<"u"&&window.document&&window.document.createElement);function A(e,t,{checkForDefaultPrevented:a=!0}={}){return function(r){if(e?.(r),a===!1||!r.defaultPrevented)return t?.(r)}}var ce=globalThis?.document?Pt:()=>{};var bp=q[" useInsertionEffect ".trim().toString()]||ce;function Le({prop:e,defaultProp:t,onChange:a=()=>{},caller:o}){let[r,n,s]=Rp({defaultProp:t,onChange:a}),l=e!==void 0,i=l?e:r;{let d=b(e!==void 0);k(()=>{let u=d.current;u!==l&&console.warn(`${o} is changing from ${u?"controlled":"uncontrolled"} to ${l?"controlled":"uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`),d.current=l},[l,o])}let c=_(d=>{if(l){let u=yp(d)?d(e):d;u!==e&&s.current?.(u)}else n(d)},[l,e,n,s]);return[i,c]}function Rp({defaultProp:e,onChange:t}){let[a,o]=T(e),r=b(a),n=b(t);return bp(()=>{n.current=t},[t]),k(()=>{r.current!==a&&(n.current?.(a),r.current=a)},[a,r]),[a,o,n]}function yp(e){return typeof e=="function"}function ht(e){let t=b({value:e,previous:e});return me(()=>(t.current.value!==e&&(t.current.previous=t.current.value,t.current.value=e),t.current.previous),[e])}function xt(e){let[t,a]=T(void 0);return ce(()=>{if(e){a({width:e.offsetWidth,height:e.offsetHeight});let o=new ResizeObserver(r=>{if(!Array.isArray(r)||!r.length)return;let n=r[0],s,l;if("borderBoxSize"in n){let i=n.borderBoxSize,c=Array.isArray(i)?i[0]:i;s=c.inlineSize,l=c.blockSize}else s=e.offsetWidth,l=e.offsetHeight;a({width:s,height:l})});return o.observe(e,{box:"border-box"}),()=>o.unobserve(e)}else a(void 0)},[e]),t}function Pp(e,t){return aa((a,o)=>t[a][o]??a,e)}var he=e=>{let{present:t,children:a}=e,o=Mp(t),r=typeof a=="function"?a({present:o.isPresent}):$e.only(a),n=Tp(o.ref,Ap(r));return typeof a=="function"||o.isPresent?ot(r,{ref:n}):null};he.displayName="Presence";function Mp(e){let[t,a]=T(),o=b(null),r=b(e),n=b("none"),s=e?"mounted":"unmounted",[l,i]=Pp(s,{mounted:{UNMOUNT:"unmounted",ANIMATION_OUT:"unmountSuspended"},unmountSuspended:{MOUNT:"mounted",ANIMATION_END:"unmounted"},unmounted:{MOUNT:"mounted"}});return k(()=>{let c=go(o.current);n.current=l==="mounted"?c:"none"},[l]),ce(()=>{let c=o.current,d=r.current;if(d!==e){let f=n.current,m=go(c);e?i("MOUNT"):m==="none"||c?.display==="none"?i("UNMOUNT"):i(d&&f!==m?"ANIMATION_OUT":"UNMOUNT"),r.current=e}},[e,i]),ce(()=>{if(t){let c,d=t.ownerDocument.defaultView??window,u=m=>{let p=go(o.current).includes(CSS.escape(m.animationName));if(m.target===t&&p&&(i("ANIMATION_END"),!r.current)){let g=t.style.animationFillMode;t.style.animationFillMode="forwards",c=d.setTimeout(()=>{t.style.animationFillMode==="forwards"&&(t.style.animationFillMode=g)})}},f=m=>{m.target===t&&(n.current=go(o.current))};return t.addEventListener("animationstart",f),t.addEventListener("animationcancel",u),t.addEventListener("animationend",u),()=>{d.clearTimeout(c),t.removeEventListener("animationstart",f),t.removeEventListener("animationcancel",u),t.removeEventListener("animationend",u)}}else i("ANIMATION_END")},[t,i]),{isPresent:["mounted","unmountSuspended"].includes(l),ref:_(c=>{o.current=c?getComputedStyle(c):null,a(c)},[])}}function Js(e,t){if(typeof e=="function")return e(t);e!=null&&(e.current=t)}function Tp(...e){let t=b(e);return t.current=e,_(a=>{let o=t.current,r=!1,n=o.map(s=>{let l=Js(s,a);return!r&&typeof l=="function"&&(r=!0),l});if(r)return()=>{for(let s=0;s<n.length;s++){let l=n[s];typeof l=="function"?l():Js(o[s],null)}}},[])}function go(e){return e?.animationName||"none"}function Ap(e){let t=Object.getOwnPropertyDescriptor(e.props,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning;return a?e.ref:(t=Object.getOwnPropertyDescriptor(e,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning,a?e.props.ref:e.props.ref||e.ref)}var gt=window.ReactDOM;var za=gt.createPortal,vo=gt.flushSync,jC=gt.findDOMNode,$C=gt.hydrate,YC=gt.render,ZC=gt.unstable_batchedUpdates,JC=gt.unmountComponentAtNode,QC=gt.version;var kp=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","select","span","svg","ul"],N=kp.reduce((e,t)=>{let a=Ne(`Primitive.${t}`),o=x((r,n)=>{let{asChild:s,...l}=r,i=s?a:t;return typeof window<"u"&&(window[Symbol.for("radix-ui")]=!0),h(i,{...l,ref:n})});return o.displayName=`Primitive.${t}`,{...e,[t]:o}},{});function Co(e,t){e&&vo(()=>e.dispatchEvent(t))}var Lo="Checkbox",[Dp,fL]=ue(Lo),[Ep,Or]=Dp(Lo);function Op(e){let{__scopeCheckbox:t,checked:a,children:o,defaultChecked:r,disabled:n,form:s,name:l,onCheckedChange:i,required:c,value:d="on",internal_do_not_use_render:u}=e,[f,m]=Le({prop:a,defaultProp:r??!1,onChange:i,caller:Lo}),[v,p]=T(null),[g,w]=T(null),C=b(!1),L=v?!!s||!!v.closest("form"):!0,I={checked:f,disabled:n,setChecked:m,control:v,setControl:p,name:l,form:s,value:d,hasConsumerStoppedPropagationRef:C,required:c,defaultChecked:vt(r)?!1:r,isFormControl:L,bubbleInput:g,setBubbleInput:w};return h(Ep,{scope:t,...I,children:Fp(u)?u(I):o})}var Qs="CheckboxTrigger",el=x(({__scopeCheckbox:e,onKeyDown:t,onClick:a,...o},r)=>{let{control:n,value:s,disabled:l,checked:i,required:c,setControl:d,setChecked:u,hasConsumerStoppedPropagationRef:f,isFormControl:m,bubbleInput:v}=Or(Qs,e),p=K(r,d),g=b(i);return k(()=>{let w=n?.form;if(w){let C=()=>u(g.current);return w.addEventListener("reset",C),()=>w.removeEventListener("reset",C)}},[n,u]),h(N.button,{type:"button",role:"checkbox","aria-checked":vt(i)?"mixed":i,"aria-required":c,"data-state":rl(i),"data-disabled":l?"":void 0,disabled:l,value:s,...o,ref:p,onKeyDown:A(t,w=>{w.key==="Enter"&&w.preventDefault()}),onClick:A(a,w=>{u(C=>vt(C)?!0:!C),v&&m&&(f.current=w.isPropagationStopped(),f.current||w.stopPropagation())})})});el.displayName=Qs;var So=x((e,t)=>{let{__scopeCheckbox:a,name:o,checked:r,defaultChecked:n,required:s,disabled:l,value:i,onCheckedChange:c,form:d,...u}=e;return h(Op,{__scopeCheckbox:a,checked:r,defaultChecked:n,disabled:l,required:s,onCheckedChange:c,name:o,form:d,value:i,internal_do_not_use_render:({isFormControl:f})=>Ie(Me,{children:[h(el,{...u,ref:t,__scopeCheckbox:a}),f&&h(ol,{__scopeCheckbox:a})]})})});So.displayName=Lo;var tl="CheckboxIndicator",Fr=x((e,t)=>{let{__scopeCheckbox:a,forceMount:o,...r}=e,n=Or(tl,a);return h(he,{present:o||vt(n.checked)||n.checked===!0,children:h(N.span,{"data-state":rl(n.checked),"data-disabled":n.disabled?"":void 0,...r,ref:t,style:{pointerEvents:"none",...e.style}})})});Fr.displayName=tl;var al="CheckboxBubbleInput",ol=x(({__scopeCheckbox:e,...t},a)=>{let{control:o,hasConsumerStoppedPropagationRef:r,checked:n,defaultChecked:s,required:l,disabled:i,name:c,value:d,form:u,bubbleInput:f,setBubbleInput:m}=Or(al,e),v=K(a,m),p=ht(n),g=xt(o);k(()=>{let C=f;if(!C)return;let L=window.HTMLInputElement.prototype,R=Object.getOwnPropertyDescriptor(L,"checked").set,D=!r.current;if(p!==n&&R){let y=new Event("click",{bubbles:D});C.indeterminate=vt(n),R.call(C,vt(n)?!1:n),C.dispatchEvent(y)}},[f,p,n,r]);let w=b(vt(n)?!1:n);return h(N.input,{type:"checkbox","aria-hidden":!0,defaultChecked:s??w.current,required:l,disabled:i,name:c,value:d,form:u,...t,tabIndex:-1,ref:v,style:{...t.style,...g,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});ol.displayName=al;function Fp(e){return typeof e=="function"}function vt(e){return e==="indeterminate"}function rl(e){return vt(e)?"indeterminate":e?"checked":"unchecked"}var Np=x(({className:e,...t},a)=>S(So,{ref:a,className:O("xps-checkbox",e),...t},S(Fr,{className:"xps-checkbox-indicator"},S(Be,{className:"xps-icon"}))));Np.displayName=So.displayName;var _p=q[" useId ".trim().toString()]||(()=>{}),Hp=0;function we(e){let[t,a]=T(_p());return ce(()=>{e||a(o=>o??String(Hp++))},[e]),e||(t?`radix-${t}`:"")}function de(e){let t=b(e);return k(()=>{t.current=e}),me(()=>((...a)=>t.current?.(...a)),[])}function nl(e,t=globalThis?.document){let a=de(e);k(()=>{let o=r=>{r.key==="Escape"&&a(r)};return t.addEventListener("keydown",o,{capture:!0}),()=>t.removeEventListener("keydown",o,{capture:!0})},[a,t])}var Up="DismissableLayer",Br="dismissableLayer.update",qp="dismissableLayer.pointerDownOutside",Vp="dismissableLayer.focusOutside",sl,il=rt({layers:new Set,layersWithOutsidePointerEventsDisabled:new Set,branches:new Set}),it=x((e,t)=>{let{disableOutsidePointerEvents:a=!1,onEscapeKeyDown:o,onPointerDownOutside:r,onFocusOutside:n,onInteractOutside:s,onDismiss:l,...i}=e,c=nt(il),[d,u]=T(null),f=d?.ownerDocument??globalThis?.document,[,m]=T({}),v=K(t,y=>u(y)),p=Array.from(c.layers),[g]=[...c.layersWithOutsidePointerEventsDisabled].slice(-1),w=p.indexOf(g),C=d?p.indexOf(d):-1,L=c.layersWithOutsidePointerEventsDisabled.size>0,I=C>=w,R=Gp(y=>{let H=y.target,z=[...c.branches].some(V=>V.contains(H));!I||z||(r?.(y),s?.(y),y.defaultPrevented||l?.())},f),D=Xp(y=>{let H=y.target;[...c.branches].some(V=>V.contains(H))||(n?.(y),s?.(y),y.defaultPrevented||l?.())},f);return nl(y=>{C===c.layers.size-1&&(o?.(y),!y.defaultPrevented&&l&&(y.preventDefault(),l()))},f),k(()=>{if(d)return a&&(c.layersWithOutsidePointerEventsDisabled.size===0&&(sl=f.body.style.pointerEvents,f.body.style.pointerEvents="none"),c.layersWithOutsidePointerEventsDisabled.add(d)),c.layers.add(d),ll(),()=>{a&&(c.layersWithOutsidePointerEventsDisabled.delete(d),c.layersWithOutsidePointerEventsDisabled.size===0&&(f.body.style.pointerEvents=sl))}},[d,f,a,c]),k(()=>()=>{d&&(c.layers.delete(d),c.layersWithOutsidePointerEventsDisabled.delete(d),ll())},[d,c]),k(()=>{let y=()=>m({});return document.addEventListener(Br,y),()=>document.removeEventListener(Br,y)},[]),h(N.div,{...i,ref:v,style:{pointerEvents:L?I?"auto":"none":void 0,...e.style},onFocusCapture:A(e.onFocusCapture,D.onFocusCapture),onBlurCapture:A(e.onBlurCapture,D.onBlurCapture),onPointerDownCapture:A(e.onPointerDownCapture,R.onPointerDownCapture)})});it.displayName=Up;var zp="DismissableLayerBranch",Wp=x((e,t)=>{let a=nt(il),o=b(null),r=K(t,o);return k(()=>{let n=o.current;if(n)return a.branches.add(n),()=>{a.branches.delete(n)}},[a.branches]),h(N.div,{...e,ref:r})});Wp.displayName=zp;function Gp(e,t=globalThis?.document){let a=de(e),o=b(!1),r=b(()=>{});return k(()=>{let n=l=>{if(l.target&&!o.current){let c=function(){ul(qp,a,d,{discrete:!0})};var i=c;let d={originalEvent:l};l.pointerType==="touch"?(t.removeEventListener("click",r.current),r.current=c,t.addEventListener("click",r.current,{once:!0})):c()}else t.removeEventListener("click",r.current);o.current=!1},s=window.setTimeout(()=>{t.addEventListener("pointerdown",n)},0);return()=>{window.clearTimeout(s),t.removeEventListener("pointerdown",n),t.removeEventListener("click",r.current)}},[t,a]),{onPointerDownCapture:()=>o.current=!0}}function Xp(e,t=globalThis?.document){let a=de(e),o=b(!1);return k(()=>{let r=n=>{n.target&&!o.current&&ul(Vp,a,{originalEvent:n},{discrete:!1})};return t.addEventListener("focusin",r),()=>t.removeEventListener("focusin",r)},[t,a]),{onFocusCapture:()=>o.current=!0,onBlurCapture:()=>o.current=!1}}function ll(){let e=new CustomEvent(Br);document.dispatchEvent(e)}function ul(e,t,a,{discrete:o}){let r=a.originalEvent.target,n=new CustomEvent(e,{bubbles:!1,cancelable:!0,detail:a});t&&r.addEventListener(e,t,{once:!0}),o?Co(r,n):r.dispatchEvent(n)}var Nr="focusScope.autoFocusOnMount",_r="focusScope.autoFocusOnUnmount",cl={bubbles:!1,cancelable:!0},Kp="FocusScope",Dt=x((e,t)=>{let{loop:a=!1,trapped:o=!1,onMountAutoFocus:r,onUnmountAutoFocus:n,...s}=e,[l,i]=T(null),c=de(r),d=de(n),u=b(null),f=K(t,p=>i(p)),m=b({paused:!1,pause(){this.paused=!0},resume(){this.paused=!1}}).current;k(()=>{if(o){let C=function(D){if(m.paused||!l)return;let y=D.target;l.contains(y)?u.current=y:wt(u.current,{select:!0})},L=function(D){if(m.paused||!l)return;let y=D.relatedTarget;y!==null&&(l.contains(y)||wt(u.current,{select:!0}))},I=function(D){if(document.activeElement===document.body)for(let H of D)H.removedNodes.length>0&&wt(l)};var p=C,g=L,w=I;document.addEventListener("focusin",C),document.addEventListener("focusout",L);let R=new MutationObserver(I);return l&&R.observe(l,{childList:!0,subtree:!0}),()=>{document.removeEventListener("focusin",C),document.removeEventListener("focusout",L),R.disconnect()}}},[o,l,m.paused]),k(()=>{if(l){fl.add(m);let p=document.activeElement;if(!l.contains(p)){let w=new CustomEvent(Nr,cl);l.addEventListener(Nr,c),l.dispatchEvent(w),w.defaultPrevented||(jp(Qp(ml(l)),{select:!0}),document.activeElement===p&&wt(l))}return()=>{l.removeEventListener(Nr,c),setTimeout(()=>{let w=new CustomEvent(_r,cl);l.addEventListener(_r,d),l.dispatchEvent(w),w.defaultPrevented||wt(p??document.body,{select:!0}),l.removeEventListener(_r,d),fl.remove(m)},0)}}},[l,c,d,m]);let v=_(p=>{if(!a&&!o||m.paused)return;let g=p.key==="Tab"&&!p.altKey&&!p.ctrlKey&&!p.metaKey,w=document.activeElement;if(g&&w){let C=p.currentTarget,[L,I]=$p(C);L&&I?!p.shiftKey&&w===I?(p.preventDefault(),a&&wt(L,{select:!0})):p.shiftKey&&w===L&&(p.preventDefault(),a&&wt(I,{select:!0})):w===C&&p.preventDefault()}},[a,o,m.paused]);return h(N.div,{tabIndex:-1,...s,ref:f,onKeyDown:v})});Dt.displayName=Kp;function jp(e,{select:t=!1}={}){let a=document.activeElement;for(let o of e)if(wt(o,{select:t}),document.activeElement!==a)return}function $p(e){let t=ml(e),a=dl(t,e),o=dl(t.reverse(),e);return[a,o]}function ml(e){let t=[],a=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:o=>{let r=o.tagName==="INPUT"&&o.type==="hidden";return o.disabled||o.hidden||r?NodeFilter.FILTER_SKIP:o.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}});for(;a.nextNode();)t.push(a.currentNode);return t}function dl(e,t){for(let a of e)if(!Yp(a,{upTo:t}))return a}function Yp(e,{upTo:t}){if(getComputedStyle(e).visibility==="hidden")return!0;for(;e;){if(t!==void 0&&e===t)return!1;if(getComputedStyle(e).display==="none")return!0;e=e.parentElement}return!1}function Zp(e){return e instanceof HTMLInputElement&&"select"in e}function wt(e,{select:t=!1}={}){if(e&&e.focus){let a=document.activeElement;e.focus({preventScroll:!0}),e!==a&&Zp(e)&&t&&e.select()}}var fl=Jp();function Jp(){let e=[];return{add(t){let a=e[0];t!==a&&a?.pause(),e=pl(e,t),e.unshift(t)},remove(t){e=pl(e,t),e[0]?.resume()}}}function pl(e,t){let a=[...e],o=a.indexOf(t);return o!==-1&&a.splice(o,1),a}function Qp(e){return e.filter(t=>t.tagName!=="A")}var em="Portal",ut=x((e,t)=>{let{container:a,...o}=e,[r,n]=T(!1);ce(()=>n(!0),[]);let s=a||r&&globalThis?.document?.body;return s?za(h(N.div,{...o,ref:t}),s):null});ut.displayName=em;var Io=0,fa=null;function pa(){k(()=>{fa||(fa={start:hl(),end:hl()});let{start:e,end:t}=fa;return document.body.firstElementChild!==e&&document.body.insertAdjacentElement("afterbegin",e),document.body.lastElementChild!==t&&document.body.insertAdjacentElement("beforeend",t),Io++,()=>{Io===1&&(fa?.start.remove(),fa?.end.remove(),fa=null),Io=Math.max(0,Io-1)}},[])}function hl(){let e=document.createElement("span");return e.setAttribute("data-radix-focus-guard",""),e.tabIndex=0,e.style.outline="none",e.style.opacity="0",e.style.position="fixed",e.style.pointerEvents="none",e}var De=function(){return De=Object.assign||function(t){for(var a,o=1,r=arguments.length;o<r;o++){a=arguments[o];for(var n in a)Object.prototype.hasOwnProperty.call(a,n)&&(t[n]=a[n])}return t},De.apply(this,arguments)};function bo(e,t){var a={};for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&t.indexOf(o)<0&&(a[o]=e[o]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var r=0,o=Object.getOwnPropertySymbols(e);r<o.length;r++)t.indexOf(o[r])<0&&Object.prototype.propertyIsEnumerable.call(e,o[r])&&(a[o[r]]=e[o[r]]);return a}function xl(e,t,a){if(a||arguments.length===2)for(var o=0,r=t.length,n;o<r;o++)(n||!(o in t))&&(n||(n=Array.prototype.slice.call(t,0,o)),n[o]=t[o]);return e.concat(n||Array.prototype.slice.call(t))}var Et="right-scroll-bar-position",Ot="width-before-scroll-bar",Hr="with-scroll-bars-hidden",Ur="--removed-body-scroll-bar-size";function Ro(e,t){return typeof e=="function"?e(t):e&&(e.current=t),e}function gl(e,t){var a=T(function(){return{value:e,callback:t,facade:{get current(){return a.value},set current(o){var r=a.value;r!==o&&(a.value=o,a.callback(o,r))}}}})[0];return a.callback=t,a.facade}var tm=typeof window<"u"?Pt:k,vl=new WeakMap;function qr(e,t){var a=gl(t||null,function(o){return e.forEach(function(r){return Ro(r,o)})});return tm(function(){var o=vl.get(a);if(o){var r=new Set(o),n=new Set(e),s=a.current;r.forEach(function(l){n.has(l)||Ro(l,null)}),n.forEach(function(l){r.has(l)||Ro(l,s)})}vl.set(a,e)},[e]),a}function am(e){return e}function om(e,t){t===void 0&&(t=am);var a=[],o=!1,r={read:function(){if(o)throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");return a.length?a[a.length-1]:e},useMedium:function(n){var s=t(n,o);return a.push(s),function(){a=a.filter(function(l){return l!==s})}},assignSyncMedium:function(n){for(o=!0;a.length;){var s=a;a=[],s.forEach(n)}a={push:function(l){return n(l)},filter:function(){return a}}},assignMedium:function(n){o=!0;var s=[];if(a.length){var l=a;a=[],l.forEach(n),s=a}var i=function(){var d=s;s=[],d.forEach(n)},c=function(){return Promise.resolve().then(i)};c(),a={push:function(d){s.push(d),c()},filter:function(d){return s=s.filter(d),a}}}};return r}function Vr(e){e===void 0&&(e={});var t=om(null);return t.options=De({async:!0,ssr:!1},e),t}var wl=function(e){var t=e.sideCar,a=bo(e,["sideCar"]);if(!t)throw new Error("Sidecar: please provide `sideCar` property to import the right car");var o=t.read();if(!o)throw new Error("Sidecar medium not found");return S(o,De({},a))};wl.isSideCarExport=!0;function zr(e,t){return e.useMedium(t),wl}var yo=Vr();var Wr=function(){},Wa=x(function(e,t){var a=b(null),o=T({onScrollCapture:Wr,onWheelCapture:Wr,onTouchMoveCapture:Wr}),r=o[0],n=o[1],s=e.forwardProps,l=e.children,i=e.className,c=e.removeScrollBar,d=e.enabled,u=e.shards,f=e.sideCar,m=e.noRelative,v=e.noIsolation,p=e.inert,g=e.allowPinchZoom,w=e.as,C=w===void 0?"div":w,L=e.gapMode,I=bo(e,["forwardProps","children","className","removeScrollBar","enabled","shards","sideCar","noRelative","noIsolation","inert","allowPinchZoom","as","gapMode"]),R=f,D=qr([a,t]),y=De(De({},I),r);return S(ze,null,d&&S(R,{sideCar:yo,removeScrollBar:c,shards:u,noRelative:m,noIsolation:v,inert:p,setCallbacks:n,allowPinchZoom:!!g,lockRef:a,gapMode:L}),s?ot($e.only(l),De(De({},y),{ref:D})):S(C,De({},y,{className:i,ref:D}),l))});Wa.defaultProps={enabled:!0,removeScrollBar:!0,inert:!1};Wa.classNames={fullWidth:Ot,zeroRight:Et};var Cl;var Ll=function(){if(Cl)return Cl;if(typeof __webpack_nonce__<"u")return __webpack_nonce__};function rm(){if(!document)return null;var e=document.createElement("style");e.type="text/css";var t=Ll();return t&&e.setAttribute("nonce",t),e}function nm(e,t){e.styleSheet?e.styleSheet.cssText=t:e.appendChild(document.createTextNode(t))}function sm(e){var t=document.head||document.getElementsByTagName("head")[0];t.appendChild(e)}var Gr=function(){var e=0,t=null;return{add:function(a){e==0&&(t=rm())&&(nm(t,a),sm(t)),e++},remove:function(){e--,!e&&t&&(t.parentNode&&t.parentNode.removeChild(t),t=null)}}};var Xr=function(){var e=Gr();return function(t,a){k(function(){return e.add(t),function(){e.remove()}},[t&&a])}};var Ga=function(){var e=Xr(),t=function(a){var o=a.styles,r=a.dynamic;return e(o,r),null};return t};var lm={left:0,top:0,right:0,gap:0},Kr=function(e){return parseInt(e||"",10)||0},im=function(e){var t=window.getComputedStyle(document.body),a=t[e==="padding"?"paddingLeft":"marginLeft"],o=t[e==="padding"?"paddingTop":"marginTop"],r=t[e==="padding"?"paddingRight":"marginRight"];return[Kr(a),Kr(o),Kr(r)]},jr=function(e){if(e===void 0&&(e="margin"),typeof window>"u")return lm;var t=im(e),a=document.documentElement.clientWidth,o=window.innerWidth;return{left:t[0],top:t[1],right:t[2],gap:Math.max(0,o-a+t[2]-t[0])}};var um=Ga(),ma="data-scroll-locked",cm=function(e,t,a,o){var r=e.left,n=e.top,s=e.right,l=e.gap;return a===void 0&&(a="margin"),`
  .`.concat(Hr,` {
   overflow: hidden `).concat(o,`;
   padding-right: `).concat(l,"px ").concat(o,`;
  }
  body[`).concat(ma,`] {
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
  
  .`).concat(Et,` {
    right: `).concat(l,"px ").concat(o,`;
  }
  
  .`).concat(Ot,` {
    margin-right: `).concat(l,"px ").concat(o,`;
  }
  
  .`).concat(Et," .").concat(Et,` {
    right: 0 `).concat(o,`;
  }
  
  .`).concat(Ot," .").concat(Ot,` {
    margin-right: 0 `).concat(o,`;
  }
  
  body[`).concat(ma,`] {
    `).concat(Ur,": ").concat(l,`px;
  }
`)},Sl=function(){var e=parseInt(document.body.getAttribute(ma)||"0",10);return isFinite(e)?e:0},dm=function(){k(function(){return document.body.setAttribute(ma,(Sl()+1).toString()),function(){var e=Sl()-1;e<=0?document.body.removeAttribute(ma):document.body.setAttribute(ma,e.toString())}},[])},$r=function(e){var t=e.noRelative,a=e.noImportant,o=e.gapMode,r=o===void 0?"margin":o;dm();var n=me(function(){return jr(r)},[r]);return S(um,{styles:cm(n,!t,r,a?"":"!important")})};var Yr=!1;if(typeof window<"u")try{Xa=Object.defineProperty({},"passive",{get:function(){return Yr=!0,!0}}),window.addEventListener("test",Xa,Xa),window.removeEventListener("test",Xa,Xa)}catch{Yr=!1}var Xa,Ft=Yr?{passive:!1}:!1;var fm=function(e){return e.tagName==="TEXTAREA"},Il=function(e,t){if(!(e instanceof Element))return!1;var a=window.getComputedStyle(e);return a[t]!=="hidden"&&!(a.overflowY===a.overflowX&&!fm(e)&&a[t]==="visible")},pm=function(e){return Il(e,"overflowY")},mm=function(e){return Il(e,"overflowX")},Zr=function(e,t){var a=t.ownerDocument,o=t;do{typeof ShadowRoot<"u"&&o instanceof ShadowRoot&&(o=o.host);var r=bl(e,o);if(r){var n=Rl(e,o),s=n[1],l=n[2];if(s>l)return!0}o=o.parentNode}while(o&&o!==a.body);return!1},hm=function(e){var t=e.scrollTop,a=e.scrollHeight,o=e.clientHeight;return[t,a,o]},xm=function(e){var t=e.scrollLeft,a=e.scrollWidth,o=e.clientWidth;return[t,a,o]},bl=function(e,t){return e==="v"?pm(t):mm(t)},Rl=function(e,t){return e==="v"?hm(t):xm(t)},gm=function(e,t){return e==="h"&&t==="rtl"?-1:1},yl=function(e,t,a,o,r){var n=gm(e,window.getComputedStyle(t).direction),s=n*o,l=a.target,i=t.contains(l),c=!1,d=s>0,u=0,f=0;do{if(!l)break;var m=Rl(e,l),v=m[0],p=m[1],g=m[2],w=p-g-n*v;(v||w)&&bl(e,l)&&(u+=w,f+=v);var C=l.parentNode;l=C&&C.nodeType===Node.DOCUMENT_FRAGMENT_NODE?C.host:C}while(!i&&l!==document.body||i&&(t.contains(l)||t===l));return(d&&(r&&Math.abs(u)<1||!r&&s>u)||!d&&(r&&Math.abs(f)<1||!r&&-s>f))&&(c=!0),c};var Po=function(e){return"changedTouches"in e?[e.changedTouches[0].clientX,e.changedTouches[0].clientY]:[0,0]},Pl=function(e){return[e.deltaX,e.deltaY]},Ml=function(e){return e&&"current"in e?e.current:e},vm=function(e,t){return e[0]===t[0]&&e[1]===t[1]},wm=function(e){return`
  .block-interactivity-`.concat(e,` {pointer-events: none;}
  .allow-interactivity-`).concat(e,` {pointer-events: all;}
`)},Cm=0,ha=[];function Tl(e){var t=b([]),a=b([0,0]),o=b(),r=T(Cm++)[0],n=T(Ga)[0],s=b(e);k(function(){s.current=e},[e]),k(function(){if(e.inert){document.body.classList.add("block-interactivity-".concat(r));var p=xl([e.lockRef.current],(e.shards||[]).map(Ml),!0).filter(Boolean);return p.forEach(function(g){return g.classList.add("allow-interactivity-".concat(r))}),function(){document.body.classList.remove("block-interactivity-".concat(r)),p.forEach(function(g){return g.classList.remove("allow-interactivity-".concat(r))})}}},[e.inert,e.lockRef.current,e.shards]);var l=_(function(p,g){if("touches"in p&&p.touches.length===2||p.type==="wheel"&&p.ctrlKey)return!s.current.allowPinchZoom;var w=Po(p),C=a.current,L="deltaX"in p?p.deltaX:C[0]-w[0],I="deltaY"in p?p.deltaY:C[1]-w[1],R,D=p.target,y=Math.abs(L)>Math.abs(I)?"h":"v";if("touches"in p&&y==="h"&&D.type==="range")return!1;var H=window.getSelection(),z=H&&H.anchorNode,V=z?z===D||z.contains(D):!1;if(V)return!1;var G=Zr(y,D);if(!G)return!0;if(G?R=y:(R=y==="v"?"h":"v",G=Zr(y,D)),!G)return!1;if(!o.current&&"changedTouches"in p&&(L||I)&&(o.current=R),!R)return!0;var F=o.current||R;return yl(F,g,p,F==="h"?L:I,!0)},[]),i=_(function(p){var g=p;if(!(!ha.length||ha[ha.length-1]!==n)){var w="deltaY"in g?Pl(g):Po(g),C=t.current.filter(function(R){return R.name===g.type&&(R.target===g.target||g.target===R.shadowParent)&&vm(R.delta,w)})[0];if(C&&C.should){g.cancelable&&g.preventDefault();return}if(!C){var L=(s.current.shards||[]).map(Ml).filter(Boolean).filter(function(R){return R.contains(g.target)}),I=L.length>0?l(g,L[0]):!s.current.noIsolation;I&&g.cancelable&&g.preventDefault()}}},[]),c=_(function(p,g,w,C){var L={name:p,delta:g,target:w,should:C,shadowParent:Lm(w)};t.current.push(L),setTimeout(function(){t.current=t.current.filter(function(I){return I!==L})},1)},[]),d=_(function(p){a.current=Po(p),o.current=void 0},[]),u=_(function(p){c(p.type,Pl(p),p.target,l(p,e.lockRef.current))},[]),f=_(function(p){c(p.type,Po(p),p.target,l(p,e.lockRef.current))},[]);k(function(){return ha.push(n),e.setCallbacks({onScrollCapture:u,onWheelCapture:u,onTouchMoveCapture:f}),document.addEventListener("wheel",i,Ft),document.addEventListener("touchmove",i,Ft),document.addEventListener("touchstart",d,Ft),function(){ha=ha.filter(function(p){return p!==n}),document.removeEventListener("wheel",i,Ft),document.removeEventListener("touchmove",i,Ft),document.removeEventListener("touchstart",d,Ft)}},[]);var m=e.removeScrollBar,v=e.inert;return S(ze,null,v?S(n,{styles:wm(r)}):null,m?S($r,{noRelative:e.noRelative,gapMode:e.gapMode}):null)}function Lm(e){for(var t=null;e!==null;)e instanceof ShadowRoot&&(t=e.host,e=e.host),e=e.parentNode;return t}var Al=zr(yo,Tl);var kl=x(function(e,t){return S(Wa,De({},e,{ref:t,sideCar:Al}))});kl.classNames=Wa.classNames;var Bt=kl;var Sm=function(e){if(typeof document>"u")return null;var t=Array.isArray(e)?e[0]:e;return t.ownerDocument.body},xa=new WeakMap,Mo=new WeakMap,To={},Jr=0,Dl=function(e){return e&&(e.host||Dl(e.parentNode))},Im=function(e,t){return t.map(function(a){if(e.contains(a))return a;var o=Dl(a);return o&&e.contains(o)?o:(console.error("aria-hidden",a,"in not contained inside",e,". Doing nothing"),null)}).filter(function(a){return!!a})},bm=function(e,t,a,o){var r=Im(t,Array.isArray(e)?e:[e]);To[a]||(To[a]=new WeakMap);var n=To[a],s=[],l=new Set,i=new Set(r),c=function(u){!u||l.has(u)||(l.add(u),c(u.parentNode))};r.forEach(c);var d=function(u){!u||i.has(u)||Array.prototype.forEach.call(u.children,function(f){if(l.has(f))d(f);else try{var m=f.getAttribute(o),v=m!==null&&m!=="false",p=(xa.get(f)||0)+1,g=(n.get(f)||0)+1;xa.set(f,p),n.set(f,g),s.push(f),p===1&&v&&Mo.set(f,!0),g===1&&f.setAttribute(a,"true"),v||f.setAttribute(o,"true")}catch(w){console.error("aria-hidden: cannot operate on ",f,w)}})};return d(t),l.clear(),Jr++,function(){s.forEach(function(u){var f=xa.get(u)-1,m=n.get(u)-1;xa.set(u,f),n.set(u,m),f||(Mo.has(u)||u.removeAttribute(o),Mo.delete(u)),m||u.removeAttribute(a)}),Jr--,Jr||(xa=new WeakMap,xa=new WeakMap,Mo=new WeakMap,To={})}},ga=function(e,t,a){a===void 0&&(a="data-aria-hidden");var o=Array.from(Array.isArray(e)?e:[e]),r=t||Sm(e);return r?(o.push.apply(o,Array.from(r.querySelectorAll("[aria-live], script"))),bm(o,r,a,"aria-hidden")):function(){return null}};var ko="Dialog",[El,uI]=ue(ko),[Rm,We]=El(ko),ym=e=>{let{__scopeDialog:t,children:a,open:o,defaultOpen:r,onOpenChange:n,modal:s=!0}=e,l=b(null),i=b(null),[c,d]=Le({prop:o,defaultProp:r??!1,onChange:n,caller:ko});return h(Rm,{scope:t,triggerRef:l,contentRef:i,contentId:we(),titleId:we(),descriptionId:we(),open:c,onOpenChange:d,onOpenToggle:_(()=>d(u=>!u),[d]),modal:s,children:a})};ym.displayName=ko;var Ol="DialogTrigger",Pm=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=We(Ol,a),n=K(t,r.triggerRef);return h(N.button,{type:"button","aria-haspopup":"dialog","aria-expanded":r.open,"aria-controls":r.open?r.contentId:void 0,"data-state":tn(r.open),...o,ref:n,onClick:A(e.onClick,r.onOpenToggle)})});Pm.displayName=Ol;var Qr="DialogPortal",[Mm,Fl]=El(Qr,{forceMount:void 0}),Bl=e=>{let{__scopeDialog:t,forceMount:a,children:o,container:r}=e,n=We(Qr,t);return h(Mm,{scope:t,forceMount:a,children:$e.map(o,s=>h(he,{present:a||n.open,children:h(ut,{asChild:!0,container:r,children:s})}))})};Bl.displayName=Qr;var Ao="DialogOverlay",Nl=x((e,t)=>{let a=Fl(Ao,e.__scopeDialog),{forceMount:o=a.forceMount,...r}=e,n=We(Ao,e.__scopeDialog);return n.modal?h(he,{present:o||n.open,children:h(Am,{...r,ref:t})}):null});Nl.displayName=Ao;var Tm=Ne("DialogOverlay.RemoveScroll"),Am=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=We(Ao,a);return h(Bt,{as:Tm,allowPinchZoom:!0,shards:[r.contentRef],children:h(N.div,{"data-state":tn(r.open),...o,ref:t,style:{pointerEvents:"auto",...o.style}})})}),Nt="DialogContent",_l=x((e,t)=>{let a=Fl(Nt,e.__scopeDialog),{forceMount:o=a.forceMount,...r}=e,n=We(Nt,e.__scopeDialog);return h(he,{present:o||n.open,children:n.modal?h(km,{...r,ref:t}):h(Dm,{...r,ref:t})})});_l.displayName=Nt;var km=x((e,t)=>{let a=We(Nt,e.__scopeDialog),o=b(null),r=K(t,a.contentRef,o);return k(()=>{let n=o.current;if(n)return ga(n)},[]),h(Hl,{...e,ref:r,trapFocus:a.open,disableOutsidePointerEvents:a.open,onCloseAutoFocus:A(e.onCloseAutoFocus,n=>{n.preventDefault(),a.triggerRef.current?.focus()}),onPointerDownOutside:A(e.onPointerDownOutside,n=>{let s=n.detail.originalEvent,l=s.button===0&&s.ctrlKey===!0;(s.button===2||l)&&n.preventDefault()}),onFocusOutside:A(e.onFocusOutside,n=>n.preventDefault())})}),Dm=x((e,t)=>{let a=We(Nt,e.__scopeDialog),o=b(!1),r=b(!1);return h(Hl,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,onCloseAutoFocus:n=>{e.onCloseAutoFocus?.(n),n.defaultPrevented||(o.current||a.triggerRef.current?.focus(),n.preventDefault()),o.current=!1,r.current=!1},onInteractOutside:n=>{e.onInteractOutside?.(n),n.defaultPrevented||(o.current=!0,n.detail.originalEvent.type==="pointerdown"&&(r.current=!0));let s=n.target;a.triggerRef.current?.contains(s)&&n.preventDefault(),n.detail.originalEvent.type==="focusin"&&r.current&&n.preventDefault()}})}),Hl=x((e,t)=>{let{__scopeDialog:a,trapFocus:o,onOpenAutoFocus:r,onCloseAutoFocus:n,...s}=e,l=We(Nt,a),i=b(null),c=K(t,i);return pa(),Ie(Me,{children:[h(Dt,{asChild:!0,loop:!0,trapped:o,onMountAutoFocus:r,onUnmountAutoFocus:n,children:h(it,{role:"dialog",id:l.contentId,"aria-describedby":l.descriptionId,"aria-labelledby":l.titleId,"data-state":tn(l.open),...s,ref:c,onDismiss:()=>l.onOpenChange(!1)})}),Ie(Me,{children:[h(Em,{titleId:l.titleId}),h(Fm,{contentRef:i,descriptionId:l.descriptionId})]})]})}),en="DialogTitle",Ul=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=We(en,a);return h(N.h2,{id:r.titleId,...o,ref:t})});Ul.displayName=en;var ql="DialogDescription",Vl=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=We(ql,a);return h(N.p,{id:r.descriptionId,...o,ref:t})});Vl.displayName=ql;var zl="DialogClose",Wl=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=We(zl,a);return h(N.button,{type:"button",...o,ref:t,onClick:A(e.onClick,()=>r.onOpenChange(!1))})});Wl.displayName=zl;function tn(e){return e?"open":"closed"}var Gl="DialogTitleWarning",[cI,Xl]=Zs(Gl,{contentName:Nt,titleName:en,docsSlug:"dialog"}),Em=({titleId:e})=>{let t=Xl(Gl),a=`\`${t.contentName}\` requires a \`${t.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${t.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${t.docsSlug}`;return k(()=>{e&&(document.getElementById(e)||console.error(a))},[a,e]),null},Om="DialogDescriptionWarning",Fm=({contentRef:e,descriptionId:t})=>{let o=`Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${Xl(Om).contentName}}.`;return k(()=>{let r=e.current?.getAttribute("aria-describedby");t&&r&&(document.getElementById(t)||console.warn(o))},[o,e,t]),null};var Do=Bl,va=Nl,wa=_l,Ca=Ul,La=Vl,Eo=Wl;var _m=Do;var jl=x(({className:e,...t},a)=>S(va,{ref:a,className:O("xps-dialog-overlay",e),...t}));jl.displayName=va.displayName;var Hm=x(({className:e,children:t,showClose:a=!0,...o},r)=>S(_m,null,S(jl,null),S(wa,{ref:r,className:O("xps-dialog-content",e),...o},t,a?S(Eo,{className:"xps-dialog-close"},S(kt,{className:"xps-icon","aria-hidden":"true"}),S("span",{className:"xps-sr-only"},"Close")):null)));Hm.displayName=wa.displayName;var Um=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-dialog-header",e),...t}));Um.displayName="DialogHeader";var qm=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-dialog-footer",e),...t}));qm.displayName="DialogFooter";var Vm=x(({className:e,...t},a)=>S(Ca,{ref:a,className:O("xps-dialog-title",e),...t}));Vm.displayName=Ca.displayName;var zm=x(({className:e,...t},a)=>S(La,{ref:a,className:O("xps-dialog-description",e),...t}));zm.displayName=La.displayName;function Ct(e){let t=e+"CollectionProvider",[a,o]=ue(t),[r,n]=a(t,{collectionRef:{current:null},itemMap:new Map}),s=p=>{let{scope:g,children:w}=p,C=b(null),L=b(new Map).current;return h(r,{scope:g,itemMap:L,collectionRef:C,children:w})};s.displayName=t;let l=e+"CollectionSlot",i=Ne(l),c=x((p,g)=>{let{scope:w,children:C}=p,L=n(l,w),I=K(g,L.collectionRef);return h(i,{ref:I,children:C})});c.displayName=l;let d=e+"CollectionItemSlot",u="data-radix-collection-item",f=Ne(d),m=x((p,g)=>{let{scope:w,children:C,...L}=p,I=b(null),R=K(g,I),D=n(d,w);return k(()=>(D.itemMap.set(I,{ref:I,...L}),()=>{D.itemMap.delete(I)})),h(f,{[u]:"",ref:R,children:C})});m.displayName=d;function v(p){let g=n(e+"CollectionConsumer",p);return _(()=>{let C=g.collectionRef.current;if(!C)return[];let L=Array.from(C.querySelectorAll(`[${u}]`));return Array.from(g.itemMap.values()).sort((D,y)=>L.indexOf(D.ref.current)-L.indexOf(y.ref.current))},[g.collectionRef,g.itemMap])}return[{Provider:s,Slot:c,ItemSlot:m},v,o]}var Wm=rt(void 0);function _e(e){let t=nt(Wm);return e||t||"ltr"}var Zl=["top","right","bottom","left"];var Ye=Math.min,Te=Math.max,ja=Math.round,$a=Math.floor,Ge=e=>({x:e,y:e}),Gm={left:"right",right:"left",bottom:"top",top:"bottom"};function Fo(e,t,a){return Te(e,Ye(t,a))}function Ze(e,t){return typeof e=="function"?e(t):e}function Je(e){return e.split("-")[0]}function _t(e){return e.split("-")[1]}function Bo(e){return e==="x"?"y":"x"}function No(e){return e==="y"?"height":"width"}function Xe(e){let t=e[0];return t==="t"||t==="b"?"y":"x"}function _o(e){return Bo(Xe(e))}function Jl(e,t,a){a===void 0&&(a=!1);let o=_t(e),r=_o(e),n=No(r),s=r==="x"?o===(a?"end":"start")?"right":"left":o==="start"?"bottom":"top";return t.reference[n]>t.floating[n]&&(s=Ka(s)),[s,Ka(s)]}function Ql(e){let t=Ka(e);return[Oo(e),t,Oo(t)]}function Oo(e){return e.includes("start")?e.replace("start","end"):e.replace("end","start")}var $l=["left","right"],Yl=["right","left"],Xm=["top","bottom"],Km=["bottom","top"];function jm(e,t,a){switch(e){case"top":case"bottom":return a?t?Yl:$l:t?$l:Yl;case"left":case"right":return t?Xm:Km;default:return[]}}function ei(e,t,a,o){let r=_t(e),n=jm(Je(e),a==="start",o);return r&&(n=n.map(s=>s+"-"+r),t&&(n=n.concat(n.map(Oo)))),n}function Ka(e){let t=Je(e);return Gm[t]+e.slice(t.length)}function $m(e){return{top:0,right:0,bottom:0,left:0,...e}}function an(e){return typeof e!="number"?$m(e):{top:e,right:e,bottom:e,left:e}}function Ht(e){let{x:t,y:a,width:o,height:r}=e;return{width:o,height:r,top:a,left:t,right:t+o,bottom:a+r,x:t,y:a}}function ti(e,t,a){let{reference:o,floating:r}=e,n=Xe(t),s=_o(t),l=No(s),i=Je(t),c=n==="y",d=o.x+o.width/2-r.width/2,u=o.y+o.height/2-r.height/2,f=o[l]/2-r[l]/2,m;switch(i){case"top":m={x:d,y:o.y-r.height};break;case"bottom":m={x:d,y:o.y+o.height};break;case"right":m={x:o.x+o.width,y:u};break;case"left":m={x:o.x-r.width,y:u};break;default:m={x:o.x,y:o.y}}switch(_t(t)){case"start":m[s]-=f*(a&&c?-1:1);break;case"end":m[s]+=f*(a&&c?-1:1);break}return m}async function ri(e,t){var a;t===void 0&&(t={});let{x:o,y:r,platform:n,rects:s,elements:l,strategy:i}=e,{boundary:c="clippingAncestors",rootBoundary:d="viewport",elementContext:u="floating",altBoundary:f=!1,padding:m=0}=Ze(t,e),v=an(m),g=l[f?u==="floating"?"reference":"floating":u],w=Ht(await n.getClippingRect({element:(a=await(n.isElement==null?void 0:n.isElement(g)))==null||a?g:g.contextElement||await(n.getDocumentElement==null?void 0:n.getDocumentElement(l.floating)),boundary:c,rootBoundary:d,strategy:i})),C=u==="floating"?{x:o,y:r,width:s.floating.width,height:s.floating.height}:s.reference,L=await(n.getOffsetParent==null?void 0:n.getOffsetParent(l.floating)),I=await(n.isElement==null?void 0:n.isElement(L))?await(n.getScale==null?void 0:n.getScale(L))||{x:1,y:1}:{x:1,y:1},R=Ht(n.convertOffsetParentRelativeRectToViewportRelativeRect?await n.convertOffsetParentRelativeRectToViewportRelativeRect({elements:l,rect:C,offsetParent:L,strategy:i}):C);return{top:(w.top-R.top+v.top)/I.y,bottom:(R.bottom-w.bottom+v.bottom)/I.y,left:(w.left-R.left+v.left)/I.x,right:(R.right-w.right+v.right)/I.x}}var Ym=50,ni=async(e,t,a)=>{let{placement:o="bottom",strategy:r="absolute",middleware:n=[],platform:s}=a,l=s.detectOverflow?s:{...s,detectOverflow:ri},i=await(s.isRTL==null?void 0:s.isRTL(t)),c=await s.getElementRects({reference:e,floating:t,strategy:r}),{x:d,y:u}=ti(c,o,i),f=o,m=0,v={};for(let p=0;p<n.length;p++){let g=n[p];if(!g)continue;let{name:w,fn:C}=g,{x:L,y:I,data:R,reset:D}=await C({x:d,y:u,initialPlacement:o,placement:f,strategy:r,middlewareData:v,rects:c,platform:l,elements:{reference:e,floating:t}});d=L??d,u=I??u,v[w]={...v[w],...R},D&&m<Ym&&(m++,typeof D=="object"&&(D.placement&&(f=D.placement),D.rects&&(c=D.rects===!0?await s.getElementRects({reference:e,floating:t,strategy:r}):D.rects),{x:d,y:u}=ti(c,f,i)),p=-1)}return{x:d,y:u,placement:f,strategy:r,middlewareData:v}},si=e=>({name:"arrow",options:e,async fn(t){let{x:a,y:o,placement:r,rects:n,platform:s,elements:l,middlewareData:i}=t,{element:c,padding:d=0}=Ze(e,t)||{};if(c==null)return{};let u=an(d),f={x:a,y:o},m=_o(r),v=No(m),p=await s.getDimensions(c),g=m==="y",w=g?"top":"left",C=g?"bottom":"right",L=g?"clientHeight":"clientWidth",I=n.reference[v]+n.reference[m]-f[m]-n.floating[v],R=f[m]-n.reference[m],D=await(s.getOffsetParent==null?void 0:s.getOffsetParent(c)),y=D?D[L]:0;(!y||!await(s.isElement==null?void 0:s.isElement(D)))&&(y=l.floating[L]||n.floating[v]);let H=I/2-R/2,z=y/2-p[v]/2-1,V=Ye(u[w],z),G=Ye(u[C],z),F=V,$=y-p[v]-G,j=y/2-p[v]/2+H,re=Fo(F,j,$),X=!i.arrow&&_t(r)!=null&&j!==re&&n.reference[v]/2-(j<F?V:G)-p[v]/2<0,J=X?j<F?j-F:j-$:0;return{[m]:f[m]+J,data:{[m]:re,centerOffset:j-re-J,...X&&{alignmentOffset:J}},reset:X}}});var li=function(e){return e===void 0&&(e={}),{name:"flip",options:e,async fn(t){var a,o;let{placement:r,middlewareData:n,rects:s,initialPlacement:l,platform:i,elements:c}=t,{mainAxis:d=!0,crossAxis:u=!0,fallbackPlacements:f,fallbackStrategy:m="bestFit",fallbackAxisSideDirection:v="none",flipAlignment:p=!0,...g}=Ze(e,t);if((a=n.arrow)!=null&&a.alignmentOffset)return{};let w=Je(r),C=Xe(l),L=Je(l)===l,I=await(i.isRTL==null?void 0:i.isRTL(c.floating)),R=f||(L||!p?[Ka(l)]:Ql(l)),D=v!=="none";!f&&D&&R.push(...ei(l,p,v,I));let y=[l,...R],H=await i.detectOverflow(t,g),z=[],V=((o=n.flip)==null?void 0:o.overflows)||[];if(d&&z.push(H[w]),u){let j=Jl(r,s,I);z.push(H[j[0]],H[j[1]])}if(V=[...V,{placement:r,overflows:z}],!z.every(j=>j<=0)){var G,F;let j=(((G=n.flip)==null?void 0:G.index)||0)+1,re=y[j];if(re&&(!(u==="alignment"?C!==Xe(re):!1)||V.every(U=>Xe(U.placement)===C?U.overflows[0]>0:!0)))return{data:{index:j,overflows:V},reset:{placement:re}};let X=(F=V.filter(J=>J.overflows[0]<=0).sort((J,U)=>J.overflows[1]-U.overflows[1])[0])==null?void 0:F.placement;if(!X)switch(m){case"bestFit":{var $;let J=($=V.filter(U=>{if(D){let E=Xe(U.placement);return E===C||E==="y"}return!0}).map(U=>[U.placement,U.overflows.filter(E=>E>0).reduce((E,Q)=>E+Q,0)]).sort((U,E)=>U[1]-E[1])[0])==null?void 0:$[0];J&&(X=J);break}case"initialPlacement":X=l;break}if(r!==X)return{reset:{placement:X}}}return{}}}};function ai(e,t){return{top:e.top-t.height,right:e.right-t.width,bottom:e.bottom-t.height,left:e.left-t.width}}function oi(e){return Zl.some(t=>e[t]>=0)}var ii=function(e){return e===void 0&&(e={}),{name:"hide",options:e,async fn(t){let{rects:a,platform:o}=t,{strategy:r="referenceHidden",...n}=Ze(e,t);switch(r){case"referenceHidden":{let s=await o.detectOverflow(t,{...n,elementContext:"reference"}),l=ai(s,a.reference);return{data:{referenceHiddenOffsets:l,referenceHidden:oi(l)}}}case"escaped":{let s=await o.detectOverflow(t,{...n,altBoundary:!0}),l=ai(s,a.floating);return{data:{escapedOffsets:l,escaped:oi(l)}}}default:return{}}}}};var ui=new Set(["left","top"]);async function Zm(e,t){let{placement:a,platform:o,elements:r}=e,n=await(o.isRTL==null?void 0:o.isRTL(r.floating)),s=Je(a),l=_t(a),i=Xe(a)==="y",c=ui.has(s)?-1:1,d=n&&i?-1:1,u=Ze(t,e),{mainAxis:f,crossAxis:m,alignmentAxis:v}=typeof u=="number"?{mainAxis:u,crossAxis:0,alignmentAxis:null}:{mainAxis:u.mainAxis||0,crossAxis:u.crossAxis||0,alignmentAxis:u.alignmentAxis};return l&&typeof v=="number"&&(m=l==="end"?v*-1:v),i?{x:m*d,y:f*c}:{x:f*c,y:m*d}}var ci=function(e){return e===void 0&&(e=0),{name:"offset",options:e,async fn(t){var a,o;let{x:r,y:n,placement:s,middlewareData:l}=t,i=await Zm(t,e);return s===((a=l.offset)==null?void 0:a.placement)&&(o=l.arrow)!=null&&o.alignmentOffset?{}:{x:r+i.x,y:n+i.y,data:{...i,placement:s}}}}},di=function(e){return e===void 0&&(e={}),{name:"shift",options:e,async fn(t){let{x:a,y:o,placement:r,platform:n}=t,{mainAxis:s=!0,crossAxis:l=!1,limiter:i={fn:w=>{let{x:C,y:L}=w;return{x:C,y:L}}},...c}=Ze(e,t),d={x:a,y:o},u=await n.detectOverflow(t,c),f=Xe(Je(r)),m=Bo(f),v=d[m],p=d[f];if(s){let w=m==="y"?"top":"left",C=m==="y"?"bottom":"right",L=v+u[w],I=v-u[C];v=Fo(L,v,I)}if(l){let w=f==="y"?"top":"left",C=f==="y"?"bottom":"right",L=p+u[w],I=p-u[C];p=Fo(L,p,I)}let g=i.fn({...t,[m]:v,[f]:p});return{...g,data:{x:g.x-a,y:g.y-o,enabled:{[m]:s,[f]:l}}}}}},fi=function(e){return e===void 0&&(e={}),{options:e,fn(t){let{x:a,y:o,placement:r,rects:n,middlewareData:s}=t,{offset:l=0,mainAxis:i=!0,crossAxis:c=!0}=Ze(e,t),d={x:a,y:o},u=Xe(r),f=Bo(u),m=d[f],v=d[u],p=Ze(l,t),g=typeof p=="number"?{mainAxis:p,crossAxis:0}:{mainAxis:0,crossAxis:0,...p};if(i){let L=f==="y"?"height":"width",I=n.reference[f]-n.floating[L]+g.mainAxis,R=n.reference[f]+n.reference[L]-g.mainAxis;m<I?m=I:m>R&&(m=R)}if(c){var w,C;let L=f==="y"?"width":"height",I=ui.has(Je(r)),R=n.reference[u]-n.floating[L]+(I&&((w=s.offset)==null?void 0:w[u])||0)+(I?0:g.crossAxis),D=n.reference[u]+n.reference[L]+(I?0:((C=s.offset)==null?void 0:C[u])||0)-(I?g.crossAxis:0);v<R?v=R:v>D&&(v=D)}return{[f]:m,[u]:v}}}},pi=function(e){return e===void 0&&(e={}),{name:"size",options:e,async fn(t){var a,o;let{placement:r,rects:n,platform:s,elements:l}=t,{apply:i=()=>{},...c}=Ze(e,t),d=await s.detectOverflow(t,c),u=Je(r),f=_t(r),m=Xe(r)==="y",{width:v,height:p}=n.floating,g,w;u==="top"||u==="bottom"?(g=u,w=f===(await(s.isRTL==null?void 0:s.isRTL(l.floating))?"start":"end")?"left":"right"):(w=u,g=f==="end"?"top":"bottom");let C=p-d.top-d.bottom,L=v-d.left-d.right,I=Ye(p-d[g],C),R=Ye(v-d[w],L),D=!t.middlewareData.shift,y=I,H=R;if((a=t.middlewareData.shift)!=null&&a.enabled.x&&(H=L),(o=t.middlewareData.shift)!=null&&o.enabled.y&&(y=C),D&&!f){let V=Te(d.left,0),G=Te(d.right,0),F=Te(d.top,0),$=Te(d.bottom,0);m?H=v-2*(V!==0||G!==0?V+G:Te(d.left,d.right)):y=p-2*(F!==0||$!==0?F+$:Te(d.top,d.bottom))}await i({...t,availableWidth:H,availableHeight:y});let z=await s.getDimensions(l.floating);return v!==z.width||p!==z.height?{reset:{rects:!0}}:{}}}};function Ho(){return typeof window<"u"}function Vt(e){return hi(e)?(e.nodeName||"").toLowerCase():"#document"}function Ee(e){var t;return(e==null||(t=e.ownerDocument)==null?void 0:t.defaultView)||window}function Ke(e){var t;return(t=(hi(e)?e.ownerDocument:e.document)||window.document)==null?void 0:t.documentElement}function hi(e){return Ho()?e instanceof Node||e instanceof Ee(e).Node:!1}function He(e){return Ho()?e instanceof Element||e instanceof Ee(e).Element:!1}function Qe(e){return Ho()?e instanceof HTMLElement||e instanceof Ee(e).HTMLElement:!1}function mi(e){return!Ho()||typeof ShadowRoot>"u"?!1:e instanceof ShadowRoot||e instanceof Ee(e).ShadowRoot}function Sa(e){let{overflow:t,overflowX:a,overflowY:o,display:r}=Ue(e);return/auto|scroll|overlay|hidden|clip/.test(t+o+a)&&r!=="inline"&&r!=="contents"}function xi(e){return/^(table|td|th)$/.test(Vt(e))}function Ya(e){try{if(e.matches(":popover-open"))return!0}catch{}try{return e.matches(":modal")}catch{return!1}}var Jm=/transform|translate|scale|rotate|perspective|filter/,Qm=/paint|layout|strict|content/,Ut=e=>!!e&&e!=="none",on;function Uo(e){let t=He(e)?Ue(e):e;return Ut(t.transform)||Ut(t.translate)||Ut(t.scale)||Ut(t.rotate)||Ut(t.perspective)||!qo()&&(Ut(t.backdropFilter)||Ut(t.filter))||Jm.test(t.willChange||"")||Qm.test(t.contain||"")}function gi(e){let t=ct(e);for(;Qe(t)&&!zt(t);){if(Uo(t))return t;if(Ya(t))return null;t=ct(t)}return null}function qo(){return on==null&&(on=typeof CSS<"u"&&CSS.supports&&CSS.supports("-webkit-backdrop-filter","none")),on}function zt(e){return/^(html|body|#document)$/.test(Vt(e))}function Ue(e){return Ee(e).getComputedStyle(e)}function Za(e){return He(e)?{scrollLeft:e.scrollLeft,scrollTop:e.scrollTop}:{scrollLeft:e.scrollX,scrollTop:e.scrollY}}function ct(e){if(Vt(e)==="html")return e;let t=e.assignedSlot||e.parentNode||mi(e)&&e.host||Ke(e);return mi(t)?t.host:t}function vi(e){let t=ct(e);return zt(t)?e.ownerDocument?e.ownerDocument.body:e.body:Qe(t)&&Sa(t)?t:vi(t)}function qt(e,t,a){var o;t===void 0&&(t=[]),a===void 0&&(a=!0);let r=vi(e),n=r===((o=e.ownerDocument)==null?void 0:o.body),s=Ee(r);if(n){let l=Vo(s);return t.concat(s,s.visualViewport||[],Sa(r)?r:[],l&&a?qt(l):[])}else return t.concat(r,qt(r,[],a))}function Vo(e){return e.parent&&Object.getPrototypeOf(e.parent)?e.frameElement:null}function Si(e){let t=Ue(e),a=parseFloat(t.width)||0,o=parseFloat(t.height)||0,r=Qe(e),n=r?e.offsetWidth:a,s=r?e.offsetHeight:o,l=ja(a)!==n||ja(o)!==s;return l&&(a=n,o=s),{width:a,height:o,$:l}}function nn(e){return He(e)?e:e.contextElement}function Ia(e){let t=nn(e);if(!Qe(t))return Ge(1);let a=t.getBoundingClientRect(),{width:o,height:r,$:n}=Si(t),s=(n?ja(a.width):a.width)/o,l=(n?ja(a.height):a.height)/r;return(!s||!Number.isFinite(s))&&(s=1),(!l||!Number.isFinite(l))&&(l=1),{x:s,y:l}}var eh=Ge(0);function Ii(e){let t=Ee(e);return!qo()||!t.visualViewport?eh:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}function th(e,t,a){return t===void 0&&(t=!1),!a||t&&a!==Ee(e)?!1:t}function Wt(e,t,a,o){t===void 0&&(t=!1),a===void 0&&(a=!1);let r=e.getBoundingClientRect(),n=nn(e),s=Ge(1);t&&(o?He(o)&&(s=Ia(o)):s=Ia(e));let l=th(n,a,o)?Ii(n):Ge(0),i=(r.left+l.x)/s.x,c=(r.top+l.y)/s.y,d=r.width/s.x,u=r.height/s.y;if(n){let f=Ee(n),m=o&&He(o)?Ee(o):o,v=f,p=Vo(v);for(;p&&o&&m!==v;){let g=Ia(p),w=p.getBoundingClientRect(),C=Ue(p),L=w.left+(p.clientLeft+parseFloat(C.paddingLeft))*g.x,I=w.top+(p.clientTop+parseFloat(C.paddingTop))*g.y;i*=g.x,c*=g.y,d*=g.x,u*=g.y,i+=L,c+=I,v=Ee(p),p=Vo(v)}}return Ht({width:d,height:u,x:i,y:c})}function zo(e,t){let a=Za(e).scrollLeft;return t?t.left+a:Wt(Ke(e)).left+a}function bi(e,t){let a=e.getBoundingClientRect(),o=a.left+t.scrollLeft-zo(e,a),r=a.top+t.scrollTop;return{x:o,y:r}}function ah(e){let{elements:t,rect:a,offsetParent:o,strategy:r}=e,n=r==="fixed",s=Ke(o),l=t?Ya(t.floating):!1;if(o===s||l&&n)return a;let i={scrollLeft:0,scrollTop:0},c=Ge(1),d=Ge(0),u=Qe(o);if((u||!u&&!n)&&((Vt(o)!=="body"||Sa(s))&&(i=Za(o)),u)){let m=Wt(o);c=Ia(o),d.x=m.x+o.clientLeft,d.y=m.y+o.clientTop}let f=s&&!u&&!n?bi(s,i):Ge(0);return{width:a.width*c.x,height:a.height*c.y,x:a.x*c.x-i.scrollLeft*c.x+d.x+f.x,y:a.y*c.y-i.scrollTop*c.y+d.y+f.y}}function oh(e){return Array.from(e.getClientRects())}function rh(e){let t=Ke(e),a=Za(e),o=e.ownerDocument.body,r=Te(t.scrollWidth,t.clientWidth,o.scrollWidth,o.clientWidth),n=Te(t.scrollHeight,t.clientHeight,o.scrollHeight,o.clientHeight),s=-a.scrollLeft+zo(e),l=-a.scrollTop;return Ue(o).direction==="rtl"&&(s+=Te(t.clientWidth,o.clientWidth)-r),{width:r,height:n,x:s,y:l}}var wi=25;function nh(e,t){let a=Ee(e),o=Ke(e),r=a.visualViewport,n=o.clientWidth,s=o.clientHeight,l=0,i=0;if(r){n=r.width,s=r.height;let d=qo();(!d||d&&t==="fixed")&&(l=r.offsetLeft,i=r.offsetTop)}let c=zo(o);if(c<=0){let d=o.ownerDocument,u=d.body,f=getComputedStyle(u),m=d.compatMode==="CSS1Compat"&&parseFloat(f.marginLeft)+parseFloat(f.marginRight)||0,v=Math.abs(o.clientWidth-u.clientWidth-m);v<=wi&&(n-=v)}else c<=wi&&(n+=c);return{width:n,height:s,x:l,y:i}}function sh(e,t){let a=Wt(e,!0,t==="fixed"),o=a.top+e.clientTop,r=a.left+e.clientLeft,n=Qe(e)?Ia(e):Ge(1),s=e.clientWidth*n.x,l=e.clientHeight*n.y,i=r*n.x,c=o*n.y;return{width:s,height:l,x:i,y:c}}function Ci(e,t,a){let o;if(t==="viewport")o=nh(e,a);else if(t==="document")o=rh(Ke(e));else if(He(t))o=sh(t,a);else{let r=Ii(e);o={x:t.x-r.x,y:t.y-r.y,width:t.width,height:t.height}}return Ht(o)}function Ri(e,t){let a=ct(e);return a===t||!He(a)||zt(a)?!1:Ue(a).position==="fixed"||Ri(a,t)}function lh(e,t){let a=t.get(e);if(a)return a;let o=qt(e,[],!1).filter(l=>He(l)&&Vt(l)!=="body"),r=null,n=Ue(e).position==="fixed",s=n?ct(e):e;for(;He(s)&&!zt(s);){let l=Ue(s),i=Uo(s);!i&&l.position==="fixed"&&(r=null),(n?!i&&!r:!i&&l.position==="static"&&!!r&&(r.position==="absolute"||r.position==="fixed")||Sa(s)&&!i&&Ri(e,s))?o=o.filter(d=>d!==s):r=l,s=ct(s)}return t.set(e,o),o}function ih(e){let{element:t,boundary:a,rootBoundary:o,strategy:r}=e,s=[...a==="clippingAncestors"?Ya(t)?[]:lh(t,this._c):[].concat(a),o],l=Ci(t,s[0],r),i=l.top,c=l.right,d=l.bottom,u=l.left;for(let f=1;f<s.length;f++){let m=Ci(t,s[f],r);i=Te(m.top,i),c=Ye(m.right,c),d=Ye(m.bottom,d),u=Te(m.left,u)}return{width:c-u,height:d-i,x:u,y:i}}function uh(e){let{width:t,height:a}=Si(e);return{width:t,height:a}}function ch(e,t,a){let o=Qe(t),r=Ke(t),n=a==="fixed",s=Wt(e,!0,n,t),l={scrollLeft:0,scrollTop:0},i=Ge(0);function c(){i.x=zo(r)}if(o||!o&&!n)if((Vt(t)!=="body"||Sa(r))&&(l=Za(t)),o){let m=Wt(t,!0,n,t);i.x=m.x+t.clientLeft,i.y=m.y+t.clientTop}else r&&c();n&&!o&&r&&c();let d=r&&!o&&!n?bi(r,l):Ge(0),u=s.left+l.scrollLeft-i.x-d.x,f=s.top+l.scrollTop-i.y-d.y;return{x:u,y:f,width:s.width,height:s.height}}function rn(e){return Ue(e).position==="static"}function Li(e,t){if(!Qe(e)||Ue(e).position==="fixed")return null;if(t)return t(e);let a=e.offsetParent;return Ke(e)===a&&(a=a.ownerDocument.body),a}function yi(e,t){let a=Ee(e);if(Ya(e))return a;if(!Qe(e)){let r=ct(e);for(;r&&!zt(r);){if(He(r)&&!rn(r))return r;r=ct(r)}return a}let o=Li(e,t);for(;o&&xi(o)&&rn(o);)o=Li(o,t);return o&&zt(o)&&rn(o)&&!Uo(o)?a:o||gi(e)||a}var dh=async function(e){let t=this.getOffsetParent||yi,a=this.getDimensions,o=await a(e.floating);return{reference:ch(e.reference,await t(e.floating),e.strategy),floating:{x:0,y:0,width:o.width,height:o.height}}};function fh(e){return Ue(e).direction==="rtl"}var Pi={convertOffsetParentRelativeRectToViewportRelativeRect:ah,getDocumentElement:Ke,getClippingRect:ih,getOffsetParent:yi,getElementRects:dh,getClientRects:oh,getDimensions:uh,getScale:Ia,isElement:He,isRTL:fh};function Mi(e,t){return e.x===t.x&&e.y===t.y&&e.width===t.width&&e.height===t.height}function ph(e,t){let a=null,o,r=Ke(e);function n(){var l;clearTimeout(o),(l=a)==null||l.disconnect(),a=null}function s(l,i){l===void 0&&(l=!1),i===void 0&&(i=1),n();let c=e.getBoundingClientRect(),{left:d,top:u,width:f,height:m}=c;if(l||t(),!f||!m)return;let v=$a(u),p=$a(r.clientWidth-(d+f)),g=$a(r.clientHeight-(u+m)),w=$a(d),L={rootMargin:-v+"px "+-p+"px "+-g+"px "+-w+"px",threshold:Te(0,Ye(1,i))||1},I=!0;function R(D){let y=D[0].intersectionRatio;if(y!==i){if(!I)return s();y?s(!1,y):o=setTimeout(()=>{s(!1,1e-7)},1e3)}y===1&&!Mi(c,e.getBoundingClientRect())&&s(),I=!1}try{a=new IntersectionObserver(R,{...L,root:r.ownerDocument})}catch{a=new IntersectionObserver(R,L)}a.observe(e)}return s(!0),n}function sn(e,t,a,o){o===void 0&&(o={});let{ancestorScroll:r=!0,ancestorResize:n=!0,elementResize:s=typeof ResizeObserver=="function",layoutShift:l=typeof IntersectionObserver=="function",animationFrame:i=!1}=o,c=nn(e),d=r||n?[...c?qt(c):[],...t?qt(t):[]]:[];d.forEach(w=>{r&&w.addEventListener("scroll",a,{passive:!0}),n&&w.addEventListener("resize",a)});let u=c&&l?ph(c,a):null,f=-1,m=null;s&&(m=new ResizeObserver(w=>{let[C]=w;C&&C.target===c&&m&&t&&(m.unobserve(t),cancelAnimationFrame(f),f=requestAnimationFrame(()=>{var L;(L=m)==null||L.observe(t)})),a()}),c&&!i&&m.observe(c),t&&m.observe(t));let v,p=i?Wt(e):null;i&&g();function g(){let w=Wt(e);p&&!Mi(p,w)&&a(),p=w,v=requestAnimationFrame(g)}return a(),()=>{var w;d.forEach(C=>{r&&C.removeEventListener("scroll",a),n&&C.removeEventListener("resize",a)}),u?.(),(w=m)==null||w.disconnect(),m=null,i&&cancelAnimationFrame(v)}}var Ti=ci;var Ai=di,ki=li,Di=pi,Ei=ii,ln=si;var Oi=fi,un=(e,t,a)=>{let o=new Map,r={platform:Pi,...a},n={...r.platform,_c:o};return ni(e,t,{...r,platform:n})};var mh=typeof document<"u",hh=function(){},Wo=mh?Pt:hh;function Go(e,t){if(e===t)return!0;if(typeof e!=typeof t)return!1;if(typeof e=="function"&&e.toString()===t.toString())return!0;let a,o,r;if(e&&t&&typeof e=="object"){if(Array.isArray(e)){if(a=e.length,a!==t.length)return!1;for(o=a;o--!==0;)if(!Go(e[o],t[o]))return!1;return!0}if(r=Object.keys(e),a=r.length,a!==Object.keys(t).length)return!1;for(o=a;o--!==0;)if(!{}.hasOwnProperty.call(t,r[o]))return!1;for(o=a;o--!==0;){let n=r[o];if(!(n==="_owner"&&e.$$typeof)&&!Go(e[n],t[n]))return!1}return!0}return e!==e&&t!==t}function Bi(e){return typeof window>"u"?1:(e.ownerDocument.defaultView||window).devicePixelRatio||1}function Fi(e,t){let a=Bi(e);return Math.round(t*a)/a}function cn(e){let t=b(e);return Wo(()=>{t.current=e}),t}function Ni(e){e===void 0&&(e={});let{placement:t="bottom",strategy:a="absolute",middleware:o=[],platform:r,elements:{reference:n,floating:s}={},transform:l=!0,whileElementsMounted:i,open:c}=e,[d,u]=T({x:0,y:0,strategy:a,placement:t,middlewareData:{},isPositioned:!1}),[f,m]=T(o);Go(f,o)||m(o);let[v,p]=T(null),[g,w]=T(null),C=_(U=>{U!==D.current&&(D.current=U,p(U))},[]),L=_(U=>{U!==y.current&&(y.current=U,w(U))},[]),I=n||v,R=s||g,D=b(null),y=b(null),H=b(d),z=i!=null,V=cn(i),G=cn(r),F=cn(c),$=_(()=>{if(!D.current||!y.current)return;let U={placement:t,strategy:a,middleware:f};G.current&&(U.platform=G.current),un(D.current,y.current,U).then(E=>{let Q={...E,isPositioned:F.current!==!1};j.current&&!Go(H.current,Q)&&(H.current=Q,vo(()=>{u(Q)}))})},[f,t,a,G,F]);Wo(()=>{c===!1&&H.current.isPositioned&&(H.current.isPositioned=!1,u(U=>({...U,isPositioned:!1})))},[c]);let j=b(!1);Wo(()=>(j.current=!0,()=>{j.current=!1}),[]),Wo(()=>{if(I&&(D.current=I),R&&(y.current=R),I&&R){if(V.current)return V.current(I,R,$);$()}},[I,R,$,V,z]);let re=me(()=>({reference:D,floating:y,setReference:C,setFloating:L}),[C,L]),X=me(()=>({reference:I,floating:R}),[I,R]),J=me(()=>{let U={position:a,left:0,top:0};if(!X.floating)return U;let E=Fi(X.floating,d.x),Q=Fi(X.floating,d.y);return l?{...U,transform:"translate("+E+"px, "+Q+"px)",...Bi(X.floating)>=1.5&&{willChange:"transform"}}:{position:a,left:E,top:Q}},[a,l,X.floating,d.x,d.y]);return me(()=>({...d,update:$,refs:re,elements:X,floatingStyles:J}),[d,$,re,X,J])}var xh=e=>{function t(a){return{}.hasOwnProperty.call(a,"current")}return{name:"arrow",options:e,fn(a){let{element:o,padding:r}=typeof e=="function"?e(a):e;return o&&t(o)?o.current!=null?ln({element:o.current,padding:r}).fn(a):{}:o?ln({element:o,padding:r}).fn(a):{}}}},_i=(e,t)=>{let a=Ti(e);return{name:a.name,fn:a.fn,options:[e,t]}},Hi=(e,t)=>{let a=Ai(e);return{name:a.name,fn:a.fn,options:[e,t]}},Ui=(e,t)=>({fn:Oi(e).fn,options:[e,t]}),qi=(e,t)=>{let a=ki(e);return{name:a.name,fn:a.fn,options:[e,t]}},Vi=(e,t)=>{let a=Di(e);return{name:a.name,fn:a.fn,options:[e,t]}};var zi=(e,t)=>{let a=Ei(e);return{name:a.name,fn:a.fn,options:[e,t]}};var Wi=(e,t)=>{let a=xh(e);return{name:a.name,fn:a.fn,options:[e,t]}};var gh="Arrow",Gi=x((e,t)=>{let{children:a,width:o=10,height:r=5,...n}=e;return h(N.svg,{...n,ref:t,width:o,height:r,viewBox:"0 0 30 10",preserveAspectRatio:"none",children:e.asChild?a:h("polygon",{points:"0,0 30,0 15,10"})})});Gi.displayName=gh;var Xi=Gi;var dn="Popper",[Ki,dt]=ue(dn),[wh,ji]=Ki(dn),$i=e=>{let{__scopePopper:t,children:a}=e,[o,r]=T(null),[n,s]=T(void 0);return h(wh,{scope:t,anchor:o,onAnchorChange:r,placementState:n,setPlacementState:s,children:a})};$i.displayName=dn;var Yi="PopperAnchor",Zi=x((e,t)=>{let{__scopePopper:a,virtualRef:o,...r}=e,n=ji(Yi,a),s=b(null),l=n.onAnchorChange,i=_(v=>{s.current=v,v&&l(v)},[l]),c=K(t,i),d=b(null);k(()=>{if(!o)return;let v=d.current;d.current=o.current,v!==d.current&&l(d.current)});let u=n.placementState&&pn(n.placementState),f=u?.[0],m=u?.[1];return o?null:h(N.div,{"data-radix-popper-side":f,"data-radix-popper-align":m,...r,ref:c})});Zi.displayName=Yi;var fn="PopperContent",[Ch,Lh]=Ki(fn),Ji=x((e,t)=>{let{__scopePopper:a,side:o="bottom",sideOffset:r=0,align:n="center",alignOffset:s=0,arrowPadding:l=0,avoidCollisions:i=!0,collisionBoundary:c,collisionPadding:d=0,sticky:u="partial",hideWhenDetached:f=!1,updatePositionStrategy:m="optimized",onPlaced:v,...p}=e,g=ji(fn,a),[w,C]=T(null),L=K(t,ie=>C(ie)),[I,R]=T(null),D=xt(I),y=D?.width??0,H=D?.height??0,z=o+(n!=="center"?"-"+n:""),V=typeof d=="number"?d:{top:0,right:0,bottom:0,left:0,...d},G=c?Array.isArray(c)?c:[c]:void 0,F=G!==void 0&&G.length>0,$={padding:V,boundary:G?.filter(Ih),altBoundary:F},{refs:j,floatingStyles:re,placement:X,isPositioned:J,middlewareData:U}=Ni({strategy:"fixed",placement:z,whileElementsMounted:(...ie)=>sn(...ie,{animationFrame:m==="always"}),elements:{reference:g.anchor},middleware:[_i({mainAxis:r+H,alignmentAxis:s}),i&&Hi({mainAxis:!0,crossAxis:!1,limiter:u==="partial"?Ui():void 0,...$}),i&&qi({...$}),Vi({...$,apply:({elements:ie,rects:Se,availableWidth:ae,availableHeight:ne})=>{let{width:xe,height:Fe}=Se.reference,Pe=ie.floating.style;Pe.setProperty("--radix-popper-available-width",`${ae}px`),Pe.setProperty("--radix-popper-available-height",`${ne}px`),Pe.setProperty("--radix-popper-anchor-width",`${xe}px`),Pe.setProperty("--radix-popper-anchor-height",`${Fe}px`)}}),I&&Wi({element:I,padding:l}),bh({arrowWidth:y,arrowHeight:H}),f&&zi({strategy:"referenceHidden",...$})]}),E=g.setPlacementState;ce(()=>(E(X),()=>{E(void 0)}),[X,E]);let[Q,te]=pn(X),ve=de(v);ce(()=>{J&&ve?.()},[J,ve]);let ge=U.arrow?.x,ye=U.arrow?.y,ke=U.arrow?.centerOffset!==0,[B,W]=T();return ce(()=>{w&&W(window.getComputedStyle(w).zIndex)},[w]),h("div",{ref:j.setFloating,"data-radix-popper-content-wrapper":"",style:{...re,transform:J?re.transform:"translate(0, -200%)",minWidth:"max-content",zIndex:B,"--radix-popper-transform-origin":[U.transformOrigin?.x,U.transformOrigin?.y].join(" "),...U.hide?.referenceHidden&&{visibility:"hidden",pointerEvents:"none"}},dir:e.dir,children:h(Ch,{scope:a,placedSide:Q,placedAlign:te,onArrowChange:R,arrowX:ge,arrowY:ye,shouldHideArrow:ke,children:h(N.div,{"data-side":Q,"data-align":te,...p,ref:L,style:{...p.style,animation:J?void 0:"none"}})})})});Ji.displayName=fn;var Qi="PopperArrow",Sh={top:"bottom",right:"left",bottom:"top",left:"right"},eu=x(function(t,a){let{__scopePopper:o,...r}=t,n=Lh(Qi,o),s=Sh[n.placedSide];return h("span",{ref:n.onArrowChange,style:{position:"absolute",left:n.arrowX,top:n.arrowY,[s]:0,transformOrigin:{top:"",right:"0 0",bottom:"center 0",left:"100% 0"}[n.placedSide],transform:{top:"translateY(100%)",right:"translateY(50%) rotate(90deg) translateX(-50%)",bottom:"rotate(180deg)",left:"translateY(50%) rotate(-90deg) translateX(50%)"}[n.placedSide],visibility:n.shouldHideArrow?"hidden":void 0},children:h(Xi,{...r,ref:a,style:{...r.style,display:"block"}})})});eu.displayName=Qi;function Ih(e){return e!==null}var bh=e=>({name:"transformOrigin",options:e,fn(t){let{placement:a,rects:o,middlewareData:r}=t,s=r.arrow?.centerOffset!==0,l=s?0:e.arrowWidth,i=s?0:e.arrowHeight,[c,d]=pn(a),u={start:"0%",center:"50%",end:"100%"}[d],f=(r.arrow?.x??0)+l/2,m=(r.arrow?.y??0)+i/2,v="",p="";return c==="bottom"?(v=s?u:`${f}px`,p=`${-i}px`):c==="top"?(v=s?u:`${f}px`,p=`${o.floating.height+i}px`):c==="right"?(v=`${-i}px`,p=s?u:`${m}px`):c==="left"&&(v=`${o.floating.width+i}px`,p=s?u:`${m}px`),{data:{x:v,y:p}}}});function pn(e){let[t,a="center"]=e.split("-");return[t,a]}var Gt=$i,ba=Zi,Ra=Ji,ya=eu;var hn="rovingFocusGroup.onEntryFocus",Rh={bubbles:!1,cancelable:!0},Ja="RovingFocusGroup",[xn,tu,yh]=Ct(Ja),[Ph,Pa]=ue(Ja,[yh]),[Mh,Th]=Ph(Ja),au=x((e,t)=>h(xn.Provider,{scope:e.__scopeRovingFocusGroup,children:h(xn.Slot,{scope:e.__scopeRovingFocusGroup,children:h(Ah,{...e,ref:t})})}));au.displayName=Ja;var Ah=x((e,t)=>{let{__scopeRovingFocusGroup:a,orientation:o,loop:r=!1,dir:n,currentTabStopId:s,defaultCurrentTabStopId:l,onCurrentTabStopIdChange:i,onEntryFocus:c,preventScrollOnEntryFocus:d=!1,...u}=e,f=b(null),m=K(t,f),v=_e(n),[p,g]=Le({prop:s,defaultProp:l??null,onChange:i,caller:Ja}),[w,C]=T(!1),L=de(c),I=tu(a),R=b(!1),[D,y]=T(0);return k(()=>{let H=f.current;if(H)return H.addEventListener(hn,L),()=>H.removeEventListener(hn,L)},[L]),h(Mh,{scope:a,orientation:o,dir:v,loop:r,currentTabStopId:p,onItemFocus:_(H=>g(H),[g]),onItemShiftTab:_(()=>C(!0),[]),onFocusableItemAdd:_(()=>y(H=>H+1),[]),onFocusableItemRemove:_(()=>y(H=>H-1),[]),children:h(N.div,{tabIndex:w||D===0?-1:0,"data-orientation":o,...u,ref:m,style:{outline:"none",...e.style},onMouseDown:A(e.onMouseDown,()=>{R.current=!0}),onFocus:A(e.onFocus,H=>{let z=!R.current;if(H.target===H.currentTarget&&z&&!w){let V=new CustomEvent(hn,Rh);if(H.currentTarget.dispatchEvent(V),!V.defaultPrevented){let G=I().filter(X=>X.focusable),F=G.find(X=>X.active),$=G.find(X=>X.id===p),re=[F,$,...G].filter(Boolean).map(X=>X.ref.current);nu(re,d)}}R.current=!1}),onBlur:A(e.onBlur,()=>C(!1))})})}),ou="RovingFocusGroupItem",ru=x((e,t)=>{let{__scopeRovingFocusGroup:a,focusable:o=!0,active:r=!1,tabStopId:n,children:s,...l}=e,i=we(),c=n||i,d=Th(ou,a),u=d.currentTabStopId===c,f=tu(a),{onFocusableItemAdd:m,onFocusableItemRemove:v,currentTabStopId:p}=d;return k(()=>{if(o)return m(),()=>v()},[o,m,v]),h(xn.ItemSlot,{scope:a,id:c,focusable:o,active:r,children:h(N.span,{tabIndex:u?0:-1,"data-orientation":d.orientation,...l,ref:t,onMouseDown:A(e.onMouseDown,g=>{o?d.onItemFocus(c):g.preventDefault()}),onFocus:A(e.onFocus,()=>d.onItemFocus(c)),onKeyDown:A(e.onKeyDown,g=>{if(g.key==="Tab"&&g.shiftKey){d.onItemShiftTab();return}if(g.target!==g.currentTarget)return;let w=Eh(g,d.orientation,d.dir);if(w!==void 0){if(g.metaKey||g.ctrlKey||g.altKey||g.shiftKey)return;g.preventDefault();let L=f().filter(I=>I.focusable).map(I=>I.ref.current);if(w==="last")L.reverse();else if(w==="prev"||w==="next"){w==="prev"&&L.reverse();let I=L.indexOf(g.currentTarget);L=d.loop?Oh(L,I+1):L.slice(I+1)}setTimeout(()=>nu(L))}}),children:typeof s=="function"?s({isCurrentTabStop:u,hasTabStop:p!=null}):s})})});ru.displayName=ou;var kh={ArrowLeft:"prev",ArrowUp:"prev",ArrowRight:"next",ArrowDown:"next",PageUp:"first",Home:"first",PageDown:"last",End:"last"};function Dh(e,t){return t!=="rtl"?e:e==="ArrowLeft"?"ArrowRight":e==="ArrowRight"?"ArrowLeft":e}function Eh(e,t,a){let o=Dh(e.key,a);if(!(t==="vertical"&&["ArrowLeft","ArrowRight"].includes(o))&&!(t==="horizontal"&&["ArrowUp","ArrowDown"].includes(o)))return kh[o]}function nu(e,t=!1){let a=document.activeElement;for(let o of e)if(o===a||(o.focus({preventScroll:t}),document.activeElement!==a))return}function Oh(e,t){return e.map((a,o)=>e[(t+o)%e.length])}var Xo=au,Ko=ru;var gn=["Enter"," "],Fh=["ArrowDown","PageUp","Home"],iu=["ArrowUp","PageDown","End"],Bh=[...Fh,...iu],Nh={ltr:[...gn,"ArrowRight"],rtl:[...gn,"ArrowLeft"]},_h={ltr:["ArrowLeft"],rtl:["ArrowRight"]},ao="Menu",[eo,Hh,Uh]=Ct(ao),[Xt,vn]=ue(ao,[Uh,dt,Pa]),oo=dt(),uu=Pa(),[cu,Lt]=Xt(ao),[qh,ro]=Xt(ao),du=e=>{let{__scopeMenu:t,open:a=!1,children:o,dir:r,onOpenChange:n,modal:s=!0}=e,l=oo(t),[i,c]=T(null),d=b(!1),u=de(n),f=_e(r);return k(()=>{let m=()=>{d.current=!0,document.addEventListener("pointerdown",v,{capture:!0,once:!0}),document.addEventListener("pointermove",v,{capture:!0,once:!0})},v=()=>d.current=!1;return document.addEventListener("keydown",m,{capture:!0}),()=>{document.removeEventListener("keydown",m,{capture:!0}),document.removeEventListener("pointerdown",v,{capture:!0}),document.removeEventListener("pointermove",v,{capture:!0})}},[]),h(Gt,{...l,children:h(cu,{scope:t,open:a,onOpenChange:u,content:i,onContentChange:c,children:h(qh,{scope:t,onClose:_(()=>u(!1),[u]),isUsingKeyboardRef:d,dir:f,modal:s,children:o})})})};du.displayName=ao;var Vh="MenuAnchor",wn=x((e,t)=>{let{__scopeMenu:a,...o}=e,r=oo(a);return h(ba,{...r,...o,ref:t})});wn.displayName=Vh;var Cn="MenuPortal",[zh,fu]=Xt(Cn,{forceMount:void 0}),pu=e=>{let{__scopeMenu:t,forceMount:a,children:o,container:r}=e,n=Lt(Cn,t);return h(zh,{scope:t,forceMount:a,children:h(he,{present:a||n.open,children:h(ut,{asChild:!0,container:r,children:o})})})};pu.displayName=Cn;var qe="MenuContent",[Wh,Ln]=Xt(qe),mu=x((e,t)=>{let a=fu(qe,e.__scopeMenu),{forceMount:o=a.forceMount,...r}=e,n=Lt(qe,e.__scopeMenu),s=ro(qe,e.__scopeMenu);return h(eo.Provider,{scope:e.__scopeMenu,children:h(he,{present:o||n.open,children:h(eo.Slot,{scope:e.__scopeMenu,children:s.modal?h(Gh,{...r,ref:t}):h(Xh,{...r,ref:t})})})})}),Gh=x((e,t)=>{let a=Lt(qe,e.__scopeMenu),o=b(null),r=K(t,o);return k(()=>{let n=o.current;if(n)return ga(n)},[]),h(Sn,{...e,ref:r,trapFocus:a.open,disableOutsidePointerEvents:a.open,disableOutsideScroll:!0,onFocusOutside:A(e.onFocusOutside,n=>n.preventDefault(),{checkForDefaultPrevented:!1}),onDismiss:()=>a.onOpenChange(!1)})}),Xh=x((e,t)=>{let a=Lt(qe,e.__scopeMenu);return h(Sn,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,disableOutsideScroll:!1,onDismiss:()=>a.onOpenChange(!1)})}),Kh=Ne("MenuContent.ScrollLock"),Sn=x((e,t)=>{let{__scopeMenu:a,loop:o=!1,trapFocus:r,onOpenAutoFocus:n,onCloseAutoFocus:s,disableOutsidePointerEvents:l,onEntryFocus:i,onEscapeKeyDown:c,onPointerDownOutside:d,onFocusOutside:u,onInteractOutside:f,onDismiss:m,disableOutsideScroll:v,...p}=e,g=Lt(qe,a),w=ro(qe,a),C=oo(a),L=uu(a),I=Hh(a),[R,D]=T(null),y=b(null),H=K(t,y,g.onContentChange),z=b(0),V=b(""),G=b(0),F=b(null),$=b("right"),j=b(0),re=v?Bt:ze,X=v?{as:Kh,allowPinchZoom:!0}:void 0,J=E=>{let Q=V.current+E,te=I().filter(W=>!W.disabled),ve=document.activeElement,ge=te.find(W=>W.ref.current===ve)?.textValue,ye=te.map(W=>W.textValue),ke=sx(ye,Q,ge),B=te.find(W=>W.textValue===ke)?.ref.current;(function W(ie){V.current=ie,window.clearTimeout(z.current),ie!==""&&(z.current=window.setTimeout(()=>W(""),1e3))})(Q),B&&setTimeout(()=>B.focus())};k(()=>()=>window.clearTimeout(z.current),[]),pa();let U=_(E=>$.current===F.current?.side&&ix(E,F.current?.area),[]);return h(Wh,{scope:a,searchRef:V,onItemEnter:_(E=>{U(E)&&E.preventDefault()},[U]),onItemLeave:_(E=>{U(E)||(y.current?.focus(),D(null))},[U]),onTriggerLeave:_(E=>{U(E)&&E.preventDefault()},[U]),pointerGraceTimerRef:G,onPointerGraceIntentChange:_(E=>{F.current=E},[]),children:h(re,{...X,children:h(Dt,{asChild:!0,trapped:r,onMountAutoFocus:A(n,E=>{E.preventDefault(),y.current?.focus({preventScroll:!0})}),onUnmountAutoFocus:s,children:h(it,{asChild:!0,disableOutsidePointerEvents:l,onEscapeKeyDown:c,onPointerDownOutside:d,onFocusOutside:u,onInteractOutside:f,onDismiss:m,children:h(Xo,{asChild:!0,...L,dir:w.dir,orientation:"vertical",loop:o,currentTabStopId:R,onCurrentTabStopIdChange:D,onEntryFocus:A(i,E=>{w.isUsingKeyboardRef.current||E.preventDefault()}),preventScrollOnEntryFocus:!0,children:h(Ra,{role:"menu","aria-orientation":"vertical","data-state":Au(g.open),"data-radix-menu-content":"",dir:w.dir,...C,...p,ref:H,style:{outline:"none",...p.style},onKeyDown:A(p.onKeyDown,E=>{let te=E.target.closest("[data-radix-menu-content]")===E.currentTarget,ve=E.ctrlKey||E.altKey||E.metaKey,ge=E.key.length===1;te&&(E.key==="Tab"&&E.preventDefault(),!ve&&ge&&J(E.key));let ye=y.current;if(E.target!==ye||!Bh.includes(E.key))return;E.preventDefault();let B=I().filter(W=>!W.disabled).map(W=>W.ref.current);iu.includes(E.key)&&B.reverse(),rx(B)}),onBlur:A(e.onBlur,E=>{E.currentTarget.contains(E.target)||(window.clearTimeout(z.current),V.current="")}),onPointerMove:A(e.onPointerMove,to(E=>{let Q=E.target,te=j.current!==E.clientX;if(E.currentTarget.contains(Q)&&te){let ve=E.clientX>j.current?"right":"left";$.current=ve,j.current=E.clientX}}))})})})})})})});mu.displayName=qe;var jh="MenuGroup",In=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(N.div,{role:"group",...o,ref:t})});In.displayName=jh;var $h="MenuLabel",hu=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(N.div,{...o,ref:t})});hu.displayName=$h;var jo="MenuItem",lu="menu.itemSelect",Yo=x((e,t)=>{let{disabled:a=!1,onSelect:o,...r}=e,n=b(null),s=ro(jo,e.__scopeMenu),l=Ln(jo,e.__scopeMenu),i=K(t,n),c=b(!1),d=()=>{let u=n.current;if(!a&&u){let f=new CustomEvent(lu,{bubbles:!0,cancelable:!0});u.addEventListener(lu,m=>o?.(m),{once:!0}),Co(u,f),f.defaultPrevented?c.current=!1:s.onClose()}};return h(xu,{...r,ref:i,disabled:a,onClick:A(e.onClick,d),onPointerDown:u=>{e.onPointerDown?.(u),c.current=!0},onPointerUp:A(e.onPointerUp,u=>{c.current||u.currentTarget?.click()}),onKeyDown:A(e.onKeyDown,u=>{let f=l.searchRef.current!=="";a||f&&u.key===" "||gn.includes(u.key)&&(u.currentTarget.click(),u.preventDefault())})})});Yo.displayName=jo;var xu=x((e,t)=>{let{__scopeMenu:a,disabled:o=!1,textValue:r,...n}=e,s=Ln(jo,a),l=uu(a),i=b(null),c=K(t,i),[d,u]=T(!1),[f,m]=T("");return k(()=>{let v=i.current;v&&m((v.textContent??"").trim())},[n.children]),h(eo.ItemSlot,{scope:a,disabled:o,textValue:r??f,children:h(Ko,{asChild:!0,...l,focusable:!o,children:h(N.div,{role:"menuitem","data-highlighted":d?"":void 0,"aria-disabled":o||void 0,"data-disabled":o?"":void 0,...n,ref:c,onPointerMove:A(e.onPointerMove,to(v=>{o?s.onItemLeave(v):(s.onItemEnter(v),v.defaultPrevented||v.currentTarget.focus({preventScroll:!0}))})),onPointerLeave:A(e.onPointerLeave,to(v=>s.onItemLeave(v))),onFocus:A(e.onFocus,()=>u(!0)),onBlur:A(e.onBlur,()=>u(!1))})})})}),Yh="MenuCheckboxItem",gu=x((e,t)=>{let{checked:a=!1,onCheckedChange:o,...r}=e;return h(Su,{scope:e.__scopeMenu,checked:a,children:h(Yo,{role:"menuitemcheckbox","aria-checked":$o(a)?"mixed":a,...r,ref:t,"data-state":yn(a),onSelect:A(r.onSelect,()=>o?.($o(a)?!0:!a),{checkForDefaultPrevented:!1})})})});gu.displayName=Yh;var vu="MenuRadioGroup",[Zh,Jh]=Xt(vu,{value:void 0,onValueChange:()=>{}}),wu=x((e,t)=>{let{value:a,onValueChange:o,...r}=e,n=de(o);return h(Zh,{scope:e.__scopeMenu,value:a,onValueChange:n,children:h(In,{...r,ref:t})})});wu.displayName=vu;var Cu="MenuRadioItem",Lu=x((e,t)=>{let{value:a,...o}=e,r=Jh(Cu,e.__scopeMenu),n=a===r.value;return h(Su,{scope:e.__scopeMenu,checked:n,children:h(Yo,{role:"menuitemradio","aria-checked":n,...o,ref:t,"data-state":yn(n),onSelect:A(o.onSelect,()=>r.onValueChange?.(a),{checkForDefaultPrevented:!1})})})});Lu.displayName=Cu;var bn="MenuItemIndicator",[Su,Qh]=Xt(bn,{checked:!1}),Iu=x((e,t)=>{let{__scopeMenu:a,forceMount:o,...r}=e,n=Qh(bn,a);return h(he,{present:o||$o(n.checked)||n.checked===!0,children:h(N.span,{...r,ref:t,"data-state":yn(n.checked)})})});Iu.displayName=bn;var ex="MenuSeparator",bu=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(N.div,{role:"separator","aria-orientation":"horizontal",...o,ref:t})});bu.displayName=ex;var tx="MenuArrow",Ru=x((e,t)=>{let{__scopeMenu:a,...o}=e,r=oo(a);return h(ya,{...r,...o,ref:t})});Ru.displayName=tx;var Rn="MenuSub",[ax,yu]=Xt(Rn),ox=e=>{let{__scopeMenu:t,children:a,open:o=!1,onOpenChange:r}=e,n=Lt(Rn,t),s=oo(t),[l,i]=T(null),[c,d]=T(null),u=de(r);return k(()=>(n.open===!1&&u(!1),()=>u(!1)),[n.open,u]),h(Gt,{...s,children:h(cu,{scope:t,open:o,onOpenChange:u,content:c,onContentChange:d,children:h(ax,{scope:t,contentId:we(),triggerId:we(),trigger:l,onTriggerChange:i,children:a})})})};ox.displayName=Rn;var Qa="MenuSubTrigger",Pu=x((e,t)=>{let a=Lt(Qa,e.__scopeMenu),o=ro(Qa,e.__scopeMenu),r=yu(Qa,e.__scopeMenu),n=Ln(Qa,e.__scopeMenu),s=b(null),{pointerGraceTimerRef:l,onPointerGraceIntentChange:i}=n,c={__scopeMenu:e.__scopeMenu},d=_(()=>{s.current&&window.clearTimeout(s.current),s.current=null},[]);return k(()=>d,[d]),k(()=>{let u=l.current;return()=>{window.clearTimeout(u),i(null)}},[l,i]),h(wn,{asChild:!0,...c,children:h(xu,{id:r.triggerId,"aria-haspopup":"menu","aria-expanded":a.open,"aria-controls":a.open?r.contentId:void 0,"data-state":Au(a.open),...e,ref:Va(t,r.onTriggerChange),onClick:u=>{e.onClick?.(u),!(e.disabled||u.defaultPrevented)&&(u.currentTarget.focus(),a.open||a.onOpenChange(!0))},onPointerMove:A(e.onPointerMove,to(u=>{n.onItemEnter(u),!u.defaultPrevented&&!e.disabled&&!a.open&&!s.current&&(n.onPointerGraceIntentChange(null),s.current=window.setTimeout(()=>{a.onOpenChange(!0),d()},100))})),onPointerLeave:A(e.onPointerLeave,to(u=>{d();let f=a.content?.getBoundingClientRect();if(f){let m=a.content?.dataset.side,v=m==="right",p=v?-5:5,g=f[v?"left":"right"],w=f[v?"right":"left"];n.onPointerGraceIntentChange({area:[{x:u.clientX+p,y:u.clientY},{x:g,y:f.top},{x:w,y:f.top},{x:w,y:f.bottom},{x:g,y:f.bottom}],side:m}),window.clearTimeout(l.current),l.current=window.setTimeout(()=>n.onPointerGraceIntentChange(null),300)}else{if(n.onTriggerLeave(u),u.defaultPrevented)return;n.onPointerGraceIntentChange(null)}})),onKeyDown:A(e.onKeyDown,u=>{let f=n.searchRef.current!=="";e.disabled||f&&u.key===" "||Nh[o.dir].includes(u.key)&&(a.onOpenChange(!0),a.content?.focus(),u.preventDefault())})})})});Pu.displayName=Qa;var Mu="MenuSubContent",Tu=x((e,t)=>{let a=fu(qe,e.__scopeMenu),{forceMount:o=a.forceMount,align:r="start",...n}=e,s=Lt(qe,e.__scopeMenu),l=ro(qe,e.__scopeMenu),i=yu(Mu,e.__scopeMenu),c=b(null),d=K(t,c);return h(eo.Provider,{scope:e.__scopeMenu,children:h(he,{present:o||s.open,children:h(eo.Slot,{scope:e.__scopeMenu,children:h(Sn,{id:i.contentId,"aria-labelledby":i.triggerId,...n,ref:d,align:r,side:l.dir==="rtl"?"left":"right",disableOutsidePointerEvents:!1,disableOutsideScroll:!1,trapFocus:!1,onOpenAutoFocus:u=>{l.isUsingKeyboardRef.current&&c.current?.focus(),u.preventDefault()},onCloseAutoFocus:u=>u.preventDefault(),onFocusOutside:A(e.onFocusOutside,u=>{u.target!==i.trigger&&s.onOpenChange(!1)}),onEscapeKeyDown:A(e.onEscapeKeyDown,u=>{l.onClose(),u.preventDefault()}),onKeyDown:A(e.onKeyDown,u=>{let f=u.currentTarget.contains(u.target),m=_h[l.dir].includes(u.key);f&&m&&(s.onOpenChange(!1),i.trigger?.focus(),u.preventDefault())})})})})})});Tu.displayName=Mu;function Au(e){return e?"open":"closed"}function $o(e){return e==="indeterminate"}function yn(e){return $o(e)?"indeterminate":e?"checked":"unchecked"}function rx(e){let t=document.activeElement;for(let a of e)if(a===t||(a.focus(),document.activeElement!==t))return}function nx(e,t){return e.map((a,o)=>e[(t+o)%e.length])}function sx(e,t,a){let r=t.length>1&&Array.from(t).every(c=>c===t[0])?t[0]:t,n=a?e.indexOf(a):-1,s=nx(e,Math.max(n,0));r.length===1&&(s=s.filter(c=>c!==a));let i=s.find(c=>c.toLowerCase().startsWith(r.toLowerCase()));return i!==a?i:void 0}function lx(e,t){let{x:a,y:o}=e,r=!1;for(let n=0,s=t.length-1;n<t.length;s=n++){let l=t[n],i=t[s],c=l.x,d=l.y,u=i.x,f=i.y;d>o!=f>o&&a<(u-c)*(o-d)/(f-d)+c&&(r=!r)}return r}function ix(e,t){if(!t)return!1;let a={x:e.clientX,y:e.clientY};return lx(a,t)}function to(e){return t=>t.pointerType==="mouse"?e(t):void 0}var ku=du,Du=wn,Eu=pu,Ou=mu,Fu=In,Bu=hu,Nu=Yo,_u=gu,Hu=wu,Uu=Lu,qu=Iu,Vu=bu,zu=Ru;var Wu=Pu,Gu=Tu;var Zo="DropdownMenu",[cx,Hb]=ue(Zo,[vn]),Ae=vn(),[dx,Xu]=cx(Zo),fx=e=>{let{__scopeDropdownMenu:t,children:a,dir:o,open:r,defaultOpen:n,onOpenChange:s,modal:l=!0}=e,i=Ae(t),c=b(null),[d,u]=Le({prop:r,defaultProp:n??!1,onChange:s,caller:Zo});return h(dx,{scope:t,triggerId:we(),triggerRef:c,contentId:we(),open:d,onOpenChange:u,onOpenToggle:_(()=>u(f=>!f),[u]),modal:l,children:h(ku,{...i,open:d,onOpenChange:u,dir:o,modal:l,children:a})})};fx.displayName=Zo;var Ku="DropdownMenuTrigger",px=x((e,t)=>{let{__scopeDropdownMenu:a,disabled:o=!1,...r}=e,n=Xu(Ku,a),s=Ae(a);return h(Du,{asChild:!0,...s,children:h(N.button,{type:"button",id:n.triggerId,"aria-haspopup":"menu","aria-expanded":n.open,"aria-controls":n.open?n.contentId:void 0,"data-state":n.open?"open":"closed","data-disabled":o?"":void 0,disabled:o,...r,ref:Va(t,n.triggerRef),onPointerDown:A(e.onPointerDown,l=>{!o&&l.button===0&&l.ctrlKey===!1&&(n.onOpenToggle(),n.open||l.preventDefault())}),onKeyDown:A(e.onKeyDown,l=>{o||(["Enter"," "].includes(l.key)&&n.onOpenToggle(),l.key==="ArrowDown"&&n.onOpenChange(!0),["Enter"," ","ArrowDown"].includes(l.key)&&l.preventDefault())})})})});px.displayName=Ku;var mx="DropdownMenuPortal",ju=e=>{let{__scopeDropdownMenu:t,...a}=e,o=Ae(t);return h(Eu,{...o,...a})};ju.displayName=mx;var $u="DropdownMenuContent",Yu=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Xu($u,a),n=Ae(a),s=b(!1);return h(Ou,{id:r.contentId,"aria-labelledby":r.triggerId,...n,...o,ref:t,onCloseAutoFocus:A(e.onCloseAutoFocus,l=>{s.current||r.triggerRef.current?.focus(),s.current=!1,l.preventDefault()}),onInteractOutside:A(e.onInteractOutside,l=>{let i=l.detail.originalEvent,c=i.button===0&&i.ctrlKey===!0,d=i.button===2||c;(!r.modal||d)&&(s.current=!0)}),style:{...e.style,"--radix-dropdown-menu-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-dropdown-menu-content-available-width":"var(--radix-popper-available-width)","--radix-dropdown-menu-content-available-height":"var(--radix-popper-available-height)","--radix-dropdown-menu-trigger-width":"var(--radix-popper-anchor-width)","--radix-dropdown-menu-trigger-height":"var(--radix-popper-anchor-height)"}})});Yu.displayName=$u;var hx="DropdownMenuGroup",xx=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Fu,{...r,...o,ref:t})});xx.displayName=hx;var gx="DropdownMenuLabel",Zu=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Bu,{...r,...o,ref:t})});Zu.displayName=gx;var vx="DropdownMenuItem",Ju=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Nu,{...r,...o,ref:t})});Ju.displayName=vx;var wx="DropdownMenuCheckboxItem",Qu=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(_u,{...r,...o,ref:t})});Qu.displayName=wx;var Cx="DropdownMenuRadioGroup",Lx=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Hu,{...r,...o,ref:t})});Lx.displayName=Cx;var Sx="DropdownMenuRadioItem",ec=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Uu,{...r,...o,ref:t})});ec.displayName=Sx;var Ix="DropdownMenuItemIndicator",tc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(qu,{...r,...o,ref:t})});tc.displayName=Ix;var bx="DropdownMenuSeparator",ac=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Vu,{...r,...o,ref:t})});ac.displayName=bx;var Rx="DropdownMenuArrow",yx=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(zu,{...r,...o,ref:t})});yx.displayName=Rx;var Px="DropdownMenuSubTrigger",oc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Wu,{...r,...o,ref:t})});oc.displayName=Px;var Mx="DropdownMenuSubContent",rc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ae(a);return h(Gu,{...r,...o,ref:t,style:{...e.style,"--radix-dropdown-menu-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-dropdown-menu-content-available-width":"var(--radix-popper-available-width)","--radix-dropdown-menu-content-available-height":"var(--radix-popper-available-height)","--radix-dropdown-menu-trigger-width":"var(--radix-popper-anchor-width)","--radix-dropdown-menu-trigger-height":"var(--radix-popper-anchor-height)"}})});rc.displayName=Mx;var nc=ju,Pn=Yu;var Mn=Zu,Tn=Ju,An=Qu;var kn=ec,Dn=tc,En=ac;var On=oc,Fn=rc;var Ax=x(({className:e,inset:t,children:a,...o},r)=>S(On,{ref:r,className:O("xps-dropdown-menu-sub-trigger",t&&"xps-dropdown-menu-item--inset",e),...o},a,S(ra,{className:"xps-icon"})));Ax.displayName=On.displayName;var kx=x(({className:e,...t},a)=>S(Fn,{ref:a,className:O("xps-dropdown-menu-content",e),...t}));kx.displayName=Fn.displayName;var Dx=x(({className:e,sideOffset:t=4,...a},o)=>S(nc,null,S(Pn,{ref:o,sideOffset:t,className:O("xps-dropdown-menu-content",e),...a})));Dx.displayName=Pn.displayName;var Ex=x(({className:e,inset:t,...a},o)=>S(Tn,{ref:o,className:O("xps-dropdown-menu-item",t&&"xps-dropdown-menu-item--inset",e),...a}));Ex.displayName=Tn.displayName;var Ox=x(({className:e,children:t,checked:a,...o},r)=>S(An,{ref:r,className:O("xps-dropdown-menu-item xps-dropdown-menu-check-item",e),checked:a,...o},S("span",{className:"xps-dropdown-menu-item-indicator"},S(Dn,null,S(Be,{className:"xps-icon"}))),t));Ox.displayName=An.displayName;var Fx=x(({className:e,children:t,...a},o)=>S(kn,{ref:o,className:O("xps-dropdown-menu-item xps-dropdown-menu-check-item",e),...a},S("span",{className:"xps-dropdown-menu-item-indicator"},S(Dn,null,S(Ua,{className:"xps-icon xps-icon--filled"}))),t));Fx.displayName=kn.displayName;var Bx=x(({className:e,inset:t,...a},o)=>S(Mn,{ref:o,className:O("xps-dropdown-menu-label",t&&"xps-dropdown-menu-item--inset",e),...a}));Bx.displayName=Mn.displayName;var Nx=x(({className:e,...t},a)=>S(En,{ref:a,className:O("xps-dropdown-menu-separator",e),...t}));Nx.displayName=En.displayName;var _x=x(({className:e,...t},a)=>S("span",{ref:a,className:O("xps-dropdown-menu-shortcut",e),...t}));_x.displayName="DropdownMenuShortcut";var no=x(({className:e,type:t,...a},o)=>S("input",{ref:o,type:t,className:O("xps-input",e),...a}));no.displayName="Input";function St(e,[t,a]){return Math.min(a,Math.max(t,e))}function Hx(e,t){return aa((a,o)=>t[a][o]??a,e)}var Bn="ScrollArea",[lc,lR]=ue(Bn),[Ux,Ve]=lc(Bn),ic=x((e,t)=>{let{__scopeScrollArea:a,type:o="hover",dir:r,scrollHideDelay:n=600,...s}=e,[l,i]=T(null),[c,d]=T(null),[u,f]=T(null),[m,v]=T(null),[p,g]=T(null),[w,C]=T(0),[L,I]=T(0),[R,D]=T(!1),[y,H]=T(!1),z=K(t,G=>i(G)),V=_e(r);return h(Ux,{scope:a,type:o,dir:V,scrollHideDelay:n,scrollArea:l,viewport:c,onViewportChange:d,content:u,onContentChange:f,scrollbarX:m,onScrollbarXChange:v,scrollbarXEnabled:R,onScrollbarXEnabledChange:D,scrollbarY:p,onScrollbarYChange:g,scrollbarYEnabled:y,onScrollbarYEnabledChange:H,onCornerWidthChange:C,onCornerHeightChange:I,children:h(N.div,{dir:V,...s,ref:z,style:{position:"relative","--radix-scroll-area-corner-width":w+"px","--radix-scroll-area-corner-height":L+"px",...e.style}})})});ic.displayName=Bn;var uc="ScrollAreaViewport",cc=x((e,t)=>{let{__scopeScrollArea:a,children:o,nonce:r,...n}=e,s=Ve(uc,a),l=b(null),i=K(t,l,s.onViewportChange);return Ie(Me,{children:[h("style",{dangerouslySetInnerHTML:{__html:"[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}"},nonce:r}),h(N.div,{"data-radix-scroll-area-viewport":"",...n,ref:i,style:{overflowX:s.scrollbarXEnabled?"scroll":"hidden",overflowY:s.scrollbarYEnabled?"scroll":"hidden",...e.style},children:h("div",{ref:s.onContentChange,style:{minWidth:"100%",display:"table"},children:o})})]})});cc.displayName=uc;var et="ScrollAreaScrollbar",er=x((e,t)=>{let{forceMount:a,...o}=e,r=Ve(et,e.__scopeScrollArea),{onScrollbarXEnabledChange:n,onScrollbarYEnabledChange:s}=r,l=e.orientation==="horizontal";return k(()=>(l?n(!0):s(!0),()=>{l?n(!1):s(!1)}),[l,n,s]),r.type==="hover"?h(qx,{...o,ref:t,forceMount:a}):r.type==="scroll"?h(Vx,{...o,ref:t,forceMount:a}):r.type==="auto"?h(dc,{...o,ref:t,forceMount:a}):r.type==="always"?h(Nn,{...o,ref:t,"data-state":"visible"}):null});er.displayName=et;var qx=x((e,t)=>{let{forceMount:a,...o}=e,r=Ve(et,e.__scopeScrollArea),[n,s]=T(!1);return k(()=>{let l=r.scrollArea,i=0;if(l){let c=()=>{window.clearTimeout(i),s(!0)},d=()=>{i=window.setTimeout(()=>s(!1),r.scrollHideDelay)};return l.addEventListener("pointerenter",c),l.addEventListener("pointerleave",d),()=>{window.clearTimeout(i),l.removeEventListener("pointerenter",c),l.removeEventListener("pointerleave",d)}}},[r.scrollArea,r.scrollHideDelay]),h(he,{present:a||n,children:h(dc,{"data-state":n?"visible":"hidden",...o,ref:t})})}),Vx=x((e,t)=>{let{forceMount:a,...o}=e,r=Ve(et,e.__scopeScrollArea),n=e.orientation==="horizontal",s=ar(()=>i("SCROLL_END"),100),[l,i]=Hx("hidden",{hidden:{SCROLL:"scrolling"},scrolling:{SCROLL_END:"idle",POINTER_ENTER:"interacting"},interacting:{SCROLL:"interacting",POINTER_LEAVE:"idle"},idle:{HIDE:"hidden",SCROLL:"scrolling",POINTER_ENTER:"interacting"}});return k(()=>{if(l==="idle"){let c=window.setTimeout(()=>i("HIDE"),r.scrollHideDelay);return()=>window.clearTimeout(c)}},[l,r.scrollHideDelay,i]),k(()=>{let c=r.viewport,d=n?"scrollLeft":"scrollTop";if(c){let u=c[d],f=()=>{let m=c[d];u!==m&&(i("SCROLL"),s()),u=m};return c.addEventListener("scroll",f),()=>c.removeEventListener("scroll",f)}},[r.viewport,n,i,s]),h(he,{present:a||l!=="hidden",children:h(Nn,{"data-state":l==="hidden"?"hidden":"visible",...o,ref:t,onPointerEnter:A(e.onPointerEnter,()=>i("POINTER_ENTER")),onPointerLeave:A(e.onPointerLeave,()=>i("POINTER_LEAVE"))})})}),dc=x((e,t)=>{let a=Ve(et,e.__scopeScrollArea),{forceMount:o,...r}=e,[n,s]=T(!1),l=e.orientation==="horizontal",i=ar(()=>{if(a.viewport){let c=a.viewport.offsetWidth<a.viewport.scrollWidth,d=a.viewport.offsetHeight<a.viewport.scrollHeight;s(l?c:d)}},10);return Ma(a.viewport,i),Ma(a.content,i),h(he,{present:o||n,children:h(Nn,{"data-state":n?"visible":"hidden",...r,ref:t})})}),Nn=x((e,t)=>{let{orientation:a="vertical",...o}=e,r=Ve(et,e.__scopeScrollArea),n=b(null),s=b(0),[l,i]=T({content:0,viewport:0,scrollbar:{size:0,paddingStart:0,paddingEnd:0}}),c=hc(l.viewport,l.content),d={...o,sizes:l,onSizesChange:i,hasThumb:c>0&&c<1,onThumbChange:f=>n.current=f,onThumbPointerUp:()=>s.current=0,onThumbPointerDown:f=>s.current=f};function u(f,m){return jx(f,s.current,l,m)}return a==="horizontal"?h(zx,{...d,ref:t,onThumbPositionChange:()=>{if(r.viewport&&n.current){let f=r.viewport.scrollLeft,m=sc(f,l,r.dir);n.current.style.transform=`translate3d(${m}px, 0, 0)`}},onWheelScroll:f=>{r.viewport&&(r.viewport.scrollLeft=f)},onDragScroll:f=>{r.viewport&&(r.viewport.scrollLeft=u(f,r.dir))}}):a==="vertical"?h(Wx,{...d,ref:t,onThumbPositionChange:()=>{if(r.viewport&&n.current){let f=r.viewport.scrollTop,m=sc(f,l);n.current.style.transform=`translate3d(0, ${m}px, 0)`}},onWheelScroll:f=>{r.viewport&&(r.viewport.scrollTop=f)},onDragScroll:f=>{r.viewport&&(r.viewport.scrollTop=u(f))}}):null}),zx=x((e,t)=>{let{sizes:a,onSizesChange:o,...r}=e,n=Ve(et,e.__scopeScrollArea),[s,l]=T(),i=b(null),c=K(t,i,n.onScrollbarXChange);return k(()=>{i.current&&l(getComputedStyle(i.current))},[i]),h(pc,{"data-orientation":"horizontal",...r,ref:c,sizes:a,style:{bottom:0,left:n.dir==="rtl"?"var(--radix-scroll-area-corner-width)":0,right:n.dir==="ltr"?"var(--radix-scroll-area-corner-width)":0,"--radix-scroll-area-thumb-width":tr(a)+"px",...e.style},onThumbPointerDown:d=>e.onThumbPointerDown(d.x),onDragScroll:d=>e.onDragScroll(d.x),onWheelScroll:(d,u)=>{if(n.viewport){let f=n.viewport.scrollLeft+d.deltaX;e.onWheelScroll(f),gc(f,u)&&d.preventDefault()}},onResize:()=>{i.current&&n.viewport&&s&&o({content:n.viewport.scrollWidth,viewport:n.viewport.offsetWidth,scrollbar:{size:i.current.clientWidth,paddingStart:Qo(s.paddingLeft),paddingEnd:Qo(s.paddingRight)}})}})}),Wx=x((e,t)=>{let{sizes:a,onSizesChange:o,...r}=e,n=Ve(et,e.__scopeScrollArea),[s,l]=T(),i=b(null),c=K(t,i,n.onScrollbarYChange);return k(()=>{i.current&&l(getComputedStyle(i.current))},[i]),h(pc,{"data-orientation":"vertical",...r,ref:c,sizes:a,style:{top:0,right:n.dir==="ltr"?0:void 0,left:n.dir==="rtl"?0:void 0,bottom:"var(--radix-scroll-area-corner-height)","--radix-scroll-area-thumb-height":tr(a)+"px",...e.style},onThumbPointerDown:d=>e.onThumbPointerDown(d.y),onDragScroll:d=>e.onDragScroll(d.y),onWheelScroll:(d,u)=>{if(n.viewport){let f=n.viewport.scrollTop+d.deltaY;e.onWheelScroll(f),gc(f,u)&&d.preventDefault()}},onResize:()=>{i.current&&n.viewport&&s&&o({content:n.viewport.scrollHeight,viewport:n.viewport.offsetHeight,scrollbar:{size:i.current.clientHeight,paddingStart:Qo(s.paddingTop),paddingEnd:Qo(s.paddingBottom)}})}})}),[Gx,fc]=lc(et),pc=x((e,t)=>{let{__scopeScrollArea:a,sizes:o,hasThumb:r,onThumbChange:n,onThumbPointerUp:s,onThumbPointerDown:l,onThumbPositionChange:i,onDragScroll:c,onWheelScroll:d,onResize:u,...f}=e,m=Ve(et,a),[v,p]=T(null),g=K(t,z=>p(z)),w=b(null),C=b(""),L=m.viewport,I=o.content-o.viewport,R=de(d),D=de(i),y=ar(u,10);function H(z){if(w.current){let V=z.clientX-w.current.left,G=z.clientY-w.current.top;c({x:V,y:G})}}return k(()=>{let z=V=>{let G=V.target;v?.contains(G)&&R(V,I)};return document.addEventListener("wheel",z,{passive:!1}),()=>document.removeEventListener("wheel",z,{passive:!1})},[L,v,I,R]),k(D,[o,D]),Ma(v,y),Ma(m.content,y),h(Gx,{scope:a,scrollbar:v,hasThumb:r,onThumbChange:de(n),onThumbPointerUp:de(s),onThumbPositionChange:D,onThumbPointerDown:de(l),children:h(N.div,{...f,ref:g,style:{position:"absolute",...f.style},onPointerDown:A(e.onPointerDown,z=>{z.button===0&&(z.target.setPointerCapture(z.pointerId),w.current=v.getBoundingClientRect(),C.current=document.body.style.webkitUserSelect,document.body.style.webkitUserSelect="none",m.viewport&&(m.viewport.style.scrollBehavior="auto"),H(z))}),onPointerMove:A(e.onPointerMove,H),onPointerUp:A(e.onPointerUp,z=>{let V=z.target;V.hasPointerCapture(z.pointerId)&&V.releasePointerCapture(z.pointerId),document.body.style.webkitUserSelect=C.current,m.viewport&&(m.viewport.style.scrollBehavior=""),w.current=null})})})}),Jo="ScrollAreaThumb",_n=x((e,t)=>{let{forceMount:a,...o}=e,r=fc(Jo,e.__scopeScrollArea);return h(he,{present:a||r.hasThumb,children:h(Xx,{ref:t,...o})})}),Xx=x((e,t)=>{let{__scopeScrollArea:a,style:o,...r}=e,n=Ve(Jo,a),s=fc(Jo,a),{onThumbPositionChange:l}=s,i=K(t,u=>s.onThumbChange(u)),c=b(void 0),d=ar(()=>{c.current&&(c.current(),c.current=void 0)},100);return k(()=>{let u=n.viewport;if(u){let f=()=>{if(d(),!c.current){let m=$x(u,l);c.current=m,l()}};return l(),u.addEventListener("scroll",f),()=>u.removeEventListener("scroll",f)}},[n.viewport,d,l]),h(N.div,{"data-state":s.hasThumb?"visible":"hidden",...r,ref:i,style:{width:"var(--radix-scroll-area-thumb-width)",height:"var(--radix-scroll-area-thumb-height)",...o},onPointerDownCapture:A(e.onPointerDownCapture,u=>{let m=u.target.getBoundingClientRect(),v=u.clientX-m.left,p=u.clientY-m.top;s.onThumbPointerDown({x:v,y:p})}),onPointerUp:A(e.onPointerUp,s.onThumbPointerUp)})});_n.displayName=Jo;var Hn="ScrollAreaCorner",mc=x((e,t)=>{let a=Ve(Hn,e.__scopeScrollArea),o=!!(a.scrollbarX&&a.scrollbarY);return a.type!=="scroll"&&o?h(Kx,{...e,ref:t}):null});mc.displayName=Hn;var Kx=x((e,t)=>{let{__scopeScrollArea:a,...o}=e,r=Ve(Hn,a),[n,s]=T(0),[l,i]=T(0),c=!!(n&&l);return Ma(r.scrollbarX,()=>{let d=r.scrollbarX?.offsetHeight||0;r.onCornerHeightChange(d),i(d)}),Ma(r.scrollbarY,()=>{let d=r.scrollbarY?.offsetWidth||0;r.onCornerWidthChange(d),s(d)}),c?h(N.div,{...o,ref:t,style:{width:n,height:l,position:"absolute",right:r.dir==="ltr"?0:void 0,left:r.dir==="rtl"?0:void 0,bottom:0,...e.style}}):null});function Qo(e){return e?parseInt(e,10):0}function hc(e,t){let a=e/t;return isNaN(a)?0:a}function tr(e){let t=hc(e.viewport,e.content),a=e.scrollbar.paddingStart+e.scrollbar.paddingEnd,o=(e.scrollbar.size-a)*t;return Math.max(o,18)}function jx(e,t,a,o="ltr"){let r=tr(a),n=r/2,s=t||n,l=r-s,i=a.scrollbar.paddingStart+s,c=a.scrollbar.size-a.scrollbar.paddingEnd-l,d=a.content-a.viewport,u=o==="ltr"?[0,d]:[d*-1,0];return xc([i,c],u)(e)}function sc(e,t,a="ltr"){let o=tr(t),r=t.scrollbar.paddingStart+t.scrollbar.paddingEnd,n=t.scrollbar.size-r,s=t.content-t.viewport,l=n-o,i=a==="ltr"?[0,s]:[s*-1,0],c=St(e,i);return xc([0,s],[0,l])(c)}function xc(e,t){return a=>{if(e[0]===e[1]||t[0]===t[1])return t[0];let o=(t[1]-t[0])/(e[1]-e[0]);return t[0]+o*(a-e[0])}}function gc(e,t){return e>0&&e<t}var $x=(e,t=()=>{})=>{let a={left:e.scrollLeft,top:e.scrollTop},o=0;return(function r(){let n={left:e.scrollLeft,top:e.scrollTop},s=a.left!==n.left,l=a.top!==n.top;(s||l)&&t(),a=n,o=window.requestAnimationFrame(r)})(),()=>window.cancelAnimationFrame(o)};function ar(e,t){let a=de(e),o=b(0);return k(()=>()=>window.clearTimeout(o.current),[]),_(()=>{window.clearTimeout(o.current),o.current=window.setTimeout(a,t)},[a,t])}function Ma(e,t){let a=de(t);ce(()=>{let o=0;if(e){let r=new ResizeObserver(()=>{cancelAnimationFrame(o),o=window.requestAnimationFrame(a)});return r.observe(e),()=>{window.cancelAnimationFrame(o),r.unobserve(e)}}},[e,a])}var Un=ic,vc=cc;var wc=mc;var or=x(({className:e,children:t,...a},o)=>S(Un,{ref:o,className:O("xps-scroll-area",e),...a},S(vc,{className:"xps-scroll-area-viewport"},t),S(Cc,null),S(wc,null)));or.displayName=Un.displayName;var Cc=x(({className:e,orientation:t="vertical",...a},o)=>S(er,{ref:o,orientation:t,className:O("xps-scroll-bar",t==="vertical"?"xps-scroll-bar-vertical":"xps-scroll-bar-horizontal",e),...a},S(_n,{className:"xps-scroll-thumb"})));Cc.displayName=er.displayName;var qn=Object.freeze({position:"absolute",border:0,width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0, 0, 0, 0)",whiteSpace:"nowrap",wordWrap:"normal"}),Zx="VisuallyHidden",Lc=x((e,t)=>h(N.span,{...e,ref:t,style:{...qn,...e.style}}));Lc.displayName=Zx;var Sc=Lc;var Qx=[" ","Enter","ArrowUp","ArrowDown"],eg=[" ","Enter"],Kt="Select",[nr,sr,tg]=Ct(Kt),[jt,FR]=ue(Kt,[tg,dt]),lr=dt(),[ag,bt]=jt(Kt),[og,rg]=jt(Kt),ng="SelectProvider";function Ic(e){let{__scopeSelect:t,children:a,open:o,defaultOpen:r,onOpenChange:n,value:s,defaultValue:l,onValueChange:i,dir:c,name:d,autoComplete:u,disabled:f,required:m,form:v,internal_do_not_use_render:p}=e,g=lr(t),[w,C]=T(null),[L,I]=T(null),[R,D]=T(!1),y=_e(c),[H,z]=Le({prop:o,defaultProp:r??!1,onChange:n,caller:Kt}),[V,G]=Le({prop:s,defaultProp:l,onChange:i,caller:Kt}),F=b(null),$=w?!!v||!!w.closest("form"):!0,[j,re]=T(new Set),X=we(),J=Array.from(j).map(te=>te.props.value).join(";"),U=_(te=>{re(ve=>new Set(ve).add(te))},[]),E=_(te=>{re(ve=>{let ge=new Set(ve);return ge.delete(te),ge})},[]),Q={required:m,trigger:w,onTriggerChange:C,valueNode:L,onValueNodeChange:I,valueNodeHasChildren:R,onValueNodeHasChildrenChange:D,contentId:X,value:V,onValueChange:G,open:H,onOpenChange:z,dir:y,triggerPointerDownPosRef:F,disabled:f,name:d,autoComplete:u,form:v,nativeOptions:j,nativeSelectKey:J,isFormControl:$};return h(Gt,{...g,children:h(ag,{scope:t,...Q,children:h(nr.Provider,{scope:t,children:h(og,{scope:t,onNativeOptionAdd:U,onNativeOptionRemove:E,children:wg(p)?p(Q):a})})})})}Ic.displayName=ng;var Xn=e=>{let{__scopeSelect:t,children:a,...o}=e;return h(Ic,{__scopeSelect:t,...o,internal_do_not_use_render:({isFormControl:r})=>Ie(Me,{children:[a,r?h(Hc,{__scopeSelect:t}):null]})})};Xn.displayName=Kt;var bc="SelectTrigger",ir=x((e,t)=>{let{__scopeSelect:a,disabled:o=!1,...r}=e,n=lr(a),s=bt(bc,a),l=s.disabled||o,i=K(t,s.onTriggerChange),c=sr(a),d=b("touch"),[u,f,m]=Uc(p=>{let g=c().filter(L=>!L.disabled),w=g.find(L=>L.value===s.value),C=qc(g,p,w);C!==void 0&&s.onValueChange(C.value)}),v=p=>{l||(s.onOpenChange(!0),m()),p&&(s.triggerPointerDownPosRef.current={x:Math.round(p.pageX),y:Math.round(p.pageY)})};return h(ba,{asChild:!0,...n,children:h(N.button,{type:"button",role:"combobox","aria-controls":s.open?s.contentId:void 0,"aria-expanded":s.open,"aria-required":s.required,"aria-autocomplete":"none",dir:s.dir,"data-state":s.open?"open":"closed",disabled:l,"data-disabled":l?"":void 0,"data-placeholder":es(s.value)?"":void 0,...r,ref:i,onClick:A(r.onClick,p=>{p.currentTarget.focus(),d.current!=="mouse"&&v(p)}),onPointerDown:A(r.onPointerDown,p=>{d.current=p.pointerType;let g=p.target;g.hasPointerCapture(p.pointerId)&&g.releasePointerCapture(p.pointerId),p.button===0&&p.ctrlKey===!1&&p.pointerType==="mouse"&&(v(p),p.preventDefault())}),onKeyDown:A(r.onKeyDown,p=>{let g=u.current!=="";!(p.ctrlKey||p.altKey||p.metaKey)&&p.key.length===1&&f(p.key),!(g&&p.key===" ")&&Qx.includes(p.key)&&(v(),p.preventDefault())})})})});ir.displayName=bc;var Rc="SelectValue",Kn=x((e,t)=>{let{__scopeSelect:a,className:o,style:r,children:n,placeholder:s="",...l}=e,i=bt(Rc,a),{onValueNodeHasChildrenChange:c}=i,d=n!==void 0,u=K(t,i.onValueNodeChange);ce(()=>{c(d)},[c,d]);let f=es(i.value);return h(N.span,{...l,asChild:f?!1:l.asChild,ref:u,style:{pointerEvents:"none"},children:h(ze,{children:f?s:n},f?"placeholder":"value")})});Kn.displayName=Rc;var sg="SelectIcon",jn=x((e,t)=>{let{__scopeSelect:a,children:o,...r}=e;return h(N.span,{"aria-hidden":!0,...r,ref:t,children:o||"\u25BC"})});jn.displayName=sg;var yc="SelectPortal",[lg,ig]=jt(yc,{forceMount:void 0}),$n=e=>{let{__scopeSelect:t,forceMount:a,...o}=e;return h(lg,{scope:e.__scopeSelect,forceMount:a,children:h(ut,{asChild:!0,...o})})};$n.displayName=yc;var It="SelectContent",ur=x((e,t)=>{let a=ig(It,e.__scopeSelect),{forceMount:o=a.forceMount,...r}=e,n=bt(It,e.__scopeSelect),[s,l]=T();return ce(()=>{l(new DocumentFragment)},[]),h(he,{present:o||n.open,children:({present:i})=>i?h(Tc,{...r,ref:t}):h(Pc,{...r,fragment:s})})});ur.displayName=It;var Pc=x((e,t)=>{let{__scopeSelect:a,children:o,fragment:r}=e;return r?za(h(Mc,{scope:a,children:h(nr.Slot,{scope:a,children:h("div",{ref:t,children:o})})}),r):null});Pc.displayName="SelectContentFragment";var je=10,[Mc,Rt]=jt(It),ug="SelectContentImpl",cg=Ne("SelectContent.RemoveScroll"),Tc=x((e,t)=>{let{__scopeSelect:a}=e,{position:o="item-aligned",onCloseAutoFocus:r,onEscapeKeyDown:n,onPointerDownOutside:s,side:l,sideOffset:i,align:c,alignOffset:d,arrowPadding:u,collisionBoundary:f,collisionPadding:m,sticky:v,hideWhenDetached:p,avoidCollisions:g,...w}=e,C=bt(It,a),[L,I]=T(null),[R,D]=T(null),y=K(t,W=>I(W)),[H,z]=T(null),[V,G]=T(null),F=sr(a),[$,j]=T(!1),re=b(!1);k(()=>{if(L)return ga(L)},[L]),pa();let X=_(W=>{let[ie,...Se]=F().map(xe=>xe.ref.current),[ae]=Se.slice(-1),ne=document.activeElement;for(let xe of W)if(xe===ne||(xe?.scrollIntoView({block:"nearest"}),xe===ie&&R&&(R.scrollTop=0),xe===ae&&R&&(R.scrollTop=R.scrollHeight),xe?.focus(),document.activeElement!==ne))return},[F,R]),J=_(()=>X([H,L]),[X,H,L]);k(()=>{$&&J()},[$,J]);let{onOpenChange:U,triggerPointerDownPosRef:E}=C;k(()=>{if(L){let W={x:0,y:0},ie=ae=>{W={x:Math.abs(Math.round(ae.pageX)-(E.current?.x??0)),y:Math.abs(Math.round(ae.pageY)-(E.current?.y??0))}},Se=ae=>{W.x<=10&&W.y<=10?ae.preventDefault():ae.composedPath().includes(L)||U(!1),document.removeEventListener("pointermove",ie),E.current=null};return E.current!==null&&(document.addEventListener("pointermove",ie),document.addEventListener("pointerup",Se,{capture:!0,once:!0})),()=>{document.removeEventListener("pointermove",ie),document.removeEventListener("pointerup",Se,{capture:!0})}}},[L,U,E]),k(()=>{let W=()=>U(!1);return window.addEventListener("blur",W),window.addEventListener("resize",W),()=>{window.removeEventListener("blur",W),window.removeEventListener("resize",W)}},[U]);let[Q,te]=Uc(W=>{let ie=F().filter(ne=>!ne.disabled),Se=ie.find(ne=>ne.ref.current===document.activeElement),ae=qc(ie,W,Se);ae&&setTimeout(()=>ae.ref.current.focus())}),ve=_((W,ie,Se)=>{let ae=!re.current&&!Se;(C.value!==void 0&&C.value===ie||ae)&&(z(W),ae&&(re.current=!0))},[C.value]),ge=_(()=>L?.focus(),[L]),ye=_((W,ie,Se)=>{let ae=!re.current&&!Se;(C.value!==void 0&&C.value===ie||ae)&&G(W)},[C.value]),ke=o==="popper"?Vn:Ac,B=ke===Vn?{side:l,sideOffset:i,align:c,alignOffset:d,arrowPadding:u,collisionBoundary:f,collisionPadding:m,sticky:v,hideWhenDetached:p,avoidCollisions:g}:{};return h(Mc,{scope:a,content:L,viewport:R,onViewportChange:D,itemRefCallback:ve,selectedItem:H,onItemLeave:ge,itemTextRefCallback:ye,focusSelectedItem:J,selectedItemText:V,position:o,isPositioned:$,searchRef:Q,children:h(Bt,{as:cg,allowPinchZoom:!0,children:h(Dt,{asChild:!0,trapped:C.open,onMountAutoFocus:W=>{W.preventDefault()},onUnmountAutoFocus:A(r,W=>{C.trigger?.focus({preventScroll:!0}),W.preventDefault()}),children:h(it,{asChild:!0,disableOutsidePointerEvents:!0,onEscapeKeyDown:n,onPointerDownOutside:s,onFocusOutside:W=>W.preventDefault(),onDismiss:()=>C.onOpenChange(!1),children:h(ke,{role:"listbox",id:C.contentId,"data-state":C.open?"open":"closed",dir:C.dir,onContextMenu:W=>W.preventDefault(),...w,...B,onPlaced:()=>j(!0),ref:y,style:{display:"flex",flexDirection:"column",outline:"none",...w.style},onKeyDown:A(w.onKeyDown,W=>{let ie=W.ctrlKey||W.altKey||W.metaKey;if(W.key==="Tab"&&W.preventDefault(),!ie&&W.key.length===1&&te(W.key),["ArrowUp","ArrowDown","Home","End"].includes(W.key)){let ae=F().filter(ne=>!ne.disabled).map(ne=>ne.ref.current);if(["ArrowUp","End"].includes(W.key)&&(ae=ae.slice().reverse()),["ArrowUp","ArrowDown"].includes(W.key)){let ne=W.target,xe=ae.indexOf(ne);ae=ae.slice(xe+1)}setTimeout(()=>X(ae)),W.preventDefault()}})})})})})})});Tc.displayName=ug;var dg="SelectItemAlignedPosition",Ac=x((e,t)=>{let{__scopeSelect:a,onPlaced:o,...r}=e,n=bt(It,a),s=Rt(It,a),[l,i]=T(null),[c,d]=T(null),u=K(t,y=>d(y)),f=sr(a),m=b(!1),v=b(!0),{viewport:p,selectedItem:g,selectedItemText:w,focusSelectedItem:C}=s,L=_(()=>{if(n.trigger&&n.valueNode&&l&&c&&p&&g&&w){let y=n.trigger.getBoundingClientRect(),H=c.getBoundingClientRect(),z=n.valueNode.getBoundingClientRect(),V=w.getBoundingClientRect();if(n.dir!=="rtl"){let ne=V.left-H.left,xe=z.left-ne,Fe=y.left-xe,Pe=y.width+Fe,Fa=Math.max(Pe,H.width),Ba=window.innerWidth-je,Jt=St(xe,[je,Math.max(je,Ba-Fa)]);l.style.minWidth=Pe+"px",l.style.left=Jt+"px"}else{let ne=H.right-V.right,xe=window.innerWidth-z.right-ne,Fe=window.innerWidth-y.right-xe,Pe=y.width+Fe,Fa=Math.max(Pe,H.width),Ba=window.innerWidth-je,Jt=St(xe,[je,Math.max(je,Ba-Fa)]);l.style.minWidth=Pe+"px",l.style.right=Jt+"px"}let G=f(),F=window.innerHeight-je*2,$=p.scrollHeight,j=window.getComputedStyle(c),re=parseInt(j.borderTopWidth,10),X=parseInt(j.paddingTop,10),J=parseInt(j.borderBottomWidth,10),U=parseInt(j.paddingBottom,10),E=re+X+$+U+J,Q=Math.min(g.offsetHeight*5,E),te=window.getComputedStyle(p),ve=parseInt(te.paddingTop,10),ge=parseInt(te.paddingBottom,10),ye=y.top+y.height/2-je,ke=F-ye,B=g.offsetHeight/2,W=g.offsetTop+B,ie=re+X+W,Se=E-ie;if(ie<=ye){let ne=G.length>0&&g===G[G.length-1].ref.current;l.style.bottom="0px";let xe=c.clientHeight-p.offsetTop-p.offsetHeight,Fe=Math.max(ke,B+(ne?ge:0)+xe+J),Pe=ie+Fe;l.style.height=Pe+"px"}else{let ne=G.length>0&&g===G[0].ref.current;l.style.top="0px";let Fe=Math.max(ye,re+p.offsetTop+(ne?ve:0)+B)+Se;l.style.height=Fe+"px",p.scrollTop=ie-ye+p.offsetTop}l.style.margin=`${je}px 0`,l.style.minHeight=Q+"px",l.style.maxHeight=F+"px",o?.(),requestAnimationFrame(()=>m.current=!0)}},[f,n.trigger,n.valueNode,l,c,p,g,w,n.dir,o]);ce(()=>L(),[L]);let[I,R]=T();ce(()=>{c&&R(window.getComputedStyle(c).zIndex)},[c]);let D=_(y=>{y&&v.current===!0&&(L(),C?.(),v.current=!1)},[L,C]);return h(pg,{scope:a,contentWrapper:l,shouldExpandOnScrollRef:m,onScrollButtonChange:D,children:h("div",{ref:i,style:{display:"flex",flexDirection:"column",position:"fixed",zIndex:I},children:h(N.div,{...r,ref:u,style:{boxSizing:"border-box",maxHeight:"100%",...r.style}})})})});Ac.displayName=dg;var fg="SelectPopperPosition",Vn=x((e,t)=>{let{__scopeSelect:a,align:o="start",collisionPadding:r=je,...n}=e,s=lr(a);return h(Ra,{...s,...n,ref:t,align:o,collisionPadding:r,style:{boxSizing:"border-box",...n.style,"--radix-select-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-select-content-available-width":"var(--radix-popper-available-width)","--radix-select-content-available-height":"var(--radix-popper-available-height)","--radix-select-trigger-width":"var(--radix-popper-anchor-width)","--radix-select-trigger-height":"var(--radix-popper-anchor-height)"}})});Vn.displayName=fg;var[pg,Yn]=jt(It,{}),zn="SelectViewport",Zn=x((e,t)=>{let{__scopeSelect:a,nonce:o,...r}=e,n=Rt(zn,a),s=Yn(zn,a),l=K(t,n.onViewportChange),i=b(0);return Ie(Me,{children:[h("style",{dangerouslySetInnerHTML:{__html:"[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}"},nonce:o}),h(nr.Slot,{scope:a,children:h(N.div,{"data-radix-select-viewport":"",role:"presentation",...r,ref:l,style:{position:"relative",flex:1,overflow:"hidden auto",...r.style},onScroll:A(r.onScroll,c=>{let d=c.currentTarget,{contentWrapper:u,shouldExpandOnScrollRef:f}=s;if(f?.current&&u){let m=Math.abs(i.current-d.scrollTop);if(m>0){let v=window.innerHeight-je*2,p=parseFloat(u.style.minHeight),g=parseFloat(u.style.height),w=Math.max(p,g);if(w<v){let C=w+m,L=Math.min(v,C),I=C-L;u.style.height=L+"px",u.style.bottom==="0px"&&(d.scrollTop=I>0?I:0,u.style.justifyContent="flex-end")}}}i.current=d.scrollTop})})})]})});Zn.displayName=zn;var kc="SelectGroup",[mg,hg]=jt(kc),Dc=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=we();return h(mg,{scope:a,id:r,children:h(N.div,{role:"group","aria-labelledby":r,...o,ref:t})})});Dc.displayName=kc;var Ec="SelectLabel",cr=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=hg(Ec,a);return h(N.div,{id:r.id,...o,ref:t})});cr.displayName=Ec;var rr="SelectItem",[xg,Oc]=jt(rr),dr=x((e,t)=>{let{__scopeSelect:a,value:o,disabled:r=!1,textValue:n,...s}=e,l=bt(rr,a),i=Rt(rr,a),c=l.value===o,[d,u]=T(n??""),[f,m]=T(!1),v=K(t,C=>i.itemRefCallback?.(C,o,r)),p=we(),g=b("touch"),w=()=>{r||(l.onValueChange(o),l.onOpenChange(!1))};if(o==="")throw new Error("A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.");return h(xg,{scope:a,value:o,disabled:r,textId:p,isSelected:c,onItemTextChange:_(C=>{u(L=>L||(C?.textContent??"").trim())},[]),children:h(nr.ItemSlot,{scope:a,value:o,disabled:r,textValue:d,children:h(N.div,{role:"option","aria-labelledby":p,"data-highlighted":f?"":void 0,"aria-selected":c&&f,"data-state":c?"checked":"unchecked","aria-disabled":r||void 0,"data-disabled":r?"":void 0,tabIndex:r?void 0:-1,...s,ref:v,onFocus:A(s.onFocus,()=>m(!0)),onBlur:A(s.onBlur,()=>m(!1)),onClick:A(s.onClick,()=>{g.current!=="mouse"&&w()}),onPointerUp:A(s.onPointerUp,()=>{g.current==="mouse"&&w()}),onPointerDown:A(s.onPointerDown,C=>{g.current=C.pointerType}),onPointerMove:A(s.onPointerMove,C=>{g.current=C.pointerType,r?i.onItemLeave?.():g.current==="mouse"&&C.currentTarget.focus({preventScroll:!0})}),onPointerLeave:A(s.onPointerLeave,C=>{C.currentTarget===document.activeElement&&i.onItemLeave?.()}),onKeyDown:A(s.onKeyDown,C=>{i.searchRef?.current!==""&&C.key===" "||(eg.includes(C.key)&&w(),C.key===" "&&C.preventDefault())})})})})});dr.displayName=rr;var so="SelectItemText",Jn=x((e,t)=>{let{__scopeSelect:a,className:o,style:r,...n}=e,s=bt(so,a),l=Rt(so,a),i=Oc(so,a),c=rg(so,a),[d,u]=T(null),f=K(t,w=>u(w),i.onItemTextChange,w=>l.itemTextRefCallback?.(w,i.value,i.disabled)),m=d?.textContent,v=me(()=>h("option",{value:i.value,disabled:i.disabled,children:m},i.value),[i.disabled,i.value,m]),{onNativeOptionAdd:p,onNativeOptionRemove:g}=c;return ce(()=>(p(v),()=>g(v)),[p,g,v]),Ie(Me,{children:[h(N.span,{id:i.textId,...n,ref:f}),i.isSelected&&s.valueNode&&!s.valueNodeHasChildren?za(n.children,s.valueNode):null]})});Jn.displayName=so;var Fc="SelectItemIndicator",Qn=x((e,t)=>{let{__scopeSelect:a,...o}=e;return Oc(Fc,a).isSelected?h(N.span,{"aria-hidden":!0,...o,ref:t}):null});Qn.displayName=Fc;var Wn="SelectScrollUpButton",fr=x((e,t)=>{let a=Rt(Wn,e.__scopeSelect),o=Yn(Wn,e.__scopeSelect),[r,n]=T(!1),s=K(t,o.onScrollButtonChange);return ce(()=>{if(a.viewport&&a.isPositioned){let i=function(){let d=c.scrollTop>0;n(d)};var l=i;let c=a.viewport;return i(),c.addEventListener("scroll",i),()=>c.removeEventListener("scroll",i)}},[a.viewport,a.isPositioned]),r?h(Bc,{...e,ref:s,onAutoScroll:()=>{let{viewport:l,selectedItem:i}=a;l&&i&&(l.scrollTop=l.scrollTop-i.offsetHeight)}}):null});fr.displayName=Wn;var Gn="SelectScrollDownButton",pr=x((e,t)=>{let a=Rt(Gn,e.__scopeSelect),o=Yn(Gn,e.__scopeSelect),[r,n]=T(!1),s=K(t,o.onScrollButtonChange);return ce(()=>{if(a.viewport&&a.isPositioned){let i=function(){let d=c.scrollHeight-c.clientHeight,u=Math.ceil(c.scrollTop)<d;n(u)};var l=i;let c=a.viewport;return i(),c.addEventListener("scroll",i),()=>c.removeEventListener("scroll",i)}},[a.viewport,a.isPositioned]),r?h(Bc,{...e,ref:s,onAutoScroll:()=>{let{viewport:l,selectedItem:i}=a;l&&i&&(l.scrollTop=l.scrollTop+i.offsetHeight)}}):null});pr.displayName=Gn;var Bc=x((e,t)=>{let{__scopeSelect:a,onAutoScroll:o,...r}=e,n=Rt("SelectScrollButton",a),s=b(null),l=sr(a),i=_(()=>{s.current!==null&&(window.clearInterval(s.current),s.current=null)},[]);return k(()=>()=>i(),[i]),ce(()=>{l().find(d=>d.ref.current===document.activeElement)?.ref.current?.scrollIntoView({block:"nearest"})},[l]),h(N.div,{"aria-hidden":!0,...r,ref:t,style:{flexShrink:0,...r.style},onPointerDown:A(r.onPointerDown,()=>{s.current===null&&(s.current=window.setInterval(o,50))}),onPointerMove:A(r.onPointerMove,()=>{n.onItemLeave?.(),s.current===null&&(s.current=window.setInterval(o,50))}),onPointerLeave:A(r.onPointerLeave,()=>{i()})})}),gg="SelectSeparator",mr=x((e,t)=>{let{__scopeSelect:a,...o}=e;return h(N.div,{"aria-hidden":!0,...o,ref:t})});mr.displayName=gg;var Nc="SelectArrow",vg=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=lr(a);return Rt(Nc,a).position==="popper"?h(ya,{...r,...o,ref:t}):null});vg.displayName=Nc;var _c="SelectBubbleInput",Hc=x(({__scopeSelect:e,...t},a)=>{let o=bt(_c,e),{value:r,onValueChange:n,required:s,disabled:l,name:i,autoComplete:c,form:d}=o,{nativeOptions:u,nativeSelectKey:f}=o,m=b(null),v=K(a,m),p=r??"",g=ht(p);return k(()=>{let w=m.current;if(!w)return;let C=window.HTMLSelectElement.prototype,I=Object.getOwnPropertyDescriptor(C,"value").set;if(g!==p&&I){let R=new Event("change",{bubbles:!0});I.call(w,p),w.dispatchEvent(R)}},[g,p]),Ie(N.select,{"aria-hidden":!0,required:s,tabIndex:-1,name:i,autoComplete:c,disabled:l,form:d,onChange:w=>n(w.target.value),...t,style:{...qn,...t.style},ref:v,defaultValue:p,children:[es(r)?h("option",{value:""}):null,Array.from(u)]},f)});Hc.displayName=_c;function wg(e){return typeof e=="function"}function es(e){return e===""||e===void 0}function Uc(e){let t=de(e),a=b(""),o=b(0),r=_(s=>{let l=a.current+s;t(l),(function i(c){a.current=c,window.clearTimeout(o.current),c!==""&&(o.current=window.setTimeout(()=>i(""),1e3))})(l)},[t]),n=_(()=>{a.current="",window.clearTimeout(o.current)},[]);return k(()=>()=>window.clearTimeout(o.current),[]),[a,r,n]}function qc(e,t,a){let r=t.length>1&&Array.from(t).every(c=>c===t[0])?t[0]:t,n=a?e.indexOf(a):-1,s=Cg(e,Math.max(n,0));r.length===1&&(s=s.filter(c=>c!==a));let i=s.find(c=>c.textValue.toLowerCase().startsWith(r.toLowerCase()));return i!==a?i:void 0}function Cg(e,t){return e.map((a,o)=>e[(t+o)%e.length])}var Vc=Xn;var zc=Kn,ts=x(({className:e,children:t,...a},o)=>S(ir,{ref:o,className:O("xps-select-trigger",e),...a},t,S(jn,{asChild:!0},S(Mt,{className:"xps-icon"}))));ts.displayName=ir.displayName;var Wc=x(({className:e,...t},a)=>S(fr,{ref:a,className:O("xps-select-scroll-button",e),...t},S(na,{className:"xps-icon"})));Wc.displayName=fr.displayName;var Gc=x(({className:e,...t},a)=>S(pr,{ref:a,className:O("xps-select-scroll-button",e),...t},S(Mt,{className:"xps-icon"})));Gc.displayName=pr.displayName;var as=x(({className:e,children:t,position:a="popper",...o},r)=>S($n,null,S(ur,{ref:r,className:O("xps-select-content",a==="popper"&&"xps-select-content-popper",e),position:a,...o},S(Wc,null),S(Zn,{className:O("xps-select-viewport",a==="popper"&&"xps-select-viewport-popper")},t),S(Gc,null))));as.displayName=ur.displayName;var Sg=x(({className:e,...t},a)=>S(cr,{ref:a,className:O("xps-select-label",e),...t}));Sg.displayName=cr.displayName;var Ta=x(({className:e,children:t,...a},o)=>S(dr,{ref:o,className:O("xps-select-item",e),...a},S("span",{className:"xps-select-item-indicator"},S(Qn,null,S(Be,{className:"xps-icon"}))),S(Jn,null,t)));Ta.displayName=dr.displayName;var Ig=x(({className:e,...t},a)=>S(mr,{ref:a,className:O("xps-select-separator",e),...t}));Ig.displayName=mr.displayName;var bg=x(({className:e,orientation:t="horizontal",...a},o)=>S("div",{ref:o,className:O("xps-separator",t==="vertical"?"xps-separator--vertical":"xps-separator--horizontal",e),role:"separator","aria-orientation":t,...a}));bg.displayName="Separator";var Rg=Do;var Xc=x(({className:e,...t},a)=>S(va,{ref:a,className:O("xps-dialog-overlay",e),...t}));Xc.displayName=va.displayName;var yg=x(({className:e,children:t,side:a="right",showClose:o=!0,...r},n)=>S(Rg,null,S(Xc,null),S(wa,{ref:n,className:O("xps-sheet-content",`xps-sheet-content--${a}`,e),...r},t,o?S(Eo,{className:"xps-dialog-close"},S(kt,{className:"xps-icon","aria-hidden":"true"}),S("span",{className:"xps-sr-only"},"Close")):null)));yg.displayName=wa.displayName;var Pg=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-dialog-header",e),...t}));Pg.displayName="SheetHeader";var Mg=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-dialog-footer",e),...t}));Mg.displayName="SheetFooter";var Tg=x(({className:e,...t},a)=>S(Ca,{ref:a,className:O("xps-dialog-title",e),...t}));Tg.displayName=Ca.displayName;var Ag=x(({className:e,...t},a)=>S(La,{ref:a,className:O("xps-dialog-description",e),...t}));Ag.displayName=La.displayName;var hr=x(({className:e,side:t="left",collapsed:a=!1,...o},r)=>S("aside",{ref:r,className:O("xps-sidebar",`xps-sidebar--${t}`,a&&"xps-sidebar--collapsed",e),"data-side":t,"data-state":a?"collapsed":"expanded","aria-expanded":!a,...o}));hr.displayName="Sidebar";var xr=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-header",e),...t}));xr.displayName="SidebarHeader";var gr=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-content",e),...t}));gr.displayName="SidebarContent";var kg=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-footer",e),...t}));kg.displayName="SidebarFooter";var vr=x(({className:e,...t},a)=>S("span",{ref:a,className:O("xps-sidebar-title",e),...t}));vr.displayName="SidebarTitle";var wr=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-rail",e),...t}));wr.displayName="SidebarRail";var Cr=x(({className:e,variant:t="ghost",size:a="icon",...o},r)=>S(Re,{ref:r,className:O("xps-sidebar-trigger",e),variant:t,size:a,...o}));Cr.displayName="SidebarTrigger";var Dg=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-group",e),...t}));Dg.displayName="SidebarGroup";var Eg=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-group-label",e),...t}));Eg.displayName="SidebarGroupLabel";var os=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-menu",e),...t}));os.displayName="SidebarMenu";var rs=x(({className:e,...t},a)=>S("div",{ref:a,className:O("xps-sidebar-menu-item",e),...t}));rs.displayName="SidebarMenuItem";var ns=x(({className:e,active:t=!1,variant:a="ghost",...o},r)=>S(Re,{ref:r,variant:a,className:O("xps-sidebar-menu-button",t&&"xps-sidebar-menu-button--active",e),...o}));ns.displayName="SidebarMenuButton";var Kc=["PageUp","PageDown"],jc=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],$c={"from-left":["Home","PageDown","ArrowDown","ArrowLeft"],"from-right":["Home","PageDown","ArrowDown","ArrowRight"],"from-bottom":["Home","PageDown","ArrowDown","ArrowLeft"],"from-top":["Home","PageDown","ArrowUp","ArrowLeft"]},Aa="Slider",[ss,Og,Fg]=Ct(Aa),[is,ry]=ue(Aa,[Fg]),[Bg,lo]=is(Aa),Sr=x((e,t)=>{let{name:a,min:o=0,max:r=100,step:n=1,orientation:s="horizontal",disabled:l=!1,minStepsBetweenThumbs:i=0,defaultValue:c=[o],value:d,onValueChange:u=()=>{},onValueCommit:f=()=>{},inverted:m=!1,form:v,...p}=e,g=b(new Set),w=b(0),C=b(!1),I=s==="horizontal"?Ng:_g,[R=[],D]=Le({prop:d,defaultProp:c,onChange:F=>{[...g.current][w.current]?.focus({preventScroll:!0,focusVisible:C.current}),C.current=!1,u(F)}}),y=b(R);function H(F){let $=Vg(R,F);G(F,$)}function z(F){G(F,w.current)}function V(){let F=y.current[w.current];R[w.current]!==F&&f(R)}function G(F,$,{commit:j}={commit:!1}){let re=Xg(n),X=Kg(Math.round((F-o)/n)*n+o,re),J=St(X,[o,r]);D((U=[])=>{let E=Ug(U,J,$);if(Gg(E,i*n)){w.current=E.indexOf(J);let Q=String(E)!==String(U);return Q&&j&&f(E),Q?E:U}else return U})}return h(Bg,{scope:e.__scopeSlider,name:a,disabled:l,min:o,max:r,valueIndexToChangeRef:w,thumbs:g.current,values:R,orientation:s,form:v,children:h(ss.Provider,{scope:e.__scopeSlider,children:h(ss.Slot,{scope:e.__scopeSlider,children:h(I,{"aria-disabled":l,"data-disabled":l?"":void 0,...p,ref:t,onPointerDown:A(p.onPointerDown,()=>{l||(y.current=R,C.current=!1)}),min:o,max:r,inverted:m,onSlideStart:l?void 0:H,onSlideMove:l?void 0:z,onSlideEnd:l?void 0:V,onHomeKeyDown:()=>{l||(C.current=!0,G(o,0,{commit:!0}))},onEndKeyDown:()=>{l||(C.current=!0,G(r,R.length-1,{commit:!0}))},onStepKeyDown:({event:F,direction:$})=>{if(!l){C.current=!0;let X=Kc.includes(F.key)||F.shiftKey&&jc.includes(F.key)?10:1,J=w.current,U=R[J],E=n*X*$;G(U+E,J,{commit:!0})}}})})})})});Sr.displayName=Aa;var[Yc,Zc]=is(Aa,{startEdge:"left",endEdge:"right",size:"width",direction:1}),Ng=x((e,t)=>{let{min:a,max:o,dir:r,inverted:n,onSlideStart:s,onSlideMove:l,onSlideEnd:i,onStepKeyDown:c,...d}=e,[u,f]=T(null),m=K(t,L=>f(L)),v=b(void 0),p=_e(r),g=p==="ltr",w=g&&!n||!g&&n;function C(L){let I=v.current||u.getBoundingClientRect(),R=[0,I.width],y=fs(R,w?[a,o]:[o,a]);return v.current=I,y(L-I.left)}return h(Yc,{scope:e.__scopeSlider,startEdge:w?"left":"right",endEdge:w?"right":"left",direction:w?1:-1,size:"width",children:h(Jc,{dir:p,"data-orientation":"horizontal",...d,ref:m,style:{...d.style,"--radix-slider-thumb-transform":"translateX(-50%)"},onSlideStart:L=>{let I=C(L.clientX);s?.(I)},onSlideMove:L=>{let I=C(L.clientX);l?.(I)},onSlideEnd:()=>{v.current=void 0,i?.()},onStepKeyDown:L=>{let R=$c[w?"from-left":"from-right"].includes(L.key);c?.({event:L,direction:R?-1:1})}})})}),_g=x((e,t)=>{let{min:a,max:o,inverted:r,onSlideStart:n,onSlideMove:s,onSlideEnd:l,onStepKeyDown:i,...c}=e,d=b(null),u=K(t,d),f=b(void 0),m=!r;function v(p){let g=f.current||d.current.getBoundingClientRect(),w=[0,g.height],L=fs(w,m?[o,a]:[a,o]);return f.current=g,L(p-g.top)}return h(Yc,{scope:e.__scopeSlider,startEdge:m?"bottom":"top",endEdge:m?"top":"bottom",size:"height",direction:m?1:-1,children:h(Jc,{"data-orientation":"vertical",...c,ref:u,style:{...c.style,"--radix-slider-thumb-transform":"translateY(50%)"},onSlideStart:p=>{let g=v(p.clientY);n?.(g)},onSlideMove:p=>{let g=v(p.clientY);s?.(g)},onSlideEnd:()=>{f.current=void 0,l?.()},onStepKeyDown:p=>{let w=$c[m?"from-bottom":"from-top"].includes(p.key);i?.({event:p,direction:w?-1:1})}})})}),Jc=x((e,t)=>{let{__scopeSlider:a,onSlideStart:o,onSlideMove:r,onSlideEnd:n,onHomeKeyDown:s,onEndKeyDown:l,onStepKeyDown:i,...c}=e,d=lo(Aa,a);return h(N.span,{...c,ref:t,onKeyDown:A(e.onKeyDown,u=>{u.key==="Home"?(s(u),u.preventDefault()):u.key==="End"?(l(u),u.preventDefault()):Kc.concat(jc).includes(u.key)&&(i(u),u.preventDefault())}),onPointerDown:A(e.onPointerDown,u=>{let f=u.target;f.setPointerCapture(u.pointerId),u.preventDefault(),d.thumbs.has(f)?f.focus({preventScroll:!0,focusVisible:!1}):o(u)}),onPointerMove:A(e.onPointerMove,u=>{u.target.hasPointerCapture(u.pointerId)&&r(u)}),onPointerUp:A(e.onPointerUp,u=>{let f=u.target;f.hasPointerCapture(u.pointerId)&&(f.releasePointerCapture(u.pointerId),n(u))})})}),Qc="SliderTrack",us=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=lo(Qc,a);return h(N.span,{"data-disabled":r.disabled?"":void 0,"data-orientation":r.orientation,...o,ref:t})});us.displayName=Qc;var ls="SliderRange",cs=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=lo(ls,a),n=Zc(ls,a),s=b(null),l=K(t,s),i=r.values.length,c=r.values.map(f=>ld(f,r.min,r.max)),d=i>1?Math.min(...c):0,u=100-Math.max(...c);return h(N.span,{"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,...o,ref:l,style:{...e.style,[n.startEdge]:d+"%",[n.endEdge]:u+"%"}})});cs.displayName=ls;var ed="SliderThumb",[Hg,td]=is(ed),ad="SliderThumbProvider";function od(e){let{__scopeSlider:t,name:a,children:o,internal_do_not_use_render:r}=e,n=lo(ad,t),s=Og(t),[l,i]=T(null),c=me(()=>l?s().findIndex(g=>g.ref.current===l):-1,[s,l]),d=xt(l),u=l?!!n.form||!!l.closest("form"):!0,f=n.values[c],m=a??(n.name?n.name+(n.values.length>1?"[]":""):void 0),v=f===void 0?0:ld(f,n.min,n.max);k(()=>{if(l)return n.thumbs.add(l),()=>{n.thumbs.delete(l)}},[l,n.thumbs]);let p={value:f,name:m,form:n.form,isFormControl:u,index:c,thumb:l,onThumbChange:i,percent:v,size:d};return h(Hg,{scope:t,...p,children:jg(r)?r(p):o})}od.displayName=ad;var Lr="SliderThumbTrigger",rd=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=lo(Lr,a),n=Zc(Lr,a),{index:s,value:l,percent:i,size:c,onThumbChange:d}=td(Lr,a),u=K(t,p=>d(p)),f=qg(s,r.values.length),m=c?.[n.size],v=m?zg(m,i,n.direction):0;return h("span",{style:{transform:"var(--radix-slider-thumb-transform)",position:"absolute",[n.startEdge]:`calc(${i}% + ${v}px)`},children:h(ss.ItemSlot,{scope:a,children:h(N.span,{role:"slider","aria-label":e["aria-label"]||f,"aria-valuemin":r.min,"aria-valuenow":l,"aria-valuemax":r.max,"aria-orientation":r.orientation,"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,tabIndex:r.disabled?void 0:0,...o,ref:u,style:l===void 0?{display:"none"}:e.style,onFocus:A(e.onFocus,()=>{r.valueIndexToChangeRef.current=s})})})})});rd.displayName=Lr;var ds=x((e,t)=>{let{__scopeSlider:a,name:o,...r}=e;return h(od,{__scopeSlider:a,name:o,internal_do_not_use_render:({index:n,isFormControl:s})=>Ie(Me,{children:[h(rd,{...r,ref:t,__scopeSlider:a}),s?h(sd,{__scopeSlider:a},n):null]})})});ds.displayName=ed;var nd="SliderBubbleInput",sd=x(({__scopeSlider:e,...t},a)=>{let{value:o,name:r,form:n}=td(nd,e),s=b(null),l=K(s,a),i=ht(o);return k(()=>{let c=s.current;if(!c)return;let d=window.HTMLInputElement.prototype,f=Object.getOwnPropertyDescriptor(d,"value").set;if(i!==o&&f){let m=new Event("input",{bubbles:!0});f.call(c,o),c.dispatchEvent(m)}},[i,o]),h(N.input,{style:{display:"none"},name:r,form:n,...t,ref:l,defaultValue:o})});sd.displayName=nd;function Ug(e=[],t,a){let o=[...e];return o[a]=t,o.sort((r,n)=>r-n)}function ld(e,t,a){let n=100/(a-t)*(e-t);return St(n,[0,100])}function qg(e,t){return t>2?`Value ${e+1} of ${t}`:t===2?["Minimum","Maximum"][e]:void 0}function Vg(e,t){if(e.length===1)return 0;let a=e.map(r=>Math.abs(r-t)),o=Math.min(...a);return a.indexOf(o)}function zg(e,t,a){let o=e/2,n=fs([0,50],[0,o]);return(o-n(t)*a)*a}function Wg(e){return e.slice(0,-1).map((t,a)=>e[a+1]-t)}function Gg(e,t){if(t>0){let a=Wg(e);return Math.min(...a)>=t}return!0}function fs(e,t){return a=>{if(e[0]===e[1]||t[0]===t[1])return t[0];let o=(t[1]-t[0])/(e[1]-e[0]);return t[0]+o*(a-e[0])}}function Xg(e){if(!Number.isFinite(e))return 0;let t=e.toString();if(t.includes("e")){let[o,r]=t.split("e"),n=o.split(".")[1]||"",s=Number(r);return Math.max(0,n.length-s)}let a=t.split(".")[1];return a?a.length:0}function Kg(e,t){let a=Math.pow(10,t);return Math.round(e*a)/a}function jg(e){return typeof e=="function"}var Yg=x(({className:e,...t},a)=>S(Sr,{ref:a,className:O("xps-slider",e),...t},S(us,{className:"xps-slider-track"},S(cs,{className:"xps-slider-range"})),S(ds,{className:"xps-slider-thumb"})));Yg.displayName=Sr.displayName;var Ir="Switch",[Zg,hy]=ue(Ir),[Jg,ps]=Zg(Ir);function Qg(e){let{__scopeSwitch:t,checked:a,children:o,defaultChecked:r,disabled:n,form:s,name:l,onCheckedChange:i,required:c,value:d="on",internal_do_not_use_render:u}=e,[f,m]=Le({prop:a,defaultProp:r??!1,onChange:i,caller:Ir}),[v,p]=T(null),[g,w]=T(null),C=b(!1),L=v?!!s||!!v.closest("form"):!0,I={checked:f,setChecked:m,disabled:n,control:v,setControl:p,name:l,form:s,value:d,hasConsumerStoppedPropagationRef:C,required:c,defaultChecked:r,isFormControl:L,bubbleInput:g,setBubbleInput:w};return h(Jg,{scope:t,...I,children:ev(u)?u(I):o})}var id="SwitchTrigger",ud=x(({__scopeSwitch:e,onClick:t,...a},o)=>{let{value:r,disabled:n,checked:s,required:l,setControl:i,setChecked:c,hasConsumerStoppedPropagationRef:d,isFormControl:u,bubbleInput:f}=ps(id,e),m=K(o,i);return h(N.button,{type:"button",role:"switch","aria-checked":s,"aria-required":l,"data-state":pd(s),"data-disabled":n?"":void 0,disabled:n,value:r,...a,ref:m,onClick:A(t,v=>{c(p=>!p),f&&u&&(d.current=v.isPropagationStopped(),d.current||v.stopPropagation())})})});ud.displayName=id;var br=x((e,t)=>{let{__scopeSwitch:a,name:o,checked:r,defaultChecked:n,required:s,disabled:l,value:i,onCheckedChange:c,form:d,...u}=e;return h(Qg,{__scopeSwitch:a,checked:r,defaultChecked:n,disabled:l,required:s,onCheckedChange:c,name:o,form:d,value:i,internal_do_not_use_render:({isFormControl:f})=>Ie(Me,{children:[h(ud,{...u,ref:t,__scopeSwitch:a}),f&&h(fd,{__scopeSwitch:a})]})})});br.displayName=Ir;var cd="SwitchThumb",ms=x((e,t)=>{let{__scopeSwitch:a,...o}=e,r=ps(cd,a);return h(N.span,{"data-state":pd(r.checked),"data-disabled":r.disabled?"":void 0,...o,ref:t})});ms.displayName=cd;var dd="SwitchBubbleInput",fd=x(({__scopeSwitch:e,...t},a)=>{let{control:o,hasConsumerStoppedPropagationRef:r,checked:n,defaultChecked:s,required:l,disabled:i,name:c,value:d,form:u,bubbleInput:f,setBubbleInput:m}=ps(dd,e),v=K(a,m),p=ht(n),g=xt(o);k(()=>{let C=f;if(!C)return;let L=window.HTMLInputElement.prototype,R=Object.getOwnPropertyDescriptor(L,"checked").set,D=!r.current;if(p!==n&&R){let y=new Event("click",{bubbles:D});R.call(C,n),C.dispatchEvent(y)}},[f,p,n,r]);let w=b(n);return h(N.input,{type:"checkbox","aria-hidden":!0,defaultChecked:s??w.current,required:l,disabled:i,name:c,value:d,form:u,...t,tabIndex:-1,ref:v,style:{...t.style,...g,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});fd.displayName=dd;function ev(e){return typeof e=="function"}function pd(e){return e?"checked":"unchecked"}var av=x(({className:e,...t},a)=>S(br,{ref:a,className:O("xps-switch",e),...t},S(ms,{className:"xps-switch-thumb"})));av.displayName=br.displayName;var ov=x(({className:e,...t},a)=>S("table",{ref:a,className:O("xps-table",e),...t}));ov.displayName="Table";var rv=x(({className:e,...t},a)=>S("thead",{ref:a,className:O("xps-table-header",e),...t}));rv.displayName="TableHeader";var nv=x(({className:e,...t},a)=>S("tbody",{ref:a,className:O("xps-table-body",e),...t}));nv.displayName="TableBody";var sv=x(({className:e,...t},a)=>S("tfoot",{ref:a,className:O("xps-table-footer",e),...t}));sv.displayName="TableFooter";var lv=x(({className:e,...t},a)=>S("tr",{ref:a,className:O("xps-table-row",e),...t}));lv.displayName="TableRow";var iv=x(({className:e,...t},a)=>S("th",{ref:a,className:O("xps-table-head",e),...t}));iv.displayName="TableHead";var uv=x(({className:e,...t},a)=>S("td",{ref:a,className:O("xps-table-cell",e),...t}));uv.displayName="TableCell";var cv=x(({className:e,...t},a)=>S("caption",{ref:a,className:O("xps-table-caption",e),...t}));cv.displayName="TableCaption";var Rr="Tabs",[dv,Ty]=ue(Rr,[Pa]),md=Pa(),[fv,hs]=dv(Rr),pv=x((e,t)=>{let{__scopeTabs:a,value:o,onValueChange:r,defaultValue:n,orientation:s="horizontal",dir:l,activationMode:i="automatic",...c}=e,d=_e(l),[u,f]=Le({prop:o,onChange:r,defaultProp:n??"",caller:Rr});return h(fv,{scope:a,baseId:we(),value:u,onValueChange:f,orientation:s,dir:d,activationMode:i,children:h(N.div,{dir:d,"data-orientation":s,...c,ref:t})})});pv.displayName=Rr;var hd="TabsList",xd=x((e,t)=>{let{__scopeTabs:a,loop:o=!0,...r}=e,n=hs(hd,a),s=md(a);return h(Xo,{asChild:!0,...s,orientation:n.orientation,dir:n.dir,loop:o,children:h(N.div,{role:"tablist","aria-orientation":n.orientation,...r,ref:t})})});xd.displayName=hd;var gd="TabsTrigger",vd=x((e,t)=>{let{__scopeTabs:a,value:o,disabled:r=!1,...n}=e,s=hs(gd,a),l=md(a),i=Ld(s.baseId,o),c=Sd(s.baseId,o),d=o===s.value;return h(Ko,{asChild:!0,...l,focusable:!r,active:d,children:h(N.button,{type:"button",role:"tab","aria-selected":d,"aria-controls":c,"data-state":d?"active":"inactive","data-disabled":r?"":void 0,disabled:r,id:i,...n,ref:t,onMouseDown:A(e.onMouseDown,u=>{!r&&u.button===0&&u.ctrlKey===!1?s.onValueChange(o):u.preventDefault()}),onKeyDown:A(e.onKeyDown,u=>{[" ","Enter"].includes(u.key)&&s.onValueChange(o)}),onFocus:A(e.onFocus,()=>{let u=s.activationMode!=="manual";!d&&!r&&u&&s.onValueChange(o)})})})});vd.displayName=gd;var wd="TabsContent",Cd=x((e,t)=>{let{__scopeTabs:a,value:o,forceMount:r,children:n,...s}=e,l=hs(wd,a),i=Ld(l.baseId,o),c=Sd(l.baseId,o),d=o===l.value,u=b(d);return k(()=>{let f=requestAnimationFrame(()=>u.current=!1);return()=>cancelAnimationFrame(f)},[]),h(he,{present:r||d,children:({present:f})=>h(N.div,{"data-state":d?"active":"inactive","data-orientation":l.orientation,role:"tabpanel","aria-labelledby":i,hidden:!f,id:c,tabIndex:0,...s,ref:t,style:{...e.style,animationDuration:u.current?"0s":void 0},children:f&&n})})});Cd.displayName=wd;function Ld(e,t){return`${e}-trigger-${t}`}function Sd(e,t){return`${e}-content-${t}`}var xs=xd,gs=vd,vs=Cd;var hv=x(({className:e,...t},a)=>S(xs,{ref:a,className:O("xps-tabs-list",e),...t}));hv.displayName=xs.displayName;var xv=x(({className:e,...t},a)=>S(gs,{ref:a,className:O("xps-tabs-trigger",e),...t}));xv.displayName=gs.displayName;var gv=x(({className:e,...t},a)=>S(vs,{ref:a,className:O("xps-tabs-content",e),...t}));gv.displayName=vs.displayName;var io=x(({className:e,...t},a)=>S("textarea",{ref:a,className:O("xps-textarea",e),...t}));io.displayName="Textarea";var[yr,Ky]=ue("Tooltip",[dt]),Pr=dt(),Id="TooltipProvider",vv=700,ws="tooltip.open",[wv,Ls]=yr(Id),Cv=e=>{let{__scopeTooltip:t,delayDuration:a=vv,skipDelayDuration:o=300,disableHoverableContent:r=!1,children:n}=e,s=b(!0),l=b(!1),i=b(0);return k(()=>{let c=i.current;return()=>window.clearTimeout(c)},[]),h(wv,{scope:t,isOpenDelayedRef:s,delayDuration:a,onOpen:_(()=>{o<=0||(window.clearTimeout(i.current),s.current=!1)},[o]),onClose:_(()=>{o<=0||(window.clearTimeout(i.current),i.current=window.setTimeout(()=>s.current=!0,o))},[o]),isPointerInTransitRef:l,onPointerInTransitChange:_(c=>{l.current=c},[]),disableHoverableContent:r,children:n})};Cv.displayName=Id;var uo="Tooltip",[Lv,co]=yr(uo),Sv=e=>{let{__scopeTooltip:t,children:a,open:o,defaultOpen:r,onOpenChange:n,disableHoverableContent:s,delayDuration:l}=e,i=Ls(uo,e.__scopeTooltip),c=Pr(t),[d,u]=T(null),f=we(),m=b(0),v=s??i.disableHoverableContent,p=l??i.delayDuration,g=b(!1),[w,C]=Le({prop:o,defaultProp:r??!1,onChange:y=>{y?(i.onOpen(),document.dispatchEvent(new CustomEvent(ws))):i.onClose(),n?.(y)},caller:uo}),L=me(()=>w?g.current?"delayed-open":"instant-open":"closed",[w]),I=_(()=>{window.clearTimeout(m.current),m.current=0,g.current=!1,C(!0)},[C]),R=_(()=>{window.clearTimeout(m.current),m.current=0,C(!1)},[C]),D=_(()=>{window.clearTimeout(m.current),m.current=window.setTimeout(()=>{g.current=!0,C(!0),m.current=0},p)},[p,C]);return k(()=>()=>{m.current&&(window.clearTimeout(m.current),m.current=0)},[]),h(Gt,{...c,children:h(Lv,{scope:t,contentId:f,open:w,stateAttribute:L,trigger:d,onTriggerChange:u,onTriggerEnter:_(()=>{i.isOpenDelayedRef.current?D():I()},[i.isOpenDelayedRef,D,I]),onTriggerLeave:_(()=>{v?R():(window.clearTimeout(m.current),m.current=0)},[R,v]),onOpen:I,onClose:R,disableHoverableContent:v,children:a})})};Sv.displayName=uo;var Cs="TooltipTrigger",Iv=x((e,t)=>{let{__scopeTooltip:a,...o}=e,r=co(Cs,a),n=Ls(Cs,a),s=Pr(a),l=b(null),i=K(t,l,r.onTriggerChange),c=b(!1),d=b(!1),u=_(()=>c.current=!1,[]);return k(()=>()=>document.removeEventListener("pointerup",u),[u]),h(ba,{asChild:!0,...s,children:h(N.button,{"aria-describedby":r.open?r.contentId:void 0,"data-state":r.stateAttribute,...o,ref:i,onPointerMove:A(e.onPointerMove,f=>{f.pointerType!=="touch"&&!d.current&&!n.isPointerInTransitRef.current&&(r.onTriggerEnter(),d.current=!0)}),onPointerLeave:A(e.onPointerLeave,()=>{r.onTriggerLeave(),d.current=!1}),onPointerDown:A(e.onPointerDown,()=>{r.open&&r.onClose(),c.current=!0,document.addEventListener("pointerup",u,{once:!0})}),onFocus:A(e.onFocus,()=>{c.current||r.onOpen()}),onBlur:A(e.onBlur,r.onClose),onClick:A(e.onClick,r.onClose)})})});Iv.displayName=Cs;var Ss="TooltipPortal",[bv,Rv]=yr(Ss,{forceMount:void 0}),bd=e=>{let{__scopeTooltip:t,forceMount:a,children:o,container:r}=e,n=co(Ss,t);return h(bv,{scope:t,forceMount:a,children:h(he,{present:a||n.open,children:h(ut,{asChild:!0,container:r,children:o})})})};bd.displayName=Ss;var ka="TooltipContent",Rd=x((e,t)=>{let a=Rv(ka,e.__scopeTooltip),{forceMount:o=a.forceMount,side:r="top",...n}=e,s=co(ka,e.__scopeTooltip);return h(he,{present:o||s.open,children:s.disableHoverableContent?h(yd,{side:r,...n,ref:t}):h(yv,{side:r,...n,ref:t})})}),yv=x((e,t)=>{let a=co(ka,e.__scopeTooltip),o=Ls(ka,e.__scopeTooltip),r=b(null),n=K(t,r),[s,l]=T(null),{trigger:i,onClose:c}=a,d=r.current,{onPointerInTransitChange:u}=o,f=_(()=>{l(null),u(!1)},[u]),m=_((v,p)=>{let g=v.currentTarget,w={x:v.clientX,y:v.clientY},C=kv(w,g.getBoundingClientRect()),L=Dv(w,C),I=Ev(p.getBoundingClientRect()),R=Fv([...L,...I]);l(R),u(!0)},[u]);return k(()=>()=>f(),[f]),k(()=>{if(i&&d){let v=g=>m(g,d),p=g=>m(g,i);return i.addEventListener("pointerleave",v),d.addEventListener("pointerleave",p),()=>{i.removeEventListener("pointerleave",v),d.removeEventListener("pointerleave",p)}}},[i,d,m,f]),k(()=>{if(s){let v=p=>{let g=p.target,w={x:p.clientX,y:p.clientY},C=i?.contains(g)||d?.contains(g),L=!Ov(w,s);C?f():L&&(f(),c())};return document.addEventListener("pointermove",v),()=>document.removeEventListener("pointermove",v)}},[i,d,s,c,f]),h(yd,{...e,ref:n})}),[Pv,Mv]=yr(uo,{isInside:!1}),Tv=$s("TooltipContent"),yd=x((e,t)=>{let{__scopeTooltip:a,children:o,"aria-label":r,onEscapeKeyDown:n,onPointerDownOutside:s,...l}=e,i=co(ka,a),c=Pr(a),{onClose:d}=i;return k(()=>(document.addEventListener(ws,d),()=>document.removeEventListener(ws,d)),[d]),k(()=>{if(i.trigger){let u=f=>{f.target instanceof Node&&f.target.contains(i.trigger)&&d()};return window.addEventListener("scroll",u,{capture:!0}),()=>window.removeEventListener("scroll",u,{capture:!0})}},[i.trigger,d]),h(it,{asChild:!0,disableOutsidePointerEvents:!1,onEscapeKeyDown:n,onPointerDownOutside:s,onFocusOutside:u=>u.preventDefault(),onDismiss:d,children:Ie(Ra,{"data-state":i.stateAttribute,...c,...l,ref:t,style:{...l.style,"--radix-tooltip-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-tooltip-content-available-width":"var(--radix-popper-available-width)","--radix-tooltip-content-available-height":"var(--radix-popper-available-height)","--radix-tooltip-trigger-width":"var(--radix-popper-anchor-width)","--radix-tooltip-trigger-height":"var(--radix-popper-anchor-height)"},children:[h(Tv,{children:o}),h(Pv,{scope:a,isInside:!0,children:h(Sc,{id:i.contentId,role:"tooltip",children:r||o})})]})})});Rd.displayName=ka;var Pd="TooltipArrow",Av=x((e,t)=>{let{__scopeTooltip:a,...o}=e,r=Pr(a);return Mv(Pd,a).isInside?null:h(ya,{...r,...o,ref:t})});Av.displayName=Pd;function kv(e,t){let a=Math.abs(t.top-e.y),o=Math.abs(t.bottom-e.y),r=Math.abs(t.right-e.x),n=Math.abs(t.left-e.x);switch(Math.min(a,o,r,n)){case n:return"left";case r:return"right";case a:return"top";case o:return"bottom";default:throw new Error("unreachable")}}function Dv(e,t,a=5){let o=[];switch(t){case"top":o.push({x:e.x-a,y:e.y+a},{x:e.x+a,y:e.y+a});break;case"bottom":o.push({x:e.x-a,y:e.y-a},{x:e.x+a,y:e.y-a});break;case"left":o.push({x:e.x+a,y:e.y-a},{x:e.x+a,y:e.y+a});break;case"right":o.push({x:e.x-a,y:e.y-a},{x:e.x-a,y:e.y+a});break}return o}function Ev(e){let{top:t,right:a,bottom:o,left:r}=e;return[{x:r,y:t},{x:a,y:t},{x:a,y:o},{x:r,y:o}]}function Ov(e,t){let{x:a,y:o}=e,r=!1;for(let n=0,s=t.length-1;n<t.length;s=n++){let l=t[n],i=t[s],c=l.x,d=l.y,u=i.x,f=i.y;d>o!=f>o&&a<(u-c)*(o-d)/(f-d)+c&&(r=!r)}return r}function Fv(e){let t=e.slice();return t.sort((a,o)=>a.x<o.x?-1:a.x>o.x?1:a.y<o.y?-1:a.y>o.y?1:0),Bv(t)}function Bv(e){if(e.length<=1)return e.slice();let t=[];for(let o=0;o<e.length;o++){let r=e[o];for(;t.length>=2;){let n=t[t.length-1],s=t[t.length-2];if((n.x-s.x)*(r.y-s.y)>=(n.y-s.y)*(r.x-s.x))t.pop();else break}t.push(r)}t.pop();let a=[];for(let o=e.length-1;o>=0;o--){let r=e[o];for(;a.length>=2;){let n=a[a.length-1],s=a[a.length-2];if((n.x-s.x)*(r.y-s.y)>=(n.y-s.y)*(r.x-s.x))a.pop();else break}a.push(r)}return a.pop(),t.length===1&&a.length===1&&t[0].x===a[0].x&&t[0].y===a[0].y?t:t.concat(a)}var Md=bd,Is=Rd;var _v=x(({className:e,sideOffset:t=4,...a},o)=>S(Md,null,S(Is,{ref:o,sideOffset:t,className:O("xps-tooltip-content",e),...a})));_v.displayName=Is.displayName;var oe=window.React,Td=window.ReactDOM,M=oe.createElement;var bs={zh_Hans:{newDrawing:"\u65B0\u5EFA",save:"\u4FDD\u5B58",syncEditor:"\u8BFB\u53D6\u7F16\u8F91\u5668",import:"\u5BFC\u5165",exportXml:"XML",askAssistant:"\u53D1\u9001",search:"\u641C\u7D22\u56FE\u5F62",allStatuses:"\u5168\u90E8\u72B6\u6001",draft:"\u8349\u7A3F",reviewed:"\u5DF2\u5BA1\u6838",archived:"\u5DF2\u5F52\u6863",versions:"\u7248\u672C",restore:"\u6062\u590D",archive:"\u5F52\u6863",markReviewed:"\u6807\u8BB0\u5DF2\u5BA1\u6838",backToDraft:"\u9000\u56DE\u8349\u7A3F",mermaid:"Mermaid",loadMermaid:"\u8F7D\u5165\u7F16\u8F91\u5668",saveConverted:"\u4FDD\u5B58\u8F6C\u6362",title:"\u6807\u9898",description:"\u63CF\u8FF0",drawingRequest:"\u7ED8\u56FE\u9700\u6C42",changeSummary:"\u53D8\u66F4\u6458\u8981",operationCompleted:"\u64CD\u4F5C\u5DF2\u5B8C\u6210",requestTimeout:"\u8BF7\u6C42\u8D85\u65F6",remoteRequestFailed:"\u8FDC\u7A0B\u8BF7\u6C42\u5931\u8D25",unknownError:"\u672A\u77E5\u9519\u8BEF",noDrawing:"\u8BF7\u9009\u62E9\u6216\u65B0\u5EFA\u56FE\u5F62",dirty:"\u672A\u4FDD\u5B58",saved:"\u5DF2\u4FDD\u5B58",editorReady:"\u7F16\u8F91\u5668\u5DF2\u8FDE\u63A5",editorLoading:"\u6B63\u5728\u52A0\u8F7D draw.io \u7F16\u8F91\u5668",mermaidNotice:"Mermaid \u4F1A\u901A\u8FC7 diagrams.net descriptor \u5BFC\u5165\uFF1B\u8BF7\u5728\u7F16\u8F91\u5668\u4E2D\u68C0\u67E5\u540E\u4FDD\u5B58\u3002",untitled:"\u672A\u547D\u540D\u56FE\u5F62",drawingCreated:"\u56FE\u5F62\u5DF2\u521B\u5EFA",agentDrawingUpdated:"Agent \u7ED8\u56FE\u7ED3\u679C\u5DF2\u5237\u65B0",drawings:"\u56FE\u5F62",inspector:"\u8BE6\u60C5",collapseDrawings:"\u6536\u8D77\u56FE\u5F62\u4FA7\u680F",expandDrawings:"\u5C55\u5F00\u56FE\u5F62\u4FA7\u680F",collapseInspector:"\u6536\u8D77\u8BE6\u60C5\u4FA7\u680F",expandInspector:"\u5C55\u5F00\u8BE6\u60C5\u4FA7\u680F"},en_US:{newDrawing:"New",save:"Save",syncEditor:"Read editor",import:"Import",exportXml:"XML",askAssistant:"Send",search:"Search diagrams",allStatuses:"All statuses",draft:"Draft",reviewed:"Reviewed",archived:"Archived",versions:"Versions",restore:"Restore",archive:"Archive",markReviewed:"Mark reviewed",backToDraft:"Back to draft",mermaid:"Mermaid",loadMermaid:"Load in editor",saveConverted:"Save converted",title:"Title",description:"Description",drawingRequest:"Drawing request",changeSummary:"Change summary",operationCompleted:"Operation completed",requestTimeout:"Request timed out",remoteRequestFailed:"Remote request failed",unknownError:"Unknown error",noDrawing:"Select or create a diagram",dirty:"Unsaved",saved:"Saved",editorReady:"Editor connected",editorLoading:"Loading draw.io editor",mermaidNotice:"Mermaid is imported through a diagrams.net descriptor. Review it in the editor before saving.",untitled:"Untitled diagram",drawingCreated:"Diagram created",agentDrawingUpdated:"Agent diagram result refreshed",drawings:"Diagrams",inspector:"Inspector",collapseDrawings:"Collapse diagrams sidebar",expandDrawings:"Expand diagrams sidebar",collapseInspector:"Collapse inspector",expandInspector:"Expand inspector"}};function Rs(e){let t=String(e||"").toLowerCase().startsWith("en")?bs.en_US:bs.zh_Hans;return a=>t[a]||bs.en_US[a]||a}function Ad(){if(document.getElementById("drawio-workbench-styles"))return;let e=document.createElement("style");e.id="drawio-workbench-styles",e.textContent=`
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
  `,document.head.appendChild(e)}var kd="xpertai.remote_component";var $t=new Map,Mr=null,Hv=0,Da={requestTimeout:"Request timed out",remoteRequestFailed:"Remote request failed",unknownError:"Unknown error"};function ys(e){return!!(e&&typeof e=="object"&&!Array.isArray(e))}function fo(e,t,a){!Mr&&e!=="ready"||parent.postMessage(Object.assign({channel:kd,protocolVersion:1,instanceId:Mr,type:e},t||{}),"*",a||[])}function Ar(e,t,a){let o=String(++Hv);return new Promise((r,n)=>{$t.set(o,{resolve:r,reject:n});try{fo(e,Object.assign({requestId:o},t||{}),a)}catch(s){$t.delete(o),n(s instanceof Error?s:new Error(Da.remoteRequestFailed));return}setTimeout(()=>{$t.has(o)&&($t.delete(o),n(new Error(Da.requestTimeout)))},3e4)})}function Ps(e){return Ar("requestData",{query:e||{}})}function Yt(e,t,a,o){return Ar("executeAction",{actionKey:e,targetId:t,input:a,parameters:o})}async function Dd(e,t,a,o,r){let n=await r.arrayBuffer();return Ar("executeFileAction",{actionKey:e,targetId:t,input:a,parameters:o,file:{name:r.name,type:r.type,size:r.size,buffer:n}},[n])}function Ed(e,t){return Ar("invokeClientCommand",{commandKey:e,payload:t})}function Ce(e,t){fo("notify",{level:e,message:t})}function Tr(){let e=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,window.innerHeight||0,720);fo("resize",{height:e,viewportBound:!0})}function ft(e){return e?e.payload!==void 0?e.payload:e.data!==void 0?e.data:e.result!==void 0?e.result:e:null}function Ea(e,t){return e?typeof e=="string"?e:String(t||"").toLowerCase().startsWith("en")?e.en_US||e.en||e.zh_Hans||e.zh_CN||"":e.zh_Hans||e.zh_CN||e.en_US||e.en||"":""}function tt(e){return e?.message?e.message:String(e||Da.unknownError)}function Od(e){Da={...Da,...e}}function Fd(e,t){let a=null;function o(r){window.XpertRemoteUI&&typeof window.XpertRemoteUI.applyTheme=="function"&&window.XpertRemoteUI.applyTheme(r),a={...a||{},theme:r},e(a),setTimeout(Tr,0)}window.addEventListener("message",r=>{let n=r.data;if(!(!ys(n)||n.channel!==kd||n.protocolVersion!==1)){if(n.type==="init"){Mr=typeof n.instanceId=="string"?n.instanceId:null,a={manifest:n.manifest,payload:n.payload,initialQuery:n.initialQuery||{},locale:n.locale,theme:n.theme},window.XpertRemoteUI&&typeof window.XpertRemoteUI.applyTheme=="function"&&window.XpertRemoteUI.applyTheme(n.theme),e(a),setTimeout(Tr,0);return}if(n.instanceId===Mr){if(Uv(n)){o(qv(n));return}if(n.type==="hostEvent"){t(n.event);return}if(n.requestId&&$t.has(String(n.requestId))){let s=$t.get(String(n.requestId));if($t.delete(String(n.requestId)),!s)return;n.type==="error"?s.reject(new Error(String(n.message||Da.remoteRequestFailed))):s.resolve(n)}}}})}function Uv(e){return["theme","themeChanged","theme-change","hostThemeChanged","host-theme-changed"].includes(String(e.type||""))}function qv(e){return e.theme!==void 0?e.theme:ys(e.payload)&&e.payload.theme!==void 0?e.payload.theme:ys(e.data)&&e.data.theme!==void 0?e.data.theme:e.payload??e.data??null}var Nd="https://embed.diagrams.net",Vv=`${Nd}/?embed=1&proto=json&spin=1&libraries=1&configure=1&noExitBtn=1&saveAndExit=0&modified=0`,Oa='<mxfile host="xpert"><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',zv=`flowchart TD
  A[User Request] --> B[Agent Plans Diagram]
  B --> C{Best Format?}
  C -->|Flow| D[Save Mermaid Draft]
  C -->|Precise Layout| E[Save draw.io XML]
  D --> F[Workbench Loads diagrams.net]
  E --> G[Human Review]
  F --> G`,_d="drawio_save_mermaid_draft",Ms=new Set(["drawio_create_diagram","drawio_save_scene_version","drawio_patch_scene",_d,"drawio_search_diagrams","drawio_get_diagram","drawio_update_diagram_status","drawio_report_failure"]),Wv=new Set(["drawio_create_diagram","drawio_save_scene_version","drawio_patch_scene",_d,"drawio_update_diagram_status","drawio_report_failure"]);ks({styleId:"drawio-workbench-shadcn-ui-vars"});Ad();function Gv(){let[e,t]=oe.useState(null),[a,o]=oe.useState([]),[r,n]=oe.useState(null),[s,l]=oe.useState(""),[i,c]=oe.useState(""),[d,u]=oe.useState(""),[f,m]=oe.useState(!1),[v,p]=oe.useState(!1),[g,w]=oe.useState(!1),[C,L]=oe.useState(""),[I,R]=oe.useState(""),[D,y]=oe.useState(""),[H,z]=oe.useState(""),[V,G]=oe.useState(zv),[F,$]=oe.useState(Oa),[j,re]=oe.useState(!0),[X,J]=oe.useState(!0),U=oe.useRef(null),E=oe.useRef(null),Q=oe.useRef(null),te=oe.useRef(""),ve=oe.useRef(""),ge=oe.useRef(""),ye=oe.useRef(0),ke=oe.useRef(null),B=Rs(e?.locale);oe.useEffect(()=>{Od({requestTimeout:B("requestTimeout"),remoteRequestFailed:B("remoteRequestFailed"),unknownError:B("unknownError")})},[e?.locale]),oe.useEffect(()=>{te.current=s},[s]),oe.useEffect(()=>{ve.current=i},[i]),oe.useEffect(()=>{ge.current=d},[d]),oe.useEffect(()=>{Fd(P=>{Q.current=P,t(P),W(P.payload||null),setTimeout(()=>ae(),0)},P=>{Se(P)}),fo("ready")},[]),oe.useEffect(Tr,[a,r,f,v,g,j,X]),oe.useEffect(()=>{let P=Y=>{if(U.current?.contentWindow&&Y.source!==U.current.contentWindow)return;let Z=Xv(Y.data);if(!(!Z||typeof Z.event!="string")){if(Z.event==="configure"){Na({action:"configure",config:{defaultFonts:["Inter","Arial"],compressXml:!0,libraries:!0}});return}if(Z.event==="init"){w(!0),Wd();return}if(Z.event==="save"){let fe=typeof Z.xml=="string"&&Z.xml.trim()?Z.xml:F;$(fe),p(!0);let be=ke.current||"save_scene_version";ke.current=null,Pe(fe,be)}Z.event==="exit"&&(ke.current=null)}};return window.addEventListener("message",P),()=>window.removeEventListener("message",P)},[F,s,V,r?.item?.id,e?.theme]);function W(P){if(P){if(Array.isArray(P.items)){o(P.items),!te.current&&P.items[0]?.id&&ne(P.items[0].id);return}P.item&&ie(P)}}function ie(P){n(P);let Y=P.item?.id||"";te.current=Y,l(Y),p(!1),y("");let Z=P.currentVersion||null,fe=typeof Z?.xml=="string"&&Z.xml.trim()?Z.xml:Oa,be=typeof Z?.mermaidSource=="string"?Z.mermaidSource:"";$(fe),G(be),g&&As(Z,P.item?.title)}async function Se(P){let Y=Kv(P);if(Y&&!Ms.has(Y))return;let Z=++ye.current,fe=jv(P),be=await ae();if(Z!==ye.current)return;let yt=fe??te.current??be[0]?.id;yt&&await ne(yt),(!Y||Wv.has(Y))&&Ce("info",Rs(Q.current?.locale)("agentDrawingUpdated"))}async function ae(P={}){let Y=P.search??ve.current,Z=P.status??ge.current;m(!0);try{let fe=await Ps({page:1,pageSize:50,search:Y,parameters:{...Z?{status:Z}:{}}}),be=ft(fe)||{},yt=Array.isArray(be.items)?be.items:[];return o(yt),!te.current&&yt[0]?.id&&await ne(yt[0].id),yt}catch(fe){return Ce("error",tt(fe)),[]}finally{m(!1)}}async function ne(P){if(!P)return null;m(!0);try{let Y=await Ps({parameters:{drawingId:P}}),Z=ft(Y)||{};return ie(Z),Z}catch(Y){return Ce("error",tt(Y)),null}finally{m(!1)}}async function xe(){let P=C.trim()||B("untitled");m(!0);try{let Y=await Yt("create_drawing",null,{title:P,description:I}),Z=ft(Y);Ce("success",Ea(Z?.message,Q.current?.locale)||B("drawingCreated"));let fe=Z?.item?.id||Z?.data?.item?.id;L(""),R(""),y(""),$(Oa),G(""),p(!1),fe?(await ae(),await ne(fe)):await ae()}catch(Y){Ce("error",tt(Y))}finally{m(!1)}}async function Fe(P="save_scene_version"){if(!s){Ce("warning",B("noDrawing"));return}if(!g){await Pe(F,P);return}ke.current=P,Na({action:"save"})}async function Pe(P,Y="save_scene_version"){if(!s){Ce("warning",B("noDrawing"));return}m(!0);try{let Z=await Yt(Y,s,{drawingId:s,xml:P,mermaidSource:V,descriptor:V.trim()?{format:"mermaid",data:V.trim()}:void 0,changeSummary:D.trim()||void 0}),fe=ft(Z);Ce("success",Ea(fe?.message,Q.current?.locale)||B("operationCompleted")),p(!1),y(""),await ne(s),await ae()}catch(Z){Ce("error",tt(Z))}finally{m(!1)}}async function Fa(P){if(!(!s||!P)){m(!0);try{let Y=await Yt("restore_version",s,{drawingId:s,versionId:P,changeSummary:D.trim()||void 0}),Z=ft(Y);Ce("success",Ea(Z?.message,Q.current?.locale)||B("operationCompleted")),await ne(s),await ae()}catch(Y){Ce("error",tt(Y))}finally{m(!1)}}}async function Ba(){if(s){m(!0);try{await Yt("archive_drawing",s,{drawingId:s}),Ce("success",B("operationCompleted")),n(null),l(""),$(Oa),await ae()}catch(P){Ce("error",tt(P))}finally{m(!1)}}}async function Jt(P){if(s){m(!0);try{let Y=await Yt(P==="reviewed"?"mark_reviewed":"mark_draft",s,{drawingId:s,reason:D.trim()||void 0}),Z=ft(Y);Ce("success",Ea(Z?.message,Q.current?.locale)||B("operationCompleted")),y(""),await ne(s),await ae(ge.current&&ge.current!==P?{status:""}:{}),ge.current&&ge.current!==P&&(ge.current="",u(""))}catch(Y){Ce("error",tt(Y))}finally{m(!1)}}}function Ud(){let P=V.trim();P&&(Na({action:"load",descriptor:{format:"mermaid",data:P},sourceMetadata:{key:"mermaidSource",value:P},title:r?.item?.title||C||B("untitled"),modified:0,noExitBtn:1,saveAndExit:0,exportProtocol:!0,dark:Bd(Q.current?.theme)?1:0}),p(!0))}async function qd(){let P=H.trim();if(P){m(!0);try{let Y=await Yt("prepare_agent_draw_message",s||null,{drawingId:s||void 0,prompt:P}),Z=ft(Y),fe=Z?.data?.commandKey||Z?.commandKey,be=Z?.data?.payload||Z?.payload;fe&&be&&await Ed(fe,be),z(""),Ce("success",B("operationCompleted"))}catch(Y){Ce("error",tt(Y))}finally{m(!1)}}}async function Vd(P){if(P){m(!0);try{let Y=await Dd("import_scene_file",s||null,{drawingId:s||void 0,title:Yv(P.name)},{drawingId:s||void 0},P),Z=ft(Y);Ce("success",Ea(Z?.message,Q.current?.locale)||B("operationCompleted"));let fe=Z?.data?.item?.id||Z?.item?.id||s;await ae(),fe&&await ne(fe)}catch(Y){Ce("error",tt(Y))}finally{m(!1),E.current&&(E.current.value="")}}}function zd(){Zv(new Blob([F||Oa],{type:"application/xml"}),`${r?.item?.title||"diagram"}.drawio`)}function Wd(){As(r?.currentVersion||null,r?.item?.title)}function As(P,Y){let Z=typeof P?.xml=="string"&&P.xml.trim()?P.xml:"",fe=typeof P?.mermaidSource=="string"?P.mermaidSource.trim():"",be={action:"load",title:Y||B("untitled"),modified:0,noExitBtn:1,saveAndExit:0,exportProtocol:!0,dark:Bd(Q.current?.theme)?1:0};Z?be.xml=Z:fe?(be.descriptor={format:"mermaid",data:fe},be.sourceMetadata={key:"mermaidSource",value:fe}):be.xml=Oa,Na(be)}function Na(P){U.current?.contentWindow?.postMessage(JSON.stringify(P),Nd)}let Gd=r?.currentVersion||null,kr=r?.item?.status||"draft";return M("div",{className:`dw-shell ${j?"left-collapsed":""} ${X?"right-collapsed":""}`},M(hr,{className:"dw-sidebar",side:"left",collapsed:j},M(xr,null,M(Cr,{variant:"ghost",size:"icon","aria-label":B(j?"expandDrawings":"collapseDrawings"),title:B(j?"expandDrawings":"collapseDrawings"),onClick:()=>re(P=>!P)},j?M(lt,{className:"dw-button-icon","aria-hidden":"true"}):M(st,{className:"dw-button-icon","aria-hidden":"true"})),j?null:M(oe.Fragment,null,M(vr,null,B("drawings")),M(qa,{variant:"secondary"},a.length))),j?M(wr,null,M("span",null,B("drawings"))):M(gr,null,M("div",{className:"dw-sidebar-controls"},M(no,{value:i,placeholder:B("search"),onChange:P=>{let Y=P.target.value;ve.current=Y,c(Y),ae({search:Y})}}),M(Vc,{value:d||"all",onValueChange:P=>{let Y=P==="all"?"":P;ge.current=Y,u(Y),ae({status:Y})}},M(ts,{"aria-label":B("allStatuses")},M(zc,{placeholder:B("allStatuses")})),M(as,null,M(Ta,{value:"all"},B("allStatuses")),M(Ta,{value:"draft"},B("draft")),M(Ta,{value:"reviewed"},B("reviewed")),M(Ta,{value:"archived"},B("archived"))))),M(or,{className:"dw-list"},M(os,null,a.map(P=>M(rs,{key:P.id},M(ns,{type:"button",active:P.id===s,onClick:()=>ne(P.id)},M("span",{className:"dw-item-title"},P.title||B("untitled")),M("span",{className:"dw-item-meta"},"v",P.currentVersionNumber||0," \xB7 ",B(P.status||"draft"))))))))),M("main",{className:"dw-main"},M("div",{className:"dw-toolbar"},M("div",{className:"dw-toolbar-title"},M(no,{className:"dw-title-input",value:C,placeholder:B("title"),onChange:P=>L(P.target.value)})),M("div",{className:"dw-toolbar-actions"},M(Re,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:xe},M(ia,{className:"dw-button-icon","aria-hidden":"true"}),B("newDrawing")),M(Re,{type:"button",size:"sm",disabled:f||!s,onClick:()=>Fe()},M(ua,{className:"dw-button-icon","aria-hidden":"true"}),B("save")),M(Re,{type:"button",variant:"outline",size:"sm",disabled:f||!s||!g,onClick:()=>Na({action:"save"})},M(Tt,{className:"dw-button-icon","aria-hidden":"true"}),B("syncEditor")),M(Re,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:()=>E.current?.click()},M(da,{className:"dw-button-icon","aria-hidden":"true"}),B("import")),M(Re,{type:"button",variant:"outline",size:"sm",disabled:!s,onClick:zd},M(Tt,{className:"dw-button-icon","aria-hidden":"true"}),B("exportXml")),M(qa,{className:"dw-status",variant:v?"warning":"secondary"},B(v?"dirty":"saved")),M(qa,{variant:g?"secondary":"outline"},B(g?"editorReady":"editorLoading"))),M("input",{ref:E,className:"dw-hidden-file",type:"file",accept:".drawio,.diagram,.xml,.svg,.json,application/xml,text/xml,application/json",onChange:P=>Vd(P.target.files?.[0]||null)})),M("div",{className:"dw-editor"},s||Gd?M(oe.Fragment,null,M("iframe",{ref:U,title:"draw.io editor",src:Vv}),g?null:M("div",{className:"dw-editor-placeholder"},B("editorLoading"))):M("div",{className:"dw-empty"},B("noDrawing")))),M(hr,{className:"dw-inspector",side:"right",collapsed:X},M(xr,null,X?null:M(oe.Fragment,null,M("div",{className:"dw-inspector-actions"},kr==="archived"?M(qa,{variant:"secondary"},B("archived")):kr==="reviewed"?M(Re,{type:"button",variant:"outline",size:"sm",disabled:f||!s,onClick:()=>Jt("draft")},M(At,{className:"dw-button-icon","aria-hidden":"true"}),B("backToDraft")):M(Re,{type:"button",variant:"outline",size:"sm",disabled:f||!s,onClick:()=>Jt("reviewed")},M(Be,{className:"dw-button-icon","aria-hidden":"true"}),B("markReviewed")),M(Re,{type:"button",variant:"destructiveOutline",size:"sm",disabled:f||!s||kr==="archived",onClick:Ba},M(oa,{className:"dw-button-icon","aria-hidden":"true"}),B("archive"))),M(vr,{className:"dw-sidebar-title-truncate"},r?.item?.title||B("inspector"))),M(Cr,{className:"dw-sidebar-trigger-right",variant:"ghost",size:"icon","aria-label":B(X?"expandInspector":"collapseInspector"),title:B(X?"expandInspector":"collapseInspector"),onClick:()=>J(P=>!P)},X?M(la,{className:"dw-button-icon","aria-hidden":"true"}):M(sa,{className:"dw-button-icon","aria-hidden":"true"}))),X?M(wr,null,M("span",null,B("inspector"))):M(gr,null,M(or,{className:"dw-inspector-scroll"},M("div",{className:"dw-inspector-stack"},M("section",{className:"dw-section"},M("div",{className:"dw-section-title"},B("changeSummary")),M(no,{value:D,placeholder:B("changeSummary"),onChange:P=>y(P.target.value)})),M("section",{className:"dw-section"},M("div",{className:"dw-section-title"},B("versions")),(r?.versions||[]).map(P=>M("div",{className:"dw-version",key:P.id},M("div",null,M("div",null,"v",P.versionNumber),M("div",{className:"dw-muted"},P.sourceType||"workbench")),M(Re,{className:"dw-version-action",type:"button",variant:"outline",size:"icon",title:B("restore"),"aria-label":`${B("restore")} v${P.versionNumber}`,disabled:f,onClick:()=>Fa(P.id)},M(At,{className:"dw-button-icon","aria-hidden":"true"}))))),M("section",{className:"dw-section"},M("div",{className:"dw-section-title"},B("mermaid")),M(io,{value:V,onChange:P=>{G(P.target.value),p(!0)}}),M("div",{className:"dw-muted"},B("mermaidNotice")),M("div",{className:"dw-inline-actions"},M(Re,{type:"button",variant:"outline",size:"sm",disabled:f||!g||!V.trim(),onClick:Ud},B("loadMermaid")),M(Re,{type:"button",size:"sm",disabled:f||!s,onClick:()=>Fe("save_converted_mermaid_scene")},B("saveConverted")))),M("section",{className:"dw-section"},M("div",{className:"dw-section-title"},B("drawingRequest")),M(io,{value:H,placeholder:B("drawingRequest"),onChange:P=>z(P.target.value)}),M(Re,{type:"button",disabled:f||!H.trim(),onClick:qd},M(ca,{className:"dw-button-icon","aria-hidden":"true"}),B("askAssistant"))),M("section",{className:"dw-section"},M("div",{className:"dw-section-title"},B("description")),M(io,{value:I,placeholder:B("description"),onChange:P=>R(P.target.value)})))))))}function Xv(e){if(typeof e=="string")try{return JSON.parse(e)}catch{return null}return e&&typeof e=="object"&&!Array.isArray(e)?e:null}function Bd(e){return typeof e=="boolean"?e:typeof e=="string"?/dark|night/i.test(e):!!(e&&typeof e=="object"&&(e.dark===!0||e.isDark===!0))}function Kv(e){for(let t of Hd(e)){if(!Zt(t))continue;let a=Oe(t,"toolName")??Oe(t,"tool_name")??Oe(t,"name");if(a&&Ms.has(a))return a;let o=t.tool;if(Zt(o)){let r=Oe(o,"name")??Oe(o,"toolName")??Oe(o,"tool_name");if(r&&Ms.has(r))return r}}return null}function jv(e){for(let t of Hd(e)){if(!Zt(t))continue;let a=Oe(t,"drawingId")??Oe(t,"drawing_id");if(a)return a;if(Zt(t.item)){let o=Oe(t.item,"id");if(o)return o}if(Zt(t.drawing)){let o=Oe(t.drawing,"drawingId")??Oe(t.drawing,"drawing_id")??Oe(t.drawing,"id");if(o)return o}if(Zt(t.version)){let o=Oe(t.version,"drawingId")??Oe(t.version,"drawing_id");if(o)return o}}return null}function Hd(e){let t=[];return Ts(e,t,0),t}function Ts(e,t,a){if(a>5||e==null)return;let o=$v(e);if(t.push(o),Array.isArray(o)){o.forEach(r=>Ts(r,t,a+1));return}Zt(o)&&["payload","metadata","data","result","output","content","message","detail","response","tool","toolCall","tool_call","function","arguments","args","input"].forEach(r=>Ts(o[r],t,a+1))}function $v(e){if(typeof e!="string")return e;let t=e.trim();if(!t||!t.startsWith("{")&&!t.startsWith("["))return e;try{return JSON.parse(t)}catch{return e}}function Zt(e){return!!(e&&typeof e=="object"&&!Array.isArray(e))}function Oe(e,t){let a=e[t];return typeof a=="string"&&a.trim()?a.trim():null}function Yv(e){return e.replace(/\.(drawio|diagram|xml)(?:\.json)?$/i,"").replace(/\.json$/i,"")||e}function Zv(e,t){let a=URL.createObjectURL(e),o=document.createElement("a");o.href=a,o.download=t,document.body.appendChild(o),o.click(),o.remove(),URL.revokeObjectURL(a)}var Jv=Td.createRoot(document.getElementById("root"));Jv.render(M(Gv,null));})();
