let enabled=false
export function configureDebug(value:{enabled?:boolean}|null|undefined){enabled=value?.enabled===true}
function summary(value:object){return Object.fromEntries(Object.entries(value).filter(([key])=>!/token|secret|password|url|path|tenant|organization|payload|context/i.test(key)).map(([key,item])=>[key,Array.isArray(item)?{count:item.length}:typeof item==='object'&&item!==null?'[object]':typeof item==='string'?item.slice(0,100):item]))}
export const debug={
  info(event:string,data?:object){if(enabled)console.debug(event,data?summary(data):undefined)},
  warn(event:string,data?:object){if(enabled)console.warn(event,data instanceof Error?{name:data.name}:data?summary(data):undefined)},
  error(event:string,data?:object){console.error(event,data instanceof Error?{name:data.name}:undefined)}
}
