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

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405)
    }
    if (!env.GITHUB_TOKEN) {
      return json({ ok: false, error: "GitHub is not configured" }, 500)
    }

    const repo = env.GITHUB_REPO || "Tukenwonday/Stories"
    const branch = env.GITHUB_BRANCH || "main"
    const dir = env.GITHUB_PHOTO_DIR || "public/photos"

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
    const path = `${dir}/${fileName}`
    const content = toBase64(await file.arrayBuffer())

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "menu-image-store",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Upload menu photo ${fileName}`,
          content,
          branch,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return json({ ok: false, error: data?.message || "Upload failed" }, res.status)
      }
      const url = env.SITE_URL ? `${env.SITE_URL}/photos/${fileName}` : `/photos/${fileName}`
      return json({ ok: true, url })
    } catch {
      return json({ ok: false, error: "Upload failed" }, 502)
    }
  },
}
