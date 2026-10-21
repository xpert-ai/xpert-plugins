import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WorkspaceScriptProvider } from './provider'
import { ScriptDefinitions } from './definitions'
import { WorkspaceScriptMiddleware } from './middleware'
@XpertServerPlugin({ providers: [WorkspaceScriptProvider, ScriptDefinitions, WorkspaceScriptMiddleware] })
export class WorkspaceScriptPlugin {}
