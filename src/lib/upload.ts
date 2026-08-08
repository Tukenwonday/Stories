import { compressImage } from "./images"
import { supabase, buildPublicImageUrl } from "./supabase"

const BUCKET = "menu-images"

export interface UploadResult {
  ok: boolean
  url?: string
  oldPath?: string
  error?: string
}

/**
 * Extracts the object path from a Supabase storage URL
 * ("https://.../storage/v1/object/public/<bucket>/<path>") or a bare path.
 * Returns null when the URL does not belong to this bucket.
 */
function extractBucketPath(value: string, bucket: string): string | null {
  const marker = `/${bucket}/`
  const idx = value.indexOf(marker)
  if (idx === -1) return null
  const rest = value.slice(idx + marker.length).split("?")[0].split("#")[0]
  return rest || null
}

/**
 * Compresses a photo in the browser and uploads it to the Supabase
 * `menu-images` bucket under a flat `dishes/` folder.
 * Returns the public storage URL (via CDN if configured) and the old storage path (if any) for deferred deletion.
 */
export async function uploadMenuItemImage(
  file: File,
  itemId: string,
  oldImage?: string,
): Promise<UploadResult> {
  if (!supabase) {
    return { ok: false, error: "Image upload is not configured" }
  }
  try {
    const { blob, ext } = await compressImage(file)
    const safeItem = itemId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "misc"
    const path = `dishes/${safeItem}-${Date.now()}.${ext}`

    const oldPath = oldImage ? extractBucketPath(oldImage, BUCKET) : null

    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: true,
      cacheControl: "31536000",
    })
    if (upError) return { ok: false, error: upError.message }

    // Use buildPublicImageUrl for CDN-aware URL (clean, no query params)
    const publicUrl = buildPublicImageUrl(path)
    return { ok: true, url: publicUrl, oldPath: oldPath ?? undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Deletes a storage object by path via the delete-storage-object Edge Function.
 * The kitchen PIN is required server-side to authorize the delete.
 */
export async function deleteStorageObject(path: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: false, error: "Storage not configured" }
  }
  try {
    const pin = sessionStorage.getItem("kitchenPin")
    if (!pin) return { ok: false, error: "Session expired" }
    const { data, error } = await supabase.functions.invoke("delete-storage-object", {
      body: { pin, path },
    })
    if (error) return { ok: false, error: error.message }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Delete failed" }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
