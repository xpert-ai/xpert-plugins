import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'

const packageSchema = z.object({ name: z.string(), version: z.string(), xpert: z.object({ plugin: z.object({ level: z.literal('system'), artifactNamespace: z.string().regex(/^[a-z][a-z0-9_]*$/) }) }) })
// The package is the sole source of metadata. Validate once at this JSON boundary.
export const packageMeta = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as z.infer<typeof packageSchema>
packageSchema.parse(packageMeta)
export const namespace = packageMeta.xpert.plugin.artifactNamespace
export const artifact = (key: string) => `${namespace}.${key}`
export const providerKey = artifact('workbench')
export const viewKey = artifact('intake')
export const feature = artifact('records')
export const middlewareName = artifact('middleware')
export const remoteEntry = artifact('remote')
export const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="24" y="24" width="208" height="208" rx="40" fill="#e0f2f1"/><path d="M88 65h63l28 29v96H77V65Z" fill="#fff" stroke="#0f766e" stroke-width="13" stroke-linejoin="round"/><path d="M106 116h42m-42 29h24m6 32 17 17 34-40" fill="none" stroke="#0f766e" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>'
