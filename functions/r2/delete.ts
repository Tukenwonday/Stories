export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { pin, path: key } = (await context.request.json()) as { pin: string; path: string }

    if (!pin || typeof pin !== "string" || !key || typeof key !== "string") {
      return new Response(JSON.stringify({ error: "pin and path are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const SUPABASE_URL = (context.env as { SUPABASE_URL?: string }).SUPABASE_URL
    const SUPABASE_ANON_KEY = (context.env as { SUPABASE_ANON_KEY?: string }).SUPABASE_ANON_KEY
    const R2_ACCOUNT_ID = (context.env as { R2_ACCOUNT_ID?: string }).R2_ACCOUNT_ID || ""
    const R2_ACCESS_KEY_ID = (context.env as { R2_ACCESS_KEY_ID?: string }).R2_ACCESS_KEY_ID || ""
    const R2_SECRET_ACCESS_KEY = (context.env as { R2_SECRET_ACCESS_KEY?: string }).R2_SECRET_ACCESS_KEY || ""
    const R2_BUCKET = (context.env as { R2_BUCKET_NAME?: string }).R2_BUCKET_NAME || "menu-images"

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_kitchen_pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_pin: pin.trim() }),
    })

    const verifyData = await verifyRes.json()
    if (!verifyRes.ok || !verifyData) {
      return new Response(JSON.stringify({ error: "Invalid PIN" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const objectKey = key.replace(/^\/+/, "")
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    const url = `${endpoint}/${R2_BUCKET}/${encodeURIComponent(objectKey)}`

    const credential = btoa(`${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}`)

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${credential}`,
      },
    })

    if (!response.ok && response.status !== 204) {
      const text = await response.text()
      return new Response(JSON.stringify({ error: `Delete failed: ${response.status} ${text}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
