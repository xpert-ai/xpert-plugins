import { SpaceArtifactLibrary } from './artifact-library.js'
import { SpaceItemCatalog } from './item-catalog.js'
import { SpaceCatalog } from './catalog.js'
import { SpaceContentKnowledge } from './content-knowledge.js'
import { SpaceImports } from './imports.js'
import 'reflect-metadata'
import { readFileSync } from 'node:fs'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; version: string; xpert: { plugin: { level: 'system'; artifactNamespace: string } } }
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { entities } from './entities.js'
import { SpaceAccess } from './access.js'
import { SpacesResourceProvider } from './resource-provider.js'
import { SpacesService } from './spaces.js'
import { SpacePages } from './pages.js'
import { SpaceAi } from './ai.js'
import { SpacesView } from './view.js'
import { SpaceEditors } from './editors.js'
import { SpacesMiddleware } from './middleware.js'
import { SpaceArtifacts } from './artifacts.js'
import { SpaceFiles } from './files.js'
import { SpaceDocuments } from './documents.js'
import { SpaceKnowledge } from './knowledge.js'
import { SpaceContent } from './content.js'
import { SpaceReferences } from './references.js'
import { SpaceSubpages } from './subpages.js'
import { SpacesCapabilityProvider } from './capability.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(entities)], entities,
  providers: [SpaceArtifactLibrary, SpaceItemCatalog, SpaceContentKnowledge, SpaceCatalog, SpacesCapabilityProvider, SpaceImports, SpaceReferences, SpaceSubpages, SpaceContent, SpaceAccess, SpaceKnowledge, SpaceDocuments, SpacesResourceProvider, SpacesService, SpacePages, SpaceAi, SpaceFiles, SpaceEditors, SpaceArtifacts, SpacesMiddleware, SpacesView]
})
export class SpacesPlugin {}

const plugin: XpertPlugin = {
  meta: {
    name: manifest.name, version: manifest.version, author: 'XpertAI', level: manifest.xpert.plugin.level, artifactNamespace: manifest.xpert.plugin.artifactNamespace,
    displayName: 'Spaces', description: 'Assistant collaboration capability for shared AI-maintained documents and artifacts',
    category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['business-app', 'workbench-view', 'assistant-tool'], capabilities: ['spaces'], runtime: { middlewareProviders: ['spaces'], viewProviders: ['spaces.views'] } } }
  },
  register() { return { module: SpacesPlugin, global: true } }
}
export default plugin
