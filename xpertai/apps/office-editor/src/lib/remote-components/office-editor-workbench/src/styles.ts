export function injectStyles() {
  if (document.getElementById('office-editor-workbench-styles')) return
  const style = document.createElement('style')
  style.id = 'office-editor-workbench-styles'
  style.textContent = `
    * { box-sizing: border-box; }
    html, body, #root { margin: 0; width: 100%; height: 100%; min-height: 0; overflow: hidden; color: var(--foreground); background: var(--background); font-family: var(--font-sans, Inter, system-ui, sans-serif); }
    button, input, textarea, select { font: inherit; }
    .oe-shell { width: 100%; height: 100%; min-height: 0; overflow: hidden; }
    .oe-main { width: 100%; height: 100%; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .oe-toolbar { position: relative; z-index: 1; min-height: 48px; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 12px; background: var(--card); border-bottom: 1px solid var(--border); overflow: hidden; }
    .oe-toolbar-title { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .oe-document-picker { width: fit-content; max-width: min(100%, 32rem); min-width: 0; flex-shrink: 1; }
    .oe-picker-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oe-actions { display: flex; align-items: center; gap: 6px; }
    .oe-secondary-actions { display: flex; align-items: center; gap: 2px; }
    .oe-action-divider[data-slot="separator"] { align-self: center; height: 20px; margin-inline: 2px; }
    .oe-header-card[data-slot="popover-content"] { width: min(360px, calc(100vw - 24px)); max-height: min(560px, var(--radix-popover-content-available-height)); overflow-y: auto; z-index: 200; }
    .oe-floating-menu { z-index: 400; }
    .oe-more-menu { min-width: 208px; }
    .oe-document-panel, .oe-inspector-content { display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; }
    .oe-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .oe-document-heading { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .oe-filter-trigger { width: 100%; }
    .oe-document-scroll { min-width: 0; }
    .oe-document-scroll [data-slot="scroll-area-viewport"] { max-height: min(280px, calc(var(--radix-popover-content-available-height) - 120px)); }
    .oe-document-options { display: grid; gap: 2px; list-style: none; padding: 0; margin: 0; }
    .oe-document-option { width: 100%; min-width: 0; display: flex; justify-content: space-between; text-align: left; }
    .oe-document-name { flex: 1 1 0; width: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oe-document-tooltip { z-index: 400; max-width: min(360px, calc(100vw - 32px)); overflow-wrap: anywhere; }
    .oe-list-empty { margin: 0; padding: 16px; text-align: center; color: var(--muted-foreground); }
    .oe-document-meta { margin: 0; color: var(--muted-foreground); overflow-wrap: anywhere; }
    .oe-textarea { min-height: 100px; resize: vertical; }
    .oe-section { display: grid; gap: 8px; }
    .oe-operation-list { display: grid; gap: 8px; max-height: 320px; overflow-y: auto; }
    .oe-operation { display: grid; gap: 4px; padding-block: 8px; border-bottom: 1px solid var(--border); }
    .oe-operation-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .oe-operation-detail { color: var(--muted-foreground); overflow-wrap: anywhere; }
    .oe-operation-data { margin: 0; max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
    .oe-editor-wrap { min-width: 0; min-height: 0; position: relative; isolation: isolate; z-index: 0; overflow: hidden; }
    .oe-univer { position: absolute; inset: 0; background: var(--card); }
    .oe-empty { min-height: 100%; display: grid; place-items: center; color: var(--muted-foreground); text-align: center; padding: 24px; }
    .oe-hidden { display: none; }
    @media (max-width: 640px) {
      .oe-toolbar { padding-inline: 8px; gap: 4px; }
      .oe-actions { gap: 2px; }
      .oe-action-divider[data-slot="separator"] { margin-inline: 0; }
      .oe-save-label { display: none; }
    }
    [data-slot="badge"][data-status="warning"] { border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border)); background: var(--status-warning-background); color: var(--status-warning); }
  `
  document.head.appendChild(style)
}
