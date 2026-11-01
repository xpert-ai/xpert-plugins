import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PublishedWorkspaceScriptProvider } from './published-provider'
import { WorkspaceScriptProvider } from './provider'
import { ScriptDefinitions } from './definitions'
import { WorkspaceScriptMiddleware } from './middleware'
@XpertServerPlugin({ providers: [PublishedWorkspaceScriptProvider, WorkspaceScriptProvider, ScriptDefinitions, WorkspaceScriptMiddleware] })
export class WorkspaceScriptPlugin {}
