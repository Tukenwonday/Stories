import { formatMenuPayload, type CategoryRow, type MenuRow } from "../_shared/menu-json"
import { signedR2Request } from "../_shared/r2-s3"

const MENU_CACHE_CONTROL = "public, max-age=10, must-revalidate"
const MENU_COLUMNS = "id,category,title_en,title_ar,description_en,description_ar,price,image,tag_en,tag_ar,modifiers,not_served_windows,is_available,unavailable_dates"
const CATEGORY_COLUMNS = "id,label_en,label_ar"
const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: RESPONSE_HEADERS,
  })
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text.slice(0, 500) || `Request failed: ${response.status}`)
  }
  return JSON.parse(text) as T
}

function envValue(env: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = env[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: RESPONSE_HEADERS,
  })
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = (await context.request.json().catch(() => null)) as { pin?: unknown } | null
    const pin = typeof body?.pin === "string" ? body.pin.trim() : ""
    if (!pin) return json({ error: "pin is required" }, 400)

    const env = context.env as Record<string, unknown>
    const SUPABASE_URL = envValue(env, "SUPABASE_URL", "VITE_SUPABASE_URL")
    const SUPABASE_ANON_KEY = envValue(env, "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    const SUPABASE_SERVICE_ROLE_KEY = envValue(env, "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY")
    const R2_ACCOUNT_ID = envValue(env, "R2_ACCOUNT_ID", "VITE_R2_ACCOUNT_ID")
    const R2_ACCESS_KEY_ID = envValue(env, "R2_ACCESS_KEY_ID", "VITE_R2_ACCESS_KEY_ID")
    const R2_SECRET_ACCESS_KEY = envValue(env, "R2_SECRET_ACCESS_KEY", "VITE_R2_SECRET_ACCESS_KEY")
    const R2_BUCKET = envValue(env, "R2_BUCKET_NAME", "VITE_R2_BUCKET_NAME") || "menu-images"
    const R2_PUBLIC_URL = envValue(env, "R2_PUBLIC_URL", "VITE_R2_PUBLIC_URL")

    const missing: string[] = []
    if (!SUPABASE_URL) missing.push("SUPABASE_URL")
    if (!SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY")
    if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID")
    if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID")
    if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY")
    if (!R2_PUBLIC_URL) missing.push("R2_PUBLIC_URL")
    if (missing.length > 0) return json({ error: `Missing env vars: ${missing.join(", ")}` }, 500)

    const verifyKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY
    const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_kitchen_pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: verifyKey,
        Authorization: `Bearer ${verifyKey}`,
      },
      body: JSON.stringify({ p_pin: pin }),
    })

    const verified = await readJson<boolean>(verifyRes)
    if (!verified) return json({ error: "Invalid PIN" }, 401)

    const readKey = SUPABASE_SERVICE_ROLE_KEY || verifyKey
    const supabaseHeaders = {
      apikey: readKey,
      Authorization: `Bearer ${readKey}`,
    }

    const [categories, menuRows] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/categories?select=${CATEGORY_COLUMNS}&order=sort_order.asc`, {
        headers: supabaseHeaders,
      }).then((response) => readJson<CategoryRow[]>(response)),
      fetch(`${SUPABASE_URL}/rest/v1/menu?select=${MENU_COLUMNS}`, {
        headers: supabaseHeaders,
      }).then((response) => readJson<MenuRow[]>(response)),
    ])

    const payload = formatMenuPayload(categories, menuRows, R2_PUBLIC_URL)
    const bodyBytes = new TextEncoder().encode(JSON.stringify(payload))
    const uploadRes = await signedR2Request({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET,
    }, {
      method: "PUT",
      key: "menu.json",
      body: bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength),
      contentType: "application/json",
      cacheControl: MENU_CACHE_CONTROL,
    })

    if (!uploadRes.ok) {
      const detail = await uploadRes.text()
      return json({ error: "R2 menu export failed", status: uploadRes.status, detail: detail.slice(0, 500) }, 500)
    }

    return json({
      ok: true,
      publicUrl: `${R2_PUBLIC_URL.replace(/\/+$/, "")}/menu.json`,
      categories: payload.categories.length,
      items: payload.menu.length,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500)
  }
}
