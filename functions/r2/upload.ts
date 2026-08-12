import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export const onRequestPost: PagesFunction = async (context) => {
  try {
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
      return new Response(JSON.stringify({ error: "file is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const objectKey = path.replace(/^\/+/, "")
    const contentType = file.type || "application/octet-stream"

    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        Body: file,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, s-maxage=31536000, immutable",
      }),
    )

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
