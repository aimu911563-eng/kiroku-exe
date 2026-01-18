export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);

  const path = url.pathname.replace(/^\/api/, "") || "/";
  const apiUrl = `https://shiftflow-api.aimu911563.workers.dev${path}${url.search}`;

  const req = new Request(apiUrl, context.request);
  return fetch(req);
};
