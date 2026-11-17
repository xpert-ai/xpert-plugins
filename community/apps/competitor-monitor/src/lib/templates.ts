// 模板贡献：加载随插件打包的 YAML，提供助手创建入口、能力依赖和示例提问。
import {readFileSync} from 'node:fs'
import {XpertTypeEnum} from '@xpert-ai/contracts'
import type {XpertTemplateContribution} from '@xpert-ai/plugin-sdk'
import {FEATURE,PLUGIN_NAME,PROVIDER} from './constants.js'
export const TEMPLATE_KEY='competitor-monitor-assistant'
export const templates:XpertTemplateContribution[]=[{key:TEMPLATE_KEY,name:'Competitor Monitor Assistant',title:'竞品分析助手',description:'基于确定性差异生成带证据、可审核的运营建议。',category:'Commerce',type:XpertTypeEnum.Agent,targetApps:['xpert'],targetAppMeta:{xpert:{types:['business-assistant'],capabilities:[FEATURE],requiredPlugins:[PLUGIN_NAME],defaultConfig:{viewProvider:PROVIDER}}},dslContent:readFileSync(new URL('../competitor-monitor-assistant.yaml',import.meta.url),'utf8'),startPrompts:['分析最近一轮竞品变化并给出运营建议','对比商品 6543210 最近两次的价格变化'],releaseNotes:'0.1.0：完整采集、差异、AI 建议和人工审核闭环。',providerKey:'competitor-monitor.templates',order:30,default:false}]
