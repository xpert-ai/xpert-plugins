export function injectStyles() {
  if (document.getElementById('weekly-radar-styles')) return
  const style = document.createElement('style')
  style.id = 'weekly-radar-styles'
  style.textContent = `
    :root {
      color-scheme: light;
      --radar-panel: #ffffff;
      --radar-bg: #f7f8fa;
      --radar-text: #1f2937;
      --radar-muted: #6b7280;
      --radar-soft: #9ca3af;
      --radar-border: #e5e7eb;
      --radar-primary: var(--primary, var(--xui-color-primary, #2563eb));
      --radar-high: #dc2626;
      --radar-medium: #d97706;
      --radar-low: #64748b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--radar-bg); color: var(--radar-text); }
    body, button, input, select, textarea { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .radar-shell { min-height: 640px; display: grid; grid-template-rows: auto 1fr; gap: 12px; padding: 16px; background: var(--radar-bg); }
    .radar-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .radar-title h1 { margin: 0; font-size: 18px; font-weight: 750; color: #111827; }
    .radar-title p { margin: 6px 0 0; font-size: 12px; color: var(--radar-muted); max-width: 640px; }
    .radar-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .radar-input, .radar-select { height: 32px; border: 1px solid var(--radar-border); border-radius: 6px; padding: 0 8px; font-size: 13px; color: var(--radar-text); background: #fff; }
    .radar-button { height: 32px; border: 1px solid var(--radar-border); background: #fff; border-radius: 6px; padding: 0 12px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
    .radar-button:hover { background: #f3f4f6; }
    .radar-button:disabled { opacity: 0.55; cursor: not-allowed; }
    .radar-button.is-primary { background: var(--radar-primary); border-color: var(--radar-primary); color: #fff; }
    .radar-notice { border: 1px solid #f2c94c; background: #fffbeb; color: #7a4d00; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
    .radar-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .radar-metric { background: var(--radar-panel); border: 1px solid var(--radar-border); border-radius: 8px; padding: 12px; }
    .radar-metric span { display: block; font-size: 12px; color: var(--radar-muted); }
    .radar-metric strong { display: block; margin-top: 4px; font-size: 22px; font-weight: 750; color: #111827; }
    .radar-metric.is-high strong { color: var(--radar-high); }
    .radar-columns { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    .radar-panel { background: var(--radar-panel); border: 1px solid var(--radar-border); border-radius: 8px; padding: 14px; min-width: 0; }
    .radar-panel h2 { margin: 0 0 10px; font-size: 14px; font-weight: 750; color: #111827; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .radar-panel h2 small { font-weight: 600; color: var(--radar-soft); font-size: 12px; }
    .radar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .radar-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--radar-soft); font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--radar-border); }
    .radar-table td { padding: 8px; border-bottom: 1px solid #f1f2f4; color: #374151; vertical-align: top; }
    .radar-table td strong { color: #111827; font-weight: 650; display: block; }
    .radar-table td small { color: var(--radar-soft); font-size: 11px; }
    .radar-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; }
    .radar-status span { width: 7px; height: 7px; border-radius: 50%; background: var(--dot, #9ca3af); }
    .radar-risk { border: 1px solid var(--radar-border); border-left: 3px solid var(--level, #9ca3af); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    .radar-risk header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .radar-risk header strong { font-size: 13px; color: #111827; }
    .radar-risk p { margin: 6px 0; font-size: 12px; color: #4b5563; line-height: 1.55; }
    .radar-risk dl { margin: 6px 0 0; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 4px 8px; font-size: 12px; }
    .radar-risk dt { color: var(--radar-soft); font-weight: 650; }
    .radar-risk dd { margin: 0; color: #4b5563; }
    .radar-empty { padding: 18px; border: 1px dashed var(--radar-border); border-radius: 6px; color: var(--radar-muted); font-size: 13px; text-align: center; }
    .radar-form { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; margin-bottom: 12px; }
    .radar-form input, .radar-form select { height: 32px; border: 1px solid var(--radar-border); border-radius: 6px; padding: 0 8px; font-size: 13px; }
    .radar-report { display: grid; gap: 10px; }
    .radar-report-block { border: 1px solid var(--radar-border); border-radius: 6px; padding: 10px; }
    .radar-report-block h3 { margin: 0 0 6px; font-size: 12px; color: var(--radar-muted); font-weight: 700; }
    .radar-report-block p { margin: 0; font-size: 13px; color: #374151; white-space: pre-wrap; line-height: 1.6; }
    .radar-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: 700; background: #f3f4f6; color: #4b5563; }
    .radar-badge.is-draft { background: #fff7ed; color: #b45309; }
    .radar-badge.is-confirmed { background: #ecfdf5; color: #047857; }
    .radar-loading { min-height: 320px; display: flex; align-items: center; justify-content: center; color: var(--radar-muted); }
    @media (max-width: 980px) {
      .radar-columns { grid-template-columns: minmax(0, 1fr); }
      .radar-form { grid-template-columns: minmax(0, 1fr); }
    }
  `
  document.head.appendChild(style)
}
