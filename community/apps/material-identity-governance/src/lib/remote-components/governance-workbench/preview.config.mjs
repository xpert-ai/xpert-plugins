import { dirname,resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initialState,handleRequest } from './preview-fixture.mjs'
const componentRoot=dirname(fileURLToPath(import.meta.url))
export default {
 title:'物料主数据智能治理 · 交互原型',frameTitle:'物料主数据智能治理',
 workspaceRoot:process.env.XPERT_PLATFORM_ROOT??resolve(componentRoot,'../../../../../../../../xpert-pro'),
 instanceId:'material-identity-preview',component:{root:componentRoot,runtime:'react',title:'物料主数据智能治理'},
 hostContext:{manifest:{key:'material_identity_operations_dashboard'},payload:{},initialQuery:{page:1,pageSize:20},locale:'zh-Hans',theme:{mode:'light',density:'default',tokens:{}},debug:{enabled:false,production:true}},
 state:initialState(),handleRequest
}
