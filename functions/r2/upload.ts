import { signS3Request } from "../lib/s3-signing"

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { path, contentType } = (await context.request.json()) as { path: string; contentType: string }

    if (!path || typeof path !== "string") {
      return new Response(JSON.stringify({ error: "path is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const blob = await context.request.blob()
    const R2_ACCOUNT_ID = (context.env as { R2_ACCOUNT_ID?: string }).R2_ACCOUNT_ID || ""
    const R2_ACCESS_KEY_ID = (context.env as { R2_ACCESS_KEY_ID?: string }).R2_ACCESS_KEY_ID || ""
    const R2_SECRET_ACCESS_KEY = (context.env as { R2_SECRET_ACCESS_KEY?: string }).R2_SECRET_ACCESS_KEY || ""
    const R2_BUCKET = (context.env as { R2_BUCKET_NAME?: string }).R2_BUCKET_NAME || "menu-images"
    const R2_PUBLIC_URL = (context.env as { R2_PUBLIC_URL?: string }).R2_PUBLIC_URL || ""

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const objectKey = path.replace(/^\/+/, "")
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    const url = `${endpoint}/${R2_BUCKET}/${encodeURIComponent(objectKey)}`

    const bodyBuffer = await blob.arrayBuffer()
    const signed = await signS3Request(
      "PUT",
      url,
      {
        "Content-Type": contentType || blob.type || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      },
      bodyBuffer,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
    )

    const response = await fetch(signed)
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Upload failed: ${response.status}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${objectKey}`
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
