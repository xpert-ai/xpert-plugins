/**
 * PluginContext 注入 token
 *
 * 队列 enqueue 必须携带 scopeKey=插件安装作用域（pluginContext.scopeKey，F2 路由红线），
 * 而 PluginContext 只在 register(ctx) 处可得；对齐 img2threejs 的 tokens 形态（F3），
 * 由 index.ts 以 { provide: TOKEN, useValue: ctx } 注册进模块 providers。
 */
export const RESUME_SCREEN_PLUGIN_CONTEXT = 'RESUME_SCREEN_PLUGIN_CONTEXT'
