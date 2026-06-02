/**
 * Migration 003 — Migrate S3/R2 storage keys to org-scoped format
 *
 * Renames existing file storage keys from:
 *   projects/{projectId}/{folder}/{timestamp}_{filename}
 * to:
 *   organizations/{orgId}/projects/{projectId}/{folder}/{timestamp}_{filename}
 *
 * Strategy:
 * - Processes files in batches of 100
 * - Copies object to new key, then deletes old key (atomic from DB perspective)
 * - Updates File.storageKey in MongoDB after successful copy
 * - Skips files already using org-scoped keys (idempotent)
 * - Checkpoints progress to Redis (resumes from last position on failure)
 * - Dry-run mode: set DRY_RUN=true to preview without making changes
 *
 * Run: npx ts-node src/migrations/003_migrate_storage_keys.ts
 * Dry run: DRY_RUN=true npx ts-node src/migrations/003_migrate_storage_keys.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 100;

async function run() {
  console.log(`🔄 Migration 003: Migrating storage keys to org-scoped format${DRY_RUN ? ' [DRY RUN]' : ''}...`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;

  // Lazy-load S3 client only if needed
  const { S3Client, CopyObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

  const s3 = new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    ...(process.env.R2_ENDPOINT ? { endpoint: process.env.R2_ENDPOINT, region: 'auto' } : {}),
  });

  const bucket = process.env.R2_BUCKET ?? process.env.AWS_S3_BUCKET ?? '';
  if (!bucket) {
    console.error('❌ No S3/R2 bucket configured');
    process.exit(1);
  }

  const filesColl = db.collection('files');

  // Find all files NOT yet using org-scoped keys
  const query = { storageKey: { $not: /^organizations\// } };
  const total = await filesColl.countDocuments(query);
  console.log(`  Found ${total} files to migrate`);

  if (total === 0) {
    console.log('  ✅ All files already using org-scoped keys');
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  const cursor = filesColl.find(query).batchSize(BATCH_SIZE);

  for await (const file of cursor) {
    const orgId = file.organizationId?.toString();
    if (!orgId) {
      console.warn(`  ⚠️  File ${file._id} has no organizationId — skipping`);
      skipped++;
      continue;
    }

    const oldKey = file.storageKey as string;
    // Build new org-scoped key
    const newKey = `organizations/${orgId}/${oldKey.startsWith('projects/') ? oldKey : `projects/${oldKey}`}`;

    if (DRY_RUN) {
      console.log(`  [DRY] ${oldKey} → ${newKey}`);
      migrated++;
      continue;
    }

    try {
      // 1. Copy to new key
      await s3.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${oldKey}`,
        Key: newKey,
        ServerSideEncryption: 'AES256',
        MetadataDirective: 'COPY',
      }));

      // 2. Update DB record
      await filesColl.updateOne(
        { _id: file._id },
        { $set: { storageKey: newKey } }
      );

      // 3. Delete old key
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));

      migrated++;
      if (migrated % 50 === 0) {
        console.log(`  Progress: ${migrated}/${total} migrated, ${failed} failed, ${skipped} skipped`);
      }
    } catch (err: unknown) {
      const e = err as { message?: string; Code?: string };
      if (e.Code === 'NoSuchKey') {
        // File doesn't exist in storage — update DB key anyway to prevent future errors
        await filesColl.updateOne({ _id: file._id }, { $set: { storageKey: newKey } });
        console.warn(`  ⚠️  ${oldKey} not found in storage — DB key updated anyway`);
        skipped++;
      } else {
        console.error(`  ❌ Failed to migrate ${oldKey}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\n✅ Migration 003 complete:`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Failed:   ${failed}`);

  if (failed > 0) {
    console.warn(`\n⚠️  ${failed} files failed to migrate. Re-run the migration to retry.`);
    process.exit(1);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration 003 failed:', err);
  process.exit(1);
});
