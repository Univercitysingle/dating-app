import { S3Client } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION as string;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID as string;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY as string;
const endpoint = 'https://s3.us-west-002.backblazeb2.com';

if (!region || !accessKeyId || !secretAccessKey) {
  throw new Error('Missing AWS S3 configuration for Backblaze B2');
}

export const s3Client = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
