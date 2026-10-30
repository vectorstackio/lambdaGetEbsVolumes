// handler.ts

import { EC2Client, DescribeVolumesCommand } from '@aws-sdk/client-ec2'

const ec2 = new EC2Client({})

export async function handler() {
  try {
    const result = await ec2.send(
      new DescribeVolumesCommand({
        Filters: [
          {
            Name: 'status',
            Values: ['available', 'in-use']
          }
        ]
      })
    )

    const volumes = (result.Volumes ?? [])
      .map(volume => ({
        volumeId: volume.VolumeId,
        state: volume.State,
        size: volume.Size,
        type: volume.VolumeType,
        encrypted: volume.Encrypted,
        availabilityZone: volume.AvailabilityZone,
        created: volume.CreateTime?.toISOString(),
        name: volume.Tags?.find(tag => tag.Key === 'Name')?.Value,
        attachedInstanceIds:
          volume.Attachments?.map(
            attachment => attachment.InstanceId
          ) ?? []
      }))

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        volumes
      })
    }
  } catch {
    console.error('Failed to list EBS volumes')
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error in getEbsVolumes lambda' })
    }
  }
}