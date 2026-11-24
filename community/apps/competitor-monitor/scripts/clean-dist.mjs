// 构建准备：仅移除本插件生成的 dist，避免旧产物残留。
import {rm} from 'node:fs/promises'
await rm(new URL('../dist',import.meta.url),{recursive:true,force:true})
