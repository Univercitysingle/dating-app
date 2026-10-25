const HOP_BY_HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
function copyHeaders(source) { const headers = new Headers(); for (const [name, value] of source.entries()) { if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.set(name, value); } return headers; }

// The public profile endpoint is for dating-profile data only. Contact details
// belong to the owner settings or the dedicated superadmin user-management API.
function stripPrivateContactFields(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) stripPrivateContactFields(item);
    return value;
  }
  const privateFields = new Set([
    "email", "emailAddress", "email_address", "mobile", "mobileNumber", "mobile_number",
    "phone", "phoneNumber", "phone_number", "contactNumber", "contact_number",
    "telephone", "telephoneNumber", "whatsapp", "whatsApp", "whatsappNumber"
  ]);
  for (const key of Object.keys(value)) {
    if (privateFields.has(key)) delete value[key];
    else if (value[key] && typeof value[key] === "object") stripPrivateContactFields(value[key]);
  }
  return value;
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
