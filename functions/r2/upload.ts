import { signedR2Request } from "../_shared/r2-s3"

const CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable"

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const R2_ACCOUNT_ID = (context.env as { R2_ACCOUNT_ID?: string }).R2_ACCOUNT_ID
    const R2_ACCESS_KEY_ID = (context.env as { R2_ACCESS_KEY_ID?: string }).R2_ACCESS_KEY_ID
    const R2_SECRET_ACCESS_KEY = (context.env as { R2_SECRET_ACCESS_KEY?: string }).R2_SECRET_ACCESS_KEY
    const R2_BUCKET = (context.env as { R2_BUCKET_NAME?: string }).R2_BUCKET_NAME || "menu-images"
    const R2_PUBLIC_URL = (context.env as { R2_PUBLIC_URL?: string }).R2_PUBLIC_URL

    const missing: string[] = []
    if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID")
    if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID")
    if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY")
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing env vars: ${missing.join(", ")}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const formData = await context.request.formData()
    const path = formData.get("path")
    const file = formData.get("file")

    if (!path || typeof path !== "string") {
      return new Response(JSON.stringify({ error: "path is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "file is required or not a File" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const objectKey = path.replace(/^\/+/, "")
    const contentType = file.type || "application/octet-stream"
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
      return new Response(JSON.stringify({ error: `R2 upload failed`, status: response.status, detail: responseText.slice(0, 500) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${objectKey}` : undefined
    return new Response(JSON.stringify({ ok: true, publicUrl, path: objectKey }), {
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
