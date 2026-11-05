import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { ViewExtensionProvider,renderRemoteModuleIframeHtml } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { XpertExtensionViewManifest,XpertResolvedViewHostContext,XpertViewQuery,XpertViewDataResult,
  XpertViewActionRequest,XpertViewActionResult,XpertRemoteComponentViewSchema,XpertRemoteComponentEntry } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { ResearchService } from './research.service.js'
import { viewScope } from './scope.js'
import { VIEW,VIEW_PROVIDER,PLUGIN_NAME,FEATURE } from './constants.js'
import { createSchema,revisionSchema,ResearchError } from './domain/contracts.js'

@Injectable()
@ViewExtensionProvider(VIEW_PROVIDER)
export class ResearchViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service:ResearchService){}
  supports(c:XpertResolvedViewHostContext){return c.hostType==='agent'}
  getViewManifests(c:XpertResolvedViewHostContext,slot:string):XpertExtensionViewManifest[]{
    if(!this.supports(c)||!['agent.workbench.main','agent.workbench.fixed'].includes(slot))return []
    return [{key:VIEW,title:{en_US:'Research Lab',zh_Hans:'选股研究实验台'},hostType:'agent',slot,
      icon:{type:'font',value:'ri-funds-line'},order:40,refreshable:true,activation:{requiredFeatures:[FEATURE]},
      ...(slot==='agent.workbench.fixed'?{workbench:{fixed:true,menu:{enabled:true,label:{en_US:'Research Lab',zh_Hans:'选股研究'},order:40}}}:{}),
      source:{provider:VIEW_PROVIDER,plugin:PLUGIN_NAME},
      view:{type:'remote_component',runtime:'esm',protocolVersion:1,component:{isolation:'iframe',entry:'shadow-research'},dataSource:{mode:'platform'}},
      dataSource:{mode:'platform',querySchema:{supportsParameters:true},cache:{enabled:false}},
      actions:[['create','Create task','创建任务'],['confirm','Confirm result','确认结果'],['retry','Retry','重试'],['recover','Recover','恢复中断']].map(([key,en,zh])=>({key,label:{en_US:en,zh_Hans:zh},actionType:'invoke' as const,placement:'toolbar' as const})),
      clientCommands:[{key:'assistant.composer.append_references',label:{en_US:'Research in chat',zh_Hans:'引用到聊天研究'}}]}]
  }
  private scope(c:XpertResolvedViewHostContext,key:string){if(key!==VIEW)throw new ResearchError('not_found');return viewScope(c)}
  async getViewData(c:XpertResolvedViewHostContext,key:string,q:XpertViewQuery):Promise<XpertViewDataResult>{
    const scope=this.scope(c,key)
    const id=q.parameters?.taskId
    if(typeof id==='string')return {item:await this.service.get(scope,z.string().uuid().parse(id))}
    const page=Number(q.parameters?.page??q.page??1)
    return {item:await this.service.list(scope,page)}
  }
  async executeViewAction(c:XpertResolvedViewHostContext,key:string,action:string,r:XpertViewActionRequest):Promise<XpertViewActionResult>{
    const scope=this.scope(c,key)
    try{
      if(action==='create')return {success:true,data:await this.service.create(scope,createSchema.parse(r.input))}
      const v=revisionSchema.parse(r.input)
      switch(action){
        case 'confirm':return {success:true,data:await this.service.confirm(scope,v.taskId,v.expectedRevision)}
        case 'retry':return {success:true,data:await this.service.retry(scope,v.taskId,v.expectedRevision)}
        case 'recover':return {success:true,data:await this.service.fail(scope,v.taskId,'lease_expired',v.expectedRevision)}
        default:throw new ResearchError('unknown_action')
      }
    }catch(error){
      if(error instanceof ResearchError)return {success:false,data:{code:error.code}}
      if(error instanceof z.ZodError)return {success:false,data:{code:'invalid_input',issues:error.issues.map(i=>({path:i.path.join('.'),message:i.message})).slice(0,8)}}
      throw error
    }
  }
  async getRemoteComponentEntry(c:XpertResolvedViewHostContext,key:string,component:XpertRemoteComponentViewSchema['component']):Promise<XpertRemoteComponentEntry>{
    this.scope(c,key)
    if(component.entry!=='shadow-research'||component.isolation!=='iframe')throw new ResearchError('not_found')
    const [appScript,appCss]=await Promise.all([readFile(new URL('./remote/app.js',import.meta.url),'utf8'),readFile(new URL('./remote/app.css',import.meta.url),'utf8')])
    return {html:renderRemoteModuleIframeHtml({title:'Research Lab',appScript,appCss,lang:c.locale??'en'}),contentType:'text/html; charset=utf-8'}
  }
}
