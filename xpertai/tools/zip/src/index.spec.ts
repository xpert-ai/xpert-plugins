import plugin from './index.js'

describe('Zip Plugin', () => {
  it('should have correct meta information', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-zip')
    expect(plugin.meta.version).toBe('0.0.1')
    expect(plugin.meta.category).toBe('tools')
    expect(plugin.meta.displayName).toBe('Zip')
    expect(plugin.meta.description).toContain('Compress multiple files')
    expect(plugin.meta.keywords).toEqual(expect.arrayContaining(['zip', 'compression', 'archive']))
    expect(plugin.meta.author).toBe('XpertAI Team')
    expect(plugin.meta.icon).toHaveProperty('type', 'image')
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
    const zipTool = tools[0] // zip tool should be first
    
    expect(zipTool).toBeDefined()
    expect(zipTool.name).toBe('zip')
    
    // Check that the schema includes the new fields
    const schema = (zipTool as any).schema
    expect(schema.shape).toHaveProperty('fileName')
    expect(schema.shape).toHaveProperty('filePath')
    expect(schema.shape).toHaveProperty('fileUrl')
    expect(schema.shape).toHaveProperty('content')
  })
})

export {}
