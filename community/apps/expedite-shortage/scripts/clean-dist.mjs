// 构建前清空本包的 dist，防止已删除的旧模块残留在产物里被一起发布
import { rm } from 'node:fs/promises'

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true })
