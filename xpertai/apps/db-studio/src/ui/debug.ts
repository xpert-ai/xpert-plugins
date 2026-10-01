/** Only allow-listed protocol metadata is logged; never SQL, rows, tokens or scope. */
let enabled = false
export function configureDebug(value: unknown) {
  enabled = Boolean(value && typeof value === 'object' && 'enabled' in value && value.enabled === true)
}
export function debug(event: 'init'|'request'|'reply'|'host-event', detail: {type?:string;requestId?:string} = {}) {
  if(enabled) console.debug('[db_studio]',event,{type:detail.type,requestId:detail.requestId})
}
