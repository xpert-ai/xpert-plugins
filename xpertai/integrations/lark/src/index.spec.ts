import plugin from './index.js';

describe('Lark Plugin', () => {
  it('should have correct meta information', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-lark');
    expect(plugin.meta.version).toBe('1.0.0');
    expect(plugin.meta.category).toBe('doc-source');
    expect(plugin.meta.displayName).toBe('Lark Plugin');
    expect(plugin.meta.description).toBe('Integrate Lark functionality');
    expect(plugin.meta.keywords).toEqual(expect.arrayContaining(['lark', 'feishu', 'document source']));
    expect(plugin.meta.author).toBe('Xpert AI team');
    expect(plugin.meta.icon).toHaveProperty('type', 'svg');
  });

  it('should have an empty config schema', () => {
    expect(plugin.config?.schema?.safeParse({})?.success).toBe(true);
  });

  it('should call register and return correct module', () => {
    const ctx = {
      logger: { log: jest.fn() }
    };
    const result = plugin.register(ctx as any);
    expect(ctx.logger.log).toHaveBeenCalledWith('register lark plugin');
    expect(result).toHaveProperty('module');
    expect(result).toHaveProperty('global', true);
  });

  it('should log onStart', async () => {
    const ctx = {
      logger: { log: jest.fn() }
    };
    await plugin.onStart(ctx as any);
    expect(ctx.logger.log).toHaveBeenCalledWith('lark plugin started');
  });

  it('should log onStop', async () => {
    const ctx = {
      logger: { log: jest.fn() }
    };
    await plugin.onStop(ctx as any);
    expect(ctx.logger.log).toHaveBeenCalledWith('lark plugin stopped');
  });
});