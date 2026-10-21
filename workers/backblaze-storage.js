import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

function createClient(env) {
  const endpoint = env.B2_ENDPOINT;
  const bucket = env.B2_BUCKET_NAME;
  const accessKeyId = env.B2_APPLICATION_KEY_ID;
  const secretAccessKey = env.B2_APPLICATION_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Backblaze B2 storage configuration is incomplete");
  }
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || !/\.backblazeb2\.com$/i.test(parsed.hostname) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("B2_ENDPOINT must be an HTTPS Backblaze S3 endpoint");
  }
  const regionMatch = parsed.hostname.match(/^s3[.-]([a-z0-9-]+)\.backblazeb2\.com$/i);
  if (!regionMatch) throw new Error("B2_ENDPOINT must include a valid Backblaze region");
  return { client: new S3Client({
    region: regionMatch[1],
    endpoint: parsed.origin,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  }), bucket };
}

export function isB2Configured(env) {
  return Boolean(env.B2_ENDPOINT && env.B2_BUCKET_NAME && env.B2_APPLICATION_KEY_ID && env.B2_APPLICATION_KEY);
}

export async function putPrivateObject(env, key, body, contentType, ownerUid) {
  const { client, bucket } = createClient(env);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: { owneruid: ownerUid, purpose: "profile-photo" }
  }));
}

export async function getPrivateObject(env, key) {
  const { client, bucket } = createClient(env);
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deletePrivateObject(env, key) {
  const { client, bucket } = createClient(env);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
