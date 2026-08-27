import { mapDepartment, mapDepartmentList, mapMember, mapMessageReceipt } from './mappers.js'

describe('WeCom API mappers', () => {
  it('allowlists member business fields and drops sensitive provider fields', () => {
    const result = mapMember({
      userid: 'user-1',
      name: 'User One',
      department: [1, 2],
      position: 'Engineer',
      mobile: '13800000000',
      email: 'user@example.com',
      address: 'drop',
      provider_secret: 'drop'
    })

    expect(result).toMatchObject({
      userId: 'user-1',
      name: 'User One',
      departmentIds: [1, 2],
      position: 'Engineer'
    })
    expect(JSON.stringify(result)).not.toMatch(/13800000000|user@example.com|provider_secret|address/)
  })

  it('accepts the department array response shape and lists direct children only', () => {
    expect(
      mapDepartment({ department: [{ id: 2, name: 'Engineering', parentid: 1, department_leader: ['lead-1'] }] })
    ).toEqual({
      departmentId: 2,
      name: 'Engineering',
      parentDepartmentId: 1,
      leaderUserIds: ['lead-1']
    })
    expect(
      mapDepartmentList(
        {
          department_id: [
            { id: 2, parentid: 1 },
            { id: 3, parentid: 2 }
          ]
        },
        1,
        10
      )
    ).toEqual({
      items: [{ departmentId: 2, parentDepartmentId: 1 }],
      total: 1,
      truncated: false
    })
  })

  it('returns bounded provider rejection lists in message receipts', () => {
    const invalid = Array.from({ length: 120 }, (_, index) => `user-${index}`).join('|')
    const result = mapMessageReceipt({ msgid: 'message-1', invaliduser: invalid }, 'send_text_message')

    expect(result.invalidUserIds).toHaveLength(100)
    expect(result).toMatchObject({ status: 'partial', operation: 'send_text_message', messageId: 'message-1' })
  })
})
