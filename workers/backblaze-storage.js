function getObjectUrl(env, key) {
  const configured = String(env.CDN_HOSTNAME || env.CDN_HOSTURL || env.CDN_HOST_URL || env.CDN_HOST || "").trim();
  if (!configured) throw new Error("CDN_HOSTNAME is not configured");
  const base = new URL(/^https?:\/\//i.test(configured) ? configured : "https://" + configured);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("CDN_HOSTNAME must be an HTTPS proxy URL without credentials or query parameters");
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = prefix + "/" + encodeURIComponent(key);
  return base.toString();
}

export function isCdnConfigured(env) {
  return Boolean(String(env.CDN_HOSTNAME || env.CDN_HOSTURL || env.CDN_HOST_URL || env.CDN_HOST || "").trim());
}

async function proxyRequest(env, key, init) {
  const response = await fetch(getObjectUrl(env, key), init);
  if (!response.ok) {
    const error = new Error("CDN storage proxy returned HTTP " + response.status);
    error.statusCode = response.status;
    throw error;
  }
  return response;
}

export async function putPrivateObject(env, key, body, contentType, ownerUid, purpose = "profile-photo") {
  const headers = new Headers({ "content-type": contentType || "application/octet-stream" });
  // Metadata is informational only; authorization is enforced by the API Worker
  // before a write is sent to the private CDN storage proxy.
  if (ownerUid) headers.set("x-object-owner", ownerUid);
  if (purpose) headers.set("x-object-purpose", purpose);
  await proxyRequest(env, key, { method: "PUT", headers, body });
}

export async function getPrivateObject(env, key) {
  const response = await proxyRequest(env, key, { method: "GET" });
  return {
    ContentType: response.headers.get("content-type") || "application/octet-stream",
    ContentLength: response.headers.has("content-length") ? Number(response.headers.get("content-length")) : undefined,
    Body: response.body
  };
}

export async function deletePrivateObject(env, key) {
  await proxyRequest(env, key, { method: "DELETE" });
}
