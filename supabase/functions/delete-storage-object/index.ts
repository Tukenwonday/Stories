import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The service role key is injected automatically by Supabase's Edge Runtime.
// It never reaches the browser — the app only ever talks to this function.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  let pin: unknown;
  let path: unknown;
  try {
    const body = await req.json();
    pin = body.pin;
    path = body.path;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof pin !== "string" || typeof path !== "string" || !path.trim()) {
    return json({ error: "pin and path are required" }, 400);
  }

  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "kitchen_pin")
    .single();
  if (error || !data || data.value !== pin) {
    return json({ error: "Invalid PIN" }, 401);
  }

  const marker = "/menu-images/";
  const idx = path.indexOf(marker);
  const objectPath = (idx !== -1 ? path.slice(idx + marker.length) : path).replace(/^\/+/, "");

  const { error: rmError } = await supabase.storage
    .from("menu-images")
    .remove([objectPath]);
  if (rmError) {
    return json({ error: rmError.message }, 500);
  }

  return json({ ok: true });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
