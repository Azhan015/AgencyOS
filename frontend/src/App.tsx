import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

// Landing page
import { LandingPage } from '@/pages/LandingPage';

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { GoogleCallbackPage } from '@/pages/auth/GoogleCallbackPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { MagicLinkPage } from '@/pages/auth/MagicLinkPage';

// App pages
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ProjectsPage } from '@/pages/projects/ProjectsPage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { FilesPage } from '@/pages/files/FilesPage';
import { MessagesPage } from '@/pages/messages/MessagesPage';
import { InvoicesPage } from '@/pages/invoices/InvoicesPage';
import { InvoiceDetailPage } from '@/pages/invoices/InvoiceDetailPage';
import { ContractsPage } from '@/pages/contracts/ContractsPage';
import { ContractDetailPage } from '@/pages/contracts/ContractDetailPage';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';

// Admin pages
import { ClientsPage } from '@/pages/admin/ClientsPage';
import { ClientDetailPage } from '@/pages/admin/ClientDetailPage';
import { TeamPage } from '@/pages/admin/TeamPage';
import { AnalyticsPage } from '@/pages/admin/AnalyticsPage';
import { AutomationsPage } from '@/pages/admin/AutomationsPage';

// Guard: redirect to /auth/login if not authenticated
function RequireAuth() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  return <AppShell />;
}

// Guard: redirect to /dashboard if already authenticated
function RequireGuest({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Guard: redirect to /dashboard if user doesn't have required role
function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const { theme, setTheme } = useUIStore();

  useEffect(() => {
    setTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        useUIStore.getState().setCommandPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public ─────────────────────────────────────────── */}
        <Route path="/" element={<RequireGuest><LandingPage /></RequireGuest>} />

        {/* ── Auth ───────────────────────────────────────────── */}
        <Route path="/auth/login"          element={<RequireGuest><LoginPage /></RequireGuest>} />
        <Route path="/auth/register"       element={<RequireGuest><RegisterPage /></RequireGuest>} />
        <Route path="/auth/forgot-password" element={<RequireGuest><ForgotPasswordPage /></RequireGuest>} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        {/* Magic link — dedicated isolated page, no RequireGuest wrapper */}
        <Route path="/auth/magic"          element={<MagicLinkPage />} />
        {/* Accept invite — dedicated page for setting password from email link */}
        <Route path="/auth/accept-invite"  element={<AcceptInvitePage />} />
        {/* Google OAuth callback — reads token from URL hash, no auth guard needed */}
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />

        {/* ── Protected app (AppShell layout) ────────────────── */}
        <Route element={<RequireAuth />}>
          <Route path="/dashboard"              element={<DashboardPage />} />
          <Route path="/projects"               element={<ProjectsPage />} />
          <Route path="/projects/:id"           element={<ProjectDetailPage />} />
          <Route path="/files"                  element={<FilesPage />} />
          <Route path="/messages"               element={<MessagesPage />} />
          {/* Invoices & Contracts: not for CONTRIBUTOR */}
          <Route path="/invoices"               element={<RequireRole roles={['ADMIN','SUPERADMIN','PROJECT_MANAGER','CLIENT']}><InvoicesPage /></RequireRole>} />
          <Route path="/invoices/:id"           element={<RequireRole roles={['ADMIN','SUPERADMIN','PROJECT_MANAGER','CLIENT']}><InvoiceDetailPage /></RequireRole>} />
          <Route path="/contracts"              element={<RequireRole roles={['ADMIN','SUPERADMIN','PROJECT_MANAGER','CLIENT']}><ContractsPage /></RequireRole>} />
          <Route path="/contracts/:id"          element={<RequireRole roles={['ADMIN','SUPERADMIN','PROJECT_MANAGER','CLIENT']}><ContractDetailPage /></RequireRole>} />
          <Route path="/approvals"              element={<ApprovalsPage />} />
          <Route path="/settings"               element={<SettingsPage />} />
          {/* Admin-only routes */}
          <Route path="/admin/clients"          element={<RequireRole roles={['ADMIN','SUPERADMIN']}><ClientsPage /></RequireRole>} />
          <Route path="/admin/clients/:id"      element={<RequireRole roles={['ADMIN','SUPERADMIN']}><ClientDetailPage /></RequireRole>} />
          <Route path="/admin/team"             element={<RequireRole roles={['ADMIN','SUPERADMIN']}><TeamPage /></RequireRole>} />
          <Route path="/admin/analytics"        element={<RequireRole roles={['ADMIN','SUPERADMIN','PROJECT_MANAGER']}><AnalyticsPage /></RequireRole>} />
          <Route path="/admin/automations"      element={<RequireRole roles={['ADMIN','SUPERADMIN']}><AutomationsPage /></RequireRole>} />
        </Route>

        {/* ── Catch-all ──────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
