const HOP_BY_HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
function copyHeaders(source) { const headers = new Headers(); for (const [name, value] of source.entries()) { if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.set(name, value); } return headers; }
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
  try { const response = await fetch(upstream); const responseHeaders = copyHeaders(response.headers); responseHeaders.set("cache-control", "no-store"); return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders }); }
  catch { return Response.json({ error: "API service is temporarily unavailable" }, { status: 502, headers: { "cache-control": "no-store" } }); }
}
