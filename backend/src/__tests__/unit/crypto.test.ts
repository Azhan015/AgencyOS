/**
 * Unit Tests — lib/crypto.ts
 * Tests all cryptographic utility functions in isolation (no DB, no network).
 */
import {
  encrypt,
  decrypt,
  hashSHA256,
  generateSecureToken,
  generateOTP,
  generateInvoiceNumber,
  generateSlug,
  timingSafeEqual,
} from '../../lib/crypto';

describe('crypto utilities', () => {
  // ── encrypt / decrypt ──────────────────────────────────────────────────────
  describe('encrypt / decrypt', () => {
    it('round-trips a plain string', () => {
      const plain = 'hello world';
      const cipher = encrypt(plain);
      expect(decrypt(cipher)).toBe(plain);
    });

    it('produces different ciphertext for the same input (random IV)', () => {
      const plain = 'same input';
      expect(encrypt(plain)).not.toBe(encrypt(plain));
    });

    it('throws on malformed ciphertext', () => {
      expect(() => decrypt('bad:data')).toThrow();
    });

    it('round-trips unicode / special characters', () => {
      const plain = '日本語テスト 🚀 <script>alert(1)</script>';
      expect(decrypt(encrypt(plain))).toBe(plain);
    });
  });

  // ── hashSHA256 ─────────────────────────────────────────────────────────────
  describe('hashSHA256', () => {
    it('returns a 64-char hex string', () => {
      const h = hashSHA256('test');
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic', () => {
      expect(hashSHA256('abc')).toBe(hashSHA256('abc'));
    });

    it('different inputs produce different hashes', () => {
      expect(hashSHA256('a')).not.toBe(hashSHA256('b'));
    });
  });

  // ── generateSecureToken ────────────────────────────────────────────────────
  describe('generateSecureToken', () => {
    it('returns a hex string of the correct length', () => {
      const token = generateSecureToken(32);
      // 32 bytes → 64 hex chars
      expect(token).toHaveLength(64);
    });

    it('generates unique tokens', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken(16)));
      expect(tokens.size).toBe(100);
    });
  });

  // ── generateOTP ────────────────────────────────────────────────────────────
  describe('generateOTP', () => {
    it('returns a 6-digit string by default', () => {
      const otp = generateOTP();
      expect(otp).toHaveLength(6);
      expect(otp).toMatch(/^\d+$/);
    });

    it('respects custom length', () => {
      expect(generateOTP(4)).toHaveLength(4);
      expect(generateOTP(8)).toHaveLength(8);
    });
  });

  // ── generateInvoiceNumber ──────────────────────────────────────────────────
  describe('generateInvoiceNumber', () => {
    it('follows INV-YYYY-NNNN format', () => {
      const inv = generateInvoiceNumber(1);
      const year = new Date().getFullYear();
      expect(inv).toBe(`INV-${year}-0001`);
    });

    it('pads sequence to 4 digits', () => {
      expect(generateInvoiceNumber(42)).toMatch(/INV-\d{4}-0042/);
    });
  });

  // ── generateSlug ───────────────────────────────────────────────────────────
  describe('generateSlug', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      const slug = generateSlug('Acme Corp');
      expect(slug).toMatch(/^acme-corp-[0-9a-f]{6}$/);
    });

    it('strips special characters', () => {
      const slug = generateSlug('Hello & World!');
      expect(slug).not.toContain('&');
      expect(slug).not.toContain('!');
    });

    it('appends a random hex suffix for uniqueness', () => {
      const a = generateSlug('Test');
      const b = generateSlug('Test');
      expect(a).not.toBe(b);
    });
  });

  // ── timingSafeEqual ────────────────────────────────────────────────────────
  describe('timingSafeEqual', () => {
    it('returns true for equal strings', () => {
      expect(timingSafeEqual('abc', 'abc')).toBe(true);
    });

    it('returns false for different strings of same length', () => {
      expect(timingSafeEqual('abc', 'xyz')).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });
  });
});
