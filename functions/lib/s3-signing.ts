async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buffer = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data)
  const hash = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message))
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secretKey), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, "aws4_request")
  return kSigning
}

export async function signS3Request(
  method: string,
  urlString: string,
  extraHeaders: Record<string, string>,
  body: ArrayBuffer | null,
  accessKeyId: string,
  secretAccessKey: string,
  region = "auto",
  service = "s3",
): Promise<Request> {
  const url = new URL(urlString)
  const now = new Date()
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "")
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "")

  const payloadHash = body
    ? await sha256Hex(body)
    : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

  const allHeaders = new Headers(extraHeaders)
  allHeaders.set("host", url.host)
  allHeaders.set("x-amz-date", amzDate)
  allHeaders.set("x-amz-content-sha256", payloadHash)

  const canonicalHeaders: string[] = []
  const signedHeadersList: string[] = []
  const headerEntries = [...allHeaders.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [key, value] of headerEntries) {
    const lowerKey = key.toLowerCase().trim()
    canonicalHeaders.push(`${lowerKey}:${value.trim()}`)
    signedHeadersList.push(lowerKey)
  }

  const canonicalHeadersStr = canonicalHeaders.join("\n") + "\n"
  const signedHeadersStr = signedHeadersList.join(";")

  const path = url.pathname
  const query = url.search.slice(1)

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    query,
    canonicalHeadersStr,
    signedHeadersStr,
    payloadHash,
  ].join("\n")

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n")

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signatureBytes = await hmacSha256(signingKey, stringToSign)
  const signature = Array.from(new Uint8Array(signatureBytes)).map((b) => b.toString(16).padStart(2, "0")).join("")

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`
  allHeaders.set("authorization", authorization)

  return new Request(`${url.origin}${path}${url.search}`, {
    method: method.toUpperCase(),
    headers: allHeaders,
    body: body ?? undefined,
  })
}
