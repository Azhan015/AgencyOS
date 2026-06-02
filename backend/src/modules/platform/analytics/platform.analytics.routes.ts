/**
 * Platform Analytics Routes
 *
 * All routes require platform JWT authentication.
 * All routes require 'orgs:read' permission.
 *
 * GET /api/platform/analytics/overview          — Dashboard summary
 * GET /api/platform/analytics/onboarding-funnel — Registration → paid conversion
 * GET /api/platform/analytics/mrr               — MRR trend (12 months)
 * GET /api/platform/analytics/storage           — Storage usage breakdown
 * GET /api/platform/analytics/organizations     — Org activity ranking
 * GET /api/platform/analytics/api-usage         — API request volume by org
 */

import { Router } from 'express';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import * as service from './platform.analytics.service';

const router = Router();
router.use(authenticatePlatform);
router.use(authorize('orgs:read'));

// ── Dashboard overview ─────────────────────────────────────────────────────────
router.get('/overview', async (_req, res, next) => {
  try {
    const data = await service.getPlatformOverview();
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Onboarding funnel ──────────────────────────────────────────────────────────
router.get('/onboarding-funnel', async (_req, res, next) => {
  try {
    const data = await service.getOnboardingFunnel();
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── MRR trend (12 months) ──────────────────────────────────────────────────────
router.get('/mrr', async (_req, res, next) => {
  try {
    const data = await service.getMrrTrend();
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Storage usage breakdown ────────────────────────────────────────────────────
router.get('/storage', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const data = await service.getStorageUsageBreakdown(limit);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Organization activity ranking ──────────────────────────────────────────────
router.get('/organizations', async (req, res, next) => {
  try {
    const { limit, sortBy } = req.query as Record<string, string>;
    const data = await service.getOrganizationRanking({
      limit: limit ? Number(limit) : 10,
      sortBy: sortBy ?? 'seats',
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── API usage by org ───────────────────────────────────────────────────────────
router.get('/api-usage', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const data = await service.getApiUsage(limit);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
