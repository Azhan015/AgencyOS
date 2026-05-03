import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Receipt, CheckSquare, MessageSquare, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  color: string;
  href: string;
}

function KPICard({ title, value, icon: Icon, trend, color, href }: KPICardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardRef.current) {
      gsap.from(cardRef.current, { opacity: 0, y: 20, duration: 0.4, ease: 'power3.out' });
    }
  }, []);

  return (
    <Link to={href}>
      <Card ref={cardRef} className="hover:shadow-md transition-shadow cursor-pointer group">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
              <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
              {trend !== undefined && (
                <div className={`flex items-center gap-1 mt-1 text-xs ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{Math.abs(trend)}% vs last month</span>
                </div>
              )}
            </div>
            <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0 ml-3 group-hover:scale-110 transition-transform`}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user && ['ADMIN', 'SUPERADMIN'].includes(user.role);
  const canCreateProject = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', 'agency'],
    queryFn: async () => {
      const res = await api.get('/analytics/agency');
      return res.data.data;
    },
    enabled: !!isAdmin,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });

  const { data: projectsData, isLoading: projectsLoading, isError: projectsError } = useQuery({
    queryKey: ['projects', 'recent'],
    queryFn: async () => {
      const res = await api.get('/projects?limit=5&status=ACTIVE');
      return res.data.data;
    },
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const res = await api.get('/notifications?limit=5');
      return res.data.data;
    },
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">
          {greeting()}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Here's what's happening today</p>
      </div>

      {/* Only show error banner for unexpected failures (not auth errors) */}
      {projectsError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Could not load projects. Please refresh the page.
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {isAdmin ? (
        analyticsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 sm:p-6">
                  <Skeleton className="h-14 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KPICard
              title="Active Projects"
              value={analytics?.projects?.active ?? 0}
              icon={FolderKanban}
              color="bg-blue-500"
              href="/projects"
            />
            <KPICard
              title="Outstanding Revenue"
              value={formatCurrency(analytics?.revenue?.outstanding ?? 0)}
              icon={Receipt}
              trend={analytics?.revenue?.growth}
              color="bg-emerald-500"
              href="/invoices"
            />
            <KPICard
              title="Active Clients"
              value={analytics?.clients?.active ?? 0}
              icon={MessageSquare}
              color="bg-violet-500"
              href="/admin/clients"
            />
            <KPICard
              title="Overdue Invoices"
              value={analytics?.invoices?.overdue ?? 0}
              icon={CheckSquare}
              color="bg-amber-500"
              href="/invoices?status=OVERDUE"
            />
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <KPICard
            title="My Projects"
            value={projectsData?.total ?? 0}
            icon={FolderKanban}
            color="bg-blue-500"
            href="/projects"
          />
          <KPICard
            title="Pending Approvals"
            value="—"
            icon={CheckSquare}
            color="bg-amber-500"
            href="/approvals"
          />
          <KPICard
            title="Messages"
            value="—"
            icon={MessageSquare}
            color="bg-violet-500"
            href="/messages"
          />
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 px-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base">Recent Projects</CardTitle>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {projectsLoading ? (
                <div className="p-4 sm:p-6 space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !projectsData?.projects || projectsData.projects.length === 0 ? (
                <div className="py-10 sm:py-12 text-center text-muted-foreground">
                  <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active projects</p>
                  {/* Only show "Create project" for roles that can create */}
                  {canCreateProject && (
                    <Link
                      to="/projects"
                      className="inline-flex items-center justify-center mt-3 h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Create project
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {projectsData.projects.map((project: {
                    _id: string;
                    name: string;
                    status: string;
                    healthScore: number;
                    pm: { name: string; avatar?: string };
                    clientId: { companyName: string };
                    endDate?: string;
                  }) => (
                    <Link
                      key={project._id}
                      to={`/projects/${project._id}`}
                      className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 hover:bg-accent transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {project.clientId?.companyName}
                        </p>
                      </div>
                      {/* Hide health bar on very small screens */}
                      <div className="hidden sm:flex items-center gap-2">
                        <div className="h-1.5 w-14 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${project.healthScore}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-7">
                          {project.healthScore}%
                        </span>
                      </div>
                      <StatusPill status={project.status} />
                      {project.pm && (
                        <UserAvatar
                          name={project.pm.name}
                          src={project.pm.avatar}
                          size="sm"
                          className="hidden sm:flex"
                        />
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed */}
        <div>
          <Card>
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!notificationsData?.notifications || notificationsData.notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm px-4">
                  No recent activity
                </div>
              ) : (
                <div className="divide-y">
                  {notificationsData.notifications.slice(0, 6).map((notif: {
                    _id: string;
                    title: string;
                    body: string;
                    createdAt: string;
                    isRead: boolean;
                  }) => (
                    <div
                      key={notif._id}
                      className={`px-4 py-3 ${!notif.isRead ? 'bg-primary/5' : ''}`}
                    >
                      <p className="text-sm font-medium">{notif.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {notif.body}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(notif.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
