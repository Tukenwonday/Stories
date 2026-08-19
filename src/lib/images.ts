export interface CompressedImage {
  blob: Blob
  ext: "webp" | "jpg" | "png"
}

const MAX_DIMENSION = 800
const WEBP_QUALITY = 0.75

/**
 * Reads an image file in the browser, downsizes it to at most MAX_DIMENSION px
 * on its longest side and re-encodes it as WebP. The compressed blob is what
 * actually gets uploaded.
 */
export function compressImage(file: Blob | File, maxDimension = MAX_DIMENSION): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(maxDimension / width, maxDimension / height)
        width = Math.max(1, Math.round(width * scale))
        height = Math.max(1, Math.round(height * scale))
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas not supported"))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image compression failed"))
            return
          }
          const type = blob.type
          const ext = type.includes("webp") ? "webp" : type.includes("png") ? "png" : "jpg"
          resolve({ blob, ext })
        },
        "image/webp",
        WEBP_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read the image file"))
    }
    img.src = url
  })
}
