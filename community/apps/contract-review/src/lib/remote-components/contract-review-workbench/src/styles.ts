export function injectStyles() {
  if (document.getElementById('contract-review-workbench-styles')) return
  const style = document.createElement('style')
  style.id = 'contract-review-workbench-styles'
  style.textContent = `
    :root {
      color-scheme: light;
      --crx-panel: #ffffff;
      --crx-sidebar: #f6f7f9;
      --crx-text: #1f2937;
      --crx-muted: #6b7280;
      --crx-border: #e5e7eb;
      --crx-hover: #f3f4f6;
      --crx-primary: #1d4ed8;
      --crx-high: #dc2626;
      --crx-medium: #d97706;
      --crx-low: #059669;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--crx-panel); color: var(--crx-text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      font-size: 13px; }
    .crx-shell { display: flex; min-height: 640px; background: var(--crx-panel); }
    .crx-sidebar { width: 268px; flex: 0 0 268px; border-right: 1px solid var(--crx-border); background: var(--crx-sidebar);
      display: flex; flex-direction: column; }
    .crx-sidebar-head { padding: 12px; border-bottom: 1px solid var(--crx-border); }
    .crx-sidebar-title { font-weight: 600; font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .crx-list { flex: 1; overflow-y: auto; padding: 6px; }
    .crx-item { padding: 9px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; border: 1px solid transparent; }
    .crx-item:hover { background: var(--crx-hover); }
    .crx-item-active { background: #fff; border-color: var(--crx-primary); }
    .crx-item-title { font-weight: 500; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crx-item-meta { font-size: 11px; color: var(--crx-muted); display: flex; gap: 6px; align-items: center; }
    .crx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .crx-main-head { padding: 14px 18px; border-bottom: 1px solid var(--crx-border); }
    .crx-main-title { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
    .crx-main-sub { font-size: 12px; color: var(--crx-muted); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .crx-body { flex: 1; overflow-y: auto; padding: 16px 18px; }
    .crx-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .crx-btn { border: 1px solid var(--crx-border); background: #fff; color: var(--crx-text); border-radius: 6px;
      padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .crx-btn:hover:not(:disabled) { background: var(--crx-hover); }
    .crx-btn:disabled { opacity: .5; cursor: not-allowed; }
    .crx-btn-primary { background: var(--crx-primary); border-color: var(--crx-primary); color: #fff; }
    .crx-btn-primary:hover:not(:disabled) { background: #1a43b8; }
    .crx-btn-sm { padding: 3px 9px; font-size: 11px; }
    .crx-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; line-height: 17px; }
    .crx-badge-high { background: #fee2e2; color: var(--crx-high); }
    .crx-badge-medium { background: #fef3c7; color: var(--crx-medium); }
    .crx-badge-low { background: #d1fae5; color: var(--crx-low); }
    .crx-badge-neutral { background: #e5e7eb; color: #4b5563; }
    .crx-badge-info { background: #dbeafe; color: var(--crx-primary); }
    .crx-badge-ok { background: #d1fae5; color: var(--crx-low); }
    .crx-clause { border: 1px solid var(--crx-border); border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
    .crx-clause-head { display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 9px 12px; background: #fafbfc; border-bottom: 1px solid var(--crx-border); }
    .crx-clause-name { font-weight: 600; }
    .crx-clause-body { padding: 12px; }
    .crx-section-label { font-size: 11px; color: var(--crx-muted); margin-bottom: 4px; letter-spacing: .3px; }
    .crx-quote { border-left: 3px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; border-radius: 0 6px 6px 0;
      white-space: pre-wrap; line-height: 1.6; margin-bottom: 12px; }
    .crx-ai { background: #eff6ff; border-radius: 6px; padding: 9px 11px; margin-bottom: 12px; line-height: 1.6; }
    .crx-ai-reason { color: var(--crx-muted); margin-top: 5px; }
    .crx-human { border-top: 1px dashed var(--crx-border); padding-top: 11px; }
    .crx-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
    .crx-input, .crx-textarea { width: 100%; border: 1px solid var(--crx-border); border-radius: 6px; padding: 6px 9px;
      font-family: inherit; font-size: 12px; color: var(--crx-text); background: #fff; }
    .crx-textarea { resize: vertical; min-height: 54px; line-height: 1.6; }
    .crx-field { margin-bottom: 10px; }
    .crx-empty { padding: 48px 20px; text-align: center; color: var(--crx-muted); }
    .crx-banner { border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; line-height: 1.6; }
    .crx-banner-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .crx-banner-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .crx-footer { border-top: 1px solid var(--crx-border); padding: 11px 18px; display: flex; justify-content: space-between;
      align-items: center; gap: 12px; background: #fafbfc; flex-wrap: wrap; }
    .crx-progress { font-size: 12px; color: var(--crx-muted); }
    .crx-progress b { color: var(--crx-text); }
    .crx-modal-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: center;
      justify-content: center; padding: 24px; z-index: 50; }
    .crx-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 620px; max-height: 86vh; overflow-y: auto; padding: 18px; }
    .crx-modal h3 { margin: 0 0 14px; font-size: 15px; }
    .crx-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    .crx-spin { display: inline-block; width: 11px; height: 11px; border: 2px solid #c7d2fe; border-top-color: var(--crx-primary);
      border-radius: 50%; animation: crx-spin .8s linear infinite; vertical-align: -1px; margin-right: 5px; }
    @keyframes crx-spin { to { transform: rotate(360deg); } }
    .crx-decision-active { border-color: var(--crx-primary); background: #eff6ff; color: var(--crx-primary); font-weight: 600; }
  `
  document.head.appendChild(style)
}
