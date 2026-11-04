import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import type { XpertPlugin,XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { ShadowResearchPlugin } from './plugin.js'
import { PLUGIN_NAME,NAMESPACE,FEATURE,MIDDLEWARE,VIEW_PROVIDER,VIEW,TEMPLATE } from './constants.js'
const pkg=z.object({version:z.string(),xpert:z.object({plugin:z.object({level:z.literal('tenant'),artifactNamespace:z.literal(NAMESPACE)})})})
  .parse(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')))
const templates:XpertTemplateContribution[]=[{key:TEMPLATE,name:'Stock Research Lab',title:'选股研究助手',
  description:'对冻结行情和财务证据完成四阶段研究，由用户确认保存。',category:'Research',type:XpertTypeEnum.Agent,targetApps:['xpert'],
  targetAppMeta:{xpert:{types:['business-assistant'],capabilities:[FEATURE],requiredPlugins:[PLUGIN_NAME],defaultConfig:{viewProvider:VIEW_PROVIDER}}},
  dslContent:readFileSync(new URL('./assistant.yaml',import.meta.url),'utf8'),startPrompts:['打开选股研究实验台，创建任务并将任务引用到聊天开始研究。'],
  providerKey:`${NAMESPACE}.templates`,order:40,default:false}]
const plugin:XpertPlugin={meta:{name:PLUGIN_NAME,version:pkg.version,level:pkg.xpert.plugin.level,artifactNamespace:NAMESPACE,
  displayName:'选股研究实验台',description:'Evidence-bound stock research with durable tasks and human confirmation.',
  author:'Yu Kai',category:'middleware',targetApps:['xpert'],targetAppMeta:{xpert:{types:['business-app','assistant-template','workbench-view'],
    capabilities:[FEATURE],runtime:{middlewareProviders:[MIDDLEWARE],viewProviders:[VIEW_PROVIDER],templateProviders:[`${NAMESPACE}.templates`]},
    marketplace:{contents:[{type:'assistant-template',name:TEMPLATE,displayName:'选股研究助手'},{type:'view',name:VIEW,displayName:'选股研究实验台'}]}}}},
  config:{schema:z.object({}).strict()},templates,register(){return {module:ShadowResearchPlugin,global:true}}}
export default plugin
export {plugin}
