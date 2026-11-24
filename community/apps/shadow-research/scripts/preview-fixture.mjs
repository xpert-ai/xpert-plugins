import 'reflect-metadata'
import {DataSource} from 'typeorm'
import {mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ResearchTaskEntity} from '../dist/task.entity.js'
import {PersistentTaskStore} from '../dist/task.store.js'
import {ResearchService} from '../dist/research.service.js'
import {ResearchViewProvider} from '../dist/view.provider.js'
import {VIEW} from '../dist/constants.js'
import {startRemoteViewPreview} from '../../../../tools/remote-view-preview/preview-host.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const scope={tenantId:'preview-tenant',organizationId:'preview-org',workspaceId:'preview-workspace',userId:'preview-user',xpertId:'preview-assistant'}
const context={...scope,hostType:'agent',hostId:scope.xpertId}
export async function startPreview({database=resolve(root,'.cache/preview.sqlite'),port=0}={}){
  await mkdir(dirname(database),{recursive:true})
  const db=await new DataSource({type:'sqljs',location:database,autoSave:true,synchronize:true,entities:[ResearchTaskEntity]}).initialize()
  const research=new ResearchService(new PersistentTaskStore(db.getRepository(ResearchTaskEntity)))
  const provider=new ResearchViewProvider(research)
  const config={title:'Research Lab — SIMULATED HOST',workspaceRoot:root,instanceId:'shadow-preview',
    component:{root:resolve(root,'dist/remote'),runtime:'react',sandbox:'allow-scripts',viewportBound:true},
    hostContext:{manifest:{key:VIEW},payload:{},initialQuery:{page:1,pageSize:20,parameters:{}},locale:'zh-Hans',theme:{mode:'light',tokens:{}},debug:{enabled:false,production:true}},
    state:{tasks:[],lastReference:null,modelExecution:'not_configured'},
    async handleRequest(message,{state}){
      if(message.type==='requestData'){
        const data=await provider.getViewData(context,VIEW,message.query??{})
        state.tasks=(await research.list(scope)).items
        return {type:'data',data}
      }
      if(message.type==='executeAction'){
        const result=await provider.executeViewAction(context,VIEW,message.actionKey,{input:message.input})
        state.tasks=(await research.list(scope)).items
        return {type:'actionResult',result}
      }
      if(message.type==='invokeClientCommand'){
        state.lastReference=message.payload
        return {type:'clientCommandResult',result:{success:true,focused:true}}
      }
      throw new Error('Unsupported preview request')
    }}
  const server=await startRemoteViewPreview(config,{port})
  return {...server,research,scope,async close(){await server.close();await db.destroy()}}
}
