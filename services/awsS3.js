const AWS = require("aws-sdk");

// Updated S3 configuration for Backblaze compatibility
const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT, // e.g., 's3.us-west-004.backblazeb2.com'
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  region: process.env.S3_REGION, // e.g., 'us-west-004'
  s3ForcePathStyle: true, // Required for Backblaze
});

const uploadToS3 = (buffer, filename, mimetype) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: filename,
    Body: buffer,
    ContentType: mimetype,
    ACL: "public-read",
  };
  return s3.upload(params).promise();
};

const getPresignedUploadUrl = (key, contentType) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Expires: 60 * 5, // 5 minutes
    ACL: 'public-read',
  };

  return new Promise((resolve, reject) => {
    s3.getSignedUrl('putObject', params, (err, url) => {
      if (err) {
        return reject(err);
      }
      resolve({ url, key });
    });
  });
};

module.exports = { uploadToS3, getPresignedUploadUrl };
