/**
 * Migration 002 — Backfill organizationId on legacy documents
 *
 * For single-tenant deployments upgrading to multi-tenant:
 * 1. Finds or creates the "default" organization from the first SUPERADMIN user
 * 2. Backfills organizationId on all Users, Projects, Tasks, Clients, Invoices,
 *    Contracts, Files, Messages, Channels, Notifications, AutomationRules,
 *    Approvals, Briefs, AuditLogs that are missing organizationId
 *
 * Safe to run multiple times (idempotent — only updates docs where organizationId is null/missing).
 * Run AFTER migration 001.
 *
 * Run: npx ts-node src/migrations/002_backfill_organizationId.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const BATCH_SIZE = 500;

async function run() {
  console.log('🔄 Migration 002: Backfilling organizationId on legacy documents...');
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;

  // ── Step 1: Find or create the default organization ───────────────────────
  let orgId: mongoose.Types.ObjectId;

  const existingOrg = await db.collection('organizations').findOne(
    {},
    { sort: { createdAt: 1 } }
  );

  if (existingOrg) {
    orgId = existingOrg._id as mongoose.Types.ObjectId;
    console.log(`  Using existing organization: ${existingOrg.name} (${orgId})`);
  } else {
    // Create a default org from the first SUPERADMIN user
    const superadmin = await db.collection('users').findOne({ role: 'SUPERADMIN' });
    if (!superadmin) {
      console.error('  ❌ No SUPERADMIN user found and no Organization exists. Cannot backfill.');
      process.exit(1);
    }

    const result = await db.collection('organizations').insertOne({
      name: process.env.AGENCY_NAME ?? 'My Agency',
      slug: 'my-agency',
      status: 'ACTIVE',
      plan: 'ENTERPRISE',
      ownerEmail: superadmin.email,
      registeredAt: new Date(),
      approvedAt: new Date(),
      trialStartsAt: new Date(),
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      limits: { seats: -1, storageBytes: -1, projects: -1, clients: -1, automations: -1 },
      usage: { seats: 0, storageUsedBytes: 0, projects: 0, clients: 0 },
      features: {
        contractModule: true, invoiceModule: true, automationsModule: true,
        analyticsModule: true, apiAccess: true, whiteLabel: false,
        customDomain: false, ssoEnabled: false,
      },
      onboarding: { completedSteps: [], currentStep: 'complete', completedAt: new Date() },
      metadata: { migratedFromSingleTenant: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orgId = result.insertedId;
    console.log(`  ✅ Created default organization (${orgId})`);
  }

  // ── Step 2: Backfill each collection ──────────────────────────────────────
  const collections = [
    'users', 'projects', 'tasks', 'clients', 'invoices', 'contracts',
    'contracttemplates', 'files', 'messages', 'channels', 'notifications',
    'automationrules', 'approvals', 'briefs', 'auditlogs',
  ];

  let totalUpdated = 0;

  for (const collName of collections) {
    const coll = db.collection(collName);
    let updated = 0;
    let processed = 0;

    // Process in batches to avoid memory issues on large collections
    const cursor = coll.find({ organizationId: { $exists: false } });

    const ids: mongoose.Types.ObjectId[] = [];
    for await (const doc of cursor) {
      ids.push(doc._id as mongoose.Types.ObjectId);
      if (ids.length >= BATCH_SIZE) {
        const result = await coll.updateMany(
          { _id: { $in: ids } },
          { $set: { organizationId: orgId } }
        );
        updated += result.modifiedCount;
        processed += ids.length;
        ids.length = 0;
        process.stdout.write(`\r  ${collName}: ${processed} processed...`);
      }
    }

    // Flush remaining
    if (ids.length > 0) {
      const result = await coll.updateMany(
        { _id: { $in: ids } },
        { $set: { organizationId: orgId } }
      );
      updated += result.modifiedCount;
    }

    if (updated > 0) {
      console.log(`\n  ✅ ${collName}: ${updated} documents backfilled`);
    } else {
      console.log(`  ⏭  ${collName}: no documents needed backfill`);
    }
    totalUpdated += updated;
  }

  // ── Step 3: Update org usage counters ─────────────────────────────────────
  const [userCount, projectCount, clientCount] = await Promise.all([
    db.collection('users').countDocuments({ organizationId: orgId }),
    db.collection('projects').countDocuments({ organizationId: orgId, status: { $ne: 'ARCHIVED' } }),
    db.collection('clients').countDocuments({ organizationId: orgId }),
  ]);

  await db.collection('organizations').updateOne(
    { _id: orgId },
    { $set: { 'usage.seats': userCount, 'usage.projects': projectCount, 'usage.clients': clientCount } }
  );

  console.log(`\n  ✅ Usage counters updated: ${userCount} seats, ${projectCount} projects, ${clientCount} clients`);
  console.log(`\n✅ Migration 002 complete: ${totalUpdated} total documents backfilled`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration 002 failed:', err);
  process.exit(1);
});
