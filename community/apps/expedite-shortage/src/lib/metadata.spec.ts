/**
 * 元数据一致性测试：插件 meta 与 package.json、常量之间不能出现两套说法。
 * 平台部署时也会做类似校验，这里提前在单测里发现问题。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import plugin from '../index.js'
import { MIDDLEWARE_NAME, PLUGIN_ARTIFACT_NAMESPACE, PLUGIN_INSTALL_LEVEL, PLUGIN_NAME } from './constants.js'
import { ExpediteShortageMiddleware } from './expedite.middleware.js'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  xpert: { plugin: { level: string; artifactNamespace: string } }
}

describe('plugin metadata', () => {
  it('matches package.json and shared constants', () => {
    expect(plugin.meta.name).toBe(pkg.name)
    expect(plugin.meta.name).toBe(PLUGIN_NAME)
    expect(plugin.meta.version).toBe(pkg.version)
    expect(plugin.meta.level).toBe(PLUGIN_INSTALL_LEVEL)
    expect(pkg.xpert.plugin.level).toBe(PLUGIN_INSTALL_LEVEL)
    expect(plugin.meta.artifactNamespace).toBe(PLUGIN_ARTIFACT_NAMESPACE)
    expect(pkg.xpert.plugin.artifactNamespace).toBe(PLUGIN_ARTIFACT_NAMESPACE)
  })

  it('namespace only contains lowercase letters, digits and underscores', () => {
    expect(PLUGIN_ARTIFACT_NAMESPACE).toMatch(/^[a-z0-9_]+$/)
  })

  it('declares the middleware provider that the module registers', () => {
    // 中间件类上的装饰器名与常量一致（meta 的完整断言在 expedite.middleware.spec.ts）
    expect(ExpediteShortageMiddleware.name).toBe(MIDDLEWARE_NAME)
    for (const app of plugin.meta.targetApps ?? []) {
      expect(plugin.meta.targetAppMeta?.[app]?.runtime?.middlewareProviders).toEqual([MIDDLEWARE_NAME])
    }
  })
})
