import { defineConfig } from 'vitest/config'

// 单测只跑 src 下的 *.spec.ts；node 环境，不需要浏览器
export default defineConfig({ test: { include: ['src/**/*.spec.ts'], environment: 'node' } })
