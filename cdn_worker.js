// Cloudflare Worker: authenticated image upload / public retrieval proxy for Backblaze B2 (S3 API)

//

// Required secrets:   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, JWT_SECRET

// Required vars:      AWS_REGION, AWS_S3_BUCKET_NAME, AWS_S3_ENDPOINT

// Optional vars:      ALLOWED_ORIGINS (comma separated)

// Optional binding:   UPLOAD_LIMITER (Workers Rate Limiting binding, used on PUT)



const ALLOWED_METHODS = ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"];



const DEFAULT_ALLOWED_ORIGINS = [

  "https\://dating-app-staging.pages.dev",

  "https\://dating-app-api-staging.enadoctemp.workers.dev",

];



const MAX_OBJECT_KEY_LENGTH = 1024;

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB



const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const EXT = "(?:jpg|jpeg|png|gif|webp)";



const PHOTO_KEY_PATTERN =

  /^photos-[A-Za-z0-9\_-]{1,128}-(?:[0-9a-f-]{36}|[0-9]{10,16})\.(?:jpg|jpeg|png|gif|webp)$/i;



const SUPPORT_KEY_PATTERN =

  /^support-[a-f0-9]{24}-[0-9]{10,16}-[0-9a-f-]{36}\.(?:jpg|jpeg|png|gif|webp|pdf)$/i;



// After the "photos-\<userId>-" prefix, the remainder must be exactly a UUID or timestamp + extension.

// This prevents user "abc" from touching keys that belong to user "abc-def".

const PHOTO_SUFFIX_PATTERN = new RegExp(`^(?:${UUID}|[0-9]{10,16})\\\.${EXT}$`, "i");



const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];



export default {

  async fetch(request, env) {

    try {

      const url = new URL(request.url);

      const method = request.method.toUpperCase();



      const allowedOrigins = getAllowedOrigins(env);

      const origin = request.headers.get("Origin") || "";

      const corsHeaders = buildCorsHeaders(origin, allowedOrigins);



      if (!ALLOWED_METHODS.includes(method)) {

        return text("Method Not Allowed", 405, {

          ...Object.fromEntries(corsHeaders),

          Allow: ALLOWED_METHODS.join(", "),

        });

      }



      // Browser preflight

      if (method === "OPTIONS") {

        if (origin && !allowedOrigins.includes(origin)) {

          return text("Origin not allowed", 403);

        }

        return new Response(null, { status: 204, headers: corsHeaders });

      }



      if (origin && !allowedOrigins.includes(origin)) {

        return text("Origin not allowed", 403);

      }



      // Storage configuration

      for (const name of [

        "AWS_ACCESS_KEY_ID",

        "AWS_SECRET_ACCESS_KEY",

        "AWS_REGION",

        "AWS_S3_BUCKET_NAME",

        "AWS_S3_ENDPOINT",

      ]) {

        if (!env[name]) {

          console.error(`Missing configuration: ${name}`);

          return text("Storage service is not configured", 500, corsHeaders);

        }

      }



      // Object key (single path segment)

      let key;

      try {

        key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

      } catch {

        return text("Invalid object key", 400, corsHeaders);

      }



      if (!isSafeObjectKey(key)) {

        return text("Invalid object key", 400, corsHeaders);

      }



      const isWrite = method === "PUT" || method === "DELETE";

      let user = null;



      if (isWrite) {

        if (!isSupportedWritableKey(key)) {

          return text("Unsupported object key", 400, corsHeaders);

        }



        // ---- Authentication ----

        if (!env.JWT_SECRET) {

          console.error("Missing configuration: JWT_SECRET");

          return text("Storage service is not configured", 500, corsHeaders);

        }



        const token = (request.headers.get("Authorization") || "")

          .replace(/^Bearer\s+/i, "")

          .trim();



        user = await verifyJwt(token, env.JWT_SECRET, { key, method });



        if (!user) {

          return text("Unauthorized", 401, {

            ...Object.fromEntries(corsHeaders),

            "WWW-Authenticate": "Bearer",

          });

        }



        // ---- Authorization: users can only touch their own photos ----

        if (key.startsWith("photos-") && !userOwnsPhotoKey(key, user.id)) {

          return text("Forbidden", 403, corsHeaders);

        }

      }



      let body = new ArrayBuffer(0);

      const upstreamHeaders = new Headers();



      if (method === "PUT") {

        // Optional rate limiting (configure a "ratelimits" binding named UPLOAD_LIMITER)

        if (env.UPLOAD_LIMITER) {

          const { success } = await env.UPLOAD_LIMITER.limit({ key: user.id });

          if (!success) {

            return text("Too many uploads, slow down", 429, {

              ...Object.fromEntries(corsHeaders),

              "Retry-After": "60",

            });

          }

        }



        // Cheap early rejection when the header is present

        const declared = Number(request.headers.get("Content-Length") || 0);

        if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {

          return text("File exceeds the 15 MB limit", 413, corsHeaders);

        }



        const contentType = (request.headers.get("Content-Type") || "")

          .split(";")[0]

          .trim()

          .toLowerCase();



        const allowedTypes = key.startsWith("support-")

          ? [...IMAGE_TYPES, "application/pdf"]

          : IMAGE_TYPES;



        if (!allowedTypes.includes(contentType)) {

          return text("Unsupported content type", 415, corsHeaders);

        }



        // Extension must agree with declared type

        if (!extensionMatchesType(key, contentType)) {

          return text("File extension does not match content type", 415, corsHeaders);

        }



        // Read and verify the real size (Content-Length can be absent or wrong)

        body = await request.arrayBuffer();



        if (body.byteLength === 0) {

          return text("Empty file", 400, corsHeaders);

        }

        if (body.byteLength > MAX_UPLOAD_BYTES) {

          return text("File exceeds the 15 MB limit", 413, corsHeaders);

        }



        // Verify actual file signature

        if (!matchesMagicBytes(new Uint8Array(body), contentType)) {

          return text("File content does not match its type", 415, corsHeaders);

        }



        upstreamHeaders.set("Content-Type", contentType);



        upstreamHeaders.set(

          "Cache-Control",

          request.headers.get("Cache-Control") ||

            "public, max-age=31536000, immutable"

        );

      }



      // Forward conditional / range headers for retrieval

      if (method === "GET" || method === "HEAD") {

        for (const name of ["Range", "If-None-Match", "If-Modified-Since"]) {

          const value = request.headers.get(name);

          if (value) upstreamHeaders.set(name, value);

        }

      }



      const endpoint = normalizeEndpoint(env.AWS_S3_ENDPOINT);

      const objectUrl = buildObjectUrl(endpoint, env.AWS_S3_BUCKET_NAME, key);



      const signed = await signRequest({

        method,

        url: objectUrl,

        headers: upstreamHeaders,

        payload: body,

        accessKey: env.AWS_ACCESS_KEY_ID,

        secretKey: env.AWS_SECRET_ACCESS_KEY,

        region: env.AWS_REGION,

      });



      const fetchInit = {

        method,

        headers: signed.headers,

        body: method === "PUT" ? signed.body : undefined,

      };



      // Cache reads at Cloudflare's edge to reduce B2 calls and egress

      if (method === "GET" || method === "HEAD") {

        fetchInit.cf = {

          cacheEverything: true,

          cacheTtlByStatus: { "200-299": 3600, "404": 0, "400-599": 0 },

        };

      }



      const upstreamResponse = await fetch(signed.url, fetchInit);



      if (!upstreamResponse.ok && upstreamResponse.status !== 304) {

        console.error("Backblaze request failed", {

          method,

          key,

          status: upstreamResponse.status,

        });

      }



      // Successful upload: return JSON so the client knows the final URL

      if (method === "PUT" && upstreamResponse.ok) {

        return json(

          { key, url: `${url.origin}/${encodeURIComponent(key)}` },

          201,

          corsHeaders

        );

      }



      // Don't leak B2's raw error bodies (they can include bucket/request details)

      if (isWrite && !upstreamResponse.ok) {

        return text(

          upstreamResponse.status === 404 ? "Not found" : "Storage request failed",

          upstreamResponse.status === 404 ? 404 : 502,

          corsHeaders

        );

      }



      // Build response headers

      const responseHeaders = new Headers(corsHeaders);



      for (const name of [

        "Content-Type",

        "Content-Length",

        "Content-Range",

        "Accept-Ranges",

        "ETag",

        "Last-Modified",

      ]) {

        const value = upstreamResponse.headers.get(name);

        if (value) responseHeaders.set(name, value);

      }



      responseHeaders.set("X-Content-Type-Options", "nosniff");

      responseHeaders.set(

        "Content-Security-Policy",

        "default-src 'none'; sandbox"

      );

      // Allow \<img> from the app's other origins

      responseHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");



      if (method === "GET" || method === "HEAD") {

        if (upstreamResponse.ok || upstreamResponse.status === 304) {

          responseHeaders.set(

            "Cache-Control",

            isSupportedWritableKey(key)

              ? "public, max-age=31536000, immutable" // unique keys never change

              : "public, max-age=3600"

          );

        } else {

          responseHeaders.set("Cache-Control", "no-store");

        }

      }



      return new Response(

        method === "HEAD" || upstreamResponse.status === 204 || upstreamResponse.status === 304

          ? null

          : upstreamResponse.body,

        {

          status: upstreamResponse.status,

          statusText: upstreamResponse.statusText,

          headers: responseHeaders,

        }

      );

    } catch (error) {

      console.error("CDN Worker error:", error);



      return new Response("Storage proxy request failed", {

        status: 500,

        headers: {

          "Content-Type": "text/plain; charset=utf-8",

          "Cache-Control": "no-store",

        },

      });

    }

  },

};



/* -------------------------------------------------------------------------- */

/* Response helpers                                                           */

/* -------------------------------------------------------------------------- */



function text(message, status, headers = {}) {

  const h = new Headers(headers);

  h.set("Content-Type", "text/plain; charset=utf-8");

  h.set("Cache-Control", "no-store");

  return new Response(message, { status, headers: h });

}



function json(data, status, headers = {}) {

  const h = new Headers(headers);

  h.set("Content-Type", "application/json; charset=utf-8");

  h.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(data), { status, headers: h });

}



/* -------------------------------------------------------------------------- */

/* CORS                                                                       */

/* -------------------------------------------------------------------------- */



function getAllowedOrigins(env) {

  const configured = env.ALLOWED_ORIGINS;



  if (!configured) return DEFAULT_ALLOWED_ORIGINS;



  return configured

    .split(",")

    .map((value) => value.trim())

    .filter(Boolean);

}



function buildCorsHeaders(origin, allowedOrigins) {

  const headers = new Headers({

    "Access-Control-Allow-Methods": ALLOWED_METHODS.join(", "),

    "Access-Control-Allow-Headers":

      "Content-Type, Authorization, Cache-Control, Range, If-None-Match, If-Modified-Since",

    "Access-Control-Expose-Headers":

      "ETag, Content-Length, Content-Type, Content-Range, Accept-Ranges, Last-Modified",

    "Access-Control-Max-Age": "86400",

    Vary: "Origin",

  });



  if (origin && allowedOrigins.includes(origin)) {

    headers.set("Access-Control-Allow-Origin", origin);

  }



  return headers;

}



/* -------------------------------------------------------------------------- */

/* Key validation                                                             */

/* -------------------------------------------------------------------------- */



function isSafeObjectKey(key) {

  if (typeof key !== "string" || !key || key.length > MAX_OBJECT_KEY_LENGTH) {

    return false;

  }



  if (

    key === "." ||

    key === ".." ||

    key.includes("/") ||

    key.includes("\\") ||

    /[\u0000-\u001F\u007F]/.test(key)

  ) {

    return false;

  }



  return true;

}



function isSupportedWritableKey(key) {

  return PHOTO_KEY_PATTERN.test(key) || SUPPORT_KEY_PATTERN.test(key);

}



function userOwnsPhotoKey(key, userId) {

  if (!userId || !/^[A-Za-z0-9\_-]{1,128}$/.test(userId)) return false;



  const prefix = `photos-${userId}-`;

  if (!key.startsWith(prefix)) return false;



  return PHOTO_SUFFIX_PATTERN.test(key.slice(prefix.length));

}



function extensionMatchesType(key, contentType) {

  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();



  const map = {

    "image/jpeg": ["jpg", "jpeg"],

    "image/png": ["png"],

    "image/gif": ["gif"],

    "image/webp": ["webp"],

    "application/pdf": ["pdf"],

  };



  return (map[contentType] || []).includes(ext);

}



function matchesMagicBytes(b, contentType) {

  const startsWith = (...sig) => sig.every((v, i) => b[i] === v);



  switch (contentType) {

    case "image/jpeg":

      return startsWith(0xff, 0xd8, 0xff);

    case "image/png":

      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

    case "image/gif":

      return startsWith(0x47, 0x49, 0x46, 0x38);

    case "image/webp":

      return (

        startsWith(0x52, 0x49, 0x46, 0x46) &&

        b[8] === 0x57 &&

        b[9] === 0x45 &&

        b[10] === 0x42 &&

        b[11] === 0x50

      );

    case "application/pdf":

      return startsWith(0x25, 0x50, 0x44, 0x46);

    default:

      return false;

  }

}



/* -------------------------------------------------------------------------- */

/* JWT (HS256) verification                                                   */

/* -------------------------------------------------------------------------- */



function base64UrlToBytes(value) {

  const padded = value

    .replace(/-/g, "+")

    .replace(/\_/g, "/")

    .padEnd(Math.ceil(value.length / 4) * 4, "=");



  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);



  for (let i = 0; i < binary.length; i++) {

    bytes[i] = binary.charCodeAt(i);

  }



  return bytes;

}



// Returns { id, claims } or null.

// The user id is read from "sub" (falls back to "userId" / "id").

export async function verifyJwt(token, secret, expected = {}) {

  try {

    if (!token) return null;



    const parts = token.split(".");

    if (parts.length !== 3) return null;



    const [headerB64, payloadB64, signatureB64] = parts;



    const header = JSON.parse(

      new TextDecoder().decode(base64UrlToBytes(headerB64))

    );



    if (header.alg !== "HS256") return null;



    const cryptoKey = await crypto.subtle.importKey(

      "raw",

      new TextEncoder().encode(secret),

      { name: "HMAC", hash: "SHA-256" },

      false,

      ["verify"]

    );



    const valid = await crypto.subtle.verify(

      "HMAC",

      cryptoKey,

      base64UrlToBytes(signatureB64),

      new TextEncoder().encode(`${headerB64}.${payloadB64}`)

    );



    if (!valid) return null;



    const claims = JSON.parse(

      new TextDecoder().decode(base64UrlToBytes(payloadB64))

    );



    const now = Math.floor(Date.now() / 1000);

    // A valid signature alone is not sufficient. Bind each token to the
    // issuing API, this CDN, the exact object key, and the exact HTTP method.
    if (claims.iss !== "dating-app-api" || claims.aud !== "dateme-cdn") return null;
    if (typeof expected.key !== "string" || claims.key !== expected.key) return null;
    if (typeof expected.method !== "string" || claims.method !== expected.method) return null;
    if (typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)) return null;
    if (!Number.isInteger(claims.exp) || claims.exp <= now) return null;
    if (!Number.isInteger(claims.nbf) || claims.nbf > now) return null;
    if (!Number.isInteger(claims.iat) || claims.iat > now + 5) return null;

    return { id: claims.sub, claims };

  } catch {

    return null;

  }

}
