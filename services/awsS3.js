const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});

const uploadToS3 = (buffer, filename, mimetype) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: filename,
    Body: buffer,
    ContentType: mimetype,
    ACL: "public-read",
  };
  return s3.upload(params).promise();
};

module.exports = { uploadToS3 };
