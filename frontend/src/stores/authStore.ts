import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
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
      // On rehydration, clear auth if the stored access token is already expired.
      // The refresh interceptor will handle getting a new token on the first API call,
      // but if the refresh cookie is also gone the user should be sent to login.
      onRehydrateStorage: () => (state) => {
        if (state && state.accessToken) {
          const expiry = getTokenExpiry(state.accessToken);
          // Give a 30-second buffer — if token expires within 30s treat as expired
          if (expiry === 0 || expiry < Date.now() + 30_000) {
            // Stored token is invalid/expired. Clear the full auth state to avoid
            // rendering protected routes with stale user/isAuthenticated values.
            state.accessToken = null;
            state.user = null;
            state.isAuthenticated = false;
          }
        }
      },
    }
  )
);
