import { signedR2Request } from "../_shared/r2-s3"

const CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable"
const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg", "image/png", "image/gif", "image/avif"])
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  webp: ["image/webp"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  avif: ["image/avif"],
}
const UPLOAD_WINDOW_MS = 10 * 60 * 1000
const MAX_UPLOADS_PER_WINDOW = 30
const uploadHits = new Map<string, { count: number; resetAt: number }>()

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function checkRateLimit(request: Request): boolean {
  const now = Date.now()
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
  const existing = uploadHits.get(ip)
  if (!existing || existing.resetAt <= now) {
    uploadHits.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS })
    return true
  }
  existing.count += 1
  return existing.count <= MAX_UPLOADS_PER_WINDOW
}

function isAllowedObjectKey(key: string): boolean {
  return /^dishes\/[a-zA-Z0-9_-]{1,80}-\d+\.(webp|jpe?g|png|gif|avif)$/.test(key)
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    if (!checkRateLimit(context.request)) {
      return json({ error: "Too many upload attempts. Please try again later." }, 429)
    }

    const env = context.env as Record<string, unknown>
    function envValue(...keys: string[]): string {
      for (const k of keys) {
        const v = env[k]
        if (typeof v === "string" && v.trim()) return v.trim()
      }
      return ""
    }
    const SUPABASE_URL = envValue("SUPABASE_URL", "VITE_SUPABASE_URL")
    const SUPABASE_ANON_KEY = envValue("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    const R2_ACCOUNT_ID = envValue("R2_ACCOUNT_ID", "VITE_R2_ACCOUNT_ID")
    const R2_ACCESS_KEY_ID = envValue("R2_ACCESS_KEY_ID", "VITE_R2_ACCESS_KEY_ID")
    const R2_SECRET_ACCESS_KEY = envValue("R2_SECRET_ACCESS_KEY", "VITE_R2_SECRET_ACCESS_KEY")
    const R2_BUCKET = envValue("R2_BUCKET_NAME", "VITE_R2_BUCKET_NAME") || "menu-images"
    const R2_PUBLIC_URL = envValue("R2_PUBLIC_URL", "VITE_R2_PUBLIC_URL")

    const missing: string[] = []
    if (!SUPABASE_URL) missing.push("SUPABASE_URL")
    if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY")
    if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID")
    if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID")
    if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY")
    if (missing.length > 0) {
      return json({ error: `Missing env vars: ${missing.join(", ")}` }, 500)
    }

    const formData = await context.request.formData()
    const pin = formData.get("pin")
    const path = formData.get("path")
    const file = formData.get("file")

    if (!pin || typeof pin !== "string") {
      return json({ error: "pin is required" }, 400)
    }

    if (!path || typeof path !== "string") {
      return json({ error: "path is required" }, 400)
    }

    if (!file || !(file instanceof File)) {
      return json({ error: "file is required or not a File" }, 400)
    }

    const objectKey = path.replace(/^\/+/, "")
    const contentType = file.type || "application/octet-stream"
    const extension = objectKey.split(".").pop()?.toLowerCase() || ""

    if (!isAllowedObjectKey(objectKey)) {
      return json({ error: "Invalid upload path" }, 400)
    }

    if (!ALLOWED_TYPES.has(contentType) || !ALLOWED_EXTENSIONS[extension]?.includes(contentType)) {
      return json({ error: "Unsupported image type" }, 400)
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
      return json({ error: "Invalid PIN" }, 401)
    }

    const arrayBuffer = await file.arrayBuffer()

    const response = await signedR2Request({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET,
    }, {
      method: "PUT",
      key: objectKey,
      body: arrayBuffer,
      contentType,
      cacheControl: CACHE_CONTROL,
    })

    const responseText = await response.text()

    if (!response.ok) {
      return json({ error: `R2 upload failed`, status: response.status, detail: responseText.slice(0, 500) }, 500)
    }

    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${objectKey}` : undefined
    return json({ ok: true, publicUrl, path: objectKey })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500)
  }
}
