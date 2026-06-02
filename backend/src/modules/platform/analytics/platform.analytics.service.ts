/**
 * Platform Analytics Service
 *
 * Aggregates data across ALL organizations for the platform admin dashboard.
 * All functions are cached in Redis with appropriate TTLs.
 * Only accessible to platform admins via /api/platform/analytics/*.
 */

import { Organization } from '../../../models/Organization';
import { User } from '../../../models/User';
import { File } from '../../../models/File';
import { cacheGet, cacheSet, isRedisAvailable, getRedisClient } from '../../../config/redis';
import { logger } from '../../../lib/logger';

// ── Cache TTLs ─────────────────────────────────────────────────────────────────
const TTL = {
  OVERVIEW: 300,       // 5 min — dashboard summary
  FUNNEL: 1800,        // 30 min — conversion funnel
  MRR: 3600,           // 1 hour — MRR trend
  STORAGE: 900,        // 15 min — storage breakdown
  RANKING: 300,        // 5 min — org ranking
};

// ── Platform Overview ──────────────────────────────────────────────────────────

export async function getPlatformOverview() {
  const cacheKey = 'platform:analytics:overview';
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalOrgs,
    activeOrgs,
    trialOrgs,
    pendingOrgs,
    suspendedOrgs,
    expiredTrialOrgs,
    archivedOrgs,
    totalUsers,
    activeUsers,
    mrrResult,
    newOrgsThisMonth,
    newOrgsPrevMonth,
  ] = await Promise.all([
    Organization.countDocuments(),
    Organization.countDocuments({ status: 'ACTIVE' }),
    Organization.countDocuments({ status: 'ACTIVE', plan: 'TRIAL' }),
    Organization.countDocuments({ status: 'PENDING_APPROVAL' }),
    Organization.countDocuments({ status: 'SUSPENDED' }),
    Organization.countDocuments({ status: 'EXPIRED_TRIAL' }),
    Organization.countDocuments({ status: 'ARCHIVED' }),
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Organization.aggregate([
      { $match: { status: 'ACTIVE', plan: { $ne: 'TRIAL' } } },
      { $group: { _id: null, totalMrr: { $sum: '$mrr' } } },
    ]),
    Organization.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Organization.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
  ]);

  // Plan distribution
  const planDistribution = await Organization.aggregate([
    { $group: { _id: '$plan', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Status distribution
  const statusDistribution = await Organization.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Org growth trend (last 6 months)
  const orgGrowthTrend = await Organization.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) },
      },
    },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const mrr = mrrResult[0]?.totalMrr ?? 0;
  const orgGrowthRate = newOrgsPrevMonth > 0
    ? Math.round(((newOrgsThisMonth - newOrgsPrevMonth) / newOrgsPrevMonth) * 100)
    : 0;

  const result = {
    organizations: {
      total: totalOrgs,
      active: activeOrgs,
      trial: trialOrgs,
      pending: pendingOrgs,
      suspended: suspendedOrgs,
      expiredTrial: expiredTrialOrgs,
      archived: archivedOrgs,
      newThisMonth: newOrgsThisMonth,
      growthRate: orgGrowthRate,
    },
    users: { total: totalUsers, active: activeUsers },
    revenue: { mrr },
    planDistribution,
    statusDistribution,
    orgGrowthTrend,
    generatedAt: now.toISOString(),
  };

  await cacheSet(cacheKey, result, TTL.OVERVIEW);
  return result;
}

// ── Onboarding Funnel ──────────────────────────────────────────────────────────

export async function getOnboardingFunnel() {
  const cacheKey = 'platform:analytics:funnel';
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const [registered, approved, active, paid] = await Promise.all([
    Organization.countDocuments(),
    Organization.countDocuments({ status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED', 'EXPIRED_TRIAL'] } }),
    Organization.countDocuments({ status: { $in: ['ACTIVE', 'SUSPENDED', 'EXPIRED_TRIAL'] } }),
    Organization.countDocuments({ plan: { $ne: 'TRIAL' } }),
  ]);

  const result = {
    funnel: [
      { stage: 'Registered', count: registered },
      { stage: 'Approved', count: approved },
      { stage: 'Activated', count: active },
      { stage: 'Converted to Paid', count: paid },
    ],
    conversionRates: {
      registeredToApproved: registered > 0 ? Math.round((approved / registered) * 100) : 0,
      approvedToActivated:  approved > 0  ? Math.round((active   / approved)    * 100) : 0,
      activatedToPaid:      active > 0    ? Math.round((paid     / active)       * 100) : 0,
      overallConversion:    registered > 0 ? Math.round((paid    / registered)   * 100) : 0,
    },
    generatedAt: new Date().toISOString(),
  };

  await cacheSet(cacheKey, result, TTL.FUNNEL);
  return result;
}

// ── MRR Trend (12 months) ──────────────────────────────────────────────────────

export async function getMrrTrend() {
  const cacheKey = 'platform:analytics:mrr';
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const now = new Date();

  // Monthly MRR snapshots — derived from orgs that were active each month
  // We approximate by looking at orgs approved before each month-end
  // and summing their current MRR (best available without historical snapshots)
  const monthlyData: Array<{ year: number; month: number; label: string; mrr: number; orgCount: number }> = [];

  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

    const [mrrResult, orgCount] = await Promise.all([
      Organization.aggregate([
        {
          $match: {
            approvedAt: { $lte: monthEnd },
            plan: { $ne: 'TRIAL' },
            status: { $nin: ['REJECTED', 'ARCHIVED'] },
          },
        },
        { $group: { _id: null, totalMrr: { $sum: '$mrr' } } },
      ]),
      Organization.countDocuments({
        approvedAt: { $lte: monthEnd },
        status: { $nin: ['REJECTED', 'ARCHIVED'] },
      }),
    ]);

    const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    monthlyData.push({
      year: monthStart.getFullYear(),
      month: monthStart.getMonth() + 1,
      label,
      mrr: mrrResult[0]?.totalMrr ?? 0,
      orgCount,
    });
  }

  // Calculate MoM growth for the most recent month
  const lastTwo = monthlyData.slice(-2);
  const momGrowth = lastTwo.length === 2 && lastTwo[0].mrr > 0
    ? Math.round(((lastTwo[1].mrr - lastTwo[0].mrr) / lastTwo[0].mrr) * 100)
    : 0;

  const currentMrr = monthlyData[monthlyData.length - 1]?.mrr ?? 0;
  const arr = currentMrr * 12;

  const result = {
    trend: monthlyData,
    summary: {
      currentMrr,
      arr,
      momGrowthPercent: momGrowth,
    },
    generatedAt: new Date().toISOString(),
  };

  await cacheSet(cacheKey, result, TTL.MRR);
  return result;
}

// ── Storage Usage Breakdown ────────────────────────────────────────────────────

export async function getStorageUsageBreakdown(limit = 20) {
  const cacheKey = `platform:analytics:storage:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Top orgs by storage usage
  const topByStorage = await Organization.find({ status: { $in: ['ACTIVE', 'SUSPENDED'] } })
    .sort({ 'usage.storageUsedBytes': -1 })
    .limit(limit)
    .select('name slug plan usage.storageUsedBytes limits.storageBytes')
    .lean();

  // Platform-wide totals
  const totalsResult = await Organization.aggregate([
    { $match: { status: { $in: ['ACTIVE', 'SUSPENDED'] } } },
    {
      $group: {
        _id: null,
        totalUsedBytes:  { $sum: '$usage.storageUsedBytes' },
        totalLimitBytes: { $sum: '$limits.storageBytes' },
        orgCount:        { $sum: 1 },
      },
    },
  ]);

  // Actual file count and size from File collection (ground truth)
  const fileStats = await File.aggregate([
    { $match: { scanStatus: { $ne: 'INFECTED' } } },
    {
      $group: {
        _id: null,
        totalFiles: { $sum: 1 },
        totalBytes: { $sum: '$sizeBytes' },
      },
    },
  ]);

  const totals = totalsResult[0] ?? { totalUsedBytes: 0, totalLimitBytes: 0, orgCount: 0 };
  const files  = fileStats[0]   ?? { totalFiles: 0, totalBytes: 0 };

  const result = {
    topOrgs: topByStorage.map(org => ({
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      usedBytes:  (org.usage as { storageUsedBytes: number }).storageUsedBytes,
      limitBytes: (org.limits as { storageBytes: number }).storageBytes,
      usedPercent: (org.limits as { storageBytes: number }).storageBytes > 0
        ? Math.round(
            ((org.usage as { storageUsedBytes: number }).storageUsedBytes /
             (org.limits as { storageBytes: number }).storageBytes) * 100
          )
        : 0,
    })),
    platform: {
      totalUsedBytes:  totals.totalUsedBytes,
      totalLimitBytes: totals.totalLimitBytes,
      totalUsedGB:     +(totals.totalUsedBytes  / 1024 ** 3).toFixed(2),
      totalLimitGB:    +(totals.totalLimitBytes / 1024 ** 3).toFixed(2),
      orgCount:        totals.orgCount,
      totalFiles:      files.totalFiles,
      actualUsedBytes: files.totalBytes,
      driftBytes:      totals.totalUsedBytes - files.totalBytes,
    },
    generatedAt: new Date().toISOString(),
  };

  await cacheSet(cacheKey, result, TTL.STORAGE);
  return result;
}

// ── Organization Activity Ranking ──────────────────────────────────────────────

export async function getOrganizationRanking(query: { limit?: number; sortBy?: string }) {
  const { limit = 10, sortBy = 'seats' } = query;
  const cacheKey = `platform:analytics:ranking:${sortBy}:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const sortField = sortBy === 'storage' ? 'usage.storageUsedBytes'
    : sortBy === 'mrr'     ? 'mrr'
    : sortBy === 'clients' ? 'usage.clients'
    : sortBy === 'projects'? 'usage.projects'
    : 'usage.seats';

  const orgs = await Organization.find({ status: 'ACTIVE' })
    .sort({ [sortField]: -1 })
    .limit(limit)
    .select('name slug plan usage limits mrr approvedAt trialEndsAt')
    .lean();

  const result = {
    sortBy,
    orgs: orgs.map((org, i) => ({
      rank: i + 1,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      mrr:  org.mrr,
      usage: org.usage,
      limits: org.limits,
      approvedAt: org.approvedAt,
      trialEndsAt: org.trialEndsAt,
    })),
    generatedAt: new Date().toISOString(),
  };

  await cacheSet(cacheKey, result, TTL.RANKING);
  return result;
}

// ── API Usage by Org (from Redis rate keys) ────────────────────────────────────

export async function getApiUsage(limit = 20) {
  const cacheKey = `platform:analytics:api-usage:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  if (!isRedisAvailable()) {
    return { message: 'Redis unavailable — API usage data not available', orgs: [] };
  }

  try {
    const redis = getRedisClient();
    const keys = await redis.keys('rate:api:*');

    const usageData: Array<{ orgId: string; requests: number }> = [];

    for (const key of keys) {
      const val = await redis.get(key);
      if (val) {
        const orgId = key.replace('rate:api:', '');
        usageData.push({ orgId, requests: parseInt(val, 10) });
      }
    }

    // Sort by request count descending
    usageData.sort((a, b) => b.requests - a.requests);
    const top = usageData.slice(0, limit);

    // Enrich with org names
    const orgIds = top.map(u => u.orgId);
    const orgs = await Organization.find({ _id: { $in: orgIds } })
      .select('name slug plan')
      .lean();

    const orgMap = new Map(orgs.map(o => [o._id.toString(), o]));

    const result = {
      window: '1 minute (current)',
      orgs: top.map(u => ({
        orgId: u.orgId,
        name: orgMap.get(u.orgId)?.name ?? 'Unknown',
        slug: orgMap.get(u.orgId)?.slug ?? '',
        plan: orgMap.get(u.orgId)?.plan ?? 'UNKNOWN',
        requests: u.requests,
      })),
      generatedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, result, 60); // 1-min cache (data is real-time)
    return result;
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch API usage from Redis');
    return { message: 'Failed to fetch API usage', orgs: [] };
  }
}

// ── Cache invalidation — called by cron job ────────────────────────────────────

export async function refreshAnalyticsCache(): Promise<void> {
  logger.info('Refreshing platform analytics cache...');
  try {
    await Promise.all([
      getPlatformOverview().then(() => logger.debug('Platform overview cache refreshed')),
      getOnboardingFunnel().then(() => logger.debug('Onboarding funnel cache refreshed')),
      getMrrTrend().then(() => logger.debug('MRR trend cache refreshed')),
      getStorageUsageBreakdown().then(() => logger.debug('Storage breakdown cache refreshed')),
      getOrganizationRanking({ limit: 10, sortBy: 'seats' }),
      getOrganizationRanking({ limit: 10, sortBy: 'mrr' }),
      getOrganizationRanking({ limit: 10, sortBy: 'storage' }),
    ]);
    logger.info('Platform analytics cache refresh complete');
  } catch (err) {
    logger.error({ err }, 'Platform analytics cache refresh failed');
  }
}
