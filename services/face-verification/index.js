import { Container } from "@cloudflare/containers";

export class FaceApiContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  envVars = { NODE_ENV: "production", PORT: "8080" };
}

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "face-verification-worker", engine: "@vladmandic/face-api", automation: "advisory_only" });
    }
    if (url.pathname !== "/internal/assess" || request.method !== "POST") return json({ error: "Not found" }, 404);
    if (!env.FACE_ENGINE) return json({ error: "Face inference container is not configured." }, 503);
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload.videoBase64 !== "string" ||
        !Array.isArray(payload.profilePhotoUrls) || payload.profilePhotoUrls.length < 1 ||
        payload.profilePhotoUrls.length > 6) return json({ error: "Invalid face assessment request." }, 400);
    if (payload.videoBase64.length > 4_200_000) return json({ error: "Video exceeds the allowed size." }, 413);

    const allowedOrigin = String(env.ALLOWED_PHOTO_ORIGIN || "");
    let expectedOrigin;
    try {
      const normalizedOrigin = allowedOrigin.startsWith("https://") || allowedOrigin.startsWith("http://") ? allowedOrigin : "https://" + allowedOrigin;
      expectedOrigin = new URL(normalizedOrigin).origin;
    } catch { return json({ error: "Photo origin is not configured." }, 503); }
    const profilePhotos = [];
    for (const rawUrl of payload.profilePhotoUrls) {
      try {
        const photoUrl = new URL(rawUrl);
        if (photoUrl.protocol !== "https:" || photoUrl.origin !== expectedOrigin || photoUrl.username || photoUrl.password) continue;
        const response = await fetch(photoUrl, { redirect: "manual", headers: { accept: "image/*" } });
        if (!response.ok || response.status >= 300 || !String(response.headers.get("content-type") || "").startsWith("image/")) continue;
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 1_000_000) continue;
        let binary = "";
        const view = new Uint8Array(bytes);
        for (let offset = 0; offset < view.length; offset += 0x8000) binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
        profilePhotos.push(btoa(binary));
      } catch { /* Ignore unavailable profile images, never follow redirects. */ }
    }
    if (!profilePhotos.length) return json({ error: "No profile photos could be safely retrieved for comparison." }, 422);

    const container = env.FACE_ENGINE.getByName("face-api-engine");
    try {
      const result = await container.fetch("http://container/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoBase64: payload.videoBase64,
          mimeType: payload.mimeType,
          challenge: payload.challenge,
          profilePhotos
        })
      });
      const body = await result.json().catch(() => ({ error: "Face inference returned an invalid response." }));
      return json(body, result.status);
    } catch {
      return json({ error: "Face inference service is temporarily unavailable." }, 503);
    }
  }
};
