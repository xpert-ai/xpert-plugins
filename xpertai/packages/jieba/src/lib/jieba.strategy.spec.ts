import 'reflect-metadata'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  KEYWORD_ANALYZER_STRATEGY,
  KeywordAnalyzerRegistry,
  ORGANIZATION_METADATA_KEY,
  PLUGIN_METADATA_KEY,
  STRATEGY_META_KEY,
  StrategyBus
} from '@xpert-ai/plugin-sdk'
import { JiebaPlugin } from './jieba.plugin.js'
import { JiebaKeywordAnalyzer } from './jieba.strategy.js'

describe('Jieba keyword analyzer plugin', () => {
  const analyzer = new JiebaKeywordAnalyzer()

  it('finds Chinese search terms and short words without spaces', async () => {
    expect(await analyzer.analyze('人工智能技术', 'index')).toEqual(['人工', '智能', '人工智能', '技术'])
    expect(await analyzer.analyze('用户可以申请退款', 'index')).toContain('退款')
    expect(await analyzer.analyze('退款', 'query')).toEqual(['退款'])
  })

  it('normalizes mixed full-width English and numbers identically for index and query', async () => {
    const text = 'ＡＩ 支持 ＡＢＣ１２３'
    const tokens = await analyzer.analyze(text, 'index')
    expect(tokens).toEqual(['ai', '支持', 'abc123'])
    expect(await analyzer.analyze(text, 'query')).toEqual(tokens)
  })

  it('excludes whitespace, punctuation and emoji-only tokens', async () => {
    expect(await analyzer.analyze('', 'query')).toEqual([])
    expect(await analyzer.analyze('，。！？ \n\t😀', 'query')).toEqual([])
  })

  it('retains repeated terms for host ranking', async () => {
    expect(await analyzer.analyze('退款 退款', 'index')).toEqual(['退款', '退款'])
  })

  it('exports the strategy metadata used by host plugin discovery', () => {
    expect(Reflect.getMetadata(STRATEGY_META_KEY, JiebaKeywordAnalyzer)).toBe(KEYWORD_ANALYZER_STRATEGY)
    expect(Reflect.getMetadata(KEYWORD_ANALYZER_STRATEGY, JiebaKeywordAnalyzer)).toBe('jieba')
  })

  it('loads in Nest and participates in scoped install, refresh and uninstall events', async () => {
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-a', JiebaKeywordAnalyzer)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert-ai/plugin-jieba', JiebaKeywordAnalyzer)
    const app = await Test.createTestingModule({ imports: [JiebaPlugin] }).compile()
    await app.init()
    const registry = new KeywordAnalyzerRegistry(
      new DiscoveryService(new ModulesContainer()),
      new Reflector()
    )
    const bus = new StrategyBus()
    // The host publishes provider instances from the plugin container on this same bus.
    Object.defineProperty(registry, 'bus', { value: bus })
    registry.onModuleInit()
    try {
      bus.upsert(KEYWORD_ANALYZER_STRATEGY, {
        instance: app.get(JiebaKeywordAnalyzer),
        sourceKind: 'plugin',
        sourceId: 'org-a:@xpert-ai/plugin-jieba:JiebaKeywordAnalyzer'
      })
      expect(registry.get('jieba', 'org-a')).toBe(app.get(JiebaKeywordAnalyzer))
      expect(() => registry.get('jieba', 'org-b')).toThrow('No strategy')
      expect(await registry.get('jieba', 'org-a')?.analyze('退款', 'query')).toEqual(['退款'])
      bus.remove('org-a', '@xpert-ai/plugin-jieba', 'refresh')
      expect(() => registry.get('jieba', 'org-a')).toThrow('No strategy')
      bus.upsert(KEYWORD_ANALYZER_STRATEGY, {
        instance: app.get(JiebaKeywordAnalyzer),
        sourceKind: 'plugin',
        sourceId: 'org-a:@xpert-ai/plugin-jieba:JiebaKeywordAnalyzer'
      })
      expect(registry.getSource(registry.get('jieba', 'org-a'))).toEqual({
        kind: 'plugin',
        scopeKey: 'org-a',
        pluginName: '@xpert-ai/plugin-jieba'
      })
      const source = registry.getSource(registry.get('jieba', 'org-a'))
      expect(registry.getBySource('jieba', source, 'org-a')).toBe(app.get(JiebaKeywordAnalyzer))
      expect(registry.getBySource('jieba', source, 'org-b')).toBeUndefined()
      bus.remove('org-a', '@xpert-ai/plugin-jieba', 'uninstall')
      expect(() => registry.get('jieba', 'org-a')).toThrow('No strategy')
      expect(registry.getBySource('jieba', source, 'org-a')).toBeUndefined()
    } finally {
      Reflect.deleteMetadata(ORGANIZATION_METADATA_KEY, JiebaKeywordAnalyzer)
      Reflect.deleteMetadata(PLUGIN_METADATA_KEY, JiebaKeywordAnalyzer)
      await app.close()
    }
  })
})
