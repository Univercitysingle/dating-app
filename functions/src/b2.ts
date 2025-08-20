import { https } from 'firebase-functions/v2';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// B2 S3 client configuration using environment variables.
// These must be set in the function's runtime environment.
const s3Client = new S3Client({
    endpoint: process.env.B2_S3_ENDPOINT,
    // The region can be specific to your B2 bucket's location.
    region: process.env.B2_REGION || 'us-east-005',
    credentials: {
        accessKeyId: process.env.B2_KEY_ID || '',
        secretAccessKey: process.env.B2_APP_KEY || '',
    },
});

const BUCKET_NAME = process.env.B2_BUCKET || '';

export const createSignedUploadUrl = https.onCall(async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
        throw new https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // 2. Input Validation
    const { contentType } = request.data;
    if (!contentType || !/^image\/(jpeg|png|webp)$/.test(contentType)) {
        throw new https.HttpsError('invalid-argument', 'A valid image content type (jpeg, png, webp) must be provided.');
    }

    // 3. Generate a unique key for the new file
    const uid = request.auth.uid;
    const fileExtension = contentType.split('/')[1];
    const key = `users/${uid}/${uuidv4()}.${fileExtension}`;

    // 4. Create the S3 command and sign it
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    try {
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 }); // 60-second validity
        return { signedUrl, key };
    } catch (error) {
        console.error('Error creating signed URL:', error);
        throw new https.HttpsError('internal', 'Could not create a signed URL for upload.');
    }
});
