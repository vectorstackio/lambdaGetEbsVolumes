import { beforeEach, describe, expect, it, vi } from 'vitest'

const { send, command } = vi.hoisted(() => ({
  send: vi.fn(),
  command: vi.fn()
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class {
    send = send
  },
  DescribeVolumesCommand: class {
    constructor(input: unknown) {
      command(input)
    }
  }
}))

import { handler } from '../src/handler'

describe('handler', () => {
  beforeEach(() => {
    send.mockReset()
    command.mockReset()
    vi.restoreAllMocks()
  })

  it('requests available and in-use volumes and maps their fields', async () => {
    send.mockResolvedValue({ Volumes: [{
      VolumeId: 'vol-123', State: 'in-use', Size: 100, VolumeType: 'gp3',
      Encrypted: true, AvailabilityZone: 'eu-west-1a',
      CreateTime: new Date('2024-01-02T03:04:05.000Z'),
      Tags: [{ Key: 'Environment', Value: 'test' }, { Key: 'Name', Value: 'data' }],
      Attachments: [{ InstanceId: 'i-123' }, { InstanceId: 'i-456' }]
    }] })
    const response = await handler()
    expect(command).toHaveBeenCalledExactlyOnceWith({
      Filters: [{ Name: 'status', Values: ['available', 'in-use'] }]
    })
    expect(send).toHaveBeenCalledOnce()
    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    expect(JSON.parse(response.body)).toEqual({ volumes: [{
      volumeId: 'vol-123', state: 'in-use', size: 100, type: 'gp3', encrypted: true,
      availabilityZone: 'eu-west-1a', created: '2024-01-02T03:04:05.000Z',
      name: 'data', attachedInstanceIds: ['i-123', 'i-456']
    }] })
  })

  it.each([{}, { Volumes: undefined }, { Volumes: [] }])('returns an empty list for %j', async result => {
    send.mockResolvedValue(result)
    expect(JSON.parse((await handler()).body)).toEqual({ volumes: [] })
  })

  it('handles optional fields, empty tags, and empty attachments', async () => {
    send.mockResolvedValue({ Volumes: [
      {},
      { VolumeId: 'vol-empty', Encrypted: false, Size: 0, Tags: [], Attachments: [] },
      { Tags: [{ Key: 'Other', Value: 'ignored' }], Attachments: [{}, { InstanceId: 'i-1' }] }
    ] })
    expect(JSON.parse((await handler()).body)).toEqual({ volumes: [
      { attachedInstanceIds: [] },
      { volumeId: 'vol-empty', encrypted: false, size: 0, attachedInstanceIds: [] },
      { attachedInstanceIds: [null, 'i-1'] }
    ] })
  })

  it('uses the first Name tag', async () => {
    send.mockResolvedValue({ Volumes: [{ Tags: [{ Key: 'Name', Value: 'first' }, { Key: 'Name', Value: 'second' }] }] })
    expect(JSON.parse((await handler()).body).volumes[0].name).toBe('first')
  })

  it.each([
    ['AWS rejection', () => send.mockRejectedValue(new Error('service unavailable'))],
    ['invalid volume collection', () => send.mockResolvedValue({ Volumes: 'invalid' })],
    ['invalid date', () => send.mockResolvedValue({ Volumes: [{ CreateTime: new Date('invalid') }] })],
    ['null volume', () => send.mockResolvedValue({ Volumes: [null] })]
  ])('returns a generic error for %s', async (_label, arrange) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    arrange()
    const response = await handler()
    expect(response).toEqual({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error in getEbsVolumes lambda' })
    })
    expect(log).toHaveBeenCalledOnce()
  })

  it('does not log volume data on success', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockResolvedValue({ Volumes: [{ Tags: [{ Key: 'Name', Value: 'sensitive-name' }] }] })
    await handler()
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('does not log sensitive information from an AWS error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockRejectedValue(new Error('secret-token-123'))
    const response = await handler()
    expect(response.body).not.toContain('secret-token-123')
    expect(error.mock.calls.flat().map(String).join(' ')).not.toContain('secret-token-123')
  })
})
