import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface Approval {
  _id: string;
  title: string;
  description?: string;
  status: string;
  projectId?: { name: string };
  requestedBy?: { name: string };
  reviewedBy?: { name: string };
  createdAt: string;
  reviewedAt?: string;
  feedback?: string;
  attachments?: Array<{ url: string; originalName: string }>;
}

export function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [feedback, setFeedback] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/approvals?${params}`);
      return res.data.data;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, feedbackText }: { id: string; action: 'approve' | 'reject'; feedbackText?: string }) => {
      await api.post(`/approvals/${id}/review`, { action, feedback: feedbackText });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setSelectedApproval(null);
      setFeedback('');
      toast.success('Review submitted');
    },
    onError: () => toast.error('Failed to submit review'),
  });

  // ADMIN/SUPERADMIN/PROJECT_MANAGER can approve on behalf of agency
  // CLIENT can approve/reject their own deliverables
  const canReview = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER', 'CLIENT'].includes(user.role);
  const isClient = user?.role === 'CLIENT';
  const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'];
  const approvals: Approval[] = data?.approvals || [];

  const statusIcon = (status: string) => {
    if (status === 'APPROVED') return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (status === 'REJECTED') return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === 'REVISION_REQUESTED') return <MessageSquare className="h-4 w-4 text-amber-500" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-muted-foreground mt-1">{data?.total || 0} total approvals</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending', count: approvals.filter(a => a.status === 'PENDING').length, color: 'text-amber-600' },
          { label: 'Approved', count: approvals.filter(a => a.status === 'APPROVED').length, color: 'text-emerald-600' },
          { label: 'Rejected', count: approvals.filter(a => a.status === 'REJECTED').length, color: 'text-red-500' },
          { label: 'Revision', count: approvals.filter(a => a.status === 'REVISION_REQUESTED').length, color: 'text-blue-500' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.count}</p>
            </CardContent>
          </Card>
        ))}
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
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Approvals list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No approvals found</h3>
          <p className="text-sm text-muted-foreground">Approval requests from projects will appear here.</p>
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {approvals.map((approval) => (
            <div
              key={approval._id}
              className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-accent transition-colors cursor-pointer"
              onClick={() => setSelectedApproval(approval)}
            >
              <div className="flex-shrink-0">{statusIcon(approval.status)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{approval.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {approval.projectId?.name && `${approval.projectId.name} · `}
                  {formatRelativeTime(approval.createdAt)}
                </p>
              </div>
              <StatusPill status={approval.status} />
              {/* Quick approve button — hidden on mobile, use dialog instead */}
              {canReview && approval.status === 'PENDING' && (
                <div className="hidden sm:flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => reviewMutation.mutate({ id: approval._id, action: 'approve' })}
                    loading={reviewMutation.isPending}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => setSelectedApproval(approval)}
                  >
                    Review
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approval detail dialog */}
      <Dialog open={!!selectedApproval} onOpenChange={(open) => !open && setSelectedApproval(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedApproval?.title}</DialogTitle>
          </DialogHeader>
          {selectedApproval && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selectedApproval.requestedBy && (
                  <UserAvatar name={selectedApproval.requestedBy.name} size="sm" />
                )}
                <div>
                  <p className="text-sm font-medium">{selectedApproval.requestedBy?.name}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(selectedApproval.createdAt)}</p>
                </div>
                <div className="ml-auto">
                  <StatusPill status={selectedApproval.status} />
                </div>
              </div>

              {selectedApproval.description && (
                <p className="text-sm text-muted-foreground">{selectedApproval.description}</p>
              )}

              {selectedApproval.attachments && selectedApproval.attachments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Attachments</p>
                  {selectedApproval.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      {att.originalName}
                    </a>
                  ))}
                </div>
              )}

              {selectedApproval.feedback && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Feedback</p>
                  <p className="text-sm">{selectedApproval.feedback}</p>
                </div>
              )}

              {canReview && selectedApproval.status === 'PENDING' && (
                <div className="space-y-3 pt-2 border-t">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Add feedback (optional)..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => reviewMutation.mutate({ id: selectedApproval._id, action: 'approve', feedbackText: feedback })}
                      loading={reviewMutation.isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => reviewMutation.mutate({ id: selectedApproval._id, action: 'reject', feedbackText: feedback })}
                      loading={reviewMutation.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
