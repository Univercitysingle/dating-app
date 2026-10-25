const HOP_BY_HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
function copyHeaders(source) { const headers = new Headers(); for (const [name, value] of source.entries()) { if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.set(name, value); } return headers; }

// The public profile endpoint is for dating-profile data only. Contact details
// belong to the owner settings or the dedicated superadmin user-management API.
function stripPrivateContactFields(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return profile;
  const sanitized = { ...profile };
  for (const key of ["email", "emailAddress", "mobileNumber", "mobile_number", "mobile", "phoneNumber", "phone_number", "phone", "contactNumber", "contact_number"]) {
    delete sanitized[key];
  }
  for (const key of ["contact", "contactDetails"]) {
    if (sanitized[key] && typeof sanitized[key] === "object" && !Array.isArray(sanitized[key])) {
      const nested = { ...sanitized[key] };
      for (const field of ["email", "emailAddress", "mobile", "mobileNumber", "mobile_number", "phone", "phoneNumber", "phone_number", "contactNumber", "contact_number"]) {
        delete nested[field];
      }
      if (Object.keys(nested).length) sanitized[key] = nested;
      else delete sanitized[key];
    }
  }
  return sanitized;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.API_ORIGIN) return Response.json({ error: "API proxy is not configured" }, { status: 503, headers: { "cache-control": "no-store" } });
  let origin;
  try { origin = new URL(env.API_ORIGIN); } catch { return Response.json({ error: "API proxy configuration is invalid" }, { status: 503, headers: { "cache-control": "no-store" } }); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) return Response.json({ error: "API proxy must use a valid HTTPS origin" }, { status: 503, headers: { "cache-control": "no-store" } });
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin.origin);
  const headers = copyHeaders(request.headers);
  headers.delete("host"); headers.delete("cf-connecting-ip"); headers.delete("x-forwarded-for");
  const upstream = new Request(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual" });
  try {
    const response = await fetch(upstream);
    const responseHeaders = copyHeaders(response.headers);
    responseHeaders.set("cache-control", "no-store");

    // Fail closed at the Pages edge too, in case a legacy or alternate profile
    // serializer reintroduces contact fields. /me and /admin routes are excluded.
    const publicProfilePath = /^\/api\/users\/([^/]+)$/.test(incoming.pathname) &&
      !["me", "discover", "likes"].includes(incoming.pathname.split("/").pop());
    const contentType = response.headers.get("content-type") || "";
    if (publicProfilePath && response.ok && contentType.includes("application/json")) {
      const payload = await response.json();
      const sanitized = stripPrivateContactFields(payload);
      return Response.json(sanitized, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ error: "API service is temporarily unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
