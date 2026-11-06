const STYLE_ID = 'listing-assistant-workbench-styles'

const CSS = `
.la-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--background, #ffffff);
  color: var(--foreground, #0f172a);
  font-size: 14px;
}
.la-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.la-title { font-size: 16px; font-weight: 600; margin: 0; }
.la-subtitle { margin: 4px 0 0; font-size: 12px; color: var(--muted-foreground, #64748b); }
.la-body { display: flex; flex: 1; min-height: 0; }
.la-sidebar {
  width: 300px;
  flex: 0 0 300px;
  border-right: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.la-sidebar-head { padding: 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--border, #e2e8f0); }
.la-sidebar-title { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--muted-foreground, #64748b); }
.la-task-list { overflow: auto; flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.la-task {
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 10px;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: inherit;
}
.la-task:hover { background: var(--accent, #f1f5f9); }
.la-task.la-task--active { border-color: var(--primary, #2563eb); background: var(--accent, #f1f5f9); }
.la-task-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.la-task-preview { font-size: 11px; color: var(--muted-foreground, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.la-task-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-foreground, #64748b); }
.la-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: auto; }
.la-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted-foreground, #64748b); padding: 48px 24px; text-align: center; }
.la-empty h3 { margin: 0; font-size: 15px; color: var(--foreground, #0f172a); }
.la-empty p { margin: 0; font-size: 13px; }
.la-notice { margin: 12px 16px 0; padding: 10px 12px; border-radius: 8px; font-size: 13px; border: 1px solid transparent; }
.la-notice--error { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.la-notice--info { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.la-detail { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.la-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-wrap: wrap; }
.la-detail-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.la-detail-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.la-detail-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.la-error { margin: 12px 16px 0; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 13px; }
.la-error strong { display: block; margin-bottom: 4px; }
.la-error p { margin: 0 0 4px; white-space: pre-wrap; }
.la-error span { color: #b91c1c; font-size: 12px; }
.la-split { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 0; flex: 1; min-height: 0; }
.la-pane { min-width: 0; display: flex; flex-direction: column; }
.la-pane--source { border-right: 1px solid var(--border, #e2e8f0); background: var(--muted, #f8fafc); }
.la-pane-head { padding: 12px 16px 0; font-size: 12px; font-weight: 600; color: var(--muted-foreground, #64748b); }
.la-source-text { margin: 8px 16px 16px; padding: 12px; border-radius: 8px; background: var(--background, #fff); border: 1px solid var(--border, #e2e8f0); white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.6; overflow: auto; flex: 1; min-height: 220px; }
.la-form { padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.la-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.la-field { display: flex; flex-direction: column; gap: 6px; }
.la-label { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; color: var(--foreground, #0f172a); }
.la-field--missing .la-label { color: #b45309; }
.la-field--uncertain .la-label { color: #1d4ed8; }
.la-field--missing .la-control { border-color: #f59e0b; box-shadow: 0 0 0 1px #fde68a; border-radius: 8px; }
.la-field--uncertain .la-control { border-color: #60a5fa; box-shadow: 0 0 0 1px #bfdbfe; border-radius: 8px; }
.la-flag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; border: 1px solid transparent; }
.la-flag--missing { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.la-flag--uncertain { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.la-flag--ai { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.la-flags-hint { font-size: 11px; color: var(--muted-foreground, #64748b); }
.la-attr-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; }
.la-inline-add { align-self: flex-start; }
.la-note { font-size: 11px; color: var(--muted-foreground, #64748b); }
.la-runs { margin-top: 4px; border-top: 1px dashed var(--border, #e2e8f0); padding-top: 10px; font-size: 11px; color: var(--muted-foreground, #64748b); display: flex; flex-direction: column; gap: 4px; }
.la-status--draft { color: #475569; background: #f1f5f9; border-color: #e2e8f0; }
.la-status--parsing { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.la-status--review { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.la-status--saved { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.la-status--failed { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
.la-dialog-body { display: flex; flex-direction: column; gap: 8px; }
.la-dialog-textarea { min-height: 220px; }
.la-evidence-hint { margin-left: 6px; font-weight: 400; color: var(--muted-foreground, #64748b); }
.la-evidence {
  background: #fef3c7;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
  transition: background 0.15s ease;
}
.la-evidence--active { background: #fbbf24; box-shadow: 0 0 0 2px #f59e0b; }
.la-evidence-note {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px dashed var(--border, #e2e8f0);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground, #64748b);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.la-evidence-note:hover { border-color: #f59e0b; background: #fffbeb; }
.la-evidence-note--active { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
.la-evidence-tag {
  flex: 0 0 auto;
  font-weight: 600;
  color: #b45309;
}
.la-evidence-quote {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.la-warning-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.la-warning-list li { display: flex; align-items: center; gap: 8px; }
.la-batch-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--border, #e2e8f0);
  overflow: hidden;
}
.la-batch-bar span { display: block; height: 100%; background: var(--primary, #2563eb); transition: width 0.2s ease; }
@media (max-width: 900px) {
  .la-split { grid-template-columns: 1fr; }
  .la-pane--source { border-right: 0; border-bottom: 1px solid var(--border, #e2e8f0); }
  .la-sidebar { width: 220px; flex-basis: 220px; }
}
`

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
}
