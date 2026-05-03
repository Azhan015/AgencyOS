import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import {
  LayoutDashboard, FolderKanban, Files, MessageSquare,
  Receipt, FileText, CheckSquare, BarChart3, Settings,
  Users, Zap, ChevronLeft, ChevronRight, Building2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Logo } from '@/components/ui/logo';
import { useEffect } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Files', href: '/files', icon: Files },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Invoices', href: '/invoices', icon: Receipt, roles: ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER', 'CLIENT'] },
  { label: 'Contracts', href: '/contracts', icon: FileText, roles: ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER', 'CLIENT'] },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare },
];

const adminNavItems: NavItem[] = [
  { label: 'Clients', href: '/admin/clients', icon: Building2, roles: ['ADMIN', 'SUPERADMIN'] },
  { label: 'Team', href: '/admin/team', icon: Users, roles: ['ADMIN', 'SUPERADMIN'] },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3, roles: ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'] },
  { label: 'Automations', href: '/admin/automations', icon: Zap, roles: ['ADMIN', 'SUPERADMIN'] },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const { user } = useAuthStore();
  const location = useLocation();

  const isAdmin = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname, setMobileSidebarOpen]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 border-b px-4 flex-shrink-0',
        sidebarCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {sidebarCollapsed ? (
          <img src="/agencyOS.jpg" alt="Agency OS" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <Logo size="md" showText={true} />
        )}
        {/* Close button — mobile only */}
        <button
          onClick={() => setMobileSidebarOpen(false)}
          className="lg:hidden p-1 rounded-md hover:bg-accent text-muted-foreground"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems
          .filter(item => !item.roles || (user && item.roles.includes(user.role)))
          .map((item) => (
            <SidebarNavItem key={item.href} item={item} collapsed={sidebarCollapsed} />
          ))}

        {isAdmin && (
          <>
            <div className={cn('pt-4 pb-2', sidebarCollapsed ? 'px-0' : 'px-2')}>
              {!sidebarCollapsed && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Admin
                </p>
              )}
              {sidebarCollapsed && <div className="h-px bg-border mx-1" />}
            </div>
            {adminNavItems
              .filter(item => !item.roles || (user && item.roles.includes(user.role)))
              .map((item) => (
                <SidebarNavItem key={item.href} item={item} collapsed={sidebarCollapsed} />
              ))}
          </>
        )}
      </nav>

      {/* User + Settings */}
      <div className="border-t p-2 space-y-1 flex-shrink-0">
        <SidebarNavItem
          item={{ label: 'Settings', href: '/settings', icon: Settings }}
          collapsed={sidebarCollapsed}
        />
        {user && (
          <div className={cn(
            'flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent cursor-pointer',
            sidebarCollapsed && 'justify-center'
          )}>
            <UserAvatar name={user.name} src={user.avatar} size="sm" />
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop collapse toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleSidebar}
        className="hidden lg:flex absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-sm"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </Button>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar (always visible, collapsible) ── */}
      <aside
        className={cn(
          'hidden lg:flex fixed left-0 top-0 z-30 h-full border-r bg-card',
          'transition-all duration-300 ease-in-out flex-col',
          sidebarCollapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile sidebar (slide-in drawer) ── */}
      <aside
        className={cn(
          'lg:hidden fixed left-0 top-0 z-30 h-full w-[280px] border-r bg-card',
          'flex flex-col transition-transform duration-300 ease-in-out',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.href}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
          collapsed && 'justify-center px-2'
        )
      }
      title={collapsed ? item.label : undefined}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}
