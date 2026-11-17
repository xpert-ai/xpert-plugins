// 插件入口：声明平台能力、配置约束和模板，并交由宿主创建服务模块。
import 'reflect-metadata'
import { z } from 'zod/v3'
import manifest from '../package.json' with { type: 'json' }
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { CompetitorMonitorPlugin } from './lib/plugin.js'
import { FEATURE, MIDDLEWARE, PROVIDER } from './lib/constants.js'
import { templates } from './lib/templates.js'
const schema=z.object({}).strict()
const plugin:XpertPlugin<z.infer<typeof schema>>={meta:{name:manifest.name,version:manifest.version,level:manifest.xpert.plugin.level as 'tenant',artifactNamespace:manifest.xpert.plugin.artifactNamespace,displayName:'旺旺竞品监控',description:'竞品变化分析与人工审核闭环',author:'Jared',category:'middleware',targetApps:['xpert'],targetAppMeta:{xpert:{types:['business-app','assistant-template','workbench-view'],capabilities:[FEATURE],runtime:{middlewareProviders:[MIDDLEWARE],viewProviders:[PROVIDER],templateProviders:['competitor-monitor.templates']}}}},config:{schema},templates,register(){return{module:CompetitorMonitorPlugin,global:true}}}
export default plugin
export {plugin}
