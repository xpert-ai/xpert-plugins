export function injectStyles() {
  const style = document.createElement('style')
  style.textContent = `
.wxp-app { box-sizing: border-box; display: grid; gap: 12px; min-width: 0; padding: 16px; color: var(--xui-color-foreground); }
.wxp-sticky-head { position: sticky; top: 0; z-index: 20; display: grid; gap: 8px; min-width: 0; background: var(--xui-color-background); padding-bottom: 4px; }
.wxp-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 420px); gap: 12px; align-items: center; }
.wxp-title { display: grid; gap: 3px; }
.wxp-title strong { font-size: 16px; }
.wxp-title span { color: var(--xui-color-muted-foreground); font-size: 12px; }
.wxp-actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.wxp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
.wxp-stat { display: grid; gap: 4px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 88%, var(--xui-color-muted) 12%); padding: 10px; }
.wxp-stat span, .wxp-stat small, .wxp-kv span { color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-stat strong { font-size: 18px; }
.wxp-tunnel-client-stat { align-content: start; }
.wxp-tunnel-lamps { display: grid; gap: 6px; min-width: 0; }
.wxp-tunnel-lamp-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 7px; align-items: center; min-width: 0; }
.wxp-tunnel-lamp-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.wxp-tunnel-lamp { display: block; width: 9px; height: 9px; border-radius: 999px; background: var(--xui-color-muted-foreground); box-shadow: 0 0 0 3px color-mix(in srgb, var(--xui-color-muted-foreground) 14%, transparent); }
.wxp-tunnel-lamp.connected { background: #16a34a; box-shadow: 0 0 0 3px color-mix(in srgb, #16a34a 18%, transparent); }
.wxp-tunnel-lamp.error { background: var(--xui-color-destructive, #ef4444); box-shadow: 0 0 0 3px color-mix(in srgb, var(--xui-color-destructive, #ef4444) 18%, transparent); }
.wxp-dashboard { display: grid; gap: 12px; min-width: 0; }
.wxp-dashboard-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.wxp-metric { display: grid; gap: 4px; min-width: 0; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 10px; }
.wxp-metric span, .wxp-metric small, .wxp-panel-title span, .wxp-rank-row small, .wxp-activity-row small { color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-metric strong { overflow-wrap: anywhere; font-size: 18px; }
.wxp-metric-danger strong { color: var(--xui-color-destructive, var(--mat-sys-error)); }
.wxp-dashboard-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.wxp-analytics-panel { display: grid; gap: 10px; min-width: 0; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 12px; }
.wxp-analytics-panel-wide { grid-column: 1 / -1; }
.wxp-panel-title { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; min-width: 0; }
.wxp-panel-title strong { font-size: 13px; }
.wxp-echarts-trend { width: 100%; height: 240px; min-width: 0; }
.wxp-calendar-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.wxp-calendar-controls { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; align-items: center; }
.wxp-calendar-filter { display: flex; gap: 6px; align-items: center; color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-calendar-filter [data-slot="select-trigger"] { width: 180px; min-height: 30px; font-size: 12px; }
.wxp-segmented { display: inline-flex; overflow: hidden; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-muted); }
.wxp-segmented [data-slot="button"] { border: 0; border-radius: 0; box-shadow: none; font-size: 12px; font-weight: 700; }
.wxp-calendar { display: grid; justify-items: center; gap: 10px; min-width: 0; overflow-x: auto; padding-bottom: 2px; }
.wxp-calendar-grid, .wxp-calendar-week-grid, .wxp-calendar-months { justify-self: center; }
.wxp-calendar-grid, .wxp-calendar-week-grid { display: grid; grid-template-rows: repeat(7, 12px); grid-auto-flow: column; grid-auto-columns: 12px; gap: 4px; min-width: max-content; }
.wxp-calendar-cell, .wxp-calendar-week-cell { display: block; width: 12px; height: 12px; border-radius: 3px; background: color-mix(in srgb, var(--xui-color-muted) 76%, var(--xui-color-card) 24%); }
.wxp-calendar-cell { width: 12px; height: 12px; }
.wxp-calendar-cell.level-1 { background: color-mix(in srgb, var(--xui-color-primary) 22%, var(--xui-color-card) 78%); }
.wxp-calendar-cell.level-2 { background: color-mix(in srgb, var(--xui-color-primary) 40%, var(--xui-color-card) 60%); }
.wxp-calendar-cell.level-3 { background: color-mix(in srgb, var(--xui-color-primary) 62%, var(--xui-color-card) 38%); }
.wxp-calendar-cell.level-4, .wxp-calendar-week-cell.active { background: var(--xui-color-primary); }
.wxp-calendar-months { display: grid; gap: 4px; min-width: max-content; color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-calendar-months span { overflow: hidden; text-overflow: clip; white-space: nowrap; }
.wxp-breakdown-list, .wxp-rank-list, .wxp-activity-list { display: grid; gap: 8px; min-width: 0; }
.wxp-breakdown-row { display: grid; gap: 5px; min-width: 0; }
.wxp-breakdown-row > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.wxp-breakdown-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--xui-color-muted-foreground); font-size: 12px; }
.wxp-breakdown-row strong { font-size: 12px; }
.wxp-breakdown-track { height: 7px; overflow: hidden; border-radius: 999px; background: var(--xui-color-muted); }
.wxp-breakdown-track div { height: 100%; border-radius: inherit; background: var(--xui-color-primary); }
.wxp-rank-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; }
.wxp-rank-row > strong { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--xui-color-muted); color: var(--xui-color-muted-foreground); font-size: 12px; }
.wxp-rank-row div { display: grid; gap: 2px; min-width: 0; }
.wxp-rank-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.wxp-rank-row b { font-size: 13px; }
.wxp-activity-row { display: grid; gap: 5px; min-width: 0; border-bottom: 1px solid var(--xui-color-border); padding-bottom: 8px; }
.wxp-activity-row:last-child { border-bottom: 0; padding-bottom: 0; }
.wxp-activity-row > div { display: flex; flex-wrap: wrap; gap: 5px; }
.wxp-activity-row strong { overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; }
.wxp-tabs { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--xui-color-border); }
.wxp-tabs [data-slot="button"] { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--xui-color-muted-foreground); padding: 9px 10px; font-weight: 700; box-shadow: none; }
.wxp-tabs [data-slot="button"].active { border-bottom-color: var(--xui-color-primary); color: var(--xui-color-primary); }
.wxp-panel { display: grid; gap: 12px; min-width: 0; }
.wxp-panel h3 { margin: 0; font-size: 14px; }
.wxp-table-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; min-width: 0; }
.wxp-table-toolbar strong { font-size: 13px; }
.wxp-table-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; align-items: center; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 10px; }
.wxp-table-filters [data-slot="input"], .wxp-table-filters [data-slot="select-trigger"] { width: 100%; min-width: 0; }
.wxp-filter-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.wxp-pagination { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; color: var(--xui-color-muted-foreground); font-size: 12px; }
.wxp-pagination label { display: flex; gap: 6px; align-items: center; }
.wxp-pagination [data-slot="select-trigger"] { width: 86px; min-height: 30px; font-size: 12px; }
.wxp-pagination strong { color: var(--xui-color-foreground); font-size: 12px; }
.wxp-table-loading { position: sticky; left: 0; display: inline-block; margin: 0 0 8px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); color: var(--xui-color-muted-foreground); padding: 6px 8px; font-size: 12px; }
.wxp-callback { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 12px; }
.wxp-callback strong { display: block; margin-bottom: 4px; font-size: 12px; }
.wxp-integration-list { display: grid; gap: 10px; min-width: 0; }
.wxp-integration-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; border-top: 1px solid var(--xui-color-border); padding-top: 8px; }
.wxp-integration-row span { display: block; font-size: 12px; font-weight: 700; margin-bottom: 3px; }
code { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; white-space: nowrap; font-size: 11px; }
details summary { cursor: pointer; color: var(--xui-color-foreground); }
pre { max-width: 520px; max-height: 180px; overflow: auto; margin: 8px 0 0; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-muted); padding: 8px; white-space: pre-wrap; }
.wxp-message-cell { display: grid; gap: 6px; min-width: 320px; max-width: 560px; }
.wxp-message-cell-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
.wxp-message-cell-head small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-message-cell strong { color: var(--xui-color-foreground); font-size: 12px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
.wxp-message-cell details { min-width: 0; }
.wxp-message-cell details summary { color: var(--xui-color-primary); font-size: 12px; font-weight: 600; }
.wxp-message-cell pre { max-width: min(720px, 72vw); max-height: 260px; font-size: 11px; line-height: 1.5; }
.wxp-message-cell-error { border-left: 3px solid var(--xui-color-destructive, var(--mat-sys-error)); padding-left: 8px; }
.wxp-config { display: grid; gap: 12px; align-items: start; }
.wxp-config-main { display: grid; grid-template-columns: minmax(260px, 0.9fr) minmax(420px, 1.15fr) minmax(320px, 0.95fr); gap: 12px; align-items: start; min-width: 0; }
.wxp-kv { display: grid; gap: 3px; border-bottom: 1px solid var(--xui-color-border); padding: 7px 0; }
.wxp-kv strong { overflow-wrap: anywhere; font-size: 12px; }
.wxp-tunnel-panel pre { max-width: 100%; }
.wxp-tunnel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 12px; }
.wxp-manual-send-panel [data-slot="button"] { width: 100%; }
.wxp-tunnel-status-cell, .wxp-trigger-route-cell { display: grid; gap: 4px; min-width: 120px; }
.wxp-tunnel-status-cell small, .wxp-trigger-route-cell small { color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-sender-cell { display: grid; gap: 3px; min-width: 160px; }
.wxp-sender-cell strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.wxp-sender-cell small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--xui-color-muted-foreground); font-size: 11px; }
.wxp-login-dialog { width: min(520px, calc(100vw - 24px)); max-width: 520px; }
.wxp-login-body { display: grid; gap: 12px; min-width: 0; }
.wxp-field { display: grid; gap: 6px; min-width: 0; font-size: 12px; font-weight: 700; }
.wxp-field span { color: var(--xui-color-muted-foreground); }
.wxp-login-qr, .wxp-login-avatar, .wxp-login-result { display: grid; justify-items: center; gap: 8px; min-width: 0; }
.wxp-login-qr img { width: 220px; max-width: 100%; aspect-ratio: 1; border: 1px solid var(--xui-color-border); border-radius: 8px; background: #fff; object-fit: contain; padding: 8px; }
.wxp-login-avatar img { width: 86px; height: 86px; border-radius: 8px; object-fit: cover; }
.wxp-login-avatar strong, .wxp-login-result strong { overflow-wrap: anywhere; font-size: 13px; }
.wxp-login-result.success strong { color: var(--xui-color-primary); }
.wxp-login-result.warning strong { color: var(--xui-color-destructive, var(--mat-sys-error)); }
.wxp-login-countdown { position: relative; height: 24px; overflow: hidden; border-radius: 8px; background: var(--xui-color-muted); }
.wxp-login-countdown div { height: 100%; background: color-mix(in srgb, var(--xui-color-primary) 42%, transparent); transition: width 160ms ease; }
.wxp-login-countdown span { position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.wxp-login-message { border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); color: var(--xui-color-muted-foreground); padding: 8px; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.wxp-slide-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
	.wxp-table-wrap { width: 100%; max-width: 100%; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); }
	.wxp-data-table { min-width: 980px; }
	.wxp-messages-table-wrap, .wxp-logs-table-wrap { overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
	.wxp-messages-table, .wxp-logs-table { width: max-content; }
	.wxp-messages-table { min-width: 1540px; }
	.wxp-logs-table { min-width: 1180px; }
	.wxp-messages-table [data-slot="table-head"],
	.wxp-messages-table [data-slot="table-cell"],
	.wxp-logs-table [data-slot="table-head"],
	.wxp-logs-table [data-slot="table-cell"] { white-space: nowrap; }
	.wxp-messages-table code,
	.wxp-messages-table .xui-muted,
	.wxp-messages-table [data-slot="badge"],
	.wxp-logs-table code,
	.wxp-logs-table .xui-muted,
	.wxp-logs-table [data-slot="badge"] { white-space: nowrap; }
	.wxp-message-log-content { display: block; min-width: 420px; max-width: 560px; white-space: nowrap; }
	.wxp-message-log-content summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.wxp-message-log-content pre { max-width: min(880px, 74vw); white-space: pre-wrap; }
		@media (max-width: 1180px) {
	  .wxp-config-main { grid-template-columns: 1fr; }
	}
		@media (max-width: 760px) {
	  .wxp-app { padding: 12px; }
	  .wxp-head, .wxp-stats, .wxp-dashboard-grid, .wxp-dashboard-layout, .wxp-calendar-head, .wxp-callback, .wxp-config-main, .wxp-integration-row, .wxp-slide-fields { grid-template-columns: 1fr; }
  .wxp-analytics-panel-wide { grid-column: auto; }
  .wxp-actions, .wxp-calendar-controls, .wxp-filter-actions, .wxp-pagination { justify-content: flex-start; }
}`
  document.head.appendChild(style)
}
