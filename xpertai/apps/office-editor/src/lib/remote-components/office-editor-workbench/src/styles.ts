export function injectStyles() {
  if (document.getElementById('office-editor-workbench-styles')) {
    return
  }
  const style = document.createElement('style')
  style.id = 'office-editor-workbench-styles'
  style.textContent = `
    :root {
      --oe-bg: var(--background, var(--xui-color-background, #f8fafc));
      --oe-panel: var(--card, var(--xui-color-card, #ffffff));
      --oe-panel-text: var(--card-foreground, var(--xui-color-card-foreground, #0f172a));
      --oe-text: var(--foreground, var(--xui-color-foreground, #0f172a));
      --oe-muted: var(--muted-foreground, var(--xui-color-muted-foreground, #64748b));
      --oe-muted-bg: var(--muted, var(--xui-color-muted, #f1f5f9));
      --oe-border: var(--border, var(--xui-color-border, #e2e8f0));
      --oe-primary: var(--primary, var(--xui-color-primary, #0f766e));
      --oe-primary-foreground: var(--primary-foreground, var(--xui-color-primary-foreground, #ffffff));
      --oe-accent: var(--accent, var(--xui-color-accent, #e0f2fe));
      --oe-accent-foreground: var(--accent-foreground, var(--xui-color-accent-foreground, #0f172a));
      --oe-danger: var(--destructive, var(--xui-color-destructive, #dc2626));
      --oe-radius: var(--radius, var(--xui-radius-md, 0.5rem));
      --oe-rail-width: var(--xpert-sidebar-rail-width, var(--xui-sidebar-rail-width, 3rem));
    }
    * { box-sizing: border-box; }
    html, body, #root { margin: 0; min-height: 100%; color: var(--oe-text); background: var(--oe-bg); font-family: var(--font-sans, var(--xui-font-sans, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)); }
    button, input, textarea, select { font: inherit; }
    .oe-shell { min-height: 640px; height: 100vh; display: grid; grid-template-columns: var(--oe-rail-width) minmax(0, 1fr) minmax(280px, 320px); background: var(--oe-bg); overflow: hidden; transition: grid-template-columns 160ms ease; }
    .oe-shell.is-sidebar-open { grid-template-columns: minmax(260px, 300px) minmax(0, 1fr) minmax(280px, 320px); }
    .oe-sidebar, .oe-inspector { min-width: 0; color: var(--oe-panel-text); background: var(--oe-panel); border-right: 1px solid var(--oe-border); display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .oe-inspector { border-right: 0; border-left: 1px solid var(--oe-border); grid-template-rows: auto minmax(0, 1fr); }
    .oe-sidebar { overflow: hidden; }
    .oe-header { min-height: 56px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--oe-border); }
    .oe-sidebar-header { justify-content: flex-start; }
    .is-sidebar-collapsed .oe-sidebar-header { justify-content: center; padding-inline: 6px; }
    .oe-sidebar-glyph { display: none; width: 16px; height: 16px; color: var(--oe-muted); }
    .is-sidebar-collapsed .oe-sidebar-glyph { display: block; position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); }
    .is-sidebar-collapsed .oe-sidebar { position: relative; }
    .is-sidebar-collapsed .oe-sidebar-body,
    .is-sidebar-collapsed .oe-sidebar .oe-title { display: none; }
    .oe-sidebar-body { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .oe-title { min-width: 0; flex: 1; }
    .oe-title strong { display: block; font-size: 14px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oe-title span { display: block; color: var(--oe-muted); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oe-filter { padding: 10px 12px; border-bottom: 1px solid var(--oe-border); display: grid; gap: 8px; }
    .oe-select-trigger { background: var(--oe-panel); }
    .oe-format-trigger { width: 92px; min-width: 92px; }
    .oe-textarea { min-height: 100px; resize: vertical; }
    .oe-list { min-height: 0; overflow: auto; padding: 8px; display: grid; align-content: start; gap: 6px; }
    .oe-doc-button { width: 100%; min-height: 58px; text-align: left; border: 1px solid transparent; border-radius: calc(var(--oe-radius) - 1px); background: transparent; color: var(--oe-text); padding: 8px; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease; }
    .oe-doc-button:hover { background: var(--oe-muted-bg); }
    .oe-doc-button.is-active { border-color: color-mix(in srgb, var(--oe-primary) 72%, var(--oe-border)); background: color-mix(in srgb, var(--oe-primary) 14%, var(--oe-panel)); }
    .oe-doc-button strong, .oe-doc-button span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oe-doc-button strong { font-size: 13px; line-height: 18px; }
    .oe-doc-button span { color: var(--oe-muted); font-size: 12px; line-height: 16px; }
    .oe-main { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .oe-toolbar { min-height: 56px; background: var(--oe-panel); border-bottom: 1px solid var(--oe-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; }
    .oe-toolbar-title { min-width: 0; }
    .oe-toolbar-title strong { display: block; font-size: 14px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oe-toolbar-title span { display: block; color: var(--oe-muted); font-size: 12px; line-height: 16px; }
    .oe-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .oe-wide-button { width: 100%; }
    .oe-icon-button { flex: 0 0 auto; color: var(--oe-muted); }
    .oe-icon-button:hover { color: var(--oe-text); }
    .oe-icon { width: 16px; height: 16px; flex: 0 0 auto; }
    .oe-status-badge { white-space: nowrap; }
    .oe-editor-wrap { min-width: 0; min-height: 0; padding: 0; position: relative; }
    .oe-univer { position: absolute; inset: 0; background: var(--oe-panel); }
    .oe-empty { min-height: 100%; display: grid; place-items: center; color: var(--oe-muted); text-align: center; padding: 24px; }
    .oe-panel-scroll { min-height: 0; overflow: auto; padding: 12px; display: grid; align-content: start; gap: 14px; }
    .oe-section { display: grid; gap: 8px; }
    .oe-section-title { color: var(--oe-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
    .oe-operation { border: 1px solid var(--oe-border); border-radius: calc(var(--oe-radius) - 1px); padding: 8px; display: grid; gap: 6px; background: var(--oe-panel); }
    .oe-operation strong { font-size: 13px; line-height: 18px; }
    .oe-operation-detail { color: var(--oe-muted); font-size: 12px; line-height: 17px; overflow-wrap: anywhere; }
    .oe-operation code { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--oe-muted); font-size: 11px; }
    .oe-operation-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .oe-hidden { display: none; }
    @media (max-width: 1120px) {
      .oe-shell { grid-template-columns: var(--oe-rail-width) minmax(0, 1fr); }
      .oe-shell.is-sidebar-open { grid-template-columns: minmax(240px, 280px) minmax(0, 1fr); }
      .oe-inspector { display: none; }
    }
    @media (max-width: 760px) {
      .oe-shell,
      .oe-shell.is-sidebar-open,
      .oe-shell.is-sidebar-collapsed { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
      .oe-sidebar { max-height: 230px; border-right: 0; border-bottom: 1px solid var(--oe-border); }
      .is-sidebar-collapsed .oe-sidebar { max-height: 56px; }
      .is-sidebar-collapsed .oe-sidebar-glyph { display: none; }
      .oe-main { min-height: 560px; }
      .oe-toolbar { align-items: flex-start; flex-direction: column; }
      .oe-actions { justify-content: flex-start; }
    }
    [data-slot="badge"][data-status="success"] { border-color: color-mix(in srgb, var(--status-success) 30%, var(--border)); background: var(--status-success-background); color: var(--status-success); }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
