import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import { formatMenuPayload, type CategoryRow, type MenuRow } from "../functions/_shared/menu-json"

dotenv.config()

const MENU_CACHE_CONTROL = "no-cache, must-revalidate"
const MENU_COLUMNS = "id,category,title_en,title_ar,description_en,description_ar,price,image,tag_en,tag_ar,modifiers,not_served_windows,is_available,unavailable_dates"
const CATEGORY_COLUMNS = "id,label_en,label_ar"

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (value?.trim()) return value.trim()
  }
  return ""
}

function requireEnv(label: string, value: string): string {
  if (!value) throw new Error(`Missing ${label}`)
  return value
}

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL", envValue("SUPABASE_URL", "VITE_SUPABASE_URL"))
  const supabaseKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    envValue("SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
  )
  const r2AccountId = requireEnv("R2_ACCOUNT_ID", envValue("R2_ACCOUNT_ID", "VITE_R2_ACCOUNT_ID"))
  const r2AccessKeyId = requireEnv("R2_ACCESS_KEY_ID", envValue("R2_ACCESS_KEY_ID"))
  const r2SecretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY", envValue("R2_SECRET_ACCESS_KEY"))
  const r2Bucket = envValue("R2_BUCKET_NAME", "VITE_R2_BUCKET_NAME") || "menu-images"
  const r2PublicUrl = requireEnv("R2_PUBLIC_URL", envValue("R2_PUBLIC_URL", "VITE_R2_PUBLIC_URL"))

  const supabase = createClient(supabaseUrl, supabaseKey)
  const [categoriesResult, menuResult] = await Promise.all([
    supabase.from("categories").select(CATEGORY_COLUMNS).order("sort_order", { ascending: true }),
    supabase.from("menu").select(MENU_COLUMNS).eq("is_available", true),
  ])

  if (categoriesResult.error) throw categoriesResult.error
  if (menuResult.error) throw menuResult.error

  const payload = formatMenuPayload(
    (categoriesResult.data ?? []) as CategoryRow[],
    (menuResult.data ?? []) as MenuRow[],
    r2PublicUrl,
  )

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  })

  await client.send(new PutObjectCommand({
    Bucket: r2Bucket,
    Key: "menu.json",
    Body: JSON.stringify(payload),
    ContentType: "application/json",
    CacheControl: MENU_CACHE_CONTROL,
  }))

  console.log(`Published ${payload.menu.length} menu items in ${payload.categories.length} categories to ${r2PublicUrl.replace(/\/+$/, "")}/menu.json`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

