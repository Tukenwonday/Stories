import "dotenv/config"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

// ---------------------------------------------------------------------------
// Required environment variables (add to .env before running):
//
//   VITE_SUPABASE_URL       – Supabase project URL (already present)
//   VITE_SUPABASE_SERVICE_ROLE_KEY  – Supabase service_role key (secret)
//   R2_ACCOUNT_ID           – Cloudflare account ID (secret)
//   R2_ACCESS_KEY_ID        – R2 API token Access Key ID (secret)
//   R2_SECRET_ACCESS_KEY    – R2 API token Secret Access Key (secret)
//   R2_BUCKET_NAME          – R2 bucket name (default: menu-images)
//   R2_PUBLIC_URL           – R2 public URL (e.g. https://pub-xxx.r2.dev)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "menu-images"
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail("Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env")
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  fail("Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY in .env")
}
if (!R2_PUBLIC_URL) {
  fail("Missing R2_PUBLIC_URL in .env")
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = "menu-images"
const CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable"

async function listSupabaseObjects(): Promise<string[]> {
  const keys: string[] = []
  let pageSize = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      recursive: true,
      limit: pageSize,
      offset,
    })

    if (error) {
      fail(`Failed to list Supabase objects: ${error.message}`)
    }

    const batch = (data ?? []).map((o) => o.name)
    keys.push(...batch)

    if (batch.length < pageSize) break
    offset += pageSize
  }

  return keys
}

async function migrate() {
  console.log("Listing objects in Supabase Storage bucket:", BUCKET)

  const keys = await listSupabaseObjects()
  console.log(`Found ${keys.length} object(s) to migrate\n`)

  if (keys.length === 0) {
    console.log("Nothing to migrate.")
    return
  }

  let migrated = 0
  let failed = 0

  for (const key of keys) {
    console.log(`Migrating: ${key}`)

    try {
      const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(key)
      if (dlError || !blob) {
        console.error(`  ✗ Failed to download: ${dlError?.message ?? "empty response"}`)
        failed++
        continue
      }

      const contentType = blob.type || "application/octet-stream"
      const arrayBuffer = await blob.arrayBuffer()

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: Buffer.from(arrayBuffer),
          ContentType: contentType,
          CacheControl: CACHE_CONTROL,
        }),
      )

      console.log(`  ✓ Uploaded to R2 (${contentType}, ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`)
      migrated++
    } catch (err) {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${failed} failed out of ${keys.length} total`)
}

migrate().catch((err) => {
  fail(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`)
})
