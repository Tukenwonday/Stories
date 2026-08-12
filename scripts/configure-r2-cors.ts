import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3"
import dotenv from "dotenv"

dotenv.config()

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
  const r2AccountId = requireEnv("R2_ACCOUNT_ID", envValue("R2_ACCOUNT_ID", "VITE_R2_ACCOUNT_ID"))
  const r2AccessKeyId = requireEnv("R2_ACCESS_KEY_ID", envValue("R2_ACCESS_KEY_ID"))
  const r2SecretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY", envValue("R2_SECRET_ACCESS_KEY"))
  const r2Bucket = envValue("R2_BUCKET_NAME", "VITE_R2_BUCKET_NAME") || "menu-images"

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  })

  await client.send(new PutBucketCorsCommand({
    Bucket: r2Bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedMethods: ["GET", "HEAD"],
        AllowedOrigins: ["*"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag", "Cache-Control", "Content-Type"],
        MaxAgeSeconds: 3600,
      }],
    },
  }))

  console.log(`Configured CORS for R2 bucket ${r2Bucket}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

