import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, Mail, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { Navigate } from 'react-router-dom';

const createClientSchema = z.object({
  companyName: z.string().min(1, 'Company name required'),
  contactName: z.string().min(1, 'Contact name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  website: z.string().optional(),
  tier: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).default('STARTER'),
});

type CreateClientForm = z.infer<typeof createClientSchema>;

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Hard gate: only ADMIN/SUPERADMIN/ORGANIZATION_OWNER/ORGANIZATION_ADMIN can access this page
  const canAccess = user && ['ADMIN', 'SUPERADMIN', 'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'].includes(user.orgRole || user.role);
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  const canWrite = canAccess;

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await api.get(`/clients?${params}`);
      return res.data.data;
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateClientForm>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { tier: 'STARTER' },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateClientForm) => {
      // Strip empty strings so the backend URL validator never sees ""
      const payload = {
        ...data,
        website: data.website?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
      };
      const res = await api.post('/clients', payload);
      return res.data.data;
    },
    onSuccess: async (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setCreateOpen(false);
      reset();
      toast.success('Client created');
      // Auto-send invitation email after creating
      try {
        await api.post(`/clients/${client._id}/invite`);
        toast.success(`Invitation sent to ${client.email}`);
      } catch {
        toast('Client created. Send invitation from the client card.', { icon: '📧' });
      }
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (status === 409) {
        toast.error(msg || 'A client with this email already exists.');
      } else {
        toast.error(msg || 'Failed to create client. Please try again.');
      }
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (clientId: string) => {
      await api.post(`/clients/${clientId}/invite`);
    },
    onSuccess: () => toast.success('Invitation email sent'),
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg || 'Failed to send invitation. Check your email configuration.');
    },
  });

  const clients = data?.clients || [];

  const tierColors: Record<string, string> = {
    STARTER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    GROWTH: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    ENTERPRISE: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1">{data?.total || 0} total clients</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Clients grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No clients yet</h3>
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)} className="mt-3">
              <Plus className="mr-2 h-4 w-4" />
              Add First Client
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client: {
            _id: string;
            companyName: string;
            contactName: string;
            email: string;
            status: string;
            tier: string;
            assignedPM?: { name: string };
          }) => (
            <Card key={client._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{client.companyName}</h3>
                    <p className="text-sm text-muted-foreground">{client.contactName}</p>
                  </div>
                  <StatusPill status={client.status} />
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{client.email}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColors[client.tier]}`}>
                    {client.tier}
                  </span>
                  <div className="flex gap-1">
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => inviteMutation.mutate(client._id)}
                        title={client.status === 'INVITED' ? 'Resend invitation' : 'Send invitation'}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Link
                      to={`/admin/clients/${client._id}`}
                      className="inline-flex items-center justify-center h-8 rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Client Dialog — only ADMIN/SUPERADMIN */}
      {canWrite && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <Input label="Company Name" placeholder="Acme Corp" error={errors.companyName?.message} {...register('companyName')} />
              <Input label="Contact Name" placeholder="John Smith" error={errors.contactName?.message} {...register('contactName')} />
              <Input label="Email" type="email" placeholder="john@acme.com" error={errors.email?.message} {...register('email')} />
              <Input label="Phone" type="tel" placeholder="+1 555 000 0000" {...register('phone')} />
              <Input label="Website" placeholder="https://acme.com" {...register('website')} />
              <div>
                <label className="block text-sm font-medium mb-1.5">Tier</label>
                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('tier')}>
                  <option value="STARTER">Starter</option>
                  <option value="GROWTH">Growth</option>
                  <option value="ENTERPRISE">Enterprise</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending}>Create & Invite</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
