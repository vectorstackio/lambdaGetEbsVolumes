// handler.ts

import {
  EC2Client,
  DescribeVolumesCommand
} from '@aws-sdk/client-ec2'

const ec2 = new EC2Client({})

export async function handler() {

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
      attachedInstanceIds:
        volume.Attachments?.map(
          attachment =>
            attachment.InstanceId
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
}