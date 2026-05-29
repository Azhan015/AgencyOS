import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;       // legacy — kept for backward compat
  orgRole?: string;   // new multi-tenant role
  organizationId?: string;
  clientId?: string;
  avatar?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}

/** Decode a JWT and return its expiry timestamp (ms), or 0 if invalid. */
function getTokenExpiry(token: string | null): number {
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      setAccessToken: (accessToken) => set({ accessToken }),

      login: (user, accessToken) => set({
        user,
        accessToken,
        isAuthenticated: true,
      }),

      logout: () => set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      }),

      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null,
      })),
    }),
    {
      name: 'agency-os-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // On rehydration, only clear auth if the stored access token is completely
      // invalid (bad format / missing). If it's merely expired, leave isAuthenticated
      // true so RequireAuth renders the protected route — the API interceptor will
      // silently refresh the token on the first request using the httpOnly refresh
      // cookie. Clearing isAuthenticated here causes an immediate redirect to /login
      // before the refresh can happen, which is the root cause of the "stuck on login"
      // bug.
      onRehydrateStorage: () => (state) => {
        if (state && state.accessToken) {
          const expiry = getTokenExpiry(state.accessToken);
          // Only clear if the token is completely invalid (expiry === 0 means bad format)
          // Expired tokens (expiry < now) are fine — the refresh interceptor handles them
          if (expiry === 0) {
            state.accessToken = null;
            state.user = null;
            state.isAuthenticated = false;
          }
        }
      },
    }
  )
);
