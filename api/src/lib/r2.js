/**
 * Write a JSON blob to R2.
 * @param {R2Bucket} bucket
 * @param {string} key
 * @param {object} data
 */
export async function putJson(bucket, key, data) {
  await bucket.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/**
 * Read and parse a JSON blob from R2. Returns null if not found.
 * @param {R2Bucket} bucket
 * @param {string} key
 */
export async function getJson(bucket, key) {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.json();
}

/**
 * Delete an object from R2.
 * @param {R2Bucket} bucket
 * @param {string} key
 */
export async function deleteObject(bucket, key) {
  await bucket.delete(key);
}

/**
 * Write binary data to R2.
 * @param {R2Bucket} bucket
 * @param {string} key
 * @param {ReadableStream|ArrayBuffer} body
 * @param {string} contentType
 */
export async function putBinary(bucket, key, body, contentType) {
  await bucket.put(key, body, {
    httpMetadata: { contentType },
  });
}

/**
 * Create a signed URL for a media object (1 hour expiry).
 * D1/R2 Workers do not support presigned URLs natively; we proxy through the Worker instead.
 * This helper just returns the internal R2 key for reference — URL generation happens in the route.
 */
export function mediaKey(ideaId, filename) {
  return `ideas/${ideaId}/media/${filename}`;
}

export function dataKey(ideaId) {
  return `ideas/${ideaId}/data.json`;
}
