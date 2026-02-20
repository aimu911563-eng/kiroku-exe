export async function onRequest(context: any) {
  const { request, params } = context;

  const path = (params.path || []).join("/");

  // 元リクエストのクエリを拾う
  const incomingUrl = new URL(request.url);

  // upstream にクエリ付きで投げる
  const upstreamUrl = new URL(`https://kiroku-exe.onrender.com/api/${path}`);
  upstreamUrl.search = incomingUrl.search;

  // request をベースにして URL だけ差し替える（POSTボディ等も維持）
  const proxiedRequest = new Request(upstreamUrl.toString(), request);

  return fetch(proxiedRequest);
}