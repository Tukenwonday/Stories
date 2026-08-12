import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"

const ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID ?? ""

export function getR2Client() {
  if (!ACCOUNT_ID) {
    throw new Error("R2_ACCOUNT_ID is not configured")
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: import.meta.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: import.meta.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  })
}

export const R2_BUCKET = import.meta.env.VITE_R2_BUCKET_NAME ?? "menu-images"

export async function uploadToR2(key: string, blob: Blob, contentType: string): Promise<void> {
  const client = getR2Client()
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: blob,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, s-maxage=31536000, immutable",
    }),
  )
}

export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client()
  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }),
  )
}

export async function listR2Keys(prefix?: string): Promise<string[]> {
  const client = getR2Client()
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      MaxKeys: 1000,
    }),
  )
  return (result.Contents ?? []).map((o) => o.Key!).filter(Boolean)
}

export async function getR2Object(key: string): Promise<Blob> {
  const client = getR2Client()
  const result = await client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }),
  )
  const chunks: Uint8Array[] = []
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return new Blob(chunks, { type: result.ContentType ?? "application/octet-stream" })
}
