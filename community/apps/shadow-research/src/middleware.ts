import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { ResearchService } from './research.service.js'
import { agentScope } from './scope.js'
import { FEATURE,MIDDLEWARE } from './constants.js'
import { taskIdSchema,searchSchema,evidenceSchema,reviewSchema,failSchema,ResearchError } from './domain/contracts.js'
import {debugEvent} from './debug.js'

export const TOOL_NAMES=['shadow_get_task','shadow_begin','shadow_search_market','shadow_get_financials','shadow_submit_review','shadow_report_failure'] as const
@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE)
export class ShadowResearchMiddleware implements IAgentMiddlewareStrategy<Record<string,never>> {
  readonly meta: TAgentMiddlewareMeta={name:MIDDLEWARE,label:{en_US:'Stock research',zh_Hans:'选股研究'},
    description:{en_US:'Evidence-bound research tools; confirmation remains with the user.',zh_Hans:'基于冻结证据研究，确认权限保留给用户。'},
    icon:{type:'font',value:'ri-funds-line'},features:[FEATURE],configSchema:{type:'object',properties:{},additionalProperties:false}}
  constructor(private readonly service: ResearchService) {}
  getToolNames(){return [...TOOL_NAMES]}
  createMiddleware(_options:Record<string,never>,context:IAgentMiddlewareContext):AgentMiddleware {
    const scope=agentScope(context)
    const safe=async (fn:()=>Promise<object>)=>{
      const started=Date.now()
      try{const result=await fn();debugEvent('tool_completed',{success:true,durationMs:Date.now()-started});return JSON.stringify({success:true,...result})}
      catch(error){
        debugEvent('tool_failed',{success:false,durationMs:Date.now()-started})
        if(error instanceof ResearchError)return JSON.stringify({success:false,code:error.code,recovery:'Read the current task state and correct the operation; never invent evidence or claim success.'})
        if(error instanceof z.ZodError)return JSON.stringify({success:false,code:'invalid_input'})
        throw error
      }
    }
    return {name:MIDDLEWARE,tools:[
      tool(v=>safe(()=>this.service.agentSummary(scope,v.taskId)),{name:'shadow_get_task',description:'Read a saved task summary and prior reviews. taskId comes from the Workbench reference. Read before working or resuming.',schema:taskIdSchema,verboseParsingErrors:true}),
      tool(v=>safe(()=>this.service.begin(scope,v.taskId)),{name:'shadow_begin',description:'Start a draft research task with a five-minute lease. Do not restart running or completed tasks. The user creates tasks and retries failures in the Workbench.',schema:taskIdSchema,verboseParsingErrors:true}),
      tool(v=>safe(()=>this.service.search(scope,v)),{name:'shadow_search_market',description:'Inspect a page of frozen public market data and register its evidence IDs. Positive PE only when sorting PE. Search amount descending, change descending, turnover descending and positive PE ascending before narrowing candidates. Never claim whole-market coverage.',schema:searchSchema,verboseParsingErrors:true}),
      tool(v=>safe(()=>this.service.evidence(scope,v)),{name:'shadow_get_financials',description:'Read financial evidence for a previously inspected stock. Missing means unknown, not poor performance. No external network request; evidence comes from the frozen task snapshot.',schema:evidenceSchema,verboseParsingErrors:true}),
      tool(v=>safe(()=>this.service.submit(scope,v)),{name:'shadow_submit_review',description:'Persist the next review: fundamental, technical, risk, decision in order. Supply judgments and exact evidence IDs already returned by tools. selectedCode must be null before decision. Vetoes allowed only in risk review. Final choice needs both market and financial evidence and must not be vetoed. Null final choice is valid abstention. User confirmation is a separate human-only action.',schema:reviewSchema,verboseParsingErrors:true}),
      tool(v=>safe(()=>this.service.fail(scope,v.taskId,v.reason)),{name:'shadow_report_failure',description:'Mark a running task failed when model/tool processing cannot finish. No fake selection or rules fallback. The Workbench lets the user retry the same frozen input.',schema:failSchema,verboseParsingErrors:true})
    ]}
  }
}
