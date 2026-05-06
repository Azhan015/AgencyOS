/**
 * Passport.js Google OAuth 2.0 strategy configuration.
 *
 * What it does:
 *  - When a user clicks "Sign in with Google" on the frontend, they are
 *    redirected to GET /api/v1/auth/google.
 *  - Google authenticates them and redirects back to GOOGLE_CALLBACK_URL
 *    (GET /api/v1/auth/google/callback).
 *  - Passport finds or creates a User document using the Google profile.
 *  - The auth.routes.ts callback handler then issues JWT tokens and redirects
 *    the browser back to the frontend with the access token in the URL hash
 *    so the React app can pick it up.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID      — from Google Cloud Console → OAuth 2.0 Client IDs
 *   GOOGLE_CLIENT_SECRET  — same place
 *   GOOGLE_CALLBACK_URL   — must match the "Authorised redirect URI" in GCP
 *                           e.g. http://localhost:5000/api/v1/auth/google/callback
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User';
import { env } from '../config/env';
import { logger } from './logger';

export function initPassport(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    logger.warn('Google OAuth is not configured — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL missing');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new Error('No email returned from Google'), undefined);
          }

          // Try to find existing user by googleId first, then by email
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            user = await User.findOne({ email });
          }

          if (user) {
            // Link Google ID if not already linked
            if (!user.googleId) {
              user.googleId = profile.id;
              await user.save();
            }
            user.lastLoginAt = new Date();
            await user.save();
            return done(null, user as unknown as Express.User);
          }

          // Create new user from Google profile
          // Derive a safe name: displayName → given+family → email prefix → 'User'
          const derivedName =
            profile.displayName?.trim() ||
            [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(' ').trim() ||
            email.split('@')[0] ||
            'User';

          const newUser = await User.create({
            email,
            name: derivedName,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value,
            role: 'CLIENT', // Default role — promote via admin panel
            isActive: true,
          });

          logger.info({ email, googleId: profile.id }, 'New user created via Google OAuth');
          return done(null, newUser as unknown as Express.User);
        } catch (error) {
          logger.error({ error }, 'Google OAuth strategy error');
          return done(error as Error, undefined);
        }
      }
    )
  );

  // Minimal serialization — we use stateless JWT so we only need this for
  // the OAuth redirect flow (passport needs it internally).
  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as { _id: unknown })._id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      done(null, user as unknown as Express.User | null);
    } catch (err) {
      done(err, null);
    }
  });
}
