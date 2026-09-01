import { createHash, createHmac } from "node:crypto";

// Minimal AWS Signature Version 4 client for S3 PUT/DELETE.
// Implemented by hand (instead of @aws-sdk/client-s3) so backup uploads
// don't require adding a new dependency — the payoff is worth the small
// amount of protocol code, and it only runs when BACKUP_S3_BUCKET is set.

function hmac(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function amzDateNow() {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function encodeS3Key(key) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function signRequest({ method, bucket, key, region, accessKeyId, secretAccessKey, payloadHash }) {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = `/${encodeS3Key(key)}`;
  const { amzDate, dateStamp } = amzDateNow();

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, "s3");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}${canonicalUri}`,
    headers: { ...headers, Authorization: authorization },
  };
}

export async function putObject({
  bucket,
  key,
  region,
  accessKeyId,
  secretAccessKey,
  body,
  contentType = "application/octet-stream",
  fetchImpl = fetch,
}) {
  const payloadHash = sha256Hex(body);
  const { url, headers } = signRequest({
    method: "PUT",
    bucket,
    key,
    region,
    accessKeyId,
    secretAccessKey,
    payloadHash,
  });

  const response = await fetchImpl(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": contentType },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`S3 upload failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return { bucket, key, region };
}

export async function deleteObject({
  bucket,
  key,
  region,
  accessKeyId,
  secretAccessKey,
  fetchImpl = fetch,
}) {
  const payloadHash = sha256Hex(Buffer.alloc(0));
  const { url, headers } = signRequest({
    method: "DELETE",
    bucket,
    key,
    region,
    accessKeyId,
    secretAccessKey,
    payloadHash,
  });

  const response = await fetchImpl(url, { method: "DELETE", headers });

  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    throw new Error(`S3 delete failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return { bucket, key, region };
}

export const __testables__ = { signRequest, sha256Hex, encodeS3Key };
