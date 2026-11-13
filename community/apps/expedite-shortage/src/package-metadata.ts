/**
 * 运行时读取 package.json，让插件 meta 里的名称、版本、级别、命名空间
 * 与 package.json 保持唯一来源，避免两处手写不一致（平台部署时会校验）。
 * Python 类比：用 importlib.metadata 读包的 version，而不是在代码里再写一遍。
 */
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'

const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  xpert: z.object({
    plugin: z.object({ level: z.literal('tenant'), artifactNamespace: z.string() })
  })
})

// 编译后本文件在 dist/package-metadata.js，所以 ../package.json 指向包根目录
export const PACKAGE_METADATA = packageJsonSchema.parse(
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
)
