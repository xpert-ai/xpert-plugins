import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { MotorOrder, MotorWork } from './entity.js'
import { MotorStore } from './store.js'
import { MotorEvolution } from './evolution.js'
import { MotorRuntime } from './runtime.js'
import { MotorContribution } from './configuration.js'
import { adapters } from './adapters.js'
import { MotorProject } from './project.js'
import { MotorViews } from './view.js'
import { toolProviders } from './tools.js'
import { app, templates, keys, workbench } from './catalog.js'
import { middleware, provider } from './process.js'
const entities = [MotorOrder, MotorWork]
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(entities)],
  entities,
  providers: [
    MotorStore,
    MotorRuntime,
    MotorEvolution,
    MotorContribution,
    ...adapters,
    MotorProject,
    MotorViews,
    ...toolProviders,
  ],
})
class MotorPlugin {}
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  xpert: { plugin: { level: 'tenant'; artifactNamespace: string } }
}
const plugin: XpertPlugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
    ...pkg.xpert.plugin,
    displayName: '驱动电机制造全流程',
    description: '样例订单、人机协同与售后经验复用',
    category: 'middleware',
    author: 'XpertAI',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [workbench, ...keys.map(middleware)],
        marketplace: { contents: [app] },
        runtime: { middlewareProviders: keys.map(middleware), viewProviders: [provider] },
      },
    },
  },
  templates,
  register() {
    return { module: MotorPlugin, global: true }
  },
}
export default plugin
