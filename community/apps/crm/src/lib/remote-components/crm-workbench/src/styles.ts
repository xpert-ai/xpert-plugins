export function injectStyles() {
  if (document.getElementById('crm-workbench-styles')) return
  const style = document.createElement('style')
  style.id = 'crm-workbench-styles'
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
	      --crm20-primary: var(--primary, var(--xui-color-primary, #2563eb));
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
    .crm20-sidebar-switcher [data-slot="button"] { height: 28px; min-width: 0; border-radius: 14px; color: var(--crm20-muted); }
    .crm20-sidebar-switcher .crm20-switcher-active, .crm20-sidebar-switcher [data-slot="button"]:hover { background: #f3f4f6; color: #111827; }
    .crm20-chat-button { align-self: flex-end; border-radius: 18px; color: #4b5563; }
    .crm20-nav-section { color: var(--crm20-soft); font-size: 12px; font-weight: 700; padding: 8px 2px 0; }
    .crm20-object-nav { display: grid; gap: 2px; }
    .crm20-object-nav [data-slot="button"] { height: 36px; justify-content: flex-start; border: 0; color: #5f6368; font-weight: 600; padding: 0 8px; }
    .crm20-object-nav [data-slot="button"]:hover, .crm20-object-nav [data-slot="button"].is-active { background: #e9eaec; color: #2f3337; }
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
	    .crm20-search [data-slot="input"] { height: 28px; border: 0; padding: 0; background: transparent; box-shadow: none; }
	    .crm20-toolbar-button { color: #5f6368; gap: 6px; }
	    .crm20-toolbar-button.is-active { color: #1f2937; background: #eff3ff; border-color: #ccd8ff; }
	    .crm20-toolbar-meta { color: var(--crm20-soft); font-weight: 600; }
	    .crm20-dropdown[data-slot="dropdown-menu-content"] { min-width: 178px; z-index: 30; }
	    .crm20-toolbar-button [data-slot="badge"] { height: 18px; padding: 0 6px; font-size: 10px; }
	    .crm20-notice { margin: 8px 12px 0; border: 1px solid #f2c94c; background: #fffbeb; color: #7a4d00; padding: 8px 10px; border-radius: 5px; font-size: 13px; }
	    .crm20-content { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch; position: relative; overflow: hidden; }
	    .crm20-table-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) 78px; }
	    .crm20-selection-slot { min-height: 0; overflow: hidden; border-bottom: 0 solid transparent; transition: min-height 140ms ease, border-color 140ms ease; }
	    .crm20-selection-slot.is-visible { min-height: 38px; border-bottom-color: var(--crm20-border-soft); }
	    .crm20-selection-bar { height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: #f8fbff; color: #64748b; }
	    .crm20-selection-bar strong { color: #334155; font-weight: 700; }
	    .crm20-selection-bar [data-slot="badge"] { height: 20px; min-width: 24px; justify-content: center; }
	    .crm20-selection-bar [data-slot="button"] { margin-left: auto; color: #4169e1; }
	    .crm20-grid-scroll { min-width: 0; min-height: 0; overflow: auto; position: relative; background: var(--crm20-panel); }
	    .crm20-grid { width: 100%; min-width: 1040px; table-layout: fixed; }
	    .crm20-grid [data-slot="table-head"], .crm20-grid [data-slot="table-cell"] { height: 39px; border-right: 1px solid var(--crm20-border-soft); border-bottom: 1px solid #eeeeef; text-align: left; vertical-align: middle; padding: 0 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #4b5563; }
	    .crm20-compact .crm20-grid [data-slot="table-head"], .crm20-compact .crm20-grid [data-slot="table-cell"] { height: 34px; padding: 0 10px; }
	    .crm20-grid [data-slot="table-head"] { position: sticky; top: 0; z-index: 2; background: #fbfbfc; color: var(--crm20-soft); font-weight: 650; }
	    .crm20-grid [data-slot="table-row"]:hover [data-slot="table-cell"] { background: #fafafa; }
	    .crm20-grid [data-slot="table-row"].is-selected [data-slot="table-cell"] { background: var(--crm20-active); }
	    .crm20-grid [data-slot="table-row"].is-checked [data-slot="table-cell"] { background: #f8fbff; }
	    .crm20-grid [data-slot="table-row"].is-selected.is-checked [data-slot="table-cell"] { background: #ecf3ff; }
    .crm20-check-col { width: 44px; }
    .crm20-extra-col { width: 52px; }
    .crm20-check-cell, .crm20-extra-cell { width: 44px; text-align: center !important; padding: 0 !important; color: var(--crm20-soft); }
    .crm20-grid [data-slot="checkbox"] { vertical-align: middle; }
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
	    .crm20-inspector-content[data-slot="sheet-content"] { width: min(400px, calc(100vw - 24px)); max-width: calc(100vw - 24px); padding: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; }
	    .crm20-inspector-header { min-height: 76px; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: flex-start; gap: 12px; padding: 14px; }
	    .crm20-inspector-avatar { width: 36px; height: 36px; border-radius: 8px; color: #fff; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
	    .crm20-inspector-avatar span { display: inline; color: inherit; font-size: 12px; margin: 0; }
	    .crm20-inspector-header div { min-width: 0; }
	    .crm20-inspector-header span { display: block; color: var(--crm20-soft); font-size: 12px; margin-bottom: 4px; }
	    .crm20-inspector-header strong { display: block; color: #1f2937; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
    .crm20-inspector-meta { min-height: 42px; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 14px; color: var(--crm20-muted); font-size: 12px; }
    .crm20-inspector-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-inspector-tabs { min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .crm20-inspector-tabs [data-slot="tabs-list"] { margin: 10px 14px 0; width: calc(100% - 28px); }
    .crm20-inspector-tabs [data-slot="tabs-trigger"] { flex: 1 1 0; }
    .crm20-inspector-tabs [data-slot="tabs-content"] { min-height: 0; overflow: hidden; margin: 0; }
    .crm20-read-fields, .crm20-form { min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 10px; }
    .crm20-read-field { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--crm20-border-soft); }
	    .crm20-read-field span, .crm20-field > span { color: var(--crm20-muted); font-size: 12px; font-weight: 650; }
	    .crm20-read-field strong { min-width: 0; color: #1f2937; font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
	    .crm20-related-panel { display: grid; gap: 10px; padding-top: 2px; }
	    .crm20-related-heading { min-height: 24px; display: flex; align-items: center; justify-content: space-between; color: #1f2937; }
	    .crm20-related-heading strong { font-size: 13px; font-weight: 750; }
	    .crm20-related-section { display: grid; gap: 8px; }
	    .crm20-related-section [data-slot="separator"] { background: var(--crm20-border-soft); }
	    .crm20-related-section-header { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
	    .crm20-related-section-header > div { min-width: 0; display: grid; gap: 2px; }
	    .crm20-related-section-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; font-size: 12px; font-weight: 750; }
	    .crm20-related-section-header small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-soft); font-size: 11px; font-weight: 600; }
	    .crm20-related-list { display: grid; gap: 4px; }
	    .crm20-related-record[data-slot="button"] { width: 100%; height: auto; min-height: 44px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 8px; justify-content: stretch; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; color: #374151; }
	    .crm20-related-record[data-slot="button"]:hover { border-color: var(--crm20-border); background: var(--crm20-hover); }
	    .crm20-related-record > span:not(.crm20-record-mark) { min-width: 0; display: grid; gap: 2px; text-align: left; }
	    .crm20-related-record strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
	    .crm20-related-record small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-muted); font-size: 11px; font-weight: 600; }
	    .crm20-related-record .crm20-icon { color: var(--crm20-soft); }
	    .crm20-related-more { min-height: 24px; display: inline-flex; align-items: center; color: var(--crm20-muted); font-size: 12px; font-weight: 600; padding: 0 8px; }
	    .crm20-timeline-panel { min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 0; }
	    .crm20-timeline-item { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; padding: 8px 0; }
	    .crm20-timeline-item [data-slot="separator"] { grid-column: 1 / -1; margin-bottom: 8px; background: var(--crm20-border-soft); }
	    .crm20-timeline-dot { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #64748b; }
	    .crm20-timeline-note { background: #e8f7f4; color: #0f766e; }
	    .crm20-timeline-task { background: #dcf7ef; color: #0f9f6e; }
	    .crm20-timeline-activity { background: #eef2ff; color: #5b5fc7; }
	    .crm20-timeline-content { min-width: 0; display: grid; gap: 6px; }
	    .crm20-timeline-meta { min-width: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--crm20-soft); font-size: 11px; font-weight: 600; }
	    .crm20-timeline-record[data-slot="button"] { width: 100%; height: auto; min-height: 42px; justify-content: stretch; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 8px; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; color: #374151; }
	    .crm20-timeline-record[data-slot="button"]:hover { border-color: var(--crm20-border); background: var(--crm20-hover); }
	    .crm20-timeline-record span, .crm20-timeline-activity-body { min-width: 0; display: grid; gap: 2px; text-align: left; }
	    .crm20-timeline-record strong, .crm20-timeline-activity-body strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1f2937; font-size: 12px; font-weight: 720; }
	    .crm20-timeline-record small, .crm20-timeline-activity-body small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-muted); font-size: 11px; font-weight: 600; }
	    .crm20-timeline-record .crm20-icon { color: var(--crm20-soft); }
	    .crm20-timeline-empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--crm20-muted); padding: 20px; }
	    .crm20-timeline-empty strong { font-size: 13px; font-weight: 700; }
	    .crm20-field { display: grid; gap: 5px; }
	    .crm20-field em { margin-left: 6px; color: #dc2626; font-style: normal; font-weight: 600; }
	    .crm20-field small { margin-left: 8px; color: var(--crm20-soft); font-size: 11px; font-weight: 600; text-transform: uppercase; }
	    .crm20-field [data-slot="textarea"] { min-height: 88px; resize: vertical; }
	    .crm20-checkbox-field { justify-content: flex-start; }
	    .crm20-relation-picker { display: grid; gap: 6px; position: relative; }
	    .crm20-relation-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
	    .crm20-relation-trigger[data-slot="button"] { width: 100%; justify-content: flex-start; min-width: 0; }
	    .crm20-relation-title { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
	    .crm20-relation-command { border: 1px solid var(--crm20-border); border-radius: var(--radius, 6px); background: var(--popover, #fff); box-shadow: 0 14px 34px color-mix(in srgb, var(--crm20-text) 12%, transparent); overflow: hidden; }
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
  `
  document.head.appendChild(style)
}
