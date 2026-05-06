import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Settings, Users, Calendar, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/services/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { TaskBoard } from '@/components/modules/projects/TaskBoard';
import { MilestoneTimeline } from '@/components/modules/projects/MilestoneTimeline';
import { ProjectFiles } from '@/components/modules/projects/ProjectFiles';
import { ProjectMessages } from '@/components/modules/projects/ProjectMessages';
import { ProjectApprovals } from '@/components/modules/projects/ProjectApprovals';
import { ProjectInvoices } from '@/components/modules/projects/ProjectInvoices';

type Tab = 'overview' | 'tasks' | 'files' | 'messages' | 'approvals' | 'invoices';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await api.get(`/projects/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'files', label: 'Files' },
    { id: 'messages', label: 'Messages' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'invoices', label: 'Invoices' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Project not found</p>
        <Link
          to="/projects"
          className="inline-flex items-center justify-center mt-4 h-10 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/projects" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold">{project.name}</h1>
            <StatusPill status={project.status} />
          </div>
          <p className="text-muted-foreground text-sm">{project.clientId?.companyName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Budget</span>
            </div>
            <p className="font-semibold">{formatCurrency(project.budget, project.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs">Due Date</span>
            </div>
            <p className="font-semibold">{project.endDate ? formatDate(project.endDate) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <span className="text-xs">Health Score</span>
            </div>
            <div className="flex items-center gap-2">
              <p className={`font-semibold ${project.healthScore >= 70 ? 'text-emerald-600' : project.healthScore >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                {project.healthScore}%
              </p>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${project.healthScore >= 70 ? 'bg-emerald-500' : project.healthScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${project.healthScore}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Team</span>
            </div>
            <div className="flex -space-x-2">
              {project.pm && <UserAvatar name={project.pm.name} src={project.pm.avatar} size="sm" className="ring-2 ring-background" />}
              {project.contributors?.slice(0, 3).map((c: { _id: string; name: string; avatar?: string }) => (
                <UserAvatar key={c._id} name={c.name} src={c.avatar} size="sm" className="ring-2 ring-background" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <MilestoneTimeline milestones={project.milestones} projectId={id!} />
            {project.description && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground text-sm">{project.description}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {activeTab === 'tasks' && <TaskBoard projectId={id!} />}
        {activeTab === 'files' && <ProjectFiles projectId={id!} clientId={project.clientId?._id} />}
        {activeTab === 'messages' && <ProjectMessages projectId={id!} />}
        {activeTab === 'approvals' && <ProjectApprovals projectId={id!} />}
        {activeTab === 'invoices' && <ProjectInvoices projectId={id!} clientId={project.clientId?._id} />}
      </div>
    </div>
  );
}
