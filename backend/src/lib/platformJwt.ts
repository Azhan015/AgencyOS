/**
 * Platform JWT — re-exports from jwt.ts for clarity.
 * Platform tokens use separate secrets (PLATFORM_JWT_ACCESS_SECRET / PLATFORM_JWT_REFRESH_SECRET)
 * and carry a different payload shape than org-user tokens.
 *
 * Import from here in platform-specific code for explicit intent.
 */
export {
  signPlatformAccessToken,
  signPlatformRefreshToken,
  verifyPlatformAccessToken,
  verifyPlatformRefreshToken,
  type PlatformAccessTokenPayload,
  type PlatformRefreshTokenPayload,
} from './jwt';
