export const onRequest: PagesFunction = async (context) => {
  // Read-only proxy: only GET/HEAD are allowed. Uploads and deletes must go
  // through the PIN-gated RPCs so anonymous callers can't write to the bucket
  // through the Pages origin.
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(context.request.url);
  const targetUrl = `https://doinkehdvtvqzcikwwos.supabase.co${url.pathname}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.set("Host", "doinkehdvtvqzcikwwos.supabase.co");

  const response = await fetch(targetUrl, {
    method,
    headers,
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return newResponse;
};
