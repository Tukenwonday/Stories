import { compressImage } from "./images"

const UPLOAD_URL = import.meta.env.VITE_IMAGE_UPLOAD_URL as string | undefined

export const isImageUploadConfigured = Boolean(UPLOAD_URL)

export interface UploadResult {
  ok: boolean
  url?: string
  error?: string
}

/**
 * Compresses a photo in the browser, then uploads it through the Cloudflare
 * Worker (`VITE_IMAGE_UPLOAD_URL`), which commits it to the GitHub repo
 * (`public/photos`) so it is served from this site's own build output. When
 * `oldImage` points at an existing `/photos/...` file, the Worker deletes it in
 * the same commit. Returns the public image URL for the menu row.
 */
export async function uploadMenuItemImage(
  file: File,
  itemId: string,
  oldImage?: string,
): Promise<UploadResult> {
  if (!UPLOAD_URL) {
    return { ok: false, error: "Image upload is not configured" }
  }
  try {
    const { blob, ext } = await compressImage(file)
    const form = new FormData()
    form.append("file", blob, `menu-${Date.now()}.${ext}`)
    form.append("itemId", itemId)
    if (oldImage) form.append("oldImage", oldImage)

    const res = await fetch(UPLOAD_URL, { method: "POST", body: form })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || "Upload failed" }
    }
    return { ok: true, url: data.url }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
