import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { z } from 'zod'
import { createOperationCollaborationClient, createSocketIoTransportAdapter,
  type ICollaborationPresence } from '@xpert-ai/plugin-sdk/collaboration-client'
import { action } from './bridge'
import type { Source } from './use-document'

const sessionSchema = z.object({ engine: z.literal('operations'), sessionId: z.string().min(1), clientKey: z.string().min(1),
  documentId: z.string().uuid(), namespace: z.literal('/api/collaboration'), connectionUrl: z.string().url(),
  access: z.enum(['read','write']), expiresAt: z.number().int().positive(), actor: z.object({ presenceId: z.string(),
    actorType: z.enum(['user','agent','system']), displayName: z.string(), color: z.string(), avatarUrl: z.string().nullable().optional() }) })

export function useCollaboration(source: Source, enabled: boolean, pageId?: string, elementId?: string | null) {
  const selection = useRef({pageId,elementId}); selection.current = {pageId,elementId}
  const [revision,setRevision] = useState(0), [connected,setConnected] = useState(false)
  const [peers,setPeers] = useState<ICollaborationPresence[]>([])
  useEffect(() => {
    if (!enabled) return
    let active=true, cleanup=()=>{}, renewal:ReturnType<typeof setTimeout> | undefined
    async function connect() {
      cleanup(); if(!active) return
      setConnected(false)
      try {
        const session=sessionSchema.parse(await action('file.session',source))
        if(!active) return
        const socket=io(session.connectionUrl,{transports:['websocket'],autoConnect:false,reconnection:true,
          auth:{sessionId:session.sessionId,clientKey:session.clientKey,documentId:session.documentId}})
        const client=createOperationCollaborationClient({session,transport:createSocketIoTransportAdapter(socket),
          onRevision:value=>{if(active)setRevision(previous=>Math.max(previous,value))},
          onPresence:(items,self)=>{if(active)setPeers(items.filter(item=>item.clientId!==self))},
          onConnection:value=>{if(active)setConnected(value==='connected')},onError:()=>{if(active)setConnected(false)}})
        let signature=''
        const timer=setInterval(()=>{
          const {pageId,elementId}=selection.current, next=JSON.stringify(selection.current)
          if(signature===next)return
          signature=next;client.setPresence({pageId:pageId??null,status:'editing',selection:elementId?{kind:'elements',elementIds:[elementId]}:null})
        },300)
        cleanup=()=>{clearInterval(timer);client.disconnect()}
        renewal=setTimeout(()=>void connect(),Math.max(1000,session.expiresAt-Date.now()-30000))
        client.connect()
      } catch { if(active){setConnected(false);setPeers([]);renewal=setTimeout(()=>void connect(),10000)} }
    }
    void connect()
    return ()=>{active=false;clearTimeout(renewal);cleanup()}
  },[source.resourceId,source.providerKey,enabled])
  return {revision,connected,peers}
}
