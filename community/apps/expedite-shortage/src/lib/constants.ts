/**
 * 插件的全局常量。
 *
 * 所有“在平台进程里必须全局唯一”的字符串（表名、视图 key、中间件名、模板提供者 key……）
 * 都从同一个命名空间常量派生，避免和别的插件撞名。
 * Python 类比：相当于一个 constants.py，其他模块 `from .constants import ...`。
 */
import type { IconDefinition } from '@xpert-ai/contracts'

/** npm 包名，必须与 package.json 的 name 一致（单测会断言） */
export const PLUGIN_NAME = '@xpert-ai/plugin-expedite-shortage'

/** 插件产物命名空间：表名前缀 plugin_expedite_shortage_ 就由它生成；发布后不能再改 */
export const PLUGIN_ARTIFACT_NAMESPACE = 'expedite_shortage' as const

/** 插件级别：注册了数据表，平台要求 system 或 tenant（技术方案决策 T2） */
export const PLUGIN_INSTALL_LEVEL = 'tenant' as const

/** 由命名空间派生全局唯一 key，例如 expedite_shortage.views */
export const artifactKey = (localKey: string) => `${PLUGIN_ARTIFACT_NAMESPACE}.${localKey}`

/** 能力（feature）标识：视图只在连接了本中间件的助手上出现，靠的就是它 */
export const EXPEDITE_FEATURE = artifactKey('analysis')

/** Agent 中间件策略名，助手模板 yaml 里的 provider 字段要写这个值 */
export const MIDDLEWARE_NAME = 'ExpediteShortageMiddleware'

/** 视图提供者 key（工作台视图） */
export const VIEW_PROVIDER_KEY = artifactKey('views')

/** 助手模板提供者 key */
export const TEMPLATE_PROVIDER_KEY = artifactKey('templates')

/** 插件和中间件共用的图标（Remix Icon 字体图标） */
export const PLUGIN_ICON: IconDefinition = { type: 'font', value: 'ri-truck-line' }
