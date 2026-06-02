/**
 * Migration 001 — Add organizationId compound indexes
 *
 * Safe to run multiple times (idempotent).
 * Creates all compound indexes defined in the multi-tenant schema.
 * Does NOT modify any documents — index-only migration.
 *
 * Run: npx ts-node src/migrations/001_add_organizationId_indexes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;

async function run() {
  console.log('🔄 Migration 001: Adding organizationId compound indexes...');
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;

  const indexOps: Array<{ collection: string; indexes: object[] }> = [
    {
      collection: 'users',
      indexes: [
        { key: { organizationId: 1, email: 1 }, unique: true, sparse: true, name: 'org_email_unique' },
        { key: { organizationId: 1, orgRole: 1 }, name: 'org_orgRole' },
        { key: { organizationId: 1, isActive: 1 }, name: 'org_isActive' },
        { key: { organizationId: 1, clientId: 1 }, sparse: true, name: 'org_clientId' },
      ],
    },
    {
      collection: 'projects',
      indexes: [
        { key: { organizationId: 1, status: 1, createdAt: -1 }, name: 'org_status_createdAt' },
        { key: { organizationId: 1, clientId: 1 }, name: 'org_clientId' },
        { key: { organizationId: 1, pm: 1 }, name: 'org_pm' },
        { key: { organizationId: 1, slug: 1 }, unique: true, sparse: true, name: 'org_slug_unique' },
      ],
    },
    {
      collection: 'tasks',
      indexes: [
        { key: { organizationId: 1, projectId: 1, status: 1 }, name: 'org_project_status' },
        { key: { organizationId: 1, projectId: 1, assignees: 1 }, name: 'org_project_assignees' },
      ],
    },
    {
      collection: 'clients',
      indexes: [
        { key: { organizationId: 1, slug: 1 }, unique: true, sparse: true, name: 'org_slug_unique' },
        { key: { organizationId: 1, status: 1 }, name: 'org_status' },
        { key: { organizationId: 1, email: 1 }, name: 'org_email' },
      ],
    },
    {
      collection: 'invoices',
      indexes: [
        { key: { organizationId: 1, invoiceNumber: 1 }, unique: true, sparse: true, name: 'org_invoiceNumber_unique' },
        { key: { organizationId: 1, status: 1, dueDate: 1 }, name: 'org_status_dueDate' },
        { key: { organizationId: 1, clientId: 1 }, name: 'org_clientId' },
      ],
    },
    {
      collection: 'contracts',
      indexes: [
        { key: { organizationId: 1, status: 1 }, name: 'org_status' },
        { key: { organizationId: 1, clientId: 1 }, name: 'org_clientId' },
      ],
    },
    {
      collection: 'contracttemplates',
      indexes: [
        { key: { organizationId: 1, isDefault: 1 }, name: 'org_isDefault' },
        { key: { organizationId: 1, type: 1 }, name: 'org_type' },
      ],
    },
    {
      collection: 'files',
      indexes: [
        { key: { organizationId: 1, projectId: 1, folder: 1 }, name: 'org_project_folder' },
        { key: { organizationId: 1, clientId: 1 }, name: 'org_clientId' },
        { key: { organizationId: 1, scanStatus: 1 }, name: 'org_scanStatus' },
      ],
    },
    {
      collection: 'messages',
      indexes: [
        { key: { organizationId: 1, channelId: 1, createdAt: -1 }, name: 'org_channel_createdAt' },
      ],
    },
    {
      collection: 'channels',
      indexes: [
        { key: { organizationId: 1, projectId: 1 }, name: 'org_projectId' },
      ],
    },
    {
      collection: 'notifications',
      indexes: [
        { key: { organizationId: 1, userId: 1, isRead: 1 }, name: 'org_user_isRead' },
        { key: { organizationId: 1, createdAt: 1 }, expireAfterSeconds: 7776000, name: 'org_ttl_90d' },
      ],
    },
    {
      collection: 'automationrules',
      indexes: [
        { key: { organizationId: 1, isActive: 1, 'trigger.event': 1 }, name: 'org_active_event' },
      ],
    },
    {
      collection: 'auditlogs',
      indexes: [
        { key: { organizationId: 1, userId: 1, createdAt: -1 }, sparse: true, name: 'org_user_createdAt' },
        { key: { organizationId: 1, resource: 1, resourceId: 1 }, sparse: true, name: 'org_resource' },
        { key: { isPlatformAction: 1, createdAt: -1 }, name: 'platform_createdAt' },
      ],
    },
    {
      collection: 'approvals',
      indexes: [
        { key: { organizationId: 1, projectId: 1, status: 1 }, name: 'org_project_status' },
      ],
    },
    {
      collection: 'briefs',
      indexes: [
        { key: { organizationId: 1, projectId: 1 }, unique: true, sparse: true, name: 'org_project_unique' },
      ],
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const { collection, indexes } of indexOps) {
    const coll = db.collection(collection);
    for (const indexSpec of indexes) {
      const { key, name, ...options } = indexSpec as Record<string, unknown>;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await coll.createIndex(key as any, { ...options, name: name as string });
        console.log(`  ✅ ${collection}.${name}`);
        created++;
      } catch (err: unknown) {
        const mongoErr = err as { code?: number; message?: string };
        if (mongoErr.code === 85 || mongoErr.code === 86) {
          // Index already exists with same or different options — skip
          console.log(`  ⏭  ${collection}.${name} (already exists)`);
          skipped++;
        } else {
          console.error(`  ❌ ${collection}.${name}: ${mongoErr.message}`);
        }
      }
    }
  }

  console.log(`\n✅ Migration 001 complete: ${created} indexes created, ${skipped} skipped`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration 001 failed:', err);
  process.exit(1);
});
