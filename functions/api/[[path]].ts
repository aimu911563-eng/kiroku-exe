export async function onRequest(context: any) {
  const { request, params } = context;
  const path = (params.path || []).join("/");

  const upstream = `https://kiroku-exe.onrender.com/api/${path}`;

  // デバッグ用（必要なら）
  // console.log("proxy:", request.method, path, "->", upstream);

  return fetch(upstream, request);
}