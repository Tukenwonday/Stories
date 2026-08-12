const SERVICE = "s3"
const REGION = "auto"
const ALGORITHM = "AWS4-HMAC-SHA256"
const EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

const encoder = new TextEncoder()

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export interface R2RequestOptions {
  method: "PUT" | "DELETE"
  key: string
  body?: ArrayBuffer
  contentType?: string
  cacheControl?: string
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const data = typeof value === "string" ? encoder.encode(value) : value
  return toHex(await crypto.subtle.digest("SHA-256", data))
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value))
}

async function signingKey(secretAccessKey: string, dateStamp: string): Promise<ArrayBuffer> {
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp)
  const regionKey = await hmac(dateKey, REGION)
  const serviceKey = await hmac(regionKey, SERVICE)
  return hmac(serviceKey, "aws4_request")
}

function amzDate(now = new Date()): { dateStamp: string; amzDate: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  return {
    dateStamp: iso.slice(0, 8),
    amzDate: iso,
  }
}

function encodeObjectKey(key: string): string {
  return key
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

export async function signedR2Request(config: R2Config, options: R2RequestOptions): Promise<Response> {
  const body = options.body
  const payloadHash = body ? await sha256Hex(body) : EMPTY_BODY_SHA256
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeObjectKey(options.key)}`
  const endpoint = `https://${host}${canonicalUri}`
  const { dateStamp, amzDate: requestDate } = amzDate()

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": requestDate,
  }
  if (options.contentType) headers["content-type"] = options.contentType
  if (options.cacheControl) headers["cache-control"] = options.cacheControl

  const sortedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers[name].trim().replace(/\s+/g, " ")}\n`).join("")
  const signedHeaders = sortedHeaderNames.join(";")
  const canonicalRequest = [
    options.method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = [
    ALGORITHM,
    requestDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n")
  const signature = toHex(await hmac(await signingKey(config.secretAccessKey, dateStamp), stringToSign))

  const requestHeaders = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (name !== "host") requestHeaders.set(name, value)
  }
  requestHeaders.set(
    "Authorization",
    `${ALGORITHM} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  )

  return fetch(endpoint, {
    method: options.method,
    headers: requestHeaders,
    body,
  })
}
