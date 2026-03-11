import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export function createR2(accountId, accessKeyId, secretAccessKey, bucket) {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    async put(key, body, opts) {
      const contentType = opts?.httpMetadata?.contentType ?? 'application/octet-stream';
      let uploadBody = body;
      if (typeof body === 'string') uploadBody = Buffer.from(body);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: uploadBody, ContentType: contentType })
      );
    },

    async get(key) {
      let res;
      try {
        res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      } catch (err) {
        if (err.name === 'NoSuchKey') return null;
        throw err;
      }
      if (!res.Body) return null;

      // Buffer the body once so both .json() and .body can be served
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      return {
        async json() {
          return JSON.parse(buffer.toString('utf8'));
        },
        get body() {
          return new ReadableStream({
            start(controller) {
              controller.enqueue(buffer);
              controller.close();
            },
          });
        },
      };
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
