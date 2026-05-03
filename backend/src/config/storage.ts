import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';
import { logger } from '../lib/logger';
import { Readable } from 'stream';

let s3Client: S3Client;

export function getS3Client(): S3Client {
  if (!s3Client) {
    const config: ConstructorParameters<typeof S3Client>[0] = {
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || 'placeholder',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || 'placeholder',
      },
    };

    // Use Cloudflare R2 if configured
    if (env.R2_ENDPOINT) {
      config.endpoint = env.R2_ENDPOINT;
      config.region = 'auto';
    }

    s3Client = new S3Client(config);
  }
  return s3Client;
}

export function getBucketName(): string {
  return env.R2_BUCKET || env.AWS_S3_BUCKET;
}

export async function uploadFile(
  key: string,
  body: Buffer | Readable,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucketName();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
    ServerSideEncryption: 'AES256',
  }));

  logger.info({ key, bucket }, 'File uploaded to storage');
  return key;
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function getSignedUploadUrl(key: string, contentType: string, expiresInSeconds = 300): Promise<string> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  }));
  logger.info({ key }, 'File deleted from storage');
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    await client.send(new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

export async function initiateMultipartUpload(key: string, contentType: string): Promise<string> {
  const client = getS3Client();
  const response = await client.send(new CreateMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  }));
  return response.UploadId!;
}

export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer
): Promise<string> {
  const client = getS3Client();
  const response = await client.send(new UploadPartCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: body,
  }));
  return response.ETag!;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>
): Promise<void> {
  const client = getS3Client();
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const client = getS3Client();
  await client.send(new AbortMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
  }));
}

export function generateStorageKey(prefix: string, filename: string): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${prefix}/${timestamp}_${sanitized}`;
}
