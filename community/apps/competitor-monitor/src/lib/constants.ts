// 稳定标识：插件、数据库命名空间、视图和工具名称必须与模板及宿主注册一致。
export const PLUGIN_NAME='@community/apps-competitor-monitor'
// 独立声明供提交钩子静态解析；保留既有命名空间和数据库表名。
export const ARTIFACT_NAMESPACE='competitor_monitor'
export const NAMESPACE=ARTIFACT_NAMESPACE
export const FEATURE='competitor-monitor'
export const MIDDLEWARE='CompetitorMonitorMiddleware',PROVIDER='competitor-monitor.views',VIEW='competitor-monitor.workbench',REMOTE_ENTRY='competitor-monitor.remote'
export const TOOL_NAMES=['monitor_finish_analysis','monitor_get_round_changes','monitor_record_change','monitor_create_advice','monitor_report_analysis_issue']
