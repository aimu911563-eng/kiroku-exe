export async function onRequest(context: any) {
  const { request, params } = context;
  const path = (params.path || []).join("/");

  const upstream = `https://kiroku-exe.onrender.com/api/${path}`;

  return fetch(upstream, request);
}