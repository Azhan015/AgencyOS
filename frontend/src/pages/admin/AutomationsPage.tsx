import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Zap, Play, Pause, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

const createRuleSchema = z.object({
  name: z.string().min(1, 'Name required'),
  description: z.string().optional(),
  triggerEvent: z.string().min(1, 'Trigger event required'),
  actionType: z.string().min(1, 'Action type required'),
});

type CreateRuleForm = z.infer<typeof createRuleSchema>;

interface AutomationRule {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  runCount: number;
  lastRunAt?: string;
  trigger: { event: string };
  actions: Array<{ type: string }>;
  createdAt: string;
}

// Values must match the TriggerEvent enum in backend/src/models/AutomationRule.ts
const TRIGGER_EVENTS = [
  { value: 'task.assigned', label: 'Task Assigned' },
  { value: 'invoice.overdue', label: 'Invoice Overdue' },
  { value: 'invoice.paid', label: 'Invoice Paid' },
  { value: 'project.status_changed', label: 'Project Status Changed' },
  { value: 'milestone.completed', label: 'Milestone Completed' },
  { value: 'approval.given', label: 'Approval Given' },
  { value: 'approval.rejected', label: 'Approval Rejected' },
  { value: 'contract.signed', label: 'Contract Signed' },
  { value: 'file.uploaded', label: 'File Uploaded' },
  { value: 'client.activated', label: 'Client Activated' },
];

// Values must match the ActionType enum in backend/src/models/AutomationRule.ts
const ACTION_TYPES = [
  { value: 'SEND_EMAIL', label: 'Send Email' },
  { value: 'SEND_NOTIFICATION', label: 'Send Notification' },
  { value: 'CREATE_TASK', label: 'Create Task' },
  { value: 'CHANGE_STATUS', label: 'Change Status' },
  { value: 'CALL_WEBHOOK', label: 'Webhook' },
];

export function AutomationsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const res = await api.get('/automations');
      return res.data.data;
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateRuleForm>({
    resolver: zodResolver(createRuleSchema),
  });

  const createMutation = useMutation({
    mutationFn: async (formData: CreateRuleForm) => {
      const res = await api.post('/automations', {
        name: formData.name,
        description: formData.description,
        // trigger.conditions is required by the schema (array, can be empty)
        trigger: { event: formData.triggerEvent, conditions: [] },
        // actions[].params is required by the schema (object, can be empty)
        actions: [{ type: formData.actionType, params: {} }],
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      setCreateOpen(false);
      reset();
      toast.success('Automation rule created');
    },
    onError: () => toast.error('Failed to create automation'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/automations/${id}`, { isActive: !isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
    onError: () => toast.error('Failed to update automation'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/automations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automation deleted');
    },
    onError: () => toast.error('Failed to delete automation'),
  });

  const rules: AutomationRule[] = data?.rules || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-muted-foreground mt-1">Configure automated workflows for your agency</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Rules</p>
            <p className="text-2xl font-bold mt-1">{rules.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{rules.filter(r => r.isActive).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Runs</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">
              {rules.reduce((sum, r) => sum + r.runCount, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rules list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16">
          <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No automation rules yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create rules to automate repetitive tasks.</p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule._id} className={`transition-opacity ${!rule.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${rule.isActive ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{rule.name}</p>
                      {!rule.isActive && (
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Paused</span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mb-2">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="bg-muted px-2 py-0.5 rounded-full">
                        When: {TRIGGER_EVENTS.find(e => e.value === rule.trigger?.event)?.label || rule.trigger?.event}
                      </span>
                      <ChevronRight className="h-3 w-3" />
                      {rule.actions?.map((action, i) => (
                        <span key={i} className="bg-muted px-2 py-0.5 rounded-full">
                          {ACTION_TYPES.find(a => a.value === action.type)?.label || action.type}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Ran {rule.runCount} times
                      {rule.lastRunAt && ` · Last run ${formatRelativeTime(rule.lastRunAt)}`}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleMutation.mutate({ id: rule._id, isActive: rule.isActive })}
                      title={rule.isActive ? 'Pause' : 'Activate'}
                    >
                      {rule.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Delete this automation rule?')) deleteMutation.mutate(rule._id);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Automation Rule</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <Input label="Rule Name" placeholder="e.g. Notify on overdue invoice" error={errors.name?.message} {...register('name')} />
            <Input label="Description" placeholder="Optional description..." {...register('description')} />
            <div>
              <label className="block text-sm font-medium mb-1.5">Trigger Event</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('triggerEvent')}>
                <option value="">Select trigger...</option>
                {TRIGGER_EVENTS.map(e => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
              {errors.triggerEvent && <p className="text-xs text-destructive mt-1">{errors.triggerEvent.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Action</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...register('actionType')}>
                <option value="">Select action...</option>
                {ACTION_TYPES.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              {errors.actionType && <p className="text-xs text-destructive mt-1">{errors.actionType.message}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending}>Create Rule</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
