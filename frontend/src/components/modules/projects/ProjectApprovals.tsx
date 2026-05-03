import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle, XCircle, RotateCcw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

interface ProjectApprovalsProps {
  projectId: string;
}

export function ProjectApprovals({ projectId }: ProjectApprovalsProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: async () => {
      const res = await api.get(`/approvals?projectId=${projectId}`);
      return res.data.data;
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/approvals/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] });
      toast.success('Deliverable approved!');
    },
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/approvals/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] });
      setRejectOpen(false);
      setReason('');
      toast.success('Rejection submitted');
    },
  });

  const requestRevision = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      await api.post(`/approvals/${id}/request-revision`, { note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] });
      setRevisionOpen(false);
      setReason('');
      toast.success('Revision requested');
    },
  });

  const isClient = user?.role === 'CLIENT';
  const approvals = data?.approvals || [];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No approval requests yet</p>
        </div>
      ) : (
        approvals.map((approval: {
          _id: string;
          title: string;
          status: string;
          submissionNote?: string;
          createdAt: string;
          dueDate?: string;
          revisions: Array<{ note: string; requestedAt: string }>;
          fileIds: Array<{ _id: string; name: string }>;
        }) => (
          <Card key={approval._id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{approval.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(approval.createdAt)}</p>
                </div>
                <StatusPill status={approval.status} />
              </div>

              {approval.submissionNote && (
                <p className="text-sm text-muted-foreground mb-3 bg-muted/50 rounded-lg p-3">{approval.submissionNote}</p>
              )}

              {/* Files */}
              {approval.fileIds?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {approval.fileIds.map((file: { _id: string; name: string }) => (
                    <span key={file._id} className="text-xs bg-muted px-2 py-1 rounded-md">{file.name}</span>
                  ))}
                </div>
              )}

              {/* Revision history */}
              {approval.revisions?.length > 0 && (
                <div className="mb-3 space-y-2">
                  {approval.revisions.map((rev, i) => (
                    <div key={i} className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
                      <p className="font-medium text-amber-800 dark:text-amber-400">Revision {i + 1}</p>
                      <p className="text-amber-700 dark:text-amber-300 mt-0.5">{rev.note}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions for client */}
              {isClient && ['PENDING', 'IN_REVIEW'].includes(approval.status) && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => approve.mutate(approval._id)}
                    loading={approve.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedId(approval._id); setRevisionOpen(true); }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Request Revision
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={() => { setSelectedId(approval._id); setRejectOpen(true); }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Deliverable</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Reason for rejection</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please explain why this is being rejected..."
                rows={4}
                className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => selectedId && reject.mutate({ id: selectedId, reason })}
                loading={reject.isPending}
                disabled={!reason.trim()}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revision dialog */}
      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Revision</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Revision notes</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what changes are needed..."
                rows={4}
                className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRevisionOpen(false)}>Cancel</Button>
              <Button
                onClick={() => selectedId && requestRevision.mutate({ id: selectedId, note: reason })}
                loading={requestRevision.isPending}
                disabled={!reason.trim()}
              >
                Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
