export async function onRequest(context: any) {
  const url = new URL(context.request.url);

  // /api 以降のパスにして Workers へ転送
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const apiUrl = `https://shiftflow-api.aimu911563.workers.dev${path}${url.search}`;

  const req = new Request(apiUrl, context.request);
  return fetch(req);
}
