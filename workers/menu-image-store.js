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

async function ghFetch(env, path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "menu-image-store",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => null)
  return { res, data }
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
    const content = toBase64(await file.arrayBuffer())

    const rawOld = String(form.get("oldImage") || "")
    const match = rawOld.match(/\/photos\/([^/?#]+)$/)
    const oldName = match && match[1] ? match[1].replace(/[^a-zA-Z0-9._-]/g, "") : null
    const deleteOld = oldName && oldName !== fileName

    try {
      let oldExists = false
      if (deleteOld) {
        const check = await ghFetch(env, `contents/${dir}/${oldName}?ref=${branch}`)
        oldExists = check.res.ok
      }

      if (!oldExists) {
        const up = await ghFetch(env, `contents/${dir}/${fileName}`, {
          method: "PUT",
          body: JSON.stringify({ message: `Upload menu photo ${fileName}`, content, branch }),
        })
        if (!up.res.ok) {
          return json({ ok: false, error: up.data?.message || "Upload failed" }, up.res.status)
        }
      } else {
        const br = await ghFetch(env, `branches/${branch}`)
        if (!br.res.ok) {
          return json({ ok: false, error: "Could not read branch" }, br.res.status)
        }
        const headSha = br.data.commit.sha

        const blob = await ghFetch(env, "git/blobs", {
          method: "POST",
          body: JSON.stringify({ content, encoding: "base64" }),
        })
        if (!blob.res.ok) {
          return json({ ok: false, error: blob.data?.message || "Upload failed" }, blob.res.status)
        }
        const blobSha = blob.data.sha

        const head = await ghFetch(env, `git/commits/${headSha}`)
        if (!head.res.ok) {
          return json({ ok: false, error: "Could not read commit" }, head.res.status)
        }

        const tree = await ghFetch(env, "git/trees", {
          method: "POST",
          body: JSON.stringify({
            base_tree: head.data.tree.sha,
            tree: [
              { path: `${dir}/${fileName}`, mode: "100644", type: "blob", sha: blobSha },
              { path: `${dir}/${oldName}`, mode: "100644", type: "blob", sha: null },
            ],
          }),
        })
        if (!tree.res.ok) {
          return json({ ok: false, error: tree.data?.message || "Upload failed" }, tree.res.status)
        }

        const commit = await ghFetch(env, "git/commits", {
          method: "POST",
          body: JSON.stringify({
            message: `Replace menu photo ${fileName}`,
            tree: tree.data.sha,
            parents: [headSha],
          }),
        })
        if (!commit.res.ok) {
          return json({ ok: false, error: commit.data?.message || "Upload failed" }, commit.res.status)
        }

        const ref = await ghFetch(env, `git/refs/heads/${branch}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.data.sha }),
        })
        if (!ref.res.ok) {
          return json({ ok: false, error: ref.data?.message || "Upload failed" }, ref.res.status)
        }
      }

      const url = env.SITE_URL ? `${env.SITE_URL}/photos/${fileName}` : `/photos/${fileName}`
      return json({ ok: true, url })
    } catch {
      return json({ ok: false, error: "Upload failed" }, 502)
    }
  },
}
