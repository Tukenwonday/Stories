const UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload"
const MAX_BYTES = 5 * 1024 * 1024
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...CORS, "Content-Type": "application/json" },
  })
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405)
    }
    if (!env.IMAGEKIT_PRIVATE_KEY) {
      return json({ ok: false, error: "ImageKit is not configured" }, 500)
    }

    let form
    try {
      form = await request.formData()
    } catch {
      return json({ ok: false, error: "Expected multipart/form-data" }, 400)
    }

    const file = form.get("file")
    const itemId = String(form.get("itemId") || "misc")

    if (!(file instanceof File)) {
      return json({ ok: false, error: "Missing file" }, 400)
    }
    if (!file.type.startsWith("image/")) {
      return json({ ok: false, error: "File must be an image" }, 400)
    }
    if (file.size > MAX_BYTES) {
      return json({ ok: false, error: "Image must be under 5 MB" }, 400)
    }

    const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "misc"
    const ext = (file.type.split("/")[1] || "webp").replace(/[^a-z0-9]/gi, "")
    const fileName = `${safeId}-${Date.now()}.${ext}`

    const upstream = new FormData()
    upstream.append("file", file, fileName)
    upstream.append("fileName", fileName)
    upstream.append("folder", "menu")
    upstream.append("useUniqueFileName", "true")

    const basic = "Basic " + btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)

    try {
      const res = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: { Authorization: basic, Accept: "application/json" },
        body: upstream,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        return json({ ok: false, error: data?.message || "Upload failed" }, res.status)
      }
      return json({ ok: true, url: data.url })
    } catch {
      return json({ ok: false, error: "Upload failed" }, 502)
    }
  },
}
