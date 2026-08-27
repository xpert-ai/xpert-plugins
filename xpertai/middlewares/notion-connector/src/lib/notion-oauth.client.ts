import { NOTION_TOKEN_URL } from './constants.js'
import { Injectable } from '@nestjs/common'
import { NotionConnectorError, isRecord, readString, requireString } from './errors.js'

export type NotionOAuthToken = {
  accessToken: string
  tokenType: string
  refreshToken?: string
  botId: string
  workspaceId: string
  workspaceName?: string
  workspaceIcon?: string
  owner?: Record<string, unknown>
}

@Injectable()
export class NotionOAuthClient {
  async exchangeCode(input: {
    clientId: string
    clientSecret: string
    code: string
    redirectUri: string
  }): Promise<NotionOAuthToken> {
    return this.request(input.clientId, input.clientSecret, {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri
    })
  }

  async refresh(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<NotionOAuthToken> {
    return this.request(input.clientId, input.clientSecret, {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken
    })
  }

  private async request(
    clientId: string,
    clientSecret: string,
    body: Record<string, string>
  ): Promise<NotionOAuthToken> {
    let response: Response
    try {
      response = await fetch(NOTION_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body)
      })
    } catch (error) {
      throw new NotionConnectorError('OAUTH_EXCHANGE_FAILED', `Notion OAuth request failed: ${errorMessage(error)}`)
    }

    const payload = await readJson(response)
    if (!response.ok) {
      const message =
        readString(payload?.error_description) ?? readString(payload?.message) ?? 'Notion OAuth request failed.'
      throw new NotionConnectorError('OAUTH_EXCHANGE_FAILED', message, response.status)
    }
    return parseToken(payload)
  }
}

function parseToken(value: Record<string, unknown> | undefined): NotionOAuthToken {
  return {
    accessToken: requireString(value?.access_token, 'Notion OAuth response did not include access_token.'),
    tokenType: (readString(value?.token_type) ?? 'bearer').toLowerCase(),
    refreshToken: readString(value?.refresh_token),
    botId: requireString(value?.bot_id, 'Notion OAuth response did not include bot_id.'),
    workspaceId: requireString(value?.workspace_id, 'Notion OAuth response did not include workspace_id.'),
    workspaceName: readString(value?.workspace_name),
    workspaceIcon: readString(value?.workspace_icon),
    owner: isRecord(value?.owner) ? value.owner : undefined
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await response.json()
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
