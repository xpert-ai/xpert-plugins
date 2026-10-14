import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { TongyiProviderStrategy } from './provider.strategy.js'
import { TongyiCredentialValidationModel, type TongyiCredentials } from './types.js'

describe('TongyiProviderStrategy.validateProviderCredentials', () => {
  const credentials: TongyiCredentials = {
    dashscope_api_key: 'test-key'
  }

  it('validates DashScope keys with qwen3.8-flash', async () => {
    const strategy = new TongyiProviderStrategy()
    const validateCredentials = jest.fn().mockResolvedValue(undefined)
    jest.spyOn(strategy, 'getModelManager').mockReturnValue({ validateCredentials } as never)
    await strategy.validateProviderCredentials(credentials)
    expect(strategy.getModelManager).toHaveBeenCalledWith(AiModelTypeEnum.LLM)
    expect(validateCredentials).toHaveBeenCalledWith(TongyiCredentialValidationModel, credentials)
  })

  it('keeps workspace authentication on the realtime handshake', async () => {
    const strategy = new TongyiProviderStrategy()
    const validateCredentials = jest.fn().mockResolvedValue(undefined)
    const workspaceCredentials: TongyiCredentials = {
      ...credentials,
      api_host: 'example.cn-beijing.maas.aliyuncs.com'
    }
    jest.spyOn(strategy, 'getModelManager').mockReturnValue({ validateCredentials } as never)
    await strategy.validateProviderCredentials(workspaceCredentials)
    expect(strategy.getModelManager).toHaveBeenCalledWith(AiModelTypeEnum.REALTIME)
    expect(validateCredentials).toHaveBeenCalledWith('qwen3.8-omni-flash-realtime', workspaceCredentials)
  })
})
