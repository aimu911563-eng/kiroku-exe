// Browser requests stay on /api; only this proxy knows the production API host.
// API_ORIGIN is a Pages server-side variable, not a VITE_* browser variable.
export async function onRequest(context: {
  request: Request;
  env?: { API_ORIGIN?: string };
}) {
  const incoming = new URL(context.request.url);
  let origin: URL;
  try {
    origin = new URL(context.env?.API_ORIGIN || "https://kiroku-exe.onrender.com");
  } catch {
    return new Response("Invalid API_ORIGIN", { status: 503 });
  }
  if (!["https:", "http:"].includes(origin.protocol) || origin.origin === incoming.origin) {
    return new Response("Invalid API_ORIGIN", { status: 503 });
  }
  const upstream = new URL(incoming.pathname + incoming.search, origin.origin);
  return fetch(new Request(upstream, context.request));
}
