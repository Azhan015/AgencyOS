/**
 * Unit Tests — lib/jwt.ts
 * Tests token signing and verification in isolation.
 */
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from '../../lib/jwt';

describe('JWT utilities', () => {
  const accessPayload = {
    sub: 'user123',
    role: 'ADMIN',
    orgRole: 'ORGANIZATION_ADMIN',
    organizationId: 'org-abc-123',
    sessionId: 'sess-abc',
  };

  const refreshPayload = {
    sub: 'user123',
    sessionId: 'sess-abc',
    family: 'family-xyz',
    organizationId: 'org-abc-123',
  };

  // ── Access tokens ──────────────────────────────────────────────────────────
  describe('signAccessToken / verifyAccessToken', () => {
    it('signs and verifies a valid access token', () => {
      const token = signAccessToken(accessPayload);
      const decoded = verifyAccessToken(token);
      expect(decoded.sub).toBe('user123');
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.sessionId).toBe('sess-abc');
      expect(decoded.type).toBe('access');
    });

    it('includes clientId when provided', () => {
      const token = signAccessToken({ ...accessPayload, clientId: 'client-1' });
      const decoded = verifyAccessToken(token);
      expect(decoded.clientId).toBe('client-1');
    });

    it('throws AuthenticationError on tampered token', () => {
      const token = signAccessToken(accessPayload);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyAccessToken(tampered)).toThrow('Invalid token');
    });

    it('throws AuthenticationError when a refresh token is passed as access', () => {
      const refresh = signRefreshToken(refreshPayload);
      // jwt.verify with the access secret will fail because the refresh token
      // was signed with the refresh secret — caught as JsonWebTokenError
      expect(() => verifyAccessToken(refresh)).toThrow('Invalid token');
    });
  });

  // ── Refresh tokens ─────────────────────────────────────────────────────────
  describe('signRefreshToken / verifyRefreshToken', () => {
    it('signs and verifies a valid refresh token', () => {
      const token = signRefreshToken(refreshPayload);
      const decoded = verifyRefreshToken(token);
      expect(decoded.sub).toBe('user123');
      expect(decoded.family).toBe('family-xyz');
      expect(decoded.type).toBe('refresh');
    });

    it('throws AuthenticationError on tampered refresh token', () => {
      const token = signRefreshToken(refreshPayload);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyRefreshToken(tampered)).toThrow('Invalid refresh token');
    });

    it('throws AuthenticationError when an access token is passed as refresh', () => {
      const access = signAccessToken(accessPayload);
      // jwt.verify with the refresh secret will fail because the access token
      // was signed with the access secret — caught as JsonWebTokenError
      expect(() => verifyRefreshToken(access)).toThrow('Invalid refresh token');
    });
  });

  // ── decodeToken ────────────────────────────────────────────────────────────
  describe('decodeToken', () => {
    it('decodes without verifying', () => {
      const token = signAccessToken(accessPayload);
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect((decoded as Record<string, unknown>).sub).toBe('user123');
    });

    it('returns null for garbage input', () => {
      expect(decodeToken('not.a.jwt')).toBeNull();
    });
  });
});
