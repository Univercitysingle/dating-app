import { buildPushPayload } from "@block65/webcrypto-web-push";

export function isAllowedPushEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowedHost = host === "fcm.googleapis.com" || host === "web.push.apple.com" ||
      host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".notify.windows.com");
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowedHost;
  } catch { return false; }
}

export async function sendWebPush(subscription, data, env) {
  if (!isAllowedPushEndpoint(subscription?.endpoint)) return { ok: false, status: 400, permanent: true };
  if (!env?.VAPID_PUBLIC_KEY || !env?.VAPID_PRIVATE_KEY ||
      typeof env.VAPID_SUBJECT !== "string" || !env.VAPID_SUBJECT.startsWith("mailto:")) {
    return { ok: false, status: 503, permanent: false };
  }
  try {
    const payload = await buildPushPayload(
      { data, options: { ttl: 60, urgency: "high" } },
      subscription,
      { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
    );
    const response = await fetch(subscription.endpoint, payload);
    return { ok: response.ok, status: response.status, permanent: response.status === 404 || response.status === 410 };
  } catch (error) {
    return { ok: false, status: 502, permanent: false, error: String(error?.message || "Push delivery failed").slice(0, 160) };
  }
}
