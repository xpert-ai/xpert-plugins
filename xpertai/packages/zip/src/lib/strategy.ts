import { Injectable } from '@nestjs/common'
import { BuiltinToolset, IToolsetStrategy, ToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { Zip, icon } from './types.js'
import { buildZipTool } from './zip.tool.js'
import { buildUnzipTool } from './unzip.tool.js'
import { ZipToolset } from './toolset.js'

@Injectable()
@ToolsetStrategy(Zip)
export class ZipStrategy implements IToolsetStrategy<any> {

  meta = {
    author: 'Xpert AI',
    tags: ['zip', 'compression', 'archive', 'tool'],
    name: Zip,
    label: {
      en_US: 'Zip',
      zh_Hans: '压缩文件'
    },
    description: {
      en_US: 'Compress multiple files into a zip file and extract files from zip archives.',
      zh_Hans: '将多个文件压缩为 zip 文件，并从 zip 归档中提取文件。'
    },
    icon: {
      svg: icon,
      color: '#ff0099'
    },
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    // No validation needed
    return Promise.resolve()
  }
  
  async create(config: any): Promise<BuiltinToolset> {
    return new ZipToolset(config)
  }

  createTools() {
    return [
      buildZipTool(),
      buildUnzipTool()
    ]
  }
}

