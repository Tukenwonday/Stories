const CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable";

function addSvgSandboxHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  const contentType = newResponse.headers.get("Content-Type") ?? "";
  if (contentType.includes("image/svg+xml")) {
    newResponse.headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
    newResponse.headers.set("X-Content-Type-Options", "nosniff");
  }
  return newResponse;
}

export const onRequest: PagesFunction = async (context) => {
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Try edge cache first — serves from Cloudflare memory with zero worker execution
  const cache = caches.default;
  const cachedResponse = await cache.match(context.request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Cache miss: fetch from Supabase origin
  const url = new URL(context.request.url);
  const targetUrl = `https://doinkehdvtvqzcikwwos.supabase.co${url.pathname}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.set("Host", "doinkehdvtvqzcikwwos.supabase.co");

  const response = await fetch(targetUrl, {
    method,
    headers,
  });

  // Only cache successful responses
  if (response.status === 200) {
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Cache-Control", CACHE_CONTROL);
    // Strip revalidation headers — images are immutable content-addressed assets
    newResponse.headers.delete("ETag");
    newResponse.headers.delete("Last-Modified");
    newResponse.headers.delete("Set-Cookie");

    const cacheResponse = new Response(newResponse.body, newResponse);
    context.waitUntil(cache.put(context.request, cacheResponse));

    return addSvgSandboxHeaders(newResponse);
  }

  // Non-200 responses: return without caching
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Cache-Control", CACHE_CONTROL);
  return addSvgSandboxHeaders(newResponse);
};
