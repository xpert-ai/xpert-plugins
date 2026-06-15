;
"use strict";(()=>{var bf=Object.defineProperty;var Rf=(e,t)=>{for(var a in t)bf(e,a,{get:t[a],enumerable:!0})};function $s(e={}){let t=e.styleId??"xpert-plugin-shadcn-ui-vars";if(typeof document>"u"||document.getElementById(t))return;let a=document.createElement("style");a.id=t,a.textContent=`
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
  `,document.head.appendChild(a)}function Ys(e){var t,a,o="";if(typeof e=="string"||typeof e=="number")o+=e;else if(typeof e=="object")if(Array.isArray(e)){var r=e.length;for(t=0;t<r;t++)e[t]&&(a=Ys(e[t]))&&(o&&(o+=" "),o+=a)}else for(a in e)e[a]&&(o&&(o+=" "),o+=a);return o}function Co(){for(var e,t,a=0,o="",r=arguments.length;a<r;a++)(e=arguments[a])&&(t=Ys(e))&&(o&&(o+=" "),o+=t);return o}var yf=e=>{let t=Tf(e),{conflictingClassGroups:a,conflictingClassGroupModifiers:o}=e;return{getClassGroupId:s=>{let l=s.split("-");return l[0]===""&&l.length!==1&&l.shift(),Qs(l,t)||Pf(s)},getConflictingClassGroupIds:(s,l)=>{let i=a[s]||[];return l&&o[s]?[...i,...o[s]]:i}}},Qs=(e,t)=>{if(e.length===0)return t.classGroupId;let a=e[0],o=t.nextPart.get(a),r=o?Qs(e.slice(1),o):void 0;if(r)return r;if(t.validators.length===0)return;let n=e.join("-");return t.validators.find(({validator:s})=>s(n))?.classGroupId},Js=/^\[(.+)\]$/,Pf=e=>{if(Js.test(e)){let t=Js.exec(e)[1],a=t?.substring(0,t.indexOf(":"));if(a)return"arbitrary.."+a}},Tf=e=>{let{theme:t,prefix:a}=e,o={nextPart:new Map,validators:[]};return Mf(Object.entries(e.classGroups),a).forEach(([n,s])=>{Vr(s,o,n,t)}),o},Vr=(e,t,a,o)=>{e.forEach(r=>{if(typeof r=="string"){let n=r===""?t:Zs(t,r);n.classGroupId=a;return}if(typeof r=="function"){if(kf(r)){Vr(r(o),t,a,o);return}t.validators.push({validator:r,classGroupId:a});return}Object.entries(r).forEach(([n,s])=>{Vr(s,Zs(t,n),a,o)})})},Zs=(e,t)=>{let a=e;return t.split("-").forEach(o=>{a.nextPart.has(o)||a.nextPart.set(o,{nextPart:new Map,validators:[]}),a=a.nextPart.get(o)}),a},kf=e=>e.isThemeGetter,Mf=(e,t)=>t?e.map(([a,o])=>{let r=o.map(n=>typeof n=="string"?t+n:typeof n=="object"?Object.fromEntries(Object.entries(n).map(([s,l])=>[t+s,l])):n);return[a,r]}):e,Af=e=>{if(e<1)return{get:()=>{},set:()=>{}};let t=0,a=new Map,o=new Map,r=(n,s)=>{a.set(n,s),t++,t>e&&(t=0,o=a,a=new Map)};return{get(n){let s=a.get(n);if(s!==void 0)return s;if((s=o.get(n))!==void 0)return r(n,s),s},set(n,s){a.has(n)?a.set(n,s):r(n,s)}}};var Df=e=>{let{separator:t,experimentalParseClassName:a}=e,o=t.length===1,r=t[0],n=t.length,s=l=>{let i=[],u=0,d=0,c;for(let v=0;v<l.length;v++){let w=l[v];if(u===0){if(w===r&&(o||l.slice(v,v+n)===t)){i.push(l.slice(d,v)),d=v+n;continue}if(w==="/"){c=v;continue}}w==="["?u++:w==="]"&&u--}let f=i.length===0?l:l.substring(d),m=f.startsWith("!"),g=m?f.substring(1):f,p=c&&c>d?c-d:void 0;return{modifiers:i,hasImportantModifier:m,baseClassName:g,maybePostfixModifierPosition:p}};return a?l=>a({className:l,parseClassName:s}):s},Ef=e=>{if(e.length<=1)return e;let t=[],a=[];return e.forEach(o=>{o[0]==="["?(t.push(...a.sort(),o),a=[]):a.push(o)}),t.push(...a.sort()),t},Of=e=>({cache:Af(e.cacheSize),parseClassName:Df(e),...yf(e)}),Nf=/\s+/,Ff=(e,t)=>{let{parseClassName:a,getClassGroupId:o,getConflictingClassGroupIds:r}=t,n=[],s=e.trim().split(Nf),l="";for(let i=s.length-1;i>=0;i-=1){let u=s[i],{modifiers:d,hasImportantModifier:c,baseClassName:f,maybePostfixModifierPosition:m}=a(u),g=!!m,p=o(g?f.substring(0,m):f);if(!p){if(!g){l=u+(l.length>0?" "+l:l);continue}if(p=o(f),!p){l=u+(l.length>0?" "+l:l);continue}g=!1}let v=Ef(d).join(":"),w=c?v+"!":v,C=w+p;if(n.includes(C))continue;n.push(C);let L=r(p,g);for(let S=0;S<L.length;++S){let P=L[S];n.push(w+P)}l=u+(l.length>0?" "+l:l)}return l};function Bf(){let e=0,t,a,o="";for(;e<arguments.length;)(t=arguments[e++])&&(a=el(t))&&(o&&(o+=" "),o+=a);return o}var el=e=>{if(typeof e=="string")return e;let t,a="";for(let o=0;o<e.length;o++)e[o]&&(t=el(e[o]))&&(a&&(a+=" "),a+=t);return a};function _f(e,...t){let a,o,r,n=s;function s(i){let u=t.reduce((d,c)=>c(d),e());return a=Of(u),o=a.cache.get,r=a.cache.set,n=l,l(i)}function l(i){let u=o(i);if(u)return u;let d=Ff(i,a);return r(i,d),d}return function(){return n(Bf.apply(null,arguments))}}var me=e=>{let t=a=>a[e]||[];return t.isThemeGetter=!0,t},tl=/^\[(?:([a-z-]+):)?(.+)\]$/i,Hf=/^\d+\/\d+$/,Uf=new Set(["px","full","screen"]),qf=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,zf=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Vf=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,Wf=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,Gf=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,ut=e=>na(e)||Uf.has(e)||Hf.test(e),Lt=e=>sa(e,"length",Qf),na=e=>!!e&&!Number.isNaN(Number(e)),zr=e=>sa(e,"number",na),Ga=e=>!!e&&Number.isInteger(Number(e)),Xf=e=>e.endsWith("%")&&na(e.slice(0,-1)),Q=e=>tl.test(e),It=e=>qf.test(e),Kf=new Set(["length","size","percentage"]),jf=e=>sa(e,Kf,al),$f=e=>sa(e,"position",al),Yf=new Set(["image","url"]),Jf=e=>sa(e,Yf,tp),Zf=e=>sa(e,"",ep),Xa=()=>!0,sa=(e,t,a)=>{let o=tl.exec(e);return o?o[1]?typeof t=="string"?o[1]===t:t.has(o[1]):a(o[2]):!1},Qf=e=>zf.test(e)&&!Vf.test(e),al=()=>!1,ep=e=>Wf.test(e),tp=e=>Gf.test(e);var ap=()=>{let e=me("colors"),t=me("spacing"),a=me("blur"),o=me("brightness"),r=me("borderColor"),n=me("borderRadius"),s=me("borderSpacing"),l=me("borderWidth"),i=me("contrast"),u=me("grayscale"),d=me("hueRotate"),c=me("invert"),f=me("gap"),m=me("gradientColorStops"),g=me("gradientColorStopPositions"),p=me("inset"),v=me("margin"),w=me("opacity"),C=me("padding"),L=me("saturate"),S=me("scale"),P=me("sepia"),E=me("skew"),T=me("space"),_=me("translate"),z=()=>["auto","contain","none"],V=()=>["auto","hidden","clip","visible","scroll"],K=()=>["auto",Q,t],F=()=>[Q,t],Y=()=>["",ut,Lt],$=()=>["auto",na,Q],ae=()=>["bottom","center","left","left-bottom","left-top","right","right-bottom","right-top","top"],j=()=>["solid","dashed","dotted","double","none"],J=()=>["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"],U=()=>["start","end","center","between","around","evenly","stretch"],O=()=>["","0",Q],ee=()=>["auto","avoid","all","avoid-page","page","left","right","column"],se=()=>[na,Q];return{cacheSize:500,separator:":",theme:{colors:[Xa],spacing:[ut,Lt],blur:["none","",It,Q],brightness:se(),borderColor:[e],borderRadius:["none","","full",It,Q],borderSpacing:F(),borderWidth:Y(),contrast:se(),grayscale:O(),hueRotate:se(),invert:O(),gap:F(),gradientColorStops:[e],gradientColorStopPositions:[Xf,Lt],inset:K(),margin:K(),opacity:se(),padding:F(),saturate:se(),scale:se(),sepia:O(),skew:se(),space:F(),translate:F()},classGroups:{aspect:[{aspect:["auto","square","video",Q]}],container:["container"],columns:[{columns:[It]}],"break-after":[{"break-after":ee()}],"break-before":[{"break-before":ee()}],"break-inside":[{"break-inside":["auto","avoid","avoid-page","avoid-column"]}],"box-decoration":[{"box-decoration":["slice","clone"]}],box:[{box:["border","content"]}],display:["block","inline-block","inline","flex","inline-flex","table","inline-table","table-caption","table-cell","table-column","table-column-group","table-footer-group","table-header-group","table-row-group","table-row","flow-root","grid","inline-grid","contents","list-item","hidden"],float:[{float:["right","left","none","start","end"]}],clear:[{clear:["left","right","both","none","start","end"]}],isolation:["isolate","isolation-auto"],"object-fit":[{object:["contain","cover","fill","none","scale-down"]}],"object-position":[{object:[...ae(),Q]}],overflow:[{overflow:V()}],"overflow-x":[{"overflow-x":V()}],"overflow-y":[{"overflow-y":V()}],overscroll:[{overscroll:z()}],"overscroll-x":[{"overscroll-x":z()}],"overscroll-y":[{"overscroll-y":z()}],position:["static","fixed","absolute","relative","sticky"],inset:[{inset:[p]}],"inset-x":[{"inset-x":[p]}],"inset-y":[{"inset-y":[p]}],start:[{start:[p]}],end:[{end:[p]}],top:[{top:[p]}],right:[{right:[p]}],bottom:[{bottom:[p]}],left:[{left:[p]}],visibility:["visible","invisible","collapse"],z:[{z:["auto",Ga,Q]}],basis:[{basis:K()}],"flex-direction":[{flex:["row","row-reverse","col","col-reverse"]}],"flex-wrap":[{flex:["wrap","wrap-reverse","nowrap"]}],flex:[{flex:["1","auto","initial","none",Q]}],grow:[{grow:O()}],shrink:[{shrink:O()}],order:[{order:["first","last","none",Ga,Q]}],"grid-cols":[{"grid-cols":[Xa]}],"col-start-end":[{col:["auto",{span:["full",Ga,Q]},Q]}],"col-start":[{"col-start":$()}],"col-end":[{"col-end":$()}],"grid-rows":[{"grid-rows":[Xa]}],"row-start-end":[{row:["auto",{span:[Ga,Q]},Q]}],"row-start":[{"row-start":$()}],"row-end":[{"row-end":$()}],"grid-flow":[{"grid-flow":["row","col","dense","row-dense","col-dense"]}],"auto-cols":[{"auto-cols":["auto","min","max","fr",Q]}],"auto-rows":[{"auto-rows":["auto","min","max","fr",Q]}],gap:[{gap:[f]}],"gap-x":[{"gap-x":[f]}],"gap-y":[{"gap-y":[f]}],"justify-content":[{justify:["normal",...U()]}],"justify-items":[{"justify-items":["start","end","center","stretch"]}],"justify-self":[{"justify-self":["auto","start","end","center","stretch"]}],"align-content":[{content:["normal",...U(),"baseline"]}],"align-items":[{items:["start","end","center","baseline","stretch"]}],"align-self":[{self:["auto","start","end","center","stretch","baseline"]}],"place-content":[{"place-content":[...U(),"baseline"]}],"place-items":[{"place-items":["start","end","center","baseline","stretch"]}],"place-self":[{"place-self":["auto","start","end","center","stretch"]}],p:[{p:[C]}],px:[{px:[C]}],py:[{py:[C]}],ps:[{ps:[C]}],pe:[{pe:[C]}],pt:[{pt:[C]}],pr:[{pr:[C]}],pb:[{pb:[C]}],pl:[{pl:[C]}],m:[{m:[v]}],mx:[{mx:[v]}],my:[{my:[v]}],ms:[{ms:[v]}],me:[{me:[v]}],mt:[{mt:[v]}],mr:[{mr:[v]}],mb:[{mb:[v]}],ml:[{ml:[v]}],"space-x":[{"space-x":[T]}],"space-x-reverse":["space-x-reverse"],"space-y":[{"space-y":[T]}],"space-y-reverse":["space-y-reverse"],w:[{w:["auto","min","max","fit","svw","lvw","dvw",Q,t]}],"min-w":[{"min-w":[Q,t,"min","max","fit"]}],"max-w":[{"max-w":[Q,t,"none","full","min","max","fit","prose",{screen:[It]},It]}],h:[{h:[Q,t,"auto","min","max","fit","svh","lvh","dvh"]}],"min-h":[{"min-h":[Q,t,"min","max","fit","svh","lvh","dvh"]}],"max-h":[{"max-h":[Q,t,"min","max","fit","svh","lvh","dvh"]}],size:[{size:[Q,t,"auto","min","max","fit"]}],"font-size":[{text:["base",It,Lt]}],"font-smoothing":["antialiased","subpixel-antialiased"],"font-style":["italic","not-italic"],"font-weight":[{font:["thin","extralight","light","normal","medium","semibold","bold","extrabold","black",zr]}],"font-family":[{font:[Xa]}],"fvn-normal":["normal-nums"],"fvn-ordinal":["ordinal"],"fvn-slashed-zero":["slashed-zero"],"fvn-figure":["lining-nums","oldstyle-nums"],"fvn-spacing":["proportional-nums","tabular-nums"],"fvn-fraction":["diagonal-fractions","stacked-fractions"],tracking:[{tracking:["tighter","tight","normal","wide","wider","widest",Q]}],"line-clamp":[{"line-clamp":["none",na,zr]}],leading:[{leading:["none","tight","snug","normal","relaxed","loose",ut,Q]}],"list-image":[{"list-image":["none",Q]}],"list-style-type":[{list:["none","disc","decimal",Q]}],"list-style-position":[{list:["inside","outside"]}],"placeholder-color":[{placeholder:[e]}],"placeholder-opacity":[{"placeholder-opacity":[w]}],"text-alignment":[{text:["left","center","right","justify","start","end"]}],"text-color":[{text:[e]}],"text-opacity":[{"text-opacity":[w]}],"text-decoration":["underline","overline","line-through","no-underline"],"text-decoration-style":[{decoration:[...j(),"wavy"]}],"text-decoration-thickness":[{decoration:["auto","from-font",ut,Lt]}],"underline-offset":[{"underline-offset":["auto",ut,Q]}],"text-decoration-color":[{decoration:[e]}],"text-transform":["uppercase","lowercase","capitalize","normal-case"],"text-overflow":["truncate","text-ellipsis","text-clip"],"text-wrap":[{text:["wrap","nowrap","balance","pretty"]}],indent:[{indent:F()}],"vertical-align":[{align:["baseline","top","middle","bottom","text-top","text-bottom","sub","super",Q]}],whitespace:[{whitespace:["normal","nowrap","pre","pre-line","pre-wrap","break-spaces"]}],break:[{break:["normal","words","all","keep"]}],hyphens:[{hyphens:["none","manual","auto"]}],content:[{content:["none",Q]}],"bg-attachment":[{bg:["fixed","local","scroll"]}],"bg-clip":[{"bg-clip":["border","padding","content","text"]}],"bg-opacity":[{"bg-opacity":[w]}],"bg-origin":[{"bg-origin":["border","padding","content"]}],"bg-position":[{bg:[...ae(),$f]}],"bg-repeat":[{bg:["no-repeat",{repeat:["","x","y","round","space"]}]}],"bg-size":[{bg:["auto","cover","contain",jf]}],"bg-image":[{bg:["none",{"gradient-to":["t","tr","r","br","b","bl","l","tl"]},Jf]}],"bg-color":[{bg:[e]}],"gradient-from-pos":[{from:[g]}],"gradient-via-pos":[{via:[g]}],"gradient-to-pos":[{to:[g]}],"gradient-from":[{from:[m]}],"gradient-via":[{via:[m]}],"gradient-to":[{to:[m]}],rounded:[{rounded:[n]}],"rounded-s":[{"rounded-s":[n]}],"rounded-e":[{"rounded-e":[n]}],"rounded-t":[{"rounded-t":[n]}],"rounded-r":[{"rounded-r":[n]}],"rounded-b":[{"rounded-b":[n]}],"rounded-l":[{"rounded-l":[n]}],"rounded-ss":[{"rounded-ss":[n]}],"rounded-se":[{"rounded-se":[n]}],"rounded-ee":[{"rounded-ee":[n]}],"rounded-es":[{"rounded-es":[n]}],"rounded-tl":[{"rounded-tl":[n]}],"rounded-tr":[{"rounded-tr":[n]}],"rounded-br":[{"rounded-br":[n]}],"rounded-bl":[{"rounded-bl":[n]}],"border-w":[{border:[l]}],"border-w-x":[{"border-x":[l]}],"border-w-y":[{"border-y":[l]}],"border-w-s":[{"border-s":[l]}],"border-w-e":[{"border-e":[l]}],"border-w-t":[{"border-t":[l]}],"border-w-r":[{"border-r":[l]}],"border-w-b":[{"border-b":[l]}],"border-w-l":[{"border-l":[l]}],"border-opacity":[{"border-opacity":[w]}],"border-style":[{border:[...j(),"hidden"]}],"divide-x":[{"divide-x":[l]}],"divide-x-reverse":["divide-x-reverse"],"divide-y":[{"divide-y":[l]}],"divide-y-reverse":["divide-y-reverse"],"divide-opacity":[{"divide-opacity":[w]}],"divide-style":[{divide:j()}],"border-color":[{border:[r]}],"border-color-x":[{"border-x":[r]}],"border-color-y":[{"border-y":[r]}],"border-color-s":[{"border-s":[r]}],"border-color-e":[{"border-e":[r]}],"border-color-t":[{"border-t":[r]}],"border-color-r":[{"border-r":[r]}],"border-color-b":[{"border-b":[r]}],"border-color-l":[{"border-l":[r]}],"divide-color":[{divide:[r]}],"outline-style":[{outline:["",...j()]}],"outline-offset":[{"outline-offset":[ut,Q]}],"outline-w":[{outline:[ut,Lt]}],"outline-color":[{outline:[e]}],"ring-w":[{ring:Y()}],"ring-w-inset":["ring-inset"],"ring-color":[{ring:[e]}],"ring-opacity":[{"ring-opacity":[w]}],"ring-offset-w":[{"ring-offset":[ut,Lt]}],"ring-offset-color":[{"ring-offset":[e]}],shadow:[{shadow:["","inner","none",It,Zf]}],"shadow-color":[{shadow:[Xa]}],opacity:[{opacity:[w]}],"mix-blend":[{"mix-blend":[...J(),"plus-lighter","plus-darker"]}],"bg-blend":[{"bg-blend":J()}],filter:[{filter:["","none"]}],blur:[{blur:[a]}],brightness:[{brightness:[o]}],contrast:[{contrast:[i]}],"drop-shadow":[{"drop-shadow":["","none",It,Q]}],grayscale:[{grayscale:[u]}],"hue-rotate":[{"hue-rotate":[d]}],invert:[{invert:[c]}],saturate:[{saturate:[L]}],sepia:[{sepia:[P]}],"backdrop-filter":[{"backdrop-filter":["","none"]}],"backdrop-blur":[{"backdrop-blur":[a]}],"backdrop-brightness":[{"backdrop-brightness":[o]}],"backdrop-contrast":[{"backdrop-contrast":[i]}],"backdrop-grayscale":[{"backdrop-grayscale":[u]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[d]}],"backdrop-invert":[{"backdrop-invert":[c]}],"backdrop-opacity":[{"backdrop-opacity":[w]}],"backdrop-saturate":[{"backdrop-saturate":[L]}],"backdrop-sepia":[{"backdrop-sepia":[P]}],"border-collapse":[{border:["collapse","separate"]}],"border-spacing":[{"border-spacing":[s]}],"border-spacing-x":[{"border-spacing-x":[s]}],"border-spacing-y":[{"border-spacing-y":[s]}],"table-layout":[{table:["auto","fixed"]}],caption:[{caption:["top","bottom"]}],transition:[{transition:["none","all","","colors","opacity","shadow","transform",Q]}],duration:[{duration:se()}],ease:[{ease:["linear","in","out","in-out",Q]}],delay:[{delay:se()}],animate:[{animate:["none","spin","ping","pulse","bounce",Q]}],transform:[{transform:["","gpu","none"]}],scale:[{scale:[S]}],"scale-x":[{"scale-x":[S]}],"scale-y":[{"scale-y":[S]}],rotate:[{rotate:[Ga,Q]}],"translate-x":[{"translate-x":[_]}],"translate-y":[{"translate-y":[_]}],"skew-x":[{"skew-x":[E]}],"skew-y":[{"skew-y":[E]}],"transform-origin":[{origin:["center","top","top-right","right","bottom-right","bottom","bottom-left","left","top-left",Q]}],accent:[{accent:["auto",e]}],appearance:[{appearance:["none","auto"]}],cursor:[{cursor:["auto","default","pointer","wait","text","move","help","not-allowed","none","context-menu","progress","cell","crosshair","vertical-text","alias","copy","no-drop","grab","grabbing","all-scroll","col-resize","row-resize","n-resize","e-resize","s-resize","w-resize","ne-resize","nw-resize","se-resize","sw-resize","ew-resize","ns-resize","nesw-resize","nwse-resize","zoom-in","zoom-out",Q]}],"caret-color":[{caret:[e]}],"pointer-events":[{"pointer-events":["none","auto"]}],resize:[{resize:["none","y","x",""]}],"scroll-behavior":[{scroll:["auto","smooth"]}],"scroll-m":[{"scroll-m":F()}],"scroll-mx":[{"scroll-mx":F()}],"scroll-my":[{"scroll-my":F()}],"scroll-ms":[{"scroll-ms":F()}],"scroll-me":[{"scroll-me":F()}],"scroll-mt":[{"scroll-mt":F()}],"scroll-mr":[{"scroll-mr":F()}],"scroll-mb":[{"scroll-mb":F()}],"scroll-ml":[{"scroll-ml":F()}],"scroll-p":[{"scroll-p":F()}],"scroll-px":[{"scroll-px":F()}],"scroll-py":[{"scroll-py":F()}],"scroll-ps":[{"scroll-ps":F()}],"scroll-pe":[{"scroll-pe":F()}],"scroll-pt":[{"scroll-pt":F()}],"scroll-pr":[{"scroll-pr":F()}],"scroll-pb":[{"scroll-pb":F()}],"scroll-pl":[{"scroll-pl":F()}],"snap-align":[{snap:["start","end","center","align-none"]}],"snap-stop":[{snap:["normal","always"]}],"snap-type":[{snap:["none","x","y","both"]}],"snap-strictness":[{snap:["mandatory","proximity"]}],touch:[{touch:["auto","none","manipulation"]}],"touch-x":[{"touch-pan":["x","left","right"]}],"touch-y":[{"touch-pan":["y","up","down"]}],"touch-pz":["touch-pinch-zoom"],select:[{select:["none","text","all","auto"]}],"will-change":[{"will-change":["auto","scroll","contents","transform",Q]}],fill:[{fill:[e,"none"]}],"stroke-w":[{stroke:[ut,Lt,zr]}],stroke:[{stroke:[e,"none"]}],sr:["sr-only","not-sr-only"],"forced-color-adjust":[{"forced-color-adjust":["auto","none"]}]},conflictingClassGroups:{overflow:["overflow-x","overflow-y"],overscroll:["overscroll-x","overscroll-y"],inset:["inset-x","inset-y","start","end","top","right","bottom","left"],"inset-x":["right","left"],"inset-y":["top","bottom"],flex:["basis","grow","shrink"],gap:["gap-x","gap-y"],p:["px","py","ps","pe","pt","pr","pb","pl"],px:["pr","pl"],py:["pt","pb"],m:["mx","my","ms","me","mt","mr","mb","ml"],mx:["mr","ml"],my:["mt","mb"],size:["w","h"],"font-size":["leading"],"fvn-normal":["fvn-ordinal","fvn-slashed-zero","fvn-figure","fvn-spacing","fvn-fraction"],"fvn-ordinal":["fvn-normal"],"fvn-slashed-zero":["fvn-normal"],"fvn-figure":["fvn-normal"],"fvn-spacing":["fvn-normal"],"fvn-fraction":["fvn-normal"],"line-clamp":["display","overflow"],rounded:["rounded-s","rounded-e","rounded-t","rounded-r","rounded-b","rounded-l","rounded-ss","rounded-se","rounded-ee","rounded-es","rounded-tl","rounded-tr","rounded-br","rounded-bl"],"rounded-s":["rounded-ss","rounded-es"],"rounded-e":["rounded-se","rounded-ee"],"rounded-t":["rounded-tl","rounded-tr"],"rounded-r":["rounded-tr","rounded-br"],"rounded-b":["rounded-br","rounded-bl"],"rounded-l":["rounded-tl","rounded-bl"],"border-spacing":["border-spacing-x","border-spacing-y"],"border-w":["border-w-s","border-w-e","border-w-t","border-w-r","border-w-b","border-w-l"],"border-w-x":["border-w-r","border-w-l"],"border-w-y":["border-w-t","border-w-b"],"border-color":["border-color-s","border-color-e","border-color-t","border-color-r","border-color-b","border-color-l"],"border-color-x":["border-color-r","border-color-l"],"border-color-y":["border-color-t","border-color-b"],"scroll-m":["scroll-mx","scroll-my","scroll-ms","scroll-me","scroll-mt","scroll-mr","scroll-mb","scroll-ml"],"scroll-mx":["scroll-mr","scroll-ml"],"scroll-my":["scroll-mt","scroll-mb"],"scroll-p":["scroll-px","scroll-py","scroll-ps","scroll-pe","scroll-pt","scroll-pr","scroll-pb","scroll-pl"],"scroll-px":["scroll-pr","scroll-pl"],"scroll-py":["scroll-pt","scroll-pb"],touch:["touch-x","touch-y","touch-pz"],"touch-x":["touch"],"touch-y":["touch"],"touch-pz":["touch"]},conflictingClassGroupModifiers:{"font-size":["leading"]}}};var ol=_f(ap);function N(...e){return ol(Co(e))}var q={};Rf(q,{Children:()=>at,Component:()=>rp,Fragment:()=>Ke,Profiler:()=>np,PureComponent:()=>sp,StrictMode:()=>lp,Suspense:()=>ip,cloneElement:()=>ct,createContext:()=>dt,createElement:()=>I,createFactory:()=>up,createRef:()=>cp,default:()=>op,forwardRef:()=>x,isValidElement:()=>la,lazy:()=>dp,memo:()=>fp,startTransition:()=>pp,useCallback:()=>H,useContext:()=>ft,useDebugValue:()=>mp,useDeferredValue:()=>hp,useEffect:()=>D,useId:()=>xp,useImperativeHandle:()=>gp,useInsertionEffect:()=>vp,useLayoutEffect:()=>Nt,useMemo:()=>he,useReducer:()=>ia,useRef:()=>y,useState:()=>M,useSyncExternalStore:()=>wp,useTransition:()=>Cp,version:()=>Lp});var ne=window.React,op=ne,at=ne.Children,rp=ne.Component,Ke=ne.Fragment,np=ne.Profiler,sp=ne.PureComponent,lp=ne.StrictMode,ip=ne.Suspense,ct=ne.cloneElement,dt=ne.createContext,I=ne.createElement,up=ne.createFactory,cp=ne.createRef,x=ne.forwardRef,la=ne.isValidElement,dp=ne.lazy,fp=ne.memo,pp=ne.startTransition,H=ne.useCallback,ft=ne.useContext,mp=ne.useDebugValue,hp=ne.useDeferredValue,D=ne.useEffect,xp=ne.useId,gp=ne.useImperativeHandle,vp=ne.useInsertionEffect,Nt=ne.useLayoutEffect,he=ne.useMemo,ia=ne.useReducer,y=ne.useRef,M=ne.useState,wp=ne.useSyncExternalStore,Cp=ne.useTransition,Lp=ne.version;var rl=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),Lo=(...e)=>e.filter((t,a,o)=>!!t&&t.trim()!==""&&o.indexOf(t)===a).join(" ").trim();var nl={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};var sl=x(({color:e="currentColor",size:t=24,strokeWidth:a=2,absoluteStrokeWidth:o,className:r="",children:n,iconNode:s,...l},i)=>I("svg",{ref:i,...nl,width:t,height:t,stroke:e,strokeWidth:o?Number(a)*24/Number(t):a,className:Lo("lucide",r),...l},[...s.map(([u,d])=>I(u,d)),...Array.isArray(n)?n:[n]]));var re=(e,t)=>{let a=x(({className:o,...r},n)=>I(sl,{ref:n,iconNode:t,className:Lo(`lucide-${rl(e)}`,o),...r}));return a.displayName=`${e}`,a};var Ip=[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]],ua=re("Archive",Ip);var Sp=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Ue=re("Check",Sp);var bp=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],Ft=re("ChevronDown",bp);var Rp=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],ca=re("ChevronRight",Rp);var yp=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],da=re("ChevronUp",yp);var Pp=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],Ka=re("Circle",Pp);var Tp=[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]],fa=re("Download",Tp);var kp=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1",key:"1oajmo"}],["path",{d:"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",key:"mpwhp6"}]],pa=re("FileJson",kp);var Mp=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],pt=re("PanelLeftClose",Mp);var Ap=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m14 9 3 3-3 3",key:"8010ee"}]],mt=re("PanelLeftOpen",Ap);var Dp=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m8 9 3 3-3 3",key:"12hl5m"}]],ma=re("PanelRightClose",Dp);var Ep=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m10 15-3-3 3-3",key:"1pgupc"}]],ha=re("PanelRightOpen",Ep);var Op=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],xa=re("Plus",Op);var Np=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],Bt=re("RotateCcw",Np);var Fp=[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",key:"1c8476"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",key:"1ydtos"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7",key:"t51u73"}]],ga=re("Save",Fp);var Bp=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],va=re("Send",Bp);var _p=[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"17 8 12 3 7 8",key:"t8dd8p"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15",key:"widbto"}]],wa=re("Upload",_p);var Hp=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],_t=re("X",Hp);var ll=e=>typeof e=="boolean"?`${e}`:e===0?"0":e,il=Co,Io=(e,t)=>a=>{var o;if(t?.variants==null)return il(e,a?.class,a?.className);let{variants:r,defaultVariants:n}=t,s=Object.keys(r).map(u=>{let d=a?.[u],c=n?.[u];if(d===null)return null;let f=ll(d)||ll(c);return r[u][f]}),l=a&&Object.entries(a).reduce((u,d)=>{let[c,f]=d;return f===void 0||(u[c]=f),u},{}),i=t==null||(o=t.compoundVariants)===null||o===void 0?void 0:o.reduce((u,d)=>{let{class:c,className:f,...m}=d;return Object.entries(m).every(g=>{let[p,v]=g;return Array.isArray(v)?v.includes({...n,...l}[p]):{...n,...l}[p]===v})?[...u,c,f]:u},[]);return il(e,s,i,a?.class,a?.className)};var Up=Io("xps-badge",{variants:{variant:{default:"xps-badge--default",secondary:"xps-badge--secondary",success:"xps-badge--success",warning:"xps-badge--warning",destructive:"xps-badge--destructive"}},defaultVariants:{variant:"default"}});function Ht({className:e,variant:t,...a}){return I("span",{className:N(Up({variant:t}),e),...a})}function ul(e,t){if(typeof e=="function")return e(t);e!=null&&(e.current=t)}function ja(...e){return t=>{let a=!1,o=e.map(r=>{let n=ul(r,t);return!a&&typeof n=="function"&&(a=!0),n});if(a)return()=>{for(let r=0;r<o.length;r++){let n=o[r];typeof n=="function"?n():ul(e[r],null)}}}}function X(...e){return H(ja(...e),e)}function qe(e){let t=x((a,o)=>{let{children:r,...n}=a,s=null,l=!1,i=[];cl(r)&&typeof So=="function"&&(r=So(r._payload)),at.forEach(r,f=>{if(Wp(f)){l=!0;let m=f,g="child"in m.props?m.props.child:m.props.children;cl(g)&&typeof So=="function"&&(g=So(g._payload)),s=qp(m,g),i.push(s?.props?.children)}else i.push(f)}),s?s=ct(s,void 0,i):!l&&at.count(r)===1&&la(r)&&(s=r);let u=s?Vp(s):void 0,d=X(o,u);if(!s){if(r||r===0)throw new Error(l?jp(e):Kp(e));return r}let c=zp(n,s.props??{});return s.type!==Ke&&(c.ref=o?d:u),ct(s,c)});return t.displayName=`${e}.Slot`,t}var dl=qe("Slot"),fl=Symbol.for("radix.slottable");function pl(e){let t=a=>"child"in a?a.children(a.child):a.children;return t.displayName=`${e}.Slottable`,t.__radixId=fl,t}var qp=(e,t)=>{if("child"in e.props){let a=e.props.child;return la(a)?ct(a,void 0,e.props.children(a.props.children)):null}return la(t)?t:null};function zp(e,t){let a={...t};for(let o in t){let r=e[o],n=t[o];/^on[A-Z]/.test(o)?r&&n?a[o]=(...l)=>{let i=n(...l);return r(...l),i}:r&&(a[o]=r):o==="style"?a[o]={...r,...n}:o==="className"&&(a[o]=[r,n].filter(Boolean).join(" "))}return{...e,...a}}function Vp(e){let t=Object.getOwnPropertyDescriptor(e.props,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning;return a?e.ref:(t=Object.getOwnPropertyDescriptor(e,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning,a?e.props.ref:e.props.ref||e.ref)}function Wp(e){return la(e)&&typeof e.type=="function"&&"__radixId"in e.type&&e.type.__radixId===fl}var Gp=Symbol.for("react.lazy");function cl(e){return e!=null&&typeof e=="object"&&"$$typeof"in e&&e.$$typeof===Gp&&"_payload"in e&&Xp(e._payload)}function Xp(e){return typeof e=="object"&&e!==null&&"then"in e}var Kp=e=>`${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`,jp=e=>`${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`,So=q[" use ".trim().toString()];var $p=Io("xps-button",{variants:{variant:{default:"xps-button--default",secondary:"xps-button--secondary",outline:"xps-button--outline",ghost:"xps-button--ghost",destructive:"xps-button--destructive",destructiveOutline:"xps-button--destructive-outline"},size:{default:"",sm:"xps-button--sm",lg:"xps-button--lg",icon:"xps-button--icon"}},defaultVariants:{variant:"default",size:"default"}}),Te=x(({className:e,variant:t,size:a,asChild:o=!1,type:r,...n},s)=>{let l=o?dl:"button",i={className:N($p({variant:t,size:a}),e),ref:s,...n};return o||(i.type=r??"button"),I(l,i)});Te.displayName="Button";var Yp=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-card",e),...t}));Yp.displayName="Card";var Jp=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-card-header",e),...t}));Jp.displayName="CardHeader";var Zp=x(({className:e,...t},a)=>I("h3",{ref:a,className:N("xps-card-title",e),...t}));Zp.displayName="CardTitle";var Qp=x(({className:e,...t},a)=>I("p",{ref:a,className:N("xps-card-description",e),...t}));Qp.displayName="CardDescription";var em=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-card-content",e),...t}));em.displayName="CardContent";var ml=window.React,Ae=ml.Fragment;function h(e,t,a){return ml.createElement(e,a===void 0?t:{...t,key:a})}var Re=h;function hl(e,t){let a=dt(t);a.displayName=e+"Context";let o=n=>{let{children:s,...l}=n,i=he(()=>l,Object.values(l));return h(a.Provider,{value:i,children:s})};o.displayName=e+"Provider";function r(n){let s=ft(a);if(s)return s;if(t!==void 0)return t;throw new Error(`\`${n}\` must be used within \`${e}\``)}return[o,r]}function ue(e,t=[]){let a=[];function o(n,s){let l=dt(s);l.displayName=n+"Context";let i=a.length;a=[...a,s];let u=c=>{let{scope:f,children:m,...g}=c,p=f?.[e]?.[i]||l,v=he(()=>g,Object.values(g));return h(p.Provider,{value:v,children:m})};u.displayName=n+"Provider";function d(c,f){let m=f?.[e]?.[i]||l,g=ft(m);if(g)return g;if(s!==void 0)return s;throw new Error(`\`${c}\` must be used within \`${n}\``)}return[u,d]}let r=()=>{let n=a.map(s=>dt(s));return function(l){let i=l?.[e]||n;return he(()=>({[`__scope${e}`]:{...l,[e]:i}}),[l,i])}};return r.scopeName=e,[o,tm(r,...t)]}function tm(...e){let t=e[0];if(e.length===1)return t;let a=()=>{let o=e.map(r=>({useScope:r(),scopeName:r.scopeName}));return function(n){let s=o.reduce((l,{useScope:i,scopeName:u})=>{let c=i(n)[`__scope${u}`];return{...l,...c}},{});return he(()=>({[`__scope${t.scopeName}`]:s}),[s])}};return a.scopeName=t.scopeName,a}var RL=!!(typeof window<"u"&&window.document&&window.document.createElement);function A(e,t,{checkForDefaultPrevented:a=!0}={}){return function(r){if(e?.(r),a===!1||!r.defaultPrevented)return t?.(r)}}var ce=globalThis?.document?Nt:()=>{};var am=q[" useInsertionEffect ".trim().toString()]||ce;function be({prop:e,defaultProp:t,onChange:a=()=>{},caller:o}){let[r,n,s]=om({defaultProp:t,onChange:a}),l=e!==void 0,i=l?e:r;{let d=y(e!==void 0);D(()=>{let c=d.current;c!==l&&console.warn(`${o} is changing from ${c?"controlled":"uncontrolled"} to ${l?"controlled":"uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`),d.current=l},[l,o])}let u=H(d=>{if(l){let c=rm(d)?d(e):d;c!==e&&s.current?.(c)}else n(d)},[l,e,n,s]);return[i,u]}function om({defaultProp:e,onChange:t}){let[a,o]=M(e),r=y(a),n=y(t);return am(()=>{n.current=t},[t]),D(()=>{r.current!==a&&(n.current?.(a),r.current=a)},[a,r]),[a,o,n]}function rm(e){return typeof e=="function"}function St(e){let t=y({value:e,previous:e});return he(()=>(t.current.value!==e&&(t.current.previous=t.current.value,t.current.value=e),t.current.previous),[e])}function bt(e){let[t,a]=M(void 0);return ce(()=>{if(e){a({width:e.offsetWidth,height:e.offsetHeight});let o=new ResizeObserver(r=>{if(!Array.isArray(r)||!r.length)return;let n=r[0],s,l;if("borderBoxSize"in n){let i=n.borderBoxSize,u=Array.isArray(i)?i[0]:i;s=u.inlineSize,l=u.blockSize}else s=e.offsetWidth,l=e.offsetHeight;a({width:s,height:l})});return o.observe(e,{box:"border-box"}),()=>o.unobserve(e)}else a(void 0)},[e]),t}function nm(e,t){return ia((a,o)=>t[a][o]??a,e)}var xe=e=>{let{present:t,children:a}=e,o=sm(t),r=typeof a=="function"?a({present:o.isPresent}):at.only(a),n=lm(o.ref,im(r));return typeof a=="function"||o.isPresent?ct(r,{ref:n}):null};xe.displayName="Presence";function sm(e){let[t,a]=M(),o=y(null),r=y(e),n=y("none"),s=e?"mounted":"unmounted",[l,i]=nm(s,{mounted:{UNMOUNT:"unmounted",ANIMATION_OUT:"unmountSuspended"},unmountSuspended:{MOUNT:"mounted",ANIMATION_END:"unmounted"},unmounted:{MOUNT:"mounted"}});return D(()=>{let u=bo(o.current);n.current=l==="mounted"?u:"none"},[l]),ce(()=>{let u=o.current,d=r.current;if(d!==e){let f=n.current,m=bo(u);e?i("MOUNT"):m==="none"||u?.display==="none"?i("UNMOUNT"):i(d&&f!==m?"ANIMATION_OUT":"UNMOUNT"),r.current=e}},[e,i]),ce(()=>{if(t){let u,d=t.ownerDocument.defaultView??window,c=m=>{let p=bo(o.current).includes(CSS.escape(m.animationName));if(m.target===t&&p&&(i("ANIMATION_END"),!r.current)){let v=t.style.animationFillMode;t.style.animationFillMode="forwards",u=d.setTimeout(()=>{t.style.animationFillMode==="forwards"&&(t.style.animationFillMode=v)})}},f=m=>{m.target===t&&(n.current=bo(o.current))};return t.addEventListener("animationstart",f),t.addEventListener("animationcancel",c),t.addEventListener("animationend",c),()=>{d.clearTimeout(u),t.removeEventListener("animationstart",f),t.removeEventListener("animationcancel",c),t.removeEventListener("animationend",c)}}else i("ANIMATION_END")},[t,i]),{isPresent:["mounted","unmountSuspended"].includes(l),ref:H(u=>{o.current=u?getComputedStyle(u):null,a(u)},[])}}function xl(e,t){if(typeof e=="function")return e(t);e!=null&&(e.current=t)}function lm(...e){let t=y(e);return t.current=e,H(a=>{let o=t.current,r=!1,n=o.map(s=>{let l=xl(s,a);return!r&&typeof l=="function"&&(r=!0),l});if(r)return()=>{for(let s=0;s<n.length;s++){let l=n[s];typeof l=="function"?l():xl(o[s],null)}}},[])}function bo(e){return e?.animationName||"none"}function im(e){let t=Object.getOwnPropertyDescriptor(e.props,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning;return a?e.ref:(t=Object.getOwnPropertyDescriptor(e,"ref")?.get,a=t&&"isReactWarning"in t&&t.isReactWarning,a?e.props.ref:e.props.ref||e.ref)}var Rt=window.ReactDOM;var $a=Rt.createPortal,Ro=Rt.flushSync,NL=Rt.findDOMNode,FL=Rt.hydrate,BL=Rt.render,_L=Rt.unstable_batchedUpdates,HL=Rt.unmountComponentAtNode,UL=Rt.version;var um=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","select","span","svg","ul"],B=um.reduce((e,t)=>{let a=qe(`Primitive.${t}`),o=x((r,n)=>{let{asChild:s,...l}=r,i=s?a:t;return typeof window<"u"&&(window[Symbol.for("radix-ui")]=!0),h(i,{...l,ref:n})});return o.displayName=`Primitive.${t}`,{...e,[t]:o}},{});function Po(e,t){e&&Ro(()=>e.dispatchEvent(t))}var To="Checkbox",[cm,QL]=ue(To),[dm,Wr]=cm(To);function fm(e){let{__scopeCheckbox:t,checked:a,children:o,defaultChecked:r,disabled:n,form:s,name:l,onCheckedChange:i,required:u,value:d="on",internal_do_not_use_render:c}=e,[f,m]=be({prop:a,defaultProp:r??!1,onChange:i,caller:To}),[g,p]=M(null),[v,w]=M(null),C=y(!1),L=g?!!s||!!g.closest("form"):!0,S={checked:f,disabled:n,setChecked:m,control:g,setControl:p,name:l,form:s,value:d,hasConsumerStoppedPropagationRef:C,required:u,defaultChecked:yt(r)?!1:r,isFormControl:L,bubbleInput:v,setBubbleInput:w};return h(dm,{scope:t,...S,children:pm(c)?c(S):o})}var gl="CheckboxTrigger",vl=x(({__scopeCheckbox:e,onKeyDown:t,onClick:a,...o},r)=>{let{control:n,value:s,disabled:l,checked:i,required:u,setControl:d,setChecked:c,hasConsumerStoppedPropagationRef:f,isFormControl:m,bubbleInput:g}=Wr(gl,e),p=X(r,d),v=y(i);return D(()=>{let w=n?.form;if(w){let C=()=>c(v.current);return w.addEventListener("reset",C),()=>w.removeEventListener("reset",C)}},[n,c]),h(B.button,{type:"button",role:"checkbox","aria-checked":yt(i)?"mixed":i,"aria-required":u,"data-state":Il(i),"data-disabled":l?"":void 0,disabled:l,value:s,...o,ref:p,onKeyDown:A(t,w=>{w.key==="Enter"&&w.preventDefault()}),onClick:A(a,w=>{c(C=>yt(C)?!0:!C),g&&m&&(f.current=w.isPropagationStopped(),f.current||w.stopPropagation())})})});vl.displayName=gl;var ko=x((e,t)=>{let{__scopeCheckbox:a,name:o,checked:r,defaultChecked:n,required:s,disabled:l,value:i,onCheckedChange:u,form:d,...c}=e;return h(fm,{__scopeCheckbox:a,checked:r,defaultChecked:n,disabled:l,required:s,onCheckedChange:u,name:o,form:d,value:i,internal_do_not_use_render:({isFormControl:f})=>Re(Ae,{children:[h(vl,{...c,ref:t,__scopeCheckbox:a}),f&&h(Ll,{__scopeCheckbox:a})]})})});ko.displayName=To;var wl="CheckboxIndicator",Gr=x((e,t)=>{let{__scopeCheckbox:a,forceMount:o,...r}=e,n=Wr(wl,a);return h(xe,{present:o||yt(n.checked)||n.checked===!0,children:h(B.span,{"data-state":Il(n.checked),"data-disabled":n.disabled?"":void 0,...r,ref:t,style:{pointerEvents:"none",...e.style}})})});Gr.displayName=wl;var Cl="CheckboxBubbleInput",Ll=x(({__scopeCheckbox:e,...t},a)=>{let{control:o,hasConsumerStoppedPropagationRef:r,checked:n,defaultChecked:s,required:l,disabled:i,name:u,value:d,form:c,bubbleInput:f,setBubbleInput:m}=Wr(Cl,e),g=X(a,m),p=St(n),v=bt(o);D(()=>{let C=f;if(!C)return;let L=window.HTMLInputElement.prototype,P=Object.getOwnPropertyDescriptor(L,"checked").set,E=!r.current;if(p!==n&&P){let T=new Event("click",{bubbles:E});C.indeterminate=yt(n),P.call(C,yt(n)?!1:n),C.dispatchEvent(T)}},[f,p,n,r]);let w=y(yt(n)?!1:n);return h(B.input,{type:"checkbox","aria-hidden":!0,defaultChecked:s??w.current,required:l,disabled:i,name:u,value:d,form:c,...t,tabIndex:-1,ref:g,style:{...t.style,...v,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});Ll.displayName=Cl;function pm(e){return typeof e=="function"}function yt(e){return e==="indeterminate"}function Il(e){return yt(e)?"indeterminate":e?"checked":"unchecked"}var hm=x(({className:e,...t},a)=>I(ko,{ref:a,className:N("xps-checkbox",e),...t},I(Gr,{className:"xps-checkbox-indicator"},I(Ue,{className:"xps-icon"}))));hm.displayName=ko.displayName;var xm=q[" useId ".trim().toString()]||(()=>{}),gm=0;function Le(e){let[t,a]=M(xm());return ce(()=>{e||a(o=>o??String(gm++))},[e]),e||(t?`radix-${t}`:"")}function de(e){let t=y(e);return D(()=>{t.current=e}),he(()=>((...a)=>t.current?.(...a)),[])}function Sl(e,t=globalThis?.document){let a=de(e);D(()=>{let o=r=>{r.key==="Escape"&&a(r)};return t.addEventListener("keydown",o,{capture:!0}),()=>t.removeEventListener("keydown",o,{capture:!0})},[a,t])}var vm="DismissableLayer",Xr="dismissableLayer.update",wm="dismissableLayer.pointerDownOutside",Cm="dismissableLayer.focusOutside",bl,yl=dt({layers:new Set,layersWithOutsidePointerEventsDisabled:new Set,branches:new Set}),ht=x((e,t)=>{let{disableOutsidePointerEvents:a=!1,onEscapeKeyDown:o,onPointerDownOutside:r,onFocusOutside:n,onInteractOutside:s,onDismiss:l,...i}=e,u=ft(yl),[d,c]=M(null),f=d?.ownerDocument??globalThis?.document,[,m]=M({}),g=X(t,T=>c(T)),p=Array.from(u.layers),[v]=[...u.layersWithOutsidePointerEventsDisabled].slice(-1),w=p.indexOf(v),C=d?p.indexOf(d):-1,L=u.layersWithOutsidePointerEventsDisabled.size>0,S=C>=w,P=Sm(T=>{let _=T.target,z=[...u.branches].some(V=>V.contains(_));!S||z||(r?.(T),s?.(T),T.defaultPrevented||l?.())},f),E=bm(T=>{let _=T.target;[...u.branches].some(V=>V.contains(_))||(n?.(T),s?.(T),T.defaultPrevented||l?.())},f);return Sl(T=>{C===u.layers.size-1&&(o?.(T),!T.defaultPrevented&&l&&(T.preventDefault(),l()))},f),D(()=>{if(d)return a&&(u.layersWithOutsidePointerEventsDisabled.size===0&&(bl=f.body.style.pointerEvents,f.body.style.pointerEvents="none"),u.layersWithOutsidePointerEventsDisabled.add(d)),u.layers.add(d),Rl(),()=>{a&&(u.layersWithOutsidePointerEventsDisabled.delete(d),u.layersWithOutsidePointerEventsDisabled.size===0&&(f.body.style.pointerEvents=bl))}},[d,f,a,u]),D(()=>()=>{d&&(u.layers.delete(d),u.layersWithOutsidePointerEventsDisabled.delete(d),Rl())},[d,u]),D(()=>{let T=()=>m({});return document.addEventListener(Xr,T),()=>document.removeEventListener(Xr,T)},[]),h(B.div,{...i,ref:g,style:{pointerEvents:L?S?"auto":"none":void 0,...e.style},onFocusCapture:A(e.onFocusCapture,E.onFocusCapture),onBlurCapture:A(e.onBlurCapture,E.onBlurCapture),onPointerDownCapture:A(e.onPointerDownCapture,P.onPointerDownCapture)})});ht.displayName=vm;var Lm="DismissableLayerBranch",Im=x((e,t)=>{let a=ft(yl),o=y(null),r=X(t,o);return D(()=>{let n=o.current;if(n)return a.branches.add(n),()=>{a.branches.delete(n)}},[a.branches]),h(B.div,{...e,ref:r})});Im.displayName=Lm;function Sm(e,t=globalThis?.document){let a=de(e),o=y(!1),r=y(()=>{});return D(()=>{let n=l=>{if(l.target&&!o.current){let u=function(){Pl(wm,a,d,{discrete:!0})};var i=u;let d={originalEvent:l};l.pointerType==="touch"?(t.removeEventListener("click",r.current),r.current=u,t.addEventListener("click",r.current,{once:!0})):u()}else t.removeEventListener("click",r.current);o.current=!1},s=window.setTimeout(()=>{t.addEventListener("pointerdown",n)},0);return()=>{window.clearTimeout(s),t.removeEventListener("pointerdown",n),t.removeEventListener("click",r.current)}},[t,a]),{onPointerDownCapture:()=>o.current=!0}}function bm(e,t=globalThis?.document){let a=de(e),o=y(!1);return D(()=>{let r=n=>{n.target&&!o.current&&Pl(Cm,a,{originalEvent:n},{discrete:!1})};return t.addEventListener("focusin",r),()=>t.removeEventListener("focusin",r)},[t,a]),{onFocusCapture:()=>o.current=!0,onBlurCapture:()=>o.current=!1}}function Rl(){let e=new CustomEvent(Xr);document.dispatchEvent(e)}function Pl(e,t,a,{discrete:o}){let r=a.originalEvent.target,n=new CustomEvent(e,{bubbles:!1,cancelable:!0,detail:a});t&&r.addEventListener(e,t,{once:!0}),o?Po(r,n):r.dispatchEvent(n)}var Kr="focusScope.autoFocusOnMount",jr="focusScope.autoFocusOnUnmount",Tl={bubbles:!1,cancelable:!0},Rm="FocusScope",Ut=x((e,t)=>{let{loop:a=!1,trapped:o=!1,onMountAutoFocus:r,onUnmountAutoFocus:n,...s}=e,[l,i]=M(null),u=de(r),d=de(n),c=y(null),f=X(t,p=>i(p)),m=y({paused:!1,pause(){this.paused=!0},resume(){this.paused=!1}}).current;D(()=>{if(o){let C=function(E){if(m.paused||!l)return;let T=E.target;l.contains(T)?c.current=T:Pt(c.current,{select:!0})},L=function(E){if(m.paused||!l)return;let T=E.relatedTarget;T!==null&&(l.contains(T)||Pt(c.current,{select:!0}))},S=function(E){if(document.activeElement===document.body)for(let _ of E)_.removedNodes.length>0&&Pt(l)};var p=C,v=L,w=S;document.addEventListener("focusin",C),document.addEventListener("focusout",L);let P=new MutationObserver(S);return l&&P.observe(l,{childList:!0,subtree:!0}),()=>{document.removeEventListener("focusin",C),document.removeEventListener("focusout",L),P.disconnect()}}},[o,l,m.paused]),D(()=>{if(l){Ml.add(m);let p=document.activeElement;if(!l.contains(p)){let w=new CustomEvent(Kr,Tl);l.addEventListener(Kr,u),l.dispatchEvent(w),w.defaultPrevented||(ym(Am(Dl(l)),{select:!0}),document.activeElement===p&&Pt(l))}return()=>{l.removeEventListener(Kr,u),setTimeout(()=>{let w=new CustomEvent(jr,Tl);l.addEventListener(jr,d),l.dispatchEvent(w),w.defaultPrevented||Pt(p??document.body,{select:!0}),l.removeEventListener(jr,d),Ml.remove(m)},0)}}},[l,u,d,m]);let g=H(p=>{if(!a&&!o||m.paused)return;let v=p.key==="Tab"&&!p.altKey&&!p.ctrlKey&&!p.metaKey,w=document.activeElement;if(v&&w){let C=p.currentTarget,[L,S]=Pm(C);L&&S?!p.shiftKey&&w===S?(p.preventDefault(),a&&Pt(L,{select:!0})):p.shiftKey&&w===L&&(p.preventDefault(),a&&Pt(S,{select:!0})):w===C&&p.preventDefault()}},[a,o,m.paused]);return h(B.div,{tabIndex:-1,...s,ref:f,onKeyDown:g})});Ut.displayName=Rm;function ym(e,{select:t=!1}={}){let a=document.activeElement;for(let o of e)if(Pt(o,{select:t}),document.activeElement!==a)return}function Pm(e){let t=Dl(e),a=kl(t,e),o=kl(t.reverse(),e);return[a,o]}function Dl(e){let t=[],a=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:o=>{let r=o.tagName==="INPUT"&&o.type==="hidden";return o.disabled||o.hidden||r?NodeFilter.FILTER_SKIP:o.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}});for(;a.nextNode();)t.push(a.currentNode);return t}function kl(e,t){for(let a of e)if(!Tm(a,{upTo:t}))return a}function Tm(e,{upTo:t}){if(getComputedStyle(e).visibility==="hidden")return!0;for(;e;){if(t!==void 0&&e===t)return!1;if(getComputedStyle(e).display==="none")return!0;e=e.parentElement}return!1}function km(e){return e instanceof HTMLInputElement&&"select"in e}function Pt(e,{select:t=!1}={}){if(e&&e.focus){let a=document.activeElement;e.focus({preventScroll:!0}),e!==a&&km(e)&&t&&e.select()}}var Ml=Mm();function Mm(){let e=[];return{add(t){let a=e[0];t!==a&&a?.pause(),e=Al(e,t),e.unshift(t)},remove(t){e=Al(e,t),e[0]?.resume()}}}function Al(e,t){let a=[...e],o=a.indexOf(t);return o!==-1&&a.splice(o,1),a}function Am(e){return e.filter(t=>t.tagName!=="A")}var Dm="Portal",xt=x((e,t)=>{let{container:a,...o}=e,[r,n]=M(!1);ce(()=>n(!0),[]);let s=a||r&&globalThis?.document?.body;return s?$a(h(B.div,{...o,ref:t}),s):null});xt.displayName=Dm;var Mo=0,Ca=null;function La(){D(()=>{Ca||(Ca={start:El(),end:El()});let{start:e,end:t}=Ca;return document.body.firstElementChild!==e&&document.body.insertAdjacentElement("afterbegin",e),document.body.lastElementChild!==t&&document.body.insertAdjacentElement("beforeend",t),Mo++,()=>{Mo===1&&(Ca?.start.remove(),Ca?.end.remove(),Ca=null),Mo=Math.max(0,Mo-1)}},[])}function El(){let e=document.createElement("span");return e.setAttribute("data-radix-focus-guard",""),e.tabIndex=0,e.style.outline="none",e.style.opacity="0",e.style.position="fixed",e.style.pointerEvents="none",e}var Fe=function(){return Fe=Object.assign||function(t){for(var a,o=1,r=arguments.length;o<r;o++){a=arguments[o];for(var n in a)Object.prototype.hasOwnProperty.call(a,n)&&(t[n]=a[n])}return t},Fe.apply(this,arguments)};function Ao(e,t){var a={};for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&t.indexOf(o)<0&&(a[o]=e[o]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var r=0,o=Object.getOwnPropertySymbols(e);r<o.length;r++)t.indexOf(o[r])<0&&Object.prototype.propertyIsEnumerable.call(e,o[r])&&(a[o[r]]=e[o[r]]);return a}function Ol(e,t,a){if(a||arguments.length===2)for(var o=0,r=t.length,n;o<r;o++)(n||!(o in t))&&(n||(n=Array.prototype.slice.call(t,0,o)),n[o]=t[o]);return e.concat(n||Array.prototype.slice.call(t))}var qt="right-scroll-bar-position",zt="width-before-scroll-bar",$r="with-scroll-bars-hidden",Yr="--removed-body-scroll-bar-size";function Do(e,t){return typeof e=="function"?e(t):e&&(e.current=t),e}function Nl(e,t){var a=M(function(){return{value:e,callback:t,facade:{get current(){return a.value},set current(o){var r=a.value;r!==o&&(a.value=o,a.callback(o,r))}}}})[0];return a.callback=t,a.facade}var Em=typeof window<"u"?Nt:D,Fl=new WeakMap;function Jr(e,t){var a=Nl(t||null,function(o){return e.forEach(function(r){return Do(r,o)})});return Em(function(){var o=Fl.get(a);if(o){var r=new Set(o),n=new Set(e),s=a.current;r.forEach(function(l){n.has(l)||Do(l,null)}),n.forEach(function(l){r.has(l)||Do(l,s)})}Fl.set(a,e)},[e]),a}function Om(e){return e}function Nm(e,t){t===void 0&&(t=Om);var a=[],o=!1,r={read:function(){if(o)throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");return a.length?a[a.length-1]:e},useMedium:function(n){var s=t(n,o);return a.push(s),function(){a=a.filter(function(l){return l!==s})}},assignSyncMedium:function(n){for(o=!0;a.length;){var s=a;a=[],s.forEach(n)}a={push:function(l){return n(l)},filter:function(){return a}}},assignMedium:function(n){o=!0;var s=[];if(a.length){var l=a;a=[],l.forEach(n),s=a}var i=function(){var d=s;s=[],d.forEach(n)},u=function(){return Promise.resolve().then(i)};u(),a={push:function(d){s.push(d),u()},filter:function(d){return s=s.filter(d),a}}}};return r}function Zr(e){e===void 0&&(e={});var t=Nm(null);return t.options=Fe({async:!0,ssr:!1},e),t}var Bl=function(e){var t=e.sideCar,a=Ao(e,["sideCar"]);if(!t)throw new Error("Sidecar: please provide `sideCar` property to import the right car");var o=t.read();if(!o)throw new Error("Sidecar medium not found");return I(o,Fe({},a))};Bl.isSideCarExport=!0;function Qr(e,t){return e.useMedium(t),Bl}var Eo=Zr();var en=function(){},Ya=x(function(e,t){var a=y(null),o=M({onScrollCapture:en,onWheelCapture:en,onTouchMoveCapture:en}),r=o[0],n=o[1],s=e.forwardProps,l=e.children,i=e.className,u=e.removeScrollBar,d=e.enabled,c=e.shards,f=e.sideCar,m=e.noRelative,g=e.noIsolation,p=e.inert,v=e.allowPinchZoom,w=e.as,C=w===void 0?"div":w,L=e.gapMode,S=Ao(e,["forwardProps","children","className","removeScrollBar","enabled","shards","sideCar","noRelative","noIsolation","inert","allowPinchZoom","as","gapMode"]),P=f,E=Jr([a,t]),T=Fe(Fe({},S),r);return I(Ke,null,d&&I(P,{sideCar:Eo,removeScrollBar:u,shards:c,noRelative:m,noIsolation:g,inert:p,setCallbacks:n,allowPinchZoom:!!v,lockRef:a,gapMode:L}),s?ct(at.only(l),Fe(Fe({},T),{ref:E})):I(C,Fe({},T,{className:i,ref:E}),l))});Ya.defaultProps={enabled:!0,removeScrollBar:!0,inert:!1};Ya.classNames={fullWidth:zt,zeroRight:qt};var _l;var Hl=function(){if(_l)return _l;if(typeof __webpack_nonce__<"u")return __webpack_nonce__};function Fm(){if(!document)return null;var e=document.createElement("style");e.type="text/css";var t=Hl();return t&&e.setAttribute("nonce",t),e}function Bm(e,t){e.styleSheet?e.styleSheet.cssText=t:e.appendChild(document.createTextNode(t))}function _m(e){var t=document.head||document.getElementsByTagName("head")[0];t.appendChild(e)}var tn=function(){var e=0,t=null;return{add:function(a){e==0&&(t=Fm())&&(Bm(t,a),_m(t)),e++},remove:function(){e--,!e&&t&&(t.parentNode&&t.parentNode.removeChild(t),t=null)}}};var an=function(){var e=tn();return function(t,a){D(function(){return e.add(t),function(){e.remove()}},[t&&a])}};var Ja=function(){var e=an(),t=function(a){var o=a.styles,r=a.dynamic;return e(o,r),null};return t};var Hm={left:0,top:0,right:0,gap:0},on=function(e){return parseInt(e||"",10)||0},Um=function(e){var t=window.getComputedStyle(document.body),a=t[e==="padding"?"paddingLeft":"marginLeft"],o=t[e==="padding"?"paddingTop":"marginTop"],r=t[e==="padding"?"paddingRight":"marginRight"];return[on(a),on(o),on(r)]},rn=function(e){if(e===void 0&&(e="margin"),typeof window>"u")return Hm;var t=Um(e),a=document.documentElement.clientWidth,o=window.innerWidth;return{left:t[0],top:t[1],right:t[2],gap:Math.max(0,o-a+t[2]-t[0])}};var qm=Ja(),Ia="data-scroll-locked",zm=function(e,t,a,o){var r=e.left,n=e.top,s=e.right,l=e.gap;return a===void 0&&(a="margin"),`
  .`.concat($r,` {
   overflow: hidden `).concat(o,`;
   padding-right: `).concat(l,"px ").concat(o,`;
  }
  body[`).concat(Ia,`] {
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
  
  .`).concat(qt,` {
    right: `).concat(l,"px ").concat(o,`;
  }
  
  .`).concat(zt,` {
    margin-right: `).concat(l,"px ").concat(o,`;
  }
  
  .`).concat(qt," .").concat(qt,` {
    right: 0 `).concat(o,`;
  }
  
  .`).concat(zt," .").concat(zt,` {
    margin-right: 0 `).concat(o,`;
  }
  
  body[`).concat(Ia,`] {
    `).concat(Yr,": ").concat(l,`px;
  }
`)},Ul=function(){var e=parseInt(document.body.getAttribute(Ia)||"0",10);return isFinite(e)?e:0},Vm=function(){D(function(){return document.body.setAttribute(Ia,(Ul()+1).toString()),function(){var e=Ul()-1;e<=0?document.body.removeAttribute(Ia):document.body.setAttribute(Ia,e.toString())}},[])},nn=function(e){var t=e.noRelative,a=e.noImportant,o=e.gapMode,r=o===void 0?"margin":o;Vm();var n=he(function(){return rn(r)},[r]);return I(qm,{styles:zm(n,!t,r,a?"":"!important")})};var sn=!1;if(typeof window<"u")try{Za=Object.defineProperty({},"passive",{get:function(){return sn=!0,!0}}),window.addEventListener("test",Za,Za),window.removeEventListener("test",Za,Za)}catch{sn=!1}var Za,Vt=sn?{passive:!1}:!1;var Wm=function(e){return e.tagName==="TEXTAREA"},ql=function(e,t){if(!(e instanceof Element))return!1;var a=window.getComputedStyle(e);return a[t]!=="hidden"&&!(a.overflowY===a.overflowX&&!Wm(e)&&a[t]==="visible")},Gm=function(e){return ql(e,"overflowY")},Xm=function(e){return ql(e,"overflowX")},ln=function(e,t){var a=t.ownerDocument,o=t;do{typeof ShadowRoot<"u"&&o instanceof ShadowRoot&&(o=o.host);var r=zl(e,o);if(r){var n=Vl(e,o),s=n[1],l=n[2];if(s>l)return!0}o=o.parentNode}while(o&&o!==a.body);return!1},Km=function(e){var t=e.scrollTop,a=e.scrollHeight,o=e.clientHeight;return[t,a,o]},jm=function(e){var t=e.scrollLeft,a=e.scrollWidth,o=e.clientWidth;return[t,a,o]},zl=function(e,t){return e==="v"?Gm(t):Xm(t)},Vl=function(e,t){return e==="v"?Km(t):jm(t)},$m=function(e,t){return e==="h"&&t==="rtl"?-1:1},Wl=function(e,t,a,o,r){var n=$m(e,window.getComputedStyle(t).direction),s=n*o,l=a.target,i=t.contains(l),u=!1,d=s>0,c=0,f=0;do{if(!l)break;var m=Vl(e,l),g=m[0],p=m[1],v=m[2],w=p-v-n*g;(g||w)&&zl(e,l)&&(c+=w,f+=g);var C=l.parentNode;l=C&&C.nodeType===Node.DOCUMENT_FRAGMENT_NODE?C.host:C}while(!i&&l!==document.body||i&&(t.contains(l)||t===l));return(d&&(r&&Math.abs(c)<1||!r&&s>c)||!d&&(r&&Math.abs(f)<1||!r&&-s>f))&&(u=!0),u};var Oo=function(e){return"changedTouches"in e?[e.changedTouches[0].clientX,e.changedTouches[0].clientY]:[0,0]},Gl=function(e){return[e.deltaX,e.deltaY]},Xl=function(e){return e&&"current"in e?e.current:e},Ym=function(e,t){return e[0]===t[0]&&e[1]===t[1]},Jm=function(e){return`
  .block-interactivity-`.concat(e,` {pointer-events: none;}
  .allow-interactivity-`).concat(e,` {pointer-events: all;}
`)},Zm=0,Sa=[];function Kl(e){var t=y([]),a=y([0,0]),o=y(),r=M(Zm++)[0],n=M(Ja)[0],s=y(e);D(function(){s.current=e},[e]),D(function(){if(e.inert){document.body.classList.add("block-interactivity-".concat(r));var p=Ol([e.lockRef.current],(e.shards||[]).map(Xl),!0).filter(Boolean);return p.forEach(function(v){return v.classList.add("allow-interactivity-".concat(r))}),function(){document.body.classList.remove("block-interactivity-".concat(r)),p.forEach(function(v){return v.classList.remove("allow-interactivity-".concat(r))})}}},[e.inert,e.lockRef.current,e.shards]);var l=H(function(p,v){if("touches"in p&&p.touches.length===2||p.type==="wheel"&&p.ctrlKey)return!s.current.allowPinchZoom;var w=Oo(p),C=a.current,L="deltaX"in p?p.deltaX:C[0]-w[0],S="deltaY"in p?p.deltaY:C[1]-w[1],P,E=p.target,T=Math.abs(L)>Math.abs(S)?"h":"v";if("touches"in p&&T==="h"&&E.type==="range")return!1;var _=window.getSelection(),z=_&&_.anchorNode,V=z?z===E||z.contains(E):!1;if(V)return!1;var K=ln(T,E);if(!K)return!0;if(K?P=T:(P=T==="v"?"h":"v",K=ln(T,E)),!K)return!1;if(!o.current&&"changedTouches"in p&&(L||S)&&(o.current=P),!P)return!0;var F=o.current||P;return Wl(F,v,p,F==="h"?L:S,!0)},[]),i=H(function(p){var v=p;if(!(!Sa.length||Sa[Sa.length-1]!==n)){var w="deltaY"in v?Gl(v):Oo(v),C=t.current.filter(function(P){return P.name===v.type&&(P.target===v.target||v.target===P.shadowParent)&&Ym(P.delta,w)})[0];if(C&&C.should){v.cancelable&&v.preventDefault();return}if(!C){var L=(s.current.shards||[]).map(Xl).filter(Boolean).filter(function(P){return P.contains(v.target)}),S=L.length>0?l(v,L[0]):!s.current.noIsolation;S&&v.cancelable&&v.preventDefault()}}},[]),u=H(function(p,v,w,C){var L={name:p,delta:v,target:w,should:C,shadowParent:Qm(w)};t.current.push(L),setTimeout(function(){t.current=t.current.filter(function(S){return S!==L})},1)},[]),d=H(function(p){a.current=Oo(p),o.current=void 0},[]),c=H(function(p){u(p.type,Gl(p),p.target,l(p,e.lockRef.current))},[]),f=H(function(p){u(p.type,Oo(p),p.target,l(p,e.lockRef.current))},[]);D(function(){return Sa.push(n),e.setCallbacks({onScrollCapture:c,onWheelCapture:c,onTouchMoveCapture:f}),document.addEventListener("wheel",i,Vt),document.addEventListener("touchmove",i,Vt),document.addEventListener("touchstart",d,Vt),function(){Sa=Sa.filter(function(p){return p!==n}),document.removeEventListener("wheel",i,Vt),document.removeEventListener("touchmove",i,Vt),document.removeEventListener("touchstart",d,Vt)}},[]);var m=e.removeScrollBar,g=e.inert;return I(Ke,null,g?I(n,{styles:Jm(r)}):null,m?I(nn,{noRelative:e.noRelative,gapMode:e.gapMode}):null)}function Qm(e){for(var t=null;e!==null;)e instanceof ShadowRoot&&(t=e.host,e=e.host),e=e.parentNode;return t}var jl=Qr(Eo,Kl);var $l=x(function(e,t){return I(Ya,Fe({},e,{ref:t,sideCar:jl}))});$l.classNames=Ya.classNames;var Wt=$l;var eh=function(e){if(typeof document>"u")return null;var t=Array.isArray(e)?e[0]:e;return t.ownerDocument.body},ba=new WeakMap,No=new WeakMap,Fo={},un=0,Yl=function(e){return e&&(e.host||Yl(e.parentNode))},th=function(e,t){return t.map(function(a){if(e.contains(a))return a;var o=Yl(a);return o&&e.contains(o)?o:(console.error("aria-hidden",a,"in not contained inside",e,". Doing nothing"),null)}).filter(function(a){return!!a})},ah=function(e,t,a,o){var r=th(t,Array.isArray(e)?e:[e]);Fo[a]||(Fo[a]=new WeakMap);var n=Fo[a],s=[],l=new Set,i=new Set(r),u=function(c){!c||l.has(c)||(l.add(c),u(c.parentNode))};r.forEach(u);var d=function(c){!c||i.has(c)||Array.prototype.forEach.call(c.children,function(f){if(l.has(f))d(f);else try{var m=f.getAttribute(o),g=m!==null&&m!=="false",p=(ba.get(f)||0)+1,v=(n.get(f)||0)+1;ba.set(f,p),n.set(f,v),s.push(f),p===1&&g&&No.set(f,!0),v===1&&f.setAttribute(a,"true"),g||f.setAttribute(o,"true")}catch(w){console.error("aria-hidden: cannot operate on ",f,w)}})};return d(t),l.clear(),un++,function(){s.forEach(function(c){var f=ba.get(c)-1,m=n.get(c)-1;ba.set(c,f),n.set(c,m),f||(No.has(c)||c.removeAttribute(o),No.delete(c)),m||c.removeAttribute(a)}),un--,un||(ba=new WeakMap,ba=new WeakMap,No=new WeakMap,Fo={})}},Ra=function(e,t,a){a===void 0&&(a="data-aria-hidden");var o=Array.from(Array.isArray(e)?e:[e]),r=t||eh(e);return r?(o.push.apply(o,Array.from(r.querySelectorAll("[aria-live], script"))),ah(o,r,a,"aria-hidden")):function(){return null}};var _o="Dialog",[Jl,YS]=ue(_o),[oh,je]=Jl(_o),rh=e=>{let{__scopeDialog:t,children:a,open:o,defaultOpen:r,onOpenChange:n,modal:s=!0}=e,l=y(null),i=y(null),[u,d]=be({prop:o,defaultProp:r??!1,onChange:n,caller:_o});return h(oh,{scope:t,triggerRef:l,contentRef:i,contentId:Le(),titleId:Le(),descriptionId:Le(),open:u,onOpenChange:d,onOpenToggle:H(()=>d(c=>!c),[d]),modal:s,children:a})};rh.displayName=_o;var Zl="DialogTrigger",nh=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=je(Zl,a),n=X(t,r.triggerRef);return h(B.button,{type:"button","aria-haspopup":"dialog","aria-expanded":r.open,"aria-controls":r.open?r.contentId:void 0,"data-state":fn(r.open),...o,ref:n,onClick:A(e.onClick,r.onOpenToggle)})});nh.displayName=Zl;var cn="DialogPortal",[sh,Ql]=Jl(cn,{forceMount:void 0}),ei=e=>{let{__scopeDialog:t,forceMount:a,children:o,container:r}=e,n=je(cn,t);return h(sh,{scope:t,forceMount:a,children:at.map(o,s=>h(xe,{present:a||n.open,children:h(xt,{asChild:!0,container:r,children:s})}))})};ei.displayName=cn;var Bo="DialogOverlay",ti=x((e,t)=>{let a=Ql(Bo,e.__scopeDialog),{forceMount:o=a.forceMount,...r}=e,n=je(Bo,e.__scopeDialog);return n.modal?h(xe,{present:o||n.open,children:h(ih,{...r,ref:t})}):null});ti.displayName=Bo;var lh=qe("DialogOverlay.RemoveScroll"),ih=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=je(Bo,a);return h(Wt,{as:lh,allowPinchZoom:!0,shards:[r.contentRef],children:h(B.div,{"data-state":fn(r.open),...o,ref:t,style:{pointerEvents:"auto",...o.style}})})}),Gt="DialogContent",ai=x((e,t)=>{let a=Ql(Gt,e.__scopeDialog),{forceMount:o=a.forceMount,...r}=e,n=je(Gt,e.__scopeDialog);return h(xe,{present:o||n.open,children:n.modal?h(uh,{...r,ref:t}):h(ch,{...r,ref:t})})});ai.displayName=Gt;var uh=x((e,t)=>{let a=je(Gt,e.__scopeDialog),o=y(null),r=X(t,a.contentRef,o);return D(()=>{let n=o.current;if(n)return Ra(n)},[]),h(oi,{...e,ref:r,trapFocus:a.open,disableOutsidePointerEvents:a.open,onCloseAutoFocus:A(e.onCloseAutoFocus,n=>{n.preventDefault(),a.triggerRef.current?.focus()}),onPointerDownOutside:A(e.onPointerDownOutside,n=>{let s=n.detail.originalEvent,l=s.button===0&&s.ctrlKey===!0;(s.button===2||l)&&n.preventDefault()}),onFocusOutside:A(e.onFocusOutside,n=>n.preventDefault())})}),ch=x((e,t)=>{let a=je(Gt,e.__scopeDialog),o=y(!1),r=y(!1);return h(oi,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,onCloseAutoFocus:n=>{e.onCloseAutoFocus?.(n),n.defaultPrevented||(o.current||a.triggerRef.current?.focus(),n.preventDefault()),o.current=!1,r.current=!1},onInteractOutside:n=>{e.onInteractOutside?.(n),n.defaultPrevented||(o.current=!0,n.detail.originalEvent.type==="pointerdown"&&(r.current=!0));let s=n.target;a.triggerRef.current?.contains(s)&&n.preventDefault(),n.detail.originalEvent.type==="focusin"&&r.current&&n.preventDefault()}})}),oi=x((e,t)=>{let{__scopeDialog:a,trapFocus:o,onOpenAutoFocus:r,onCloseAutoFocus:n,...s}=e,l=je(Gt,a),i=y(null),u=X(t,i);return La(),Re(Ae,{children:[h(Ut,{asChild:!0,loop:!0,trapped:o,onMountAutoFocus:r,onUnmountAutoFocus:n,children:h(ht,{role:"dialog",id:l.contentId,"aria-describedby":l.descriptionId,"aria-labelledby":l.titleId,"data-state":fn(l.open),...s,ref:u,onDismiss:()=>l.onOpenChange(!1)})}),Re(Ae,{children:[h(dh,{titleId:l.titleId}),h(ph,{contentRef:i,descriptionId:l.descriptionId})]})]})}),dn="DialogTitle",ri=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=je(dn,a);return h(B.h2,{id:r.titleId,...o,ref:t})});ri.displayName=dn;var ni="DialogDescription",si=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=je(ni,a);return h(B.p,{id:r.descriptionId,...o,ref:t})});si.displayName=ni;var li="DialogClose",ii=x((e,t)=>{let{__scopeDialog:a,...o}=e,r=je(li,a);return h(B.button,{type:"button",...o,ref:t,onClick:A(e.onClick,()=>r.onOpenChange(!1))})});ii.displayName=li;function fn(e){return e?"open":"closed"}var ui="DialogTitleWarning",[JS,ci]=hl(ui,{contentName:Gt,titleName:dn,docsSlug:"dialog"}),dh=({titleId:e})=>{let t=ci(ui),a=`\`${t.contentName}\` requires a \`${t.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${t.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${t.docsSlug}`;return D(()=>{e&&(document.getElementById(e)||console.error(a))},[a,e]),null},fh="DialogDescriptionWarning",ph=({contentRef:e,descriptionId:t})=>{let o=`Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${ci(fh).contentName}}.`;return D(()=>{let r=e.current?.getAttribute("aria-describedby");t&&r&&(document.getElementById(t)||console.warn(o))},[o,e,t]),null};var Ho=ei,ya=ti,Pa=ai,Ta=ri,ka=si,Uo=ii;var xh=Ho;var fi=x(({className:e,...t},a)=>I(ya,{ref:a,className:N("xps-dialog-overlay",e),...t}));fi.displayName=ya.displayName;var gh=x(({className:e,children:t,showClose:a=!0,...o},r)=>I(xh,null,I(fi,null),I(Pa,{ref:r,className:N("xps-dialog-content",e),...o},t,a?I(Uo,{className:"xps-dialog-close"},I(_t,{className:"xps-icon","aria-hidden":"true"}),I("span",{className:"xps-sr-only"},"Close")):null)));gh.displayName=Pa.displayName;var vh=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-dialog-header",e),...t}));vh.displayName="DialogHeader";var wh=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-dialog-footer",e),...t}));wh.displayName="DialogFooter";var Ch=x(({className:e,...t},a)=>I(Ta,{ref:a,className:N("xps-dialog-title",e),...t}));Ch.displayName=Ta.displayName;var Lh=x(({className:e,...t},a)=>I(ka,{ref:a,className:N("xps-dialog-description",e),...t}));Lh.displayName=ka.displayName;function Tt(e){let t=e+"CollectionProvider",[a,o]=ue(t),[r,n]=a(t,{collectionRef:{current:null},itemMap:new Map}),s=p=>{let{scope:v,children:w}=p,C=y(null),L=y(new Map).current;return h(r,{scope:v,itemMap:L,collectionRef:C,children:w})};s.displayName=t;let l=e+"CollectionSlot",i=qe(l),u=x((p,v)=>{let{scope:w,children:C}=p,L=n(l,w),S=X(v,L.collectionRef);return h(i,{ref:S,children:C})});u.displayName=l;let d=e+"CollectionItemSlot",c="data-radix-collection-item",f=qe(d),m=x((p,v)=>{let{scope:w,children:C,...L}=p,S=y(null),P=X(v,S),E=n(d,w);return D(()=>(E.itemMap.set(S,{ref:S,...L}),()=>{E.itemMap.delete(S)})),h(f,{[c]:"",ref:P,children:C})});m.displayName=d;function g(p){let v=n(e+"CollectionConsumer",p);return H(()=>{let C=v.collectionRef.current;if(!C)return[];let L=Array.from(C.querySelectorAll(`[${c}]`));return Array.from(v.itemMap.values()).sort((E,T)=>L.indexOf(E.ref.current)-L.indexOf(T.ref.current))},[v.collectionRef,v.itemMap])}return[{Provider:s,Slot:u,ItemSlot:m},g,o]}var Ih=dt(void 0);function ze(e){let t=ft(Ih);return e||t||"ltr"}var hi=["top","right","bottom","left"];var ot=Math.min,De=Math.max,eo=Math.round,to=Math.floor,$e=e=>({x:e,y:e}),Sh={left:"right",right:"left",bottom:"top",top:"bottom"};function zo(e,t,a){return De(e,ot(t,a))}function rt(e,t){return typeof e=="function"?e(t):e}function nt(e){return e.split("-")[0]}function Xt(e){return e.split("-")[1]}function Vo(e){return e==="x"?"y":"x"}function Wo(e){return e==="y"?"height":"width"}function Ye(e){let t=e[0];return t==="t"||t==="b"?"y":"x"}function Go(e){return Vo(Ye(e))}function xi(e,t,a){a===void 0&&(a=!1);let o=Xt(e),r=Go(e),n=Wo(r),s=r==="x"?o===(a?"end":"start")?"right":"left":o==="start"?"bottom":"top";return t.reference[n]>t.floating[n]&&(s=Qa(s)),[s,Qa(s)]}function gi(e){let t=Qa(e);return[qo(e),t,qo(t)]}function qo(e){return e.includes("start")?e.replace("start","end"):e.replace("end","start")}var pi=["left","right"],mi=["right","left"],bh=["top","bottom"],Rh=["bottom","top"];function yh(e,t,a){switch(e){case"top":case"bottom":return a?t?mi:pi:t?pi:mi;case"left":case"right":return t?bh:Rh;default:return[]}}function vi(e,t,a,o){let r=Xt(e),n=yh(nt(e),a==="start",o);return r&&(n=n.map(s=>s+"-"+r),t&&(n=n.concat(n.map(qo)))),n}function Qa(e){let t=nt(e);return Sh[t]+e.slice(t.length)}function Ph(e){return{top:0,right:0,bottom:0,left:0,...e}}function pn(e){return typeof e!="number"?Ph(e):{top:e,right:e,bottom:e,left:e}}function Kt(e){let{x:t,y:a,width:o,height:r}=e;return{width:o,height:r,top:a,left:t,right:t+o,bottom:a+r,x:t,y:a}}function wi(e,t,a){let{reference:o,floating:r}=e,n=Ye(t),s=Go(t),l=Wo(s),i=nt(t),u=n==="y",d=o.x+o.width/2-r.width/2,c=o.y+o.height/2-r.height/2,f=o[l]/2-r[l]/2,m;switch(i){case"top":m={x:d,y:o.y-r.height};break;case"bottom":m={x:d,y:o.y+o.height};break;case"right":m={x:o.x+o.width,y:c};break;case"left":m={x:o.x-r.width,y:c};break;default:m={x:o.x,y:o.y}}switch(Xt(t)){case"start":m[s]-=f*(a&&u?-1:1);break;case"end":m[s]+=f*(a&&u?-1:1);break}return m}async function Ii(e,t){var a;t===void 0&&(t={});let{x:o,y:r,platform:n,rects:s,elements:l,strategy:i}=e,{boundary:u="clippingAncestors",rootBoundary:d="viewport",elementContext:c="floating",altBoundary:f=!1,padding:m=0}=rt(t,e),g=pn(m),v=l[f?c==="floating"?"reference":"floating":c],w=Kt(await n.getClippingRect({element:(a=await(n.isElement==null?void 0:n.isElement(v)))==null||a?v:v.contextElement||await(n.getDocumentElement==null?void 0:n.getDocumentElement(l.floating)),boundary:u,rootBoundary:d,strategy:i})),C=c==="floating"?{x:o,y:r,width:s.floating.width,height:s.floating.height}:s.reference,L=await(n.getOffsetParent==null?void 0:n.getOffsetParent(l.floating)),S=await(n.isElement==null?void 0:n.isElement(L))?await(n.getScale==null?void 0:n.getScale(L))||{x:1,y:1}:{x:1,y:1},P=Kt(n.convertOffsetParentRelativeRectToViewportRelativeRect?await n.convertOffsetParentRelativeRectToViewportRelativeRect({elements:l,rect:C,offsetParent:L,strategy:i}):C);return{top:(w.top-P.top+g.top)/S.y,bottom:(P.bottom-w.bottom+g.bottom)/S.y,left:(w.left-P.left+g.left)/S.x,right:(P.right-w.right+g.right)/S.x}}var Th=50,Si=async(e,t,a)=>{let{placement:o="bottom",strategy:r="absolute",middleware:n=[],platform:s}=a,l=s.detectOverflow?s:{...s,detectOverflow:Ii},i=await(s.isRTL==null?void 0:s.isRTL(t)),u=await s.getElementRects({reference:e,floating:t,strategy:r}),{x:d,y:c}=wi(u,o,i),f=o,m=0,g={};for(let p=0;p<n.length;p++){let v=n[p];if(!v)continue;let{name:w,fn:C}=v,{x:L,y:S,data:P,reset:E}=await C({x:d,y:c,initialPlacement:o,placement:f,strategy:r,middlewareData:g,rects:u,platform:l,elements:{reference:e,floating:t}});d=L??d,c=S??c,g[w]={...g[w],...P},E&&m<Th&&(m++,typeof E=="object"&&(E.placement&&(f=E.placement),E.rects&&(u=E.rects===!0?await s.getElementRects({reference:e,floating:t,strategy:r}):E.rects),{x:d,y:c}=wi(u,f,i)),p=-1)}return{x:d,y:c,placement:f,strategy:r,middlewareData:g}},bi=e=>({name:"arrow",options:e,async fn(t){let{x:a,y:o,placement:r,rects:n,platform:s,elements:l,middlewareData:i}=t,{element:u,padding:d=0}=rt(e,t)||{};if(u==null)return{};let c=pn(d),f={x:a,y:o},m=Go(r),g=Wo(m),p=await s.getDimensions(u),v=m==="y",w=v?"top":"left",C=v?"bottom":"right",L=v?"clientHeight":"clientWidth",S=n.reference[g]+n.reference[m]-f[m]-n.floating[g],P=f[m]-n.reference[m],E=await(s.getOffsetParent==null?void 0:s.getOffsetParent(u)),T=E?E[L]:0;(!T||!await(s.isElement==null?void 0:s.isElement(E)))&&(T=l.floating[L]||n.floating[g]);let _=S/2-P/2,z=T/2-p[g]/2-1,V=ot(c[w],z),K=ot(c[C],z),F=V,Y=T-p[g]-K,$=T/2-p[g]/2+_,ae=zo(F,$,Y),j=!i.arrow&&Xt(r)!=null&&$!==ae&&n.reference[g]/2-($<F?V:K)-p[g]/2<0,J=j?$<F?$-F:$-Y:0;return{[m]:f[m]+J,data:{[m]:ae,centerOffset:$-ae-J,...j&&{alignmentOffset:J}},reset:j}}});var Ri=function(e){return e===void 0&&(e={}),{name:"flip",options:e,async fn(t){var a,o;let{placement:r,middlewareData:n,rects:s,initialPlacement:l,platform:i,elements:u}=t,{mainAxis:d=!0,crossAxis:c=!0,fallbackPlacements:f,fallbackStrategy:m="bestFit",fallbackAxisSideDirection:g="none",flipAlignment:p=!0,...v}=rt(e,t);if((a=n.arrow)!=null&&a.alignmentOffset)return{};let w=nt(r),C=Ye(l),L=nt(l)===l,S=await(i.isRTL==null?void 0:i.isRTL(u.floating)),P=f||(L||!p?[Qa(l)]:gi(l)),E=g!=="none";!f&&E&&P.push(...vi(l,p,g,S));let T=[l,...P],_=await i.detectOverflow(t,v),z=[],V=((o=n.flip)==null?void 0:o.overflows)||[];if(d&&z.push(_[w]),c){let $=xi(r,s,S);z.push(_[$[0]],_[$[1]])}if(V=[...V,{placement:r,overflows:z}],!z.every($=>$<=0)){var K,F;let $=(((K=n.flip)==null?void 0:K.index)||0)+1,ae=T[$];if(ae&&(!(c==="alignment"?C!==Ye(ae):!1)||V.every(U=>Ye(U.placement)===C?U.overflows[0]>0:!0)))return{data:{index:$,overflows:V},reset:{placement:ae}};let j=(F=V.filter(J=>J.overflows[0]<=0).sort((J,U)=>J.overflows[1]-U.overflows[1])[0])==null?void 0:F.placement;if(!j)switch(m){case"bestFit":{var Y;let J=(Y=V.filter(U=>{if(E){let O=Ye(U.placement);return O===C||O==="y"}return!0}).map(U=>[U.placement,U.overflows.filter(O=>O>0).reduce((O,ee)=>O+ee,0)]).sort((U,O)=>U[1]-O[1])[0])==null?void 0:Y[0];J&&(j=J);break}case"initialPlacement":j=l;break}if(r!==j)return{reset:{placement:j}}}return{}}}};function Ci(e,t){return{top:e.top-t.height,right:e.right-t.width,bottom:e.bottom-t.height,left:e.left-t.width}}function Li(e){return hi.some(t=>e[t]>=0)}var yi=function(e){return e===void 0&&(e={}),{name:"hide",options:e,async fn(t){let{rects:a,platform:o}=t,{strategy:r="referenceHidden",...n}=rt(e,t);switch(r){case"referenceHidden":{let s=await o.detectOverflow(t,{...n,elementContext:"reference"}),l=Ci(s,a.reference);return{data:{referenceHiddenOffsets:l,referenceHidden:Li(l)}}}case"escaped":{let s=await o.detectOverflow(t,{...n,altBoundary:!0}),l=Ci(s,a.floating);return{data:{escapedOffsets:l,escaped:Li(l)}}}default:return{}}}}};var Pi=new Set(["left","top"]);async function kh(e,t){let{placement:a,platform:o,elements:r}=e,n=await(o.isRTL==null?void 0:o.isRTL(r.floating)),s=nt(a),l=Xt(a),i=Ye(a)==="y",u=Pi.has(s)?-1:1,d=n&&i?-1:1,c=rt(t,e),{mainAxis:f,crossAxis:m,alignmentAxis:g}=typeof c=="number"?{mainAxis:c,crossAxis:0,alignmentAxis:null}:{mainAxis:c.mainAxis||0,crossAxis:c.crossAxis||0,alignmentAxis:c.alignmentAxis};return l&&typeof g=="number"&&(m=l==="end"?g*-1:g),i?{x:m*d,y:f*u}:{x:f*u,y:m*d}}var Ti=function(e){return e===void 0&&(e=0),{name:"offset",options:e,async fn(t){var a,o;let{x:r,y:n,placement:s,middlewareData:l}=t,i=await kh(t,e);return s===((a=l.offset)==null?void 0:a.placement)&&(o=l.arrow)!=null&&o.alignmentOffset?{}:{x:r+i.x,y:n+i.y,data:{...i,placement:s}}}}},ki=function(e){return e===void 0&&(e={}),{name:"shift",options:e,async fn(t){let{x:a,y:o,placement:r,platform:n}=t,{mainAxis:s=!0,crossAxis:l=!1,limiter:i={fn:w=>{let{x:C,y:L}=w;return{x:C,y:L}}},...u}=rt(e,t),d={x:a,y:o},c=await n.detectOverflow(t,u),f=Ye(nt(r)),m=Vo(f),g=d[m],p=d[f];if(s){let w=m==="y"?"top":"left",C=m==="y"?"bottom":"right",L=g+c[w],S=g-c[C];g=zo(L,g,S)}if(l){let w=f==="y"?"top":"left",C=f==="y"?"bottom":"right",L=p+c[w],S=p-c[C];p=zo(L,p,S)}let v=i.fn({...t,[m]:g,[f]:p});return{...v,data:{x:v.x-a,y:v.y-o,enabled:{[m]:s,[f]:l}}}}}},Mi=function(e){return e===void 0&&(e={}),{options:e,fn(t){let{x:a,y:o,placement:r,rects:n,middlewareData:s}=t,{offset:l=0,mainAxis:i=!0,crossAxis:u=!0}=rt(e,t),d={x:a,y:o},c=Ye(r),f=Vo(c),m=d[f],g=d[c],p=rt(l,t),v=typeof p=="number"?{mainAxis:p,crossAxis:0}:{mainAxis:0,crossAxis:0,...p};if(i){let L=f==="y"?"height":"width",S=n.reference[f]-n.floating[L]+v.mainAxis,P=n.reference[f]+n.reference[L]-v.mainAxis;m<S?m=S:m>P&&(m=P)}if(u){var w,C;let L=f==="y"?"width":"height",S=Pi.has(nt(r)),P=n.reference[c]-n.floating[L]+(S&&((w=s.offset)==null?void 0:w[c])||0)+(S?0:v.crossAxis),E=n.reference[c]+n.reference[L]+(S?0:((C=s.offset)==null?void 0:C[c])||0)-(S?v.crossAxis:0);g<P?g=P:g>E&&(g=E)}return{[f]:m,[c]:g}}}},Ai=function(e){return e===void 0&&(e={}),{name:"size",options:e,async fn(t){var a,o;let{placement:r,rects:n,platform:s,elements:l}=t,{apply:i=()=>{},...u}=rt(e,t),d=await s.detectOverflow(t,u),c=nt(r),f=Xt(r),m=Ye(r)==="y",{width:g,height:p}=n.floating,v,w;c==="top"||c==="bottom"?(v=c,w=f===(await(s.isRTL==null?void 0:s.isRTL(l.floating))?"start":"end")?"left":"right"):(w=c,v=f==="end"?"top":"bottom");let C=p-d.top-d.bottom,L=g-d.left-d.right,S=ot(p-d[v],C),P=ot(g-d[w],L),E=!t.middlewareData.shift,T=S,_=P;if((a=t.middlewareData.shift)!=null&&a.enabled.x&&(_=L),(o=t.middlewareData.shift)!=null&&o.enabled.y&&(T=C),E&&!f){let V=De(d.left,0),K=De(d.right,0),F=De(d.top,0),Y=De(d.bottom,0);m?_=g-2*(V!==0||K!==0?V+K:De(d.left,d.right)):T=p-2*(F!==0||Y!==0?F+Y:De(d.top,d.bottom))}await i({...t,availableWidth:_,availableHeight:T});let z=await s.getDimensions(l.floating);return g!==z.width||p!==z.height?{reset:{rects:!0}}:{}}}};function Xo(){return typeof window<"u"}function Yt(e){return Ei(e)?(e.nodeName||"").toLowerCase():"#document"}function Be(e){var t;return(e==null||(t=e.ownerDocument)==null?void 0:t.defaultView)||window}function Je(e){var t;return(t=(Ei(e)?e.ownerDocument:e.document)||window.document)==null?void 0:t.documentElement}function Ei(e){return Xo()?e instanceof Node||e instanceof Be(e).Node:!1}function Ve(e){return Xo()?e instanceof Element||e instanceof Be(e).Element:!1}function st(e){return Xo()?e instanceof HTMLElement||e instanceof Be(e).HTMLElement:!1}function Di(e){return!Xo()||typeof ShadowRoot>"u"?!1:e instanceof ShadowRoot||e instanceof Be(e).ShadowRoot}function Ma(e){let{overflow:t,overflowX:a,overflowY:o,display:r}=We(e);return/auto|scroll|overlay|hidden|clip/.test(t+o+a)&&r!=="inline"&&r!=="contents"}function Oi(e){return/^(table|td|th)$/.test(Yt(e))}function ao(e){try{if(e.matches(":popover-open"))return!0}catch{}try{return e.matches(":modal")}catch{return!1}}var Mh=/transform|translate|scale|rotate|perspective|filter/,Ah=/paint|layout|strict|content/,jt=e=>!!e&&e!=="none",mn;function Ko(e){let t=Ve(e)?We(e):e;return jt(t.transform)||jt(t.translate)||jt(t.scale)||jt(t.rotate)||jt(t.perspective)||!jo()&&(jt(t.backdropFilter)||jt(t.filter))||Mh.test(t.willChange||"")||Ah.test(t.contain||"")}function Ni(e){let t=gt(e);for(;st(t)&&!Jt(t);){if(Ko(t))return t;if(ao(t))return null;t=gt(t)}return null}function jo(){return mn==null&&(mn=typeof CSS<"u"&&CSS.supports&&CSS.supports("-webkit-backdrop-filter","none")),mn}function Jt(e){return/^(html|body|#document)$/.test(Yt(e))}function We(e){return Be(e).getComputedStyle(e)}function oo(e){return Ve(e)?{scrollLeft:e.scrollLeft,scrollTop:e.scrollTop}:{scrollLeft:e.scrollX,scrollTop:e.scrollY}}function gt(e){if(Yt(e)==="html")return e;let t=e.assignedSlot||e.parentNode||Di(e)&&e.host||Je(e);return Di(t)?t.host:t}function Fi(e){let t=gt(e);return Jt(t)?e.ownerDocument?e.ownerDocument.body:e.body:st(t)&&Ma(t)?t:Fi(t)}function $t(e,t,a){var o;t===void 0&&(t=[]),a===void 0&&(a=!0);let r=Fi(e),n=r===((o=e.ownerDocument)==null?void 0:o.body),s=Be(r);if(n){let l=$o(s);return t.concat(s,s.visualViewport||[],Ma(r)?r:[],l&&a?$t(l):[])}else return t.concat(r,$t(r,[],a))}function $o(e){return e.parent&&Object.getPrototypeOf(e.parent)?e.frameElement:null}function Ui(e){let t=We(e),a=parseFloat(t.width)||0,o=parseFloat(t.height)||0,r=st(e),n=r?e.offsetWidth:a,s=r?e.offsetHeight:o,l=eo(a)!==n||eo(o)!==s;return l&&(a=n,o=s),{width:a,height:o,$:l}}function xn(e){return Ve(e)?e:e.contextElement}function Aa(e){let t=xn(e);if(!st(t))return $e(1);let a=t.getBoundingClientRect(),{width:o,height:r,$:n}=Ui(t),s=(n?eo(a.width):a.width)/o,l=(n?eo(a.height):a.height)/r;return(!s||!Number.isFinite(s))&&(s=1),(!l||!Number.isFinite(l))&&(l=1),{x:s,y:l}}var Dh=$e(0);function qi(e){let t=Be(e);return!jo()||!t.visualViewport?Dh:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}function Eh(e,t,a){return t===void 0&&(t=!1),!a||t&&a!==Be(e)?!1:t}function Zt(e,t,a,o){t===void 0&&(t=!1),a===void 0&&(a=!1);let r=e.getBoundingClientRect(),n=xn(e),s=$e(1);t&&(o?Ve(o)&&(s=Aa(o)):s=Aa(e));let l=Eh(n,a,o)?qi(n):$e(0),i=(r.left+l.x)/s.x,u=(r.top+l.y)/s.y,d=r.width/s.x,c=r.height/s.y;if(n){let f=Be(n),m=o&&Ve(o)?Be(o):o,g=f,p=$o(g);for(;p&&o&&m!==g;){let v=Aa(p),w=p.getBoundingClientRect(),C=We(p),L=w.left+(p.clientLeft+parseFloat(C.paddingLeft))*v.x,S=w.top+(p.clientTop+parseFloat(C.paddingTop))*v.y;i*=v.x,u*=v.y,d*=v.x,c*=v.y,i+=L,u+=S,g=Be(p),p=$o(g)}}return Kt({width:d,height:c,x:i,y:u})}function Yo(e,t){let a=oo(e).scrollLeft;return t?t.left+a:Zt(Je(e)).left+a}function zi(e,t){let a=e.getBoundingClientRect(),o=a.left+t.scrollLeft-Yo(e,a),r=a.top+t.scrollTop;return{x:o,y:r}}function Oh(e){let{elements:t,rect:a,offsetParent:o,strategy:r}=e,n=r==="fixed",s=Je(o),l=t?ao(t.floating):!1;if(o===s||l&&n)return a;let i={scrollLeft:0,scrollTop:0},u=$e(1),d=$e(0),c=st(o);if((c||!c&&!n)&&((Yt(o)!=="body"||Ma(s))&&(i=oo(o)),c)){let m=Zt(o);u=Aa(o),d.x=m.x+o.clientLeft,d.y=m.y+o.clientTop}let f=s&&!c&&!n?zi(s,i):$e(0);return{width:a.width*u.x,height:a.height*u.y,x:a.x*u.x-i.scrollLeft*u.x+d.x+f.x,y:a.y*u.y-i.scrollTop*u.y+d.y+f.y}}function Nh(e){return Array.from(e.getClientRects())}function Fh(e){let t=Je(e),a=oo(e),o=e.ownerDocument.body,r=De(t.scrollWidth,t.clientWidth,o.scrollWidth,o.clientWidth),n=De(t.scrollHeight,t.clientHeight,o.scrollHeight,o.clientHeight),s=-a.scrollLeft+Yo(e),l=-a.scrollTop;return We(o).direction==="rtl"&&(s+=De(t.clientWidth,o.clientWidth)-r),{width:r,height:n,x:s,y:l}}var Bi=25;function Bh(e,t){let a=Be(e),o=Je(e),r=a.visualViewport,n=o.clientWidth,s=o.clientHeight,l=0,i=0;if(r){n=r.width,s=r.height;let d=jo();(!d||d&&t==="fixed")&&(l=r.offsetLeft,i=r.offsetTop)}let u=Yo(o);if(u<=0){let d=o.ownerDocument,c=d.body,f=getComputedStyle(c),m=d.compatMode==="CSS1Compat"&&parseFloat(f.marginLeft)+parseFloat(f.marginRight)||0,g=Math.abs(o.clientWidth-c.clientWidth-m);g<=Bi&&(n-=g)}else u<=Bi&&(n+=u);return{width:n,height:s,x:l,y:i}}function _h(e,t){let a=Zt(e,!0,t==="fixed"),o=a.top+e.clientTop,r=a.left+e.clientLeft,n=st(e)?Aa(e):$e(1),s=e.clientWidth*n.x,l=e.clientHeight*n.y,i=r*n.x,u=o*n.y;return{width:s,height:l,x:i,y:u}}function _i(e,t,a){let o;if(t==="viewport")o=Bh(e,a);else if(t==="document")o=Fh(Je(e));else if(Ve(t))o=_h(t,a);else{let r=qi(e);o={x:t.x-r.x,y:t.y-r.y,width:t.width,height:t.height}}return Kt(o)}function Vi(e,t){let a=gt(e);return a===t||!Ve(a)||Jt(a)?!1:We(a).position==="fixed"||Vi(a,t)}function Hh(e,t){let a=t.get(e);if(a)return a;let o=$t(e,[],!1).filter(l=>Ve(l)&&Yt(l)!=="body"),r=null,n=We(e).position==="fixed",s=n?gt(e):e;for(;Ve(s)&&!Jt(s);){let l=We(s),i=Ko(s);!i&&l.position==="fixed"&&(r=null),(n?!i&&!r:!i&&l.position==="static"&&!!r&&(r.position==="absolute"||r.position==="fixed")||Ma(s)&&!i&&Vi(e,s))?o=o.filter(d=>d!==s):r=l,s=gt(s)}return t.set(e,o),o}function Uh(e){let{element:t,boundary:a,rootBoundary:o,strategy:r}=e,s=[...a==="clippingAncestors"?ao(t)?[]:Hh(t,this._c):[].concat(a),o],l=_i(t,s[0],r),i=l.top,u=l.right,d=l.bottom,c=l.left;for(let f=1;f<s.length;f++){let m=_i(t,s[f],r);i=De(m.top,i),u=ot(m.right,u),d=ot(m.bottom,d),c=De(m.left,c)}return{width:u-c,height:d-i,x:c,y:i}}function qh(e){let{width:t,height:a}=Ui(e);return{width:t,height:a}}function zh(e,t,a){let o=st(t),r=Je(t),n=a==="fixed",s=Zt(e,!0,n,t),l={scrollLeft:0,scrollTop:0},i=$e(0);function u(){i.x=Yo(r)}if(o||!o&&!n)if((Yt(t)!=="body"||Ma(r))&&(l=oo(t)),o){let m=Zt(t,!0,n,t);i.x=m.x+t.clientLeft,i.y=m.y+t.clientTop}else r&&u();n&&!o&&r&&u();let d=r&&!o&&!n?zi(r,l):$e(0),c=s.left+l.scrollLeft-i.x-d.x,f=s.top+l.scrollTop-i.y-d.y;return{x:c,y:f,width:s.width,height:s.height}}function hn(e){return We(e).position==="static"}function Hi(e,t){if(!st(e)||We(e).position==="fixed")return null;if(t)return t(e);let a=e.offsetParent;return Je(e)===a&&(a=a.ownerDocument.body),a}function Wi(e,t){let a=Be(e);if(ao(e))return a;if(!st(e)){let r=gt(e);for(;r&&!Jt(r);){if(Ve(r)&&!hn(r))return r;r=gt(r)}return a}let o=Hi(e,t);for(;o&&Oi(o)&&hn(o);)o=Hi(o,t);return o&&Jt(o)&&hn(o)&&!Ko(o)?a:o||Ni(e)||a}var Vh=async function(e){let t=this.getOffsetParent||Wi,a=this.getDimensions,o=await a(e.floating);return{reference:zh(e.reference,await t(e.floating),e.strategy),floating:{x:0,y:0,width:o.width,height:o.height}}};function Wh(e){return We(e).direction==="rtl"}var Gi={convertOffsetParentRelativeRectToViewportRelativeRect:Oh,getDocumentElement:Je,getClippingRect:Uh,getOffsetParent:Wi,getElementRects:Vh,getClientRects:Nh,getDimensions:qh,getScale:Aa,isElement:Ve,isRTL:Wh};function Xi(e,t){return e.x===t.x&&e.y===t.y&&e.width===t.width&&e.height===t.height}function Gh(e,t){let a=null,o,r=Je(e);function n(){var l;clearTimeout(o),(l=a)==null||l.disconnect(),a=null}function s(l,i){l===void 0&&(l=!1),i===void 0&&(i=1),n();let u=e.getBoundingClientRect(),{left:d,top:c,width:f,height:m}=u;if(l||t(),!f||!m)return;let g=to(c),p=to(r.clientWidth-(d+f)),v=to(r.clientHeight-(c+m)),w=to(d),L={rootMargin:-g+"px "+-p+"px "+-v+"px "+-w+"px",threshold:De(0,ot(1,i))||1},S=!0;function P(E){let T=E[0].intersectionRatio;if(T!==i){if(!S)return s();T?s(!1,T):o=setTimeout(()=>{s(!1,1e-7)},1e3)}T===1&&!Xi(u,e.getBoundingClientRect())&&s(),S=!1}try{a=new IntersectionObserver(P,{...L,root:r.ownerDocument})}catch{a=new IntersectionObserver(P,L)}a.observe(e)}return s(!0),n}function gn(e,t,a,o){o===void 0&&(o={});let{ancestorScroll:r=!0,ancestorResize:n=!0,elementResize:s=typeof ResizeObserver=="function",layoutShift:l=typeof IntersectionObserver=="function",animationFrame:i=!1}=o,u=xn(e),d=r||n?[...u?$t(u):[],...t?$t(t):[]]:[];d.forEach(w=>{r&&w.addEventListener("scroll",a,{passive:!0}),n&&w.addEventListener("resize",a)});let c=u&&l?Gh(u,a):null,f=-1,m=null;s&&(m=new ResizeObserver(w=>{let[C]=w;C&&C.target===u&&m&&t&&(m.unobserve(t),cancelAnimationFrame(f),f=requestAnimationFrame(()=>{var L;(L=m)==null||L.observe(t)})),a()}),u&&!i&&m.observe(u),t&&m.observe(t));let g,p=i?Zt(e):null;i&&v();function v(){let w=Zt(e);p&&!Xi(p,w)&&a(),p=w,g=requestAnimationFrame(v)}return a(),()=>{var w;d.forEach(C=>{r&&C.removeEventListener("scroll",a),n&&C.removeEventListener("resize",a)}),c?.(),(w=m)==null||w.disconnect(),m=null,i&&cancelAnimationFrame(g)}}var Ki=Ti;var ji=ki,$i=Ri,Yi=Ai,Ji=yi,vn=bi;var Zi=Mi,wn=(e,t,a)=>{let o=new Map,r={platform:Gi,...a},n={...r.platform,_c:o};return Si(e,t,{...r,platform:n})};var Xh=typeof document<"u",Kh=function(){},Jo=Xh?Nt:Kh;function Zo(e,t){if(e===t)return!0;if(typeof e!=typeof t)return!1;if(typeof e=="function"&&e.toString()===t.toString())return!0;let a,o,r;if(e&&t&&typeof e=="object"){if(Array.isArray(e)){if(a=e.length,a!==t.length)return!1;for(o=a;o--!==0;)if(!Zo(e[o],t[o]))return!1;return!0}if(r=Object.keys(e),a=r.length,a!==Object.keys(t).length)return!1;for(o=a;o--!==0;)if(!{}.hasOwnProperty.call(t,r[o]))return!1;for(o=a;o--!==0;){let n=r[o];if(!(n==="_owner"&&e.$$typeof)&&!Zo(e[n],t[n]))return!1}return!0}return e!==e&&t!==t}function eu(e){return typeof window>"u"?1:(e.ownerDocument.defaultView||window).devicePixelRatio||1}function Qi(e,t){let a=eu(e);return Math.round(t*a)/a}function Cn(e){let t=y(e);return Jo(()=>{t.current=e}),t}function tu(e){e===void 0&&(e={});let{placement:t="bottom",strategy:a="absolute",middleware:o=[],platform:r,elements:{reference:n,floating:s}={},transform:l=!0,whileElementsMounted:i,open:u}=e,[d,c]=M({x:0,y:0,strategy:a,placement:t,middlewareData:{},isPositioned:!1}),[f,m]=M(o);Zo(f,o)||m(o);let[g,p]=M(null),[v,w]=M(null),C=H(U=>{U!==E.current&&(E.current=U,p(U))},[]),L=H(U=>{U!==T.current&&(T.current=U,w(U))},[]),S=n||g,P=s||v,E=y(null),T=y(null),_=y(d),z=i!=null,V=Cn(i),K=Cn(r),F=Cn(u),Y=H(()=>{if(!E.current||!T.current)return;let U={placement:t,strategy:a,middleware:f};K.current&&(U.platform=K.current),wn(E.current,T.current,U).then(O=>{let ee={...O,isPositioned:F.current!==!1};$.current&&!Zo(_.current,ee)&&(_.current=ee,Ro(()=>{c(ee)}))})},[f,t,a,K,F]);Jo(()=>{u===!1&&_.current.isPositioned&&(_.current.isPositioned=!1,c(U=>({...U,isPositioned:!1})))},[u]);let $=y(!1);Jo(()=>($.current=!0,()=>{$.current=!1}),[]),Jo(()=>{if(S&&(E.current=S),P&&(T.current=P),S&&P){if(V.current)return V.current(S,P,Y);Y()}},[S,P,Y,V,z]);let ae=he(()=>({reference:E,floating:T,setReference:C,setFloating:L}),[C,L]),j=he(()=>({reference:S,floating:P}),[S,P]),J=he(()=>{let U={position:a,left:0,top:0};if(!j.floating)return U;let O=Qi(j.floating,d.x),ee=Qi(j.floating,d.y);return l?{...U,transform:"translate("+O+"px, "+ee+"px)",...eu(j.floating)>=1.5&&{willChange:"transform"}}:{position:a,left:O,top:ee}},[a,l,j.floating,d.x,d.y]);return he(()=>({...d,update:Y,refs:ae,elements:j,floatingStyles:J}),[d,Y,ae,j,J])}var jh=e=>{function t(a){return{}.hasOwnProperty.call(a,"current")}return{name:"arrow",options:e,fn(a){let{element:o,padding:r}=typeof e=="function"?e(a):e;return o&&t(o)?o.current!=null?vn({element:o.current,padding:r}).fn(a):{}:o?vn({element:o,padding:r}).fn(a):{}}}},au=(e,t)=>{let a=Ki(e);return{name:a.name,fn:a.fn,options:[e,t]}},ou=(e,t)=>{let a=ji(e);return{name:a.name,fn:a.fn,options:[e,t]}},ru=(e,t)=>({fn:Zi(e).fn,options:[e,t]}),nu=(e,t)=>{let a=$i(e);return{name:a.name,fn:a.fn,options:[e,t]}},su=(e,t)=>{let a=Yi(e);return{name:a.name,fn:a.fn,options:[e,t]}};var lu=(e,t)=>{let a=Ji(e);return{name:a.name,fn:a.fn,options:[e,t]}};var iu=(e,t)=>{let a=jh(e);return{name:a.name,fn:a.fn,options:[e,t]}};var $h="Arrow",uu=x((e,t)=>{let{children:a,width:o=10,height:r=5,...n}=e;return h(B.svg,{...n,ref:t,width:o,height:r,viewBox:"0 0 30 10",preserveAspectRatio:"none",children:e.asChild?a:h("polygon",{points:"0,0 30,0 15,10"})})});uu.displayName=$h;var cu=uu;var Ln="Popper",[du,vt]=ue(Ln),[Jh,fu]=du(Ln),pu=e=>{let{__scopePopper:t,children:a}=e,[o,r]=M(null),[n,s]=M(void 0);return h(Jh,{scope:t,anchor:o,onAnchorChange:r,placementState:n,setPlacementState:s,children:a})};pu.displayName=Ln;var mu="PopperAnchor",hu=x((e,t)=>{let{__scopePopper:a,virtualRef:o,...r}=e,n=fu(mu,a),s=y(null),l=n.onAnchorChange,i=H(g=>{s.current=g,g&&l(g)},[l]),u=X(t,i),d=y(null);D(()=>{if(!o)return;let g=d.current;d.current=o.current,g!==d.current&&l(d.current)});let c=n.placementState&&Sn(n.placementState),f=c?.[0],m=c?.[1];return o?null:h(B.div,{"data-radix-popper-side":f,"data-radix-popper-align":m,...r,ref:u})});hu.displayName=mu;var In="PopperContent",[Zh,Qh]=du(In),xu=x((e,t)=>{let{__scopePopper:a,side:o="bottom",sideOffset:r=0,align:n="center",alignOffset:s=0,arrowPadding:l=0,avoidCollisions:i=!0,collisionBoundary:u,collisionPadding:d=0,sticky:c="partial",hideWhenDetached:f=!1,updatePositionStrategy:m="optimized",onPlaced:g,...p}=e,v=fu(In,a),[w,C]=M(null),L=X(t,oe=>C(oe)),[S,P]=M(null),E=bt(S),T=E?.width??0,_=E?.height??0,z=o+(n!=="center"?"-"+n:""),V=typeof d=="number"?d:{top:0,right:0,bottom:0,left:0,...d},K=u?Array.isArray(u)?u:[u]:void 0,F=K!==void 0&&K.length>0,Y={padding:V,boundary:K?.filter(tx),altBoundary:F},{refs:$,floatingStyles:ae,placement:j,isPositioned:J,middlewareData:U}=tu({strategy:"fixed",placement:z,whileElementsMounted:(...oe)=>gn(...oe,{animationFrame:m==="always"}),elements:{reference:v.anchor},middleware:[au({mainAxis:r+_,alignmentAxis:s}),i&&ou({mainAxis:!0,crossAxis:!1,limiter:c==="partial"?ru():void 0,...Y}),i&&nu({...Y}),su({...Y,apply:({elements:oe,rects:Se,availableWidth:le,availableHeight:k})=>{let{width:ge,height:He}=Se.reference,Ne=oe.floating.style;Ne.setProperty("--radix-popper-available-width",`${le}px`),Ne.setProperty("--radix-popper-available-height",`${k}px`),Ne.setProperty("--radix-popper-anchor-width",`${ge}px`),Ne.setProperty("--radix-popper-anchor-height",`${He}px`)}}),S&&iu({element:S,padding:l}),ax({arrowWidth:T,arrowHeight:_}),f&&lu({strategy:"referenceHidden",...Y})]}),O=v.setPlacementState;ce(()=>(O(j),()=>{O(void 0)}),[j,O]);let[ee,se]=Sn(j),pe=de(g);ce(()=>{J&&pe?.()},[J,pe]);let Oe=U.arrow?.x,ye=U.arrow?.y,Ie=U.arrow?.centerOffset!==0,[we,W]=M();return ce(()=>{w&&W(window.getComputedStyle(w).zIndex)},[w]),h("div",{ref:$.setFloating,"data-radix-popper-content-wrapper":"",style:{...ae,transform:J?ae.transform:"translate(0, -200%)",minWidth:"max-content",zIndex:we,"--radix-popper-transform-origin":[U.transformOrigin?.x,U.transformOrigin?.y].join(" "),...U.hide?.referenceHidden&&{visibility:"hidden",pointerEvents:"none"}},dir:e.dir,children:h(Zh,{scope:a,placedSide:ee,placedAlign:se,onArrowChange:P,arrowX:Oe,arrowY:ye,shouldHideArrow:Ie,children:h(B.div,{"data-side":ee,"data-align":se,...p,ref:L,style:{...p.style,animation:J?void 0:"none"}})})})});xu.displayName=In;var gu="PopperArrow",ex={top:"bottom",right:"left",bottom:"top",left:"right"},vu=x(function(t,a){let{__scopePopper:o,...r}=t,n=Qh(gu,o),s=ex[n.placedSide];return h("span",{ref:n.onArrowChange,style:{position:"absolute",left:n.arrowX,top:n.arrowY,[s]:0,transformOrigin:{top:"",right:"0 0",bottom:"center 0",left:"100% 0"}[n.placedSide],transform:{top:"translateY(100%)",right:"translateY(50%) rotate(90deg) translateX(-50%)",bottom:"rotate(180deg)",left:"translateY(50%) rotate(-90deg) translateX(50%)"}[n.placedSide],visibility:n.shouldHideArrow?"hidden":void 0},children:h(cu,{...r,ref:a,style:{...r.style,display:"block"}})})});vu.displayName=gu;function tx(e){return e!==null}var ax=e=>({name:"transformOrigin",options:e,fn(t){let{placement:a,rects:o,middlewareData:r}=t,s=r.arrow?.centerOffset!==0,l=s?0:e.arrowWidth,i=s?0:e.arrowHeight,[u,d]=Sn(a),c={start:"0%",center:"50%",end:"100%"}[d],f=(r.arrow?.x??0)+l/2,m=(r.arrow?.y??0)+i/2,g="",p="";return u==="bottom"?(g=s?c:`${f}px`,p=`${-i}px`):u==="top"?(g=s?c:`${f}px`,p=`${o.floating.height+i}px`):u==="right"?(g=`${-i}px`,p=s?c:`${m}px`):u==="left"&&(g=`${o.floating.width+i}px`,p=s?c:`${m}px`),{data:{x:g,y:p}}}});function Sn(e){let[t,a="center"]=e.split("-");return[t,a]}var Qt=pu,Da=hu,Ea=xu,Oa=vu;var Rn="rovingFocusGroup.onEntryFocus",ox={bubbles:!1,cancelable:!0},ro="RovingFocusGroup",[yn,wu,rx]=Tt(ro),[nx,Na]=ue(ro,[rx]),[sx,lx]=nx(ro),Cu=x((e,t)=>h(yn.Provider,{scope:e.__scopeRovingFocusGroup,children:h(yn.Slot,{scope:e.__scopeRovingFocusGroup,children:h(ix,{...e,ref:t})})}));Cu.displayName=ro;var ix=x((e,t)=>{let{__scopeRovingFocusGroup:a,orientation:o,loop:r=!1,dir:n,currentTabStopId:s,defaultCurrentTabStopId:l,onCurrentTabStopIdChange:i,onEntryFocus:u,preventScrollOnEntryFocus:d=!1,...c}=e,f=y(null),m=X(t,f),g=ze(n),[p,v]=be({prop:s,defaultProp:l??null,onChange:i,caller:ro}),[w,C]=M(!1),L=de(u),S=wu(a),P=y(!1),[E,T]=M(0);return D(()=>{let _=f.current;if(_)return _.addEventListener(Rn,L),()=>_.removeEventListener(Rn,L)},[L]),h(sx,{scope:a,orientation:o,dir:g,loop:r,currentTabStopId:p,onItemFocus:H(_=>v(_),[v]),onItemShiftTab:H(()=>C(!0),[]),onFocusableItemAdd:H(()=>T(_=>_+1),[]),onFocusableItemRemove:H(()=>T(_=>_-1),[]),children:h(B.div,{tabIndex:w||E===0?-1:0,"data-orientation":o,...c,ref:m,style:{outline:"none",...e.style},onMouseDown:A(e.onMouseDown,()=>{P.current=!0}),onFocus:A(e.onFocus,_=>{let z=!P.current;if(_.target===_.currentTarget&&z&&!w){let V=new CustomEvent(Rn,ox);if(_.currentTarget.dispatchEvent(V),!V.defaultPrevented){let K=S().filter(j=>j.focusable),F=K.find(j=>j.active),Y=K.find(j=>j.id===p),ae=[F,Y,...K].filter(Boolean).map(j=>j.ref.current);Su(ae,d)}}P.current=!1}),onBlur:A(e.onBlur,()=>C(!1))})})}),Lu="RovingFocusGroupItem",Iu=x((e,t)=>{let{__scopeRovingFocusGroup:a,focusable:o=!0,active:r=!1,tabStopId:n,children:s,...l}=e,i=Le(),u=n||i,d=lx(Lu,a),c=d.currentTabStopId===u,f=wu(a),{onFocusableItemAdd:m,onFocusableItemRemove:g,currentTabStopId:p}=d;return D(()=>{if(o)return m(),()=>g()},[o,m,g]),h(yn.ItemSlot,{scope:a,id:u,focusable:o,active:r,children:h(B.span,{tabIndex:c?0:-1,"data-orientation":d.orientation,...l,ref:t,onMouseDown:A(e.onMouseDown,v=>{o?d.onItemFocus(u):v.preventDefault()}),onFocus:A(e.onFocus,()=>d.onItemFocus(u)),onKeyDown:A(e.onKeyDown,v=>{if(v.key==="Tab"&&v.shiftKey){d.onItemShiftTab();return}if(v.target!==v.currentTarget)return;let w=dx(v,d.orientation,d.dir);if(w!==void 0){if(v.metaKey||v.ctrlKey||v.altKey||v.shiftKey)return;v.preventDefault();let L=f().filter(S=>S.focusable).map(S=>S.ref.current);if(w==="last")L.reverse();else if(w==="prev"||w==="next"){w==="prev"&&L.reverse();let S=L.indexOf(v.currentTarget);L=d.loop?fx(L,S+1):L.slice(S+1)}setTimeout(()=>Su(L))}}),children:typeof s=="function"?s({isCurrentTabStop:c,hasTabStop:p!=null}):s})})});Iu.displayName=Lu;var ux={ArrowLeft:"prev",ArrowUp:"prev",ArrowRight:"next",ArrowDown:"next",PageUp:"first",Home:"first",PageDown:"last",End:"last"};function cx(e,t){return t!=="rtl"?e:e==="ArrowLeft"?"ArrowRight":e==="ArrowRight"?"ArrowLeft":e}function dx(e,t,a){let o=cx(e.key,a);if(!(t==="vertical"&&["ArrowLeft","ArrowRight"].includes(o))&&!(t==="horizontal"&&["ArrowUp","ArrowDown"].includes(o)))return ux[o]}function Su(e,t=!1){let a=document.activeElement;for(let o of e)if(o===a||(o.focus({preventScroll:t}),document.activeElement!==a))return}function fx(e,t){return e.map((a,o)=>e[(t+o)%e.length])}var Qo=Cu,er=Iu;var Pn=["Enter"," "],px=["ArrowDown","PageUp","Home"],yu=["ArrowUp","PageDown","End"],mx=[...px,...yu],hx={ltr:[...Pn,"ArrowRight"],rtl:[...Pn,"ArrowLeft"]},xx={ltr:["ArrowLeft"],rtl:["ArrowRight"]},io="Menu",[so,gx,vx]=Tt(io),[ea,Tn]=ue(io,[vx,vt,Na]),uo=vt(),Pu=Na(),[Tu,kt]=ea(io),[wx,co]=ea(io),ku=e=>{let{__scopeMenu:t,open:a=!1,children:o,dir:r,onOpenChange:n,modal:s=!0}=e,l=uo(t),[i,u]=M(null),d=y(!1),c=de(n),f=ze(r);return D(()=>{let m=()=>{d.current=!0,document.addEventListener("pointerdown",g,{capture:!0,once:!0}),document.addEventListener("pointermove",g,{capture:!0,once:!0})},g=()=>d.current=!1;return document.addEventListener("keydown",m,{capture:!0}),()=>{document.removeEventListener("keydown",m,{capture:!0}),document.removeEventListener("pointerdown",g,{capture:!0}),document.removeEventListener("pointermove",g,{capture:!0})}},[]),h(Qt,{...l,children:h(Tu,{scope:t,open:a,onOpenChange:c,content:i,onContentChange:u,children:h(wx,{scope:t,onClose:H(()=>c(!1),[c]),isUsingKeyboardRef:d,dir:f,modal:s,children:o})})})};ku.displayName=io;var Cx="MenuAnchor",kn=x((e,t)=>{let{__scopeMenu:a,...o}=e,r=uo(a);return h(Da,{...r,...o,ref:t})});kn.displayName=Cx;var Mn="MenuPortal",[Lx,Mu]=ea(Mn,{forceMount:void 0}),Au=e=>{let{__scopeMenu:t,forceMount:a,children:o,container:r}=e,n=kt(Mn,t);return h(Lx,{scope:t,forceMount:a,children:h(xe,{present:a||n.open,children:h(xt,{asChild:!0,container:r,children:o})})})};Au.displayName=Mn;var Ge="MenuContent",[Ix,An]=ea(Ge),Du=x((e,t)=>{let a=Mu(Ge,e.__scopeMenu),{forceMount:o=a.forceMount,...r}=e,n=kt(Ge,e.__scopeMenu),s=co(Ge,e.__scopeMenu);return h(so.Provider,{scope:e.__scopeMenu,children:h(xe,{present:o||n.open,children:h(so.Slot,{scope:e.__scopeMenu,children:s.modal?h(Sx,{...r,ref:t}):h(bx,{...r,ref:t})})})})}),Sx=x((e,t)=>{let a=kt(Ge,e.__scopeMenu),o=y(null),r=X(t,o);return D(()=>{let n=o.current;if(n)return Ra(n)},[]),h(Dn,{...e,ref:r,trapFocus:a.open,disableOutsidePointerEvents:a.open,disableOutsideScroll:!0,onFocusOutside:A(e.onFocusOutside,n=>n.preventDefault(),{checkForDefaultPrevented:!1}),onDismiss:()=>a.onOpenChange(!1)})}),bx=x((e,t)=>{let a=kt(Ge,e.__scopeMenu);return h(Dn,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,disableOutsideScroll:!1,onDismiss:()=>a.onOpenChange(!1)})}),Rx=qe("MenuContent.ScrollLock"),Dn=x((e,t)=>{let{__scopeMenu:a,loop:o=!1,trapFocus:r,onOpenAutoFocus:n,onCloseAutoFocus:s,disableOutsidePointerEvents:l,onEntryFocus:i,onEscapeKeyDown:u,onPointerDownOutside:d,onFocusOutside:c,onInteractOutside:f,onDismiss:m,disableOutsideScroll:g,...p}=e,v=kt(Ge,a),w=co(Ge,a),C=uo(a),L=Pu(a),S=gx(a),[P,E]=M(null),T=y(null),_=X(t,T,v.onContentChange),z=y(0),V=y(""),K=y(0),F=y(null),Y=y("right"),$=y(0),ae=g?Wt:Ke,j=g?{as:Rx,allowPinchZoom:!0}:void 0,J=O=>{let ee=V.current+O,se=S().filter(W=>!W.disabled),pe=document.activeElement,Oe=se.find(W=>W.ref.current===pe)?.textValue,ye=se.map(W=>W.textValue),Ie=_x(ye,ee,Oe),we=se.find(W=>W.textValue===Ie)?.ref.current;(function W(oe){V.current=oe,window.clearTimeout(z.current),oe!==""&&(z.current=window.setTimeout(()=>W(""),1e3))})(ee),we&&setTimeout(()=>we.focus())};D(()=>()=>window.clearTimeout(z.current),[]),La();let U=H(O=>Y.current===F.current?.side&&Ux(O,F.current?.area),[]);return h(Ix,{scope:a,searchRef:V,onItemEnter:H(O=>{U(O)&&O.preventDefault()},[U]),onItemLeave:H(O=>{U(O)||(T.current?.focus(),E(null))},[U]),onTriggerLeave:H(O=>{U(O)&&O.preventDefault()},[U]),pointerGraceTimerRef:K,onPointerGraceIntentChange:H(O=>{F.current=O},[]),children:h(ae,{...j,children:h(Ut,{asChild:!0,trapped:r,onMountAutoFocus:A(n,O=>{O.preventDefault(),T.current?.focus({preventScroll:!0})}),onUnmountAutoFocus:s,children:h(ht,{asChild:!0,disableOutsidePointerEvents:l,onEscapeKeyDown:u,onPointerDownOutside:d,onFocusOutside:c,onInteractOutside:f,onDismiss:m,children:h(Qo,{asChild:!0,...L,dir:w.dir,orientation:"vertical",loop:o,currentTabStopId:P,onCurrentTabStopIdChange:E,onEntryFocus:A(i,O=>{w.isUsingKeyboardRef.current||O.preventDefault()}),preventScrollOnEntryFocus:!0,children:h(Ea,{role:"menu","aria-orientation":"vertical","data-state":ju(v.open),"data-radix-menu-content":"",dir:w.dir,...C,...p,ref:_,style:{outline:"none",...p.style},onKeyDown:A(p.onKeyDown,O=>{let se=O.target.closest("[data-radix-menu-content]")===O.currentTarget,pe=O.ctrlKey||O.altKey||O.metaKey,Oe=O.key.length===1;se&&(O.key==="Tab"&&O.preventDefault(),!pe&&Oe&&J(O.key));let ye=T.current;if(O.target!==ye||!mx.includes(O.key))return;O.preventDefault();let we=S().filter(W=>!W.disabled).map(W=>W.ref.current);yu.includes(O.key)&&we.reverse(),Fx(we)}),onBlur:A(e.onBlur,O=>{O.currentTarget.contains(O.target)||(window.clearTimeout(z.current),V.current="")}),onPointerMove:A(e.onPointerMove,lo(O=>{let ee=O.target,se=$.current!==O.clientX;if(O.currentTarget.contains(ee)&&se){let pe=O.clientX>$.current?"right":"left";Y.current=pe,$.current=O.clientX}}))})})})})})})});Du.displayName=Ge;var yx="MenuGroup",En=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(B.div,{role:"group",...o,ref:t})});En.displayName=yx;var Px="MenuLabel",Eu=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(B.div,{...o,ref:t})});Eu.displayName=Px;var tr="MenuItem",Ru="menu.itemSelect",or=x((e,t)=>{let{disabled:a=!1,onSelect:o,...r}=e,n=y(null),s=co(tr,e.__scopeMenu),l=An(tr,e.__scopeMenu),i=X(t,n),u=y(!1),d=()=>{let c=n.current;if(!a&&c){let f=new CustomEvent(Ru,{bubbles:!0,cancelable:!0});c.addEventListener(Ru,m=>o?.(m),{once:!0}),Po(c,f),f.defaultPrevented?u.current=!1:s.onClose()}};return h(Ou,{...r,ref:i,disabled:a,onClick:A(e.onClick,d),onPointerDown:c=>{e.onPointerDown?.(c),u.current=!0},onPointerUp:A(e.onPointerUp,c=>{u.current||c.currentTarget?.click()}),onKeyDown:A(e.onKeyDown,c=>{let f=l.searchRef.current!=="";a||f&&c.key===" "||Pn.includes(c.key)&&(c.currentTarget.click(),c.preventDefault())})})});or.displayName=tr;var Ou=x((e,t)=>{let{__scopeMenu:a,disabled:o=!1,textValue:r,...n}=e,s=An(tr,a),l=Pu(a),i=y(null),u=X(t,i),[d,c]=M(!1),[f,m]=M("");return D(()=>{let g=i.current;g&&m((g.textContent??"").trim())},[n.children]),h(so.ItemSlot,{scope:a,disabled:o,textValue:r??f,children:h(er,{asChild:!0,...l,focusable:!o,children:h(B.div,{role:"menuitem","data-highlighted":d?"":void 0,"aria-disabled":o||void 0,"data-disabled":o?"":void 0,...n,ref:u,onPointerMove:A(e.onPointerMove,lo(g=>{o?s.onItemLeave(g):(s.onItemEnter(g),g.defaultPrevented||g.currentTarget.focus({preventScroll:!0}))})),onPointerLeave:A(e.onPointerLeave,lo(g=>s.onItemLeave(g))),onFocus:A(e.onFocus,()=>c(!0)),onBlur:A(e.onBlur,()=>c(!1))})})})}),Tx="MenuCheckboxItem",Nu=x((e,t)=>{let{checked:a=!1,onCheckedChange:o,...r}=e;return h(Uu,{scope:e.__scopeMenu,checked:a,children:h(or,{role:"menuitemcheckbox","aria-checked":ar(a)?"mixed":a,...r,ref:t,"data-state":Fn(a),onSelect:A(r.onSelect,()=>o?.(ar(a)?!0:!a),{checkForDefaultPrevented:!1})})})});Nu.displayName=Tx;var Fu="MenuRadioGroup",[kx,Mx]=ea(Fu,{value:void 0,onValueChange:()=>{}}),Bu=x((e,t)=>{let{value:a,onValueChange:o,...r}=e,n=de(o);return h(kx,{scope:e.__scopeMenu,value:a,onValueChange:n,children:h(En,{...r,ref:t})})});Bu.displayName=Fu;var _u="MenuRadioItem",Hu=x((e,t)=>{let{value:a,...o}=e,r=Mx(_u,e.__scopeMenu),n=a===r.value;return h(Uu,{scope:e.__scopeMenu,checked:n,children:h(or,{role:"menuitemradio","aria-checked":n,...o,ref:t,"data-state":Fn(n),onSelect:A(o.onSelect,()=>r.onValueChange?.(a),{checkForDefaultPrevented:!1})})})});Hu.displayName=_u;var On="MenuItemIndicator",[Uu,Ax]=ea(On,{checked:!1}),qu=x((e,t)=>{let{__scopeMenu:a,forceMount:o,...r}=e,n=Ax(On,a);return h(xe,{present:o||ar(n.checked)||n.checked===!0,children:h(B.span,{...r,ref:t,"data-state":Fn(n.checked)})})});qu.displayName=On;var Dx="MenuSeparator",zu=x((e,t)=>{let{__scopeMenu:a,...o}=e;return h(B.div,{role:"separator","aria-orientation":"horizontal",...o,ref:t})});zu.displayName=Dx;var Ex="MenuArrow",Vu=x((e,t)=>{let{__scopeMenu:a,...o}=e,r=uo(a);return h(Oa,{...r,...o,ref:t})});Vu.displayName=Ex;var Nn="MenuSub",[Ox,Wu]=ea(Nn),Nx=e=>{let{__scopeMenu:t,children:a,open:o=!1,onOpenChange:r}=e,n=kt(Nn,t),s=uo(t),[l,i]=M(null),[u,d]=M(null),c=de(r);return D(()=>(n.open===!1&&c(!1),()=>c(!1)),[n.open,c]),h(Qt,{...s,children:h(Tu,{scope:t,open:o,onOpenChange:c,content:u,onContentChange:d,children:h(Ox,{scope:t,contentId:Le(),triggerId:Le(),trigger:l,onTriggerChange:i,children:a})})})};Nx.displayName=Nn;var no="MenuSubTrigger",Gu=x((e,t)=>{let a=kt(no,e.__scopeMenu),o=co(no,e.__scopeMenu),r=Wu(no,e.__scopeMenu),n=An(no,e.__scopeMenu),s=y(null),{pointerGraceTimerRef:l,onPointerGraceIntentChange:i}=n,u={__scopeMenu:e.__scopeMenu},d=H(()=>{s.current&&window.clearTimeout(s.current),s.current=null},[]);return D(()=>d,[d]),D(()=>{let c=l.current;return()=>{window.clearTimeout(c),i(null)}},[l,i]),h(kn,{asChild:!0,...u,children:h(Ou,{id:r.triggerId,"aria-haspopup":"menu","aria-expanded":a.open,"aria-controls":a.open?r.contentId:void 0,"data-state":ju(a.open),...e,ref:ja(t,r.onTriggerChange),onClick:c=>{e.onClick?.(c),!(e.disabled||c.defaultPrevented)&&(c.currentTarget.focus(),a.open||a.onOpenChange(!0))},onPointerMove:A(e.onPointerMove,lo(c=>{n.onItemEnter(c),!c.defaultPrevented&&!e.disabled&&!a.open&&!s.current&&(n.onPointerGraceIntentChange(null),s.current=window.setTimeout(()=>{a.onOpenChange(!0),d()},100))})),onPointerLeave:A(e.onPointerLeave,lo(c=>{d();let f=a.content?.getBoundingClientRect();if(f){let m=a.content?.dataset.side,g=m==="right",p=g?-5:5,v=f[g?"left":"right"],w=f[g?"right":"left"];n.onPointerGraceIntentChange({area:[{x:c.clientX+p,y:c.clientY},{x:v,y:f.top},{x:w,y:f.top},{x:w,y:f.bottom},{x:v,y:f.bottom}],side:m}),window.clearTimeout(l.current),l.current=window.setTimeout(()=>n.onPointerGraceIntentChange(null),300)}else{if(n.onTriggerLeave(c),c.defaultPrevented)return;n.onPointerGraceIntentChange(null)}})),onKeyDown:A(e.onKeyDown,c=>{let f=n.searchRef.current!=="";e.disabled||f&&c.key===" "||hx[o.dir].includes(c.key)&&(a.onOpenChange(!0),a.content?.focus(),c.preventDefault())})})})});Gu.displayName=no;var Xu="MenuSubContent",Ku=x((e,t)=>{let a=Mu(Ge,e.__scopeMenu),{forceMount:o=a.forceMount,align:r="start",...n}=e,s=kt(Ge,e.__scopeMenu),l=co(Ge,e.__scopeMenu),i=Wu(Xu,e.__scopeMenu),u=y(null),d=X(t,u);return h(so.Provider,{scope:e.__scopeMenu,children:h(xe,{present:o||s.open,children:h(so.Slot,{scope:e.__scopeMenu,children:h(Dn,{id:i.contentId,"aria-labelledby":i.triggerId,...n,ref:d,align:r,side:l.dir==="rtl"?"left":"right",disableOutsidePointerEvents:!1,disableOutsideScroll:!1,trapFocus:!1,onOpenAutoFocus:c=>{l.isUsingKeyboardRef.current&&u.current?.focus(),c.preventDefault()},onCloseAutoFocus:c=>c.preventDefault(),onFocusOutside:A(e.onFocusOutside,c=>{c.target!==i.trigger&&s.onOpenChange(!1)}),onEscapeKeyDown:A(e.onEscapeKeyDown,c=>{l.onClose(),c.preventDefault()}),onKeyDown:A(e.onKeyDown,c=>{let f=c.currentTarget.contains(c.target),m=xx[l.dir].includes(c.key);f&&m&&(s.onOpenChange(!1),i.trigger?.focus(),c.preventDefault())})})})})})});Ku.displayName=Xu;function ju(e){return e?"open":"closed"}function ar(e){return e==="indeterminate"}function Fn(e){return ar(e)?"indeterminate":e?"checked":"unchecked"}function Fx(e){let t=document.activeElement;for(let a of e)if(a===t||(a.focus(),document.activeElement!==t))return}function Bx(e,t){return e.map((a,o)=>e[(t+o)%e.length])}function _x(e,t,a){let r=t.length>1&&Array.from(t).every(u=>u===t[0])?t[0]:t,n=a?e.indexOf(a):-1,s=Bx(e,Math.max(n,0));r.length===1&&(s=s.filter(u=>u!==a));let i=s.find(u=>u.toLowerCase().startsWith(r.toLowerCase()));return i!==a?i:void 0}function Hx(e,t){let{x:a,y:o}=e,r=!1;for(let n=0,s=t.length-1;n<t.length;s=n++){let l=t[n],i=t[s],u=l.x,d=l.y,c=i.x,f=i.y;d>o!=f>o&&a<(c-u)*(o-d)/(f-d)+u&&(r=!r)}return r}function Ux(e,t){if(!t)return!1;let a={x:e.clientX,y:e.clientY};return Hx(a,t)}function lo(e){return t=>t.pointerType==="mouse"?e(t):void 0}var $u=ku,Yu=kn,Ju=Au,Zu=Du,Qu=En,ec=Eu,tc=or,ac=Nu,oc=Bu,rc=Hu,nc=qu,sc=zu,lc=Vu;var ic=Gu,uc=Ku;var rr="DropdownMenu",[zx,yR]=ue(rr,[Tn]),Ee=Tn(),[Vx,cc]=zx(rr),Wx=e=>{let{__scopeDropdownMenu:t,children:a,dir:o,open:r,defaultOpen:n,onOpenChange:s,modal:l=!0}=e,i=Ee(t),u=y(null),[d,c]=be({prop:r,defaultProp:n??!1,onChange:s,caller:rr});return h(Vx,{scope:t,triggerId:Le(),triggerRef:u,contentId:Le(),open:d,onOpenChange:c,onOpenToggle:H(()=>c(f=>!f),[c]),modal:l,children:h($u,{...i,open:d,onOpenChange:c,dir:o,modal:l,children:a})})};Wx.displayName=rr;var dc="DropdownMenuTrigger",Gx=x((e,t)=>{let{__scopeDropdownMenu:a,disabled:o=!1,...r}=e,n=cc(dc,a),s=Ee(a);return h(Yu,{asChild:!0,...s,children:h(B.button,{type:"button",id:n.triggerId,"aria-haspopup":"menu","aria-expanded":n.open,"aria-controls":n.open?n.contentId:void 0,"data-state":n.open?"open":"closed","data-disabled":o?"":void 0,disabled:o,...r,ref:ja(t,n.triggerRef),onPointerDown:A(e.onPointerDown,l=>{!o&&l.button===0&&l.ctrlKey===!1&&(n.onOpenToggle(),n.open||l.preventDefault())}),onKeyDown:A(e.onKeyDown,l=>{o||(["Enter"," "].includes(l.key)&&n.onOpenToggle(),l.key==="ArrowDown"&&n.onOpenChange(!0),["Enter"," ","ArrowDown"].includes(l.key)&&l.preventDefault())})})})});Gx.displayName=dc;var Xx="DropdownMenuPortal",fc=e=>{let{__scopeDropdownMenu:t,...a}=e,o=Ee(t);return h(Ju,{...o,...a})};fc.displayName=Xx;var pc="DropdownMenuContent",mc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=cc(pc,a),n=Ee(a),s=y(!1);return h(Zu,{id:r.contentId,"aria-labelledby":r.triggerId,...n,...o,ref:t,onCloseAutoFocus:A(e.onCloseAutoFocus,l=>{s.current||r.triggerRef.current?.focus(),s.current=!1,l.preventDefault()}),onInteractOutside:A(e.onInteractOutside,l=>{let i=l.detail.originalEvent,u=i.button===0&&i.ctrlKey===!0,d=i.button===2||u;(!r.modal||d)&&(s.current=!0)}),style:{...e.style,"--radix-dropdown-menu-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-dropdown-menu-content-available-width":"var(--radix-popper-available-width)","--radix-dropdown-menu-content-available-height":"var(--radix-popper-available-height)","--radix-dropdown-menu-trigger-width":"var(--radix-popper-anchor-width)","--radix-dropdown-menu-trigger-height":"var(--radix-popper-anchor-height)"}})});mc.displayName=pc;var Kx="DropdownMenuGroup",jx=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(Qu,{...r,...o,ref:t})});jx.displayName=Kx;var $x="DropdownMenuLabel",hc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(ec,{...r,...o,ref:t})});hc.displayName=$x;var Yx="DropdownMenuItem",xc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(tc,{...r,...o,ref:t})});xc.displayName=Yx;var Jx="DropdownMenuCheckboxItem",gc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(ac,{...r,...o,ref:t})});gc.displayName=Jx;var Zx="DropdownMenuRadioGroup",Qx=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(oc,{...r,...o,ref:t})});Qx.displayName=Zx;var eg="DropdownMenuRadioItem",vc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(rc,{...r,...o,ref:t})});vc.displayName=eg;var tg="DropdownMenuItemIndicator",wc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(nc,{...r,...o,ref:t})});wc.displayName=tg;var ag="DropdownMenuSeparator",Cc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(sc,{...r,...o,ref:t})});Cc.displayName=ag;var og="DropdownMenuArrow",rg=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(lc,{...r,...o,ref:t})});rg.displayName=og;var ng="DropdownMenuSubTrigger",Lc=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(ic,{...r,...o,ref:t})});Lc.displayName=ng;var sg="DropdownMenuSubContent",Ic=x((e,t)=>{let{__scopeDropdownMenu:a,...o}=e,r=Ee(a);return h(uc,{...r,...o,ref:t,style:{...e.style,"--radix-dropdown-menu-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-dropdown-menu-content-available-width":"var(--radix-popper-available-width)","--radix-dropdown-menu-content-available-height":"var(--radix-popper-available-height)","--radix-dropdown-menu-trigger-width":"var(--radix-popper-anchor-width)","--radix-dropdown-menu-trigger-height":"var(--radix-popper-anchor-height)"}})});Ic.displayName=sg;var Sc=fc,Bn=mc;var _n=hc,Hn=xc,Un=gc;var qn=vc,zn=wc,Vn=Cc;var Wn=Lc,Gn=Ic;var ig=x(({className:e,inset:t,children:a,...o},r)=>I(Wn,{ref:r,className:N("xps-dropdown-menu-sub-trigger",t&&"xps-dropdown-menu-item--inset",e),...o},a,I(ca,{className:"xps-icon"})));ig.displayName=Wn.displayName;var ug=x(({className:e,...t},a)=>I(Gn,{ref:a,className:N("xps-dropdown-menu-content",e),...t}));ug.displayName=Gn.displayName;var cg=x(({className:e,sideOffset:t=4,...a},o)=>I(Sc,null,I(Bn,{ref:o,sideOffset:t,className:N("xps-dropdown-menu-content",e),...a})));cg.displayName=Bn.displayName;var dg=x(({className:e,inset:t,...a},o)=>I(Hn,{ref:o,className:N("xps-dropdown-menu-item",t&&"xps-dropdown-menu-item--inset",e),...a}));dg.displayName=Hn.displayName;var fg=x(({className:e,children:t,checked:a,...o},r)=>I(Un,{ref:r,className:N("xps-dropdown-menu-item xps-dropdown-menu-check-item",e),checked:a,...o},I("span",{className:"xps-dropdown-menu-item-indicator"},I(zn,null,I(Ue,{className:"xps-icon"}))),t));fg.displayName=Un.displayName;var pg=x(({className:e,children:t,...a},o)=>I(qn,{ref:o,className:N("xps-dropdown-menu-item xps-dropdown-menu-check-item",e),...a},I("span",{className:"xps-dropdown-menu-item-indicator"},I(zn,null,I(Ka,{className:"xps-icon xps-icon--filled"}))),t));pg.displayName=qn.displayName;var mg=x(({className:e,inset:t,...a},o)=>I(_n,{ref:o,className:N("xps-dropdown-menu-label",t&&"xps-dropdown-menu-item--inset",e),...a}));mg.displayName=_n.displayName;var hg=x(({className:e,...t},a)=>I(Vn,{ref:a,className:N("xps-dropdown-menu-separator",e),...t}));hg.displayName=Vn.displayName;var xg=x(({className:e,...t},a)=>I("span",{ref:a,className:N("xps-dropdown-menu-shortcut",e),...t}));xg.displayName="DropdownMenuShortcut";var wt=x(({className:e,type:t,...a},o)=>I("input",{ref:o,type:t,className:N("xps-input",e),...a}));wt.displayName="Input";function Mt(e,[t,a]){return Math.min(a,Math.max(t,e))}function gg(e,t){return ia((a,o)=>t[a][o]??a,e)}var Xn="ScrollArea",[Rc,jR]=ue(Xn),[vg,Xe]=Rc(Xn),yc=x((e,t)=>{let{__scopeScrollArea:a,type:o="hover",dir:r,scrollHideDelay:n=600,...s}=e,[l,i]=M(null),[u,d]=M(null),[c,f]=M(null),[m,g]=M(null),[p,v]=M(null),[w,C]=M(0),[L,S]=M(0),[P,E]=M(!1),[T,_]=M(!1),z=X(t,K=>i(K)),V=ze(r);return h(vg,{scope:a,type:o,dir:V,scrollHideDelay:n,scrollArea:l,viewport:u,onViewportChange:d,content:c,onContentChange:f,scrollbarX:m,onScrollbarXChange:g,scrollbarXEnabled:P,onScrollbarXEnabledChange:E,scrollbarY:p,onScrollbarYChange:v,scrollbarYEnabled:T,onScrollbarYEnabledChange:_,onCornerWidthChange:C,onCornerHeightChange:S,children:h(B.div,{dir:V,...s,ref:z,style:{position:"relative","--radix-scroll-area-corner-width":w+"px","--radix-scroll-area-corner-height":L+"px",...e.style}})})});yc.displayName=Xn;var Pc="ScrollAreaViewport",Tc=x((e,t)=>{let{__scopeScrollArea:a,children:o,nonce:r,...n}=e,s=Xe(Pc,a),l=y(null),i=X(t,l,s.onViewportChange);return Re(Ae,{children:[h("style",{dangerouslySetInnerHTML:{__html:"[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}"},nonce:r}),h(B.div,{"data-radix-scroll-area-viewport":"",...n,ref:i,style:{overflowX:s.scrollbarXEnabled?"scroll":"hidden",overflowY:s.scrollbarYEnabled?"scroll":"hidden",...e.style},children:h("div",{ref:s.onContentChange,style:{minWidth:"100%",display:"table"},children:o})})]})});Tc.displayName=Pc;var lt="ScrollAreaScrollbar",lr=x((e,t)=>{let{forceMount:a,...o}=e,r=Xe(lt,e.__scopeScrollArea),{onScrollbarXEnabledChange:n,onScrollbarYEnabledChange:s}=r,l=e.orientation==="horizontal";return D(()=>(l?n(!0):s(!0),()=>{l?n(!1):s(!1)}),[l,n,s]),r.type==="hover"?h(wg,{...o,ref:t,forceMount:a}):r.type==="scroll"?h(Cg,{...o,ref:t,forceMount:a}):r.type==="auto"?h(kc,{...o,ref:t,forceMount:a}):r.type==="always"?h(Kn,{...o,ref:t,"data-state":"visible"}):null});lr.displayName=lt;var wg=x((e,t)=>{let{forceMount:a,...o}=e,r=Xe(lt,e.__scopeScrollArea),[n,s]=M(!1);return D(()=>{let l=r.scrollArea,i=0;if(l){let u=()=>{window.clearTimeout(i),s(!0)},d=()=>{i=window.setTimeout(()=>s(!1),r.scrollHideDelay)};return l.addEventListener("pointerenter",u),l.addEventListener("pointerleave",d),()=>{window.clearTimeout(i),l.removeEventListener("pointerenter",u),l.removeEventListener("pointerleave",d)}}},[r.scrollArea,r.scrollHideDelay]),h(xe,{present:a||n,children:h(kc,{"data-state":n?"visible":"hidden",...o,ref:t})})}),Cg=x((e,t)=>{let{forceMount:a,...o}=e,r=Xe(lt,e.__scopeScrollArea),n=e.orientation==="horizontal",s=ur(()=>i("SCROLL_END"),100),[l,i]=gg("hidden",{hidden:{SCROLL:"scrolling"},scrolling:{SCROLL_END:"idle",POINTER_ENTER:"interacting"},interacting:{SCROLL:"interacting",POINTER_LEAVE:"idle"},idle:{HIDE:"hidden",SCROLL:"scrolling",POINTER_ENTER:"interacting"}});return D(()=>{if(l==="idle"){let u=window.setTimeout(()=>i("HIDE"),r.scrollHideDelay);return()=>window.clearTimeout(u)}},[l,r.scrollHideDelay,i]),D(()=>{let u=r.viewport,d=n?"scrollLeft":"scrollTop";if(u){let c=u[d],f=()=>{let m=u[d];c!==m&&(i("SCROLL"),s()),c=m};return u.addEventListener("scroll",f),()=>u.removeEventListener("scroll",f)}},[r.viewport,n,i,s]),h(xe,{present:a||l!=="hidden",children:h(Kn,{"data-state":l==="hidden"?"hidden":"visible",...o,ref:t,onPointerEnter:A(e.onPointerEnter,()=>i("POINTER_ENTER")),onPointerLeave:A(e.onPointerLeave,()=>i("POINTER_LEAVE"))})})}),kc=x((e,t)=>{let a=Xe(lt,e.__scopeScrollArea),{forceMount:o,...r}=e,[n,s]=M(!1),l=e.orientation==="horizontal",i=ur(()=>{if(a.viewport){let u=a.viewport.offsetWidth<a.viewport.scrollWidth,d=a.viewport.offsetHeight<a.viewport.scrollHeight;s(l?u:d)}},10);return Fa(a.viewport,i),Fa(a.content,i),h(xe,{present:o||n,children:h(Kn,{"data-state":n?"visible":"hidden",...r,ref:t})})}),Kn=x((e,t)=>{let{orientation:a="vertical",...o}=e,r=Xe(lt,e.__scopeScrollArea),n=y(null),s=y(0),[l,i]=M({content:0,viewport:0,scrollbar:{size:0,paddingStart:0,paddingEnd:0}}),u=Ec(l.viewport,l.content),d={...o,sizes:l,onSizesChange:i,hasThumb:u>0&&u<1,onThumbChange:f=>n.current=f,onThumbPointerUp:()=>s.current=0,onThumbPointerDown:f=>s.current=f};function c(f,m){return yg(f,s.current,l,m)}return a==="horizontal"?h(Lg,{...d,ref:t,onThumbPositionChange:()=>{if(r.viewport&&n.current){let f=r.viewport.scrollLeft,m=bc(f,l,r.dir);n.current.style.transform=`translate3d(${m}px, 0, 0)`}},onWheelScroll:f=>{r.viewport&&(r.viewport.scrollLeft=f)},onDragScroll:f=>{r.viewport&&(r.viewport.scrollLeft=c(f,r.dir))}}):a==="vertical"?h(Ig,{...d,ref:t,onThumbPositionChange:()=>{if(r.viewport&&n.current){let f=r.viewport.scrollTop,m=bc(f,l);n.current.style.transform=`translate3d(0, ${m}px, 0)`}},onWheelScroll:f=>{r.viewport&&(r.viewport.scrollTop=f)},onDragScroll:f=>{r.viewport&&(r.viewport.scrollTop=c(f))}}):null}),Lg=x((e,t)=>{let{sizes:a,onSizesChange:o,...r}=e,n=Xe(lt,e.__scopeScrollArea),[s,l]=M(),i=y(null),u=X(t,i,n.onScrollbarXChange);return D(()=>{i.current&&l(getComputedStyle(i.current))},[i]),h(Ac,{"data-orientation":"horizontal",...r,ref:u,sizes:a,style:{bottom:0,left:n.dir==="rtl"?"var(--radix-scroll-area-corner-width)":0,right:n.dir==="ltr"?"var(--radix-scroll-area-corner-width)":0,"--radix-scroll-area-thumb-width":ir(a)+"px",...e.style},onThumbPointerDown:d=>e.onThumbPointerDown(d.x),onDragScroll:d=>e.onDragScroll(d.x),onWheelScroll:(d,c)=>{if(n.viewport){let f=n.viewport.scrollLeft+d.deltaX;e.onWheelScroll(f),Nc(f,c)&&d.preventDefault()}},onResize:()=>{i.current&&n.viewport&&s&&o({content:n.viewport.scrollWidth,viewport:n.viewport.offsetWidth,scrollbar:{size:i.current.clientWidth,paddingStart:sr(s.paddingLeft),paddingEnd:sr(s.paddingRight)}})}})}),Ig=x((e,t)=>{let{sizes:a,onSizesChange:o,...r}=e,n=Xe(lt,e.__scopeScrollArea),[s,l]=M(),i=y(null),u=X(t,i,n.onScrollbarYChange);return D(()=>{i.current&&l(getComputedStyle(i.current))},[i]),h(Ac,{"data-orientation":"vertical",...r,ref:u,sizes:a,style:{top:0,right:n.dir==="ltr"?0:void 0,left:n.dir==="rtl"?0:void 0,bottom:"var(--radix-scroll-area-corner-height)","--radix-scroll-area-thumb-height":ir(a)+"px",...e.style},onThumbPointerDown:d=>e.onThumbPointerDown(d.y),onDragScroll:d=>e.onDragScroll(d.y),onWheelScroll:(d,c)=>{if(n.viewport){let f=n.viewport.scrollTop+d.deltaY;e.onWheelScroll(f),Nc(f,c)&&d.preventDefault()}},onResize:()=>{i.current&&n.viewport&&s&&o({content:n.viewport.scrollHeight,viewport:n.viewport.offsetHeight,scrollbar:{size:i.current.clientHeight,paddingStart:sr(s.paddingTop),paddingEnd:sr(s.paddingBottom)}})}})}),[Sg,Mc]=Rc(lt),Ac=x((e,t)=>{let{__scopeScrollArea:a,sizes:o,hasThumb:r,onThumbChange:n,onThumbPointerUp:s,onThumbPointerDown:l,onThumbPositionChange:i,onDragScroll:u,onWheelScroll:d,onResize:c,...f}=e,m=Xe(lt,a),[g,p]=M(null),v=X(t,z=>p(z)),w=y(null),C=y(""),L=m.viewport,S=o.content-o.viewport,P=de(d),E=de(i),T=ur(c,10);function _(z){if(w.current){let V=z.clientX-w.current.left,K=z.clientY-w.current.top;u({x:V,y:K})}}return D(()=>{let z=V=>{let K=V.target;g?.contains(K)&&P(V,S)};return document.addEventListener("wheel",z,{passive:!1}),()=>document.removeEventListener("wheel",z,{passive:!1})},[L,g,S,P]),D(E,[o,E]),Fa(g,T),Fa(m.content,T),h(Sg,{scope:a,scrollbar:g,hasThumb:r,onThumbChange:de(n),onThumbPointerUp:de(s),onThumbPositionChange:E,onThumbPointerDown:de(l),children:h(B.div,{...f,ref:v,style:{position:"absolute",...f.style},onPointerDown:A(e.onPointerDown,z=>{z.button===0&&(z.target.setPointerCapture(z.pointerId),w.current=g.getBoundingClientRect(),C.current=document.body.style.webkitUserSelect,document.body.style.webkitUserSelect="none",m.viewport&&(m.viewport.style.scrollBehavior="auto"),_(z))}),onPointerMove:A(e.onPointerMove,_),onPointerUp:A(e.onPointerUp,z=>{let V=z.target;V.hasPointerCapture(z.pointerId)&&V.releasePointerCapture(z.pointerId),document.body.style.webkitUserSelect=C.current,m.viewport&&(m.viewport.style.scrollBehavior=""),w.current=null})})})}),nr="ScrollAreaThumb",jn=x((e,t)=>{let{forceMount:a,...o}=e,r=Mc(nr,e.__scopeScrollArea);return h(xe,{present:a||r.hasThumb,children:h(bg,{ref:t,...o})})}),bg=x((e,t)=>{let{__scopeScrollArea:a,style:o,...r}=e,n=Xe(nr,a),s=Mc(nr,a),{onThumbPositionChange:l}=s,i=X(t,c=>s.onThumbChange(c)),u=y(void 0),d=ur(()=>{u.current&&(u.current(),u.current=void 0)},100);return D(()=>{let c=n.viewport;if(c){let f=()=>{if(d(),!u.current){let m=Pg(c,l);u.current=m,l()}};return l(),c.addEventListener("scroll",f),()=>c.removeEventListener("scroll",f)}},[n.viewport,d,l]),h(B.div,{"data-state":s.hasThumb?"visible":"hidden",...r,ref:i,style:{width:"var(--radix-scroll-area-thumb-width)",height:"var(--radix-scroll-area-thumb-height)",...o},onPointerDownCapture:A(e.onPointerDownCapture,c=>{let m=c.target.getBoundingClientRect(),g=c.clientX-m.left,p=c.clientY-m.top;s.onThumbPointerDown({x:g,y:p})}),onPointerUp:A(e.onPointerUp,s.onThumbPointerUp)})});jn.displayName=nr;var $n="ScrollAreaCorner",Dc=x((e,t)=>{let a=Xe($n,e.__scopeScrollArea),o=!!(a.scrollbarX&&a.scrollbarY);return a.type!=="scroll"&&o?h(Rg,{...e,ref:t}):null});Dc.displayName=$n;var Rg=x((e,t)=>{let{__scopeScrollArea:a,...o}=e,r=Xe($n,a),[n,s]=M(0),[l,i]=M(0),u=!!(n&&l);return Fa(r.scrollbarX,()=>{let d=r.scrollbarX?.offsetHeight||0;r.onCornerHeightChange(d),i(d)}),Fa(r.scrollbarY,()=>{let d=r.scrollbarY?.offsetWidth||0;r.onCornerWidthChange(d),s(d)}),u?h(B.div,{...o,ref:t,style:{width:n,height:l,position:"absolute",right:r.dir==="ltr"?0:void 0,left:r.dir==="rtl"?0:void 0,bottom:0,...e.style}}):null});function sr(e){return e?parseInt(e,10):0}function Ec(e,t){let a=e/t;return isNaN(a)?0:a}function ir(e){let t=Ec(e.viewport,e.content),a=e.scrollbar.paddingStart+e.scrollbar.paddingEnd,o=(e.scrollbar.size-a)*t;return Math.max(o,18)}function yg(e,t,a,o="ltr"){let r=ir(a),n=r/2,s=t||n,l=r-s,i=a.scrollbar.paddingStart+s,u=a.scrollbar.size-a.scrollbar.paddingEnd-l,d=a.content-a.viewport,c=o==="ltr"?[0,d]:[d*-1,0];return Oc([i,u],c)(e)}function bc(e,t,a="ltr"){let o=ir(t),r=t.scrollbar.paddingStart+t.scrollbar.paddingEnd,n=t.scrollbar.size-r,s=t.content-t.viewport,l=n-o,i=a==="ltr"?[0,s]:[s*-1,0],u=Mt(e,i);return Oc([0,s],[0,l])(u)}function Oc(e,t){return a=>{if(e[0]===e[1]||t[0]===t[1])return t[0];let o=(t[1]-t[0])/(e[1]-e[0]);return t[0]+o*(a-e[0])}}function Nc(e,t){return e>0&&e<t}var Pg=(e,t=()=>{})=>{let a={left:e.scrollLeft,top:e.scrollTop},o=0;return(function r(){let n={left:e.scrollLeft,top:e.scrollTop},s=a.left!==n.left,l=a.top!==n.top;(s||l)&&t(),a=n,o=window.requestAnimationFrame(r)})(),()=>window.cancelAnimationFrame(o)};function ur(e,t){let a=de(e),o=y(0);return D(()=>()=>window.clearTimeout(o.current),[]),H(()=>{window.clearTimeout(o.current),o.current=window.setTimeout(a,t)},[a,t])}function Fa(e,t){let a=de(t);ce(()=>{let o=0;if(e){let r=new ResizeObserver(()=>{cancelAnimationFrame(o),o=window.requestAnimationFrame(a)});return r.observe(e),()=>{window.cancelAnimationFrame(o),r.unobserve(e)}}},[e,a])}var Yn=yc,Fc=Tc;var Bc=Dc;var cr=x(({className:e,children:t,...a},o)=>I(Yn,{ref:o,className:N("xps-scroll-area",e),...a},I(Fc,{className:"xps-scroll-area-viewport"},t),I(_c,null),I(Bc,null)));cr.displayName=Yn.displayName;var _c=x(({className:e,orientation:t="vertical",...a},o)=>I(lr,{ref:o,orientation:t,className:N("xps-scroll-bar",t==="vertical"?"xps-scroll-bar-vertical":"xps-scroll-bar-horizontal",e),...a},I(jn,{className:"xps-scroll-thumb"})));_c.displayName=lr.displayName;var Jn=Object.freeze({position:"absolute",border:0,width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0, 0, 0, 0)",whiteSpace:"nowrap",wordWrap:"normal"}),kg="VisuallyHidden",Hc=x((e,t)=>h(B.span,{...e,ref:t,style:{...Jn,...e.style}}));Hc.displayName=kg;var Uc=Hc;var Ag=[" ","Enter","ArrowUp","ArrowDown"],Dg=[" ","Enter"],ta="Select",[fr,pr,Eg]=Tt(ta),[aa,Iy]=ue(ta,[Eg,vt]),mr=vt(),[Og,Dt]=aa(ta),[Ng,Fg]=aa(ta),Bg="SelectProvider";function qc(e){let{__scopeSelect:t,children:a,open:o,defaultOpen:r,onOpenChange:n,value:s,defaultValue:l,onValueChange:i,dir:u,name:d,autoComplete:c,disabled:f,required:m,form:g,internal_do_not_use_render:p}=e,v=mr(t),[w,C]=M(null),[L,S]=M(null),[P,E]=M(!1),T=ze(u),[_,z]=be({prop:o,defaultProp:r??!1,onChange:n,caller:ta}),[V,K]=be({prop:s,defaultProp:l,onChange:i,caller:ta}),F=y(null),Y=w?!!g||!!w.closest("form"):!0,[$,ae]=M(new Set),j=Le(),J=Array.from($).map(se=>se.props.value).join(";"),U=H(se=>{ae(pe=>new Set(pe).add(se))},[]),O=H(se=>{ae(pe=>{let Oe=new Set(pe);return Oe.delete(se),Oe})},[]),ee={required:m,trigger:w,onTriggerChange:C,valueNode:L,onValueNodeChange:S,valueNodeHasChildren:P,onValueNodeHasChildrenChange:E,contentId:j,value:V,onValueChange:K,open:_,onOpenChange:z,dir:T,triggerPointerDownPosRef:F,disabled:f,name:d,autoComplete:c,form:g,nativeOptions:$,nativeSelectKey:J,isFormControl:Y};return h(Qt,{...v,children:h(Og,{scope:t,...ee,children:h(fr.Provider,{scope:t,children:h(Ng,{scope:t,onNativeOptionAdd:U,onNativeOptionRemove:O,children:Jg(p)?p(ee):a})})})})}qc.displayName=Bg;var as=e=>{let{__scopeSelect:t,children:a,...o}=e;return h(qc,{__scopeSelect:t,...o,internal_do_not_use_render:({isFormControl:r})=>Re(Ae,{children:[a,r?h(od,{__scopeSelect:t}):null]})})};as.displayName=ta;var zc="SelectTrigger",hr=x((e,t)=>{let{__scopeSelect:a,disabled:o=!1,...r}=e,n=mr(a),s=Dt(zc,a),l=s.disabled||o,i=X(t,s.onTriggerChange),u=pr(a),d=y("touch"),[c,f,m]=rd(p=>{let v=u().filter(L=>!L.disabled),w=v.find(L=>L.value===s.value),C=nd(v,p,w);C!==void 0&&s.onValueChange(C.value)}),g=p=>{l||(s.onOpenChange(!0),m()),p&&(s.triggerPointerDownPosRef.current={x:Math.round(p.pageX),y:Math.round(p.pageY)})};return h(Da,{asChild:!0,...n,children:h(B.button,{type:"button",role:"combobox","aria-controls":s.open?s.contentId:void 0,"aria-expanded":s.open,"aria-required":s.required,"aria-autocomplete":"none",dir:s.dir,"data-state":s.open?"open":"closed",disabled:l,"data-disabled":l?"":void 0,"data-placeholder":cs(s.value)?"":void 0,...r,ref:i,onClick:A(r.onClick,p=>{p.currentTarget.focus(),d.current!=="mouse"&&g(p)}),onPointerDown:A(r.onPointerDown,p=>{d.current=p.pointerType;let v=p.target;v.hasPointerCapture(p.pointerId)&&v.releasePointerCapture(p.pointerId),p.button===0&&p.ctrlKey===!1&&p.pointerType==="mouse"&&(g(p),p.preventDefault())}),onKeyDown:A(r.onKeyDown,p=>{let v=c.current!=="";!(p.ctrlKey||p.altKey||p.metaKey)&&p.key.length===1&&f(p.key),!(v&&p.key===" ")&&Ag.includes(p.key)&&(g(),p.preventDefault())})})})});hr.displayName=zc;var Vc="SelectValue",os=x((e,t)=>{let{__scopeSelect:a,className:o,style:r,children:n,placeholder:s="",...l}=e,i=Dt(Vc,a),{onValueNodeHasChildrenChange:u}=i,d=n!==void 0,c=X(t,i.onValueNodeChange);ce(()=>{u(d)},[u,d]);let f=cs(i.value);return h(B.span,{...l,asChild:f?!1:l.asChild,ref:c,style:{pointerEvents:"none"},children:h(Ke,{children:f?s:n},f?"placeholder":"value")})});os.displayName=Vc;var _g="SelectIcon",rs=x((e,t)=>{let{__scopeSelect:a,children:o,...r}=e;return h(B.span,{"aria-hidden":!0,...r,ref:t,children:o||"\u25BC"})});rs.displayName=_g;var Wc="SelectPortal",[Hg,Ug]=aa(Wc,{forceMount:void 0}),ns=e=>{let{__scopeSelect:t,forceMount:a,...o}=e;return h(Hg,{scope:e.__scopeSelect,forceMount:a,children:h(xt,{asChild:!0,...o})})};ns.displayName=Wc;var At="SelectContent",xr=x((e,t)=>{let a=Ug(At,e.__scopeSelect),{forceMount:o=a.forceMount,...r}=e,n=Dt(At,e.__scopeSelect),[s,l]=M();return ce(()=>{l(new DocumentFragment)},[]),h(xe,{present:o||n.open,children:({present:i})=>i?h(Kc,{...r,ref:t}):h(Gc,{...r,fragment:s})})});xr.displayName=At;var Gc=x((e,t)=>{let{__scopeSelect:a,children:o,fragment:r}=e;return r?$a(h(Xc,{scope:a,children:h(fr.Slot,{scope:a,children:h("div",{ref:t,children:o})})}),r):null});Gc.displayName="SelectContentFragment";var Ze=10,[Xc,Et]=aa(At),qg="SelectContentImpl",zg=qe("SelectContent.RemoveScroll"),Kc=x((e,t)=>{let{__scopeSelect:a}=e,{position:o="item-aligned",onCloseAutoFocus:r,onEscapeKeyDown:n,onPointerDownOutside:s,side:l,sideOffset:i,align:u,alignOffset:d,arrowPadding:c,collisionBoundary:f,collisionPadding:m,sticky:g,hideWhenDetached:p,avoidCollisions:v,...w}=e,C=Dt(At,a),[L,S]=M(null),[P,E]=M(null),T=X(t,W=>S(W)),[_,z]=M(null),[V,K]=M(null),F=pr(a),[Y,$]=M(!1),ae=y(!1);D(()=>{if(L)return Ra(L)},[L]),La();let j=H(W=>{let[oe,...Se]=F().map(ge=>ge.ref.current),[le]=Se.slice(-1),k=document.activeElement;for(let ge of W)if(ge===k||(ge?.scrollIntoView({block:"nearest"}),ge===oe&&P&&(P.scrollTop=0),ge===le&&P&&(P.scrollTop=P.scrollHeight),ge?.focus(),document.activeElement!==k))return},[F,P]),J=H(()=>j([_,L]),[j,_,L]);D(()=>{Y&&J()},[Y,J]);let{onOpenChange:U,triggerPointerDownPosRef:O}=C;D(()=>{if(L){let W={x:0,y:0},oe=le=>{W={x:Math.abs(Math.round(le.pageX)-(O.current?.x??0)),y:Math.abs(Math.round(le.pageY)-(O.current?.y??0))}},Se=le=>{W.x<=10&&W.y<=10?le.preventDefault():le.composedPath().includes(L)||U(!1),document.removeEventListener("pointermove",oe),O.current=null};return O.current!==null&&(document.addEventListener("pointermove",oe),document.addEventListener("pointerup",Se,{capture:!0,once:!0})),()=>{document.removeEventListener("pointermove",oe),document.removeEventListener("pointerup",Se,{capture:!0})}}},[L,U,O]),D(()=>{let W=()=>U(!1);return window.addEventListener("blur",W),window.addEventListener("resize",W),()=>{window.removeEventListener("blur",W),window.removeEventListener("resize",W)}},[U]);let[ee,se]=rd(W=>{let oe=F().filter(k=>!k.disabled),Se=oe.find(k=>k.ref.current===document.activeElement),le=nd(oe,W,Se);le&&setTimeout(()=>le.ref.current.focus())}),pe=H((W,oe,Se)=>{let le=!ae.current&&!Se;(C.value!==void 0&&C.value===oe||le)&&(z(W),le&&(ae.current=!0))},[C.value]),Oe=H(()=>L?.focus(),[L]),ye=H((W,oe,Se)=>{let le=!ae.current&&!Se;(C.value!==void 0&&C.value===oe||le)&&K(W)},[C.value]),Ie=o==="popper"?Zn:jc,we=Ie===Zn?{side:l,sideOffset:i,align:u,alignOffset:d,arrowPadding:c,collisionBoundary:f,collisionPadding:m,sticky:g,hideWhenDetached:p,avoidCollisions:v}:{};return h(Xc,{scope:a,content:L,viewport:P,onViewportChange:E,itemRefCallback:pe,selectedItem:_,onItemLeave:Oe,itemTextRefCallback:ye,focusSelectedItem:J,selectedItemText:V,position:o,isPositioned:Y,searchRef:ee,children:h(Wt,{as:zg,allowPinchZoom:!0,children:h(Ut,{asChild:!0,trapped:C.open,onMountAutoFocus:W=>{W.preventDefault()},onUnmountAutoFocus:A(r,W=>{C.trigger?.focus({preventScroll:!0}),W.preventDefault()}),children:h(ht,{asChild:!0,disableOutsidePointerEvents:!0,onEscapeKeyDown:n,onPointerDownOutside:s,onFocusOutside:W=>W.preventDefault(),onDismiss:()=>C.onOpenChange(!1),children:h(Ie,{role:"listbox",id:C.contentId,"data-state":C.open?"open":"closed",dir:C.dir,onContextMenu:W=>W.preventDefault(),...w,...we,onPlaced:()=>$(!0),ref:T,style:{display:"flex",flexDirection:"column",outline:"none",...w.style},onKeyDown:A(w.onKeyDown,W=>{let oe=W.ctrlKey||W.altKey||W.metaKey;if(W.key==="Tab"&&W.preventDefault(),!oe&&W.key.length===1&&se(W.key),["ArrowUp","ArrowDown","Home","End"].includes(W.key)){let le=F().filter(k=>!k.disabled).map(k=>k.ref.current);if(["ArrowUp","End"].includes(W.key)&&(le=le.slice().reverse()),["ArrowUp","ArrowDown"].includes(W.key)){let k=W.target,ge=le.indexOf(k);le=le.slice(ge+1)}setTimeout(()=>j(le)),W.preventDefault()}})})})})})})});Kc.displayName=qg;var Vg="SelectItemAlignedPosition",jc=x((e,t)=>{let{__scopeSelect:a,onPlaced:o,...r}=e,n=Dt(At,a),s=Et(At,a),[l,i]=M(null),[u,d]=M(null),c=X(t,T=>d(T)),f=pr(a),m=y(!1),g=y(!0),{viewport:p,selectedItem:v,selectedItemText:w,focusSelectedItem:C}=s,L=H(()=>{if(n.trigger&&n.valueNode&&l&&u&&p&&v&&w){let T=n.trigger.getBoundingClientRect(),_=u.getBoundingClientRect(),z=n.valueNode.getBoundingClientRect(),V=w.getBoundingClientRect();if(n.dir!=="rtl"){let k=V.left-_.left,ge=z.left-k,He=T.left-ge,Ne=T.width+He,Pe=Math.max(Ne,_.width),Me=window.innerWidth-Ze,za=Mt(ge,[Ze,Math.max(Ze,Me-Pe)]);l.style.minWidth=Ne+"px",l.style.left=za+"px"}else{let k=_.right-V.right,ge=window.innerWidth-z.right-k,He=window.innerWidth-T.right-ge,Ne=T.width+He,Pe=Math.max(Ne,_.width),Me=window.innerWidth-Ze,za=Mt(ge,[Ze,Math.max(Ze,Me-Pe)]);l.style.minWidth=Ne+"px",l.style.right=za+"px"}let K=f(),F=window.innerHeight-Ze*2,Y=p.scrollHeight,$=window.getComputedStyle(u),ae=parseInt($.borderTopWidth,10),j=parseInt($.paddingTop,10),J=parseInt($.borderBottomWidth,10),U=parseInt($.paddingBottom,10),O=ae+j+Y+U+J,ee=Math.min(v.offsetHeight*5,O),se=window.getComputedStyle(p),pe=parseInt(se.paddingTop,10),Oe=parseInt(se.paddingBottom,10),ye=T.top+T.height/2-Ze,Ie=F-ye,we=v.offsetHeight/2,W=v.offsetTop+we,oe=ae+j+W,Se=O-oe;if(oe<=ye){let k=K.length>0&&v===K[K.length-1].ref.current;l.style.bottom="0px";let ge=u.clientHeight-p.offsetTop-p.offsetHeight,He=Math.max(Ie,we+(k?Oe:0)+ge+J),Ne=oe+He;l.style.height=Ne+"px"}else{let k=K.length>0&&v===K[0].ref.current;l.style.top="0px";let He=Math.max(ye,ae+p.offsetTop+(k?pe:0)+we)+Se;l.style.height=He+"px",p.scrollTop=oe-ye+p.offsetTop}l.style.margin=`${Ze}px 0`,l.style.minHeight=ee+"px",l.style.maxHeight=F+"px",o?.(),requestAnimationFrame(()=>m.current=!0)}},[f,n.trigger,n.valueNode,l,u,p,v,w,n.dir,o]);ce(()=>L(),[L]);let[S,P]=M();ce(()=>{u&&P(window.getComputedStyle(u).zIndex)},[u]);let E=H(T=>{T&&g.current===!0&&(L(),C?.(),g.current=!1)},[L,C]);return h(Gg,{scope:a,contentWrapper:l,shouldExpandOnScrollRef:m,onScrollButtonChange:E,children:h("div",{ref:i,style:{display:"flex",flexDirection:"column",position:"fixed",zIndex:S},children:h(B.div,{...r,ref:c,style:{boxSizing:"border-box",maxHeight:"100%",...r.style}})})})});jc.displayName=Vg;var Wg="SelectPopperPosition",Zn=x((e,t)=>{let{__scopeSelect:a,align:o="start",collisionPadding:r=Ze,...n}=e,s=mr(a);return h(Ea,{...s,...n,ref:t,align:o,collisionPadding:r,style:{boxSizing:"border-box",...n.style,"--radix-select-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-select-content-available-width":"var(--radix-popper-available-width)","--radix-select-content-available-height":"var(--radix-popper-available-height)","--radix-select-trigger-width":"var(--radix-popper-anchor-width)","--radix-select-trigger-height":"var(--radix-popper-anchor-height)"}})});Zn.displayName=Wg;var[Gg,ss]=aa(At,{}),Qn="SelectViewport",ls=x((e,t)=>{let{__scopeSelect:a,nonce:o,...r}=e,n=Et(Qn,a),s=ss(Qn,a),l=X(t,n.onViewportChange),i=y(0);return Re(Ae,{children:[h("style",{dangerouslySetInnerHTML:{__html:"[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}"},nonce:o}),h(fr.Slot,{scope:a,children:h(B.div,{"data-radix-select-viewport":"",role:"presentation",...r,ref:l,style:{position:"relative",flex:1,overflow:"hidden auto",...r.style},onScroll:A(r.onScroll,u=>{let d=u.currentTarget,{contentWrapper:c,shouldExpandOnScrollRef:f}=s;if(f?.current&&c){let m=Math.abs(i.current-d.scrollTop);if(m>0){let g=window.innerHeight-Ze*2,p=parseFloat(c.style.minHeight),v=parseFloat(c.style.height),w=Math.max(p,v);if(w<g){let C=w+m,L=Math.min(g,C),S=C-L;c.style.height=L+"px",c.style.bottom==="0px"&&(d.scrollTop=S>0?S:0,c.style.justifyContent="flex-end")}}}i.current=d.scrollTop})})})]})});ls.displayName=Qn;var $c="SelectGroup",[Xg,Kg]=aa($c),Yc=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=Le();return h(Xg,{scope:a,id:r,children:h(B.div,{role:"group","aria-labelledby":r,...o,ref:t})})});Yc.displayName=$c;var Jc="SelectLabel",gr=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=Kg(Jc,a);return h(B.div,{id:r.id,...o,ref:t})});gr.displayName=Jc;var dr="SelectItem",[jg,Zc]=aa(dr),vr=x((e,t)=>{let{__scopeSelect:a,value:o,disabled:r=!1,textValue:n,...s}=e,l=Dt(dr,a),i=Et(dr,a),u=l.value===o,[d,c]=M(n??""),[f,m]=M(!1),g=X(t,C=>i.itemRefCallback?.(C,o,r)),p=Le(),v=y("touch"),w=()=>{r||(l.onValueChange(o),l.onOpenChange(!1))};if(o==="")throw new Error("A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.");return h(jg,{scope:a,value:o,disabled:r,textId:p,isSelected:u,onItemTextChange:H(C=>{c(L=>L||(C?.textContent??"").trim())},[]),children:h(fr.ItemSlot,{scope:a,value:o,disabled:r,textValue:d,children:h(B.div,{role:"option","aria-labelledby":p,"data-highlighted":f?"":void 0,"aria-selected":u&&f,"data-state":u?"checked":"unchecked","aria-disabled":r||void 0,"data-disabled":r?"":void 0,tabIndex:r?void 0:-1,...s,ref:g,onFocus:A(s.onFocus,()=>m(!0)),onBlur:A(s.onBlur,()=>m(!1)),onClick:A(s.onClick,()=>{v.current!=="mouse"&&w()}),onPointerUp:A(s.onPointerUp,()=>{v.current==="mouse"&&w()}),onPointerDown:A(s.onPointerDown,C=>{v.current=C.pointerType}),onPointerMove:A(s.onPointerMove,C=>{v.current=C.pointerType,r?i.onItemLeave?.():v.current==="mouse"&&C.currentTarget.focus({preventScroll:!0})}),onPointerLeave:A(s.onPointerLeave,C=>{C.currentTarget===document.activeElement&&i.onItemLeave?.()}),onKeyDown:A(s.onKeyDown,C=>{i.searchRef?.current!==""&&C.key===" "||(Dg.includes(C.key)&&w(),C.key===" "&&C.preventDefault())})})})})});vr.displayName=dr;var fo="SelectItemText",is=x((e,t)=>{let{__scopeSelect:a,className:o,style:r,...n}=e,s=Dt(fo,a),l=Et(fo,a),i=Zc(fo,a),u=Fg(fo,a),[d,c]=M(null),f=X(t,w=>c(w),i.onItemTextChange,w=>l.itemTextRefCallback?.(w,i.value,i.disabled)),m=d?.textContent,g=he(()=>h("option",{value:i.value,disabled:i.disabled,children:m},i.value),[i.disabled,i.value,m]),{onNativeOptionAdd:p,onNativeOptionRemove:v}=u;return ce(()=>(p(g),()=>v(g)),[p,v,g]),Re(Ae,{children:[h(B.span,{id:i.textId,...n,ref:f}),i.isSelected&&s.valueNode&&!s.valueNodeHasChildren?$a(n.children,s.valueNode):null]})});is.displayName=fo;var Qc="SelectItemIndicator",us=x((e,t)=>{let{__scopeSelect:a,...o}=e;return Zc(Qc,a).isSelected?h(B.span,{"aria-hidden":!0,...o,ref:t}):null});us.displayName=Qc;var es="SelectScrollUpButton",wr=x((e,t)=>{let a=Et(es,e.__scopeSelect),o=ss(es,e.__scopeSelect),[r,n]=M(!1),s=X(t,o.onScrollButtonChange);return ce(()=>{if(a.viewport&&a.isPositioned){let i=function(){let d=u.scrollTop>0;n(d)};var l=i;let u=a.viewport;return i(),u.addEventListener("scroll",i),()=>u.removeEventListener("scroll",i)}},[a.viewport,a.isPositioned]),r?h(ed,{...e,ref:s,onAutoScroll:()=>{let{viewport:l,selectedItem:i}=a;l&&i&&(l.scrollTop=l.scrollTop-i.offsetHeight)}}):null});wr.displayName=es;var ts="SelectScrollDownButton",Cr=x((e,t)=>{let a=Et(ts,e.__scopeSelect),o=ss(ts,e.__scopeSelect),[r,n]=M(!1),s=X(t,o.onScrollButtonChange);return ce(()=>{if(a.viewport&&a.isPositioned){let i=function(){let d=u.scrollHeight-u.clientHeight,c=Math.ceil(u.scrollTop)<d;n(c)};var l=i;let u=a.viewport;return i(),u.addEventListener("scroll",i),()=>u.removeEventListener("scroll",i)}},[a.viewport,a.isPositioned]),r?h(ed,{...e,ref:s,onAutoScroll:()=>{let{viewport:l,selectedItem:i}=a;l&&i&&(l.scrollTop=l.scrollTop+i.offsetHeight)}}):null});Cr.displayName=ts;var ed=x((e,t)=>{let{__scopeSelect:a,onAutoScroll:o,...r}=e,n=Et("SelectScrollButton",a),s=y(null),l=pr(a),i=H(()=>{s.current!==null&&(window.clearInterval(s.current),s.current=null)},[]);return D(()=>()=>i(),[i]),ce(()=>{l().find(d=>d.ref.current===document.activeElement)?.ref.current?.scrollIntoView({block:"nearest"})},[l]),h(B.div,{"aria-hidden":!0,...r,ref:t,style:{flexShrink:0,...r.style},onPointerDown:A(r.onPointerDown,()=>{s.current===null&&(s.current=window.setInterval(o,50))}),onPointerMove:A(r.onPointerMove,()=>{n.onItemLeave?.(),s.current===null&&(s.current=window.setInterval(o,50))}),onPointerLeave:A(r.onPointerLeave,()=>{i()})})}),$g="SelectSeparator",Lr=x((e,t)=>{let{__scopeSelect:a,...o}=e;return h(B.div,{"aria-hidden":!0,...o,ref:t})});Lr.displayName=$g;var td="SelectArrow",Yg=x((e,t)=>{let{__scopeSelect:a,...o}=e,r=mr(a);return Et(td,a).position==="popper"?h(Oa,{...r,...o,ref:t}):null});Yg.displayName=td;var ad="SelectBubbleInput",od=x(({__scopeSelect:e,...t},a)=>{let o=Dt(ad,e),{value:r,onValueChange:n,required:s,disabled:l,name:i,autoComplete:u,form:d}=o,{nativeOptions:c,nativeSelectKey:f}=o,m=y(null),g=X(a,m),p=r??"",v=St(p);return D(()=>{let w=m.current;if(!w)return;let C=window.HTMLSelectElement.prototype,S=Object.getOwnPropertyDescriptor(C,"value").set;if(v!==p&&S){let P=new Event("change",{bubbles:!0});S.call(w,p),w.dispatchEvent(P)}},[v,p]),Re(B.select,{"aria-hidden":!0,required:s,tabIndex:-1,name:i,autoComplete:u,disabled:l,form:d,onChange:w=>n(w.target.value),...t,style:{...Jn,...t.style},ref:g,defaultValue:p,children:[cs(r)?h("option",{value:""}):null,Array.from(c)]},f)});od.displayName=ad;function Jg(e){return typeof e=="function"}function cs(e){return e===""||e===void 0}function rd(e){let t=de(e),a=y(""),o=y(0),r=H(s=>{let l=a.current+s;t(l),(function i(u){a.current=u,window.clearTimeout(o.current),u!==""&&(o.current=window.setTimeout(()=>i(""),1e3))})(l)},[t]),n=H(()=>{a.current="",window.clearTimeout(o.current)},[]);return D(()=>()=>window.clearTimeout(o.current),[]),[a,r,n]}function nd(e,t,a){let r=t.length>1&&Array.from(t).every(u=>u===t[0])?t[0]:t,n=a?e.indexOf(a):-1,s=Zg(e,Math.max(n,0));r.length===1&&(s=s.filter(u=>u!==a));let i=s.find(u=>u.textValue.toLowerCase().startsWith(r.toLowerCase()));return i!==a?i:void 0}function Zg(e,t){return e.map((a,o)=>e[(t+o)%e.length])}var sd=as;var ld=os,ds=x(({className:e,children:t,...a},o)=>I(hr,{ref:o,className:N("xps-select-trigger",e),...a},t,I(rs,{asChild:!0},I(Ft,{className:"xps-icon"}))));ds.displayName=hr.displayName;var id=x(({className:e,...t},a)=>I(wr,{ref:a,className:N("xps-select-scroll-button",e),...t},I(da,{className:"xps-icon"})));id.displayName=wr.displayName;var ud=x(({className:e,...t},a)=>I(Cr,{ref:a,className:N("xps-select-scroll-button",e),...t},I(Ft,{className:"xps-icon"})));ud.displayName=Cr.displayName;var fs=x(({className:e,children:t,position:a="popper",...o},r)=>I(ns,null,I(xr,{ref:r,className:N("xps-select-content",a==="popper"&&"xps-select-content-popper",e),position:a,...o},I(id,null),I(ls,{className:N("xps-select-viewport",a==="popper"&&"xps-select-viewport-popper")},t),I(ud,null))));fs.displayName=xr.displayName;var ev=x(({className:e,...t},a)=>I(gr,{ref:a,className:N("xps-select-label",e),...t}));ev.displayName=gr.displayName;var Ba=x(({className:e,children:t,...a},o)=>I(vr,{ref:o,className:N("xps-select-item",e),...a},I("span",{className:"xps-select-item-indicator"},I(us,null,I(Ue,{className:"xps-icon"}))),I(is,null,t)));Ba.displayName=vr.displayName;var tv=x(({className:e,...t},a)=>I(Lr,{ref:a,className:N("xps-select-separator",e),...t}));tv.displayName=Lr.displayName;var av=x(({className:e,orientation:t="horizontal",...a},o)=>I("div",{ref:o,className:N("xps-separator",t==="vertical"?"xps-separator--vertical":"xps-separator--horizontal",e),role:"separator","aria-orientation":t,...a}));av.displayName="Separator";var ov=Ho;var cd=x(({className:e,...t},a)=>I(ya,{ref:a,className:N("xps-dialog-overlay",e),...t}));cd.displayName=ya.displayName;var rv=x(({className:e,children:t,side:a="right",showClose:o=!0,...r},n)=>I(ov,null,I(cd,null),I(Pa,{ref:n,className:N("xps-sheet-content",`xps-sheet-content--${a}`,e),...r},t,o?I(Uo,{className:"xps-dialog-close"},I(_t,{className:"xps-icon","aria-hidden":"true"}),I("span",{className:"xps-sr-only"},"Close")):null)));rv.displayName=Pa.displayName;var nv=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-dialog-header",e),...t}));nv.displayName="SheetHeader";var sv=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-dialog-footer",e),...t}));sv.displayName="SheetFooter";var lv=x(({className:e,...t},a)=>I(Ta,{ref:a,className:N("xps-dialog-title",e),...t}));lv.displayName=Ta.displayName;var iv=x(({className:e,...t},a)=>I(ka,{ref:a,className:N("xps-dialog-description",e),...t}));iv.displayName=ka.displayName;var Ir=x(({className:e,side:t="left",collapsed:a=!1,...o},r)=>I("aside",{ref:r,className:N("xps-sidebar",`xps-sidebar--${t}`,a&&"xps-sidebar--collapsed",e),"data-side":t,"data-state":a?"collapsed":"expanded","aria-expanded":!a,...o}));Ir.displayName="Sidebar";var Sr=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-header",e),...t}));Sr.displayName="SidebarHeader";var br=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-content",e),...t}));br.displayName="SidebarContent";var uv=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-footer",e),...t}));uv.displayName="SidebarFooter";var Rr=x(({className:e,...t},a)=>I("span",{ref:a,className:N("xps-sidebar-title",e),...t}));Rr.displayName="SidebarTitle";var yr=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-rail",e),...t}));yr.displayName="SidebarRail";var Pr=x(({className:e,variant:t="ghost",size:a="icon",...o},r)=>I(Te,{ref:r,className:N("xps-sidebar-trigger",e),variant:t,size:a,...o}));Pr.displayName="SidebarTrigger";var cv=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-group",e),...t}));cv.displayName="SidebarGroup";var dv=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-group-label",e),...t}));dv.displayName="SidebarGroupLabel";var ps=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-menu",e),...t}));ps.displayName="SidebarMenu";var ms=x(({className:e,...t},a)=>I("div",{ref:a,className:N("xps-sidebar-menu-item",e),...t}));ms.displayName="SidebarMenuItem";var hs=x(({className:e,active:t=!1,variant:a="ghost",...o},r)=>I(Te,{ref:r,variant:a,className:N("xps-sidebar-menu-button",t&&"xps-sidebar-menu-button--active",e),...o}));hs.displayName="SidebarMenuButton";var dd=["PageUp","PageDown"],fd=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],pd={"from-left":["Home","PageDown","ArrowDown","ArrowLeft"],"from-right":["Home","PageDown","ArrowDown","ArrowRight"],"from-bottom":["Home","PageDown","ArrowDown","ArrowLeft"],"from-top":["Home","PageDown","ArrowUp","ArrowLeft"]},_a="Slider",[xs,fv,pv]=Tt(_a),[vs,Gy]=ue(_a,[pv]),[mv,po]=vs(_a),kr=x((e,t)=>{let{name:a,min:o=0,max:r=100,step:n=1,orientation:s="horizontal",disabled:l=!1,minStepsBetweenThumbs:i=0,defaultValue:u=[o],value:d,onValueChange:c=()=>{},onValueCommit:f=()=>{},inverted:m=!1,form:g,...p}=e,v=y(new Set),w=y(0),C=y(!1),S=s==="horizontal"?hv:xv,[P=[],E]=be({prop:d,defaultProp:u,onChange:F=>{[...v.current][w.current]?.focus({preventScroll:!0,focusVisible:C.current}),C.current=!1,c(F)}}),T=y(P);function _(F){let Y=Cv(P,F);K(F,Y)}function z(F){K(F,w.current)}function V(){let F=T.current[w.current];P[w.current]!==F&&f(P)}function K(F,Y,{commit:$}={commit:!1}){let ae=bv(n),j=Rv(Math.round((F-o)/n)*n+o,ae),J=Mt(j,[o,r]);E((U=[])=>{let O=vv(U,J,Y);if(Sv(O,i*n)){w.current=O.indexOf(J);let ee=String(O)!==String(U);return ee&&$&&f(O),ee?O:U}else return U})}return h(mv,{scope:e.__scopeSlider,name:a,disabled:l,min:o,max:r,valueIndexToChangeRef:w,thumbs:v.current,values:P,orientation:s,form:g,children:h(xs.Provider,{scope:e.__scopeSlider,children:h(xs.Slot,{scope:e.__scopeSlider,children:h(S,{"aria-disabled":l,"data-disabled":l?"":void 0,...p,ref:t,onPointerDown:A(p.onPointerDown,()=>{l||(T.current=P,C.current=!1)}),min:o,max:r,inverted:m,onSlideStart:l?void 0:_,onSlideMove:l?void 0:z,onSlideEnd:l?void 0:V,onHomeKeyDown:()=>{l||(C.current=!0,K(o,0,{commit:!0}))},onEndKeyDown:()=>{l||(C.current=!0,K(r,P.length-1,{commit:!0}))},onStepKeyDown:({event:F,direction:Y})=>{if(!l){C.current=!0;let j=dd.includes(F.key)||F.shiftKey&&fd.includes(F.key)?10:1,J=w.current,U=P[J],O=n*j*Y;K(U+O,J,{commit:!0})}}})})})})});kr.displayName=_a;var[md,hd]=vs(_a,{startEdge:"left",endEdge:"right",size:"width",direction:1}),hv=x((e,t)=>{let{min:a,max:o,dir:r,inverted:n,onSlideStart:s,onSlideMove:l,onSlideEnd:i,onStepKeyDown:u,...d}=e,[c,f]=M(null),m=X(t,L=>f(L)),g=y(void 0),p=ze(r),v=p==="ltr",w=v&&!n||!v&&n;function C(L){let S=g.current||c.getBoundingClientRect(),P=[0,S.width],T=Is(P,w?[a,o]:[o,a]);return g.current=S,T(L-S.left)}return h(md,{scope:e.__scopeSlider,startEdge:w?"left":"right",endEdge:w?"right":"left",direction:w?1:-1,size:"width",children:h(xd,{dir:p,"data-orientation":"horizontal",...d,ref:m,style:{...d.style,"--radix-slider-thumb-transform":"translateX(-50%)"},onSlideStart:L=>{let S=C(L.clientX);s?.(S)},onSlideMove:L=>{let S=C(L.clientX);l?.(S)},onSlideEnd:()=>{g.current=void 0,i?.()},onStepKeyDown:L=>{let P=pd[w?"from-left":"from-right"].includes(L.key);u?.({event:L,direction:P?-1:1})}})})}),xv=x((e,t)=>{let{min:a,max:o,inverted:r,onSlideStart:n,onSlideMove:s,onSlideEnd:l,onStepKeyDown:i,...u}=e,d=y(null),c=X(t,d),f=y(void 0),m=!r;function g(p){let v=f.current||d.current.getBoundingClientRect(),w=[0,v.height],L=Is(w,m?[o,a]:[a,o]);return f.current=v,L(p-v.top)}return h(md,{scope:e.__scopeSlider,startEdge:m?"bottom":"top",endEdge:m?"top":"bottom",size:"height",direction:m?1:-1,children:h(xd,{"data-orientation":"vertical",...u,ref:c,style:{...u.style,"--radix-slider-thumb-transform":"translateY(50%)"},onSlideStart:p=>{let v=g(p.clientY);n?.(v)},onSlideMove:p=>{let v=g(p.clientY);s?.(v)},onSlideEnd:()=>{f.current=void 0,l?.()},onStepKeyDown:p=>{let w=pd[m?"from-bottom":"from-top"].includes(p.key);i?.({event:p,direction:w?-1:1})}})})}),xd=x((e,t)=>{let{__scopeSlider:a,onSlideStart:o,onSlideMove:r,onSlideEnd:n,onHomeKeyDown:s,onEndKeyDown:l,onStepKeyDown:i,...u}=e,d=po(_a,a);return h(B.span,{...u,ref:t,onKeyDown:A(e.onKeyDown,c=>{c.key==="Home"?(s(c),c.preventDefault()):c.key==="End"?(l(c),c.preventDefault()):dd.concat(fd).includes(c.key)&&(i(c),c.preventDefault())}),onPointerDown:A(e.onPointerDown,c=>{let f=c.target;f.setPointerCapture(c.pointerId),c.preventDefault(),d.thumbs.has(f)?f.focus({preventScroll:!0,focusVisible:!1}):o(c)}),onPointerMove:A(e.onPointerMove,c=>{c.target.hasPointerCapture(c.pointerId)&&r(c)}),onPointerUp:A(e.onPointerUp,c=>{let f=c.target;f.hasPointerCapture(c.pointerId)&&(f.releasePointerCapture(c.pointerId),n(c))})})}),gd="SliderTrack",ws=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=po(gd,a);return h(B.span,{"data-disabled":r.disabled?"":void 0,"data-orientation":r.orientation,...o,ref:t})});ws.displayName=gd;var gs="SliderRange",Cs=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=po(gs,a),n=hd(gs,a),s=y(null),l=X(t,s),i=r.values.length,u=r.values.map(f=>Rd(f,r.min,r.max)),d=i>1?Math.min(...u):0,c=100-Math.max(...u);return h(B.span,{"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,...o,ref:l,style:{...e.style,[n.startEdge]:d+"%",[n.endEdge]:c+"%"}})});Cs.displayName=gs;var vd="SliderThumb",[gv,wd]=vs(vd),Cd="SliderThumbProvider";function Ld(e){let{__scopeSlider:t,name:a,children:o,internal_do_not_use_render:r}=e,n=po(Cd,t),s=fv(t),[l,i]=M(null),u=he(()=>l?s().findIndex(v=>v.ref.current===l):-1,[s,l]),d=bt(l),c=l?!!n.form||!!l.closest("form"):!0,f=n.values[u],m=a??(n.name?n.name+(n.values.length>1?"[]":""):void 0),g=f===void 0?0:Rd(f,n.min,n.max);D(()=>{if(l)return n.thumbs.add(l),()=>{n.thumbs.delete(l)}},[l,n.thumbs]);let p={value:f,name:m,form:n.form,isFormControl:c,index:u,thumb:l,onThumbChange:i,percent:g,size:d};return h(gv,{scope:t,...p,children:yv(r)?r(p):o})}Ld.displayName=Cd;var Tr="SliderThumbTrigger",Id=x((e,t)=>{let{__scopeSlider:a,...o}=e,r=po(Tr,a),n=hd(Tr,a),{index:s,value:l,percent:i,size:u,onThumbChange:d}=wd(Tr,a),c=X(t,p=>d(p)),f=wv(s,r.values.length),m=u?.[n.size],g=m?Lv(m,i,n.direction):0;return h("span",{style:{transform:"var(--radix-slider-thumb-transform)",position:"absolute",[n.startEdge]:`calc(${i}% + ${g}px)`},children:h(xs.ItemSlot,{scope:a,children:h(B.span,{role:"slider","aria-label":e["aria-label"]||f,"aria-valuemin":r.min,"aria-valuenow":l,"aria-valuemax":r.max,"aria-orientation":r.orientation,"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,tabIndex:r.disabled?void 0:0,...o,ref:c,style:l===void 0?{display:"none"}:e.style,onFocus:A(e.onFocus,()=>{r.valueIndexToChangeRef.current=s})})})})});Id.displayName=Tr;var Ls=x((e,t)=>{let{__scopeSlider:a,name:o,...r}=e;return h(Ld,{__scopeSlider:a,name:o,internal_do_not_use_render:({index:n,isFormControl:s})=>Re(Ae,{children:[h(Id,{...r,ref:t,__scopeSlider:a}),s?h(bd,{__scopeSlider:a},n):null]})})});Ls.displayName=vd;var Sd="SliderBubbleInput",bd=x(({__scopeSlider:e,...t},a)=>{let{value:o,name:r,form:n}=wd(Sd,e),s=y(null),l=X(s,a),i=St(o);return D(()=>{let u=s.current;if(!u)return;let d=window.HTMLInputElement.prototype,f=Object.getOwnPropertyDescriptor(d,"value").set;if(i!==o&&f){let m=new Event("input",{bubbles:!0});f.call(u,o),u.dispatchEvent(m)}},[i,o]),h(B.input,{style:{display:"none"},name:r,form:n,...t,ref:l,defaultValue:o})});bd.displayName=Sd;function vv(e=[],t,a){let o=[...e];return o[a]=t,o.sort((r,n)=>r-n)}function Rd(e,t,a){let n=100/(a-t)*(e-t);return Mt(n,[0,100])}function wv(e,t){return t>2?`Value ${e+1} of ${t}`:t===2?["Minimum","Maximum"][e]:void 0}function Cv(e,t){if(e.length===1)return 0;let a=e.map(r=>Math.abs(r-t)),o=Math.min(...a);return a.indexOf(o)}function Lv(e,t,a){let o=e/2,n=Is([0,50],[0,o]);return(o-n(t)*a)*a}function Iv(e){return e.slice(0,-1).map((t,a)=>e[a+1]-t)}function Sv(e,t){if(t>0){let a=Iv(e);return Math.min(...a)>=t}return!0}function Is(e,t){return a=>{if(e[0]===e[1]||t[0]===t[1])return t[0];let o=(t[1]-t[0])/(e[1]-e[0]);return t[0]+o*(a-e[0])}}function bv(e){if(!Number.isFinite(e))return 0;let t=e.toString();if(t.includes("e")){let[o,r]=t.split("e"),n=o.split(".")[1]||"",s=Number(r);return Math.max(0,n.length-s)}let a=t.split(".")[1];return a?a.length:0}function Rv(e,t){let a=Math.pow(10,t);return Math.round(e*a)/a}function yv(e){return typeof e=="function"}var Tv=x(({className:e,...t},a)=>I(kr,{ref:a,className:N("xps-slider",e),...t},I(ws,{className:"xps-slider-track"},I(Cs,{className:"xps-slider-range"})),I(Ls,{className:"xps-slider-thumb"})));Tv.displayName=kr.displayName;var Mr="Switch",[kv,aP]=ue(Mr),[Mv,Ss]=kv(Mr);function Av(e){let{__scopeSwitch:t,checked:a,children:o,defaultChecked:r,disabled:n,form:s,name:l,onCheckedChange:i,required:u,value:d="on",internal_do_not_use_render:c}=e,[f,m]=be({prop:a,defaultProp:r??!1,onChange:i,caller:Mr}),[g,p]=M(null),[v,w]=M(null),C=y(!1),L=g?!!s||!!g.closest("form"):!0,S={checked:f,setChecked:m,disabled:n,control:g,setControl:p,name:l,form:s,value:d,hasConsumerStoppedPropagationRef:C,required:u,defaultChecked:r,isFormControl:L,bubbleInput:v,setBubbleInput:w};return h(Mv,{scope:t,...S,children:Dv(c)?c(S):o})}var yd="SwitchTrigger",Pd=x(({__scopeSwitch:e,onClick:t,...a},o)=>{let{value:r,disabled:n,checked:s,required:l,setControl:i,setChecked:u,hasConsumerStoppedPropagationRef:d,isFormControl:c,bubbleInput:f}=Ss(yd,e),m=X(o,i);return h(B.button,{type:"button",role:"switch","aria-checked":s,"aria-required":l,"data-state":Ad(s),"data-disabled":n?"":void 0,disabled:n,value:r,...a,ref:m,onClick:A(t,g=>{u(p=>!p),f&&c&&(d.current=g.isPropagationStopped(),d.current||g.stopPropagation())})})});Pd.displayName=yd;var Ar=x((e,t)=>{let{__scopeSwitch:a,name:o,checked:r,defaultChecked:n,required:s,disabled:l,value:i,onCheckedChange:u,form:d,...c}=e;return h(Av,{__scopeSwitch:a,checked:r,defaultChecked:n,disabled:l,required:s,onCheckedChange:u,name:o,form:d,value:i,internal_do_not_use_render:({isFormControl:f})=>Re(Ae,{children:[h(Pd,{...c,ref:t,__scopeSwitch:a}),f&&h(Md,{__scopeSwitch:a})]})})});Ar.displayName=Mr;var Td="SwitchThumb",bs=x((e,t)=>{let{__scopeSwitch:a,...o}=e,r=Ss(Td,a);return h(B.span,{"data-state":Ad(r.checked),"data-disabled":r.disabled?"":void 0,...o,ref:t})});bs.displayName=Td;var kd="SwitchBubbleInput",Md=x(({__scopeSwitch:e,...t},a)=>{let{control:o,hasConsumerStoppedPropagationRef:r,checked:n,defaultChecked:s,required:l,disabled:i,name:u,value:d,form:c,bubbleInput:f,setBubbleInput:m}=Ss(kd,e),g=X(a,m),p=St(n),v=bt(o);D(()=>{let C=f;if(!C)return;let L=window.HTMLInputElement.prototype,P=Object.getOwnPropertyDescriptor(L,"checked").set,E=!r.current;if(p!==n&&P){let T=new Event("click",{bubbles:E});P.call(C,n),C.dispatchEvent(T)}},[f,p,n,r]);let w=y(n);return h(B.input,{type:"checkbox","aria-hidden":!0,defaultChecked:s??w.current,required:l,disabled:i,name:u,value:d,form:c,...t,tabIndex:-1,ref:g,style:{...t.style,...v,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});Md.displayName=kd;function Dv(e){return typeof e=="function"}function Ad(e){return e?"checked":"unchecked"}var Ov=x(({className:e,...t},a)=>I(Ar,{ref:a,className:N("xps-switch",e),...t},I(bs,{className:"xps-switch-thumb"})));Ov.displayName=Ar.displayName;var Nv=x(({className:e,...t},a)=>I("table",{ref:a,className:N("xps-table",e),...t}));Nv.displayName="Table";var Fv=x(({className:e,...t},a)=>I("thead",{ref:a,className:N("xps-table-header",e),...t}));Fv.displayName="TableHeader";var Bv=x(({className:e,...t},a)=>I("tbody",{ref:a,className:N("xps-table-body",e),...t}));Bv.displayName="TableBody";var _v=x(({className:e,...t},a)=>I("tfoot",{ref:a,className:N("xps-table-footer",e),...t}));_v.displayName="TableFooter";var Hv=x(({className:e,...t},a)=>I("tr",{ref:a,className:N("xps-table-row",e),...t}));Hv.displayName="TableRow";var Uv=x(({className:e,...t},a)=>I("th",{ref:a,className:N("xps-table-head",e),...t}));Uv.displayName="TableHead";var qv=x(({className:e,...t},a)=>I("td",{ref:a,className:N("xps-table-cell",e),...t}));qv.displayName="TableCell";var zv=x(({className:e,...t},a)=>I("caption",{ref:a,className:N("xps-table-caption",e),...t}));zv.displayName="TableCaption";var Dr="Tabs",[Vv,xP]=ue(Dr,[Na]),Dd=Na(),[Wv,Rs]=Vv(Dr),Gv=x((e,t)=>{let{__scopeTabs:a,value:o,onValueChange:r,defaultValue:n,orientation:s="horizontal",dir:l,activationMode:i="automatic",...u}=e,d=ze(l),[c,f]=be({prop:o,onChange:r,defaultProp:n??"",caller:Dr});return h(Wv,{scope:a,baseId:Le(),value:c,onValueChange:f,orientation:s,dir:d,activationMode:i,children:h(B.div,{dir:d,"data-orientation":s,...u,ref:t})})});Gv.displayName=Dr;var Ed="TabsList",Od=x((e,t)=>{let{__scopeTabs:a,loop:o=!0,...r}=e,n=Rs(Ed,a),s=Dd(a);return h(Qo,{asChild:!0,...s,orientation:n.orientation,dir:n.dir,loop:o,children:h(B.div,{role:"tablist","aria-orientation":n.orientation,...r,ref:t})})});Od.displayName=Ed;var Nd="TabsTrigger",Fd=x((e,t)=>{let{__scopeTabs:a,value:o,disabled:r=!1,...n}=e,s=Rs(Nd,a),l=Dd(a),i=Hd(s.baseId,o),u=Ud(s.baseId,o),d=o===s.value;return h(er,{asChild:!0,...l,focusable:!r,active:d,children:h(B.button,{type:"button",role:"tab","aria-selected":d,"aria-controls":u,"data-state":d?"active":"inactive","data-disabled":r?"":void 0,disabled:r,id:i,...n,ref:t,onMouseDown:A(e.onMouseDown,c=>{!r&&c.button===0&&c.ctrlKey===!1?s.onValueChange(o):c.preventDefault()}),onKeyDown:A(e.onKeyDown,c=>{[" ","Enter"].includes(c.key)&&s.onValueChange(o)}),onFocus:A(e.onFocus,()=>{let c=s.activationMode!=="manual";!d&&!r&&c&&s.onValueChange(o)})})})});Fd.displayName=Nd;var Bd="TabsContent",_d=x((e,t)=>{let{__scopeTabs:a,value:o,forceMount:r,children:n,...s}=e,l=Rs(Bd,a),i=Hd(l.baseId,o),u=Ud(l.baseId,o),d=o===l.value,c=y(d);return D(()=>{let f=requestAnimationFrame(()=>c.current=!1);return()=>cancelAnimationFrame(f)},[]),h(xe,{present:r||d,children:({present:f})=>h(B.div,{"data-state":d?"active":"inactive","data-orientation":l.orientation,role:"tabpanel","aria-labelledby":i,hidden:!f,id:u,tabIndex:0,...s,ref:t,style:{...e.style,animationDuration:c.current?"0s":void 0},children:f&&n})})});_d.displayName=Bd;function Hd(e,t){return`${e}-trigger-${t}`}function Ud(e,t){return`${e}-content-${t}`}var ys=Od,Ps=Fd,Ts=_d;var Kv=x(({className:e,...t},a)=>I(ys,{ref:a,className:N("xps-tabs-list",e),...t}));Kv.displayName=ys.displayName;var jv=x(({className:e,...t},a)=>I(Ps,{ref:a,className:N("xps-tabs-trigger",e),...t}));jv.displayName=Ps.displayName;var $v=x(({className:e,...t},a)=>I(Ts,{ref:a,className:N("xps-tabs-content",e),...t}));$v.displayName=Ts.displayName;var Ha=x(({className:e,...t},a)=>I("textarea",{ref:a,className:N("xps-textarea",e),...t}));Ha.displayName="Textarea";var[Er,OP]=ue("Tooltip",[vt]),Or=vt(),qd="TooltipProvider",Yv=700,ks="tooltip.open",[Jv,As]=Er(qd),Zv=e=>{let{__scopeTooltip:t,delayDuration:a=Yv,skipDelayDuration:o=300,disableHoverableContent:r=!1,children:n}=e,s=y(!0),l=y(!1),i=y(0);return D(()=>{let u=i.current;return()=>window.clearTimeout(u)},[]),h(Jv,{scope:t,isOpenDelayedRef:s,delayDuration:a,onOpen:H(()=>{o<=0||(window.clearTimeout(i.current),s.current=!1)},[o]),onClose:H(()=>{o<=0||(window.clearTimeout(i.current),i.current=window.setTimeout(()=>s.current=!0,o))},[o]),isPointerInTransitRef:l,onPointerInTransitChange:H(u=>{l.current=u},[]),disableHoverableContent:r,children:n})};Zv.displayName=qd;var mo="Tooltip",[Qv,ho]=Er(mo),ew=e=>{let{__scopeTooltip:t,children:a,open:o,defaultOpen:r,onOpenChange:n,disableHoverableContent:s,delayDuration:l}=e,i=As(mo,e.__scopeTooltip),u=Or(t),[d,c]=M(null),f=Le(),m=y(0),g=s??i.disableHoverableContent,p=l??i.delayDuration,v=y(!1),[w,C]=be({prop:o,defaultProp:r??!1,onChange:T=>{T?(i.onOpen(),document.dispatchEvent(new CustomEvent(ks))):i.onClose(),n?.(T)},caller:mo}),L=he(()=>w?v.current?"delayed-open":"instant-open":"closed",[w]),S=H(()=>{window.clearTimeout(m.current),m.current=0,v.current=!1,C(!0)},[C]),P=H(()=>{window.clearTimeout(m.current),m.current=0,C(!1)},[C]),E=H(()=>{window.clearTimeout(m.current),m.current=window.setTimeout(()=>{v.current=!0,C(!0),m.current=0},p)},[p,C]);return D(()=>()=>{m.current&&(window.clearTimeout(m.current),m.current=0)},[]),h(Qt,{...u,children:h(Qv,{scope:t,contentId:f,open:w,stateAttribute:L,trigger:d,onTriggerChange:c,onTriggerEnter:H(()=>{i.isOpenDelayedRef.current?E():S()},[i.isOpenDelayedRef,E,S]),onTriggerLeave:H(()=>{g?P():(window.clearTimeout(m.current),m.current=0)},[P,g]),onOpen:S,onClose:P,disableHoverableContent:g,children:a})})};ew.displayName=mo;var Ms="TooltipTrigger",tw=x((e,t)=>{let{__scopeTooltip:a,...o}=e,r=ho(Ms,a),n=As(Ms,a),s=Or(a),l=y(null),i=X(t,l,r.onTriggerChange),u=y(!1),d=y(!1),c=H(()=>u.current=!1,[]);return D(()=>()=>document.removeEventListener("pointerup",c),[c]),h(Da,{asChild:!0,...s,children:h(B.button,{"aria-describedby":r.open?r.contentId:void 0,"data-state":r.stateAttribute,...o,ref:i,onPointerMove:A(e.onPointerMove,f=>{f.pointerType!=="touch"&&!d.current&&!n.isPointerInTransitRef.current&&(r.onTriggerEnter(),d.current=!0)}),onPointerLeave:A(e.onPointerLeave,()=>{r.onTriggerLeave(),d.current=!1}),onPointerDown:A(e.onPointerDown,()=>{r.open&&r.onClose(),u.current=!0,document.addEventListener("pointerup",c,{once:!0})}),onFocus:A(e.onFocus,()=>{u.current||r.onOpen()}),onBlur:A(e.onBlur,r.onClose),onClick:A(e.onClick,r.onClose)})})});tw.displayName=Ms;var Ds="TooltipPortal",[aw,ow]=Er(Ds,{forceMount:void 0}),zd=e=>{let{__scopeTooltip:t,forceMount:a,children:o,container:r}=e,n=ho(Ds,t);return h(aw,{scope:t,forceMount:a,children:h(xe,{present:a||n.open,children:h(xt,{asChild:!0,container:r,children:o})})})};zd.displayName=Ds;var Ua="TooltipContent",Vd=x((e,t)=>{let a=ow(Ua,e.__scopeTooltip),{forceMount:o=a.forceMount,side:r="top",...n}=e,s=ho(Ua,e.__scopeTooltip);return h(xe,{present:o||s.open,children:s.disableHoverableContent?h(Wd,{side:r,...n,ref:t}):h(rw,{side:r,...n,ref:t})})}),rw=x((e,t)=>{let a=ho(Ua,e.__scopeTooltip),o=As(Ua,e.__scopeTooltip),r=y(null),n=X(t,r),[s,l]=M(null),{trigger:i,onClose:u}=a,d=r.current,{onPointerInTransitChange:c}=o,f=H(()=>{l(null),c(!1)},[c]),m=H((g,p)=>{let v=g.currentTarget,w={x:g.clientX,y:g.clientY},C=uw(w,v.getBoundingClientRect()),L=cw(w,C),S=dw(p.getBoundingClientRect()),P=pw([...L,...S]);l(P),c(!0)},[c]);return D(()=>()=>f(),[f]),D(()=>{if(i&&d){let g=v=>m(v,d),p=v=>m(v,i);return i.addEventListener("pointerleave",g),d.addEventListener("pointerleave",p),()=>{i.removeEventListener("pointerleave",g),d.removeEventListener("pointerleave",p)}}},[i,d,m,f]),D(()=>{if(s){let g=p=>{let v=p.target,w={x:p.clientX,y:p.clientY},C=i?.contains(v)||d?.contains(v),L=!fw(w,s);C?f():L&&(f(),u())};return document.addEventListener("pointermove",g),()=>document.removeEventListener("pointermove",g)}},[i,d,s,u,f]),h(Wd,{...e,ref:n})}),[nw,sw]=Er(mo,{isInside:!1}),lw=pl("TooltipContent"),Wd=x((e,t)=>{let{__scopeTooltip:a,children:o,"aria-label":r,onEscapeKeyDown:n,onPointerDownOutside:s,...l}=e,i=ho(Ua,a),u=Or(a),{onClose:d}=i;return D(()=>(document.addEventListener(ks,d),()=>document.removeEventListener(ks,d)),[d]),D(()=>{if(i.trigger){let c=f=>{f.target instanceof Node&&f.target.contains(i.trigger)&&d()};return window.addEventListener("scroll",c,{capture:!0}),()=>window.removeEventListener("scroll",c,{capture:!0})}},[i.trigger,d]),h(ht,{asChild:!0,disableOutsidePointerEvents:!1,onEscapeKeyDown:n,onPointerDownOutside:s,onFocusOutside:c=>c.preventDefault(),onDismiss:d,children:Re(Ea,{"data-state":i.stateAttribute,...u,...l,ref:t,style:{...l.style,"--radix-tooltip-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-tooltip-content-available-width":"var(--radix-popper-available-width)","--radix-tooltip-content-available-height":"var(--radix-popper-available-height)","--radix-tooltip-trigger-width":"var(--radix-popper-anchor-width)","--radix-tooltip-trigger-height":"var(--radix-popper-anchor-height)"},children:[h(lw,{children:o}),h(nw,{scope:a,isInside:!0,children:h(Uc,{id:i.contentId,role:"tooltip",children:r||o})})]})})});Vd.displayName=Ua;var Gd="TooltipArrow",iw=x((e,t)=>{let{__scopeTooltip:a,...o}=e,r=Or(a);return sw(Gd,a).isInside?null:h(Oa,{...r,...o,ref:t})});iw.displayName=Gd;function uw(e,t){let a=Math.abs(t.top-e.y),o=Math.abs(t.bottom-e.y),r=Math.abs(t.right-e.x),n=Math.abs(t.left-e.x);switch(Math.min(a,o,r,n)){case n:return"left";case r:return"right";case a:return"top";case o:return"bottom";default:throw new Error("unreachable")}}function cw(e,t,a=5){let o=[];switch(t){case"top":o.push({x:e.x-a,y:e.y+a},{x:e.x+a,y:e.y+a});break;case"bottom":o.push({x:e.x-a,y:e.y-a},{x:e.x+a,y:e.y-a});break;case"left":o.push({x:e.x+a,y:e.y-a},{x:e.x+a,y:e.y+a});break;case"right":o.push({x:e.x-a,y:e.y-a},{x:e.x-a,y:e.y+a});break}return o}function dw(e){let{top:t,right:a,bottom:o,left:r}=e;return[{x:r,y:t},{x:a,y:t},{x:a,y:o},{x:r,y:o}]}function fw(e,t){let{x:a,y:o}=e,r=!1;for(let n=0,s=t.length-1;n<t.length;s=n++){let l=t[n],i=t[s],u=l.x,d=l.y,c=i.x,f=i.y;d>o!=f>o&&a<(c-u)*(o-d)/(f-d)+u&&(r=!r)}return r}function pw(e){let t=e.slice();return t.sort((a,o)=>a.x<o.x?-1:a.x>o.x?1:a.y<o.y?-1:a.y>o.y?1:0),mw(t)}function mw(e){if(e.length<=1)return e.slice();let t=[];for(let o=0;o<e.length;o++){let r=e[o];for(;t.length>=2;){let n=t[t.length-1],s=t[t.length-2];if((n.x-s.x)*(r.y-s.y)>=(n.y-s.y)*(r.x-s.x))t.pop();else break}t.push(r)}t.pop();let a=[];for(let o=e.length-1;o>=0;o--){let r=e[o];for(;a.length>=2;){let n=a[a.length-1],s=a[a.length-2];if((n.x-s.x)*(r.y-s.y)>=(n.y-s.y)*(r.x-s.x))a.pop();else break}a.push(r)}return a.pop(),t.length===1&&a.length===1&&t[0].x===a[0].x&&t[0].y===a[0].y?t:t.concat(a)}var Xd=zd,Es=Vd;var xw=x(({className:e,sideOffset:t=4,...a},o)=>I(Xd,null,I(Es,{ref:o,sideOffset:t,className:N("xps-tooltip-content",e),...a})));xw.displayName=Es.displayName;var te=window.React,Kd=window.ReactDOM,R=te.createElement;var Os={zh_Hans:{newDocument:"\u65B0\u5EFA",save:"\u4FDD\u5B58",import:"\u5BFC\u5165",exportJson:"JSON",openLucid:"\u6253\u5F00",askAssistant:"\u53D1\u9001",search:"\u641C\u7D22\u6587\u6863",allStatuses:"\u5168\u90E8\u72B6\u6001",draft:"\u8349\u7A3F",reviewed:"\u5DF2\u5BA1\u6838",archived:"\u5DF2\u5F52\u6863",versions:"\u7248\u672C",restore:"\u6062\u590D",archive:"\u5F52\u6863",markReviewed:"\u6807\u8BB0\u5DF2\u5BA1\u6838",backToDraft:"\u9000\u56DE\u8349\u7A3F",mermaid:"Mermaid",saveMermaid:"\u4FDD\u5B58\u8349\u7A3F",title:"\u6807\u9898",description:"\u63CF\u8FF0",drawingRequest:"\u7ED8\u56FE\u9700\u6C42",changeSummary:"\u53D8\u66F4\u6458\u8981",standardImport:"Standard Import",externalDocument:"Lucid \u6587\u6863",lucidDocumentUrl:"Lucid \u6587\u6863 URL",lucidDocumentId:"Lucid \u6587\u6863 ID",embedUrl:"Embed URL",previewUrl:"\u9884\u89C8 URL",registerExternal:"\u767B\u8BB0\u94FE\u63A5",operationCompleted:"\u64CD\u4F5C\u5DF2\u5B8C\u6210",requestTimeout:"\u8BF7\u6C42\u8D85\u65F6",remoteRequestFailed:"\u8FDC\u7A0B\u8BF7\u6C42\u5931\u8D25",unknownError:"\u672A\u77E5\u9519\u8BEF",noDocument:"\u8BF7\u9009\u62E9\u6216\u65B0\u5EFA Lucidchart \u6587\u6863",dirty:"\u672A\u4FDD\u5B58",saved:"\u5DF2\u4FDD\u5B58",untitled:"\u672A\u547D\u540D Lucidchart \u6587\u6863",documentCreated:"Lucidchart \u6587\u6863\u5DF2\u521B\u5EFA",agentDocumentUpdated:"Agent Lucidchart \u7ED3\u679C\u5DF2\u5237\u65B0",documents:"\u6587\u6863",inspector:"\u8BE6\u60C5",collapseDocuments:"\u6536\u8D77\u6587\u6863\u4FA7\u680F",expandDocuments:"\u5C55\u5F00\u6587\u6863\u4FA7\u680F",collapseInspector:"\u6536\u8D77\u8BE6\u60C5\u4FA7\u680F",expandInspector:"\u5C55\u5F00\u8BE6\u60C5\u4FA7\u680F",invalidJson:"Standard Import JSON \u65E0\u6548",standardImportNotice:"\u4FDD\u5B58\u7684\u662F Lucid Standard Import \u7684 document.json \u5185\u5BB9\uFF1B.lucid ZIP \u53EF\u7531\u5916\u90E8 Lucid REST \u5BFC\u5165\u6D41\u7A0B\u751F\u6210\u3002",embedNotice:"Lucid Embed \u662F\u5426\u53EF\u663E\u793A\u53D6\u51B3\u4E8E Lucid \u6587\u6863\u6743\u9650\u3001Cookie \u6216 token-based embed \u914D\u7F6E\u3002",embedPreview:"Lucid Embed",imagePreview:"\u9884\u89C8\u56FE",standardImportPreview:"\u7ED3\u6784\u9884\u89C8",previewUnavailable:"\u5F53\u524D Standard Import \u6682\u65E0\u53EF\u9884\u89C8\u56FE\u5F62\uFF0C\u8BF7\u68C0\u67E5 pages/shapes/lines \u6570\u636E\u3002"},en_US:{newDocument:"New",save:"Save",import:"Import",exportJson:"JSON",openLucid:"Open",askAssistant:"Send",search:"Search documents",allStatuses:"All statuses",draft:"Draft",reviewed:"Reviewed",archived:"Archived",versions:"Versions",restore:"Restore",archive:"Archive",markReviewed:"Mark reviewed",backToDraft:"Back to draft",mermaid:"Mermaid",saveMermaid:"Save draft",title:"Title",description:"Description",drawingRequest:"Drawing request",changeSummary:"Change summary",standardImport:"Standard Import",externalDocument:"Lucid document",lucidDocumentUrl:"Lucid document URL",lucidDocumentId:"Lucid document ID",embedUrl:"Embed URL",previewUrl:"Preview URL",registerExternal:"Register link",operationCompleted:"Operation completed",requestTimeout:"Request timed out",remoteRequestFailed:"Remote request failed",unknownError:"Unknown error",noDocument:"Select or create a Lucidchart document",dirty:"Unsaved",saved:"Saved",untitled:"Untitled Lucidchart document",documentCreated:"Lucidchart document created",agentDocumentUpdated:"Agent Lucidchart result refreshed",documents:"Documents",inspector:"Inspector",collapseDocuments:"Collapse documents sidebar",expandDocuments:"Expand documents sidebar",collapseInspector:"Collapse inspector",expandInspector:"Expand inspector",invalidJson:"Invalid Standard Import JSON",standardImportNotice:"This stores Lucid Standard Import document.json content. A .lucid ZIP can be produced by an external Lucid REST import flow.",embedNotice:"Lucid Embed rendering depends on document permissions, cookies, or token-based embed configuration.",embedPreview:"Lucid Embed",imagePreview:"Preview image",standardImportPreview:"Structure preview",previewUnavailable:"No previewable shapes were found in the current Standard Import. Check pages/shapes/lines data."}};function Ns(e){let t=String(e||"").toLowerCase().startsWith("en")?Os.en_US:Os.zh_Hans;return a=>t[a]||Os.en_US[a]||a}function jd(){if(document.getElementById("lucidchart-workbench-styles"))return;let e=document.createElement("style");e.id="lucidchart-workbench-styles",e.textContent=`
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
      --lw-right-width: var(--lw-rail-width);
      --lw-right-panel-width: min(360px, calc(100vw - var(--lw-rail-width) - 96px));
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
      overflow: visible;
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-header,
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      position: absolute;
      right: 0;
      width: var(--lw-right-panel-width);
      max-width: calc(100vw - 16px);
      z-index: 31;
      background: var(--xps-card);
      border-left: 1px solid var(--xps-border);
      border-right: 1px solid var(--xps-border);
      box-shadow: -12px 0 28px color-mix(in srgb, var(--xps-foreground) 14%, transparent);
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-header {
      top: 0;
      min-height: var(--lw-panel-header-height);
      border-bottom: 1px solid var(--xps-border);
    }
    .lw-inspector[aria-expanded="true"] > .xps-sidebar-content {
      top: var(--lw-panel-header-height);
      bottom: 0;
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
      grid-template-columns: minmax(160px, 240px) minmax(0, 1fr);
      align-items: center;
      gap: 8px 10px;
      min-height: 48px;
      padding: 8px 12px;
      background: var(--xps-card);
      border-bottom: 1px solid var(--xps-border);
      min-width: 0;
      overflow: visible;
    }
    .lw-toolbar-title { min-width: 0; }
    .lw-toolbar-actions {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .lw-toolbar-actions .xps-button,
    .lw-toolbar-actions .xps-badge { flex: 0 0 auto; }
    .lw-title-input { width: 100%; }
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
      display: grid;
      grid-template-rows: auto minmax(160px, 34vh) minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      overflow: hidden;
    }
    .lw-editor-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .lw-editor-header .xps-badge:last-child {
      margin-left: auto;
    }
    .lw-visual-frame {
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
    .lw-inspector-stack {
      padding: 10px 12px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
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
    .lw-hidden-file { display: none; }
    @media (max-width: 1040px) {
      .lw-shell,
      .lw-shell.left-collapsed,
      .lw-shell.right-collapsed {
        --lw-left-width: var(--lw-rail-width);
        --lw-right-width: var(--lw-rail-width);
        --lw-right-panel-width: min(320px, calc(100vw - var(--lw-rail-width) - 32px));
        grid-template-columns: var(--lw-left-width) minmax(0, 1fr) var(--lw-right-width);
      }
      .lw-sidebar .xps-sidebar-content,
      .lw-inspector-scroll { display: none; }
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
      .lw-editor-pane {
        grid-template-rows: auto minmax(120px, 28vh) minmax(0, 1fr);
      }
      .lw-status { margin-left: 0; }
    }
  `,document.head.appendChild(e)}var $d="xpertai.remote_component";var oa=new Map,Nr=null,gw=0,qa={requestTimeout:"Request timed out",remoteRequestFailed:"Remote request failed",unknownError:"Unknown error"};function Fs(e){return!!(e&&typeof e=="object"&&!Array.isArray(e))}function xo(e,t,a){!Nr&&e!=="ready"||parent.postMessage(Object.assign({channel:$d,protocolVersion:1,instanceId:Nr,type:e},t||{}),"*",a||[])}function Br(e,t,a){let o=String(++gw);return new Promise((r,n)=>{oa.set(o,{resolve:r,reject:n});try{xo(e,Object.assign({requestId:o},t||{}),a)}catch(s){oa.delete(o),n(s instanceof Error?s:new Error(qa.remoteRequestFailed));return}setTimeout(()=>{oa.has(o)&&(oa.delete(o),n(new Error(qa.requestTimeout)))},3e4)})}function Bs(e){return Br("requestData",{query:e||{}})}function Ct(e,t,a,o){return Br("executeAction",{actionKey:e,targetId:t,input:a,parameters:o})}async function Yd(e,t,a,o,r){let n=await r.arrayBuffer();return Br("executeFileAction",{actionKey:e,targetId:t,input:a,parameters:o,file:{name:r.name,type:r.type,size:r.size,buffer:n}},[n])}function Jd(e,t){return Br("invokeClientCommand",{commandKey:e,payload:t})}function fe(e,t){xo("notify",{level:e,message:t})}function Fr(){let e=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,window.innerHeight||0,720);xo("resize",{height:e,viewportBound:!0})}function Qe(e){return e?e.payload!==void 0?e.payload:e.data!==void 0?e.data:e.result!==void 0?e.result:e:null}function Ot(e,t){return e?typeof e=="string"?e:String(t||"").toLowerCase().startsWith("en")?e.en_US||e.en||e.zh_Hans||e.zh_CN||"":e.zh_Hans||e.zh_CN||e.en_US||e.en||"":""}function _e(e){return e?.message?e.message:String(e||qa.unknownError)}function Zd(e){qa={...qa,...e}}function Qd(e,t){let a=null;function o(r){window.XpertRemoteUI&&typeof window.XpertRemoteUI.applyTheme=="function"&&window.XpertRemoteUI.applyTheme(r),a={...a||{},theme:r},e(a),setTimeout(Fr,0)}window.addEventListener("message",r=>{let n=r.data;if(!(!Fs(n)||n.channel!==$d||n.protocolVersion!==1)){if(n.type==="init"){Nr=typeof n.instanceId=="string"?n.instanceId:null,a={manifest:n.manifest,payload:n.payload,initialQuery:n.initialQuery||{},locale:n.locale,theme:n.theme},window.XpertRemoteUI&&typeof window.XpertRemoteUI.applyTheme=="function"&&window.XpertRemoteUI.applyTheme(n.theme),e(a),setTimeout(Fr,0);return}if(n.instanceId===Nr){if(vw(n)){o(ww(n));return}if(n.type==="hostEvent"){t(n.event);return}if(n.requestId&&oa.has(String(n.requestId))){let s=oa.get(String(n.requestId));if(oa.delete(String(n.requestId)),!s)return;n.type==="error"?s.reject(new Error(String(n.message||qa.remoteRequestFailed))):s.resolve(n)}}}})}function vw(e){return["theme","themeChanged","theme-change","hostThemeChanged","host-theme-changed"].includes(String(e.type||""))}function ww(e){return e.theme!==void 0?e.theme:Fs(e.payload)&&e.payload.theme!==void 0?e.payload.theme:Fs(e.data)&&e.data.theme!==void 0?e.data.theme:e.payload??e.data??null}var Cw=`flowchart TD
  A[User Request] --> B[Agent Plans Lucidchart Draft]
  B --> C{Best Path?}
  C -->|Structured import| D[Save Standard Import]
  C -->|Still exploring| E[Save Mermaid Draft]
  C -->|Already in Lucid| F[Register Lucid URL]`,go=new Set(["lucidchart_create_document","lucidchart_save_standard_import_version","lucidchart_patch_standard_import","lucidchart_save_mermaid_draft","lucidchart_register_external_document","lucidchart_search_documents","lucidchart_get_document","lucidchart_update_document_status","lucidchart_report_failure"]),Lw=new Set(["lucidchart_create_document","lucidchart_save_standard_import_version","lucidchart_patch_standard_import","lucidchart_save_mermaid_draft","lucidchart_register_external_document","lucidchart_update_document_status","lucidchart_report_failure"]);$s({styleId:"lucidchart-workbench-shadcn-ui-vars"});jd();function Iw(){let[e,t]=te.useState(null),[a,o]=te.useState([]),[r,n]=te.useState(null),[s,l]=te.useState(""),[i,u]=te.useState(""),[d,c]=te.useState(""),[f,m]=te.useState(!1),[g,p]=te.useState(!1),[v,w]=te.useState(""),[C,L]=te.useState(""),[S,P]=te.useState(""),[E,T]=te.useState(""),[_,z]=te.useState(()=>tf(ef("Untitled"))),[V,K]=te.useState(Cw),[F,Y]=te.useState(""),[$,ae]=te.useState(""),[j,J]=te.useState(""),[U,O]=te.useState(""),[ee,se]=te.useState(!0),[pe,Oe]=te.useState(!0),ye=te.useRef(null),Ie=te.useRef(null),we=te.useRef(""),W=te.useRef(""),oe=te.useRef(""),Se=te.useRef(0),le=te.useRef(""),k=Ns(e?.locale);te.useEffect(()=>{Zd({requestTimeout:k("requestTimeout"),remoteRequestFailed:k("remoteRequestFailed"),unknownError:k("unknownError")})},[e?.locale]),te.useEffect(()=>{we.current=s},[s]),te.useEffect(()=>{W.current=i},[i]),te.useEffect(()=>{oe.current=d},[d]),te.useEffect(()=>{Qd(b=>{Ie.current=b,t(b),ge(b.payload||null),setTimeout(()=>Pe(),0)},b=>{Ne(b)}),xo("ready")},[]),te.useEffect(Fr,[a,r,f,g,ee,pe]);function ge(b){if(b){if(Array.isArray(b.items)){o(b.items),!we.current&&b.items[0]?.id&&Me(b.items[0].id);return}b.item&&He(b)}}function He(b){n(b);let G=b.item?.id||"";we.current=G,l(G),P("");let Z=b.currentVersion||null,Ce=b.item?.title||k("untitled"),tt=ve(Z?.standardImport)?Z?.standardImport:ef(Ce),it=tf(tt);z(it);let Wa=typeof Z?.mermaidSource=="string"?Z.mermaidSource:"",Gs=_r(Z?.lucidDocumentId,b.item?.lucidDocumentId),Xs=_r(Z?.lucidDocumentUrl,b.item?.lucidDocumentUrl),Ks=_r(Z?.embedUrl,b.item?.embedUrl),js=_r(Z?.previewUrl,b.item?.previewUrl);K(Wa),Y(Gs),ae(Xs),J(Ks),O(js),le.current=af(it,Wa,Gs,Xs,Ks,js),p(!1)}async function Ne(b){let G=Ow(b);if(G&&!go.has(G))return;let Z=++Se.current,Ce=Nw(b),tt=await Pe();if(Z!==Se.current)return;let it=!Ce&&(G==="lucidchart_create_document"||G==="lucidchart_save_mermaid_draft"&&!we.current),Wa=Ce??(it?tt[0]?.id:we.current)??tt[0]?.id;Wa&&await Me(Wa),(!G||Lw.has(G))&&fe("info",Ns(Ie.current?.locale)("agentDocumentUpdated"))}async function Pe(b={}){let G=b.search??W.current,Z=b.status??oe.current;m(!0);try{let Ce=await Bs({page:1,pageSize:50,search:G,parameters:{...Z?{status:Z}:{}}}),tt=Qe(Ce)||{},it=Array.isArray(tt.items)?tt.items:[];return o(it),!we.current&&it[0]?.id&&await Me(it[0].id),it}catch(Ce){return fe("error",_e(Ce)),[]}finally{m(!1)}}async function Me(b){if(!b)return null;m(!0);try{let G=await Bs({parameters:{documentId:b}}),Z=Qe(G)||{};return He(Z),Z}catch(G){return fe("error",_e(G)),null}finally{m(!1)}}async function za(){let b=v.trim()||k("untitled");m(!0);try{let G=await Ct("create_document",null,{title:b,description:C}),Z=Qe(G);fe("success",Ot(Z?.message,Ie.current?.locale)||k("documentCreated"));let Ce=Z?.item?.id||Z?.data?.item?.id;w(""),L(""),P(""),Ce?(await Pe(),await Me(Ce)):await Pe()}catch(G){fe("error",_e(G))}finally{m(!1)}}async function sf(){if(!s){fe("warning",k("noDocument"));return}let b;try{if(b=JSON.parse(_),!ve(b))throw new Error(k("invalidJson"))}catch(G){fe("error",`${k("invalidJson")}: ${_e(G)}`);return}m(!0);try{let G=await Ct("save_standard_import_version",s,{documentId:s,standardImport:b,mermaidSource:V.trim()||void 0,lucidDocumentId:F.trim()||void 0,lucidDocumentUrl:$.trim()||void 0,embedUrl:j.trim()||void 0,previewUrl:U.trim()||void 0,product:"lucidchart",importFileName:`${r?.item?.title||"document"}.json`,changeSummary:S.trim()||void 0}),Z=Qe(G);fe("success",Ot(Z?.message,Ie.current?.locale)||k("operationCompleted")),P(""),await Me(s),await Pe()}catch(G){fe("error",_e(G))}finally{m(!1)}}async function lf(){let b=V.trim();if(b){m(!0);try{let G=await Ct("save_mermaid_draft",s||null,{documentId:s||void 0,title:v.trim()||r?.item?.title||k("untitled"),description:C,mermaidSource:b,changeSummary:S.trim()||void 0}),Z=Qe(G);fe("success",Ot(Z?.message,Ie.current?.locale)||k("operationCompleted"));let Ce=Z?.document?.item?.id||Z?.data?.document?.item?.id||s;P(""),await Pe(),Ce&&await Me(Ce)}catch(G){fe("error",_e(G))}finally{m(!1)}}}async function uf(){if(!s&&!v.trim()){fe("warning",k("noDocument"));return}m(!0);try{let b=await Ct("register_external_document",s||null,{documentId:s||void 0,title:v.trim()||r?.item?.title||k("untitled"),description:C,lucidDocumentId:F.trim()||void 0,lucidDocumentUrl:$.trim()||void 0,embedUrl:j.trim()||void 0,previewUrl:U.trim()||void 0,product:"lucidchart",changeSummary:S.trim()||void 0}),G=Qe(b);fe("success",Ot(G?.message,Ie.current?.locale)||k("operationCompleted"));let Z=G?.document?.item?.id||G?.data?.document?.item?.id||s;P(""),await Pe(),Z&&await Me(Z)}catch(b){fe("error",_e(b))}finally{m(!1)}}async function cf(b){if(!(!s||!b)){m(!0);try{let G=await Ct("restore_version",s,{documentId:s,versionId:b,changeSummary:S.trim()||void 0}),Z=Qe(G);fe("success",Ot(Z?.message,Ie.current?.locale)||k("operationCompleted")),await Me(s),await Pe()}catch(G){fe("error",_e(G))}finally{m(!1)}}}async function df(){if(s){m(!0);try{await Ct("archive_document",s,{documentId:s}),fe("success",k("operationCompleted")),n(null),l(""),await Pe()}catch(b){fe("error",_e(b))}finally{m(!1)}}}async function zs(b){if(s){m(!0);try{let G=await Ct(b==="reviewed"?"mark_reviewed":"mark_draft",s,{documentId:s,reason:S.trim()||void 0}),Z=Qe(G);fe("success",Ot(Z?.message,Ie.current?.locale)||k("operationCompleted")),P(""),await Me(s),await Pe(oe.current&&oe.current!==b?{status:""}:{}),oe.current&&oe.current!==b&&(oe.current="",c(""))}catch(G){fe("error",_e(G))}finally{m(!1)}}}async function ff(){let b=E.trim();if(b){m(!0);try{let G=await Ct("prepare_agent_draw_message",s||null,{documentId:s||void 0,prompt:b}),Z=Qe(G),Ce=Z?.data?.commandKey||Z?.commandKey,tt=Z?.data?.payload||Z?.payload;Ce&&tt&&await Jd(Ce,tt),T(""),fe("success",k("operationCompleted"))}catch(G){fe("error",_e(G))}finally{m(!1)}}}async function pf(b){if(b){m(!0);try{let G=await Yd("import_standard_import_file",s||null,{documentId:s||void 0,title:Fw(b.name)},{documentId:s||void 0},b),Z=Qe(G);fe("success",Ot(Z?.message,Ie.current?.locale)||k("operationCompleted"));let Ce=Z?.data?.item?.id||Z?.item?.id||s;await Pe(),Ce&&await Me(Ce)}catch(G){fe("error",_e(G))}finally{m(!1),ye.current&&(ye.current.value="")}}}function mf(b){z(b),ra({standardImportText:b})}function hf(b){K(b),ra({mermaidSource:b})}function xf(b){ae(b),ra({lucidDocumentUrl:b})}function gf(b){J(b),ra({embedUrl:b})}function vf(b){Y(b),ra({lucidDocumentId:b})}function wf(b){O(b),ra({previewUrl:b})}function ra(b={}){if(!we.current){p(!1);return}let G=af(b.standardImportText??_,b.mermaidSource??V,b.lucidDocumentId??F,b.lucidDocumentUrl??$,b.embedUrl??j,b.previewUrl??U);p(G!==le.current)}function Cf(){try{let b=JSON.parse(_);Bw(new Blob([JSON.stringify(b,null,2)],{type:"application/json"}),`${r?.item?.title||"document"}.json`)}catch(b){fe("error",`${k("invalidJson")}: ${_e(b)}`)}}let Vs=r?.currentVersion||null,qr=r?.item?.status||"draft",Va=j.trim(),vo=U.trim(),Ws=Va||$.trim(),wo=te.useMemo(()=>yw(_),[_]),Lf=!!(s&&g&&!f),If=`lw-shell ${ee?"left-collapsed":""} ${pe?"right-collapsed":""}`,Sf=k(Va?"embedPreview":vo?"imagePreview":wo?"standardImportPreview":"saved");return R("div",{className:If},R(Ir,{className:"lw-sidebar",side:"left",collapsed:ee},R(Sr,null,R(Pr,{variant:"ghost",size:"icon","aria-label":k(ee?"expandDocuments":"collapseDocuments"),title:k(ee?"expandDocuments":"collapseDocuments"),onClick:()=>se(b=>!b)},ee?R(mt,{className:"lw-button-icon","aria-hidden":"true"}):R(pt,{className:"lw-button-icon","aria-hidden":"true"})),ee?null:R(te.Fragment,null,R(Rr,null,k("documents")),R(Ht,{variant:"secondary"},a.length))),ee?R(yr,null,R("span",null,k("documents"))):R(br,null,R("div",{className:"lw-sidebar-controls"},R(wt,{value:i,placeholder:k("search"),onChange:b=>{let G=b.target.value;W.current=G,u(G),Pe({search:G})}}),R(sd,{value:d||"all",onValueChange:b=>{let G=b==="all"?"":b;oe.current=G,c(G),Pe({status:G})}},R(ds,{"aria-label":k("allStatuses")},R(ld,{placeholder:k("allStatuses")})),R(fs,null,R(Ba,{value:"all"},k("allStatuses")),R(Ba,{value:"draft"},k("draft")),R(Ba,{value:"reviewed"},k("reviewed")),R(Ba,{value:"archived"},k("archived"))))),R(cr,{className:"lw-list"},R(ps,null,a.map(b=>R(ms,{key:b.id},R(hs,{type:"button",active:b.id===s,onClick:()=>Me(b.id)},R("span",{className:"lw-item-title"},b.title||k("untitled")),R("span",{className:"lw-item-meta"},"v",b.currentVersionNumber||0," \xB7 ",k(b.status||"draft"))))))))),R("main",{className:"lw-main"},R("div",{className:"lw-toolbar"},R("div",{className:"lw-toolbar-title"},R(wt,{className:"lw-title-input",value:v,placeholder:k("title"),onChange:b=>w(b.target.value)})),R("div",{className:"lw-toolbar-actions"},R(Te,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:za},R(xa,{className:"lw-button-icon","aria-hidden":"true"}),k("newDocument")),R(Te,{type:"button",size:"sm",disabled:!Lf,onClick:sf},R(ga,{className:"lw-button-icon","aria-hidden":"true"}),k("save")),R(Te,{type:"button",variant:"outline",size:"sm",disabled:f,onClick:()=>ye.current?.click()},R(wa,{className:"lw-button-icon","aria-hidden":"true"}),k("import")),R(Te,{type:"button",variant:"outline",size:"sm",disabled:!s,onClick:Cf},R(fa,{className:"lw-button-icon","aria-hidden":"true"}),k("exportJson")),R(Te,{type:"button",variant:"outline",size:"sm",disabled:!Ws,onClick:()=>window.open(Ws,"_blank","noopener,noreferrer")},R(pa,{className:"lw-button-icon","aria-hidden":"true"}),k("openLucid")),R(Ht,{className:"lw-status",variant:g?"warning":"secondary"},k(g?"dirty":"saved"))),R("input",{ref:ye,className:"lw-hidden-file",type:"file",accept:".json,application/json",onChange:b=>pf(b.target.files?.[0]||null)})),R("div",{className:"lw-stage"},s||r?.item?R("div",{className:"lw-editor-pane"},R("div",{className:"lw-editor-header"},R(Ht,{variant:"secondary"},k("standardImport")),Vs?.sourceType?R(Ht,{variant:"secondary"},Vs.sourceType):null,R(Ht,{variant:Va||vo||wo?"success":"secondary"},Sf)),R("div",{className:"lw-visual-frame"},Va?R("iframe",{title:"Lucidchart embed",src:Va}):vo?R("img",{src:vo,alt:k("imagePreview")}):wo?R(bw,{model:wo}):R("div",{className:"lw-embed-empty"},k("previewUnavailable"))),R(Ha,{className:"lw-json-editor",value:_,onChange:b=>mf(b.target.value)})):R("div",{className:"lw-empty"},k("noDocument")))),R(Ir,{className:"lw-inspector",side:"right",collapsed:pe},R(Sr,null,pe?null:R(te.Fragment,null,R("div",{className:"lw-inspector-actions"},qr==="archived"?R(Ht,{variant:"secondary"},k("archived")):qr==="reviewed"?R(Te,{type:"button",variant:"outline",size:"sm",disabled:f||!s,onClick:()=>zs("draft")},R(Bt,{className:"lw-button-icon","aria-hidden":"true"}),k("backToDraft")):R(Te,{type:"button",variant:"outline",size:"sm",disabled:f||!s,onClick:()=>zs("reviewed")},R(Ue,{className:"lw-button-icon","aria-hidden":"true"}),k("markReviewed")),R(Te,{type:"button",variant:"destructiveOutline",size:"sm",disabled:f||!s||qr==="archived",onClick:df},R(ua,{className:"lw-button-icon","aria-hidden":"true"}),k("archive"))),R(Rr,{className:"lw-sidebar-title-truncate"},r?.item?.title||k("inspector"))),R(Pr,{className:"lw-sidebar-trigger-right",variant:"ghost",size:"icon","aria-label":k(pe?"expandInspector":"collapseInspector"),title:k(pe?"expandInspector":"collapseInspector"),onClick:()=>Oe(b=>!b)},pe?R(ha,{className:"lw-button-icon","aria-hidden":"true"}):R(ma,{className:"lw-button-icon","aria-hidden":"true"}))),pe?R(yr,null,R("span",null,k("inspector"))):R(br,null,R(cr,{className:"lw-inspector-scroll"},R("div",{className:"lw-inspector-stack"},R("section",{className:"lw-section"},R("div",{className:"lw-section-title"},k("changeSummary")),R(wt,{value:S,placeholder:k("changeSummary"),onChange:b=>P(b.target.value)})),R("section",{className:"lw-section"},R("div",{className:"lw-section-title"},k("versions")),(r?.versions||[]).map(b=>R("div",{className:"lw-version",key:b.id},R("div",null,R("div",null,"v",b.versionNumber),R("div",{className:"lw-muted"},b.sourceType||"workbench")),R(Te,{className:"lw-version-action",type:"button",variant:"outline",size:"icon",title:k("restore"),"aria-label":`${k("restore")} v${b.versionNumber}`,disabled:f,onClick:()=>cf(b.id)},R(Bt,{className:"lw-button-icon","aria-hidden":"true"}))))),R("section",{className:"lw-section"},R("div",{className:"lw-section-title"},k("mermaid")),R(Ha,{value:V,onChange:b=>hf(b.target.value)}),R("div",{className:"lw-muted"},k("standardImportNotice")),R("div",{className:"lw-inline-actions"},R(Te,{type:"button",size:"sm",disabled:f||!V.trim(),onClick:lf},k("saveMermaid")))),R("section",{className:"lw-section"},R("div",{className:"lw-section-title"},k("externalDocument")),R(wt,{value:$,placeholder:k("lucidDocumentUrl"),onChange:b=>xf(b.target.value)}),R(wt,{value:j,placeholder:k("embedUrl"),onChange:b=>gf(b.target.value)}),R(wt,{value:F,placeholder:k("lucidDocumentId"),onChange:b=>vf(b.target.value)}),R(wt,{value:U,placeholder:k("previewUrl"),onChange:b=>wf(b.target.value)}),R(Te,{type:"button",size:"sm",disabled:f||!F.trim()&&!$.trim()&&!j.trim(),onClick:uf},k("registerExternal"))),R("section",{className:"lw-section"},R("div",{className:"lw-section-title"},k("drawingRequest")),R(Ha,{value:E,placeholder:k("drawingRequest"),onChange:b=>T(b.target.value)}),R(Te,{type:"button",disabled:f||!E.trim(),onClick:ff},R(va,{className:"lw-button-icon","aria-hidden":"true"}),k("askAssistant"))),R("section",{className:"lw-section"},R("div",{className:"lw-section-title"},k("description")),R(Ha,{value:C,placeholder:k("description"),onChange:b=>L(b.target.value)})))))))}function ef(e){return{title:e,product:"lucidchart",pages:[{id:"page-1",title:"Page 1",shapes:[],lines:[]}]}}function tf(e){return JSON.stringify(e,null,2)}function af(e,t,a,o,r,n){return JSON.stringify({standardImportText:Sw(e),mermaidSource:t.replace(/\r\n/g,`
`),lucidDocumentId:a,lucidDocumentUrl:o,embedUrl:r,previewUrl:n})}function Sw(e){try{return JSON.stringify(JSON.parse(e))}catch{return e}}function _r(...e){for(let t of e)if(typeof t=="string"&&t.trim())return t.trim();return""}function ve(e){return!!(e&&typeof e=="object"&&!Array.isArray(e))}function bw({model:e}){return R("div",{className:"lw-standard-preview"},R("svg",{viewBox:e.viewBox,role:"img","aria-label":"Lucidchart Standard Import preview"},R("defs",null,R("marker",{id:"lw-standard-preview-arrow",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth"},R("path",{d:"M 0 0 L 8 4 L 0 8 z",fill:"var(--xps-muted-foreground)"}))),e.lines.map(t=>R("g",{key:t.id},R("line",{x1:t.x1,y1:t.y1,x2:t.x2,y2:t.y2,stroke:t.strokeColor,strokeWidth:t.strokeWidth,strokeLinecap:"round",markerEnd:"url(#lw-standard-preview-arrow)"}),t.text?R("text",{className:"lw-preview-line-label",x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2-8,textAnchor:"middle"},Ew(t.text,32)):null)),e.shapes.map(t=>{let a=Aw(t.text||t.id),o=t.y+t.h/2-(a.length-1)*15/2;return R("g",{key:t.id},Rw(t),R("text",{className:"lw-preview-label",textAnchor:"middle",dominantBaseline:"middle"},a.map((r,n)=>R("tspan",{key:`${t.id}-${n}`,x:t.x+t.w/2,y:o+n*15},r))))})))}function Rw(e){let t=e.type.toLowerCase();if(t.includes("diamond")||t.includes("rhombus")||t.includes("decision")){let a=[`${e.x+e.w/2},${e.y}`,`${e.x+e.w},${e.y+e.h/2}`,`${e.x+e.w/2},${e.y+e.h}`,`${e.x},${e.y+e.h/2}`].join(" ");return R("polygon",{className:"lw-preview-shape",points:a,fill:e.fillColor,stroke:e.strokeColor,strokeWidth:e.strokeWidth})}return t.includes("circle")||t.includes("ellipse")||t.includes("terminator")?R("ellipse",{className:"lw-preview-shape",cx:e.x+e.w/2,cy:e.y+e.h/2,rx:e.w/2,ry:e.h/2,fill:e.fillColor,stroke:e.strokeColor,strokeWidth:e.strokeWidth}):R("rect",{className:"lw-preview-shape",x:e.x,y:e.y,width:e.w,height:e.h,rx:e.cornerRadius,fill:e.fillColor,stroke:e.strokeColor,strokeWidth:e.strokeWidth})}function yw(e){let t=nf(e);if(!ve(t))return null;let a=ve(t.standardImport)?t.standardImport:t,o=[],r=[];_s(a,o,r,0,new WeakSet);let n=o.map((u,d)=>Pw(u,d)).filter(u=>!!u),s=new Map(n.map(u=>[u.id,u])),l=r.map((u,d)=>Tw(u,d,s)).filter(u=>!!u);if(!n.length&&!l.length)return null;let i=Mw(n,l);return{shapes:n,lines:l,viewBox:`${i.x} ${i.y} ${i.w} ${i.h}`}}function _s(e,t,a,o,r){if(!(o>7||e==null)){if(Array.isArray(e)){e.forEach(n=>_s(n,t,a,o+1,r));return}if(ve(e)&&!r.has(e)){if(r.add(e),kw(e)){a.push(e);return}if(Us(e)){t.push(e);return}["pages","layers","groups","children","items","objects","blocks","shapes","lines","connectors"].forEach(n=>_s(e[n],t,a,o+1,r))}}}function Pw(e,t){let a=Us(e);if(!a)return null;let o=qs(e.format,e.style,e.styles,e.properties),r=et(e.id,e.uuid,e.shapeId,e.name)||`shape-${t+1}`,n=et(e.text,e.label,e.name,e.title)||r;return{id:r,x:a.x,y:a.y,w:a.w,h:a.h,text:n,type:et(e.type,e.shape,e.shapeType,e.class,e.name)||"rect",fillColor:et(e.fillColor,o?.fillColor,o?.fill,o?.backgroundColor,e.backgroundColor)||"#eff6ff",strokeColor:et(e.strokeColor,o?.strokeColor,o?.stroke,o?.borderColor,e.borderColor)||"#2563eb",strokeWidth:ke(e.strokeWidth,o?.strokeWidth,o?.borderWidth)??1.5,cornerRadius:ke(e.cornerRadius,o?.cornerRadius,e.radius,o?.radius)??8}}function Tw(e,t,a){let o=Ur(e,["fromId","sourceId","startShapeId","startId","from","source","start"]),r=Ur(e,["toId","targetId","endShapeId","endId","to","target","end"]),n=o?a.get(o):null,s=r?a.get(r):null,l=n?of(n):Hr(e,["start","fromPoint","sourcePoint","p1","endpoint1"]),i=s?of(s):Hr(e,["end","toPoint","targetPoint","p2","endpoint2"]),u=Us(e),d=l?.x??ke(e.x1,e.startX,e.fromX)??u?.x,c=l?.y??ke(e.y1,e.startY,e.fromY)??u?.y,f=i?.x??ke(e.x2,e.endX,e.toX)??(u?u.x+u.w:null),m=i?.y??ke(e.y2,e.endY,e.toY)??(u?u.y+u.h:null);if(![d,c,f,m].every(p=>typeof p=="number"&&Number.isFinite(p)))return null;let g=qs(e.format,e.style,e.styles,e.properties);return{id:et(e.id,e.uuid,e.lineId,e.name)||`line-${t+1}`,x1:d,y1:c,x2:f,y2:m,text:et(e.text,e.label,e.name,e.title)||"",strokeColor:et(e.strokeColor,g?.strokeColor,g?.stroke,e.color)||"#64748b",strokeWidth:ke(e.strokeWidth,g?.strokeWidth,e.width)??1.5}}function kw(e){let t=(et(e.type,e.shape,e.shapeType,e.class)||"").toLowerCase(),a=["line","arrow","connector","straightline","elbowline"].includes(t)||t.includes("connector")||t.includes("arrow")||t.includes("straight_line")||t.includes("elbow_line"),o=!!Ur(e,["fromId","sourceId","startShapeId","startId","from","source","start"])&&!!Ur(e,["toId","targetId","endShapeId","endId","to","target","end"]),r=ke(e.x1,e.startX,e.fromX)!=null&&ke(e.y1,e.startY,e.fromY)!=null&&ke(e.x2,e.endX,e.toX)!=null&&ke(e.y2,e.endY,e.toY)!=null,n=!!Hr(e,["start","fromPoint","sourcePoint","p1","endpoint1"])&&!!Hr(e,["end","toPoint","targetPoint","p2","endpoint2"]);return o||r||n||a}function Us(e){let t=qs(e.bounds,e.boundingBox,e.box,e.geometry,e.position),a=ke(e.x,e.left,t?.x,t?.left),o=ke(e.y,e.top,t?.y,t?.top),r=ke(e.w,e.width,t?.w,t?.width),n=ke(e.h,e.height,t?.h,t?.height);return[a,o,r,n].every(s=>typeof s=="number"&&Number.isFinite(s))&&r>0&&n>0?{x:a,y:o,w:r,h:n}:null}function Hr(e,t){for(let a of t){let o=e[a];if(ve(o)){let r=ke(o.x,o.left),n=ke(o.y,o.top);if(typeof r=="number"&&typeof n=="number")return{x:r,y:n}}}return null}function Ur(e,t){for(let a of t){let o=e[a],r=et(o);if(r)return r;if(ve(o)){let n=et(o.id,o.shapeId,o.nodeId,o.ref,o.reference);if(n)return n}}return null}function of(e){return{x:e.x+e.w/2,y:e.y+e.h/2}}function Mw(e,t){let a=Number.POSITIVE_INFINITY,o=Number.POSITIVE_INFINITY,r=Number.NEGATIVE_INFINITY,n=Number.NEGATIVE_INFINITY;if(e.forEach(l=>{a=Math.min(a,l.x),o=Math.min(o,l.y),r=Math.max(r,l.x+l.w),n=Math.max(n,l.y+l.h)}),t.forEach(l=>{a=Math.min(a,l.x1,l.x2),o=Math.min(o,l.y1,l.y2),r=Math.max(r,l.x1,l.x2),n=Math.max(n,l.y1,l.y2)}),![a,o,r,n].every(Number.isFinite))return{x:0,y:0,w:800,h:360};let s=48;return{x:a-s,y:o-s,w:Math.max(360,r-a+s*2),h:Math.max(220,n-o+s*2)}}function qs(...e){return e.find(ve)||null}function et(...e){for(let t of e){if(typeof t=="string"&&t.trim())return t.trim();if(typeof t=="number"&&Number.isFinite(t))return String(t)}return""}function ke(...e){for(let t of e){if(typeof t=="number"&&Number.isFinite(t))return t;if(typeof t=="string"&&t.trim()){let a=Number(t);if(Number.isFinite(a))return a}}return null}function Aw(e){return e.replace(/\r\n/g,`
`).split(`
`).flatMap(t=>Dw(t.trim(),18)).filter(Boolean).slice(0,5)}function Dw(e,t){if(!e)return[];let a=[];for(let o=0;o<e.length;o+=t)a.push(e.slice(o,o+t));return a}function Ew(e,t){return e.length>t?`${e.slice(0,t-1)}...`:e}function Ow(e){for(let t of rf(e)){if(!ve(t))continue;let a=ie(t,"toolName")??ie(t,"tool_name")??ie(t,"name");if(a&&go.has(a))return a;let o=t.tool;if(ve(o)){let n=ie(o,"name")??ie(o,"toolName")??ie(o,"tool_name");if(n&&go.has(n))return n}if(ve(t.function)){let n=ie(t.function,"name")??ie(t.function,"toolName")??ie(t.function,"tool_name");if(n&&go.has(n))return n}let r=t.toolCall??t.tool_call;if(ve(r)){let n=ie(r,"name")??ie(r,"toolName")??ie(r,"tool_name")??(ve(r.function)?ie(r.function,"name"):null);if(n&&go.has(n))return n}}return null}function Nw(e){for(let t of rf(e)){if(!ve(t))continue;let a=ie(t,"documentId")??ie(t,"document_id")??ie(t,"lucidchartDocumentId")??ie(t,"lucidchart_document_id")??ie(t,"drawingId");if(a)return a;if(ve(t.item)){let o=ie(t.item,"id");if(o)return o}if(ve(t.document)){let o=ie(t.document,"documentId")??ie(t.document,"document_id")??ie(t.document,"id")??(ve(t.document.item)?ie(t.document.item,"id"):null);if(o)return o}if(ve(t.version)){let o=ie(t.version,"documentId")??ie(t.version,"document_id");if(o)return o}if(Array.isArray(t.items)){let o=t.items.find(ve);if(o){let r=ie(o,"id")??ie(o,"documentId")??ie(o,"document_id");if(r)return r}}}return null}function rf(e){let t=[];return Hs(e,t,0,new WeakSet),t}function Hs(e,t,a,o){if(a>5||e==null)return;let r=nf(e);if(!((ve(r)||Array.isArray(r))&&o.has(r))){if((ve(r)||Array.isArray(r))&&o.add(r),t.push(r),Array.isArray(r)){r.forEach(n=>Hs(n,t,a+1,o));return}ve(r)&&["payload","metadata","data","result","output","content","message","detail","response","document","documents","item","items","version","versions","toolResult","tool_result","toolResponse","tool_response","resultText","text","tool","toolCall","tool_call","function","arguments","args","input"].forEach(n=>Hs(r[n],t,a+1,o))}}function nf(e){if(typeof e!="string")return e;let t=e.trim();if(!t||!t.startsWith("{")&&!t.startsWith("["))return e;try{return JSON.parse(t)}catch{return e}}function ie(e,t){let a=e[t];return typeof a=="string"&&a.trim()?a.trim():null}function Fw(e){return e.replace(/\.(lucid|lucidchart|json)(?:\.json)?$/i,"").replace(/document$/i,"Lucidchart Document")||e}function Bw(e,t){let a=URL.createObjectURL(e),o=document.createElement("a");o.href=a,o.download=t,document.body.appendChild(o),o.click(),o.remove(),URL.revokeObjectURL(a)}var _w=Kd.createRoot(document.getElementById("root"));_w.render(R(Iw,null));})();
