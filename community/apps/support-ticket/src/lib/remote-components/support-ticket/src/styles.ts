const STYLES = `
:root {
  --st-bg: #f8fafc;
  --st-surface: #ffffff;
  --st-border: #e2e8f0;
  --st-text: #0f172a;
  --st-muted: #475569;
  --st-faint: #94a3b8;
  --st-primary: #2563eb;
  --st-primary-strong: #1d4ed8;
  --st-primary-soft: #eff6ff;
  --st-success: #16a34a;
  --st-success-soft: #ecfdf5;
  --st-warning: #d97706;
  --st-warning-soft: #fffbeb;
  --st-danger: #dc2626;
  --st-danger-soft: #fef2f2;
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
  background: var(--st-bg);
  color: var(--st-text);
  font-size: 14px;
  line-height: 1.5;
}
.st-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.st-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px 20px; background: #0f172a; color: #fff; flex-shrink: 0;
}
.st-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.st-brand-mark {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #38bdf8); font-weight: 600; flex-shrink: 0;
}
.st-brand-text { min-width: 0; }
.st-brand-title { font-size: 15px; font-weight: 600; }
.st-brand-sub { font-size: 12px; color: #94a3b8; }
.st-topbar-actions { display: flex; align-items: center; gap: 16px; }
.st-stats { display: flex; align-items: center; gap: 14px; }
.st-stat { display: flex; align-items: baseline; gap: 6px; font-size: 12px; color: #cbd5f5; }
.st-stat strong { font-size: 16px; color: #fff; font-weight: 600; }
.st-stat.is-warning strong { color: #fbbf24; }
.st-stat.is-danger strong { color: #fca5a5; }
.st-stat.is-success strong { color: #6ee7b7; }
.st-body { flex: 1; min-height: 0; display: flex; }
.st-sidebar {
  width: 320px; flex-shrink: 0; border-right: 1px solid var(--st-border); background: var(--st-surface);
  display: flex; flex-direction: column; min-height: 0;
}
.st-sidebar-head { padding: 12px 14px 8px; border-bottom: 1px solid var(--st-border); }
.st-tabs { display: flex; gap: 4px; padding: 8px 12px 0; flex-wrap: wrap; }
.st-tab {
  border: none; background: transparent; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  font-size: 13px; color: var(--st-muted); transition: background 0.15s ease, color 0.15s ease;
}
.st-tab:hover { background: #f1f5f9; color: var(--st-text); }
.st-tab.is-active { background: var(--st-primary-soft); color: var(--st-primary-strong); font-weight: 600; }
.st-tab span { margin-left: 4px; color: var(--st-faint); font-size: 12px; }
.st-search { margin: 10px 12px; display: flex; align-items: center; gap: 8px; }
.st-input, .st-textarea, .st-select {
  width: 100%; border: 1px solid var(--st-border); border-radius: 10px; background: #fff;
  padding: 8px 10px; font-size: 13px; color: var(--st-text); outline: none; font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.st-input:focus, .st-textarea:focus, .st-select:focus {
  border-color: var(--st-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.st-textarea { resize: vertical; min-height: 96px; line-height: 1.6; }
.st-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
.st-card {
  background: var(--st-surface); border: 1px solid var(--st-border); border-radius: 10px;
  padding: 10px 12px; margin-bottom: 8px; cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.st-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08); }
.st-card.is-selected { border-color: var(--st-primary); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12); }
.st-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.st-card-no { font-size: 12px; color: var(--st-faint); font-variant-numeric: tabular-nums; }
.st-card-customer { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.st-card-preview { font-size: 12px; color: var(--st-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-card-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: var(--st-faint); flex-wrap: wrap; }
.st-tag {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; border: 1px solid transparent; white-space: nowrap;
}
.st-tag-processing { background: var(--st-primary-soft); color: var(--st-primary-strong); border-color: #bfdbfe; }
.st-tag-pending_review { background: var(--st-warning-soft); color: var(--st-warning); border-color: #fde68a; }
.st-tag-confirmed { background: var(--st-success-soft); color: var(--st-success); border-color: #bbf7d0; }
.st-tag-failed { background: var(--st-danger-soft); color: var(--st-danger); border-color: #fecaca; }
.st-tag-neutral { background: #f1f5f9; color: var(--st-muted); border-color: var(--st-border); }
.st-main { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 16px 20px 28px; }
.st-panel { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.st-section {
  background: var(--st-surface); border: 1px solid var(--st-border); border-radius: 12px; padding: 16px;
  animation: st-fade-in 0.22s ease both;
}
.st-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.st-section-title { font-size: 14px; font-weight: 600; }
.st-section-hint { font-size: 12px; color: var(--st-faint); }
.st-field { margin-bottom: 12px; }
.st-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--st-muted); margin-bottom: 6px; }
.st-label b { color: var(--st-danger); font-weight: 600; }
.st-row { display: flex; gap: 12px; }
.st-row > * { flex: 1; }
.st-error { color: var(--st-danger); font-size: 12px; margin-top: 6px; }
.st-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.st-btn:hover:not(:disabled) { transform: translateY(-1px); }
.st-btn-primary { background: var(--st-primary); color: #fff; }
.st-btn-primary:hover:not(:disabled) { background: var(--st-primary-strong); box-shadow: 0 6px 14px rgba(37, 99, 235, 0.24); }
.st-btn-ghost { background: #fff; border-color: var(--st-border); color: var(--st-muted); }
.st-btn-ghost:hover:not(:disabled) { border-color: var(--st-primary); color: var(--st-primary); }
.st-btn-danger { background: var(--st-danger-soft); color: var(--st-danger); border-color: #fecaca; }
.st-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.st-btn-sm { padding: 5px 10px; font-size: 12px; }
.st-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-spacer { flex: 1; }
.st-alert { display: flex; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 13px; align-items: flex-start; }
.st-alert-error { background: var(--st-danger-soft); border: 1px solid #fecaca; color: #991b1b; }
.st-alert-warning { background: var(--st-warning-soft); border: 1px solid #fde68a; color: #92400e; }
.st-alert-success { background: var(--st-success-soft); border: 1px solid #bbf7d0; color: #14532d; }
.st-alert strong { display: block; margin-bottom: 2px; }
.st-result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.st-kv { background: #f8fafc; border: 1px solid var(--st-border); border-radius: 10px; padding: 10px 12px; }
.st-kv-label { font-size: 11px; color: var(--st-faint); margin-bottom: 4px; }
.st-kv-value { font-size: 13px; font-weight: 600; }
.st-quote { font-size: 13px; color: var(--st-muted); white-space: pre-wrap; }
.st-reply {
  background: #f8fafc; border: 1px solid var(--st-border); border-radius: 10px; padding: 12px;
  font-size: 13px; line-height: 1.7; white-space: pre-wrap;
}
.st-skeleton { border-radius: 8px; background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 37%, #eef2f7 63%); background-size: 400% 100%; animation: st-shimmer 1.3s ease infinite; }
.st-skeleton-line { height: 12px; margin-bottom: 10px; }
.st-empty { padding: 40px 16px; text-align: center; color: var(--st-faint); font-size: 13px; }
.st-empty strong { display: block; color: var(--st-muted); font-size: 14px; margin-bottom: 6px; }
.st-timeline { display: flex; flex-direction: column; gap: 8px; }
.st-timeline-item { display: flex; gap: 10px; font-size: 12px; color: var(--st-muted); }
.st-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--st-primary); margin-top: 6px; flex-shrink: 0; }
.st-toast {
  position: fixed; right: 20px; bottom: 20px; z-index: 40; display: flex; flex-direction: column; gap: 8px;
}
.st-toast-item {
  min-width: 220px; max-width: 360px; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: #0f172a; color: #fff; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
  animation: st-slide-in 0.24s ease both;
}
.st-toast-item.is-error { background: #b91c1c; }
.st-mono { font-variant-numeric: tabular-nums; }
@keyframes st-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
@keyframes st-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes st-slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@media (max-width: 1024px) {
  .st-body { flex-direction: column; }
  .st-sidebar { width: 100%; max-height: 42%; border-right: none; border-bottom: 1px solid var(--st-border); }
  .st-result-grid { grid-template-columns: minmax(0, 1fr); }
}
`

let injected = false

export function injectStyles() {
  if (injected || typeof document === 'undefined') {
    return
  }
  const style = document.createElement('style')
  style.setAttribute('data-support-ticket', 'workbench')
  style.textContent = STYLES
  document.head.appendChild(style)
  injected = true
}
