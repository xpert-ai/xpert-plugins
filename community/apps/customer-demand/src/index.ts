import 'reflect-metadata'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { NAMESPACE, FEATURE, PLUGIN_NAME, PROVIDER, MIDDLEWARE, TEMPLATE, VIEW } from './domain.js'
import { DemandEntity } from './entity.js'
import { DemandService } from './service.js'
import { JevEvaluator, EVALUATOR } from './jev.js'
import { DemandView } from './view.js'
import { DemandMiddleware } from './middleware.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([DemandEntity])], entities: [DemandEntity],
  providers: [DemandService, JevEvaluator, { provide: EVALUATOR, useExisting: JevEvaluator }, DemandView, DemandMiddleware],
  exports: [DemandService]
})
export class CustomerDemandPlugin {}

const plugin: XpertPlugin<Record<string, never>> = {
  meta: {
    name: PLUGIN_NAME, version: '0.1.0', level: 'system', artifactNamespace: NAMESPACE,
    displayName: '客户需求评估与跟进工作台', description: 'Jev 辅助判断需求类型、信息完整度与下一步，由销售确认并保存。',
    author: 'ShiXiangYu2', category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['business-app', 'workbench-view', 'assistant-tool'], capabilities: [FEATURE],
      runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [PROVIDER] },
      marketplace: { contents: [
        { type: 'view', name: VIEW, displayName: '客户需求工作台', description: '录入、评估与人工确认' },
        { type: 'tool', name: MIDDLEWARE, displayName: 'Jev 需求评估', description: '读取需求并调用 Jev' },
        { type: 'assistant-template', name: TEMPLATE, displayName: '客户需求助手', description: '绑定需求评估工具与工作台' }
      ] }
    } }
  },
  config: { schema: z.object({}).strict() },
  templates: [{ key: TEMPLATE, name: 'Customer Demand Assistant', title: '客户需求评估助手',
    description: '在工作台录入客户需求，使用 Jev 评估，人工确认跟进计划。', type: XpertTypeEnum.Agent,
    dslContent: readFileSync(new URL('./assistant.yaml', import.meta.url), 'utf8'),
    targetApps: ['xpert'], startPrompts: ['列出我保存的客户需求', '评估我指定的需求并提示待确认的信息'] }],
  register() { return { module: CustomerDemandPlugin, global: true } }
}
export default plugin
