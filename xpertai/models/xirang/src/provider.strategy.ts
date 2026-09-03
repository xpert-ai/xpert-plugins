import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider, getErrorMessage } from '@xpert-ai/plugin-sdk'
import { Xirang, type XirangCredentials, getXirangAuthorization, getXirangBaseUrl } from './types.js'

@Injectable()
@AIModelProviderStrategy(Xirang)
export class XirangProviderStrategy extends ModelProvider {
  override logger = new Logger(XirangProviderStrategy.name)

  getBaseUrl(credentials: XirangCredentials): string {
    return getXirangBaseUrl(credentials)
  }

  getAuthorization(credentials: XirangCredentials): string {
    return getXirangAuthorization(credentials)
  }

  override async validateProviderCredentials(credentials: XirangCredentials): Promise<void> {
    if (!credentials?.app_key?.trim()) {
      throw new CredentialsValidateFailedError('天翼云 AppKey 不能为空')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`${getXirangBaseUrl(credentials)}/models`, {
        method: 'GET',
        headers: { Authorization: getXirangAuthorization(credentials), Accept: 'application/json' },
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(`Xirang model endpoint returned HTTP ${response.status}`)
      }
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error))
    } finally {
      clearTimeout(timeout)
    }
  }
}
