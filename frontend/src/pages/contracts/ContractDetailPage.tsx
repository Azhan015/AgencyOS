import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, PenLine, CheckCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      const res = await api.get(`/contracts/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/contracts/${id}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      toast.success('Contract sent for signing');
    },
    onError: () => toast.error('Failed to send contract'),
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/contracts/${id}/sign`, {
        svg: '<svg></svg>', // Simplified e-signature acknowledgment
        signerName: user?.name || 'Client',
        isAgency: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      toast.success('Contract signed successfully');
    },
    onError: () => toast.error('Failed to sign contract'),
  });

  const canManage = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);
  const isClient = user?.role === 'CLIENT';
  const contract = data?.contract || data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Contract not found.</p>
        <Link
          to="/contracts"
          className="inline-flex items-center justify-center mt-4 h-10 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Back to Contracts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/contracts"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{contract.title}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {contract.type} · {contract.clientId?.companyName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={contract.status} />
          {canManage && contract.status === 'DRAFT' && (
            <Button onClick={() => sendMutation.mutate()} loading={sendMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Send for Signing
            </Button>
          )}
          {isClient && ['SENT', 'VIEWED'].includes(contract.status) && (
            <Button
              onClick={() => {
                if (confirm('By clicking Sign, you agree to the terms of this contract.')) {
                  signMutation.mutate();
                }
              }}
              loading={signMutation.isPending}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Sign Contract
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contract body */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contract Terms</CardTitle>
            </CardHeader>
            <CardContent>
              {contract.content ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: contract.content }}
                />
              ) : (
                <p className="text-muted-foreground text-sm">No contract body available.</p>
              )}
            </CardContent>
          </Card>

          {/* Signatures */}
          {(contract.clientSignature?.signedAt || contract.agencySignature?.signedAt) && (
            <Card>
              <CardHeader><CardTitle>Signatures</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contract.clientSignature?.signedAt && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{contract.clientSignature.signerName || 'Client'}</p>
                        <p className="text-xs text-muted-foreground">
                          Client · Signed {formatRelativeTime(contract.clientSignature.signedAt)}
                        </p>
                      </div>
                    </div>
                  )}
                  {contract.agencySignature?.signedAt && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{contract.agencySignature.signerName || 'Agency'}</p>
                        <p className="text-xs text-muted-foreground">
                          Agency · Signed {formatRelativeTime(contract.agencySignature.signedAt)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                <p className="font-medium">{contract.type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                <StatusPill status={contract.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                <p className="font-medium">{formatDate(contract.createdAt)}</p>
              </div>
              {contract.expiresAt && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Expires</p>
                  <p className="font-medium">{formatDate(contract.expiresAt)}</p>
                </div>
              )}
              {contract.value > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Contract Value</p>
                  <p className="font-medium">${contract.value.toLocaleString()}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{contract.clientId?.companyName}</p>
              <p className="text-muted-foreground">{contract.clientId?.contactName}</p>
              <p className="text-muted-foreground">{contract.clientId?.email}</p>
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
