export async function onRequest(context: any) {
  const url = new URL(context.request.url);

  const upstream = "https://shiftflow-api.aimu911563.workers.dev";
  const target = upstream + url.pathname + url.search;

  return fetch(new Request(target, context.request));
}

