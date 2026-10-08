import { filterAllowedToolNames, kdocsMcpHeaders } from './kdocs-mcp.client.js'

describe('KdocsMcpClient boundaries', () => {
  it('injects only Xpert-owned static headers and never impersonates WorkBuddy', () => {
    const headers = kdocsMcpHeaders('secret-token')

    expect(headers).toEqual({
      Authorization: 'Bearer secret-token',
      'User-Agent': 'Xpert-KDocs-Connector',
      'X-Skill-Version': '1.4.12'
    })
    expect(headers).not.toHaveProperty('X-Request-Source')
    expect(JSON.stringify(headers)).not.toContain('workbuddy')
  })

  it('drops every dynamically listed MCP tool outside the curated allowlist', () => {
    expect(filterAllowedToolNames([
      'search_files',
      'sheet.get_range_data',
      'cancel_share',
      'dbsheet.delete_records',
      'provider_admin'
    ])).toEqual(['search_files', 'sheet.get_range_data'])
  })
})
