const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3ClientConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// The user can override the endpoint for B2 or other S3-compatible services.
if (process.env.AWS_S3_ENDPOINT) {
  s3ClientConfig.endpoint = process.env.AWS_S3_ENDPOINT;
}

const s3 = new S3Client(s3ClientConfig);
const BUCKET = process.env.AWS_S3_BUCKET_NAME;

async function uploadFile(key, body, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  try {
    await s3.send(command);
    return key;
  } catch (err) {
      console.error("S3/B2 upload failed:", err);
      throw err;
  }
}

async function getSignedDownloadUrl(key, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

async function deleteFile(key) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  try {
    await s3.send(command);
  } catch (err) {
    console.error("S3/B2 delete failed:", err);
    throw err;
  }
}

module.exports = {
  uploadFile,
  getSignedDownloadUrl,
  deleteFile,
};