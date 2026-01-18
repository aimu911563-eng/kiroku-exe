export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);

  // /api を消さず、そのまま Worker に投げる
  const apiUrl = `https://shiftflow-api.aimu911563.workers.dev${url.pathname}${url.search}`;

  const req = new Request(apiUrl, context.request);
  return fetch(req);
};

