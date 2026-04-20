import plugin from './index.js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirName = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(dirName, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

describe('Zip Plugin', () => {
  it('should have correct meta information', () => {
    expect(plugin.meta.name).toBe(packageJson.name)
    expect(plugin.meta.version).toBe(packageJson.version)
    expect(plugin.meta.category).toBe('tools')
    expect(plugin.meta.displayName).toBe('Zip')
    expect(plugin.meta.description).toContain('Compress multiple files')
    expect(plugin.meta.keywords).toEqual(expect.arrayContaining(['zip', 'compression', 'archive']))
    expect(plugin.meta.author).toBe('XpertAI Team')
    expect(plugin.meta.icon).toHaveProperty('type', 'svg')
  })

  it('should have an empty config schema', () => {
    expect(plugin.config?.schema?.safeParse({})?.success).toBe(true)
  })

  it('should call register and return correct module', () => {
    const ctx = {
      logger: { log: jest.fn() }
    }
    const result = plugin.register(ctx as any)
    expect(ctx.logger.log).toHaveBeenCalledWith('register zip plugin')
    expect(result).toHaveProperty('module')
    expect(result).toHaveProperty('global', true)
  })

  it('should log onStart', async () => {
    const ctx = {
      logger: { log: jest.fn() }
    }
    await plugin.onStart(ctx as any)
    expect(ctx.logger.log).toHaveBeenCalledWith('zip plugin started')
  })

  it('should log onStop', async () => {
    const ctx = {
      logger: { log: jest.fn() }
    }
    await plugin.onStop(ctx as any)
    expect(ctx.logger.log).toHaveBeenCalledWith('zip plugin stopped')
  })

  it('should create zip tool with consistent interface', async () => {
    const strategy = new (await import('./lib/strategy.js')).ZipStrategy()
    const tools = strategy.createTools()
    const zipTool = tools.find((tool) => tool.name === 'zip')
    const unzipTool = tools.find((tool) => tool.name === 'unzip')

    expect(tools).toHaveLength(2)
    expect(zipTool).toBeDefined()
    expect(unzipTool).toBeDefined()

    const zipSchema = (zipTool as any).schema
    expect(zipSchema.shape).toHaveProperty('files')
    expect(zipSchema.shape).toHaveProperty('fileName')

    const unzipSchema = (unzipTool as any).schema
    expect(unzipSchema.shape).toHaveProperty('fileName')
    expect(unzipSchema.shape).toHaveProperty('filePath')
    expect(unzipSchema.shape).toHaveProperty('fileUrl')
    expect(unzipSchema.shape).toHaveProperty('content')
  })
})

export {}
