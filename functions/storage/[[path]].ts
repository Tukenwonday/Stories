export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = `https://doinkehdvtvqzcikwwos.supabase.co${url.pathname}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.set("Host", "doinkehdvtvqzcikwwos.supabase.co");

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers,
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return newResponse;
};
