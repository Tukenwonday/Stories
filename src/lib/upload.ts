import { compressImage } from "./images"
import { supabase } from "./supabase"

const BUCKET = "menu-images"

export const isImageUploadConfigured = Boolean(supabase)

export interface UploadResult {
  ok: boolean
  url?: string
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
 * `menu-images` bucket. When `oldImage` points at an existing object in that
 * bucket, the previous photo is removed so each item keeps a single image.
 * Returns the public storage URL for the menu row.
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
    const path = `${safeItem}/${Date.now()}.${ext}`

    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    })
    if (upError) return { ok: false, error: upError.message }

    const stale = new Set<string>()

    if (oldImage) {
      const oldPath = extractBucketPath(oldImage, BUCKET)
      if (oldPath && oldPath !== path) stale.add(oldPath)
    }

    try {
      const { data: existing } = await supabase.storage.from(BUCKET).list(safeItem)
      for (const f of existing ?? []) {
        const candidate = `${safeItem}/${f.name}`
        if (candidate !== path) stale.add(candidate)
      }
    } catch {
      // Listing is best-effort; the oldImage removal above still applies.
    }

    if (stale.size > 0) {
      const { error: rmError } = await supabase.storage.from(BUCKET).remove([...stale])
      if (rmError) console.warn("Could not remove old photo:", rmError.message)
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { ok: true, url: data.publicUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
