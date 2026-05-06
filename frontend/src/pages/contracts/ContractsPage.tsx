import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Send, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

export function ContractsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/contracts?${params}`);
      return res.data.data;
    },
  });

  const sendContract = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/contracts/${id}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success('Contract sent');
    },
  });

  const canCreate = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);
  const statuses = ['DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'EXECUTED', 'EXPIRED'];
  const contracts = data?.contracts || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Contracts</h1>
          <p className="text-muted-foreground mt-1 text-sm">{data?.total || 0} total contracts</p>
        </div>
        {canCreate && (
          <Button onClick={() => toast('Contract creation coming soon — use the project contracts tab', { icon: '📄' })} className="self-start sm:self-auto">
            <Plus className="mr-2 h-4 w-4" />
            New Contract
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
        >
          All
        </button>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No contracts found</h3>
          {canCreate && (
            <Button className="mt-3" onClick={() => toast('Contract creation coming soon — use the project contracts tab', { icon: '📄' })}>
              Create Contract
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {contracts.map((contract: {
            _id: string;
            title: string;
            type: string;
            status: string;
            clientId: { companyName: string };
            createdAt: string;
            expiresAt?: string;
          }) => (
            <div key={contract._id} className="flex items-center gap-4 px-5 py-4 hover:bg-accent transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{contract.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {contract.type} · {contract.clientId?.companyName} · {formatRelativeTime(contract.createdAt)}
                </p>
              </div>
              <StatusPill status={contract.status} />
              <div className="flex gap-1">
                {contract.status === 'DRAFT' && canCreate && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => sendContract.mutate(contract._id)}
                    title="Send for signing"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
                {['SENT', 'VIEWED'].includes(contract.status) && user?.role === 'CLIENT' && (
                  <Link
                    to={`/contracts/${contract._id}`}
                    className="inline-flex items-center gap-1 h-8 rounded-md px-3 text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    Sign
                  </Link>
                )}
                <Link
                  to={`/contracts/${contract._id}`}
                  className="inline-flex items-center justify-center h-8 rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
