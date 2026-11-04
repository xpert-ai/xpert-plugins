// No task content, identifiers, model prompts, credentials or host scope are logged.
export function debugEvent(event:string,fields:{success:boolean;durationMs:number}){
  if(process.env.SHADOW_RESEARCH_DEBUG==='1')console.debug('[shadow_research]',event,fields)
}
