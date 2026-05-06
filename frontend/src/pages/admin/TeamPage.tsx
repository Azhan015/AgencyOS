import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Mail, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/services/api';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(1, 'Name required'),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR']),
});

type InviteForm = z.infer<typeof inviteSchema>;

interface TeamMember {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export function TeamPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'team'],
    queryFn: async () => {
      const res = await api.get('/admin/team');
      return res.data.data as TeamMember[];
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'CONTRIBUTOR' },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteForm) => {
      const res = await api.post('/admin/team/invite', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
      setInviteOpen(false);
      reset();
      toast.success('Invitation sent — they will receive an email with login credentials');
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (status === 409) {
        toast.error(msg || 'A user with this email already exists in the system.');
      } else {
        toast.error(msg || 'Failed to send invitation. Check your email configuration.');
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await api.patch(`/admin/team/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/admin/team/${id}/${isActive ? 'deactivate' : 'activate'}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const members = data || [];

  const roleColors: Record<string, string> = {
    SUPERADMIN: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    ADMIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    PROJECT_MANAGER: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    CONTRIBUTOR: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1 text-sm">{members.length} team members</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', count: members.length, color: 'text-foreground' },
          { label: 'Active', count: members.filter(m => m.isActive).length, color: 'text-emerald-600' },
          { label: 'Admins', count: members.filter(m => ['ADMIN', 'SUPERADMIN'].includes(m.role)).length, color: 'text-blue-600' },
          { label: 'Inactive', count: members.filter(m => !m.isActive).length, color: 'text-muted-foreground' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No team members yet</h3>
          <Button onClick={() => setInviteOpen(true)} className="mt-3">
            <Plus className="mr-2 h-4 w-4" />
            Invite First Member
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {members.map((member) => (
            <div key={member._id} className="flex items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4">
              <UserAvatar name={member.name} size="sm" className="flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{member.name}</p>
                  {!member.isActive && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Inactive</span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    {member.email}
                  </span>
                  {member.lastLoginAt && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Last login {formatDate(member.lastLoginAt)}
                    </span>
                  )}
                </div>
                {/* Mobile: role + actions below name */}
                <div className="flex items-center gap-2 mt-2 sm:hidden">
                  {member.role !== 'SUPERADMIN' && (
                    <select
                      value={member.role}
                      onChange={(e) => updateRoleMutation.mutate({ id: member._id, role: e.target.value })}
                      className="text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="PROJECT_MANAGER">Project Manager</option>
                      <option value="CONTRIBUTOR">Contributor</option>
                    </select>
                  )}
                  {member.role === 'SUPERADMIN' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[member.role]}`}>
                      <Shield className="inline h-3 w-3 mr-1" />
                      Superadmin
                    </span>
                  )}
                  {member.role !== 'SUPERADMIN' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate({ id: member._id, isActive: member.isActive })}
                      loading={toggleActiveMutation.isPending}
                      className={`text-xs h-7 px-2 ${member.isActive ? 'text-red-500 hover:text-red-600' : 'text-emerald-600 hover:text-emerald-700'}`}
                    >
                      {member.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Desktop: role + actions inline */}
              {member.role !== 'SUPERADMIN' && (
                <select
                  value={member.role}
                  onChange={(e) => updateRoleMutation.mutate({ id: member._id, role: e.target.value })}
                  className="hidden sm:block text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="CONTRIBUTOR">Contributor</option>
                </select>
              )}

              {member.role === 'SUPERADMIN' && (
                <span className={`hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[member.role]}`}>
                  <Shield className="inline h-3 w-3 mr-1" />
                  Superadmin
                </span>
              )}

              {member.role !== 'SUPERADMIN' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleActiveMutation.mutate({ id: member._id, isActive: member.isActive })}
                  loading={toggleActiveMutation.isPending}
                  className={`hidden sm:flex ${member.isActive ? 'text-red-500 hover:text-red-600' : 'text-emerald-600 hover:text-emerald-700'}`}
                >
                  {member.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => inviteMutation.mutate(d))} className="space-y-4">
            <Input label="Full Name" placeholder="Jane Smith" error={errors.name?.message} {...register('name')} />
            <Input label="Email" type="email" placeholder="jane@agency.com" error={errors.email?.message} {...register('email')} />
            <div>
              <label className="block text-sm font-medium mb-1.5">Role</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('role')}>
                <option value="CONTRIBUTOR">Contributor</option>
                <option value="PROJECT_MANAGER">Project Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" loading={inviteMutation.isPending}>Send Invitation</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
