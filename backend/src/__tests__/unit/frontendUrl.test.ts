/**
 * Unit Tests — lib/frontendUrl.ts
 * Verifies the URL resolution priority: Origin > Referer > env fallback.
 */
import { getFrontendUrl } from '../../lib/frontendUrl';
import type { Request } from 'express';

function makeReq(overrides: Partial<{ origin: string; referer: string }> = {}): Request {
  return {
    headers: {
      origin: overrides.origin,
      referer: overrides.referer,
    },
  } as unknown as Request;
}

describe('getFrontendUrl', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('returns Origin header when it is a known local origin', () => {
    const req = makeReq({ origin: 'http://localhost:5173' });
    expect(getFrontendUrl(req)).toBe('http://localhost:5173');
  });

  it('returns localhost:3000 when Origin is Docker port', () => {
    const req = makeReq({ origin: 'http://localhost:3000' });
    expect(getFrontendUrl(req)).toBe('http://localhost:3000');
  });

  it('falls back to Referer when Origin is absent', () => {
    const req = makeReq({ referer: 'http://localhost:3000/auth/login' });
    expect(getFrontendUrl(req)).toBe('http://localhost:3000');
  });

  it('falls back to FRONTEND_URL env when no headers', () => {
    const req = makeReq();
    expect(getFrontendUrl(req)).toBe('http://localhost:5173');
  });

  it('returns FRONTEND_URL when called without a request', () => {
    expect(getFrontendUrl()).toBe('http://localhost:5173');
  });

  it('strips trailing slash from env fallback', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173/';
    expect(getFrontendUrl()).toBe('http://localhost:5173');
  });

  it('rejects unknown origins and falls back to env', () => {
    const req = makeReq({ origin: 'http://evil.com' });
    expect(getFrontendUrl(req)).toBe('http://localhost:5173');
  });
});
