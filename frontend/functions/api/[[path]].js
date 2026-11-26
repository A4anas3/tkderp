export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const backendPath = url.pathname === "/api/health" ? "/health" : url.pathname;
  const target = "https://nalanda-api.ssbmentorai.in" + backendPath + url.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  return fetch(target, init);
}
