const { getPresignedUploadUrl } = require('../services/awsS3');
const logger = require('../utils/logger');

const getUploadUrl = async (req, res) => {
  const { fileName, type } = req.query;
  const userUid = req.user.uid;

  if (!fileName || !type) {
    return res.status(400).json({ message: 'fileName and type query parameters are required.' });
  }

  // Sanitize and create a unique key for the S3 object
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  const key = `uploads/${userUid}/${Date.now()}-${sanitizedFileName}`;

  try {
    const { url, key: objectKey } = await getPresignedUploadUrl(key, type);
    res.json({ url, key: objectKey });
  } catch (error) {
    req.log.error({ err: error }, `Error generating presigned URL for UID ${userUid}`);
    res.status(500).json({ message: 'Could not generate upload URL.' });
  }
};

module.exports = {
  getUploadUrl,
};
