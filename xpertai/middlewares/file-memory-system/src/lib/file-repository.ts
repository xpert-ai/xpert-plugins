import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Injectable } from '@nestjs/common'
import { LongTermMemoryTypeEnum } from '@metad/contracts'
import { FileMemoryLayerResolver } from './layer-resolver.js'
import { getDirectoryNamesForKinds } from './memory-taxonomy.js'
import { MemoryLayer } from './types.js'

@Injectable()
export class FileMemoryFileRepository {
  constructor(private readonly layerResolver: FileMemoryLayerResolver) {}

  async listFiles(tenantId: string, layer: MemoryLayer, kinds?: LongTermMemoryTypeEnum[]) {
    const baseDir = this.layerResolver.resolveLayerDirectory(tenantId, layer)
    const targetDirectories = getDirectoryNamesForKinds(kinds)
    const fileGroups = await Promise.all(
      targetDirectories.map(async (directoryName) => {
        const directory = path.join(baseDir, directoryName)
        try {
          const entries = await fsPromises.readdir(directory)
          return entries.filter((entry) => entry.endsWith('.md')).map((entry) => path.join(directory, entry))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return []
          }
          throw error
        }
      })
    )
    return fileGroups.flat()
  }

  async readFile(filePath: string) {
    return fsPromises.readFile(filePath, 'utf8')
  }

  async writeFile(filePath: string, content: string) {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, content, 'utf8')
  }
}
