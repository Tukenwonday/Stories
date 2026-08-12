import { compressImage } from "./images"
import { buildPublicImageUrl, GENERIC_ERROR } from "./supabase"

const R2_UPLOAD_URL = "/r2/upload"
const R2_DELETE_URL = "/r2/delete"

export interface UploadResult {
  ok: boolean
  url?: string
  path?: string
  oldPath?: string
  error?: string
}

function extractBucketPath(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) {
    return value || null
  }
  const marker = "/menu-images/"
  const idx = value.indexOf(marker)
  if (idx === -1) return null
  const rest = value.slice(idx + marker.length).split("?")[0].split("#")[0]
  return rest || null
}

export async function uploadMenuItemImage(
  blob: Blob | File,
  itemId: string,
  oldImage?: string,
): Promise<UploadResult> {
  try {
    const { blob: compressedBlob, ext } = await compressImage(blob)
    const safeItem = itemId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "misc"
    const path = `dishes/${safeItem}-${Date.now()}.${ext}`

    const oldPath = oldImage ? extractBucketPath(oldImage) : null

    const formData = new FormData()
    formData.append("path", path)
    formData.append("file", compressedBlob, `${path}.${ext}`)

    const uploadRes = await fetch(R2_UPLOAD_URL, {
      method: "POST",
      body: formData,
    })
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok || !uploadData?.ok) {
      return { ok: false, error: uploadData?.error ?? `Upload failed: ${uploadRes.status}` }
    }

    const publicUrl = buildPublicImageUrl(path)
    return { ok: true, url: publicUrl, path, oldPath: oldPath ?? undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteStorageObject(path: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const pin = sessionStorage.getItem("kitchenPin")
    if (!pin) return { ok: false, error: "Session expired" }

    const res = await fetch(R2_DELETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, path }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.error ?? "Delete failed" }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
