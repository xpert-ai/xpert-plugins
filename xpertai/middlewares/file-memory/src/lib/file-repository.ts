import { Injectable } from '@nestjs/common'
import { LongTermMemoryTypeEnum } from '@xpert-ai/contracts'
import { FileMemoryLayerResolver } from './layer-resolver.js'
import { getDirectoryNamesForKinds } from './memory-taxonomy.js'
import { SandboxMemoryStore } from './sandbox-memory.store.js'
import { MemoryLayer } from './types.js'

@Injectable()
export class FileMemoryFileRepository {
  constructor(private readonly layerResolver: FileMemoryLayerResolver) {}

  async listFiles(store: SandboxMemoryStore, layer: MemoryLayer, kinds?: LongTermMemoryTypeEnum[]) {
    const baseDir = this.layerResolver.resolveLayerDirectory(layer)
    const targetDirectories = getDirectoryNamesForKinds(kinds)
    const fileGroups = await Promise.all(
      targetDirectories.map((directoryName) => store.listMarkdownFiles(`${baseDir}/${directoryName}`))
    )
    return fileGroups.flat()
  }

  async readFile(store: SandboxMemoryStore, filePath: string) {
    return store.readFile(filePath)
  }

  async writeFile(store: SandboxMemoryStore, filePath: string, content: string) {
    await store.writeFile(filePath, content)
  }

  async getMtimeMs(store: SandboxMemoryStore, filePath: string) {
    return store.getMtimeMs(filePath)
  }
}
