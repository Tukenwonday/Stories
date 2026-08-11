const CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable";

function addSvgSandboxHeaders(headers: Headers) {
  const contentType = headers.get("Content-Type") ?? "";
  if (contentType.includes("image/svg+xml")) {
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
  }
}

export const onRequest: PagesFunction = async (context) => {
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1. Try edge cache lookup first (0 worker cost on HIT)
  const cache = caches.default;
  const cachedResponse = await cache.match(context.request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 2. Cache miss: fetch from Supabase origin
  const url = new URL(context.request.url);
  const targetUrl = `https://doinkehdvtvqzcikwwos.supabase.co${url.pathname}${url.search}`;

  const response = await fetch(targetUrl, {
    method,
    headers: context.request.headers,
  });

  // Pass non-200 responses directly without caching
  if (response.status !== 200) {
    return response;
  }

  // 3. Prepare headers on successful response
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.delete("Set-Cookie");
  addSvgSandboxHeaders(headers);

  // 4. Create new response and clone stream safely
  const responseToReturn = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  // Store clone in Edge Memory without locking the returned stream
  context.waitUntil(cache.put(context.request, responseToReturn.clone()));

  return responseToReturn;
};
