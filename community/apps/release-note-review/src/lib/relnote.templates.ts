import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { RELNOTE_FEATURE, RELNOTE_PLUGIN_NAME, RELNOTE_PROVIDER_KEY, RELNOTE_TEMPLATE_KEY, RELNOTE_TEMPLATE_PROVIDER_KEY, RELNOTE_VIEW_KEY } from './constants.js'
const here = dirname(fileURLToPath(import.meta.url))
function readDsl() { const candidates=[join(here,'..','relnote-assistant.yaml'),join(process.cwd(),'apps/release-note-review/src/relnote-assistant.yaml')]; const file=candidates.find(existsSync); if(!file) throw new Error('Relnote assistant template file not found.'); return readFileSync(file,'utf8') }
export const relnoteTemplates: XpertTemplateContribution[]=[{ key:RELNOTE_TEMPLATE_KEY,name:'OTA Release Note Review Assistant',title:'OTA 发布说明审核助手',description:'将 OTA 变更条目转为待人工确认的发布说明、风险清单和灰度建议。',category:'Engineering',type:XpertTypeEnum.Agent,targetApps:['data-xpert'],targetAppMeta:{'data-xpert':{types:['business-assistant'],capabilities:[RELNOTE_FEATURE,RELNOTE_VIEW_KEY],requiredPlugins:[RELNOTE_PLUGIN_NAME],defaultConfig:{assistantKind:'business-assistant',viewProvider:RELNOTE_PROVIDER_KEY}}},dslContent:readDsl(),order:30,default:false,startPrompts:['请列出当前 OTA 发布草稿。','请读取一个发布单并生成待人工确认的发布说明。'],releaseNotes:'创建 OTA 发布说明审核助手。',xpertName:'OTA 发布说明审核助手',providerKey:RELNOTE_TEMPLATE_PROVIDER_KEY} as XpertTemplateContribution]
