import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/services/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name required'),
  clientId: z.string().min(1, 'Client required'),
  type: z.enum(['WEBSITE', 'BRANDING', 'CAMPAIGN', 'CUSTOM']),
  budget: z.number().min(0).optional(),
  currency: z.string().default('USD'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

export function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', { search, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/projects?${params}`);
      return res.data.data;
    },
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'list'],
    queryFn: async () => {
      const res = await api.get('/clients?limit=100');
      return res.data.data;
    },
    enabled: ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user?.role || ''),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { type: 'CUSTOM', currency: 'USD' },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      const res = await api.post('/projects', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCreateOpen(false);
      reset();
      toast.success('Project created');
    },
    onError: () => toast.error('Failed to create project'),
  });

  const canCreate = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);

  const statuses = ['SCOPING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'ARCHIVED'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">{data?.total || 0} total projects</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-48 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 w-full sm:w-auto scrollbar-hide">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap ${!statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
          >
            All
          </button>
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Projects grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : data?.projects?.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No projects found</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {search ? `No results for "${search}"` : 'Get started by creating your first project'}
          </p>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.projects?.map((project: {
            _id: string;
            name: string;
            status: string;
            healthScore: number;
            budget: number;
            currency: string;
            endDate?: string;
            pm: { name: string; avatar?: string };
            clientId: { companyName: string };
            milestones: Array<{ status: string }>;
          }) => (
            <Link key={project._id} to={`/projects/${project._id}`}>
              <Card className="hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{project.clientId?.companyName}</p>
                    </div>
                    <StatusPill status={project.status} />
                  </div>

                  {/* Health score */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Health</span>
                      <span className={`font-medium ${project.healthScore >= 70 ? 'text-emerald-600' : project.healthScore >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {project.healthScore}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${project.healthScore >= 70 ? 'bg-emerald-500' : project.healthScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${project.healthScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Milestones */}
                  {project.milestones?.length > 0 && (
                    <div className="flex gap-1 mb-3">
                      {project.milestones.slice(0, 5).map((m, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${m.status === 'COMPLETED' ? 'bg-primary' : m.status === 'IN_PROGRESS' ? 'bg-primary/40' : 'bg-muted'}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      {project.budget > 0 && (
                        <p className="text-sm font-medium">{formatCurrency(project.budget, project.currency)}</p>
                      )}
                      {project.endDate && (
                        <p className="text-xs text-muted-foreground">Due {formatDate(project.endDate)}</p>
                      )}
                    </div>
                    {project.pm && <UserAvatar name={project.pm.name} src={project.pm.avatar} size="sm" />}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <Input label="Project Name" placeholder="Website Redesign" error={errors.name?.message} {...register('name')} />

            <div>
              <label className="block text-sm font-medium mb-1.5">Client</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('clientId')}>
                <option value="">Select client...</option>
                {clientsData?.clients?.map((c: { _id: string; companyName: string }) => (
                  <option key={c._id} value={c._id}>{c.companyName}</option>
                ))}
              </select>
              {errors.clientId && <p className="text-xs text-destructive mt-1">{errors.clientId.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Type</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('type')}>
                <option value="WEBSITE">Website</option>
                <option value="BRANDING">Branding</option>
                <option value="CAMPAIGN">Campaign</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Budget" type="number" placeholder="0" {...register('budget', { valueAsNumber: true })} />
              <div>
                <label className="block text-sm font-medium mb-1.5">Currency</label>
                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('currency')}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Start Date" type="date" {...register('startDate')} />
              <Input label="End Date" type="date" {...register('endDate')} />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending}>Create Project</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
