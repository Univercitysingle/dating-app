import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../../lib/storage';
import type { NextApiRequest, NextApiResponse } from 'next';

// This is a placeholder for your own user authentication logic
const getUserIdFromRequest = async (req: NextApiRequest): Promise<string | null> => {
  // In a real application, you would verify a session cookie or a JWT here
  // and return the user's ID.
  // For now, we'll use a hardcoded user ID for demonstration purposes.
  return 'user-12345';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { filename, contentType } = req.body;
    console.log(`Received request to generate presigned URL for file: ${filename} (${contentType})`);

    if (!filename || !contentType) {
      console.log('Request is missing filename or contentType.');
      return res
        .status(400)
        .json({ error: 'Missing filename or contentType' });
    }

    // Generate a unique key for the S3 object
    const objectKey = `${userId}/${Date.now()}-${filename}`;
    const bucketName = process.env.AWS_S3_BUCKET_NAME as string;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60, // URL expires in 60 seconds
    });

    console.log(`Successfully generated presigned URL for: ${objectKey}`);

    res.status(200).json({
      url: signedUrl,
      key: objectKey,
    });
  } catch (error) {
    console.error('Error creating signed URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
